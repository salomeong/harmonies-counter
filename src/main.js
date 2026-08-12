// Boot and every top-level DOM event listener — the wiring layer that ties state.js/scorer.js/
// views.js/api.js together. Per-card listeners (taps, count edits, etc.) are wired by
// src/ui/scorer.js's wireCard() instead, since those are created and destroyed with each card.

import { S, selectGame, onGameSelected } from "./state.js";
import { render, markDone, nextUndoneCat } from "./ui/scorer.js";
import { showView, renderPickerGrid, hideSaveBanner, saveGame, renderLeaderboard, startScorerWithName, syncGameChrome } from "./ui/views.js";

// state.js can't call render() directly — that would make state depend on rendering, the wrong
// dependency direction, and would also reintroduce the module cycle state.js -> scorer.js ->
// state.js. selectGame() invokes this callback instead, registered once here at boot.
// state.js owns no DOM: picking a game syncs the settings-bar chrome, then renders.
onGameSelected(() => { syncGameChrome(); render(); });

// Chrome for the two modes lives above the cards, so it is delegated on the container rather
// than wired per card.
document.getElementById("players").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn) return;

  switch (btn.dataset.role){
    case "pickCat":
      S.activeCat = btn.dataset.cat;
      render();
      break;
    case "nextCat":
      // Moving on is itself an answer — a category everyone legitimately scored 0 in still
      // deserves its tick, or the strip reads as unfinished forever.
      markDone(S.activeCat);
      S.activeCat = nextUndoneCat();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      break;
  }
});

document.getElementById("modeToggle").addEventListener("click", e => {
  const btn = e.target.closest("button[data-mode]");
  if (!btn) return;
  S.scoreMode = btn.dataset.mode;
  document.querySelectorAll("#modeToggle button").forEach(b => b.classList.toggle("active", b === btn));
  render();
});

document.getElementById("rulesToggle").addEventListener("click", e => {
  S.showRules = !S.showRules;
  localStorage.setItem("tally.showRules", S.showRules ? "1" : "0");
  e.currentTarget.classList.toggle("active", S.showRules);
  e.currentTarget.setAttribute("aria-pressed", String(S.showRules));
  render();
});

document.getElementById("waterToggle").addEventListener("click", e => {
  const btn = e.target.closest("button[data-side]");
  if (!btn) return;
  S.waterSide = btn.dataset.side;
  document.querySelectorAll("#waterToggle button").forEach(b => b.classList.toggle("active", b === btn));
  render();
});

document.getElementById("addPlayer").addEventListener("click", () => {
  if (S.players.length >= (S.game.maxPlayers || Infinity)) return;
  S.players.push(S.scorer.newPlayer(S.nextId++));
  render();
});

document.getElementById("newGame").addEventListener("click", () => {
  if (confirm("Start a new game? This clears the current scores.")){
    S.players = [S.scorer.newPlayer(1, "Player 1"), S.scorer.newPlayer(2, "Player 2")];
    S.nextId = 3;
    render();
    hideSaveBanner();
  }
});

// ---- Game picker ----

renderPickerGrid();

document.getElementById("pickerGrid").addEventListener("click", e => {
  const tile = e.target.closest(".game-tile");
  if (!tile) return;
  selectGame(tile.dataset.game);
  landingNameInput.value = "";
  landingContinueBtn.disabled = true;
  showView("landing");
});
document.getElementById("switchGame").addEventListener("click", () => showView("picker"));

// ---- Landing ----

const landingNameInput = document.getElementById("landingName");
const landingContinueBtn = document.getElementById("landingContinue");

landingNameInput.addEventListener("input", () => {
  landingContinueBtn.disabled = !landingNameInput.value.trim();
});
landingNameInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && landingNameInput.value.trim()){
    startScorerWithName(landingNameInput.value.trim());
  }
});
landingContinueBtn.addEventListener("click", () => {
  const name = landingNameInput.value.trim();
  if (name) startScorerWithName(name);
});
document.getElementById("landingSkip").addEventListener("click", () => {
  showView("scorer");
});
document.getElementById("switchPlayer").addEventListener("click", () => showView("landing"));

document.getElementById("saveGame").addEventListener("click", saveGame);

document.getElementById("historyBack").addEventListener("click", () => showView("landing"));

document.getElementById("landingLeaderboard").addEventListener("click", () => {
  showView("leaderboard");
  renderLeaderboard();
});
document.getElementById("scorerLeaderboard").addEventListener("click", () => {
  showView("leaderboard");
  renderLeaderboard();
});
document.getElementById("leaderboardBack").addEventListener("click", () => showView("landing"));

// ---- Boot ----

// showRules is restored from localStorage, so the button has to catch up to it.
(() => {
  const rt = document.getElementById("rulesToggle");
  rt.classList.toggle("active", S.showRules);
  rt.setAttribute("aria-pressed", String(S.showRules));
})();

showView("picker");
