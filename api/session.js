// GET /api/session?id=<public_id> -> the full session record: everyone who played, in seat
// order, with their per-category detail. This is the read side of the atomic write in
// api/save-game.js — the endpoint a future session-detail/recap view (not built here, see
// CLAUDE.md) will hang off of.
import { getSql } from '../lib/db.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const publicId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!publicId) {
    res.status(400).json({ error: 'missing_id' });
    return;
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
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const players = await sql`
      SELECT seat, display_name AS "displayName", total_score AS total,
             is_winner AS "isWinner", detail
      FROM session_players
      WHERE session_id = ${session.id}
      ORDER BY seat ASC
    `;

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      publicId: session.publicId,
      gameKey: session.gameKey,
      playedAt: session.playedAt,
      endedBy: session.endedBy,
      variant: session.variant,
      players,
    });
  } catch (err) {
    console.error('GET /api/session failed:', err);
    res.status(500).json({ error: 'server_error' });
  }
}
