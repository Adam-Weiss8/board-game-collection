/**
 * games/harmonies/engine/ai-evaluator.js
 * Board evaluation: QuickEvaluate (fast pruning) and DeepEvaluate (full analysis).
 * Also contains GoalAnalyzer and board-quality helpers.
 * Depends on: constants.js, board.js, animals.js, scoring.js, ai-config.js, ai-hasher.js
 */

// ── Pattern analysis helpers ──────────────────────────────────

/**
 * Estimate token placements needed to satisfy one pattern cell from its current state.
 * Returns 0 (already satisfied), a positive integer, or Infinity (impossible).
 */
function _stepsToSatisfy(stack, cell) {
  const h   = stack.length;
  const top = stack[h - 1];
  const typeOk = cell.type === 'ANY' || top === cell.type;
  const hOk    = h >= cell.minH && h <= cell.maxH;
  if (typeOk && hOk) return 0; // already satisfied
  if (h > cell.maxH) return Infinity; // stack already too tall
  if (h === 0) {
    // Empty hex — can build from scratch
    switch (cell.type) {
      case 'BLUE':
      case 'YELLOW': return 1;                // place directly
      case 'GRAY':   return cell.minH;        // 1–3 GRAY tokens
      case 'BROWN':  return cell.minH;        // 1–2 BROWN tokens
      case 'GREEN':  return cell.minH;        // minH=1:GREEN; minH=2:BROWN+GREEN; minH=3:BROWN+BROWN+GREEN
      case 'RED':    return cell.minH;        // minH=1:RED; minH=2:something+RED
      default:       return Infinity;
    }
  }
  // Non-empty hex — wrong type
  if (!typeOk) {
    switch (cell.type) {
      case 'GRAY':   return (top === 'GRAY'  && h < 3)        ? cell.minH - h : Infinity;
      case 'BROWN':  return (top === 'BROWN' && h < 2)        ? cell.minH - h : Infinity;
      case 'GREEN':  return (top === 'BROWN' && h <= 2)       ? cell.minH - h : Infinity;
      case 'RED':    return (h === 1 && (top === 'GRAY' || top === 'BROWN' || top === 'RED')) ? 1 : Infinity;
      default:       return Infinity; // BLUE/YELLOW only on empty; can't be changed
    }
  }
  // typeOk but wrong height — can we stack more of the same type?
  switch (cell.type) {
    case 'GRAY':  return cell.minH - h; // GRAY stacks on GRAY
    case 'BROWN': return cell.minH - h; // BROWN stacks on BROWN (up to h=2)
    default:      return Infinity;      // GREEN/BLUE/YELLOW can't be further stacked
  }
}

/**
 * Find anchor positions where the card's pattern is 1–3 token placements from complete.
 * Checks all 6 rotations. Only includes patterns where all missing cells are actually
 * achievable given stacking rules — no phantom "near-complete" from occupied wrong-type hexes.
 * Returns [{satisfied, total, missing:[{key,token}], totalSteps}] sorted fewest-steps-first.
 */
function _findNearCompletePatterns(board, card) {
  const results = [];
  const rotations = allRotations(card.pattern);
  for (const anchorKey of Object.keys(board.hexes)) {
    if (board.cubedHexes.has(anchorKey)) continue;
    const { q: aq, r: ar } = parseKey(anchorKey);
    for (const pattern of rotations) {
      let satisfied  = 0;
      let totalSteps = 0;
      let valid      = true;
      const missing  = [];
      for (const cell of pattern) {
        const key = hexKey(aq + cell.dq, ar + cell.dr);
        if (!board.hexes[key]) { valid = false; break; }
        const steps = _stepsToSatisfy(board.hexes[key].stack, cell);
        if (steps === Infinity) { valid = false; break; }
        if (steps === 0) {
          satisfied++;
        } else {
          totalSteps += steps;
          if (cell.type !== 'ANY') missing.push({ key, token: cell.type });
        }
      }
      if (!valid || satisfied === 0 || totalSteps === 0) continue;
      if (totalSteps > 3) continue; // too many tokens away to be "near-complete"
      results.push({ satisfied, total: pattern.length, missing, totalSteps });
    }
  }
  results.sort((a, b) => a.totalSteps - b.totalSteps || b.satisfied - a.satisfied);
  return results;
}

