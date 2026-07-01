/**
 * games/harmonies/engine/ai-config.js
 * Difficulty profiles and evaluation weight constants.
 * No dependencies — must load first among AI modules.
 */

// ── Difficulty profiles ───────────────────────────────────────
// beamWidth: 0 = greedy/random (easy), >0 = beam search
// searchMs:  total time budget per turn in milliseconds
// useDeep:   whether to run DeepEvaluate on beam survivors
// monteCarlo: whether to run MC rollouts for draft selection (expert only)
// mcRollouts: rollouts per candidate slot in Monte Carlo
const AI_DIFFICULTY_PROFILES = {
  easy: {
    beamWidth:  0,
    searchMs:   0,
    useDeep:    false,
    monteCarlo: false,
    mcRollouts: 0,
  },
  medium: {
    beamWidth:  15,
    searchMs:   700,
    useDeep:    false,
    monteCarlo: false,
    mcRollouts: 0,
  },
  hard: {
    beamWidth:  30,
    searchMs:   2200,
    useDeep:    true,
    monteCarlo: false,
    mcRollouts: 0,
  },
  expert: {
    beamWidth:  60,
    searchMs:   4500,
    useDeep:    true,
    monteCarlo: true,
    mcRollouts: 20,
  },
};

// ── Deep evaluator feature weights ───────────────────────────
// Negative weight = penalty; positive = reward.
const DEEP_EVAL_WEIGHTS = {
  currentScore:          1.0,  // actual computed terrain + animal score
  partialAnimalProgress: 0.5,  // progress toward held card goals
  sharedHabitat:         0.6,  // hexes that count toward ≥2 goals
  placementFlexibility:  0.25, // how many token types can still go on empty hexes
  deadTerrain:          -0.5,  // isolated terrain that cannot grow or score
  openExpansion:         0.1,  // raw count of empty hexes (future options)
};

// ── Archetype project-weight overrides ────────────────────────
// Used in career personality mode to bias which terrain the AI favors.
const ARCHETYPE_PROJECT_WEIGHTS = {
  collector:    { PATTERN_ADVANCE: 1.9, ANIMAL_CUBE: 1.6, FIELD: 0.7, MOUNTAIN: 0.7 },
  builder:      { TREE_CLUSTER: 1.7, MOUNTAIN: 1.5, WATER_CHAIN: 0.8 },
  perfectionist:{ FIELD: 1.2, MOUNTAIN: 1.2, TREE_CLUSTER: 1.1, WATER_CHAIN: 1.1 },
  gambler:      { PATTERN_ADVANCE: 1.4, ANIMAL_CUBE: 1.8, FIELD: 0.7 },
  sprinter:     { FIELD: 1.4, WATER_CHAIN: 1.3, TREE_CLUSTER: 0.8 },
  opportunist:  { FIELD: 1.2, WATER_CHAIN: 1.2 },
};

// Set to true to enable per-turn console debug output.
const AI_DEBUG = false;
