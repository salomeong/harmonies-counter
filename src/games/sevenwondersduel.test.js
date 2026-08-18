// 7 Wonders Duel declaration tests. See src/games/harmonies.js's header comment for the
// category-descriptor contract this exercises, and sevenwondersduel.js's header comment for why
// almost nothing here reuses the base game's formulas despite sharing a box aesthetic.
//
// Values are checked against the official rulebook (military zones 0/2/5/10; wonders' printed VP;
// progress tokens' printed VP, Mathematics = 3 × tokens owned including itself; treasury
// floor(coins/3)). Independent worked examples, not values recomputed the way the code computes
// them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sevenwondersduel, MILITARY_ZONES } from './sevenwondersduel.js';
import { makeScorer } from '../scoring.js';
import { GAMES, GAME_LIST, getGame } from './index.js';
import { GAMES as DB_GAMES } from '../../lib/db.mjs';

function scorer(variant = { militaryTrack: 0 }){
  return makeScorer(sevenwondersduel, () => variant);
}

function cat(key){
  return sevenwondersduel.cats.find(c => c.key === key);
}

// ---- Military: one shared track, resolved per player by id ----

test('military: a neutral track (0) scores 0 for both players', () => {
  const military = cat('military');
  assert.equal(military.points({ id: 1 }, { militaryTrack: 0 }), 0);
  assert.equal(military.points({ id: 2 }, { militaryTrack: 0 }), 0);
});

test('military: a negative zone favors player 1 only, worth 0/2/5/10 by distance from centre', () => {
  const military = cat('military');
  assert.equal(military.points({ id: 1 }, { militaryTrack: -1 }), 2);
  assert.equal(military.points({ id: 1 }, { militaryTrack: -2 }), 5);
  assert.equal(military.points({ id: 1 }, { militaryTrack: -3 }), 10);
  // The opponent scores nothing while the pawn leans the other way, not a negative.
  assert.equal(military.points({ id: 2 }, { militaryTrack: -3 }), 0);
});

test('military: a positive zone favors player 2 only, the mirror of the negative case', () => {
  const military = cat('military');
  assert.equal(military.points({ id: 2 }, { militaryTrack: 1 }), 2);
  assert.equal(military.points({ id: 2 }, { militaryTrack: 2 }), 5);
  assert.equal(military.points({ id: 2 }, { militaryTrack: 3 }), 10);
  assert.equal(military.points({ id: 1 }, { militaryTrack: 3 }), 0);
});

test('military: MILITARY_ZONES has exactly 7 symmetric stops, and the capital zone (instant supremacy) is deliberately absent', () => {
  assert.equal(MILITARY_ZONES.length, 7);
  assert.deepEqual(MILITARY_ZONES.map(z => z.value), [-3, -2, -1, 0, 1, 2, 3]);
  assert.deepEqual(MILITARY_ZONES.map(z => z.vp), [10, 5, 2, 0, 2, 5, 10]);
});

test('military: a missing or malformed variant scores 0 rather than throwing', () => {
  const military = cat('military');
  assert.equal(military.points({ id: 1 }, undefined), 0);
  assert.equal(military.points({ id: 1 }, {}), 0);
});

// ---- Wonders: 12 named boards, fixed printed VP, build-once ----

test('wonders: an unbuilt board contributes nothing', () => {
  const wonders = cat('wonders');
  assert.equal(wonders.points({ wonders: {} }), 0);
});

test('wonders: sums the printed VP of every checked wonder, ignoring unchecked ones', () => {
  const wonders = cat('wonders');
  const pts = wonders.points({ wonders: { pyramids: 1, sphinx: 0, greatLibrary: 1, mausoleum: 1 } });
  assert.equal(pts, 9 + 4 + 2); // Pyramids 9 + Great Library 4 + Mausoleum 2, Sphinx unchecked
});

test('wonders: Temple of Artemis is a legitimate build worth 0 VP, not treated as unbuilt', () => {
  const wonders = cat('wonders');
  assert.equal(wonders.points({ wonders: { templeOfArtemis: 1 } }), 0);
});

// ---- Progress tokens: mostly fixed VP, Mathematics dynamic ----

test('progress: no tokens contributes nothing', () => {
  const progress = cat('progress');
  assert.equal(progress.points({ progress: {} }), 0);
});

test('progress: Philosophy and Agriculture are flat VP regardless of what else is held', () => {
  const progress = cat('progress');
  assert.equal(progress.points({ progress: { philosophy: 1 } }), 7);
  assert.equal(progress.points({ progress: { agriculture: 1 } }), 4);
  assert.equal(progress.points({ progress: { philosophy: 1, agriculture: 1 } }), 11);
});

test('progress: tokens with no direct VP (Architecture, Economy, Law, Masonry, Strategy, Theology, Urbanism) score 0', () => {
  const progress = cat('progress');
  const zeroKeys = ['architecture', 'economy', 'law', 'masonry', 'strategy', 'theology', 'urbanism'];
  for (const key of zeroKeys){
    assert.equal(progress.points({ progress: { [key]: 1 } }), 0, `${key} should score 0 VP directly`);
  }
});

