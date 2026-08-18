// Harmonies — the original game, and the reference for the category-descriptor contract.
//
// ---- The contract ----
// A game declares `cats`: an ordered array of category descriptors. Everything that used to be a
// `switch (cat)` arm in index.html is now a field here, so render/patch/wire code never needs to
// know which game it is drawing.
//
// REQUIRED
//   key      string   stable identifier. Used in `data-*` hooks, in p.totals, and (later) as the
//                     key in the saved ledger `detail` JSON. ADD FREELY, NEVER RENAME — renaming
//                     one silently orphans every game already saved under the old key.
//   label    string | (variant) => string   heading text
//   init     () => object   the player fields this category owns, as a partial player object.
//                     Object.assign'd onto a new player and re-applied on reset — which is why it
//                     returns `{river: 0, islands: 1}` rather than a bare value: one category may
//                     own more than one field.
//   points   (p, variant) => number   the derived score. NEVER read a category score directly;
//                     go through the scorer so a typed override behaves identically (CLAUDE.md).
//   controls (p, variant) => string   the tally/entry HTML for this category
//   detail   (p) => any   raw entered state for the ledger. Raw, NOT derived points: "science: 21"
//                     cannot reconstruct "3 tablets, 2 compasses, 1 gear".
//   restore  (p, d) => void   the DECLARED INVERSE of `detail`. Writes the blob `d` back onto a
//                     fresh player so a saved game can be re-scored and shown. Required wherever
//                     `detail` is declared (registry.test.js asserts the pair), and deliberately
//                     NOT defaulted to a generic `p[key] = d`: harmonies' water writes two
//                     top-level fields (river/islands) under one detail key, and Faraway's
//                     fameCat's key ("region") differs from its field ("regionFame"), so a
//                     generic inverse would silently restore neither. Must tolerate a malformed
//                     or missing blob rather than throw — it is reading data from Postgres.
//                     Typed whole-category overrides ride along separately under the reserved
//                     `_totals` key, handled by scorer.fromDetail(), not by any restore().
//

//   infer    null | ((p, total, variant) => boolean)
//                     The FIELD is either a function or the literal null — it is not a function
//                     that may return null. A function inverts a typed total back into a count,
//                     mutating p and returning true (or false if that total has no valid inverse).
//                     null means the category is genuinely ambiguous — 13 could be many bucket
//                     combinations — so it keeps the frozen override instead.
//
// OPTIONAL — these are Harmonies-shaped conveniences, not universal requirements. A game with no
// tab strip or token palette (Faraway) legitimately sets none of them.
//   hint     string | (variant) => string   one-line rule explanation, shown when `?` is on
//   dot      string | (variant) => string   CSS custom property for the colour dot
//   icon     string   short glyph, used as-is in the review grid's compact column header
//   art      string   tokenArt() kind (e.g. "tree", "water"), used for the category tab strip in
//                     by-category mode. When absent, the tab strip falls back to a plain `icon`
//                     glyph (that's how "Nature Spirit / bonus" has always rendered there — it has
//                     no drawn token). `icon` and `art` serve two different renderings of "what
//                     represents this category" and are NOT interchangeable: `icon` is bare text
//                     sized for a table header, `art` is a kind name fed to tokenArt() for a 34px
//                     drawn sprite. A category can set one, the other, both, or neither.
//   work     (p, variant) => string   HTML "showing the working" under the controls, rebuilt on
//                     every patch inside `data-work-for`. This is where the app stops being a
//                     calculator and becomes checkable: 7 Wonders' science renders `3² 9 · 2² 4 ·
//                     1² 1` then `1 set × 7`, so 21 is something you can verify rather than
//                     believe. Pure like everything else here, so a recap can call it too.
//   activeRung (p, variant) => number   which ladder rung is lit, when `controls` draws a ladder
//   canType  boolean   default true; false hides "✎ Enter total" (bonus is already a bare number)
//   listField  string   name of the player array a repeatable list (`numberList()`) writes to,
//                     e.g. "animals". Lets index.html's generic listInput/listAdd/listRemove
//                     handlers find the right field without a per-game switch.
//   valueField string   name of the player scalar a single number input (`numField()`) writes to,
//                     e.g. "bonus". Same idea as `listField`, for the single-input shape.
//   min      number   default 0. The floor for this category's typed total — both the rendered
//                     `<input min>` and the value `infer()` clamps a typed total to before passing
//                     it on. Most categories can't score negative, so 0 is right almost everywhere;
//                     a category that CAN (7 Wonders' military, -1 per defeat token) sets a lower
//                     min so a typed -3 stays -3 instead of flooring to 0. Read only through
//                     `scorer.min(key)` — never hardcode 0 in a control or `infer` clamp.
//
// `sums` declares the "=" strip. Its keys become `data-sum` attributes, and the groups must
// partition `cats` exactly once each — there is a test asserting that.

