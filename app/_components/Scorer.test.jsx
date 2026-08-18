import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Scorer } from "./Scorer.jsx";
import { faraway } from "@/src/games/faraway.js";
import { makeScorer } from "@/src/scoring.js";

afterEach(cleanup);

const scorer = makeScorer(faraway, () => ({ waterSide: "river" }));

function Harness(){
  const [players, setPlayers] = useState([scorer.newPlayer(1), scorer.newPlayer(2)]);
  const edit = (id, fn) => setPlayers(all => all.map(p => {
    if (p.id !== id) return p;
    const next = structuredClone(p);
    fn(next);
    return next;
  }));
  const handlersFor = id => ({
    rename: value => edit(id, p => { p.name = value; }),
    listInput: (cat, index, value) => edit(id, p => { p[scorer.cat(cat).listField][index] = value; }),
    listAdd: cat => edit(id, p => { p[scorer.cat(cat).listField].push(0); }),
    listRemove: (cat, index) => edit(id, p => { p[scorer.cat(cat).listField].splice(index, 1); }),
    resetCat: cat => edit(id, p => scorer.resetCat(p, cat)),
    toTotal: cat => edit(id, p => { p.totals[cat] = scorer.catPoints(p, cat); }),
    totalInput: (cat, value) => edit(id, p => { p.totals[cat] = value; }),
    totalCommit: () => {},
    revert: cat => edit(id, p => { delete p.totals[cat]; })
  });
  return <>
    {/* Not part of the real UI (that's app/page.jsx's footer "+ Add player") — just enough to
        exercise the same players.length growth GuidedReveal reacts to. */}
    <button onClick={() => setPlayers(all => [...all, scorer.newPlayer(all.length + 1)])}>Add player</button>
    <button onClick={() => edit(1, p => { p.name = "Bob"; })}>Rename P1 to Bob</button>
    <button onClick={() => edit(2, p => { p.name = "Bob"; })}>Rename P2 to Bob</button>
    <Scorer game={faraway} scorer={scorer}
      gs={{ players, scoreMode: "player" }} variant={{ waterSide: "river" }}
      showRules handlersFor={handlersFor} dispatch={() => {}} />
  </>;
}

