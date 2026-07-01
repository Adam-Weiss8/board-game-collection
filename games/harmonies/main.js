/**
 * games/harmonies/main.js
 * UI controller: setup, rendering, event handling, pass-and-play.
 */

// ── UI state ──────────────────────────────────────────────────
let gameState      = null;
let selectedCardId = null;   // cardId selected for cube placement in OPTIONAL phase
let selectedHandIdx = null;  // which token chip is selected during PLACE phase

const HEX_SIZE   = 44; // px — radius of each hex

// Quick Play settings
let qpDifficulty = 'medium';
let qpBoardSide  = 'A';
let qpSpirits    = false;

// Local Game settings
let localNumPlayers = 2;
let localBoardSide  = 'A';
let localSpirits    = false;

// Active game mode
let isQuickPlay  = false;
let aiDifficulty = 'medium';
const AI_PLAYER  = 1; // AI always takes player index 1

// Undo support (single-level)
let undoState = null;

function deepCloneState(state) {
  return {
    phase:                state.phase,
    currentPlayer:        state.currentPlayer,
    numPlayers:           state.numPlayers,
    playerNames:          [...state.playerNames],
    boardSide:            state.boardSide,
    useSpiritCards:       state.useSpiritCards,
    endTriggered:         state.endTriggered,
    finalRound:           state.finalRound,
    finalRoundLastPlayer: state.finalRoundLastPlayer,
    draftedSlotIdx:       state.draftedSlotIdx,
    handIdx:              state.handIdx,
    cardTakenThisTurn:    state.cardTakenThisTurn,
    tokensInHand:         [...state.tokensInHand],
    boards:               state.boards.map(clonePersonalBoard),
    central:              cloneCentralBoard(state.central),
    pouch:                clonePouch(state.pouch),
    animalDeck:           [...state.animalDeck],
    availableCards:       [...state.availableCards],
  };
}

function saveUndo() {
  undoState = deepCloneState(gameState);
}

function onUndo() {
  if (!undoState) return;
  gameState     = undoState;
  undoState     = null;
  selectedCardId  = null;
  selectedHandIdx = null;
  renderAll();
  if (isQuickPlay) renderAiBoard();
}

// ── Token colors ──────────────────────────────────────────────
const TOKEN_COLORS = {
  BLUE:   '#4db8e8',
  YELLOW: '#e8c84d',
  GRAY:   '#9999aa',
  BROWN:  '#8b5e3c',
  GREEN:  '#4a9c4a',
  RED:    '#c0392b',
};

const PHASE_LABELS = {
  DRAFT:    'Draft — pick a group',
  PLACE:    'Place tokens',
  OPTIONAL: 'Optional actions',
  END:      'Game Over',
};

// ── Screen management ─────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

// ── Setup screen handlers ──────────────────────────────────────

// Quick Play screen
function setQPDiff(diff) {
  qpDifficulty = diff;
  ['easy','medium','hard'].forEach(d =>
    document.getElementById(`qp-diff-${d}`).classList.toggle('active', d === diff));
}
function setQPSide(side) {
  qpBoardSide = side;
  document.getElementById('qp-side-a').classList.toggle('active', side === 'A');
  document.getElementById('qp-side-b').classList.toggle('active', side === 'B');
}
function setQPSpirits(on) {
  qpSpirits = on;
  document.getElementById('qp-spirits-on').classList.toggle('active',  on);
  document.getElementById('qp-spirits-off').classList.toggle('active', !on);
}

// Local Game screen
function setLocalCount(n) {
  localNumPlayers = n;
  document.querySelectorAll('.count-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.count) === n));
  renderNameInputs();
}
function setLocalSide(side) {
  localBoardSide = side;
  document.getElementById('local-side-a').classList.toggle('active', side === 'A');
  document.getElementById('local-side-b').classList.toggle('active', side === 'B');
}
function setLocalSpirits(on) {
  localSpirits = on;
  document.getElementById('local-spirits-on').classList.toggle('active',  on);
  document.getElementById('local-spirits-off').classList.toggle('active', !on);
}

function renderNameInputs() {
  const container = document.getElementById('player-name-inputs');
  const defaults  = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
  container.innerHTML = '';
  for (let i = 0; i < localNumPlayers; i++) {
    const inp = document.createElement('input');
    inp.type        = 'text';
    inp.placeholder = defaults[i];
    inp.id          = `player-name-${i}`;
    inp.style.cssText = 'background:#1e2d14;border:1px solid #2e4a1e;color:#e8e8d0;padding:0.4rem 0.7rem;border-radius:6px;font-size:0.9rem;width:100%;margin-bottom:0.3rem';
    container.appendChild(inp);
  }
}

function getLocalPlayerNames() {
  const defaults = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
  return Array.from({ length: localNumPlayers }, (_, i) => {
    const inp = document.getElementById(`player-name-${i}`);
    return (inp && inp.value.trim()) || defaults[i];
  });
}

function startQPGame() {
  careerMode      = false;
  careerPersonality = null;
  isQuickPlay  = true;
  aiDifficulty = qpDifficulty;
  const name   = document.getElementById('qp-player-name').value.trim() || 'Player 1';
  gameState    = newGame({
    numPlayers:     2,
    playerNames:    [name, 'Computer'],
    boardSide:      qpBoardSide,
    useSpiritCards: qpSpirits,
  });
  selectedCardId  = null;
  selectedHandIdx = null;
  undoState       = null;
  document.getElementById('ai-board-panel').classList.remove('hidden');
  document.getElementById('human-board-label').textContent = name;
  showScreen('game');
  renderAll();
  renderAiBoard();
}

function startLocalGame() {
  isQuickPlay     = false;
  const names     = getLocalPlayerNames();
  gameState       = newGame({
    numPlayers:     localNumPlayers,
    playerNames:    names,
    boardSide:      localBoardSide,
    useSpiritCards: localSpirits,
  });
  selectedCardId  = null;
  selectedHandIdx = null;
  undoState       = null;
  document.getElementById('ai-board-panel').classList.add('hidden');
  document.getElementById('human-board-label').textContent = 'You';
  showScreen('game');
  renderAll();
}

// ── Hex math (flat-top) ───────────────────────────────────────
function hexToPixel(q, r, size) {
  return {
    x: size * 1.5 * q,
    y: size * Math.sqrt(3) * (r + q / 2),
  };
}

function hexCornersSVG(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    pts.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

function getBoardHexList() {
  return gameState.boardSide === 'A' ? BOARD_HEXES_A : BOARD_HEXES_B;
}

function computeSVGBounds(hexList, size) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { q, r } of hexList) {
    const { x, y } = hexToPixel(q, r, size);
    minX = Math.min(minX, x - size);
    minY = Math.min(minY, y - size * Math.sqrt(3) / 2);
    maxX = Math.max(maxX, x + size);
    maxY = Math.max(maxY, y + size * Math.sqrt(3) / 2);
  }
  const pad = 6;
  return {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  };
}

