/**
 * bag.js
 * Manages the tile bag and the discard (lid) pile.
 * Depends on: constants.js (COLORS, TILES_PER_COLOR)
 */

function createBag() {
  const bag = [];
  for (const color of COLORS) {
    for (let i = 0; i < TILES_PER_COLOR; i++) {
      bag.push(color);
    }
  }
  shuffle(bag);
  return { bag, discard: [] };
}

function drawTiles(bagState, count) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (bagState.bag.length === 0) {
      if (bagState.discard.length === 0) break;
      refillBagFromDiscard(bagState);
    }
    drawn.push(bagState.bag.pop());
  }
  return drawn;
}

function discardTiles(bagState, tiles) {
  for (const t of tiles) bagState.discard.push(t);
}

function refillBagFromDiscard(bagState) {
  bagState.bag.push(...bagState.discard);
  bagState.discard = [];
  shuffle(bagState.bag);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function totalTilesAvailable(bagState) {
  return bagState.bag.length + bagState.discard.length;
}

function cloneBag(bagState) {
  return {
    bag:     [...bagState.bag],
    discard: [...bagState.discard],
  };
}
