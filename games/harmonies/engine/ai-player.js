/**
 * games/harmonies/engine/ai-player.js
 * AI turn orchestrator. Public API: runAiTurn().
 * Same external signature as the old engine/ai.js — main.js is unchanged.
 *
 * Depends on: constants.js, board.js, animals.js, scoring.js, game.js,
 *             ai-config.js, ai-hasher.js, ai-evaluator.js, ai-search.js
 */

function _aiSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function _randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Profile resolution ────────────────────────────────────────

/**
 * Build an effective profile from difficulty string + optional personality.
 * Personality.planning scales beam width so weaker opponents search shallower.
 */
function _resolveProfile(difficulty, personality) {
  const base = AI_DIFFICULTY_PROFILES[difficulty] || AI_DIFFICULTY_PROFILES.medium;
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

  // Timing throttle: avoid accumulating cards with no progress
  const totalCubesPlaced = board.heldCards.reduce(
    (sum, c) => sum + (board.cubesPlaced[c.id] || 0), 0
  );
  const avgCubes = board.heldCards.length > 0
    ? totalCubesPlaced / board.heldCards.length : 1;
  const throttled = board.heldCards.length >= 2 && avgCubes < 0.4;

  // Endgame or throttled: only take cards that fire immediately
  if (isEndgame || throttled) {
    const immediates = validCards.filter(({ card }) =>
      findCubePlacements(board, card).length > 0
    );
    if (immediates.length === 0) return null;
    return immediates.reduce((best, cur) =>
      cur.card.points[0] > best.card.points[0] ? cur : best
    ).i;
  }

  // Normal: score by raw value × (fire bonus + terrain synergy)
  let bestI = null, bestScore = -Infinity;
  for (const { card, i } of validCards) {
    const topVal  = card.points[0];
    const immFire = findCubePlacements(board, card).length > 0;
    const synergy = _bestPatternMatchFraction(board, card); // from ai-evaluator.js
    const mult    = (immFire ? 0.65 : 0.25) + synergy * 0.55;
    const score   = topVal * mult;
    if (score > bestScore) { bestScore = score; bestI = i; }
  }

  // Lower threshold for hard/expert (takes synergistic cards more readily)
  const threshold = (difficulty === 'hard' || difficulty === 'expert') ? 3.0 : 4.5;
  return bestScore >= threshold ? bestI : null;
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
 */
async function runAiTurn(state, difficulty, onStateUpdate, personality) {
  // Career personality overrides difficulty tier
  if (personality) {
    difficulty = personality.planning >= 85 ? 'expert'
               : personality.planning >= 65 ? 'hard'
               : personality.planning >= 45 ? 'medium' : 'easy';
  }

  const profile  = _resolveProfile(difficulty, personality);
  const deadline = performance.now() + Math.max(200, profile.searchMs || 700);
  const tt       = new TranspositionTable();

  if (AI_DEBUG) {
    console.log('[AI turn start]', { difficulty, beamWidth: profile.beamWidth, searchMs: profile.searchMs });
  }

  // ── 1. Draft phase ─────────────────────────────────────────
  const slotIdx = beamSearchDraftSlot(state, profile, deadline, tt);
  draftSlot(state, slotIdx);
  onStateUpdate();
  await _aiSleep(750);

  // ── 2. Place phase ─────────────────────────────────────────
  // Pre-compute the full placement sequence via beam search so that
  // multi-token combos (e.g. BROWN then GREEN for a 7pt tall tree) are
  // properly coordinated rather than greedy one-at-a-time.
  let plannedKeys  = null;
  const planOrigin = state.handIdx; // token index at planning time

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

  // Optionally take an animal card
  const cardIdx = chooseBestCard(state, difficulty);
  if (cardIdx !== null) {
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