// ── Pattern preview SVG ───────────────────────────────────────
function renderPatternSVG(card) {
  const S = 13; // hex radius for pattern preview
  const cells = card.pattern.map(cell => {
    const { x, y } = hexToPixel(cell.dq, cell.dr, S);
    return { ...cell, x, y };
  });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x - S);
    minY = Math.min(minY, c.y - S * Math.sqrt(3) / 2);
    maxX = Math.max(maxX, c.x + S);
    maxY = Math.max(maxY, c.y + S * Math.sqrt(3) / 2);
  }
  const pad = 3;
  const vx = minX - pad, vy = minY - pad;
  const vw = maxX - minX + pad * 2, vh = maxY - minY + pad * 2;

  const hexSVG = cells.map(c => {
    const pts  = hexCornersSVG(c.x, c.y, S - 1);
    const fill = TOKEN_COLORS[c.type] || '#555';
    const isCubeHex = c.dq === 0 && c.dr === 0;
    const stroke = isCubeHex ? '#c8a84b' : '#1a2e10';
    const sw     = isCubeHex ? 3.5 : 1;
    let h = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="0.88"/>`;
    if (c.minH >= 2) {
      h += `<text x="${c.x}" y="${c.y + 4}" text-anchor="middle" font-size="8" font-weight="bold" fill="rgba(255,255,255,0.95)" pointer-events="none">${c.minH}</text>`;
    }
    return h;
  }).join('');

  return `<svg viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}" xmlns="http://www.w3.org/2000/svg" style="display:block">${hexSVG}</svg>`;
}

// ── Render: central board ─────────────────────────────────────
function renderCentral() {
  const el      = document.getElementById('central-board');
  const isDraft = gameState.phase === 'DRAFT';
  el.innerHTML  = gameState.central.slots.map((slot, i) => {
    const isEmpty = slot.tokens.length === 0;
    const cls     = `central-slot${isDraft && !isEmpty ? ' clickable' : ''}${isEmpty ? ' empty' : ''}`;
    const toks    = isEmpty
      ? '<span style="color:#555;font-size:0.75rem">empty</span>'
      : slot.tokens.map(t => `<div class="slot-token ${t}"></div>`).join('');
    return `<div class="${cls}" onclick="${isDraft && !isEmpty ? `onSlotClick(${i})` : ''}">
      ${toks}
    </div>`;
  }).join('');
}

// ── Render: personal hex board ────────────────────────────────
function renderBoard() {
  const svg      = document.getElementById('hex-board');
  // In quick play always show human board (player 0), even during AI turn
  const boardIdx = (isQuickPlay && gameState.currentPlayer === AI_PLAYER) ? 0 : gameState.currentPlayer;
  const board    = gameState.boards[boardIdx];
  const hexList  = getBoardHexList();
  const size     = HEX_SIZE;
  const bounds   = computeSVGBounds(hexList, size);

  svg.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
  svg.setAttribute('width',  bounds.w);
  svg.setAttribute('height', bounds.h);

  // Only show valid placements when a hand chip is selected
  const validSet = new Set(
    gameState.phase === 'PLACE' && selectedHandIdx !== null
      ? getLegalPlacements(gameState)
      : []
  );
  const cubeSet  = new Set(
    (gameState.phase === 'OPTIONAL' || gameState.phase === 'PLACE') && selectedCardId
      ? (findCubePlacements(board, board.heldCards.find(c => c.id === selectedCardId)) || [])
      : []
  );

  let html = '';
  for (const { q, r } of hexList) {
    const key    = hexKey(q, r);
    const cell   = board.hexes[key];
    const stack  = cell ? cell.stack : [];
    const top    = stack[stack.length - 1];
    const h      = stack.length;
    const { x, y } = hexToPixel(q, r, size);
    const pts    = hexCornersSVG(x, y, size - 1.5);

    const isValid = validSet.has(key);
    const isCube  = cubeSet.has(key);
    const isCubed = board.cubedHexes.has(key);

    const fillClass = top ? `hex-${top}` : 'hex-empty';
    let extraClass = 'hex-border';
    if (isValid) extraClass += ' hex-valid';
    if (isCube)  extraClass += ' hex-cube-target';

    // Cube targets take priority over token placements when a card is selected
    let onclick = '';
    if (isCube)       onclick = `onCubeHexClick('${key}')`;
    else if (isValid) onclick = `onHexClick('${key}')`;

    html += `<polygon points="${pts}" class="${fillClass} ${extraClass}"
      data-key="${key}" onclick="${onclick}" />`;

    // Height badge — rendered after polygon so it's never covered
    if (h >= 2) {
      html += `<text x="${x}" y="${y + 5}" text-anchor="middle"
        font-size="11" font-weight="bold" fill="rgba(255,255,255,0.9)"
        pointer-events="none">${h}</text>`;
    }

    // Cube marker — small gold circle at top-center of hex, never overlaps height badge
    if (isCubed) {
      const mr = Math.max(4, size * 0.12);
      html += `<circle cx="${x}" cy="${y - size * 0.48}" r="${mr}"
        fill="#c8a84b" stroke="#3d2800" stroke-width="1"
        opacity="0.92" pointer-events="none"/>`;
    }
  }

  svg.innerHTML = html;
}

