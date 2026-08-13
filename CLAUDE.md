# The Faithful Tally

A board-game score counter for **Harmonies**, **Faraway** and **7 Wonders**. Players tally an
end-of-game board and the app derives the score, so nobody does mental arithmetic.

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

```
styles.css          every rule — imported once by app/layout.jsx, otherwise untouched by the port
app/
  layout.jsx        <html>/<body>, metadata, Providers
  providers.jsx     TanStack Query client
  page.jsx          the interactive app: picker / landing / scorer / history / leaderboard
  not-found.jsx      whole-app 404 — reached in practice via a mistyped/removed /g/[id]
  g/[id]/
    page.jsx         the session recap — a Server Component, queries Postgres directly
    opengraph-image.jsx   share-preview card for the same route, via next/og
  _lib/
    format.js        formatDate — shared so the SPA and the recap can't drift
    mascots.js        the mascot image list — shared for a reason, see "RSC boundaries" below
    photos.js          photo-upload policy constants (cap, size, types) — server AND client need
                       the same numbers, so this is plain data too, for the same reason
  _state/
    useTally.js     the reducer that replaced the mutable `S` object
  _components/
    Controls.jsx    renders the control SPECS a descriptor declares (tally, ladder, list, num)
    Card.jsx        CatBody / CategoryBlock / SumStrip / PlayerCard — the LIVE, editable card
    Recap.jsx        the READ-ONLY recap — deliberately does not reuse Card.jsx's editing chrome
    ShareButton.jsx   client island on the recap page ("use client": clipboard copy)
    PhotoUpload.jsx   client island on the recap page (board photos — see "Board photos" below)
    Scorer.jsx      the two render modes, review grid, category tab strip
  api/*/route.js    the six route handlers, backed by Neon Postgres (lib/db.mjs, schema.sql)
                     and, for photo-upload, Vercel Blob (lib/session.mjs, @vercel/blob)
lib/
  db.mjs             getSql(), GAMES, id/name normalizers — unchanged since the port
  session.mjs         session+players+photos query (shared by GET /api/session and
                     app/g/[id]/page.jsx) plus the photo-upload helpers app/api/photo-upload
                     uses to check a session exists and to record a completed upload
src/                ← framework-free, and deliberately so
  scoring.js        pure scoring + makeScorer() + fromDetail() (the recap's reconstruction path)
  api.js            fetchJson + the client-side /api wrappers
  games/
    index.js        the GAMES registry
    harmonies.js    ← the category-descriptor contract is documented here
    faraway.js
    sevenwonders.js
  ui/
    controls.js     control SPECS (data, not markup) + token art + count helpers
    art-7w.js       7 Wonders component art (cards, struck tokens, coins)
```

### RSC boundaries: a plain data export from a `"use client"` file is not safe to import server-side

`app/_components/Recap.jsx` (a Server Component — `/g/[id]` renders it with no `"use client"`) used
to import `MASCOTS` from `Scorer.jsx`, which is `"use client"`. It looked fine — `MASCOTS` is a bare
array of strings — but on the server it resolved to `undefined`, and `<img src={undefined}>` renders
with no `src` at all: no error, no broken-image icon, just a blank circle. Next generates a client
reference for *the whole module* a `"use client"` file exports, not just its component exports, so a
plain constant doesn't cross that boundary the way it would in an ordinary same-side import.

Nothing catches this except actually rendering the page: `next build` succeeds (this route is
`force-dynamic`, so nothing is prerendered with real data), and Vitest can't see it either — RTL
renders straight through `"use client"` with no RSC bundler in the loop, so the bug only exists when
Next's real server/client split is in play. This is exactly why CLAUDE.md already says to verify UI
changes in the browser rather than by inspection; it's now also why data any Server Component might
need (`_lib/format.js`, `_lib/mascots.js`) lives in a plain module neither directive touches, not
inside a component file that happens to also export it.

The same reasoning applies to *props*, not just imports: `SumStrip` (from `Card.jsx`, `"use client"`)
is reused by the recap, but only ever handed `{ sums: game.sums }` — never the full `game`
descriptor, which carries live functions (`cat.points`, `cat.controls`, …) that cannot serialize
across a server→client prop boundary at all and throw immediately at render.

