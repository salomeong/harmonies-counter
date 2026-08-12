// 7 Wonders — pure declaration, no UI/CSS/iconography work. See src/games/harmonies.js's header
// comment for the category-descriptor contract this file implements.
//
// Formulas are verified against the printed 7 Wonders rule card. Don't "fix" these numbers.
//
// Component art lives in src/ui/art-7w.js and is drawn, not imported, same as Harmonies' tokens.
// The `dot` colours below are the game's real card colours (--sw-*), not palette approximations:
// players say "the red card" and "the purple card", so the swatch has to actually be that colour.

import { numOf } from "../scoring.js";
import { tallyControl, numberList } from "../ui/controls.js";
import { cardArt, scienceArt, warTokenArt, defeatTokenArt, coinArt } from "../ui/art-7w.js";

// ---- Military: four tallies, one of them worth NEGATIVE points ----
//
// Unlike any Harmonies/Faraway category, a single 7 Wonders category can score below zero — lose
// every conflict and you score -6, not 0. Each *count* still only ever climbs (every tally button
// below keeps its own `min: 0`; you can't un-lose a conflict) — it's only the category *total*
// that goes negative, which is exactly why the descriptor-level `min: -6` lives on `military`
// itself (read only via scorer.min(), per CLAUDE.md), completely separate from each button's own
// per-token `min: 0`.
//
// Each token here IS worth a fixed number of points regardless of board state (an Age I win is
// always +1, a defeat is always -1), so — like Harmonies' stacks — this uses a numeric `pip`, not
// a `cap`. What stacks and military do NOT share: a stack's points are always >= 0, so its pips
// are all positive; military's `loss` pip is genuinely -1, and CLAUDE.md's pip-colour-contrast
// rule (green-dark for points) doesn't obviously fit a negative pip — a follow-up UI concern, not
// this file's.
//
// infer is null: many {w1,w3,w5,loss} combinations land on the same total (e.g. total 4 could be
// one Age I win plus... there's no clean single inverse in general), so — same rule CLAUDE.md
// already applies to stacks/animal cards — a typed total stays a frozen override instead of being
// guessed apart into fake button state.
// The victory tokens carry their AGE (I/II/III) rather than their value, because the pip beside
// each button already shows the value — see art-7w.js.
const MILITARY_KEYS = [
  { key: "w1", pts: 1, art: () => warTokenArt(1), label: "Age I military victory, 1 point" },
  { key: "w3", pts: 3, art: () => warTokenArt(2), label: "Age II military victory, 3 points" },
  { key: "w5", pts: 5, art: () => warTokenArt(3), label: "Age III military victory, 5 points" },
  { key: "loss", pts: -1, art: defeatTokenArt, label: "Military defeat, -1 point" }
];

const military = {
  key: "military",
  label: "Military",
  hint: "Each age, compare shields with both neighbours. Win Age I/II/III: +1/+3/+5. Lose: -1.",
  dot: "--sw-red",
  icon: "⚔️",
  art: () => warTokenArt(3),
  min: -6, // 3 ages × 2 neighbours, every conflict lost — the true floor, not an arbitrary guess
  init: () => ({ military: { w1: 0, w3: 0, w5: 0, loss: 0 } }),
  points: p => MILITARY_KEYS.reduce((sum, k) => sum + numOf(p.military[k.key]) * k.pts, 0),
  controls: p => `<div class="tally-group">${MILITARY_KEYS.map(k => tallyControl({
    scoreCat: "military", path: "military", key: k.key,
    art: k.art,
    prefix: "×", min: 0,
    pip: k.pts,
    count: numOf(p.military[k.key]),
    label: k.label
  })).join("")}</div>`,
  // Defeats are the half everyone forgets to subtract, so the working spells the sign out.
  work: p => {
    const m = p.military;
    const wins = MILITARY_KEYS.slice(0, 3)
      .filter(k => numOf(m[k.key]) > 0)
      .map(k => `<span class="term">${numOf(m[k.key])} × ${k.pts}<b>${numOf(m[k.key]) * k.pts}</b></span>`);
    const losses = numOf(m.loss);
    if (!wins.length && !losses) return `<span class="term nil">no conflicts scored yet</span>`;
    return wins.join("") +
      (losses ? `<span class="term">${losses} defeat${losses === 1 ? "" : "s"}<b>−${losses}</b></span>` : "");
  },
  infer: null,
  detail: p => ({ ...p.military })
};

