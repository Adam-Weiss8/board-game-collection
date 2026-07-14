/**
 * games/harmonies/engine/ai-rollout.js
 * Full-game Monte Carlo rollouts for macro-move evaluation.
 *
 * A macro-move is one complete turn decision:
 *   { slotIdx, choices[], cardIdx }
 * where choices[i] is the placement hex for tokensInHand[i] (null = skip)
 * and cardIdx is the animal card to take in the optional phase (null = none).
 *
 * Candidate macro-moves are evaluated by cloning the full game state,
 * applying the macro-move, then playing the game to the end with a fast
 * greedy policy for ALL players. The objective is the AI's own final score
 * (this game is mostly multiplayer-solitaire — no denial term).
 *
 * Depends on: constants.js, board.js, central.js, animals.js, scoring.js,
 *             game.js, ai-config.js, ai-evaluator.js, ai-search.js
 */

// ── State cloning ─────────────────────────────────────────────

function _shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Small deterministic PRNG (mulberry32) used to give every candidate the
 * same random future within a rollout round (common random numbers) —
 * candidate comparisons then reflect the decision, not draw luck.
 */
function _mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deep-clone a GameState for simulation.
 * The pouch is a count map (draw randomness happens at draw time), so cloning
 * it leaks nothing. The animal deck is an ordered array whose order is hidden
 * information — the caller should re-shuffle the clone's deck per rollout.
 */
function cloneGameState(state) {
  return {
    phase:          state.phase,
    currentPlayer:  state.currentPlayer,
    numPlayers:     state.numPlayers,
    playerNames:    state.playerNames,
    boardSide:      state.boardSide,
    useSpiritCards: state.useSpiritCards,

    central: cloneCentralBoard(state.central),
    pouch:   clonePouch(state.pouch),

    endTriggered:         state.endTriggered,
    finalRound:           state.finalRound,
    finalRoundLastPlayer: state.finalRoundLastPlayer,

    boards:         state.boards.map(clonePersonalBoard),
    animalDeck:     [...state.animalDeck],
    availableCards: [...state.availableCards],

    draftedSlotIdx:    state.draftedSlotIdx,
    tokensInHand:      [...state.tokensInHand],
    handIdx:           state.handIdx,
    cardTakenThisTurn: state.cardTakenThisTurn,
  };
}

// ── Fast greedy policy (rollout interior) ─────────────────────

/**
 * Build a map of hexKey → token for hexes that would advance held cards
 * that are 1–3 placements from firing. Bonus favors nearly-complete cards.
 */
function _goalBonusMap(board) {
  const bonus = new Map(); // key → { token, value }
  for (const card of board.heldCards) {
    if ((board.cubesPlaced[card.id] || 0) >= card.cubes) continue;
    const near = _findNearCompletePatterns(board, card);
    if (!near.length) continue;
    const best = near[0];
    const v = Math.max(1, 7 - 2 * (best.totalSteps - 1)); // 1 step: 7, 2: 5, 3: 3
    for (const { key, token } of best.missing) {
      const cur = bonus.get(key);
      if (!cur || cur.value < v) bonus.set(key, { token, value: v });
    }
  }
  return bonus;
}

function _greedyPlaceKey(board, tok, places, goalBonus) {
  let bestK = places[0], bestV = -Infinity;
  for (const k of places) {
    let v = _singleTokenScore(board, k, tok);
    const gb = goalBonus && goalBonus.get(k);
    if (gb && gb.token === tok) v += gb.value;
    if (v > bestV) { bestV = v; bestK = k; }
  }
  return bestK;
}

/**
 * Synchronous cube placement: fire every available cube, highest value first.
 * Same logic as ai-player's _placeCubes but without sleeps/rendering.
 */
function _placeCubesSync(state) {
  const board = state.boards[state.currentPlayer];
  let placed = true;
  while (placed) {
    placed = false;
    const sorted = [...board.heldCards].sort((a, b) => {
      const aPlaced = board.cubesPlaced[a.id] || 0;
      const bPlaced = board.cubesPlaced[b.id] || 0;
      const aVal = aPlaced < a.cubes ? (a.points[a.cubes - aPlaced - 1] || 0) : 0;
      const bVal = bPlaced < b.cubes ? (b.points[b.cubes - bPlaced - 1] || 0) : 0;
      return bVal - aVal;
    });
    for (const card of sorted) {
      const hexes = findCubePlacements(board, card);
      if (!hexes.length) continue;
      placeCubeAction(state, card.id, hexes[0]);
      placed = true;
      break;
    }
  }
}