// Card-major now, all the way through: every player's row is on screen together for the SAME
// card, and one "Next card →" click advances the whole group — replacing the old player-major walk
// ("Score Player 2 →" stepping between travellers before anyone saw the next card).
test("Faraway shows every player's row for the same card at once, and one click advances everyone", () => {
  render(<Harness />);
  expect(screen.getByRole("heading", { name: "Begin at the rightmost card" })).toBeTruthy();

  // Both players' name inputs and card-8 fame fields are visible simultaneously.
  expect(screen.getByLabelText("Player 1's name (traveller 1)")).toHaveValue("Player 1");
  expect(screen.getByLabelText("Player 2's name (traveller 2)")).toHaveValue("Player 2");
  fireEvent.change(screen.getByLabelText("Player 1's fame for Region card 8 (traveller 1)"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("Player 2's fame for Region card 8 (traveller 2)"), { target: { value: "3" } });
  expect(screen.getByText("5", { selector: ".guide-row-total" })).toBeTruthy();
  expect(screen.getByText("3", { selector: ".guide-row-total" })).toBeTruthy();

  // There is no more per-player "Score <name> →" step — a single button moves the whole group.
  expect(screen.queryByRole("button", { name: /Score Player \d+/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next card →" }));
  expect(screen.getByLabelText("Player 1's fame for Region card 7 (traveller 1)")).toBeTruthy();
  expect(screen.getByLabelText("Player 2's fame for Region card 7 (traveller 2)")).toBeTruthy();

  for (let card = 6; card >= 1; card--) {
    fireEvent.click(screen.getByRole("button", { name: card === 1 ? "Next card →" : "Next card →" }));
    expect(screen.getByLabelText(`Player 1's fame for Region card ${card} (traveller 1)`)).toBeTruthy();
  }

  fireEvent.click(screen.getByRole("button", { name: "Sanctuaries →" }));
  expect(screen.getByRole("heading", { name: "Score Sanctuaries" })).toBeTruthy();
  // Both players' Sanctuaries rows render together, same card-major shape as Region.
  expect(screen.getAllByRole("button", { name: "+ Add sanctuary" })).toHaveLength(2);

  fireEvent.click(screen.getByRole("button", { name: "Review all players →" }));
  expect(screen.getByRole("heading", { name: "Review every traveller" })).toBeTruthy();
  // The per-traveller "N's journey" walk is gone entirely — straight to the combined grid, which
  // must show both players' region totals (5 and 3) somewhere in its rows.
  expect(screen.queryByText(/'s journey/)).toBeNull();
  const grid = screen.getByRole("table");
  expect(within(grid).getByText("Player 1")).toBeTruthy();
  expect(within(grid).getByText("Player 2")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Edit from the beginning" }));
  expect(screen.getByRole("heading", { name: "Begin at the rightmost card" })).toBeTruthy();
});

test("Faraway: Back steps the whole group back one card, disabled only at card 8", () => {
  render(<Harness />);
  expect(screen.getByRole("button", { name: "← Back" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Next card →" }));
  expect(screen.getByRole("button", { name: "← Back" })).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "← Back" }));
  expect(screen.getByRole("heading", { name: "Begin at the rightmost card" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "← Back" })).toBeDisabled();
});

// ±1/±5 steppers augment direct typing, they don't replace it — a card worth 16 fame should be
// reachable either way (three +5 taps and one +1, or just typing "16").
test("Faraway: fame steppers adjust the value without disturbing the other player's row", () => {
  render(<Harness />);
  const p1Label = "Player 1's fame for Region card 8 (traveller 1)";
  const p2Label = "Player 2's fame for Region card 8 (traveller 2)";

  fireEvent.click(screen.getByRole("button", { name: `Add 5 fame — ${p1Label}` }));
  fireEvent.click(screen.getByRole("button", { name: `Add 5 fame — ${p1Label}` }));
  fireEvent.click(screen.getByRole("button", { name: `Add 5 fame — ${p1Label}` }));
  fireEvent.click(screen.getByRole("button", { name: `Add 1 fame — ${p1Label}` }));
  expect(screen.getByLabelText(p1Label)).toHaveValue(16);
  // Player 2's row is untouched by player 1's steppers.
  expect(screen.getByLabelText(p2Label)).toHaveValue(0);

  fireEvent.click(screen.getByRole("button", { name: `Subtract 1 fame — ${p1Label}` }));
  expect(screen.getByLabelText(p1Label)).toHaveValue(15);

  // Direct typing still works alongside the steppers — they augment, not replace.
  fireEvent.change(screen.getByLabelText(p2Label), { target: { value: "16" } });
  expect(screen.getByLabelText(p2Label)).toHaveValue(16);
});

test("Faraway: fame steppers floor at 0 rather than going negative", () => {
  render(<Harness />);
  const label = "Player 1's fame for Region card 8 (traveller 1)";
  expect(screen.getByRole("button", { name: `Subtract 1 fame — ${label}` })).toBeDisabled();
  expect(screen.getByRole("button", { name: `Subtract 5 fame — ${label}` })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: `Add 1 fame — ${label}` }));
  fireEvent.click(screen.getByRole("button", { name: `Subtract 5 fame — ${label}` })); // 1 - 5, clamped
  expect(screen.getByLabelText(label)).toHaveValue(0);
});

// The whole-Region "type one total instead" shortcut moved beside the player's name (2026-08-18)
// — it's a once-per-player choice, not a per-card one, so it belongs in the row-head rather than
// repeating under all 8 region-card screens. It should disappear once total mode is actually on
// (CatBody's own revert control replaces it) and never appear for Sanctuaries, which has its own
// separate "✎ Total" shortcut in the same row-head slot (2026-08-18: Sanctuaries was redesigned to
// match Region's treatment, replacing the old full-width CategoryBlock-driven button).
test("Faraway: the whole-Region total shortcut lives beside the name, once, and swaps for a revert once active", () => {
  render(<Harness />);
  const shortcutFor = name => screen.getByRole("button", { name: `Enter a whole Region total instead of card-by-card for ${name}` });

  expect(shortcutFor("Player 1")).toBeTruthy();
  expect(shortcutFor("Player 2")).toBeTruthy();

  fireEvent.click(shortcutFor("Player 1"));
  expect(screen.queryByRole("button", { name: "Enter a whole Region total instead of card-by-card for Player 1" })).toBeNull();
  expect(screen.getByRole("button", { name: "Back to tallying" })).toBeTruthy(); // CatBody's own revert control
  // Player 2 is unaffected — still on the card-by-card path with their own shortcut visible.
  expect(shortcutFor("Player 2")).toBeTruthy();

  // Not repeated per card — advancing still shows exactly one shortcut for Player 2 (whose total
  // mode was never toggled), not one per region-card screen's worth of accumulated buttons.
  fireEvent.click(screen.getByRole("button", { name: "Next card →" }));
  expect(screen.getAllByRole("button", { name: /Enter a whole Region total instead/ })).toHaveLength(1);
});

test("Faraway: no whole-Region shortcut appears on the Sanctuaries screen — that category has its own, beside each name", () => {
  render(<Harness />);
  for (let i = 0; i < 8; i++) fireEvent.click(screen.getByRole("button", { name: /Next card →|Sanctuaries →/ }));
  expect(screen.getByRole("heading", { name: "Score Sanctuaries" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Enter a whole Region total instead/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Enter a whole Sanctuaries total instead of adding one by one for Player 1" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Enter a whole Sanctuaries total instead of adding one by one for Player 2" })).toBeTruthy();
});

// Regression: a player added mid-reveal must not be silently skipped past cards they were never
// asked about. Since every stage now shows every player's row, the only correct fix is restarting
// the whole group's walk — existing answers aren't touched, only revisited.
test("Faraway: adding a player mid-reveal restarts the group's walk at card 8", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Next card →" })); // now on card 7
  expect(screen.getByLabelText("Player 1's fame for Region card 7 (traveller 1)")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Add player" }));

  expect(screen.getByRole("heading", { name: "Begin at the rightmost card" })).toBeTruthy();
  expect(screen.getByLabelText("Player 1's fame for Region card 8 (traveller 1)")).toBeTruthy();
  expect(screen.getByLabelText("Player 3's fame for Region card 8 (traveller 3)")).toBeTruthy();
});

// Regression: this app never enforces unique player names, and with every row visible at once
// (unlike the old one-player-at-a-time screen, where the name alone was already unambiguous) two
// identically-renamed players would otherwise get IDENTICAL aria-labels — a real screen-reader
// ambiguity, found by adversarial review and confirmed here via getByLabelText's own uniqueness
// requirement (it throws on a genuine collision).
test("Faraway: two players who share a name still get distinguishable row labels", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Rename P1 to Bob" }));
  fireEvent.click(screen.getByRole("button", { name: "Rename P2 to Bob" }));

  expect(screen.getByLabelText("Bob's name (traveller 1)")).toHaveValue("Bob");
  expect(screen.getByLabelText("Bob's name (traveller 2)")).toHaveValue("Bob");
  expect(screen.getByLabelText("Bob's fame for Region card 8 (traveller 1)")).toBeTruthy();
  expect(screen.getByLabelText("Bob's fame for Region card 8 (traveller 2)")).toBeTruthy();
});

test("Faraway keeps the full scorecard as a fast path", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Full scorecard" }));
  expect(screen.getAllByRole("button", { name: "✎ Enter category total" })).toHaveLength(4);
});

test("Faraway seats up to 7 players (base game 6, per the expansion)", () => {
  expect(faraway.maxPlayers).toBe(7);
});