// ── Render: token hand bar (above board, PLACE phase) ────────
function renderHandTokenBar() {
  const bar     = document.getElementById('hand-token-bar');
  const isPlace = gameState.phase === 'PLACE';
  bar.classList.toggle('visible', isPlace);
  if (!isPlace) { bar.innerHTML = ''; return; }

  bar.innerHTML = gameState.tokensInHand.map((tok, i) => {
    const isPlaced   = i < gameState.handIdx;
    const isSelected = i === selectedHandIdx;
    let cls = `hand-chip ${tok}`;
    if (isPlaced)        cls += ' placed';
    else if (isSelected) cls += ' selected';
    else                 cls += ' available';
    const onclick = !isPlaced ? `onSelectHandToken(${i})` : '';
    return `<div class="${cls}" onclick="${onclick}" title="${tok}"></div>`;
  }).join('');
}

// ── Render: left / right sidebars ────────────────────────────
function renderSidebarLeft() {
  renderHeldCards();
  renderActionButtons();
}

function renderSidebarRight() {
  renderAvailableCards();
}

// Returns the token type at the cube hex (dq=0,dr=0) in a card's pattern.
function getCubeHexType(card) {
  const cell = card.pattern.find(c => c.dq === 0 && c.dr === 0);
  return cell ? cell.type : null;
}

// Returns inline style for a left-border tint based on the cube hex token type.
function cardTintStyle(card) {
  const type = getCubeHexType(card);
  const col  = type ? TOKEN_COLORS[type] : null;
  return col ? `border-left: 4px solid ${col}; padding-left: 0.45rem;` : '';
}

function renderAvailableCards() {
  const el         = document.getElementById('available-cards-list');
  const board      = gameState.boards[gameState.currentPlayer];
  const canTake    = (gameState.phase === 'OPTIONAL' || gameState.phase === 'PLACE')
    && !gameState.cardTakenThisTurn && board.heldCards.length < 4;

  el.innerHTML = gameState.availableCards.map((card, i) => {
    if (!card) return `<div class="animal-card" style="opacity:0.3;font-size:0.75rem;padding:0.4rem">— empty —</div>`;
    const pts    = card.points.join(' / ');
    const tint   = cardTintStyle(card);
    const takeBtn = canTake
      ? `<button class="btn btn-green card-take-btn" onclick="onTakeCard(${i})">Take</button>`
      : '';
    return `<div class="animal-card${canTake ? ' takeable' : ''}" style="${tint}">
      <div class="card-name">${card.name}</div>
      <div class="card-pts">${card.cubes} cubes · ${pts} pts</div>
      <div class="card-pattern">${renderPatternSVG(card)}</div>
      ${takeBtn}
    </div>`;
  }).join('');
}

function renderHeldCards() {
  const el         = document.getElementById('held-cards-list');
  const board      = gameState.boards[gameState.currentPlayer];
  const canAct     = gameState.phase === 'OPTIONAL' || gameState.phase === 'PLACE';

  if (board.heldCards.length === 0) {
    el.innerHTML = '<div style="color:#555;font-size:0.8rem">No cards held</div>';
    return;
  }

  el.innerHTML = board.heldCards.map(card => {
    const placed    = board.cubesPlaced[card.id] || 0;
    const validHexes = canAct ? findCubePlacements(board, card) : [];
    const canPlace  = validHexes.length > 0;
    const isSelected = selectedCardId === card.id;

    const pips = Array.from({ length: card.cubes }, (_, i) =>
      `<div class="cube-pip ${i < placed ? 'filled' : ''}"></div>`
    ).join('');

    const pts  = card.points[card.cubes - placed - 1] ?? 0;
    const cls     = `animal-card${isSelected ? ' selected' : ''}${canPlace ? ' selectable' : ''}`;
    const onclick = canPlace ? `onclick="onSelectCard('${card.id}')"` : '';
    const tint    = cardTintStyle(card);

    return `<div class="${cls}" ${onclick} style="${tint}">
      <div class="card-name">${card.name}
        ${canPlace ? `<span style="font-size:0.65rem;color:#44ff88;margin-left:4px">● place cube</span>` : ''}
      </div>
      <div class="card-pts">${pts} pts next cube</div>
      <div class="card-pattern-row">
        <div class="card-pattern">${renderPatternSVG(card)}</div>
        <div class="card-cubes">${pips}</div>
      </div>
    </div>`;
  }).join('');
}

function renderActionButtons() {
  const el      = document.getElementById('action-buttons');
  const undoBtn = undoState
    ? `<button class="btn btn-gray" onclick="onUndo()" style="font-size:0.82rem">↩ Undo</button>`
    : '';
  if (gameState.phase === 'OPTIONAL') {
    el.innerHTML = `${undoBtn}<button class="btn btn-gold" onclick="onEndTurn()">Done — End Turn</button>`;
  } else if (gameState.phase === 'PLACE' || gameState.phase === 'DRAFT') {
    el.innerHTML = undoBtn;
  } else {
    el.innerHTML = '';
  }
}

