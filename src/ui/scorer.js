// The scorer view: renders player cards / category tabs, patches scores in place after every tap,
// and wires the click/input handlers on card markup. Moved out of index.html's inline script —
// see CLAUDE.md's "Rendering" section for the render() vs patchScores() contract these functions
// implement, and the module-level `S` object (src/state.js) for why `game`/`scorer`/`players`/
// `activeCat`/`doneCats`/`scoreMode` are all read and written through it instead of bare `let`s.

import { S, variant, syncGameState } from "../state.js";
import { numOf } from "../scoring.js";
import { tokenArt, getCount, setCount, bumpCount, escapeAttr } from "./controls.js";
import { catBody, playerCardBody } from "./card.js";

export const MASCOTS = [
  "assets/animal-fennec.png",
  "assets/animal-rabbit.png",
  "assets/animal-bird.png",
  "assets/animal-boar.png",
  "assets/animal-mouse.png"
];

// Small icon for the by-category tab strip — the same drawn tokens as the tally buttons, so the
// strip reads as the same visual language rather than a separate icon set. A category's `art`
// drives this when present — either a tokenArt() kind for the disc-shaped games, or a function
// returning its own SVG for a game whose components aren't discs (7 Wonders draws cards and struck
// tokens). Without one (bonus/spirit has no drawn token) it falls back to the plain `icon` glyph,
// exactly like the old hardcoded switch's `default` arm did.
export function catTabIcon(key){
  const c = S.scorer.cat(key);
  if (typeof c.art === "function") return c.art();
  return c.art ? tokenArt(c.art, 1) : `<span class="tab-glyph">${S.scorer.icon(key)}</span>`;
}

// catBody/categoryBlock/playerCardBody/sumStrip (the markup builders these used to be) now live
// in src/ui/card.js as pure functions — see CLAUDE.md's "Every rendered number needs a patch
// hook" section for why that move happened. This module still owns everything that touches the
// DOM: creating elements, calling render()/patchScores(), and wiring events.

export function render(){
  syncGameState();

  const active = document.activeElement;
  let focusUid = null, selStart = null, selEnd = null;
  if (active && active.dataset && active.dataset.uid){
    focusUid = active.dataset.uid;
    if (typeof active.selectionStart === "number"){
      selStart = active.selectionStart;
      selEnd = active.selectionEnd;
    }
  }

  // At the cap the button stays put but reads as inert (see .footer-bar button:disabled). Say why,
  // so it isn't just a control that mysteriously stopped working.
  const addBtn = document.getElementById("addPlayer");
  const atCap = S.players.length >= (S.game.maxPlayers || Infinity);
  addBtn.disabled = atCap;
  if (atCap) addBtn.title = `${S.game.label} seats up to ${S.game.maxPlayers} players`;
  else addBtn.removeAttribute("title");

  const container = document.getElementById("players");
  container.innerHTML = "";

  if (S.scoreMode === "category" && S.game.categoryMode) renderByCategory(container);
  else renderByPlayer(container);

  patchScores();

  // The strip scrolls, so a tab picked from the far end must be brought back into view.
  const tab = container.querySelector(".cat-tab.active");
  if (tab) tab.scrollIntoView({ block: "nearest", inline: "center" });

  if (focusUid){
    const el = container.querySelector(`[data-uid="${focusUid}"]`);
    if (el){
      el.focus();
      if (selStart !== null && el.setSelectionRange){
        try { el.setSelectionRange(selStart, selEnd); } catch (e) {}
      }
    }
  }
}

function renderByPlayer(container){
  S.players.forEach((p, idx) => {
    const card = document.createElement("div");
    // `cardClass` is an explicit opt-in (set by Faraway) rather than `!game.accordion` doubling
    // as the trigger — a future flat-layout game with no cardClass gets plain `.player-card`
    // styling instead of silently inheriting Faraway's `.fa` colours.
    card.className = "player-card" + (S.game.cardClass ? " " + S.game.cardClass : "");
    card.dataset.pid = p.id;

    card.innerHTML = playerCardBody(S.game, S.scorer, p, {
      mascotSrc: MASCOTS[idx % MASCOTS.length],
      // The game's declared minimum, not a hardcoded ">1" — a game whose rules require e.g. 3
      // players (7 Wonders) must not let itself get tallied down to 1.
      showRemove: S.players.length > S.game.minPlayers,
      showRules: S.showRules,
      variant: variant()
    });

    container.appendChild(card);
    wireCard(card, p);
  });
}

