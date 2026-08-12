import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOK_RX, TOK_RY, escapeAttr, getCount, setCount, bumpCount, tallyControl, riverLadder, tokenArt
} from './controls.js';

// ---- escapeAttr ----
// These document current behaviour rather than a spec — see the report for what's NOT escaped.

test('escapeAttr: & < " are escaped', () => {
  assert.equal(escapeAttr('&'), '&amp;');
  assert.equal(escapeAttr('<'), '&lt;');
  assert.equal(escapeAttr('"'), '&quot;');
});

test('escapeAttr: current implementation does NOT escape > or \' (documented, not a spec)', () => {
  assert.equal(escapeAttr('>'), '>');
  assert.equal(escapeAttr("'"), "'");
});

test('escapeAttr: a value containing a double quote round-trips safely inside value="..."', () => {
  const raw = `she said "hi" & <bye>`;
  const escaped = escapeAttr(raw);
  const html = `<input value="${escaped}">`;
  // The escaped double-quote must not terminate the attribute early.
  assert.ok(!escaped.includes('"'));
  assert.equal(html, `<input value="she said &quot;hi&quot; &amp; &lt;bye>">`);
});

test('escapeAttr: non-string input is coerced via String()', () => {
  assert.equal(escapeAttr(5), '5');
  assert.equal(escapeAttr(0), '0');
});

// ---- getCount / setCount / bumpCount ----

test('getCount: no key reads p[path] through numOf', () => {
  assert.equal(getCount({ fields: '3' }, 'fields', ''), 3);
  assert.equal(getCount({ fields: undefined }, 'fields', ''), 0);
});

test('getCount: a key reads p[path][key] through numOf', () => {
  const p = { trees: { h1: '2', h2: 0, h3: 0 } };
  assert.equal(getCount(p, 'trees', 'h1'), 2);
});

test('setCount: no key writes p[path] directly', () => {
  const p = { fields: 0 };
  setCount(p, 'fields', '', 5);
  assert.equal(p.fields, 5);
});

test('setCount: a key writes p[path][key]', () => {
  const p = { trees: { h1: 0, h2: 0, h3: 0 } };
  setCount(p, 'trees', 'h2', 4);
  assert.equal(p.trees.h2, 4);
  assert.equal(p.trees.h1, 0);
});

test('bumpCount: increments/decrements by delta', () => {
  const p = { fields: 3 };
  bumpCount(p, 'fields', '', 1, 0);
  assert.equal(p.fields, 4);
  bumpCount(p, 'fields', '', -1, 0);
  assert.equal(p.fields, 3);
});

test('bumpCount: respects the min floor', () => {
  const p = { fields: 0 };
  bumpCount(p, 'fields', '', -1, 0);
  assert.equal(p.fields, 0, 'must not go below min');
});

test('bumpCount: truncates the current value before adding', () => {
  const p = { fields: 2.9 };
  bumpCount(p, 'fields', '', 1, 0);
  assert.equal(p.fields, 3, 'Math.trunc(2.9) + 1 = 3, not 3.9');
});

// ---- tallyControl ----

test('tallyControl: markup contains the expected data-* hooks', () => {
  const html = tallyControl({
    scoreCat: 'fields', path: 'fields', key: '', art: 'field', prefix: '×', min: 0,
    pip: 5, count: 2, label: 'Add a field'
  });
  assert.match(html, /data-role="tally"/);
  assert.match(html, /data-path="fields"/);
  assert.match(html, /data-key=""/);
  assert.match(html, /data-min="0"/);
  assert.match(html, /data-score-cat="fields"/);
  assert.match(html, /data-count-for="fields:"/);
  assert.match(html, /data-minus-for="fields:"/);
});

test('tallyControl: the minus button is disabled when count <= min, not otherwise', () => {
  const atMin = tallyControl({
    scoreCat: 'fields', path: 'fields', key: '', art: 'field', prefix: '×', min: 0,
    pip: 5, count: 0, label: 'Add a field'
  });
  const aboveMin = tallyControl({
    scoreCat: 'fields', path: 'fields', key: '', art: 'field', prefix: '×', min: 0,
    pip: 5, count: 1, label: 'Add a field'
  });
  const minusAtMin = atMin.match(/<button class="minus"[^>]*>/)[0];
  const minusAboveMin = aboveMin.match(/<button class="minus"[^>]*>/)[0];
  assert.match(minusAtMin, /disabled/);
  assert.doesNotMatch(minusAboveMin, /disabled/);
});

