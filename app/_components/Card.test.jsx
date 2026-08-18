// The replacement for the deleted src/ui/card.test.js's patch-hook assertion.
//
// The vanilla app needed that test because `patchScores()` updated numbers in a rendered DOM
// subtree IN PLACE — any score-bearing element that wasn't wired to a `data-pts-for` / `data-sum`
// / `data-count-for` / `data-work-for` hook silently froze at its initial value. Faraway's
// `.cat-pts` shipped exactly that bug once. React removes the whole bug class: there is no second
// update path, every number is computed fresh from `scorer` on every render. What that means is
// there is no longer a *markup shape* to assert ("does this element carry the right data-* hook").
// What's left to prove is behavioural: does the number ON SCREEN actually change when you interact
// with it. That's what every test below does, against the REAL production wiring —
// app/_state/useTally.js's reducer, unmodified — not a hand-rolled stand-in, so a bug in the real
// dispatch/handler plumbing is exactly as visible here as it would be in the browser.
//
// Driven off GAME_LIST in a loop rather than hardcoding "harmonies"/"faraway"/"7wonders": a game
// added later is covered automatically, and a game removed here fails loudly instead of silently.

import { describe, test, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { useEffect } from "react";
import { useTally } from "@/app/_state/useTally.js";
import { PlayerCard } from "@/app/_components/Card.jsx";
import { makeScorer } from "@/src/scoring.js";
import { GAME_LIST } from "@/src/games/index.js";
import { sevenwonders } from "@/src/games/sevenwonders.js";
import { sevenwondersduel } from "@/src/games/sevenwondersduel.js";
import { harmonies } from "@/src/games/harmonies.js";

afterEach(cleanup);

// ---- Harness ----
//
// Mounts the actual useTally() hook, selects the game, and renders the first player's real
// PlayerCard wired to the real handlersFor(id) — the same props app/page.jsx passes it. Nothing
// here re-implements state; it's the production reducer under test.
// `apiBox` is filled on every render, so a test can read the LIVE scorer + player state after a
// fireEvent and independently recompute an expected value via scorer.breakdown() — the same
// function the app itself calls — rather than merely asserting "the text changed". That is what
// makes the sum-strip test below able to catch a renderer that hardcodes a group's value instead
// of reading it off `breakdown`: "changed" alone can't, since a hardcoded 0 never changes.
function renderGame(game){
  const apiBox = { current: null };
  function Harness(){
    const api = useTally();
    apiBox.current = api;
    useEffect(() => {
      if (!api.state.activeGame) api.dispatch({ type: "selectGame", key: game.key });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    if (!api.game || !api.scorer || !api.gs) return null;
    const p = api.gs.players[0];
    return (
      <PlayerCard
        game={api.game}
        scorer={api.scorer}
        p={p}
        mascotSrc={undefined}
        showRemove={false}
        showRules={true}
        variant={api.variant}
        isWinner={false}
        showCrown={false}
        on={api.handlersFor(p.id)}
      />
    );
  }
  const utils = render(<Harness />);
  return { ...utils, getApi: () => apiBox.current };
}

// ---- DOM helpers ----
// Query by the same hooks/classes the real markup carries — data-cat, .cat-head, .pip-score,
// .cat-pts, .total-badge, .tally-btn, .minus, .mini-btn, .total-input, .revert-btn — nothing
// invented for the test.

function catNode(container, catKey){
  return container.querySelector(`.category[data-cat="${catKey}"]`);
}

// Accordion categories start closed except the first; flat (non-accordion) games have no drawer
// to open at all. A no-op in both the "already open" and "no drawer" cases.
function openCategory(container, catKey){
  const node = catNode(container, catKey);
  const head = node.querySelector(".cat-head");
  if (head && head.getAttribute("aria-expanded") === "false") fireEvent.click(head);
}

function catScoreText(container, catKey){
  const node = catNode(container, catKey);
  const el = node.querySelector(".cat-head .pip-score") || node.querySelector(".cat-pts");
  return el ? el.textContent : null;
}

function totalBadgeText(container){
  return container.querySelector(".total-badge").textContent;
}

function clickFirstTally(container, catKey, index = 0){
  openCategory(container, catKey);
  const node = catNode(container, catKey);
  fireEvent.click(node.querySelectorAll(".tally-btn")[index]);
}

// Some tally categories only register nonzero points after several taps — 7 Wonders Duel's
// treasury is floor(coins/3), so a single click leaves the score at 0 — so this clicks until the
// score actually moves rather than assuming one tap is always enough. Every category eventually
// moves off 0 well within maxClicks; a category that never does within it is a real bug, hence the
// throw rather than silently giving up.
function clickTallyUntilScoreChanges(container, catKey, maxClicks = 5){
  const before = catScoreText(container, catKey);
  for (let i = 0; i < maxClicks; i++){
    clickFirstTally(container, catKey);
    if (catScoreText(container, catKey) !== before) return;
  }
  throw new Error(`${catKey}: score did not change after ${maxClicks} tally clicks`);
}

function changeFirstListInput(container, catKey, value){
  openCategory(container, catKey);
  const node = catNode(container, catKey);
  fireEvent.change(node.querySelector(".animal-list input"), { target: { value: String(value) } });
}

function findMiniBtn(node, text){
  return [...node.querySelectorAll(".mini-btn")].find(b => b.textContent.includes(text));
}

// ---- Which category shape each game offers, computed once against the pure descriptors ----
// (no rendering needed — cat.controls(p, variant) is a pure function). Faraway has no tally
// category at all (both its categories are repeatable lists), which is exactly why this is
// computed per game rather than assumed.
const GAME_PROBES = GAME_LIST.map(game => {
  const s = makeScorer(game, () => ({ waterSide: "river" }));
  const probe = s.newPlayer(1, "Probe");
  const specsFor = k => s.cat(k).controls(probe, s.variant());
  const tallyCat = s.keys.find(k => specsFor(k).some(sp => sp.type === "tallyGroup"));
  const listCat = s.keys.find(k => specsFor(k).some(sp => sp.type === "list"));
  const typeableTallyCat = s.keys.find(k =>
    specsFor(k).some(sp => sp.type === "tallyGroup") && s.canType(k));
  return { game, tallyCat, listCat, typeableTallyCat };
});

// ---- (a) A real interaction changes both the category score and the total ----

describe("category score and total update on real interaction", () => {
  for (const { game, tallyCat, listCat } of GAME_PROBES){
    (tallyCat ? test : test.skip)(
      `${game.label}: clicking a tally button updates the category score and the total`,
      () => {
        const { container } = renderGame(game);
        const beforeCat = catScoreText(container, tallyCat);
        const beforeTotal = totalBadgeText(container);
        clickTallyUntilScoreChanges(container, tallyCat);
        expect(catScoreText(container, tallyCat)).not.toBe(beforeCat);
        expect(totalBadgeText(container)).not.toBe(beforeTotal);
      }
    );

    (listCat ? test : test.skip)(
      `${game.label}: typing into a list-category row updates the category score and the total`,
      () => {
        const { container } = renderGame(game);
        const beforeCat = catScoreText(container, listCat);
        const beforeTotal = totalBadgeText(container);
        changeFirstListInput(container, listCat, 5);
        expect(catScoreText(container, listCat)).not.toBe(beforeCat);
        expect(totalBadgeText(container)).not.toBe(beforeTotal);
      }
    );
  }

  test("7 Wonders: a work() category's shown-working text also updates on the same interaction", () => {
    const workCat = sevenwonders.cats.find(c => c.work);
    expect(workCat).toBeTruthy(); // military/treasury/science all declare work() — sanity
    const { container } = renderGame(sevenwonders);
    openCategory(container, workCat.key);
    const node = catNode(container, workCat.key);
    const before = node.querySelector(".cat-work").textContent;
    clickFirstTally(container, workCat.key);
    const after = node.querySelector(".cat-work").textContent;
    expect(after).not.toBe(before);
  });
});

// ---- (a2) The optional coarse ±bigStep buttons (2026-08-18), where a category opted in ----

describe("bigStep coarse steppers", () => {
  test("7 Wonders: Treasury's ±5 buttons move the coin count, the category score and the total", () => {
    const { container } = renderGame(sevenwonders);
    openCategory(container, "treasury");
    const node = catNode(container, "treasury");
    const plus5 = [...node.querySelectorAll(".step-btn.wide")].find(b => b.textContent === "+5");
    const minus5 = [...node.querySelectorAll(".step-btn.wide")].find(b => b.textContent === "−5");
    expect(plus5).toBeTruthy();
    expect(minus5).toBeDisabled(); // 0 coins is the floor

    const beforeTotal = totalBadgeText(container);
    fireEvent.click(plus5);
    expect(catScoreText(container, "treasury")).toBe("1"); // floor(5 coins / 3) = 1
    expect(totalBadgeText(container)).not.toBe(beforeTotal);
    expect(minus5).not.toBeDisabled();

    fireEvent.click(minus5);
    expect(catScoreText(container, "treasury")).toBe("0");
    expect(minus5).toBeDisabled();
  });

  test("Harmonies: only the categories that declared bigStep get the extra buttons — fields did not", () => {
    const { container } = renderGame(harmonies);
    openCategory(container, "fields");
    expect(catNode(container, "fields").querySelectorAll(".step-btn").length).toBe(0);
  });
});

// ---- (b) Total badge and "=" strip render real numbers, driven off game.sums ----

describe("total badge and sum strip render real numbers", () => {
  for (const { game, tallyCat, listCat } of GAME_PROBES){
    test(`${game.label}: total badge is a real scored number, not a 0 placeholder`, () => {
      const { container } = renderGame(game);
      if (tallyCat) clickTallyUntilScoreChanges(container, tallyCat);
      else changeFirstListInput(container, listCat, 5);
      expect(totalBadgeText(container)).not.toBe("0");
    });

    test(`${game.label}: sum strip has exactly one column per game.sums entry, or is absent when the game declares none`, () => {
      const { container, getApi } = renderGame(game);
      if (!game.sums){
        expect(container.querySelector(".card-sum")).toBeNull();
        return;
      }
      if (tallyCat) clickFirstTally(container, tallyCat);
      else changeFirstListInput(container, listCat, 5);

      // Independently recomputed from the live player + scorer (not from the DOM), so a renderer
      // that hardcodes a group's value — instead of reading it off `breakdown` — is caught even
      // though the label text alone wouldn't change.
      const api = getApi();
      const expected = api.scorer.breakdown(api.gs.players[0]);

      const groupSpans = [...container.querySelectorAll(".card-sum > span")]
        .filter(el => el.querySelector(".pip-sub"));
      expect(groupSpans.length).toBe(game.sums.length);
      groupSpans.forEach((el, i) => {
        const key = game.sums[i].key;
        expect(el.textContent.startsWith(game.sums[i].label)).toBe(true);
        expect(el.querySelector(".pip-sub").textContent).toBe(String(expected[key]));
      });
      expect(container.querySelector(".card-sum .pip-total").textContent).toBe(String(expected.total));
    });
  }
});

// ---- (c.6) "New game" actually clears the shared military track ----
//
// Regression test for a real bug: militaryTrack lives on the game-state object as a sibling of
// `players`, not inside any player, so the "newGame" reducer case silently left it untouched while
// resetting everything else — "New game"'s own confirm dialog (app/page.jsx) promises "This clears
// the current scores", which a stale military VP quietly breaks for whichever side it favored.

test("7 Wonders Duel: dispatching newGame resets the shared militaryTrack to neutral, not just the players", () => {
  const { getApi } = renderGame(sevenwondersduel);
  act(() => { getApi().dispatch({ type: "setMilitaryTrack", value: -2 }); });
  expect(getApi().gs.militaryTrack).toBe(-2);
  act(() => { getApi().dispatch({ type: "newGame" }); });
  expect(getApi().gs.militaryTrack).toBe(0);
});

// ---- (c) Minus is disabled at the floor, enabled above it ----

describe("minus button disabled state", () => {
  for (const { game, tallyCat } of GAME_PROBES){
    (tallyCat ? test : test.skip)(
      `${game.label}: minus is disabled at the floor and enabled above it`,
      () => {
        const { container } = renderGame(game);
        openCategory(container, tallyCat);
        const node = catNode(container, tallyCat);
        const minus = node.querySelector(".minus");
        expect(minus).toBeDisabled();
        fireEvent.click(node.querySelector(".tally-btn"));
        expect(minus).not.toBeDisabled();
      }
    );
  }
});

// ---- (c.5) check-chip control (7 Wonders Duel: Wonders, Progress tokens) ----
//
// Not covered by GAME_PROBES above — that only looks for "tallyGroup"/"list" spec types, and a
// build-once toggle is neither. Its own coverage since it's a genuinely new control shape.

describe("check-chip control (build-once toggle)", () => {
  test("7 Wonders Duel: clicking a wonder chip updates the category score and the total", () => {
    const { container } = renderGame(sevenwondersduel);
    openCategory(container, "wonders");
    const beforeCat = catScoreText(container, "wonders");
    const beforeTotal = totalBadgeText(container);
    const node = catNode(container, "wonders");
    fireEvent.click(node.querySelector(".check-chip"));
    expect(catScoreText(container, "wonders")).not.toBe(beforeCat);
    expect(totalBadgeText(container)).not.toBe(beforeTotal);
  });

  test("7 Wonders Duel: clicking the same chip again toggles it back off", () => {
    const { container } = renderGame(sevenwondersduel);
    openCategory(container, "wonders");
    const node = catNode(container, "wonders");
    const chip = node.querySelector(".check-chip");
    fireEvent.click(chip);
    expect(chip.classList.contains("on")).toBe(true);
    const onScore = catScoreText(container, "wonders");
    fireEvent.click(chip);
    expect(chip.classList.contains("on")).toBe(false);
    expect(catScoreText(container, "wonders")).not.toBe(onScore);
  });

  test("7 Wonders Duel: Mathematics' pip recomputes live as other progress tokens are checked", () => {
    const { container } = renderGame(sevenwondersduel);
    openCategory(container, "progress");
    const node = catNode(container, "progress");
    const chips = [...node.querySelectorAll(".check-chip")];
    const mathChip = chips.find(c => c.querySelector(".check-chip-name").textContent === "Mathematics");
    const otherChip = chips.find(c => c.querySelector(".check-chip-name").textContent === "Philosophy");
    expect(mathChip.querySelector(".pip").textContent).toBe("0"); // nothing held yet
    fireEvent.click(otherChip); // hold one other token first
    expect(mathChip.querySelector(".pip").textContent).toBe("3"); // 3 x (1 other, Math not yet counted)
    fireEvent.click(mathChip);
    expect(mathChip.querySelector(".pip").textContent).toBe("6"); // 3 x (2, including itself)
  });
});

// ---- (d) "Enter total" freezes the category; "revert" reverts ----

describe('"Enter total" freezes the category at its derived value; revert reverts', () => {
  for (const { game, typeableTallyCat } of GAME_PROBES){
    // Faraway isn't an accordion game and has no "Enter total" control at all (see
    // app/_components/Card.jsx's non-accordion CategoryBlock branch), so it's out of scope here.
    (game.accordion && typeableTallyCat ? test : test.skip)(
      `${game.label}: enter total freezes at the current derived value, revert restores tallying`,
      () => {
        const { container } = renderGame(game);
        openCategory(container, typeableTallyCat);
        clickFirstTally(container, typeableTallyCat); // get a nonzero derived value
        const derived = catScoreText(container, typeableTallyCat);
        const node = catNode(container, typeableTallyCat);

        fireEvent.click(findMiniBtn(node, "Enter total"));
        const totalInput = node.querySelector(".total-input");
        expect(totalInput).toBeTruthy();
        expect(totalInput.value).toBe(derived);

        // The frozen override and the underlying derived value happen to be equal right at the
        // moment of freezing (that's what "freeze at the current derived value" means) — so typing
        // a DIFFERENT total here is what actually proves the card-head score reads the override
        // (scorer.catPoints, which checks isTotalMode) rather than silently falling back to the
        // derived value regardless of override state. Without this step, a renderer bug that read
        // derived() instead of catPoints() would pass every assertion above undetected.
        const typed = String(Number(derived) + 100);
        fireEvent.change(totalInput, { target: { value: typed } });
        expect(catScoreText(container, typeableTallyCat)).toBe(typed);

        fireEvent.click(node.querySelector(".revert-btn"));
        expect(node.querySelector(".total-input")).toBeNull();
        expect(node.querySelector(".tally-btn")).toBeTruthy();
        // Revert discards the uncommitted typed override entirely, returning to the tallied count
        // — not to whatever was last typed.
        expect(catScoreText(container, typeableTallyCat)).toBe(derived);
      }
    );
  }
});

// ---- (e) 7 Wonders' military can render a negative category score (min: -6) ----

test("7 Wonders: military renders a negative category score, and a rendered total-input's min reflects the true -6 floor", () => {
  const { container } = renderGame(sevenwonders);
  openCategory(container, "military");
  const node = catNode(container, "military");

  // MILITARY_KEYS order is [w1, w3, w5, loss] (src/games/sevenwonders.js) — the last tally button
  // is the defeat token, worth -1 each.
  const tallyBtns = node.querySelectorAll(".tally-btn");
  const lossBtn = tallyBtns[tallyBtns.length - 1];
  fireEvent.click(lossBtn);
  fireEvent.click(lossBtn);
  fireEvent.click(lossBtn);

  expect(catScoreText(container, "military")).toBe("-3");
  expect(totalBadgeText(container)).toBe("-3"); // fresh player, military is the only scored category

  fireEvent.click(findMiniBtn(node, "Enter total"));
  const totalInput = node.querySelector(".total-input");
  expect(totalInput.getAttribute("min")).toBe("-6");
  expect(totalInput.value).toBe("-3");
});
