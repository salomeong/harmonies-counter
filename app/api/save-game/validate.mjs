// The pure half of POST /api/save-game — no DB access, no `next/server` import (which cannot
// resolve outside Next's own module resolution, so a route.js importing it can't be `node --test`ed
// directly; see validate.test.mjs's header comment). Pulled out for the same reason lib/stats.mjs
// pulls computeStreaks() out of its SQL-fetching function: testable on its own, no framework in
// the loop.

import { normalizeName, isDefaultName, normalizeGame, normalizeEndedBy,
         PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH } from '../../../lib/db.mjs';
import { getGame } from '../../../src/games/index.js';

export const MAX_PLAYERS = 8; // generous upper bound — every game in GAMES tops out at 7 (7 Wonders)

export function validate(body) {
  const errors = [];

  const game = normalizeGame(body?.game);
  if (!game) errors.push('invalid_game');

  const endedBy = body?.endedBy === undefined ? 'score' : normalizeEndedBy(body.endedBy);
  if (!endedBy) errors.push('invalid_ended_by');
  // A supremacy ending is only meaningful for a game whose descriptor actually declares the
  // shared military track (today, only 7 Wonders Duel does — see game.militaryZones in
  // src/games/sevenwondersduel.js). Nothing else ties `endedBy` to a specific game, and this app
  // has no auth, so without this check any client could mint a fabricated win (total_score NULL,
  // is_winner true) for ANY game just by POSTing a supremacy endedBy — found by adversarial review
  // and reproduced live against the real database before this fix landed (2026-08-18). The API is
  // the actual trust boundary; SupremacyDialog only rendering when game.militaryZones is set
  // (app/page.jsx) is a UI convenience, not something this can rely on for correctness.
  if (game && endedBy && endedBy !== 'score' && !getGame(game)?.militaryZones) {
    errors.push('unsupported_ended_by');
  }

  const variant = (body?.variant && typeof body.variant === 'object' && !Array.isArray(body.variant))
    ? body.variant
    : {};

  const requestedPublicId = typeof body?.publicId === 'string' ? body.publicId.trim() : '';
  const publicIdPattern = new RegExp(`^[${PUBLIC_ID_ALPHABET}]{${PUBLIC_ID_LENGTH}}$`);
  if (requestedPublicId && !publicIdPattern.test(requestedPublicId)) errors.push('invalid_public_id');

  const rawPlayers = Array.isArray(body?.players) ? body.players : null;
  if (!rawPlayers || rawPlayers.length === 0) errors.push('missing_players');
  if (rawPlayers && rawPlayers.length > MAX_PLAYERS) errors.push('too_many_players');

  const players = [];
  const seenSeats = new Set();

  if (rawPlayers && errors.length === 0) {
    rawPlayers.forEach((entry, i) => {
      const seat = Number.isInteger(entry?.seat) ? entry.seat : i;
      if (seenSeats.has(seat)) { errors.push(`duplicate_seat_${seat}`); return; }
      seenSeats.add(seat);

      const rawName = typeof entry?.name === 'string' ? entry.name : '';
      const trimmed = rawName.trim() || `Player ${seat + 1}`;

      let total = null;
      if (endedBy === 'score') {
        // Require a genuine number. Number(null), Number("") and Number([]) are all 0, so a client
        // that failed to compute a score would otherwise be recorded as a legitimate zero — and a
        // wrong number in the ledger is worse than a rejected save.
        if (typeof entry?.total !== 'number' && typeof entry?.total !== 'string') {
          errors.push(`invalid_total_seat_${seat}`); return;
        }
        total = Number(entry.total);
        if (!Number.isFinite(total)) { errors.push(`invalid_total_seat_${seat}`); return; }
        total = Math.trunc(total);
        // total_score is int4; out-of-range would fail at insert time as an opaque 500.
        if (total < -2147483648 || total > 2147483647) {
          errors.push(`total_out_of_range_seat_${seat}`); return;
        }
      }
      // total stays null for a supremacy ending — schema.sql documents NULL as meaning exactly
      // this ("NULL when ended_by <> 'score'"), so there is nothing more to validate here.

      // Arrays are excluded for the same reason `variant` excludes them: JSONB would accept one,
      // but every real caller sends the object scorer.detail() builds, so anything else is a bug
      // worth surfacing rather than storing.
      //
      // A supremacy ending forces detail to {} regardless of what the client sends: the game
      // stopped before a Civilian Victory tally was ever meaningful, so whatever partial board
      // state a client might attach is not "raw entered state" in the sense every other detail
      // blob is — there is no finished score for it to be the raw form of. Recap.jsx never reads
      // detail for a null-total row (see CLAUDE.md's "7 Wonders Duel" section), so this also isn't
      // silently discarding something anything downstream would have used.
      const detail = endedBy === 'score' && entry?.detail && typeof entry.detail === 'object' && !Array.isArray(entry.detail)
        ? entry.detail
        : {};

      players.push({ seat, displayName: trimmed, total, detail, isGuest: isDefaultName(trimmed) });
    });
  }

  // A supremacy ending has no totals to determine a winner from, so the client must say who won
  // directly. Validated against the actual submitted seats (not just "is it a number") so a typo
  // or a stale seat from a since-removed player fails loudly rather than crowning nobody.
  let winnerSeat = null;
  if (errors.length === 0 && endedBy !== 'score') {
    const candidate = Number.isInteger(body?.winnerSeat) ? body.winnerSeat : null;
    if (candidate === null || !players.some(p => p.seat === candidate)) {
      errors.push('invalid_winner_seat');
    } else {
      winnerSeat = candidate;
    }
  }

  return { game, endedBy, variant, players, requestedPublicId, winnerSeat, errors };
}