`public/assets/` holds images. **Asset paths are absolute (`/assets/…`)** — they were relative,
which breaks the moment a route is not at `/`.

### The framework decision (2026-08-13)

**Next.js 16 App Router + React 19 + TanStack Query, adopted wholesale.** Maxx's call, against a
recommendation to stay vanilla. Recorded here because docs/next.md previously attributed a
"framework trigger" to this file that was never in it — there was no rule, which is exactly why the
decision needed writing down.

What it bought: real routes, and `generateMetadata` on `/g/[id]` so a shared recap gets a per-session
OG card — unreachable for a hash-routed static app at any price. It also removed the no-bundler
constraint that made client-side Blob upload awkward.

What it cost: ~1,270 lines of working, tap-tested view code rewritten for no user-visible gain.

**`src/` stays framework-free.** `scoring.js`, `games/*`, `ui/controls.js` and `ui/art-7w.js` import
nothing from React or Next and moved through the port essentially unchanged — which is why all their
tests kept running under `node --test` throughout and could serve as the migration's safety net. Keep
it that way: if a game declaration ever imports React, the next port becomes a rewrite.

**JavaScript, not TypeScript.** Deliberate, so the port did not also rewrite the tested core. TS is
a clean follow-on, not a migration-time task.

**Migrate away from this stack only if** a genuinely different rendering target appears (native, an
embedded scorepad). Adding routes, charts or games is not a reason — those are what it is for.

### Shared state

`app/_state/useTally.js` is a `useReducer`, replacing the single mutable `S` object. Three things
did not survive the translation, each on purpose:

- **Nothing is mutated in place.** React decides what to re-render by referential equality, so
  `p.trees.h1++` is invisible to it. Each action `structuredClone()`s the one player it touches and
  hands the clone to the existing mutating helpers (`setCount`/`bumpCount`, `scorer.resetCat`,
  `cat.infer`), so there is still exactly one implementation of every rule.
- **`p.open` and `doneCats` are arrays, not `Set`s.** Sets don't survive JSON — which a player
  restored from the ledger must — and they invite the in-place mutation above.
- **Per-game state is still keyed by game key**, so Harmonies' River/Islands toggle cannot collide
  with another game's variant. That property predates the port and is still load-bearing.

### Tests

```bash
npm test                                 # node --test — the framework-free core in src/
npm run test:ui                          # vitest — the React components in app/
node scripts/score-fixtures.mjs --check  # characterization gate for refactors
```

**Two runners, deliberately.** `node --test` runs `src/` with no config and no toolchain; Vitest
runs the components. Merging them would mean putting the tested scoring core behind a transform,
which is the one thing the port was careful not to do. Vitest's `include` is scoped to
`app/**/*.test.jsx` so it never picks up the `node:test` files.

`scripts/score-fixtures.expected.json` pins whole-player totals across risky states and is the gate
for any scoring refactor — it stayed green through the entire framework migration, which is how we
know scoring never drifted. **When you change a scoring rule on purpose, regenerate it deliberately**
(`node scripts/score-fixtures.mjs > …`) and say so; never regenerate it to make a red check go green.

### The ledger (`schema.sql`, `api/*`)

A saved game is a **session**, not a row per player — `sessions` + `session_players` (+ `people`,
`session_photos`). `session_players.detail` holds the **raw entered state** from `scorer.detail(p)`,
never derived points, and `total_score` is authoritative and never recomputed from it.

Raw entered state includes **typed whole-category totals**, stored under the reserved `_totals` key
— they are what the human typed, and they are not recoverable from the tally fields. `scorer.
fromDetail(blob)` reads a row back and returns `{ player, present }`; every category declaring
`detail` must declare `restore(p, d)` as its inverse. **Never hand-roll that inverse in a view** —
`p[cat.key] = d` is wrong for Harmonies' `water` and Faraway's `region` and fails silently.

