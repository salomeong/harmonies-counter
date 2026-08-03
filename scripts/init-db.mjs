import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/init-db.mjs');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

const statements = schema
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  console.log('Running:', stmt.slice(0, 60).replace(/\s+/g, ' ') + '...');
  await sql.query(stmt);
}

console.log('Schema ready.');
