// 7 Wonders Duel — Civilian Victory scoring only. See src/games/harmonies.js's header comment for
// the category-descriptor contract this file implements.
//
// Duel is NOT "7 Wonders for two players" scoring-wise. Despite sharing a box aesthetic with
// src/games/sevenwonders.js, almost every category works differently:
//   - Science has no tablet²/compass²/gear² formula. Green cards just carry printed VP, same shape
//     as blue cards — the symbol-pairing mechanic instead drafts Progress tokens.
//   - Military is ONE shared conflict pawn on a line between the two players, not two independent
//     win/loss tallies. It scores 0/2/5/10 VP to whichever side it leans toward, never both.
//   - Wonders are 12 specific, named boards with fixed printed VP (Pyramids 9 down to Temple of
//     Artemis 0), not generic "stages" — a player builds up to 4.
//   - Progress tokens are 10 named tokens; most score 0 VP and just grant a rule bonus. Mathematics
//     is the one dynamic formula: 3 × however many tokens a player holds, including itself.
//   - Guilds compare card-colour majorities BETWEEN the two players, cross-player logic nothing
//     else in this app needs — scored the same way the base game's guilds already are: type the
//     resulting VP after comparing at the table, rather than the app deriving a majority itself.
//
// Reaching military or scientific supremacy ends the game immediately with NO score counted at
// all — a fundamentally different session shape (see docs/ledger.md's ended_by note). This
// descriptor only covers the ordinary Civilian Victory ending; supremacy wins are a separate,
// later piece of work threading a winnerSeat through the save API.
//
// Formulas and printed VP values are verified against the official rulebook. Don't "fix" these.

import { numOf } from "../scoring.js";
import { tallyControl, tallyGroup, checkChip, checkGroup } from "../ui/controls.js";
import { cardArt, coinArt } from "../ui/art-7w.js";
import { pileCat } from "./_helpers.js";

// ---- Military: one shared conflict pawn, not a per-player tally ----
//
// Every other category in this app reads/writes ONE player's fields. Military can't: there is a
// single pawn on a shared track, so its position lives on the session's `variant` (see
// app/_state/useTally.js's militaryTrack), exactly like Harmonies' waterSide — game-level state,
// not per-player. `points(p, variant)` resolves which player the current zone favors by `p.id`,
// which is safe specifically because Duel's minPlayers === maxPlayers === 2 permanently disables
// add/remove — ids 1 and 2 never change during a game.
//
// Zones are symmetric around the neutral centre (0). The pawn only sits at a printed zone at all
// if the game ended by Civilian Victory: reaching the far zone (the opposing capital) is instead
// an instant Military Supremacy win with no VP counted, so that zone is deliberately absent here.
export const MILITARY_ZONES = [
  { value: -3, vp: 10 }, { value: -2, vp: 5 }, { value: -1, vp: 2 },
  { value: 0, vp: 0 },
  { value: 1, vp: 2 }, { value: 2, vp: 5 }, { value: 3, vp: 10 }
];

function militaryZoneVP(zone){
  const z = MILITARY_ZONES.find(m => m.value === zone);
  return z ? z.vp : 0;
}

const military = {
  key: "military",
  label: "Military",
  hint: "Set on the shared track above the player cards. The conflict pawn's final position is worth 0, 2, 5 or 10 VP to whichever side it leans toward — reaching the capital ends the game immediately instead, with no VP counted.",
  dot: "--sw-war",
  icon: "⚔️",
  init: () => ({}),
  points: (p, variant) => {
    const zone = numOf(variant && variant.militaryTrack);
    if (zone === 0) return 0;
    const favoredId = zone < 0 ? 1 : 2;
    return p.id === favoredId ? militaryZoneVP(zone) : 0;
  },
  controls: () => [],
  work: () => `<span class="term nil">set on the shared track above, not per player</span>`,
  canType: false,
  infer: null,
  // Nothing PER-PLAYER to store — the real value lives in the session's `variant`, saved and
  // restored independently of any category detail. This sentinel exists only so the recap's
  // `present` check (Recap.jsx) knows the category was genuinely tracked rather than rendering it
  // as "not tracked when this game was saved"; `restore` is a deliberate no-op since there is
  // nothing to write onto the player.
  detail: () => 1,
  restore: () => {}
};

// ---- The four printed-VP card piles: same shape as the base game's civilian/science/commercial/
// guilds, via the shared pileCat() helper (src/games/_helpers.js). Duel's science card VP is
// printed on the card, same as blue cards — there is no formula here, unlike sevenwonders.js. ----

