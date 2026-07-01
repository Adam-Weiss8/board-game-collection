/**
 * career/career.js
 * Career mode state, rating system, and matchmaking.
 * Depends on: career/opponents.js
 */

const CAREER_SLOTS_KEY  = 'azul-careers';
const MAX_CAREER_SLOTS  = 3;

const DEFAULT_PORTRAIT = {
  bgColor:      '#7c3aed',
  skinIdx:      0,
  hairStyle:    0,
  hairColorIdx: 0,
  hasGlasses:   false,
  mouthVal:     0.6,
};

/** Return a fresh career object (no slotIdx — caller assigns that). */
function newCareer() {
  return {
    playerName:    '',
    portrait:      Object.assign({}, DEFAULT_PORTRAIT),
    ratings:       { azul: 0, harmonies: 0 },
    wins:          0,
    losses:        0,
    gamesPlayed:   0,
    lastOpponentId: null,
    harmoniesWins:          0,
    harmoniesLosses:        0,
    harmoniesGamesPlayed:   0,
    lastHarmoniesOpponentId: null,
  };
}

/** Load all slots: array of length MAX_CAREER_SLOTS, null = empty. */
function loadAllCareers() {
  try {
    const raw = localStorage.getItem(CAREER_SLOTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        while (arr.length < MAX_CAREER_SLOTS) arr.push(null);
        // Migrate old saves: { rating: N } → { ratings: { azul: N } }
        for (const slot of arr) {
          if (slot && slot.rating !== undefined && !slot.ratings) {
            slot.ratings = { azul: slot.rating };
            delete slot.rating;
          }
          if (slot && slot.ratings && slot.ratings.harmonies === undefined) {
            slot.ratings.harmonies = 0;
          }
          if (slot && slot.harmoniesWins === undefined) {
            slot.harmoniesWins = 0;
            slot.harmoniesLosses = 0;
            slot.harmoniesGamesPlayed = 0;
            slot.lastHarmoniesOpponentId = null;
          }
        }
        return arr;
      }
    }
  } catch (_) {}
  return Array(MAX_CAREER_SLOTS).fill(null);
}

function saveAllCareers(slots) {
  try { localStorage.setItem(CAREER_SLOTS_KEY, JSON.stringify(slots)); } catch (_) {}
}

function saveCareer(slotIdx, careerData) {
  const slots = loadAllCareers();
  // Strip slotIdx before storing
  const { slotIdx: _, ...data } = careerData;
  slots[slotIdx] = data;
  saveAllCareers(slots);
}

function deleteCareer(slotIdx) {
  const slots = loadAllCareers();
  slots[slotIdx] = null;
  saveAllCareers(slots);
}

/**
 * Compute rating change after a match.
 * Win: +10–50  |  Loss: −10–50
 * Upsets against stronger opponents: bonus gain.
 * Losses to much weaker opponents: extra penalty.
 */
function computeRatingChange(playerRating, opponentSkill, playerScore, aiScore) {
  const won       = playerScore > aiScore;
  const scoreDiff = Math.abs(playerScore - aiScore);
  const skillDiff = opponentSkill - playerRating;

  // Smooth S-curve skill modifier via tanh: large gaps matter a lot,
  // small gaps matter a little. Range roughly ±30.
  const skillMod = Math.round(Math.tanh(skillDiff / 250) * 30);

  // Random variance ±18% — same matchup never feels identical
  const variance = 0.82 + Math.random() * 0.36;

  if (won) {
    // 50 (close win) → 100 (20+ pt blowout), boosted/reduced by opponent skill
    const base = Math.round(50 + Math.min(1, scoreDiff / 20) * 50);
    return Math.max(10, Math.round((base + skillMod) * variance));
  } else {
    // 30 (close loss) → 70 (blowout), reduced if opponent was stronger
    const base = Math.round(30 + Math.min(1, scoreDiff / 20) * 40);
    return -Math.max(10, Math.round((base - skillMod) * variance));
  }
}

/**
 * Human-readable matchup descriptor based on rating gap.
 */
function getMatchupFeel(playerRating, opponentSkill) {
  const diff = opponentSkill - playerRating;
  if (diff > 250)  return { label: 'Major Challenge',  emoji: '⚡' };
  if (diff > 120)  return { label: 'Tough Opponent',   emoji: '↑' };
  if (diff > -120) return { label: 'Even Match',       emoji: '⚖' };
  if (diff > -250) return { label: 'Slight Favorite',  emoji: '↓' };
  return               { label: 'Strong Favorite',  emoji: '★' };
}

/**
 * Short emotional message shown after the match.
 */
function getMatchMessage(won, scoreDiff, ratingChange, wasUpset) {
  if (wasUpset && won)       return "Upset victory! You punched above your weight.";
  if (won && scoreDiff >= 30) return "Dominant. You controlled the board from start to finish.";
  if (won && scoreDiff >= 15) return "Strong victory. Clear edge all game.";
  if (won && scoreDiff >= 5)  return "Solid win. You made the right calls when it counted.";
  if (won)                    return "Incredibly close. Could have gone either way.";
  if (!won && scoreDiff >= 30) return "They punished every mistake. Back to the fundamentals.";
  if (!won && scoreDiff >= 15) return "Outplayed today. There\'s a clear lesson here.";
  if (!won && scoreDiff >= 5)  return "Close loss. A couple of different picks and it\'s yours.";
  return "Heartbreakingly close. One more round and you had it.";
}

/**
 * Select the next opponent based on player rating.
 * Weighted toward opponents whose skill is close to playerRating.
 * game: 'azul' (default) or 'harmonies'
 */
function selectNextOpponent(careerState, game) {
  game = game || 'azul';
  const rating         = careerState.ratings[game] || 0;
  const lastOpponentId = game === 'harmonies'
    ? careerState.lastHarmoniesOpponentId
    : careerState.lastOpponentId;

  let pool = OPPONENTS.filter(o =>
    o.id !== lastOpponentId &&
    o.minRating <= rating &&
    o.maxRating >= rating
  );

  // If pool is too small, expand range
  if (pool.length === 0) {
    pool = OPPONENTS.filter(o => o.id !== lastOpponentId &&
      o.minRating <= rating + 150 && o.maxRating >= rating - 150);
  }
  if (pool.length === 0) {
    pool = [...OPPONENTS].filter(o => o.id !== lastOpponentId);
  }
  if (pool.length === 0) pool = [...OPPONENTS];

  // Weighted random: closer skill = higher probability
  const weights = pool.map(o => Math.max(1, 300 - Math.abs((o.skills[game] || o.skills.azul) - rating)));
  const total   = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;

  for (let i = 0; i < pool.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
