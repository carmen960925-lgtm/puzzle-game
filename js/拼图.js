const ROWS = 5, COLS = 4;
const TOTAL = ROWS * COLS;
const PIECES = Array.from({ length: TOTAL }, (_, i) => `images/piece_${i}.png`);
const COMPACT_BREAKPOINT_PX = 860;

const $ = (s) => document.querySelector(s);
const puzzle = $('#puzzle');
const piecesLeft = $('#pieces-left');
const piecesRight = $('#pieces-right');
const piecesPool = $('#pieces-pool');
const gameArea = $('#game-area');
const scoreDiv = $('#score');
const completeOverlay = $('#completeOverlay');
const btnBack = $('#btnBack');
const btnRestart = $('#btnRestart');

let score = 0;
let dragging = null, origin = null;
let offsetX = 0, offsetY = 0;
let activePointerId = null;

function getLayoutMode() {
  const isNarrow = innerWidth <= COMPACT_BREAKPOINT_PX;
  const landscapeLike = innerWidth > innerHeight;
  return (isNarrow && !landscapeLike) ? 'POOL' : 'SIDE';
}

function updateProgress() {
  if (scoreDiv) scoreDiv.textContent = `进度：${score} / ${TOTAL}`;
}

function pulseSlot(slot) {
  slot.classList.add('correctPulse');
  setTimeout(() => slot.classList.remove('correctPulse'), 380);
}

function showComplete() {
  completeOverlay?.classList.add('show');
  completeOverlay?.setAttribute('aria-hidden', 'false');
}
function hideComplete() {
  completeOverlay?.classList.remove('show');
  completeOverlay?.setAttribute('aria-hidden', 'true');
}
completeOverlay?.addEventListener('click', hideComplete);

let audioCtx;
function ensureAudio() {
  audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function tone({ type = 'sine', f0 = 440, f1 = null, t0 = 0, dur = 0.12, gain = 0.10 }) {
  try {
    ensureAudio();
    const now = audioCtx.currentTime + t0;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;

    if (f1) {
      o.frequency.setValueAtTime(f0, now);
      o.frequency.exponentialRampToValueAtTime(f1, now + Math.max(0.01, dur * 0.7));
    } else {
      o.frequency.setValueAtTime(f0, now);
    }

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    o.connect(g); g.connect(audioCtx.destination);
    o.start(now); o.stop(now + dur + 0.01);
  } catch {}
}

const playTick = () => tone({ type: 'sine', f0: 880, dur: 0.13, gain: 0.10 });
const playBuzz = () => tone({ type: 'triangle', f0: 220, dur: 0.11, gain: 0.10 });

function playCelebrate() {
  tone({ type: 'triangle', f0: 660, f1: 990, dur: 0.19, gain: 0.14 });
  tone({ type: 'sine', f0: 880, f1: 1320, t0: 0.18, dur: 0.21, gain: 0.12 });
  [1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
    tone({ type: 'square', f0: f, t0: 0.10 + i * 0.06, dur: 0.055, gain: 0.06 })
  );
}

function updatePoolEmptyState() {
  [piecesLeft, piecesRight].forEach(el => {
    if (!el) return;
    el.classList.toggle('is-empty', el.querySelectorAll('.piece').length === 0);
  });
  
  if (!piecesPool || !gameArea) return;
  if (getLayoutMode() !== 'POOL') {
    gameArea.classList.remove('pool-hidden');
    return;
  }
  const empty = piecesPool.querySelectorAll('.piece').length === 0;
  piecesPool.classList.toggle('is-empty', empty);
  gameArea.classList.toggle('pool-hidden', empty);
}

function createPiece(src, index) {
  const p = document.createElement('div');
  p.className = 'piece';
  p.dataset.index = index;

  const img = new Image();
  img.src = src;
  img.draggable = false;
  p.appendChild(img);

  p.addEventListener('pointerdown', startDrag, { passive: false });
  return p;
}

function slotHitEnough(pieceEl, slotEl) {
  const a = pieceEl.getBoundingClientRect();
  const b = slotEl.getBoundingClientRect();
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return (x * y) / (a.width * a.height) > 0.6;
}

function applyDragStyle(el, r) {
  Object.assign(el.style, {
    width: `${r.width}px`,
    height: `${r.height}px`,
    position: 'fixed',
    left: '0px',
    top: '0px',
    margin: '0',
    zIndex: 9997,
    transform: 'translate(0px,0px)',
    pointerEvents: 'none'
  });
}

function clearDragStyle(el) {
  Object.assign(el.style, {
    position: '',
    left: '',
    top: '',
    width: '',
    height: '',
    margin: '',
    zIndex: '',
    transform: '',
    pointerEvents: ''
  });
}

function moveAt(x, y) {
  dragging.style.transform = `translate(${x - offsetX}px, ${y - offsetY}px)`;
}

function startDrag(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();

  dragging = e.currentTarget;
  origin = dragging.parentElement;
  activePointerId = e.pointerId;

  const r = dragging.getBoundingClientRect();
  offsetX = e.clientX - r.left;
  offsetY = e.clientY - r.top;

  applyDragStyle(dragging, r);
  document.body.appendChild(dragging);

  try { dragging.setPointerCapture(activePointerId); } catch {}
  moveAt(e.clientX, e.clientY);
}

function endDrag(e, cancelled = false) {
  if (!dragging) return;
  if (activePointerId !== null && e.pointerId !== activePointerId) return;

  e.preventDefault();
  try { dragging.releasePointerCapture(activePointerId); } catch {}

  if (!cancelled) {
    const idx = Number(dragging.dataset.index);
    const slots = document.querySelectorAll('.slot');
    let placed = false;

    slots.forEach((slot, i) => {
      if (placed) return;
      if (slot.children.length) return;
      if (!slotHitEnough(dragging, slot)) return;

      if (i === idx) {
        slot.appendChild(dragging.querySelector('img'));
        slot.classList.add('filled');

        pulseSlot(slot);
        playTick();

        dragging.remove();
        score++;
        placed = true;

        updateProgress();
        updatePoolEmptyState();

        if (score === TOTAL) {
          playCelebrate();
          showComplete();
        }
      }
    });

    if (!placed) {
      playBuzz();
      clearDragStyle(dragging);
      origin.appendChild(dragging);
      updateProgress();
    }
  } else {
    clearDragStyle(dragging);
    origin.appendChild(dragging);
  }

  dragging = null;
  origin = null;
  activePointerId = null;
}

document.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  e.preventDefault();
  moveAt(e.clientX, e.clientY);
}, { passive: false });

