// GET /api/profile?name=&game= -> one named person's history for one game: every session they
// were seated in, newest first, plus their derived high score for that game.
//
// 404 when the person has never played that game — either they don't exist at all (no `people`
// row for that name_key), or they exist (they've played some OTHER game) but have no
// session_players rows for THIS game_key. Both cases collapse to the same 404, same as before.
import { getSql, normalizeName, normalizeGame } from '../lib/db.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const key = normalizeName(req.query.name);
  if (!key) {
    res.status(400).json({ error: 'missing_name' });
    return;
  }

  const game = normalizeGame(req.query.game);
  if (!game) {
    res.status(400).json({ error: 'invalid_game' });
    return;
  }

  try {
    const sql = getSql();
    const people = await sql`
      SELECT id, display_name AS "displayName" FROM people WHERE name_key = ${key}
    `;
    const person = people[0];
    if (!person) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const games = await sql`
      SELECT sp.total_score AS total, s.played_at AS "playedAt", s.public_id AS "sessionId"
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.person_id = ${person.id} AND s.game_key = ${game}
      ORDER BY s.played_at DESC
    `;
    if (!games.length) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const scored = games.map(g => g.total).filter(t => t != null);
    const highScore = scored.length ? Math.max(...scored) : null;

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      key,
      displayName: person.displayName,
      highScore,
      games,
    });
  } catch (err) {
    console.error('GET /api/profile failed:', err);
    res.status(500).json({ error: 'server_error' });
  }
}
