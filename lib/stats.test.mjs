import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStreaks } from './stats.mjs';

// Rows must arrive person_id-grouped, most-recent-game-first within each person — computeStreaks()
// trusts that ordering rather than re-sorting, so these fixtures are written in exactly that shape.

test('an all-win run streaks positive, counting every game', () => {
  const rows = [
    { personId: 1, isWinner: true },
    { personId: 1, isWinner: true },
    { personId: 1, isWinner: true },
  ];
  assert.deepEqual(computeStreaks(rows), { 1: 3 });
});

test('an all-loss run streaks negative', () => {
  const rows = [
    { personId: 1, isWinner: false },
    { personId: 1, isWinner: false },
  ];
  assert.deepEqual(computeStreaks(rows), { 1: -2 });
});

test('the streak stops at the first result that breaks it, going backward from most recent', () => {
  // Most recent two games were wins, then a loss, then two more wins — the streak is 2, not 5 and
  // not oscillating; games before the break cannot extend a streak that already ended.
  const rows = [
    { personId: 1, isWinner: true },
    { personId: 1, isWinner: true },
    { personId: 1, isWinner: false },
    { personId: 1, isWinner: true },
    { personId: 1, isWinner: true },
  ];
  assert.deepEqual(computeStreaks(rows), { 1: 2 });
});

test('a single game is a streak of length 1, signed by its result', () => {
  assert.deepEqual(computeStreaks([{ personId: 1, isWinner: true }]), { 1: 1 });
  assert.deepEqual(computeStreaks([{ personId: 1, isWinner: false }]), { 1: -1 });
});

test('multiple people are tracked independently, in one pass over interleaved-by-group rows', () => {
  const rows = [
    { personId: 1, isWinner: true },
    { personId: 1, isWinner: true },
    { personId: 2, isWinner: false }, // person 2's most recent game: a loss
    { personId: 2, isWinner: false }, // extends the loss streak to 2
    { personId: 2, isWinner: true },  // older game, breaks it — cannot affect the streak already set
  ];
  assert.deepEqual(computeStreaks(rows), { 1: 2, 2: -2 });
});

test('no rows produces no streaks', () => {
  assert.deepEqual(computeStreaks([]), {});
});
