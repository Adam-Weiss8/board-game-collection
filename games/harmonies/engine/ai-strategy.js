/**
 * games/harmonies/engine/ai-strategy.js
 * Strategy-first "brain" for the Harmonies AI (v3 rebuild).
 *
 * Encodes a strong human's winning framework as a single-agent, expected-score
 * objective. Reuses the tactical beam placer (ai-search.js), board hashing, and
 * scoring engine — this module only supplies the evaluation + card/draft decisions.
 *
 * Behind the AI_STRATEGY_V3 flag (ai-config.js). While false, none of the
 * decision functions here are called and the legacy brain (ai-evaluator.js)
 * drives play unchanged.
 *
 * Depends on: constants.js, board.js, animals.js, scoring.js, ai-config.js,
 *             ai-hasher.js, ai-evaluator.js
 *
 * Strategy model (from a strong player):
 *   1. Single-agent expected-score max — never model the opponent.
 *   2. Plan 100% around animals; focus hard on 2 cards; card 1 prefers 4+ cubes.
 *   3. Diversify HABITATS (cube-home terrain) across held cards; SHARE support terrain.
 *   4. Match terrain to hex degree (trees/small fields → corners; red → interior; river → edge).
 *   5. Token value is animal-defined; terrain is the salvage layer for "waste".
 *   6. Tempo: turns-left ≈ min empty hexes; partial progress worth P(finish) × cube value.
 */

// ── Habitat: a card's cube-home terrain ───────────────────────
// The cube always lands on the pattern's origin cell (cubeAt = {dq:0,dr:0}).
// That cell's terrain type is the animal's "habitat". Two held cards with the
// same habitat fight for the same tiles (e.g. Frog + Sting Ray both live in
// BLUE) and must not be held together.

/**
 * Terrain type of a card's cube-home (origin) cell, or null if malformed.
 * @param {object} card - an ANIMAL_CARDS entry
 * @returns {string|null} one of BLUE/YELLOW/GRAY/BROWN/GREEN/RED
 */
function habitatOf(card) {
  const origin = card.pattern.find(c => c.dq === 0 && c.dr === 0);
  return origin ? origin.type : null;
}

/** True if two cards share a cube-home terrain (they would compete for tiles). */
function sameHabitat(cardA, cardB) {
  const a = habitatOf(cardA);
  return a !== null && a === habitatOf(cardB);
}

// ── Card intrinsic value (tier) ───────────────────────────────

/**
 * Tier-based intrinsic value multiplier for a card, independent of board fit.
 * CARD_TIER / TIER_VALUE live in ai-config.js. Unlisted cards fall back to 'C'.
 * @param {object} card
 * @returns {number} multiplier (~0.55–1.0)
 */
function cardTierValue(card) {
  const tier = (typeof CARD_TIER !== 'undefined' && CARD_TIER[card.name]) || 'C';
  return (typeof TIER_VALUE !== 'undefined' && TIER_VALUE[tier]) || 0.55;
}

// ══════════════════════════════════════════════════════════════
// The functions below are STUBS wired in later iterations. They are not
// referenced anywhere while AI_STRATEGY_V3 is false, so legacy play is intact.
// ══════════════════════════════════════════════════════════════

/**
 * Expected value of a card's FUTURE cubes (those not yet placed), given the
 * turns left. Realized cubes are already counted in computeScores.animals — this
 * returns only the additional potential, so boardEvaluate doesn't double-count.
 *
 * Model: estimate how many more cubes are reachable before the game ends
 * (build cost + ~one placement each), then value the gain of reaching them.
 * If not even one more cube is reachable, give a small "getting closer" credit
 * so the beam still builds toward a pattern when it profitably can.
 *
 * @param {object} board
 * @param {object} card
 * @param {number} turnsLeft - _AI_TURNS_LEFT_HINT (Infinity = no clock)
 * @returns {number} expected additional animal points
 */
