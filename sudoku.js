/* ---- SUDOKU ENGINE ---- */
function solveSudoku(board) {
  const empty = findEmpty(board);
  if (!empty) return true;
  const [r, c] = empty;
  for (let n = 1; n <= 9; n++) {
    if (isValid(board, r, c, n)) {
      board[r][c] = n;
      if (solveSudoku(board)) return true;
      board[r][c] = 0;
    }
  }
  return false;
}

function findEmpty(b) {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (b[r][c] === 0) return [r, c];
  return null;
}

function isValid(b, r, c, n) {
  if (b[r].includes(n)) return false;
  if (b.some(row => row[c] === n)) return false;
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (b[br + i][bc + j] === n) return false;
  return true;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateSolved() {
  const b = Array.from({ length: 9 }, () => Array(9).fill(0));
  [0, 3, 6].forEach(s => {
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        b[s + i][s + j] = nums[i * 3 + j];
  });
  solveSudoku(b);
  return b;
}

const CLUES = { baby: 50, easy: 40, medium: 32, hard: 26, expert: 22 };

function generatePuzzle(diff) {
  const solution = generateSolved();
  const puzzle = solution.map(r => [...r]);
  const cells = shuffle([...Array(81).keys()]);
  const remove = 81 - CLUES[diff];
  let removed = 0;
  for (const idx of cells) {
    if (removed >= remove) break;
    const r = Math.floor(idx / 9), c = idx % 9;
    puzzle[r][c] = 0;
    removed++;
  }
  return { puzzle, solution };
}

/* ---- STATE ---- */
let solution = [], puzzle = [], board = [], given = [], notes = [], selected = null, notesMode = false;
let mistakes = 0, hints = 3, history = [];
let timerInterval = null, elapsed = 0, gameActive = false;
let currentDiff = 'medium';
let audioEnabled = true;
let audioContext = null;
let masterGain = null;
let clickSoundBuffer = null;
let fireworksLayer = null;
let fireworksAnimationId = null;

/* ---- THEME ---- */
function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-theme', isLight);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('sudoku-theme', theme);
}

function initTheme() {
  const savedTheme = localStorage.getItem('sudoku-theme');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(savedTheme || systemTheme);
}

/* ---- AUDIO ---- */
function applySoundState() {
  const toggle = document.getElementById('sound-toggle');
  if (toggle) {
    toggle.textContent = audioEnabled ? '🔊' : '🔈';
    toggle.setAttribute('aria-pressed', String(audioEnabled));
  }
  localStorage.setItem('sudoku-sounds', audioEnabled ? 'on' : 'off');
}

function ensureAudio() {
  if (typeof window === 'undefined') return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(audioContext.destination);
  }
  if (audioContext.state === 'suspended') audioContext.resume();
}