import { numOf, stackPoints, riverPoints, animalPoints } from "../scoring.js";
import { tallyControl, tallyGroup, riverLadder, numField, numberList } from "../ui/controls.js";

export const STACK_PTS = { h1: 1, h2: 3, h3: 7 };

// Point values are derived from STACK_PTS, never restated — a pip that disagreed with the score
// it produces would recreate the exact confusion the pips exist to remove.
const STACK_KEYS = [
  { key: "h1", height: 1 },
  { key: "h2", height: 2 },
  { key: "h3", height: 3 }
].map(s => ({ ...s, pts: STACK_PTS[s.key] }));

// Trees and mountains are the same shape: three height buckets scoring 1/3/7.
function stackCat({ key, label, hint, dot, icon, art, noun }){
  return {
    key, label, hint, dot, icon, art,
    init: () => ({ [key]: { h1: 0, h2: 0, h3: 0 } }),
    points: p => stackPoints(p[key]),
    controls: p => [tallyGroup(STACK_KEYS.map(s => tallyControl({
      scoreCat: key, path: key, key: s.key, art, height: s.height, prefix: "×", min: 0,
      pip: s.pts,
      count: numOf(p[key][s.key]),
      label: `Add a height-${s.height} ${noun}, ${s.pts} point${s.pts === 1 ? "" : "s"}`,
      // Only the height-1 pile gets a big step: it's the cheapest token, so a full board of trees
      // or mountains piles up the most single-height-1 taps of the three buckets. h2/h3 counts stay
      // small enough in practice that ±1 alone is fine, and a bigStep on all three would just add
      // visual noise to a row that's already three tally controls wide.
      bigStep: s.key === "h1" ? 5 : undefined
    })))],
    // A stack total is ambiguous — 13 could be many bucket combinations — so it keeps the override.
    infer: null,
    detail: p => ({ ...p[key] }),
    restore: (p, d) => {
      const b = d && typeof d === "object" ? d : {};
      p[key] = { h1: numOf(b.h1), h2: numOf(b.h2), h3: numOf(b.h3) };
    }
  };
}

const trees = stackCat({
  key: "trees", label: "Trees", dot: "--tok-tree", icon: "🌳", art: "tree", noun: "tree",
  hint: "1 green token on 0/1/2 brown = height 1/2/3, scoring 1/3/7 each"
});

const mountains = stackCat({
  key: "mountains", label: "Mountains", dot: "--tok-mountain", icon: "⛰", art: "mountain", noun: "mountain",
  hint: "Only count mountains adjacent to another mountain — scores 1/3/7 by height, else 0"
});

// Water is the awkward one, and therefore the useful example: its label, hint, controls, scoring
// and inversion all depend on which side of the board is in play, and it owns two player fields.
const water = {
  key: "water",
  icon: "💧",
  art: "water",
  dot: "--tok-water",
  label: v => (v && v.waterSide === "island" ? "Islands" : "River"),
  hint: v => (v && v.waterSide === "island"
    ? "5 pts per island (area cut off by blue tokens) — you always have at least 1"
    : "Shortest path length of your longest river: 2→2, 3→5, 4→8, 5→11, 6→15, +4 per token beyond 6"),

  init: () => ({ river: 0, islands: 1 }),

  points: (p, v) => (v && v.waterSide === "island"
    ? Math.max(1, numOf(p.islands)) * 5
    : riverPoints(p.river)),

  controls: (p, v) => {
    if (v && v.waterSide === "island"){
      return [tallyGroup([tallyControl({
        scoreCat: "water", path: "islands", key: "", art: "water", prefix: "×", min: 1,
        pip: 5,
        count: Math.max(1, numOf(p.islands)), label: "Add an island, 5 points"
      })])];
    }
    return [
      tallyGroup([tallyControl({
        scoreCat: "water", path: "river", key: "", art: "water", prefix: "len ", min: 0,
        cap: "+1 tile",
        count: numOf(p.river), label: "Extend the river by one token",
        bigStep: 5 // a scoring river can run past 6+ tiles (into the "+4 each" tail); +1-only
                   // taps make the far end of the ladder tedious to reach
      })]),
      riverLadder()
    ];
  },

  infer: (p, total, v) => {
    if (v && v.waterSide === "island"){
      if (total % 5 || total < 5) return false;
      p.islands = total / 5;
      return true;
    }
    for (let len = 0; len <= 500; len++){
      if (riverPoints(len) === total){ p.river = len; return true; }
    }
    return false;
  },

  // The ladder's last rung stands for "7 or more", so long rivers all light it.
  activeRung: p => {
    const len = Math.max(0, Math.trunc(numOf(p.river)));
    return len >= 7 ? 7 : len;
  },

  detail: p => ({ river: numOf(p.river), islands: numOf(p.islands) }),

  // Water is exactly why `restore` has to be declared rather than derived: its detail key is
  // "water" but it owns two TOP-LEVEL player fields, so the obvious generic inverse
  // (`p[cat.key] = d`) would write a useless `p.water` and leave river/islands at their init
  // values — scoring every restored board as a length-0 river. Both sides are always restored
  // regardless of the active variant, matching what detail() always writes.
  restore: (p, d) => {
    const b = d && typeof d === "object" ? d : {};
    p.river = numOf(b.river);
    p.islands = numOf(b.islands);
  }
};

