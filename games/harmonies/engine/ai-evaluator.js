/**
 * games/harmonies/engine/ai-evaluator.js
 * Board evaluation: QuickEvaluate (fast pruning) and DeepEvaluate (full analysis).
 * Also contains GoalAnalyzer and board-quality helpers.
 * Depends on: constants.js, board.js, animals.js, scoring.js, ai-config.js, ai-hasher.js
 */

// ── Pattern analysis helpers ──────────────────────────────────

/**
 * Find anchor positions where the card's pattern is 1–3 cells away from complete.
 * Checks the default rotation only (fast; full-rotation checking done by findCubePlacements).
 * Returns [{satisfied, total, missing:[{key,token}]}] sorted best-first.
 */
function _findNearCompletePatterns(board, card) {
  const results = [];
  for (const anchorKey of Object.keys(board.hexes)) {
    if (board.cubedHexes.has(anchorKey)) continue;
    const { q: aq, r: ar } = parseKey(anchorKey);
    let satisfied = 0;
    const missing = [];
    let valid = true;
    for (const cell of card.pattern) {
      const key = hexKey(aq + cell.dq, ar + cell.dr);
      if (!board.hexes[key]) { valid = false; break; }
      const stack = board.hexes[key].stack;
      const h     = stack.length;
      const top   = stack[h - 1];
      const typeOk = cell.type === 'ANY' || top === cell.type;
      const hOk    = h >= cell.minH && h <= cell.maxH;
      if (typeOk && hOk) {
        satisfied++;
      } else if (cell.type !== 'ANY') {
        missing.push({ key, token: cell.type });
      }
    }
    if (!valid || satisfied === 0) continue;
    if (missing.length === 0 || missing.length > 3) continue;
    results.push({ satisfied, total: card.pattern.length, missing });
  }
  results.sort((a, b) => b.satisfied - a.satisfied);
  return results;
}

/**
 * Return a 0–1 fraction of how well the board already matches a card's pattern.
 * Used for card selection synergy scoring.
 */
function _bestPatternMatchFraction(board, card) {
  let best = 0;
  for (const anchorKey of Object.keys(board.hexes)) {
    if (board.cubedHexes.has(anchorKey)) continue;
    const { q: aq, r: ar } = parseKey(anchorKey);
    let sat = 0;
    let valid = true;
    for (const cell of card.pattern) {
      const key = hexKey(aq + cell.dq, ar + cell.dr);
      if (!board.hexes[key]) { valid = false; break; }
      const stack = board.hexes[key].stack;
      const h     = stack.length;
      const top   = stack[h - 1];
      if ((cell.type === 'ANY' || top === cell.type) && h >= cell.minH && h <= cell.maxH) sat++;
    }
    if (valid) best = Math.max(best, sat / card.pattern.length);
  }
  return best;
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
        turnsEstimate      = best.missing.length * 1.2 + 0.5;
      } else {
        completionFraction = 0;
        missingTokens      = [];
        turnsEstimate      = card.pattern.length * 1.5;
      }
    }

    const priority = turnsEstimate > 0
      ? (expectedPoints / turnsEstimate) * Math.max(completionFraction, 0.1)
      : expectedPoints * 2;

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

  // Goal progress (partial animal card completion)
  const activeGoals = goals || buildGoals(board, board.heldCards);
  let goalProgress = 0;
  for (const goal of activeGoals) {
    goalProgress += goal.completionFraction * goal.expectedPoints;
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
