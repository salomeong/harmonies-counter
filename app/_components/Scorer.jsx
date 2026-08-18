"use client";

// The two render modes that share one players array: stacked player cards, and the by-category
// tab strip. Both read every number straight from `scorer` during render.

import { tokenArt } from "@/src/ui/controls.js";
import { numOf } from "@/src/scoring.js";
import { useEffect, useRef, useState } from "react";
import { PlayerCard, CatBody, CategoryBlock } from "./Card.jsx";
import { Controls } from "./Controls.jsx";
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

// Region Fame entry: −5/−1/+1/+5 steppers flanking a still-directly-typable number — steppers
// AUGMENT typing, never replace it, per CLAUDE.md's "three ways to enter a score" (someone can
// still just type "16" for a big card rather than tapping +5 three times). Biggest jumps sit
// outermost, closest jumps nearest the number, the standard reading order for this kind of control.
// Compact and horizontal by design: this renders once per player per card, so a tall, centered,
// single-player-hero layout (the original design) compounds badly across up to 7 stacked rows.
function FameStepper({ value, onChange, label }){
  const current = numOf(value);
  const step = delta => onChange(String(Math.max(0, current + delta)));
  return (
    <div className="fame-stepper">
      <button type="button" className="step-btn wide" onClick={() => step(-5)}
              disabled={current <= 0} aria-label={`Subtract 5 fame — ${label}`}>−5</button>
      <button type="button" className="step-btn" onClick={() => step(-1)}
              disabled={current <= 0} aria-label={`Subtract 1 fame — ${label}`}>−1</button>
      <input type="number" min="0" inputMode="numeric" className="fame-value" value={value}
             aria-label={label} onFocus={e => e.target.select()} onChange={e => onChange(e.target.value)} />
      <button type="button" className="step-btn" onClick={() => step(1)} aria-label={`Add 1 fame — ${label}`}>+1</button>
      <button type="button" className="step-btn wide" onClick={() => step(5)} aria-label={`Add 5 fame — ${label}`}>+5</button>
    </div>
  );
}

// A row per player, for the current stage's card — an editable name (renaming stays possible
// without leaving guided reveal), an optional small `headExtra` control (the whole-category "Enter
// total instead" shortcut lives here, not in `body` — see below), the running grand total, then
// whatever this stage asks of them (a Fame field, or the Sanctuaries category block). Shared by
// both stage renders below rather than duplicated, since the only thing that differs is `body`
// (and, for the region stage only, `headExtra`).
//
// Every row's aria-labels carry "(traveller N)" alongside the player's name — the app doesn't
// enforce unique names, so with all rows visible at once (unlike the old one-player-at-a-time
// screen, where the name alone was already unambiguous) two identically-renamed players would
// otherwise get IDENTICAL labels: a real screen-reader ambiguity and a getByLabelText collision in
// tests, found by adversarial review and confirmed live, not hypothetical.
function GuideRow({ game, p, idx, on, total, headExtra, body }){
  return (
    <div className="guide-row">
      <div className="guide-row-head">
        {game.mascots ? <img className="mascot small" src={MASCOTS[idx % MASCOTS.length]} alt="" /> : null}
        <input className="guide-row-name" value={p.name} aria-label={`${p.name}'s name (traveller ${idx + 1})`}
               onChange={e => on.rename(e.target.value)} />
        {headExtra}
        <span className="guide-row-total">{total}</span>
      </div>
      {body}
    </div>
  );
}

