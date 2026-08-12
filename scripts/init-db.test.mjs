import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitStatements } from './init-db.mjs';

// This file exists because the naive `schema.split(';')` it replaced would have failed the very
// first real migration: schema.sql's own comment about avoiding semicolons contained four of them,
// which severed CREATE TABLE session_players mid-definition. The schema is dropped and recreated
// by this script, so a splitter bug is a broken database, not a failed test.

test('splitStatements: ignores semicolons inside line comments', () => {
  const sql = `-- keep every statement ';'-terminated; really
CREATE TABLE a (id INT);
-- another; comment
CREATE TABLE b (id INT);`;
  const out = splitStatements(sql);
  assert.equal(out.length, 2);
  assert.match(out[0], /^CREATE TABLE a/);
  assert.match(out[1], /^CREATE TABLE b/);
});

test('splitStatements: strips a trailing inline comment but keeps the statement', () => {
  const out = splitStatements('CREATE TABLE a (id INT); -- snapshot; not rewritten\n');
  assert.equal(out.length, 1);
  assert.match(out[0], /^CREATE TABLE a \(id INT\)$/);
});

test('splitStatements: a comment inside a column definition does not split the statement', () => {
  const sql = `CREATE TABLE t (
  a INT,          -- snapshot; renaming must not rewrite history
  b INT
);`;
  const out = splitStatements(sql);
  assert.equal(out.length, 1, 'the table definition must survive as ONE statement');
  assert.match(out[0], /b INT/);
});

test('splitStatements: a double dash inside a string literal is not treated as a comment', () => {
  const out = splitStatements("INSERT INTO t (s) VALUES ('a--b');");
  assert.equal(out.length, 1);
  assert.match(out[0], /'a--b'/);
});

test('splitStatements: drops empty fragments and trailing whitespace', () => {
  assert.deepEqual(splitStatements(';;\n  \n-- only a comment\n'), []);
});

// The real thing: whatever schema.sql currently says must split into runnable statements.
test('schema.sql splits into complete, runnable statements', () => {
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  const out = splitStatements(schema);

  assert.ok(out.length > 0, 'schema.sql produced no statements');

  for (const stmt of out){
    assert.match(stmt, /^(DROP|CREATE|ALTER|INSERT)\b/i,
      `every fragment must be a real statement, got: ${JSON.stringify(stmt.slice(0, 70))}`);
    // A severed CREATE TABLE is the exact failure this guards: unbalanced parens mean the
    // definition was cut in half by a stray semicolon.
    const opens = (stmt.match(/\(/g) || []).length;
    const closes = (stmt.match(/\)/g) || []).length;
    assert.equal(opens, closes,
      `unbalanced parentheses — statement was split mid-definition: ${stmt.slice(0, 70)}`);
  }

  // Every table the API reads or writes must actually be created.
  for (const table of ['people', 'sessions', 'session_players', 'session_photos']){
    assert.ok(out.some(s => new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`).test(s)),
      `schema.sql must create ${table}`);
  }
});
