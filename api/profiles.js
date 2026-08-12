// GET /api/profiles?game= -> the landing screen's saved-player chips: one row per named person
// who has played this game, with their derived high score and when they last played.
//
// "Named" means they have a `people` row — guests (unnamed/default-named players) never get one,
// so they never show up here, same as before this ledger rewrite.
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
      SELECT pe.name_key AS key, pe.display_name AS "displayName",
             MAX(sp.total_score) AS "highScore", MAX(s.played_at) AS "lastPlayed"
      FROM people pe
      JOIN session_players sp ON sp.person_id = pe.id
      JOIN sessions s ON s.id = sp.session_id
      WHERE s.game_key = ${game}
      GROUP BY pe.id
      ORDER BY MAX(s.played_at) DESC
    `;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ profiles: rows });
  } catch (err) {
    console.error('GET /api/profiles failed:', err);
    res.status(500).json({ error: 'server_error' });
  }
}