function GuidedReveal({ game, scorer, gs, variant, showRules, handlersFor }){
  const [guided, setGuided] = useState(true);
  const [stage, setStage] = useState(0); // Regions 0–7, Sanctuaries 8, final review 9

  // Every stage shows every player's row together (see the render below) — there's no longer a
  // "how far did THIS ONE player get" position, only "how far did the group get". A player added
  // mid-reveal (the footer's "+ Add player" isn't gated on guided-reveal state) hasn't seen any of
  // it, so a GROWING player count restarts the group's walk at card 8. Existing answers aren't
  // touched, only revisited — and a shrinking count needs no handling at all now, since a removed
  // player's row simply stops being one of the rows rendered.
  const prevPlayerCount = useRef(gs.players.length);
  useEffect(() => {
    if (gs.players.length > prevPlayerCount.current) setStage(0);
    prevPlayerCount.current = gs.players.length;
  }, [gs.players.length]);

  if (!guided) return <>
    <div className="guide-mode-switch" role="group" aria-label="Faraway scoring mode">
      <button onClick={() => { setGuided(true); setStage(0); }}>Guided reveal</button>
      <button className="active">Full scorecard</button>
    </div>
    <ByPlayer game={game} scorer={scorer} gs={gs} variant={variant}
              showRules={showRules} handlersFor={handlersFor} />
  </>;

  if (stage === 9) return <>
    <div className="guide-mode-switch" role="group" aria-label="Faraway scoring mode">
      <button className="active">Guided reveal</button>
      <button onClick={() => setGuided(false)}>Full scorecard</button>
    </div>
    <div className="faraway-guide guide-final">
      <div className="guide-eyebrow">Journey complete</div>
      <h2>Review every traveller</h2>
      <ReviewGrid game={game} scorer={scorer} players={gs.players} />
      <button className="mini-btn" onClick={() => setStage(0)}>Edit from the beginning</button>
    </div>
  </>;

  const cardNumber = 8 - stage;

  function advance(){
    setStage(stage < 8 ? stage + 1 : 9);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back(){
    if (stage === 0) return;
    setStage(stage - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <>
    <div className="guide-mode-switch" role="group" aria-label="Faraway scoring mode">
      <button className="active">Guided reveal</button>
      <button onClick={() => setGuided(false)}>Full scorecard</button>
    </div>
    <div className="faraway-guide">
      <div className="journey-trail" aria-label="Reveal progress">
        {Array.from({ length: 8 }, (_, i) => <button key={i} className={stage === i ? "active" : (stage > i ? "done" : "")}
          aria-label={`Region card ${8 - i}`} onClick={() => setStage(i)}>{8 - i}</button>)}
        <button className={stage === 8 ? "active sanctuary" : (stage > 8 ? "done sanctuary" : "sanctuary")}
          onClick={() => setStage(8)} aria-label="Sanctuaries">S</button>
        <button className={stage === 9 ? "active review" : "review"} onClick={() => setStage(9)} aria-label="Review all players">✓</button>
      </div>

      {stage < 8 ? <div className="guide-step">
        <div className="guide-eyebrow">Region card {cardNumber}</div>
        <h2>{stage === 0 ? "Begin at the rightmost card" : "Reveal the next card to the left"}</h2>
        <p>Enter its fame only if the prerequisite is met. Otherwise leave it at zero.</p>
        <div className="guide-rows">
          {gs.players.map((p, idx) => {
            const on = handlersFor(p.id);
            const regionTotalMode = p.totals?.region != null;
            return (
              <GuideRow key={p.id} game={game} p={p} idx={idx} on={on} total={scorer.total(p)}
                // A whole-CATEGORY shortcut ("I already added up my fame by hand"), not a per-card
                // one — belongs once beside the name, not repeated under all 8 region-card screens.
                // Hidden once regionTotalMode is on: CatBody's own total-edit UI already carries a
                // revert (↺) control, so a second entry point here would be redundant.
                headExtra={!regionTotalMode ? (
                  <button className="mini-btn guide-total-inline" onClick={() => on.toTotal("region")}
                          aria-label={`Enter a whole Region total instead of card-by-card for ${p.name}`}>✎ Total</button>
                ) : null}
                body={regionTotalMode ? <CatBody scorer={scorer} p={p} catKey="region" variant={variant} on={on} /> :
                  <FameStepper value={p.regionFame[stage] ?? 0}
                    onChange={v => on.listInput("region", stage, v)}
                    label={`${p.name}'s fame for Region card ${cardNumber} (traveller ${idx + 1})`} />} />
            );
          })}
        </div>
      </div> : <div className="guide-step">
        <div className="guide-eyebrow">After all eight Regions</div>
        <h2>Score Sanctuaries</h2>
        <div className="guide-rows">
          {gs.players.map((p, idx) => {
            const on = handlersFor(p.id);
            const sanctuaryTotalMode = p.totals?.sanctuary != null;
            return (
              <GuideRow key={p.id} game={game} p={p} idx={idx} on={on} total={scorer.total(p)}
                // Same shortcut, same slot as Region's — see that headExtra's comment above for why
                // it lives beside the name rather than inside the body.
                headExtra={!sanctuaryTotalMode ? (
                  <button className="mini-btn guide-total-inline" onClick={() => on.toTotal("sanctuary")}
                          aria-label={`Enter a whole Sanctuaries total instead of adding one by one for ${p.name}`}>✎ Total</button>
                ) : null}
                // Bypasses CategoryBlock's label/points/hint chrome the same way Region's FameStepper
                // does: "Score Sanctuaries" is already the shared heading above every row, so a
                // per-row "Sanctuaries" label would just repeat it eight — well, one — times over.
                body={sanctuaryTotalMode
                  ? <CatBody scorer={scorer} p={p} catKey="sanctuary" variant={variant} on={on} />
                  : <Controls specs={scorer.cat("sanctuary").controls(p, variant)} on={on} />} />
            );
          })}
        </div>
      </div>}

      <div className="guide-actions">
        <button disabled={stage === 0} onClick={back}>← Back</button>
        <button className="btn-primary" onClick={advance}>
          {stage < 8 ? (stage === 7 ? "Sanctuaries →" : "Next card →") : "Review all players →"}
        </button>
      </div>
    </div>
  </>;
}

export function Scorer(props){
  if (props.game.guidedReveal) return <div className="players"><GuidedReveal {...props} /></div>;
  const byCategory = props.gs.scoreMode === "category" && props.game.categoryMode;
  return <div className="players">{byCategory ? <ByCategory {...props} /> : <ByPlayer {...props} />}</div>;
}
