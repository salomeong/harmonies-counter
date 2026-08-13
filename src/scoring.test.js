import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STACK_PTS, numOf, stackPoints, riverPoints, animalPoints, isTotalMode, makeScorer, TOTALS_KEY
} from './scoring.js';
import { harmonies } from './games/harmonies.js';
import { faraway } from './games/faraway.js';
import { sevenwonders } from './games/sevenwonders.js';

// A scorer bound to a fixed variant getter, for tests that don't care about switching sides
// mid-test.
function scorerFor(variant){
  return makeScorer(harmonies, () => variant);
}

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

// ---- water scoring, via the "water" descriptor (harmonies.js) ----
// There is no standalone waterPoints() anymore — the river/island split lives on the water
// category's own `points(p, variant)`, reached here through scorer.derived() (the pre-override
// value, same role the old waterPoints() played).

test('water scoring: river side scores via riverPoints(p.river)', () => {
  const p = { river: 4, islands: 1 };
  assert.equal(scorerFor({ waterSide: 'river' }).derived(p, 'water'), 8);
});

test('water scoring: island side scores 5 per island', () => {
  const p = { river: 0, islands: 3 };
  assert.equal(scorerFor({ waterSide: 'island' }).derived(p, 'water'), 15);
});

test('water scoring: islands floor — islands: 0 still scores 5 (Math.max(1, ...))', () => {
  const p = { river: 0, islands: 0 };
  assert.equal(scorerFor({ waterSide: 'island' }).derived(p, 'water'), 5);
});

test('water scoring: missing variant defaults to river side', () => {
  const p = { river: 6, islands: 9 };
  assert.equal(scorerFor(undefined).derived(p, 'water'), 15);
});

// A malformed variant must fall back to river, not silently score the board as islands. Guarding
// only against nullish is not enough: `{}.waterSide` is undefined, and `undefined !== "river"`
// used to take the island branch. This is the same shape as the `players.map(totalPoints)` bug,
// where map's index arrived as the variant.
test('water scoring: a malformed variant falls back to river rather than islands', () => {
  const p = { river: 6, islands: 9 };
  for (const bad of [{}, null, 0, 1, 2, 'island', [], true]){
    assert.equal(scorerFor(bad).derived(p, 'water'), 15, `variant ${JSON.stringify(bad)} should score as river`);
  }
});

test('water infer: a malformed variant infers on the river branch, not islands', () => {
  const p = { river: 0, islands: 1 };
  const scorer = scorerFor({});
  assert.equal(scorer.infer(p, 'water', 11), true);
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

// ---- isTotalMode / scorer.catPoints ----

test('isTotalMode: false when totals is empty or key absent', () => {
  assert.equal(isTotalMode({ totals: {} }, 'trees'), false);
});

// `!= null` is deliberate — it catches null as well as undefined. resetCat() deletes the key, but
// a null could arrive from a nullable column once games are loaded back from the ledger, and a
// null override must mean "not overridden" rather than a frozen 0.
test('isTotalMode: null is treated as absent, not as an override', () => {
  assert.equal(isTotalMode({ totals: { trees: null } }, 'trees'), false);
  assert.equal(isTotalMode({ totals: { trees: undefined } }, 'trees'), false);
  assert.equal(
    scorerFor(undefined).catPoints({ totals: { trees: null }, trees: { h1: 0, h2: 0, h3: 1 } }, 'trees'),
    7
  );
});

test('isTotalMode: true when a total override is present, including 0', () => {
  assert.equal(isTotalMode({ totals: { trees: 12 } }, 'trees'), true);
  assert.equal(isTotalMode({ totals: { trees: 0 } }, 'trees'), true);
});

test('scorer.catPoints: a p.totals[cat] override wins over the derived value', () => {
  const p = { totals: { trees: 99 }, trees: { h1: 1, h2: 0, h3: 0 } };
  assert.equal(scorerFor(undefined).catPoints(p, 'trees'), 99);
});

test('scorer.catPoints: an override of exactly 0 is honored, not treated as absent (falsy-0 bug)', () => {
  const p = { totals: { trees: 0 }, trees: { h1: 5, h2: 5, h3: 5 } };
  assert.equal(scorerFor(undefined).catPoints(p, 'trees'), 0);
});

test('scorer.catPoints: falls back to the derived value when no override is present', () => {
  const p = { totals: {}, trees: { h1: 1, h2: 1, h3: 1 } };
  assert.equal(scorerFor(undefined).catPoints(p, 'trees'), stackPoints(p.trees));
});

test('category descriptors dispatch every category correctly (no more switch(cat))', () => {
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
  const byKey = Object.fromEntries(harmonies.cats.map(c => [c.key, c]));
  assert.equal(byKey.trees.points(p), 1);
  assert.equal(byKey.mountains.points(p), 3);
  assert.equal(byKey.fields.points(p), 10);
  assert.equal(byKey.buildings.points(p), 15);
  assert.equal(byKey.water.points(p, { waterSide: 'river' }), 8);
  assert.equal(byKey.water.points(p, { waterSide: 'island' }), 10);
  assert.equal(byKey.animals.points(p), 3);
  assert.equal(byKey.bonus.points(p), 5);
  // An unknown category key has no descriptor at all — scorer.catPoints() guards that case
  // (there was no "default: return 0" arm to test once the switch went away).
  assert.equal(scorerFor(undefined).catPoints(p, 'nonsense'), 0);
});

// ---- scorer.breakdown / scorer.total ----

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
  const b = scorerFor({ waterSide: 'river' }).breakdown(p);
  assert.equal(b.landscape, 1 + 3 + 5 + 5 + 2);
  assert.equal(b.animals, 10);
  assert.equal(b.spirit, 7);
  assert.equal(b.total, b.landscape + b.animals + b.spirit);
});

