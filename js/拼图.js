/* ===== Config ===== */
const ROWS = 5, COLS = 4;
const TOTAL = ROWS * COLS;
const PIECES = Array.from({ length: TOTAL }, (_, i) => `images/piece_${i}.png`);
const COMPACT_BREAKPOINT_PX = 860;

/* ===== DOM ===== */
const puzzle = document.getElementById('puzzle');
const piecesLeft = document.getElementById('pieces-left');
const piecesRight = document.getElementById('pieces-right');
const piecesPool = document.getElementById('pieces-pool');
const scoreDiv = document.getElementById('score');
const completeOverlay = document.getElementById('completeOverlay');
const gameArea = document.getElementById('game-area');

const btnBack = document.getElementById('btnBack');
const btnRestart = document.getElementById('btnRestart');

/* ===== State ===== */
let score = 0;

// Drag state
let dragging = null;
let origin = null;
let offsetX = 0;
let offsetY = 0;
let activePointerId = null;

/* ===== Layout mode (match CSS) =====
   - phone portrait (<=860 & portrait): POOL (top)
   - phone landscape (<=860 & landscape): SIDE
   - desktop (>860): SIDE
*/
function getLayoutMode() {
  const isNarrow = window.innerWidth <= COMPACT_BREAKPOINT_PX;
  const landscapeLike = window.innerWidth > window.innerHeight;
  return (isNarrow && !landscapeLike) ? 'POOL' : 'SIDE';
}

function updateProgress(){
  scoreDiv.textContent = `进度：${score} / ${TOTAL}`;
}

/* ===== Feedback ===== */
function pulseSlot(slotEl){
  slotEl.classList.add('correctPulse');
  setTimeout(()=>slotEl.classList.remove('correctPulse'), 380);
}

/* ===== Sound (no external files) ===== */
let audioCtx;

function ensureAudio(){
  audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTick(){
  try{
    ensureAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;

    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.10, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);

    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.13);
  }catch(e){}
}

function playBuzz(){
  try{
    ensureAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.value = 220;

    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.10, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.10);

    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.11);
  }catch(e){}
}

function playCelebrate(){
  try{
    ensureAudio();
    const now = audioCtx.currentTime;

    // 旋律上扬两声
    const o1 = audioCtx.createOscillator();
    const g1 = audioCtx.createGain();
    o1.type = 'triangle';
    o1.frequency.setValueAtTime(660, now);
    o1.frequency.exponentialRampToValueAtTime(990, now + 0.12);
    g1.gain.setValueAtTime(0.0001, now);
    g1.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    o1.connect(g1); g1.connect(audioCtx.destination);
    o1.start(now); o1.stop(now + 0.19);

    const o2 = audioCtx.createOscillator();
    const g2 = audioCtx.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(880, now + 0.18);
    o2.frequency.exponentialRampToValueAtTime(1320, now + 0.33);
    g2.gain.setValueAtTime(0.0001, now + 0.18);
    g2.gain.exponentialRampToValueAtTime(0.12, now + 0.20);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    o2.connect(g2); g2.connect(audioCtx.destination);
    o2.start(now + 0.18); o2.stop(now + 0.39);

    // 彩带感音符
    const notes = [1046.5, 1318.5, 1568, 2093];
    notes.forEach((f, i) => {
      const t = now + 0.10 + i * 0.06;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.055);
    });
  }catch(e){}
}

/* ===== Complete overlay ===== */
function showComplete(){
  completeOverlay.classList.add('show');
  completeOverlay.setAttribute('aria-hidden','false');
}
function hideComplete(){
  completeOverlay.classList.remove('show');
  completeOverlay.setAttribute('aria-hidden','true');
}
completeOverlay.addEventListener('click', hideComplete);

/* ===== Pool empty state ===== */
function updatePoolEmptyState(){
  // 左右（桌面/横屏）：空了去框
  [piecesLeft, piecesRight].forEach(el => {
    if (!el) return;
    const empty = el.querySelectorAll('.piece').length === 0;
    el.classList.toggle('is-empty', empty);
  });

  // 竖屏 pool：空了整块收起，并消除行间距
  const mode = getLayoutMode();
  if (piecesPool && gameArea && mode === 'POOL'){
    const empty = piecesPool.querySelectorAll('.piece').length === 0;
    piecesPool.classList.toggle('is-empty', empty);
    gameArea.classList.toggle('pool-hidden', empty);
  } else if (gameArea) {
    gameArea.classList.remove('pool-hidden');
  }
}

/* ===== Piece factory ===== */
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

/* ===== Drag helpers ===== */
function moveAt(clientX, clientY) {
  const x = clientX - offsetX;
  const y = clientY - offsetY;
  dragging.style.transform = `translate(${x}px, ${y}px)`;
}

function overlapEnough(d, s) {
  const a = d.getBoundingClientRect();
  const b = s.getBoundingClientRect();
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return (x * y) / (a.width * a.height) > 0.6;
}

