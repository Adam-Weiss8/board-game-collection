/**
 * games/yahtzee/engine/constants.js
 * Yahtzee rules constants and category metadata.
 * Vanilla-JS globals (no modules) — loaded first among engine files.
 */

const YZ_NUM_DICE   = 5;
const YZ_MAX_ROLLS  = 3;   // initial roll + 2 re-rolls
const YZ_NUM_ROUNDS = 13;  // one per scoring category

const YZ_UPPER_BONUS_THRESHOLD = 63; // upper total needed for the bonus
const YZ_UPPER_BONUS           = 35;
const YZ_YAHTZEE_BONUS         = 100; // per extra Yahtzee after the first scored 50

// Category ids, in scorecard display order.
const YZ_UPPER_CATS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const YZ_LOWER_CATS = ['threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance'];
const YZ_CATEGORIES = [...YZ_UPPER_CATS, ...YZ_LOWER_CATS];

// Per-category metadata for scoring + UI.
//   section:  'upper' | 'lower'
//   face:     upper categories — the die face they sum
//   fixed:    lower categories with a flat score (else score is derived from dice)
const YZ_CATEGORY_META = {
  ones:          { name: 'Ones',            section: 'upper', face: 1 },
  twos:          { name: 'Twos',            section: 'upper', face: 2 },
  threes:        { name: 'Threes',          section: 'upper', face: 3 },
  fours:         { name: 'Fours',           section: 'upper', face: 4 },
  fives:         { name: 'Fives',           section: 'upper', face: 5 },
  sixes:         { name: 'Sixes',           section: 'upper', face: 6 },
  threeKind:     { name: 'Three of a Kind', section: 'lower' },
  fourKind:      { name: 'Four of a Kind',  section: 'lower' },
  fullHouse:     { name: 'Full House',      section: 'lower', fixed: 25 },
  smallStraight: { name: 'Small Straight',  section: 'lower', fixed: 30 },
  largeStraight: { name: 'Large Straight',  section: 'lower', fixed: 40 },
  yahtzee:       { name: 'Yahtzee',         section: 'lower', fixed: 50 },
  chance:        { name: 'Chance',          section: 'lower' },
};
