/**
 * games/harmonies/engine/board.js
 * Personal board state, hex stack management, placement validation.
 * Depends on: constants.js
 */

// ── Coordinate helpers ────────────────────────────────────────
function hexKey(q, r) { return `${q},${r}`; }
function parseKey(k) { const [q, r] = k.split(',').map(Number); return { q, r }; }

function getNeighborKeys(q, r) {
  return HEX_DIRS.map(d => hexKey(q + d.dq, r + d.dr));
}

// ── Personal board factory ────────────────────────────────────
function newPersonalBoard(boardSide) {
  const hexList = boardSide === 'A' ? BOARD_HEXES_B : BOARD_HEXES_A;
  const hexes = {};
  hexList.forEach(({ q, r }) => {
    hexes[hexKey(q, r)] = { stack: [] };
  });
  return {
    boardSide,
    hexes,
    heldCards:   [],        // AnimalCard[] (max 4)
    cubesPlaced: {},        // { [cardId]: count }
    cubedHexes:  new Set(), // hex keys that already hold a cube marker
  };
}

function clonePersonalBoard(board) {
  const hexes = {};
  for (const [k, v] of Object.entries(board.hexes)) {
    hexes[k] = { stack: [...v.stack] };
  }
  return {
    boardSide:   board.boardSide,
    hexes,
    heldCards:   board.heldCards.map(c => ({ ...c })),
    cubesPlaced: { ...board.cubesPlaced },
    cubedHexes:  new Set(board.cubedHexes),
  };
}

// ── Placement validation ──────────────────────────────────────
/**
 * Returns true if tokenType can legally be placed on the given hex.
 *
 * Legal stacking rules:
 *   BLUE / YELLOW  — only on empty hex (h1 max, nothing stacks on them)
 *   GRAY           — on empty OR on gray (max h3)
 *   BROWN          — on empty OR on brown (max h2 bare trunk)
 *   GREEN          — on empty (standalone h1) OR on brown at any height (h2 or h3 result)
 *   RED            — on empty (standalone h1) OR on exactly one token of GRAY/BROWN/RED (h2 result)
 */
function canPlaceToken(board, key, tokenType) {
  const cell = board.hexes[key];
  if (!cell) return false;

  // A hex holding an animal cube is locked — nothing may stack on top of it.
  if (board.cubedHexes && board.cubedHexes.has(key)) return false;

  const stack = cell.stack;
  const h     = stack.length;
  const top   = stack[h - 1]; // undefined if empty

  switch (tokenType) {
    case 'BLUE':
    case 'YELLOW':
      return h === 0;

    case 'GRAY':
      return h === 0 || (top === 'GRAY' && h < 3);

    case 'BROWN':
      return h === 0 || (top === 'BROWN' && h < 2);

    case 'GREEN':
      // Standalone (empty hex) or on top of brown (any height up to 2)
      return h === 0 || (top === 'BROWN' && h <= 2);

    case 'RED':
      // Standalone (empty hex) or on exactly 1 token that is GRAY, BROWN, or RED
      return h === 0 || (h === 1 && (top === 'GRAY' || top === 'BROWN' || top === 'RED'));

    default:
      return false;
  }
}

/**
 * Returns all board hex keys where tokenType can be legally placed.
 */
function legalPlacements(board, tokenType) {
  return Object.keys(board.hexes).filter(k => canPlaceToken(board, k, tokenType));
}

/**
 * Place a token on a hex. Mutates board. Caller must check canPlaceToken first.
 */
function placeToken(board, key, tokenType) {
  board.hexes[key].stack.push(tokenType);
}

// ── Stack inspection helpers ──────────────────────────────────
function getStack(board, key) {
  return board.hexes[key] ? board.hexes[key].stack : null;
}

function getTopToken(board, key) {
  const stack = getStack(board, key);
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1];
}

function getStackHeight(board, key) {
  const stack = getStack(board, key);
  return stack ? stack.length : 0;
}

/**
 * Count empty hexes on the board.
 */
function emptyHexCount(board) {
  return Object.values(board.hexes).filter(c => c.stack.length === 0).length;
}
