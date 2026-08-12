# Deploying, environments and Git

Referenced from CLAUDE.md. Read this before any deploy or schema change — the commands here
publish to real users.


**One project: `faithful-tally`.** `.vercel/project.json` links to it, and Vercel's own
Production/Preview environments do the staging job.

| Target | Command | URL |
|---|---|---|
| Preview | `vercel deploy --yes` | `faithful-tally-<hash>-maxxyhs-projects.vercel.app` (SSO-gated) |
| **Production** | `vercel deploy --prod --yes` | https://faithful-tally.vercel.app — **this is what your friend sees** |

> ⚠️ **`--prod` now publishes to real users.** Until 2026-08-13 this folder was linked to a second
> project (`faithful-tally-preview`), so `vercel deploy --prod` was the *safe* everyday command and
> is written that way all over this file's history. It isn't any more. **Plain `vercel deploy` is
> the everyday command; `--prod` is a deliberate act.**

Preview URLs contain the team slug, so they 302 to a Vercel login — fine for testing while signed
in, but not a link you can hand to anyone. That is the one thing the retired second project gave
us (its `harmonies-counter-gray.vercel.app` alias predated the team-slug rule and stayed public).
If a shareable pre-release link is ever needed again, add a proper domain rather than resurrecting
a duplicate project.

**Preview and production share one Neon database, deliberately** (decided 2026-08-13). The
integration's *Create Database Branch For Deployment* checkboxes are greyed out on this setup, and
sharing is an accepted trade for a three-friend app. Two consequences to hold in mind:

- A preview deployment reads and writes the **same rows as production**. Testing against a preview
  URL touches real games.
- A schema change has no automatic rehearsal — but it need not be run blind. **Neon supports
  branching by hand**: create a branch in the Neon console, point a local `DATABASE_URL` at it, run
  the change there, then run it against main. Worth doing for anything destructive once real games
  exist.

**Applying a schema change:** `node --env-file=.env.local scripts/init-db.mjs`, after
`vercel env pull` (see the note below on why that needs the Development environment). Look before
you overwrite — `scripts/inspect-db.mjs` prints the tables and row counts of whatever
`DATABASE_URL` currently points at, which is the cheapest way to find out you are aimed at
production.

**`vercel env pull` returns Production/Preview values as empty strings.** Vercel marks them
*sensitive* by default (hence `vercel env add --no-sensitive`, "opt out of the sensitive default on
Production and Preview"), which makes them write-only — `env pull` yields `DATABASE_URL=""` rather
than failing, so it looks like a CLI bug and isn't. To run anything locally against the real
database (`scripts/init-db.mjs`), add the variable to the **Development** environment as well;
Development vars are not sensitive and do pull. In the dashboard you can tick Development on the
existing variable without re-entering the value.

**A brand-new project's very first `vercel deploy` (no flags) is auto-promoted to production**
regardless of the `--prod` flag being absent. This bit us once already, on the first-ever deploy of
the now-retired preview project. Every deploy after the first behaves normally (defaults to
preview, `--prod` promotes) — so this only matters if a fresh project is ever created.

**The retired `faithful-tally-preview` project still exists** (2026-08-13) and still answers on
`harmonies-counter-gray.vercel.app`, now serving a stale build. Delete it when you're confident
nothing points at it; until then, don't be confused by a second live copy of the app.

## Git

Remote is `salomeong/harmonies-counter`. The local `maxxyh` identity **has push access** (granted
2026-08-12; it was previously read-only and 403'd, which is why older notes said to commit locally
only). Don't fork without asking. CI runs `node --test` and the scoring-fixture check on every push
— see [.github/workflows/test.yml](.github/workflows/test.yml).
