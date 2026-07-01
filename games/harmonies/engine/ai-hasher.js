/**
 * games/harmonies/engine/ai-hasher.js
 * Board hashing and transposition table for search caching.
 * Depends on: (none — uses only primitives)
 */

const _TOKEN_HASH_NUMS = { BLUE: 1, YELLOW: 2, GRAY: 3, BROWN: 4, GREEN: 5, RED: 6 };

/**
 * Compute a fast 32-bit hash of a personal board's stack state.
 * Not incremental, but O(hexes × max_height) — runs in <0.1ms on a 25-hex board.
 * Used as a transposition table key to avoid re-evaluating identical positions.
 */
function hashBoard(board) {
  let h = 0;
  for (const [key, { stack }] of Object.entries(board.hexes)) {
    if (stack.length === 0) continue;
    const comma = key.indexOf(',');
    const qv = parseInt(key.slice(0, comma), 10);
    const rv = parseInt(key.slice(comma + 1), 10);
    const baseK = (qv * 31 + rv * 17) | 0;
    for (let i = 0; i < stack.length; i++) {
      const v = _TOKEN_HASH_NUMS[stack[i]] || 0;
      // Multiply-xor mix (Knuth-style)
      h = (Math.imul(h ^ ((baseK + i * 37) | 0), 0x9e3779b9) + v) | 0;
    }
  }
  return h;
}

/**
 * Fixed-size transposition table backed by a Map.
 * Evicts the oldest entry (insertion-order) when full.
 */
class TranspositionTable {
  constructor(maxSize = 6000) {
    this._map    = new Map();
    this._maxSize = maxSize;
  }

  get(hash) {
    return this._map.get(hash);
  }

  set(hash, value) {
    if (this._map.size >= this._maxSize) {
      // Evict oldest — Maps preserve insertion order
      this._map.delete(this._map.keys().next().value);
    }
    this._map.set(hash, value);
  }

  clear() { this._map.clear(); }

  get size() { return this._map.size; }
}
