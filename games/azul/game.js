/**
 * game.js
 * Main game engine – state management and rule enforcement.
 * Depends on: constants.js, bag.js, factories.js, board.js, scoring.js
 *
 * Public functions (global):
 *   createGame(difficulty)      → GameState
 *   getLegalMoves(state)        → Move[]
 *   applyMove(state, move)      → { floorOverflow, tookFirstToken }
 *   endRound(state)             → { playerResults, gameOver }
 *   applyFinalBonuses(state)    → bonusResults[]
 *   determineWinner(state)      → { winner, scores, rows }
 *   cloneState(state)           → GameState
 *   applyMoveToClone(state, m)  → GameState
 */

function createGame(difficulty, numPlayers) {
  numPlayers = numPlayers ?? 2;
  const bagState       = createBag();
  const factoriesState = createFactoriesState(getNumFactories(numPlayers));
  fillFactories(factoriesState, bagState);

  return {
    difficulty,
    numPlayers,
    phase:           PHASE.TAKING,
    round:           1,
    currentPlayer:   HUMAN,
    firstPlayerNext: HUMAN,
    bagState,
    factoriesState,
    boards: Array.from({ length: numPlayers }, () => createBoard()),
  };
}

function getLegalMoves(state) {
  const board   = state.boards[state.currentPlayer];
  const sources = getLegalSources(state.factoriesState);
  const moves   = [];

  for (const src of sources) {
    const dests = legalDestinations(board, src.color);
    const takesFirstToken =
      src.source === 'center' && state.factoriesState.firstPlayerInCenter;

    for (const row of dests) {
      moves.push({
        source:       src.source,
        factoryIndex: src.factoryIndex,
        color:        src.color,
        row,
        count:        src.count,
        takesFirstToken,
      });
    }
  }

  return moves;
}

function applyMove(state, move) {
  const board = state.boards[state.currentPlayer];
  let tiles;

  if (move.source === 'factory') {
    tiles = takeFromFactory(state.factoriesState, move.factoryIndex, move.color);
  } else {
    tiles = takeFromCenter(state.factoriesState, move.color);
  }

  let tookFirstToken = false;
  if (move.source === 'center' && move.takesFirstToken) {
    const claimed = claimFirstPlayerToken(state.factoriesState);
    if (claimed) {
      tookFirstToken = true;
      addToFloor(board, FIRST_PLAYER_TOKEN, 1);
      state.firstPlayerNext = state.currentPlayer;
    }
  }

  const floorSizeBefore = board.floor.length;
  const floorOverflow   = placeTilesOnRow(board, move.row, move.color, tiles.length);

  const floorAdded     = board.floor.length - floorSizeBefore;
  const trulyDiscarded = floorOverflow - floorAdded;
  if (trulyDiscarded > 0) {
    discardTiles(state.bagState, new Array(trulyDiscarded).fill(move.color));
  }

  advanceTurn(state);
  return { floorOverflow, tookFirstToken };
}

function advanceTurn(state) {
  if (isRoundOver(state.factoriesState)) {
    state.phase = PHASE.WALL_TILING;
  } else {
    state.currentPlayer = (state.currentPlayer + 1) % state.numPlayers;
    state.phase = PHASE.TAKING;
  }
}

function endRound(state) {
  const playerResults = [];
  let gameOver = false;

  for (let p = 0; p < state.numPlayers; p++) {
    const board  = state.boards[p];

    const events        = resolveWallTiling(board);
    const scoringEvents = events;
    let tilePlacementScore = 0;
    for (const ev of scoringEvents) tilePlacementScore += ev.points;

    const discardedFromLines = [];
    for (const ev of events) discardedFromLines.push(...ev.discarded);
    discardTiles(state.bagState, discardedFromLines);

    const penalty = calcFloorPenalty(board);
    applyScore(board, tilePlacementScore);
    applyScore(board, penalty);

    const { discarded: floorDiscarded } = clearFloor(board);
    discardTiles(state.bagState, floorDiscarded);

    playerResults.push({
      player: p,
      tilingEvents: scoringEvents,
      tilePlacementScore,
      penalty,
      finalScore: board.score,
    });

    if (hasCompletedRow(board)) gameOver = true;
  }

  if (gameOver) {
    state.phase = PHASE.GAME_OVER;
  } else {
    state.round++;
    state.currentPlayer = state.firstPlayerNext;
    fillFactories(state.factoriesState, state.bagState);
    state.phase = PHASE.TAKING;
  }

  return { playerResults, gameOver };
}

function applyFinalBonuses(state) {
  const results = [];
  for (let p = 0; p < state.numPlayers; p++) {
    const board   = state.boards[p];
    const bonuses = computeEndGameBonuses(board);
    applyScore(board, bonuses.total);
    results.push({ player: p, bonuses, total: board.score });
  }
  return results;
}

function determineWinner(state) {
  const scores = state.boards.map(b => b.score);
  const rows   = state.boards.map(b => countCompletedRows(b));

  // Find highest score; break ties by most completed rows
  const bestScore = Math.max(...scores);
  let topPlayers  = scores.reduce((acc, s, i) => s === bestScore ? [...acc, i] : acc, []);
  if (topPlayers.length > 1) {
    const bestRows = Math.max(...topPlayers.map(p => rows[p]));
    topPlayers = topPlayers.filter(p => rows[p] === bestRows);
  }
  const winner = topPlayers.length === 1 ? topPlayers[0] : null;
  return { winner, scores, rows };
}

function cloneState(state) {
  return {
    difficulty:      state.difficulty,
    numPlayers:      state.numPlayers,
    phase:           state.phase,
    round:           state.round,
    currentPlayer:   state.currentPlayer,
    firstPlayerNext: state.firstPlayerNext,
    bagState:        cloneBag(state.bagState),
    factoriesState:  cloneFactories(state.factoriesState),
    boards:          state.boards.map(cloneBoard),
  };
}

function applyMoveToClone(state, move) {
  const s = cloneState(state);
  applyMove(s, move);
  if (s.phase === PHASE.WALL_TILING) endRound(s);
  return s;
}
