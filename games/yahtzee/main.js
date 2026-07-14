/**
 * games/yahtzee/main.js
 * UI controller for Yahtzee (local pass-and-play). Vanilla JS, event delegation.
 * Depends on the engine globals (constants/dice/scoring/game).
 */

// ── Screen navigation ─────────────────────────────────────────
function yzShow(key) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + key).classList.add('active');
}

// ── Setup ─────────────────────────────────────────────────────
let yzSetupCount = 2;

function yzSetPlayerCount(n) {
  yzSetupCount = n;
  document.querySelectorAll('#yz-playercount .toggle-opt')
    .forEach(el => el.classList.toggle('active', +el.dataset.n === n));
  const wrap = document.getElementById('yz-name-inputs');
  wrap.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Player ' + (i + 1);
    inp.value = 'Player ' + (i + 1);
    inp.maxLength = 14;
    wrap.appendChild(inp);
  }
}

function yzStartLocal() {
  const names = Array.from(document.querySelectorAll('#yz-name-inputs input'))
    .map((inp, i) => inp.value.trim() || ('Player ' + (i + 1)));
  yzBeginGame({ numPlayers: yzSetupCount, playerNames: names, aiLevels: [] });
}

// ── Live game state ───────────────────────────────────────────
let yzState = null;
let yzSelectedCat = null;
let yzRolling = false;
let yzLastSetup = null;
let yzAiBusy = false;
let yzQpLevel = 'medium';

const yzDelay = ms => new Promise(r => setTimeout(r, ms));

// ── Quick Play (vs AI) ────────────────────────────────────────
function yzSetQpLevel(lvl) {
  yzQpLevel = lvl;
  document.querySelectorAll('#yz-qp-diff .toggle-opt')
    .forEach(el => el.classList.toggle('active', el.dataset.lvl === lvl));
}

function yzStartQuickPlay() {
  const name = (document.getElementById('yz-qp-name').value || 'You').trim() || 'You';
  yzBeginGame({ numPlayers: 2, playerNames: [name, 'Computer'], aiLevels: [null, yzQpLevel] });
}

function yzBeginGame(opts) {
  yzLastSetup = opts;
  yzState = yzNewGame(opts);
  yzSelectedCat = null;
  yzAiBusy = false;
  yzShow('game');
  yzRender();
  yzMaybeRunAi();
}

function yzPlayAgain() {
  if (yzLastSetup) yzBeginGame(yzLastSetup);
  else yzShow('menu');
}

// ── Dice rendering ────────────────────────────────────────────
const YZ_PIPS = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function yzMakeDie(idx) {
  const die = document.createElement('div');
  die.className = 'die';
  die.dataset.idx = idx;
  for (let c = 0; c < 9; c++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    die.appendChild(cell);
  }
  return die;
}

function yzSetDieFace(die, face) {
  die.dataset.face = face;
  const on = YZ_PIPS[face] || [];
  Array.from(die.children).forEach((cell, i) => cell.classList.toggle('on', on.includes(i)));
}

function yzRenderDice() {
  const tray = document.getElementById('yz-dice');
  tray.innerHTML = '';

  // Split into the dice being re-rolled (top row) and the kept dice (bottom row).
  const activeIdx = [], heldIdx = [];
  for (let i = 0; i < YZ_NUM_DICE; i++) {
    if (yzState.rolledThisTurn && yzState.held[i]) heldIdx.push(i);
    else activeIdx.push(i);
  }
  heldIdx.sort((a, b) => yzState.dice[a] - yzState.dice[b]); // kept dice ascending

  const activeRow = document.createElement('div');
  activeRow.className = 'dice-row dice-row-active';
  for (const i of activeIdx) {
    const die = yzMakeDie(i);
    yzSetDieFace(die, yzState.rolledThisTurn ? yzState.dice[i] : 0); // blank before first roll
    activeRow.appendChild(die);
  }
  tray.appendChild(activeRow);

  if (heldIdx.length) {
    const heldRow = document.createElement('div');
    heldRow.className = 'dice-row dice-row-held';
    for (const i of heldIdx) {
      const die = yzMakeDie(i);
      die.classList.add('held');
      yzSetDieFace(die, yzState.dice[i]);
      heldRow.appendChild(die);
    }
    tray.appendChild(heldRow);
  }
}

