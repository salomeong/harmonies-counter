// GET /api/profile?name=&game= -> one named person's history for one game: every session they
// were seated in, newest first, plus their derived high score for that game.
//
// 404 when the person has never played that game — either they don't exist at all (no `people`
// row for that name_key), or they exist (they've played some OTHER game) but have no
// session_players rows for THIS game_key. Both cases collapse to the same 404, same as before.
import { NextResponse } from 'next/server';
import { getSql, normalizeName, normalizeGame } from '../../../lib/db.mjs';

// This route reads process.env.DATABASE_URL through the lazy getSql() below — force-dynamic keeps
// Next from trying to evaluate (and cache) it at `next build` time, when there is no database.
export const dynamic = 'force-dynamic';

// Method routing (GET vs everything else) is now handled by App Router itself — a request with any
// other method gets Next's automatic 405 response, so the manual `req.method !== 'GET'` check that
// used to open this handler is gone.

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const key = normalizeName(searchParams.get('name'));
  if (!key) {
    return NextResponse.json({ error: 'missing_name' }, { status: 400 });
  }

  const game = normalizeGame(searchParams.get('game'));
  if (!game) {
    return NextResponse.json({ error: 'invalid_game' }, { status: 400 });
  }

  try {
    const sql = getSql();
    const people = await sql`
      SELECT id, display_name AS "displayName" FROM people WHERE name_key = ${key}
    `;
    const person = people[0];
    if (!person) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const games = await sql`
      SELECT sp.total_score AS total, s.played_at AS "playedAt", s.public_id AS "sessionId"
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.person_id = ${person.id} AND s.game_key = ${game}
      ORDER BY s.played_at DESC
    `;
    if (!games.length) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const scored = games.map(g => g.total).filter(t => t != null);
    const highScore = scored.length ? Math.max(...scored) : null;

    return NextResponse.json({
      key,
      displayName: person.displayName,
      highScore,
      games,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET /api/profile failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
