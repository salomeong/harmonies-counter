// The read-only recap of a saved game — the opposite affordance of the live scorer it sits beside.
// No accordion, no buttons, no editable inputs: everything a player did is already decided, so
// there is nothing here to tap. Every category is shown flat and always expanded (the `.category`
// layout Faraway already uses for its non-accordion games), because a finished board has nothing
// left to collapse.
//
// Deliberately reuses `SumStrip` from Card.jsx as-is — it was already pure presentation (spans and
// a pip, no buttons), so it needed no read-only variant. `CategoryBlock`/`CatBody`/`PlayerCard`
// were NOT reusable the same way: they hardcode the name input, the accordion toggle button and the
// "✎ Enter total" affordance, which is exactly the chrome a finished game must not show.
//
// This whole route is a Server Component, and Card.jsx carries "use client" — so SumStrip is a
// client component being invoked from server-rendered code. Every prop crossing that boundary must
// serialize, and a game descriptor is NOT serializable: cat.points/cat.controls/cat.restore are
// live functions. SumStrip only ever reads `game.sums`, so only that plain slice is passed through
// — see the `{ sums: game.sums }` at its call site below, never the descriptor itself.

import { tokenArt } from "@/src/ui/controls.js";
import { SumStrip } from "./Card.jsx";
import { MASCOTS } from "@/app/_lib/mascots.js";
import { formatDate } from "@/app/_lib/format.js";

function CatIcon({ scorer, catKey }){
  const c = scorer.cat(catKey);
  if (typeof c.art === "function") return <span className="recap-cat-icon" dangerouslySetInnerHTML={{ __html: c.art() }} />;
  if (c.art) return <span className="recap-cat-icon" dangerouslySetInnerHTML={{ __html: tokenArt(c.art, 1) }} />;
  return null;
}

// A category absent from `present` didn't exist when this row was saved (the game gained it
// later) — rendering it as a hard 0 would claim the player scored nothing in a category their
// game never had, so it gets its own visibly different row instead.
function UntrackedRow({ scorer, catKey }){
  return (
    <div className="category recap-untracked" data-cat={catKey}>
      <div className="cat-label">
        <span className="tok-dot" style={{ background: `var(${scorer.dot(catKey)})`, opacity: 0.35 }} />
        <span className="cat-name">{scorer.label(catKey)}</span>
      </div>
      <div className="recap-note">not tracked when this game was saved</div>
    </div>
  );
}

function CategoryRow({ scorer, p, catKey, variant }){
  const cat = scorer.cat(catKey);
  const work = cat.work ? cat.work(p, variant) : null;
  return (
    <div className="category" data-cat={catKey}>
      <div className="cat-label">
        <span className="tok-dot" style={{ background: `var(${scorer.dot(catKey)})` }} />
        <CatIcon scorer={scorer} catKey={catKey} />
        <span className="cat-name">{scorer.label(catKey)}</span>
      </div>
      <div className="cat-pts">{scorer.catPoints(p, catKey)}</div>
      {work ? <div className="cat-work" dangerouslySetInnerHTML={{ __html: work }} /> : null}
    </div>
  );
}

