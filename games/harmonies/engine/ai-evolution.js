/**
 * games/harmonies/engine/ai-evolution.js
 * Headless self-play runner for AI evaluation and weight tuning.
 *
 * Usage (browser console or Node via tools/harmonies-selfplay.js):
 *   await selfPlayEval(100, 'hard')                       — self-play avg score
 *   await matchEval({name:'expert'}, {name:'legacy'}, 50) — head-to-head match
 *   await championChallengerTune({ iterations: 12 })      — weight tuning
 *
 * Requires AI_HEADLESS = true in ai-config.js to skip animation delays.
 * Depends on all other harmonies engine files being loaded first.
 */

/**
 * Run a single headless AI vs AI game. Returns per-player score objects.
 */
async function runHeadlessGame(difficulty, boardSide) {
  boardSide = boardSide || 'A';
  const state = newGame({
    numPlayers: 2,
    playerNames: ['AI-0', 'AI-1'],
    boardSide,
    useSpiritCards: false,
  });

  let safety = 0;
  while (state.phase !== 'END' && safety < 300) {
    safety++;
    if (state.phase === 'DRAFT' || state.phase === 'PLACE' || state.phase === 'OPTIONAL') {
      await runAiTurn(state, difficulty, () => {});
    } else {
      break; // unexpected phase
    }
  }

  return getFinalScores(state).map(s => ({
    total:   s.total,
    animals: s.animals,
    trees:   s.trees,
    mountains: s.mountains,
    fields:  s.fields,
    water:   s.water,
    buildings: s.buildings,
  }));
}

/**
 * Run n headless games and return statistics.
 * Set AI_HEADLESS = true in ai-config.js before calling, or the games will be slow.
 *
 * @param {number} n         - number of games (100 recommended)
 * @param {string} difficulty - 'easy' | 'medium' | 'hard' | 'expert'
 * @param {string} [boardSide] - 'A' (default) or 'B'
 */
