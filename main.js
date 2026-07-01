/**
 * main.js
 * UI controller – connects the game engine to the DOM.
 *
 * Responsibilities:
 *  - Screen navigation (menu / difficulty / game / gameover)
 *  - Rendering the full board from game state
 *  - Handling human player interactions (via event delegation)
 *  - Triggering AI moves asynchronously
 *  - Driving animations
 *  - Settings management
 *
 * The game engine (game/*.js) is the sole source of truth.
 * The UI NEVER writes directly to game state.
 */

// All game functions are loaded as plain scripts before this file.
// AI constant from constants.js; alias to AI_IDX for readability.
const AI_IDX = AI;

/* ============================================================
   App state
   ============================================================ */
let gameState            = null;   // current GameState from game engine
let pendingPick          = null;   // { source, factoryIndex, color, count, takesFirstToken }
let aiRunning            = false;  // AI is computing
let animating            = false;  // blocking input during animations
let lastRoundAnnounced   = false;  // banner shown once per game

// Career mode
let careerState          = null;   // loaded from localStorage
let careerOpponent       = null;   // current opponent (null = quick play)

// Local multiplayer mode
let localMode            = false;  // true = pass-and-play, no AI
let localPlayerNames     = [];     // ['Alice', 'Bob', ...]

/** App settings (persisted to localStorage) */
const settings = loadSettings();

/* ============================================================
   DOM element cache
   ============================================================ */
const screens = {
  home:           document.getElementById('screen-home'),
  menu:           document.getElementById('screen-menu'),
  difficulty:     document.getElementById('screen-difficulty'),
  rules:          document.getElementById('screen-rules'),
  settings:       document.getElementById('screen-settings'),
  game:           document.getElementById('screen-game'),
  gameover:       document.getElementById('screen-gameover'),
  careerHub:      document.getElementById('screen-career-hub'),
  opponentIntro:  document.getElementById('screen-opponent-intro'),
  matchResult:    document.getElementById('screen-match-result'),
  careerCreate:   document.getElementById('screen-career-create'),
  careerSelect:   document.getElementById('screen-career-select'),
  localSetup:     document.getElementById('screen-local-setup'),
};

const el = {
  // Topbar
  roundLabel:       document.getElementById('round-label'),
  turnLabel:        document.getElementById('turn-label'),
  // Factories
  factoriesRing:    document.getElementById('factories-ring'),
  centerPool:       document.getElementById('center-pool'),
  centerTiles:      document.getElementById('center-tiles'),
  // Player boards (indexed 0-3; 0=human/p1, 1=AI/p2, 2=p3, 3=p4)
  patternLines:     [
    document.getElementById('pattern-lines-0'),
    document.getElementById('pattern-lines-1'),
    document.getElementById('pattern-lines-2'),
    document.getElementById('pattern-lines-3'),
  ],
  walls:            [
    document.getElementById('wall-0'),
    document.getElementById('wall-1'),
    document.getElementById('wall-2'),
    document.getElementById('wall-3'),
  ],
  floors:           [
    document.getElementById('floor-0'),
    document.getElementById('floor-1'),
    document.getElementById('floor-2'),
    document.getElementById('floor-3'),
  ],
  scores:           [
    document.getElementById('score-0'),
    document.getElementById('score-1'),
    document.getElementById('score-2'),
    document.getElementById('score-3'),
  ],
  playerBoards:     [
    document.getElementById('player-board'),
    document.getElementById('ai-board'),
    document.getElementById('player-board-2'),
    document.getElementById('player-board-3'),
  ],
  // Misc
  statusMsg:        document.getElementById('game-status-msg'),
  aiThinking:       document.getElementById('ai-thinking'),
  pickBar:          document.getElementById('pick-bar'),
  pickPreview:      document.getElementById('pick-preview-tiles'),
  pickInstructions: document.getElementById('pick-instructions'),
  btnCancelPick:    document.getElementById('btn-cancel-pick'),
  aiDiffLabel:      document.getElementById('ai-difficulty-label'),
  // Overlays
  overlayRound:     document.getElementById('overlay-round'),
  roundTitle:       document.getElementById('round-title'),
  roundSummary:     document.getElementById('round-summary'),
  btnNextRound:     document.getElementById('btn-next-round'),
  // Game over
  gameoverTitle:    document.getElementById('gameover-title'),
  gameoverScores:   document.getElementById('gameover-scores'),
  gameoverBonuses:  document.getElementById('gameover-bonuses'),
  gameoverWinner:   document.getElementById('gameover-winner'),
};

/* ============================================================
   Screen management
   ============================================================ */
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  if (screens[name]) screens[name].classList.add('active');
}

/* ============================================================
   Settings
   ============================================================ */
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('azul-settings') || '{}');
    return {
      animSpeed: s.animSpeed ?? 'normal',
      sound:     s.sound     ?? 'on',
      hints:     s.hints     ?? 'on',
      aiDelay:   s.aiDelay   ?? 'short',
    };
  } catch {
    return { animSpeed: 'normal', sound: 'on', hints: 'on', aiDelay: 'short' };
  }
}

function saveSettings() {
  localStorage.setItem('azul-settings', JSON.stringify(settings));
}

function applySettingsToUI() {
  setAnimationSpeed(settings.animSpeed);
  document.querySelectorAll('.btn-option').forEach(btn => {
    const s = btn.dataset.setting;
    const v = btn.dataset.value;
    btn.classList.toggle('active', settings[s] === v);
  });
}

/* ============================================================
   Menu wiring
   ============================================================ */
document.getElementById('btn-pick-azul').addEventListener('click', () => showScreen('menu'));
document.getElementById('btn-menu-back').addEventListener('click', () => showScreen('home'));
document.getElementById('btn-play').addEventListener('click', () => showScreen('difficulty'));
document.getElementById('btn-career').addEventListener('click', enterCareerMode);
document.getElementById('btn-local').addEventListener('click', () => {
  initLocalSetupUI();
  showScreen('localSetup');
});
document.getElementById('btn-rules').addEventListener('click', () => showScreen('rules'));
document.getElementById('btn-settings').addEventListener('click', () => {
  applySettingsToUI();
  showScreen('settings');
});
document.getElementById('btn-rules-back').addEventListener('click', () => showScreen('menu'));
document.getElementById('btn-settings-back').addEventListener('click', () => {
  saveSettings();
  showScreen('menu');
});
document.getElementById('btn-diff-back').addEventListener('click', () => showScreen('menu'));
document.getElementById('btn-menu-game').addEventListener('click', () => {
  if (confirm('Return to main menu? Your game will be lost.')) {
    localMode = false;
    localPlayerNames = [];
    showScreen('menu');
  }
});
document.getElementById('btn-play-again').addEventListener('click', () => {
  if (localMode) {
    initLocalSetupUI();
    showScreen('localSetup');
  } else {
    showScreen('difficulty');
  }
});
document.getElementById('btn-gameover-menu').addEventListener('click', () => {
  localMode = false;
  localPlayerNames = [];
  showScreen('menu');
});

