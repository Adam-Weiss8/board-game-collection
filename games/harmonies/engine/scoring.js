/**
 * games/harmonies/engine/scoring.js
 * All terrain category scoring + animal card scoring.
 * Depends on: constants.js, board.js, animals.js
 */

// ── Trees ─────────────────────────────────────────────────────
/**
 * Score each hex that has GREEN on top.
 * bush (standalone green h1): 1pt
 * short tree (green on 1 brown): 3pt
 * tall tree (green on 2 brown): 7pt
 * Brown alone (any height): 0pt
 */
function scoreTrees(board) {
  let total = 0;
  for (const { stack } of Object.values(board.hexes)) {
    if (stack[stack.length - 1] !== 'GREEN') continue;
    const brownCount = stack.filter(t => t === 'BROWN').length;
    total += TREE_SCORE_TABLE[`${brownCount},1`] || 0;
  }
  return total;
}

// ── Mountains ─────────────────────────────────────────────────
/**
 * Each gray hex scores only if it has at least one adjacent gray hex.
 * h1 → 1pt, h2 → 3pt, h3 → 7pt (isolated gray = 0)
 */
function scoreMountains(board) {
  let total = 0;
  for (const [key, { stack }] of Object.entries(board.hexes)) {
    if (stack[stack.length - 1] !== 'GRAY') continue;
    const { q, r } = parseKey(key);
    const hasGrayNeighbor = getNeighborKeys(q, r).some(nk => {
      const nc = board.hexes[nk];
      return nc && nc.stack[nc.stack.length - 1] === 'GRAY';
    });
    if (hasGrayNeighbor) {
      total += MOUNTAIN_SCORE_TABLE[stack.length] || 0;
    }
  }
  return total;
}

// ── Fields ────────────────────────────────────────────────────
/**
 * Find connected groups of yellow hexes.
 * Each group with ≥2 hexes scores 5 pts (size beyond 2 gives no extra).
 */
function scoreFields(board) {
  const visited = new Set();
  let total = 0;

  for (const [key, { stack }] of Object.entries(board.hexes)) {
    if (visited.has(key)) continue;
    if (stack[stack.length - 1] !== 'YELLOW') continue;

    // BFS flood-fill
    const queue = [key];
    visited.add(key);
    let size = 0;
    while (queue.length) {
      const cur = queue.shift();
      size++;
      const { q, r } = parseKey(cur);
      for (const nk of getNeighborKeys(q, r)) {
        if (visited.has(nk)) continue;
        const nc = board.hexes[nk];
        if (!nc || nc.stack[nc.stack.length - 1] !== 'YELLOW') continue;
        visited.add(nk);
        queue.push(nk);
      }
    }
    if (size >= 2) total += FIELD_GROUP_SCORE;
  }
  return total;
}

// ── Water ─────────────────────────────────────────────────────

/**
 * Compute the graph diameter of a connected group of hex keys:
 * the longest shortest-path between any two hexes in the group.
 * For a straight river of N tiles: diameter = N - 1.
 * For a branching river: diameter = longest endpoint-to-endpoint path.
 * Used by scoreWater to determine river length (diameter + 1 = tile count).
 */
function _groupDiameter(groupKeys) {
  if (groupKeys.length <= 1) return 0;
  const keySet = new Set(groupKeys);
  let diameter = 0;
  for (const start of groupKeys) {
    const dist = new Map([[start, 0]]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      const { q, r } = parseKey(cur);
      for (const nk of getNeighborKeys(q, r)) {
        if (keySet.has(nk) && !dist.has(nk)) {
          dist.set(nk, dist.get(cur) + 1);
          queue.push(nk);
        }
      }
    }
    diameter = Math.max(diameter, Math.max(...dist.values()));
  }
  return diameter;
}

/**
 * Convert river length (number of tiles in longest path) to points.
 * Table: 1→0, 2→2, 3→5, 4→8, 5→11, 6→15, 7→19, 8→23, 9→27.
 * For lengths > 9: 27 + (length - 9) * 4.
 */
function _scoreRiver(length) {
  return length <= 9
    ? (WATER_SCORE_TABLE[length] || 0)
    : 27 + (length - 9) * 4;
}

/**
 * Count connected land regions (non-BLUE hexes) on the board.
 * Water tiles (BLUE top) block connectivity — they separate land into islands.
 * Empty hexes count as land.
 * Used by scoreWater for Side B (Island Scoring).
 */
