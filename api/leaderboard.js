import { getSql } from '../lib/db.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT display_name AS "displayName", high_score AS "highScore"
      FROM profiles
      ORDER BY high_score DESC, display_name ASC
    `;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ leaderboard: rows });
  } catch (err) {
    console.error('GET /api/leaderboard failed:', err);
    res.status(500).json({ error: 'server_error' });
  }
}
