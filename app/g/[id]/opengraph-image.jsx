// The share-preview card for a recap link — WhatsApp/iMessage/Slack read this file automatically
// by its Next.js convention name, no wiring needed beyond it existing. Colours are the same hex
// values styles.css's custom properties resolve to today (satori — the renderer behind
// ImageResponse — can't read CSS custom properties, so they're inlined by hand); if the palette in
// styles.css ever changes, this drifts and needs updating alongside it.

import { ImageResponse } from "next/og";
import { getSessionByPublicId } from "@/lib/session.mjs";
import { getGame } from "@/src/games/index.js";
import { formatDate } from "@/app/_lib/format.js";

// getSql() needs Node's `fetch`-based driver, not the Edge runtime — matching every other route
// that touches the database.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PARCHMENT = "#eee2c6";
const CARD = "#fbf6e9";
const LINE = "#ddd0ab";
const INK = "#2f3b2f";
const MUTED = "#6b7a6b";
const ACCENT = "#e0871f";

export default async function Image({ params }){
  const { id } = await params;
  const session = await getSessionByPublicId(id).catch(() => null);
  const game = session ? getGame(session.gameKey) : null;

  if (!session || !game){
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: PARCHMENT }}>
          <div style={{ fontSize: 56, fontWeight: 800, color: INK }}>The Faithful Tally</div>
        </div>
      ),
      size
    );
  }

  const ranked = [...session.players].sort((a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity)).slice(0, 4);
  const winner = session.players.find(p => p.isWinner);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", padding: 60, background: PARCHMENT, position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", background: CARD, border: `2px solid ${LINE}`, borderRadius: 28, padding: "52px 64px" }}>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 5, color: ACCENT, fontWeight: 700, textTransform: "uppercase" }}>
            {game.label}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 28 }}>
            {ranked.map(p => (
              <div key={p.seat} style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
                <div style={{ display: "flex", fontSize: 52, fontWeight: 800, color: INK }}>{p.displayName}</div>
                <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: MUTED }}>{p.total ?? "—"}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: 36, fontSize: 26, color: MUTED }}>
            {winner ? `${winner.displayName} won · ` : ""}{formatDate(session.playedAt)}
          </div>
        </div>
        <div style={{ display: "flex", position: "absolute", bottom: 34, right: 46, fontSize: 24, fontWeight: 700, color: INK }}>
          The Faithful Tally
        </div>
      </div>
    ),
    size
  );
}
