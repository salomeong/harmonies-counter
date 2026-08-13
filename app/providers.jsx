"use client";

// TanStack Query is scoped to the client surface that genuinely needs it: the landing chips,
// history and leaderboard reads, and the save mutation. It replaces three hand-rolled
// stale-response guards (chipsRequestId / historyRequestId / leaderboardRequestId), which were
// each a partial reimplementation of request keying.
//
// It deliberately does NOT own the session/stats reads — those are Server Components that query
// Postgres directly, so there is no client fetch to cache.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }){
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // A finished board is not changing under us; refetching on every window focus just makes
        // the leaderboard flicker mid-game.
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        retry: 1
      }
    }
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
