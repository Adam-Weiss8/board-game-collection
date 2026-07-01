/**
 * career/career-ai.js
 * Personality-driven AI for Career Mode.
 * Each opponent's personality profile directly shapes move selection.
 * Depends on: constants.js, board.js, scoring.js, game.js, career/opponents.js
 */

/**
 * Main entry point: select a move for the career AI.
 * @param {GameState} state
 * @param {object} personality  - from derivePersonality()
 * @returns {Move}
 */
function getCareerAIMove(state, personality) {
  const moves = getLegalMoves(state);
  if (!moves || moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  // Mistake injection: randomly pick a legal move
  if (Math.random() * 100 < personality.mistake_rate) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // Score all moves with personality weighting
  const scored = moves
    .map(m => ({ move: m, score: careerMoveScore(state, m, personality) }))
    .sort((a, b) => b.score - a.score);

  // Search depth from planning parameter (0 = greedy, up to 5 for elite opponents)
  const depth = Math.min(5, Math.floor(personality.planning / 18));

  if (depth === 0) {
    return scored[0].move;
  }

  // Minimax over top candidates (fewer candidates at low depth = faster for weak AI)
  const candidateCount = depth <= 1 ? 5 : depth <= 3 ? 8 : 12;
  const candidates = scored.slice(0, Math.min(candidateCount, scored.length));
  let bestScore = -Infinity;
  let bestMove  = candidates[0].move;

  for (const { move } of candidates) {
    const next  = applyMoveToClone(state, move);
    const flip  = next.currentPlayer !== state.currentPlayer;
    const score = flip
      ? -careerNegamax(next, depth - 1, -Infinity, Infinity, next.currentPlayer, personality)
      :  careerNegamax(next, depth - 1, -Infinity, Infinity, state.currentPlayer, personality);
    if (score > bestScore) { bestScore = score; bestMove = move; }
  }

  return bestMove;
}

/* ── Negamax with personality-weighted eval ─────────────── */

function careerNegamax(state, depth, alpha, beta, perspective, personality) {
  if (state.phase === PHASE.GAME_OVER || depth === 0) {
    return careerStaticEval(state, perspective, personality);
  }

  const moves = getLegalMoves(state);
  if (!moves || moves.length === 0) return careerStaticEval(state, perspective, personality);

  const ordered = moves
    .map(m => ({ move: m, score: careerMoveScore(state, m, personality) }))
    .sort((a, b) => b.score - a.score);

  let best = -Infinity;

  for (const { move } of ordered) {
    const next  = applyMoveToClone(state, move);
    const flip  = next.currentPlayer !== state.currentPlayer;
    const score = flip
      ? -careerNegamax(next, depth - 1, -beta, -alpha, next.currentPlayer, personality)
      :  careerNegamax(next, depth - 1, alpha, beta, perspective, personality);

    if (score > best)  best  = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  return best;
}

/* ── Static board evaluation ─────────────────────────────── */

function careerStaticEval(state, player, personality) {
  const opp = player === HUMAN ? AI : HUMAN;
  return careerBoardHeuristic(state.boards[player], personality)
       - careerBoardHeuristic(state.boards[opp],    personality);
}

function careerBoardHeuristic(board, p) {
  let h = board.score;

  // Pattern line progress
  for (const line of board.patternLines) {
    if (!line.color) continue;
    const progress    = line.count / line.slots;
    const futureVal   = estimateFuturePlacement(board.wall, line.row, line.color);
    h += progress * futureVal * 0.7;

    // Row focus: bonus for nearly-complete rows
    const wallRow   = board.wall[line.row];
    const col       = wallColForColor(line.row, line.color);
    const rowFilled = wallRow.filter((v, c) => c !== col && v).length;
    h += (p.row_focus / 100) * rowFilled * 0.4 * progress;

    // Column focus
    let colFilled = 0;
    for (let r = 0; r < NUM_ROWS; r++) {
      if (board.wall[r][col]) colFilled++;
    }
    h += (p.column_focus / 100) * colFilled * 0.5 * progress;

    // Color focus
    let colorFilled = 0;
    for (let r = 0; r < NUM_ROWS; r++) {
      const c = wallColForColor(r, line.color);
      if (board.wall[r][c]) colorFilled++;
    }
    h += (p.color_focus / 100) * colorFilled * 0.6 * progress;
  }

  h += calculateFloorPenalty(board) * (1 + p.floor_avoidance / 100);
  h += countCompletedRows(board)    * 2.5;
  h += countCompletedColumns(board) * (7  * (0.5 + p.column_focus / 200));
  h += countCompletedColors(board)  * (10 * (0.5 + p.color_focus  / 200));

  return h;
}

/* ── Per-move scoring with personality ───────────────────── */

function careerMoveScore(state, move, p) {
  const board    = state.boards[state.currentPlayer];
  const oppIdx   = state.currentPlayer === HUMAN ? AI : HUMAN;
  const oppBoard = state.boards[oppIdx];
  let score = 0;

  if (move.row >= 0) {
    const line        = board.patternLines[move.row];
    const afterCount  = line.count + move.count;
    const completing  = afterCount >= line.slots;
    const col         = wallColForColor(move.row, move.color);

    if (completing) {
      const pts = estimateFuturePlacement(board.wall, move.row, move.color);
      score += pts;

      // Row focus: wall row already has N tiles → bonus for completing it
      const rowFilled = board.wall[move.row].filter((v, c) => c !== col && v).length;
      score += (p.row_focus / 100) * rowFilled * 0.8;

      // Column focus
      let colFilled = 0;
      for (let r = 0; r < NUM_ROWS; r++) {
        if (board.wall[r][col]) colFilled++;
      }
      score += (p.column_focus / 100) * colFilled * 1.0;

      // Color focus
      let colorFilled = 0;
      for (let r = 0; r < NUM_ROWS; r++) {
        const c = wallColForColor(r, move.color);
        if (board.wall[r][c]) colorFilled++;
      }
      score += (p.color_focus / 100) * colorFilled * 1.2;

    } else {
      const progress = afterCount / line.slots;
      score += progress * estimateFuturePlacement(board.wall, move.row, move.color) * 0.45;
    }
  }

  // Floor penalty risk
  const toFloor = move.row === -1
    ? move.count
    : Math.max(0, move.count - (move.row >= 0
        ? board.patternLines[move.row].slots - board.patternLines[move.row].count
        : 0));

  const existingFloor = board.floor.length;
  for (let i = 0; i < toFloor; i++) {
    const idx = existingFloor + i;
    if (idx < FLOOR_PENALTIES.length) {
      score += FLOOR_PENALTIES[idx] * (1 + p.floor_avoidance / 80);
    }
  }

  // First-player token risk modifier
  if (move.takesFirstToken) {
    const riskBonus = (p.risk - 50) / 100; // positive if risky personality
    score += 0.5 + riskBonus * 1.5;
    const nextIdx = existingFloor + (move.row === -1 ? move.count : toFloor);
    if (nextIdx < FLOOR_PENALTIES.length) {
      score += FLOOR_PENALTIES[nextIdx] * (1 - p.risk / 120);
    }
  }

  // Tile denial: bonus for taking what the opponent is building
  if (p.tile_denial > 20) {
    for (const line of oppBoard.patternLines) {
      if (line.color === move.color && line.count > 0) {
        const completion = line.count / line.slots;
        score += (p.tile_denial / 100) * completion * 2.5;
        break;
      }
    }
  }

  // Adaptability: bonus if opponent is about to complete a row and we can disrupt
  if (p.adaptability > 40) {
    for (let r = 0; r < NUM_ROWS; r++) {
      const oppLine = oppBoard.patternLines[r];
      if (oppLine.color === move.color && oppLine.count >= oppLine.slots - 1) {
        score += (p.adaptability / 100) * 1.5;
        break;
      }
    }
  }

  // Floor destination is always slightly penalized (except gamblers)
  if (move.row === -1) score -= (1 - p.risk / 150);

  return score;
}
