import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STACK_PTS, LAND_CATS, numOf, stackPoints, riverPoints, animalPoints, waterPoints,
  derivedPoints, isTotalMode, catPoints, breakdown, totalPoints, inferFromTotal
} from './scoring.js';

// ---- numOf ----

test('numOf: numeric strings parse to numbers', () => {
  assert.equal(numOf('3'), 3);
  assert.equal(numOf('3.5'), 3.5);
  assert.equal(numOf('  7'), 7);
});

test('numOf: empty string, null, undefined all fall back to 0', () => {
  assert.equal(numOf(''), 0);
  assert.equal(numOf(null), 0);
  assert.equal(numOf(undefined), 0);
});

test('numOf: non-numeric input (NaN) falls back to 0', () => {
  assert.equal(numOf('abc'), 0);
  assert.equal(numOf(NaN), 0);
  assert.equal(numOf({}), 0);
});

test('numOf: plain numbers pass through', () => {
  assert.equal(numOf(0), 0);
  assert.equal(numOf(42), 42);
});

// ---- stackPoints ----

test('stackPoints: all-zero stack scores 0', () => {
  assert.equal(stackPoints({ h1: 0, h2: 0, h3: 0 }), 0);
});

test('stackPoints: each bucket alone uses STACK_PTS (h1=1, h2=3, h3=7)', () => {
  assert.equal(STACK_PTS.h1, 1);
  assert.equal(STACK_PTS.h2, 3);
  assert.equal(STACK_PTS.h3, 7);
  assert.equal(stackPoints({ h1: 1, h2: 0, h3: 0 }), 1);
  assert.equal(stackPoints({ h1: 0, h2: 1, h3: 0 }), 3);
  assert.equal(stackPoints({ h1: 0, h2: 0, h3: 1 }), 7);
});

test('stackPoints: mixed bucket counts sum correctly', () => {
  // 2*1 + 3*3 + 1*7 = 2 + 9 + 7 = 18
  assert.equal(stackPoints({ h1: 2, h2: 3, h3: 1 }), 18);
});

// ---- riverPoints ----

test('riverPoints: lengths under 2 score 0', () => {
  assert.equal(riverPoints(0), 0);
  assert.equal(riverPoints(1), 0);
});

test('riverPoints: the printed 2-6 ladder', () => {
  assert.equal(riverPoints(2), 2);
  assert.equal(riverPoints(3), 5);
  assert.equal(riverPoints(4), 8);
  assert.equal(riverPoints(5), 11);
  assert.equal(riverPoints(6), 15);
});

test('riverPoints: +4 per token beyond 6', () => {
  assert.equal(riverPoints(7), 19);
  assert.equal(riverPoints(8), 23);
});

test('riverPoints: non-integer input is truncated', () => {
  assert.equal(riverPoints(3.9), 5); // truncates to 3
  assert.equal(riverPoints(6.9), 15); // truncates to 6
});

test('riverPoints: negative input floors to 0', () => {
  assert.equal(riverPoints(-5), 0);
});

// ---- waterPoints ----

test('waterPoints: river side scores via riverPoints(p.river)', () => {
  const p = { river: 4, islands: 1 };
  assert.equal(waterPoints(p, { waterSide: 'river' }), 8);
});

test('waterPoints: island side scores 5 per island', () => {
  const p = { river: 0, islands: 3 };
  assert.equal(waterPoints(p, { waterSide: 'island' }), 15);
});

test('waterPoints: islands floor — islands: 0 still scores 5 (Math.max(1, ...))', () => {
  const p = { river: 0, islands: 0 };
  assert.equal(waterPoints(p, { waterSide: 'island' }), 5);
});

test('waterPoints: missing variant defaults to river side', () => {
  const p = { river: 6, islands: 9 };
  assert.equal(waterPoints(p), 15);
});

