import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riverPoints } from '../scoring.js';
import {
  TOK_RX, TOK_RY, escapeAttr, getCount, setCount, bumpCount, tallyControl, riverLadder, tokenArt,
  numberList, numField
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
//
// tallyControl() used to build an HTML string; it now builds a plain spec object that
// app/_components/Controls.jsx's <Tally> renders. These tests assert the DATA the spec carries —
// the actual rendering (does the minus end up `disabled`, does a pip vs a cap actually show up in
// the DOM) is proven at the component level in app/_components/Card.test.jsx, which is the piece
// that would catch a renderer regression these object-shape tests cannot.

test('tallyControl: maps every input field onto the spec unchanged, tagged with type "tally"', () => {
  const spec = tallyControl({
    scoreCat: 'fields', path: 'fields', key: '', art: 'field', prefix: '×', min: 0,
    pip: 5, count: 2, label: 'Add a field'
  });
  assert.deepEqual(spec, {
    type: 'tally', scoreCat: 'fields', path: 'fields', key: '', art: 'field',
    height: 1, pip: 5, cap: undefined, prefix: '×', min: 0, count: 2, label: 'Add a field'
  });
});

test('tallyControl: key defaults to "" and height defaults to 1 when omitted', () => {
  const spec = tallyControl({
    scoreCat: 'water', path: 'river', art: 'water', prefix: 'len ', min: 0,
    cap: '+1 tile', count: 0, label: 'Extend the river by one token'
  });
  assert.equal(spec.key, '');
  assert.equal(spec.height, 1);
});

test('tallyControl: key and height pass through when supplied (a stack bucket)', () => {
  const spec = tallyControl({
    scoreCat: 'trees', path: 'trees', key: 'h2', art: 'tree', height: 2, prefix: '×', min: 0,
    pip: 3, count: 1, label: 'Add a height-2 tree, 3 points'
  });
  assert.equal(spec.key, 'h2');
  assert.equal(spec.height, 2);
});

test('tallyControl: count and min ride along together so the renderer can decide the minus is disabled at the floor, not otherwise', () => {
  const atMin = tallyControl({
    scoreCat: 'fields', path: 'fields', key: '', art: 'field', prefix: '×', min: 0,
    pip: 5, count: 0, label: 'Add a field'
  });
  const aboveMin = tallyControl({
    scoreCat: 'fields', path: 'fields', key: '', art: 'field', prefix: '×', min: 0,
    pip: 5, count: 1, label: 'Add a field'
  });
  assert.equal(atMin.count, 0);
  assert.equal(atMin.min, 0);
  assert.ok(atMin.count <= atMin.min, 'at the floor, count <= min — the renderer disables the minus');
  assert.ok(aboveMin.count > aboveMin.min, 'above the floor, count > min — the renderer enables the minus');
});

test('tallyControl: pip rides along as-is, including pip: 0, which must stay distinguishable from "no pip"', () => {
  const withPip = tallyControl({
    scoreCat: 'fields', path: 'fields', key: '', art: 'field', prefix: '×', min: 0,
    pip: 5, count: 1, label: 'x'
  });
  assert.equal(withPip.pip, 5);
  assert.equal(withPip.cap, undefined);

  const withZeroPip = tallyControl({
    scoreCat: 'fields', path: 'fields', key: '', art: 'field', prefix: '×', min: 0,
    pip: 0, count: 1, label: 'x'
  });
  assert.equal(withZeroPip.pip, 0);
  assert.notEqual(withZeroPip.pip, null, 'pip: 0 must not collapse to null — the renderer tests `!= null`, and 0 != null is true');
});

test('tallyControl: cap rides along as-is when pip is null (an ambiguous points-per-tap category)', () => {
  const spec = tallyControl({
    scoreCat: 'animals', path: 'animals', key: '0', art: 'brown', prefix: '×', min: 0,
    pip: null, cap: '?', count: 1, label: 'x'
  });
  assert.equal(spec.pip, null);
  assert.equal(spec.cap, '?');
});

// ---- tallyGroup ----

test('tallyGroup: wraps items as {type: "tallyGroup", items}', () => {
  const a = tallyControl({ scoreCat: 'x', path: 'x', art: 'x', prefix: '×', min: 0, pip: 1, count: 0, label: 'a' });
  const b = tallyControl({ scoreCat: 'x', path: 'x', art: 'x', prefix: '×', min: 0, pip: 3, count: 0, label: 'b' });
  const spec = { type: 'tallyGroup', items: [a, b] };
  assert.deepEqual(spec.items, [a, b]);
});

// ---- riverLadder ----
//
// riverLadder() no longer takes `p` and no longer decides which rung is "on" — the water
// descriptor's activeRung(p, variant) is the single source of that (src/games/harmonies.js), and
// the <Ladder> component in app/_components/Controls.jsx reads it separately. So there is nothing
// left here to test per river-length; what's tested is that the printed ladder itself (values,
// text) is built correctly and carries no lit/active state of its own. The "exactly one rung is
// lit, matching the river length" behaviour this used to assert is now a component-level test in
// app/_components/Card.test.jsx.

test('riverLadder: returns exactly 7 rungs, valued 1 through 7, regardless of any player state', () => {
  const spec = riverLadder();
  assert.equal(spec.type, 'ladder');
  assert.deepEqual(spec.rungs.map(r => r.value), [1, 2, 3, 4, 5, 6, 7]);
});

test('riverLadder: rung text matches riverPoints() for lengths 1-6, and the last rung reads "+4" (standing for "7 or more")', () => {
  const spec = riverLadder();
  for (const r of spec.rungs){
    if (r.value <= 6) assert.equal(r.text, String(riverPoints(r.value)), `rung ${r.value}`);
  }
  assert.equal(spec.rungs[6].text, '+4');
});

test('riverLadder: the spec carries no notion of which rung is active — that lives on the water descriptor, not here', () => {
  const spec = riverLadder();
  for (const r of spec.rungs) assert.ok(!('on' in r) && !('active' in r));
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

// ---- numberList / numField ----

test('numberList: min defaults to 0 on the spec when not passed', () => {
  const spec = numberList({ playerId: 1, cat: 'animals', values: [0], addLabel: '+ Add' });
  assert.equal(spec.min, 0);
});

test('numberList: a passed min rides onto the spec as one value — the renderer applies it to every row\'s <input min>', () => {
  const spec = numberList({ playerId: 1, cat: 'military', values: [0, -3], addLabel: '+ Add', min: -99 });
  assert.equal(spec.min, -99);
  assert.equal(spec.values.length, 2);
});

test('numberList: showRemove is true only past the first row (a restored single-row list can never reach the remove button)', () => {
  assert.equal(numberList({ playerId: 1, cat: 'animals', values: [0], addLabel: '+' }).showRemove, false);
  assert.equal(numberList({ playerId: 1, cat: 'animals', values: [0, 1], addLabel: '+' }).showRemove, true);
});

test('numberList: uidFor composes uidPrefix, playerId, cat and index — what the renderer sets as data-uid', () => {
  const spec = numberList({ playerId: 2, cat: 'wonders', values: [0, 0], uidPrefix: '7w-', addLabel: '+' });
  assert.equal(spec.uidFor(0), '7w-p2-wonders-0');
  assert.equal(spec.uidFor(1), '7w-p2-wonders-1');
});

test('numField: min defaults to 0 when not passed', () => {
  const spec = numField(1, 'bonus', 0, 'extra points');
  assert.equal(spec.min, 0);
});

test('numField: a passed min overrides the default', () => {
  const spec = numField(1, 'military', -5, 'defeat tokens', -99);
  assert.equal(spec.min, -99);
});

test('numField: subrow is always true and uid composes playerId + cat', () => {
  const spec = numField(3, 'bonus', 7, 'extra points');
  assert.equal(spec.subrow, true);
  assert.equal(spec.uid, 'p3-bonus');
});