test('scorer.total: equals scorer.breakdown(p).total', () => {
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
  const scorer = scorerFor({ waterSide: 'river' });
  assert.equal(scorer.total(p), scorer.breakdown(p).total);
});

test('breakdown: the "landscape" sums group covers exactly trees/mountains/fields/buildings/water', () => {
  const landscape = harmonies.sums.find(s => s.key === 'landscape');
  assert.deepEqual(landscape.cats, ['trees', 'mountains', 'fields', 'buildings', 'water']);
});

// ---- scorer.infer (replaces the old inferFromTotal) ----

test('infer: fields — a total divisible by 5 sets the count and returns true', () => {
  const p = { fields: 0 };
  assert.equal(scorerFor(undefined).infer(p, 'fields', '15'), true);
  assert.equal(p.fields, 3);
});

test('infer: fields — a non-multiple of 5 returns false and mutates nothing', () => {
  const p = { fields: 2 };
  assert.equal(scorerFor(undefined).infer(p, 'fields', '17'), false);
  assert.equal(p.fields, 2);
});

test('infer: buildings — same 5-point rule as fields', () => {
  const p = { buildings: 0 };
  assert.equal(scorerFor(undefined).infer(p, 'buildings', '20'), true);
  assert.equal(p.buildings, 4);

  const p2 = { buildings: 1 };
  assert.equal(scorerFor(undefined).infer(p2, 'buildings', '21'), false);
  assert.equal(p2.buildings, 1);
});

test('infer: islands — a total divisible by 5 (and >= 5) sets islands', () => {
  const p = { islands: 1 };
  assert.equal(scorerFor({ waterSide: 'island' }).infer(p, 'water', '15'), true);
  assert.equal(p.islands, 3);
});

test('infer: islands — below 5, or not a multiple of 5, returns false and mutates nothing', () => {
  const p = { islands: 1 };
  assert.equal(scorerFor({ waterSide: 'island' }).infer(p, 'water', '0'), false);
  assert.equal(p.islands, 1);

  const p2 = { islands: 1 };
  assert.equal(scorerFor({ waterSide: 'island' }).infer(p2, 'water', '12'), false);
  assert.equal(p2.islands, 1);
});

test('infer: river — every riverPoints(n) for n in 0..8 infers back to a length that scores the same', () => {
  for (let n = 0; n <= 8; n++){
    const total = riverPoints(n);
    const p = { river: -1 };
    const ok = scorerFor({ waterSide: 'river' }).infer(p, 'water', String(total));
    assert.equal(ok, true, `expected inference to succeed for total ${total} (n=${n})`);
    assert.equal(riverPoints(p.river), total, `riverPoints(inferred ${p.river}) should equal ${total}`);
  }
});

test('infer: categories that keep their override (trees, mountains, animals, bonus) always return false', () => {
  for (const cat of ['trees', 'mountains', 'animals', 'bonus']){
    const p = {};
    assert.equal(scorerFor(undefined).infer(p, cat, '100'), false);
  }
});

// ---- scorer.min / negative-scoring categories (7 Wonders' military: -1 per defeat token) ----

test('scorer.min: defaults to 0 for every existing Harmonies category', () => {
  const scorer = scorerFor(undefined);
  for (const key of scorer.keys){
    assert.equal(scorer.min(key), 0, `${key} should default to min 0`);
  }
});

