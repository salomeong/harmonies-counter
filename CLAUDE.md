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
index.html          markup shell only — one <link>, one <script type="module" src="src/main.js">
styles.css          every rule
src/
  main.js           boot + top-level DOM event listeners
  state.js          S (the one mutable state object), variant(), per-game state, selectGame()
  api.js            fetchJson + the four /api wrappers
  scoring.js        pure scoring + makeScorer()
  games/
    index.js        the GAMES registry
    harmonies.js    ← the category-descriptor contract is documented here
    faraway.js
    sevenwonders.js
  ui/
    controls.js     pure HTML-string builders (token art, tally, ladders, lists)
    art-7w.js       7 Wonders component art (cards, struck tokens, coins)
    card.js         player-card markup (categoryBlock, catBody, playerCardBody, sumStrip)
    scorer.js       render / patchScores / wireCard — everything that draws a player card
    views.js        showView, picker, landing, history, leaderboard, save banner, chrome sync
```

`assets/` holds images; `api/` holds Vercel serverless functions backed by Neon Postgres
(`lib/db.mjs`, `schema.sql`).

**Still no build step, no framework, no bundler** — native ES modules and `node --test` need no
toolchain, and Vercel serves `src/*.js` as static assets. That property is worth protecting; the
"single file" rule that used to sit alongside it is not, and was retired once scoring needed to be
testable.

**Only `main.js`, `ui/scorer.js` and `ui/views.js` touch `document`.** Everything else is either
pure (`scoring.js`, `games/*`, `ui/controls.js`, `ui/card.js`, `ui/art-7w.js`) or plain state with
no DOM (`state.js`, `api.js`). That's what makes the bulk of it unit-testable, and what would make
a future framework port a view-layer port rather than a rewrite — so if you find yourself reaching
for `document` outside those three, put the DOM work in the view layer and call it from there.

**Shared mutable state is one exported object, `S`.** ES module bindings are read-only for
importers, so a bare `export let players` cannot be reassigned by the code that uses it. Read
`S.players`, write `S.players = …`, and **never destructure `S`** — destructuring snapshots the
value and silently stops seeing later reassignments.

`state.js` does not import `scorer.js`. `selectGame()` fires a callback registered by `main.js`
(`onGameSelected(render)`) instead of calling `render()` directly — state shouldn't know about
rendering, and it keeps the import graph acyclic.

### Tests

```bash
node --test                              # unit tests
node scripts/score-fixtures.mjs --check  # characterization gate for refactors
```

Node's built-in runner — no dependencies, no config. `scripts/score-fixtures.expected.json` pins
whole-player totals across risky states and is the gate for any scoring refactor. **When you change
a scoring rule on purpose, regenerate it deliberately** (`node scripts/score-fixtures.mjs > …`) and
say so; never regenerate it to make a red check go green.

### The ledger (`schema.sql`, `api/*`)

A saved game is a **session**, not a row per player — `sessions` + `session_players` (+ `people`,
`session_photos`). `session_players.detail` holds the **raw entered state** from `scorer.detail(p)`,
never derived points, and `total_score` is authoritative and never recomputed from it.

**Read [docs/ledger.md](docs/ledger.md) before touching `schema.sql`, `api/*`, or anything that
writes a score.**

### Adding a game

A game is a **declaration**, not code. Write `src/games/<game>.js` following the contract in
[src/games/harmonies.js](src/games/harmonies.js)'s header comment, register it in
`src/games/index.js`, and add its key to `GAMES` in [lib/db.mjs](lib/db.mjs). Nothing in
`index.html` should need a new branch. **If you find yourself adding `if (game.key === …)` to the
render/patch/wire code, the descriptor contract is missing a field — add the field instead.** That
branching is exactly how Faraway became a second copy of the whole scorer.

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

### Every rendered number needs a patch hook

Taps call `patchScores()`, not `render()`, so **any number in the markup that isn't wired to a
`data-pts-for` / `data-sum` / `data-count-for` / `data-work-for` hook will silently freeze at its
initial value.** This has already shipped once: Faraway's `.cat-pts` was rendered without
`data-pts-for`, so its per-category scores sat at 0 while the total updated correctly.
`src/ui/card.test.js` asserts every score-bearing element in every game's markup carries a hook —
keep it passing rather than deleting the assertion.

The test does this two ways, and both are load-bearing. It renders each category twice (an
all-zero player and a fully-populated one) and requires that **anything whose text differs between
the two renders sits under a hook** — which automatically ignores static rule constants like the
1/3/7 token pips, since those read the same in both. That check is blind to elements which ship a
constant placeholder and are only ever filled by `patchScores()` (the `=` strip, the total badge),
so those are asserted structurally instead.

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

### Rendering

- The player-card markup itself — `categoryBlock()`, `catBody()`, `playerCardBody()`, `sumStrip()`
  — lives in [src/ui/card.js](src/ui/card.js) as pure functions (game/scorer/player/opts in,
  HTML string out). [src/ui/scorer.js](src/ui/scorer.js) creates the DOM node, sets `innerHTML`
  from these, and wires it (`wireCard()`) — nothing that touches `document` lives in `card.js`.
  Keeping that line sharp is what lets the markup be tested at all.
- `render()` rebuilds the container; use it only for **structural** change (add/remove player,
  add/remove animal card, open/close a drawer, mode or water-side switch).
- `patchScores()` updates numbers **in place** and is what every tap calls. Taps arrive fast; a
  full rebuild per tap loses `:active` and gets sluggish with four players.
- Patch hooks — keep these intact when editing markup: `data-pid` on each player container,
  `data-pts-for`, `data-count-for`, `data-minus-for`, `data-sum`, `.total-badge`, `.crown`,
  `.ladder [data-rung]`.
- Two modes share one `players` array: `renderByPlayer()` (accordion cards) and
  `renderByCategory()` (tab strip + `reviewGrid()`). Both the card-sum strip and `reviewGrid()`'s
  sub-columns are generated from `game.sums` in full — one column per declared group, never
  hardcoded group keys. A group name that doesn't match a hardcoded column used to render a
  literal "undefined" (`patchScores()` does `b[el.dataset.sum]`); driving both off `game.sums`
  is what closed that.
- `waterSide` is per-game state (in `gameState`, mirrored to the module-level `waterSide` the same
  way `scoreMode` is), not a bare global — a second game with its own variant toggle can't collide
  with Harmonies' River/Islands state. `selectGame()` resyncs both `#modeToggle` and `#waterToggle`
  button `.active` classes from the restored state.

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
vercel dev --yes --listen 3000
```

Prefer the Browser pane (`.claude/launch.json`, config `harmonies-counter`) over Bash for this.
`/api/*` returns 500 in **local** `vercel dev` — there's no local `DATABASE_URL`
(`node_modules` used to be missing too; it's installed now for the tests). Both
have a working DB (see Deploying below). Don't spend time trying to fix the DB locally; deploy to
staging instead if you need to verify a DB-backed flow (save game, leaderboard, history).

Verify UI changes in the browser rather than by inspection, and check **both themes at 375px and
320px**. The settings bar shrinks via a `max-width: 372px` media query that must stay *after* the
base `.toggle-group button` rule to win on specificity.

## Deploying

**One project, `faithful-tally`. `vercel deploy` publishes a preview; `vercel deploy --prod`
publishes to real users.** That is the opposite of what this repo's history assumes — until
2026-08-13 `--prod` was the safe everyday command, because it targeted a separate preview project.

**Read [docs/deploying.md](docs/deploying.md) before deploying or changing the schema** — it covers
the environments, the shared Neon database, why `vercel env pull` returns empty values, and Git.