/**
 * Rollout card rule: take a card that fires immediately (best points first);
 * if not over-extended, also accept a card that is 1 placement from firing.
 */
function _fastCardChoice(state) {
  const board = state.boards[state.currentPlayer];
  if (state.cardTakenThisTurn || board.heldCards.length >= 4) return null;

  const unfired = board.heldCards.filter(c => (board.cubesPlaced[c.id] || 0) === 0).length;
  let bestI = null, bestV = 0;
  for (let i = 0; i < state.availableCards.length; i++) {
    const card = state.availableCards[i];
    if (!card) continue;
    let v = 0;
    if (findCubePlacements(board, card).length > 0) {
      v = card.points[0] + 5;
    } else if (unfired < 2) {
      const near = _findNearCompletePatterns(board, card);
      if (near.length && near[0].totalSteps === 1) v = card.points[0] * 0.5;
    }
    if (v > bestV) { bestV = v; bestI = i; }
  }
  return bestI;
}

/**
 * Play one full turn for state.currentPlayer with the fast greedy policy.
 * Fully synchronous; never touches the DOM.
 */
function fastPolicyTurn(state) {
  const board = state.boards[state.currentPlayer];

  if (state.phase === 'DRAFT') {
    // Tokens the player's near-complete cards still need (token type → bonus)
    const needBonus = new Map();
    for (const { token, value } of _goalBonusMap(board).values()) {
      if ((needBonus.get(token) || 0) < value) needBonus.set(token, value);
    }

    let bestIdx = 0, bestVal = -Infinity;
    for (let i = 0; i < state.central.slots.length; i++) {
      const tokens = state.central.slots[i].tokens;
      if (!tokens || tokens.length === 0) continue;
      let v = 0;
      const needSeen = new Set();
      for (const tok of tokens) {
        const places = legalPlacements(board, tok);
        let tokBest = 0;
        for (const k of places) {
          const s = _singleTokenScore(board, k, tok);
          if (s > tokBest) tokBest = s;
        }
        v += tokBest;
        // Card-progress pull: a slot carrying a token a near-complete card
        // needs is worth much more than raw terrain value (once per type).
        if (needBonus.has(tok) && !needSeen.has(tok) && places.length > 0) {
          v += needBonus.get(tok);
          needSeen.add(tok);
        }
      }
      if (v > bestVal) { bestVal = v; bestIdx = i; }
    }
    draftSlot(state, bestIdx);
  }

  if (state.phase === 'PLACE') {
    const goalBonus = _goalBonusMap(board);
    let safety = 0;
    while (state.phase === 'PLACE' && safety++ < 10) {
      const tok = state.tokensInHand[state.handIdx];
      if (tok === undefined) break;
      const places = legalPlacements(board, tok);
      if (!places.length) { skipHandToken(state); continue; }
      placeHandToken(state, _greedyPlaceKey(board, tok, places, goalBonus));
    }
  }

  if (state.phase === 'OPTIONAL') {
    _placeCubesSync(state);
    const cardIdx = _fastCardChoice(state);
    if (cardIdx !== null) takeAnimalCard(state, cardIdx);
    endOptionalPhase(state);
  }
}

// ── Rollout ───────────────────────────────────────────────────

/**
 * Play the cloned game to the end with the fast policy for all players.
 * Returns myPlayerIdx's final total score.
 */
function rolloutFromState(sim, myPlayerIdx, maxPlies) {
  maxPlies = maxPlies || 120;
  let plies = 0;
  while (sim.phase !== 'END' && plies++ < maxPlies) {
    if (!['DRAFT', 'PLACE', 'OPTIONAL'].includes(sim.phase)) break;
    fastPolicyTurn(sim);
  }
  return computeScores(sim.boards[myPlayerIdx], sim.boardSide).total;
}

// ── Macro-move application ────────────────────────────────────

/**
 * Apply a macro-move to a cloned state: draft the slot, follow the placement
 * plan (greedy fallback when a planned key is stale), fire cubes, take the
 * chosen card. Leaves the state advanced to the next player's DRAFT (or END).
 */
