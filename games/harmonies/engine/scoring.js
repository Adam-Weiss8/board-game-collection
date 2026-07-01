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
 * A 3-hex triangle (all mutually adjacent) → diameter 1.
 * A 3-hex line/L-shape (endpoints not adjacent) → diameter 2.
 * Score is based on diameter + 1 so the existing table stays valid.
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
 * Find all connected chains of blue hexes and score them.
 * Scoring is based on group diameter (longest shortest-path between any two
 * hexes), not raw hex count. A chain of N hexes has diameter N-1; a cluster
 * scores less. tableScore key = diameter + 1 maps to existing table.
 * boardSide 'A' (Islands): every group scores independently.
 * boardSide 'B' (Longest River): only the group with the greatest diameter scores.
 * Table (by diameter+1): 2→2, 3→4, 4→6, 5→9, 6+→15.
 */
function scoreWater(board, boardSide) {
  const visited = new Set();
  const groupDiameters = [];

  for (const [key, { stack }] of Object.entries(board.hexes)) {
    if (visited.has(key)) continue;
    if (stack[stack.length - 1] !== 'BLUE') continue;

    // BFS to collect all keys in this connected group
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
    groupDiameters.push(_groupDiameter(groupKeys));
  }

  if (groupDiameters.length === 0) return 0;

  // tableScore key = diameter + 1 (aligns diameter 1 → table[2] = 2 pts, etc.)
  function tableScore(d) {
    const key = d + 1;
    if (key >= 6) return WATER_SCORE_MAX;
    return WATER_SCORE_TABLE[key] || 0;
  }

  if (boardSide === 'A') {
    return groupDiameters.reduce((sum, d) => sum + tableScore(d), 0);
  } else {
    return tableScore(Math.max(...groupDiameters));
  }
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
