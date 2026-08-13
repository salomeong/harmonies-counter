// A tiny, dependency-free icon set for wayfinding actions. Keeping these as stroked SVGs gives
// navigation one coherent visual language instead of mixing emoji whose appearance changes by OS.

const paths = {
  back: <><path d="m15 18-6-6 6-6"/><path d="M9 12h10"/></>,
  home: <><path d="m4 11 8-7 8 7"/><path d="M6.5 9.5V20h11V9.5"/><path d="M10 20v-6h4v6"/></>,
  players: <><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3.5 2.4-5 5.5-5s4.9 1.5 5.5 5"/><path d="M15.5 6.5a3 3 0 0 1 0 5.5M17 14c2.1.5 3.2 2.1 3.5 5"/></>,
  trophy: <><path d="M8 4h8v4c0 3-1.8 5-4 5S8 11 8 8V4Z"/><path d="M8 6H5v1c0 2 1.2 3 3.5 3M16 6h3v1c0 2-1.2 3-3.5 3M12 13v4M8 20h8M9.5 17h5"/></>,
  chart: <><path d="M5 20V10h4v10M10 20V4h4v16M15 20v-7h4v7"/><path d="M3 20h18"/></>,
  game: <><path d="M7 8h10l3 9a2 2 0 0 1-3.2 2l-2.3-2h-5l-2.3 2A2 2 0 0 1 4 17l3-9Z"/><path d="M8 12h4M10 10v4"/><circle cx="16" cy="11" r=".7" fill="currentColor" stroke="none"/><circle cx="18" cy="14" r=".7" fill="currentColor" stroke="none"/></>,
  share: <><path d="M12 16V4M8 8l4-4 4 4"/><path d="M6 12H4v8h16v-8h-2"/></>,
  tally: <><path d="M6 5v14M10 5v14M14 5v14M18 5 5 19"/></>,
  history: <><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
  arrow: <><path d="M5 12h14M15 8l4 4-4 4"/></>
};

export function NavIcon({ name }){
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