/* Settings option buttons */
document.querySelectorAll('.btn-option').forEach(btn => {
  btn.addEventListener('click', () => {
    const setting = btn.dataset.setting;
    const value   = btn.dataset.value;
    settings[setting] = value;
    btn.closest('.setting-control').querySelectorAll('.btn-option')
      .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applySettingsToUI();
  });
});

/* Difficulty buttons → start game */
document.querySelectorAll('.btn-difficulty').forEach(btn => {
  btn.addEventListener('click', () => startGame(btn.dataset.difficulty));
});

/* ============================================================
   Event delegation – factory clicks (entire ring)
   Each tile carries data-color; click anywhere on a tile to select its color.
   ============================================================ */
el.factoriesRing.addEventListener('click', e => {
  if (animating || aiRunning) return;
  if (!localMode && gameState?.currentPlayer !== HUMAN) return;

  // The clicked element is either a tile or inside a factory
  const tileEl    = e.target.closest('.tile[data-color]');
  const factoryEl = e.target.closest('.factory');
  if (!factoryEl || factoryEl.classList.contains('empty')) return;

  const color = tileEl ? tileEl.dataset.color : null;
  if (!color) return;

  const idx = parseInt(factoryEl.dataset.factoryIdx, 10);
  handleFactoryColorClick(idx, color);
});

/* Center pool clicks (event delegation on center tiles area) */
el.centerPool.addEventListener('click', e => {
  if (animating || aiRunning) return;
  if (!localMode && gameState?.currentPlayer !== HUMAN) return;

  const groupEl = e.target.closest('.center-color-group');
  if (!groupEl) return;

  handleCenterColorClick(groupEl.dataset.color);
});

/* Pattern lines and floors – all boards (delegation; guards check current player) */
for (let _p = 0; _p < 4; _p++) {
  el.patternLines[_p].addEventListener('click', (function(p) {
    return function(e) {
      if (!pendingPick || animating || aiRunning) return;
      const cp = activeHumanPlayer();
      if (p !== cp) return;
      const rowEl = e.target.closest('.pattern-row');
      if (!rowEl || !rowEl.classList.contains('legal')) return;
      handleDestinationClick(parseInt(rowEl.dataset.row, 10));
    };
  })(_p));

  el.floors[_p].addEventListener('click', (function(p) {
    return function() {
      if (!pendingPick || animating || aiRunning) return;
      const cp = activeHumanPlayer();
      if (p !== cp) return;
      handleDestinationClick(-1);
    };
  })(_p));
}

/* Cancel pending pick */
el.btnCancelPick.addEventListener('click', () => {
  clearPendingPick();
  hidePendingPick();
  setStatus('');
});

/* Round summary → next round */
el.btnNextRound.addEventListener('click', () => {
  el.overlayRound.classList.add('hidden');
  setStatus('');
  renderAll();
  updateTurnUI();
  if (localMode) {
    showPassOverlay();
  } else {
    scheduleAIIfNeeded();
  }
});

/* ============================================================
   Game start
   ============================================================ */
/** Returns the board index for the current human player (local: currentPlayer; quick play: HUMAN). */
function activeHumanPlayer() {
  if (localMode && gameState) return gameState.currentPlayer;
  return HUMAN;
}

function startGame(difficulty) {
  localMode            = false;
  localPlayerNames     = [];
  pendingPick          = null;
  aiRunning            = false;
  animating            = false;
  lastRoundAnnounced   = false;
  careerOpponent       = null;   // ensure quick-play mode

  gameState = createGame(difficulty);

  // Reset AI name to "AI [Difficulty]" and hide career portraits
  document.getElementById('ai-board-name').innerHTML =
    'AI <span id="ai-difficulty-label">' +
    difficulty.charAt(0).toUpperCase() + difficulty.slice(1) +
    '</span>';
  document.getElementById('board-portrait-0').classList.add('hidden');
  document.getElementById('board-portrait-1').classList.add('hidden');
  document.getElementById('player-name-label').textContent = 'You';

  // Hide extra boards, reset layout, and clear any champion theming
  document.getElementById('player-board-2').classList.add('hidden');
  document.getElementById('player-board-3').classList.add('hidden');
  document.getElementById('game-area').className = '';
  screens.game.classList.remove('champion-match');
  document.getElementById('champion-banner').classList.add('hidden');

  applySettingsToUI();
  showScreen('game');
  renderAll();
  updateTurnUI();
  hidePendingPick();
  scheduleAIIfNeeded();
}

/* ============================================================
   Local multiplayer setup
   ============================================================ */

let _localNumPlayers = 2;

function initLocalSetupUI() {
  _localNumPlayers = 2;
  document.querySelectorAll('[data-local-count]').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.localCount, 10) === 2);
  });
  document.getElementById('local-name-2').classList.add('hidden');
  document.getElementById('local-name-3').classList.add('hidden');
}

document.querySelectorAll('[data-local-count]').forEach(btn => {
  btn.addEventListener('click', () => {
    _localNumPlayers = parseInt(btn.dataset.localCount, 10);
    document.querySelectorAll('[data-local-count]').forEach(b =>
      b.classList.toggle('active', b === btn));
    document.getElementById('local-name-2').classList.toggle('hidden', _localNumPlayers < 3);
    document.getElementById('local-name-3').classList.toggle('hidden', _localNumPlayers < 4);
  });
});

document.getElementById('btn-local-start').addEventListener('click', () => {
  const names = [];
  for (let i = 0; i < _localNumPlayers; i++) {
    const input = document.getElementById(`local-name-${i}`);
    names.push(input.value.trim() || `Player ${i + 1}`);
  }
  startLocalGame(_localNumPlayers, names);
});

document.getElementById('btn-local-back').addEventListener('click', () => showScreen('menu'));

document.getElementById('btn-pass-ready').addEventListener('click', () => {
  document.getElementById('overlay-pass').classList.add('hidden');
  // game continues – current player can now play
});

function startLocalGame(numPlayers, names) {
  localMode        = true;
  localPlayerNames = names;
  pendingPick      = null;
  aiRunning        = false;
  animating        = false;
  lastRoundAnnounced = false;
  careerOpponent   = null;

  gameState = createGame('easy', numPlayers);

  // Player name labels
  document.getElementById('player-name-label').textContent  = names[0] || 'Player 1';
  document.getElementById('ai-board-name').textContent       = names[1] || 'Player 2';
  document.getElementById('player-name-label-2').textContent = names[2] || 'Player 3';
  document.getElementById('player-name-label-3').textContent = names[3] || 'Player 4';

  // Hide portraits
  document.getElementById('board-portrait-0').classList.add('hidden');
  document.getElementById('board-portrait-1').classList.add('hidden');

  // Show / hide extra boards
  document.getElementById('player-board-2').classList.toggle('hidden', numPlayers < 3);
  document.getElementById('player-board-3').classList.toggle('hidden', numPlayers < 4);

  // Game area layout class
  const gameArea = document.getElementById('game-area');
  gameArea.className = numPlayers >= 3 ? `local-${numPlayers}p` : '';
  screens.game.classList.remove('champion-match');
  document.getElementById('champion-banner').classList.add('hidden');

  applySettingsToUI();
  showScreen('game');
  renderAll();
  updateTurnUI();
  hidePendingPick();
  // No AI to schedule — all humans
}

