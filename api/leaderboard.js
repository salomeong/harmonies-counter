// GET /api/leaderboard?game= -> one row per named person, their single best session for this
// game, ranked by that score.
//
// `sessionId` is the public_id of the SESSION that produced the best score (not just a bare
// number), so the leaderboard can link back to the game that earned it. DISTINCT ON picks exactly
// one session_players row per person — the highest total_score, tie-broken by most recent — before
// the outer query sorts the resulting one-row-per-person set by score.
import { getSql, normalizeGame } from '../lib/db.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const game = normalizeGame(req.query.game);
  if (!game) {
    res.status(400).json({ error: 'invalid_game' });
    return;
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
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ leaderboard: rows });
  } catch (err) {
    console.error('GET /api/leaderboard failed:', err);
    res.status(500).json({ error: 'server_error' });
  }
}
