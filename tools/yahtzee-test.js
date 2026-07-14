#!/usr/bin/env node
/**
 * tools/yahtzee-test.js
 * Headless self-test for the Yahtzee engine. Loads the vanilla-JS globals into a
 * vm context (like the browser <script> tags) and runs assertions.
 *
 *   node tools/yahtzee-test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE_DIR = path.join(__dirname, '..', 'games', 'yahtzee', 'engine');
const FILES = ['constants.js', 'dice.js', 'scoring.js', 'game.js'];

const ctx = vm.createContext({ Math, console });
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ENGINE_DIR, f), 'utf8'), ctx, { filename: f });
const run = expr => vm.runInContext(expr, ctx);

let pass = 0, fail = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; } else { fail++; console.log(`  FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}

// ── Category scoring ──────────────────────────────────────────
run('globalThis.S = yzScoreCategory;');
eq('sixes',          run("S('sixes',[6,6,6,2,1])"), 18);
eq('threes',         run("S('threes',[3,3,1,1,1])"), 6);
eq('threeKind yes',  run("S('threeKind',[5,5,5,2,1])"), 18);
eq('threeKind no',   run("S('threeKind',[5,5,2,2,1])"), 0);
eq('fourKind yes',   run("S('fourKind',[4,4,4,4,1])"), 17);
eq('fourKind no',    run("S('fourKind',[4,4,4,1,1])"), 0);
eq('fullHouse yes',  run("S('fullHouse',[2,2,5,5,5])"), 25);
eq('fullHouse no5k', run("S('fullHouse',[4,4,4,4,4])"), 0);   // strict: 5-of-a-kind is not a full house
eq('smStraight yes', run("S('smallStraight',[1,2,3,4,4])"), 30);
eq('smStraight no',  run("S('smallStraight',[1,2,3,5,6])"), 0);
eq('lgStraight yes', run("S('largeStraight',[2,3,4,5,6])"), 40);
eq('lgStraight no',  run("S('largeStraight',[1,2,3,4,6])"), 0);
eq('yahtzee yes',    run("S('yahtzee',[5,5,5,5,5])"), 50);
eq('chance',         run("S('chance',[1,2,3,4,5])"), 15);

// ── Upper bonus ───────────────────────────────────────────────
eq('upper bonus hit',  run("yzUpperBonus({ones:3,twos:6,threes:9,fours:12,fives:15,sixes:18,threeKind:null,fourKind:null,fullHouse:null,smallStraight:null,largeStraight:null,yahtzee:null,chance:null})"), 35);
eq('upper bonus miss', run("yzUpperBonus({ones:1,twos:2,threes:3,fours:4,fives:5,sixes:6,threeKind:null,fourKind:null,fullHouse:null,smallStraight:null,largeStraight:null,yahtzee:null,chance:null})"), 0);

// ── Yahtzee +100 bonus ────────────────────────────────────────
run(`
  globalThis.st = yzNewGame({ numPlayers: 1, playerNames: ['T'] });
  var p = st.players[0];
  p.scores.yahtzee = 50;          // already scored a real Yahtzee
  st.dice = [4,4,4,4,4];          // rolled another
  st.rolledThisTurn = true;
  yzScore(st, 'fours');           // score the bonus Yahtzee in Fours
`);
eq('bonus Fours score', run('st.players[0].scores.fours'), 20);
eq('yahtzee +100',      run('st.players[0].yahtzeeBonus'), 100);

// ── Full random game to completion (2 players) ────────────────
run(`
  globalThis.g = yzNewGame({ numPlayers: 2, playerNames: ['A','B'] });
  var guard = 0;
  while (!yzIsGameOver(g) && guard++ < 500) {
    yzRoll(g); yzRoll(g); yzRoll(g);            // burn all 3 rolls
    var open = YZ_CATEGORIES.filter(c => g.players[g.currentPlayer].scores[c] == null);
    yzScore(g, open[0]);                        // score first open category
  }
  globalThis.filledA = YZ_CATEGORIES.every(c => g.players[0].scores[c] != null);
  globalThis.filledB = YZ_CATEGORIES.every(c => g.players[1].scores[c] != null);
`);
eq('game over',        run('yzIsGameOver(g)'), true);
eq('round after 13',   run('g.round'), 14);
eq('A all filled',     run('filledA'), true);
eq('B all filled',     run('filledB'), true);
eq('standings sorted', run('var s=yzFinalStandings(g); s[0].total >= s[1].total'), true);
eq('total is number',  run('typeof yzPlayerTotal(g.players[0])'), 'number');

console.log(`\nYahtzee engine: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
