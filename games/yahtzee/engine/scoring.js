/**
 * games/yahtzee/engine/scoring.js
 * Score any category for a given set of 5 dice.
 * Depends on: constants.js, dice.js
 */

/** True if the dice contain a run of `len` consecutive faces (small=4, large=5). */
function yzHasStraight(dice, len) {
  const present = new Set(dice);
  let run = 0;
  for (let face = 1; face <= 6; face++) {
    run = present.has(face) ? run + 1 : 0;
    if (run >= len) return true;
  }
  return false;
}

/** True if all five dice show the same face. */
function yzIsYahtzee(dice) {
  return yzCounts(dice).some(n => n === YZ_NUM_DICE);
}

/**
 * Strict score for a category given a dice array (no joker/bonus logic here).
 * Returns the points that category would earn — 0 if the dice don't qualify.
 */
function yzScoreCategory(cat, dice) {
  const counts = yzCounts(dice);
  const sum    = yzSum(dice);
  const meta   = YZ_CATEGORY_META[cat];

  if (meta && meta.section === 'upper') {
    return counts[meta.face] * meta.face;
  }

  switch (cat) {
    case 'threeKind':     return counts.some(n => n >= 3) ? sum : 0;
    case 'fourKind':      return counts.some(n => n >= 4) ? sum : 0;
    case 'fullHouse':     return (counts.includes(3) && counts.includes(2)) ? 25 : 0;
    case 'smallStraight': return yzHasStraight(dice, 4) ? 30 : 0;
    case 'largeStraight': return yzHasStraight(dice, 5) ? 40 : 0;
    case 'yahtzee':       return yzIsYahtzee(dice) ? 50 : 0;
    case 'chance':        return sum;
    default:              return 0;
  }
}

/**
 * Score every still-open category for the given dice.
 * @param {object} scores - map of cat -> number|null (null = open)
 * @param {number[]} dice
 * @returns {object} map of open cat -> points it would earn now
 */
function yzOpenCategoryScores(scores, dice) {
  const out = {};
  for (const cat of YZ_CATEGORIES) {
    if (scores[cat] == null) out[cat] = yzScoreCategory(cat, dice);
  }
  return out;
}

// ── Section / grand totals ────────────────────────────────────

function yzUpperSubtotal(scores) {
  return YZ_UPPER_CATS.reduce((s, c) => s + (scores[c] || 0), 0);
}

function yzUpperBonus(scores) {
  return yzUpperSubtotal(scores) >= YZ_UPPER_BONUS_THRESHOLD ? YZ_UPPER_BONUS : 0;
}

function yzLowerSubtotal(scores) {
  return YZ_LOWER_CATS.reduce((s, c) => s + (scores[c] || 0), 0);
}

/** Grand total including upper bonus and any accumulated Yahtzee bonus. */
function yzGrandTotal(scores, yahtzeeBonus) {
  return yzUpperSubtotal(scores) + yzUpperBonus(scores)
       + yzLowerSubtotal(scores) + (yahtzeeBonus || 0);
}
