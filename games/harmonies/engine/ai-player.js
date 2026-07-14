/**
 * games/harmonies/engine/ai-player.js
 * AI turn orchestrator. Public API: runAiTurn().
 * Same external signature as the old engine/ai.js — main.js is unchanged.
 *
 * Depends on: constants.js, board.js, animals.js, scoring.js, game.js,
 *             ai-config.js, ai-hasher.js, ai-evaluator.js, ai-search.js
 */

function _aiSleep(ms) {
  // In headless mode use 1ms (macrotask) instead of the full delay,
  // keeping the browser event loop responsive for console evals.
  const delay = (typeof AI_HEADLESS !== 'undefined' && AI_HEADLESS) ? 1 : ms;
  return new Promise(resolve => setTimeout(resolve, delay));
}

function _randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Profile resolution ────────────────────────────────────────

/**
 * Build an effective profile from difficulty string + optional personality
 * and harness overrides (opts.profile fields shallow-merge onto the tier
 * profile; opts.weights rides along as profile.weights).
 * Personality.planning scales beam width so weaker opponents search shallower.
 */
function _resolveProfile(difficulty, personality, opts) {
  let base = AI_DIFFICULTY_PROFILES[difficulty] || AI_DIFFICULTY_PROFILES.medium;
  if (opts && (opts.profile || opts.weights)) {
    base = Object.assign({}, base, opts.profile || {});
    if (opts.weights) base.weights = opts.weights;
  }
  if (!personality || base.beamWidth === 0) return base;

  // Scale beam width linearly by planning stat (85 = full strength)
  const planScale = Math.max(0.2, Math.min(1.0, personality.planning / 85));
  return Object.assign({}, base, {
    beamWidth: Math.max(1, Math.round(base.beamWidth * planScale)),
  });
}

// ── Card selection ────────────────────────────────────────────

/**
 * Choose the index of the best available animal card to take, or null.
 * Factors in endgame mode, timing throttle, synergy, and difficulty.
 */
function chooseBestCard(state, difficulty) {
  const board = state.boards[state.currentPlayer];
  if (board.heldCards.length >= 4) return null;

  const totalHexes = Object.keys(board.hexes).length;
  const emptyHexes = emptyHexCount(board);
  const isEndgame  = emptyHexes <= Math.floor(totalHexes * 0.30);

  const validCards = state.availableCards
    .map((card, i) => ({ card, i }))
    .filter(({ card }) => card !== null);

  if (validCards.length === 0) return null;
  if (difficulty === 'easy') return Math.random() < 0.5 ? _randomFrom(validCards).i : null;

  // Hard veto: if 2+ held cards have never fired a single cube, stop accumulating.
  // avgCubes-based throttle was too lenient — this catches genuine over-accumulation.
  const unfiredCards = board.heldCards.filter(c => (board.cubesPlaced[c.id] || 0) === 0).length;
  const throttled = unfiredCards >= 2;

  // Endgame or throttled: only take cards that fire immediately
  if (isEndgame || throttled) {
    const immediates = validCards.filter(({ card }) =>
      findCubePlacements(board, card).length > 0
    );
    if (immediates.length === 0) return null;
    return immediates.reduce((best, cur) => {
      const curFit  = _bestPatternMatchFraction(board, cur.card);
      const bestFit = _bestPatternMatchFraction(board, best.card);
      if (curFit !== bestFit) return curFit > bestFit ? cur : best;
      return cur.card.points[0] > best.card.points[0] ? cur : best;
    }).i;
  }

  const ranked = _scoreCardCandidates(board, state.availableCards);
  if (ranked.length === 0) return null;

  // Only take cards that are 0-1 steps from firing (with some synergy allowance for 2-step).
  // 0 steps: ~0.65+, 1 step: ~0.45+, 2 steps with synergy: ~0.35+ — 3+ steps blocked.
  const threshold = (difficulty === 'hard' || difficulty === 'expert') ? 0.30 : 0.35;
  return ranked[0].score >= threshold ? ranked[0].i : null;
}

/**
 * Score all available cards against a board by realistic proximity to firing
 * plus portfolio fit. Returns [{ i, card, score }] sorted best-first.
 * Cards that require 3+ hard-to-build tokens are heavily penalised.
 */
