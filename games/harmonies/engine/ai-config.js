/**
 * games/harmonies/engine/ai-config.js
 * Difficulty profiles and evaluation weight constants.
 * No dependencies — must load first among AI modules.
 */

// ── Difficulty profiles ───────────────────────────────────────
// beamWidth:     0 = greedy/random (easy), >0 = beam search
// searchMs:      total time budget per turn in milliseconds
// useDeep:       whether to run DeepEvaluate on beam survivors
// rollouts:      target full-game rollouts per macro-move candidate (0 = off)
// maxCandidates: cap on macro-move candidates evaluated by rollouts
const AI_DIFFICULTY_PROFILES = {
  easy: {
    beamWidth:  0,
    searchMs:   0,
    useDeep:    false,
    rollouts:   0,
    maxCandidates: 0,
  },
  medium: {
    beamWidth:  15,
    searchMs:   700,
    useDeep:    false,
    rollouts:   0,
    maxCandidates: 0,
  },
  // Note: rollout arbitration (rollouts > 0, see ai-rollout.js) measured at
  // or below parity with the beam+deepEval path — the greedy rollout policy
  // (~56 avg self-play) is too weak to rank decisions for a ~75-level player.
  // Kept behind this knob for future experiments (e.g. with a stronger policy).
  hard: {
    beamWidth:  30,
    searchMs:   2200,
    useDeep:    true,
    rollouts:   0,
    maxCandidates: 0,
  },
  // Fast profile for headless self-play (quality ≈ medium-hard; each game ~2s)
  headless: {
    beamWidth:  8,
    searchMs:   200,
    useDeep:    false,
    rollouts:   0,
    maxCandidates: 0,
  },
  expert: {
    beamWidth:  60,
    searchMs:   5000,
    useDeep:    true,
    rollouts:   0,
    maxCandidates: 0,
  },
};

// ── Deep evaluator feature weights ───────────────────────────
// Negative weight = penalty; positive = reward.
const DEEP_EVAL_WEIGHTS = {
  currentScore:          0.8,  // reduce terrain dominance — animals drive scoring
  partialAnimalProgress: 1.2,  // was 0.5 — priority-weighted goal progress is the key signal
  sharedHabitat:         1.0,  // was 0.6 — hexes advancing ≥2 cards simultaneously are gold
  placementFlexibility:  0.15, // was 0.25 — secondary concern
  deadTerrain:          -0.35, // was -0.5 — slightly less harsh
  openExpansion:         0.05, // was 0.1 — nearly irrelevant
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

// ── Card tier list (v3 strategy brain) ────────────────────────
// Community/agreed strength ranking, keyed by card name. Drives intrinsic card
// value in ai-strategy.js (cardTierValue). Unlisted cards default to 'C'.
const CARD_TIER = {
  // S — cheap/repeatable or ride terrain you want anyway
  'Sting Ray': 'S', 'Duck': 'S', 'Ladybug': 'S', 'Eagle': 'S', 'Frog': 'S',
  // A
  'Fish': 'A', 'Lizard': 'A', 'Fennec Fox': 'A', 'Bee': 'A', 'Mouse': 'A', 'Warthog': 'A',
  // B
  'Penguin': 'B', 'Raccoon': 'B', 'Arctic Fox': 'B', 'Squirrel': 'B', 'Crow': 'B',
  'Meerkat': 'B', 'Flamingo': 'B', 'Llama': 'B', 'Peacock': 'B', 'Panther': 'B', 'Otter': 'B',
  // C — everything else (Koala, Parrot, Porcupine, Blue Bird, Bear, Bunny,
  //     Crocodile, Monkey, Bat, Wolf) falls through to the 'C' default.
};

// Tier → intrinsic value multiplier used when picking cards.
const TIER_VALUE = { S: 1.0, A: 0.85, B: 0.7, C: 0.55 };

// ── v3 board-evaluation weights ───────────────────────────────
// Objective = realized score + future animal potential + interlock
//           − habitat collision + positional shaping − dead terrain + flexibility.
// Tuned via `tune` in a later iteration; these are hand-set starting values.
const V3_WEIGHTS = {
  currentScore:     1.0,   // realized TERRAIN score (trees+mountains+fields+water+buildings)
  realizedAnimal:   2.5,   // realized ANIMAL score, weighted above terrain so decisions
                           //   favor actually scoring cards (strong-play skew)
  futureAnimal:     2.6,   // EV of additional cubes reachable before game end
  interlock:        1.4,   // support terrain shared across ≥2 held cards (efficiency:
                           //   one build fires multiple cubes → pushes cards to high tiers)
  habitatCollision: -3.0,  // penalty per pair of held cards sharing a cube-home terrain
  positional:       1.0,   // degree-matched terrain shaping (trees/fields→corners, red→interior)
  terrainPotential: 1.0,   // setup terrain not yet scoring (brown trunks awaiting a canopy)
  deadTerrain:     -0.3,   // isolated, un-growable terrain
  flexibility:      0.1,   // preserved placement options (optionality/salvage)
};

// ── v3 strategy brain toggle ──────────────────────────────────
// When true, the AI routes evaluation + card/draft decisions through
// ai-strategy.js (the rebuilt "brain"). When false, the legacy
// ai-evaluator.js path drives play unchanged. `let` so the harness / opts can
// flip it per-config for A/B matches. Enabled for the live game (v3 is ahead of
// legacy); the harness still A/Bs per-config via opts.strategyV3.
let AI_STRATEGY_V3 = true;

// Set to true to enable per-turn console debug output.
// `let` so the dev harness can flip it at runtime.
let AI_DEBUG = false;

// Set to true to skip animation delays — enables fast headless self-play.
// `let` so the self-play harness (tools/harmonies-selfplay.js) can flip it
// at runtime; the live game keeps its animation delays.
let AI_HEADLESS = false;
