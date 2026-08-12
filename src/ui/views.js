// Every full-screen view apart from the scorer itself (that one's src/ui/scorer.js): the game
// picker, the landing screen (name entry + saved-player chips), history, leaderboard, and the
// save-this-game flow. Moved out of index.html's inline script, unchanged in behaviour.

import { S, variant } from "../state.js";
import { render } from "./scorer.js";
import { GAME_LIST } from "../games/index.js";
import { escapeAttr } from "./controls.js";
import { numOf } from "../scoring.js";
import { fetchProfiles, fetchProfile, fetchLeaderboard, postGame } from "../api.js";

// ---- Views ----

// The settings bar only holds controls a game actually has, and is hidden outright when a game has
// neither (Faraway). Called from main.js's onGameSelected callback rather than from selectGame(),
// so state.js stays free of `document`.
export function syncGameChrome(){
  const g = S.game;
  if (!g) return;
  const showSettingsBar = !!(g.categoryMode || g.waterToggle);
  document.getElementById("globalSettings").style.display = showSettingsBar ? "" : "none";
  document.getElementById("modeToggle").style.display = g.categoryMode ? "" : "none";
  document.getElementById("waterToggle").style.display = g.waterToggle ? "" : "none";
  document.querySelectorAll("#modeToggle button").forEach(b => b.classList.toggle("active", b.dataset.mode === S.scoreMode));
  document.querySelectorAll("#waterToggle button").forEach(b => b.classList.toggle("active", b.dataset.side === S.waterSide));
}

export function showView(name){
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
  document.getElementById("footerBar").style.display = name === "scorer" ? "flex" : "none";

  // Lets a game restyle its own scorer through CSS custom properties (7 Wonders takes the
  // wordmark's gold for its pips) without any game-specific branching in the render code.
  if (S.game) document.getElementById("view-scorer").dataset.game = S.game.key;

  const logoWrap = document.getElementById("logoWrap");
  const masthead = document.getElementById("masthead");
  const showCritters = name !== "picker" && !!(S.game && S.game.critters);
  document.querySelectorAll(".corner-critter").forEach(el => {
    el.style.display = showCritters ? "" : "none";
  });
  if (name === "picker"){
    logoWrap.classList.add("hidden");
  } else {
    logoWrap.classList.remove("hidden");
    if (S.game){
      masthead.src = S.game.logo;
      masthead.alt = S.game.label;
    }
  }

  if (name === "scorer" && S.game){
    document.getElementById("scorerSubtitle").textContent = S.game.subtitle;
  }

  if (name === "landing") renderLandingChips();
}

export function formatDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ---- Game picker ----

export function renderPickerGrid(){
  document.getElementById("pickerGrid").innerHTML = GAME_LIST.map(g => `
    <button class="game-tile" data-game="${g.key}">
      <div class="game-tile-art"><img src="${g.tileArt}" alt=""></div>
      <img class="game-tile-logo" src="${g.logo}" alt="${escapeAttr(g.label)}">
      <span class="game-tile-tagline">${escapeAttr(g.tagline)}</span>
    </button>`).join("");
}

// ---- Landing ----

let chipsRequestId = 0;

export async function renderLandingChips(){
  const container = document.getElementById("landingChips");
  const requestId = ++chipsRequestId;
  container.innerHTML = '<div class="chip-loading">Loading players…</div>';

  let profiles;
  try {
    profiles = await fetchProfiles(S.activeGame);
  } catch (err) {
    if (requestId !== chipsRequestId) return;
    container.innerHTML = '<div class="chip-loading">Couldn\'t load saved players. <button class="link-btn" id="retryChips">Retry</button></div>';
    const retry = document.getElementById("retryChips");
    if (retry) retry.addEventListener("click", renderLandingChips);
    return;
  }

  if (requestId !== chipsRequestId) return;

  if (!profiles.length){
    container.innerHTML = "";
    return;
  }

  container.innerHTML = profiles.map(p => `
    <div class="chip">
      <button data-role="chip-continue" data-key="${escapeAttr(p.key)}" data-name="${escapeAttr(p.displayName)}">${escapeAttr(p.displayName)}</button>
      <span class="chip-meta">🏆 ${numOf(p.highScore)}</span>
      <button class="chip-history" data-role="chip-history" data-key="${escapeAttr(p.key)}" title="View history">📜</button>
    </div>
  `).join("");

  container.querySelectorAll('[data-role="chip-continue"]').forEach(btn => {
    btn.addEventListener("click", () => startScorerWithName(btn.dataset.name));
  });
  container.querySelectorAll('[data-role="chip-history"]').forEach(btn => {
    btn.addEventListener("click", () => openHistory(btn.dataset.key));
  });
}

export function startScorerWithName(name){
  S.players[0].name = name;
  render();
  showView("scorer");
}

// ---- Save this game ----

export function hideSaveBanner(bannerId = "saveBanner"){
  const el = document.getElementById(bannerId);
  el.className = "save-banner";
  el.innerHTML = "";
}

