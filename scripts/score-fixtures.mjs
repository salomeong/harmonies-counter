#!/usr/bin/env node
// Characterization fixtures for the Harmonies scoring functions.
//
// This is a regression gate, not a test: it runs a handful of synthetic player boards through
// breakdown()/totalPoints() and prints the results as stable JSON. `--check` compares that output
// against the checked-in scripts/score-fixtures.expected.json (generated from the CURRENT
// behaviour, before any later refactor) and exits non-zero on any drift — the next stage's
// refactor of the scoring internals must reproduce these numbers exactly.
//
// Usage:
//   node scripts/score-fixtures.mjs            print current fixture output
//   node scripts/score-fixtures.mjs --check     diff current output against the expected file

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { breakdown, totalPoints } from '../src/scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED_PATH = path.join(__dirname, 'score-fixtures.expected.json');

// A shared board, scored once per water side, so the "river side vs island side" pair is
// otherwise identical and only the water category (and therefore the totals) differs.
const sharedBoard = () => ({
  trees: { h1: 2, h2: 2, h3: 1 },
  mountains: { h1: 0, h2: 2, h3: 0 },
  fields: 5,
  buildings: 4,
  river: 5,
  islands: 4,
  animals: [1, 2, 3, 4],
  bonus: 6,
  totals: {}
});

const fixtures = [
  {
    name: 'all-zero',
    variant: { waterSide: 'river' },
    player: {
      trees: { h1: 0, h2: 0, h3: 0 },
      mountains: { h1: 0, h2: 0, h3: 0 },
      fields: 0,
      buildings: 0,
      river: 0,
      islands: 1,
      animals: [0],
      bonus: 0,
      totals: {}
    }
  },
  {
    name: 'typical mid-game board',
    variant: { waterSide: 'river' },
    player: {
      trees: { h1: 2, h2: 1, h3: 0 },
      mountains: { h1: 1, h2: 0, h3: 1 },
      fields: 3,
      buildings: 2,
      river: 4,
      islands: 2,
      animals: [3, 5, 0],
      bonus: 2,
      totals: {}
    }
  },
  {
    name: 'every category non-zero',
    variant: { waterSide: 'river' },
    player: {
      trees: { h1: 1, h2: 1, h3: 1 },
      mountains: { h1: 1, h2: 1, h3: 1 },
      fields: 4,
      buildings: 3,
      river: 6,
      islands: 3,
      animals: [2, 4, 6],
      bonus: 9,
      totals: {}
    }
  },
  {
    name: 'river side (shared board, waterSide=river)',
    variant: { waterSide: 'river' },
    player: sharedBoard()
  },
  {
    name: 'island side (shared board, waterSide=island)',
    variant: { waterSide: 'island' },
    player: sharedBoard()
  },
  // Two states the earlier fixtures missed entirely: mutation testing showed the river ladder's
  // interior rungs and the islands floor could both be broken without this gate noticing, because
  // no fixture scored a non-overridden short river or a zero-island island board.
  {
    name: 'short river, not overridden (exercises the interior ladder rungs)',
    variant: { waterSide: 'river' },
    player: {
      trees: { h1: 0, h2: 0, h3: 0 },
      mountains: { h1: 0, h2: 0, h3: 0 },
      fields: 0,
      buildings: 0,
      river: 3,                           // 5 pts — the rung no other fixture reaches
      islands: 1,
      animals: [0],
      bonus: 0,
      totals: {}
    }
  },
  {
    name: 'island side with islands: 0 (exercises the Math.max(1, ...) floor)',
    variant: { waterSide: 'island' },
    player: {
      trees: { h1: 0, h2: 0, h3: 0 },
      mountains: { h1: 0, h2: 0, h3: 0 },
      fields: 0,
      buildings: 0,
      river: 6,                           // must be ignored on the island side
      islands: 0,                         // floors to 1 island = 5 pts
      animals: [0],
      bonus: 0,
      totals: {}
    }
  },
  {
    name: 'multiple typed-total overrides',
    variant: { waterSide: 'river' },
    player: {
      trees: { h1: 5, h2: 5, h3: 5 },     // derived 55, overridden to 30
      mountains: { h1: 2, h2: 2, h3: 2 }, // derived 22, overridden to 10
      fields: 3,                          // derived 15, not overridden
      buildings: 2,                       // derived 10, not overridden
      river: 3,                           // derived 5, overridden to 42
      islands: 1,
      animals: [1, 2, 3],                 // derived 6, overridden to 50
      bonus: 4,                           // derived 4, overridden to 1
      totals: { trees: 30, mountains: 10, water: 42, animals: 50, bonus: 1 }
    }
  },
  {
    name: 'override of exactly 0 (falsy-zero guard)',
    variant: { waterSide: 'river' },
    player: {
      trees: { h1: 3, h2: 3, h3: 3 },     // derived 33, overridden to 0
      mountains: { h1: 0, h2: 0, h3: 0 },
      fields: 0,
      buildings: 0,
      river: 0,
      islands: 1,
      animals: [0],
      bonus: 5,                           // derived 5, overridden to 0
      totals: { trees: 0, bonus: 0 }
    }
  },
  {
    name: 'string-typed raw values (fresh from <input>)',
    variant: { waterSide: 'river' },
    player: {
      trees: { h1: '2', h2: '0', h3: '1' },
      mountains: { h1: '0', h2: '1', h3: '0' },
      fields: '3',
      buildings: '1',
      river: '4',
      islands: '2',
      animals: ['2', '3', ''],
      bonus: '7',
      totals: {}
    }
  }
];

function computeFixtures(){
  return fixtures.map(f => ({
    name: f.name,
    variant: f.variant,
    breakdown: breakdown(f.player, f.variant),
    totalPoints: totalPoints(f.player, f.variant)
  }));
}

function main(){
  const check = process.argv.includes('--check');
  const actual = computeFixtures();
  const actualJson = JSON.stringify(actual, null, 2) + '\n';

  if (!check){
    process.stdout.write(actualJson);
    return;
  }

  let expectedJson;
  try {
    expectedJson = readFileSync(EXPECTED_PATH, 'utf8');
  } catch (err) {
    console.error(`Could not read ${EXPECTED_PATH}: ${err.message}`);
    process.exit(1);
  }

  if (actualJson === expectedJson){
    console.log(`OK — ${actual.length} fixtures match ${path.relative(process.cwd(), EXPECTED_PATH)}`);
    return;
  }

  console.error('Fixture mismatch — current scoring output differs from the expected baseline.');
  console.error('--- expected');
  console.error('+++ actual');
  const expectedLines = expectedJson.split('\n');
  const actualLines = actualJson.split('\n');
  const max = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < max; i++){
    const e = expectedLines[i];
    const a = actualLines[i];
    if (e === a) continue;
    if (e !== undefined) console.error(`- ${e}`);
    if (a !== undefined) console.error(`+ ${a}`);
  }
  process.exit(1);
}

main();