// ---- Treasury: coins, floor-divided by 3 ----
//
// Unlike Harmonies' fields/buildings (flat 5 points per token), treasury is integer division: 15,
// 16 and 17 coins all score 5, and the 0/1/2 leftover coins score nothing. That's what makes a
// typed total genuinely ambiguous — CLAUDE.md's established rule is that an ambiguous category
// keeps its typed override rather than inventing a count, so (deliberately) there is no `infer`
// here, matching Harmonies' stacks/animals.
//
// Points-per-tap also isn't fixed (2->3 coins is worth 1 more point, 3->4 is worth 0 more), so —
// like the river tally in Harmonies — the button shows a plain "coin" cap instead of a numeric pip.
const treasury = {
  key: "treasury",
  label: "Treasury",
  hint: "1 point per 3 coins, rounded down — leftover coins score nothing",
  dot: "--sw-gold",
  icon: "💰",
  art: coinArt,
  init: () => ({ treasury: 0 }),
  points: p => Math.floor(numOf(p.treasury) / 3),
  controls: p => `<div class="tally-group">${tallyControl({
    scoreCat: "treasury", path: "treasury", key: "",
    art: coinArt,
    prefix: "×", min: 0,
    cap: "coin",
    count: numOf(p.treasury), label: "Add a coin"
  })}</div>`,
  // The leftover coins are the surprise ("I had 17, why only 5?"), so name them explicitly.
  work: p => {
    const coins = Math.max(0, Math.trunc(numOf(p.treasury)));
    const rem = coins % 3;
    if (!coins) return `<span class="term nil">no coins yet</span>`;
    return `<span class="term">${coins} ÷ 3<b>${Math.floor(coins / 3)}</b></span>` +
      (rem ? `<span class="term nil">${rem} coin${rem === 1 ? "" : "s"} left over, scoring 0</span>` : "");
  },
  infer: null,
  detail: p => numOf(p.treasury)
};

// ---- Science: three symbol tallies, tablet² + compass² + gear² + 7·min(tablet,compass,gear) ----
//
// Like treasury, neither half of this formula is a fixed points-per-token value (the 3rd tablet is
// worth 5 more than the 2nd was; a 3rd symbol type can be worth +7 more than the token itself), so
// each tally shows a noun cap, not a numeric pip — same reasoning as treasury and Harmonies' river.
//
// infer is null: distinct {tablet,compass,gear} triples routinely land on the same total (e.g.
// both an unbalanced hand and a balanced one can sum to the same score), so a typed total stays a
// frozen override, same as military/treasury above.
const SCIENCE_KEYS = [
  { key: "tablet", label: "Add a tablet symbol" },
  { key: "compass", label: "Add a compass symbol" },
  { key: "gear", label: "Add a gear symbol" }
];

const science = {
  key: "science",
  label: "Science",
  hint: "tablet² + compass² + gear², plus 7 bonus points per complete set of all three symbols",
  dot: "--sw-green",
  icon: "🔬",
  art: () => scienceArt("gear"),
  init: () => ({ science: { tablet: 0, compass: 0, gear: 0 } }),
  points: p => {
    const t = numOf(p.science.tablet), c = numOf(p.science.compass), g = numOf(p.science.gear);
    return t * t + c * c + g * g + 7 * Math.min(t, c, g);
  },
  controls: p => `<div class="tally-group">${SCIENCE_KEYS.map(k => tallyControl({
    scoreCat: "science", path: "science", key: k.key,
    art: () => scienceArt(k.key),
    prefix: "×", min: 0,
    cap: k.key,
    count: numOf(p.science[k.key]),
    label: k.label
  })).join("")}</div>`,
  // This line is the reason the whole app exists. Science is the most-miscounted rule in
  // mainstream board gaming: the squares are easy to get wrong and the set bonus is easy to miss
  // entirely, so both halves are shown separately rather than collapsed into one number. 3/2/1
  // reads as 9 + 4 + 1, then "1 set × 7", and lands on 21.
  work: p => {
    const t = numOf(p.science.tablet), c = numOf(p.science.compass), g = numOf(p.science.gear);
    if (!t && !c && !g) return `<span class="term nil">no science symbols yet</span>`;
    const sq = SCIENCE_KEYS
      .map(k => numOf(p.science[k.key]))
      .filter(n => n > 0)
      .map(n => `<span class="term">${n}²<b>${n * n}</b></span>`)
      .join("");
    const sets = Math.min(t, c, g);
    return sq + (sets
      ? `<span class="set">${sets} set${sets === 1 ? "" : "s"} × 7<b>${sets * 7}</b></span>`
      : `<span class="term nil">no complete set yet — all three symbols scores +7</span>`);
  },
  infer: null,
  detail: p => ({ ...p.science })
};