// ── Render: header ────────────────────────────────────────────
function renderHeader() {
  const s = gameState;
  document.getElementById('game-phase-label').textContent =
    PHASE_LABELS[s.phase] || s.phase;
  document.getElementById('game-player-label').textContent =
    s.playerNames[s.currentPlayer] + (s.numPlayers > 1 ? "'s Turn" : '');
  document.getElementById('final-round-badge').style.display =
    s.finalRound ? '' : 'none';
}

// ── Render all ────────────────────────────────────────────────
function renderAll() {
  if (!gameState) return;
  renderHeader();
  renderCentral();
  renderHandTokenBar();
  renderBoard();
  renderSidebarLeft();
  renderSidebarRight();
}

// Only re-render what changes during AI turn — keeps human board intact
function renderDuringAiTurn() {
  if (!gameState) return;
  renderHeader();
  renderCentral();
  renderAiBoard();
}

// ── Render AI board (quick play only) ────────────────────────
function renderAiBoard() {
  if (!isQuickPlay || !gameState) return;
  const board   = gameState.boards[AI_PLAYER];
  const hexList = getBoardHexList();
  const size    = 30;
  const bounds  = computeSVGBounds(hexList, size);
  const svgEl   = document.getElementById('hex-board-ai');

  svgEl.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
  svgEl.setAttribute('width',   bounds.w);
  svgEl.setAttribute('height',  bounds.h);

  let html = '';
  for (const { q, r } of hexList) {
    const key   = hexKey(q, r);
    const cell  = board.hexes[key];
    const stack = cell ? cell.stack : [];
    const top   = stack[stack.length - 1];
    const h     = stack.length;
    const { x, y } = hexToPixel(q, r, size);
    const pts   = hexCornersSVG(x, y, size - 1.5);
    const cubed = board.cubedHexes.has(key);
    html += `<polygon points="${pts}" class="${top ? `hex-${top}` : 'hex-empty'} hex-border"/>`;
    if (h >= 2) {
      html += `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="9" font-weight="bold"
        fill="rgba(255,255,255,0.9)" pointer-events="none">${h}</text>`;
    }
    if (cubed) {
      const mr = Math.max(3, size * 0.12);
      html += `<circle cx="${x}" cy="${y - size * 0.48}" r="${mr}"
        fill="#c8a84b" stroke="#3d2800" stroke-width="1"
        opacity="0.92" pointer-events="none"/>`;
    }
  }
  svgEl.innerHTML = html;

  // Render AI held cards below its board
  const aiCardsEl = document.getElementById('ai-held-cards');
  if (board.heldCards.length === 0) {
    aiCardsEl.innerHTML = '<div style="color:#555;font-size:0.7rem;text-align:center">No cards held</div>';
    return;
  }
  aiCardsEl.innerHTML = board.heldCards.map(card => {
    const placed = board.cubesPlaced[card.id] || 0;
    const pts    = card.points[card.cubes - placed - 1] ?? 0;
    const tint   = cardTintStyle(card);
    return `<div class="animal-card" style="${tint}padding:0.25rem 0.35rem">
      <div class="card-name" style="font-size:0.65rem">${card.name} · ${pts}pt</div>
      <div class="card-pattern">${renderPatternSVG(card)}</div>
    </div>`;
  }).join('');
}

// ── Event handlers ────────────────────────────────────────────
function onSlotClick(slotIdx) {
  if (gameState.phase !== 'DRAFT') return;
  saveUndo();
  selectedHandIdx = null;
  draftSlot(gameState, slotIdx);
  // Auto-select first available chip so valid hexes show immediately
  selectedHandIdx = gameState.handIdx < gameState.tokensInHand.length
    ? gameState.handIdx : null;
  renderAll();
}

function onSelectHandToken(idx) {
  if (gameState.phase !== 'PLACE') return;
  if (idx < gameState.handIdx) return; // already placed/skipped

  // Swap chosen token into the handIdx position so the engine always
  // places from tokensInHand[handIdx] as before.
  if (idx !== gameState.handIdx) {
    const tmp = gameState.tokensInHand[gameState.handIdx];
    gameState.tokensInHand[gameState.handIdx] = gameState.tokensInHand[idx];
    gameState.tokensInHand[idx] = tmp;
  }
  selectedHandIdx = gameState.handIdx;
  renderAll();
}

function onHexClick(key) {
  if (gameState.phase !== 'PLACE') return;
  if (selectedHandIdx === null) return; // must select a chip first
  saveUndo();
  placeHandToken(gameState, key);
  // After placing, auto-select next available token if any
  selectedHandIdx = gameState.handIdx < gameState.tokensInHand.length
    ? gameState.handIdx : null;
  renderAll();
  if (gameState.phase === 'OPTIONAL') {
    selectedCardId  = null;
    selectedHandIdx = null;
    renderAll();
  }
}

function onSelectCard(cardId) {
  if (gameState.phase !== 'OPTIONAL' && gameState.phase !== 'PLACE') return;
  selectedCardId = selectedCardId === cardId ? null : cardId;
  renderAll();
}

function onCubeHexClick(key) {
  if (!selectedCardId) return;
  if (gameState.phase !== 'OPTIONAL' && gameState.phase !== 'PLACE') return;
  saveUndo();
  placeCubeAction(gameState, selectedCardId, key);
  selectedCardId = null;
  renderAll();
}

function onTakeCard(cardIdx) {
  if (gameState.phase !== 'OPTIONAL' && gameState.phase !== 'PLACE') return;
  saveUndo();
  takeAnimalCard(gameState, cardIdx);
  renderAll();
}

