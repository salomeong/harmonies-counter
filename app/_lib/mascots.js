// Plain data, no "use client" — deliberately its own file rather than exported from Scorer.jsx.
// Importing a constant across the RSC boundary (server code importing from a "use client" module)
// does not resolve the way a same-side import does; Next generates a client reference for the
// module's exports rather than handing the array through, and the recap route (a Server Component)
// ended up with `MASCOTS[idx]` silently resolving to `undefined` — an <img> with no src, no error,
// no broken-image icon, just a blank circle. Framework-neutral data that both a client and a server
// component need has to live somewhere neither directive touches.
export const MASCOTS = [
  "/assets/animal-fennec.png",
  "/assets/animal-rabbit.png",
  "/assets/animal-bird.png",
  "/assets/animal-boar.png",
  "/assets/animal-mouse.png"
];