**Read [docs/ledger.md](docs/ledger.md) before touching `schema.sql`, `api/*`, or anything that
writes a score.**

### Board photos (`session_photos`, `@vercel/blob`)

Client-side upload straight to Vercel Blob, never proxied through a route — a phone photo is
3–8 MB and Vercel Functions cap request bodies at 4.5 MB, so a proxy fails on exactly the photos
people take. `app/_components/PhotoUpload.jsx` downscales to a ~1600px long edge via canvas before
uploading (falling back to the original file if `createImageBitmap` isn't available — the server's
`MAX_PHOTO_BYTES` is the real backstop, not the client downscale), then calls `@vercel/blob/client`'s
`upload()`, which POSTs to `app/api/photo-upload/route.js` for a token before talking to Blob
directly.

**`onUploadCompleted` — not a second client call — is what writes the `session_photos` row.** Vercel
calls it once the bytes have actually landed, independent of whether the tab that started the
upload is still open; a client-driven "now record this URL" call has a real gap (tab closes right
after the PUT succeeds, before the second call fires) that this doesn't. It **cannot fire against
localhost** — verify the persistence half on preview, same as every other DB-backed flow here (see
"Running it" below). Locally you can still verify token issuance and that bytes really reach Blob;
you just won't see the row afterward.

There is no login in this app. The honest threat model is a stranger with a real `public_id`, not
an authenticated bad actor — `onBeforeGenerateToken` checks the session genuinely exists and caps
photos per session (`MAX_PHOTOS_PER_SESSION` in `app/_lib/photos.js`), which is what stands between
that and someone filling the store. It does not and cannot stop a stranger who knows a real
`public_id` from adding a photo to *that* session.

