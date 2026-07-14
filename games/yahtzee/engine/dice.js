/**
 * games/yahtzee/engine/dice.js
 * Dice helpers: rolling and face-count tallies.
 * Depends on: constants.js
 */

/** Random die face 1–6. */
function yzRollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

/**
 * Face counts for a dice array.
 * Returns an array indexed 1–6 (index 0 unused) so counts[3] = number of 3s.
 */
function yzCounts(dice) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  return counts;
}

/** Sum of all dice. */
function yzSum(dice) {
  return dice.reduce((a, b) => a + b, 0);
}
