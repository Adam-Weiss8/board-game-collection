/**
 * games/harmonies/engine/animals.js
 * Animal card definitions and pattern-matching algorithm.
 * Depends on: constants.js, board.js
 */

// ── Card data (entered via editor) ───────────────────────────
const ANIMAL_CARDS = [
  {
    "id": "otter-0",
    "name": "Otter",
    "cubes": 3,
    "points": [16, 10, 5],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -2, "dr": 0, "type": "GREEN", "minH": 1, "maxH": 1},
      {"dq": -1, "dr": 0, "type": "GREEN", "minH": 1, "maxH": 1},
      {"dq":  0, "dr": 0, "type": "BLUE",  "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "warthog-1",
    "name": "Warthog",
    "cubes": 3,
    "points": [13, 8, 4],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -1, "dr": 0, "type": "RED",   "minH": 2, "maxH": 2},
      {"dq":  0, "dr": 0, "type": "GREEN",  "minH": 2, "maxH": 2}
    ]
  },
  {
    "id": "parrot-2",
    "name": "Parrot",
    "cubes": 3,
    "points": [14, 9, 4],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -1, "dr": 0, "type": "BLUE",  "minH": 1, "maxH": 1},
      {"dq": -1, "dr": 1, "type": "BLUE",  "minH": 1, "maxH": 1},
      {"dq":  0, "dr": 0, "type": "GREEN", "minH": 2, "maxH": 2}
    ]
  },
  {
    "id": "koala-3",
    "name": "Koala",
    "cubes": 4,
    "points": [15, 10, 6, 3],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -1, "dr": 0, "type": "GREEN", "minH": 1, "maxH": 1},
      {"dq":  0, "dr": 0, "type": "GREEN", "minH": 2, "maxH": 2}
    ]
  },
  {
    "id": "flamingo-4",
    "name": "Flamingo",
    "cubes": 3,
    "points": [16, 10, 4],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -1, "dr": 0, "type": "YELLOW", "minH": 1, "maxH": 1},
      {"dq": -1, "dr": 1, "type": "YELLOW", "minH": 1, "maxH": 1},
      {"dq":  0, "dr": 0, "type": "BLUE",   "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "porcupine-5",
    "name": "Porcupine",
    "cubes": 2,
    "points": [12, 5],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -1, "dr": 0, "type": "GREEN", "minH": 2, "maxH": 2},
      {"dq": -1, "dr": 1, "type": "GREEN", "minH": 2, "maxH": 2},
      {"dq":  0, "dr": 0, "type": "RED",   "minH": 2, "maxH": 2}
    ]
  },
  {
    "id": "peacock-6",
    "name": "Peacock",
    "cubes": 3,
    "points": [17, 10, 5],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq":  0, "dr":  0, "type": "RED",  "minH": 2, "maxH": 2},
      {"dq":  1, "dr": -1, "type": "BLUE", "minH": 1, "maxH": 1},
      {"dq":  0, "dr":  1, "type": "BLUE", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "ladybug-7",
    "name": "Ladybug",
    "cubes": 5,
    "points": [17, 12, 8, 5, 2],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -1, "dr": 0, "type": "GREEN",  "minH": 1, "maxH": 1},
      {"dq":  0, "dr": 0, "type": "YELLOW", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "duck-8",
    "name": "Duck",
    "cubes": 4,
    "points": [13, 8, 4, 2],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -1, "dr": 0, "type": "RED",  "minH": 2, "maxH": 2},
      {"dq":  0, "dr": 0, "type": "BLUE", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "sting-ray-9",
    "name": "Sting Ray",
    "cubes": 3,
    "points": [16, 10, 4],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -1, "dr": 1, "type": "GRAY", "minH": 1, "maxH": 1},
      {"dq": -1, "dr": 0, "type": "GRAY", "minH": 1, "maxH": 1},
      {"dq":  0, "dr": 0, "type": "BLUE", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "mouse-10",
    "name": "Mouse",
    "cubes": 3,
    "points": [17, 10, 5],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq":  0, "dr":  0, "type": "RED",    "minH": 2, "maxH": 2},
      {"dq": -1, "dr":  1, "type": "YELLOW", "minH": 1, "maxH": 1},
      {"dq":  1, "dr":  0, "type": "YELLOW", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "bee-11",
    "name": "Bee",
    "cubes": 2,
    "points": [18, 8],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -1, "dr":  0, "type": "YELLOW", "minH": 1, "maxH": 1},
      {"dq":  0, "dr": -1, "type": "YELLOW", "minH": 1, "maxH": 1},
      {"dq":  1, "dr": -1, "type": "YELLOW", "minH": 1, "maxH": 1},
      {"dq":  0, "dr":  0, "type": "GREEN",  "minH": 2, "maxH": 2}
    ]
  },
  {
    "id": "penguin-12",
    "name": "Penguin",
    "cubes": 3,
    "points": [16, 10, 4],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq":  0, "dr":  0, "type": "GRAY", "minH": 1, "maxH": 1},
      {"dq":  1, "dr":  0, "type": "BLUE", "minH": 1, "maxH": 1},
      {"dq": -1, "dr":  1, "type": "BLUE", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "blue-bird-13",
    "name": "Blue Bird",
    "cubes": 3,
    "points": [18, 11, 5],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq":  0, "dr":  0, "type": "GREEN", "minH": 3, "maxH": 3},
      {"dq":  1, "dr": -1, "type": "BLUE",  "minH": 1, "maxH": 1},
      {"dq":  0, "dr":  1, "type": "BLUE",  "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "llama-14",
    "name": "Llama",
    "cubes": 2,
    "points": [12, 5],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq":  0, "dr":  0, "type": "YELLOW", "minH": 1, "maxH": 1},
      {"dq":  0, "dr": -1, "type": "YELLOW", "minH": 1, "maxH": 1},
      {"dq":  0, "dr": -2, "type": "GRAY",   "minH": 2, "maxH": 2}
    ]
  },
  {
    "id": "lizard-15",
    "name": "Lizard",
    "cubes": 3,
    "points": [16, 10, 5],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq":  0, "dr": 0, "type": "RED",    "minH": 2, "maxH": 2},
      {"dq": -1, "dr": 0, "type": "YELLOW", "minH": 1, "maxH": 1},
      {"dq": -2, "dr": 0, "type": "YELLOW", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "bear-16",
    "name": "Bear",
    "cubes": 2,
    "points": [11, 5],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -1, "dr": 1, "type": "GRAY",  "minH": 2, "maxH": 2},
      {"dq": -1, "dr": 0, "type": "GRAY",  "minH": 2, "maxH": 2},
      {"dq":  0, "dr": 0, "type": "GREEN", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "fish-17",
    "name": "Fish",
    "cubes": 4,
    "points": [16, 10, 6, 3],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -1, "dr": 0, "type": "GRAY", "minH": 3, "maxH": 3},
      {"dq":  0, "dr": 0, "type": "BLUE", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "bunny-18",
    "name": "Bunny",
    "cubes": 3,
    "points": [17, 10, 5],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq":  0, "dr":  0, "type": "GREEN", "minH": 1, "maxH": 1},
      {"dq":  0, "dr": -1, "type": "GREEN", "minH": 1, "maxH": 1},
      {"dq":  0, "dr": -2, "type": "RED",   "minH": 2, "maxH": 2}
    ]
  },
  {
    "id": "squirrel-19",
    "name": "Squirrel",
    "cubes": 3,
    "points": [15, 9, 4],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq":  0, "dr":  0, "type": "RED",   "minH": 2, "maxH": 2},
      {"dq":  0, "dr": -1, "type": "GREEN", "minH": 3, "maxH": 3}
    ]
  },
  {
    "id": "crocodile-20",
    "name": "Crocodile",
    "cubes": 3,
    "points": [15, 9, 4],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -2, "dr": 0, "type": "GREEN", "minH": 3, "maxH": 3},
      {"dq": -1, "dr": 0, "type": "BLUE",  "minH": 1, "maxH": 1},
      {"dq":  0, "dr": 0, "type": "BLUE",  "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "eagle-21",
    "name": "Eagle",
    "cubes": 2,
    "points": [11, 5],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": 0, "dr": 0, "type": "GRAY",   "minH": 3, "maxH": 3},
      {"dq": 1, "dr": 0, "type": "YELLOW", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "monkey-22",
    "name": "Monkey",
    "cubes": 2,
    "points": [11, 5],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": 0, "dr": 0, "type": "GRAY", "minH": 2, "maxH": 2},
      {"dq": 0, "dr": 1, "type": "BLUE", "minH": 1, "maxH": 1},
      {"dq": 1, "dr": 0, "type": "BLUE", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "meerkat-23",
    "name": "Meerkat",
    "cubes": 4,
    "points": [14, 9, 5, 2],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": 0, "dr": 0, "type": "GRAY",   "minH": 1, "maxH": 1},
      {"dq": 1, "dr": 0, "type": "YELLOW", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "frog-24",
    "name": "Frog",
    "cubes": 5,
    "points": [15, 10, 6, 4, 2],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": 0, "dr": 0, "type": "BLUE",  "minH": 1, "maxH": 1},
      {"dq": 1, "dr": 0, "type": "GREEN", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "panther-25",
    "name": "Panther",
    "cubes": 2,
    "points": [11, 5],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq":  0, "dr":  0, "type": "YELLOW", "minH": 1, "maxH": 1},
      {"dq":  0, "dr": -1, "type": "GREEN",  "minH": 2, "maxH": 2},
      {"dq":  0, "dr": -2, "type": "GREEN",  "minH": 2, "maxH": 2}
    ]
  },
  {
    "id": "bat-26",
    "name": "Bat",
    "cubes": 4,
    "points": [15, 10, 6, 3],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -1, "dr": 0, "type": "GREEN", "minH": 3, "maxH": 3},
      {"dq":  0, "dr": 0, "type": "GRAY",  "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "crow-27",
    "name": "Crow",
    "cubes": 2,
    "points": [9, 4],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq":  0, "dr": 0, "type": "YELLOW", "minH": 1, "maxH": 1},
      {"dq": -1, "dr": 1, "type": "RED",    "minH": 2, "maxH": 2},
      {"dq":  1, "dr": 0, "type": "RED",    "minH": 2, "maxH": 2}
    ]
  },
  {
    "id": "fennec-fox-28",
    "name": "Fennec Fox",
    "cubes": 3,
    "points": [16, 9, 4],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq":  0, "dr":  0, "type": "GRAY",   "minH": 1, "maxH": 1},
      {"dq":  0, "dr": -1, "type": "GRAY",   "minH": 1, "maxH": 1},
      {"dq":  0, "dr": -2, "type": "YELLOW", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "arctic-fox-29",
    "name": "Arctic Fox",
    "cubes": 3,
    "points": [17, 10, 5],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": -1, "dr": 1, "type": "GREEN",  "minH": 2, "maxH": 2},
      {"dq":  1, "dr": 0, "type": "GREEN",  "minH": 2, "maxH": 2},
      {"dq":  0, "dr": 0, "type": "YELLOW", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "wolf-30",
    "name": "Wolf",
    "cubes": 3,
    "points": [16, 10, 4],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq": 0, "dr":  0, "type": "GREEN",  "minH": 3, "maxH": 3},
      {"dq": 1, "dr": -1, "type": "YELLOW", "minH": 1, "maxH": 1},
      {"dq": 1, "dr":  0, "type": "YELLOW", "minH": 1, "maxH": 1}
    ]
  },
  {
    "id": "raccoon-31",
    "name": "Raccoon",
    "cubes": 2,
    "points": [12, 6],
    "cubeAt": {"dq": 0, "dr": 0},
    "pattern": [
      {"dq":  0, "dr": 0, "type": "YELLOW", "minH": 1, "maxH": 1},
      {"dq": -1, "dr": 1, "type": "BLUE",   "minH": 1, "maxH": 1},
      {"dq":  0, "dr": 1, "type": "BLUE",   "minH": 1, "maxH": 1},
      {"dq":  1, "dr": 0, "type": "BLUE",   "minH": 1, "maxH": 1}
    ]
  }
];

// ── Pattern matching ──────────────────────────────────────────

/**
 * Rotate a pattern offset 60° clockwise in axial coordinates.
 * Applying 6 times returns to the original.
 */
function rotateOffset(dq, dr) {
  return { dq: -dr, dr: dq + dr };
}

function rotatePattern(pattern) {
  return pattern.map(({ dq, dr, ...rest }) => {
    const rot = rotateOffset(dq, dr);
    return { dq: rot.dq, dr: rot.dr, ...rest };
  });
}

/**
 * Returns all 6 rotations of a pattern (including 0°).
 */
function allRotations(pattern) {
  const rotations = [];
  let cur = pattern;
  for (let i = 0; i < 6; i++) {
    rotations.push(cur);
    cur = rotatePattern(cur);
  }
  return rotations;
}

/**
 * Check if a rotated pattern is satisfied with its origin at board hex (q, r).
 * Each pattern cell specifies type, minH, maxH.
 */
function patternMatchesAt(board, q, r, pattern) {
  for (const cell of pattern) {
    const key = hexKey(q + cell.dq, r + cell.dr);
    const hex = board.hexes[key];
    if (!hex) return false;
    const h   = hex.stack.length;
    const top = hex.stack[h - 1];
    if (h < cell.minH || h > cell.maxH) return false;
    if (top !== cell.type) return false;
  }
  return true;
}

/**
 * Find all board hex positions where a cube for this card could be placed.
 * Returns array of hex keys. The cube goes at the matched origin (cubeAt = {dq:0,dr:0}).
 * Already-cubed hexes are excluded.
 */
function findCubePlacements(board, card) {
  if ((board.cubesPlaced[card.id] || 0) >= card.cubes) return []; // card full

  const rotations = allRotations(card.pattern);
  const results   = [];

  for (const key of Object.keys(board.hexes)) {
    if (board.cubedHexes.has(key)) continue; // hex already holds a cube

    const { q, r } = parseKey(key);
    for (const rotation of rotations) {
      if (patternMatchesAt(board, q, r, rotation)) {
        results.push(key);
        break; // only count each hex once (regardless of rotation)
      }
    }
  }
  return results;
}

/**
 * Place a cube for a card on the given hex. Mutates board.
 */
function placeCube(board, cardId, key) {
  board.cubesPlaced[cardId] = (board.cubesPlaced[cardId] || 0) + 1;
  board.cubedHexes.add(key);
}

/**
 * Score for an animal card given how many cubes have been placed.
 * The card's point values run highest → lowest (e.g. [16,10,5] for 3 cubes).
 * Score = the value at the highest filled position.
 */
function getCardScore(card, cubesPlaced) {
  if (!cubesPlaced) return 0;
  return card.points[card.cubes - cubesPlaced];
}
