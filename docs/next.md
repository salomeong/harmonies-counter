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

## Do these before the first real game

Small, and each one gets harder once there is data worth keeping.

1. **Turn on the Neon preview database branch.** Right now preview and production share one
   database, so the next schema change has no rehearsal.

   In the Neon integration's *Configure faithful-tally* dialog there are **two different sets of
   checkboxes**, and it is easy to read the wrong one:
   - the **Environments** dropdown (Production / Preview / Development) — which environments
     receive `DATABASE_URL` and friends. All three are already ticked; that is what makes
     `vercel env pull` work locally.
   - a separate **Create Database Branch For Deployment** row below it — `Preview` / `Production`.
     **This is the one that matters, and both are currently off.**

   Tick **Preview** only. Leave Production off: production should always be the main branch, not a
   per-deployment branch.

   Related: the dialog's **Sensitive** toggle is currently off. If it is ever switched on,
   `vercel env pull` starts returning `DATABASE_URL=""` instead of failing, which reads as a CLI
   bug — see [deploying.md](deploying.md).
2. **Delete the retired `faithful-tally-preview` Vercel project.** It still answers on
   `harmonies-counter-gray.vercel.app` with a stale build, which is a confusing second live copy.

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
first. This is also the trigger to re-evaluate the no-framework decision — see CLAUDE.md's
framework trigger (≥3 data-driven routes, or the first chart, or wanting TypeScript).

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
- **`escapeAttr` doesn't escape `>` or `'`.** Safe today — every call site interpolates into a
  double-quoted attribute or text, and `<` and `"` are escaped — but the name promises more than it
  does. Documented by tests in `src/ui/controls.test.js`.
- **`reviewGrid()` is still hand-written in `src/ui/scorer.js`**, not moved to `card.js`, so it is
  outside the patch-hook test's reach. Worth moving when it next needs changing.