async function loadClickSound() {
  if (clickSoundBuffer || typeof window === 'undefined') return;
  try {
    ensureAudio();
    const audioUrl = 'https://cdn.pixabay.com/download/audio/2024/04/01/audio_55caf28f71.mp3?filename=lightningbulb-spacebar-click-keyboard-199448.mp3';
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error(`Audio request failed with ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    if (!audioContext) return;
    clickSoundBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  } catch (error) {
    console.warn('Could not load click sound', error);
  }
}

function playClickSound() {
  if (!audioEnabled) return;
  if (typeof window === 'undefined') return;
  ensureAudio();
  if (!audioContext || !masterGain) return;

  if (clickSoundBuffer) {
    const source = audioContext.createBufferSource();
    source.buffer = clickSoundBuffer;
    source.connect(masterGain);
    source.start();
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();

  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(1800, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.03);

  filter.type = 'bandpass';
  filter.frequency.value = 2600;
  filter.Q.value = 0.7;

  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.06);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.07);
  window.setTimeout(() => {
    gain.disconnect();
    filter.disconnect();
  }, 90);
}

function toggleSound() {
  audioEnabled = !audioEnabled;
  applySoundState();
  if (!audioEnabled) return;
  ensureAudio();
}

function playFeedback(isCorrect) {
  if (!audioEnabled) return;
  if (typeof window === 'undefined') return;
  if (navigator.vibrate) navigator.vibrate(isCorrect ? [12] : [24]);

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  ensureAudio();
  if (!audioContext || !masterGain) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();

  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(isCorrect ? 900 : 620, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(isCorrect ? 1180 : 480, audioContext.currentTime + 0.06);

  filter.type = 'highpass';
  filter.frequency.value = 1200;
  filter.Q.value = 0.8;

  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.1);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.11);
  window.setTimeout(() => {
    gain.disconnect();
    filter.disconnect();
  }, 140);
}

/* ---- TIMER ---- */
function startTimer() {
  clearInterval(timerInterval);
  elapsed = 0;
  timerInterval = setInterval(() => {
    elapsed++;
    document.getElementById('timer-display').textContent = fmt(elapsed);
  }, 1000);
}

function fmt(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/* ---- INIT ---- */
function updateNavStatus() {
  const header = document.querySelector('nav');
  if (!header) return;
  header.className = `nav-${currentDiff}`;
}

function setupFireworks() {
  if (fireworksLayer) return fireworksLayer;
  fireworksLayer = document.createElement('div');
  fireworksLayer.className = 'fireworks-layer';
  fireworksLayer.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  fireworksLayer.appendChild(canvas);
  document.body.appendChild(fireworksLayer);

  const ctx = canvas.getContext('2d');
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);
  fireworksLayer.ctx = ctx;
  return fireworksLayer;
}

function launchFireworks() {
  const layer = setupFireworks();
  const ctx = layer.ctx;
  layer.classList.add('active');
  if (fireworksAnimationId) window.cancelAnimationFrame(fireworksAnimationId);

  const particles = [];
  const width = window.innerWidth;
  const height = window.innerHeight;
  const bursts = 5 + Math.floor(Math.random() * 3);

  const spawnBurst = (x, y) => {
    const hue = Math.random() * 360;
    const colors = [
      `hsl(${hue}, 85%, 62%)`,
      `hsl(${(hue + 35) % 360}, 80%, 58%)`,
      `hsl(${(hue + 120) % 360}, 78%, 56%)`,
      `hsl(${(hue + 200) % 360}, 82%, 60%)`,
      `hsl(${(hue + 280) % 360}, 76%, 54%)`
    ];
    for (let i = 0; i < 48; i++) {
      const angle = (Math.PI * 2 * i) / 48;
      const speed = 1.4 + Math.random() * 2.2;
      const color = colors[i % colors.length];
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.18 + Math.random() * 0.08,
        size: 1.4 + Math.random() * 1.8,
        color,
        alpha: 1,
      });
    }
  };

  for (let i = 0; i < bursts; i++) {
    const x = 80 + Math.random() * (width - 160);
    const y = 80 + Math.random() * (height - 220);
    setTimeout(() => spawnBurst(x, y), i * 110);
  }

  let startTime = performance.now();
  const animate = () => {
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= 0.04;
      p.vy += 0.012;
      p.x += p.vx;
      p.y += p.vy;
      p.alpha = Math.max(0, p.life / 0.24);
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 + p.alpha * 1.1), 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 16 + p.alpha * 24;
      ctx.shadowColor = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (particles.length > 0) {
      fireworksAnimationId = window.requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, width, height);
      layer.classList.remove('active');
      fireworksAnimationId = null;
    }
  };

  fireworksAnimationId = window.requestAnimationFrame(animate);
}

function startNewGame() {
  document.getElementById('win-overlay').classList.remove('show');
  document.getElementById('lose-overlay').classList.remove('show');
  const { puzzle: p, solution: sol } = generatePuzzle(currentDiff);
  solution = sol;
  puzzle = p.map(r => [...r]);
  board = p.map(r => [...r]);
  given = p.map(r => r.map(v => v !== 0));
  notes = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));
  selected = null; notesMode = false; mistakes = 0; hints = 3; history = [];
  gameActive = true;
  document.getElementById('hints-left').textContent = hints;
  updateNavStatus();
  updateMistakeDots();
  startTimer();
  renderBoard();
  updateNotesBtn();
}

/* ---- RENDER ---- */
function renderBoard() {
  const el = document.getElementById('board');
  el.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r; cell.dataset.c = c;

      if (c === 2 || c === 5) cell.classList.add('box-right');
      if (r === 2 || r === 5) cell.classList.add('box-bottom');
      if (r === 8) cell.classList.add('row-last');

      const val = board[r][c];
      const noteSet = notes[r][c];

      if (val !== 0) {
        cell.textContent = val;
        if (given[r][c]) cell.classList.add('given');
        else {
          cell.classList.add('user-cell');
          if (val !== solution[r][c]) cell.classList.add('error');
        }
      } else if (noteSet.size > 0) {
        const ng = document.createElement('div');
        ng.className = 'notes-grid';
        for (let n = 1; n <= 9; n++) {
          const s = document.createElement('span');
          s.textContent = noteSet.has(n) ? n : '';
          ng.appendChild(s);
        }
        cell.appendChild(ng);
      }

      if (selected) {
        const [sr, sc] = selected;
        const sv = board[sr][sc];
        const errorHighlight = sv !== 0 && sv !== solution[sr][sc];
        if (r === sr && c === sc) {
          cell.classList.add('selected');
        }
        if (sv !== 0) {
          if (!(r === sr && c === sc) && val === sv) {
            cell.classList.add('same-num');
            if (errorHighlight) cell.classList.add('same-num-error');
          }
        } else if (r === sr || c === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3))) {
          cell.classList.add('highlight');
          if (errorHighlight) cell.classList.add('highlight-error');
        }
      }

      cell.addEventListener('click', () => selectCell(r, c));
      el.appendChild(cell);
    }
  }
  updateNumpad();
}

function animateCell(r, c, type = 'pop') {
  const cell = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  if (!cell) return;
  cell.classList.remove('cell-pop', 'cell-error-shake');
  void cell.offsetWidth;
  cell.classList.add(type === 'error' ? 'cell-error-shake' : 'cell-pop');
  window.setTimeout(() => cell.classList.remove('cell-pop', 'cell-error-shake'), 320);
}

function selectCell(r, c) {
  selected = [r, c];
  renderBoard();
  animateCell(r, c, 'pop');
}

/* ---- INPUT ---- */
function enterNum(n) {
  if (!selected || !gameActive) return;
  const [r, c] = selected;
  if (given[r][c]) return;

  if (notesMode && n !== 0) {
    history.push({ type: 'note', r, c, notes: new Set(notes[r][c]), val: board[r][c] });
    if (notes[r][c].has(n)) notes[r][c].delete(n);
    else notes[r][c].add(n);
  } else {
    history.push({ type: 'val', r, c, prev: board[r][c], notes: new Set(notes[r][c]) });
    board[r][c] = n;
    notes[r][c].clear();
    if (n !== 0) {
      for (let i = 0; i < 9; i++) {
        notes[r][i].delete(n);
        notes[i][c].delete(n);
      }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          notes[br + i][bc + j].delete(n);
    }
    if (n !== 0 && n !== solution[r][c]) {
      mistakes++;
      updateMistakeDots();
      if (mistakes >= 3) {
        gameActive = false;
        clearInterval(timerInterval);
        document.getElementById('lose-overlay').classList.add('show');
      }
    }
    if (isSolved()) winGame();
  }
  renderBoard();

  if (n !== 0) {
    const isCorrect = n === solution[r][c];
    animateCell(r, c, isCorrect ? 'pop' : 'error');
    playFeedback(isCorrect);
  }
}

function isSolved() {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (board[r][c] !== solution[r][c]) return false;
  return true;
}

function winGame() {
  gameActive = false;
  clearInterval(timerInterval);
  const overlay = document.getElementById('win-overlay');
  document.getElementById('final-time').textContent = fmt(elapsed);
  document.getElementById('final-diff').textContent = currentDiff.charAt(0).toUpperCase() + currentDiff.slice(1);
  overlay.classList.add('show');
  window.setTimeout(() => {
    launchFireworks();
  }, 80);
}

function updateMistakeDots() {
  document.querySelectorAll('.mistake-dot').forEach((d, i) => d.classList.toggle('used', i < mistakes));
}

/* ---- ACTIONS ---- */
function erase() {
  if (!selected || !gameActive) return;
  const [r, c] = selected;
  if (given[r][c]) return;
  history.push({ type: 'val', r, c, prev: board[r][c], notes: new Set(notes[r][c]) });
  board[r][c] = 0;
  renderBoard();
}

function toggleNotes() {
  notesMode = !notesMode;
  updateNotesBtn();
}

function updateNotesBtn() {
  document.getElementById('btn-notes').classList.toggle('active', notesMode);
  document.getElementById('btn-notes').textContent = notesMode ? '✎ Notes ON' : '✎ Notes';
}

function hint() {
  if (!gameActive || hints <= 0) return;
  if (!selected) return;
  const [r, c] = selected;
  if (given[r][c] || board[r][c] === solution[r][c]) return;
  hints--;
  document.getElementById('hints-left').textContent = hints;
  board[r][c] = solution[r][c];
  notes[r][c].clear();
  renderBoard();
}

function undo() {
  if (!history.length) return;
  const last = history.pop();
  if (last.type === 'val') { board[last.r][last.c] = last.prev; notes[last.r][last.c] = last.notes; }
  else { notes[last.r][last.c] = last.notes; }
  renderBoard();
}

/* ---- NUMPAD ---- */
function buildNumpad() {
  const np = document.getElementById('numpad');
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement('button');
    b.className = 'num-btn'; b.textContent = n;
    b.addEventListener('click', () => enterNum(n));
    np.appendChild(b);
  }
}

function updateNumpad() {
  const counts = Array(10).fill(0);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const value = board[r][c];
      if (value !== 0) counts[value]++;
    }
  }
  document.querySelectorAll('.num-btn').forEach(button => {
    const n = parseInt(button.textContent, 10);
    const hide = counts[n] >= 9;
    button.hidden = hide;
    button.style.display = hide ? 'none' : '';
  });
}

/* ---- KEYBOARD ---- */
document.addEventListener('keydown', e => {
  if (!gameActive) return;
  if (e.key >= '1' && e.key <= '9') { enterNum(parseInt(e.key)); return; }
  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { erase(); return; }
  if (!selected) return;
  let [r, c] = selected;
  if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
  else if (e.key === 'ArrowDown') r = Math.min(8, r + 1);
  else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
  else if (e.key === 'ArrowRight') c = Math.min(8, c + 1);
  else return;
  e.preventDefault();
  selectCell(r, c);
});

/* ---- DIFFICULTY BUTTONS ---- */
document.querySelectorAll('.diff-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    currentDiff = b.dataset.diff;
    updateNavStatus();
  });
});

/* ---- BOOT ---- */
document.getElementById('new-game-btn').addEventListener('click', startNewGame);
document.getElementById('play-again-btn').addEventListener('click', startNewGame);
document.getElementById('try-again-btn').addEventListener('click', startNewGame);
document.getElementById('btn-erase').addEventListener('click', erase);
document.getElementById('btn-notes').addEventListener('click', toggleNotes);
document.getElementById('btn-hint').addEventListener('click', hint);
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('theme-toggle').addEventListener('click', () => {
  const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
  applyTheme(nextTheme);
});
document.getElementById('sound-toggle').addEventListener('click', toggleSound);
document.addEventListener('click', event => {
  const target = event.target;
  if (target instanceof HTMLElement && (target.closest('button') || target.closest('.cell'))) {
    playClickSound();
  }
});

initTheme();
const savedSound = localStorage.getItem('sudoku-sounds');
audioEnabled = savedSound !== 'off';
applySoundState();
loadClickSound();
buildNumpad();
startNewGame();
window.launchFireworks = launchFireworks;
