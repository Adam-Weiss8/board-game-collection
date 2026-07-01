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
          score:   quickEvaluate(node.board, boardSide),
        });
        continue;
      }

      for (const key of places) {
        const sim = clonePersonalBoard(node.board);
        placeToken(sim, key, tok);
        nextBeam.push({
          board:   sim,
          choices: [...node.choices, key],
          score:   quickEvaluate(sim, boardSide),
        });
      }
    }

    if (nextBeam.length === 0) break;

    // Prune to beam width, keeping highest quick-eval scores
    nextBeam.sort((a, b) => b.score - a.score);
    beam = nextBeam.slice(0, Math.max(1, profile.beamWidth));
  }

  // Re-rank survivors with deep evaluator if enabled
  if (profile.useDeep && beam.length > 1) {
    beam.forEach(node => {
      node.deepScore = deepEvaluate(node.board, boardSide, null, DEEP_EVAL_WEIGHTS, tt).total;
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
    .map((tokens, i) => ({ idx: i, tokens }))
    .filter(s => s.tokens && s.tokens.length > 0);

  if (validSlots.length === 0) return 0;

  // Easy: random slot
  if (profile.beamWidth === 0) {
    return validSlots[Math.floor(Math.random() * validSlots.length)].idx;
  }

  // Time budget per slot (leave headroom for MC if needed)
  const mcBudget    = profile.monteCarlo ? (deadline - performance.now()) * 0.35 : 0;
  const searchBudget = (deadline - performance.now()) - mcBudget;
  const timePerSlot = Math.max(50, searchBudget / validSlots.length);

  const scored = validSlots.map(({ idx, tokens }) => {
    const slotDeadline = Math.min(deadline - mcBudget, performance.now() + timePerSlot);

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
      ? deepEvaluate(sim, boardSide, null, DEEP_EVAL_WEIGHTS, tt).total
      : quickEvaluate(sim, boardSide);

    return { idx, score };
  });

  scored.sort((a, b) => b.score - a.score);

  if (AI_DEBUG) {
    console.log('[AI beam:draft]', scored.map(s => ({ idx: s.idx, score: s.score.toFixed(2) })));
  }

  // Expert: re-rank top candidates with Monte Carlo
  if (profile.monteCarlo && performance.now() < deadline) {
    const topN  = Math.min(5, scored.length);
    const mcResults = _monteCarloRankSlots(
      board, validSlots, scored.slice(0, topN), boardSide, profile, deadline, tt
    );
    if (mcResults.length > 0) {
      if (AI_DEBUG) console.log('[AI MC:draft]', mcResults.map(r => ({ idx: r.idx, avg: r.avgScore.toFixed(2) })));
      return mcResults[0].idx;
    }
  }

  // Medium: random from top 3; Hard/Expert: best
  if (profile.beamWidth <= 15) {
    const topN = Math.min(3, scored.length);
    return scored[Math.floor(Math.random() * topN)].idx;
  }
  return scored[0].idx;
}

// ── Monte Carlo ───────────────────────────────────────────────

/**
 * Re-rank top draft candidates using randomized rollouts.
 *
 * For each candidate slot, we run mcRollouts simulations.
 * Each simulation shuffles the token order and places greedily with
 * random selection from the top 3 positions (adds diversity).
 * Final board is scored with DeepEvaluate.
 *
 * @param {object}   board          - player's board (not mutated)
 * @param {object[]} allValidSlots  - [{ idx, tokens }]
 * @param {object[]} topCandidates  - [{ idx, score }] from beam search ranking
 * @param {string}   boardSide
 * @param {object}   profile
 * @param {number}   deadline
 * @param {TranspositionTable|null} [tt]
 * @returns {object[]} [{ idx, avgScore }] sorted best-first
 */
function _monteCarloRankSlots(board, allValidSlots, topCandidates, boardSide, profile, deadline, tt) {
  const rollouts = profile.mcRollouts || 20;
  const results  = [];

  for (const candidate of topCandidates) {
    if (performance.now() >= deadline) break;

    const { idx }  = candidate;
    const slotData = allValidSlots.find(s => s.idx === idx);
    if (!slotData) continue;
    const tokens = slotData.tokens;

    let totalScore = 0, actualRollouts = 0;

    for (let r = 0; r < rollouts; r++) {
      if (performance.now() >= deadline) break;

      const sim = clonePersonalBoard(board);

      // Place tokens in a random order, picking from top-3 positions each time
      const shuffled = [...tokens].sort(() => Math.random() - 0.5);
      for (const tok of shuffled) {
        const places = legalPlacements(sim, tok);
        if (places.length === 0) continue;

        // Score each option, pick randomly from top 3
        const ranked = places
          .map(k => ({ k, s: _singleTokenScore(sim, k, tok) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 3);

        const chosen = ranked[Math.floor(Math.random() * ranked.length)].k;
        placeToken(sim, chosen, tok);
      }

      totalScore += deepEvaluate(sim, boardSide, null, DEEP_EVAL_WEIGHTS, tt).total;
      actualRollouts++;
    }

    if (actualRollouts > 0) {
      results.push({ idx, avgScore: totalScore / actualRollouts });
    }
  }

  results.sort((a, b) => b.avgScore - a.avgScore);
  return results;
}
