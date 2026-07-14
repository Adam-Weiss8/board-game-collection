/**
 * games/yahtzee/engine/ai.js
 * Yahtzee AI: keep-dice and category decisions across 4 difficulty levels.
 * Depends on: constants.js, dice.js, scoring.js, game.js
 *
 * Core idea (hard/expert): value a position by the expected best "turn value"
 * reachable with the rerolls remaining, computed by a DP over dice multisets.
 * Category choice uses each roll's surplus over a category "par" so good rolls
 * bank where they most exceed the norm, and forced zeros sacrifice the least.
 */

// Rough achievable value per category — the "par" a decent roll should beat.
const YZ_PAR = {
  ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
  threeKind: 21, fourKind: 19, fullHouse: 22, smallStraight: 28,
  largeStraight: 25, yahtzee: 20, chance: 22,
};

const _yzFact = [1, 1, 2, 6, 24, 120];

// ── Dice-multiset helpers (counts[1..6]) ──────────────────────
function yzCountsToDice(counts) {
  const d = [];
  for (let f = 1; f <= 6; f++) for (let n = 0; n < counts[f]; n++) d.push(f);
  return d;
}
function _yzSumCounts(c) { let s = 0; for (let f = 1; f <= 6; f++) s += c[f]; return s; }
function _yzAddCounts(a, b) { const o = [0, 0, 0, 0, 0, 0, 0]; for (let f = 1; f <= 6; f++) o[f] = a[f] + b[f]; return o; }
function _yzCountsKey(c) { return c[1] + '' + c[2] + c[3] + c[4] + c[5] + c[6]; }

/** All sub-multisets of a dice hand (each is a candidate set of kept dice). */
function _yzSubMultisets(counts) {
  const res = [], cur = [0, 0, 0, 0, 0, 0, 0];
  (function rec(f) {
    if (f > 6) { res.push(cur.slice()); return; }
    for (let n = 0; n <= counts[f]; n++) { cur[f] = n; rec(f + 1); }
  })(1);
  return res;
}

// Distribution of outcomes when re-rolling k dice: [{counts, w}] (memoized by k).
const _yzRerollCache = {};
function yzRerollOutcomes(k) {
  if (_yzRerollCache[k]) return _yzRerollCache[k];
  const out = [], total = Math.pow(6, k), cur = [0, 0, 0, 0, 0, 0, 0];
  (function rec(face, left) {
    if (face === 6) {
      cur[6] = left;
      let w = _yzFact[k];
      for (let f = 1; f <= 6; f++) w /= _yzFact[cur[f]];
      out.push({ counts: cur.slice(), w: w / total });
      return;
    }
    for (let n = 0; n <= left; n++) { cur[face] = n; rec(face + 1, left - n); }
  })(1, k);
  _yzRerollCache[k] = out;
  return out;
}

// ── Category value ────────────────────────────────────────────
/** Strategic value of scoring `dice` in `cat` given current `scores`. */
function yzCategoryValue(scores, cat, dice, level) {
  const raw = yzScoreCategory(cat, dice);
  let v = raw - (YZ_PAR[cat] || 0);
  if (level === 'expert') {
    const meta = YZ_CATEGORY_META[cat];
    if (meta.section === 'upper' && yzUpperBonus(scores) === 0) {
      const need = YZ_UPPER_BONUS_THRESHOLD - yzUpperSubtotal(scores);
      if (need > 0) v += raw * 0.4; // chase the +35 upper bonus
    }
  }
  return v;
}

/**
 * Best "stop now" value: surplus of the best open category, computed directly
 * from a counts vector (hot path — no dice-array rebuild or repeated scoring).
 */
function _yzStopValue(scores, counts, level) {
  let sum = 0, n3 = false, n4 = false, n5 = false, run = 0, runMax = 0;
  for (let f = 1; f <= 6; f++) {
    const c = counts[f]; sum += f * c;
    if (c >= 3) n3 = true;
    if (c >= 4) n4 = true;
    if (c >= 5) n5 = true;
    run = c > 0 ? run + 1 : 0;
    if (run > runMax) runMax = run;
  }
  let tFace = 0, pFace = 0;
  for (let f = 1; f <= 6; f++) if (!tFace && counts[f] >= 3) tFace = f;
  for (let f = 1; f <= 6; f++) if (f !== tFace && counts[f] >= 2) pFace = f;
  const fh = (tFace && pFace) ? 25 : 0;

  const chasingBonus = level === 'expert' && yzUpperBonus(scores) === 0
    && yzUpperSubtotal(scores) < YZ_UPPER_BONUS_THRESHOLD;

  let best = -Infinity;
  for (const cat of YZ_CATEGORIES) {
    if (scores[cat] != null) continue;
    const meta = YZ_CATEGORY_META[cat];
    let raw;
    if (meta.section === 'upper') raw = counts[meta.face] * meta.face;
    else switch (cat) {
      case 'threeKind':     raw = n3 ? sum : 0; break;
      case 'fourKind':      raw = n4 ? sum : 0; break;
      case 'fullHouse':     raw = fh; break;
      case 'smallStraight': raw = runMax >= 4 ? 30 : 0; break;
      case 'largeStraight': raw = runMax >= 5 ? 40 : 0; break;
      case 'yahtzee':       raw = n5 ? 50 : 0; break;
      default:              raw = sum; break; // chance
    }
    let v = raw - (YZ_PAR[cat] || 0);
    if (chasingBonus && meta.section === 'upper') v += raw * 0.4;
    if (v > best) best = v;
  }
  return best === -Infinity ? 0 : best;
}