function cardCompletionEV(board, card, turnsLeft) {
  const placed = board.cubesPlaced[card.id] || 0;
  if (placed >= card.cubes) return 0;

  const immFire   = findCubePlacements(board, card).length > 0;
  const near      = immFire ? null : _findNearCompletePatterns(board, card);
  const stepsAway = immFire ? 0 : (near && near.length ? near[0].totalSteps : Infinity);

  let reachable;
  if (!isFinite(turnsLeft)) {
    reachable = card.cubes - placed; // no clock — assume completable
  } else {
    const buildCost = immFire ? 0 : (stepsAway === Infinity ? 5 : stepsAway);
    reachable = Math.floor((turnsLeft - buildCost) / 2.2) + 1;
    reachable = Math.max(0, Math.min(card.cubes - placed, reachable));
  }

  if (reachable <= 0) {
    // Can't finish even one more cube before the game ends — near-worthless,
    // but a small proximity credit keeps the beam building toward it if free.
    if (stepsAway === Infinity) return 0;
    const nextPts = card.points[card.cubes - placed - 1] || 0;
    return Math.max(0, 1 - stepsAway / 4) * nextPts * 0.2;
  }

  const target = placed + reachable;
  let gain = getCardScore(card, target) - getCardScore(card, placed);

  // Momentum: finish what you started. An in-progress or nearly-ready card gets
  // a small bonus on its next cube so the AI drives its two core cards to
  // completion rather than scattering effort into fresh terrain.
  if (immFire || stepsAway <= 1 || placed > 0) {
    gain += (card.points[card.cubes - placed - 1] || 0) * 0.25;
  }
  return gain;
}

// ── Positional shaping: match terrain to hex adjacency degree ──
// Corners (degree ≤2) suit self-sufficient scorers (trees score alone; small
// fields isolate a group-of-2). Houses/RED need 3+ neighbor types → interior
// only. Rivers (side A) want edges to grow long. Mountains are flexible.

/** Count a hex's empty on-board neighbors (candidate future cube-home tiles). */
function _openNeighbors(board, key) {
  const { q, r } = parseKey(key);
  return getNeighborKeys(q, r).filter(nk => board.hexes[nk] && board.hexes[nk].stack.length === 0).length;
}

/**
 * Token types serving as SUPPORT (non-cube-home cells) for the player's still
 * incomplete held cards. A support tile wants to sit central so it can back many
 * cube-home tiles (e.g. one central yellow feeds up to 4+ Meerkat gray cubes),
 * which overrides the generic "corner" preference for that terrain.
 */
function _v3SupportTypes(board) {
  const set = new Set();
  for (const c of (board.heldCards || [])) {
    if ((board.cubesPlaced[c.id] || 0) >= c.cubes) continue;
    for (const cell of c.pattern) {
      if (cell.dq === 0 && cell.dr === 0) continue; // origin = cube-home, not support
      set.add(cell.type);
    }
  }
  return set;
}

/**
 * Degree-matched terrain nudge on top of the real score. Signed, small magnitude.
 */
function _v3Positional(board, boardSide) {
  let s = 0;
  const support = _v3SupportTypes(board);
  for (const key of Object.keys(board.hexes)) {
    const stack = board.hexes[key].stack;
    if (stack.length === 0) continue;
    const top = stack[stack.length - 1];
    const deg = _boardDegree(board, key);
    const isCorner = deg <= 2;
    switch (top) {
      case 'GREEN':  if (isCorner) s += 0.6; break;            // trees score alone
      case 'YELLOW':
        // A yellow feeding an active card wants to be CENTRAL (many buildable
        // neighbors = more cube-homes it can back); only a pure field wants a corner.
        if (support.has('YELLOW')) s += _openNeighbors(board, key) * 0.35;
        else if (isCorner)         s += 0.4;                   // isolate the field pair
        break;
      case 'RED':
        if (isCorner)     s -= 2.0;                            // a corner house can't score
        else if (deg >= 5) s += 0.4;                           // interior suits houses
        break;
      case 'BLUE':
        if (boardSide === 'A' && deg <= 4) s += 0.25;          // rivers hug the edge
        break;
      default: break;                                          // GRAY flexible / neutral
    }
  }
  return s;
}