function cleanupDragListeners() {
  document.removeEventListener('pointermove', onDrag);
  document.removeEventListener('pointerup', onEnd);
  document.removeEventListener('pointercancel', onCancel);
  window.removeEventListener('blur', onCancel);
}

function restoreDraggedElement(toParent) {
  Object.assign(dragging.style, {
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
  toParent.appendChild(dragging);
}

/* ===== Drag events ===== */
function startDrag(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  e.preventDefault();

  dragging = e.currentTarget;
  origin = dragging.parentElement;
  activePointerId = e.pointerId;

  const r = dragging.getBoundingClientRect();
  offsetX = e.clientX - r.left;
  offsetY = e.clientY - r.top;

  Object.assign(dragging.style, {
    width: `${r.width}px`,
    height: `${r.height}px`,
    position: 'fixed',
    left: '0px',
    top: '0px',
    margin: '0',
    zIndex: 9997,          // 低于 bottomBar(9998) / overlay(9999)
    transform: 'translate(0px,0px)',
    pointerEvents: 'none'
  });

  document.body.appendChild(dragging);

  try { dragging.setPointerCapture(activePointerId); } catch {}
  moveAt(e.clientX, e.clientY);

  document.addEventListener('pointermove', onDrag, { passive: false });
  document.addEventListener('pointerup', onEnd, { passive: false });
  document.addEventListener('pointercancel', onCancel, { passive: false });
  window.addEventListener('blur', onCancel);
}

function onDrag(e) {
  if (!dragging) return;
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  e.preventDefault();
  moveAt(e.clientX, e.clientY);
}

function onCancel() {
  if (!dragging) return;

  cleanupDragListeners();
  try { dragging.releasePointerCapture(activePointerId); } catch {}

  restoreDraggedElement(origin);

  dragging = null;
  origin = null;
  activePointerId = null;
}

function onEnd(e) {
  if (!dragging) return;
  if (activePointerId !== null && e.pointerId !== activePointerId) return;

  e.preventDefault();
  cleanupDragListeners();
  try { dragging.releasePointerCapture(activePointerId); } catch {}

  let placedCorrectly = false;
  const idx = Number(dragging.dataset.index);

  const slots = document.querySelectorAll('.slot');
  slots.forEach((slot, i) => {
    if (placedCorrectly) return;

    if (!slot.children.length && overlapEnough(dragging, slot)) {
      if (i === idx) {
        slot.appendChild(dragging.querySelector('img'));
        slot.classList.add('filled');

        pulseSlot(slot);
        playTick();

        dragging.remove();
        score++;
        placedCorrectly = true;

        updatePoolEmptyState();

        if (score === TOTAL) {
          playCelebrate();
          showComplete();
        }
      }
    }
  });

  if (!placedCorrectly) {
    playBuzz();
    restoreDraggedElement(origin);
  }

  updateProgress();

  dragging = null;
  origin = null;
  activePointerId = null;
}

/* ===== Relayout when resize/rotate ===== */
function relayoutLoosePieces() {
  if (dragging) return;

  const containers = [piecesLeft, piecesRight, piecesPool].filter(Boolean);
  const loosePieces = containers.flatMap(c => Array.from(c.querySelectorAll('.piece')));

  piecesLeft.innerHTML = '';
  piecesRight.innerHTML = '';
  piecesPool.innerHTML = '';

  const mode = getLayoutMode();
  if (mode === 'POOL') {
    loosePieces.forEach(p => piecesPool.appendChild(p));
  } else {
    const half = Math.ceil(loosePieces.length / 2);
    loosePieces.forEach((p, i) => (i < half ? piecesLeft.appendChild(p) : piecesRight.appendChild(p)));
  }

  updatePoolEmptyState();
}

function forceRelayout(){
  if (dragging) return;
  relayoutLoosePieces();
  setTimeout(() => { if (!dragging) relayoutLoosePieces(); }, 150);
}

/* ===== Init ===== */
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
  pieces.sort(() => Math.random() - 0.5);

  const mode = getLayoutMode();
  if (mode === 'POOL') {
    pieces.forEach(p => piecesPool.appendChild(p));
  } else {
    const half = Math.ceil(pieces.length / 2);
    pieces.forEach((p, i) => (i < half ? piecesLeft.appendChild(p) : piecesRight.appendChild(p)));
  }

  updatePoolEmptyState();
}

/* expose for other pages if needed */
window.initGame = initGame;

initGame();

/* Prevent native drag ghost image for IMG */
document.addEventListener('dragstart', (e) => {
  if (e.target && e.target.tagName === 'IMG') e.preventDefault();
});

window.addEventListener('resize', forceRelayout);
window.addEventListener('orientationchange', forceRelayout);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', forceRelayout);
}

/* Bottom buttons */
if (btnBack) {
  btnBack.addEventListener('click', () => {
    return; // 暂时留空
  });
}
if (btnRestart) {
  btnRestart.addEventListener('click', initGame);
}