test('progress: Mathematics scores 3 × total tokens held, including itself', () => {
  const progress = cat('progress');
  // Mathematics alone: 3 × 1 (itself) = 3.
  assert.equal(progress.points({ progress: { mathematics: 1 } }), 3);
  // Mathematics plus two 0-VP tokens: 3 × 3 = 9, on top of nothing else.
  assert.equal(progress.points({ progress: { mathematics: 1, law: 1, urbanism: 1 } }), 9);
  // Mathematics alongside Philosophy: 7 (flat) + 3 × 2 (both tokens, including math itself) = 13.
  assert.equal(progress.points({ progress: { mathematics: 1, philosophy: 1 } }), 7 + 6);
});

// ---- Treasury: floor(coins / 3), identical rule to the base game ----

test('treasury: floor(coins/3), leftover coins score nothing', () => {
  const treasury = cat('treasury');
  const pts = coins => treasury.points({ treasury: coins });
  assert.equal(pts(0), 0);
  assert.equal(pts(2), 0);
  assert.equal(pts(3), 1);
  assert.equal(pts(17), 5);
});

// ---- The four printed-VP card piles: civilian / science / commercial / guilds ----

test('lists (civilian/science/commercial/guilds): sum entries, including string values typed into a number <input>', () => {
  for (const key of ['civilian', 'science', 'commercial', 'guilds']){
    const c = cat(key);
    assert.equal(c.points({ [c.listField]: [0] }), 0, `${key}: a lone blank/zero entry sums to 0`);
    assert.equal(c.points({ [c.listField]: [3, 5, 7] }), 15, `${key}: several numeric entries sum correctly`);
    assert.equal(c.points({ [c.listField]: ['4', '', '7'] }), 11, `${key}: string/blank entries coerce through numOf`);
  }
});

// ---- Contract conformance, table-driven over every category ----

test('every category satisfies the descriptor contract: key/label/init/points/controls present, infer explicitly declared', () => {
  for (const c of sevenwondersduel.cats){
    assert.equal(typeof c.key, 'string', `${c.key}: key must be a string`);
    assert.ok(typeof c.label === 'string' || typeof c.label === 'function', `${c.key}: label`);
    assert.equal(typeof c.init, 'function', `${c.key}: init`);
    assert.equal(typeof c.points, 'function', `${c.key}: points`);
    assert.equal(typeof c.controls, 'function', `${c.key}: controls`);
    // infer is a REQUIRED field on the contract: either a function or the literal null, never omitted.
    assert.ok(c.infer === null || typeof c.infer === 'function', `${c.key}: infer must be null or a function`);
  }
});

test('init() returns a partial player object for every category, including military\'s deliberate empty object', () => {
  for (const c of sevenwondersduel.cats){
    const partial = c.init();
    assert.equal(typeof partial, 'object');
    assert.ok(partial !== null);
  }
  // military owns no per-player field at all — its state lives on the session's variant.
  assert.deepEqual(cat('military').init(), {});
});

test('points() returns a finite number for a freshly-initialised player, for every category', () => {
  const s = scorer();
  const p = s.newPlayer(1, 'P1');
  for (const c of sevenwondersduel.cats){
    const pts = c.points(p, s.variant());
    assert.equal(typeof pts, 'number', `${c.key}: points() must return a number`);
    assert.ok(Number.isFinite(pts), `${c.key}: points() must be finite on a fresh player`);
  }
});

// ---- detail()/restore(): every category that declares one round-trips, including military's sentinel ----

test('detail() round-trips the entered state (raw, not derived points) for every category', () => {
  const s = scorer();
  const p = s.newPlayer(1, 'P1');
  p.treasury = 11;
  p.civilian = [5, 6, 7];
  p.science = [3, 2];
  p.commercial = [8];
  p.guilds = [9, 10];
  p.wonders.pyramids = 1;
  p.wonders.sphinx = 1;
  p.progress.philosophy = 1;
  p.progress.mathematics = 1;

  assert.equal(cat('treasury').detail(p), 11);
  assert.deepEqual(cat('civilian').detail(p), [5, 6, 7]);
  assert.deepEqual(cat('science').detail(p), [3, 2]);
  assert.deepEqual(cat('commercial').detail(p), [8]);
  assert.deepEqual(cat('guilds').detail(p), [9, 10]);
  assert.equal(cat('wonders').detail(p).pyramids, 1);
  assert.equal(cat('wonders').detail(p).sphinx, 1);
  assert.equal(cat('wonders').detail(p).mausoleum, 0);
  assert.equal(cat('progress').detail(p).philosophy, 1);
  assert.equal(cat('progress').detail(p).mathematics, 1);
  assert.equal(cat('progress').detail(p).urbanism, 0);
  // military's sentinel: nothing per-player to store, but present so the recap's `present` check
  // (Recap.jsx) doesn't wrongly render it as "not tracked when this game was saved".
  assert.equal(cat('military').detail(p), 1);
  assert.equal(typeof cat('military').restore, 'function');
});

