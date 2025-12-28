const ROWS = 5, COLS = 4;
const PIECES = Array.from({ length: ROWS * COLS }, (_, i) => `images/piece_${i}.png`);

const puzzle = document.getElementById('puzzle');
const piecesLeft = document.getElementById('pieces-left');
const piecesRight = document.getElementById('pieces-right');
const piecesPool = document.getElementById('pieces-pool');
const scoreDiv = document.getElementById('score');
const feedback = document.getElementById('feedback');
const restartBtn = document.getElementById('restart');
const backBtn = document.getElementById('backBtn');

let score = 0;

// Drag state
let dragging = null;
let origin = null;
let offsetX = 0;
let offsetY = 0;
let activePointerId = null;

/* MUST match CSS media query breakpoint */
const COMPACT_BREAKPOINT_PX = 860;

function isCompactLayout() {
  return window.innerWidth <= COMPACT_BREAKPOINT_PX;
}

function createPiece(src, index) {
  const p = document.createElement('div');
  p.className = 'piece';
  p.dataset.index = index;

  const img = new Image();
  img.src = src;
  img.draggable = false; // prevent native drag ghost image

  p.appendChild(img);

  // passive:false so we can preventDefault on touch/pointer
  p.addEventListener('pointerdown', startDrag, { passive: false });
  return p;
}

function moveAt(clientX, clientY) {
  // using transform avoids layout thrash
  const x = clientX - offsetX;
  const y = clientY - offsetY;
  dragging.style.transform = `translate(${x}px, ${y}px)`;
}

function startDrag(e) {
  // Only left click for mouse
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  e.preventDefault();

  dragging = e.currentTarget;
  origin = dragging.parentElement;
  activePointerId = e.pointerId;

  const r = dragging.getBoundingClientRect();
  offsetX = e.clientX - r.left;
  offsetY = e.clientY - r.top;

  // Make it float above everything, and keep it "fixed" to viewport
  Object.assign(dragging.style, {
    width: `${r.width}px`,
    height: `${r.height}px`,
    position: 'fixed',
    left: '0px',
    top: '0px',
    margin: '0',
    zIndex: 9999,
    transform: 'translate(0px,0px)',
    pointerEvents: 'none' // avoid interfering with pointer stream / selection
  });

  // Move to body so it isn't clipped by any container
  document.body.appendChild(dragging);

  // IMPORTANT: capture pointer so we still receive pointerup even if pointer leaves element
  try { dragging.setPointerCapture(activePointerId); } catch {}

  moveAt(e.clientX, e.clientY);

  document.addEventListener('pointermove', onDrag, { passive: false });
  document.addEventListener('pointerup', onEnd, { passive: false });
  document.addEventListener('pointercancel', onCancel, { passive: false });
  window.addEventListener('blur', onCancel);
  document.addEventListener('dragstart', (e) => {
  if (e.target && e.target.tagName === 'IMG') e.preventDefault();
});

}

function onDrag(e) {
  if (!dragging) return;
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  e.preventDefault();
  moveAt(e.clientX, e.clientY);
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
  // Restore styles BEFORE re-inserting
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

function onCancel() {
  if (!dragging) return;

  cleanupDragListeners();

  // Release capture if possible
  try { dragging.releasePointerCapture(activePointerId); } catch {}

  // Put it back to where it came from
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
  let triedPlacement = false;

  const idx = Number(dragging.dataset.index);

  document.querySelectorAll('.slot').forEach((slot, i) => {
    if (placedCorrectly) return;

    if (!slot.children.length && overlapEnough(dragging, slot)) {
      triedPlacement = true;

      if (i === idx) {
        slot.appendChild(dragging.querySelector('img'));
        slot.classList.add('filled');
        dragging.remove(); // remove the floating .piece container
        score++;
        feedback.textContent = '答对了！';
        placedCorrectly = true;
      } else {
        feedback.textContent = '答错了……';
      }
    }
  });

  if (!placedCorrectly) {
    // If user tried to place but was wrong, still return piece to origin
    // If user dropped elsewhere, also return
    restoreDraggedElement(origin);
  }

  scoreDiv.textContent = `分数: ${score} / ${ROWS * COLS}`;

  dragging = null;
  origin = null;
  activePointerId = null;
}

/* Move remaining loose pieces between side-panels and pool when layout changes */
function relayoutLoosePieces() {
  if (dragging) return;

  const loosePieces = [];
  [piecesLeft, piecesRight, piecesPool].forEach(container => {
    loosePieces.push(...Array.from(container.querySelectorAll('.piece')));
  });

  piecesLeft.innerHTML = '';
  piecesRight.innerHTML = '';
  piecesPool.innerHTML = '';

  if (isCompactLayout()) {
    loosePieces.forEach(p => piecesPool.appendChild(p));
  } else {
    const half = Math.ceil(loosePieces.length / 2);
    loosePieces.forEach((p, i) => (i < half ? piecesLeft.appendChild(p) : piecesRight.appendChild(p)));
  }
}

function initGame() {
  puzzle.innerHTML = '';
  piecesLeft.innerHTML = '';
  piecesRight.innerHTML = '';
  piecesPool.innerHTML = '';

  score = 0;
  feedback.textContent = '';
  scoreDiv.textContent = `分数: 0 / ${ROWS * COLS}`;

  for (let i = 0; i < ROWS * COLS; i++) {
    const s = document.createElement('div');
    s.className = 'slot';
    puzzle.appendChild(s);
  }

  const pieces = PIECES.map((src, i) => createPiece(src, i));
  pieces.sort(() => Math.random() - 0.5);

  if (isCompactLayout()) {
    pieces.forEach(p => piecesPool.appendChild(p));
  } else {
    const half = Math.ceil(pieces.length / 2);
    pieces.forEach((p, i) => (i < half ? piecesLeft.appendChild(p) : piecesRight.appendChild(p)));
  }
}

initGame();
restartBtn.onclick = initGame;

backBtn.addEventListener('click', () => history.back());

/* Keep pieces visible when user resizes / rotates */
let lastCompact = isCompactLayout();
window.addEventListener('resize', () => {
  const nowCompact = isCompactLayout();
  if (nowCompact !== lastCompact) {
    lastCompact = nowCompact;
    relayoutLoosePieces();
  }
});