function showPassOverlay() {
  const cp   = gameState.currentPlayer;
  const name = localPlayerNames[cp] || `Player ${cp + 1}`;
  document.getElementById('pass-prompt').textContent = `Pass to ${name}`;
  document.getElementById('overlay-pass').classList.remove('hidden');
}

/* ============================================================
   RENDERING
   ============================================================ */

function renderAll() {
  renderFactories();
  renderCenter();
  const numP = gameState?.numPlayers ?? 2;
  for (let p = 0; p < numP; p++) renderBoard(p);
  updateScores();
}

/* ─── Factories ─────────────────────────────────────────── */
function renderFactories() {
  const ring      = el.factoriesRing;
  ring.innerHTML  = '';

  const factories = gameState.factoriesState.factories;
  const n         = factories.length;

  // Measure area for responsive circle radius AFTER layout
  const areaEl  = el.factoriesRing.parentElement;
  const areaW   = areaEl.offsetWidth  || 340;
  const areaH   = areaEl.offsetHeight || 340;
  const cx      = areaW / 2;
  const cy      = areaH / 2;
  const fSize   = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--factory-size')
  ) || 130;
  const radius  = (Math.min(areaW, areaH) / 2) - fSize / 2 - 6;

  factories.forEach((tiles, idx) => {
    const factoryEl = document.createElement('div');
    factoryEl.classList.add('factory');
    if (tiles.length === 0) factoryEl.classList.add('empty');
    factoryEl.dataset.factoryIdx = idx;

    // Position in a circle
    const angle = (idx / n) * Math.PI * 2 - Math.PI / 2;
    factoryEl.style.left = `${cx + radius * Math.cos(angle) - fSize / 2}px`;
    factoryEl.style.top  = `${cy + radius * Math.sin(angle) - fSize / 2}px`;

    // Render each tile individually in the 2×2 grid
    // Each tile carries its color as data-color for event delegation
    for (let i = 0; i < 4; i++) {
      if (i < tiles.length) {
        const tileEl = createTileEl(tiles[i]);
        tileEl.dataset.color = tiles[i];
        tileEl.style.cursor = 'pointer';
        factoryEl.appendChild(tileEl);
      } else {
        const empty = document.createElement('div');
        empty.classList.add('pattern-slot');
        factoryEl.appendChild(empty);
      }
    }

    ring.appendChild(factoryEl);
  });
}

/* ─── Center pool ───────────────────────────────────────── */
function renderCenter() {
  el.centerTiles.innerHTML = '';

  const center   = gameState.factoriesState.center;
  const hasColor = center.some(t => COLORS.includes(t));
  el.centerPool.classList.toggle('empty', !hasColor);

  // First player token
  if (center.includes(FIRST_PLAYER_TOKEN)) {
    const tok = document.createElement('div');
    tok.classList.add('tile', 'tile-first');
    tok.textContent = '1';
    el.centerTiles.appendChild(tok);
  }

  // Color groups (each tile also carries data-color for reliable hit-testing)
  const groups = groupByColor(center.filter(t => COLORS.includes(t)));
  for (const [color, count] of Object.entries(groups)) {
    const groupEl = document.createElement('div');
    groupEl.classList.add('center-color-group');
    groupEl.dataset.color = color;
    for (let i = 0; i < count; i++) {
      const tEl = createTileEl(color);
      tEl.dataset.color = color;
      groupEl.appendChild(tEl);
    }
    el.centerTiles.appendChild(groupEl);
  }
}

/* ─── Player board ──────────────────────────────────────── */
function renderBoard(player) {
  renderPatternLines(player);
  renderWall(player);
  renderFloor(player);
}

function renderPatternLines(player) {
  const board     = gameState.boards[player];
  const container = el.patternLines[player];
  container.innerHTML = '';

  for (let r = 0; r < NUM_ROWS; r++) {
    const line  = board.patternLines[r];
    const rowEl = document.createElement('div');
    rowEl.classList.add('pattern-row');
    rowEl.dataset.row    = r;
    rowEl.dataset.player = player;

    // Slots rendered right-to-left (filled from right)
    for (let s = 0; s < line.slots; s++) {
      const slot   = document.createElement('div');
      slot.classList.add('pattern-slot');
      const filled = line.slots - s <= line.count;
      if (filled && line.color) {
        slot.appendChild(createTileEl(line.color));
        slot.style.cssText = 'border:none;background:none;';
      }
      rowEl.appendChild(slot);
    }

    container.appendChild(rowEl);
  }

  // Apply legal highlights if a pick is pending (active player's board only)
  if (player === activeHumanPlayer() && pendingPick) {
    highlightLegalRows();
  }
}

function renderWall(player) {
  const board  = gameState.boards[player];
  const wallEl = el.walls[player];
  wallEl.innerHTML = '';

  for (let r = 0; r < NUM_ROWS; r++) {
    for (let c = 0; c < NUM_COLS; c++) {
      const slotEl = document.createElement('div');
      slotEl.classList.add('wall-slot', `color-${WALL_PATTERN[r][c]}`);
      slotEl.dataset.row = r;
      slotEl.dataset.col = c;

      // Ghost hint (color watermark)
      const ghost = document.createElement('div');
      ghost.classList.add('wall-ghost');
      slotEl.appendChild(ghost);

      if (board.wall[r][c]) {
        slotEl.classList.add('filled');
        const tileEl = createTileEl(WALL_PATTERN[r][c]);
        tileEl.classList.add('wall-tile');
        tileEl.style.opacity = '1';
        slotEl.appendChild(tileEl);
      }

      wallEl.appendChild(slotEl);
    }
  }
}

function renderFloor(player) {
  const board   = gameState.boards[player];
  const floorEl = el.floors[player];
  floorEl.innerHTML = '';

  for (let i = 0; i < 7; i++) {
    const slot = document.createElement('div');
    slot.classList.add('floor-slot');

    if (i < board.floor.length) {
      const t = board.floor[i];
      if (t === FIRST_PLAYER_TOKEN) {
        const tok = document.createElement('div');
        tok.classList.add('tile', 'tile-first');
        tok.style.cssText = 'width:var(--tile-size);height:var(--tile-size);display:flex;align-items:center;justify-content:center;';
        tok.textContent = '1';
        slot.appendChild(tok);
      } else {
        slot.appendChild(createTileEl(t));
      }
    }

    floorEl.appendChild(slot);
  }

  // Visual cue when it's a legal destination
  if (player === activeHumanPlayer()) {
    floorEl.style.cursor = pendingPick ? 'pointer' : 'default';
  }
}

function updateScores() {
  const numP = gameState?.numPlayers ?? 2;
  for (let p = 0; p < numP; p++) {
    el.scores[p].textContent = gameState.boards[p].score;
  }
}

/* ============================================================
   Interaction – Human turn
   ============================================================ */

