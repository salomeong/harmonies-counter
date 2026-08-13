import test from "node:test";
import assert from "node:assert/strict";
import { recapBackTarget, restoreDestination } from "./navigation.js";

const game = { key: "harmonies", label: "Harmonies" };

test("recapBackTarget returns to each supported origin", () => {
  assert.deepEqual(recapBackTarget({ from: "leaderboard" }, game), { href: "/?game=harmonies&view=leaderboard", label: "Leaderboard" });
  assert.deepEqual(recapBackTarget({ from: "history", profile: "Maxx & Co" }, game), { href: "/?game=harmonies&view=history&profile=Maxx%20%26%20Co", label: "Player history" });
  assert.deepEqual(recapBackTarget({ from: "stats" }, game), { href: "/stats/harmonies", label: "Harmonies stats" });
});

test("recapBackTarget safely falls back when origin data is incomplete", () => {
  assert.deepEqual(recapBackTarget({ from: "history" }, game), { href: "/", label: "All games" });
  assert.deepEqual(recapBackTarget({ from: "unknown" }, game), { href: "/", label: "All games" });
});

test("restoreDestination accepts valid leaderboard and history destinations", () => {
  const games = ["harmonies"];
  assert.deepEqual(restoreDestination("?game=harmonies&view=leaderboard", games), { game: "harmonies", view: "leaderboard" });
  assert.deepEqual(restoreDestination("?game=harmonies&view=history&profile=maxx", games), { game: "harmonies", view: "history", profile: "maxx" });
});

test("restoreDestination rejects unknown games and degrades incomplete destinations to landing", () => {
  assert.equal(restoreDestination("?game=unknown&view=leaderboard", ["harmonies"]), null);
  assert.deepEqual(restoreDestination("?game=harmonies&view=history", ["harmonies"]), { game: "harmonies", view: "landing" });
});