/**
 * Return a 0–1 fraction of how well the board already matches a card's pattern.
 * Checks all 6 rotations so asymmetric patterns are not missed.
 * Used for card selection synergy scoring and beam pruning (animalFastScore).
 */
function _bestPatternMatchFraction(board, card) {
  let best = 0;
  const rotations = allRotations(card.pattern); // all 6 rotations
  for (const anchorKey of Object.keys(board.hexes)) {
    if (board.cubedHexes.has(anchorKey)) continue;
    const { q: aq, r: ar } = parseKey(anchorKey);
    for (const pattern of rotations) {
      let creditSum = 0;
      let valid = true;
      for (const cell of pattern) {
        const key = hexKey(aq + cell.dq, ar + cell.dr);
        if (!board.hexes[key]) { valid = false; break; }
        const stack = board.hexes[key].stack;
        const h   = stack.length;
        const top = stack[h - 1];
        if (h > cell.maxH) { valid = false; break; } // stack too tall — impossible
        if (h >= cell.minH && (cell.type === 'ANY' || top === cell.type)) {
          creditSum += 1.0; // fully satisfied
        } else if (h === 0) {
          // Empty hex — credit by how many placements the cell actually needs,
          // so a 3-step tall-tree cell isn't worth the same as a 1-step field.
          const steps = _stepsToSatisfy(stack, cell);
          if (steps === Infinity) { valid = false; break; }
          creditSum += Math.max(0.1, 1 - steps * 0.45);
        } else {
          // Non-empty, not yet satisfied — steps-based credit; partially built
          // stacks (committed, on track) are worth more than empty at equal steps.
          const steps = _stepsToSatisfy(stack, cell);
          if (steps === Infinity) { valid = false; break; }
          creditSum += Math.max(0.15, 1 - steps * 0.35);
        }
      }
      if (valid) best = Math.max(best, creditSum / pattern.length);
    }
  }
  return best;
}

/**
 * Count how many neighbors of a hex are actually on the board.
 * Corners have ≤2; edge hexes 3–4; interior hexes 5–6.
 * Used to penalize RED (house) placement on low-connectivity hexes.
 */
function _boardDegree(board, key) {
  const { q, r } = parseKey(key);
  return getNeighborKeys(q, r).filter(nk => board.hexes[nk] !== undefined).length;
}

/**
 * Cube conflict: fraction of candidate card's cube-fire hexes that overlap
 * with cube-fire hexes for existing held cards. These hexes can only hold one
 * cube — high overlap = bad portfolio fit.
 */
function cardConflictScore(board, candidateCard, heldCards) {
  const placements = findCubePlacements(board, candidateCard);
  if (!placements.length) return 0;
  const candidateHexes = new Set(placements); // findCubePlacements returns string keys
  let contested = 0;
  for (const held of heldCards) {
    for (const key of findCubePlacements(board, held)) {
      if (candidateHexes.has(key)) contested++;
    }
  }
  return Math.min(contested / candidateHexes.size, 1.0);
}

/**
 * Terrain synergy: fraction of candidate card's required terrain types that
 * overlap with terrain types needed by existing held cards. Shared terrain
 * (e.g. both cards need GRAY) = same building effort advances multiple cards.
 */
function cardPortfolioSynergy(candidateCard, heldCards) {
  if (!heldCards.length) return 0;
  const candidateTypes = new Set(candidateCard.pattern.map(c => c.type));
  let matches = 0;
  for (const held of heldCards) {
    if (held.pattern.some(c => candidateTypes.has(c.type))) matches++;
  }
  return matches / heldCards.length;
}