function onEndTurn() {
  if (gameState.phase !== 'OPTIONAL') return;
  selectedCardId = null;
  endOptionalPhase(gameState);

  if (gameState.phase === 'END') {
    showScoringScreen();
    return;
  }

  afterTurnAdvance();
}

// Called after every turn ends (including AI turns). Routes to AI run or pass overlay.
async function afterTurnAdvance() {
  if (isQuickPlay && gameState.currentPlayer === AI_PLAYER && gameState.phase !== 'END') {
    showAiThinking(true);
    await runAiTurn(gameState, aiDifficulty, () => {
      renderDuringAiTurn();
    }, careerPersonality || null);
    showAiThinking(false);
    renderAll();
    renderAiBoard();
    if (gameState.phase === 'END') {
      showScoringScreen();
    }
    return;
  }

  // Pass-and-play: show overlay for next human player
  if (gameState.numPlayers > 1 && !isQuickPlay) {
    showPassOverlay();
  } else {
    renderAll();
  }
}

function showAiThinking(visible) {
  document.getElementById('ai-thinking-badge').classList.toggle('visible', visible);
}

// ── Pass-and-play overlay ─────────────────────────────────────
function showPassOverlay() {
  const name = gameState.playerNames[gameState.currentPlayer];
  document.getElementById('pass-player-name').textContent = name;
  document.getElementById('pass-overlay').classList.remove('hidden');
}

function dismissPassOverlay() {
  document.getElementById('pass-overlay').classList.add('hidden');
  selectedHandIdx = null;
  renderAll();
}

// ── Score screen ──────────────────────────────────────────────

