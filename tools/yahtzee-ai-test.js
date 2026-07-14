#!/usr/bin/env node
/**
 * tools/yahtzee-ai-test.js
 * Headless strength check for the Yahtzee AI: average solo score per difficulty.
 *   node tools/yahtzee-ai-test.js [gamesPerLevel]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE_DIR = path.join(__dirname, '..', 'games', 'yahtzee', 'engine');
const FILES = ['constants.js', 'dice.js', 'scoring.js', 'game.js', 'ai.js'];
const ctx = vm.createContext({ Math, console });
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ENGINE_DIR, f), 'utf8'), ctx, { filename: f });

const games = parseInt(process.argv[2] || '300', 10);

// Defined inside the vm context so it can see the const globals lexically.
vm.runInContext(`
function playSolo(level) {
  const st = yzNewGame({ numPlayers: 1, playerNames: ['AI'], aiLevels: [level] });
  let guard = 0;
  while (!yzIsGameOver(st) && guard++ < 200) {
    yzRoll(st);
    while (st.rollsLeft > 0) {
      const held = yzAiChooseHeld(st);
      if (held.every(h => h)) break;
      for (let i = 0; i < 5; i++) st.held[i] = held[i];
      yzRoll(st);
    }
    yzScore(st, yzAiChooseCategory(st));
  }
  const p = st.players[0];
  return { total: yzPlayerTotal(p), allFilled: YZ_CATEGORIES.every(c => p.scores[c] != null) };
}
`, ctx);

console.log(`Yahtzee AI — average of ${games} solo games per level:\n`);
for (const level of ['easy', 'medium', 'hard', 'expert']) {
  const t0 = Date.now();
  let sum = 0, max = 0, min = Infinity, bad = 0;
  for (let g = 0; g < games; g++) {
    const r = vm.runInContext(`playSolo(${JSON.stringify(level)})`, ctx);
    if (!r.allFilled) bad++;
    sum += r.total; max = Math.max(max, r.total); min = Math.min(min, r.total);
  }
  const avg = (sum / games).toFixed(1);
  const ms = Date.now() - t0;
  console.log(`  ${level.padEnd(7)} avg ${avg.padStart(6)}   min ${String(min).padStart(3)}  max ${String(max).padStart(3)}   ${bad ? '['+bad+' incomplete!] ' : ''}(${ms}ms)`);
}
