import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, GAME_LIST, getGame } from './index.js';
import { harmonies } from './harmonies.js';
import { faraway } from './faraway.js';

// ---- Registry wiring ----

test('GAMES and GAME_LIST reference the same game objects', () => {
  assert.equal(GAMES.harmonies, harmonies);
  assert.equal(GAMES.faraway, faraway);
  assert.deepEqual(GAME_LIST, [harmonies, faraway]);
});

test('getGame returns the game for a known key, and null for an unknown one', () => {
  assert.equal(getGame('harmonies'), harmonies);
  assert.equal(getGame('faraway'), faraway);
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
});