// A malformed variant must fall back to river, not silently score the board as islands. Guarding
// only against nullish is not enough: `{}.waterSide` is undefined, and `undefined !== "river"`
// used to take the island branch. This is the same shape as the `players.map(totalPoints)` bug,
// where map's index arrived as the variant.
test('waterPoints: a malformed variant falls back to river rather than islands', () => {
  const p = { river: 6, islands: 9 };
  for (const bad of [{}, null, 0, 1, 2, 'island', [], true]){
    assert.equal(waterPoints(p, bad), 15, `variant ${JSON.stringify(bad)} should score as river`);
  }
});

test('inferFromTotal: a malformed variant infers on the river branch, not islands', () => {
  const p = { river: 0, islands: 1 };
  assert.equal(inferFromTotal(p, 'water', 11, {}), true);
  assert.equal(p.river, 5);
  assert.equal(p.islands, 1, 'islands must be untouched on the river branch');
});

// ---- animalPoints ----

test('animalPoints: empty-ish list ([0]) scores 0', () => {
  assert.equal(animalPoints({ animals: [0] }), 0);
});

test('animalPoints: several cards sum together', () => {
  assert.equal(animalPoints({ animals: [1, 2, 3] }), 6);
});

test('animalPoints: string values (as typed into <input>) are coerced numerically', () => {
  assert.equal(animalPoints({ animals: ['1', '2', ''] }), 3);
});

// ---- isTotalMode / catPoints ----

test('isTotalMode: false when totals is empty or key absent', () => {
  assert.equal(isTotalMode({ totals: {} }, 'trees'), false);
});

// `!= null` is deliberate — it catches null as well as undefined. resetCat() deletes the key, but
// a null could arrive from a nullable column once games are loaded back from the ledger, and a
// null override must mean "not overridden" rather than a frozen 0.
test('isTotalMode: null is treated as absent, not as an override', () => {
  assert.equal(isTotalMode({ totals: { trees: null } }, 'trees'), false);
  assert.equal(isTotalMode({ totals: { trees: undefined } }, 'trees'), false);
  assert.equal(catPoints({ totals: { trees: null }, trees: { h1: 0, h2: 0, h3: 1 } }, 'trees'), 7);
});

test('isTotalMode: true when a total override is present, including 0', () => {
  assert.equal(isTotalMode({ totals: { trees: 12 } }, 'trees'), true);
  assert.equal(isTotalMode({ totals: { trees: 0 } }, 'trees'), true);
});

test('catPoints: a p.totals[cat] override wins over the derived value', () => {
  const p = { totals: { trees: 99 }, trees: { h1: 1, h2: 0, h3: 0 } };
  assert.equal(catPoints(p, 'trees'), 99);
});

test('catPoints: an override of exactly 0 is honored, not treated as absent (falsy-0 bug)', () => {
  const p = { totals: { trees: 0 }, trees: { h1: 5, h2: 5, h3: 5 } };
  assert.equal(catPoints(p, 'trees'), 0);
});

test('catPoints: falls back to derivedPoints when no override is present', () => {
  const p = { totals: {}, trees: { h1: 1, h2: 1, h3: 1 } };
  assert.equal(catPoints(p, 'trees'), stackPoints(p.trees));
});

test('derivedPoints: dispatches every category correctly', () => {
  const p = {
    trees: { h1: 1, h2: 0, h3: 0 },
    mountains: { h1: 0, h2: 1, h3: 0 },
    fields: 2,
    buildings: 3,
    river: 4,
    islands: 2,
    animals: [1, 2],
    bonus: 5
  };
  assert.equal(derivedPoints(p, 'trees'), 1);
  assert.equal(derivedPoints(p, 'mountains'), 3);
  assert.equal(derivedPoints(p, 'fields'), 10);
  assert.equal(derivedPoints(p, 'buildings'), 15);
  assert.equal(derivedPoints(p, 'water', { waterSide: 'river' }), 8);
  assert.equal(derivedPoints(p, 'water', { waterSide: 'island' }), 10);
  assert.equal(derivedPoints(p, 'animals'), 3);
  assert.equal(derivedPoints(p, 'bonus'), 5);
  assert.equal(derivedPoints(p, 'nonsense'), 0);
});