/**
 * Setup-terrain credit: terrain that scores 0 now but is on track to score.
 * Chiefly brown trunks awaiting a green canopy (h1 brown → 3pt tree, h2 brown →
 * 7pt tall tree). computeScores only counts realized terrain, so without this
 * the deep eval and draft undervalue building trunks early — exactly what strong
 * players do. Discounted (~half of the eventual tree) since completion isn't sure.
 */
function _v3TerrainPotential(board) {
  let p = 0;
  for (const key of Object.keys(board.hexes)) {
    const stack = board.hexes[key].stack;
    if (stack.length === 0) continue;
    const top = stack[stack.length - 1];
    if (top === 'BROWN' && canPlaceToken(board, key, 'GREEN')) {
      p += stack.length >= 2 ? 3.0 : 1.5; // tall-tree vs short-tree trajectory
    }
  }
  return p;
}

/**
 * Fast per-hex terrain proxy (no BFS) for beam pruning. Steady weights — terrain
 * is double-duty, not demoted as animals progress — plus the same positional
 * degree nudges as _v3Positional so pruning already prefers good structure.
 */
function _v3TerrainFast(board, boardSide) {
  let s = 0;
  const support = _v3SupportTypes(board);
  for (const key of Object.keys(board.hexes)) {
    const stack = board.hexes[key].stack;
    if (stack.length === 0) { s += 0.05; continue; }
    const top = stack[stack.length - 1];
    const h   = stack.length;
    const { q, r } = parseKey(key);
    const neighbors = getNeighborKeys(q, r);
    const deg = _boardDegree(board, key);
    switch (top) {
      case 'BLUE': {
        const adj = neighbors.filter(nk => getTopToken(board, nk) === 'BLUE').length;
        let v = adj > 0 ? 1.5 + adj * 0.9 : 0.15;
        if (boardSide === 'A' && deg <= 4 && adj > 0) v += 0.3; // edge river
        s += v; break;
      }
      case 'YELLOW': {
        if (support.has('YELLOW')) {
          // Feeding an active card (e.g. Meerkat): reward centrality — open
          // neighbors that can still become cube-homes → more cubes off one tile.
          const openN = neighbors.filter(nk => board.hexes[nk] && board.hexes[nk].stack.length === 0).length;
          s += 2.0 + openN * 0.5;
        } else {
          // Pure field: score once per group of ≥2, so a PAIR is ideal (not a blob).
          const adj = neighbors.filter(nk => getTopToken(board, nk) === 'YELLOW').length;
          s += (adj >= 1 ? 2.2 : 0.25) + (deg <= 2 ? 0.3 : 0);
        }
        break;
      }
      case 'GRAY': {
        const adj = neighbors.filter(nk => getTopToken(board, nk) === 'GRAY').length;
        s += adj > 0 ? (MOUNTAIN_SCORE_TABLE[h] || 0) * 0.5 + adj * 0.3 : 0.15;
        break;
      }
      case 'BROWN':
        s += h === 1 ? 0.5 : h === 2 ? 1.0 : 0; // setup for a tree
        break;
      case 'GREEN': {
        const brownCount = stack.filter(t => t === 'BROWN').length;
        s += (TREE_SCORE_TABLE[`${brownCount},1`] || 1) * 0.5 + (deg <= 2 ? 0.3 : 0);
        break;
      }
      case 'RED': {
        if (deg <= 2) { s -= 2.0; break; } // corner house — cannot score
        if (h >= 2) {
          const adjTypes = new Set(neighbors.map(nk => getTopToken(board, nk)).filter(Boolean));
          s += adjTypes.size >= 3 ? 2.5 : adjTypes.size * 0.4;
        } else s += 0.1;
        break;
      }
    }
  }
  return s;
}

