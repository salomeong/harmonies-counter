// One query, two callers: GET /api/session and the /g/[id] Server Component page both need the
// same session-plus-players read. Kept here instead of duplicated so the shape can't drift between
// the JSON API and the page that renders it directly against Postgres.

import { getSql } from './db.mjs';

// Returns null when no session matches — callers decide whether that means a 404 JSON body or
// Next's notFound(). Never throws for "not found"; DB errors still propagate to the caller.
export async function getSessionByPublicId(publicId) {
  const sql = getSql();
  const sessions = await sql`
    SELECT id, public_id AS "publicId", game_key AS "gameKey", played_at AS "playedAt",
           ended_by AS "endedBy", variant
    FROM sessions WHERE public_id = ${publicId}
  `;
  const session = sessions[0];
  if (!session) return null;

  const players = await sql`
    SELECT seat, display_name AS "displayName", total_score AS total,
           is_winner AS "isWinner", detail
    FROM session_players
    WHERE session_id = ${session.id}
    ORDER BY seat ASC
  `;

  return {
    publicId: session.publicId,
    gameKey: session.gameKey,
    playedAt: session.playedAt,
    endedBy: session.endedBy,
    variant: session.variant,
    players,
  };
}
