// Stats.jsx's three sections are pure presentation over already-aggregated rows — the SQL itself
// (lib/stats.mjs) has no local test harness, same as lib/session.mjs; it was verified by executing
// it against the real database while this feature was built (synthetic multi-session data, hand-
// checked win rates/streaks/head-to-head/category-bests against what was actually written, then
// cleaned up — see the commit message). What IS unit-testable, and matters independently of the
// SQL being right, is that these components render whatever rows they're handed correctly.

import { describe, test, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { WinRateSection, HeadToHeadSection, CategoryBestsSection } from "@/app/_components/Stats.jsx";
import { makeScorer } from "@/src/scoring.js";
import { harmonies } from "@/src/games/harmonies.js";

afterEach(cleanup);

describe("WinRateSection", () => {
  test("empty state when no one has played", () => {
    const { container } = render(<WinRateSection rows={[]} />);
    expect(container.querySelector(".history-empty")).toBeTruthy();
    expect(container.querySelector(".stat-row")).toBeNull();
  });

  test("bar width is proportional to win rate, not a fixed size", () => {
    const { container } = render(
      <WinRateSection rows={[
        { id: 1, displayName: "Full", gamesPlayed: 4, wins: 4, streak: 0 },
        { id: 2, displayName: "None", gamesPlayed: 4, wins: 0, streak: 0 }
      ]} />
    );
    const fills = [...container.querySelectorAll(".stat-bar-fill")];
    // A 0% row renders no fill rect at all rather than a zero-width one.
    expect(fills.length).toBe(1);
    expect(Number(fills[0].getAttribute("width"))).toBeGreaterThan(50);
  });

  test("a positive streak is labelled a win streak and styled 'up'; a negative one a loss streak, styled 'down'", () => {
    const { container } = render(
      <WinRateSection rows={[
        { id: 1, displayName: "Winning", gamesPlayed: 3, wins: 2, streak: 2 },
        { id: 2, displayName: "Losing", gamesPlayed: 3, wins: 1, streak: -3 }
      ]} />
    );
    const streaks = [...container.querySelectorAll(".stat-streak")];
    expect(streaks[0].textContent).toBe("2-game win streak");
    expect(streaks[0].classList.contains("up")).toBe(true);
    expect(streaks[1].textContent).toBe("3-game loss streak");
    expect(streaks[1].classList.contains("down")).toBe(true);
  });

  test("no streak note at all when streak is 0 (mixed most-recent result, or first game)", () => {
    const { container } = render(
      <WinRateSection rows={[{ id: 1, displayName: "Fresh", gamesPlayed: 1, wins: 1, streak: 0 }]} />
    );
    expect(container.querySelector(".stat-streak")).toBeNull();
  });
});

describe("HeadToHeadSection", () => {
  test("empty state when no pair has shared a session", () => {
    const { container } = render(<HeadToHeadSection rows={[]} />);
    expect(container.querySelector(".history-empty")).toBeTruthy();
  });

  test("the leading player is highlighted; a tied record highlights neither", () => {
    const { container } = render(
      <HeadToHeadSection rows={[
        { aId: 1, aName: "Ahead", bId: 2, bName: "Behind", aWins: 3, bWins: 1 },
        { aId: 3, aName: "Tied A", bId: 4, bName: "Tied B", aWins: 2, bWins: 2 }
      ]} />
    );
    const rows = [...container.querySelectorAll(".h2h-row")];
    const [ahead, behind] = rows[0].querySelectorAll(".h2h-name");
    expect(ahead.classList.contains("leads")).toBe(true);
    expect(behind.classList.contains("leads")).toBe(false);
    const [tiedA, tiedB] = rows[1].querySelectorAll(".h2h-name");
    expect(tiedA.classList.contains("leads")).toBe(false);
    expect(tiedB.classList.contains("leads")).toBe(false);
  });
});

describe("CategoryBestsSection", () => {
  const scorer = makeScorer(harmonies, () => ({ waterSide: "river" }));

  test("empty state when nothing has been logged", () => {
    const { container } = render(<CategoryBestsSection game={harmonies} scorer={scorer} bests={{}} />);
    expect(container.querySelector(".history-empty")).toBeTruthy();
  });

  test("only categories with a recorded best render a row, each linking to the session that earned it", () => {
    const bests = {
      trees: { value: 17, displayName: "Salome", sessionId: "abc123" },
      buildings: { value: 10, displayName: "Faith", sessionId: "def456" }
    };
    const { container } = render(<CategoryBestsSection game={harmonies} scorer={scorer} bests={bests} />);
    const rows = container.querySelectorAll(".category[data-cat]");
    expect(rows.length).toBe(2); // not all seven of harmonies' categories — only the two present
    const treesRow = container.querySelector('.category[data-cat="trees"]');
    expect(treesRow.tagName).toBe("A");
    expect(treesRow.getAttribute("href")).toBe("/g/abc123");
    expect(treesRow.querySelector(".stat-best-value").textContent).toBe("17 — Salome");
  });
});