/**
 * BFS: find all connected components for a given token type.
 * Returns array of arrays of hex keys.
 */
function _findConnectedGroups(board, tokenType) {
  const visited = new Set();
  const groups  = [];
  for (const [key, { stack }] of Object.entries(board.hexes)) {
    if (visited.has(key)) continue;
    if (stack[stack.length - 1] !== tokenType) continue;
    const group = [];
    const queue = [key];
    visited.add(key);
    while (queue.length) {
      const cur = queue.shift();
      group.push(cur);
      const { q, r } = parseKey(cur);
      for (const nk of getNeighborKeys(q, r)) {
        if (visited.has(nk)) continue;
        const nc = board.hexes[nk];
        if (!nc || nc.stack[nc.stack.length - 1] !== tokenType) continue;
        visited.add(nk);
        queue.push(nk);
      }
    }
    groups.push(group);
  }
  return groups;
}

// ── GoalAnalyzer ─────────────────────────────────────────────

/**
 * Build a priority-ranked list of Goal objects from the player's held cards.
 * Each Goal captures how close a card is to scoring and its expected value.
 *
 * @param {object} board - PersonalBoard
 * @param {object[]} heldCards - board.heldCards
 * @returns {object[]} Goal[] sorted by priority descending
 */
function buildGoals(board, heldCards) {
  const goals = [];
  for (const card of heldCards) {
    const cubesPlaced = board.cubesPlaced[card.id] || 0;
    if (cubesPlaced >= card.cubes) continue;

    const expectedPoints = card.points[card.cubes - cubesPlaced - 1] || 0;
    const canFireNow     = findCubePlacements(board, card).length > 0;

    let completionFraction, missingTokens, turnsEstimate;
    if (canFireNow) {
      completionFraction = 1.0;
      missingTokens      = [];
      turnsEstimate      = 0.5;
    } else {
      const near = _findNearCompletePatterns(board, card);
      if (near.length > 0) {
        const best         = near[0];
        completionFraction = best.satisfied / best.total;
        missingTokens      = best.missing;
        turnsEstimate      = best.totalSteps * 1.2 + 0.5; // steps-based estimate
      } else {
        completionFraction = 0;
        missingTokens      = [];
        turnsEstimate      = card.pattern.length * 1.5;
      }
    }

    // Completion fraction dominates; points add a small bonus (up to ~3% per point)
    const priority = turnsEstimate > 0
      ? (completionFraction / turnsEstimate) * (1 + expectedPoints * 0.03)
      : completionFraction * (1 + expectedPoints * 0.03);

    goals.push({ card, completionFraction, missingTokens, turnsEstimate, expectedPoints, priority });
  }
  goals.sort((a, b) => b.priority - a.priority);
  return goals;
}

/**
 * Return the set of hex keys that appear in the missing-token lists of ≥2 goals.
 * Filling these hexes advances multiple cards simultaneously (shared habitat).
 */
function findSharedHabitat(goals) {
  const keyCount = new Map();
  for (const goal of goals) {
    for (const { key } of goal.missingTokens) {
      keyCount.set(key, (keyCount.get(key) || 0) + 1);
    }
  }
  const shared = new Set();
  for (const [key, count] of keyCount) {
    if (count >= 2) shared.add(key);
  }
  return shared;
}

// ── Turns-remaining estimate ──────────────────────────────────

/**
 * Estimated placement turns the current player has left, set once per AI turn
 * (vanilla-globals style — evaluators run deep in search without state access).
 * Infinity = no estimate (e.g. evaluator called outside an AI turn).
 */
let _AI_TURNS_LEFT_HINT = Infinity;

/**
 * Per-turn flag: when true, animalFastScore/deepEvaluate delegate to the v3
 * strategy brain (ai-strategy.js). Set at the start of each AI turn from the
 * effective useV3 decision (global AI_STRATEGY_V3 or opts.strategyV3), so match
 * play can mix a v3 seat and a legacy seat in the same game.
 */