function renderByCategory(container){
  const tabs = S.scorer.keys.map(key => {
    return `
      <button class="cat-tab${S.activeCat === key ? " active" : ""}${S.doneCats.has(key) ? " done" : ""}"
              data-role="pickCat" data-cat="${key}" aria-label="${escapeAttr(S.scorer.label(key))}"
              aria-current="${S.activeCat === key}">
        ${catTabIcon(key)}
        <span class="tick" aria-hidden="true">✓</span>
      </button>`;
  }).join("");

  container.insertAdjacentHTML("beforeend", `
    <div class="cat-tabs" role="tablist">
      ${tabs}
      <button class="cat-tab review${S.activeCat === "__review" ? " active" : ""}"
              data-role="pickCat" data-cat="__review" aria-label="Review all scores">Σ</button>
    </div>`);

  if (S.activeCat === "__review"){
    container.insertAdjacentHTML("beforeend", reviewGrid());
    return;
  }

  const page = document.createElement("div");
  page.className = "cat-page";
  page.innerHTML = `
    <div class="cat-page-head">
      <span class="tok-dot" style="background:var(${S.scorer.dot(S.activeCat)})"></span>
      <span class="cat-page-name">${S.scorer.label(S.activeCat)}</span>
    </div>
    ${S.showRules ? `<div class="cat-hint">${S.scorer.hint(S.activeCat)}</div>` : ""}
  `;
  container.appendChild(page);

  S.players.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "cat-row";
    row.dataset.pid = p.id;
    // The row itself is the `[data-cat]` ancestor patchScores() looks for when it needs to know
    // which descriptor governs a `.ladder` inside it (see patchScores below).
    row.dataset.cat = S.activeCat;
    row.innerHTML = `
      <div class="row-head">
        ${S.game.mascots ? `<img class="mascot small" src="${MASCOTS[idx % MASCOTS.length]}" alt="">` : ""}
        <span class="row-name">${escapeAttr(p.name)}</span>
        <span class="pip pip-score" data-pts-for="${S.activeCat}">0</span>
        <span class="total-badge small">0</span>
      </div>
      ${catBody(S.scorer, p, S.activeCat, { variant: variant() })}
    `;
    page.appendChild(row);
    wireCard(row, p);
  });

  const next = nextUndoneCat();
  page.insertAdjacentHTML("beforeend", `
    <div class="cat-page-foot">
      <button class="mini-btn" data-role="nextCat">${next === "__review" ? "Review →" : S.scorer.label(next) + " →"}</button>
    </div>`);
}

// "Next" walks to the next category still needing attention rather than the next index, so the
// arrow stays useful however much you jumped around with the tabs.
export function nextUndoneCat(){
  const keys = S.scorer.keys;
  const start = keys.indexOf(S.activeCat);
  for (let i = 1; i <= keys.length; i++){
    const key = keys[(start + i) % keys.length];
    if (!S.doneCats.has(key) && key !== S.activeCat) return key;
  }
  return "__review";
}