// ---- The four card-pile categories: repeatable number lists, summed ----
//
// Same shape as Harmonies' animal cards / Faraway's fame lists (src/games/faraway.js's fameCat):
// a typed total has no unique inverse (13 points could be one card or several), so there is no
// `infer` and, since these categories never set canType: false, there IS an "Enter total" control
// for them — but it always freezes into an override rather than un-inverting, exactly like
// Harmonies' animal cards.
function pileCat({ key, label, hint, dot, icon, noun, cardKind }){
  return {
    key, label, hint, dot, icon,
    art: cardKind ? () => cardArt(cardKind) : undefined,
    listField: key,
    init: () => ({ [key]: [0] }),
    points: p => p[key].reduce((sum, v) => sum + numOf(v), 0),
    controls: p => numberList({
      playerId: p.id, cat: key, values: p[key], uidPrefix: "7w-",
      inputClass: "num-input", inputmode: "numeric",
      removeAriaLabel: `Remove this ${noun}`,
      addLabel: `+ Add ${noun}`
    }),
    infer: null,
    detail: p => p[key].map(numOf)
  };
}

// Wonder stages are built on the board rather than played as a card, so this one takes the stone
// brown of the wonder boards instead of a card colour.
const wonders = pileCat({
  key: "wonders", label: "Wonder stages", dot: "--sw-brown", icon: "🏛️", noun: "wonder stage",
  cardKind: "raw",
  hint: "VP printed on each wonder stage you built"
});

const civilian = pileCat({
  key: "civilian", label: "Civilian (blue)", dot: "--sw-blue", icon: "🏘️", noun: "blue card",
  cardKind: "civilian",
  hint: "VP printed on each blue civilian card"
});

const commercial = pileCat({
  key: "commercial", label: "Commercial (yellow)", dot: "--sw-yellow", icon: "🛒", noun: "yellow card",
  cardKind: "commercial",
  hint: "VP printed on each yellow card that scores points directly"
});

const guilds = pileCat({
  key: "guilds", label: "Guilds (purple)", dot: "--sw-purple", icon: "🎭", noun: "guild card",
  cardKind: "guild",
  hint: "VP earned by each purple guild card from whatever it counts around the table"
});

export const sevenwonders = {
  key: "7wonders",
  label: "7 Wonders",
  logo: "assets/7wonders-logo.png",
  tileArt: "assets/7wonders-tile-art.png",
  tagline: "Build a civilization, count its glory",
  subtitle: "End-of-game tally",
  minPlayers: 3,
  maxPlayers: 7,
  accordion: true,     // collapsible category drawers, like Harmonies
  categoryMode: true,  // offers the Player / Category mode toggle
  critters: false,     // no corner mascots
  // No per-player mascot: the mascot art is Harmonies' animals, and a fennec heading up a
  // 7 Wonders city reads as a bug rather than a flourish.
  mascots: false,
  waterToggle: false,  // no River / Islands toggle — 7 Wonders has no water-shaped category

  cats: [military, treasury, wonders, civilian, science, commercial, guilds]
  // no `sums` — 7 Wonders' printed pad has no group subtotals; the per-category pips and the grand
  // total are enough (unlike Harmonies' "landscape" / "+ animals" / "+ spirit" groupings).
};
