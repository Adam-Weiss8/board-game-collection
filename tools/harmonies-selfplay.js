#!/usr/bin/env node
/**
 * tools/harmonies-selfplay.js
 * Dev-only Node runner for Harmonies AI self-play, matches, and weight tuning.
 * The game itself stays offline vanilla JS — this script just loads the same
 * engine globals into a vm context (like browser <script> tags) and drives them.
 *
 * Usage:
 *   node tools/harmonies-selfplay.js eval  --difficulty hard --games 100 [--side A]
 *   node tools/harmonies-selfplay.js diag  --difficulty medium --games 25
 *   node tools/harmonies-selfplay.js match --a expert --b legacy --games 200
 *   node tools/harmonies-selfplay.js tune  --difficulty hard --search-ms 800 --games-per-eval 40 --iterations 12
 *   node tools/harmonies-selfplay.js baseline --games 50
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// --engine-dir <path> (or HARMONIES_ENGINE_DIR) lets baselines run against a
// frozen copy of the engine while the working tree is being modified.
const _engineDirArgIdx = process.argv.indexOf('--engine-dir');
const ENGINE_DIR = _engineDirArgIdx !== -1
  ? path.resolve(process.argv[_engineDirArgIdx + 1])
  : (process.env.HARMONIES_ENGINE_DIR || path.join(__dirname, '..', 'games', 'harmonies', 'engine'));

// Same order as games/harmonies/index.html script tags
const ENGINE_FILES = [
  'constants.js',
  'board.js',
  'central.js',
  'animals.js',
  'scoring.js',
  'game.js',
  'ai-config.js',
  'ai-hasher.js',
  'ai-evaluator.js',
  'ai-strategy.js',
  'ai-search.js',
  'ai-rollout.js',
  'ai-player.js',
  'ai-evolution.js',
];

function createEngineContext() {
  const sandbox = {
    console,
    performance,
    // Fast async yield: _aiSleep awaits setTimeout; setImmediate keeps the
    // event loop semantics without paying real milliseconds per token.
    setTimeout: (fn, _ms) => setImmediate(fn),
    clearTimeout: () => {},
  };
  const context = vm.createContext(sandbox);
  for (const file of ENGINE_FILES) {
    const src = fs.readFileSync(path.join(ENGINE_DIR, file), 'utf8');
    vm.runInContext(src, context, { filename: file });
  }
  // Force headless mode regardless of the config default (it's `let`-able later;
  // if still const this is a no-op because const true is what we want in dev).
  try { vm.runInContext('AI_HEADLESS = true;', context); } catch (_) { /* const — already true or fixed later */ }
  if (process.argv.includes('--debug')) {
    vm.runInContext('AI_DEBUG = true;', context);
  }
  // --v3 flips the strategy brain on globally (single-brain eval/diag/baseline).
  // For A/B, use `match --a v3 --b legacy` (per-config, not this global flag).
  if (process.argv.includes('--v3')) {
    vm.runInContext('AI_STRATEGY_V3 = true;', context);
  }
  return context;
}

// ── CLI arg parsing ───────────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { args[key] = next; i++; }
      else args[key] = true;
    } else {
      args._.push(a);
    }
  }
  return args;
}

// ── Commands ──────────────────────────────────────────────────

// Optional per-tier profile overrides for fast dev iteration on the deep path:
//   --search-ms <n>  cap per-turn think time    --beam <n>  cap beam width
function _applyProfileOverrides(ctx, difficulty, args) {
  if (args['search-ms'] !== undefined) {
    const ms = parseInt(args['search-ms'], 10);
    vm.runInContext(`AI_DIFFICULTY_PROFILES[${JSON.stringify(difficulty)}].searchMs = ${ms};`, ctx);
  }
  if (args.beam !== undefined) {
    const b = parseInt(args.beam, 10);
    vm.runInContext(`AI_DIFFICULTY_PROFILES[${JSON.stringify(difficulty)}].beamWidth = ${b};`, ctx);
  }
}

async function cmdEval(ctx, args) {
  const difficulty = args.difficulty || 'medium';
  const games      = parseInt(args.games || '100', 10);
  const side       = args.side || 'A';
  _applyProfileOverrides(ctx, difficulty, args);
  const fn = vm.runInContext('selfPlayEval', ctx);
  return await fn(games, difficulty, side);
}