// ---- breakdown / totalPoints ----

test('breakdown: landscape/animals/spirit grouping sums correctly', () => {
  const p = {
    totals: {},
    trees: { h1: 1, h2: 0, h3: 0 },      // 1
    mountains: { h1: 0, h2: 1, h3: 0 },  // 3
    fields: 1,                            // 5
    buildings: 1,                         // 5
    river: 2,                             // 2
    islands: 1,
    animals: [4, 6],                      // 10
    bonus: 7                              // 7
  };
  const b = breakdown(p, { waterSide: 'river' });
  assert.equal(b.landscape, 1 + 3 + 5 + 5 + 2);
  assert.equal(b.animals, 10);
  assert.equal(b.spirit, 7);
  assert.equal(b.total, b.landscape + b.animals + b.spirit);
});

test('totalPoints: equals breakdown(p).total', () => {
  const p = {
    totals: {},
    trees: { h1: 0, h2: 0, h3: 1 },
    mountains: { h1: 0, h2: 0, h3: 0 },
    fields: 0,
    buildings: 0,
    river: 0,
    islands: 1,
    animals: [0],
    bonus: 0
  };
  assert.equal(totalPoints(p, { waterSide: 'river' }), breakdown(p, { waterSide: 'river' }).total);
});

test('breakdown/totalPoints: LAND_CATS drives which categories count toward landscape', () => {
  assert.deepEqual(LAND_CATS, ['trees', 'mountains', 'fields', 'buildings', 'water']);
});

// ---- inferFromTotal ----

test('inferFromTotal: fields — a total divisible by 5 sets the count and returns true', () => {
  const p = { fields: 0 };
  assert.equal(inferFromTotal(p, 'fields', '15'), true);
  assert.equal(p.fields, 3);
});

test('inferFromTotal: fields — a non-multiple of 5 returns false and mutates nothing', () => {
  const p = { fields: 2 };
  assert.equal(inferFromTotal(p, 'fields', '17'), false);
  assert.equal(p.fields, 2);
});

test('inferFromTotal: buildings — same 5-point rule as fields', () => {
  const p = { buildings: 0 };
  assert.equal(inferFromTotal(p, 'buildings', '20'), true);
  assert.equal(p.buildings, 4);

  const p2 = { buildings: 1 };
  assert.equal(inferFromTotal(p2, 'buildings', '21'), false);
  assert.equal(p2.buildings, 1);
});

test('inferFromTotal: islands — a total divisible by 5 (and >= 5) sets islands', () => {
  const p = { islands: 1 };
  assert.equal(inferFromTotal(p, 'water', '15', { waterSide: 'island' }), true);
  assert.equal(p.islands, 3);
});

test('inferFromTotal: islands — below 5, or not a multiple of 5, returns false and mutates nothing', () => {
  const p = { islands: 1 };
  assert.equal(inferFromTotal(p, 'water', '0', { waterSide: 'island' }), false);
  assert.equal(p.islands, 1);

  const p2 = { islands: 1 };
  assert.equal(inferFromTotal(p2, 'water', '12', { waterSide: 'island' }), false);
  assert.equal(p2.islands, 1);
});

test('inferFromTotal: river — every riverPoints(n) for n in 0..8 infers back to a length that scores the same', () => {
  for (let n = 0; n <= 8; n++){
    const total = riverPoints(n);
    const p = { river: -1 };
    const ok = inferFromTotal(p, 'water', String(total), { waterSide: 'river' });
    assert.equal(ok, true, `expected inference to succeed for total ${total} (n=${n})`);
    assert.equal(riverPoints(p.river), total, `riverPoints(inferred ${p.river}) should equal ${total}`);
  }
});

test('inferFromTotal: categories that keep their override (trees, mountains, animals, bonus) always return false', () => {
  for (const cat of ['trees', 'mountains', 'animals', 'bonus']){
    const p = {};
    assert.equal(inferFromTotal(p, cat, '100'), false);
  }
});
