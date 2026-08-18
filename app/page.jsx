"use client";

// The interactive app: picker → landing → scorer, plus history and leaderboard.
//
// The five `.view` containers and their ids are unchanged from index.html, because styles.css
// keys off them (`.view.active`, and `#view-scorer[data-game="7wonders"]` is how a game restyles
// its own pips). The port is meant to be visually a no-op.

import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useTally } from "./_state/useTally.js";
import { Scorer } from "./_components/Scorer.jsx";
import { NavIcon } from "./_components/NavIcon.jsx";
import { ConfirmDialog } from "./_components/ConfirmDialog.jsx";
import { SupremacyDialog } from "./_components/SupremacyDialog.jsx";
import { PhotoUpload } from "./_components/PhotoUpload.jsx";
import { fetchProfiles, fetchProfile, fetchLeaderboard, postGame } from "@/src/api.js";
import { formatDate } from "./_lib/format.js";
import { restoreDestination } from "./_lib/navigation.js";

export default function Page(){
  const [confirmation, setConfirmation] = useState(null);
  const [supremacyOpen, setSupremacyOpen] = useState(false);
  const [photoKey, setPhotoKey] = useState(0);
  const [savedSessions, setSavedSessions] = useState({});
  // Keyed by game, same as savedSessions — whether the CURRENT saved session was recorded as a
  // supremacy win (no score at all) rather than an ordinary score save. Needed to warn before the
  // ordinary "Save this game" button silently overwrites a correct single-winner supremacy record
  // with a tied 0-0 score row (both totals default to 0 since nothing was ever tallied) — found by
  // adversarial review and reproduced live against the real database (2026-08-18).
  const [savedAsSupremacy, setSavedAsSupremacy] = useState({});
  const requestConfirm = useCallback(details => setConfirmation(details), []);
  const { state, dispatch, game, gs, scorer, variant, handlersFor, games } = useTally(requestConfirm);
  const [nameDraft, setNameDraft] = useState("");
  const view = state.view;
  const savedPublicId = state.activeGame ? savedSessions[state.activeGame] : null;

  // showRules is persisted, but reading localStorage during render would make the server and
  // client markup disagree — so it lands after mount instead.
  useEffect(() => {
    try {
      const v = localStorage.getItem("tally.showRules");
      if (v === "0") dispatch({ type: "hydrateRules", showRules: false });
    } catch {}
  }, [dispatch]);

  // Recap pages preserve where a record link came from. Restore that in-app destination instead
  // of dumping someone at the game picker when they choose a visible Back action.
  useEffect(() => {
    const destination = restoreDestination(location.search, games.map(g => g.key));
    if (!destination) return;
    dispatch({ type: "selectGame", key: destination.game });
    if (destination.view === "leaderboard") dispatch({ type: "setView", view: "leaderboard" });
    if (destination.view === "history") dispatch({ type: "openHistory", key: destination.profile });
    window.history.replaceState(null, "", "/");
  }, [dispatch, games]);

  const profiles = useQuery({
    queryKey: ["profiles", state.activeGame],
    queryFn: () => fetchProfiles(state.activeGame),
    enabled: view === "landing" && !!state.activeGame
  });

  const history = useQuery({
    queryKey: ["profile", state.historyKey, state.activeGame],
    queryFn: () => fetchProfile(state.historyKey, state.activeGame),
    enabled: view === "history" && !!state.historyKey
  });

  const leaderboard = useQuery({
    queryKey: ["leaderboard", state.activeGame],
    queryFn: () => fetchLeaderboard(state.activeGame),
    enabled: view === "leaderboard" && !!state.activeGame
  });

  // Every seat is sent, guests included. The server, not the client, decides who gets a `people`
  // row — the ledger needs a row per seat or the session misrepresents who was at the table.
  //
  // `supremacy`, when passed to `.mutate()`, switches this from the ordinary score save to 7
  // Wonders Duel's alternate ending: no seat has a total or detail to send (nothing was tallied —
  // the game ended before Civilian Victory scoring was ever meaningful), and `winnerSeat` is what
  // tells the server who won instead. See app/api/save-game/validate.mjs and CLAUDE.md's "7 Wonders
  // Duel" section.
  const save = useMutation({
    mutationFn: (supremacy) => postGame({
      publicId: savedPublicId || undefined,
      game: state.activeGame,
      endedBy: supremacy ? supremacy.endedBy : "score",
      winnerSeat: supremacy ? supremacy.winnerSeat : undefined,
      variant,
      players: gs.players.map((p, i) => ({
        name: p.name,
        seat: i,
        ...(supremacy ? {} : { total: scorer.total(p), detail: scorer.detail(p) })
      }))
    }),
    onSuccess: (data, supremacy) => {
      setSavedSessions(all => ({ ...all, [state.activeGame]: data.publicId }));
      setSavedAsSupremacy(all => ({ ...all, [state.activeGame]: !!supremacy }));
    }
  });

  function startScorer(name){
    if (name) dispatch({ type: "rename", id: gs.players[0].id, name });
    dispatch({ type: "setView", view: "scorer" });
  }

  const showCritters = view !== "picker" && !!(game && game.critters);
  const atCap = gs && game && gs.players.length >= (game.maxPlayers || Infinity);

  return (
    <>
      <img className="corner-critter fennec" src="/assets/animal-fennec.png" alt="" aria-hidden="true"
           style={{ display: showCritters ? undefined : "none" }} />
      <img className="corner-critter bird" src="/assets/animal-bird.png" alt="" aria-hidden="true"
           style={{ display: showCritters ? undefined : "none" }} />

      <div className="page-inner">
        <div className={"logo-wrap" + (view === "picker" ? " hidden" : "")}>
          {/* The masthead is the one-tap way home from inside a game. Per-game scores survive the
              trip (state is kept per game), so this is navigation, not a reset. */}
          <button className="masthead-home" title="Home"
                  aria-label="Home — back to the game picker"
                  onClick={() => dispatch({ type: "setView", view: "picker" })}>
            <img src={game ? game.logo : "/assets/logo.png"} alt={game ? game.label : "Harmonies"} />
            <span><NavIcon name="game" /> Home</span>
          </button>
        </div>

        {/* ---- Picker ---- */}
        <div className={"view" + (view === "picker" ? " active" : "")} id="view-picker">
          <div className="site-name">The Faithful Tally</div>
          <div className="subtitle">Which game are we tallying?</div>
          <div className="picker-grid">
            {games.map(g => (
              <button key={g.key} className="game-tile" onClick={() => { setNameDraft(""); dispatch({ type: "selectGame", key: g.key }); }}>
                <div className="game-tile-art"><img src={g.tileArt} alt="" /></div>
                <img className="game-tile-logo" src={g.logo} alt={g.label} />
                <span className="game-tile-tagline">{g.tagline}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ---- Landing ---- */}
        <div className={"view" + (view === "landing" ? " active" : "")} id="view-landing">
          <div className="subtitle">{game ? `${game.label} game home` : "Game home"}</div>
          <div className="landing-card">
            <div className="landing-row">
              <input type="text" placeholder="Your name" autoComplete="off"
                     value={nameDraft} onChange={e => setNameDraft(e.target.value)}
                     onKeyDown={e => { if (e.key === "Enter" && nameDraft.trim()) startScorer(nameDraft.trim()); }} />
              <button className="btn-primary" disabled={!nameDraft.trim()}
                      onClick={() => startScorer(nameDraft.trim())}>Continue</button>
            </div>
            <div className="chip-row">
              {profiles.isPending ? <div className="chip-loading">Loading players…</div>
                : profiles.isError ? <div className="chip-loading">Couldn&apos;t load saved players. <button className="link-btn" onClick={() => profiles.refetch()}>Retry</button></div>
                : (profiles.data || []).map(pr => (
                    <div className="chip" key={pr.key}>
                      <button onClick={() => startScorer(pr.displayName)}>{pr.displayName}</button>
                      <span className="chip-meta">🏆 {pr.highScore}</span>
                      <button className="chip-history" title="View history"
                              onClick={() => dispatch({ type: "openHistory", key: pr.key })}>
                        <NavIcon name="history" /> History
                      </button>
                    </div>
                  ))}
            </div>
            <div className="landing-hint">
              <button className="nav-action" onClick={() => dispatch({ type: "setView", view: "scorer" })}><NavIcon name="tally" /> Tally without a name</button>
              <button className="nav-action" onClick={() => dispatch({ type: "setView", view: "leaderboard" })}><NavIcon name="trophy" /> Leaderboard</button>
              {state.activeGame ? <Link href={`/stats/${state.activeGame}`} className="nav-action"><NavIcon name="chart" /> Stats</Link> : null}
              <button className="nav-action" onClick={() => dispatch({ type: "setView", view: "picker" })}><NavIcon name="game" /> Home</button>
            </div>
          </div>
        </div>

        {/* ---- Scorer ---- */}
        <div className={"view" + (view === "scorer" ? " active" : "")} id="view-scorer"
             data-game={game ? game.key : undefined}>
          <div className="top-links">
            <button className="nav-action" onClick={() => dispatch({ type: "setView", view: "landing" })}><NavIcon name="back" /> Game home</button>
            <button className="nav-action" onClick={() => dispatch({ type: "setView", view: "leaderboard" })}><NavIcon name="trophy" /> Leaderboard</button>
          </div>
          <div className="subtitle">{game ? game.subtitle : ""}</div>

          {/* The settings bar only holds controls a game actually has, and is hidden outright when
              a game has neither (Faraway) rather than left as a bar containing one lone button. */}
          {game && (game.categoryMode || game.waterToggle) ? (
            <div className="global-settings">
              {game.categoryMode ? (
                <div className="toggle-group">
                  {["player", "category"].map(m => (
                    <button key={m} className={gs.scoreMode === m ? "active" : ""}
                            onClick={() => dispatch({ type: "setScoreMode", mode: m })}>
                      {m === "player" ? "Player" : "Category"}
                    </button>
                  ))}
                </div>
              ) : null}
              {game.waterToggle ? (
                <div className="toggle-group">
                  {[["river", "River"], ["island", "Islands"]].map(([side, label]) => (
                    <button key={side} className={gs.waterSide === side ? "active" : ""}
                            onClick={() => dispatch({ type: "setWaterSide", side })}>{label}</button>
                  ))}
                </div>
              ) : null}
              <button className={"rules-toggle" + (state.showRules ? " active" : "")}
                      aria-pressed={state.showRules}
                      title="Show scoring explanations" aria-label="Show scoring explanations"
                      onClick={() => dispatch({ type: "toggleRules" })}>?</button>
            </div>
          ) : null}

          {/* The shared conflict pawn: one track for both players, not a per-card control — same
              reasoning as the settings bar above, but its own block since a 7-rung ladder plus two
              name labels doesn't fit the compact toggle-group row. game.militaryZones carries the
              rung/VP data so this stays generic rather than checking game.key (CLAUDE.md). */}
          {game && game.militaryZones ? (
            <div className="military-track">
              <div className="military-names">
                <span>{gs.players[0] ? gs.players[0].name : "Player 1"}</span>
                <span>{gs.players[1] ? gs.players[1].name : "Player 2"}</span>
              </div>
              <div className="ladder military-ladder">
                {game.militaryZones.map(z => (
                  <button key={z.value} type="button"
                          className={"rung" + (gs.militaryTrack === z.value ? " on" : "")}
                          aria-pressed={gs.militaryTrack === z.value}
                          aria-label={z.value === 0 ? "Neutral, no military VP" : `${z.vp} VP toward ${z.value < 0 ? (gs.players[0] ? gs.players[0].name : "Player 1") : (gs.players[1] ? gs.players[1].name : "Player 2")}`}
                          onClick={() => dispatch({ type: "setMilitaryTrack", value: z.value })}>
                    {z.vp || "–"}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Only 7 Wonders Duel can end this way, and militaryZones is the same descriptor
              signal the shared track above is gated on — one flag, not a second one meaning the
              same thing (CLAUDE.md's "no game.key checks in components" rule). */}
          {game && game.militaryZones ? (
            <div className="supremacy-trigger">
              <button className="link-btn" onClick={() => setSupremacyOpen(true)}>
                Game ended by supremacy instead? Record the win →
              </button>
            </div>
          ) : null}

          {save.isSuccess || save.isError ? (
            <div className={"save-banner visible " + (save.isError ? "error" : (save.data?.celebrations?.length ? "celebrate" : "info"))}>
              {save.isError
                // Replays save.variables, not a bare save.mutate() — a failed supremacy-win save
                // must retry as the SAME supremacy save, not silently fall back to an ordinary
                // score save (mutate() with no argument means "supremacy: undefined").
                ? <>Couldn&apos;t save — check your connection and try again. <button className="retry-btn" onClick={() => save.mutate(save.variables)}>Retry</button></>
                : save.data.celebrations?.length
                  ? save.data.celebrations.map(c => (
                      <div key={c.key}>🎉 New high score for {c.displayName} — {c.total} (previous best {c.previousHigh})!</div>
                    ))
                  : `${save.data.updated ? "Updated" : "Saved"} ${save.data.saved.length} player${save.data.saved.length === 1 ? "" : "s"}' game.`}
              {!save.isError && save.data?.publicId ? (
                <div className="save-banner-link">
                  <Link href={`/g/${save.data.publicId}`} className="link-btn">View this game →</Link>
                </div>
              ) : null}
            </div>
          ) : null}

          {game && scorer ? (
            // Keyed on the same photoKey counter PhotoUpload already uses to force a remount on
            // "New game" — Scorer needs it too: Faraway's GuidedReveal keeps its walk position
            // (`stage`) as local component state the reducer doesn't own, so without this a "New
            // game" that doesn't change the player count leaves the screen sitting on whatever
            // card it was on, showing freshly-zeroed data as if it were still mid-review. Found by
            // adversarial review, 2026-08-18 — confirmed pre-existing (the old player-major guided
            // reveal had the same gap), fixed here rather than left for a second report.
            <Scorer key={`scorer-${game.key}-${photoKey}`} game={game} scorer={scorer} gs={gs} variant={variant}
                    showRules={state.showRules} handlersFor={handlersFor} dispatch={dispatch} />
          ) : null}
          {/* Distinct prefix from Scorer's key above — they're siblings in the same children array,
              and reusing the identical `${game.key}-${photoKey}` string for both (a real bug caught
              live, not in review: React warned "two children with the same key" and silently
              tripled the rendered output) collides regardless of the two being different component
              types. Keys only need to be unique among siblings, not globally, but that still means
              unique among THESE siblings. */}
          {game ? <PhotoUpload key={`photo-${game.key}-${photoKey}`} sessionPublicId={savedPublicId} /> : null}
        </div>

        {/* ---- History ---- */}
        <div className={"view" + (view === "history" ? " active" : "")} id="view-history">
          <div className="top-links">
            <button className="nav-action" onClick={() => dispatch({ type: "setView", view: "landing" })}><NavIcon name="back" /> Players</button>
            <span />
          </div>
          <div className="history-card">
            <div className="history-title">{history.data ? history.data.displayName : ""}</div>
            <div className="history-highscore">{history.data ? `🏆 High score: ${history.data.highScore}` : ""}</div>
            <div>
              {history.isPending ? <div className="history-empty">Loading…</div>
                : history.isError ? <div className="history-empty">Couldn&apos;t load history. <button className="link-btn" onClick={() => history.refetch()}>Retry</button></div>
                : !history.data ? <div className="history-empty">No history yet.</div>
                : history.data.games.map((g, i) => (
                    <Link key={i} href={`/g/${g.sessionId}?from=history&game=${state.activeGame}&profile=${encodeURIComponent(state.historyKey)}`}
                          className={"history-row" + (g.total === history.data.highScore ? " is-best" : "")}>
                      <span>{formatDate(g.playedAt)}</span><span className="row-score">{g.total}<NavIcon name="arrow" /></span>
                    </Link>
                  ))}
            </div>
          </div>
        </div>

        {/* ---- Leaderboard ---- */}
        <div className={"view" + (view === "leaderboard" ? " active" : "")} id="view-leaderboard">
          <div className="top-links">
            <button className="nav-action" onClick={() => dispatch({ type: "setView", view: "landing" })}><NavIcon name="back" /> Players</button>
            {state.activeGame ? <Link href={`/stats/${state.activeGame}`} className="nav-action"><NavIcon name="chart" /> Stats</Link> : <span />}
          </div>
          <div className="history-card">
            <div className="history-title">🏆 Leaderboard</div>
            <div>
              {leaderboard.isPending ? <div className="history-empty">Loading…</div>
                : leaderboard.isError ? <div className="history-empty">Couldn&apos;t load the leaderboard. <button className="link-btn" onClick={() => leaderboard.refetch()}>Retry</button></div>
                : !(leaderboard.data?.leaderboard || []).length ? <div className="history-empty">No games saved yet.</div>
                : leaderboard.data.leaderboard.map((p, i) => (
                    <Link key={p.displayName + i} href={`/g/${p.sessionId}?from=leaderboard&game=${state.activeGame}`}
                          className={"history-row" + (i < 3 ? " top-3" : "")}>
                      <span className="rank">#{i + 1}</span>
                      <span className="name">{p.displayName}</span>
                      <span className="row-score">{p.highScore}<NavIcon name="arrow" /></span>
                    </Link>
                  ))}
            </div>
          </div>
        </div>

        <div className="citation-footer">
          Benvenuto, J. (2024). Harmonies [Board game]. Libellud.<br />
          Goupy, J., &amp; Lebrat, C. (2023). Faraway [Board game]. Catch Up Games.<br />
          Bauza, A. (2010). 7 Wonders [Board game]. Repos Production.<br />
          Bauza, A., &amp; Cathala, B. (2015). 7 Wonders Duel [Board game]. Repos Production.
        </div>
      </div>

      <div className="footer-bar" style={{ display: view === "scorer" ? "flex" : "none" }}>
        {/* At the cap the button keeps its place but reads as inert — say why, so it isn't a
            control that mysteriously stopped working. */}
        <button disabled={atCap}
                title={atCap ? `${game.label} seats up to ${game.maxPlayers} players` : undefined}
                onClick={() => dispatch({ type: "addPlayer" })}>+ Add player</button>
        <button className="btn-primary" disabled={save.isPending} onClick={() => {
          // Saving over a recorded supremacy win with the ordinary score path would silently
          // replace a correct single-winner record with a tied 0-0 row (nothing was ever tallied,
          // so both totals default to 0) — confirm first rather than losing that data quietly.
          if (savedAsSupremacy[state.activeGame]) {
            requestConfirm({
              title: "Save a score instead?",
              message: "This game was already recorded as a supremacy win with no score. Saving now replaces that with an ordinary score save.",
              confirmLabel: "Save score instead",
              action: () => save.mutate()
            });
          } else {
            save.mutate();
          }
        }}>
          {save.isPending ? (savedPublicId ? "Updating…" : "Saving…") : (savedPublicId ? "Update saved game" : "Save this game")}
        </button>
        <button onClick={() => requestConfirm({
          title: "Start a new game?",
          message: "This clears the current scores and any photos that have not been saved.",
          confirmLabel: "Start new game",
          action: () => {
            dispatch({ type: "newGame" }); save.reset();
            setSavedSessions(all => { const next = { ...all }; delete next[state.activeGame]; return next; });
            setSavedAsSupremacy(all => { const next = { ...all }; delete next[state.activeGame]; return next; });
            setPhotoKey(k => k + 1);
          }
        })}>
          New game
        </button>
      </div>
      <ConfirmDialog confirmation={confirmation} onClose={confirmed => {
        const action = confirmation?.action;
        setConfirmation(null);
        if (confirmed) action?.();
      }} />
      {gs ? (
        <SupremacyDialog
          open={supremacyOpen}
          players={gs.players}
          pending={save.isPending}
          onCancel={() => setSupremacyOpen(false)}
          onConfirm={(endedBy, winnerSeat) => {
            setSupremacyOpen(false);
            save.mutate({ endedBy, winnerSeat });
          }}
        />
      ) : null}
    </>
  );
}
