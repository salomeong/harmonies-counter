// Shared helpers used by more than one game declaration. Pulled out once a second game needed the
// exact same shape rather than a near-copy — see src/games/harmonies.js's header comment for the
// category-descriptor contract these helpers implement.

import { numOf } from "../scoring.js";
import { numberList } from "../ui/controls.js";

// A repeatable list of typed numbers, summed — for categories where a card's printed VP has no
// fixed per-token value (a civilian card might be worth 2, 5, or 8) and a typed total is therefore
// genuinely ambiguous (no unique inverse), so there is no `infer` and "Enter total" freezes into an
// override exactly like Harmonies' animal cards. Used by both 7 Wonders' base game and 7 Wonders
// Duel for civilian/science/commercial/guild-style piles.
//
// `art`, if given, is a function returning SVG (e.g. `() => cardArt("civilian")` from
// src/ui/art-7w.js) — this helper has no opinion on what a pile's art looks like, just its shape.
export function pileCat({ key, label, hint, dot, icon, art, noun, uidPrefix = "" }){
  return {
    key, label, hint, dot, icon, art,
    listField: key,
    init: () => ({ [key]: [0] }),
    points: p => p[key].reduce((sum, v) => sum + numOf(v), 0),
    controls: p => [numberList({
      playerId: p.id, cat: key, values: p[key], uidPrefix,
      inputClass: "num-input", inputmode: "numeric",
      removeAriaLabel: `Remove this ${noun}`,
      addLabel: `+ Add ${noun}`
    })],
    infer: null,
    detail: p => p[key].map(numOf),
    restore: (p, d) => { p[key] = Array.isArray(d) ? d.map(numOf) : []; }
  };
}