document.addEventListener('pointerup', (e) => endDrag(e, false), { passive: false });
document.addEventListener('pointercancel', (e) => endDrag(e, true), { passive: false });
window.addEventListener('blur', () => { if (dragging) endDrag({ pointerId: activePointerId, preventDefault(){} }, true); });

document.addEventListener('dragstart', (e) => {
  if (e.target?.tagName === 'IMG') e.preventDefault();
});

function relayoutLoosePieces() {
  if (dragging) return;

  const loose = [];
  [piecesLeft, piecesRight, piecesPool].forEach(c => {
    if (!c) return;
    loose.push(...c.querySelectorAll('.piece'));
  });

  if (piecesLeft) piecesLeft.innerHTML = '';
  if (piecesRight) piecesRight.innerHTML = '';
  if (piecesPool) piecesPool.innerHTML = '';

  if (getLayoutMode() === 'POOL') {
    loose.forEach(p => piecesPool.appendChild(p));
  } else {
    const half = Math.ceil(loose.length / 2);
    loose.forEach((p, i) => (i < half ? piecesLeft : piecesRight).appendChild(p));
  }

  updatePoolEmptyState();
}

function forceRelayout() {
  if (dragging) return;
  relayoutLoosePieces();
  setTimeout(() => { if (!dragging) relayoutLoosePieces(); }, 150);
}

function initGame() {
  puzzle.innerHTML = '';
  piecesLeft.innerHTML = '';
  piecesRight.innerHTML = '';
  piecesPool.innerHTML = '';

  score = 0;
  hideComplete();
  updateProgress();

  for (let i = 0; i < TOTAL; i++) {
    const s = document.createElement('div');
    s.className = 'slot';
    puzzle.appendChild(s);
  }

  const pieces = PIECES.map((src, i) => createPiece(src, i));
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }

  if (getLayoutMode() === 'POOL') {
    pieces.forEach(p => piecesPool.appendChild(p));
  } else {
    const half = Math.ceil(pieces.length / 2);
    pieces.forEach((p, i) => (i < half ? piecesLeft : piecesRight).appendChild(p));
  }

  updatePoolEmptyState();
}

window.initGame = initGame;
initGame();

window.addEventListener('resize', forceRelayout);
window.addEventListener('orientationchange', forceRelayout);
window.visualViewport?.addEventListener('resize', forceRelayout);

btnBack?.addEventListener('click', () => { /* 暂时留空 */ });
btnRestart?.addEventListener('click', initGame);
