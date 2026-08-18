"use client";

// The player card: header, accordion category drawers, and the "=" strip.
//
// Every number here is computed during render from `scorer`, so the patch-hook discipline the
// vanilla app needed (`data-pts-for`/`data-sum`/`data-count-for`/`data-work-for`, filled in by
// patchScores()) is gone along with the entire class of bug it guarded — a score can no longer
// freeze at its initial value, because there is no second code path that updates it. What replaces
// the guarantee is component tests asserting rendered scores change with state; see CLAUDE.md.

import { isTotalMode } from "@/src/scoring.js";
import { Controls } from "./Controls.jsx";

// A category may explain how its number was reached (7 Wonders' science: 9 + 4 + 1, then the set
// bonus everyone forgets). It is still an HTML string from the descriptor, because it is prose
// with inline markup rather than interactive chrome.
function Work({ cat, p, variant }){
  if (!cat.work) return null;
  return <div className="cat-work" dangerouslySetInnerHTML={{ __html: cat.work(p, variant) }} />;
}

export function CatBody({ scorer, p, catKey, variant, on }){
  const cat = scorer.cat(catKey);

  if (isTotalMode(p, catKey)){
    return (
      <div className="cat-body">
        <div className="total-edit">
          <input
            className="total-input"
            type="number"
            min={scorer.min(catKey)}
            inputMode="numeric"
            value={p.totals[catKey]}
            data-uid={`p${p.id}-total-${catKey}`}
            // Includes the player's name, not just the category — CatBody renders once per player
            // on any screen that shows multiple players' cards at once (ByCategory's rows, Faraway's
            // guided reveal), where two identical "Region cards total" labels would otherwise be
            // indistinguishable to a screen reader (found by adversarial review, 2026-08-18). Not
            // fully collision-proof against two players sharing the exact same name — that would
            // need a seat number threaded through every call site, which nothing here has needed yet.
            aria-label={`${p.name}'s ${scorer.label(catKey)} total`}
            onChange={e => on.totalInput(catKey, e.target.value)}
            // Inference runs on commit, not per keystroke — mid-typing the "1" of "15" would
            // otherwise snap the category back to tally mode under the cursor.
            onBlur={e => on.totalCommit(catKey, e.target.value)}
          />
          <button
            className="revert-btn"
            title="Back to tallying"
            aria-label="Back to tallying"
            onClick={() => on.revert(catKey)}
          >↺</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cat-body">
      <Controls
        specs={cat.controls(p, variant)}
        on={on}
        activeRung={cat.activeRung ? cat.activeRung(p, variant) : undefined}
      />
      <Work cat={cat} p={p} variant={variant} />
      <div className="cat-actions">
        <button className="mini-btn" aria-label={`Reset ${scorer.label(catKey)} to zero`}
                onClick={() => on.resetCat(catKey)}>↺ Reset</button>
        {scorer.canType(catKey) ? (
          <button className="mini-btn"
                  aria-label={`Type a total for ${scorer.label(catKey)} instead of tallying`}
                  onClick={() => on.toTotal(catKey)}>✎ Enter total</button>
        ) : null}
      </div>
    </div>
  );
}

// Collapsed rows are the whole point of the accordion: a filled-in card reads as seven short lines
// instead of seven control panels. Games without `accordion` (Faraway) get the flat always-visible
// form — no drawer, no total-mode UI.
export function CategoryBlock({ game, scorer, p, catKey, variant, showRules, on }){
  if (!game.accordion){
    const totalMode = isTotalMode(p, catKey);
    return (
      <div className="category" data-cat={catKey}>
        <div className="cat-label">{scorer.label(catKey)}</div>
        <div className="cat-pts">{scorer.catPoints(p, catKey)}</div>
        {totalMode ? <CatBody scorer={scorer} p={p} catKey={catKey} variant={variant} on={on} /> : <>
          <Controls specs={scorer.cat(catKey).controls(p, variant)} on={on} activeRung={undefined} />
          {scorer.canType(catKey) ? <div className="cat-actions flat-actions">
            <button className="mini-btn" onClick={() => on.toTotal(catKey)}>✎ Enter category total</button>
          </div> : null}
        </>}
        <div className="cat-hint">{scorer.hint(catKey)}</div>
      </div>
    );
  }

  const open = p.open.includes(catKey);
  return (
    <div className={"category acc" + (open ? " open" : "")} data-cat={catKey}>
      <button className="cat-head" aria-expanded={open} onClick={() => on.openCat(catKey)}>
        <span className="tok-dot" style={{ background: `var(${scorer.dot(catKey)})` }} />
        <span className="cat-name">{scorer.label(catKey)}</span>
        <span className="pip pip-score">{scorer.catPoints(p, catKey)}</span>
        <span className="chev">{open ? "⌄" : "›"}</span>
      </button>
      {open ? (
        <>
          {showRules ? <div className="cat-hint">{scorer.hint(catKey)}</div> : null}
          <CatBody scorer={scorer} p={p} catKey={catKey} variant={variant} on={on} />
        </>
      ) : null}
    </div>
  );
}

// Driven entirely by `game.sums` — one column per declared group, so a game whose groups aren't
// named "landscape"/"animals" can never render a blank or a literal "undefined".
export function SumStrip({ game, breakdown }){
  if (!game.sums) return null;
  return (
    <div className="card-sum">
      {game.sums.map(s => (
        <span key={s.key}>{s.label} <b className="pip pip-sub">{breakdown[s.key]}</b></span>
      ))}
      <span className="eq">=</span>
      <span className="pip pip-total">{breakdown.total}</span>
    </div>
  );
}

export function PlayerCard({ game, scorer, p, mascotSrc, showRemove, showRules, variant, isWinner, showCrown, on }){
  const breakdown = scorer.breakdown(p);
  const allOpen = game.accordion && p.open.length === scorer.keys.length;
  const totalBadgeClass = game.accordion ? "pip pip-total total-badge" : "total-badge";

  return (
    <div className={"player-card" + (game.cardClass ? " " + game.cardClass : "") + (isWinner ? " winner" : "")}>
      <div className="player-header">
        {game.mascots ? <img className="mascot" src={mascotSrc} alt="" /> : null}
        <input type="text" value={p.name} data-uid={`p${p.id}-name`} onChange={e => on.rename(e.target.value)} />
        <span className={"crown" + (showCrown ? "" : " hidden")}>👑</span>
        <span className={totalBadgeClass}>{breakdown.total}</span>
        {showRemove ? <button className="remove-player" aria-label="Remove player" onClick={on.remove}>✕</button> : null}
      </div>

      {game.accordion ? (
        <div className="card-tools">
          <button className="mini-btn" aria-expanded={allOpen} onClick={on.toggleAll}>
            {allOpen ? "⌃ Collapse all" : "⌄ Expand all"}
          </button>
          <button className="mini-btn danger" onClick={on.resetPlayer}>↺ Reset player</button>
        </div>
      ) : null}

      {scorer.keys.map(key => (
        <CategoryBlock key={key} game={game} scorer={scorer} p={p} catKey={key}
                       variant={variant} showRules={showRules} on={on} />
      ))}

      <SumStrip game={game} breakdown={breakdown} />
    </div>
  );
}
