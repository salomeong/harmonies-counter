// The game registry — every game the app knows about, keyed and ordered.

import { harmonies } from "./harmonies.js";
import { faraway } from "./faraway.js";

export const GAMES = { harmonies, faraway };

// Picker order: the order game tiles are offered in, distinct from GAMES' key order (which is
// incidental to how the object literal above was written).
export const GAME_LIST = [harmonies, faraway];

export function getGame(key){
  return GAMES[key] || null;
}
