// 7 Wonders declaration tests — written BEFORE src/games/sevenwonders.js exists (TDD: red before
// green). See src/games/harmonies.js's header comment for the category-descriptor contract this
// exercises, and CLAUDE.md's scoring-model section for why every points() assertion below goes
// through makeScorer()/catBody() rather than reading a category score any other way.
//
// Formulas are checked against the printed 7 Wonders rule card (military: 1/3/5 per age win, -1
// per defeat; treasury: floor(coins/3); science: tablet²+compass²+gear²+7·min(t,c,g)). Independent
// worked examples, not values recomputed the way the code computes them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sevenwonders } from './sevenwonders.js';
import { makeScorer } from '../scoring.js';
import { catBody } from '../ui/card.js';
import { GAMES, GAME_LIST, getGame } from './index.js';
import { GAMES as DB_GAMES } from '../../lib/db.mjs';

function scorer(){
  // 7 Wonders has no board-side variant (no waterToggle), but makeScorer() calls the variant
  // getter unconditionally to resolve label()/hint(), so it still needs one.
  return makeScorer(sevenwonders, () => undefined);
}

function cat(key){
  return sevenwonders.cats.find(c => c.key === key);
}

// ---- Science: tablet² + compass² + gear² + 7·min(tablet,compass,gear) ----

test('science: pure squares when only one symbol type is present (no set bonus possible)', () => {
  const science = cat('science');
  const pts = (tablet, compass, gear) => science.points({ science: { tablet, compass, gear } });
  assert.equal(pts(0, 0, 0), 0);
  assert.equal(pts(1, 0, 0), 1);
  assert.equal(pts(2, 0, 0), 4);
  assert.equal(pts(3, 0, 0), 9);
  assert.equal(pts(4, 0, 0), 16);
});

test('science: the +7-per-set bonus only kicks in once all three symbols are present', () => {
  const science = cat('science');
  const pts = (tablet, compass, gear) => science.points({ science: { tablet, compass, gear } });
  // Two symbol types, zero of the third: no set yet, so just the squares (1+1+0).
  assert.equal(pts(1, 1, 0), 2);
  // Adding the third type completes a set: 1+1+1 + 7*1 = 10, an +8 jump, not +1.
  assert.equal(pts(1, 1, 1), 10);
});

test('science: 3/2/1 -> 21, the canonical rulebook example (9+4+1 + 7*min(3,2,1))', () => {
  assert.equal(cat('science').points({ science: { tablet: 3, compass: 2, gear: 1 } }), 21);
});

test('science: 4/4/4 -> 76, two complete sets (16+16+16 + 7*4)', () => {
  assert.equal(cat('science').points({ science: { tablet: 4, compass: 4, gear: 4 } }), 76);
});

test('science: 2/2/1 -> 16 — both halves of the formula are cumulative, not either/or', () => {
  assert.equal(cat('science').points({ science: { tablet: 2, compass: 2, gear: 1 } }), 16);
});

// ---- Military: four tallies, one of them worth NEGATIVE points ----

test('military: all zero scores 0', () => {
  assert.equal(cat('military').points({ military: { w1: 0, w3: 0, w5: 0, loss: 0 } }), 0);
});

test('military: two Age III victories and one defeat -> 5*2 - 1*1 = 9', () => {
  assert.equal(cat('military').points({ military: { w1: 0, w3: 0, w5: 2, loss: 1 } }), 9);
});

test('military: all six conflicts lost -> a real -6, not clamped to 0', () => {
  const pts = cat('military').points({ military: { w1: 0, w3: 0, w5: 0, loss: 6 } });
  assert.equal(pts, -6);
  assert.ok(pts < 0, 'military must be able to return a negative number');
});

test('military: max 2 wins per age (both neighbours, each age) -> 1*2 + 3*2 + 5*2 = 18', () => {
  assert.equal(cat('military').points({ military: { w1: 2, w3: 2, w5: 2, loss: 0 } }), 18);
});

// ---- Treasury: floor(coins / 3), leftovers discarded ----

test('treasury: floor(coins/3), leftover coins score nothing (not rounded)', () => {
  const treasury = cat('treasury');
  const pts = coins => treasury.points({ treasury: coins });
  assert.equal(pts(0), 0);
  assert.equal(pts(2), 0);
  assert.equal(pts(3), 1);
  assert.equal(pts(17), 5);    // 17/3 = 5.66… -> 5, not rounded to 6
  assert.equal(pts(100), 33);  // 100/3 = 33.33… -> 33, not rounded to 33 via Math.round coincidence
});

// ---- The four card-pile lists: wonders / civilian / commercial / guilds ----

test('lists (wonders/civilian/commercial/guilds): sum entries, including string values typed into a number <input>', () => {
  for (const key of ['wonders', 'civilian', 'commercial', 'guilds']){
    const c = cat(key);
    assert.equal(c.points({ [c.listField]: [0] }), 0, `${key}: a lone blank/zero entry sums to 0`);
    assert.equal(c.points({ [c.listField]: [3, 5, 7] }), 15, `${key}: several numeric entries sum correctly`);
    // Real <input type=number> values arrive as strings, including "" for an unfilled row.
    assert.equal(c.points({ [c.listField]: ['4', '', '7'] }), 11, `${key}: string/blank entries coerce through numOf`);
  }
});

// ---- Contract conformance, table-driven over every category ----

test('every category satisfies the descriptor contract: key/label/init/points/controls/detail present', () => {
  for (const c of sevenwonders.cats){
    assert.equal(typeof c.key, 'string', `${c.key}: key must be a string`);
    assert.ok(c.key.length > 0);
    assert.ok(typeof c.label === 'string' || typeof c.label === 'function', `${c.key}: label`);
    assert.equal(typeof c.init, 'function', `${c.key}: init`);
    assert.equal(typeof c.points, 'function', `${c.key}: points`);
    assert.equal(typeof c.controls, 'function', `${c.key}: controls`);
    assert.equal(typeof c.detail, 'function', `${c.key}: detail`);
  }
});

