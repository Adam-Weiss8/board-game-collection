/**
 * scoring.js
 * Official Azul scoring rules – decoupled from UI.
 * Depends on: constants.js, board.js
 */

function scoreTilePlacement(wall, row, col) {
  const hLen = countHorizontal(wall, row, col);
  const vLen = countVertical(wall, row, col);

  if (hLen === 1 && vLen === 1) return 1;
  if (hLen > 1 && vLen === 1)  return hLen;
  if (hLen === 1 && vLen > 1)  return vLen;
  return hLen + vLen;
}

function countHorizontal(wall, row, col) {
  let count = 1;
  for (let c = col - 1; c >= 0 && wall[row][c]; c--) count++;
  for (let c = col + 1; c < NUM_COLS && wall[row][c]; c++) count++;
  return count;
}

function countVertical(wall, row, col) {
  let count = 1;
  for (let r = row - 1; r >= 0 && wall[r][col]; r--) count++;
  for (let r = row + 1; r < NUM_ROWS && wall[r][col]; r++) count++;
  return count;
}

function scoreWallTilingEvents(wall, events) {
  return events.map(({ row, col, color }) => {
    const points = scoreTilePlacement(wall, row, col);
    return { row, col, color, points };
  });
}

function calcFloorPenalty(board) {
  return calculateFloorPenalty(board);
}

function computeEndGameBonuses(board) {
  const rows    = countCompletedRows(board);
  const columns = countCompletedColumns(board);
  const colors  = countCompletedColors(board);
  return {
    rows,
    columns,
    colors,
    total: rows * BONUS_ROW + columns * BONUS_COLUMN + colors * BONUS_COLOR,
  };
}

function estimateFuturePlacement(wall, row, color) {
  const col = wallColForColor(row, color);

  wall[row][col] = true;
  const baseScore = scoreTilePlacement(wall, row, col);
  wall[row][col] = false;

  const colFilled  = wall.filter(r => r[col]).length + 1;
  const colBonus   = colFilled === NUM_ROWS ? BONUS_COLUMN : colFilled * 0.6;

  let colorCount = 0;
  for (let r = 0; r < NUM_ROWS; r++) {
    const c = wallColForColor(r, color);
    if (wall[r][c]) colorCount++;
  }
  colorCount++;
  const colorBonus = colorCount === NUM_ROWS ? BONUS_COLOR : colorCount * 0.8;

  const rowFilled = wall[row].filter(Boolean).length + 1;
  const rowBonus  = rowFilled === NUM_COLS ? BONUS_ROW : rowFilled * 0.3;

  return baseScore + colBonus * 0.25 + colorBonus * 0.2 + rowBonus * 0.15;
}