test('scorer.min: returns the descriptor-declared min when present', () => {
  const game = {
    cats: [{
      key: 'military', min: -99,
      init: () => ({ military: 0 }),
      points: p => numOf(p.military),
      controls: () => '',
      infer: (p, total) => { p.military = total; return true; },
      detail: p => p.military
    }]
  };
  const scorer = makeScorer(game, () => undefined);
  assert.equal(scorer.min('military'), -99);
});

test('scorer.min: an unknown category key falls back to 0, same as canType', () => {
  assert.equal(scorerFor(undefined).min('nonsense'), 0);
});

test('infer: a descriptor with a negative min lets a typed negative total through instead of flooring at 0', () => {
  const game = {
    cats: [{
      key: 'military', min: -99,
      init: () => ({ military: 0 }),
      points: p => numOf(p.military),
      controls: () => '',
      infer: (p, total) => { p.military = total; return true; },
      detail: p => p.military
    }]
  };
  const scorer = makeScorer(game, () => undefined);
  const p = { military: 0 };
  assert.equal(scorer.infer(p, 'military', '-3'), true);
  assert.equal(p.military, -3, 'a typed -3 must survive as -3, not be floored to 0');
});

test('infer: a negative min still floors a total below it (e.g. -150 clamps to -99)', () => {
  const game = {
    cats: [{
      key: 'military', min: -99,
      init: () => ({ military: 0 }),
      points: p => numOf(p.military),
      controls: () => '',
      infer: (p, total) => { p.military = total; return true; },
      detail: p => p.military
    }]
  };
  const scorer = makeScorer(game, () => undefined);
  const p = { military: 0 };
  scorer.infer(p, 'military', '-150');
  assert.equal(p.military, -99);
});

test('infer: the default min (0) still floors a negative typed total at 0, same as before this change (fields)', () => {
  const p = { fields: 2 };
  assert.equal(scorerFor(undefined).infer(p, 'fields', '-10'), true);
  assert.equal(p.fields, 0, 'a negative total is clamped to the default min (0), same behaviour as the old hardcoded floor');
});

// ---- scorer.detail — raw entered state for the saved ledger, NEVER derived points ----

test('detail: harmonies — one key per category, holding the raw entered fields, not points', () => {
  const p = {
    totals: {},
    trees: { h1: 1, h2: 0, h3: 0 },      // 1 point, but detail must record the stack, not "1"
    mountains: { h1: 0, h2: 1, h3: 0 },
    fields: 2,
    buildings: 3,
    river: 4,
    islands: 2,
    animals: [1, 2],
    bonus: 5
  };
  const d = scorerFor({ waterSide: 'river' }).detail(p);
  assert.deepEqual(d, {
    trees: { h1: 1, h2: 0, h3: 0 },
    mountains: { h1: 0, h2: 1, h3: 0 },
    fields: 2,
    buildings: 3,
    water: { river: 4, islands: 2 },
    animals: [1, 2],
    bonus: 5
  });
});

test('detail: harmonies — water reports both river and islands regardless of the active side', () => {
  const p = {
    trees: { h1: 0, h2: 0, h3: 0 }, mountains: { h1: 0, h2: 0, h3: 0 },
    fields: 0, buildings: 0, river: 6, islands: 3, animals: [0], bonus: 0
  };
  assert.deepEqual(scorerFor({ waterSide: 'island' }).detail(p).water, { river: 6, islands: 3 });
  assert.deepEqual(scorerFor({ waterSide: 'river' }).detail(p).water, { river: 6, islands: 3 });
});

test('detail: harmonies — a typed-total override does not change what detail() reports (raw state, not derived points)', () => {
  const p = {
    totals: { trees: 99 },              // overridden to 99 points
    trees: { h1: 1, h2: 0, h3: 0 },      // raw entered state is still just this
    mountains: { h1: 0, h2: 0, h3: 0 },
    fields: 0, buildings: 0, river: 0, islands: 1, animals: [0], bonus: 0
  };
  const d = scorerFor({ waterSide: 'river' }).detail(p);
  assert.deepEqual(d.trees, { h1: 1, h2: 0, h3: 0 }, 'detail must stay the raw stack, not the 99-point override');
});

test('detail: harmonies — string-typed raw values (fresh from <input>) are coerced numerically, mirroring points()', () => {
  const p = {
    trees: { h1: 0, h2: 0, h3: 0 }, mountains: { h1: 0, h2: 0, h3: 0 },
    fields: 0, buildings: 0, river: 0, islands: 1,
    animals: ['2', '3', ''], bonus: '7'
  };
  const d = scorerFor(undefined).detail(p);
  assert.deepEqual(d.animals, [2, 3, 0]);
  assert.equal(d.bonus, 7);
});

