/**
 * games/harmonies/engine/constants.js
 * Token types, stacking rules, scoring tables, board hex coordinates.
 */

// ── Token types ──────────────────────────────────────────────
const TOKEN = {
  BLUE:   'BLUE',
  YELLOW: 'YELLOW',
  GRAY:   'GRAY',
  BROWN:  'BROWN',
  GREEN:  'GREEN',
  RED:    'RED',
};

const ALL_TOKENS = ['BLUE', 'YELLOW', 'GRAY', 'BROWN', 'GREEN', 'RED'];

// ── Pouch (120 tokens total) ──────────────────────────────────
const POUCH_INITIAL = {
  BLUE:   23,
  YELLOW: 19,
  GRAY:   23,
  BROWN:  21,
  GREEN:  19,
  RED:    15,
};

// ── Central board ─────────────────────────────────────────────
const SLOT_SIZE  = 3; // tokens per slot
const NUM_SLOTS  = 5; // always 5 groups regardless of player count

// ── Board hex coordinates (axial, flat-top) ───────────────────
const BOARD_HEXES_A = [
  {q:-1,r:1},{q:-1,r:2},{q:-1,r:3},{q:-1,r:4},
  {q:0,r:1},{q:0,r:2},{q:0,r:3},
  {q:1,r:0},{q:1,r:1},{q:1,r:2},{q:1,r:3},
  {q:2,r:0},{q:2,r:1},{q:2,r:2},
  {q:3,r:-1},{q:3,r:0},{q:3,r:1},{q:3,r:2},
  {q:4,r:-1},{q:4,r:0},{q:4,r:1},
  {q:5,r:-2},{q:5,r:-1},{q:5,r:0},{q:5,r:1},
]; // 25 hexes — Side A (Blue board)

const BOARD_HEXES_B = [
  {q:0,r:0},{q:0,r:1},{q:0,r:2},{q:0,r:3},{q:0,r:4},
  {q:1,r:0},{q:1,r:1},{q:1,r:2},{q:1,r:3},
  {q:2,r:-1},{q:2,r:0},{q:2,r:1},{q:2,r:2},{q:2,r:3},
  {q:3,r:-1},{q:3,r:0},{q:3,r:1},{q:3,r:2},
  {q:4,r:-2},{q:4,r:-1},{q:4,r:0},{q:4,r:1},{q:4,r:2},
]; // 23 hexes — Side B (Brown board)

// ── Hex adjacency (flat-top axial) ───────────────────────────
const HEX_DIRS = [
  {dq:1,dr:0}, {dq:-1,dr:0},
  {dq:0,dr:1}, {dq:0,dr:-1},
  {dq:1,dr:-1},{dq:-1,dr:1},
];

// ── Scoring tables ────────────────────────────────────────────

// Trees — points per hex based on stack composition.
// key: `${brownCount},${hasGreen ? 1 : 0}`
const TREE_SCORE_TABLE = {
  '0,0': 0, // empty or non-tree tokens
  '1,0': 0, // single brown trunk (no top)
  '2,0': 0, // two brown trunks (no top)
  '0,1': 1, // standalone green h1 (bush)
  '1,1': 3, // green on 1 brown h2 (short tree)
  '2,1': 7, // green on 2 brown h3 (tall tree)
};

// Mountains — points per gray hex by stack height, only if adjacent gray exists.
const MOUNTAIN_SCORE_TABLE = { 1: 1, 2: 3, 3: 7 };

// Water — Side A river scoring table (key = number of tiles in longest path).
// For lengths > 9: 27 + (length - 9) * 4  (handled in scoring.js).
const WATER_SCORE_TABLE = { 1: 0, 2: 2, 3: 5, 4: 8, 5: 11, 6: 15, 7: 19, 8: 23, 9: 27 };

// Fields — each connected group of ≥2 yellow hexes scores this.
const FIELD_GROUP_SCORE = 5;

// Buildings — red token scores this if ≥3 distinct token types are adjacent.
const BUILDING_SCORE         = 5;
const BUILDING_MIN_DIVERSITY = 3;
