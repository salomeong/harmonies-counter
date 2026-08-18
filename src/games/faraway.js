// Faraway — two categories, both repeatable number lists: Region cards are revealed right to
// left and typed in one at a time, then Sanctuaries are scored the same way afterwards. See
// src/games/harmonies.js for the category-descriptor contract.
//
// Faraway is a pure declaration — index.html's render/patch/wire code reads these descriptors
// generically (via `listField` and the shared `numberList()`/`categoryBlock()` machinery) instead
// of the hand-rolled renderFaraway/faFameList/wireFaCard it used to have. accordion/categoryMode/
// waterToggle/mascots/critters are all off, so index.html renders Faraway's flat "always visible"
// category form instead of Harmonies' collapsible drawers.

import { numOf } from "../scoring.js";
import { numberList } from "../ui/controls.js";

// Region and Sanctuary are the same shape: a repeatable list of typed fame values, summed. Like
// Harmonies' animal cards, a typed total has no unique inverse (13 fame could be one card or
// several), so there is no `infer` — the UI never freezes an override here in the first place,
// Card-by-card entry remains useful for checking the reveal; the flat category view also offers
// direct total entry for players who have already done the arithmetic.
function fameCat({ key, field, label, hint }){
  return {
    key,
    label,
    hint,
    listField: field,
    init: () => ({ [field]: [0] }),
    points: p => p[field].reduce((sum, v) => sum + numOf(v), 0),
    controls: p => [numberList({
      playerId: p.id, cat: key, values: p[field], uidPrefix: "fa-",
      // Without inputClass, NumberList (Controls.jsx) renders a bare `.animal-row input`, which
      // has no font-size rule anywhere — not too small, simply absent, landing on the browser's
      // ~13px form-control default and triggering iOS Safari's zoom-on-focus on every tap in Full
      // scorecard mode. Reusing num-input (already covered by styles.css's mobile input-zoom fix)
      // rather than inventing a Faraway-specific class for the same thing 7 Wonders' pileCat()
      // categories already use it for. Found by adversarial review, 2026-08-18.
      inputClass: "num-input",
      // Missing here (unlike 7 Wonders' pileCat() piles and Harmonies' animal cards, which both
      // set this) meant iOS fell back to the full QWERTY keyboard rather than the numeric pad —
      // most visible once "+ Add" started auto-focusing the new row (2026-08-18), since a
      // programmatic focus() is where the gap actually surfaces; a manual tap on an already-mounted
      // field can still show the right keyboard on some iOS versions even without this attribute.
      inputmode: "numeric",
      rowHint: key === "region" ? "fame on the next revealed card" : "sanctuary fame",
      addLabel: key === "region" ? "+ Add next revealed card" : "+ Add sanctuary"
    })],
    infer: null,
    detail: p => p[field].map(numOf),
    // Second reason a generic inverse can't exist (harmonies' water is the first): here the detail
    // key and the player field are different names — key "region", field "regionFame" — so the
    // restore has to be told which field it owns, exactly as `init` and `points` already are.
    restore: (p, d) => { p[field] = Array.isArray(d) ? d.map(numOf) : []; }
  };
}

// The emoji lives inline in the label text (not a separate `icon`/`dot`) because that's how
// Faraway's `.cat-label` renders it — Faraway has no tok-dot or tab strip to feed a separate
// glyph into (categoryMode/accordion are both off), so inventing one here would be UI copy no
// existing screen asked for.
const region = fameCat({
  key: "region", field: "regionFame",
  label: "Region cards",
  hint: "Start at the rightmost card and travel left. Add fame only when its prerequisite is met."
});

const sanctuary = fameCat({
  key: "sanctuary", field: "sanctuaryFame",
  label: "Sanctuaries",
  hint: "Score these after all eight Region cards have been revealed."
});

export const faraway = {
  key: "faraway",
  label: "Faraway",
  logo: "/assets/faraway-logo.png",
  tileArt: "/assets/faraway-tile-art.jpg",
  tagline: "Journey home, reveal your fame",
  subtitle: "Journey home: reveal right to left, then score Sanctuaries",
  minPlayers: 1,
  maxPlayers: 7, // base game seats 6; raised to 7 per Maxx's request to match the expansion
  accordion: false,     // no collapsible drawers — both categories are always visible
  categoryMode: false,  // no Player / Category toggle
  guidedReveal: true,   // default to the physical right-to-left journey; full scorecard remains available
  critters: false,      // no corner mascots
  mascots: false,        // no per-player mascot in the card header
  waterToggle: false,   // no River / Islands toggle — Faraway has no water category
  cardClass: "fa",      // explicit opt-in to the `.player-card.fa` purple/orange styling — kept
                         // separate from `accordion` so a future flat-layout game doesn't inherit
                         // Faraway's colours just by also having `accordion: false`

  cats: [region, sanctuary]
  // no `sums` — Faraway's total is just region + sanctuary, with no "=" strip grouping to name.
};
