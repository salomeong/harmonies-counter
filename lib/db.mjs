import { neon } from '@neondatabase/serverless';
import { randomInt } from 'node:crypto';

let _sql;
export function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

export function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isDefaultName(name) {
  return /^Player\s+\d+$/i.test(String(name || '').trim());
}

export const GAMES = ['harmonies', 'faraway', '7wonders', '7wondersduel'];

export function normalizeGame(game) {
  const g = String(game || '').trim().toLowerCase();
  return GAMES.includes(g) ? g : null;
}

// How a session ended. 'score' is the ordinary end-of-game tally; the other two are 7 Wonders
// Duel's instant-win conditions (no total_score is meaningful, so session_players.total_score
// stays NULL for those rows — see schema.sql).
// A supremacy ending REQUIRES `winnerSeat` in the save-game payload (app/api/save-game/route.js's
// validate()) — nothing else in the payload says who won a game with no scores counted, and
// accepting one without a winner would silently write a session where is_winner is false for
// every seat. That's what kept these out of ACCEPTED_ENDED_BY until winnerSeat was threaded
// through the client, this validator and the insert (2026-08-18).
export const ENDED_BY = ['score', 'military_supremacy', 'scientific_supremacy'];
export const ACCEPTED_ENDED_BY = ['score', 'military_supremacy', 'scientific_supremacy'];

export function normalizeEndedBy(endedBy) {
  const e = String(endedBy || '').trim().toLowerCase();
  return ACCEPTED_ENDED_BY.includes(e) ? e : null;
}

// Excludes 0/O/1/l/I — every character left is unambiguous at a glance, which matters because a
// public_id is meant to be read off a screen and typed or read aloud, not just round-tripped by
// machines.
export const PUBLIC_ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
export const PUBLIC_ID_LENGTH = 10;

// Server-generated so a client can never choose or collide a session's public id. randomInt()
// (not Math.random() % n) is what keeps this unbiased across the alphabet — it rejection-samples
// internally rather than introducing modulo bias.
export function makePublicId(length = PUBLIC_ID_LENGTH) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PUBLIC_ID_ALPHABET[randomInt(PUBLIC_ID_ALPHABET.length)];
  }
  return out;
}
