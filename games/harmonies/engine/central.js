/**
 * games/harmonies/engine/central.js
 * Token pouch (bag), central board slots, draw and refill logic.
 * Depends on: constants.js
 */

// ── Pouch ─────────────────────────────────────────────────────
function newPouch() {
  return { ...POUCH_INITIAL };
}

function pouchTotal(pouch) {
  return ALL_TOKENS.reduce((sum, t) => sum + (pouch[t] || 0), 0);
}

/**
 * Draw `count` random tokens from the pouch (without replacement).
 * Mutates pouch. Returns array of drawn token types (may be shorter than count if pouch runs low).
 */
function drawFromPouch(pouch, count) {
  const drawn = [];
  let remaining = pouchTotal(pouch);

  for (let i = 0; i < count && remaining > 0; i++) {
    let rand = Math.floor(Math.random() * remaining);
    for (const type of ALL_TOKENS) {
      if (rand < pouch[type]) {
        drawn.push(type);
        pouch[type]--;
        remaining--;
        break;
      }
      rand -= pouch[type];
    }
  }
  return drawn;
}

function clonePouch(pouch) {
  return { ...pouch };
}

// ── Central board ─────────────────────────────────────────────
/**
 * Create the central board: fill all slots by drawing from the pouch.
 * Mutates pouch.
 */
function newCentralBoard(pouch) {
  const slots = [];
  for (let i = 0; i < NUM_SLOTS; i++) {
    slots.push({ tokens: drawFromPouch(pouch, SLOT_SIZE) });
  }
  return { slots };
}

function cloneCentralBoard(central) {
  return {
    slots: central.slots.map(s => ({ tokens: [...s.tokens] })),
  };
}

/**
 * Take all tokens from a slot (returns them as an array).
 * Empties the slot in place.
 */
function takeSlot(central, slotIdx) {
  const tokens = central.slots[slotIdx].tokens;
  central.slots[slotIdx].tokens = [];
  return tokens;
}

/**
 * Refill the given slot with 3 tokens drawn from the pouch.
 * Mutates both central and pouch.
 * Returns true if fully refilled (3 tokens), false if pouch couldn't supply all 3 (end trigger).
 */
function refillSlot(central, slotIdx, pouch) {
  const drawn = drawFromPouch(pouch, SLOT_SIZE);
  central.slots[slotIdx].tokens = drawn;
  return drawn.length === SLOT_SIZE;
}
