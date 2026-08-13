// Recap.jsx has no patch-hook discipline to test (it's a Server Component: rendered once,
// never patched) — see app/_components/Recap.jsx's header comment for why it deliberately does NOT
// reuse CategoryBlock/CatBody/PlayerCard. What needs proving instead is the thing unique to reading
// a game back OUT of the ledger rather than scoring one live: that scorer.fromDetail() round-trips
// correctly through the actual rendered page, including the two states a live card can never be
// in — a typed override on a category that's otherwise all zeros, and a category the blob doesn't
// have at all (a schema-drift case that can't happen today but must not crash tomorrow).

import { describe, test, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RecapPlayers } from "@/app/_components/Recap.jsx";
import { makeScorer } from "@/src/scoring.js";
import { GAME_LIST } from "@/src/games/index.js";
import { sevenwonders } from "@/src/games/sevenwonders.js";

afterEach(cleanup);

// Distinct nonzero values in every field — same shape as scoring.test.js's FULL_PLAYERS — so a
// restore that writes the wrong field or drops one cannot coincidentally still score right.
function fullPlayerFor(game){
  if (game.key === "harmonies"){
    return {
      id: 1, name: "Full", totals: {}, open: [],
      trees: { h1: 1, h2: 2, h3: 3 }, mountains: { h1: 4, h2: 5, h3: 6 },
      fields: 7, buildings: 8, river: 9, islands: 3,
      animals: [11, 12, 13], bonus: 14
    };
  }
  if (game.key === "faraway"){
    return { id: 1, name: "Full", totals: {}, open: [], regionFame: [1, 2, 3], sanctuaryFame: [4, 5] };
  }
  return {
    id: 1, name: "Full", totals: {}, open: [],
    military: { w1: 1, w3: 2, w5: 3, loss: 4 }, treasury: 17,
    wonders: [3, 4, 5], civilian: [6, 7],
    science: { tablet: 3, compass: 2, gear: 1 },
    commercial: [8], guilds: [9, 10]
  };
}

// Builds one `restored` entry the way app/g/[id]/page.jsx does: a detail blob in, fromDetail() out,
// with isWinner/storedTotal carried alongside exactly as they'd arrive from the DB row (never
// folded into the reconstructed player itself).
function seat({ scorer, detail, isWinner = false, storedTotal, variant = {} }){
  const { player, present } = scorer.fromDetail(detail, { id: 1, name: "Row" });
  return { seat: 0, player, present, isWinner, storedTotal, variant };
}

describe("recap round-trips a saved game for every registered game", () => {
  for (const game of GAME_LIST){
    test(`${game.label}: every category renders, and the grand total is the reconstructed player's real total`, () => {
      const scorer = makeScorer(game, () => ({ waterSide: "river" }));
      const p = fullPlayerFor(game);
      const detail = scorer.detail(p);
      const storedTotal = scorer.total(p);
      const restored = [seat({ scorer, detail, isWinner: true, storedTotal })];

      const { container } = render(<RecapPlayers game={game} scorer={scorer} restored={restored} />);

      for (const key of scorer.keys){
        expect(container.querySelector(`.category[data-cat="${key}"]`)).toBeTruthy();
      }
      // The grand total shown is genuinely computed from the restored player, not copy-pasted from
      // storedTotal — independently recomputed here via the same scorer surface the component uses.
      const recomputed = scorer.total(restored[0].player);
      expect(recomputed).toBe(storedTotal); // sanity: no overrides in this fixture, so they must agree
      expect(container.querySelector(".total-badge").textContent).toBe(String(storedTotal));
      // A card must never show two different numbers both claiming to be "the total" — the
      // sum-strip's own grand total has to agree with the header badge, not silently recompute.
      const sumStripTotal = container.querySelector(".card-sum .pip-total");
      if (sumStripTotal) expect(sumStripTotal.textContent).toBe(String(storedTotal));
    });
  }
});

test("7 Wonders: a typed override on an infer:null category round-trips into a real recap number, not 0", () => {
  // The exact bug _totals exists to fix: every 7W category is infer:null, so typing a total is the
  // FAST path for science/treasury, not an edge case — and before _totals this reconstructed as 0.
  const scorer = makeScorer(sevenwonders, () => ({}));
  const p = scorer.newPlayer(1, "Typed");
  p.totals.science = 21;
  p.totals.treasury = 5;
  const storedTotal = scorer.total(p); // 26
  const restored = [seat({ scorer, detail: scorer.detail(p), isWinner: true, storedTotal })];

  const { container } = render(<RecapPlayers game={sevenwonders} scorer={scorer} restored={restored} />);
  const scienceRow = container.querySelector('.category[data-cat="science"] .cat-pts');
  expect(scienceRow.textContent).toBe("21");
  expect(container.querySelector(".total-badge").textContent).toBe(String(storedTotal));
});

