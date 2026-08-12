// Player-card markup builders, extracted from index.html's render code so a DOM-level regression
// net (card.test.js) can render them without booting the app in a browser.
//
// These are pure functions — no DOM access, no reads of index.html's module-level `game`/
// `scorer`/`showRules`/`waterSide` globals. Everything they need comes in as an argument. This is
// NOT a markup change: every string produced here is byte-identical to what index.html used to
// build inline (see CLAUDE.md's "Every rendered number needs a patch hook" section for why that
// matters — a card rebuilt to look the same but missing a `data-pts-for`/`data-sum`/
// `data-count-for` hook is a silent bug, not a visible one).

import { isTotalMode } from "../scoring.js";
import { escapeAttr } from "./controls.js";

// The scoring surface for one category: token buttons (or the frozen total), then the actions
// that get you out of trouble. Shared by both render modes (player cards and by-category rows)
// so they can never drift apart. Only reached for accordion games (Harmonies) — Faraway's flat
// form never calls this, it has no total-mode UI.
//
// `opts.variant` is the already-resolved variant object (e.g. `{ waterSide: "river" }`), not the
// `variant()` getter function — callers resolve it once per render, same as before.
export function catBody(scorer, p, key, opts = {}){
  const { variant } = opts;

  if (isTotalMode(p, key)){
    return `
      <div class="cat-body">
        <div class="total-edit">
          <input class="total-input" type="number" min="${scorer.min(key)}" inputmode="numeric"
                 value="${escapeAttr(p.totals[key])}" data-role="totalInput" data-cat="${key}"
                 data-uid="p${p.id}-total-${key}" aria-label="${escapeAttr(scorer.label(key))} total">
          <button class="revert-btn" data-role="revert" data-cat="${key}"
                  title="Back to tallying" aria-label="Back to tallying">↺</button>
        </div>
      </div>`;
  }

  const canType = scorer.canType(key);
  return `
    <div class="cat-body">
      ${scorer.cat(key).controls(p, variant)}
      <div class="cat-actions">
        <button class="mini-btn" data-role="resetCat" data-cat="${key}"
                aria-label="Reset ${escapeAttr(scorer.label(key))} to zero">↺ Reset</button>
        ${canType ? `<button class="mini-btn" data-role="toTotal" data-cat="${key}"
                aria-label="Type a total for ${escapeAttr(scorer.label(key))} instead of tallying">✎ Enter total</button>` : ""}
      </div>
    </div>`;
}

// Collapsed rows are the whole point of the accordion: a filled-in card reads as seven short
// lines instead of seven full control panels. Drawers toggle independently so several can be
// open at once. Games without `accordion` (Faraway) get the flat always-visible form instead —
// one div per category, no drawer, no total-mode UI, matching Faraway's markup from before this
// was generic.
//
// opts: { showRules, accordion, variant }
export function categoryBlock(scorer, p, key, opts = {}){
  const { showRules, accordion, variant } = opts;

  if (!accordion){
    return `
      <div class="category" data-cat="${key}">
        <div class="cat-label">${scorer.label(key)}</div>
        <div class="cat-pts" data-pts-for="${key}">${scorer.catPoints(p, key)}</div>
        ${scorer.cat(key).controls(p, variant)}
        <div class="cat-hint">${scorer.hint(key)}</div>
      </div>`;
  }
  const open = p.open.has(key);
  return `
    <div class="category acc${open ? " open" : ""}" data-cat="${key}">
      <button class="cat-head" data-role="openCat" data-cat="${key}" aria-expanded="${open}">
        <span class="tok-dot" style="background:var(${scorer.dot(key)})"></span>
        <span class="cat-name">${scorer.label(key)}</span>
        <span class="pip pip-score" data-pts-for="${key}">${scorer.catPoints(p, key)}</span>
        <span class="chev">${open ? "⌄" : "›"}</span>
      </button>
      ${open ? (showRules ? `<div class="cat-hint">${scorer.hint(key)}</div>` : "") + catBody(scorer, p, key, opts) : ""}
    </div>`;
}

// The "=" strip at the bottom of each player card. Driven entirely by `game.sums` — every group
// gets a column, so a game whose groups aren't named "landscape"/"animals" never renders a blank
// or literal "undefined" number (see reviewGrid()'s equivalent fix in index.html for the bug this
// avoids). The numbers are always "0" placeholders here; patchScores() fills them in via the
// `data-sum` hooks after the card is in the DOM, so this markup is identical for every player.
export function sumStrip(game){
  if (!game.sums) return "";
  return `
      <div class="card-sum">
        ${game.sums.map(s => `<span>${s.label} <b class="pip pip-sub" data-sum="${s.key}">0</b></span>`).join("\n        ")}
        <span class="eq">=</span><span class="pip pip-total" data-sum="total">0</span>
      </div>`;
}

// The full innerHTML for one player card in renderByPlayer: header (mascot/name/crown/total
// badge/remove button), the accordion tools row (Harmonies only), every category block, and the
// sum strip. index.html still creates the `<div class="player-card">` element itself and wires it
// (wireCard()) — those touch the DOM, not markup.
//
// opts: { mascotSrc, showRemove, showRules, variant }. `showRemove` is a plain boolean the caller
// computes (players.length > game.minPlayers) — this function doesn't know how many players there
// are, only whether to draw the button.
export function playerCardBody(game, scorer, p, opts = {}){
  const { mascotSrc, showRemove, showRules, variant } = opts;
  const totalBadgeClass = game.accordion ? "pip pip-total total-badge" : "total-badge";
  const allOpen = game.accordion && p.open.size === scorer.keys.length;
  const catOpts = { showRules, accordion: game.accordion, variant };

  return `
      <div class="player-header">
        ${game.mascots ? `<img class="mascot" src="${mascotSrc}" alt="">` : ""}
        <input type="text" value="${escapeAttr(p.name)}" data-role="name" data-uid="p${p.id}-name" />
        <span class="crown hidden">👑</span>
        <span class="${totalBadgeClass}">0</span>
        ${showRemove ? '<button class="remove-player" data-role="remove" aria-label="Remove player">✕</button>' : ''}
      </div>

      ${game.accordion ? `
      <div class="card-tools">
        <button class="mini-btn" data-role="toggleAll" aria-expanded="${allOpen}">
          ${allOpen ? "⌃ Collapse all" : "⌄ Expand all"}
        </button>
        <button class="mini-btn danger" data-role="resetPlayer">↺ Reset player</button>
      </div>` : ""}

      ${scorer.keys.map(key => categoryBlock(scorer, p, key, catOpts)).join("")}

      ${sumStrip(game)}
    `;
}
