import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOTALS_KEY } from '../scoring.js';
import { GAMES, GAME_LIST, getGame } from './index.js';
import { harmonies } from './harmonies.js';
import { faraway } from './faraway.js';
import { sevenwonders } from './sevenwonders.js';
import { sevenwondersduel } from './sevenwondersduel.js';

// ---- Registry wiring ----

test('GAMES and GAME_LIST reference the same game objects', () => {
  assert.equal(GAMES.harmonies, harmonies);
  assert.equal(GAMES.faraway, faraway);
  assert.equal(GAMES['7wonders'], sevenwonders);
  assert.equal(GAMES['7wondersduel'], sevenwondersduel);
  assert.deepEqual(GAME_LIST, [harmonies, faraway, sevenwonders, sevenwondersduel]);
});

test('getGame returns the game for a known key, and null for an unknown one', () => {
  assert.equal(getGame('harmonies'), harmonies);
  assert.equal(getGame('faraway'), faraway);
  assert.equal(getGame('7wonders'), sevenwonders);
  assert.equal(getGame('7wondersduel'), sevenwondersduel);
  assert.equal(getGame('nonexistent'), null);
  assert.equal(getGame(''), null);
  assert.equal(getGame(undefined), null);
});

// ---- Invariant: a declared `sums` must partition `cats` exactly once each ----

test('every declared sums group partitions cats exactly once each, for every game', () => {
  for (const game of GAME_LIST){
    if (!game.sums) continue; // sums is optional (Faraway has none)

    const catKeys = game.cats.map(c => c.key);
    const covered = game.sums.flatMap(group => group.cats);

    assert.deepEqual(
      [...covered].sort(),
      [...catKeys].sort(),
      `${game.key}: sums groups must together cover every category exactly, no more no less`
    );

    const seen = new Set();
    for (const key of covered){
      assert.ok(!seen.has(key), `${game.key}: category "${key}" appears in more than one sums group`);
      seen.add(key);
    }
  }
});

// ---- Invariant: category keys are unique within a game ----

test('every cats[].key is unique within a game', () => {
  for (const game of GAME_LIST){
    const keys = game.cats.map(c => c.key);
    assert.equal(new Set(keys).size, keys.length, `${game.key}: duplicate category key among ${JSON.stringify(keys)}`);
  }
});

// ---- Sanity: the two known games have the shape the app currently expects ----

test('harmonies declares all seven categories in the documented order', () => {
  assert.deepEqual(harmonies.cats.map(c => c.key),
    ['trees', 'mountains', 'fields', 'buildings', 'water', 'animals', 'bonus']);
});

test('faraway declares its two categories and no sums', () => {
  assert.deepEqual(faraway.cats.map(c => c.key), ['region', 'sanctuary']);
  assert.equal(faraway.sums, undefined);
  assert.equal(faraway.guidedReveal, true);
});

test('sevenwonders declares all seven categories in the printed scorepad order, and no sums', () => {
  assert.deepEqual(sevenwonders.cats.map(c => c.key),
    ['military', 'treasury', 'wonders', 'civilian', 'science', 'commercial', 'guilds']);
  assert.equal(sevenwonders.sums, undefined);
});

test('sevenwondersduel declares its eight categories, no sums, and is locked to exactly 2 players', () => {
  assert.deepEqual(sevenwondersduel.cats.map(c => c.key),
    ['military', 'civilian', 'science', 'commercial', 'guilds', 'wonders', 'progress', 'treasury']);
  assert.equal(sevenwondersduel.sums, undefined);
  assert.equal(sevenwondersduel.minPlayers, 2);
  assert.equal(sevenwondersduel.maxPlayers, 2);
  assert.ok(Array.isArray(sevenwondersduel.militaryZones) && sevenwondersduel.militaryZones.length === 7);
});

// ---- Invariant: every category that declares `detail` declares its inverse ----
//
// A category with `detail` but no `restore` writes state into the ledger that nothing can read
// back, so a saved game would silently re-score as if that category were empty. Deliberately no
// generic default inverse exists to fall back on: harmonies' `water` writes two top-level player
// fields under one detail key, and Faraway's fameCat's key ("region") differs from its field
// ("regionFame"), so `p[cat.key] = d` would quietly restore neither.

test('every category declaring detail also declares restore, for every game', () => {
  for (const game of GAME_LIST){
    for (const c of game.cats){
      if (!c.detail) continue;
      assert.equal(typeof c.restore, 'function',
        `${game.key}.${c.key}: declares detail() but no restore() — saved games would re-score as empty`);
    }
  }
});

// ---- Invariant: the reserved _totals key can never be shadowed by a category ----

test('no category key starts with "_", keeping the reserved _totals key collision-proof', () => {
  for (const game of GAME_LIST){
    for (const c of game.cats){
      assert.ok(/^[a-z][a-zA-Z0-9]*$/.test(c.key),
        `${game.key}: category key "${c.key}" must match /^[a-z][a-zA-Z0-9]*$/ — a leading underscore ` +
        `would collide with scorer.detail()'s reserved keys`);
      assert.notEqual(c.key, TOTALS_KEY, `${game.key}: category key collides with the reserved ${TOTALS_KEY} key`);
    }
  }
});
