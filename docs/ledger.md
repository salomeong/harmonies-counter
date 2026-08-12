# The ledger — schema and API

How a saved game is stored, and why. Referenced from CLAUDE.md; read this before touching
`schema.sql`, `api/*` or anything that writes a score.


A saved game is a **session**, not a row per player. `sessions` + `session_players` (+ `people`,
+ `session_photos`) replaced the old `profiles`/`games` pair, where two people at the same table
produced two unrelated rows — no opponents, no per-category detail, no URL. `api/session.js`
returns one by its `public_id`, which is what lets a leaderboard link back to the game that earned
a score.

The seam: **anything you rank, filter or aggregate across games is a real column; anything you only
display inside its own game's context is `session_players.detail` JSONB.** `detail` holds the RAW
entered state built by `scorer.detail(p)` — never derived points, because `{"science": 21}` can't
reconstruct "3 tablets, 2 compasses, 1 gear", and a recap that wants to show what someone *built*
would be blocked by data we captured but shaped badly.

- **`total_score` is authoritative and never recomputed** from `detail`, so fixing a scoring rule
  or adding an expansion can't retroactively rewrite what happened. `display_name` is snapshotted
  per seat for the same reason.
- **`high_score` is not stored anywhere** — it's `MAX(total_score)`, so it cannot drift.
- **Every seat is recorded, guests included** (`person_id NULL`). A 4-player game must produce 4
  rows or the session misrepresents who was at the table; only *named* players get a `people` row
  and so appear in leaderboards and history.
- `detail` keys are **permanent identifiers — add freely, never rename or repurpose**, or you
  orphan every game already saved under the old key.
- The write is atomic via `sql.transaction([...])`. The neon HTTP driver has no interactive
  transactions, so the handler generates `public_id` up front and later statements resolve the
  session by it rather than needing an id back mid-transaction.
- `sessions.ended_by` supports Duel's supremacy endings, but **the API only accepts `'score'`** —
  nothing in the payload says who won a game that ended with no scores counted, so accepting one
  would write a session with no winner. Thread a `winnerSeat` through before enabling it.

`scripts/init-db.mjs` applies `schema.sql`. It strips `--` comments before splitting on `;` —
the naive split it used to do was broken by a comment that itself contained semicolons, which
severed a `CREATE TABLE` mid-definition. `scripts/init-db.test.mjs` guards that; it is not
a general migration tool, and a re-run will not add a column you added later.

