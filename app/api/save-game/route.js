// POST /api/save-game — the one atomic score write in the app. The first request creates a session;
// later requests carrying its publicId preserve that session/share URL and replace its player rows.
// Both paths use one sql.transaction(), so people/session/player changes all land or none do.
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
import { getSql, normalizeName, makePublicId } from '../../../lib/db.mjs';
import { validate } from './validate.mjs';

// This route reads process.env.DATABASE_URL through the lazy getSql() below — force-dynamic keeps
// Next from trying to evaluate (and cache) it at `next build` time, when there is no database.
export const dynamic = 'force-dynamic';

// Method routing (POST vs everything else) is now handled by App Router itself — a request with
// any other method gets Next's automatic 405 response, so the manual `req.method !== 'POST'` check
// that used to open this handler is gone.
//
// validate() itself now lives in ./validate.mjs — pure, no `next/server` import, so it can be
// `node --test`ed directly (validate.test.mjs). See that file's header comment for why.

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

  const { game, endedBy, variant, players, requestedPublicId, winnerSeat, errors } = validate(body);
  if (errors.length) {
    return NextResponse.json({ error: 'invalid_request', details: errors }, { status: 400 });
  }

  try {
    // getSql() is called inside this try (unlike a bare `sql = getSql()` before it) purely so a
    // missing DATABASE_URL — which it throws for by design, see lib/db.mjs — lands in the same
    // `server_error` JSON response as every other failure here, instead of escaping as an
    // unhandled rejection. It still throws at call time, not at module load.
    const sql = getSql();

    // Supplying the id returned by a previous save turns this write into an update. Keep the
    // session row itself so its recap URL and session-level photos remain attached; only the
    // mutable score snapshot is replaced below.
    if (requestedPublicId) {
      const existing = await sql`
        SELECT id FROM sessions WHERE public_id = ${requestedPublicId} AND game_key = ${game}
      `;
      if (!existing.length) {
        return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
      }
    }

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
          AND (${requestedPublicId || null}::text IS NULL OR s.public_id <> ${requestedPublicId || null})
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
    // Score endings: highest total wins. Supremacy endings: no totals exist to compare, so the
    // client-declared (and seat-validated, see validate() above) winnerSeat decides directly.
    const isWinners = players.map(p =>
      endedBy === 'score' ? p.total === maxTotal : p.seat === winnerSeat);
    const detailsJson = players.map(p => JSON.stringify(p.detail));

    let publicId = requestedPublicId || null;
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (!requestedPublicId) publicId = makePublicId();
      try {
        const playerWrite = sql`
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
        `;
        const writes = [
          sql`
            INSERT INTO people (name_key, display_name)
            SELECT * FROM unnest(${peopleKeys}::text[], ${peopleNames}::text[])
            ON CONFLICT (name_key) DO UPDATE SET display_name = EXCLUDED.display_name
          `
        ];
        if (requestedPublicId) {
          writes.push(
            sql`UPDATE sessions SET variant = ${JSON.stringify(variant)}::jsonb, ended_by = ${endedBy}
                WHERE public_id = ${publicId}`,
            sql`DELETE FROM session_players
                WHERE session_id = (SELECT id FROM sessions WHERE public_id = ${publicId})`,
            playerWrite
          );
        } else {
          writes.push(sql`
            INSERT INTO sessions (public_id, game_key, rules_version, variant, ended_by)
            VALUES (${publicId}, ${game}, 1, ${JSON.stringify(variant)}::jsonb, ${endedBy})
          `, playerWrite);
        }
        await sql.transaction(writes);
        break; // success
      } catch (err) {
        const isPublicIdCollision = err && err.code === '23505' && /public_id/.test(String(err.detail || err.message || ''));
        if (!requestedPublicId && isPublicIdCollision && attempt < MAX_ATTEMPTS) continue;
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

    return NextResponse.json({ publicId, saved, celebrations, updated: !!requestedPublicId }, { status: 200 });
  } catch (err) {
    console.error('POST /api/save-game failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