/** Count up a cell's value from 0 to target over ~700ms. */
function animateCount(cell, target, delay) {
  cell.textContent = '0';
  if (target === 0) return;
  setTimeout(() => {
    const dur  = Math.min(700, 80 + target * 35);
    const start = performance.now();
    const tick  = (now) => {
      const t   = Math.min(1, (now - start) / dur);
      const val = Math.round(target * (1 - Math.pow(1 - t, 2)));
      cell.textContent = val;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, delay);
}

/** Build a read-only SVG of a player's final board state. */
function createBoardSVG(board, hexList, size = 26) {
  const bounds = computeSVGBounds(hexList, size);
  let html = '';
  for (const { q, r } of hexList) {
    const key   = hexKey(q, r);
    const cell  = board.hexes[key];
    const stack = cell ? cell.stack : [];
    const top   = stack[stack.length - 1];
    const h     = stack.length;
    const { x, y } = hexToPixel(q, r, size);
    const pts   = hexCornersSVG(x, y, size - 1.5);
    const cubed = board.cubedHexes.has(key);
    html += `<polygon points="${pts}" class="${top ? `hex-${top}` : 'hex-empty'} hex-border"/>`;
    if (h >= 2) {
      html += `<text x="${x}" y="${y + 3}" text-anchor="middle" font-size="7" font-weight="bold" fill="rgba(255,255,255,0.9)">${h}</text>`;
    }
    if (cubed) {
      const mr = Math.max(2, size * 0.12);
      html += `<circle cx="${x}" cy="${y - size * 0.48}" r="${mr}"
        fill="#c8a84b" stroke="#3d2800" stroke-width="0.8"
        opacity="0.9" pointer-events="none"/>`;
    }
  }
  return `<svg viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}" width="${bounds.w}" height="${bounds.h}" xmlns="http://www.w3.org/2000/svg">${html}</svg>`;
}

function showScoringScreen() {
  const scores   = getFinalScores(gameState);
  const maxTotal = Math.max(...scores.map(s => s.total));
  const hexList  = getBoardHexList();
  const cats     = ['trees','mountains','fields','water','buildings','animals','total'];

  // Build table rows with placeholder zeros (animated below)
  const rows = scores.map((s, pi) => {
    const isWinner = s.total === maxTotal;
    const badge    = isWinner ? '<span class="winner-badge">Winner</span>' : '';
    const cells = cats.map(k =>
      k === 'total'
        ? `<td class="total-col" data-pi="${pi}" data-cat="${k}">0</td>`
        : `<td data-pi="${pi}" data-cat="${k}">0</td>`
    ).join('');
    return `<tr class="${isWinner ? 'winner' : ''}">
      <td>${s.playerName}${badge}</td>
      ${cells}
    </tr>`;
  }).join('');

  document.getElementById('score-body').innerHTML = rows;

  // Animate each cell with staggered delays
  scores.forEach((s, pi) => {
    cats.forEach((cat, ci) => {
      const cell = document.querySelector(`td[data-pi="${pi}"][data-cat="${cat}"]`);
      if (cell) animateCount(cell, s[cat], pi * 180 + ci * 60);
    });
  });

  // Render board snapshots
  const boardsEl = document.getElementById('score-boards');
  boardsEl.innerHTML = gameState.boards.map((board, i) => {
    const name      = gameState.playerNames[i];
    const isWinner  = scores[i].total === maxTotal;
    const svgHtml   = createBoardSVG(board, hexList);
    return `<div class="score-board-card${isWinner ? ' winner-board' : ''}">
      <h3>${name}${isWinner ? ' 🏆' : ''} — ${scores[i].total} pts</h3>
      ${svgHtml}
    </div>`;
  }).join('');

  if (careerMode) {
    const humanScore = scores[0].total;
    const aiScore    = scores[1].total;
    showScreen('score');
    // Show career result after a brief delay so scoring animates first
    setTimeout(() => showCareerResult(humanScore, aiScore), 2500);
    careerMode = false;
  } else {
    showScreen('score');
  }
}

// ── Scoring reference modal ───────────────────────────────────
function openScoringRef() {
  document.getElementById('scoring-modal-body').innerHTML = renderScoringModal();
  document.getElementById('scoring-modal').classList.remove('hidden');
}

function closeScoringRef() {
  document.getElementById('scoring-modal').classList.add('hidden');
}

function renderScoringModal() {
  const side = gameState ? gameState.boardSide : setupBoardSide;

  // Build a compact flat-top hex SVG from an array of {dq,dr,type,h?,dim?}
  function refHexSVG(cells, size = 13) {
    const mapped = cells.map(c => {
      const { x, y } = hexToPixel(c.dq, c.dr, size);
      return { ...c, x, y };
    });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of mapped) {
      minX = Math.min(minX, c.x - size);
      minY = Math.min(minY, c.y - size * Math.sqrt(3) / 2);
      maxX = Math.max(maxX, c.x + size);
      maxY = Math.max(maxY, c.y + size * Math.sqrt(3) / 2);
    }
    const pad = 2;
    const vx = minX - pad, vy = minY - pad;
    const vw = maxX - minX + pad * 2, vh = maxY - minY + pad * 2;
    const body = mapped.map(c => {
      const pts  = hexCornersSVG(c.x, c.y, size - 1);
      const fill = c.type === 'EMPTY' ? '#243318' : (TOKEN_COLORS[c.type] || '#555');
      const op   = c.dim ? 0.35 : 0.9;
      let el = `<polygon points="${pts}" fill="${fill}" stroke="#0d1a08" stroke-width="1" opacity="${op}"/>`;
      if ((c.h || 1) >= 2) {
        el += `<text x="${c.x}" y="${c.y + 4}" text-anchor="middle" font-size="8" font-weight="bold" fill="rgba(255,255,255,0.95)">${c.h}</text>`;
      }
      return el;
    }).join('');
    return `<svg viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}" style="display:inline-block;vertical-align:middle;flex-shrink:0">${body}</svg>`;
  }

  function section(catLabel, examples, note) {
    const exHtml = examples.map(e =>
      `<div class="ref-example">${e.svg}<span class="ref-pts">${e.pts}</span></div>`
    ).join('');
    return `<div class="ref-section">
      <div class="ref-cat">${catLabel}</div>
      <div class="ref-examples">${exHtml}</div>
      ${note ? `<div class="ref-note">${note}</div>` : ''}
    </div>`;
  }

  const trees = section('Trees', [
    { svg: refHexSVG([{ dq:0, dr:0, type:'GREEN', h:1 }]), pts: '1 pt' },
    { svg: refHexSVG([{ dq:0, dr:0, type:'GREEN', h:2 }]), pts: '3 pts' },
    { svg: refHexSVG([{ dq:0, dr:0, type:'GREEN', h:3 }]), pts: '7 pts' },
  ], 'Green alone (bush) / on 1 brown (short tree) / on 2 brown (tall tree). Brown alone = 0.');

  const mountains = section('Mountains', [
    { svg: refHexSVG([{ dq:0, dr:0, type:'GRAY', h:1, dim:true }]), pts: '0' },
    { svg: refHexSVG([{ dq:0, dr:0, type:'GRAY', h:1 }, { dq:1, dr:0, type:'GRAY', h:1 }]), pts: '1+1' },
    { svg: refHexSVG([{ dq:0, dr:0, type:'GRAY', h:2 }, { dq:1, dr:0, type:'GRAY', h:1 }]), pts: '3+1' },
    { svg: refHexSVG([{ dq:0, dr:0, type:'GRAY', h:3 }, { dq:1, dr:0, type:'GRAY', h:1 }]), pts: '7+1' },
  ], 'Isolated gray = 0. Must adjoin another gray to score: h1=1, h2=3, h3=7 pts.');

  const fields = section('Fields', [
    { svg: refHexSVG([{ dq:0, dr:0, type:'YELLOW' }, { dq:1, dr:0, type:'YELLOW' }]), pts: '5 pts' },
    { svg: refHexSVG([{ dq:0, dr:0, type:'YELLOW' }, { dq:1, dr:0, type:'YELLOW' }, { dq:0, dr:1, type:'YELLOW' }]), pts: '5 pts' },
  ], 'Each connected group of ≥2 yellow = 5 pts (size beyond 2 gives no extra).');

  const waterTitle = side === 'A' ? 'Water — Islands (Side A)' : 'Water — Longest River (Side B)';
  const waterNote  = side === 'A'
    ? 'Every connected blue group scores independently.'
    : 'Only the longest connected blue chain scores.';
  const water = `<div class="ref-section">
    <div class="ref-cat">${waterTitle}</div>
    <div class="ref-examples" style="gap:0.3rem">
      ${refHexSVG([{dq:0,dr:0,type:'BLUE'},{dq:1,dr:0,type:'BLUE'}])}
    </div>
    <div class="ref-water-table">
      <div class="ref-water-row"><span>2 tiles</span><span>2 pts</span></div>
      <div class="ref-water-row"><span>3 tiles</span><span>4 pts</span></div>
      <div class="ref-water-row"><span>4 tiles</span><span>6 pts</span></div>
      <div class="ref-water-row"><span>5 tiles</span><span>9 pts</span></div>
      <div class="ref-water-row"><span>6+ tiles</span><span>15 pts</span></div>
    </div>
    <div class="ref-note">${waterNote}</div>
  </div>`;

  const buildings = section('Buildings', [
    { svg: refHexSVG([
        { dq:0, dr:0, type:'RED',    h:2 },
        { dq:1, dr:0, type:'BLUE',   h:1 },
        { dq:0, dr:1, type:'YELLOW', h:1 },
        { dq:-1,dr:1, type:'GREEN',  h:1 },
      ]), pts: '5 pts' },
  ], 'Red must be stacked (h2: on brown, gray, or red). Then ≥3 distinct token types among neighbors = 5 pts. Standalone red (h1) never scores.');

  const animals = `<div class="ref-section">
    <div class="ref-cat">Animal Cards</div>
    <div class="ref-note" style="font-style:normal;font-size:0.8rem;color:var(--text)">
      Place cubes on matching hex patterns. Score = value at your highest placed cube.<br>
      <span style="color:var(--gold)">More cubes placed = higher score shown on card.</span>
    </div>
  </div>`;

  return trees + mountains + fields + water + buildings + animals;
}

// ── Career Mode ───────────────────────────────────────────────

let careerMode       = false;
let careerState      = null;   // loaded career object
let careerOpponent   = null;   // selected opponent for current match
let careerSlotIdx    = null;   // which of the 3 save slots
let careerPersonality = null;  // personality for current match's AI

// ── Career character create state ────────────────────────────

let draftPortrait = {
  bgColor: '#7c3aed', skinIdx: 0, hairStyle: 0,
  hairColorIdx: 0, hasGlasses: false, mouthVal: 0.6,
};

function enterCareerMode() {
  const slots = loadAllCareers();
  renderCareerSlots(slots);
  showScreen('career-select');
}

function renderCareerSlots(slots) {
  const el = document.getElementById('career-slot-list');
  el.innerHTML = slots.map((slot, i) => {
    if (!slot) {
      return `<div class="career-slot empty-slot" onclick="careerStartCreate(${i})">
        <div class="career-slot-empty">+ New Character</div>
      </div>`;
    }
    const portrait = generateCustomPortraitSVG(slot.portrait, 'slot' + i);
    const rating   = slot.ratings ? (slot.ratings.harmonies || 0) : 0;
    const w = slot.harmoniesWins || 0;
    const l = slot.harmoniesLosses || 0;
    return `<div class="career-slot" onclick="careerLoadSlot(${i})">
      <div class="career-slot-portrait">${portrait}</div>
      <div class="career-slot-info">
        <div class="career-slot-name">${slot.playerName || 'Unnamed'}</div>
        <div class="career-slot-rating">${rating} Rating</div>
        <div class="career-slot-record">${w}W – ${l}L</div>
      </div>
      <button class="career-slot-delete" onclick="event.stopPropagation();careerDeleteSlot(${i})">✕</button>
    </div>`;
  }).join('');
}

function careerStartCreate(slotIdx) {
  careerSlotIdx = slotIdx;
  draftPortrait = { bgColor: '#7c3aed', skinIdx: 0, hairStyle: 0, hairColorIdx: 0, hasGlasses: false, mouthVal: 0.6 };
  document.getElementById('career-create-name').value = '';
  renderPortraitEditor();
  showScreen('career-create');
}

function renderPortraitEditor() {
  // Background swatches
  const bgEl = document.getElementById('portrait-bg-swatches');
  bgEl.innerHTML = PORTRAIT_BG_COLORS.map((c, i) =>
    `<div class="portrait-swatch${draftPortrait.bgColor === c ? ' active' : ''}"
      style="background:${c}" onclick="setPortraitBg('${c}')"></div>`
  ).join('');

  // Skin swatches
  const skinEl = document.getElementById('portrait-skin-swatches');
  skinEl.innerHTML = PORTRAIT_SKINS.map((c, i) =>
    `<div class="portrait-swatch${draftPortrait.skinIdx === i ? ' active' : ''}"
      style="background:${c}" onclick="setPortraitSkin(${i})"></div>`
  ).join('');

  // Hair color swatches
  const hairEl = document.getElementById('portrait-hair-swatches');
  hairEl.innerHTML = PORTRAIT_HAIRS.map((c, i) =>
    `<div class="portrait-swatch${draftPortrait.hairColorIdx === i ? ' active' : ''}"
      style="background:${c}" onclick="setPortraitHair(${i})"></div>`
  ).join('');

  // Hair style buttons
  const styleEl = document.getElementById('portrait-hairstyle-btns');
  styleEl.innerHTML = ['Short','Long','Curly','Bald'].map((label, i) =>
    `<button class="portrait-style-btn${draftPortrait.hairStyle === i ? ' active' : ''}"
      onclick="setPortraitStyle(${i})">${label}</button>`
  ).join('');

  // Glasses checkbox
  document.getElementById('portrait-glasses').checked = draftPortrait.hasGlasses;
  document.getElementById('portrait-glasses').onchange = e => {
    draftPortrait.hasGlasses = e.target.checked;
    updatePortraitPreview();
  };

  updatePortraitPreview();
}

function updatePortraitPreview() {
  document.getElementById('career-portrait-preview').innerHTML =
    generateCustomPortraitSVG(draftPortrait, 'preview');
}

function setPortraitBg(c) {
  draftPortrait.bgColor = c;
  renderPortraitEditor();
}
function setPortraitSkin(i) {
  draftPortrait.skinIdx = i;
  renderPortraitEditor();
}
function setPortraitHair(i) {
  draftPortrait.hairColorIdx = i;
  renderPortraitEditor();
}
function setPortraitStyle(i) {
  draftPortrait.hairStyle = i;
  renderPortraitEditor();
}

function careerCreateConfirm() {
  const name = document.getElementById('career-create-name').value.trim() || 'Player';
  const career = newCareer();
  career.playerName = name;
  career.portrait   = Object.assign({}, draftPortrait);
  saveCareer(careerSlotIdx, career);
  careerState   = Object.assign({ slotIdx: careerSlotIdx }, career);
  renderCareerHub();
  showScreen('career-hub');
}

function careerLoadSlot(idx) {
  const slots = loadAllCareers();
  if (!slots[idx]) return;
  careerSlotIdx = idx;
  careerState   = Object.assign({ slotIdx: idx }, slots[idx]);
  renderCareerHub();
  showScreen('career-hub');
}

function careerDeleteSlot(idx) {
  if (!confirm('Delete this character? This cannot be undone.')) return;
  deleteCareer(idx);
  enterCareerMode();
}

function renderCareerHub() {
  if (!careerState) return;
  const rating = careerState.ratings ? (careerState.ratings.harmonies || 0) : 0;
  const w = careerState.harmoniesWins   || 0;
  const l = careerState.harmoniesLosses || 0;

  document.getElementById('career-hub-portrait').innerHTML = getPlayerPortraitSVG(careerState, 'hub');
  document.getElementById('career-hub-name').textContent   = careerState.playerName;
  document.getElementById('career-hub-rating').textContent = rating;
  document.getElementById('career-hub-wins').textContent   = w;
  document.getElementById('career-hub-losses').textContent = l;
}

function careerFindMatch() {
  const opp = selectNextOpponent(careerState, 'harmonies');
  careerOpponent  = opp;
  careerPersonality = getOpponentPersonality(opp, 'harmonies');

  const rating         = careerState.ratings ? (careerState.ratings.harmonies || 0) : 0;
  const matchup        = getMatchupFeel(rating, opp.skills.harmonies);
  const archetypeLabel = opp.archetype.charAt(0).toUpperCase() + opp.archetype.slice(1);

  document.getElementById('career-intro-portrait').innerHTML    = generatePortraitSVG(opp);
  document.getElementById('career-intro-name').textContent      = opp.name;
  document.getElementById('career-intro-archetype').textContent = archetypeLabel;
  document.getElementById('career-intro-bio').textContent       = opp.bio;
  document.getElementById('career-intro-quote').textContent     = `"${opp.quotes.intro}"`;
  document.getElementById('career-intro-matchup').textContent   = `${matchup.emoji}  ${matchup.label}`;
  document.getElementById('career-intro-your-rating').textContent = rating;
  document.getElementById('career-intro-opp-skill').textContent   = opp.skills.harmonies;

  showScreen('career-intro');
}

function careerStartMatch() {
  careerMode = true;
  const name = careerState.playerName;
  isQuickPlay  = true;
  aiDifficulty = 'medium'; // overridden by personality in runAiTurn
  gameState = newGame({
    numPlayers:     2,
    playerNames:    [name, careerOpponent.name],
    boardSide:      'A',
    useSpiritCards: false,
  });
  selectedCardId  = null;
  selectedHandIdx = null;
  undoState       = null;
  document.getElementById('ai-board-panel').classList.remove('hidden');
  document.getElementById('ai-board-label').textContent    = careerOpponent.name;
  document.getElementById('human-board-label').textContent = name;
  showScreen('game');
  renderAll();
  renderAiBoard();
}

function careerContinue() {
  renderCareerHub();
  showScreen('career-hub');
}

function showCareerResult(humanScore, aiScore) {
  const won         = humanScore > aiScore;
  const scoreDiff   = Math.abs(humanScore - aiScore);
  const rating      = careerState.ratings.harmonies || 0;
  const oppSkill    = careerOpponent.skills.harmonies;
  const ratingChange = computeRatingChange(rating, oppSkill, humanScore, aiScore);
  const wasUpset    = won && oppSkill > rating + 150;

  // Update career state
  careerState.ratings.harmonies = Math.max(0, rating + ratingChange);
  if (won) {
    careerState.harmoniesWins = (careerState.harmoniesWins || 0) + 1;
  } else {
    careerState.harmoniesLosses = (careerState.harmoniesLosses || 0) + 1;
  }
  careerState.harmoniesGamesPlayed = (careerState.harmoniesGamesPlayed || 0) + 1;
  careerState.lastHarmoniesOpponentId = careerOpponent.id;

  saveCareer(careerSlotIdx, careerState);

  const newRating = careerState.ratings.harmonies;

  // Render result screen
  const outcomeEl = document.getElementById('career-result-outcome');
  outcomeEl.textContent = won ? 'VICTORY' : 'DEFEAT';
  outcomeEl.className   = 'result-outcome-label ' + (won ? 'win' : 'loss');

  document.getElementById('career-result-portrait').innerHTML = generatePortraitSVG(careerOpponent);
  document.getElementById('career-result-opp-name').textContent  = careerOpponent.name;
  document.getElementById('career-result-opp-label').textContent = careerOpponent.name;

  document.getElementById('career-result-player-score').textContent = humanScore;
  document.getElementById('career-result-ai-score').textContent      = aiScore;

  document.getElementById('career-result-rating-before').textContent = rating;
  document.getElementById('career-result-rating-after').textContent  = newRating;

  const deltaEl = document.getElementById('career-result-rating-delta');
  deltaEl.textContent = ratingChange >= 0 ? `+${ratingChange}` : `${ratingChange}`;
  deltaEl.className   = 'result-rating-delta ' + (ratingChange >= 0 ? 'positive' : 'negative');

  document.getElementById('career-result-message').textContent =
    getMatchMessage(won, scoreDiff, ratingChange, wasUpset);

  document.getElementById('career-result-quote').textContent =
    `${careerOpponent.name}: "${won ? careerOpponent.quotes.loss : careerOpponent.quotes.win}"`;

  showScreen('career-result');
}

// ── Init ──────────────────────────────────────────────────────
renderNameInputs(); // pre-populate local game name inputs