// ── Turn-value DP (expected value with r rerolls remaining) ────
function _yzTurnValue(counts, rerolls, scores, level, memo) {
  const key = _yzCountsKey(counts) + '|' + rerolls;
  if (memo[key] != null) return memo[key];
  let val = _yzStopValue(scores, counts, level);
  if (rerolls > 0) {
    for (const kept of _yzSubMultisets(counts)) {
      const rerollCount = YZ_NUM_DICE - _yzSumCounts(kept);
      if (rerollCount === 0) continue; // keeping all = stop, already covered
      let ev = 0;
      for (const o of yzRerollOutcomes(rerollCount)) {
        ev += o.w * _yzTurnValue(_yzAddCounts(kept, o.counts), rerolls - 1, scores, level, memo);
      }
      if (ev > val) val = ev;
    }
  }
  memo[key] = val;
  return val;
}

/** Best kept-dice multiset for the current hand — { kept, stop }. */
function _yzBestKeep(dice, rerolls, scores, level, memo) {
  const counts = yzCounts(dice);
  let best = { kept: counts.slice(), val: _yzStopValue(scores, counts, level), stop: true };
  for (const kept of _yzSubMultisets(counts)) {
    const rerollCount = YZ_NUM_DICE - _yzSumCounts(kept);
    if (rerollCount === 0) continue;
    let ev = 0;
    for (const o of yzRerollOutcomes(rerollCount)) {
      ev += o.w * _yzTurnValue(_yzAddCounts(kept, o.counts), rerolls - 1, scores, level, memo);
    }
    if (ev > best.val) best = { kept, val: ev, stop: false };
  }
  return best;
}

/** Map a kept-count vector onto a held[] boolean array over the actual dice. */
function _yzHeldFromKept(dice, kept) {
  const need = kept.slice();
  return dice.map(d => (need[d] > 0 ? (need[d]--, true) : false));
}

// ── Simple keep heuristics (easy / medium) ────────────────────
function _yzEasyKeep(dice) {
  if (Math.random() < 0.3) return dice.map(() => Math.random() < 0.5); // careless
  const counts = yzCounts(dice);
  let mode = 1;
  for (let f = 2; f <= 6; f++) if (counts[f] >= counts[mode]) mode = f;
  return dice.map(d => d === mode); // keep the most common face only
}

function _yzFacesToKept(faces) { const k = [0, 0, 0, 0, 0, 0, 0]; for (const f of faces) k[f] = 1; return k; }

/** Medium: sensible heuristic keep — no expected-value search. */
function _yzMediumKeep(dice) {
  const counts = yzCounts(dice);
  const present = [0, 0, 0, 0, 0, 0, 0];
  dice.forEach(d => present[d] = 1);

  // A 4-in-a-row (straight made or one away) — keep the run.
  for (const w of [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]]) {
    if (w.every(f => present[f])) return _yzHeldFromKept(dice, _yzFacesToKept(w));
  }
  // A pair or better — keep the biggest group (+ a second pair for a full house).
  let mode = 1;
  for (let f = 2; f <= 6; f++) if (counts[f] > counts[mode]) mode = f;
  if (counts[mode] >= 2) {
    const kept = [0, 0, 0, 0, 0, 0, 0];
    kept[mode] = counts[mode];
    let second = 0;
    for (let f = 1; f <= 6; f++) if (f !== mode && counts[f] >= 2 && (!second || counts[f] > counts[second])) second = f;
    if (second) kept[second] = counts[second];
    return _yzHeldFromKept(dice, kept);
  }
  // A 3-in-a-row draw — keep it.
  for (const w of [[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6]]) {
    if (w.every(f => present[f])) return _yzHeldFromKept(dice, _yzFacesToKept(w));
  }
  // Nothing going — keep just the highest die (upper-section progress).
  let hi = 1;
  for (let f = 2; f <= 6; f++) if (present[f]) hi = f;
  return _yzHeldFromKept(dice, _yzFacesToKept([hi]));
}

// ── Public API ────────────────────────────────────────────────
/** Which dice the AI keeps for the current hand (returns held[]). */
function yzAiChooseHeld(state) {
  const p = state.players[state.currentPlayer];
  const dice = state.dice, rerolls = state.rollsLeft, level = p.difficulty;
  if (rerolls <= 0) return dice.map(() => true);
  if (level === 'easy')   return _yzEasyKeep(dice);
  if (level === 'medium') return _yzMediumKeep(dice);
  // hard/expert use the full expected-value DP; hard slips occasionally.
  if (level === 'hard' && Math.random() < 0.13) return dice.map(() => Math.random() < 0.5);
  const best = _yzBestKeep(dice, rerolls, p.scores, level, {});
  return best.stop ? dice.map(() => true) : _yzHeldFromKept(dice, best.kept);
}

/** True if the AI wants to stop re-rolling and score now. */
function yzAiWantsToStop(state) {
  return yzAiChooseHeld(state).every(h => h);
}

/** Which category the AI scores the current dice in. */
function yzAiChooseCategory(state) {
  const p = state.players[state.currentPlayer];
  const dice = state.dice, level = p.difficulty;
  const open = YZ_CATEGORIES.filter(c => p.scores[c] == null);

  if (level === 'easy') {
    if (Math.random() < 0.25) return open[Math.floor(Math.random() * open.length)];
    return open.reduce((a, b) => yzScoreCategory(b, dice) > yzScoreCategory(a, dice) ? b : a);
  }
  return open.reduce((a, b) => {
    const va = yzCategoryValue(p.scores, a, dice, level);
    const vb = yzCategoryValue(p.scores, b, dice, level);
    if (vb !== va) return vb > va ? b : a;
    return yzScoreCategory(b, dice) > yzScoreCategory(a, dice) ? b : a; // tie-break raw
  });
}