async function selfPlayEval(n, difficulty, boardSide) {
  if (!AI_HEADLESS) {
    console.warn('[SelfPlay] AI_HEADLESS is false — games will be slow. Set it to true in ai-config.js.');
  }
  console.log(`[SelfPlay] Starting ${n} games at ${difficulty}...`);
  const start = performance.now();

  const allScores     = [];
  const animalScores  = [];
  const treeScores    = [];
  const mountainScores = [];
  const fieldScores   = [];
  const waterScores   = [];
  const buildingScores = [];

  for (let i = 0; i < n; i++) {
    const gameScores = await runHeadlessGame(difficulty, boardSide);
    for (const ps of gameScores) {
      allScores.push(ps.total);
      animalScores.push(ps.animals);
      treeScores.push(ps.trees);
      mountainScores.push(ps.mountains);
      fieldScores.push(ps.fields);
      waterScores.push(ps.water);
      buildingScores.push(ps.buildings);
    }
    if ((i + 1) % 10 === 0) {
      const elapsed    = ((performance.now() - start) / 1000).toFixed(1);
      const currentAvg = (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1);
      console.log(`[SelfPlay] ${i + 1}/${n} | avg: ${currentAvg} | ${elapsed}s`);
    }
  }

  const _avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const _std = arr => {
    const m = _avg(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
  };

  const avg        = _avg(allScores);
  const stddev     = _std(allScores);
  const avgAnimal  = _avg(animalScores);
  const avgTrees   = _avg(treeScores);
  const avgMountains = _avg(mountainScores);
  const avgFields  = _avg(fieldScores);
  const avgWater   = _avg(waterScores);
  const avgBuildings = _avg(buildingScores);
  const max        = Math.max(...allScores);
  const min        = Math.min(...allScores);
  const over80     = allScores.filter(s => s >= 80).length;
  // Animal share of total score — target 40–60% for strong play. A high avg
  // with a low animal share means the AI is still winning "the wrong way".
  const animalShare = avg > 0 ? (avgAnimal / avg) : 0;
  const elapsed    = ((performance.now() - start) / 1000).toFixed(1);

  const result = {
    games:        n * 2, // 2 players per game
    difficulty,
    avg:          +avg.toFixed(1),
    stddev:       +stddev.toFixed(1),
    max,
    min,
    over80pct:    Math.round((over80 / allScores.length) * 100) + '%',
    animalSharePct: Math.round(animalShare * 100) + '%',
    breakdown: {
      animals:   +avgAnimal.toFixed(1),
      trees:     +avgTrees.toFixed(1),
      mountains: +avgMountains.toFixed(1),
      fields:    +avgFields.toFixed(1),
      water:     +avgWater.toFixed(1),
      buildings: +avgBuildings.toFixed(1),
    },
    elapsedSec:   +elapsed,
    weights:      (typeof AI_STRATEGY_V3 !== 'undefined' && AI_STRATEGY_V3)
                    ? { ...V3_WEIGHTS } : { ...DEEP_EVAL_WEIGHTS },
  };

  console.log('[SelfPlay] === RESULTS ===');
  console.log(`  Avg total:  ${result.avg}  (±${result.stddev})`);
  console.log(`  Max: ${max}  Min: ${min}  ≥80: ${result.over80pct}  animal share: ${result.animalSharePct}`);
  console.log(`  Breakdown — animals: ${result.breakdown.animals} | trees: ${result.breakdown.trees} | mountains: ${result.breakdown.mountains} | fields: ${result.breakdown.fields} | water: ${result.breakdown.water} | buildings: ${result.breakdown.buildings}`);
  console.log(`  Time: ${elapsed}s  Weights:`, result.weights);

  if (avg < 80) {
    console.warn(`[SelfPlay] Below target (${avg.toFixed(1)} < 80). Try tuneAndEval().`);
  } else {
    console.log('[SelfPlay] Target met!');
  }
  return result;
}

// ── Diagnostic self-play ──────────────────────────────────────

/**
 * Run a single headless game and return scores + per-player board diagnostics.
 */
async function runDiagGame(difficulty, boardSide) {
  boardSide = boardSide || 'A';
  const state = newGame({
    numPlayers: 2,
    playerNames: ['AI-0', 'AI-1'],
    boardSide,
    useSpiritCards: false,
  });

  let safety = 0;
  while (state.phase !== 'END' && safety < 300) {
    safety++;
    if (['DRAFT', 'PLACE', 'OPTIONAL'].includes(state.phase)) {
      await runAiTurn(state, difficulty, () => {});
    } else break;
  }

  const scores = getFinalScores(state);

  const diags = state.boards.map((board, pi) => {
    // Token type distribution (top token of each filled hex)
    const tokenDist = {};
    let filledHexes = 0;
    for (const { stack } of Object.values(board.hexes)) {
      if (stack.length === 0) continue;
      filledHexes++;
      const top = stack[stack.length - 1];
      tokenDist[top] = (tokenDist[top] || 0) + 1;
    }

    // Card completion stats
    const totalCubesAvail   = board.heldCards.reduce((s, c) => s + c.cubes, 0);
    const totalCubesPlaced  = board.heldCards.reduce((s, c) => s + (board.cubesPlaced[c.id] || 0), 0);
    const completedCards    = board.heldCards.filter(c => (board.cubesPlaced[c.id] || 0) >= c.cubes).length;

    // Habitat diversity: distinct cube-home terrains among held cards vs. count.
    // Collisions = held cards that share a habitat (should be ~0 under v3).
    let distinctHabitats = 0, habitatCollisions = 0;
    if (typeof habitatOf === 'function') {
      const habitats = board.heldCards.map(habitatOf);
      distinctHabitats  = new Set(habitats).size;
      habitatCollisions = habitats.length - distinctHabitats;
    }

    return {
      score:             scores[pi].total,
      cardsHeld:         board.heldCards.length,
      completedCards,
      distinctHabitats,
      habitatCollisions,
      totalCubesAvail,
      totalCubesPlaced,
      firingRate:        totalCubesAvail > 0 ? totalCubesPlaced / totalCubesAvail : 1,
      emptyHexes:        emptyHexCount(board),
      totalHexes:        Object.keys(board.hexes).length,
      filledHexes,
      tokenDist,
    };
  });

  return { scores: scores.map(s => s.total), diags };
}

/**
 * Run n diagnostic games and report card-firing rates, token distribution,
 * and board-fill stats to diagnose AI weaknesses.
 *
 * Usage: await diagPlayEval(25, 'medium')
 */
async function diagPlayEval(n, difficulty, boardSide) {
  console.log(`[Diag] Starting ${n} diagnostic games at ${difficulty}...`);
  const start = performance.now();

  const allScores = [];
  const allDiags  = [];

  for (let i = 0; i < n; i++) {
    const { scores, diags } = await runDiagGame(difficulty, boardSide);
    for (const d of diags) { allScores.push(d.score); allDiags.push(d); }
    if ((i + 1) % 5 === 0) {
      const avg = (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1);
      console.log(`[Diag] ${i + 1}/${n} | avg: ${avg} | ${((performance.now() - start) / 1000).toFixed(1)}s`);
    }
  }

  const _avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

  const avgCardsHeld   = _avg(allDiags.map(d => d.cardsHeld));
  const avgCompleted   = _avg(allDiags.map(d => d.completedCards));
  const avgDistinctHab = _avg(allDiags.map(d => d.distinctHabitats));
  const avgHabCollide  = _avg(allDiags.map(d => d.habitatCollisions));
  const avgFiringRate  = _avg(allDiags.map(d => d.firingRate));
  const avgEmpty       = _avg(allDiags.map(d => d.emptyHexes));
  const avgFilled      = _avg(allDiags.map(d => d.filledHexes));
  const avgTotal       = _avg(allDiags.map(d => d.totalHexes));
  const avgCubesAvail  = _avg(allDiags.map(d => d.totalCubesAvail));
  const avgCubesPlaced = _avg(allDiags.map(d => d.totalCubesPlaced));

  const TOKEN_TYPES = ['BLUE', 'YELLOW', 'GRAY', 'BROWN', 'GREEN', 'RED'];
  const avgTokenDist = {};
  for (const t of TOKEN_TYPES) {
    avgTokenDist[t] = +_avg(allDiags.map(d => d.tokenDist[t] || 0)).toFixed(1);
  }

  const result = {
    games:          n * 2,
    difficulty,
    avgScore:       +_avg(allScores).toFixed(1),
    cards: {
      avgHeld:      +avgCardsHeld.toFixed(1),
      avgCompleted: +avgCompleted.toFixed(1),
      avgDistinctHabitats: +avgDistinctHab.toFixed(2),
      avgHabitatCollisions: +avgHabCollide.toFixed(2),
      avgCubesAvail:  +avgCubesAvail.toFixed(1),
      avgCubesPlaced: +avgCubesPlaced.toFixed(1),
      firingRate:   +(avgFiringRate * 100).toFixed(1) + '%',
    },
    board: {
      avgFilled:    +avgFilled.toFixed(1),
      avgEmpty:     +avgEmpty.toFixed(1),
      avgTotal:     +avgTotal.toFixed(1),
      fillRate:     +(avgFilled / avgTotal * 100).toFixed(1) + '%',
    },
    tokenDist: avgTokenDist,
    elapsedSec: +((performance.now() - start) / 1000).toFixed(1),
  };

  console.log('[Diag] === DIAGNOSTIC RESULTS ===');
  console.log(`  Avg score: ${result.avgScore}`);
  console.log(`  Cards held at end:  ${result.cards.avgHeld}  (${result.cards.avgCompleted} fully completed)`);
  console.log(`  Habitats:           ${result.cards.avgDistinctHabitats} distinct  |  ${result.cards.avgHabitatCollisions} collisions/board`);
  console.log(`  Cube firing rate:   ${result.cards.firingRate}  (${result.cards.avgCubesPlaced}/${result.cards.avgCubesAvail} cubes placed)`);
  console.log(`  Board fill:         ${result.board.avgFilled}/${result.board.avgTotal} hexes (${result.board.fillRate})  —  ${result.board.avgEmpty} empty`);
  console.log(`  Token distribution:`, result.tokenDist);

  return result;
}

// ── Head-to-head match evaluation ─────────────────────────────

/**
 * Resolve a match config into { difficulty, opts } for runAiTurn.
 * Accepted forms:
 *   { name: 'expert' }              — a difficulty tier
 *   { name: 'legacy' }              — pre-rollout expert (beam+MC only, frozen weights)
 *   { difficulty, profile, weights } — explicit overrides
 */
function resolveAiConfig(cfg) {
  if (cfg.difficulty) {
    return { difficulty: cfg.difficulty, opts: { profile: cfg.profile, weights: cfg.weights } };
  }
  let name = cfg.name || 'expert';
  // "name@ms" shorthand overrides the profile's time budget (dev iteration)
  let msOverride = null;
  const at = name.indexOf('@');
  if (at !== -1) {
    msOverride = parseInt(name.slice(at + 1), 10) || null;
    name = name.slice(0, at);
  }
  if (msOverride) {
    const base = resolveAiConfig({ ...cfg, name });
    base.opts.profile = Object.assign({}, base.opts.profile, { searchMs: msOverride });
    return base;
  }
  if (name === 'v3') {
    // The v3 strategy brain at expert search depth. opts.strategyV3 routes the
    // per-turn evaluation through ai-strategy.js for this seat only.
    return { difficulty: 'expert', opts: { strategyV3: true } };
  }
  if (name === 'legacy') {
    // The shipped pre-rollout expert: beam-search-only turn (old profile shape),
    // no macro rollouts. Weights frozen to the pre-upgrade committed values.
    // (The old draft-slot Monte Carlo was removed; its effect was minor.)
    return {
      difficulty: 'expert',
      opts: {
        profile: { rollouts: 0, maxCandidates: 0, beamWidth: 60, searchMs: 4500 },
        weights: {
          currentScore:          0.8,
          partialAnimalProgress: 1.2,
          sharedHabitat:         1.0,
          placementFlexibility:  0.15,
          deadTerrain:          -0.35,
          openExpansion:         0.05,
        },
      },
    };
  }
  return { difficulty: name, opts: {} };
}

/**
 * Head-to-head: config A vs config B over nGames 2-player games with
 * alternating seating. Primary metric: average final score per config.
 * Win rate and margin are secondary sanity checks.
 *
 * Usage: await matchEval({ name: 'expert' }, { name: 'legacy' }, 200)
 */
async function matchEval(configA, configB, nGames, boardSide) {
  boardSide = boardSide || 'A';
  const A = resolveAiConfig(configA);
  const B = resolveAiConfig(configB);

  const scoresA = [], scoresB = [];
  let winsA = 0, winsB = 0, draws = 0;
  const start = performance.now();

  for (let g = 0; g < nGames; g++) {
    const seatA = g % 2; // alternate seating to cancel first-player advantage
    const state = newGame({
      numPlayers: 2,
      playerNames: ['P0', 'P1'],
      boardSide,
      useSpiritCards: false,
    });

    let safety = 0;
    while (state.phase !== 'END' && safety < 300) {
      safety++;
      if (!['DRAFT', 'PLACE', 'OPTIONAL'].includes(state.phase)) break;
      const cfg = state.currentPlayer === seatA ? A : B;
      await runAiTurn(state, cfg.difficulty, () => {}, null, cfg.opts);
    }

    const finals = getFinalScores(state);
    const a = finals[seatA].total;
    const b = finals[1 - seatA].total;
    scoresA.push(a);
    scoresB.push(b);
    if (a > b) winsA++; else if (b > a) winsB++; else draws++;

    if ((g + 1) % 10 === 0) {
      const avgA = (scoresA.reduce((x, y) => x + y, 0) / scoresA.length).toFixed(1);
      const avgB = (scoresB.reduce((x, y) => x + y, 0) / scoresB.length).toFixed(1);
      console.log(`[Match] ${g + 1}/${nGames} | A: ${avgA} B: ${avgB} | A wins ${winsA}/${winsA + winsB + draws} | ${((performance.now() - start) / 1000).toFixed(0)}s`);
    }
  }

  const _avg = arr => arr.reduce((x, y) => x + y, 0) / arr.length;
  const _std = arr => {
    const m = _avg(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
  };
  const avgA = _avg(scoresA), avgB = _avg(scoresB);
  // Standard error of the mean difference (paired by game)
  const diffs = scoresA.map((s, i) => s - scoresB[i]);
  const se    = _std(diffs) / Math.sqrt(diffs.length);

  const result = {
    games:    nGames,
    configA:  configA.name || configA.difficulty,
    configB:  configB.name || configB.difficulty,
    avgA:     +avgA.toFixed(1),
    avgB:     +avgB.toFixed(1),
    stdA:     +_std(scoresA).toFixed(1),
    stdB:     +_std(scoresB).toFixed(1),
    avgMargin: +(avgA - avgB).toFixed(1),
    marginSE:  +se.toFixed(2),
    winRateA:  +((winsA / nGames) * 100).toFixed(1),
    winsA, winsB, draws,
    elapsedSec: +((performance.now() - start) / 1000).toFixed(1),
  };

  console.log('[Match] === RESULTS ===');
  console.log(`  A (${result.configA}): avg ${result.avgA} ±${result.stdA}`);
  console.log(`  B (${result.configB}): avg ${result.avgB} ±${result.stdB}`);
  console.log(`  Margin: ${result.avgMargin} (SE ${result.marginSE})  |  A win rate: ${result.winRateA}% (${winsA}W/${winsB}L/${draws}D)`);
  return result;
}

/**
 * Champion/challenger local search over DEEP_EVAL_WEIGHTS.
 *
 * Each iteration perturbs one weight (round-robin, ×1.3 or ×0.7) and plays a
 * head-to-head match against the current champion. The challenger is accepted
 * only if its avg-score margin exceeds the standard error of the margin —
 * i.e. the improvement is larger than the match's own noise.
 *
 * Winning weights are returned (and printed) — copy them into ai-config.js.
 *
 * @param {object} options - { difficulty, searchMs, gamesPerEval, iterations, side }
 */
async function championChallengerTune(options) {
  const o = Object.assign({
    difficulty:   'hard',  // rollout tier, but cheap enough to iterate
    searchMs:     800,     // reduced budget for tuning throughput
    gamesPerEval: 40,
    iterations:   12,
    side:         'A',
  }, options || {});

  let champion = { ...DEEP_EVAL_WEIGHTS };
  const keys    = Object.keys(champion);
  const history = [];

  console.log(`[Tune] Champion/challenger — ${o.iterations} iters × ${o.gamesPerEval} games at ${o.difficulty}@${o.searchMs}`);

  for (let it = 0; it < o.iterations; it++) {
    const key    = keys[it % keys.length];
    const factor = Math.random() < 0.5 ? 1.3 : 0.7;
    const challenger = { ...champion, [key]: +(champion[key] * factor).toFixed(3) };

    const res = await matchEval(
      { difficulty: o.difficulty, profile: { searchMs: o.searchMs }, weights: challenger },
      { difficulty: o.difficulty, profile: { searchMs: o.searchMs }, weights: champion },
      o.gamesPerEval,
      o.side
    );

    const accepted = res.avgMargin > res.marginSE;
    if (accepted) champion = challenger;
    history.push({ it, key, factor, margin: res.avgMargin, se: res.marginSE, accepted });
    console.log(`[Tune] iter ${it + 1}/${o.iterations}: ${key} ×${factor} → margin ${res.avgMargin} (SE ${res.marginSE}) — ${accepted ? 'ACCEPTED' : 'rejected'}`);
  }

  console.log('[Tune] Final champion weights (copy to ai-config.js DEEP_EVAL_WEIGHTS):');
  console.log(JSON.stringify(champion, null, 2));
  return { champion, history };
}