function handleFactoryColorClick(factoryIdx, color) {
  if (pendingPick) clearPendingPick();

  const count = countInFactory(gameState.factoriesState.factories, factoryIdx, color);
  if (count === 0) return;

  pendingPick = {
    source: 'factory',
    factoryIndex: factoryIdx,
    color,
    count,
    takesFirstToken: false,
  };

  setStatus(`${count} ${color} tile${count > 1 ? 's' : ''} selected — choose a row`);
  showPickBar();
  highlightLegalRows();
  playSound('click');
}

function handleCenterColorClick(color) {
  if (pendingPick) clearPendingPick();

  const count = countInCenter(gameState.factoriesState.center, color);
  if (count === 0) return;

  const takesFirstToken = gameState.factoriesState.firstPlayerInCenter;

  pendingPick = {
    source: 'center',
    factoryIndex: null,
    color,
    count,
    takesFirstToken,
  };

  const extra = takesFirstToken ? ' + First Player token' : '';
  setStatus(`${count} ${color} tile${count > 1 ? 's' : ''}${extra} — choose a row`);
  showPickBar();
  highlightLegalRows();
  playSound('click');
}

function handleDestinationClick(row) {
  if (!pendingPick) return;

  const cp = activeHumanPlayer();
  if (row >= 0 && !canPlaceOnRow(gameState.boards[cp], row, pendingPick.color)) {
    setStatus('Cannot place there – choose another row');
    return;
  }

  const move = {
    source:         pendingPick.source,
    factoryIndex:   pendingPick.factoryIndex,
    color:          pendingPick.color,
    row,
    count:          pendingPick.count,
    takesFirstToken: pendingPick.takesFirstToken,
  };

  executeHumanMove(move);
}

function executeHumanMove(move) {
  hidePendingPick();
  clearPendingPick();
  animating = true;

  const cp     = activeHumanPlayer();
  const fromEl = getSourceElement(move);
  const toEl   = getDestinationElement(cp, move.row);
  const fromRect = fromEl ? fromEl.getBoundingClientRect() : null;
  const toRect   = toEl   ? toEl.getBoundingClientRect()   : null;

  const doApply = () => {
    applyMove(gameState, move);
    renderAll();
    updateTurnUI();
    animating = false;
    playSound('place');
    checkLastRoundAnnouncement();
    checkAndHandleRoundEnd();
  };

  if (fromRect && toRect) {
    animateTilesMove(fromRect, toRect, move.color, move.count, doApply);
  } else {
    doApply();
  }
}

/* ─── Highlights ────────────────────────────────────────── */
function highlightLegalRows() {
  if (!pendingPick || settings.hints === 'off') return;

  const cp     = activeHumanPlayer();
  const board  = gameState.boards[cp];
  const dests  = legalDestinations(board, pendingPick.color);

  el.patternLines[cp].querySelectorAll('.pattern-row').forEach(rowEl => {
    const r = parseInt(rowEl.dataset.row, 10);
    rowEl.classList.toggle('legal', dests.includes(r));
  });

  // Floor is always legal
  el.floors[cp].style.boxShadow = '0 0 0 1px var(--border-gold)';
}

function clearHighlights() {
  const cp = activeHumanPlayer();
  el.patternLines[cp].querySelectorAll('.pattern-row').forEach(r => {
    r.classList.remove('legal', 'selected-dest');
  });
  el.floors[cp].style.boxShadow = '';
}

/* ─── Pick bar ──────────────────────────────────────────── */
function showPickBar() {
  if (!pendingPick) return;
  el.pickBar.classList.remove('hidden');
  el.pickPreview.innerHTML = '';

  const shown = Math.min(pendingPick.count, 6);
  for (let i = 0; i < shown; i++) el.pickPreview.appendChild(createTileEl(pendingPick.color));
  if (pendingPick.count > shown) {
    const more = document.createElement('span');
    more.textContent = `+${pendingPick.count - shown}`;
    more.style.cssText = 'font-size:12px;color:var(--color-muted);align-self:center;padding:0 4px;';
    el.pickPreview.appendChild(more);
  }

  const fp = pendingPick.takesFirstToken ? ' + First Player token' : '';
  el.pickInstructions.textContent =
    `${pendingPick.count} ${pendingPick.color} tile${pendingPick.count > 1 ? 's' : ''}${fp} — pick a row`;
}

function hidePendingPick() {
  el.pickBar.classList.add('hidden');
  clearHighlights();
}

function clearPendingPick() {
  pendingPick = null;
  clearHighlights();
}

/* ============================================================
   AI turn
   ============================================================ */
function scheduleAIIfNeeded() {
  if (localMode) return; // all humans in local mode
  if (!gameState || gameState.phase !== PHASE.TAKING) return;
  if (gameState.currentPlayer !== AI_IDX) return;
  if (aiRunning) return;

  aiRunning = true;
  el.aiThinking.classList.remove('hidden');

  const delay = { none: 80, short: 700, long: 1500 }[settings.aiDelay] ?? 700;

  setTimeout(() => {
    requestAnimationFrame(() => {
      let move;
      if (careerOpponent) {
        const personality = getOpponentPersonality(careerOpponent);
        move = getCareerAIMove(gameState, personality);
      } else {
        move = getBestMove(gameState, gameState.difficulty);
      }
      el.aiThinking.classList.add('hidden');

      if (!move) {
        aiRunning = false;
        return;
      }

      executeAIMove(move);
    });
  }, delay);
}

function executeAIMove(move) {
  animating = true;

  const fromEl   = getSourceElement(move);
  const toEl     = getDestinationElement(AI_IDX, move.row);
  const fromRect = fromEl ? fromEl.getBoundingClientRect() : null;
  const toRect   = toEl   ? toEl.getBoundingClientRect()   : null;

  const doApply = () => {
    applyMove(gameState, move);
    renderAll();
    updateTurnUI();
    animating = false;
    aiRunning = false;
    playSound('place');
    checkLastRoundAnnouncement();
    checkAndHandleRoundEnd();
  };

  if (fromRect && toRect) {
    animateTilesMove(fromRect, toRect, move.color, move.count, doApply);
  } else {
    doApply();
  }
}

/* ============================================================
   Round end
   ============================================================ */
function checkAndHandleRoundEnd() {
  if (gameState.phase === PHASE.TAKING) {
    if (localMode) {
      showPassOverlay();
    } else {
      scheduleAIIfNeeded();
    }
    return;
  }
  // WALL_TILING phase – resolve
  animateRoundEnd();
}

