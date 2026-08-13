"use client";

// What used to be `S` — the one mutable state object in src/state.js — as a reducer.
//
// Three things about the vanilla version did not survive contact with React, and each is a real
// change rather than a translation:
//
// 1. `S` was mutated in place (`p.trees.h1++`, `p.open.add(k)`). React decides what to re-render by
//    referential equality, so an in-place mutation is invisible to it. Every action here produces
//    new objects.
// 2. `p.open` and `doneCats` were `Set`s. Sets don't survive JSON — which a player restored from
//    the ledger must — and encourage exactly the in-place mutation above. Both are arrays now.
// 3. Per-game state was a `Map` keyed by game key so Harmonies' River/Islands toggle couldn't
//    collide with another game's variant. That property is kept, as a plain object in state.
//
// The mutating helpers this app already had (setCount/bumpCount, scorer.resetCat/resetPlayer,
// cat.infer) are reused UNCHANGED: each action structuredClone()s the one player it touches and
// lets the helper mutate the clone. That keeps a single implementation of every scoring rule
// instead of a second immutable copy that could drift.

import { useReducer, useMemo, useCallback } from "react";
import { getGame, GAME_LIST } from "@/src/games/index.js";
import { makeScorer, numOf } from "@/src/scoring.js";
import { setCount, bumpCount } from "@/src/ui/controls.js";

const RULES_KEY = "tally.showRules";

function freshGameState(game){
  const scorer = makeScorer(game, () => ({ waterSide: "river" }));
  return {
    players: [scorer.newPlayer(1, "Player 1"), scorer.newPlayer(2, "Player 2")],
    nextId: 3,
    activeCat: game.cats[0] ? game.cats[0].key : null,
    doneCats: [],
    scoreMode: "player",
    waterSide: "river"
  };
}

export function initialState(){
  return { view: "picker", activeGame: null, historyKey: null, showRules: true, games: {} };
}

function currentGameState(state){
  return state.activeGame ? state.games[state.activeGame] : null;
}

// Replace the active game's slot without disturbing any other game's.
function patchGame(state, patch){
  const key = state.activeGame;
  return { ...state, games: { ...state.games, [key]: { ...state.games[key], ...patch } } };
}

function withPlayers(state, players){
  return patchGame(state, { players });
}

// Clone-then-mutate: the one player named by `id` is deep-copied and handed to `fn`, which may be
// any of the existing in-place helpers.
function editPlayer(state, id, fn){
  const gs = currentGameState(state);
  return withPlayers(state, gs.players.map(p => {
    if (p.id !== id) return p;
    const clone = structuredClone(p);
    fn(clone);
    return clone;
  }));
}

function markDone(state, cat){
  const gs = currentGameState(state);
  if (!cat || gs.doneCats.includes(cat)) return state;
  return patchGame(state, { doneCats: [...gs.doneCats, cat] });
}

