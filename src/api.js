// All /api/* access from the client goes through here. (The /g/[id] recap route does NOT use this
// file — it's a Server Component and queries lib/session.mjs directly, no HTTP round trip needed.)
//
// The stale-response race that three hand-rolled guards used to solve separately (landing chips,
// history, leaderboard, each with its own incrementing request id) is now TanStack Query's job —
// see app/providers.jsx — so fetchJson() only needs to own the timeout/abort plumbing, not request
// ordering.

// Fetches `url`, aborting after `timeout` ms (or when the caller's own `signal` aborts). Throws on
// a non-OK response — the thrown Error carries `.status` so a caller that needs to treat a
// particular status specially (see fetchProfile's 404 below) can catch and inspect it instead of
// getting a generic failure. Resolves with the parsed JSON body otherwise.
export async function fetchJson(url, { timeout = 10000, signal, ...init } = {}){
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok){
      const err = new Error("bad_status");
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

export async function fetchProfiles(gameKey){
  const data = await fetchJson("/api/profiles?game=" + encodeURIComponent(gameKey));
  return data.profiles || [];
}

// A 404 here means "no history yet" — not a failure — so it resolves to null instead of throwing.
// Any other non-OK status, or a network error, still throws exactly like before.
export async function fetchProfile(key, gameKey){
  try {
    return await fetchJson("/api/profile?name=" + encodeURIComponent(key) + "&game=" + encodeURIComponent(gameKey));
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function fetchLeaderboard(gameKey){
  return fetchJson("/api/leaderboard?game=" + encodeURIComponent(gameKey));
}

// Unused by the recap page itself (see the file header), but kept as the client-side counterpart
// to GET /api/session for anything that isn't a Server Component — a future client-side widget, or
// tests that want to hit the route the way a browser would.
export async function fetchSession(publicId){
  return fetchJson("/api/session?id=" + encodeURIComponent(publicId));
}

export async function postGame(payload){
  return fetchJson("/api/save-game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
