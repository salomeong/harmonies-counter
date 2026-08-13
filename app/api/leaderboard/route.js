// GET /api/leaderboard?game= -> one row per named person, their single best session for this
// game, ranked by that score.
//
// `sessionId` is the public_id of the SESSION that produced the best score (not just a bare
// number), so the leaderboard can link back to the game that earned it. DISTINCT ON picks exactly
// one session_players row per person — the highest total_score, tie-broken by most recent — before
// the outer query sorts the resulting one-row-per-person set by score.
import { NextResponse } from 'next/server';
import { getSql, normalizeGame } from '../../../lib/db.mjs';

// This route reads process.env.DATABASE_URL through the lazy getSql() below — force-dynamic keeps
// Next from trying to evaluate (and cache) it at `next build` time, when there is no database.
export const dynamic = 'force-dynamic';

// Method routing (GET vs everything else) is now handled by App Router itself — a request with any
// other method gets Next's automatic 405 response, so the manual `req.method !== 'GET'` check that
// used to open this handler is gone.

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const game = normalizeGame(searchParams.get('game'));
  if (!game) {
    return NextResponse.json({ error: 'invalid_game' }, { status: 400 });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT "displayName", "highScore", "sessionId"
      FROM (
        SELECT DISTINCT ON (pe.id)
               pe.display_name AS "displayName",
               sp.total_score AS "highScore",
               s.public_id AS "sessionId"
        FROM people pe
        JOIN session_players sp ON sp.person_id = pe.id
        JOIN sessions s ON s.id = sp.session_id
        WHERE s.game_key = ${game} AND sp.total_score IS NOT NULL
        -- sp.id last so the pick is fully deterministic: DISTINCT ON is only well-defined when
        -- ORDER BY resolves to a unique row, and two sessions can tie on both score and timestamp.
        ORDER BY pe.id, sp.total_score DESC, s.played_at DESC, sp.id DESC
      ) best
      ORDER BY "highScore" DESC, "displayName" ASC
    `;
    return NextResponse.json({ leaderboard: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET /api/leaderboard failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