function animateRoundEnd() {
  setStatus('Scoring round...');
  el.statusMsg.classList.add('scoring');
  animating = true;

  const numP = gameState.numPlayers ?? 2;

  // ── 1. Snapshot completed pattern-line DOM positions BEFORE endRound ──
  const lineSnapshots = []; // { player, row, color, rect }
  for (let p = 0; p < numP; p++) {
    for (let r = 0; r < NUM_ROWS; r++) {
      const line = gameState.boards[p].patternLines[r];
      if (line.count >= line.slots && line.color) {
        const rowEl = el.patternLines[p].querySelector(`.pattern-row[data-row="${r}"]`);
        if (rowEl) {
          lineSnapshots.push({ player: p, row: r, color: line.color, rect: rowEl.getBoundingClientRect() });
        }
      }
    }
  }

  // ── 2. Advance game state – DOM is NOT yet refreshed ──
  const result = endRound(gameState);


  // ── 3. Track running scores for live display ──
  const displayScores = gameState.boards.map(b => b.score);
  for (const pr of result.playerResults) {
    displayScores[pr.player] =
      Math.max(0, gameState.boards[pr.player].score
        - pr.tilePlacementScore
        - pr.penalty);
  }
  // Show the pre-scoring scores immediately
  for (let p = 0; p < numP; p++) { el.scores[p].textContent = displayScores[p]; }

  // ── 4. Build animation queue ──
  const TILE_MS    = 1100;  // ms between each tile animation
  const PENALTY_MS = 800;
  let delay = 300;

  for (const pr of result.playerResults) {
    for (const ev of pr.tilingEvents) {
      (function(ev, pr, d) {
        setTimeout(() => {
          const snap       = lineSnapshots.find(s => s.player === pr.player && s.row === ev.row);
          const wallSlotEl = getWallSlotEl(pr.player, ev.row, ev.col);
          if (!wallSlotEl) return;

          const name = localMode
            ? (localPlayerNames[pr.player] || `Player ${pr.player + 1}`)
            : (pr.player === HUMAN ? 'You' : 'AI');
          setStatus(`${name}: ${ev.color} tile  →  +${ev.points} pts`);
          playSound('score');

          // Called when the tile reaches the wall slot
          const onLand = () => {
            // Manually place the tile in the DOM (wall not yet re-rendered)
            wallSlotEl.classList.add('filled');
            const tEl = createTileEl(ev.color);
            tEl.classList.add('wall-tile');
            tEl.style.opacity = '1';
            wallSlotEl.appendChild(tEl);

            // Pulse the slot
            wallSlotEl.classList.add('just-scored');
            setTimeout(() => wallSlotEl.classList.remove('just-scored'), 650);

            // Score popup – centred on the slot
            animateScore(ev.points, wallSlotEl);

            // Particle burst for high scores
            if (ev.points >= 4) {
              const r = wallSlotEl.getBoundingClientRect();
              triggerParticleBurst(r.left + r.width / 2, r.top + r.height / 2, ev.color);
            }

            // Live score update
            displayScores[pr.player] = Math.max(0, displayScores[pr.player] + ev.points);
            el.scores[pr.player].textContent = displayScores[pr.player];
            flashScore(el.scores[pr.player].parentElement);

            // Erase the tile from the pattern-line DOM (it has "moved")
            if (snap) {
              const patRowEl = el.patternLines[pr.player].querySelector(`.pattern-row[data-row="${ev.row}"]`);
              if (patRowEl) patRowEl.querySelectorAll('.tile').forEach(t => t.remove());
            }
          };

          // Fly the tile from the pattern-line position to the wall slot
          if (snap) {
            const toRect = wallSlotEl.getBoundingClientRect();
            animateTileMove(snap.rect, toRect, ev.color, onLand);
          } else {
            onLand();
          }

        }, d);
      })(ev, pr, delay);

      delay += TILE_MS;
    }

    // Floor penalty (shown after all tiles for this player)
    if (pr.penalty < 0) {
      (function(pr, d) {
        setTimeout(() => {
          animateFloorPenalty(pr.penalty, el.floors[pr.player]);
          displayScores[pr.player] = Math.max(0, displayScores[pr.player] + pr.penalty);
          el.scores[pr.player].textContent = displayScores[pr.player];
          flashScore(el.scores[pr.player].parentElement);
          playSound('penalty');
          const name = pr.player === HUMAN ? 'You' : 'AI';
          const pname = localMode
            ? (localPlayerNames[pr.player] || `Player ${pr.player + 1}`)
            : (pr.player === HUMAN ? 'You' : 'AI');
          setStatus(`${pname}: floor penalty  ${pr.penalty} pts`);
        }, d);
      })(pr, delay);
      delay += PENALTY_MS;
    }
  }

  // ── 5. Full re-render after all animations complete ──
  setTimeout(() => {
    el.statusMsg.classList.remove('scoring');
    renderAll();
    updateScores();
    updateTurnUI();
    animating = false;
    setStatus('');

    setTimeout(() => {
      if (result.gameOver) {
        handleGameOver();
      } else {
        showRoundSummary(result);
      }
    }, 400);
  }, delay + 500);
}

/** Returns true if any player has a complete pattern line that would fill the last slot in its wall row. */
function willTriggerLastRound(state) {
  for (let p = 0; p < (state.numPlayers ?? 2); p++) {
    const board = state.boards[p];
    for (let r = 0; r < NUM_ROWS; r++) {
      const line = board.patternLines[r];
      if (line.count < line.slots || !line.color) continue;
      const col = wallColForColor(r, line.color);
      const othersFilled = board.wall[r].filter((v, c) => c !== col && v).length;
      if (othersFilled === NUM_COLS - 1) return true;
    }
  }
  return false;
}

function checkLastRoundAnnouncement() {
  if (lastRoundAnnounced) return;
  if (willTriggerLastRound(gameState)) {
    lastRoundAnnounced = true;
    showLastRoundBanner();
  }
}

function showLastRoundBanner() {
  const banner = document.createElement('div');
  banner.classList.add('last-round-banner');
  banner.innerHTML = '<span class="last-round-icon">⚑</span> Last Round!';
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 3200);
}

function showRoundSummary(result) {
  el.roundTitle.textContent = `Round ${gameState.round - 1} Complete`;
  el.roundSummary.innerHTML = '';

  for (const pr of result.playerResults) {
    const name = localMode
      ? (localPlayerNames[pr.player] || `Player ${pr.player + 1}`)
      : (pr.player === HUMAN ? 'You' : 'AI');
    const net  = pr.tilePlacementScore + pr.penalty;
    const row  = document.createElement('div');
    row.classList.add('summary-row');
    row.innerHTML = `
      <span>${name}</span>
      <span>Tiles: +${pr.tilePlacementScore} &nbsp; Floor: ${pr.penalty}</span>
      <span class="summary-score-delta ${net >= 0 ? 'positive' : 'negative'}">
        ${net >= 0 ? '+' : ''}${net}
      </span>
    `;
    el.roundSummary.appendChild(row);
  }

  el.overlayRound.classList.remove('hidden');
}

/* ============================================================
   Game over
   ============================================================ */