// ── Scorecards ────────────────────────────────────────────────
function yzScorecardRows(player, isActive) {
  const s = player.scores;
  const showPreview = isActive && yzState.rolledThisTurn && !yzRolling;
  let html = '';

  const catRow = (cat) => {
    const meta = YZ_CATEGORY_META[cat];
    const filled = s[cat] != null;
    let cls = 'sc-row', val = '';
    if (filled) { cls += ' filled'; val = s[cat]; }
    else {
      cls += ' open';
      if (showPreview) {
        val = yzScoreCategory(cat, yzState.dice);
        if (yzSelectedCat === cat) cls += ' selected';
      } else { val = '–'; }
    }
    return `<div class="${cls}" data-cat="${cat}"><span class="sc-label">${meta.name}</span><span class="sc-val">${val}</span></div>`;
  };

  YZ_UPPER_CATS.forEach(c => html += catRow(c));
  const upSub = yzUpperSubtotal(s), bonus = yzUpperBonus(s);
  html += `<div class="sc-row subtotal"><span class="sc-label">Upper (${upSub}/63)</span><span class="sc-val">+${bonus}</span></div>`;
  YZ_LOWER_CATS.forEach(c => html += catRow(c));
  if (player.yahtzeeBonus > 0)
    html += `<div class="sc-row filled"><span class="sc-label">Yahtzee Bonus</span><span class="sc-val">${player.yahtzeeBonus}</span></div>`;
  return html;
}

function yzRenderScorecards() {
  const n = yzState.numPlayers;
  const leftCount = Math.ceil(n / 2);
  const left = document.getElementById('yz-cards-left');
  const right = document.getElementById('yz-cards-right');
  left.innerHTML = '';
  right.innerHTML = '';

  yzState.players.forEach((p, i) => {
    const active = i === yzState.currentPlayer && yzState.phase === 'PLAYING';
    const card = document.createElement('div');
    card.className = 'scorecard' + (active ? ' active' : '');
    card.dataset.player = i;
    card.innerHTML =
      `<div class="sc-head"><span>${p.name}</span><span class="sc-total">${yzPlayerTotal(p)}</span></div>` +
      `<div class="sc-rows">${yzScorecardRows(p, active)}</div>`;
    (i < leftCount ? left : right).appendChild(card);
  });
}

// ── Full render ───────────────────────────────────────────────
function yzRender() {
  if (yzState.phase === 'GAMEOVER') return yzRenderGameover();
  document.getElementById('yz-round').textContent = `Round ${yzState.round} / ${YZ_NUM_ROUNDS}`;
  document.getElementById('yz-turn').textContent = yzState.players[yzState.currentPlayer].name;
  document.getElementById('yz-rolls-left').textContent =
    `${yzState.rollsLeft} roll${yzState.rollsLeft === 1 ? '' : 's'} left`;
  yzRenderDice();
  yzRenderScorecards();
  yzUpdateControls();
}

function yzUpdateControls() {
  const rollBtn = document.getElementById('yz-roll-btn');
  const confirmBtn = document.getElementById('yz-confirm-btn');
  const hint = document.getElementById('yz-hint');

  const ai = yzState.players[yzState.currentPlayer].isAI && yzState.phase === 'PLAYING';
  rollBtn.disabled = yzRolling || yzState.rollsLeft <= 0 || ai;
  rollBtn.textContent = yzState.rolledThisTurn ? 'Roll Again' : 'Roll';
  confirmBtn.classList.toggle('hidden', ai || yzSelectedCat == null);

  if (ai) { hint.textContent = `${yzState.players[yzState.currentPlayer].name} is thinking…`; return; }
  if (yzRolling) hint.textContent = '';
  else if (!yzState.rolledThisTurn) hint.textContent = 'Tap Roll to start your turn.';
  else if (yzSelectedCat) hint.textContent = `Scoring ${YZ_CATEGORY_META[yzSelectedCat].name} — Confirm to lock it in.`;
  else if (yzState.rollsLeft > 0) hint.textContent = 'Tap dice to hold, roll again, or pick a category.';
  else hint.textContent = 'Pick a category to score.';
}

