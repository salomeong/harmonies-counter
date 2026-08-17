import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  return <Scorer game={faraway} scorer={scorer}
    gs={{ players, scoreMode: "player" }} variant={{ waterSide: "river" }}
    showRules handlersFor={handlersFor} dispatch={() => {}} />;
}

test("Faraway walks every player through the SAME card before either moves to the next one", () => {
  render(<Harness />);
  expect(screen.getByRole("heading", { name: "Begin at the rightmost card" })).toBeTruthy();
  expect(screen.getByLabelText("Player name")).toHaveValue("Player 1");
  fireEvent.change(screen.getByLabelText("Fame for Region card 8"), { target: { value: "5" } });
  expect(screen.getByText("5", { selector: ".total-badge" })).toBeTruthy();

  // Both players enter card 8 before either sees card 7 — a phase-first, not player-first, walk.
  fireEvent.click(screen.getByRole("button", { name: "Score Player 2 →" }));
  expect(screen.getByLabelText("Player name")).toHaveValue("Player 2");
  expect(screen.getByLabelText("Fame for Region card 8")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Fame for Region card 8"), { target: { value: "3" } });

  fireEvent.click(screen.getByRole("button", { name: "Next card →" }));
  expect(screen.getByLabelText("Player name")).toHaveValue("Player 1");
  expect(screen.getByLabelText("Fame for Region card 7")).toBeTruthy();

  for (let card = 7; card >= 1; card--) {
    fireEvent.click(screen.getByRole("button", { name: "Score Player 2 →" }));
    expect(screen.getByLabelText(`Fame for Region card ${card}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: card === 1 ? "Sanctuaries →" : "Next card →" }));
    expect(screen.getByLabelText("Player name")).toHaveValue("Player 1");
  }

  expect(screen.getByRole("heading", { name: "Score Sanctuaries" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Score Player 2 →" }));
  expect(screen.getByLabelText("Player name")).toHaveValue("Player 2");

  fireEvent.click(screen.getByRole("button", { name: "Review travellers →" }));
  expect(screen.getByLabelText("Player name")).toHaveValue("Player 1");
  expect(screen.getByRole("heading", { name: "Player 1's journey" })).toBeTruthy();
  expect(screen.getByText("5", { selector: ".guide-grand .pip" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Score Player 2 →" }));
  expect(screen.getByRole("heading", { name: "Player 2's journey" })).toBeTruthy();
  expect(screen.getByText("3", { selector: ".guide-grand .pip" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Review all players →" }));
  expect(screen.getByRole("heading", { name: "Review every traveller" })).toBeTruthy();
});

test("Faraway keeps the full scorecard as a fast path", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Full scorecard" }));
  expect(screen.getAllByRole("button", { name: "✎ Enter category total" })).toHaveLength(4);
});
