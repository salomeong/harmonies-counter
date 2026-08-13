import Link from "next/link";

// Covers the whole app, but exists for one route in practice: a mistyped or removed /g/[id].
export default function NotFound(){
  return (
    <div className="page-inner">
      <div className="site-name">The Faithful Tally</div>
      <div className="subtitle">Couldn&apos;t find that game.</div>
      <div className="landing-card">
        <p className="not-found-copy">The link might be mistyped, or the game may have been removed.</p>
        <Link href="/" className="btn-primary">← Back to The Faithful Tally</Link>
      </div>
    </div>
  );
}