test('tallyControl: renders a pip when o.pip != null, including pip: 0', () => {
  const withPip = tallyControl({
    scoreCat: 'fields', path: 'fields', key: '', art: 'field', prefix: '×', min: 0,
    pip: 5, count: 1, label: 'x'
  });
  assert.match(withPip, /<span class="pip">5<\/span>/);

  const withZeroPip = tallyControl({
    scoreCat: 'fields', path: 'fields', key: '', art: 'field', prefix: '×', min: 0,
    pip: 0, count: 1, label: 'x'
  });
  assert.match(withZeroPip, /<span class="pip">0<\/span>/, 'pip: 0 must render as a pip, not a cap — 0 != null is true');
  assert.doesNotMatch(withZeroPip, /tally-cap/);
});

test('tallyControl: renders tally-cap when o.pip is null', () => {
  const html = tallyControl({
    scoreCat: 'animals', path: 'animals', key: '0', art: 'brown', prefix: '×', min: 0,
    pip: null, cap: '?', count: 1, label: 'x'
  });
  assert.match(html, /<span class="tally-cap">\?<\/span>/);
  assert.doesNotMatch(html, /class="pip"/);
});

// ---- riverLadder ----

test('riverLadder: exactly one rung is "on" for lengths 1-6, matching the length', () => {
  for (let len = 1; len <= 6; len++){
    const html = riverLadder({ river: len });
    const onMatches = html.match(/class="rung on"/g) || [];
    assert.equal(onMatches.length, 1, `length ${len} should light exactly one rung`);
    // the lit rung is the one whose data-rung matches len
    const litRungMatch = html.match(/<span class="rung on" data-rung="(\d+)">/);
    assert.ok(litRungMatch, 'a lit rung should be found');
    assert.equal(Number(litRungMatch[1]), len);
  }
});

test('riverLadder: length >= 7 lights the "7" (+4) rung', () => {
  for (const len of [7, 8, 20]){
    const html = riverLadder({ river: len });
    const onMatches = html.match(/class="rung on"/g) || [];
    assert.equal(onMatches.length, 1);
    const litRungMatch = html.match(/<span class="rung on" data-rung="(\d+)">/);
    assert.equal(Number(litRungMatch[1]), 7);
  }
});

test('riverLadder: length 0 lights no rung', () => {
  const html = riverLadder({ river: 0 });
  const onMatches = html.match(/class="rung on"/g) || [];
  assert.equal(onMatches.length, 0);
});

// ---- tokenArt ----

test('tokenArt: returns an <svg', () => {
  const html = tokenArt('field', 1);
  assert.match(html, /^<svg/);
});

test('tokenArt: stacking height changes the number of discs drawn', () => {
  const countDiscs = (html) => (html.match(new RegExp(`rx="${TOK_RX}"`, 'g')) || []).length;

  const oneMountain = tokenArt('mountain', 1);
  const threeMountains = tokenArt('mountain', 3);
  assert.equal(countDiscs(oneMountain), 1);
  assert.equal(countDiscs(threeMountains), 3);

  const oneTree = tokenArt('tree', 1);
  const threeTrees = tokenArt('tree', 3);
  assert.equal(countDiscs(oneTree), 1);
  assert.equal(countDiscs(threeTrees), 3, 'a height-3 tree is 2 brown discs + 1 tree disc on top');
});

test('tokenArt: height is floored at 1 even for 0 or missing height', () => {
  const countDiscs = (html) => (html.match(new RegExp(`rx="${TOK_RX}"`, 'g')) || []).length;
  assert.equal(countDiscs(tokenArt('field', 0)), 1);
  assert.equal(countDiscs(tokenArt('field')), 1);
});

// sanity: TOK_RY is exported too and used consistently in the ellipse markup
test('tokenArt: uses the exported TOK_RY for the disc ellipse', () => {
  const html = tokenArt('field', 1);
  assert.match(html, new RegExp(`ry="${TOK_RY}"`));
});