const civilian = pileCat({
  key: "civilian", label: "Civilian (blue)", dot: "--sw-blue", icon: "🏘️", noun: "blue card",
  art: () => cardArt("civilian"), uidPrefix: "7wd-",
  hint: "VP printed on each blue civilian card"
});

const science = pileCat({
  key: "science", label: "Science (green)", dot: "--sw-green", icon: "🔬", noun: "green card",
  art: () => cardArt("science"), uidPrefix: "7wd-",
  hint: "VP printed on each green science card — Duel has no tablet/compass/gear formula, a card just carries its own printed VP"
});

const commercial = pileCat({
  key: "commercial", label: "Commercial (yellow)", dot: "--sw-yellow", icon: "🛒", noun: "yellow card",
  art: () => cardArt("commercial"), uidPrefix: "7wd-",
  hint: "VP printed on the few yellow cards that score points directly"
});

const guilds = pileCat({
  key: "guilds", label: "Guilds (purple)", dot: "--sw-purple", icon: "🎭", noun: "guild card",
  art: () => cardArt("guild"), uidPrefix: "7wd-",
  hint: "VP earned by each purple guild card — compare card counts with your opponent at the table, then type the resulting VP"
});

// ---- Wonders: 12 named boards with fixed, printed VP ----
//
// Unlike the base game's generic "wonder stages" pileCat, Duel's wonders are specific and their VP
// is known in advance — a checklist of named items is more faithful here than typing a number from
// memory, and matches this app's "nobody does mental arithmetic" ethos better. Rendered as
// checkChips (src/ui/controls.js), a build-once toggle: a player builds up to 4 of the 12.
const WONDER_DEFS = [
  { key: "pyramids", name: "Pyramids", vp: 9 },
  { key: "sphinx", name: "Sphinx", vp: 6 },
  { key: "greatLibrary", name: "Great Library", vp: 4 },
  { key: "greatLighthouse", name: "Great Lighthouse", vp: 4 },
  { key: "appianWay", name: "Appian Way", vp: 3 },
  { key: "circusMaximus", name: "Circus Maximus", vp: 3 },
  { key: "colossus", name: "Colossus", vp: 3 },
  { key: "hangingGardens", name: "Hanging Gardens", vp: 3 },
  { key: "statueOfZeus", name: "Statue of Zeus", vp: 3 },
  { key: "mausoleum", name: "Mausoleum", vp: 2 },
  { key: "piraeus", name: "Piraeus", vp: 2 },
  { key: "templeOfArtemis", name: "Temple of Artemis", vp: 0 }
];

const wonders = {
  key: "wonders",
  label: "Wonders",
  hint: "Each Wonder scores the VP printed on it — check off the ones you built (up to 4).",
  dot: "--sw-brown",
  icon: "🏛️",
  init: () => ({ wonders: Object.fromEntries(WONDER_DEFS.map(w => [w.key, 0])) }),
  points: p => WONDER_DEFS.reduce((sum, w) => sum + (numOf(p.wonders[w.key]) ? w.vp : 0), 0),
  controls: p => [checkGroup(WONDER_DEFS.map(w => checkChip({
    scoreCat: "wonders", path: "wonders", key: w.key,
    name: w.name, pip: w.vp,
    checked: numOf(p.wonders[w.key]) > 0,
    label: `${w.name}, ${w.vp} victory point${w.vp === 1 ? "" : "s"}`
  })))],
  canType: false,
  infer: null,
  detail: p => ({ ...p.wonders }),
  restore: (p, d) => {
    const b = d && typeof d === "object" ? d : {};
    p.wonders = Object.fromEntries(WONDER_DEFS.map(w => [w.key, numOf(b[w.key])]));
  }
};

// ---- Progress tokens: 10 named tokens, mostly 0 VP, Mathematics dynamic ----
//
// Most progress tokens score nothing directly — they grant a rule bonus during play instead, which
// is out of scope for an end-of-game tally. Mathematics is the one dynamic formula in Duel's whole
// scoring model: 3 VP for every progress token a player holds, INCLUDING Mathematics itself.
const PROGRESS_DEFS = [
  { key: "philosophy", name: "Philosophy", vp: 7 },
  { key: "agriculture", name: "Agriculture", vp: 4 },
  { key: "mathematics", name: "Mathematics", vp: null },
  { key: "architecture", name: "Architecture", vp: 0 },
  { key: "economy", name: "Economy", vp: 0 },
  { key: "law", name: "Law", vp: 0 },
  { key: "masonry", name: "Masonry", vp: 0 },
  { key: "strategy", name: "Strategy", vp: 0 },
  { key: "theology", name: "Theology", vp: 0 },
  { key: "urbanism", name: "Urbanism", vp: 0 }
];

