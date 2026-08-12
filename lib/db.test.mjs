import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeName, isDefaultName, normalizeGame, GAMES,
  normalizeEndedBy, ENDED_BY, ACCEPTED_ENDED_BY, makePublicId, PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH
} from './db.mjs';

// ---- normalizeName ----

test('normalizeName: collapses internal whitespace runs to a single space', () => {
  assert.equal(normalizeName('Max   Chan'), 'max chan');
  assert.equal(normalizeName('Max\t\tChan'), 'max chan');
});

test('normalizeName: trims leading/trailing whitespace', () => {
  assert.equal(normalizeName('  Max  '), 'max');
});

test('normalizeName: lowercases', () => {
  assert.equal(normalizeName('MAX'), 'max');
});

test('normalizeName: null/undefined/empty become an empty string', () => {
  assert.equal(normalizeName(null), '');
  assert.equal(normalizeName(undefined), '');
  assert.equal(normalizeName(''), '');
});

// ---- isDefaultName ----

test('isDefaultName: matches "Player 1"', () => {
  assert.equal(isDefaultName('Player 1'), true);
});

test('isDefaultName: matches "player  2" (extra internal whitespace, different case)', () => {
  assert.equal(isDefaultName('player  2'), true);
});

test('isDefaultName: matches with surrounding whitespace', () => {
  assert.equal(isDefaultName('  Player 3  '), true);
});

test('isDefaultName: does not match "Playerton"', () => {
  assert.equal(isDefaultName('Playerton'), false);
});

test('isDefaultName: does not match a real name or a name with no number', () => {
  assert.equal(isDefaultName('Max'), false);
  assert.equal(isDefaultName('Player'), false);
  assert.equal(isDefaultName(''), false);
});

// ---- normalizeGame ----

test('normalizeGame: allows every game in the GAMES allowlist', () => {
  for (const g of GAMES){
    assert.equal(normalizeGame(g), g);
  }
});

test('normalizeGame: is case-insensitive and trims whitespace', () => {
  assert.equal(normalizeGame('HARMONIES'), 'harmonies');
  assert.equal(normalizeGame('  faraway  '), 'faraway');
});

test('normalizeGame: returns null for an unknown game', () => {
  assert.equal(normalizeGame('monopoly'), null);
  assert.equal(normalizeGame(''), null);
  assert.equal(normalizeGame(undefined), null);
});

// ---- normalizeEndedBy ----

test('normalizeEndedBy: allows every value the API currently accepts', () => {
  for (const e of ACCEPTED_ENDED_BY) {
    assert.equal(normalizeEndedBy(e), e);
  }
});

test('normalizeEndedBy: is case-insensitive and trims whitespace', () => {
  assert.equal(normalizeEndedBy('SCORE'), 'score');
  assert.equal(normalizeEndedBy('  score  '), 'score');
});

// The column supports all three endings, but the API rejects the supremacy ones for now: nothing
// in the payload says WHO won a game that ended without scores, so accepting one would write a
// session where every seat has is_winner = false. Fail closed until a winnerSeat exists.
test('normalizeEndedBy: rejects supremacy endings the payload cannot describe a winner for', () => {
  assert.equal(normalizeEndedBy('military_supremacy'), null);
  assert.equal(normalizeEndedBy('scientific_supremacy'), null);
  assert.ok(ENDED_BY.includes('military_supremacy'),
    'the column-level vocabulary still documents them for when Duel lands');
});

test('normalizeEndedBy: returns null for an unknown value', () => {
  assert.equal(normalizeEndedBy('time_out'), null);
  assert.equal(normalizeEndedBy(''), null);
  assert.equal(normalizeEndedBy(undefined), null);
});

// ---- makePublicId ----

test('makePublicId: defaults to PUBLIC_ID_LENGTH characters', () => {
  assert.equal(makePublicId().length, PUBLIC_ID_LENGTH);
  assert.equal(PUBLIC_ID_LENGTH, 10);
});

test('makePublicId: honors an explicit length', () => {
  assert.equal(makePublicId(4).length, 4);
  assert.equal(makePublicId(20).length, 20);
});

test('makePublicId: every character comes from PUBLIC_ID_ALPHABET', () => {
  for (let i = 0; i < 200; i++) {
    const id = makePublicId();
    for (const ch of id) {
      assert.ok(PUBLIC_ID_ALPHABET.includes(ch), `unexpected character ${ch} in ${id}`);
    }
  }
});

test('makePublicId: never contains ambiguous characters (0, O, 1, l, I)', () => {
  const ambiguous = /[0O1lI]/;
  for (let i = 0; i < 200; i++) {
    const id = makePublicId();
    assert.equal(ambiguous.test(id), false, `${id} contains an ambiguous character`);
  }
});

test('makePublicId: PUBLIC_ID_ALPHABET itself contains none of the ambiguous characters', () => {
  const ambiguous = /[0O1lI]/;
  assert.equal(ambiguous.test(PUBLIC_ID_ALPHABET), false);
});

test('makePublicId: repeated calls are not obviously constant (extremely unlikely to collide twice)', () => {
  const ids = new Set();
  for (let i = 0; i < 200; i++) ids.add(makePublicId());
  assert.equal(ids.size, 200);
});