test('detail: faraway — region/sanctuary report their raw fame lists, coerced numerically', () => {
  const p = { regionFame: [1, '2', 3], sanctuaryFame: ['5', 0] };
  const scorer = makeScorer(faraway, () => undefined);
  assert.deepEqual(scorer.detail(p), { region: [1, 2, 3], sanctuary: [5, 0] });
});

test('detail: 7 wonders — every category reports raw entered state, not derived points', () => {
  const p = {
    military: { w1: 1, w3: 0, w5: 0, loss: 2 }, // -1 net points, detail keeps the raw tallies
    treasury: 8,                                 // 2 points (floor(8/3)), detail keeps 8
    wonders: [3, 4],
    civilian: [5],
    science: { tablet: 2, compass: 1, gear: 0 },
    commercial: [1, 1],
    guilds: [0]
  };
  const scorer = makeScorer(sevenwonders, () => undefined);
  const d = scorer.detail(p);
  assert.deepEqual(d, {
    military: { w1: 1, w3: 0, w5: 0, loss: 2 },
    treasury: 8,
    wonders: [3, 4],
    civilian: [5],
    science: { tablet: 2, compass: 1, gear: 0 },
    commercial: [1, 1],
    guilds: [0]
  });
});

test('detail: every category key in a game descriptor that declares detail appears in scorer.detail()', () => {
  for (const game of [harmonies, faraway, sevenwonders]){
    const scorer = makeScorer(game, () => undefined);
    const p = scorer.newPlayer(1, 'Test');
    const d = scorer.detail(p);
    for (const c of game.cats){
      if (c.detail) assert.ok(Object.prototype.hasOwnProperty.call(d, c.key), `${game.key}: missing detail key "${c.key}"`);
    }
  }
});

// ---- scorer.detail — typed overrides ride along under the reserved _totals key ----
//
// "✎ Enter total" freezes p.totals[cat] and every later edit touches only that, never the tally
// fields. Without capturing it, a game entered that way saves raw state that misrepresents it.

test('detail: a typed override is captured under the reserved _totals key', () => {
  const scorer = makeScorer(sevenwonders, () => undefined);
  const p = scorer.newPlayer(1, 'Typed');
  p.totals.science = 21;
  assert.deepEqual(scorer.detail(p)[TOTALS_KEY], { science: 21 });
});

test('detail: no _totals key at all when nothing was typed, so untouched rows stay lean', () => {
  const scorer = makeScorer(sevenwonders, () => undefined);
  const d = scorer.detail(scorer.newPlayer(1, 'Tallied'));
  assert.ok(!Object.prototype.hasOwnProperty.call(d, TOTALS_KEY));
});

test('detail: an override is stored raw, exactly as typed — including the "" a cleared input leaves', () => {
  const scorer = makeScorer(sevenwonders, () => undefined);
  const p = scorer.newPlayer(1, 'Typed');
  p.totals.science = '21';   // straight off an <input>, still a string
  p.totals.treasury = '';    // cleared the field; isTotalMode still treats it as overridden
  assert.deepEqual(scorer.detail(p)[TOTALS_KEY], { science: '21', treasury: '' });
});

// ---- scorer.fromDetail — the declared inverse ----

// Distinct nonzero values in every field, so a restore that writes the wrong field or drops one
// cannot coincidentally still score right.
//
// Each carries a typed override too, and deliberately one stored as a STRING — that is what an
// <input> hands over, and it is the shape `_totals` promises to round-trip untouched. Without an
// override in these fixtures the strongest assertion below (detail(restored) deepEquals detail)
// never reaches `_totals` at all: coercing saved overrides through numOf() in fromDetail() left
// all 163 tests green.
const FULL_PLAYERS = [
  [harmonies, () => ({
    id: 1, name: 'Full', totals: { animals: '13' }, open: new Set(),
    trees: { h1: 1, h2: 2, h3: 3 },
    mountains: { h1: 4, h2: 5, h3: 6 },
    fields: 7, buildings: 8,
    river: 9, islands: 3,
    animals: [11, 12, 13],
    bonus: 14
  })],
  [faraway, () => ({
    id: 1, name: 'Full', totals: { sanctuary: 8 }, open: new Set(),
    regionFame: [1, 2, 3], sanctuaryFame: [4, 5]
  })],
  [sevenwonders, () => ({
    id: 1, name: 'Full', totals: { science: '21' }, open: new Set(),
    military: { w1: 1, w3: 2, w5: 3, loss: 4 },
    treasury: 17,
    wonders: [3, 4, 5], civilian: [6, 7],
    science: { tablet: 3, compass: 2, gear: 1 },
    commercial: [8], guilds: [9, 10]
  })]
];

