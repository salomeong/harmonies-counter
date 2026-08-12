// Pure scoring functions for Harmonies, extracted from index.html.
//
// These take everything they need as arguments — no DOM, no module-level mutable state — so they
// can be unit tested and reused without booting the app.
//
// waterPoints/derivedPoints/catPoints/breakdown/totalPoints/inferFromTotal used to read a
// module-global `waterSide` in index.html. A pure module can't do that, so it's threaded through
// explicitly as a `variant` object: `{ waterSide: "river" | "island" }`. A missing/undefined
// `variant` defaults to `{ waterSide: "river" }`, matching the app's initial `waterSide` value.
//
// Read it through waterSideOf(), never `variant.waterSide` directly: any value that isn't a
// well-formed variant — `{}`, a stray string, an array index from a bare `.map(totalPoints)` —
// must fall back to "river" rather than silently scoring the board as islands. Guarding only
// against nullish is not enough, because `{}.waterSide` is undefined and `undefined !== "river"`
// takes the island branch.

const DEFAULT_VARIANT = { waterSide: "river" };

function waterSideOf(variant){
  const side = variant && variant.waterSide;
  return side === "island" ? "island" : DEFAULT_VARIANT.waterSide;
}

export const STACK_PTS = { h1: 1, h2: 3, h3: 7 };

export const LAND_CATS = ["trees", "mountains", "fields", "buildings", "water"];

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

export function waterPoints(p, variant){
  return waterSideOf(variant) === "river" ? riverPoints(p.river) : Math.max(1, numOf(p.islands)) * 5;
}

// ---- Scoring ----
// Every score is read through catPoints(), so a category that has been overridden with a typed
// total behaves identically to one that was tallied. The badge, the "=" strip, the winner
// comparison and the save payload all funnel through breakdown() and cannot drift apart.

export function derivedPoints(p, cat, variant){
  switch (cat){
    case "trees":     return stackPoints(p.trees);
    case "mountains": return stackPoints(p.mountains);
    case "fields":    return numOf(p.fields) * 5;
    case "buildings": return numOf(p.buildings) * 5;
    case "water":     return waterPoints(p, variant);
    case "animals":   return animalPoints(p);
    case "bonus":     return numOf(p.bonus);
    default:          return 0;
  }
}

export function isTotalMode(p, cat){
  return p.totals && p.totals[cat] != null;
}

export function catPoints(p, cat, variant){
  return isTotalMode(p, cat) ? numOf(p.totals[cat]) : derivedPoints(p, cat, variant);
}

export function breakdown(p, variant){
  const landscape = LAND_CATS.reduce((sum, cat) => sum + catPoints(p, cat, variant), 0);
  const animals = catPoints(p, "animals", variant);
  const spirit = catPoints(p, "bonus", variant);
  return { landscape, animals, spirit, total: landscape + animals + spirit };
}

export function totalPoints(p, variant){
  return breakdown(p, variant).total;
}

// Fields, buildings, islands and river are one number scaled by a known rule, so a typed total
// tells us the count outright. Recover it and drop back to tallying, rather than stranding the
// category on a frozen number the tally rows no longer agree with. Stacks and animal cards are
// genuinely ambiguous (13 could be many bucket combinations), so they keep the override.
export function inferFromTotal(p, cat, raw, variant){
  const total = Math.max(0, Math.trunc(numOf(raw)));

  if (cat === "fields" || cat === "buildings"){
    if (total % 5) return false;
    p[cat] = total / 5;
    return true;
  }

  if (cat === "water"){
    if (waterSideOf(variant) !== "river"){
      if (total % 5 || total < 5) return false;
      p.islands = total / 5;
      return true;
    }
    for (let len = 0; len <= 500; len++){
      if (riverPoints(len) === total){ p.river = len; return true; }
    }
    return false;
  }

  return false;
}