// The review grid is only ever shown for category-mode games (Harmonies today). Its sub-columns
// are generated from `game.sums`, one per declared group — a game whose groups aren't named
// "landscape"/"animals" used to render a literal "undefined" column here (patchScores() does
// `b[el.dataset.sum]`), and Harmonies' own third group ("spirit") never got a column at all
// because the two sub-columns were hardcoded. Rendering every group is a visible change for
// Harmonies (a third "+ spirit" column now appears) — see CLAUDE.md/the refactor report for why
// that was left as-is rather than truncated.
export function reviewGrid(){
  const keys = S.scorer.keys;
  const sumGroups = S.game.sums || [];
  return `
    <div class="review-grid-wrap">
      <table class="review-grid">
        <thead>
          <tr>
            <th class="who">Player</th>
            ${keys.map(k => `<th title="${escapeAttr(S.scorer.label(k))}">${S.scorer.icon(k)}</th>`).join("")}
            ${sumGroups.map(s => `<th class="sub" title="${escapeAttr(s.label)}">${escapeAttr(s.label)}</th>`).join("")}
            <th class="grand">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${S.players.map(p => `
            <tr data-pid="${p.id}">
              <td class="who">${escapeAttr(p.name)}</td>
              ${keys.map(k => `<td data-pts-for="${k}">0</td>`).join("")}
              ${sumGroups.map(s => `<td class="sub" data-sum="${s.key}">0</td>`).join("")}
              <td class="grand"><span class="pip pip-score" data-sum="total">0</span></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

export function setText(el, v){
  if (el && el.textContent !== String(v)) el.textContent = String(v);
}

// Taps come in fast, so scores are patched in place rather than re-rendering the container —
// a rebuild per tap loses the :active state and gets sluggish once there are 3-4 cards. This is
// now the ONLY path Faraway's fame inputs go through too (they used to trigger a full
// renderFaraway() per keystroke).
export function patchScores(){
  const container = document.getElementById("players");
  if (!container) return;

  const totals = S.players.map(p => S.scorer.total(p));
  const maxTotal = totals.length ? Math.max(...totals) : -1;
  const leaders = totals.filter(t => t === maxTotal && maxTotal > 0).length;

  S.players.forEach((p, idx) => {
    // Every view — player cards, category rows, review grid rows — tags its container with the
    // player id and uses the same data-pts-for / data-sum hooks, so one patch pass drives all of them.
    const card = container.querySelector(`[data-pid="${p.id}"]`);
    if (!card) return;

    const b = S.scorer.breakdown(p);
    // Deliberately `players.length > 1`, NOT `game.minPlayers` — this gates "a solo player isn't
    // a winner" (you can't beat nobody), a different question from the game's legal minimum
    // (which gates the remove-player button in renderByPlayer instead).
    const isWinner = totals[idx] === maxTotal && maxTotal > 0 && S.players.length > 1;
    card.classList.toggle("winner", isWinner);

    const crown = card.querySelector(".crown");
    if (crown) crown.classList.toggle("hidden", !(isWinner && leaders === 1));
    card.querySelectorAll(".total-badge").forEach(el => setText(el, b.total));

    card.querySelectorAll("[data-pts-for]").forEach(el => {
      setText(el, S.scorer.catPoints(p, el.dataset.ptsFor));
    });
    card.querySelectorAll("[data-count-for]").forEach(el => {
      const [path, key] = el.dataset.countFor.split(":");
      setText(el, getCount(p, path, key));
    });
    card.querySelectorAll("[data-minus-for]").forEach(el => {
      const [path, key] = el.dataset.minusFor.split(":");
      el.disabled = getCount(p, path, key) <= Number(el.dataset.min || 0);
    });

    // Generic ladder patching: find the category that owns this `.ladder` via its enclosing
    // `[data-cat]`, and — only if that descriptor declares `activeRung` — light the matching rung.
    // Length 0 lights none, same as before: `activeRung` returns 0 and no rung's data-rung is "0".
    card.querySelectorAll(".ladder").forEach(ladder => {
      const catEl = ladder.closest("[data-cat]");
      const key = catEl && catEl.dataset.cat;
      const c = key && S.scorer.cat(key);
      if (!c || !c.activeRung) return;
      const active = c.activeRung(p, variant());
      ladder.querySelectorAll("[data-rung]").forEach(r => {
        r.classList.toggle("on", Number(r.dataset.rung) === active);
      });
    });

    card.querySelectorAll("[data-sum]").forEach(el => setText(el, b[el.dataset.sum]));

    // "Show your working" lines rebuild their inner markup rather than a single number, so they
    // are patched by innerHTML. Same rule as every other hook: if a category renders one and it
    // isn't wired here, it silently freezes — src/ui/card.test.js asserts the hook is present.
    card.querySelectorAll("[data-work-for]").forEach(el => {
      const c = S.scorer.cat(el.dataset.workFor);
      if (c && c.work) el.innerHTML = c.work(p, variant());
    });
  });
}

// Swaps a count chip for a text field in place. The chip node itself is put back on commit, so
// nothing around it is rebuilt — if this re-rendered the card, a tap on a token while the field
// was focused would blur it, destroy the token, and lose the tap.
export function startCountEdit(chip, p){
  const path = chip.dataset.path;
  const key = chip.dataset.key;
  const min = Number(chip.dataset.min || 0);

  const input = document.createElement("input");
  input.type = "number";
  input.min = min;
  input.inputMode = "numeric";
  input.className = "count-input";
  input.value = getCount(p, path, key);
  input.dataset.role = "countInput";
  input.dataset.path = path;
  input.dataset.key = key;
  // carried through so typing a count marks the category done, exactly as tapping it does
  input.dataset.scoreCat = chip.dataset.scoreCat || "";

  let closed = false;
  const commit = () => {
    if (closed) return;
    closed = true;
    setCount(p, path, key, Math.max(min, Math.trunc(numOf(input.value))));
    input.replaceWith(chip);
    patchScores();
  };

  input.addEventListener("blur", commit);
  // Some mobile keyboards commit without ever firing blur.
  input.addEventListener("change", commit);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === "Escape"){
      e.preventDefault();
      input.blur();
      commit();
    }
  });

  chip.replaceWith(input);
  input.focus();
  input.select();

  // If focus did not really take, blur will never fire and the field would be stranded in place —
  // which also loses the data-count-for hook that keeps it in sync. focus() still sets
  // activeElement on an unfocused document, so check hasFocus() too. Nobody is typing into an
  // unfocused document, so committing straight back to a chip is the right degradation.
  if (!document.hasFocus() || document.activeElement !== input) commit();
}

