# What's next

Written 2026-08-13, at the end of the work that added 7 Wonders and turned the app into a ledger.
Updated the same day once the Next.js port and the session recap shipped. Everything here is
deliberately deferred, not forgotten. Read [CLAUDE.md](../CLAUDE.md) first — this file assumes it.

## Where things stand

- Three games (Harmonies, Faraway, 7 Wonders), each a **declaration** in `src/games/`. Adding a
  fourth should need no new branch in any component.
- **The app is Next.js 16 + React 19 + TanStack Query**, adopted wholesale on 2026-08-13. `src/`
  stays framework-free by design — see CLAUDE.md's "The framework decision" and "Architecture".
- `node --test` (the framework-free core) plus Vitest (the React components) replace the vanilla
  app's single suite and its DOM-level patch-hook check, which no longer applies now that React
  removed the bug class it guarded. See CLAUDE.md's "Patch hooks are gone" section.
- The session ledger (`docs/ledger.md`) has its **first real game** as of 2026-08-13 — no longer
  empty. Treat `scripts/sessions.mjs`'s cleanup workflow as load-bearing, not optional, when testing
  the save flow: preview, production and a local `.env.local` all point at the same rows.
- One Vercel project. `vercel deploy` = preview, `vercel deploy --prod` = **real users**.
  `vercel.json` pins the framework to `nextjs` — see docs/deploying.md for why that matters.

## Decided: preview and production share one database

Checked 2026-08-13. The Neon integration's *Create Database Branch For Deployment* checkboxes are
**greyed out and unavailable** on this setup (they sit under a "Require Active Resource Before
Deploy: Not Required" toggle, which may be what gates them). Maxx's call: sharing is fine for a
three-friend app. Recorded so nobody re-opens it as an outstanding chore.

What that costs, and how to work around it when it matters:

- Preview deployments — and now local dev too, see docs/deploying.md — read and write the **same
  rows as production**. `scripts/sessions.mjs` lists, shows and deletes sessions by `public_id`, and
  `--prune-people` clears anyone left with no games; use it after any test save.
- A schema change has no automatic rehearsal. **It does not have to be run blind, though** — Neon
  supports branching by hand: create a branch in the Neon console, point a local `DATABASE_URL` at
  it, run the change there, and only then run it against main. That is the same rehearsal the
  integration would have automated.
- Before anything destructive, run `node --env-file=.env.local scripts/inspect-db.mjs` — it prints
  the tables and row counts of whatever `DATABASE_URL` currently points at.

## Decided: the framework migration

Settled 2026-08-13, alongside the session-detail work — see CLAUDE.md's "The framework decision"
for the full reasoning, and its "Architecture" section for the resulting file layout.

Two corrections to what this file used to say here, since both misled once:

- It claimed CLAUDE.md stated a trigger for adopting a framework — *"≥3 data-driven routes beyond
  the scorer, or the first chart, or wanting TypeScript"*. **CLAUDE.md never contained that rule.**
  A decision recorded in this deferred-work file and attributed to the governing file is not a
  rule; it reads as one only until someone greps. If a constraint is meant to bind, write it where
  it binds.
- The migration was done **wholesale**, not side by side, and `src/` was kept framework-free so the
  scoring core and all its tests carried through the port untouched. That is what made the
  characterization gate meaningful evidence rather than decoration.

## Next features, roughly in order of payoff

### ~~Session detail view + routing~~ — shipped 2026-08-13

`/g/[public_id]` is a Server Component (`app/g/[id]/page.jsx`) that reads Postgres directly via
`lib/session.mjs`, reconstructs each player with `scorer.fromDetail()`, and renders a read-only
recap (`app/_components/Recap.jsx`) — deliberately not a reuse of the live scorer's card markup,
which hardcodes editing affordances a finished game must not show. Ships with a `next/og`
share-preview image and a "Copy link" button. Leaderboard and history rows are real `<a href>`s now.

Verified end-to-end against real infrastructure, not just fixtures: a 7 Wonders game entered by
typing a science total (proving the `_totals` fix — see CLAUDE.md's ledger section) round-tripped
through a live save, a real Postgres row, and the recap page, landing on the correct score.

**One thing worth knowing if this ever gets touched again:** a Server Component importing a plain
data constant from a `"use client"` file resolves to `undefined` at runtime, silently — see
CLAUDE.md's "RSC boundaries" note. It cost a broken mascot image before being caught by browser
verification; Vitest could not see it, because RTL doesn't model the RSC split at all.

### Photos of finished boards
`session_photos` exists and is unused. Two constraints decided in advance:
- **Vercel Blob with client-side upload** (`@vercel/blob/client`) — now a plain import, since the
  no-bundler constraint that made this awkward went away with the framework migration. Phone photos
  are 3–8 MB and Vercel Functions cap request bodies at 4.5 MB, so proxying through `/api/*` fails
  on exactly the photos people take.
- **The bytes must never reach Postgres** — only the URL. That rule is what keeps the database
  inside Neon's free tier indefinitely.
Downscale on-device via canvas (long edge ~1600px) before upload; that also puts roughly 16,000
photos inside Blob's Hobby allowance. The recap page (`app/g/[id]/page.jsx`) is the natural place to
both upload to and display from.

### Recaps and statistics
Head-to-head records, win rates, "your best science score", how a game went. The session recap this
needs as a foundation now exists; this is the next layer on top of it, not blocked on anything new.
Charts should be inline SVG in the house style (`tokenArt`/`art-7w.js`), not a chart library — see
CLAUDE.md's design rules on why the app keeps real component colours instead of muting them.

### 7 Wonders Duel
Always exactly 2 players, so it wants a head-to-head two-column layout rather than stacked cards.
Its conflict track (0/2/5/10 VP) maps onto the existing ladder component.

**Blocked on one thing:** Duel can end by military or scientific supremacy, with no scores counted
at all. `sessions.ended_by` supports that, but `app/api/save-game/route.js` deliberately **rejects**
those values today, because nothing in the payload says *who won* a game with no scores — accepting
one would write a session where every seat has `is_winner = false`. Thread a `winnerSeat` through
the client, the validator and the insert before enabling them.

## Smaller loose ends

- **Guests don't appear on the leaderboard and nothing says so.** Every seat is saved, but only
  named players get a `people` row. A nudge to name someone would help. It's copy, so it goes
  through the `frontend-design` skill.
- **Expansions.** 7 Wonders has Leaders and Cities; Cities adds black cards with *negative* VP,
  which the descriptor `min` field already supports. Faraway and Harmonies have their own. Each is
  additive: a category or two on an existing declaration.
- ~~**`escapeAttr` doesn't escape `>` or `'`.**~~ Closed by the React port, which removed every
  call site that could have cared: player names, labels and aria-labels are props now and React
  escapes them itself. `escapeAttr` survives only inside the SVG token-art strings.
- ~~**`reviewGrid()` is hand-written and outside the test's reach.**~~ It is a component in
  `app/_components/Scorer.jsx` now, driven off `game.sums`.
- **The local `.env.local` points at the production database.** Not a loose end so much as a
  standing hazard: DB-backed flows work locally, which means a local save writes rows real people
  see. `scripts/sessions.mjs` lists and deletes them — use it, not a SQL console, so the wrong row
  never gets deleted by hand.
- **The recap's per-category "under today's rules" note has never been exercised by a real rule
  change.** It's tested against synthetic divergence (`app/_components/Recap.test.jsx`), but the
  first real scoring-rule change will be the first live proof it reads right.
