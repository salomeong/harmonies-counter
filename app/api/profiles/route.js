// GET /api/profiles?game= -> the landing screen's saved-player chips: one row per named person
// who has played this game, with their derived high score and when they last played.
//
// "Named" means they have a `people` row — guests (unnamed/default-named players) never get one,
// so they never show up here, same as before this ledger rewrite.
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
      SELECT pe.name_key AS key, pe.display_name AS "displayName",
             MAX(sp.total_score) AS "highScore", MAX(s.played_at) AS "lastPlayed"
      FROM people pe
      JOIN session_players sp ON sp.person_id = pe.id
      JOIN sessions s ON s.id = sp.session_id
      WHERE s.game_key = ${game}
      GROUP BY pe.id
      ORDER BY MAX(s.played_at) DESC
    `;
    return NextResponse.json({ profiles: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET /api/profiles failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
