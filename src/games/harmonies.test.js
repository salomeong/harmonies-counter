// The differential tests that used to live here (descriptor.points()/infer() checked against the
// legacy switch-based derivedPoints()/inferFromTotal()/totalPoints()) served their purpose during
// the transition and were removed when index.html's payoff-step refactor deleted that legacy code
// from src/scoring.js (see CLAUDE.md's scoring-model section for why nothing may read a category
// score any other way — that invariant is now enforced by makeScorer() being the only path, not
// by comparison against a parallel implementation). What remains here — newPlayer/resetPlayer
// shape — doesn't depend on the deleted functions. The pure per-category math (stackPoints,
// riverPoints, water side-switching, infer) is covered directly in src/scoring.test.js instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harmonies } from './harmonies.js';
import { makeScorer } from '../scoring.js';

function eq(actual, expected, message){
  assert.equal(actual, expected, message);
}
function deepEq(actual, expected, message){
  assert.deepStrictEqual(actual, expected, message);
}

const VARIANTS = [{ waterSide: 'river' }, { waterSide: 'island' }];

// ---- newPlayer() shape, name-numbering bug fixed ----

test('newPlayer produces the same shape as index.html\'s old newPlayer, with the off-by-one name bug fixed', () => {
  const scorer = makeScorer(harmonies, () => VARIANTS[0]);
  const p = scorer.newPlayer(1);

  const expectedFields = {
    id: 1,
    // index.html's old newPlayer read `nextId` *after* `nextId++` had already run, so player id=1
    // (the first player created, when nextId started at 1) was named "Player 2". That was a bug,
    // not a spec — the fix is naming a player off its own id.
    name: 'Player 1',
    trees: { h1: 0, h2: 0, h3: 0 },
    mountains: { h1: 0, h2: 0, h3: 0 },
    fields: 0,
    buildings: 0,
    river: 0,
    islands: 1,
    animals: [0],
    bonus: 0,
    totals: {}
  };

  const { open, ...rest } = p;
  deepEq(rest, expectedFields, 'newPlayer field values must match the old newPlayer exactly (name bug excepted)');

  eq(Object.keys(p).sort().join(','), [...Object.keys(expectedFields), 'open'].sort().join(','),
    'newPlayer must have exactly the same own-keys as the old newPlayer');

  assert.ok(Array.isArray(open), 'open must be an array — it has to survive JSON and React re-renders');
  deepEq(open, ['trees'], 'open must start with only the first category open');
});

test('newPlayer names a third player "Player 3", not "Player 4" (the bug this fixes)', () => {
  const scorer = makeScorer(harmonies, () => VARIANTS[0]);
  eq(scorer.newPlayer(3).name, 'Player 3');
});

// ---- resetPlayer returns to the fresh state, id/name/open aside ----

test('resetPlayer returns every category to the same state as a fresh player (except id/name/open)', () => {
  const scorer = makeScorer(harmonies, () => VARIANTS[0]);
  const p = scorer.newPlayer(5, 'Custom Name');

  // Hammer every field, including total overrides and the open-drawer set.
  p.trees = { h1: 9, h2: 8, h3: 7 };
  p.mountains = { h1: 1, h2: 1, h3: 1 };
  p.fields = 20;
  p.buildings = 15;
  p.river = 6;
  p.islands = 4;
  p.animals = [1, 2, 3, 4];
  p.bonus = 42;
  p.totals = { trees: 99, fields: 50 };
  p.open = ['trees', 'water'];

  scorer.resetPlayer(p);

  const fresh = scorer.newPlayer(5, 'Custom Name');

  eq(p.id, 5, 'resetPlayer must not touch id');
  eq(p.name, 'Custom Name', 'resetPlayer must not touch name');
  deepEq(p.open, ['trees', 'water'], 'resetPlayer must not touch open');

  for (const key of ['trees', 'mountains', 'fields', 'buildings', 'river', 'islands', 'animals', 'bonus', 'totals']){
    deepEq(p[key], fresh[key], `resetPlayer: "${key}" must match a freshly created player`);
  }
});