async function cmdDiag(ctx, args) {
  const difficulty = args.difficulty || 'medium';
  const games      = parseInt(args.games || '25', 10);
  const side       = args.side || 'A';
  _applyProfileOverrides(ctx, difficulty, args);
  const fn = vm.runInContext('diagPlayEval', ctx);
  return await fn(games, difficulty, side);
}

async function cmdMatch(ctx, args) {
  const games = parseInt(args.games || '200', 10);
  const side  = args.side || 'A';
  const hasMatchEval = vm.runInContext('typeof matchEval === "function"', ctx);
  if (!hasMatchEval) {
    console.error('matchEval is not defined in ai-evolution.js yet.');
    process.exit(1);
  }
  const fn = vm.runInContext('matchEval', ctx);
  // Config strings: difficulty name, or "legacy" (resolved inside matchEval)
  return await fn({ name: args.a || 'expert' }, { name: args.b || 'legacy' }, games, side);
}

async function cmdPolicyEval(ctx, args) {
  const games = parseInt(args.games || '50', 10);
  const side  = args.side || 'A';
  const src = `
    (function () {
      const scores = [];
      const cats = { animals: 0, trees: 0, mountains: 0, fields: 0, water: 0, buildings: 0 };
      let n = 0;
      for (let g = 0; g < ${games}; g++) {
        const st = newGame({ numPlayers: 2, playerNames: ['P0','P1'], boardSide: '${side}', useSpiritCards: false });
        let plies = 0;
        while (st.phase !== 'END' && plies++ < 200) fastPolicyTurn(st);
        for (const s of getFinalScores(st)) {
          scores.push(s.total);
          for (const k of Object.keys(cats)) cats[k] += s[k];
          n++;
        }
      }
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      for (const k of Object.keys(cats)) cats[k] = +(cats[k] / n).toFixed(1);
      return { games: ${games}, avg: +avg.toFixed(1), min: Math.min(...scores), max: Math.max(...scores), breakdown: cats };
    })()
  `;
  const result = vm.runInContext(src, ctx);
  console.log('[PolicyEval]', JSON.stringify(result));
  return result;
}

async function cmdBaseline(ctx, args) {
  const games = parseInt(args.games || '50', 10);
  const side  = args.side || 'A';
  const tiers = (args.tiers ? String(args.tiers).split(',') : ['easy', 'medium', 'hard', 'expert']);
  const out   = { recordedAt: new Date().toISOString(), gamesPerTier: games, side, tiers: {} };

  for (const tier of tiers) {
    console.log(`\n=== Baseline: ${tier} (${games} games) ===`);
    const ctxFresh = createEngineContext(); // fresh globals per tier (TT, weights)
    const fn = vm.runInContext('selfPlayEval', ctxFresh);
    const t0 = Date.now();
    const result = await fn(games, tier, side);
    result.wallSec = +((Date.now() - t0) / 1000).toFixed(1);
    out.tiers[tier] = result;
  }

  const outPath = path.join(__dirname, 'baseline-results.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nBaseline written to ${outPath}`);
  return out;
}

async function cmdTune(ctx, args) {
  const hasTuner = vm.runInContext('typeof championChallengerTune === "function"', ctx);
  if (!hasTuner) {
    console.error('championChallengerTune is not defined in ai-evolution.js yet.');
    process.exit(1);
  }
  const fn = vm.runInContext('championChallengerTune', ctx);
  return await fn({
    difficulty:   args.difficulty || 'hard',
    searchMs:     parseInt(args['search-ms'] || '800', 10),
    gamesPerEval: parseInt(args['games-per-eval'] || '40', 10),
    iterations:   parseInt(args.iterations || '12', 10),
    side:         args.side || 'A',
  });
}

// ── Main ──────────────────────────────────────────────────────

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const cmd  = args._[0] || 'eval';
  const ctx  = createEngineContext();

  const commands = { eval: cmdEval, diag: cmdDiag, match: cmdMatch, baseline: cmdBaseline, tune: cmdTune, 'policy-eval': cmdPolicyEval };
  const handler = commands[cmd];
  if (!handler) {
    console.error(`Unknown command: ${cmd}. Use one of: ${Object.keys(commands).join(', ')}`);
    process.exit(1);
  }

  try {
    await handler(ctx, args);
  } catch (err) {
    console.error('Fatal:', err);
    process.exit(1);
  }
})();
