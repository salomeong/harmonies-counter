// Read-only reconnaissance: what is actually in the database this DATABASE_URL points at?
// Run before anything destructive — schema.sql drops tables, and "look at the target before you
// overwrite it" is cheaper than a restore.
//
//   node --env-file=.env.local scripts/inspect-db.mjs

import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/inspect-db.mjs');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const [{ db, usr }] = await sql`SELECT current_database() AS db, current_user AS usr`;
console.log(`database: ${db}  user: ${usr}`);

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name
`;

if (!tables.length) {
  console.log('\npublic schema is empty.');
} else {
  console.log('\ntables and row counts:');
  for (const { table_name } of tables) {
    // table_name comes from information_schema, not user input, but it still can't be bound as a
    // parameter — identifiers never can — so it is quoted rather than interpolated raw.
    const rows = await sql.query(`SELECT count(*)::int AS n FROM "${table_name.replace(/"/g, '""')}"`);
    console.log(`  ${table_name.padEnd(18)} ${rows[0].n}`);
  }
}
