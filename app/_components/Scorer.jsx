"use client";

// The two render modes that share one players array: stacked player cards, and the by-category
// tab strip. Both read every number straight from `scorer` during render.

import { tokenArt } from "@/src/ui/controls.js";
import { useEffect, useRef, useState } from "react";
import { PlayerCard, CatBody, CategoryBlock } from "./Card.jsx";
import { MASCOTS } from "@/app/_lib/mascots.js";

// The same drawn tokens as the tally buttons, so the strip reads as one visual language rather
// than a second icon set. A category's `art` drives it — a tokenArt() kind for the disc games, or
// a function returning its own SVG for a game whose components aren't discs. Without one (Nature
// Spirit has no drawn token) it falls back to the plain glyph.
function CatTabIcon({ scorer, catKey }){
  const c = scorer.cat(catKey);
  if (typeof c.art === "function") return <span dangerouslySetInnerHTML={{ __html: c.art() }} />;
  if (c.art) return <span dangerouslySetInnerHTML={{ __html: tokenArt(c.art, 1) }} />;
  return <span className="tab-glyph">{scorer.icon(catKey)}</span>;
}

// Winner is gated on `players.length > 1`, NOT on game.minPlayers — "a solo player isn't a winner"
// (you can't beat nobody) is a different question from the game's legal minimum, which gates the
// remove-player button instead.
function winnerInfo(scorer, players){
  const totals = players.map(p => scorer.total(p));
  const maxTotal = totals.length ? Math.max(...totals) : -1;
  const leaders = totals.filter(t => t === maxTotal && maxTotal > 0).length;
  return { totals, maxTotal, leaders, eligible: players.length > 1 && maxTotal > 0 };
}

function ByPlayer({ game, scorer, gs, variant, showRules, handlersFor }){
  const { totals, maxTotal, leaders, eligible } = winnerInfo(scorer, gs.players);
  return gs.players.map((p, idx) => {
    const isWinner = eligible && totals[idx] === maxTotal;
    return (
      <PlayerCard
        key={p.id}
        game={game}
        scorer={scorer}
        p={p}
        mascotSrc={MASCOTS[idx % MASCOTS.length]}
        // The game's declared minimum, not a hardcoded ">1" — 7 Wonders must not let itself be
        // tallied down to one player.
        showRemove={gs.players.length > game.minPlayers}
        showRules={showRules}
        variant={variant}
        isWinner={isWinner}
        showCrown={isWinner && leaders === 1}
        on={handlersFor(p.id)}
      />
    );
  });
}

