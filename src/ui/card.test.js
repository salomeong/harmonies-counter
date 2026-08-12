// The DOM-level regression net CLAUDE.md's "Every rendered number needs a patch hook" section
// refers to. The bug this exists to catch already shipped once: Faraway's `.cat-pts` rendered
// without `data-pts-for`, so its per-category scores froze at 0 while the total kept updating —
// nothing in src/ caught it because nothing here ever rendered markup and looked at it.
//
// The invariant, implemented differentially and without an HTML parser:
//
//   Any element whose rendered text CHANGES with player state must carry a patch hook
//   (data-pts-for, data-sum, or data-count-for).
//
// For every game, every category block (plus the sum strip) is rendered twice — once for a
// freshly-initialized player, once for a player with distinct nonzero values in every field that
// category owns — and the two HTML strings are walked in lockstep. Wherever the text immediately
// following a tag differs between the two renders, that tag must carry one of the three hooks.
// Static rule constants (token pips, ladder rung labels) are identical in both renders and so
// never trigger the check — which is correct, they must NOT be patched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_LIST } from '../games/index.js';
import { makeScorer } from '../scoring.js';
import { catBody, categoryBlock, sumStrip, playerCardBody } from './card.js';

function scorerFor(game){
  return makeScorer(game, () => ({ waterSide: 'river' }));
}

// Every leaf a category's init() owns gets replaced with a distinct nonzero value, so any
// score/count text driven by player state is guaranteed to differ from the zero player's. Walks
// one level into arrays (animal cards, fame lists) and plain-object buckets (stack shapes:
// {h1,h2,h3}) — the only two shapes any current or documented category field takes.
function distinctFullPlayer(game, scorer){
  const p = scorer.newPlayer(999, 'Full');
  let n = 2;
  const nextVal = () => (n += 5);
  for (const cat of game.cats){
    for (const field of Object.keys(cat.init())){
      const current = p[field];
      if (Array.isArray(current)){
        p[field] = current.map(() => nextVal());
      } else if (current && typeof current === 'object'){
        const out = {};
        for (const k of Object.keys(current)) out[k] = nextVal();
        p[field] = out;
      } else {
        p[field] = nextVal();
      }
    }
  }
  return p;
}

// All drawers open, so catBody (tally counts, list rows, ladders) is part of the comparison too —
// not just the collapsed cat-head pip.
function openAllCats(p, game){
  p.open = new Set(game.cats.map(c => c.key));
  return p;
}

// Splits on "<": everything after the first element is "<tagContent>trailingText...", which is
// enough to pair a tag with the text immediately following it without a real parser.
function tagTextPairs(html){
  return html.split('<').slice(1).map(chunk => {
    const gt = chunk.indexOf('>');
    if (gt === -1) return null;
    return { tag: chunk.slice(0, gt), text: chunk.slice(gt + 1) };
  }).filter(Boolean);
}

const HOOK_RE = /data-pts-for=|data-sum=|data-count-for=/;

for (const game of GAME_LIST){
  test(`${game.key}: every score-bearing element carries a patch hook (data-pts-for/data-sum/data-count-for)`, () => {
    const scorer = scorerFor(game);
    const zero = openAllCats(scorer.newPlayer(1, 'Zero'), game);
    const full = openAllCats(distinctFullPlayer(game, scorer), game);
    const opts = { showRules: true, accordion: game.accordion, variant: { waterSide: 'river' } };

    const zeroHtml = game.cats.map(key => categoryBlock(scorer, zero, key.key, opts)).join('') + sumStrip(game);
    const fullHtml = game.cats.map(key => categoryBlock(scorer, full, key.key, opts)).join('') + sumStrip(game);

    const zeroPairs = tagTextPairs(zeroHtml);
    const fullPairs = tagTextPairs(fullHtml);
    assert.equal(zeroPairs.length, fullPairs.length,
      `${game.key}: the two renders produced a different number of tags — check distinctFullPlayer didn't change a list's length`);

    for (let i = 0; i < zeroPairs.length; i++){
      const z = zeroPairs[i], f = fullPairs[i];
      if (z.text !== f.text){
        const hooked = HOOK_RE.test(z.tag) || HOOK_RE.test(f.tag);
        assert.ok(hooked,
          `${game.key}: <${z.tag.split(' ')[0]}> text changed ("${z.text.slice(0, 24)}" -> "${f.text.slice(0, 24)}") ` +
          `without a data-pts-for/data-sum/data-count-for hook. tag: <${z.tag}>`);
      }
    }
  });
}