function handleGameOver() {
  const bonusResults = applyFinalBonuses(gameState);
  const outcome      = determineWinner(gameState);

  if (careerOpponent) {
    handleCareerGameOver(outcome);
    return;
  }
  renderAll();

  const numP = gameState.numPlayers ?? 2;

  const playerName = p => localMode
    ? (localPlayerNames[p] || `Player ${p + 1}`)
    : (p === HUMAN ? 'You' : 'AI');

  // Scores
  el.gameoverScores.innerHTML = '';
  for (let p = 0; p < numP; p++) {
    const isWinner = outcome.winner === p;
    const pDiv     = document.createElement('div');
    pDiv.classList.add('gameover-player');

    const nameEl = document.createElement('div');
    nameEl.classList.add('gameover-player-name');
    nameEl.textContent = playerName(p);

    const scoreEl = document.createElement('div');
    scoreEl.classList.add('gameover-player-score');
    if (isWinner) scoreEl.classList.add('winner');
    scoreEl.textContent = outcome.scores[p];

    pDiv.append(nameEl, scoreEl);
    el.gameoverScores.appendChild(pDiv);
  }

  // Bonuses breakdown
  el.gameoverBonuses.innerHTML =
    '<strong style="color:var(--color-gold);margin-bottom:6px;display:block;">End-Game Bonuses</strong>';
  for (const br of bonusResults) {
    const b   = br.bonuses;
    const row = document.createElement('div');
    row.classList.add('bonus-row');
    row.innerHTML = `
      <span>${playerName(br.player)}</span>
      <span>
        Rows ×${b.rows}: +${b.rows * 2} &nbsp;
        Cols ×${b.columns}: +${b.columns * 7} &nbsp;
        Colors ×${b.colors}: +${b.colors * 10}
      </span>
    `;
    el.gameoverBonuses.appendChild(row);
  }

  // Winner announcement
  if (outcome.winner === null) {
    el.gameoverTitle.textContent  = 'Game Over';
    el.gameoverWinner.textContent = "It's a tie!";
    spawnConfetti();
    playSound('victory');
  } else if (localMode) {
    el.gameoverTitle.textContent  = 'Game Over';
    el.gameoverWinner.textContent = `${playerName(outcome.winner)} wins!`;
    spawnConfetti();
    playSound('victory');
  } else if (outcome.winner === HUMAN) {
    el.gameoverTitle.textContent  = 'Victory!';
    el.gameoverWinner.textContent = 'You win!';
    spawnConfetti();
    playSound('victory');
  } else {
    el.gameoverTitle.textContent  = 'Defeat';
    el.gameoverWinner.textContent = 'AI wins!';
    playSound('defeat');
  }

  setTimeout(() => showScreen('gameover'), 700);
}

/* ============================================================
   Career Mode
   ============================================================ */

function enterCareerMode() {
  renderCareerSelect();
  showScreen('careerSelect');
}

/* ── Career Select ──────────────────────────────────────── */

function renderCareerSelect() {
  const slots     = loadAllCareers();
  const container = document.getElementById('career-slots');
  container.innerHTML = '';

  for (let i = 0; i < MAX_CAREER_SLOTS; i++) {
    const slot = slots[i];
    const card = document.createElement('div');
    card.classList.add('career-slot-card');

    if (slot && slot.playerName) {
      card.classList.add('filled');
      card.innerHTML = `
        <div class="slot-portrait">${getPlayerPortraitSVG(slot, 'slot' + i)}</div>
        <div class="slot-name">${slot.playerName}</div>
        <div class="slot-rating">&#9733; ${slot.ratings?.azul ?? slot.rating ?? 0}</div>
        <div class="slot-record">${slot.wins}W &middot; ${slot.losses}L</div>
        <div class="slot-actions">
          <button class="btn btn-primary btn-sm slot-play-btn" data-slot="${i}">Play</button>
          <button class="btn btn-danger-sm slot-delete-btn" data-slot="${i}" title="Delete">&times;</button>
        </div>`;
    } else {
      card.classList.add('empty');
      card.innerHTML = `
        <div class="slot-new-icon">+</div>
        <div class="slot-new-label">New Career</div>
        <button class="btn btn-secondary slot-new-btn" data-slot="${i}">Create</button>`;
    }

    container.appendChild(card);
  }
}

document.getElementById('career-slots').addEventListener('click', e => {
  const btn  = e.target.closest('button[data-slot]');
  if (!btn) return;
  const slot = parseInt(btn.dataset.slot, 10);

  if (btn.classList.contains('slot-play-btn')) {
    const slots = loadAllCareers();
    if (slots[slot]) {
      careerState = Object.assign({ slotIdx: slot }, slots[slot]);
      renderCareerHub();
      showScreen('careerHub');
    }
  } else if (btn.classList.contains('slot-delete-btn')) {
    const slots  = loadAllCareers();
    const name   = slots[slot]?.playerName || 'this career';
    if (confirm(`Delete ${name}? This cannot be undone.`)) {
      deleteCareer(slot);
      renderCareerSelect();
    }
  } else if (btn.classList.contains('slot-new-btn')) {
    careerState = Object.assign({ slotIdx: slot }, newCareer());
    renderCareerCreate();
    showScreen('careerCreate');
  }
});

document.getElementById('btn-career-select-back').addEventListener('click', () => showScreen('menu'));

/* ── Career Hub ─────────────────────────────────────────── */

function renderCareerHub() {
  document.getElementById('career-rating-number').textContent = careerState.ratings.azul;
  document.getElementById('career-wins').textContent          = careerState.wins;
  document.getElementById('career-losses').textContent        = careerState.losses;
  document.getElementById('career-player-portrait').innerHTML = getPlayerPortraitSVG(careerState, 'hub');
  document.getElementById('career-player-name').textContent   = careerState.playerName;
}

document.getElementById('btn-career-find-match').addEventListener('click', () => {
  careerOpponent = selectNextOpponent(careerState);
  renderOpponentIntro();
  showScreen('opponentIntro');
});

document.getElementById('btn-career-to-menu').addEventListener('click', () => showScreen('menu'));

document.getElementById('btn-career-reset').addEventListener('click', () => {
  if (confirm(`Delete ${careerState.playerName}'s career? This cannot be undone.`)) {
    deleteCareer(careerState.slotIdx);
    renderCareerSelect();
    showScreen('careerSelect');
  }
});

/* ── Character Creation ─────────────────────────────────── */

let _draftPortrait = null;