export function wireCard(card, p){
  const nameInput = card.querySelector('[data-role="name"]');
  if (nameInput) nameInput.addEventListener("input", e => { p.name = e.target.value; });

  card.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn || !card.contains(btn)) return;
    const d = btn.dataset;
    const cat = d.cat;

    switch (d.role){
      case "tally":
        bumpCount(p, d.path, d.key, 1, Number(d.min || 0));
        markDone(d.scoreCat);
        patchScores();
        break;
      case "minus":
        bumpCount(p, d.path, d.key, -1, Number(d.min || 0));
        markDone(d.scoreCat);
        patchScores();
        break;
      case "editCount":
        startCountEdit(btn, p);
        break;
      case "resetCat":
        S.scorer.resetCat(p, cat);
        render();
        break;
      case "toTotal":
        // Seed with the current derived score so switching modes freezes the value rather
        // than changing it.
        p.totals[cat] = S.scorer.catPoints(p, cat);
        render();
        focusTotalInput(p.id, cat);
        break;
      case "revert":
        delete p.totals[cat];
        render();
        break;
      case "openCat":
        if (p.open.has(cat)) p.open.delete(cat); else p.open.add(cat);
        render();
        break;
      case "toggleAll":
        if (p.open.size === S.scorer.keys.length) p.open.clear();
        else S.scorer.keys.forEach(k => p.open.add(k));
        render();
        break;
      case "resetPlayer":
        if (confirm(`Reset every category for ${p.name || "this player"}?`)){
          S.scorer.resetPlayer(p);
          render();
        }
        break;
      case "remove":
        S.players = S.players.filter(pl => pl.id !== p.id);
        render();
        break;
      case "listAdd":
        p[S.scorer.cat(cat).listField].push(0);
        render();
        break;
      case "listRemove":
        p[S.scorer.cat(cat).listField].splice(Number(d.index), 1);
        render();
        break;
    }
  });

  card.addEventListener("input", e => {
    const d = e.target.dataset;
    switch (d.role){
      case "listInput":  p[S.scorer.cat(d.cat).listField][Number(d.index)] = e.target.value; markDone(d.cat); patchScores(); break;
      case "numInput":   p[S.scorer.cat(d.cat).valueField] = e.target.value; markDone(d.cat); patchScores(); break;
      case "totalInput": p.totals[d.cat] = e.target.value; markDone(d.cat); patchScores(); break;
      case "countInput": setCount(p, d.path, d.key, e.target.value); markDone(d.scoreCat); patchScores(); break;
    }
  });

  // Inference runs on commit, not per keystroke — mid-typing "1" of "15" would otherwise
  // snap the category back to tally mode under the cursor.
  card.addEventListener("focusout", e => {
    const d = e.target.dataset;
    if (d.role !== "totalInput") return;
    if (S.scorer.infer(p, d.cat, e.target.value)){
      delete p.totals[d.cat];
      render();
    }
  });
}

export function markDone(cat){
  if (cat && !S.doneCats.has(cat)) S.doneCats.add(cat);
}

export function focusTotalInput(playerId, cat){
  const el = document.querySelector(`[data-uid="p${playerId}-total-${cat}"]`);
  if (el){ el.focus(); el.select(); }
}
