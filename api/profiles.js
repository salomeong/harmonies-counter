import { getSql } from '../lib/db.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT p.name_key AS key, p.display_name AS "displayName",
             p.high_score AS "highScore", MAX(g.played_at) AS "lastPlayed"
      FROM profiles p
      JOIN games g ON g.profile_id = p.id
      GROUP BY p.id
      ORDER BY MAX(g.played_at) DESC
    `;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ profiles: rows });
  } catch (err) {
    console.error('GET /api/profiles failed:', err);
    res.status(500).json({ error: 'server_error' });
  }
}
