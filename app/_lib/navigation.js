// Pure URL interpretation for the server-rendered recap and the client-side SPA restoration path.
// Keeping this out of either page makes the contextual-return contract cheap to test.

export function recapBackTarget(query, game){
  const origin = query?.from;
  const profile = query?.profile;
  if (origin === "leaderboard") return { href: `/?game=${game.key}&view=leaderboard`, label: "Leaderboard" };
  if (origin === "history" && profile) {
    return { href: `/?game=${game.key}&view=history&profile=${encodeURIComponent(profile)}`, label: "Player history" };
  }
  if (origin === "stats") return { href: `/stats/${game.key}`, label: `${game.label} stats` };
  return { href: "/", label: "All games" };
}

export function restoreDestination(search, validGameKeys){
  const params = new URLSearchParams(search);
  const game = params.get("game");
  const view = params.get("view");
  const profile = params.get("profile");
  if (!game || !validGameKeys.includes(game)) return null;
  if (view === "leaderboard") return { game, view };
  if (view === "history" && profile) return { game, view, profile };
  return { game, view: "landing" };
}
