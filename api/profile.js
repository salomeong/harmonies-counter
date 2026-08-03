import { getSql, normalizeName } from '../lib/db.mjs';

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

  try {
    const sql = getSql();
    const profiles = await sql`
      SELECT id, display_name AS "displayName", high_score AS "highScore"
      FROM profiles WHERE name_key = ${key}
    `;
    const profile = profiles[0];
    if (!profile) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const games = await sql`
      SELECT total_score AS total, played_at AS "playedAt"
      FROM games WHERE profile_id = ${profile.id}
      ORDER BY played_at DESC
    `;

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      key,
      displayName: profile.displayName,
      highScore: profile.highScore,
      games,
    });
  } catch (err) {
    console.error('GET /api/profile failed:', err);
    res.status(500).json({ error: 'server_error' });
  }
}