function applyMacroMove(sim, macro) {
  const player = sim.currentPlayer;
  draftSlot(sim, macro.slotIdx);

  const board = sim.boards[player];
  const goalBonus = _goalBonusMap(board);
  let safety = 0;
  while (sim.phase === 'PLACE' && safety++ < 10) {
    const i   = sim.handIdx;
    const tok = sim.tokensInHand[i];
    if (tok === undefined) break;
    const planned = macro.choices && macro.choices[i];
    if (planned && canPlaceToken(board, planned, tok)) {
      placeHandToken(sim, planned);
      continue;
    }
    const places = legalPlacements(board, tok);
    if (!places.length) { skipHandToken(sim); continue; }
    placeHandToken(sim, _greedyPlaceKey(board, tok, places, goalBonus));
  }

  if (sim.phase === 'OPTIONAL') {
    _placeCubesSync(sim);
    if (macro.cardIdx !== null && macro.cardIdx !== undefined) {
      takeAnimalCard(sim, macro.cardIdx); // validates held<4 / non-null internally
    }
    endOptionalPhase(sim);
  }
}

// ── Macro-move evaluation (successive halving) ────────────────

/**
 * Rollout-rank candidate macro-moves. Runs rollouts round-robin, dropping the
 * bottom third of candidates once everyone has ≥2 samples, until the deadline
 * or profile.rollouts samples per survivor. Returns the best candidate.
 *
 * @param {object}   state      - live GameState at DRAFT (not mutated)
 * @param {object[]} candidates - [{ slotIdx, choices, cardIdx, prior }]
 * @param {object}   profile    - AI_DIFFICULTY_PROFILES entry
 * @param {number}   deadline   - performance.now() cutoff
 * @param {function} [onYield]  - async yield between rounds (UI responsiveness)
 * @returns {Promise<object>} best candidate
 */
async function rolloutRankCandidates(state, candidates, profile, deadline, onYield) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const myIdx  = state.currentPlayer;
  const target = profile.rollouts || 4;
  const stats  = candidates.map(c => ({ c, sum: 0, n: 0 }));
  let active   = stats.slice();

  const baseSeed   = (Math.random() * 0x7fffffff) | 0;
  const realRandom = Math.random;
  let round = 0;

  while (performance.now() < deadline) {
    round++;
    for (const s of active) {
      if (performance.now() >= deadline) break;
      // Common random numbers: all candidates in a round share one seed,
      // i.e. the same deck shuffle and (nearly) the same pouch draws.
      Math.random = _mulberry32(baseSeed + round * 7919);
      try {
        const sim = cloneGameState(state);
        _shuffleInPlace(sim.animalDeck); // deck order is hidden info
        applyMacroMove(sim, s.c);
        s.sum += rolloutFromState(sim, myIdx);
        s.n++;
      } finally {
        Math.random = realRandom;
      }
    }
    if (onYield) await onYield();

    // Drop the bottom third once every active candidate has ≥2 samples
    if (active.length > 2 && active.every(s => s.n >= 2)) {
      active.sort((a, b) => b.sum / b.n - a.sum / a.n);
      active = active.slice(0, Math.max(2, Math.ceil(active.length * (2 / 3))));
    }
    if (active.every(s => s.n >= target)) break;
  }

  // Final pick: compare only candidates that received the most rollout
  // samples (the halving survivors) by their mean — with common random
  // numbers those means are paired and directly comparable. The deepEvaluate
  // prior is on a different scale and serves only as tiebreak / no-sample
  // fallback.
  const nMax = Math.max(...stats.map(s => s.n));
  if (nMax === 0) {
    return candidates.reduce((b, c) => (c.prior || 0) > (b.prior || 0) ? c : b);
  }
  const finalists = stats.filter(s => s.n === nMax);
  finalists.sort((a, b) =>
    (b.sum / b.n - a.sum / a.n) || ((b.c.prior || 0) - (a.c.prior || 0)));

  if (AI_DEBUG) {
    console.log('[AI rollout] ' + JSON.stringify(finalists.slice(0, 5).map(s => ({
      slot: s.c.slotIdx, card: s.c.cardIdx, n: s.n,
      avg: +(s.sum / s.n).toFixed(1),
      prior: +(s.c.prior || 0).toFixed(1),
    }))));
  }
  return finalists[0].c;
}
