// Aggregate queries for the /stats/[game] page. Kept separate from lib/session.mjs, which is about
// ONE session; everything here reads across many.
//
// Per docs/ledger.md's seam — "anything you rank, filter or aggregate across games is a real
// column; anything you only display inside its own game's context is detail JSONB" — win rate,
// streak and head-to-head are real-column aggregates (is_winner, total_score) and stay pure SQL.
// Per-category bests are NOT: they live inside detail's JSONB, so getDetailRowsForStats() below
// just returns the raw rows, and the /stats page itself does the reduction with the same
// scorer.fromDetail() the recap route uses. That's a genuine scaling limit (every row, every
// load) — see docs/ledger.md's note on promoting this to a column if it ever gets slow.

import { getSql } from './db.mjs';

// One row per named person who has played this game at least once.
export async function getWinRates(gameKey) {
  const sql = getSql();
  return sql`
    SELECT pe.id, pe.display_name AS "displayName",
           count(*)::int AS "gamesPlayed",
           count(*) FILTER (WHERE sp.is_winner)::int AS wins
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    JOIN people pe ON pe.id = sp.person_id
    WHERE s.game_key = ${gameKey}
    GROUP BY pe.id, pe.display_name
    ORDER BY wins DESC, "gamesPlayed" DESC, "displayName" ASC
  `;
}

// The pure half of getStreaks(), pulled out so it's testable under `node --test` without a
// database: how many of each person's most recent games in a row were all wins (positive) or all
// losses (negative). `rows` must already be ordered person_id, then most-recent-game-first — this
// makes no attempt to sort them itself, so a caller that gets the ordering wrong gets visibly wrong
// streaks rather than a silent, differently-wrong answer.
export function computeStreaks(rows) {
  const streaks = {};
  let current = null;
  for (const row of rows) {
    if (!current || current.personId !== row.personId) {
      current = { personId: row.personId, value: row.isWinner ? 1 : -1, broken: false };
      streaks[row.personId] = current.value;
      continue;
    }
    if (current.broken) continue; // this person's streak already ended; nothing older can revive it

    const sameDirection = (current.value > 0) === row.isWinner;
    if (!sameDirection) {
      // The streak ends here. Marking it broken (not just skipping this one row) matters: without
      // it, a later row that happens to match the ORIGINAL direction would silently resume
      // extending a streak that already ended — e.g. win, win, LOSS, win, win must stay at "2",
      // not creep back up to "4" once the walk passes the loss.
      current.broken = true;
      continue;
    }
    current.value += current.value > 0 ? 1 : -1;
    streaks[row.personId] = current.value;
  }
  return streaks;
}

// The current streak for one person — see computeStreaks() for the actual rule. Computed in JS
// over ordered rows rather than a SQL window function; the ordering-then-walk is the same either
// way, and this reads more plainly.
export async function getStreaks(gameKey, personIds) {
  if (!personIds.length) return {};
  const sql = getSql();
  const rows = await sql`
    SELECT sp.person_id AS "personId", sp.is_winner AS "isWinner"
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE s.game_key = ${gameKey} AND sp.person_id = ANY(${personIds})
    ORDER BY sp.person_id, s.played_at DESC
  `;
  return computeStreaks(rows);
}

// One row per unordered pair of named people who have shared a session for this game.
// `b.person_id > a.person_id` is what dedupes A-vs-B from B-vs-A and excludes a self-pair.
export async function getHeadToHead(gameKey) {
  const sql = getSql();
  return sql`
    SELECT a.person_id AS "aId", pa.display_name AS "aName",
           b.person_id AS "bId", pb.display_name AS "bName",
           count(*)::int AS games,
           count(*) FILTER (WHERE a.is_winner AND NOT b.is_winner)::int AS "aWins",
           count(*) FILTER (WHERE b.is_winner AND NOT a.is_winner)::int AS "bWins"
    FROM session_players a
    JOIN session_players b ON b.session_id = a.session_id AND b.person_id > a.person_id
    JOIN sessions s ON s.id = a.session_id
    JOIN people pa ON pa.id = a.person_id
    JOIN people pb ON pb.id = b.person_id
    WHERE s.game_key = ${gameKey}
    GROUP BY a.person_id, pa.display_name, b.person_id, pb.display_name
    ORDER BY games DESC, "aName" ASC
  `;
}

// Raw material for per-category bests — see the file header for why this isn't a SQL aggregate.
// `sp.seat` breaks ties deterministically: without it, which name a 0-0 tied category attaches to
// is whatever order Postgres happens to return same-session rows in, not a real decision.
export async function getDetailRowsForStats(gameKey) {
  const sql = getSql();
  return sql`
    SELECT s.public_id AS "sessionId", sp.display_name AS "displayName", sp.detail, s.variant
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE s.game_key = ${gameKey}
    ORDER BY s.played_at DESC, sp.seat ASC
  `;
}
