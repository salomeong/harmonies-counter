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
// since Faraway has no "Enter total" control at all.
function fameCat({ key, field, label, hint }){
  return {
    key,
    label,
    hint,
    listField: field,
    init: () => ({ [field]: [0] }),
    points: p => p[field].reduce((sum, v) => sum + numOf(v), 0),
    controls: p => numberList({
      playerId: p.id, cat: key, values: p[field], uidPrefix: "fa-",
      rowHint: "fame from this card",
      addLabel: "+ Add card"
    }),
    infer: null,
    detail: p => p[field].map(numOf)
  };
}

// The emoji lives inline in the label text (not a separate `icon`/`dot`) because that's how
// Faraway's `.cat-label` renders it — Faraway has no tok-dot or tab strip to feed a separate
// glyph into (categoryMode/accordion are both off), so inventing one here would be UI copy no
// existing screen asked for.
const region = fameCat({
  key: "region", field: "regionFame",
  label: "🗺️ Region cards",
  hint: "Reveal right to left; enter each card's fame if its prerequisite is met"
});

const sanctuary = fameCat({
  key: "sanctuary", field: "sanctuaryFame",
  label: "⛩️ Sanctuaries",
  hint: "Scored after all Region cards, same way"
});

export const faraway = {
  key: "faraway",
  label: "Faraway",
  logo: "assets/faraway-logo.png",
  tileArt: "assets/faraway-tile-art.jpg",
  tagline: "Journey home, reveal your fame",
  subtitle: "Reveal your cards right to left, add up the fame",
  minPlayers: 1,
  maxPlayers: 6,
  accordion: false,     // no collapsible drawers — both categories are always visible
  categoryMode: false,  // no Player / Category toggle
  critters: false,      // no corner mascots
  mascots: false,        // no per-player mascot in the card header
  waterToggle: false,   // no River / Islands toggle — Faraway has no water category

  cats: [region, sanctuary]
  // no `sums` — Faraway's total is just region + sanctuary, with no "=" strip grouping to name.
};
