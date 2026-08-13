// POST /api/save-game — the one atomic write in the app. A session (the whole table's result) is
// recorded in a single sql.transaction() so the people upsert, the session row and every player's
// row either all land or none do — no partial ledger entries.
//
// The neon HTTP driver has no interactive transactions (no mid-transaction round trip to read back
// an inserted id), so `public_id` is generated here in the handler BEFORE the transaction starts,
// and the later statements resolve the session by that id instead of by a freshly-returned one.
//
// Guests are recorded, not dropped: a 4-player game must produce 4 session_players rows or the
// session misrepresents what happened. Only NAMED players (not blank, not "Player N") get a
// `people` row and therefore show up in leaderboards/history; unnamed/default-named players still
// get a session_players row with person_id = NULL.
import { NextResponse } from 'next/server';
import { getSql, normalizeName, isDefaultName, normalizeGame, normalizeEndedBy, makePublicId } from '../../../lib/db.mjs';

// This route reads process.env.DATABASE_URL through the lazy getSql() below — force-dynamic keeps
// Next from trying to evaluate (and cache) it at `next build` time, when there is no database.
export const dynamic = 'force-dynamic';

// Method routing (POST vs everything else) is now handled by App Router itself — a request with
// any other method gets Next's automatic 405 response, so the manual `req.method !== 'POST'` check
// that used to open this handler is gone.

const MAX_PLAYERS = 8; // generous upper bound — every game in GAMES tops out at 7 (7 Wonders)

function validate(body) {
  const errors = [];

  const game = normalizeGame(body?.game);
  if (!game) errors.push('invalid_game');

  const endedBy = body?.endedBy === undefined ? 'score' : normalizeEndedBy(body.endedBy);
  if (!endedBy) errors.push('invalid_ended_by');

  const variant = (body?.variant && typeof body.variant === 'object' && !Array.isArray(body.variant))
    ? body.variant
    : {};

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

      // Arrays are excluded for the same reason `variant` excludes them: JSONB would accept one,
      // but every real caller sends the object scorer.detail() builds, so anything else is a bug
      // worth surfacing rather than storing.
      const detail = (entry?.detail && typeof entry.detail === 'object' && !Array.isArray(entry.detail))
        ? entry.detail
        : {};

      players.push({ seat, displayName: trimmed, total, detail, isGuest: isDefaultName(trimmed) });
    });
  }

  return { game, endedBy, variant, players, errors };
}