function renderSaveBanner(kind, html, bannerId = "saveBanner"){
  const el = document.getElementById(bannerId);
  el.className = "save-banner visible " + kind;
  el.innerHTML = html;
}

async function submitGame(gameKey, buildPlayers, btnId, bannerId, retryFn){
  const btn = document.getElementById(btnId);
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    const data = await postGame({
      game: gameKey,
      endedBy: "score",
      variant: variant(),
      players: buildPlayers()
    });

    if (data.celebrations && data.celebrations.length){
      const lines = data.celebrations.map(c =>
        `🎉 New high score for ${escapeAttr(c.displayName)} — ${c.total} (previous best ${c.previousHigh})!`
      ).join("<br>");
      renderSaveBanner("celebrate", lines, bannerId);
    } else {
      // Every seat is saved now, guests included, so `saved` is never empty — the old
      // "no named players to save" branch became unreachable when the ledger started recording
      // whole sessions rather than only the players it could attach to a profile.
      // TODO(ui): guests still don't appear on the leaderboard, and nothing says so. Worth a nudge
      // to name them — that's copy, so it goes through the frontend-design skill.
      const n = data.saved.length;
      renderSaveBanner("info", `Saved ${n} player${n === 1 ? "" : "s"}' game${n === 1 ? "" : "s"}.`, bannerId);
    }
  } catch (err) {
    renderSaveBanner("error", `Couldn't save — check your connection and try again. <button class="retry-btn" id="retrySave-${btnId}">Retry</button>`, bannerId);
    const retry = document.getElementById(`retrySave-${btnId}`);
    if (retry) retry.addEventListener("click", retryFn);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save this game";
  }
}

// Every player is sent — guests (unnamed/default-named) included. The server, not the client,
// decides who gets a `people` row (see api/save-game.js); the ledger needs a row per seat
// regardless, or the session misrepresents who was at the table.
export function saveGame(){
  return submitGame(
    S.activeGame,
    () => S.players.map((p, i) => ({
      name: p.name,
      seat: i,
      total: S.scorer.total(p),
      detail: S.scorer.detail(p)
    })),
    "saveGame", "saveBanner", saveGame
  );
}

// ---- History ----

let historyRequestId = 0;

export function openHistory(key){
  showView("history");
  renderHistory(key);
}

async function renderHistory(key){
  const requestId = ++historyRequestId;
  document.getElementById("historyName").textContent = "";
  document.getElementById("historyHighScore").textContent = "";
  document.getElementById("historyList").innerHTML = '<div class="history-empty">Loading…</div>';

  let data;
  try {
    // fetchProfile() resolves to null on a 404 ("no history yet") instead of throwing — see
    // src/api.js — so that case falls through to the same staleness check as a normal response
    // rather than into this catch block.
    data = await fetchProfile(key, S.activeGame);
  } catch (err) {
    if (requestId !== historyRequestId) return;
    document.getElementById("historyList").innerHTML = '<div class="history-empty">Couldn\'t load history. <button class="link-btn" id="retryHistory">Retry</button></div>';
    const retry = document.getElementById("retryHistory");
    if (retry) retry.addEventListener("click", () => renderHistory(key));
    return;
  }

  if (requestId !== historyRequestId) return;

  if (data === null){
    document.getElementById("historyList").innerHTML = '<div class="history-empty">No history yet.</div>';
    return;
  }

  document.getElementById("historyName").textContent = data.displayName;
  document.getElementById("historyHighScore").textContent = "🏆 High score: " + data.highScore;
  document.getElementById("historyList").innerHTML = data.games.map(g => `
    <div class="history-row${g.total === data.highScore ? " is-best" : ""}">
      <span>${formatDate(g.playedAt)}</span><span>${g.total}</span>
    </div>
  `).join("") || '<div class="history-empty">No games yet.</div>';
}

// ---- Leaderboard ----

let leaderboardRequestId = 0;

export async function renderLeaderboard(){
  const requestId = ++leaderboardRequestId;
  const list = document.getElementById("leaderboardList");
  list.innerHTML = '<div class="history-empty">Loading…</div>';

  let data;
  try {
    data = await fetchLeaderboard(S.activeGame);
  } catch (err) {
    if (requestId !== leaderboardRequestId) return;
    list.innerHTML = '<div class="history-empty">Couldn\'t load leaderboard. <button class="link-btn" id="retryLeaderboard">Retry</button></div>';
    const retry = document.getElementById("retryLeaderboard");
    if (retry) retry.addEventListener("click", renderLeaderboard);
    return;
  }

  if (requestId !== leaderboardRequestId) return;

  const rows = data.leaderboard || [];
  list.innerHTML = rows.map((p, i) => `
    <div class="history-row${i < 3 ? " top-3" : ""}">
      <span class="rank">#${i + 1}</span>
      <span class="name">${escapeAttr(p.displayName)}</span>
      <span>${p.highScore}</span>
    </div>
  `).join("") || '<div class="history-empty">No games saved yet.</div>';
}
