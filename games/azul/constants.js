/**
 * constants.js
 * All rule constants for Azul (base game).
 * Every magic number lives here.
 * Loaded as a plain script – no import/export.
 */

/** The five tile colors in canonical order */
const COLORS = ['blue', 'yellow', 'red', 'black', 'white'];

/** Total tiles per color */
const TILES_PER_COLOR = 20;

/** Number of factory displays for a 2-player game */
const NUM_FACTORIES = 5;

/** Tiles placed on each factory at the start of a round */
const TILES_PER_FACTORY = 4;

/** Number of pattern lines (= number of wall rows) */
const NUM_ROWS = 5;

/** Number of columns on the wall */
const NUM_COLS = 5;

/** Maximum tiles in the floor line */
const FLOOR_MAX = 7;

/** Penalty values for floor positions 0-6 */
const FLOOR_PENALTIES = [-1, -1, -2, -2, -2, -3, -3];

/** End-game bonus values */
const BONUS_ROW    = 2;
const BONUS_COLUMN = 7;
const BONUS_COLOR  = 10;

/**
 * The fixed Azul wall layout.
 * WALL_PATTERN[row][col] = color that belongs in that slot.
 *
 * Row 0: Blue   Yellow Red   Black White
 * Row 1: White  Blue   Yellow Red   Black
 * Row 2: Black  White  Blue   Yellow Red
 * Row 3: Red    Black  White  Blue   Yellow
 * Row 4: Yellow Red    Black  White  Blue
 */
const WALL_PATTERN = [
  ['blue',   'yellow', 'red',   'black', 'white' ],
  ['white',  'blue',   'yellow','red',   'black' ],
  ['black',  'white',  'blue',  'yellow','red'   ],
  ['red',    'black',  'white', 'blue',  'yellow'],
  ['yellow', 'red',    'black', 'white', 'blue'  ],
];

/**
 * For a given (row, color), find which column it belongs to on the wall.
 * Returns -1 if not found.
 */
function wallColForColor(row, color) {
  return WALL_PATTERN[row].indexOf(color);
}

/** Special tile token representing the First Player marker. */
const FIRST_PLAYER_TOKEN = 'first';

/** Game phases */
const PHASE = {
  MENU:        'menu',
  DIFFICULTY:  'difficulty',
  TAKING:      'taking',
  PLACING:     'placing',
  WALL_TILING: 'wall_tiling',
  ROUND_END:   'round_end',
  GAME_OVER:   'game_over',
};

/** Player indices */
const HUMAN = 0;
const AI    = 1;

/** Returns the number of factory displays for a given player count (official Azul rule). */
function getNumFactories(numPlayers) {
  return numPlayers * 2 + 1; // 2p→5, 3p→7, 4p→9
}