// ── Actions ───────────────────────────────────────────────────
function yzOnRoll() {
  if (yzRolling || yzState.rollsLeft <= 0 || yzState.phase !== 'PLAYING') return;
  yzSelectedCat = null;
  const rolling = [];
  for (let i = 0; i < YZ_NUM_DICE; i++) if (!yzState.held[i]) rolling.push(i);
  yzRoll(yzState); // sets final faces

  yzRolling = true;
  yzRenderDice();
  yzUpdateControls();

  const tray = document.getElementById('yz-dice');
  const dieEl = i => tray.querySelector(`.die[data-idx="${i}"]`);
  rolling.forEach(i => { const el = dieEl(i); if (el) el.classList.add('rolling'); });
  const spin = setInterval(() => {
    rolling.forEach(i => { const el = dieEl(i); if (el) yzSetDieFace(el, 1 + Math.floor(Math.random() * 6)); });
  }, 70);

  setTimeout(() => {
    clearInterval(spin);
    yzRolling = false;
    yzRender();
  }, 700);
}

function yzOnDieClick(idx) {
  if (yzRolling || !yzState.rolledThisTurn || yzState.rollsLeft <= 0) return;
  if (yzState.players[yzState.currentPlayer].isAI) return;
  yzToggleHold(yzState, idx);
  yzRenderDice();
}

function yzOnSelectCategory(cat) {
  if (yzRolling || !yzState.rolledThisTurn) return;
  if (yzState.players[yzState.currentPlayer].isAI) return;
  const p = yzState.players[yzState.currentPlayer];
  if (p.scores[cat] != null) return; // already used
  yzSelectedCat = (yzSelectedCat === cat) ? null : cat;
  yzRenderScorecards();
  yzUpdateControls();
}

function yzOnConfirm() {
  if (yzSelectedCat == null) return;
  yzScore(yzState, yzSelectedCat);
  yzSelectedCat = null;
  yzRender();
  yzMaybeRunAi();
}

// ── AI turn driver ────────────────────────────────────────────
function yzMaybeRunAi() {
  if (yzState && yzState.phase === 'PLAYING'
      && yzState.players[yzState.currentPlayer].isAI && !yzAiBusy) {
    yzRunAiTurn();
  }
}

async function yzRunAiTurn() {
  if (yzAiBusy) return;
  yzAiBusy = true;
  yzUpdateControls();

  await yzDelay(600);
  yzOnRoll();                       // first roll (+ tumble animation)
  await yzDelay(850);

  while (yzState.rollsLeft > 0) {
    const held = yzAiChooseHeld(yzState);
    for (let i = 0; i < YZ_NUM_DICE; i++) yzState.held[i] = held[i];
    yzRenderDice();
    await yzDelay(650);
    if (held.every(h => h)) break;  // AI keeps everything → stop rolling
    yzOnRoll();
    await yzDelay(850);
  }

  const cat = yzAiChooseCategory(yzState);
  yzSelectedCat = cat;              // highlight the chosen category
  yzRenderScorecards();
  await yzDelay(800);

  yzScore(yzState, cat);
  yzSelectedCat = null;
  yzAiBusy = false;
  yzRender();
  yzMaybeRunAi();                   // chain if the next player is also AI
}

// ── Gameover ──────────────────────────────────────────────────
function yzRenderGameover() {
  const standings = yzFinalStandings(yzState);
  const wrap = document.getElementById('yz-standings');
  wrap.innerHTML = standings.map((st, i) =>
    `<div class="st-row ${i === 0 ? 'winner' : ''}"><span>${i === 0 ? '🏆 ' : ''}${st.name}</span><span class="st-total">${st.total}</span></div>`
  ).join('');
  yzShow('gameover');
}

// ── Event delegation ──────────────────────────────────────────
document.addEventListener('click', (e) => {
  const die = e.target.closest('.die');
  if (die && die.closest('#yz-dice')) { yzOnDieClick(+die.dataset.idx); return; }
  const row = e.target.closest('.scorecard.active .sc-row.open');
  if (row && row.dataset.cat) { yzOnSelectCategory(row.dataset.cat); }
});

// Initialize setup defaults.
yzSetPlayerCount(2);