test('init() returns a partial player object (at least one field) for every category', () => {
  for (const c of sevenwonders.cats){
    const partial = c.init();
    assert.equal(typeof partial, 'object');
    assert.ok(partial !== null);
    assert.ok(Object.keys(partial).length > 0, `${c.key}: init() must own at least one field`);
  }
});

test('points() returns a finite number for a freshly-initialised player, for every category', () => {
  const s = scorer();
  const p = s.newPlayer(1, 'P1');
  for (const c of sevenwonders.cats){
    const pts = c.points(p, s.variant());
    assert.equal(typeof pts, 'number', `${c.key}: points() must return a number`);
    assert.ok(Number.isFinite(pts), `${c.key}: points() must be finite on a fresh player`);
  }
});

test('detail() round-trips the entered state (raw, not derived points) for every category', () => {
  const s = scorer();
  const p = s.newPlayer(1, 'P1');
  p.military = { w1: 1, w3: 2, w5: 3, loss: 4 };
  p.treasury = 11;
  p.wonders = [3, 4];
  p.civilian = [5, 6, 7];
  p.science = { tablet: 2, compass: 1, gear: 0 };
  p.commercial = [8];
  p.guilds = [9, 10];

  assert.deepEqual(cat('military').detail(p), { w1: 1, w3: 2, w5: 3, loss: 4 });
  assert.equal(cat('treasury').detail(p), 11);
  assert.deepEqual(cat('wonders').detail(p), [3, 4]);
  assert.deepEqual(cat('civilian').detail(p), [5, 6, 7]);
  assert.deepEqual(cat('science').detail(p), { tablet: 2, compass: 1, gear: 0 });
  assert.deepEqual(cat('commercial').detail(p), [8]);
  assert.deepEqual(cat('guilds').detail(p), [9, 10]);
});

// ---- scorer.total over a full realistic board, hand-computed ----
//
//   military:   w1=2,w3=1,w5=1,loss=1  -> 1*2 + 3*1 + 5*1 - 1*1 = 2+3+5-1        =  9
//   treasury:   13 coins               -> floor(13/3)                            =  4
//   wonders:    [3,4,5]                -> 3+4+5                                  = 12
//   civilian:   [2,4,6,3]              -> 2+4+6+3                                = 15
//   science:    t=2,c=1,g=1            -> 4+1+1 + 7*min(2,1,1)=7*1 = 6+7         = 13
//   commercial: [1,2]                  -> 1+2                                    =  3
//   guilds:     [7,7]                  -> 7+7                                    = 14
//   total: 9+4+12+15+13+3+14 = 70
test('scorer.total sums every category over a full realistic board (hand-computed above)', () => {
  const s = scorer();
  const p = s.newPlayer(1, 'P1');
  p.military = { w1: 2, w3: 1, w5: 1, loss: 1 };
  p.treasury = 13;
  p.wonders = [3, 4, 5];
  p.civilian = [2, 4, 6, 3];
  p.science = { tablet: 2, compass: 1, gear: 1 };
  p.commercial = [1, 2];
  p.guilds = [7, 7];
  assert.equal(s.total(p), 70);
});

// ---- min: military's -6 floor, everyone else's 0 ----

test("scorer.min: military floors at -6 (the true worst case), every other category floors at 0", () => {
  const s = scorer();
  assert.equal(s.min('military'), -6);
  for (const c of sevenwonders.cats){
    if (c.key === 'military') continue;
    assert.equal(s.min(c.key), 0, `${c.key}: min() should default to 0`);
  }
});

test('military has no infer (many token combos share a total) — but the rendered total-input min still reflects -6, not a hardcoded 0', () => {
  const s = scorer();
  const p = s.newPlayer(1, 'P1');
  p.totals.military = -4; // enter total mode
  const html = catBody(s, p, 'military', {});
  assert.match(html, /min="-6"/);
  assert.equal(s.infer(p, 'military', -4), false,
    'military has no infer function, so scorer.infer() must report false rather than clamp/mutate');
});

// ---- Registration ----

test('sevenwonders is registered under the "7wonders" key in the game registry', () => {
  assert.equal(GAMES['7wonders'], sevenwonders);
  assert.ok(GAME_LIST.includes(sevenwonders));
  assert.equal(getGame('7wonders'), sevenwonders);
});

test("lib/db.mjs's GAMES list includes '7wonders' so the save API will accept it", () => {
  assert.ok(DB_GAMES.includes('7wonders'));
});

test('sevenwonders declares all seven categories in the printed scorepad order', () => {
  assert.deepEqual(sevenwonders.cats.map(c => c.key),
    ['military', 'treasury', 'wonders', 'civilian', 'science', 'commercial', 'guilds']);
});

test('sevenwonders has no sums group — the printed pad has no group subtotals', () => {
  assert.equal(sevenwonders.sums, undefined);
});

test('sevenwonders declares its player-count bounds and view flags', () => {
  assert.equal(sevenwonders.key, '7wonders');
  assert.equal(sevenwonders.minPlayers, 3);
  assert.equal(sevenwonders.maxPlayers, 7);
  assert.equal(sevenwonders.accordion, true);
  assert.equal(sevenwonders.categoryMode, true);
  assert.equal(sevenwonders.critters, false);
  // No per-player mascot: the mascot art is Harmonies' animals, and a fennec heading up a
  // 7 Wonders city reads as a bug rather than a flourish.
  assert.equal(sevenwonders.mascots, false);
  assert.equal(sevenwonders.waterToggle, false);
});
