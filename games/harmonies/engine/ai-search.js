/**
 * games/harmonies/engine/ai-search.js
 * Beam search and Monte Carlo for AI draft and placement decisions.
 * Depends on: constants.js, board.js, scoring.js,
 *             ai-config.js, ai-hasher.js, ai-evaluator.js
 */

// ── Fast single-token heuristic ───────────────────────────────

/**
 * Estimate the value of placing one token at a hex without cloning.
 * Read-only — safe for Monte Carlo rollouts.
 */
function _singleTokenScore(board, key, token) {
  const stack = getStack(board, key);
  if (!stack) return 0;
  const h         = stack.length;
  const { q, r }  = parseKey(key);
  const neighbors = getNeighborKeys(q, r);

  switch (token) {
    case 'BLUE': {
      const adj = neighbors.filter(nk => getTopToken(board, nk) === 'BLUE').length;
      return adj > 0 ? 2 + adj * 2 : 0.4;
    }
    case 'YELLOW': {
      const adj = neighbors.filter(nk => getTopToken(board, nk) === 'YELLOW').length;
      return adj > 0 ? 3 + adj : 0.4;
    }
    case 'GRAY': {
      const adj = neighbors.filter(nk => getTopToken(board, nk) === 'GRAY').length;
      return adj > 0 ? (MOUNTAIN_SCORE_TABLE[h + 1] || 0) + adj * 0.5 : 0.2;
    }
    case 'BROWN':
      return h === 0 ? 1.0 : h === 1 ? 1.5 : 0;
    case 'GREEN': {
      const brownCount = stack.filter(t => t === 'BROWN').length;
      return TREE_SCORE_TABLE[`${brownCount},1`] || 1;
    }
    case 'RED': {
      const degree = getNeighborKeys(q, r).filter(nk => board.hexes[nk] !== undefined).length;
      if (degree <= 2) return -1.0; // corner — almost never scores
      if (h >= 1) {
        const adjTypes = new Set(neighbors.map(nk => getTopToken(board, nk)).filter(Boolean));
        return adjTypes.size >= 3 ? 5 : adjTypes.size * 0.5;
      }
      return 0.2;
    }
    default:
      return 0;
  }
}

// ── Beam Search: Placement ────────────────────────────────────

/**
 * Determine the best placement sequence for tokens starting at startIdx.
 *
 * Each beam node tracks a cloned board and the choices made so far.
 * After placing all tokens (or hitting the deadline), surviving nodes are
 * ranked by DeepEvaluate (if profile.useDeep) or QuickEvaluate.
 *
 * @param {object}   board     - current player's board (not mutated)
 * @param {string[]} tokens    - state.tokensInHand
 * @param {number}   startIdx  - state.handIdx at the time of planning
 * @param {string}   boardSide - 'A' or 'B'
 * @param {object}   profile   - AI_DIFFICULTY_PROFILES entry
 * @param {number}   deadline  - performance.now() cutoff
 * @param {TranspositionTable|null} [tt]
 * @returns {(string|null)[]} choices[i] = key for tokens[startIdx + i], null = skipped
 */