function renderCareerCreate() {
  _draftPortrait = {
    bgColor:      PORTRAIT_BG_COLORS[0],
    skinIdx:      0,
    hairStyle:    0,
    hairColorIdx: 0,
    hasGlasses:   false,
    mouthVal:     0.6,
  };

  // Background colour swatches
  const bgEl = document.getElementById('create-bg-swatches');
  bgEl.innerHTML = '';
  PORTRAIT_BG_COLORS.forEach((color, idx) => {
    const s = document.createElement('div');
    s.classList.add('create-swatch');
    if (idx === 0) s.classList.add('selected');
    s.style.background = color;
    s.dataset.bgIdx = idx;
    bgEl.appendChild(s);
  });

  // Skin tone swatches
  const skinEl = document.getElementById('create-skin-swatches');
  skinEl.innerHTML = '';
  PORTRAIT_SKINS.forEach((color, idx) => {
    const s = document.createElement('div');
    s.classList.add('create-swatch');
    if (idx === 0) s.classList.add('selected');
    s.style.background = color;
    s.dataset.skinIdx = idx;
    skinEl.appendChild(s);
  });

  // Hair colour swatches
  const hairColorEl = document.getElementById('create-hair-color-swatches');
  hairColorEl.innerHTML = '';
  PORTRAIT_HAIRS.forEach((color, idx) => {
    const s = document.createElement('div');
    s.classList.add('create-swatch');
    if (idx === 0) s.classList.add('selected');
    s.style.background = color;
    s.dataset.hairColorIdx = idx;
    hairColorEl.appendChild(s);
  });

  // Reset toggles to first option
  document.querySelectorAll('#create-hair-style-btns .create-toggle').forEach((b, i) => b.classList.toggle('selected', i === 0));
  document.querySelectorAll('#create-glasses-btns .create-toggle').forEach((b, i) => b.classList.toggle('selected', i === 0));
  document.querySelectorAll('#create-mood-btns .create-toggle').forEach((b, i) => b.classList.toggle('selected', i === 1));
  // Set mood to middle (neutral)
  _draftPortrait.mouthVal = 0.5;

  document.getElementById('create-name-input').value = '';
  document.getElementById('btn-create-confirm').disabled = true;
  _updateCreatePreview();
}

function _updateCreatePreview() {
  document.getElementById('create-preview').innerHTML =
    generateCustomPortraitSVG(_draftPortrait, 'preview');
}

/* ── Character creation interaction ─────────────────────── */

document.getElementById('create-bg-swatches').addEventListener('click', e => {
  const s = e.target.closest('.create-swatch[data-bg-idx]');
  if (!s) return;
  _draftPortrait.bgColor = PORTRAIT_BG_COLORS[parseInt(s.dataset.bgIdx, 10)];
  document.querySelectorAll('#create-bg-swatches .create-swatch').forEach(x => x.classList.remove('selected'));
  s.classList.add('selected');
  _updateCreatePreview();
});

document.getElementById('create-skin-swatches').addEventListener('click', e => {
  const s = e.target.closest('.create-swatch[data-skin-idx]');
  if (!s) return;
  _draftPortrait.skinIdx = parseInt(s.dataset.skinIdx, 10);
  document.querySelectorAll('#create-skin-swatches .create-swatch').forEach(x => x.classList.remove('selected'));
  s.classList.add('selected');
  _updateCreatePreview();
});

document.getElementById('create-hair-color-swatches').addEventListener('click', e => {
  const s = e.target.closest('.create-swatch[data-hair-color-idx]');
  if (!s) return;
  _draftPortrait.hairColorIdx = parseInt(s.dataset.hairColorIdx, 10);
  document.querySelectorAll('#create-hair-color-swatches .create-swatch').forEach(x => x.classList.remove('selected'));
  s.classList.add('selected');
  _updateCreatePreview();
});

document.getElementById('create-hair-style-btns').addEventListener('click', e => {
  const b = e.target.closest('.create-toggle[data-hair-style]');
  if (!b) return;
  _draftPortrait.hairStyle = parseInt(b.dataset.hairStyle, 10);
  document.querySelectorAll('#create-hair-style-btns .create-toggle').forEach(x => x.classList.remove('selected'));
  b.classList.add('selected');
  _updateCreatePreview();
});

document.getElementById('create-glasses-btns').addEventListener('click', e => {
  const b = e.target.closest('.create-toggle[data-glasses]');
  if (!b) return;
  _draftPortrait.hasGlasses = b.dataset.glasses === 'true';
  document.querySelectorAll('#create-glasses-btns .create-toggle').forEach(x => x.classList.remove('selected'));
  b.classList.add('selected');
  _updateCreatePreview();
});

document.getElementById('create-mood-btns').addEventListener('click', e => {
  const b = e.target.closest('.create-toggle[data-mood]');
  if (!b) return;
  _draftPortrait.mouthVal = parseFloat(b.dataset.mood);
  document.querySelectorAll('#create-mood-btns .create-toggle').forEach(x => x.classList.remove('selected'));
  b.classList.add('selected');
  _updateCreatePreview();
});

document.getElementById('create-name-input').addEventListener('input', () => {
  const name = document.getElementById('create-name-input').value.trim();
  document.getElementById('btn-create-confirm').disabled = name.length === 0;
});

document.getElementById('btn-create-confirm').addEventListener('click', () => {
  const name = document.getElementById('create-name-input').value.trim();
  if (!name) return;
  careerState.playerName = name;
  careerState.portrait   = Object.assign({}, _draftPortrait);
  saveCareer(careerState.slotIdx, careerState);
  renderCareerHub();
  showScreen('careerHub');
});

document.getElementById('btn-create-back').addEventListener('click', () => {
  renderCareerSelect();
  showScreen('careerSelect');
});

/* ── Match flow ─────────────────────────────────────────── */

function startCareerMatch() {
  localMode          = false;
  localPlayerNames   = [];
  pendingPick        = null;
  aiRunning          = false;
  animating          = false;
  lastRoundAnnounced = false;

  gameState = createGame('easy'); // difficulty driven by personality

  // Portraits
  const p0 = document.getElementById('board-portrait-0');
  const p1 = document.getElementById('board-portrait-1');
  p0.innerHTML = getPlayerPortraitSVG(careerState, 'gp0');
  p1.innerHTML = generatePortraitSVG(careerOpponent);
  p0.classList.remove('hidden');
  p1.classList.remove('hidden');

  // Names
  document.getElementById('player-name-label').textContent = careerState.playerName;
  document.getElementById('ai-board-name').textContent     = careerOpponent.name;

  // Hide extra boards and reset layout
  document.getElementById('player-board-2').classList.add('hidden');
  document.getElementById('player-board-3').classList.add('hidden');
  document.getElementById('game-area').className = '';

  // Champion match visual treatment
  const isChampion = careerOpponent.archetype === 'champion';
  screens.game.classList.toggle('champion-match', isChampion);
  document.getElementById('champion-banner').classList.toggle('hidden', !isChampion);

  applySettingsToUI();
  showScreen('game');
  renderAll();
  updateTurnUI();
  hidePendingPick();
  scheduleAIIfNeeded();
}

function handleCareerGameOver(outcome) {
  const playerScore = gameState.boards[HUMAN].score;
  const aiScore     = gameState.boards[AI_IDX].score;
  const won         = outcome.winner === HUMAN;

  const ratingChange = computeRatingChange(
    careerState.ratings.azul, careerOpponent.skills.azul, playerScore, aiScore
  );
  const newRating = Math.max(0, Math.min(2000, careerState.ratings.azul + ratingChange));

  careerState.ratings.azul   = newRating;
  careerState.gamesPlayed    = (careerState.gamesPlayed || 0) + 1;
  careerState.wins           = (careerState.wins   || 0) + (won ? 1 : 0);
  careerState.losses         = (careerState.losses || 0) + (won ? 0 : 1);
  careerState.lastOpponentId = careerOpponent.id;
  saveCareer(careerState.slotIdx, careerState);

  renderMatchResult(won, playerScore, aiScore, ratingChange, newRating);
}

