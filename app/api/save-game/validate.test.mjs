// Coverage for validate.mjs — pulled out of route.js specifically so it's DB/framework-free and
// testable (no existing route in this app has a test file; route.js itself can't be `node --test`ed
// because its `next/server` import doesn't resolve outside Next's own module resolution).
//
// Focus: the winnerSeat plumbing that lets a 7 Wonders Duel supremacy ending save at all — see
// lib/db.mjs's ENDED_BY/ACCEPTED_ENDED_BY comment and CLAUDE.md's "7 Wonders Duel" section for why
// this was deliberately rejected until now.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from './validate.mjs';

function scoreBody(overrides = {}){
  return {
    game: '7wonders',
    endedBy: 'score',
    players: [
      { name: 'Alice', seat: 0, total: 42, detail: { treasury: 5 } },
      { name: 'Bob', seat: 1, total: 30, detail: { treasury: 2 } }
    ],
    ...overrides
  };
}

function supremacyBody(overrides = {}){
  return {
    game: '7wondersduel',
    endedBy: 'military_supremacy',
    winnerSeat: 0,
    players: [
      { name: 'Alice', seat: 0 },
      { name: 'Bob', seat: 1 }
    ],
    ...overrides
  };
}

// ---- Sanity: 'score' endings are unaffected by this change ----

test("validate: a 'score' ending still requires a real total per seat", () => {
  const { errors } = validate(scoreBody());
  assert.deepEqual(errors, []);
});

test("validate: a 'score' ending rejects a missing/non-numeric total, unaffected by winnerSeat existing now", () => {
  const { errors } = validate(scoreBody({ players: [{ name: 'Alice', seat: 0 }] }));
  assert.ok(errors.includes('invalid_total_seat_0'));
});

// ---- Supremacy endings: winnerSeat required and validated against real seats ----

test('validate: a supremacy ending with a valid winnerSeat passes, with every total left null', () => {
  const { errors, players, winnerSeat, endedBy } = validate(supremacyBody());
  assert.deepEqual(errors, []);
  assert.equal(endedBy, 'military_supremacy');
  assert.equal(winnerSeat, 0);
  assert.ok(players.every(p => p.total === null), 'total must stay null for every seat, not just the loser');
});

test('validate: scientific_supremacy is accepted the same way as military_supremacy', () => {
  const { errors, endedBy } = validate(supremacyBody({ endedBy: 'scientific_supremacy' }));
  assert.deepEqual(errors, []);
  assert.equal(endedBy, 'scientific_supremacy');
});

test('validate: a supremacy ending with no winnerSeat at all is rejected', () => {
  const body = supremacyBody();
  delete body.winnerSeat;
  const { errors } = validate(body);
  assert.ok(errors.includes('invalid_winner_seat'));
});

test('validate: a supremacy ending whose winnerSeat does not match any submitted seat is rejected', () => {
  const { errors } = validate(supremacyBody({ winnerSeat: 7 }));
  assert.ok(errors.includes('invalid_winner_seat'));
});

test('validate: a non-integer winnerSeat (string, float, null) is rejected', () => {
  for (const bad of ['0', 0.5, null, undefined, {}]) {
    const { errors } = validate(supremacyBody({ winnerSeat: bad }));
    assert.ok(errors.includes('invalid_winner_seat'), `winnerSeat ${JSON.stringify(bad)} should be rejected`);
  }
});

test('validate: a supremacy ending does not require entry.total at all — omitting it is not an error', () => {
  const { errors } = validate(supremacyBody({
    players: [{ name: 'Alice', seat: 0 }, { name: 'Bob', seat: 1 }] // no `total` key on either
  }));
  assert.deepEqual(errors, []);
});

// ---- detail is forced to {} for a supremacy ending, regardless of what the client sends ----

test('validate: detail is forced to {} on a supremacy ending even if the client attaches one', () => {
  const { players } = validate(supremacyBody({
    players: [
      { name: 'Alice', seat: 0, detail: { civilian: [1, 2, 3] } },
      { name: 'Bob', seat: 1, detail: { civilian: [4] } }
    ]
  }));
  assert.deepEqual(players[0].detail, {});
  assert.deepEqual(players[1].detail, {});
});

test('validate: detail is preserved as sent for a real score ending', () => {
  const { players } = validate(scoreBody());
  assert.deepEqual(players[0].detail, { treasury: 5 });
});

// ---- winnerSeat is irrelevant (and ignored) for a normal score ending ----

test('validate: a stray winnerSeat on a score-ending payload is simply ignored, not an error', () => {
  const { errors, winnerSeat } = validate(scoreBody({ winnerSeat: 0 }));
  assert.deepEqual(errors, []);
  assert.equal(winnerSeat, null);
});

// ---- A supremacy ending is rejected for any game that doesn't declare militaryZones ----
//
// Regression test for a real bug an adversarial review found and reproduced live against the
// shared production database (2026-08-18): without this check, a supremacy endedBy fabricated a
// scoreless "win" (total_score NULL, is_winner true) for ANY game, not just 7 Wonders Duel — the
// app has no auth, so the API itself is the only real trust boundary, not SupremacyDialog only
// rendering when game.militaryZones is set.

test('validate: a supremacy ending is rejected for a game with no militaryZones (harmonies, faraway, 7wonders)', () => {
  for (const game of ['harmonies', 'faraway', '7wonders']) {
    for (const endedBy of ['military_supremacy', 'scientific_supremacy']) {
      const { errors } = validate(supremacyBody({ game, endedBy }));
      assert.ok(errors.includes('unsupported_ended_by'),
        `${game}/${endedBy} should be rejected, got errors: ${JSON.stringify(errors)}`);
    }
  }
});

test('validate: a supremacy ending is still accepted for 7wondersduel, which does declare militaryZones', () => {
  const { errors } = validate(supremacyBody());
  assert.deepEqual(errors, []);
});

test('validate: an unsupported-game supremacy ending does not also require a valid winnerSeat — one clear error, not two confusing ones', () => {
  const body = supremacyBody({ game: 'harmonies' });
  delete body.winnerSeat;
  const { errors } = validate(body);
  assert.deepEqual(errors, ['unsupported_ended_by']);
});