let _AI_USE_V3 = false;

/**
 * Estimate how many more turns the current player gets before the game ends.
 * End triggers: board ≤2 empty hexes, or pouch can't refill a slot.
 * Placements average ~2.2 hexes/turn (some tokens stack or get skipped).
 */
function estimateTurnsRemaining(state) {
  let empties;
  if (typeof _AI_USE_V3 !== 'undefined' && _AI_USE_V3) {
    // v3 tempo: the timer is whichever board (any player's) is closest to full,
    // since the game ends when ANY board drops to ≤2 empty hexes.
    empties = Infinity;
    for (const b of state.boards) empties = Math.min(empties, emptyHexCount(b));
  } else {
    empties = emptyHexCount(state.boards[state.currentPlayer]);
  }
  const boardTurns = Math.max(0, (empties - 2) / 2.2);
  const pouchTurns = pouchTotal(state.pouch) / (3 * state.numPlayers);
  return Math.min(boardTurns, pouchTurns);
}

// ── Board quality helpers ─────────────────────────────────────

/**
 * Terrain flexibility: for each empty hex, score 0–1 by what fraction of
 * token types could legally land there. Higher total = more future options.
 */
function terrainFlexibility(board) {
  let flex = 0;
  for (const [key, { stack }] of Object.entries(board.hexes)) {
    if (stack.length > 0) continue;
    let possible = 0;
    for (const t of ALL_TOKENS) {
      if (canPlaceToken(board, key, t)) possible++;
    }
    flex += possible / ALL_TOKENS.length;
  }
  return flex;
}

/**
 * Dead terrain: count hexes whose token type needs neighbors to score,
 * but has no current neighbor AND no adjacent empty hex that could receive one.
 * These hexes are wasted space.
 */
function deadTerrainPenalty(board) {
  let penalty = 0;
  for (const [key, { stack }] of Object.entries(board.hexes)) {
    if (stack.length === 0) continue;
    const top       = stack[stack.length - 1];
    const { q, r }  = parseKey(key);
    const neighbors = getNeighborKeys(q, r);

    if (top === 'GRAY') {
      const adjGray  = neighbors.some(nk => getTopToken(board, nk) === 'GRAY');
      const canGrow  = neighbors.some(nk => canPlaceToken(board, nk, 'GRAY'));
      if (!adjGray && !canGrow) penalty += 1;
    } else if (top === 'YELLOW') {
      const adjYellow = neighbors.some(nk => getTopToken(board, nk) === 'YELLOW');
      const canGrow   = neighbors.some(nk => canPlaceToken(board, nk, 'YELLOW'));
      if (!adjYellow && !canGrow) penalty += 1;
    } else if (top === 'BLUE' && board.boardSide === 'A') {
      // Side A: only the max river group scores — isolated blue is waste
      const adjBlue = neighbors.some(nk => getTopToken(board, nk) === 'BLUE');
      if (!adjBlue) penalty += 0.5;
    }
  }
  return penalty;
}

// ── QuickEvaluate ─────────────────────────────────────────────

/**
 * Fast O(n) heuristic score for beam search pruning.
 * No BFS, no graph traversal — safe to call thousands of times per second.
 * Approximates terrain value using local adjacency only.
 */