function beamSearchPlacements(board, tokens, startIdx, boardSide, profile, deadline, tt) {
  const remaining = tokens.slice(startIdx);
  if (remaining.length === 0) return [];

  // Beam nodes: { board, choices[] }
  // choices[i] corresponds to remaining[i]
  let beam = [{ board: clonePersonalBoard(board), choices: [] }];

  for (let step = 0; step < remaining.length; step++) {
    if (performance.now() >= deadline) break;

    const tok     = remaining[step];
    const nextBeam = [];

    for (const node of beam) {
      const places = legalPlacements(node.board, tok);

      if (places.length === 0) {
        // Token has no legal placement — auto-skip it
        nextBeam.push({
          board:   node.board,
          choices: [...node.choices, null],
          score:   animalFastScore(node.board, boardSide),
        });
        continue;
      }

      for (const key of places) {
        const sim = clonePersonalBoard(node.board);
        placeToken(sim, key, tok);
        nextBeam.push({
          board:   sim,
          choices: [...node.choices, key],
          score:   animalFastScore(sim, boardSide),
        });
      }
    }

    if (nextBeam.length === 0) break;

    // Prune to beam width, keeping highest quick-eval scores.
    // Dedupe by board hash while filling: different placement orders reach
    // identical boards, and duplicates waste beam slots.
    nextBeam.sort((a, b) => b.score - a.score);
    const width = Math.max(1, profile.beamWidth);
    const seen  = new Set();
    const kept  = [];
    for (const node of nextBeam) {
      if (kept.length >= width) break;
      const h = hashBoard(node.board);
      if (seen.has(h)) continue;
      seen.add(h);
      kept.push(node);
    }
    beam = kept;
  }

  // Re-rank survivors with deep evaluator if enabled
  if (profile.useDeep && beam.length > 1) {
    beam.forEach(node => {
      node.deepScore = deepEvaluate(node.board, boardSide, null, profile.weights || DEEP_EVAL_WEIGHTS, tt).total;
    });
    beam.sort((a, b) => b.deepScore - a.deepScore);
  }

  if (AI_DEBUG) {
    console.log('[AI beam:placements]', {
      tokens: remaining,
      beamWidth: profile.beamWidth,
      survivors: beam.length,
      topScore: (beam[0]?.deepScore ?? beam[0]?.score ?? 0).toFixed(2),
      choices: beam[0]?.choices,
    });
  }

  return beam[0]?.choices || remaining.map(() => null);
}

// ── Beam Search: Draft Slot ───────────────────────────────────

/**
 * Choose the best slot to draft from the central board.
 *
 * For each non-empty slot, we simulate the resulting placement sequence
 * (using beamSearchPlacements) and score the final board.
 * For expert difficulty, the top candidates are further ranked by Monte Carlo.
 *
 * @param {object} state   - GameState (read-only)
 * @param {object} profile - AI_DIFFICULTY_PROFILES entry
 * @param {number} deadline
 * @param {TranspositionTable|null} [tt]
 * @returns {number} slot index to draft
 */
function beamSearchDraftSlot(state, profile, deadline, tt) {
  const slots    = state.central.slots;
  const board    = state.boards[state.currentPlayer];
  const boardSide = state.boardSide;

  const validSlots = slots
    .map((slot, i) => ({ idx: i, tokens: slot.tokens }))
    .filter(s => s.tokens && s.tokens.length > 0);

  if (validSlots.length === 0) return 0;

  // Easy: random slot
  if (profile.beamWidth === 0) {
    return validSlots[Math.floor(Math.random() * validSlots.length)].idx;
  }

  // Time budget per slot
  const timePerSlot = Math.max(50, (deadline - performance.now()) / validSlots.length);

  const scored = validSlots.map(({ idx, tokens }) => {
    const slotDeadline = Math.min(deadline, performance.now() + timePerSlot);

    // Simulate placements for this slot
    const choices = beamSearchPlacements(board, tokens, 0, boardSide, profile, slotDeadline, tt);
    const sim = clonePersonalBoard(board);
    for (let i = 0; i < tokens.length; i++) {
      const key = choices[i];
      if (key && canPlaceToken(sim, key, tokens[i])) {
        placeToken(sim, key, tokens[i]);
      }
    }

    const score = profile.useDeep
      ? deepEvaluate(sim, boardSide, null, profile.weights || DEEP_EVAL_WEIGHTS, tt).total
      : animalFastScore(sim, boardSide);

    return { idx, score };
  });

  scored.sort((a, b) => b.score - a.score);

  if (AI_DEBUG) {
    console.log('[AI beam:draft]', scored.map(s => ({ idx: s.idx, score: s.score.toFixed(2) })));
  }

  // Medium: random from top 3; Hard/Expert: best
  if (profile.beamWidth <= 15) {
    const topN = Math.min(3, scored.length);
    return scored[Math.floor(Math.random() * topN)].idx;
  }
  return scored[0].idx;
}

// (Draft-slot Monte Carlo removed — superseded by full-game macro-move
//  rollouts in ai-rollout.js.)
