/**
 * ai.js
 * Four-difficulty AI engine for Azul.
 * Depends on: constants.js, board.js, scoring.js, game.js
 *
 * Public function: getBestMove(gameState, difficulty) → Move
 */

function getBestMove(state, difficulty) {
  const moves = getLegalMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  switch (difficulty) {
    case 'easy':   return easyMove(state, moves);
    case 'medium': return mediumMove(state, moves);
    case 'hard':   return hardMove(state, moves);
    case 'expert': return expertMove(state, moves);
    default:       return easyMove(state, moves);
  }
}

/* ── EASY – Random with very light heuristic ── */

function easyMove(state, moves) {
  if (Math.random() < 0.8) {
    return moves[Math.floor(Math.random() * moves.length)];
  }
  return moves.reduce((best, m) =>
    quickScore(state, m) > quickScore(state, best) ? m : best
  , moves[0]);
}

/* ── MEDIUM – Greedy heuristic (single-move evaluation) ── */

function mediumMove(state, moves) {
  let bestScore = -Infinity;
  let bestMove  = moves[0];
  for (const move of moves) {
    const score = evaluateMove(state, move);
    if (score > bestScore) { bestScore = score; bestMove = move; }
  }
  return bestMove;
}

/* ── HARD – Minimax with alpha-beta pruning ── */

function hardMove(state, moves) {
  const branches = moves.length;
  const maxDepth = branches <= 6 ? 4 : branches <= 12 ? 3 : 2;

  let bestScore = -Infinity;
  let bestMove  = moves[0];

  const ordered = [...moves].sort(
    (a, b) => evaluateMove(state, b) - evaluateMove(state, a)
  );

  for (const move of ordered) {
    const next  = applyMoveToClone(state, move);
    const score = -negamax(next, maxDepth - 1, -Infinity, Infinity, AI);
    if (score > bestScore) { bestScore = score; bestMove = move; }
  }

  return bestMove;
}

function negamax(state, depth, alpha, beta, perspectivePlayer) {
  if (state.phase === PHASE.GAME_OVER || depth === 0) {
    return staticEval(state, perspectivePlayer);
  }

  const moves = getLegalMoves(state);
  if (moves.length === 0) return staticEval(state, perspectivePlayer);

  const ordered = [...moves].sort(
    (a, b) => evaluateMove(state, b) - evaluateMove(state, a)
  );

  let best = -Infinity;
  for (const move of ordered) {
    const next  = applyMoveToClone(state, move);
    const flip  = next.currentPlayer !== state.currentPlayer;
    const score = flip
      ? -negamax(next, depth - 1, -beta, -alpha, next.currentPlayer)
      :  negamax(next, depth - 1, alpha, beta, perspectivePlayer);

    if (score > best)  best  = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  return best;
}

/* ── EXPERT – Iterative deepening minimax (~2s budget) ── */

function expertMove(state, moves) {
  const TIME_LIMIT_MS = 1800;
  const start = Date.now();

  let bestMove = mediumMove(state, moves);
  let depth    = 1;

  while (Date.now() - start < TIME_LIMIT_MS) {
    const result = rootNegamax(state, moves, depth, start, TIME_LIMIT_MS);
    if (result.timeout) break;
    bestMove = result.move;
    depth++;
    if (depth > 8) break;
  }

  return bestMove;
}

function rootNegamax(state, moves, depth, startTime, limitMs) {
  const ordered = [...moves].sort(
    (a, b) => evaluateMove(state, b) - evaluateMove(state, a)
  );

  let bestScore = -Infinity;
  let bestMove  = ordered[0];

  for (const move of ordered) {
    if (Date.now() - startTime >= limitMs) return { move: bestMove, timeout: true };

    const next  = applyMoveToClone(state, move);
    const flip  = next.currentPlayer !== state.currentPlayer;
    const score = flip
      ? -negamaxTimed(next, depth - 1, -Infinity, Infinity, next.currentPlayer, startTime, limitMs)
      :  negamaxTimed(next, depth - 1, -Infinity, Infinity, AI, startTime, limitMs);

    if (score > bestScore) { bestScore = score; bestMove = move; }
  }

  return { move: bestMove, timeout: false };
}

function negamaxTimed(state, depth, alpha, beta, persp, startTime, limitMs) {
  if (Date.now() - startTime >= limitMs) return 0;
  if (state.phase === PHASE.GAME_OVER || depth === 0) return staticEval(state, persp);

  const moves = getLegalMoves(state);
  if (moves.length === 0) return staticEval(state, persp);

  const ordered = [...moves].sort(
    (a, b) => evaluateMove(state, b) - evaluateMove(state, a)
  );

  let best = -Infinity;
  for (const move of ordered) {
    if (Date.now() - startTime >= limitMs) break;

    const next  = applyMoveToClone(state, move);
    const flip  = next.currentPlayer !== state.currentPlayer;
    const score = flip
      ? -negamaxTimed(next, depth - 1, -beta, -alpha, next.currentPlayer, startTime, limitMs)
      :  negamaxTimed(next, depth - 1, alpha, beta, persp, startTime, limitMs);

    if (score > best)  best  = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  return best;
}

/* ── Static board evaluation ── */

function staticEval(state, player) {
  const opp = player === HUMAN ? AI : HUMAN;
  return boardHeuristic(state.boards[player]) - boardHeuristic(state.boards[opp]);
}

function boardHeuristic(board) {
  let h = board.score;

  for (const line of board.patternLines) {
    if (line.color === null) continue;
    const progress    = line.count / line.slots;
    const futureValue = estimateFuturePlacement(board.wall, line.row, line.color);
    h += progress * futureValue * 0.8;
  }

  h += calculateFloorPenalty(board) * 1.2;
  h += countCompletedRows(board)    * 2;
  h += countCompletedColumns(board) * 3;
  h += countCompletedColors(board)  * 4;

  let wallFilled = 0;
  for (const row of board.wall) wallFilled += row.filter(Boolean).length;
  h += wallFilled * 0.3;

  return h;
}

/* ── Move evaluation heuristic ── */

function evaluateMove(state, move) {
  const board = state.boards[state.currentPlayer];
  let score   = 0;

  if (move.row >= 0) {
    const line       = board.patternLines[move.row];
    const afterCount = line.count + move.count;
    const completing = afterCount >= line.slots;

    if (completing) {
      score += estimateFuturePlacement(board.wall, move.row, move.color);
    } else {
      const progress = Math.min(1, afterCount / line.slots);
      score += progress * estimateFuturePlacement(board.wall, move.row, move.color) * 0.5;
    }
  }

  const toFloor = move.row === -1
    ? move.count
    : Math.max(0, move.count - (board.patternLines[move.row].slots - board.patternLines[move.row].count));

  const existingFloor = board.floor.length;
  for (let i = 0; i < toFloor; i++) {
    const idx = existingFloor + i;
    if (idx < FLOOR_PENALTIES.length) score += FLOOR_PENALTIES[idx];
  }

  if (move.takesFirstToken) {
    const nextFloor = existingFloor + (move.row === -1 ? move.count : toFloor);
    if (nextFloor < FLOOR_PENALTIES.length) score += FLOOR_PENALTIES[nextFloor];
    score += 0.5;
  }

  if (move.row === -1) score -= 0.5;

  return score;
}

/* ── Quick score (used by easy AI) ── */

function quickScore(state, move) {
  if (move.row < 0) return -1;
  const line = state.boards[state.currentPlayer].patternLines[move.row];
  const completing = line.count + move.count >= line.slots;
  return completing ? move.row + 1 : (line.count + move.count) / line.slots;
}