function quickEvaluate(board, boardSide) {
  let score = 0;

  for (const [key, { stack }] of Object.entries(board.hexes)) {
    if (stack.length === 0) {
      score += 0.1; // small bonus for preserved flexibility
      continue;
    }
    const top       = stack[stack.length - 1];
    const h         = stack.length;
    const { q, r }  = parseKey(key);
    const neighbors = getNeighborKeys(q, r);

    switch (top) {
      case 'BLUE': {
        const adj = neighbors.filter(nk => getTopToken(board, nk) === 'BLUE').length;
        score += adj > 0 ? 2 + adj * 1.5 : 0.3;
        break;
      }
      case 'YELLOW': {
        const adj = neighbors.filter(nk => getTopToken(board, nk) === 'YELLOW').length;
        score += adj > 0 ? 3 + adj : 0.3;
        break;
      }
      case 'GRAY': {
        const adj = neighbors.filter(nk => getTopToken(board, nk) === 'GRAY').length;
        score += adj > 0 ? (MOUNTAIN_SCORE_TABLE[h] || 0) + adj * 0.5 : 0.15;
        break;
      }
      case 'BROWN':
        // Value as setup for a future tree
        score += h === 1 ? 0.8 : h === 2 ? 1.5 : 0;
        break;
      case 'GREEN': {
        const brownCount = stack.filter(t => t === 'BROWN').length;
        score += TREE_SCORE_TABLE[`${brownCount},1`] || 1;
        break;
      }
      case 'RED': {
        if (h >= 2) {
          const adjTypes = new Set(neighbors.map(nk => getTopToken(board, nk)).filter(Boolean));
          score += adjTypes.size >= 3 ? 5 : adjTypes.size;
        } else {
          score += 0.2;
        }
        break;
      }
    }
  }

  // Partial credit for animal card progress
  for (const card of board.heldCards) {
    const placed = board.cubesPlaced[card.id] || 0;
    score += getCardScore(card, placed) * 0.4;
  }

  return score;
}

// ── AnimalFastScore ───────────────────────────────────────────

/**
 * Animal-first beam-pruning heuristic. Replaces quickEvaluate in beamSearchPlacements.
 * Scores by priority-weighted pattern-match progress toward held animal cards,
 * with terrain adjacency as a small tiebreaker.
 *
 * Must be fast (called ~1000s of times per turn) — no BFS, no findCubePlacements.
 * Uses _bestPatternMatchFraction (default rotation only, O(hexes × pattern)).
 */