// `storedTotal` is what the game actually ended on and is always the headline — never
// recomputed, per docs/ledger.md. `recomputedTotal` (under today's rules, from the restored
// player) is shown alongside ONLY when it differs, so a rule change is visible rather than
// silently implying disagreement is corruption.
//
// Both numbers appear exactly ONCE each, never two totals on the same card claiming to be "the"
// total: SumStrip's own `breakdown.total` is overridden to the same displayed value as the header
// badge before being passed in, rather than left to recompute independently — sub-group columns
// (landscape/animals/…) are still genuinely recomputed, since nothing else stores those.
//
// `storedTotal == null` is schema.sql's own documented signal for "this row has no score" (total_
// score is NULL exactly when ended_by <> 'score' — see docs/ledger.md), not a check invented here.
// A 7 Wonders Duel supremacy win is the one case that produces it today: the game ended before a
// Civilian Victory tally ever happened, so there is no per-category grid to show and no "0" that
// wouldn't be read as a real (if unlucky) score. RecapHeader already states the reason ("· ended by
// military supremacy"), so this card only needs to say there's nothing more to show.
function RecapPlayerCard({ game, scorer, p, present, storedTotal, mascotSrc, variant, isWinner, showCrown }){
  if (storedTotal == null) {
    return (
      <div className={"player-card" + (game.cardClass ? " " + game.cardClass : "") + (isWinner ? " winner" : "")}>
        <div className="player-header">
          {game.mascots ? <img className="mascot" src={mascotSrc} alt="" /> : null}
          <span className="recap-name">{p.name}</span>
          <span className={"crown" + (showCrown ? "" : " hidden")}>👑</span>
        </div>
        <div className="recap-no-score">
          {isWinner ? "Won — the game ended before scoring was tallied." : "The game ended before scoring was tallied."}
        </div>
      </div>
    );
  }

  const recomputedTotal = scorer.total(p);
  const displayTotal = storedTotal;
  const diverges = recomputedTotal !== storedTotal;
  const sumStripBreakdown = { ...scorer.breakdown(p), total: displayTotal };

  return (
    <div className={"player-card" + (game.cardClass ? " " + game.cardClass : "") + (isWinner ? " winner" : "")}>
      <div className="player-header">
        {game.mascots ? <img className="mascot" src={mascotSrc} alt="" /> : null}
        <span className="recap-name">{p.name}</span>
        <span className={"crown" + (showCrown ? "" : " hidden")}>👑</span>
        <span className={game.accordion ? "pip pip-total total-badge" : "total-badge"}>
          {displayTotal}
        </span>
      </div>
      {diverges ? (
        <div className="recap-note recap-divergence">↺ {recomputedTotal} pts under today&apos;s rules</div>
      ) : null}

      {scorer.keys.map(key => (
        present.includes(key)
          ? <CategoryRow key={key} scorer={scorer} p={p} catKey={key} variant={variant} />
          : <UntrackedRow key={key} scorer={scorer} catKey={key} />
      ))}

      <SumStrip game={{ sums: game.sums }} breakdown={sumStripBreakdown} />
    </div>
  );
}

function RecapStamp(){
  // A small rubber-stamp mark rather than literal skeuomorphism — the one deliberately different
  // element on the page, there to say at a glance "this game is decided" before a word is read.
  return <div className="recap-stamp" aria-hidden="true">Final</div>;
}

export function RecapHeader({ game, session }){
  const variantNote = game.waterToggle && session.variant && session.variant.waterSide === "island"
    ? "Islands variant" : null;
  return (
    <div className="recap-header">
      <RecapStamp />
      <img className="recap-logo" src={game.logo} alt={game.label} />
      <div className="recap-meta">
        <span>{formatDate(session.playedAt)}</span>
        {variantNote ? <span>· {variantNote}</span> : null}
        {session.endedBy && session.endedBy !== "score" ? <span>· ended by {session.endedBy.replace(/_/g, " ")}</span> : null}
      </div>
    </div>
  );
}

// `restored`: one entry per seat, `{ seat, player, present, isWinner, storedTotal, variant }` —
// `isWinner`/`storedTotal` come straight off the session_players row (DB truth about who actually
// won), never recomputed here. A rule change after the fact must not retroactively crown someone
// new.
export function RecapPlayers({ game, scorer, restored }){
  const winners = restored.filter(r => r.isWinner === true).length;
  return (
    <div className="players recap-players">
      {restored.map((r, idx) => (
        <RecapPlayerCard
          key={r.seat}
          game={game}
          scorer={scorer}
          p={r.player}
          present={r.present}
          storedTotal={r.storedTotal}
          mascotSrc={MASCOTS[idx % MASCOTS.length]}
          variant={r.variant}
          isWinner={r.isWinner}
          showCrown={r.isWinner && winners === 1}
        />
      ))}
    </div>
  );
}
