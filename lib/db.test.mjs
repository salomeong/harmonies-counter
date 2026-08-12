import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, isDefaultName, normalizeGame, GAMES } from './db.mjs';

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
