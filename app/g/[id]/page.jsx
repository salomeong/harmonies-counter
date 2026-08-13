// The session detail / recap route: the ledger's read side. GET /api/session has returned this
// data since it was written; nothing linked to it until now. A Server Component queries Postgres
// directly through lib/session.mjs rather than fetching its own API route — no client round trip,
// no loading spinner for a page whose entire content is already known on the server.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getSessionByPublicId } from "@/lib/session.mjs";
import { getGame } from "@/src/games/index.js";
import { makeScorer } from "@/src/scoring.js";
import { RecapHeader, RecapPlayers } from "@/app/_components/Recap.jsx";
import { ShareButton } from "@/app/_components/ShareButton.jsx";
import { PhotoUpload } from "@/app/_components/PhotoUpload.jsx";
import { formatDate } from "@/app/_lib/format.js";

// Reads process.env.DATABASE_URL through the lazy getSql() inside lib/session.mjs — force-dynamic
// keeps Next from trying to evaluate (and cache) this at `next build` time, when there is no
// database, and from ever caching one game's recap as another's.
export const dynamic = "force-dynamic";

// `scorer.fromDetail()` (src/scoring.js) is what makes this possible: it restores typed overrides
// alongside tallied fields, so `catPoints`/`breakdown`/`total`/`work()` run on a reconstructed
// player exactly as they would on a live one. See CLAUDE.md/docs/ledger.md.
async function loadRecap(publicId){
  const session = await getSessionByPublicId(publicId);
  if (!session) return null;
  const game = getGame(session.gameKey);
  if (!game) return null; // a session for a game key this build no longer registers

  const variant = session.variant && typeof session.variant === "object" ? session.variant : {};
  const scorer = makeScorer(game, () => variant);

  const restored = session.players.map(row => {
    const { player, present } = scorer.fromDetail(row.detail, { id: row.seat + 1, name: row.displayName });
    return { seat: row.seat, player, present, isWinner: row.isWinner, storedTotal: row.total, variant };
  });

  return { session, game, scorer, restored };
}

export async function generateMetadata({ params }){
  const { id } = await params;
  const data = await loadRecap(id);
  if (!data) return { title: "Game not found — The Faithful Tally" };

  const { session, game, restored } = data;
  const ranked = [...restored].sort((a, b) => (b.storedTotal ?? -Infinity) - (a.storedTotal ?? -Infinity));
  const winner = restored.find(r => r.isWinner);
  const scoreLine = ranked.map(r => `${r.player.name} ${r.storedTotal ?? "—"}`).join(" · ");
  const title = winner
    ? `${winner.player.name} won ${game.label} — The Faithful Tally`
    : `A game of ${game.label} — The Faithful Tally`;
  const description = `${scoreLine} — played ${formatDate(session.playedAt)}`;

  return { title, description, openGraph: { title, description } };
}

export default async function SessionPage({ params }){
  const { id } = await params;
  const data = await loadRecap(id);
  if (!data) notFound();
  const { session, game, scorer, restored } = data;

  return (
    <div className="page-inner">
      <div className="top-links">
        <Link href="/" className="link-btn">🎲 The Faithful Tally</Link>
        <ShareButton />
      </div>
      <RecapHeader game={game} session={session} />
      <RecapPlayers game={game} scorer={scorer} restored={restored} />
      {/* Existing photo URLs are plain strings — safe to pass straight across the server→client
          boundary; nothing here carries a function the way a game descriptor would (see CLAUDE.md's
          "RSC boundaries" note). */}
      <PhotoUpload sessionPublicId={session.publicId} existingPhotos={session.photos.map(p => p.blobUrl)} />
      <div className="citation-footer">
        Benvenuto, J. (2024). Harmonies [Board game]. Libellud.<br />
        Goupy, J., &amp; Lebrat, C. (2023). Faraway [Board game]. Catch Up Games.<br />
        Bauza, A. (2010). 7 Wonders [Board game]. Repos Production.
      </div>
    </div>
  );
}
