import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

// Strip `--` line comments before splitting on `;`.
//
// This used to split the raw file, which meant any semicolon inside a comment was treated as a
// statement boundary. That bit exactly once, and instructively: schema.sql carried a comment
// warning "avoid ';' inside string literals", and the four semicolons in that warning shredded the
// file into 14 fragments — severing CREATE TABLE session_players mid-definition and sending
// comment prose to Postgres as SQL. The migration would have failed halfway through.
//
// Quote-aware so a legitimate `--` inside a string literal survives. Block comments and
// dollar-quoting are NOT handled; schema.sql uses neither, and a schema that needs them should
// move to a real migration tool rather than growing this function.
export function splitStatements(sql) {
  const cleaned = sql
    .split('\n')
    .map((line) => {
      let inString = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === "'") inString = !inString;
        else if (!inString && ch === '-' && line[i + 1] === '-') return line.slice(0, i);
      }
      return line;
    })
    .join('\n');

  return cleaned
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Only run when invoked directly, so the splitter can be unit tested without a database (the
// env guard has to live in here too — at module scope it would exit the test runner on import).
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/init-db.mjs');
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  const statements = splitStatements(schema);

  console.log(`Running ${statements.length} statements.`);
  for (const stmt of statements) {
    console.log('  ', stmt.slice(0, 60).replace(/\s+/g, ' ') + '...');
    await sql.query(stmt);
  }

  console.log('Schema ready.');
}
