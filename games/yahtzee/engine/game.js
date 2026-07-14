/**
 * games/yahtzee/engine/game.js
 * Yahtzee game state and turn flow.
 * Depends on: constants.js, dice.js, scoring.js
 *
 * State shape:
 *   {
 *     numPlayers, players[], currentPlayer, round (1..13),
 *     dice[5], held[5], rollsLeft, rolledThisTurn, phase
 *   }
 *   players[i] = { name, isAI, difficulty, scores{cat:number|null}, yahtzeeBonus }
 */

/** Reset per-turn dice state for the player about to play. */
function yzResetTurn(state) {
  state.dice           = [1, 1, 1, 1, 1];
  state.held           = [false, false, false, false, false];
  state.rollsLeft      = YZ_MAX_ROLLS;
  state.rolledThisTurn = false;
}

/**
 * Create a new game.
 * @param {object} opts - { numPlayers, playerNames?, aiLevels? }
 *   aiLevels[i]: null/undefined for a human, else 'easy'|'medium'|'hard'|'expert'.
 */
function yzNewGame(opts) {
  opts = opts || {};
  const numPlayers = opts.numPlayers || 1;
  const names      = opts.playerNames || [];
  const aiLevels   = opts.aiLevels || [];

  const players = [];
  for (let i = 0; i < numPlayers; i++) {
    const scores = {};
    for (const c of YZ_CATEGORIES) scores[c] = null;
    players.push({
      name:       names[i] || ('Player ' + (i + 1)),
      isAI:       !!aiLevels[i],
      difficulty: aiLevels[i] || null,
      scores,
      yahtzeeBonus: 0,
    });
  }

  const state = { numPlayers, players, currentPlayer: 0, round: 1, phase: 'PLAYING' };
  yzResetTurn(state);
  return state;
}

/** Current player's turn — re-roll all non-held dice. Returns true if a roll happened. */
function yzRoll(state) {
  if (state.phase !== 'PLAYING' || state.rollsLeft <= 0) return false;
  for (let i = 0; i < YZ_NUM_DICE; i++) {
    if (!state.held[i]) state.dice[i] = yzRollDie();
  }
  state.rollsLeft--;
  state.rolledThisTurn = true;
  return true;
}

/** Toggle whether die `i` is held (kept) between re-rolls. */
function yzToggleHold(state, i) {
  if (state.phase !== 'PLAYING' || !state.rolledThisTurn) return false;
  state.held[i] = !state.held[i];
  return true;
}

/** True if the current player may still score (has rolled at least once). */
function yzCanScore(state) {
  return state.phase === 'PLAYING' && state.rolledThisTurn;
}

/**
 * Record the current dice in `cat` for the current player, then advance the turn.
 * Applies the +100 Yahtzee bonus when a 5-of-a-kind is scored after the Yahtzee
 * box already holds a 50. Returns true on success.
 */
function yzScore(state, cat) {
  if (!yzCanScore(state)) return false;
  const p = state.players[state.currentPlayer];
  if (!(cat in p.scores) || p.scores[cat] != null) return false; // unknown or already used

  if (yzIsYahtzee(state.dice) && p.scores.yahtzee === 50 && cat !== 'yahtzee') {
    p.yahtzeeBonus += YZ_YAHTZEE_BONUS;
  }
  p.scores[cat] = yzScoreCategory(cat, state.dice);

  yzAdvanceTurn(state);
  return true;
}

/** Advance to the next player / round, ending the game after 13 rounds. */
function yzAdvanceTurn(state) {
  state.currentPlayer++;
  if (state.currentPlayer >= state.numPlayers) {
    state.currentPlayer = 0;
    state.round++;
    if (state.round > YZ_NUM_ROUNDS) {
      state.phase = 'GAMEOVER';
      return;
    }
  }
  yzResetTurn(state);
}

function yzIsGameOver(state) {
  return state.phase === 'GAMEOVER';
}

/** Player grand total (upper + upper bonus + lower + yahtzee bonus). */
function yzPlayerTotal(player) {
  return yzGrandTotal(player.scores, player.yahtzeeBonus);
}

/** Final standings, highest total first. */
function yzFinalStandings(state) {
  return state.players
    .map((p, i) => ({ idx: i, name: p.name, total: yzPlayerTotal(p) }))
    .sort((a, b) => b.total - a.total);
}