for (const [game, build] of FULL_PLAYERS){
  for (const variant of [{ waterSide: 'river' }, { waterSide: 'island' }]){
    test(`fromDetail: ${game.key} round-trips every category (waterSide=${variant.waterSide})`, () => {
      const scorer = makeScorer(game, () => variant);
      const p = build();
      const { player: r, present } = scorer.fromDetail(scorer.detail(p));

      assert.deepEqual(present.sort(), game.cats.map(c => c.key).sort(),
        'every category in the blob must be reported present');

      for (const c of game.cats){
        assert.equal(scorer.catPoints(r, c.key), scorer.catPoints(p, c.key),
          `${game.key}.${c.key}: restored player scores differently`);
      }
      assert.equal(scorer.total(r), scorer.total(p));

      // The strongest statement: re-serialising the restored player reproduces the blob exactly.
      assert.deepEqual(scorer.detail(r), scorer.detail(p));
    });
  }
}

test('fromDetail: a 7 Wonders game scored by typing totals re-scores correctly — the bug _totals exists to fix', () => {
  const scorer = makeScorer(sevenwonders, () => undefined);
  const p = scorer.newPlayer(1, 'Typed');
  // Nobody tallied a symbol; they read the numbers off the board and typed them. Every 7 Wonders
  // category is `infer: null`, so both stay frozen overrides.
  p.totals.science = 21;
  p.totals.treasury = 5;
  assert.equal(scorer.total(p), 26);

  const { player: r } = scorer.fromDetail(scorer.detail(p));
  assert.equal(scorer.total(r), 26,
    'before _totals this reconstructed as 0 — the tally fields are all still zero');
  assert.equal(scorer.catPoints(r, 'science'), 21);
  assert.deepEqual(r.science, { tablet: 0, compass: 0, gear: 0 },
    'and the raw tally state really is empty, which is exactly why detail() alone was not enough');
});

test('fromDetail: an override sits on top of real tally state without erasing it', () => {
  const scorer = makeScorer(harmonies, () => ({ waterSide: 'river' }));
  const p = scorer.newPlayer(1, 'Mixed');
  p.trees = { h1: 1, h2: 0, h3: 0 };   // really tallied one height-1 tree, worth 1
  p.totals.trees = 99;                  // then overrode the category to 99
  p.fields = 2;                         // and left fields honestly tallied

  const { player: r } = scorer.fromDetail(scorer.detail(p));
  assert.equal(scorer.catPoints(r, 'trees'), 99, 'the override wins, as it does on a live card');
  assert.deepEqual(r.trees, { h1: 1, h2: 0, h3: 0 }, 'but the raw stack underneath survives');
  assert.equal(scorer.catPoints(r, 'fields'), 10);
});

test('fromDetail: a category missing from the blob is absent from `present`, not silently a zero', () => {
  const scorer = makeScorer(harmonies, () => ({ waterSide: 'river' }));
  const full = scorer.detail(FULL_PLAYERS[0][1]());
  delete full.bonus;   // a row saved before the game had this category

  const { player: r, present } = scorer.fromDetail(full);
  assert.ok(!present.includes('bonus'), 'the recap needs to tell "did not exist" from "scored 0"');
  assert.ok(present.includes('trees'));
  assert.equal(r.bonus, 0, 'it still starts from init(), so nothing downstream sees undefined');
});

test('fromDetail: tolerates malformed blobs rather than throwing — it is reading Postgres, not trusted input', () => {
  for (const game of [harmonies, faraway, sevenwonders]){
    const scorer = makeScorer(game, () => ({ waterSide: 'river' }));
    for (const junk of [null, undefined, 'nope', 42, [], {}, { trees: 'x', military: 7, animals: 'no' }]){
      const { player: r } = scorer.fromDetail(junk);
      assert.equal(typeof scorer.total(r), 'number', `${game.key}: total must stay a number for ${JSON.stringify(junk)}`);
      assert.ok(Number.isFinite(scorer.total(r)));
    }
  }
});

test('fromDetail: an unknown key inside _totals is ignored, not copied onto the player', () => {
  const scorer = makeScorer(harmonies, () => ({ waterSide: 'river' }));
  const { player: r } = scorer.fromDetail({ [TOTALS_KEY]: { trees: 5, retiredCategory: 99 } });
  assert.equal(r.totals.trees, 5);
  assert.ok(!('retiredCategory' in r.totals), 'a category dropped from the game must not resurface in totals');
  assert.equal(scorer.total(r), 5, 'and it must not reach the score either');
});
