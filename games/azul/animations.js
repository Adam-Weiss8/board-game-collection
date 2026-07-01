/**
 * animations.js
 * Visual animation system for Azul.
 * No dependencies on other game files.
 */

let speedMultiplier = 1.0;

function setAnimationSpeed(setting) {
  speedMultiplier = { slow: 2.0, normal: 1.0, fast: 0.4 }[setting] ?? 1.0;
}

const activeFlyingTiles = [];

function animateTileMove(from, to, color, onComplete) {
  const fromRect = from instanceof DOMRect ? from : from.getBoundingClientRect();
  const toRect   = to   instanceof DOMRect ? to   : to.getBoundingClientRect();

  const el = document.createElement('div');
  el.classList.add('tile', `tile-${color}`, 'flying-tile');

  const size = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--tile-size')) || 36;

  Object.assign(el.style, {
    width:      `${size}px`,
    height:     `${size}px`,
    left:       `${fromRect.left + (fromRect.width  - size) / 2}px`,
    top:        `${fromRect.top  + (fromRect.height - size) / 2}px`,
    transition: 'none',
    zIndex:     '1000',
    position:   'fixed',
  });

  document.body.appendChild(el);
  activeFlyingTiles.push(el);

  void el.offsetWidth; // force reflow

  const duration = 380 * speedMultiplier;

  el.style.transition = `left ${duration}ms cubic-bezier(0.4,0,0.2,1),
                          top  ${duration}ms cubic-bezier(0.4,0,0.2,1),
                          transform ${duration}ms ease`;
  el.style.left      = `${toRect.left + (toRect.width  - size) / 2}px`;
  el.style.top       = `${toRect.top  + (toRect.height - size) / 2}px`;
  el.style.transform = 'scale(1.15)';

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    el.style.transform = 'scale(1)';
    setTimeout(() => {
      el.remove();
      const idx = activeFlyingTiles.indexOf(el);
      if (idx !== -1) activeFlyingTiles.splice(idx, 1);
      if (onComplete) onComplete();
    }, 60 * speedMultiplier);
  };

  el.addEventListener('transitionend', cleanup, { once: true });
  setTimeout(cleanup, duration + 200 * speedMultiplier);

  return el;
}

function animateTilesMove(fromRect, toRect, color, count, onComplete) {
  if (count <= 0) { if (onComplete) onComplete(); return; }

  const stagger = 60 * speedMultiplier;
  let completed = 0;

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const fRect = new DOMRect(
        fromRect.left + (Math.random() - 0.5) * 8,
        fromRect.top  + (Math.random() - 0.5) * 8,
        fromRect.width,
        fromRect.height
      );
      animateTileMove(fRect, toRect, color, () => {
        completed++;
        if (completed === count && onComplete) onComplete();
      });
    }, i * stagger);
  }
}

function animateWallPlacement(slotEl, onComplete) {
  slotEl.classList.add('just-scored');
  setTimeout(() => {
    slotEl.classList.remove('just-scored');
    if (onComplete) onComplete();
  }, 650 * speedMultiplier);
}

function animateScore(points, anchor) {
  if (points === 0) return;

  const rect = anchor.getBoundingClientRect();
  const el   = document.createElement('div');
  el.classList.add('score-popup', points > 0 ? 'positive' : 'negative');
  el.textContent = points > 0 ? `+${points}` : `${points}`;

  // left is the horizontal centre of the anchor; CSS uses translateX(-50%)
  Object.assign(el.style, {
    left: `${rect.left + rect.width / 2}px`,
    top:  `${rect.top}px`,
    animationDuration: `${1.4 * speedMultiplier}s`,
  });

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600 * speedMultiplier);
}

function animateFloorPenalty(points, anchor) {
  animateScore(points, anchor);
}

function triggerParticleBurst(x, y, color, count) {
  count = count || 8;
  const cssColor = getTileCSSColor(color);

  for (let i = 0; i < count; i++) {
    const el    = document.createElement('div');
    el.classList.add('particle');

    const angle = (i / count) * Math.PI * 2;
    const dist  = 30 + Math.random() * 40;
    const px    = Math.cos(angle) * dist;
    const py    = Math.sin(angle) * dist;
    const dur   = (0.5 + Math.random() * 0.4) * speedMultiplier;

    Object.assign(el.style, {
      left: `${x}px`,
      top:  `${y}px`,
      background: cssColor,
      '--px': `${px}px`,
      '--py': `${py}px`,
      '--particle-dur': `${dur}s`,
      animationDuration: `${dur}s`,
    });

    document.body.appendChild(el);
    setTimeout(() => el.remove(), dur * 1200);
  }
}

function spawnConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  container.innerHTML = '';

  const colors = ['#2a7ef5','#f5c842','#e53e3e','#555','#e8e8e0','#c9a84c','#4caf76'];
  const count  = 120;

  for (let i = 0; i < count; i++) {
    const el       = document.createElement('div');
    el.classList.add('confetti-piece');
    const color    = colors[Math.floor(Math.random() * colors.length)];
    const left     = Math.random() * 100;
    const delay    = Math.random() * 3;
    const duration = 2.5 + Math.random() * 2.5;
    const size     = 6 + Math.random() * 10;

    Object.assign(el.style, {
      background:        color,
      left:              `${left}%`,
      width:             `${size}px`,
      height:            `${size}px`,
      animationDelay:    `${delay}s`,
      animationDuration: `${duration}s`,
      borderRadius:      Math.random() > 0.5 ? '50%' : '2px',
    });

    container.appendChild(el);
  }
}

function clearAllAnimations() {
  for (const el of activeFlyingTiles) el.remove();
  activeFlyingTiles.length = 0;
}

function getTileCSSColor(color) {
  return {
    blue:   '#2a7ef5',
    yellow: '#f5c842',
    red:    '#e53e3e',
    black:  '#555',
    white:  '#e8e8e0',
  }[color] || '#c9a84c';
}

function pulse(el) {
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
  setTimeout(() => el.classList.remove('pulse'), 500);
}

function flashScore(el) {
  el.classList.remove('score-flash');
  void el.offsetWidth;
  el.classList.add('score-flash');
  setTimeout(() => el.classList.remove('score-flash'), 450);
}
