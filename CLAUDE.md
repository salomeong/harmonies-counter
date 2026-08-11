# The Faithful Tally

A board-game score counter for **Harmonies** and **Faraway**. Players tally an end-of-game board
and the app derives the score, so nobody does mental arithmetic.

## Keep this file current

**Update this CLAUDE.md as part of the change, not after.** When a turn adds a feature, changes an
architectural rule, or touches deploy/infra setup, the corresponding section here gets edited in
the same turn — not left for later, not left for the user to ask for. A stale CLAUDE.md is worse
than no CLAUDE.md, because it's actively misleading rather than obviously absent. If you're not
sure whether a change is documentation-worthy, it probably is.

## Mandatory: use the frontend-design skill

**Any change that touches UI — markup, CSS, layout, copy, colour, motion, iconography — MUST begin
by invoking the `frontend-design:frontend-design` skill.** Load it *before* editing, not after.
This is not optional and not limited to "big" redesigns; a one-line CSS tweak counts.

The app has an established look (warm parchment, board-game scorepad, real component colours) and
the skill is what keeps changes from drifting into generic defaults. If a request is UI-shaped,
the first tool call of the turn should be the skill.

## Architecture

Everything lives in **[index.html](index.html)** — a single file with a `<style>` block and a
`<script>` block. No build step, no framework, no bundler. `assets/` holds images; `api/` holds
Vercel serverless functions backed by Neon Postgres (`lib/db.mjs`, `schema.sql`).

### Scoring model

All scores funnel through one path so the badge, the `=` strip, the winner comparison and the save
payload cannot disagree:

```
derivedPoints(p, cat)  →  catPoints(p, cat)  →  breakdown(p)  →  totalPoints(p)
```

`catPoints()` returns a typed override from `p.totals[cat]` when present, otherwise the derived
value. **Never read a category score any other way.**

### Three ways to enter a score

Players count differently, and all three are first-class per category:

1. **Tally** — tap a token button to increment (`data-role="tally"`)
2. **Bucket** — tap the count chip and type it (`data-role="editCount"`)
3. **Whole-category** — `✎ Enter total`, which freezes the number (`p.totals[cat]`)

For fields, buildings, islands and river a typed total is *inverted back* into the count by
`inferFromTotal()` and the category returns to tally mode. Stacks and animal cards are ambiguous
(13 could be many bucket combinations) so they keep the override.

### Rendering

- `render()` rebuilds the container; use it only for **structural** change (add/remove player,
  add/remove animal card, open/close a drawer, mode or water-side switch).
- `patchScores()` updates numbers **in place** and is what every tap calls. Taps arrive fast; a
  full rebuild per tap loses `:active` and gets sluggish with four players.
- Patch hooks — keep these intact when editing markup: `data-pid` on each player container,
  `data-pts-for`, `data-count-for`, `data-minus-for`, `data-sum`, `.total-badge`, `.crown`,
  `.ladder [data-rung]`.
- Two modes share one `players` array: `renderByPlayer()` (accordion cards) and
  `renderByCategory()` (tab strip + `reviewGrid()`).

## Design rules that are load-bearing

**Points are always in a blob; counts never are.** This mirrors the physical components, where
every point value sits in a coloured bubble. `.pip` = points (token values, category scores,
totals, river ladder rungs). `.count-pre` + `.count-num` = counts, bare numerals with a muted
`×` / `len` prefix. Breaking this rule reintroduces the confusion it was built to fix.

**Check contrast before choosing a pip colour.** The game's own token colours mostly fail WCAG AA
as text backgrounds at pip sizes — white on `--tok-field` is 1.84:1, on `--tok-tree` 3.10:1. Point
pips therefore use `--green-dark` with white (5.99:1); the grand total uses `--accent` with dark
ink (5.84:1); the active river rung uses `--tok-water` with dark ink (4.58:1).

**Controls keep their place.** A `−` at zero is `disabled`, never hidden — this is a tap-fast UI
and a control that appears on first tap reflows the row under a moving finger. Same reason taps
call `patchScores()` rather than `render()`.

**Faraway shares CSS with Harmonies** (`.category`, `.cat-label`, `.cat-pts`, `.animal-row`,
`.num-input`, `.total-badge`, `.crown`). Harmonies' accordion styles are scoped behind a `.acc`
modifier specifically to protect it. **Check the Faraway view after any shared-class change.**

**Token art is generated, not imported.** `tokenArt(kind, height)` draws all nine sprites from one
`tokenDisc()` cylinder helper using the `--tok-*` vars. No image files, crisp at any DPI, themes
correctly.

Scoring ladders are verified against the printed rule card: stacks `0/1/3/7`, river length 1–6 →
`0/2/5/8/11/15` then `+4` each. Don't "fix" these.

## Running it

```bash
vercel dev --yes --listen 3000
```

Prefer the Browser pane (`.claude/launch.json`, config `harmonies-counter`) over Bash for this.
`/api/*` returns 500 in **local** `vercel dev` — `node_modules` isn't installed and there's no
local `DATABASE_URL`. This is a local-only gap, not a broken feature: staging and production both
have a working DB (see Deploying below). Don't spend time trying to fix the DB locally; deploy to
staging instead if you need to verify a DB-backed flow (save game, leaderboard, history).

Verify UI changes in the browser rather than by inspection, and check **both themes at 375px and
320px**. The settings bar shrinks via a `max-width: 372px` media query that must stay *after* the
base `.toggle-group button` rule to win on specificity.

## Deploying

There are **two separate Vercel projects**. `.vercel/project.json` in this folder links to the
staging one — a deploy from here never touches production.

| Target | Vercel project | Public URL | Command |
|---|---|---|---|
| **Production** | `faithful-tally` | https://faithful-tally.vercel.app | separate project, not deployed from here |
| Staging | `faithful-tally-preview` | https://harmonies-counter-gray.vercel.app | `vercel deploy --prod --yes` |

**The staging URL still says `harmonies-counter`, not `faithful-tally-preview`, and that's
intentional — read before renaming anything again.** The project itself *is* named
`faithful-tally-preview` (renamed 2026-08-10). But `vercel project rename` only renames the
project; it does not mint a new short `<name>-<word>.vercel.app` alias, so the original
`harmonies-counter-gray.vercel.app` from the project's first-ever deploy is still the only public,
non-gated URL it has. The auto-generated alias that *does* contain the new name —
`faithful-tally-preview-maxxyhs-projects.vercel.app` — is SSO-gated, because any alias containing
the team slug is protected by default; it 302s to a Vercel login and only opens for someone logged
into this Vercel team. Keep using the `-gray` URL as the link you actually hand to anyone.

**Staging has its own `DATABASE_URL`** (added 2026-08-10, copied from `faithful-tally`'s Neon
connection string — same database as production). Before that, every `/api/*` call on staging
500'd with `{"error":"server_error"}` because the project had zero environment variables. If a
fresh preview project is ever created from scratch, it needs this env var set explicitly —
`vercel env ls` returning empty for a project is *not* a code bug, check that first before
debugging `lib/db.mjs`.

**A brand-new project's very first `vercel deploy` (no flags) is auto-promoted to production**
regardless of the `--prod` flag being absent. This bit us once already: the first-ever deploy of
what's now `faithful-tally-preview` went live as production by surprise. Every deploy after the
first behaves normally (defaults to preview, `--prod` promotes).

## Git

Remote is `salomeong/harmonies-counter`. The local `maxxyh` identity currently has **read-only**
access, so pushes and PRs fail with a 403 until write access is granted. Commit locally; don't
fork without asking.