// Fields and buildings are the same shape: a single ×5 tally whose typed total is unambiguous
// (any multiple of 5 came from exactly one count), so — unlike stacks — a typed total infers
// straight back into the count instead of staying frozen.
function countCat({ key, label, hint, dot, icon, art, noun }){
  return {
    key, label, hint, dot, icon, art,
    init: () => ({ [key]: 0 }),
    points: p => numOf(p[key]) * 5,
    controls: p => [tallyGroup([tallyControl({
      scoreCat: key, path: key, key: "", art, prefix: "×", min: 0,
      pip: 5,
      count: numOf(p[key]), label: `Add a ${noun}, 5 points`
    })])],
    infer: (p, total) => {
      if (total % 5) return false;
      p[key] = total / 5;
      return true;
    },
    detail: p => numOf(p[key]),
    restore: (p, d) => { p[key] = numOf(d); }
  };
}

const fields = countCat({
  key: "fields", label: "Fields", dot: "--tok-field", icon: "🌾", art: "field", noun: "field",
  hint: "Each group of 2+ contiguous yellow tokens = 1 field, 5 pts each"
});

const buildings = countCat({
  key: "buildings", label: "Buildings", dot: "--tok-building", icon: "🏠", art: "building", noun: "building",
  hint: "Red on brown/gray/red, surrounded by 3+ differently colored tokens — 5 pts each"
});

// Animal cards are the genuinely ambiguous list category: a total of 13 could be one card
// reading 13 or several cards summing to it, so a typed total has no unique inverse and the
// category has no `infer` — it stays in override mode until reset, same as stacks.
const animals = {
  key: "animals",
  label: "Animal cards",
  hint: "Points showing on the topmost empty slot of each card",
  dot: "--tok-brown",
  icon: "🐾",
  art: "brown",
  listField: "animals",
  init: () => ({ animals: [0] }),
  points: p => animalPoints(p),
  controls: p => [numberList({
    playerId: p.id, cat: "animals", values: p.animals, uidPrefix: "",
    inputClass: "num-input", inputmode: "numeric",
    removeAriaLabel: "Remove this card",
    addLabel: "+ Add card"
  })],
  infer: null,
  detail: p => p.animals.map(numOf),
  restore: (p, d) => { p.animals = Array.isArray(d) ? d.map(numOf) : []; }
};

// Nature Spirit / bonus is already a bare number — there is no tally to invert a typed total
// back into, so `canType` is false and `infer` is moot (never called: canType gates the "Enter
// total" control that would otherwise put this category into override mode in the first place).
const bonus = {
  key: "bonus",
  label: "Nature Spirit / bonus",
  hint: "Read directly off any Nature Spirit card effect",
  dot: "--accent",
  icon: "✨",
  canType: false,
  valueField: "bonus",
  init: () => ({ bonus: 0 }),
  points: p => numOf(p.bonus),
  controls: p => [numField(p.id, "bonus", p.bonus, "extra points")],
  infer: null,
  detail: p => numOf(p.bonus),
  restore: (p, d) => { p.bonus = numOf(d); }
};

export const harmonies = {
  key: "harmonies",
  label: "Harmonies",
  logo: "/assets/logo.png",
  tileArt: "/assets/harmonies-tile-art.jpg",
  tagline: "Build landscapes, settle animals",
  subtitle: "End-of-game tally",
  minPlayers: 1,
  maxPlayers: 4,
  accordion: true,     // collapsible category drawers
  categoryMode: true,  // offers the Player / Category mode toggle
  critters: true,      // corner mascots
  mascots: true,       // per-player mascot in the card header
  waterToggle: true,   // offers the River / Islands toggle
  tiebreak: null,

  cats: [trees, mountains, fields, buildings, water, animals, bonus],

  sums: [
    { key: "landscape", label: "landscape", cats: ["trees", "mountains", "fields", "buildings", "water"] },
    { key: "animals",   label: "+ animals", cats: ["animals"] },
    { key: "spirit",    label: "+ spirit",  cats: ["bonus"] }
  ]
};

export { stackCat, STACK_KEYS };
