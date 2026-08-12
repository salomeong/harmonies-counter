// Pure scoring functions, plus the game-agnostic scorer built on top of them.
//
// These take everything they need as arguments — no DOM, no module-level mutable state — so they
// can be unit tested and reused without booting the app.
//
// The old per-game switch statements (derivedPoints/catPoints/breakdown/totalPoints/
// inferFromTotal/waterPoints/LAND_CATS) that used to live here are gone — every category now
// carries its own `points`/`infer` logic on its descriptor (see src/games/harmonies.js's header
// comment for the contract), and makeScorer() below is the one path that reads them. A malformed
// `variant` — `{}`, a stray string, an array index from a bare `.map()` — must fall back to
// "river" rather than silently scoring the board as islands; each descriptor guards this inline
// (`v && v.waterSide === "island"`), not through a shared helper anymore.

export const STACK_PTS = { h1: 1, h2: 3, h3: 7 };

export function numOf(v){
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function stackPoints(stack){
  return numOf(stack.h1) * STACK_PTS.h1 + numOf(stack.h2) * STACK_PTS.h2 + numOf(stack.h3) * STACK_PTS.h3;
}

export function riverPoints(len){
  len = Math.max(0, Math.trunc(numOf(len)));
  if (len < 2) return 0;
  const table = { 2: 2, 3: 5, 4: 8, 5: 11, 6: 15 };
  if (len <= 6) return table[len];
  return 15 + (len - 6) * 4;
}

export function animalPoints(p){
  return p.animals.reduce((sum, v) => sum + numOf(v), 0);
}

// ---- Scoring ----
// Every score is read through catPoints(), so a category that has been overridden with a typed
// total behaves identically to one that was tallied. The badge, the "=" strip, the winner
// comparison and the save payload all funnel through breakdown() and cannot drift apart.

export function isTotalMode(p, cat){
  return p.totals && p.totals[cat] != null;
}

// A value on a category descriptor may be a plain value or a function of the variant — River and
// Islands are the same category wearing two different labels and hints.
export function resolve(v, variant){
  return typeof v === "function" ? v(variant) : v;
}

// ---- Scorer ----
// Binds one game declaration (see src/games/) to a live variant getter and returns the scoring
// surface the UI talks to. Everything a game can differ on lives in its `cats` descriptors, so the
// render/patch/wire code below can stay game-agnostic instead of growing a `switch` per game —
// which is how Faraway ended up as a second copy of the Harmonies scorer.
//
// The single scoring path from CLAUDE.md is preserved exactly: catPoints() still returns a typed
// override when present and the derived value otherwise, and total is still the sum of catPoints
// over every category. Nothing may read a category score any other way.
export function makeScorer(game, getVariant){
  const byKey = new Map(game.cats.map(c => [c.key, c]));
  const v = () => (getVariant ? getVariant() : undefined);

  const api = {
    game,
    keys: game.cats.map(c => c.key),
    cats: game.cats,
    cat: key => byKey.get(key),

    variant: v,
    label: key => resolve(byKey.get(key).label, v()),
    hint: key => resolve(byKey.get(key).hint, v()),
    dot: key => resolve(byKey.get(key).dot, v()),
    icon: key => resolve(byKey.get(key).icon, v()),

    derived(p, key){
      const c = byKey.get(key);
      return c ? c.points(p, v()) : 0;
    },

    catPoints(p, key){
      return isTotalMode(p, key) ? numOf(p.totals[key]) : api.derived(p, key);
    },

    // Total is summed over every category, not over the `sums` groups, so a category left out of
    // the "=" strip by mistake still reaches the badge rather than silently vanishing from scores.
    breakdown(p){
      const out = { total: game.cats.reduce((n, c) => n + api.catPoints(p, c.key), 0) };
      for (const s of (game.sums || [])){
        out[s.key] = s.cats.reduce((n, k) => n + api.catPoints(p, k), 0);
      }
      return out;
    },

    total(p){
      return api.breakdown(p).total;
    },

    newPlayer(id, name){
      // `id` is read before it is consumed by the caller's counter — naming off the post-increment
      // value is what used to label the third player "Player 4".
      const p = { id, name: name || `Player ${id}`, totals: {}, open: new Set([game.cats[0].key]) };
      for (const c of game.cats) Object.assign(p, c.init());
      return p;
    },

    resetCat(p, key){
      delete p.totals[key];
      const c = byKey.get(key);
      if (c) Object.assign(p, c.init());
    },

    resetPlayer(p){
      for (const c of game.cats) api.resetCat(p, c.key);
    },

    // Returns true when a typed total was inverted back into a count, so the category can drop out
    // of override mode. Categories with no `infer` are genuinely ambiguous and keep the override.
    infer(p, key, raw){
      const c = byKey.get(key);
      return c && c.infer ? !!c.infer(p, Math.max(0, Math.trunc(numOf(raw))), v()) : false;
    },

    canType(key){
      const c = byKey.get(key);
      return !!c && c.canType !== false;
    }
  };

  return api;
}