// Sub-columns are generated from `game.sums` in full — one per declared group. Hardcoding two
// columns is what once dropped Harmonies' third group ("spirit") entirely and rendered a literal
// "undefined" for any group that didn't match.
function ReviewGrid({ game, scorer, players }){
  const keys = scorer.keys;
  const sumGroups = game.sums || [];
  return (
    <div className="review-grid-wrap">
      <table className="review-grid">
        <thead>
          <tr>
            <th className="who">Player</th>
            {keys.map(k => <th key={k} title={scorer.label(k)}>{scorer.icon(k)}</th>)}
            {sumGroups.map(s => <th key={s.key} className="sub" title={s.label}>{s.label}</th>)}
            <th className="grand">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {players.map(p => {
            const b = scorer.breakdown(p);
            return (
              <tr key={p.id}>
                <td className="who">{p.name}</td>
                {keys.map(k => <td key={k}>{scorer.catPoints(p, k)}</td>)}
                {sumGroups.map(s => <td key={s.key} className="sub">{b[s.key]}</td>)}
                <td className="grand"><span className="pip pip-score">{b.total}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// "Next" walks to the next category still needing attention rather than the next index, so the
// arrow stays useful however much you jumped around with the tabs.
export function nextUndoneCat(scorer, activeCat, doneCats){
  const keys = scorer.keys;
  const start = keys.indexOf(activeCat);
  for (let i = 1; i <= keys.length; i++){
    const key = keys[(start + i) % keys.length];
    if (!doneCats.includes(key) && key !== activeCat) return key;
  }
  return "__review";
}

function ByCategory({ game, scorer, gs, variant, showRules, handlersFor, dispatch }){
  const { totals, maxTotal, leaders, eligible } = winnerInfo(scorer, gs.players);
  const active = gs.activeCat;
  const next = nextUndoneCat(scorer, active, gs.doneCats);

  return (
    <>
      <div className="cat-tabs" role="tablist">
        {scorer.keys.map(key => (
          <button
            key={key}
            className={"cat-tab" + (active === key ? " active" : "") + (gs.doneCats.includes(key) ? " done" : "")}
            aria-label={scorer.label(key)}
            aria-current={active === key}
            onClick={() => dispatch({ type: "pickCat", cat: key })}
          >
            <CatTabIcon scorer={scorer} catKey={key} />
            <span className="tick" aria-hidden="true">✓</span>
          </button>
        ))}
        <button
          className={"cat-tab review" + (active === "__review" ? " active" : "")}
          aria-label="Review all scores"
          onClick={() => dispatch({ type: "pickCat", cat: "__review" })}
        >Σ</button>
      </div>

      {active === "__review" ? (
        <ReviewGrid game={game} scorer={scorer} players={gs.players} />
      ) : (
        <div className="cat-page">
          <div className="cat-page-head">
            <span className="tok-dot" style={{ background: `var(${scorer.dot(active)})` }} />
            <span className="cat-page-name">{scorer.label(active)}</span>
          </div>
          {showRules ? <div className="cat-hint">{scorer.hint(active)}</div> : null}

          {gs.players.map((p, idx) => {
            const isWinner = eligible && totals[idx] === maxTotal;
            return (
              <div className="cat-row" key={p.id} data-cat={active}>
                <div className="row-head">
                  {game.mascots ? <img className="mascot small" src={MASCOTS[idx % MASCOTS.length]} alt="" /> : null}
                  <span className="row-name">{p.name}</span>
                  <span className="pip pip-score">{scorer.catPoints(p, active)}</span>
                  <span className={"total-badge small" + (isWinner && leaders === 1 ? " winner" : "")}>{totals[idx]}</span>
                </div>
                <CatBody scorer={scorer} p={p} catKey={active} variant={variant} on={handlersFor(p.id)} />
              </div>
            );
          })}

          <div className="cat-page-foot">
            <button
              className="mini-btn"
              onClick={() => {
                dispatch({ type: "nextCat", next });
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >{next === "__review" ? "Review →" : scorer.label(next) + " →"}</button>
          </div>
        </div>
      )}
    </>
  );
}

function GuidedReveal({ game, scorer, gs, variant, showRules, handlersFor }){
  const [guided, setGuided] = useState(true);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [stage, setStage] = useState(0); // Regions 0–7, Sanctuaries 8, player review 9, final 10 — the OUTER loop; playerIndex is inner

  // A player added mid-reveal (the footer's "+ Add player" isn't gated on guided-reveal state)
  // joins the group with the earlier cards never asked. Since stage is now shared across players,
  // silently leaving them behind is a wrong-fame-total nobody would notice — so a GROWING player
  // count restarts the walk at card 8 for everyone. Existing answers aren't touched, only revisited.
  const prevPlayerCount = useRef(gs.players.length);
  useEffect(() => {
    if (gs.players.length > prevPlayerCount.current) {
      setStage(0);
      setPlayerIndex(0);
    } else if (playerIndex >= gs.players.length) {
      setPlayerIndex(Math.max(0, gs.players.length - 1));
    }
    prevPlayerCount.current = gs.players.length;
  }, [gs.players.length, playerIndex]);

  if (!guided) return <>
    <div className="guide-mode-switch" role="group" aria-label="Faraway scoring mode">
      <button onClick={() => { setGuided(true); setStage(0); }}>Guided reveal</button>
      <button className="active">Full scorecard</button>
    </div>
    <ByPlayer game={game} scorer={scorer} gs={gs} variant={variant}
              showRules={showRules} handlersFor={handlersFor} />
  </>;

  if (stage === 10) return <>
    <div className="guide-mode-switch" role="group" aria-label="Faraway scoring mode">
      <button className="active">Guided reveal</button>
      <button onClick={() => setGuided(false)}>Full scorecard</button>
    </div>
    <div className="faraway-guide guide-final">
      <div className="guide-eyebrow">Journey complete</div>
      <h2>Review every traveller</h2>
      <ReviewGrid game={game} scorer={scorer} players={gs.players} />
      <button className="mini-btn" onClick={() => { setPlayerIndex(0); setStage(0); }}>Edit from the beginning</button>
    </div>
  </>;

  const p = gs.players[playerIndex];
  if (!p) return null;
  const on = handlersFor(p.id);
  const regionTotal = scorer.catPoints(p, "region");
  const sanctuaryTotal = scorer.catPoints(p, "sanctuary");
  const regionTotalMode = p.totals?.region != null;
  const cardNumber = 8 - stage;

  // Phase-first: every player enters the SAME card before anyone moves to the next one — that's
  // how the game is actually played round the table. playerIndex is the inner loop, stage the
  // outer one (the reverse of a per-player walkthrough).
  function advance(){
    if (playerIndex < gs.players.length - 1) {
      setPlayerIndex(playerIndex + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setPlayerIndex(0);
    if (stage < 9) {
      setStage(stage + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else setStage(10);
  }

  // Mirrors advance()'s one-step-at-a-time walk in reverse. Falling through to the previous
  // phase's last player (rather than stopping dead at playerIndex 0) matters most for Faraway's
  // own minPlayers: 1 — a lone player never leaves playerIndex 0, so scoping Back to "within this
  // phase" only would leave it permanently disabled for every solo game.
  function back(){
    if (playerIndex > 0) {
      setPlayerIndex(playerIndex - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (stage > 0) {
      setStage(stage - 1);
      setPlayerIndex(gs.players.length - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return <>
    <div className="guide-mode-switch" role="group" aria-label="Faraway scoring mode">
      <button className="active">Guided reveal</button>
      <button onClick={() => setGuided(false)}>Full scorecard</button>
    </div>
    <div className="faraway-guide">
      <div className="guide-player-head">
        <div><div className="guide-eyebrow">Traveller {playerIndex + 1} of {gs.players.length}</div>
          <input value={p.name} aria-label="Player name" onChange={e => on.rename(e.target.value)} /></div>
        <span className="total-badge">{scorer.total(p)}</span>
      </div>

      <div className="journey-trail" aria-label="Reveal progress">
        {Array.from({ length: 8 }, (_, i) => <button key={i} className={stage === i ? "active" : (stage > i ? "done" : "")}
          aria-label={`Region card ${8 - i}`} onClick={() => setStage(i)}>{8 - i}</button>)}
        <button className={stage === 8 ? "active sanctuary" : (stage > 8 ? "done sanctuary" : "sanctuary")}
          onClick={() => setStage(8)} aria-label="Sanctuaries">S</button>
        <button className={stage === 9 ? "active review" : "review"} onClick={() => setStage(9)} aria-label="Review player">✓</button>
      </div>

      {stage < 8 ? <div className="guide-step">
        <div className="guide-eyebrow">Region card {cardNumber}</div>
        <h2>{stage === 0 ? "Begin at the rightmost card" : "Reveal the next card to the left"}</h2>
        <p>Enter its fame only if the prerequisite is met. Otherwise leave it at zero.</p>
        {regionTotalMode ? <CatBody scorer={scorer} p={p} catKey="region" variant={variant} on={on} /> : <>
          <label className="guide-score-input"><span>Fame</span>
            <input type="number" min="0" inputMode="numeric" value={p.regionFame[stage] ?? 0}
              aria-label={`Fame for Region card ${cardNumber}`}
              onChange={e => on.listInput("region", stage, e.target.value)} /></label>
          <button className="mini-btn guide-total-shortcut" onClick={() => on.toTotal("region")}>Enter Region total instead</button>
        </>}
      </div> : stage === 8 ? <div className="guide-step">
        <div className="guide-eyebrow">After all eight Regions</div>
        <h2>Score Sanctuaries</h2>
        <CategoryBlock game={game} scorer={scorer} p={p} catKey="sanctuary"
          variant={variant} showRules={showRules} on={on} />
      </div> : <div className="guide-step guide-player-review">
        <div className="guide-eyebrow">Traveller review</div>
        <h2>{p.name}&apos;s journey</h2>
        <div className="guide-subtotals"><span>Regions <b>{regionTotal}</b></span><span>Sanctuaries <b>{sanctuaryTotal}</b></span></div>
        <div className="guide-grand"><span>Total fame</span><span className="pip pip-total">{scorer.total(p)}</span></div>
      </div>}

      <div className="guide-actions">
        <button disabled={playerIndex === 0 && stage === 0} onClick={back}>← Back</button>
        <button className="btn-primary" onClick={advance}>{playerIndex < gs.players.length - 1
          ? `Score ${gs.players[playerIndex + 1].name} →`
          : stage < 8 ? (stage === 7 ? "Sanctuaries →" : "Next card →")
          : stage === 8 ? "Review travellers →"
          : "Review all players →"}</button>
      </div>
    </div>
  </>;
}

export function Scorer(props){
  if (props.game.guidedReveal) return <div className="players"><GuidedReveal {...props} /></div>;
  const byCategory = props.gs.scoreMode === "category" && props.game.categoryMode;
  return <div className="players">{byCategory ? <ByCategory {...props} /> : <ByPlayer {...props} />}</div>;
}