function reducer(state, a){
  switch (a.type){
    case "selectGame": {
      const game = getGame(a.key);
      if (!game) return state;
      const games = state.games[a.key] ? state.games : { ...state.games, [a.key]: freshGameState(game) };
      return { ...state, activeGame: a.key, games, view: "landing" };
    }
    case "setView":      return { ...state, view: a.view };
    case "openHistory":  return { ...state, view: "history", historyKey: a.key };
    case "toggleRules": {
      const showRules = !state.showRules;
      try { localStorage.setItem(RULES_KEY, showRules ? "1" : "0"); } catch {}
      return { ...state, showRules };
    }
    case "hydrateRules": return { ...state, showRules: a.showRules };
    case "setScoreMode": return patchGame(state, { scoreMode: a.mode });
    case "setWaterSide": return patchGame(state, { waterSide: a.side });
    case "pickCat":      return patchGame(state, { activeCat: a.cat });
    case "nextCat":      return patchGame(markDone(state, currentGameState(state).activeCat), { activeCat: a.next });

    case "addPlayer": {
      const gs = currentGameState(state);
      const game = getGame(state.activeGame);
      if (gs.players.length >= (game.maxPlayers || Infinity)) return state;
      const scorer = makeScorer(game, () => ({ waterSide: gs.waterSide }));
      return patchGame(state, {
        players: [...gs.players, scorer.newPlayer(gs.nextId)],
        nextId: gs.nextId + 1
      });
    }
    case "removePlayer":
      return withPlayers(state, currentGameState(state).players.filter(p => p.id !== a.id));
    case "newGame": {
      const game = getGame(state.activeGame);
      const gs = currentGameState(state);
      const scorer = makeScorer(game, () => ({ waterSide: gs.waterSide }));
      return patchGame(state, {
        players: [scorer.newPlayer(1, "Player 1"), scorer.newPlayer(2, "Player 2")],
        nextId: 3,
        doneCats: []
      });
    }
    case "rename":   return editPlayer(state, a.id, p => { p.name = a.name; });

    case "bump":     return editPlayer(markDone(state, a.spec.scoreCat), a.id,
                       p => bumpCount(p, a.spec.path, a.spec.key, a.delta, a.spec.min));
    case "setCount": return editPlayer(markDone(state, a.spec.scoreCat), a.id,
                       p => setCount(p, a.spec.path, a.spec.key, a.value));

    case "listInput": return editPlayer(markDone(state, a.cat), a.id, p => {
      p[a.listField][a.index] = a.value;
    });
    case "listAdd":    return editPlayer(state, a.id, p => { p[a.listField].push(0); });
    case "listRemove": return editPlayer(state, a.id, p => { p[a.listField].splice(a.index, 1); });
    case "numInput":   return editPlayer(markDone(state, a.cat), a.id, p => { p[a.valueField] = a.value; });

    case "openCat": return editPlayer(state, a.id, p => {
      p.open = p.open.includes(a.cat) ? p.open.filter(k => k !== a.cat) : [...p.open, a.cat];
    });
    case "toggleAll": return editPlayer(state, a.id, p => {
      p.open = p.open.length === a.allKeys.length ? [] : [...a.allKeys];
    });

    case "resetCat":    return editPlayer(state, a.id, p => a.scorer.resetCat(p, a.cat));
    case "resetPlayer": return editPlayer(state, a.id, p => a.scorer.resetPlayer(p));

    // Seed with the current derived score so switching modes freezes the value rather than
    // changing it.
    case "toTotal":     return editPlayer(state, a.id, p => { p.totals[a.cat] = a.scorer.catPoints(p, a.cat); });
    case "revert":      return editPlayer(state, a.id, p => { delete p.totals[a.cat]; });
    case "totalInput":  return editPlayer(markDone(state, a.cat), a.id, p => { p.totals[a.cat] = a.value; });
    // On commit, an unambiguous total is inverted back into a count and the category leaves
    // override mode; an ambiguous one keeps the override.
    case "totalCommit": return editPlayer(state, a.id, p => {
      if (a.scorer.infer(p, a.cat, a.value)) delete p.totals[a.cat];
    });

    default: return state;
  }
}

export function useTally(){
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const game = state.activeGame ? getGame(state.activeGame) : null;
  const gs = currentGameState(state);
  const waterSide = gs ? gs.waterSide : "river";

  const variant = useMemo(() => ({ waterSide }), [waterSide]);
  // Bound to a getter that reads the memoised variant, so descriptors stay pure and a stale
  // closure can't score a river board as islands.
  const scorer = useMemo(() => (game ? makeScorer(game, () => variant) : null), [game, variant]);

  // Per-player handler bundle. Everything the card needs, already carrying the player id, so the
  // components stay unaware of how state is stored.
  const handlersFor = useCallback(id => ({
    rename:      name => dispatch({ type: "rename", id, name }),
    remove:      () => dispatch({ type: "removePlayer", id }),
    bump:        (spec, delta) => dispatch({ type: "bump", id, spec, delta }),
    setCount:    (spec, value) => dispatch({ type: "setCount", id, spec, value }),
    listInput:   (cat, index, value) => dispatch({ type: "listInput", id, cat, index, value, listField: scorer.cat(cat).listField }),
    listAdd:     cat => dispatch({ type: "listAdd", id, cat, listField: scorer.cat(cat).listField }),
    listRemove:  (cat, index) => dispatch({ type: "listRemove", id, cat, index, listField: scorer.cat(cat).listField }),
    numInput:    (cat, value) => dispatch({ type: "numInput", id, cat, value, valueField: scorer.cat(cat).valueField }),
    openCat:     cat => dispatch({ type: "openCat", id, cat }),
    toggleAll:   () => dispatch({ type: "toggleAll", id, allKeys: scorer.keys }),
    resetCat:    cat => dispatch({ type: "resetCat", id, cat, scorer }),
    resetPlayer: () => { if (confirm("Reset every category for this player?")) dispatch({ type: "resetPlayer", id, scorer }); },
    toTotal:     cat => dispatch({ type: "toTotal", id, cat, scorer }),
    revert:      cat => dispatch({ type: "revert", id, cat }),
    totalInput:  (cat, value) => dispatch({ type: "totalInput", id, cat, value }),
    totalCommit: (cat, value) => dispatch({ type: "totalCommit", id, cat, value, scorer })
  }), [scorer]);

  return { state, dispatch, game, gs, scorer, variant, handlersFor, games: GAME_LIST };
}

export { numOf };