`upload()`'s pathname is chosen by the **client**, not the server — there's no server-side override
in `@vercel/blob`'s client-upload flow. `onBeforeGenerateToken` validates it starts with
`sessions/<the-claimed-session's-public-id>/` rather than trusting it, which matters less as a
defence (it's our own client code, not adversarial input) than as a bug catch: it's what stops one
session's photo from silently landing in another's folder if that code is ever refactored wrong.

`scripts/sessions.mjs --delete` deletes the actual Blob objects (via `@vercel/blob`'s `del()`)
before dropping the session row — `session_photos` cascades the *database* row on its own, but the
image bytes in Blob storage don't go away without an explicit call.

### Adding a game

A game is a **declaration**, not code. Write `src/games/<game>.js` following the contract in
[src/games/harmonies.js](src/games/harmonies.js)'s header comment, register it in
`src/games/index.js`, and add its key to `GAMES` in [lib/db.mjs](lib/db.mjs). No component should
need a new branch. **If you find yourself adding `if (game.key === …)` to a component, the
descriptor contract is missing a field — add the field instead.** That branching is exactly how
Faraway became a second copy of the whole scorer.

**`controls(p, variant)` returns control SPECS — plain data, never markup.** An array of
`tallyGroup` / `ladder` / `list` / `num` objects (built by the helpers in `src/ui/controls.js`),
which `app/_components/Controls.jsx` renders. Descriptors emitting HTML was the one place a game
declaration carried view concerns, and the single thing that would have made a re-port a rewrite
rather than a view-layer swap. A descriptor must not import React.

A category can score below zero (7 Wonders' military: -1 per defeat token) by setting `min` on its
descriptor (default 0) — it's the floor for both the rendered total `<input min>` and what
`scorer.infer()` clamps a typed total to. `game.minPlayers` gates the remove-player button
(`players.length > game.minPlayers` in `renderByPlayer`); it does NOT gate the winner/crown check,
which stays `players.length > 1` on purpose (see the comment at that line — solo-player-isn't-a-
winner is a different question from the game's legal minimum). A flat-layout game (no accordion)
that wants its own card styling sets `cardClass` (Faraway sets `"fa"`) — `!game.accordion` used to
double as that trigger, which would have silently handed Faraway's colours to any future flat game
that didn't want them.

### Scoring model

All scores funnel through one path so the badge, the `=` strip, the winner comparison and the save
payload cannot disagree:

```
cat.points(p, variant) → scorer.catPoints(p, key) → scorer.breakdown(p) → scorer.total(p)
```

`makeScorer(game, getVariant)` binds one game declaration and is the only scoring surface the UI
talks to. `scorer.catPoints()` returns a typed override from `p.totals[key]` when present, otherwise
the category's derived value. **Never read a category score any other way.**

`scorer.total()` sums over **every** category, not over the `sums` groups, so a category
accidentally left out of the `=` strip still reaches the badge instead of vanishing from scores. A
test asserts `sums` partitions `cats` exactly once each.

`variant` is `{ waterSide }` — passed in rather than read from a global, so descriptors stay pure
and testable. `src/state.js` exports `variant()`, which reads `S.waterSide`.

**Never pass a scoring function as a bare callback.** `players.map(scorer.total)` hands `map`'s
*index* in as the second argument. That already bit once as `players.map(totalPoints)`, where the
index arrived as `variant` and silently flipped river scoring to islands for every player after the
first. Write `players.map(p => scorer.total(p))`. A wrong score doesn't throw — it prints a
plausible wrong number nobody re-checks.

### Patch hooks are gone — and what replaced them

The vanilla app updated numbers in place via `patchScores()`, so any number not wired to a
`data-pts-for`/`data-sum`/`data-count-for`/`data-work-for` hook silently froze at its initial value.
That shipped once, as Faraway's `.cat-pts` sitting at 0 while the total updated correctly.

**React removes the entire bug class**: every number is computed from `scorer` during render, and
there is no second update path that could fail to run. The hooks and `patchScores()` are deleted.

What was lost with them is the *assertion*: `card.test.js` proved a hook existed. The replacement
proves more — component tests render a category, simulate a real interaction, and assert the
rendered category score and total **actually change**. Keep those tests honest; they are the only
thing standing between a refactor and a silently frozen number.

**One thing is deliberately still injected as a string:** a tally button's contents (token art plus
its rule pip) are static for a given category, so `Controls.jsx` sets them once via
`dangerouslySetInnerHTML`. That keeps the button *element* stable across taps, which is what
preserves `:active` under a moving finger — the reason `patchScores()` existed in the first place.
Rebuild that node per render and the tap-fast feel goes with it.

### Showing the working

A category may define `work(p, variant) => html`, rendered under it inside `data-work-for` and
rebuilt on every patch. This is where the app stops being a calculator and starts being
trustworthy: 7 Wonders' science shows `3² 9 · 2² 4 · 1² 1` and then `1 set × 7`, so 21 is something
you can check rather than something you have to believe. Treasury names the leftover coins that
score nothing; military spells out the defeats, which is the half people forget to subtract.

### Three ways to enter a score

Players count differently, and all three are first-class per category:

1. **Tally** — tap a token button to increment (`data-role="tally"`)
2. **Bucket** — tap the count chip and type it (`data-role="editCount"`)
3. **Whole-category** — `✎ Enter total`, which freezes the number (`p.totals[cat]`)

For fields, buildings, islands and river a typed total is *inverted back* into the count by
`scorer.infer()` and the category returns to tally mode. Stacks and animal cards are ambiguous
(13 could be many bucket combinations) so they keep the override.

**A kept override is invisible to the tally fields, so it has to be saved separately.** Every
7 Wonders category and both Faraway categories are `infer: null`, so typing a total there is not an
edge case — on the formula categories (science, treasury) it is the fast way to score. That is why
`scorer.detail()` emits `_totals`; see [docs/ledger.md](docs/ledger.md).

### Rendering

- `Card.jsx` holds the player card (`CatBody`, `CategoryBlock`, `SumStrip`, `PlayerCard`);
  `Scorer.jsx` holds the two render modes, the category tab strip and the review grid. Both read
  every number from `scorer` during render — there is no separate update path.
- Two modes share one `players` array: stacked player cards, and the by-category tab strip. Both
  the card `=` strip and the review grid's sub-columns are generated from `game.sums` in full —
  one column per declared group, **never hardcoded group keys.** Hardcoding two columns is what
  once dropped Harmonies' third group ("spirit") entirely and rendered a literal "undefined" for
  any group that didn't match.
- The class names and the five `.view` container ids are unchanged from the vanilla markup, because
  `styles.css` keys off them — including `#view-scorer[data-game="7wonders"]`, which is how a game
  restyles its own pips. Renaming one silently unstyles a screen.
- **The settings bar is hidden outright when a game has neither toggle** (Faraway), rather than
  left as a bar containing one lone button.
- `waterSide` is per-game state, so a second game with its own variant toggle cannot collide with
  Harmonies' River/Islands state.

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

**Token art is generated, not imported.** `tokenArt(kind, height)` draws all nine Harmonies sprites
from one `tokenDisc()` cylinder helper using the `--tok-*` vars. No image files, crisp at any DPI,
themes correctly. A descriptor's `art` may instead be a **function returning SVG**, which is how
7 Wonders draws components that aren't discs (`src/ui/art-7w.js`: cards standing in the slot,
struck tokens, coins). Only the picker tile and masthead logo are imported images.

**Each game keeps the real component colours.** `--sw-*` are 7 Wonders' actual card colours at full
saturation, because players say "the red card" and "the purple card" — muting them into the
parchment palette would make the game harder to score, not more tasteful. `--sw-gold` (`#f0c000`) is
sampled from the printed wordmark, not guessed.

A game can restyle its own scorer via `#view-scorer[data-game="<key>"]` setting `--pip` / `--pip-ink`
/ `--rung`; 7 Wonders takes gold pips with `--sw-ink` over them (9.2:1). **The grand total stays
`--accent` in every game** so "the big orange blob is the final score" holds everywhere.

Scoring ladders are verified against the printed rule card and **must not be "fixed"**:

| Game | Ladders |
|---|---|
| Harmonies | stacks `0/1/3/7`; river length 1–6 → `0/2/5/8/11/15`, then `+4` each; fields/buildings/islands 5 each |
| 7 Wonders | science `t² + c² + g² + 7 × min(t,c,g)`; military `+1/+3/+5` per age won, `−1` per defeat (range −6..+18); treasury `floor(coins / 3)` |

7 Wonders' military is the only category that can score below zero — hence `min: -6` on its
descriptor. Its counts still never go negative; you tally 3 defeats, and the descriptor multiplies.

## Running it

```bash
npm run dev
```

Prefer the Browser pane (`.claude/launch.json`, config `harmonies-counter`) over Bash for this.

**`.env.local` has a working `DATABASE_URL`, so DB-backed flows DO run locally** — save game,
leaderboard, history and session reads all work against the real database. (This file used to say
they returned 500 locally; that stopped being true once the variable was added to the Development
environment, and it went unnoticed because nothing re-checked it.)

⚠️ **That local database is the production one.** Preview, production and your laptop all share it
by decision (docs/deploying.md), so a local save writes rows your friends will see. Testing the save
flow is fine; leaving the rows behind is not:

```bash
node --env-file=.env.local scripts/sessions.mjs                # list saved sessions
node --env-file=.env.local scripts/sessions.mjs <public_id>    # one session, detail and all
node --env-file=.env.local scripts/sessions.mjs --delete <id>  # remove it again
node --env-file=.env.local scripts/sessions.mjs --prune-people # drop people left with no games
```

`scripts/inspect-db.mjs` prints table row counts — the cheapest way to find out what you are
pointed at before doing anything destructive.

Verify UI changes in the browser rather than by inspection, and check **both themes at 375px and
320px**. The settings bar shrinks via a `max-width: 372px` media query that must stay *after* the
base `.toggle-group button` rule to win on specificity.

## Deploying

**One project, `faithful-tally`. `vercel deploy` publishes a preview; `vercel deploy --prod`
publishes to real users.** That is the opposite of what this repo's history assumes — until
2026-08-13 `--prod` was the safe everyday command, because it targeted a separate preview project.

**Read [docs/deploying.md](docs/deploying.md) before deploying or changing the schema** — it covers
the environments, the shared Neon database, why `vercel env pull` returns empty values, and Git.