function renderMatchResult(won, playerScore, aiScore, ratingChange, newRating) {
  const oldRating = newRating - ratingChange;
  const scoreDiff = Math.abs(playerScore - aiScore);
  const wasUpset  = won && careerOpponent.skills.azul > oldRating + 100;

  document.getElementById('result-outcome-label').textContent = won ? 'VICTORY' : 'DEFEAT';
  document.getElementById('result-outcome-label').className =
    'result-outcome-label ' + (won ? 'win' : 'loss');

  document.getElementById('result-portrait').innerHTML    = generatePortraitSVG(careerOpponent);
  document.getElementById('result-opp-name').textContent  = careerOpponent.name;
  document.getElementById('result-opp-label').textContent = careerOpponent.name;

  document.getElementById('result-player-score').textContent = playerScore;
  document.getElementById('result-ai-score').textContent     = aiScore;

  document.getElementById('result-rating-before').textContent = oldRating;
  document.getElementById('result-rating-after').textContent  = newRating;

  const deltaEl = document.getElementById('result-rating-delta');
  deltaEl.textContent = ratingChange >= 0 ? `+${ratingChange}` : `${ratingChange}`;
  deltaEl.className   = 'result-rating-delta ' + (ratingChange >= 0 ? 'positive' : 'negative');

  document.getElementById('result-message').textContent =
    getMatchMessage(won, scoreDiff, ratingChange, wasUpset);

  const quoteKey = won ? 'loss' : 'win';
  document.getElementById('result-opp-quote').textContent =
    `${careerOpponent.name}: "${careerOpponent.quotes[quoteKey]}"`;

  if (won) { spawnConfetti(); playSound('victory'); } else { playSound('defeat'); }
  setTimeout(() => showScreen('matchResult'), 700);
}

document.getElementById('btn-begin-match').addEventListener('click', startCareerMatch);
document.getElementById('btn-intro-back').addEventListener('click', () => showScreen('careerHub'));

document.getElementById('btn-result-continue').addEventListener('click', () => {
  renderCareerHub();
  showScreen('careerHub');
});

document.getElementById('btn-result-menu').addEventListener('click', () => showScreen('menu'));

function renderOpponentIntro() {
  const opp  = careerOpponent;
  const feel = getMatchupFeel(careerState.ratings.azul, opp.skills.azul);

  document.getElementById('matchup-feel-banner').textContent =
    `${feel.emoji}  ${feel.label}`;

  document.getElementById('intro-portrait').innerHTML        = generatePortraitSVG(opp);
  document.getElementById('intro-opponent-name').textContent = opp.name;
  document.getElementById('intro-archetype-tag').textContent =
    opp.archetype.charAt(0).toUpperCase() + opp.archetype.slice(1);
  document.getElementById('intro-opponent-bio').textContent   = opp.bio;
  document.getElementById('intro-opponent-quote').textContent = `"${opp.quotes.intro}"`;
  document.getElementById('intro-your-rating').textContent    = careerState.ratings.azul;
  document.getElementById('intro-opp-skill').textContent      = opp.skills.azul;
}

/* ============================================================
   Turn UI
   ============================================================ */
function updateTurnUI() {
  el.roundLabel.textContent = `Round ${gameState.round}`;

  const cp     = gameState.currentPlayer;
  const taking = gameState.phase === PHASE.TAKING;
  const numP   = gameState.numPlayers ?? 2;

  for (let p = 0; p < 4; p++) {
    if (el.playerBoards[p]) {
      el.playerBoards[p].classList.toggle('active-player', p === cp && taking && p < numP);
    }
  }

  if (localMode) {
    const name = localPlayerNames[cp] || `Player ${cp + 1}`;
    el.turnLabel.textContent = taking ? `${name}'s Turn` : 'Scoring...';
  } else {
    const isHuman = cp === HUMAN;
    el.turnLabel.textContent = taking
      ? (isHuman ? 'Your Turn' : "AI's Turn")
      : 'Scoring...';
  }
}

function setStatus(msg) {
  el.statusMsg.textContent = msg;
}

/* ============================================================
   DOM helpers
   ============================================================ */

/** Create a single styled tile div. */
function createTileEl(color) {
  const div = document.createElement('div');
  div.classList.add('tile', `tile-${color}`);
  return div;
}

/** Return the DOM element representing a move source (for animation origin). */
function getSourceElement(move) {
  if (move.source === 'factory') {
    return el.factoriesRing.querySelector(`.factory[data-factory-idx="${move.factoryIndex}"]`);
  }
  return el.centerPool;
}

/** Return a representative DOM element for the destination row (for animation target). */
function getDestinationElement(player, row) {
  if (row === -1) {
    const slots = el.floors[player].querySelectorAll('.floor-slot');
    for (const s of slots) {
      if (!s.firstElementChild) return s;
    }
    return el.floors[player];
  }

  const rowEl = el.patternLines[player].querySelector(`.pattern-row[data-row="${row}"]`);
  if (!rowEl) return null;

  const slots = rowEl.querySelectorAll('.pattern-slot');
  return slots[slots.length - 1] ?? rowEl;
}

/** Get a wall slot element by player/row/col. */
function getWallSlotEl(player, row, col) {
  return el.walls[player].querySelector(
    `.wall-slot[data-row="${row}"][data-col="${col}"]`
  );
}

/** Group tile array into { color: count } map. */
function groupByColor(tiles) {
  const out = {};
  for (const t of tiles) {
    if (COLORS.includes(t)) out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}

/* ============================================================
   Sound (Web Audio API – synthesized, no external files)
   ============================================================ */
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (Ctor) audioCtx = new Ctor();
  }
  return audioCtx;
}

function playSound(type) {
  if (settings.sound !== 'on') return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;

    const profiles = {
      click:   { freq: 660,  dur: 0.06, wave: 'sine',     vol: 0.15 },
      place:   { freq: 440,  dur: 0.12, wave: 'triangle', vol: 0.20 },
      score:   { freq: 880,  dur: 0.18, wave: 'sine',     vol: 0.18 },
      penalty: { freq: 220,  dur: 0.22, wave: 'sawtooth', vol: 0.13 },
      victory: { freq: 660,  dur: 0.60, wave: 'sine',     vol: 0.22 },
      defeat:  { freq: 200,  dur: 0.50, wave: 'sawtooth', vol: 0.18 },
    };
    const p = profiles[type] ?? profiles.click;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = p.wave;
    osc.frequency.setValueAtTime(p.freq, ctx.currentTime);
    if (type === 'victory') {
      osc.frequency.linearRampToValueAtTime(p.freq * 1.5, ctx.currentTime + p.dur * 0.5);
    } else if (type === 'defeat') {
      osc.frequency.linearRampToValueAtTime(p.freq * 0.6, ctx.currentTime + p.dur);
    }

    gain.gain.setValueAtTime(p.vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + p.dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + p.dur + 0.01);
  } catch { /* silently ignore audio errors */ }
}

/* ============================================================
   Boot
   ============================================================ */
applySettingsToUI();
showScreen('home');
