# What's next

Written 2026-08-13, at the end of the work that added 7 Wonders and turned the app into a ledger.
Everything here is deliberately deferred, not forgotten. Read [CLAUDE.md](../CLAUDE.md) first —
this file assumes it.

## Where things stand

- Three games (Harmonies, Faraway, 7 Wonders), each a **declaration** in `src/games/`. Adding a
  fourth should need no new branch in render/patch/wire code.
- `index.html` is a 107-line shell; everything else is `styles.css` + `src/`. No build step.
- 147 tests, a characterization gate (`scripts/score-fixtures.mjs --check`), and a DOM-level check
  that every rendered score carries a patch hook.
- The database is the session ledger (`docs/ledger.md`) and is **empty** — production is clean and
  waiting for a first real game.
- One Vercel project. `vercel deploy` = preview, `vercel deploy --prod` = **real users**.

## Decided: preview and production share one database

Checked 2026-08-13. The Neon integration's *Create Database Branch For Deployment* checkboxes are
**greyed out and unavailable** on this setup (they sit under a "Require Active Resource Before
Deploy: Not Required" toggle, which may be what gates them). Maxx's call: sharing is fine for a
three-friend app. Recorded so nobody re-opens it as an outstanding chore.

What that costs, and how to work around it when it matters:

- Preview deployments read and write the **same rows as production**. Once real games exist,
  testing against a preview URL can touch them.
- A schema change has no automatic rehearsal. **It does not have to be run blind, though** — Neon
  supports branching by hand: create a branch in the Neon console, point a local `DATABASE_URL` at
  it, run the change there, and only then run it against main. That is the same rehearsal the
  integration would have automated.
- Before anything destructive, run `node --env-file=.env.local scripts/inspect-db.mjs` — it prints
  the tables and row counts of whatever `DATABASE_URL` currently points at. That is how the
  pre-ledger data got noticed and snapshotted rather than silently dropped.

## Next features, roughly in order of payoff

### Session detail view + routing
The ledger already returns everything needed (`GET /api/session?id=<public_id>`), and the
leaderboard already returns the `sessionId` that produced each best score — but nothing links to
it yet, because there is no view and no URL to link to. About 40 lines of hash routing (`#/g/<id>`)
over the existing `showView()`, plus a view that renders a saved session from its `detail`. The
same category descriptors that render the scorer can render the recap, which is the point of
storing raw state.

**This is the highest-payoff next piece**: it turns the ledger from a thing that stores games into
a thing that shows them.

### Photos of finished boards
`session_photos` exists and is unused. Two constraints decided in advance:
- **Vercel Blob with client-side upload** (`@vercel/blob/client`). Phone photos are 3–8 MB and
  Vercel Functions cap request bodies at 4.5 MB, so proxying through `/api/*` fails on exactly the
  photos people take.
- **The bytes must never reach Postgres** — only the URL. That rule is what keeps the database
  inside Neon's free tier indefinitely.
Downscale on-device via canvas (long edge ~1600px) before upload; that also puts roughly 16,000
photos inside Blob's Hobby allowance.

### Recaps and statistics
Head-to-head records, win rates, "your best science score", how a game went. Needs the session view
first.

**Settled 2026-08-13: the app is now Next.js 16 + React 19 + TanStack Query.** See CLAUDE.md's
"The framework decision" for what it bought and cost.

Two corrections to what this file used to say here, since both misled once:

- It claimed CLAUDE.md stated a trigger — *"≥3 data-driven routes beyond the scorer, or the first
  chart, or wanting TypeScript"*. **CLAUDE.md never contained that rule.** A decision recorded in
  the deferred-work file and attributed to the governing file is not a rule; it reads as one only
  until someone greps. If a constraint is meant to bind, write it where it binds.
- The migration was done **wholesale**, not side by side, and `src/` was kept framework-free so the
  scoring core and all its tests carried through the port untouched. That is what made the
  characterization gate meaningful evidence rather than decoration.

### 7 Wonders Duel
Always exactly 2 players, so it wants a head-to-head two-column layout rather than stacked cards.
Its conflict track (0/2/5/10 VP) maps onto the existing ladder component.

**Blocked on one thing:** Duel can end by military or scientific supremacy, with no scores counted
at all. `sessions.ended_by` supports that, but `api/save-game.js` deliberately **rejects** those
values today, because nothing in the payload says *who won* a game with no scores — accepting one
would write a session where every seat has `is_winner = false`. Thread a `winnerSeat` through the
client, the validator and the insert before enabling them.

## Smaller loose ends

- **Guests don't appear on the leaderboard and nothing says so.** Every seat is saved, but only
  named players get a `people` row. A nudge to name someone would help. It's copy, so it goes
  through the `frontend-design` skill. Marked `TODO(ui)` in `src/ui/views.js`.
- **Expansions.** 7 Wonders has Leaders and Cities; Cities adds black cards with *negative* VP,
  which the descriptor `min` field already supports. Faraway and Harmonies have their own. Each is
  additive: a category or two on an existing declaration.
- ~~**`escapeAttr` doesn't escape `>` or `'`.**~~ Closed by the React port, which removed every
  call site that could have cared: player names, labels and aria-labels are props now and React
  escapes them itself. `escapeAttr` survives only inside the SVG token-art strings.
- ~~**`reviewGrid()` is hand-written and outside the test's reach.**~~ It is a component in
  `app/_components/Scorer.jsx` now, driven off `game.sums`.
- **The local `.env.local` points at the production database.** Not a loose end so much as a
  standing hazard: DB-backed flows now work locally (CLAUDE.md used to claim they 500'd), which
  means a local save writes rows real people see. `scripts/sessions.mjs` lists and deletes them.