function progressCount(p){
  return PROGRESS_DEFS.reduce((n, t) => n + (numOf(p.progress[t.key]) ? 1 : 0), 0);
}

const progress = {
  key: "progress",
  label: "Progress tokens",
  hint: "Most tokens score nothing directly (they grant rule bonuses instead). Philosophy is a flat 7, Agriculture a flat 4. Mathematics scores 3 VP for every progress token you hold, including itself.",
  dot: "--sw-green",
  icon: "⚙️",
  init: () => ({ progress: Object.fromEntries(PROGRESS_DEFS.map(t => [t.key, 0])) }),
  points: p => {
    const owned = progressCount(p);
    return PROGRESS_DEFS.reduce((sum, t) => {
      if (!numOf(p.progress[t.key])) return sum;
      return sum + (t.key === "mathematics" ? 3 * owned : t.vp);
    }, 0);
  },
  // Mathematics' chip shows what checking it would score right now, so its pip is recomputed live
  // rather than fixed — the one place in this descriptor a pip is not a constant.
  controls: p => {
    const owned = progressCount(p);
    return [checkGroup(PROGRESS_DEFS.map(t => checkChip({
      scoreCat: "progress", path: "progress", key: t.key,
      name: t.name,
      pip: t.key === "mathematics" ? 3 * owned : t.vp,
      checked: numOf(p.progress[t.key]) > 0,
      label: `${t.name} progress token`
    })))];
  },
  work: p => {
    if (!numOf(p.progress.mathematics)) return "";
    const owned = progressCount(p);
    return `<span class="term">Mathematics: 3 × ${owned} token${owned === 1 ? "" : "s"}<b>${3 * owned}</b></span>`;
  },
  canType: false,
  infer: null,
  detail: p => ({ ...p.progress }),
  restore: (p, d) => {
    const b = d && typeof d === "object" ? d : {};
    p.progress = Object.fromEntries(PROGRESS_DEFS.map(t => [t.key, numOf(b[t.key])]));
  }
};

// ---- Treasury: identical rule to the base game, floor(coins / 3) ----
const treasury = {
  key: "treasury",
  label: "Treasury",
  hint: "1 point per 3 coins, rounded down — leftover coins score nothing",
  dot: "--sw-gold",
  icon: "💰",
  art: coinArt,
  init: () => ({ treasury: 0 }),
  points: p => Math.floor(numOf(p.treasury) / 3),
  controls: p => [tallyGroup([tallyControl({
    scoreCat: "treasury", path: "treasury", key: "",
    art: coinArt,
    prefix: "×", min: 0,
    cap: "coin",
    count: numOf(p.treasury), label: "Add a coin"
  })])],
  work: p => {
    const coins = Math.max(0, Math.trunc(numOf(p.treasury)));
    const rem = coins % 3;
    if (!coins) return `<span class="term nil">no coins yet</span>`;
    return `<span class="term">${coins} ÷ 3<b>${Math.floor(coins / 3)}</b></span>` +
      (rem ? `<span class="term nil">${rem} coin${rem === 1 ? "" : "s"} left over, scoring 0</span>` : "");
  },
  infer: null,
  detail: p => numOf(p.treasury),
  restore: (p, d) => { p.treasury = numOf(d); }
};

export const sevenwondersduel = {
  key: "7wondersduel",
  label: "7 Wonders Duel",
  logo: "/assets/7wondersduel-logo.png",
  tileArt: "/assets/7wondersduel-tile-art.png",
  tagline: "Two cities, one winner",
  subtitle: "End-of-game tally — Civilian Victory",
  minPlayers: 2,
  maxPlayers: 2,
  accordion: true,
  categoryMode: true,
  critters: false,
  mascots: false,
  waterToggle: false,
  // Carries the shared military track's rung/VP data so app/page.jsx can render it generically
  // rather than checking game.key (CLAUDE.md's "adding a game" rule) — presence alone gates the
  // settings-bar block, the array itself is the rung definitions.
  militaryZones: MILITARY_ZONES,

  cats: [military, civilian, science, commercial, guilds, wonders, progress, treasury]
  // no `sums` — like the base game's printed pad, Duel's has no subtotal groupings; the
  // per-category pips and the grand total are enough.
};
