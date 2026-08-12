// Pure HTML-string builders and small state helpers, extracted from index.html.
//
// These return strings (or read/write a plain `p` object) — no DOM, no module-level mutable
// state — so they can be unit tested and reused without booting the app.

import { numOf, riverPoints } from "../scoring.js";

// ---- Token art ----
// The physical tokens are discs seen at a low angle sitting in a cream hex recess, so one
// cylinder helper (ellipse top face + extruded side wall) draws all of them; a tree is just a
// green disc stacked on 0/1/2 brown ones, a mountain is 1/2/3 grey ones.

export const TOK_FILL = {
  tree:     ["--tok-tree", "--tok-tree-d"],
  brown:    ["--tok-brown", "--tok-brown-d"],
  mountain: ["--tok-mountain", "--tok-mountain-d"],
  field:    ["--tok-field", "--tok-field-d"],
  building: ["--tok-building", "--tok-building-d"],
  water:    ["--tok-water", "--tok-water-d"]
};

export const TOK_RX = 30, TOK_RY = 12.6, TOK_WALL = 13, TOK_BASE = 88;

// Printed texture on the top face — a few shapes is enough to tell the tokens apart at 40px.
export function tokenDetail(kind, cy){
  switch (kind){
    case "tree":
      return `<ellipse cx="41" cy="${cy - 2}" rx="6.5" ry="3.4" transform="rotate(-28 41 ${cy - 2})" fill="#c3d179"/>
              <ellipse cx="56" cy="${cy - 4}" rx="6" ry="3.2" transform="rotate(18 56 ${cy - 4})" fill="#c3d179"/>
              <ellipse cx="52" cy="${cy + 4}" rx="6.5" ry="3.4" transform="rotate(-12 52 ${cy + 4})" fill="#b3c268"/>`;
    case "mountain":
      return `<circle cx="43" cy="${cy - 2}" r="3.4" fill="#eae7e2"/>
              <circle cx="57" cy="${cy + 2}" r="2.4" fill="#eae7e2"/>`;
    case "water":
      return `<path d="M35 ${cy - 3} q7 -3.5 14 0 t14 0" fill="none" stroke="#a6d8ea" stroke-width="2.4" stroke-linecap="round"/>
              <path d="M35 ${cy + 4} q7 -3.5 14 0 t14 0" fill="none" stroke="#a6d8ea" stroke-width="2.4" stroke-linecap="round"/>`;
    case "field":
      return `<circle cx="42" cy="${cy - 1}" r="2.6" fill="#f8e29a"/>
              <circle cx="54" cy="${cy - 4}" r="2.2" fill="#f8e29a"/>
              <circle cx="55" cy="${cy + 3}" r="2.6" fill="#f8e29a"/>`;
    case "building":
      return `<rect x="44" y="${cy - 4.5}" width="12" height="9" rx="2.5" fill="#e6928a"/>`;
    default:
      return "";
  }
}

// i counts up from the bottom of the stack
export function tokenDisc(kind, i, withDetail){
  const cy = TOK_BASE - TOK_RY - TOK_WALL - i * TOK_WALL;
  const [top, side] = TOK_FILL[kind];
  const left = 50 - TOK_RX;
  return `<path d="M${left} ${cy} v${TOK_WALL} a${TOK_RX} ${TOK_RY} 0 0 0 ${TOK_RX * 2} 0 v-${TOK_WALL} z" style="fill:var(${side})"/>
          <ellipse cx="50" cy="${cy}" rx="${TOK_RX}" ry="${TOK_RY}" style="fill:var(${top})"/>
          ${withDetail ? tokenDetail(kind, cy) : ""}`;
}

export function tokenArt(kind, height){
  height = Math.max(1, height || 1);
  let body = "";
  if (kind === "tree"){
    for (let i = 0; i < height - 1; i++) body += tokenDisc("brown", i, false);
    body += tokenDisc("tree", height - 1, true);
  } else if (kind === "mountain"){
    for (let i = 0; i < height; i++) body += tokenDisc("mountain", i, i === height - 1);
  } else {
    body += tokenDisc(kind, 0, true);
  }
  return `<svg class="tok-art" viewBox="0 0 100 100" aria-hidden="true">
    <polygon class="tok-slot" points="12,72 31,53.9 69,53.9 88,72 69,90.1 31,90.1"/>
    ${body}
  </svg>`;
}

// State lives at p[path] for a plain count, or p[path][key] for a stack bucket.
export function getCount(p, path, key){
  return key ? numOf(p[path][key]) : numOf(p[path]);
}

export function setCount(p, path, key, v){
  if (key) p[path][key] = v; else p[path] = v;
}

