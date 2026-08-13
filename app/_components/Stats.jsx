// The stats page's building blocks. Reuses Recap.jsx's header treatment ("Final" stamp → "Stats"
// stamp, same logo/meta layout) rather than inventing a second header language for a page that
// sits right next to it in the nav. The bar chart is the one genuinely new visual here: a filled
// pill in --green-dark on a --line track, the same colour a tally pip already uses, so "the green
// bar" reads as the same value-language as everywhere else in the app rather than a chart-library
// default.

import Link from "next/link";
import { tokenArt } from "@/src/ui/controls.js";

export function StatsHeader({ game, gamesLogged }){
  return (
    <div className="recap-header">
      <div className="recap-stamp">Stats</div>
      <img className="recap-logo" src={game.logo} alt={game.label} />
      <div className="recap-meta">
        <span>{gamesLogged} game{gamesLogged === 1 ? "" : "s"} logged</span>
      </div>
    </div>
  );
}

function WinRateBar({ pct }){
  const w = 120, h = 10;
  const fillW = pct > 0 ? Math.max(4, Math.round(w * pct)) : 0;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="stat-bar" aria-hidden="true">
      <rect className="stat-bar-track" x="0" y="0" width={w} height={h} rx={h / 2} />
      {fillW > 0 ? <rect className="stat-bar-fill" x="0" y="0" width={fillW} height={h} rx={h / 2} /> : null}
    </svg>
  );
}

export function WinRateSection({ rows }){
  if (!rows.length) {
    return (
      <div className="history-card stats-section">
        <div className="history-title">🏆 Win rates</div>
        <div className="history-empty">No games logged yet.</div>
      </div>
    );
  }
  return (
    <div className="history-card stats-section">
      <div className="history-title">🏆 Win rates</div>
      {rows.map(r => (
        <div className="stat-row" key={r.id}>
          <span className="stat-name">{r.displayName}</span>
          <WinRateBar pct={r.gamesPlayed ? r.wins / r.gamesPlayed : 0} />
          <span className="stat-frac">{r.wins}/{r.gamesPlayed}</span>
          {r.streak ? (
            <span className={"stat-streak" + (r.streak > 0 ? " up" : " down")}>
              {Math.abs(r.streak)}-game {r.streak > 0 ? "win" : "loss"} streak
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function HeadToHeadSection({ rows }){
  if (!rows.length) {
    return (
      <div className="history-card stats-section">
        <div className="history-title">⚔️ Head-to-head</div>
        <div className="history-empty">Play a game with someone else to see head-to-head records.</div>
      </div>
    );
  }
  return (
    <div className="history-card stats-section">
      <div className="history-title">⚔️ Head-to-head</div>
      {rows.map(r => (
        <div className="h2h-row" key={r.aId + ":" + r.bId}>
          <span className={"h2h-name" + (r.aWins > r.bWins ? " leads" : "")}>{r.aName}</span>
          <span className="h2h-score">{r.aWins}–{r.bWins}</span>
          <span className={"h2h-name" + (r.bWins > r.aWins ? " leads" : "")}>{r.bName}</span>
        </div>
      ))}
    </div>
  );
}

function BestIcon({ scorer, catKey }){
  const c = scorer.cat(catKey);
  if (typeof c.art === "function") return <span className="recap-cat-icon" dangerouslySetInnerHTML={{ __html: c.art() }} />;
  if (c.art) return <span className="recap-cat-icon" dangerouslySetInnerHTML={{ __html: tokenArt(c.art, 1) }} />;
  return null;
}

export function CategoryBestsSection({ game, scorer, bests }){
  const rows = game.cats.filter(c => bests[c.key]);
  if (!rows.length) {
    return (
      <div className="history-card stats-section">
        <div className="history-title">✨ Category bests</div>
        <div className="history-empty">No games logged yet.</div>
      </div>
    );
  }
  return (
    <div className="history-card stats-section">
      <div className="history-title">✨ Category bests</div>
      {rows.map(cat => {
        const best = bests[cat.key];
        return (
          <Link href={`/g/${best.sessionId}?from=stats`} className="category stat-best-row" key={cat.key} data-cat={cat.key}>
            <div className="cat-label">
              <span className="tok-dot" style={{ background: `var(${scorer.dot(cat.key)})` }} />
              <BestIcon scorer={scorer} catKey={cat.key} />
              <span className="cat-name">{scorer.label(cat.key)}</span>
            </div>
            <div className="stat-best-value">{best.value} — {best.displayName}</div>
          </Link>
        );
      })}
    </div>
  );
}
