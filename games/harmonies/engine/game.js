/**
 * games/harmonies/engine/game.js
 * GameState factory, turn phases, legal-move queries, end detection.
 * Depends on: constants.js, board.js, central.js, animals.js, scoring.js
 *
 * Turn flow:
 *   DRAFT → PLACE → OPTIONAL → (auto refill + advance) → DRAFT ...
 *   When end condition met: remaining players finish, then END
 *
 * End conditions (either triggers the final round):
 *   1. Pouch cannot fully refill a slot after a draft.
 *   2. A player's board has ≤2 empty hexes after placement.
 */

// ── Game factory ──────────────────────────────────────────────
function newGame({ numPlayers, playerNames, boardSide, useSpiritCards }) {
  const pouch   = newPouch();
  const central = newCentralBoard(pouch);

  // Shuffle deck, deal 5 face-up cards
  const deck      = [...ANIMAL_CARDS].sort(() => Math.random() - 0.5);
  const available = deck.splice(0, 5);

  return {
    phase:        'DRAFT',
    currentPlayer: 0,
    numPlayers,
    playerNames,
    boardSide,
    useSpiritCards,

    central,
    pouch,

    // End-of-game tracking
    endTriggered:        false,
    finalRound:          false,
    finalRoundLastPlayer: null, // last player index to act in the final round

    boards:         playerNames.map(() => newPersonalBoard(boardSide)),
    animalDeck:     deck,
    availableCards: available, // AnimalCard[] length 5; null if deck exhausted

    // Current turn state
    draftedSlotIdx: null,
    tokensInHand:   [],
    handIdx:        0,        // index into tokensInHand currently being placed
    cardTakenThisTurn: false, // only 1 card per optional phase
  };
}

// ── Accessors ─────────────────────────────────────────────────
function currentBoard(state) {
  return state.boards[state.currentPlayer];
}

function currentToken(state) {
  return state.tokensInHand[state.handIdx] || null;
}

// ── DRAFT phase ───────────────────────────────────────────────
/**
 * Player picks a central board slot.
 * Tokens go into hand; phase becomes PLACE.
 */
function draftSlot(state, slotIdx) {
  if (state.phase !== 'DRAFT') return;
  const tokens = takeSlot(state.central, slotIdx);
  state.draftedSlotIdx  = slotIdx;
  state.tokensInHand    = tokens;
  state.handIdx         = 0;
  state.cardTakenThisTurn = false;
  state.phase           = 'PLACE';
  _advancePlacement(state); // auto-skip tokens with no legal placements
}

// ── PLACE phase ───────────────────────────────────────────────
/**
 * Place the current hand token on a board hex.
 */
function placeHandToken(state, key) {
  if (state.phase !== 'PLACE') return;
  const token = currentToken(state);
  if (!token) return;
  if (!canPlaceToken(currentBoard(state), key, token)) return;

  placeToken(currentBoard(state), key, token);
  state.handIdx++;

  // Check end condition: board nearly full
  if (emptyHexCount(currentBoard(state)) <= 2) {
    state.endTriggered = true;
  }

  _advancePlacement(state);
}

/**
 * Skip (discard) the current hand token. Used when no legal placements exist.
 */
function skipHandToken(state) {
  if (state.phase !== 'PLACE') return;
  state.handIdx++;
  _advancePlacement(state);
}

/**
 * After each token placement/skip, check if we've exhausted the hand.
 * Also auto-skip tokens that have no legal placements anywhere.
 */
function _advancePlacement(state) {
  const board = currentBoard(state);
  while (state.handIdx < state.tokensInHand.length) {
    const tok = state.tokensInHand[state.handIdx];
    if (legalPlacements(board, tok).length > 0) break; // player must place this
    state.handIdx++; // no legal spot — auto-discard
  }
  if (state.handIdx >= state.tokensInHand.length) {
    state.phase = 'OPTIONAL';
  }
}

/**
 * Returns the hex keys where the current hand token can legally be placed.
 */
function getLegalPlacements(state) {
  if (state.phase !== 'PLACE') return [];
  const tok = currentToken(state);
  if (!tok) return [];
  return legalPlacements(currentBoard(state), tok);
}

// ── OPTIONAL phase ────────────────────────────────────────────
/**
 * Take one animal card from the face-up display (max 1 per turn, max 4 held).
 * cardIdx: index 0–4 in state.availableCards.
 */
function takeAnimalCard(state, cardIdx) {
  if (state.phase !== 'OPTIONAL' && state.phase !== 'PLACE') return;
  if (state.cardTakenThisTurn) return;
  const board = currentBoard(state);
  if (board.heldCards.length >= 4) return;
  const card = state.availableCards[cardIdx];
  if (!card) return;

  board.heldCards.push(card);
  // Reveal next card from deck
  state.availableCards[cardIdx] = state.animalDeck.shift() || null;
  state.cardTakenThisTurn = true;
}

/**
 * Place a cube for a held animal card on the given hex.
 * Can be done multiple times per turn (any card, any valid hex).
 */
function placeCubeAction(state, cardId, key) {
  if (state.phase !== 'OPTIONAL' && state.phase !== 'PLACE') return;
  const board = currentBoard(state);
  const card  = board.heldCards.find(c => c.id === cardId);
  if (!card) return;

  const validHexes = findCubePlacements(board, card);
  if (!validHexes.includes(key)) return;

  placeCube(board, cardId, key);
}

/**
 * Returns all valid cube placements for the current player.
 * Result: [{ cardId, cardName, hexKeys: string[] }, ...]
 */
function getValidCubeActions(state) {
  if (state.phase !== 'OPTIONAL') return [];
  const board = currentBoard(state);
  return board.heldCards
    .map(card => ({
      cardId:   card.id,
      cardName: card.name,
      hexKeys:  findCubePlacements(board, card),
    }))
    .filter(a => a.hexKeys.length > 0);
}

/**
 * End the optional phase: refill slot, check end conditions, advance player.
 */
function endOptionalPhase(state) {
  if (state.phase !== 'OPTIONAL') return;

  // Refill the drafted slot
  const fullyRefilled = refillSlot(state.central, state.draftedSlotIdx, state.pouch);
  if (!fullyRefilled) state.endTriggered = true;

  // Resolve end-of-game transition
  if (state.endTriggered && !state.finalRound) {
    state.finalRound = true;
    // The final round ends after the player just before currentPlayer acts
    state.finalRoundLastPlayer =
      (state.currentPlayer - 1 + state.numPlayers) % state.numPlayers;
  }

  // Check if the game is over
  if (state.finalRound && state.currentPlayer === state.finalRoundLastPlayer) {
    state.phase = 'END';
    return;
  }

  // Advance to next player
  state.currentPlayer = (state.currentPlayer + 1) % state.numPlayers;
  state.draftedSlotIdx   = null;
  state.tokensInHand     = [];
  state.handIdx          = 0;
  state.phase            = 'DRAFT';
}

// ── Scoring ───────────────────────────────────────────────────
/**
 * Compute final scores for all players. Only meaningful when phase === 'END'.
 */
function getFinalScores(state) {
  return state.boards.map((board, i) => ({
    playerName: state.playerNames[i],
    ...computeScores(board, state.boardSide),
  }));
}