test('restore() rebuilds wonders/progress objects with every known key present, even from a partial or malformed blob', () => {
  const s = scorer();
  const p = s.newPlayer(1, 'P1');
  cat('wonders').restore(p, { pyramids: 1 });
  assert.equal(p.wonders.pyramids, 1);
  assert.equal(p.wonders.templeOfArtemis, 0); // every declared wonder key present, not just the saved one
  cat('progress').restore(p, null); // malformed — reading Postgres, must not throw
  assert.equal(p.progress.philosophy, 0);
  assert.equal(p.progress.mathematics, 0);
});

// ---- scorer.total over a full realistic board, hand-computed ----
//
//   military (P1, track leans -2)      -> 5
//   civilian [2,4,6,3]                 -> 15
//   science [4,3]                      -> 7
//   commercial [1,2]                   -> 3
//   guilds [7,7]                       -> 14
//   wonders: pyramids(9) + mausoleum(2) -> 11
//   progress: philosophy(7) + mathematics(3×2=6) -> 13
//   treasury: 13 coins -> floor(13/3) -> 4
//   total: 5+15+7+3+14+11+13+4 = 72
test('scorer.total sums every category over a full realistic board (hand-computed above)', () => {
  const s = scorer({ militaryTrack: -2 });
  const p = s.newPlayer(1, 'P1');
  p.civilian = [2, 4, 6, 3];
  p.science = [4, 3];
  p.commercial = [1, 2];
  p.guilds = [7, 7];
  p.wonders.pyramids = 1;
  p.wonders.mausoleum = 1;
  p.progress.philosophy = 1;
  p.progress.mathematics = 1;
  p.treasury = 13;
  assert.equal(s.total(p), 72);
});

test("the opposing player on the same board scores 0 military while everything else is untouched", () => {
  const s = scorer({ militaryTrack: -2 });
  const p2 = s.newPlayer(2, 'P2');
  assert.equal(cat('military').points(p2, s.variant()), 0);
});

// ---- min: every category floors at 0 (Duel has no category that can score negative) ----

test('scorer.min: every category floors at 0', () => {
  const s = scorer();
  for (const c of sevenwondersduel.cats){
    assert.equal(s.min(c.key), 0, `${c.key}: min() should default to 0`);
  }
});

test('no category has an infer function — every ambiguous or checklist category keeps its state as an explicit override or checkbox, never guessed apart from a typed total', () => {
  const s = scorer();
  for (const c of sevenwondersduel.cats){
    assert.equal(c.infer, null, `${c.key}: expected infer: null`);
  }
});

// ---- canType: false on military/wonders/progress — none of them have a meaningful typed total ----

test('military, wonders and progress hide "Enter total" — none has a single number that means anything typed in', () => {
  const s = scorer();
  assert.equal(s.canType('military'), false);
  assert.equal(s.canType('wonders'), false);
  assert.equal(s.canType('progress'), false);
  // The four printed-VP piles keep the base game's typed-total behaviour.
  assert.equal(s.canType('civilian'), true);
  assert.equal(s.canType('treasury'), true);
});

// ---- Registration ----

test('sevenwondersduel is registered under the "7wondersduel" key in the game registry', () => {
  assert.equal(GAMES['7wondersduel'], sevenwondersduel);
  assert.ok(GAME_LIST.includes(sevenwondersduel));
  assert.equal(getGame('7wondersduel'), sevenwondersduel);
});

test("lib/db.mjs's GAMES list includes '7wondersduel' so the save API will accept it", () => {
  assert.ok(DB_GAMES.includes('7wondersduel'));
});

test('sevenwondersduel declares its eight categories and no sums', () => {
  assert.deepEqual(sevenwondersduel.cats.map(c => c.key),
    ['military', 'civilian', 'science', 'commercial', 'guilds', 'wonders', 'progress', 'treasury']);
  assert.equal(sevenwondersduel.sums, undefined);
});

test('sevenwondersduel declares its player-count bounds and view flags, locked to exactly 2 players', () => {
  assert.equal(sevenwondersduel.key, '7wondersduel');
  assert.equal(sevenwondersduel.minPlayers, 2);
  assert.equal(sevenwondersduel.maxPlayers, 2);
  assert.equal(sevenwondersduel.accordion, true);
  assert.equal(sevenwondersduel.categoryMode, true);
  assert.equal(sevenwondersduel.critters, false);
  assert.equal(sevenwondersduel.mascots, false);
  assert.equal(sevenwondersduel.waterToggle, false);
  assert.ok(Array.isArray(sevenwondersduel.militaryZones));
});
