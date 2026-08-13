// Per-game statistics: win rates, streaks, head-to-head, category bests. A Server Component, same
// "query Postgres directly, no client round trip" shape as app/g/[id]/page.jsx.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getGame } from "@/src/games/index.js";
import { makeScorer } from "@/src/scoring.js";
import { getWinRates, getStreaks, getHeadToHead, getDetailRowsForStats } from "@/lib/stats.mjs";
import { StatsHeader, WinRateSection, HeadToHeadSection, CategoryBestsSection } from "@/app/_components/Stats.jsx";
import { ShareButton } from "@/app/_components/ShareButton.jsx";
import { NavIcon } from "@/app/_components/NavIcon.jsx";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }){
  const { game: gameKey } = await params;
  const game = getGame(gameKey);
  return { title: game ? `${game.label} stats — The Faithful Tally` : "Stats — The Faithful Tally" };
}

// Category-best VALUES are computed under each row's own session.variant — Harmonies' water
// category scores differently on River vs Islands, and lumping every session under one variant
// would silently misscore whichever games didn't match it. A scorer is cheap to build, so one gets
// memoized per distinct variant seen rather than reused wrong.
function scorerCache(game){
  const cache = new Map();
  return variant => {
    const key = JSON.stringify(variant || {});
    if (!cache.has(key)) cache.set(key, makeScorer(game, () => variant));
    return cache.get(key);
  };
}

export default async function StatsPage({ params }){
  const { game: gameKey } = await params;
  const game = getGame(gameKey);
  if (!game) notFound();

  const [winRateRows, headToHeadRows, detailRows] = await Promise.all([
    getWinRates(gameKey),
    getHeadToHead(gameKey),
    getDetailRowsForStats(gameKey)
  ]);
  const streaks = await getStreaks(gameKey, winRateRows.map(r => r.id));
  const winRates = winRateRows.map(r => ({ ...r, streak: streaks[r.id] || 0 }));

  const scorerFor = scorerCache(game);
  const bests = {};
  for (const row of detailRows){
    const scorer = scorerFor(row.variant);
    const { player, present } = scorer.fromDetail(row.detail, { id: 0, name: row.displayName });
    for (const cat of game.cats){
      if (!present.includes(cat.key)) continue;
      const value = scorer.catPoints(player, cat.key);
      if (!bests[cat.key] || value > bests[cat.key].value){
        bests[cat.key] = { value, displayName: row.displayName, sessionId: row.sessionId };
      }
    }
  }
  // Labels/dots/icons only — display metadata, read off a fixed default-variant scorer. Water's
  // label ("River" vs "Islands") is the one variant-dependent piece here; a best drawn from an
  // Islands game can end up captioned "River" if most of this game's history is River-side. The
  // NUMBER is always correct (computed per-row above); this is a display nicety, not a scoring one.
  const labelScorer = scorerFor({});

  const gamesLogged = new Set(detailRows.map(r => r.sessionId)).size;

  return (
    <div className="page-inner">
      <div className="top-links">
        <Link href="/" className="nav-action"><NavIcon name="home" /> All games</Link>
        <ShareButton />
      </div>
      <StatsHeader game={game} gamesLogged={gamesLogged} />
      <WinRateSection rows={winRates} />
      <HeadToHeadSection rows={headToHeadRows} />
      <CategoryBestsSection game={game} scorer={labelScorer} bests={bests} />
    </div>
  );
}
