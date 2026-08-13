// GET /api/session?id=<public_id> -> the full session record: everyone who played, in seat
// order, with their per-category detail. This is the read side of the atomic write in
// api/save-game.js — the endpoint a future session-detail/recap view (not built here, see
// CLAUDE.md) will hang off of.
import { NextResponse } from 'next/server';
import { getSql } from '../../../lib/db.mjs';

// This route reads process.env.DATABASE_URL through the lazy getSql() below — force-dynamic keeps
// Next from trying to evaluate (and cache) it at `next build` time, when there is no database.
export const dynamic = 'force-dynamic';

// Method routing (GET vs everything else) is now handled by App Router itself — a request with any
// other method gets Next's automatic 405 response, so the manual `req.method !== 'GET'` check that
// used to open this handler is gone.

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const publicId = typeof idParam === 'string' ? idParam.trim() : '';
  if (!publicId) {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  }

  try {
    const sql = getSql();
    const sessions = await sql`
      SELECT id, public_id AS "publicId", game_key AS "gameKey", played_at AS "playedAt",
             ended_by AS "endedBy", variant
      FROM sessions WHERE public_id = ${publicId}
    `;
    const session = sessions[0];
    if (!session) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const players = await sql`
      SELECT seat, display_name AS "displayName", total_score AS total,
             is_winner AS "isWinner", detail
      FROM session_players
      WHERE session_id = ${session.id}
      ORDER BY seat ASC
    `;

    return NextResponse.json({
      publicId: session.publicId,
      gameKey: session.gameKey,
      playedAt: session.playedAt,
      endedBy: session.endedBy,
      variant: session.variant,
      players,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET /api/session failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