// The differential check above has a blind spot by construction: an element that renders a
// constant placeholder and relies entirely on patchScores() to fill it reads the same in both
// renders, so "the text changed" never fires for it. The `=` strip and the total badge are exactly
// that shape — they ship `0` and are filled after the card is in the DOM. Deleting their hook would
// freeze them at 0 forever and the differential test would stay green.
//
// So assert their hooks structurally as well. Between the two checks: differential catches "renders
// a real value with no hook", structural catches "renders a placeholder whose hook went missing".
for (const game of GAME_LIST){
  test(`${game.key}: placeholder-rendered scores (= strip, total badge) carry their patch hooks`, () => {
    const scorer = scorerFor(game);
    const p = openAllCats(scorer.newPlayer(1, 'P'), game);
    const html = playerCardBody(game, scorer, p, {
      showRules: true, variant: { waterSide: 'river' }, showRemove: false, mascotSrc: ''
    });

    assert.match(html, /class="[^"]*total-badge[^"]*"/,
      `${game.key}: the player card must render a .total-badge for patchScores() to fill`);

    for (const s of (game.sums || [])){
      assert.match(html, new RegExp(`data-sum="${s.key}"`),
        `${game.key}: the "=" strip renders a constant 0 for the "${s.key}" group, so without ` +
        `data-sum="${s.key}" it stays 0 forever and no differential test would notice`);
    }
    if (game.sums){
      assert.match(html, /data-sum="total"/,
        `${game.key}: the "=" strip's grand total needs data-sum="total"`);
    }
  });
}

// ---- Fix 1: the total-input's rendered min attribute ----

test('catBody: the total-input min attribute reflects the descriptor min, not a hardcoded 0', () => {
  const game = {
    cats: [{
      key: 'military', label: 'Military', min: -99,
      init: () => ({ military: 0 }),
      points: p => p.military,
      controls: () => '',
      infer: (p, total) => { p.military = total; return true; },
      detail: p => p.military
    }]
  };
  const scorer = makeScorer(game, () => undefined);
  const p = scorer.newPlayer(1, 'P1');
  p.totals.military = -5; // total mode
  const html = catBody(scorer, p, 'military', {});
  assert.match(html, /min="-99"/);
});

test('catBody: the total-input min defaults to 0 when the descriptor omits min (existing Harmonies categories)', () => {
  const scorer = scorerFor(GAME_LIST.find(g => g.key === 'harmonies'));
  const p = scorer.newPlayer(1, 'P1');
  p.totals.trees = 5; // total mode
  const html = catBody(scorer, p, 'trees', {});
  assert.match(html, /min="0"/);
});

// ---- Fix 2: minPlayers gates the remove-player button, not a hardcoded ">1" ----

test('playerCardBody: the remove-player button follows the caller-supplied showRemove flag (players.length > game.minPlayers)', () => {
  const harmonies = GAME_LIST.find(g => g.key === 'harmonies');
  const scorer = scorerFor(harmonies);
  const p = scorer.newPlayer(1, 'P1');
  const minPlayers = 3;

  // At the game's floor (3 players for a minPlayers: 3 game): no remove button.
  const atFloor = playerCardBody(harmonies, scorer, p, {
    mascotSrc: '', showRemove: 3 > minPlayers, showRules: true, variant: { waterSide: 'river' }
  });
  assert.doesNotMatch(atFloor, /class="remove-player"/, 'at the game minimum, no remove button should render');

  // One above the floor: remove button renders.
  const aboveFloor = playerCardBody(harmonies, scorer, p, {
    mascotSrc: '', showRemove: 4 > minPlayers, showRules: true, variant: { waterSide: 'river' }
  });
  assert.match(aboveFloor, /class="remove-player"/, 'above the game minimum, a remove button should render');
});