function _scoreCardCandidates(board, availableCards) {
  const totalHexes = Object.keys(board.hexes).length;
  const emptyHexes = emptyHexCount(board);
  const results = [];

  for (let i = 0; i < availableCards.length; i++) {
    const card = availableCards[i];
    if (!card) continue;
    const topVal  = card.points[0];
    const immFire = findCubePlacements(board, card).length > 0;

    // How many token placements away from firing the first cube?
    const near      = _findNearCompletePatterns(board, card);
    const stepsAway = immFire ? 0 : (near.length > 0 ? near[0].totalSteps : Infinity);

    // Base multiplier — steeply penalises cards that need many tokens to fire
    const baseFromSteps = stepsAway === 0 ? 0.65
      : stepsAway === 1                   ? 0.45
      : stepsAway === 2                   ? 0.25
      : stepsAway === 3                   ? 0.08
      :                                     0.02; // 4+ steps / impossible

    // Height difficulty penalty: h=3 cards (Green h3, trees) are hard to build even
    // when "1 step away" — BROWN base must exist and stay unbuilt long enough.
    const maxCellH = Math.max(...card.pattern.map(c => c.minH));
    const heightPenalty = maxCellH >= 3 ? 0.40 : maxCellH >= 2 ? 0.80 : 1.0;

    // Early-game speculative bonus: grab simple all-h1 cards proactively when the
    // board is still mostly empty and we have room in our portfolio.
    const isEarlyGame = emptyHexes >= Math.floor(totalHexes * 0.60);
    const isSimple    = maxCellH === 1;
    const earlySpec   = (isEarlyGame && isSimple && board.heldCards.length < 2) ? 0.30 : 0;

    const portfolio = cardPortfolioSynergy(card, board.heldCards);
    const conflict  = cardConflictScore(board, card, board.heldCards);

    // Expected value: how many cube tiers are plausibly reachable in the
    // remaining turns (~2.5 turns per extra cube after the first pattern),
    // instead of assuming full completion (points[0]).
    const turnsLeft = _AI_TURNS_LEFT_HINT;
    let evTotal = topVal;
    if (isFinite(turnsLeft)) {
      const buildCost = stepsAway === 0 ? 0 : (stepsAway === Infinity ? 4 : stepsAway);
      const reachable = Math.max(0, Math.min(card.cubes,
        Math.floor((turnsLeft - buildCost) / 2.5) + 1));
      if (reachable === 0) continue; // can't convert before game end — skip card
      evTotal = card.points[card.cubes - reachable];
    }

    // Synergy/proximity is the dominant factor; points add only a tiny tiebreaker (~5%)
    const synergyScore  = (baseFromSteps + earlySpec + portfolio * 0.25 - conflict * 0.45) * heightPenalty;
    const normalizedPts = Math.min(evTotal / 20.0, 1.0);
    results.push({ i, card, score: synergyScore + normalizedPts * 0.05 });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

// ── Cube placement ────────────────────────────────────────────

/**
 * Place all available animal cubes, starting with the highest-value card.
 * Loops until no more cubes can be placed (one cube can unlock another).
 */
async function _placeCubes(state, difficulty, onStateUpdate) {
  let anyCubePlaced = true;
  while (anyCubePlaced) {
    anyCubePlaced = false;
    const board = state.boards[state.currentPlayer];

    // Sort by descending next-cube value
    const sortedCards = [...board.heldCards].sort((a, b) => {
      const aPlaced = board.cubesPlaced[a.id] || 0;
      const bPlaced = board.cubesPlaced[b.id] || 0;
      const aVal = aPlaced < a.cubes ? (a.points[a.cubes - aPlaced - 1] || 0) : 0;
      const bVal = bPlaced < b.cubes ? (b.points[b.cubes - bPlaced - 1] || 0) : 0;
      return bVal - aVal;
    });

    for (const card of sortedCards) {
      const hexes = findCubePlacements(board, card);
      if (hexes.length === 0) continue;
      const key = difficulty === 'easy' ? _randomFrom(hexes) : hexes[0];
      placeCubeAction(state, card.id, key);
      onStateUpdate();
      await _aiSleep(500);
      anyCubePlaced = true;
      break; // restart sort from top after each cube
    }
  }
}

// ── Card-decision macro candidates ────────────────────────────

/**
 * Build macro-move candidates that differ only in the animal card taken
 * (take nothing / top-scored card options on the post-placement board).
 * The slot and placement plan are fixed — chosen by the proven beam+deepEval
 * path — because full-game rollouts with a greedy policy rank card decisions
 * well (multi-turn consequences) but are too biased/noisy to outrank
 * deepEvaluate on slot choice.
 */
function _generateCardCandidates(state, slotIdx, choices, profile) {
  const board  = state.boards[state.currentPlayer];
  const tokens = state.central.slots[slotIdx].tokens;

  // Post-placement board for card scoring
  const sim = clonePersonalBoard(board);
  for (let i = 0; i < tokens.length; i++) {
    const k = choices && choices[i];
    if (k && canPlaceToken(sim, k, tokens[i])) placeToken(sim, k, tokens[i]);
  }

  const candidates = [{ slotIdx, choices, cardIdx: null, prior: 0 }];
  if (board.heldCards.length < 4) {
    const ranked = _scoreCardCandidates(sim, state.availableCards);
    const maxCards = Math.max(1, (profile.maxCandidates || 4) - 1);
    for (const rc of ranked.slice(0, maxCards)) {
      if (rc.score >= 0.10) {
        candidates.push({ slotIdx, choices, cardIdx: rc.i, prior: rc.score });
      }
    }
  }
  return candidates;
}

// ── Main AI turn ──────────────────────────────────────────────

/**
 * Execute a full AI turn, mutating state in-place via standard engine functions.
 *
 * External signature matches the old engine/ai.js — main.js requires no changes.
 *
 * @param {object}   state          - live GameState (mutated)
 * @param {string}   difficulty     - 'easy' | 'medium' | 'hard' | 'expert'
 * @param {function} onStateUpdate  - called after each visible action to trigger re-render
 * @param {object}   [personality]  - optional career personality from derivePersonality()
 * @param {object}   [opts]         - harness overrides: { profile, weights }
 */
async function runAiTurn(state, difficulty, onStateUpdate, personality, opts) {
  // Career personality overrides difficulty tier
  if (personality) {
    difficulty = personality.planning >= 85 ? 'expert'
               : personality.planning >= 65 ? 'hard'
               : personality.planning >= 45 ? 'medium' : 'easy';
  }

  const profile  = _resolveProfile(difficulty, personality, opts);
  const deadline = performance.now() + Math.max(200, profile.searchMs || 700);
  const tt       = new TranspositionTable();

  // v3 strategy brain: per-config opts override wins, else the global flag.
  // Lets the match harness pit v3 against legacy in the same game.
  const useV3 = (opts && opts.strategyV3 != null)
    ? opts.strategyV3
    : (typeof AI_STRATEGY_V3 !== 'undefined' && AI_STRATEGY_V3);
  _AI_USE_V3 = useV3; // routes animalFastScore/deepEvaluate to the v3 brain

  // Refresh the turns-remaining hint used by evaluator endgame discounts
  _AI_TURNS_LEFT_HINT = estimateTurnsRemaining(state);

  if (AI_DEBUG) {
    console.log('[AI turn start]', { difficulty, beamWidth: profile.beamWidth, searchMs: profile.searchMs, rollouts: profile.rollouts || 0 });
  }

  // ── 1. Draft phase ─────────────────────────────────────────
  // Slot via per-slot beam search. If the profile enables rollouts
  // (experimental, off by default — see ai-config.js), the card decision
  // is additionally arbitrated by full-game rollouts.
  let plannedKeys    = null;
  let planOrigin     = 0;         // token index plannedKeys[0] refers to
  let plannedCardIdx;             // undefined = decide via chooseBestCard later

  const useRollouts = profile.beamWidth > 0 && (profile.rollouts || 0) > 0
    && state.phase === 'DRAFT' && typeof rolloutRankCandidates === 'function';

  if (useRollouts) {
    // Budget split: ~35% slot choice, ~25% placement plan (both via the
    // proven beam+deepEval path), ~40% card-decision rollouts.
    const budget       = deadline - performance.now();
    const slotDeadline = performance.now() + budget * 0.35;

    const slotIdx = beamSearchDraftSlot(state, profile, slotDeadline, tt);
    const tokens  = state.central.slots[slotIdx].tokens || [];

    const placeDeadline = performance.now() + budget * 0.25;
    const choices = beamSearchPlacements(
      state.boards[state.currentPlayer],
      tokens, 0, state.boardSide, profile, placeDeadline, tt
    );

    // Rollout-arbitrate the card decision (take nothing vs top candidates)
    const candidates = _generateCardCandidates(state, slotIdx, choices, profile);
    let best = candidates[0];
    if (candidates.length > 1) {
      best = await rolloutRankCandidates(state, candidates, profile, deadline, () => _aiSleep(0));
    }

    draftSlot(state, slotIdx);
    plannedKeys    = choices;                    // aligned from token index 0
    plannedCardIdx = best ? best.cardIdx : null; // null = deliberately take nothing
  }

  if (state.phase === 'DRAFT') {
    const slotIdx = beamSearchDraftSlot(state, profile, deadline, tt);
    draftSlot(state, slotIdx);
  }
  onStateUpdate();
  await _aiSleep(750);

  // ── 2. Place phase ─────────────────────────────────────────
  // v3: place base tokens (BROWN/GRAY) before toppers (GREEN/RED) so the beam
  // can build trees (green-on-brown) and houses (red-on-base) within one turn,
  // instead of being forced to drop a green as a standalone 1pt bush. Placing a
  // turn's own tokens in any order is legal.
  if (useV3 && state.phase === 'PLACE' && state.handIdx < state.tokensInHand.length) {
    const ORDER = { BROWN: 0, GRAY: 1, BLUE: 2, YELLOW: 2, GREEN: 3, RED: 3 };
    const head = state.tokensInHand.slice(0, state.handIdx);
    const tail = state.tokensInHand.slice(state.handIdx).sort((a, b) => (ORDER[a] ?? 2) - (ORDER[b] ?? 2));
    state.tokensInHand = head.concat(tail);
  }

  // Pre-compute the full placement sequence via beam search so that
  // multi-token combos (e.g. BROWN then GREEN for a 7pt tall tree) are
  // properly coordinated rather than greedy one-at-a-time.
  if (plannedKeys === null) {
    planOrigin = state.handIdx; // token index at planning time

    if (profile.beamWidth > 0 && state.phase === 'PLACE') {
      const placementBudget  = Math.min(1500, Math.max(300, deadline - performance.now()) * 0.7);
      const placementDeadline = performance.now() + placementBudget;
      plannedKeys = beamSearchPlacements(
        state.boards[state.currentPlayer],
        state.tokensInHand,
        state.handIdx,
        state.boardSide,
        profile,
        placementDeadline,
        tt
      );
    }
  }

  while (state.phase === 'PLACE') {
    const curHandIdx = state.handIdx;
    const tok        = state.tokensInHand[curHandIdx];
    if (tok === undefined) break;

    const curBoard = state.boards[state.currentPlayer];
    const places   = legalPlacements(curBoard, tok);

    if (places.length === 0) {
      skipHandToken(state);
      continue; // no delay — skipped tokens are invisible
    }

    let chosenKey;

    if (profile.beamWidth === 0) {
      // Easy: random legal placement
      chosenKey = _randomFrom(places);
    } else if (personality && Math.random() * 100 < (personality.mistake_rate || 0)) {
      // Career personality mistake: play a random legal hex
      chosenKey = _randomFrom(places);
    } else {
      // Use planned key; fall back to greedy if it's no longer legal
      const offsetIdx = curHandIdx - planOrigin;
      const planned   = plannedKeys && plannedKeys[offsetIdx];
      chosenKey = (planned && places.includes(planned))
        ? planned
        : places.reduce((bk, k) =>
            _singleTokenScore(curBoard, k, tok) > _singleTokenScore(curBoard, bk, tok) ? k : bk
          );
    }

    placeHandToken(state, chosenKey);
    onStateUpdate();
    await _aiSleep(600);
  }

  // ── 3. Optional phase ──────────────────────────────────────
  if (state.phase !== 'OPTIONAL') return;

  // Place all available animal cubes
  await _placeCubes(state, difficulty, onStateUpdate);

  // Take an animal card: rollout tiers decided this in the macro-move
  // (plannedCardIdx, where null = deliberately take nothing);
  // other tiers use the threshold heuristic.
  const cardIdx = plannedCardIdx !== undefined
    ? plannedCardIdx
    : (useV3 ? chooseCards(state, difficulty) : chooseBestCard(state, difficulty));
  if (cardIdx !== null && state.availableCards[cardIdx]) {
    takeAnimalCard(state, cardIdx);
    onStateUpdate();
    await _aiSleep(500);
  }

  // End the turn
  endOptionalPhase(state);
  onStateUpdate();

  if (AI_DEBUG) {
    const finalBoard = state.boards[state.currentPlayer] || state.boards[0];
    console.log('[AI turn end]', {
      score: computeScores(finalBoard, state.boardSide),
      ttSize: tt.size,
    });
  }
}