/**
 * Fast beam-pruning objective (replaces animalFastScore under v3).
 * Animal term uses gentle rank multipliers so the two core cards are built in
 * PARALLEL (the legacy [10,1,…] tunnel-visioned a single card), with continuous
 * pattern-match fraction for smooth gradient toward firing. Terrain is a steady
 * co-equal contributor, not a decaying tiebreaker.
 */
function boardEvaluateFast(board, boardSide) {
  // Card 1 stays as dominant as legacy ([10]); card 2 is lifted from near-zero
  // ([1]→[6]) so the two core cards are built in PARALLEL, not one-then-the-other.
  const RANK_MULT = [10, 6, 2, 0.5];
  const sorted = [...board.heldCards].sort((a, b) => {
    const aP = (board.cubesPlaced[a.id] || 0) / Math.max(1, a.cubes) + _bestPatternMatchFraction(board, a) * 0.5;
    const bP = (board.cubesPlaced[b.id] || 0) / Math.max(1, b.cubes) + _bestPatternMatchFraction(board, b) * 0.5;
    return bP - aP;
  });

  let animal = 0;
  for (let i = 0; i < sorted.length; i++) {
    const card   = sorted[i];
    const placed = board.cubesPlaced[card.id] || 0;
    if (placed >= card.cubes) continue;
    const frac    = _bestPatternMatchFraction(board, card);
    const nextPts = card.points[card.cubes - placed - 1] || 0;
    const mult    = RANK_MULT[i] ?? 0.1;
    // Ready-to-fire super-bonus (pattern satisfied → cube next optional phase).
    animal += (frac >= 0.99 ? (nextPts * 1.5 + 15) : frac * nextPts) * mult;
  }

  // Animals dominate; terrain is a steady co-contributor (double-duty), not a
  // decaying tiebreaker like legacy.
  return animal * 2.5 + _v3TerrainFast(board, boardSide) * 0.8;
}

/**
 * Core single-agent board objective (replaces deepEvaluate under v3).
 * Returns { total, breakdown } to match the legacy contract.
 *
 *   realized score  (computeScores.total: terrain + animals already scored)
 * + future animal EV (additional reachable cubes, completion-prob discounted)
 * + interlock       (support terrain shared across ≥2 held cards)
 * − habitat collision (holding two cards on the same cube-home terrain)
 * + positional      (degree-matched terrain shaping)
 * − dead terrain  + flexibility (optionality / waste salvage)
 */