function animalFastScore(board, boardSide) {
  // v3 brain: fast pruning score comes from ai-strategy.js.
  if (_AI_USE_V3 && typeof boardEvaluateFast === 'function') {
    return boardEvaluateFast(board, boardSide);
  }
  // ── Animal progress (dominant) ──────────────────────────────
  // Sort cards by how well the board already matches their pattern (most synergy first).
  // Point value is a tiebreaker only — the card closest to firing gets the priority rank mult.
  // Weights are heavily front-loaded: focus on ONE primary card; secondary cards barely influence
  // placement so the beam search builds one pattern reliably rather than spreading thin.
  const RANK_MULT = [10.0, 1.0, 0.3, 0.0];
  const sortedCards = [...board.heldCards].sort((a, b) => {
    const aPlaced = board.cubesPlaced[a.id] || 0;
    const bPlaced = board.cubesPlaced[b.id] || 0;
    const aFit = _bestPatternMatchFraction(board, a);
    const bFit = _bestPatternMatchFraction(board, b);
    // Progress score: weight prior cube progress + current board fit.
    // A card that has already fired cubes maintains priority even if another
    // card has a slightly better board fit — prevents mid-game momentum breaks.
    const aProg = (aPlaced / Math.max(1, a.cubes)) + aFit * 0.5;
    const bProg = (bPlaced / Math.max(1, b.cubes)) + bFit * 0.5;
    if (Math.abs(bProg - aProg) > 0.02) return bProg - aProg;
    // Tiebreak: next cube point value
    const aNext = aPlaced < a.cubes ? (a.points[a.cubes - aPlaced - 1] || 0) : 0;
    const bNext = bPlaced < b.cubes ? (b.points[b.cubes - bPlaced - 1] || 0) : 0;
    return bNext - aNext;
  });
  let animalScore  = 0;
  let topMatchFrac = 0; // best card's match fraction — used for terrain weight below
  for (let i = 0; i < sortedCards.length; i++) {
    const card    = sortedCards[i];
    const placed  = board.cubesPlaced[card.id] || 0;
    if (placed >= card.cubes) continue;
    const matchFrac = _bestPatternMatchFraction(board, card);
    if (i === 0) topMatchFrac = matchFrac;
    const nextPts   = card.points[card.cubes - placed - 1] || 0;
    const mult      = RANK_MULT[i] ?? 0.0;

    if (matchFrac >= 0.99) {
      // Pattern fully satisfied — a cube can fire next optional phase.
      // Super-bonus: make this clearly the best possible placement outcome.
      animalScore += (nextPts * 1.5 + 15) * mult;
    } else {
      animalScore += matchFrac * nextPts * mult;
    }
  }

  // ── Opportunity cost: protect top card's near-complete pattern ──
  // Penalize if a hex the top card needs has been claimed by the wrong token type.
  if (sortedCards.length > 0) {
    const topCard   = sortedCards[0];
    const topPlaced = board.cubesPlaced[topCard.id] || 0;
    if (topPlaced < topCard.cubes) {
      const near = _findNearCompletePatterns(board, topCard);
      if (near.length > 0) {
        for (const { key, token } of near[0].missing) {
          const cell = board.hexes[key];
          if (!cell) continue;
          const top = cell.stack[cell.stack.length - 1];
          if (top && top !== token) animalScore -= 3.0;
        }
      }
    }
  }

  // ── Terrain adjacency (tiebreaker only) ─────────────────────
  let terrainScore = 0;
  for (const [key, { stack }] of Object.entries(board.hexes)) {
    if (stack.length === 0) { terrainScore += 0.05; continue; }
    const top = stack[stack.length - 1];
    const h   = stack.length;
    const { q, r } = parseKey(key);
    const neighbors = getNeighborKeys(q, r);
    switch (top) {
      case 'BLUE': {
        const adj = neighbors.filter(nk => getTopToken(board, nk) === 'BLUE').length;
        terrainScore += adj > 0 ? 1 + adj * 0.8 : 0.1;
        break;
      }
      case 'YELLOW': {
        const adj = neighbors.filter(nk => getTopToken(board, nk) === 'YELLOW').length;
        terrainScore += adj > 0 ? 1.5 + adj * 0.5 : 0.1;
        break;
      }
      case 'GRAY': {
        const adj = neighbors.filter(nk => getTopToken(board, nk) === 'GRAY').length;
        terrainScore += adj > 0 ? (MOUNTAIN_SCORE_TABLE[h] || 0) * 0.4 + adj * 0.3 : 0.1;
        break;
      }
      case 'BROWN':
        terrainScore += h === 1 ? 0.4 : h === 2 ? 0.8 : 0;
        break;
      case 'GREEN': {
        const brownCount = stack.filter(t => t === 'BROWN').length;
        terrainScore += (TREE_SCORE_TABLE[`${brownCount},1`] || 1) * 0.4;
        break;
      }
      case 'RED': {
        const degree = _boardDegree(board, key);
        if (degree <= 2) { terrainScore -= 1.5; break; } // corner — almost never scores
        if (h >= 2) {
          const adjTypes = new Set(neighbors.map(nk => getTopToken(board, nk)).filter(Boolean));
          terrainScore += adjTypes.size >= 3 ? 2 : adjTypes.size * 0.4;
        } else {
          terrainScore += 0.1;
        }
        break;
      }
    }
  }

  // Dynamic terrain weight: when the best card is far from firing (topMatchFrac low),
  // terrain scoring rises to guide the AI toward high-value terrain plays:
  // extend a river, pair a field, stack/pair a mountain.
  // When a card is ready to fire (topMatchFrac ~1), terrain is just a tiebreaker.
  const terrainWeight = 0.3 + (1 - Math.min(1, topMatchFrac)) * 1.5; // 0.3 → 1.8
  return animalScore * 2.5 + terrainScore * terrainWeight;
}

