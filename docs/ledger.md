# The ledger — schema and API

How a saved game is stored, and why. Referenced from CLAUDE.md; read this before touching
`schema.sql`, `app/api/*` or anything that writes a score.


A saved game is a **session**, not a row per player. `sessions` + `session_players` (+ `people`,
+ `session_photos`) replaced the old `profiles`/`games` pair, where two people at the same table
produced two unrelated rows — no opponents, no per-category detail, no URL. `lib/session.mjs`'s
`getSessionByPublicId()` returns one by its `public_id` — the query `GET /api/session` and
`app/g/[id]/page.jsx` (the recap route, live since 2026-08-13) both call, so the JSON API and the
page that renders it directly against Postgres can't drift apart.

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
- **A typed whole-category total is raw entered state too, and lives under the reserved `_totals`
  key.** It is literally what the human typed, so it belongs here — and it is not recoverable from
  the per-category state, because "✎ Enter total" freezes `p.totals[cat]` and every later edit
  touches only that, never the tally fields. Until 2026-08-13 `scorer.detail()` never read
  `p.totals`, so a 7 Wonders game scored by typing totals saved
  `science: {tablet:0,compass:0,gear:0}` beside a `total_score` of 62 — and **every** 7 Wonders
  category is `infer: null`, so they all keep the override permanently. Values are stored exactly
  as typed (a total may be the string `"21"`, or `""`) so the round trip is exact; `catPoints()`
  already reads them through `numOf()`. The leading underscore cannot collide with a category:
  `src/games/registry.test.js` asserts every declared key matches `/^[a-z][a-zA-Z0-9]*$/`.
- **Every category that declares `detail` must declare `restore(p, d)`, its inverse**, and
  `scorer.fromDetail(blob)` is the only way to read a row back. There is deliberately **no generic
  default inverse** to fall back on — `p[cat.key] = d` is wrong for at least two live categories
  (Harmonies' `water` writes two *top-level* fields under one detail key; Faraway's `region` writes
  the field `regionFame`), and it would fail silently, re-scoring a saved board as empty. Because
  `fromDetail` also restores `p.totals`, `catPoints`/`breakdown`/`total`/`work()` read a
  reconstructed player unmodified — `isTotalMode()` cannot tell a live card from a Postgres row.
- `fromDetail` returns `{ player, present }`. **`present` is load-bearing:** a category absent from
  an older blob must render as absent, not as a hard 0, or the recap claims someone scored zero in
  a category their game did not have. Live in `app/_components/Recap.jsx`'s `UntrackedRow`, not
  just designed for it.
- The recap (`app/g/[id]/page.jsx`) always shows `total_score` as the headline, never a value
  recomputed from `detail` — a rule change after the fact is expected, not corruption, and the two
  numbers are allowed to diverge. When they do, the recap labels the recomputed one explicitly
  rather than silently picking a side.
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

