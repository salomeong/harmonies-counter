// 7 Wonders component art — drawn, never imported, same as Harmonies' tokens.
//
// Harmonies' primitive is a disc lying in a hex recess, because that is what a Harmonies token
// physically is. 7 Wonders' components are different objects, so the primitive changes even though
// the method doesn't: a CARD standing on its edge, a struck TOKEN, a COIN. What carries over is the
// grammar — the same cream hex slot the piece rests in, the same low camera angle, and the same
// lighting rule where the face takes the true component colour and the extruded edge takes a
// darkened one. That way a 7 Wonders button and a Harmonies button read as the same family of
// object without pretending a card is a disc.
//
// The seven card colours are the game's own, at full saturation. Muting them into the parchment
// palette would be both timid and wrong: "red card" and "purple card" are how players actually
// speak about this game, so the button has to be that colour.

import { escapeAttr } from "./controls.js";

// face var, extruded-edge var. The edge is the face darkened ~22%, matching --tok-*-d.
// No `manufactured` (grey) entry: grey cards score no victory points directly, so there is no
// category to draw one for. If you are adding it back, check you actually have a scoring category
// for it first.
export const SW_FILL = {
  raw:        ["--sw-brown",  "--sw-brown-d"],
  civilian:   ["--sw-blue",   "--sw-blue-d"],
  science:    ["--sw-green",  "--sw-green-d"],
  commercial: ["--sw-yellow", "--sw-yellow-d"],
  military:   ["--sw-red",    "--sw-red-d"],
  guild:      ["--sw-purple", "--sw-purple-d"]
};

// The hex recess every piece sits in — shared with Harmonies' tokenArt so the two games' buttons
// have the same footprint.
function frame(body){
  return `<svg class="tok-art" viewBox="0 0 100 100" aria-hidden="true">
    <polygon class="tok-slot" points="12,72 31,53.9 69,53.9 88,72 69,90.1 31,90.1"/>
    ${body}
  </svg>`;
}

// A card seen slightly from the left, standing in the slot: an extruded edge behind, the coloured
// face in front, and a paler panel where the illustration would be. The tilt keeps it from reading
// as a flat UI rectangle.
function cardBody(kind, detail = ""){
  const [face, edge] = SW_FILL[kind];
  return `<g transform="rotate(-5 50 82)">
      <rect x="34" y="30" width="36" height="52" rx="4" style="fill:var(${edge})"/>
      <rect x="31" y="27" width="36" height="52" rx="4" style="fill:var(${face})"/>
      <rect x="35" y="31" width="28" height="30" rx="2.5" fill="#000" opacity="0.13"/>
      ${detail}
    </g>`;
}

export function cardArt(kind){
  return frame(cardBody(kind));
}

// ---- Science symbols ----
// Drawn on the green card face rather than floating free, because on the table you are reading a
// symbol printed on a green card — the colour is half the identification.

function tablet(){
  return `<g transform="translate(49 46)" fill="none" stroke="#f2ede0" stroke-width="2.6" stroke-linecap="round">
      <rect x="-8.5" y="-10" width="17" height="20" rx="2.5" fill="#f2ede0" stroke="none"/>
      <path d="M-4.5 -5h9M-4.5 0h9M-4.5 5h5" stroke="#3f6b49" stroke-width="2"/>
    </g>`;
}

// A symmetric splay with a crossbar is just the letter A — which is exactly how the first version
// of this read at 34px. What makes it a pair of dividers instead: no crossbar, an off-centre tilt
// so the two legs aren't mirror images, unequal legs, and a drawn arc at the tip of the sweeping
// one showing the circle it is scribing.
function compass(){
  return `<g transform="translate(49 47) rotate(-11)">
      <path d="M-6.5 8.5 L0 -8 L7.5 8.5" fill="none" stroke="#f2ede0"
            stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="0" cy="-8.5" r="2.7" fill="#f2ede0"/>
      <path d="M-9 10.5 a 10 10 0 0 0 18.5 -1.5" fill="none" stroke="#f2ede0"
            stroke-width="1.7" stroke-linecap="round" opacity="0.75"/>
      <circle cx="7.5" cy="8.5" r="1.7" fill="#f2ede0"/>
    </g>`;
}

function gear(){
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45) * Math.PI / 180;
    const x = Math.cos(a) * 10.2, y = Math.sin(a) * 10.2;
    return `<rect x="${(x - 2.1).toFixed(2)}" y="${(y - 2.1).toFixed(2)}" width="4.2" height="4.2" rx="1"
             transform="rotate(${i * 45} ${x.toFixed(2)} ${y.toFixed(2)})" fill="#f2ede0"/>`;
  }).join("");
  return `<g transform="translate(49 46)">
      ${teeth}
      <circle cx="0" cy="0" r="7.6" fill="#f2ede0"/>
      <circle cx="0" cy="0" r="3.2" fill="#3f6b49"/>
    </g>`;
}

const SCIENCE_GLYPH = { tablet, compass, gear };

export function scienceArt(symbol){
  const glyph = SCIENCE_GLYPH[symbol];
  return frame(cardBody("science", glyph ? glyph() : ""));
}

// ---- Struck tokens and coins ----
// Both are round, so they keep Harmonies' cylinder construction: an elliptical face over an
// extruded wall, seen at the same low angle.

function disc(faceVar, edgeVar, detail){
  const cy = 62, rx = 27, ry = 11.4, wall = 12;
  return `<path d="M${50 - rx} ${cy} v${wall} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v-${wall} z" style="fill:var(${edgeVar})"/>
    <ellipse cx="50" cy="${cy}" rx="${rx}" ry="${ry}" style="fill:var(${faceVar})"/>
    ${detail || ""}`;
}

// Victory tokens carry the AGE in roman numerals, not their point value. The pip beside the button
// already shows the points (1/3/5); repeating that on the token would waste the one place that can
// answer the other question you actually ask at scoring time — "which age was this from?" — and
// would leave the three buttons identical apart from a number.
export function warTokenArt(age){
  const numeral = { 1: "I", 2: "II", 3: "III" }[age] || "";
  return frame(disc("--sw-war", "--sw-war-d", `
    <text x="50" y="${62 + 3.4}" text-anchor="middle"
          font-size="13" font-weight="700" letter-spacing="0.5"
          font-family="Georgia, 'Times New Roman', serif"
          fill="#f6ead2">${escapeAttr(numeral)}</text>`));
}

// Defeat tokens are the dark ones with a single bar — visually the opposite of a victory token, so
// a mis-tap is obvious at a glance rather than only in the total.
export function defeatTokenArt(){
  return frame(disc("--sw-defeat", "--sw-defeat-d", `
    <rect x="41" y="${62 - 2}" width="18" height="4" rx="2" fill="#e8dcc8"/>`));
}

// A coin, with the milled inner ring the real ones have.
export function coinArt(){
  return frame(disc("--sw-gold", "--sw-gold-d", `
    <ellipse cx="50" cy="62" rx="18" ry="7.2" fill="none" stroke="#8a6410" stroke-width="1.6" opacity="0.55"/>
    <ellipse cx="50" cy="62" rx="9" ry="3.6" fill="#f7d84a" opacity="0.75"/>`));
}