function boardEvaluate(board, boardSide, weights, tt) {
  const w = (weights && weights.futureAnimal != null) ? weights : V3_WEIGHTS;

  let hash = null;
  if (tt) {
    hash = hashBoard(board);
    const cached = tt.get(hash);
    if (cached !== undefined) return cached;
  }

  const scores = computeScores(board, boardSide);
  // Realized animals weighted above realized terrain so drafting/ranking favors
  // slots that actually score cards (not just farm terrain).
  const terrainScore = scores.trees + scores.mountains + scores.fields + scores.water + scores.buildings;
  let total = terrainScore * w.currentScore + scores.animals * (w.realizedAnimal || w.currentScore);
  const breakdown = {
    currentScore: scores.total,
    trees: scores.trees, mountains: scores.mountains, fields: scores.fields,
    water: scores.water, buildings: scores.buildings, animals: scores.animals,
  };

  // Future animal potential (turns-discounted EV of additional cubes).
  const turnsLeft = _AI_TURNS_LEFT_HINT;
  let futureAnimal = 0;
  for (const card of board.heldCards) futureAnimal += cardCompletionEV(board, card, turnsLeft);
  total += futureAnimal * w.futureAnimal;
  breakdown.futureAnimal = +(futureAnimal * w.futureAnimal).toFixed(2);

  // Interlock: hexes whose missing token advances ≥2 held cards (shared SUPPORT
  // terrain — the good kind of overlap, distinct from cube-home habitat).
  const goals  = buildGoals(board, board.heldCards);
  const shared = findSharedHabitat(goals);
  let interlock = 0;
  for (const key of shared) {
    if (board.hexes[key] && board.hexes[key].stack.length > 0) interlock++;
  }
  total += interlock * w.interlock;
  breakdown.interlock = +(interlock * w.interlock).toFixed(2);

  // Habitat collision penalty: two held cards living on the same terrain.
  const habs = board.heldCards.map(habitatOf).filter(Boolean);
  const collisions = habs.length - new Set(habs).size;
  total += collisions * w.habitatCollision;
  breakdown.habitatCollision = +(collisions * w.habitatCollision).toFixed(2);

  // Positional shaping (degree-matched terrain).
  const positional = _v3Positional(board, boardSide);
  total += positional * w.positional;
  breakdown.positional = +(positional * w.positional).toFixed(2);

  // Setup-terrain potential (brown trunks awaiting a canopy).
  const potential = _v3TerrainPotential(board);
  total += potential * (w.terrainPotential || 0);
  breakdown.terrainPotential = +(potential * (w.terrainPotential || 0)).toFixed(2);

  // Optionality / salvage: penalize dead terrain, reward preserved flexibility.
  const dead = deadTerrainPenalty(board);
  total += dead * w.deadTerrain;
  const flex = terrainFlexibility(board);
  total += flex * w.flexibility;
  breakdown.deadTerrain = +(dead * w.deadTerrain).toFixed(2);
  breakdown.flexibility = +(flex * w.flexibility).toFixed(2);

  const result = { total, breakdown };
  if (tt && hash !== null) tt.set(hash, result);
  return result;
}

/**
 * Card manager (replaces chooseBestCard when AI_STRATEGY_V3 is on).
 *
 * Encodes the human card-selection framework:
 *   - Card 1 (nothing held): reactive to the display, prefer simple high-cube
 *     "grind" cards (4+ cubes, low stack heights), weighted by tier.
 *   - Card 2 (1 held): reactive to the board; MUST use a different habitat.
 *   - Cards 3–4 (2+ held): opportunistic only — near-firing strong fits, and
 *     stop accumulating once two held cards have never fired.
 *   - Habitat diversification is a hard rule (no two held cards share a
 *     cube-home terrain), EXCEPT a free-card auto-take: a card already satisfied
 *     on the board fires a cube immediately (free points) and bypasses the rule.
 *
 * @returns {number|null} index into state.availableCards, or null to pass.
 */