export function bumpCount(p, path, key, delta, min){
  setCount(p, path, key, Math.max(min, Math.trunc(getCount(p, path, key)) + delta));
}

export function tallyControl(o){
  const count = o.count;
  return `
    <div class="tally">
      <button class="tally-btn" data-role="tally" data-path="${o.path}" data-key="${o.key}"
              data-min="${o.min}" data-score-cat="${o.scoreCat}" aria-label="${escapeAttr(o.label)}">
        ${tokenArt(o.art, o.height || 1)}
        ${o.pip != null
          ? `<span class="pip">${o.pip}</span>`
          : `<span class="tally-cap">${o.cap}</span>`}
      </button>
      <div class="tally-count">
        <button class="count-chip" data-role="editCount" data-path="${o.path}" data-key="${o.key}"
                data-min="${o.min}" data-prefix="${o.prefix}" data-score-cat="${o.scoreCat}"
                aria-label="${escapeAttr(o.label)} — tap to type the count"
        ><span class="count-pre">${o.prefix}</span><span class="count-num" data-count-for="${o.path}:${o.key}">${count}</span></button>
        <button class="minus" data-role="minus" data-path="${o.path}" data-key="${o.key}"
                data-min="${o.min}" data-score-cat="${o.scoreCat}" data-minus-for="${o.path}:${o.key}"
                ${count <= o.min ? "disabled" : ""} aria-label="Remove one">−</button>
      </div>
    </div>`;
}

export function riverLadder(p){
  const len = Math.max(0, Math.trunc(numOf(p.river)));
  const rungs = [1, 2, 3, 4, 5, 6].map(l => ({ l, txt: String(riverPoints(l)) }));
  rungs.push({ l: 7, txt: "+4" });
  return `<div class="ladder">${rungs.map(r => {
    const on = r.l === 7 ? len >= 7 : len === r.l;
    return `<span class="rung${on ? " on" : ""}" data-rung="${r.l}">${r.txt}</span>`;
  }).join("")}</div>`;
}

// A repeatable list of typed numbers, summed — Harmonies' animal cards and Faraway's two fame
// lists (region/sanctuary) are this same shape, and more games need it (7 Wonders: four more
// lists). The two existing callers render genuinely different markup today (Faraway shows a
// per-row hint span and skips the input's class/inputmode/value-escaping that Harmonies' animal
// cards use), and unifying that would be a visible UI change — out of scope here and gated behind
// the frontend-design skill per CLAUDE.md. So every point of divergence is a parameter instead of
// a shared default; nothing here should silently change what either caller already renders.
//
// The `data-role`/`data-cat`/`data-index` hooks are generic on purpose: index.html's wireCard()
// doesn't special-case "animal" vs "region" vs "sanctuary" — it reads `data-cat` and looks up
// `scorer.cat(cat).listField` to find which player array to write to. Renaming these data-role
// values from the old per-caller ones ("animal"/"addAnimal"/"fa-addRegion"/…) is safe: they are
// internal wiring, invisible to users.
export function numberList(o){
  const {
    playerId, cat, values, uidPrefix = "",
    inputClass, inputmode, escapeValue = true,
    rowHint, removeAriaLabel, addLabel, min = 0
  } = o;

  const rows = values.map((v, i) => {
    const classAttr = inputClass ? `class="${inputClass}" ` : "";
    const modeAttr = inputmode ? ` inputmode="${inputmode}"` : "";
    const val = escapeValue ? escapeAttr(v) : v;
    const uid = `${uidPrefix}p${playerId}-${cat}-${i}`;
    const hint = rowHint ? `\n      <span class="cat-hint" style="margin:0;">${rowHint}</span>` : "";
    const removeLabelAttr = removeAriaLabel ? ` aria-label="${escapeAttr(removeAriaLabel)}"` : "";
    const remove = values.length > 1
      ? `\n      <button data-role="listRemove" data-cat="${cat}" data-index="${i}"${removeLabelAttr}>✕</button>`
      : "";
    return `
    <div class="animal-row">
      <input ${classAttr}type="number" min="${min}"${modeAttr} value="${val}" data-role="listInput" data-cat="${cat}" data-index="${i}" data-uid="${uid}" />${hint}${remove}
    </div>`;
  }).join("");

  return `<div class="animal-list">${rows}
      <button class="add-btn" data-role="listAdd" data-cat="${cat}">${addLabel}</button>
    </div>`;
}

export function numField(playerId, cat, value, placeholder, min = 0){
  return `<input class="num-input" type="number" min="${min}" inputmode="numeric" value="${escapeAttr(value)}" data-role="numInput" data-cat="${cat}" placeholder="${placeholder}" data-uid="p${playerId}-${cat}" />`;
}

export function escapeAttr(s){
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
