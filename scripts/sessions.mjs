// Inspect or delete saved sessions, by public_id.
//
//   node --env-file=.env.local scripts/sessions.mjs                     # list every session
//   node --env-file=.env.local scripts/sessions.mjs <public_id>         # one session in full
//   node --env-file=.env.local scripts/sessions.mjs --delete <id>…      # delete WHOLE sessions
//   node --env-file=.env.local scripts/sessions.mjs --delete-photo <blob-url>…  # one photo only
//
// This exists because preview and production share one database by decision (docs/deploying.md),
// so any end-to-end test of the save flow writes rows a real person will otherwise see. Writing
// test games is fine; leaving them behind is not, and deleting them by hand in a SQL console is
// how you delete the wrong one. `session_players` and `session_photos` cascade from `sessions` —
// but that only removes the DATABASE rows; the actual image bytes live in Vercel Blob and don't go
// away on their own, so --delete also deletes the blob objects themselves before dropping the row.
//
// --delete removes the WHOLE session, real games included — there is deliberately no confirmation
// prompt, because this is a non-interactive script. `--delete-photo` exists because this was
// learned the hard way: cleaning up one test photo attached to an otherwise-real saved game by
// running `--delete <that session's id>` deletes the game too. Use `--delete-photo` for a single
// photo; reach for `--delete` only when the whole session itself is what you mean to remove.
//
// A `people` row deliberately SURVIVES deletion of its sessions: `person_id` is ON DELETE SET NULL
// and a person is not owned by any one game. Orphaned people are reported so you can see them,
// not silently removed.

import { neon } from '@neondatabase/serverless';
import { del } from '@vercel/blob';

if (!process.env.DATABASE_URL){
  console.error('DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/sessions.mjs');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const args = process.argv.slice(2);
const deleting = args[0] === '--delete';
const deletingPhoto = args[0] === '--delete-photo';
const pruning = args[0] === '--prune-people';
const ids = deleting || deletingPhoto ? args.slice(1) : args;

if (deleting && !ids.length){
  console.error('--delete needs at least one public_id.');
  process.exit(1);
}
if (deletingPhoto && !ids.length){
  console.error('--delete-photo needs at least one blob_url (or a distinguishing substring of one).');
  process.exit(1);
}

async function list(){
  const rows = await sql`
    SELECT s.public_id, s.game_key, s.ended_by, s.played_at,
           count(sp.id) AS seats, max(sp.total_score) AS top
    FROM sessions s LEFT JOIN session_players sp ON sp.session_id = s.id
    GROUP BY s.id ORDER BY s.played_at DESC`;
  if (!rows.length){ console.log('no sessions'); return; }
  for (const r of rows){
    console.log(`${r.public_id}  ${String(r.game_key).padEnd(10)} ${r.seats} seats  top ${r.top}  ${new Date(r.played_at).toISOString()}`);
  }
  console.log(`\n${rows.length} session(s)`);
}

async function show(publicId){
  const [s] = await sql`SELECT id, public_id, game_key, ended_by, variant, played_at FROM sessions WHERE public_id = ${publicId}`;
  if (!s){ console.log(`${publicId}: not found`); return; }
  console.log(`\n${s.public_id}  ${s.game_key}  ended_by=${s.ended_by}  variant=${JSON.stringify(s.variant)}  ${new Date(s.played_at).toISOString()}`);
  const players = await sql`
    SELECT seat, display_name, total_score, is_winner, person_id, detail
    FROM session_players WHERE session_id = ${s.id} ORDER BY seat`;
  for (const p of players){
    console.log(`  seat ${p.seat}  ${String(p.display_name).padEnd(16)} total=${p.total_score}  winner=${p.is_winner}  person_id=${p.person_id ?? 'guest'}`);
    console.log(`      detail: ${JSON.stringify(p.detail)}`);
  }
  const photos = await sql`SELECT id, blob_url FROM session_photos WHERE session_id = ${s.id}`;
  if (photos.length) console.log(`  photos: ${photos.map(p => p.blob_url).join(', ')}`);
}

async function remove(publicIds){
  for (const publicId of publicIds){
    const [session] = await sql`SELECT id FROM sessions WHERE public_id = ${publicId}`;
    if (!session){ console.log(`${publicId}: not found`); continue; }

    const photos = await sql`SELECT blob_url FROM session_photos WHERE session_id = ${session.id}`;
    if (photos.length){
      // Best-effort: a blob that's already gone (or BLOB_READ_WRITE_TOKEN missing locally) must
      // not block deleting the session row itself.
      try {
        await del(photos.map(p => p.blob_url));
        console.log(`  deleted ${photos.length} blob object(s)`);
      } catch (err) {
        console.log(`  warning: couldn't delete ${photos.length} blob object(s): ${err.message}`);
      }
    }

    await sql`DELETE FROM sessions WHERE id = ${session.id}`;
    console.log(`deleted ${publicId} (session_players and session_photos cascaded)`);
  }
  const orphans = await sql`
    SELECT pe.name_key FROM people pe
    LEFT JOIN session_players sp ON sp.person_id = pe.id
    WHERE sp.id IS NULL`;
  if (orphans.length){
    console.log(`\nleft behind ${orphans.length} person row(s) with no sessions: ${orphans.map(o => o.name_key).join(', ')}`);
    console.log('(person_id is ON DELETE SET NULL and a person is not owned by one game, so these are kept deliberately)');
  }
}

// Removes ONE photo — the database row and the Blob object — without touching the session it
// belongs to. Matches by exact URL or by substring, so you don't have to paste the full
// random-suffixed URL back in; a substring that matches more than one photo is refused rather than
// guessed at.
async function removePhoto(matches){
  for (const match of matches){
    const rows = await sql`
      SELECT id, session_id, blob_url FROM session_photos WHERE blob_url LIKE ${'%' + match + '%'}`;
    if (!rows.length){ console.log(`${match}: no photo matched`); continue; }
    if (rows.length > 1){
      console.log(`${match}: matches ${rows.length} photos, refusing to guess — be more specific:`);
      rows.forEach(r => console.log(`  ${r.blob_url}`));
      continue;
    }
    const [photo] = rows;
    try {
      await del(photo.blob_url);
    } catch (err) {
      console.log(`  warning: couldn't delete the blob object: ${err.message}`);
    }
    await sql`DELETE FROM session_photos WHERE id = ${photo.id}`;
    console.log(`deleted photo ${photo.blob_url} (session itself untouched)`);
  }
}

// Separate and explicit, because deleting a person is not part of deleting a game they played.
// Only ever removes people with no remaining seats anywhere, which is why it takes no arguments.
async function prunePeople(){
  const rows = await sql`
    DELETE FROM people WHERE id IN (
      SELECT pe.id FROM people pe
      LEFT JOIN session_players sp ON sp.person_id = pe.id
      WHERE sp.id IS NULL
    ) RETURNING name_key`;
  console.log(rows.length ? `pruned ${rows.length}: ${rows.map(r => r.name_key).join(', ')}` : 'no orphaned people');
}

if (deleting) await remove(ids);
else if (deletingPhoto) await removePhoto(ids);
else if (pruning) await prunePeople();
else if (ids.length) for (const id of ids) await show(id);
else await list();