function chooseCards(state, difficulty) {
  const board = state.boards[state.currentPlayer];
  if (board.heldCards.length >= 4) return null;

  const valid = state.availableCards
    .map((card, i) => ({ card, i }))
    .filter(({ card }) => card !== null);
  if (valid.length === 0) return null;

  if (difficulty === 'easy') {
    return Math.random() < 0.5 ? _randomFrom(valid).i : null;
  }

  const turnsLeft   = _AI_TURNS_LEFT_HINT;
  const totalHexes  = Object.keys(board.hexes).length;
  const emptyHexes  = emptyHexCount(board);
  const isLate      = emptyHexes <= Math.floor(totalHexes * 0.30);
  const heldCount   = board.heldCards.length;
  const heldHabitats = new Set(board.heldCards.map(habitatOf));
  const unfired     = board.heldCards.filter(c => (board.cubesPlaced[c.id] || 0) === 0).length;

  // Terrain types currently on the central display — card-1 "reactive to the
  // display" signal (prefer cards whose pattern uses the tokens that are flowing).
  const displayTypes = new Set();
  if (state.central && Array.isArray(state.central.slots)) {
    for (const slot of state.central.slots) {
      for (const t of (slot.tokens || [])) displayTypes.add(t);
    }
  }

  // Free-card auto-take: a not-yet-held card whose pattern is already satisfied
  // fires a cube immediately. Grab the highest-value one late game / when we
  // already have our 2 core cards — free points, habitat rule waived.
  const freebies = valid.filter(({ card }) =>
    (board.cubesPlaced[card.id] || 0) === 0 &&
    !heldHabitats.has(habitatOf(card)) &&     // diversify habitats even for free points
    findCubePlacements(board, card).length > 0
  );
  if (freebies.length > 0 && (isLate || heldCount >= 2)) {
    return freebies.reduce((best, cur) =>
      cur.card.points[0] > best.card.points[0] ? cur : best
    ).i;
  }

  // Score candidates.
  const scored = [];
  for (const { card, i } of valid) {
    // Habitat diversification (hard rule): no two held cards on the same terrain.
    if (heldHabitats.has(habitatOf(card))) continue;

    const immFire   = findCubePlacements(board, card).length > 0;
    const near      = immFire ? null : _findNearCompletePatterns(board, card);
    const stepsAway = immFire ? 0 : (near && near.length ? near[0].totalSteps : Infinity);

    // Reachability: skip cards that can't convert even one cube before game end.
    if (isFinite(turnsLeft)) {
      const buildCost = immFire ? 0 : (stepsAway === Infinity ? 4 : stepsAway);
      if (Math.floor((turnsLeft - buildCost) / 2.5) + 1 <= 0) continue;
    }

    const tierVal    = cardTierValue(card);
    const boardFit   = _bestPatternMatchFraction(board, card);
    const maxCellH   = Math.max(...card.pattern.map(c => c.minH));
    const heightEase = maxCellH >= 3 ? 0.55 : maxCellH >= 2 ? 0.8 : 1.0;
    const cubeFactor = card.cubes >= 4 ? 1.15 : card.cubes === 3 ? 1.0 : 0.9;

    const reqTypes = new Set(card.pattern.map(c => c.type));
    let onDisplay = 0;
    for (const t of reqTypes) if (displayTypes.has(t)) onDisplay++;
    const displayFit = reqTypes.size ? onDisplay / reqTypes.size : 0;

    const proximity = immFire ? 1.0
      : stepsAway === 1 ? 0.6
      : stepsAway === 2 ? 0.35
      : stepsAway === 3 ? 0.15 : 0.05;

    let score;
    if (heldCount === 0) {
      // Card 1: display-reactive, favor simple high-cube grind cards.
      score = tierVal * cubeFactor * heightEase * (0.55 + 0.45 * displayFit);
    } else if (heldCount === 1) {
      // Card 2: board-reactive (different habitat guaranteed above).
      score = tierVal * cubeFactor * (0.35 + 0.65 * Math.max(boardFit, proximity))
            + displayFit * 0.10 * heightEase;
    } else {
      // Cards 3/4: opportunistic, near-firing only.
      score = tierVal * (0.2 + 0.8 * proximity);
    }

    scored.push({ i, score, proximity });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  // Take/pass thresholds by card slot (patience grows with each card held).
  if (heldCount === 0) return best.score >= 0.30 ? best.i : null;
  if (heldCount === 1) return best.score >= 0.45 ? best.i : null;
  if (unfired >= 2)    return null; // stop accumulating dead cards
  // 4th card: only if it can fire immediately — avoid dead over-drafts (e.g. Koala 0/4).
  if (heldCount >= 3)  return best.proximity >= 1.0 ? best.i : null;
  return (best.proximity >= 0.6 && best.score >= 0.45) ? best.i : null; // 3rd card
}

/**
 * [Iter 4] Single-agent draft-slot pick: the slot whose best 3-token placement
 * maximizes boardEvaluate.
 */
function chooseDraftSlot(/* state, difficulty, opts */) {
  throw new Error('ai-strategy: chooseDraftSlot not implemented yet (Iter 4)');
}