// ── DeepEvaluate ─────────────────────────────────────────────

/**
 * Full board evaluation combining actual score with future-potential features.
 * Slower than quickEvaluate (calls computeScores which does BFS), but more accurate.
 * Used only on beam survivors and Monte Carlo final states.
 *
 * @param {object} board - PersonalBoard to evaluate
 * @param {string} boardSide - 'A' or 'B'
 * @param {object[]|null} goals - pre-built goals array, or null to build fresh
 * @param {object|null} weights - DEEP_EVAL_WEIGHTS override, or null for default
 * @param {TranspositionTable|null} [tt] - optional cache
 * @returns {{ total: number, breakdown: object }}
 */
function deepEvaluate(board, boardSide, goals, weights, tt) {
  // v3 brain: full evaluation comes from ai-strategy.js (builds its own goals).
  if (_AI_USE_V3 && typeof boardEvaluate === 'function') {
    return boardEvaluate(board, boardSide, weights, tt);
  }

  const w = weights || DEEP_EVAL_WEIGHTS;

  // Transposition cache check
  let hash = null;
  if (tt) {
    hash = hashBoard(board);
    const cached = tt.get(hash);
    if (cached !== undefined) return cached;
  }

  // Full terrain + animal score
  const scores = computeScores(board, boardSide);
  let total    = scores.total * w.currentScore;
  const breakdown = {
    currentScore: scores.total,
    trees:        scores.trees,
    mountains:    scores.mountains,
    fields:       scores.fields,
    water:        scores.water,
    buildings:    scores.buildings,
    animals:      scores.animals,
  };

  // Goal progress (partial animal card completion) — priority-weighted,
  // discounted when the pattern can't plausibly convert in the turns left.
  const activeGoals = goals || buildGoals(board, board.heldCards);
  const GOAL_RANK_MULT = [3.0, 1.5, 0.6, 0.2]; // rank 0 = highest-priority card
  const turnsLeft = _AI_TURNS_LEFT_HINT;
  let goalProgress = 0;
  for (let i = 0; i < activeGoals.length; i++) {
    const g = activeGoals[i];
    let conv = 1;
    if (isFinite(turnsLeft) && g.turnsEstimate > turnsLeft) {
      conv = Math.max(0, 1 - (g.turnsEstimate - turnsLeft) * 0.5);
    }
    goalProgress += g.completionFraction * g.expectedPoints * conv * (GOAL_RANK_MULT[i] ?? 0.1);
  }
  const goalContrib = goalProgress * w.partialAnimalProgress;
  total += goalContrib;
  breakdown.goalProgress = goalContrib;

  // Shared habitat bonus — reward terrain that advances ≥2 goals at once
  const sharedHexes = findSharedHabitat(activeGoals);
  let sharedBonus = 0;
  for (const key of sharedHexes) {
    if (board.hexes[key] && board.hexes[key].stack.length > 0) {
      sharedBonus += 1;
    }
  }
  const sharedContrib = sharedBonus * w.sharedHabitat;
  total += sharedContrib;
  breakdown.sharedHabitat = sharedContrib;

  // Terrain flexibility (future options)
  const flex        = terrainFlexibility(board);
  const flexContrib = flex * w.placementFlexibility;
  total += flexContrib;
  breakdown.flexibility = flexContrib;

  // Dead terrain penalty
  const dead        = deadTerrainPenalty(board);
  const deadContrib = dead * w.deadTerrain; // weight is negative
  total += deadContrib;
  breakdown.deadTerrain = deadContrib;

  // Open expansion bonus
  const open        = emptyHexCount(board);
  const openContrib = open * w.openExpansion;
  total += openContrib;
  breakdown.openExpansion = openContrib;

  const result = { total, breakdown };
  if (tt && hash !== null) tt.set(hash, result);
  return result;
}