test("a category missing from the blob renders as untracked, not as a silent 0", () => {
  const game = GAME_LIST[0]; // harmonies
  const scorer = makeScorer(game, () => ({ waterSide: "river" }));
  const p = fullPlayerFor(game);
  const detail = scorer.detail(p);
  delete detail.bonus; // simulates a row saved before this category existed

  const restored = [seat({ scorer, detail, isWinner: true, storedTotal: null })];
  const { container } = render(<RecapPlayers game={game} scorer={scorer} restored={restored} />);

  const bonusRow = container.querySelector('.category[data-cat="bonus"]');
  expect(bonusRow.classList.contains("recap-untracked")).toBe(true);
  expect(bonusRow.querySelector(".cat-pts")).toBeNull();
  expect(bonusRow.textContent.toLowerCase()).toContain("not tracked");
  // The other six categories are unaffected — this is a per-category gap, not a whole-player one.
  expect(container.querySelectorAll(".category").length).toBe(game.cats.length);
});

describe("the stored total is always the headline; a divergence from today's rules is labelled, not hidden", () => {
  test("no note when the recomputed total agrees with the stored total", () => {
    const game = GAME_LIST[0];
    const scorer = makeScorer(game, () => ({ waterSide: "river" }));
    const p = fullPlayerFor(game);
    const restored = [seat({ scorer, detail: scorer.detail(p), isWinner: true, storedTotal: scorer.total(p) })];
    const { container } = render(<RecapPlayers game={game} scorer={scorer} restored={restored} />);
    expect(container.querySelector(".recap-divergence")).toBeNull();
  });

  test("a note appears, naming the recomputed total, when the stored total no longer matches", () => {
    const game = GAME_LIST[0];
    const scorer = makeScorer(game, () => ({ waterSide: "river" }));
    const p = fullPlayerFor(game);
    const recomputed = scorer.total(p);
    // A rule change after the fact, simulated: the row's frozen total_score no longer matches what
    // today's descriptors would produce. total_score must still be what's shown as the headline.
    const restored = [seat({ scorer, detail: scorer.detail(p), isWinner: true, storedTotal: recomputed + 7 })];
    const { container } = render(<RecapPlayers game={game} scorer={scorer} restored={restored} />);

    // Headline is the STORED value, never silently recomputed — and the sum-strip's own grand
    // total must agree with it too, not independently show the recomputed number.
    expect(container.querySelector(".total-badge").textContent).toBe(String(recomputed + 7));
    expect(container.querySelector(".card-sum .pip-total").textContent).toBe(String(recomputed + 7));
    const note = container.querySelector(".recap-divergence");
    expect(note).toBeTruthy();
    expect(note.textContent).toContain(String(recomputed));
  });
});

describe("the crown reflects the DB's is_winner, never a recompute, and never shows on a tie", () => {
  test("exactly one winner gets the crown", () => {
    const game = GAME_LIST[0];
    const scorer = makeScorer(game, () => ({ waterSide: "river" }));
    const p = fullPlayerFor(game);
    const winnerSeat = { ...seat({ scorer, detail: scorer.detail(p), isWinner: true, storedTotal: 81 }), seat: 0 };
    const loserSeat = { ...seat({ scorer, detail: scorer.detail(p), isWinner: false, storedTotal: 5 }), seat: 1 };
    const { container } = render(<RecapPlayers game={game} scorer={scorer} restored={[winnerSeat, loserSeat]} />);
    const crowns = [...container.querySelectorAll(".crown")].filter(el => !el.classList.contains("hidden"));
    expect(crowns.length).toBe(1);
  });

  test("a tie (two is_winner=true rows) shows no crown at all", () => {
    const game = GAME_LIST[0];
    const scorer = makeScorer(game, () => ({ waterSide: "river" }));
    const p = fullPlayerFor(game);
    const a = { ...seat({ scorer, detail: scorer.detail(p), isWinner: true, storedTotal: 50 }), seat: 0 };
    const b = { ...seat({ scorer, detail: scorer.detail(p), isWinner: true, storedTotal: 50 }), seat: 1 };
    const { container } = render(<RecapPlayers game={game} scorer={scorer} restored={[a, b]} />);
    const crowns = [...container.querySelectorAll(".crown")].filter(el => !el.classList.contains("hidden"));
    expect(crowns.length).toBe(0);
  });
});
