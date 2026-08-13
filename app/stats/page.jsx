// Bare /stats: which game? Same tile grid as the root picker (app/page.jsx), same markup and
// classes, but real <a href="/stats/<key>"> links instead of a client-side game-select handler —
// this route has no state to select into, it's a Server Component two hops from here.

import Link from "next/link";
import { GAME_LIST } from "@/src/games/index.js";
import { NavIcon } from "@/app/_components/NavIcon.jsx";

export const metadata = { title: "Stats — The Faithful Tally" };

export default function StatsPickerPage(){
  return (
    <div className="page-inner">
      <div className="top-links"><Link href="/" className="nav-action"><NavIcon name="home" /> All games</Link></div>
      <div className="site-name">The Faithful Tally</div>
      <div className="subtitle">Stats for which game?</div>
      <div className="picker-grid">
        {GAME_LIST.map(g => (
          <Link key={g.key} href={`/stats/${g.key}`} className="game-tile">
            <div className="game-tile-art"><img src={g.tileArt} alt="" /></div>
            <img className="game-tile-logo" src={g.logo} alt={g.label} />
            <span className="game-tile-tagline">{g.tagline}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
