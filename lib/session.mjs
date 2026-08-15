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

  // Session-level only today (session_player_id is always NULL) — a photo of the finished board,
  // not a per-player photo. The column is nullable specifically so per-seat photos can be added
  // later without a migration; nothing here assumes it stays that way.
  const photos = await sql`
    SELECT id, blob_url AS "blobUrl", caption, created_at AS "createdAt"
    FROM session_photos
    WHERE session_id = ${session.id}
    ORDER BY created_at ASC
  `;

  return {
    publicId: session.publicId,
    gameKey: session.gameKey,
    playedAt: session.playedAt,
    endedBy: session.endedBy,
    variant: session.variant,
    players,
    photos,
  };
}

// The lightweight lookup the upload-token route needs: does this session exist at all, and how
// many photos does it already have. Deliberately NOT the full getSessionByPublicId() above — that
// pulls every player's detail JSONB, which the token-generation path has no use for and would slow
// down on every single photo tap.
export async function getSessionForUpload(publicId) {
  const sql = getSql();
  const rows = await sql`SELECT id FROM sessions WHERE public_id = ${publicId}`;
  const session = rows[0];
  if (!session) return null;

  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM session_photos WHERE session_id = ${session.id}
  `;
  return { id: session.id, photoCount: count };
}

// session_player_id is left NULL — see the comment on getSessionByPublicId's photos query.
export async function recordSessionPhoto({ sessionId, blobUrl, caption }) {
  const sql = getSql();
  await sql`INSERT INTO session_photos (session_id, blob_url, caption)
            VALUES (${sessionId}, ${blobUrl}, ${caption || null})`;
}