export async function POST(request) {
  // The original relied on Vercel parsing `req.body` for us. App Router hands us the raw Request,
  // so we parse it ourselves — and a malformed or absent JSON body must fail the same way bad
  // field values already do (400 invalid_request), not throw an unhandled exception. An empty/
  // unparsable body is treated like `{}`: it falls through to the same field-level validation
  // below and comes back with the same `invalid_game` / `missing_players` style details.
  let body;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  const { game, endedBy, variant, players, errors } = validate(body);
  if (errors.length) {
    return NextResponse.json({ error: 'invalid_request', details: errors }, { status: 400 });
  }

  try {
    // getSql() is called inside this try (unlike a bare `sql = getSql()` before it) purely so a
    // missing DATABASE_URL — which it throws for by design, see lib/db.mjs — lands in the same
    // `server_error` JSON response as every other failure here, instead of escaping as an
    // unhandled rejection. It still throws at call time, not at module load.
    const sql = getSql();

    // ---- Named players: dedupe by name_key up front ----
    // A single INSERT ... ON CONFLICT can't affect the same conflict target twice, so two players
    // sharing a name_key (same person seated twice, or two guests both manually typed the exact
    // same real name) must collapse to one row before it reaches unnest(). Last one wins, same as
    // ON CONFLICT DO UPDATE would do across separate statements.
    const namedByKey = new Map();
    for (const p of players) {
      if (p.isGuest) continue;
      namedByKey.set(normalizeName(p.displayName), p.displayName);
    }
    const peopleKeys = [...namedByKey.keys()];
    const peopleNames = [...namedByKey.values()];

    // ---- Celebration + is_winner, both computed BEFORE the write ----
    // "Celebration" = this total beats that person's previous best *for this game*, using
    // MAX(total_score) as it stood right before this insert. This is a read-then-write across two
    // separate HTTP round trips (no interactive transaction available), so it is NOT race-free: two
    // concurrent saves for the same person can both read the same previous high and both report a
    // celebration, even if only one (or neither) actually ends up the new max. See the report for
    // more on this.
    let previousHighByKey = new Map();
    if (endedBy === 'score' && peopleKeys.length) {
      const rows = await sql`
        SELECT pe.name_key AS key, MAX(sp.total_score) AS "highScore"
        FROM people pe
        JOIN session_players sp ON sp.person_id = pe.id
        JOIN sessions s ON s.id = sp.session_id
        WHERE pe.name_key = ANY(${peopleKeys}::text[]) AND s.game_key = ${game}
        GROUP BY pe.name_key
      `;
      previousHighByKey = new Map(rows.map(r => [r.key, r.highScore == null ? null : Number(r.highScore)]));
    }

    const maxTotal = endedBy === 'score' ? Math.max(...players.map(p => p.total)) : null;

    // ---- Generate public_id and run the atomic write ----
    // Collision odds are astronomically low (54^10 combinations), but the retry loop below costs
    // nothing and turns a freak collision into a fresh id instead of a 500.
    const seats = players.map(p => p.seat);
    const nameKeys = players.map(p => (p.isGuest ? null : normalizeName(p.displayName)));
    const displayNames = players.map(p => p.displayName);
    const totals = players.map(p => p.total);
    const isWinners = players.map(p => endedBy === 'score' && p.total === maxTotal);
    const detailsJson = players.map(p => JSON.stringify(p.detail));

    let publicId;
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      publicId = makePublicId();
      try {
        await sql.transaction([
          sql`
            INSERT INTO people (name_key, display_name)
            SELECT * FROM unnest(${peopleKeys}::text[], ${peopleNames}::text[])
            ON CONFLICT (name_key) DO UPDATE SET display_name = EXCLUDED.display_name
          `,
          sql`
            INSERT INTO sessions (public_id, game_key, rules_version, variant, ended_by)
            VALUES (${publicId}, ${game}, 1, ${JSON.stringify(variant)}::jsonb, ${endedBy})
          `,
          sql`
            INSERT INTO session_players (session_id, person_id, seat, display_name, total_score, is_winner, detail)
            SELECT s.id, pe.id, x.seat, x.display_name, x.total, x.is_winner, x.detail::jsonb
            FROM sessions s
            CROSS JOIN unnest(
              ${seats}::smallint[],
              ${nameKeys}::text[],
              ${displayNames}::text[],
              ${totals}::integer[],
              ${isWinners}::boolean[],
              ${detailsJson}::text[]
            ) AS x(seat, name_key, display_name, total, is_winner, detail)
            LEFT JOIN people pe ON pe.name_key = x.name_key
            WHERE s.public_id = ${publicId}
          `
        ]);
        break; // success
      } catch (err) {
        const isPublicIdCollision = err && err.code === '23505' && /public_id/.test(String(err.detail || err.message || ''));
        if (isPublicIdCollision && attempt < MAX_ATTEMPTS) continue;
        throw err;
      }
    }

    const saved = players.map(p => ({
      key: p.isGuest ? null : normalizeName(p.displayName),
      displayName: p.displayName,
      total: p.total
    }));

    const celebrations = [];
    if (endedBy === 'score') {
      for (const p of players) {
        if (p.isGuest) continue;
        const key = normalizeName(p.displayName);
        const previousHigh = previousHighByKey.get(key);
        if (previousHigh != null && p.total > previousHigh) {
          celebrations.push({ key, displayName: p.displayName, total: p.total, previousHigh });
        }
      }
    }

    return NextResponse.json({ publicId, saved, celebrations }, { status: 200 });
  } catch (err) {
    console.error('POST /api/save-game failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
