// Control SPECS and small state helpers.
//
// These are pure — no DOM, no module-level mutable state, no framework import — so they unit test
// without booting anything.
//
// ---- Why these return data, not HTML ----
// They used to return HTML strings, which is how a *game declaration* ended up carrying view
// concerns: a descriptor's `controls(p, variant)` was emitting markup. That was the single thing
// standing between this app and a view-layer-only framework port. They now return plain spec
// objects ({type: "tally", …}) that a renderer turns into whatever it likes — React components
// here, and nothing stops a different renderer later. The builders kept their names and their
// argument shapes, so each descriptor changed by roughly one line.
//
// Token art is the deliberate exception: tokenArt()/tokenDisc() still return SVG strings, because
// that art is a pure function of (kind, height) and never varies with score state. It is injected
// once per control and React never needs to diff inside it.

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

// One token button + its count chip + the minus. `art` is either a tokenArt() kind or a function
// returning SVG (7 Wonders draws cards and struck tokens, not discs) — the renderer resolves it,
// so this stays a plain description.
//
// `count` and `min` both ride along because the renderer needs them together: the minus is
// DISABLED at the floor rather than hidden, since a control that appears on first tap reflows the
// row under a moving finger (CLAUDE.md, "Controls keep their place").
export function tallyControl(o){
  return {
    type: "tally",
    scoreCat: o.scoreCat,
    path: o.path,
    key: o.key || "",
    art: o.art,
    height: o.height || 1,
    pip: o.pip,
    cap: o.cap,
    prefix: o.prefix,
    min: o.min,
    count: o.count,
    label: o.label
  };
}

// Several tallies read as one row of components — the `.tally-group` wrapper the CSS expects.
export function tallyGroup(items){
  return { type: "tallyGroup", items };
}

// The printed river ladder. Which rung is lit is NOT computed here: the water descriptor already
// declares `activeRung(p, variant)`, and having two places decide it is how they drift apart.
export function riverLadder(){
  const rungs = [1, 2, 3, 4, 5, 6].map(l => ({ value: l, text: String(riverPoints(l)) }));
  rungs.push({ value: 7, text: "+4" });   // the last rung stands for "7 or more"
  return { type: "ladder", rungs };
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
    inputClass, inputmode,
    rowHint, removeAriaLabel, addLabel, min = 0
  } = o;

  return {
    type: "list",
    cat,
    values,
    min,
    inputClass,
    inputmode,
    rowHint,
    removeAriaLabel,
    addLabel,
    // The remove button only exists past one row, which is why a restored empty list is a shape
    // the live UI can never reach on its own.
    showRemove: values.length > 1,
    uidFor: i => `${uidPrefix}p${playerId}-${cat}-${i}`
  };
}

// A build-once toggle — 7 Wonders Duel's Wonders and Progress tokens are each built/obtained at
// most once per player, unlike a tally (river, science symbols, military wins) which climbs
// indefinitely. Unlike tallyControl there is no minus/count-chip: one tap sets p[path][key] to 1,
// another sets it back to 0, via the same generic `setCount` action every stack/river tally
// already dispatches — no new reducer case needed.
//
// Rendered as a pill chip (name + its fixed VP pip), not a drawn token button: with up to 12
// distinct named items in one list, large token art doesn't scale the way it does for a 3-4 item
// tallyGroup. Placeholder-fidelity for now — see CLAUDE.md before any follow-up polish pass.
export function checkChip(o){
  return {
    type: "checkChip",
    scoreCat: o.scoreCat,
    path: o.path,
    key: o.key,
    name: o.name,
    pip: o.pip,
    checked: !!o.checked,
    label: o.label
  };
}

// A row of checkChips — the `.check-group` wrapper the CSS expects, parallel to tallyGroup.
export function checkGroup(items){
  return { type: "checkGroup", items };
}

// A single bare number input (Harmonies' Nature Spirit bonus). `subrow` reproduces the
// `<div class="subrow">` the descriptor used to wrap this in.
export function numField(playerId, cat, value, placeholder, min = 0){
  return {
    type: "num",
    cat,
    value,
    placeholder,
    min,
    subrow: true,
    uid: `p${playerId}-${cat}`
  };
}

// Kept because token art is still built as SVG strings. It no longer guards any user-entered
// text: player names, category labels and aria-labels are React props now, and React escapes
// those itself — which quietly closes docs/next.md's "escapeAttr doesn't escape > or '" loose end
// by removing every call site that could have cared.
export function escapeAttr(s){
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
