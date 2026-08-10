import { getSql, normalizeName, isDefaultName, normalizeGame } from '../lib/db.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const game = normalizeGame(req.body?.game);
  if (!game) {
    res.status(400).json({ error: 'invalid_game' });
    return;
  }

  const players = Array.isArray(req.body?.players) ? req.body.players : [];
  const sql = getSql();

  const saved = [];
  const skipped = [];
  const celebrations = [];

  try {
    for (const entry of players) {
      const rawName = typeof entry?.name === 'string' ? entry.name : '';
      const trimmed = rawName.trim();
      const total = Number(entry?.total);

      if (!trimmed) {
        skipped.push({ name: rawName, reason: 'blank_name' });
        continue;
      }
      if (isDefaultName(trimmed)) {
        skipped.push({ name: trimmed, reason: 'default_name' });
        continue;
      }
      if (!Number.isFinite(total)) {
        skipped.push({ name: trimmed, reason: 'invalid_total' });
        continue;
      }

      const key = normalizeName(trimmed);
      const existingRows = await sql`
        SELECT id, display_name AS "displayName", high_score AS "highScore"
        FROM profiles WHERE name_key = ${key} AND game = ${game}
      `;
      const existing = existingRows[0];
      const hadPriorGame = !!existing;
      const previousHigh = existing ? existing.highScore : 0;
      const displayName = existing ? existing.displayName : trimmed;

      let profileId;
      if (existing) {
        profileId = existing.id;
      } else {
        const inserted = await sql`
          INSERT INTO profiles (name_key, display_name, high_score, game)
          VALUES (${key}, ${trimmed}, 0, ${game})
          RETURNING id
        `;
        profileId = inserted[0].id;
      }

      await sql`
        INSERT INTO games (profile_id, total_score) VALUES (${profileId}, ${total})
      `;

      if (total > previousHigh) {
        await sql`UPDATE profiles SET high_score = ${total} WHERE id = ${profileId}`;
      }

      saved.push({ key, displayName, total });
      if (hadPriorGame && total > previousHigh) {
        celebrations.push({ key, displayName, total, previousHigh });
      }
    }

    res.status(200).json({ saved, skipped, celebrations });
  } catch (err) {
    console.error('POST /api/save-game failed:', err);
    res.status(500).json({ error: 'server_error' });
  }
}