function _countLandIslands(board) {
  const visited = new Set();
  let islands = 0;
  for (const [key, { stack }] of Object.entries(board.hexes)) {
    if (visited.has(key)) continue;
    if (stack.length > 0 && stack[stack.length - 1] === 'BLUE') continue; // water — skip
    islands++;
    const queue = [key];
    visited.add(key);
    while (queue.length) {
      const cur = queue.shift();
      const { q, r } = parseKey(cur);
      for (const nk of getNeighborKeys(q, r)) {
        if (visited.has(nk)) continue;
        const nc = board.hexes[nk];
        if (!nc) continue;
        if (nc.stack.length > 0 && nc.stack[nc.stack.length - 1] === 'BLUE') continue;
        visited.add(nk);
        queue.push(nk);
      }
    }
  }
  return islands;
}

/**
 * Water scoring — behaviour differs by board side:
 *
 * Side A (River Scoring):
 *   Find all connected blue groups. For each, compute river length
 *   (= _groupDiameter + 1, the tile count of the longest path through
 *   the group). Look up score in WATER_SCORE_TABLE. Return only the
 *   HIGHEST score across all groups — branches and separate rivers do
 *   not accumulate.
 *
 * Side B (Island Scoring):
 *   Water tiles do not score directly. Instead, they divide the board
 *   into land islands. Count connected regions of non-BLUE hexes and
 *   award 5 pts per island.
 */
function scoreWater(board, boardSide) {
  if (boardSide === 'B') {
    return _countLandIslands(board) * 5;
  }

  // Side A — river scoring: find all blue groups, score each, return max.
  const visited = new Set();
  let maxScore = 0;

  for (const [key, { stack }] of Object.entries(board.hexes)) {
    if (visited.has(key)) continue;
    if (stack[stack.length - 1] !== 'BLUE') continue;

    const groupKeys = [];
    const queue = [key];
    visited.add(key);
    while (queue.length) {
      const cur = queue.shift();
      groupKeys.push(cur);
      const { q, r } = parseKey(cur);
      for (const nk of getNeighborKeys(q, r)) {
        if (visited.has(nk)) continue;
        const nc = board.hexes[nk];
        if (!nc || nc.stack[nc.stack.length - 1] !== 'BLUE') continue;
        visited.add(nk);
        queue.push(nk);
      }
    }

    const riverLength = _groupDiameter(groupKeys) + 1;
    maxScore = Math.max(maxScore, _scoreRiver(riverLength));
  }

  return maxScore;
}

// ── Buildings ─────────────────────────────────────────────────
/**
 * A building scores 5 pts when:
 *   - The hex has RED on top AND is stacked (h2: red on brown/gray/red)
 *   - ≥3 distinct token types are present among adjacent hex tops
 * Standalone red (h1) never scores.
 */
function scoreBuildings(board) {
  let total = 0;
  for (const [key, { stack }] of Object.entries(board.hexes)) {
    if (stack[stack.length - 1] !== 'RED') continue;
    if (stack.length < 2) continue; // must be stacked on brown/gray/red
    const { q, r } = parseKey(key);
    const adjTypes = new Set();
    for (const nk of getNeighborKeys(q, r)) {
      const top = getTopToken(board, nk);
      if (top) adjTypes.add(top);
    }
    if (adjTypes.size >= BUILDING_MIN_DIVERSITY) total += BUILDING_SCORE;
  }
  return total;
}

// ── Animal cards ──────────────────────────────────────────────
/**
 * Sum of each held card's score based on cubes placed.
 * Score = the value at the topmost filled cube position.
 * Example: Otter [16,10,5] with 2 cubes placed → 10pts.
 */
function scoreAnimals(board) {
  let total = 0;
  for (const card of board.heldCards) {
    total += getCardScore(card, board.cubesPlaced[card.id] || 0);
  }
  return total;
}

// ── Full board score ──────────────────────────────────────────
function computeScores(board, boardSide) {
  const trees     = scoreTrees(board);
  const mountains = scoreMountains(board);
  const fields    = scoreFields(board);
  const water     = scoreWater(board, boardSide);
  const buildings = scoreBuildings(board);
  const animals   = scoreAnimals(board);
  return {
    trees, mountains, fields, water, buildings, animals,
    total: trees + mountains + fields + water + buildings + animals,
  };
}
