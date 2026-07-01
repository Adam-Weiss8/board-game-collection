/**
 * board.js
 * Player board state: pattern lines, wall, floor line, score.
 * Depends on: constants.js
 */

function createBoard() {
  return {
    patternLines: Array.from({ length: NUM_ROWS }, (_, i) => ({
      row:   i,
      slots: i + 1,
      color: null,
      count: 0,
    })),
    wall:  Array.from({ length: NUM_ROWS }, () => new Array(NUM_COLS).fill(false)),
    floor: [],
    score: 0,
  };
}

function canPlaceOnRow(board, row, color) {
  const line = board.patternLines[row];
  if (line.count === line.slots) return false;
  if (line.color !== null && line.color !== color) return false;
  const col = wallColForColor(row, color);
  if (board.wall[row][col]) return false;
  return true;
}

function legalDestinations(board, color) {
  const dests = [];
  for (let r = 0; r < NUM_ROWS; r++) {
    if (canPlaceOnRow(board, r, color)) dests.push(r);
  }
  dests.push(-1); // floor is always legal
  return dests;
}

function placeTilesOnRow(board, row, color, count) {
  let overflow = count;
  if (row >= 0) {
    const line   = board.patternLines[row];
    const canAdd = line.slots - line.count;
    const placed = Math.min(count, canAdd);
    overflow = count - placed;
    line.color  = color;
    line.count += placed;
  }
  addToFloor(board, color, overflow);
  return overflow;
}

function addToFloor(board, color, count) {
  let accepted = 0;
  for (let i = 0; i < count; i++) {
    if (board.floor.length < FLOOR_MAX) {
      board.floor.push(color);
      accepted++;
    }
  }
  return accepted;
}

function calculateFloorPenalty(board) {
  let penalty = 0;
  for (let i = 0; i < board.floor.length; i++) penalty += FLOOR_PENALTIES[i];
  return penalty;
}

function clearFloor(board) {
  const hasFirstToken = board.floor.includes(FIRST_PLAYER_TOKEN);
  const discarded     = board.floor.filter(t => t !== FIRST_PLAYER_TOKEN);
  board.floor = [];
  return { discarded, hasFirstToken };
}

function placeOnWall(board, row, col) {
  board.wall[row][col] = true;
}

function isWallFilled(board, row, col) {
  return board.wall[row][col];
}

function hasCompletedRow(board) {
  return board.wall.some(row => row.every(slot => slot));
}

function countCompletedRows(board) {
  return board.wall.filter(row => row.every(s => s)).length;
}

function countCompletedColumns(board) {
  let count = 0;
  for (let c = 0; c < NUM_COLS; c++) {
    if (board.wall.every(row => row[c])) count++;
  }
  return count;
}

function countCompletedColors(board) {
  let count = 0;
  for (let colorIdx = 0; colorIdx < 5; colorIdx++) {
    const color = COLORS[colorIdx];
    let all = true;
    for (let r = 0; r < NUM_ROWS; r++) {
      const c = wallColForColor(r, color);
      if (!board.wall[r][c]) { all = false; break; }
    }
    if (all) count++;
  }
  return count;
}

function resolveWallTiling(board) {
  const events = [];
  for (let r = 0; r < NUM_ROWS; r++) {
    const line = board.patternLines[r];
    if (line.count < line.slots) continue;

    const color = line.color;
    const col   = wallColForColor(r, color);
    board.wall[r][col] = true;

    // Score immediately after placing (before next tile), per official rules
    const points    = scoreTilePlacement(board.wall, r, col);
    const discarded = new Array(line.count - 1).fill(color);
    events.push({ row: r, col, color, discarded, points });

    line.color = null;
    line.count = 0;
  }
  return events;
}

function applyScore(board, delta) {
  board.score = Math.max(0, board.score + delta);
}

function cloneBoard(board) {
  return {
    patternLines: board.patternLines.map(l => ({ ...l })),
    wall:         board.wall.map(row => [...row]),
    floor:        [...board.floor],
    score:        board.score,
  };
}
