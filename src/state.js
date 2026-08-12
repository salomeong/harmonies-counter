// Central mutable app state.
//
// Module-level `let` exports are read-only for importers — `import { players }` then
// `players = [...]` is a TypeError, and a re-assignment in here wouldn't be seen correctly by code
// that destructured `players` out of the import. Several of these values are reassigned constantly
// (players, nextId, activeCat, scoreMode, waterSide, game, scorer), so instead everything lives on
// ONE mutable object, `S`, that every other module reads and writes through — `S.players`,
// `S.players = [...]`, etc. Do NOT destructure `S` at a module's top level; that snapshots the
// value at import time and silently breaks reassignment.

import { getGame } from "./games/index.js";
import { makeScorer } from "./scoring.js";

export const S = {
  // The active game declaration and the scorer bound to it (src/scoring.js's makeScorer). Every
  // score, label, hint, icon and control is read through `S.scorer` — see CLAUDE.md's
  // scoring-model section for why nothing may read a category score any other way.
  game: null,
  scorer: null,
  // `activeGame` is a plain string mirror of `game.key`, kept because the /api/* calls send it
  // verbatim (?game=harmonies / ?game=faraway) — changing that string would orphan already-saved
  // data, so it stays exactly as it was even though `game.key` now carries the same information.
  activeGame: null,

  // Players (plus category-mode state: activeCat/doneCats/scoreMode/waterSide) are kept per-game
  // in `gameState` below, so switching games and back doesn't just preserve scores — it puts you
  // back exactly where you left that game, same as the old app never tearing down Harmonies' one
  // persistent session in the first place (switching to Faraway and back used to be free precisely
  // because Harmonies' state was never touched by leaving it).
  players: [],
  nextId: 1,

  // `waterSide` lives in per-game state rather than as its own bare global, same reasoning as
  // players/activeCat/etc: a second game with its own River/Islands-shaped variant couldn't
  // otherwise avoid colliding with Harmonies' toggle. This is what `variant()` below reads;
  // selectGame()/syncGameState() keep it in sync with `gameState` exactly like scoreMode.
  waterSide: "river",

  // "player" walks one player down all categories; "category" scores one category across
  // everyone. Category mode only exists for games with `categoryMode: true` — render() guards the
  // branch so a game without it (Faraway) can never get stuck showing tabs it has no toggle to
  // leave.
  scoreMode: "player",
  activeCat: null,
  // Which categories the table has finished. Shared across players, because a category is called
  // out once for everyone. A category counts as done when it is touched, or when you deliberately
  // move past it — a player with no buildings scores a legitimate 0 and would never earn a tick.
  doneCats: new Set(),

  // Explanations are on for a first-timer and stay off once you know the rules.
  showRules: localStorage.getItem("tally.showRules") !== "0"
};

export const variant = () => ({ waterSide: S.waterSide });

// game key -> { players, nextId, activeCat, doneCats, scoreMode, waterSide }
export const gameState = new Map();

export function ensureGameState(key){
  if (!gameState.has(key)){
    const g = getGame(key);
    const sc = makeScorer(g, variant);
    gameState.set(key, {
      players: [sc.newPlayer(1, "Player 1"), sc.newPlayer(2, "Player 2")],
      nextId: 3,
      activeCat: g.cats.length ? g.cats[0].key : null,
      doneCats: new Set(),
      scoreMode: "player",
      waterSide: "river"
    });
  }
  return gameState.get(key);
}

// `S.players`/`S.nextId`/etc. are local mirrors of the active game's slot in `gameState` (so every
// other function can read/write without threading `game.key` through every call). Reassignments —
// "New game", removing a player, picking a tab, toggling mode — replace the value rather than
// mutating in place, so the mirror has to be written back explicitly; render() does that on every
// call, which covers every path that changes them (in-place mutation, e.g. a tally tap or
// doneCats.add(), needs no sync since it's the same object already stored in the map).
export function syncGameState(){
  if (S.game){
    gameState.set(S.game.key, {
      players: S.players,
      nextId: S.nextId,
      activeCat: S.activeCat,
      doneCats: S.doneCats,
      scoreMode: S.scoreMode,
      waterSide: S.waterSide
    });
  }
}

// selectGame() used to call render() directly. Having state.js import the scorer view would put
// the dependency backwards — state shouldn't need to know how to render itself — so instead
// main.js registers a callback once at boot, and selectGame() invokes that after updating S. This
// also sidesteps the module cycle state.js -> scorer.js -> state.js that a direct import would add
// (wireCard() in scorer.js calls render(), and render() reads S — a real cycle, but a harmless one
// since every use is inside a function body, not at module-evaluation time; the callback avoids it
// entirely anyway).
let onGameSelectedFn = null;
export function onGameSelected(fn){
  onGameSelectedFn = fn;
}

export function selectGame(key){
  const g = getGame(key);
  if (!g) return;
  S.game = g;
  S.activeGame = g.key;
  S.scorer = makeScorer(g, variant);
  const st = ensureGameState(key);
  S.players = st.players;
  S.nextId = st.nextId;
  S.activeCat = st.activeCat;
  S.doneCats = st.doneCats;
  S.scoreMode = st.scoreMode;
  S.waterSide = st.waterSide;

  // Syncing the settings-bar chrome and re-rendering are both view work, so they happen in the
  // callback main.js registers rather than here. Keeping this module free of `document` is what
  // lets it be reasoned about (and tested) as plain state.
  if (onGameSelectedFn) onGameSelectedFn();
}
