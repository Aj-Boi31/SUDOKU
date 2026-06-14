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
let mpActive = false;
let blindMode = false;
let mpMode = 'race';        // 'race' | 'team'
let mpTeams = [];           // e.g. [[0,1],[2,3]]
let mpMyTeam = -1;
let mpPeerSelections = {};  // { slot: [r,c] } teammate cursor positions
let mpPlayerNames = {};     // { slot: 'Name' }
let mpMyName = '';

/* ---- THEME ---- */
function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-theme', isLight);
  const menuBtn = document.getElementById('menu-theme-toggle');
  if (menuBtn) { menuBtn.textContent = isLight ? '☀️ Light Theme' : '🌙 Dark Theme'; menuBtn.classList.toggle('active', isLight); }
  const navBtn = document.getElementById('nav-theme-btn');
  if (navBtn) navBtn.textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('sudoku-theme', theme);
}

function initTheme() {
  const savedTheme = localStorage.getItem('sudoku-theme');
  applyTheme(savedTheme || 'light');
}

/* ---- AUDIO ---- */
function applySoundState() {
  const menuBtn = document.getElementById('menu-sound-toggle');
  if (menuBtn) { menuBtn.textContent = audioEnabled ? '🔊 Sound' : '🔈 Sound'; menuBtn.classList.toggle('active', audioEnabled); }
  const navBtn = document.getElementById('nav-sound-btn');
  if (navBtn) navBtn.textContent = audioEnabled ? '🔊' : '🔇';
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

/* ---- BLIND MODE ---- */
function applyBlindMode() {
  ['menu-blind-toggle', 'mp-setup-blind-toggle'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) { btn.textContent = blindMode ? 'ON' : 'OFF'; btn.classList.toggle('active', blindMode); }
  });
  document.body.classList.toggle('blind-active', blindMode);
  localStorage.setItem('sudoku-blind', blindMode ? 'on' : 'off');
}

function toggleBlindMode() {
  if (gameActive) return; // can't switch blind mode mid-game
  blindMode = !blindMode;
  applyBlindMode();
  renderBoard();
}

function isBoardFull() {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (board[r][c] === 0) return false;
  return true;
}

function showBlindError() {
  const boardEl = document.getElementById('board');
  if (boardEl) {
    boardEl.classList.remove('board-blind-shake');
    void boardEl.offsetWidth;
    boardEl.classList.add('board-blind-shake');
    setTimeout(() => boardEl.classList.remove('board-blind-shake'), 500);
  }
  mpToast('Not quite — erase a cell and try a different number', 4000);
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
  ['baby','easy','medium','hard','expert'].forEach(d => header.classList.remove(`nav-${d}`));
  header.classList.add(`nav-${currentDiff}`);
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
  if (fireworksAnimationId) cancelAnimationFrame(fireworksAnimationId);

  const W = window.innerWidth, H = window.innerHeight;

  const PALETTES = [
    ['#ff4757','#ff6b81','#ffb3c1'],
    ['#ffd32a','#ffdd59','#fff0a0'],
    ['#2ed573','#7bed9f','#c0f5d3'],
    ['#1e90ff','#74b9ff','#b8d8ff'],
    ['#a29bfe','#c7b2ff','#e0d5ff'],
    ['#fd79a8','#ffb3d1','#ffe0ee'],
    ['#ff6348','#ff8c75','#ffccc4'],
    ['#00cec9','#55efc4','#a8fae8'],
  ];

  const shells = [];   // rising rockets
  const bursts = [];   // arrays of particles per explosion

  function spawnShell() {
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const x = W * 0.12 + Math.random() * W * 0.76;
    const targetY = H * 0.08 + Math.random() * H * 0.42;
    const vy = -Math.sqrt(2 * 0.38 * (H - targetY));
    shells.push({ x, y: H, vy, targetY, palette, trail: [], done: false });
  }

  function spawnBurst(x, y, palette) {
    const pts = [];
    const count = 80 + Math.floor(Math.random() * 50);
    const style = Math.floor(Math.random() * 4);

    for (let i = 0; i < count; i++) {
      let angle = (Math.PI * 2 * i) / count, spd;
      if      (style === 0) spd = 3.5 + Math.random() * 2.5;
      else if (style === 1) spd = (i % 7 === 0 ? 7.5 : 2.5) + Math.random() * 1.5;
      else if (style === 2) { angle = Math.random() * Math.PI * 2; spd = Math.random() * 7 + 1; }
      else                  spd = 3 + Math.random() * 1.2;

      pts.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 0.8,
        color: palette[Math.floor(Math.random() * palette.length)],
        alpha: 1, size: 1.8 + Math.random() * 2.2,
        drag: 0.962, gravity: 0.052,
        decay: 0.012 + Math.random() * 0.008,
        trail: [], glow: true,
      });
    }
    // white glitter sparks
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2, spd = 1.5 + Math.random() * 8;
      pts.push({
        x, y,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 0.5,
        color: '#ffffff',
        alpha: 1, size: 0.9 + Math.random() * 1,
        drag: 0.955, gravity: 0.09,
        decay: 0.02 + Math.random() * 0.018,
        trail: [], glow: false,
        phase: Math.random() * Math.PI * 2,
      });
    }
    bursts.push(pts);
  }

  // stagger shell launches
  const shellCount = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < shellCount; i++)
    setTimeout(spawnShell, i * 270 + Math.random() * 130);

  const animate = () => {
    ctx.clearRect(0, 0, W, H);

    // ── shells ──
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      if (s.done) { shells.splice(i, 1); continue; }

      s.trail.unshift({ x: s.x, y: s.y });
      if (s.trail.length > 14) s.trail.pop();
      s.vy += 0.38;
      s.y  += s.vy;

      // warm trail
      for (let t = 0; t < s.trail.length; t++) {
        const a = (1 - t / s.trail.length) * 0.65;
        const r = (1 - t / s.trail.length) * 2.8;
        ctx.beginPath();
        ctx.arc(s.trail[t].x, s.trail[t].y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,200,70,${a})`;
        ctx.fill();
      }
      // head glow
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fffde0';
      ctx.shadowBlur = 16; ctx.shadowColor = '#ffd700';
      ctx.fill(); ctx.shadowBlur = 0;

      if (s.y <= s.targetY || s.vy >= 0) {
        spawnBurst(s.x, s.y, s.palette);
        s.done = true;
      }
    }

    // ── burst particles ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let b = bursts.length - 1; b >= 0; b--) {
      const pts = bursts[b];
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        p.alpha -= p.decay;
        if (p.alpha <= 0) { pts.splice(i, 1); continue; }

        p.vx *= p.drag; p.vy *= p.drag; p.vy += p.gravity;
        p.x  += p.vx;  p.y  += p.vy;
        p.trail.unshift({ x: p.x, y: p.y });
        if (p.trail.length > 5) p.trail.pop();

        let da = p.alpha;
        if (p.phase !== undefined) {
          p.phase += 0.28;
          da *= 0.45 + 0.55 * Math.abs(Math.sin(p.phase));
        }

        // trail lines
        for (let t = 1; t < p.trail.length; t++) {
          ctx.beginPath();
          ctx.moveTo(p.trail[t - 1].x, p.trail[t - 1].y);
          ctx.lineTo(p.trail[t].x,     p.trail[t].y);
          ctx.strokeStyle  = p.color;
          ctx.globalAlpha  = ((p.trail.length - t) / p.trail.length) * da * 0.55;
          ctx.lineWidth    = p.size * 0.55;
          ctx.stroke();
        }

        // dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.3, p.size * da), 0, Math.PI * 2);
        ctx.fillStyle   = p.color;
        ctx.globalAlpha = da;
        if (p.glow) { ctx.shadowBlur = 8 + da * 14; ctx.shadowColor = p.color; }
        ctx.fill();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      if (pts.length === 0) bursts.splice(b, 1);
    }

    ctx.restore();

    if (shells.length > 0 || bursts.length > 0) {
      fireworksAnimationId = requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, W, H);
      layer.classList.remove('active');
      fireworksAnimationId = null;
    }
  };

  fireworksAnimationId = requestAnimationFrame(animate);
}

function startNewGame() {
  if (mpActive) mpDestroy();
  document.getElementById('win-overlay').classList.remove('show');
  document.getElementById('lose-overlay').classList.remove('show');
  document.getElementById('play-again-btn').style.display = '';
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
  if (!board.length) return;
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
          if (!blindMode && val !== solution[r][c]) cell.classList.add('error');
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
            if (!blindMode && errorHighlight) cell.classList.add('same-num-error');
          }
        } else if (r === sr || c === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3))) {
          cell.classList.add('highlight');
          if (!blindMode && errorHighlight) cell.classList.add('highlight-error');
        }
      }

      if (mpActive && mpMode === 'team') {
        const peersHere = Object.entries(mpPeerSelections)
          .filter(([, pos]) => pos[0] === r && pos[1] === c)
          .map(([s]) => parseInt(s));
        if (peersHere.length) {
          const cursor = document.createElement('div');
          cursor.className = 'peer-cursor';
          cursor.style.setProperty('--peer-color', CURSOR_COLORS[peersHere[0] % CURSOR_COLORS.length]);
          cell.appendChild(cursor);
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
  if (mpActive && mpMode === 'team') {
    for (const ts of mpMyTeammates()) {
      const sel = mpPeerSelections[ts];
      if (sel && sel[0] === r && sel[1] === c) {
        animateCell(r, c, 'error');
        return; // cell locked by teammate
      }
    }
    mpSendSelect(r, c);
  }
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
    if (blindMode) {
      if (isBoardFull()) {
        if (isSolved()) winGame();
        else showBlindError();
      }
    } else {
      if (n !== 0 && n !== solution[r][c]) {
        mistakes++;
        updateMistakeDots();
        if (mistakes >= 3) {
          gameActive = false;
          clearInterval(timerInterval);
          if (mpActive && mpMode === 'team') {
            if (mpIsHost && !mpTeamWinSent) {
              mpTeamWinSent = true;
              const winTeamIdx = mpTeams.findIndex((_, i) => i !== mpMyTeam);
              if (winTeamIdx !== -1) {
                mpBroadcast({ type: 'TEAM_WIN', team: winTeamIdx, t: elapsed });
                mpShowTeamWin(winTeamIdx, elapsed);
              }
            } else if (!mpIsHost) {
              mpNotifyLose();
              document.getElementById('lose-overlay').classList.add('show');
            }
          } else {
            mpNotifyLose();
            if (mpIsHost) mpCheckAllDone();
            document.getElementById('lose-overlay').classList.add('show');
          }
        }
      }
      if (isSolved()) winGame();
    }
  }
  renderBoard();
  if (mpActive && mpMode === 'team' && !notesMode) mpSendTeamCell(r, c, n);
  if (mpActive) mpSendProgress();

  if (n !== 0) {
    if (blindMode) {
      animateCell(r, c, 'pop');
    } else {
      const isCorrect = n === solution[r][c];
      animateCell(r, c, isCorrect ? 'pop' : 'error');
      playFeedback(isCorrect);
    }
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
  if (mpActive && mpMode === 'team') {
    if (!mpTeamWinSent) {
      mpTeamWinSent = true;
      if (mpIsHost) {
        mpBroadcast({ type: 'TEAM_WIN', team: mpMyTeam, t: elapsed });
      } else if (mpConn && mpConn.open) {
        mpConn.send({ type: 'TEAM_WIN', t: elapsed });
      }
    }
    mpShowTeamWin(mpMyTeam, elapsed);
    return;
  }
  if (mpActive) {
    mpHandleMyWin();
    return;
  }
  const overlay = document.getElementById('win-overlay');
  overlay.querySelector('.overlay-emoji').textContent = '🎉';
  overlay.querySelector('h2').textContent = 'Solved!';
  overlay.querySelector('p').textContent = "Well played. Here's your time:";
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
  notes[r][c].clear();
  renderBoard();
  if (mpActive && mpMode === 'team') mpSendTeamCell(r, c, 0);
  if (mpActive) mpSendProgress();
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
  const n = solution[r][c];
  board[r][c] = n;
  notes[r][c].clear();
  for (let i = 0; i < 9; i++) { notes[r][i].delete(n); notes[i][c].delete(n); }
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) notes[br + i][bc + j].delete(n);
  renderBoard();
  if (mpActive && mpMode === 'team') mpSendTeamCell(r, c, n);
  if (mpActive) mpSendProgress();
  if (blindMode) {
    if (isBoardFull() && isSolved()) winGame();
  } else {
    if (isSolved()) winGame();
  }
}

function undo() {
  if (!history.length) return;
  const last = history.pop();
  if (last.type === 'val') {
    board[last.r][last.c] = last.prev;
    notes[last.r][last.c] = last.notes;
    if (mpActive && mpMode === 'team') mpSendTeamCell(last.r, last.c, last.prev);
  } else {
    notes[last.r][last.c] = last.notes;
  }
  renderBoard();
  if (mpActive) mpSendProgress();
}

/* ---- NUMPAD ---- */
function buildNumpad() {
  const np = document.getElementById('numpad');
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement('button');
    b.className = 'num-btn'; b.textContent = n; b.dataset.n = n;
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
    const n = parseInt(button.textContent, 10) || parseInt(button.dataset.n, 10);
    if (!n) return;
    const hide = counts[n] >= 9;
    if (hide && !button.hidden) {
      button.classList.add('num-complete');
      setTimeout(() => {
        button.hidden = true;
        button.style.display = 'none';
        button.classList.remove('num-complete');
      }, 350);
    } else if (!hide) {
      button.hidden = false;
      button.style.display = '';
    }
  });
}

/* ---- KEYBOARD ---- */
document.addEventListener('keydown', e => {
  if (!gameActive) return;
  if (e.key >= '1' && e.key <= '9') { enterNum(parseInt(e.key)); return; }
  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { erase(); return; }
  if (e.key === 'n' || e.key === 'N') { toggleNotes(); return; }
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

/* ---- SCREEN TRANSITIONS ---- */
function showGame() {
  document.body.classList.remove('in-menu');
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('nav-menu-btn').style.display = '';
  const game = document.getElementById('game-screen');
  game.classList.remove('visible');
  void game.offsetWidth;
  setTimeout(() => game.classList.add('visible'), 30);
}

function showMenu() {
  gameActive = false;
  clearInterval(timerInterval);
  if (mpActive) mpDestroy();
  document.getElementById('win-overlay').classList.remove('show');
  document.getElementById('lose-overlay').classList.remove('show');
  document.getElementById('game-screen').classList.remove('visible');
  document.getElementById('nav-menu-btn').style.display = 'none';
  ['baby','easy','medium','hard','expert'].forEach(d =>
    document.querySelector('nav').classList.remove(`nav-${d}`)
  );
  setTimeout(() => {
    document.getElementById('menu-screen').classList.remove('hidden');
    document.body.classList.add('in-menu');
  }, 50);
}

/* ---- DIFFICULTY BUTTONS ---- */
document.querySelectorAll('.diff-btn').forEach(b => {
  b.addEventListener('click', () => {
    const row = b.closest('.mc-diff-row, .mp-setup-diff-row');
    if (row) row.querySelectorAll('.diff-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    currentDiff = b.dataset.diff;
  });
});

/* ---- BOOT ---- */
document.getElementById('play-again-btn').addEventListener('click', () => { if (mpActive) { mpRestartLobby(); return; } startNewGame(); });
document.getElementById('try-again-btn').addEventListener('click', () => { if (mpActive) { mpRestartLobby(); return; } startNewGame(); });
document.getElementById('btn-erase').addEventListener('click', erase);
document.getElementById('btn-notes').addEventListener('click', toggleNotes);
document.getElementById('btn-hint').addEventListener('click', hint);
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('menu-play-btn').addEventListener('click', () => { startNewGame(); showGame(); });
document.getElementById('menu-mp-btn').addEventListener('click', () => mpShowScreen('mp-screen-choose'));
document.getElementById('nav-menu-btn').addEventListener('click', () => {
  if (gameActive && !window.confirm('Leave game? Your progress will be lost.')) return;
  showMenu();
});
document.getElementById('mc-settings-header').addEventListener('click', () => {
  const card = document.getElementById('mc-settings');
  const open = card.classList.toggle('open');
  document.getElementById('mc-settings-header').setAttribute('aria-expanded', open);
});
document.getElementById('menu-sound-toggle').addEventListener('click', toggleSound);
document.getElementById('nav-sound-btn').addEventListener('click', toggleSound);
document.getElementById('menu-blind-toggle').addEventListener('click', toggleBlindMode);
document.getElementById('menu-theme-toggle').addEventListener('click', () => {
  applyTheme(document.body.classList.contains('light-theme') ? 'dark' : 'light');
});
document.getElementById('nav-theme-btn').addEventListener('click', () => {
  applyTheme(document.body.classList.contains('light-theme') ? 'dark' : 'light');
});
document.getElementById('win-menu-btn').addEventListener('click', showMenu);
document.getElementById('lose-menu-btn').addEventListener('click', showMenu);
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
blindMode = localStorage.getItem('sudoku-blind') === 'on';
applyBlindMode();
loadClickSound();
buildNumpad();
injectDecoBackgrounds();
window.launchFireworks = launchFireworks;

/* clone the menu's abstract-shapes SVG into the game screen and overlays
   so every screen shares the same themed decoration (single source) */
function injectDecoBackgrounds() {
  const src = document.querySelector('.menu-bg svg');
  if (!src) return;
  const targets = [
    document.getElementById('game-screen'),
    document.getElementById('win-overlay'),
    document.getElementById('lose-overlay'),
    document.getElementById('mp-overlay'),
  ];
  targets.forEach(el => {
    if (!el || el.querySelector(':scope > .deco-bg')) return;
    const layer = document.createElement('div');
    layer.className = 'deco-bg';
    layer.setAttribute('aria-hidden', 'true');
    layer.appendChild(src.cloneNode(true));
    el.insertBefore(layer, el.firstChild);
  });
}

/* ---- MULTIPLAYER (UP TO 4 PLAYERS) ---- */
const MP_COLORS = ['#7c6af5', '#ff6b6b', '#ffd93d', '#6bcb77'];
// cursor colors: vivid, distinct from each other, distinct from the purple selection highlight
const CURSOR_COLORS = ['#f43f5e', '#22d3ee', '#f97316', '#a3e635'];
const MP_MAX = 4;

let mpPeer = null;
let mpIsHost = false;
let mpMySlot = 0;
let mpConns = [];    // host only: [{conn, slot}]
let mpConn = null;   // client only: connection to host
let mpPlayers = [];  // [{slot, correct, done, rank, active}] × MP_MAX
let mpFinishRank = 0;
let mpTeamWinSent = false;

/* helpers */
function mpRandCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

function mpCountCorrect() {
  let n = 0;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (!given[r][c] && board[r][c] !== 0 && board[r][c] === solution[r][c]) n++;
  return n;
}

function mpCountTotal() {
  let n = 0;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (!given[r][c]) n++;
  return n;
}

function mpOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function mpInitState(mySlot) {
  mpMySlot = mySlot;
  mpFinishRank = 0;
  mpTeamWinSent = false;
  mpTeams = [];
  mpMyTeam = -1;
  mpPeerSelections = {};
  mpPlayerNames = {};
  mpPlayers = Array.from({ length: MP_MAX }, (_, i) => ({
    slot: i, correct: 0, done: false, rank: null, active: false,
  }));
  mpPlayers[0].active = true;
}

/* team helpers */
function mpMyTeammates() {
  if (mpMode !== 'team' || !mpTeams.length) return [];
  const team = mpTeams.find(t => t.includes(mpMySlot));
  return team ? team.filter(s => s !== mpMySlot) : [];
}
function mpTeamOf(slot) {
  return mpTeams.findIndex(t => t.includes(slot));
}
function mpBuildTeams(activeSlots) {
  const sorted = [...activeSlots].sort((a, b) => a - b);
  const mid = Math.ceil(sorted.length / 2);
  return [sorted.slice(0, mid), sorted.slice(mid)];
}

/* host: relay msg to all teammates of fromSlot (excluding fromSlot) */
function mpHostRelayToTeam(msg, fromSlot) {
  const teamIdx = mpTeamOf(fromSlot);
  if (teamIdx === -1) return;
  mpTeams[teamIdx].forEach(s => {
    if (s === fromSlot) return;
    if (s === 0) { mpApplyPeerMsg({ ...msg, slot: fromSlot }); return; }
    const c = mpConns.find(x => x.slot === s);
    if (c && c.conn.open) c.conn.send({ ...msg, slot: fromSlot });
  });
}

/* host: send host's own CELL/SELECT to host's teammates */
function mpHostSendToMyTeam(msg) {
  if (mpTeamOf(0) === -1) return;
  mpTeams[mpTeamOf(0)].forEach(s => {
    if (s === 0) return;
    const c = mpConns.find(x => x.slot === s);
    if (c && c.conn.open) c.conn.send({ ...msg, slot: 0 });
  });
}

/* apply a received teammate CELL or SELECT */
function mpApplyPeerMsg(data) {
  if (!gameActive) return;
  const slot = data.slot;
  if (data.type === 'SELECT') {
    if (data.r === -1) delete mpPeerSelections[slot];
    else mpPeerSelections[slot] = [data.r, data.c];
    renderBoard();
  } else if (data.type === 'CELL') {
    board[data.r][data.c] = data.val;
    if (data.val !== 0) notes[data.r][data.c].clear();
    renderBoard();
    if (mpActive) mpSendProgress();
    if (isSolved()) winGame();
  }
}

/* send cursor position to teammates */
function mpSendSelect(r, c) {
  if (!mpActive || mpMode !== 'team') return;
  const msg = { type: 'SELECT', r, c };
  if (mpIsHost) mpHostSendToMyTeam(msg);
  else if (mpConn && mpConn.open) mpConn.send(msg);
}

/* send a cell change to teammates */
function mpSendTeamCell(r, c, val) {
  if (!mpActive || mpMode !== 'team') return;
  const msg = { type: 'CELL', r, c, val };
  if (mpIsHost) mpHostSendToMyTeam(msg);
  else if (mpConn && mpConn.open) mpConn.send(msg);
}

/* broadcast helpers (host only) */
function mpBroadcast(msg) {
  mpConns.forEach(({ conn }) => { if (conn.open) conn.send(msg); });
}
function mpBroadcastExcept(msg, skipSlot) {
  mpConns.forEach(({ conn, slot }) => { if (slot !== skipSlot && conn.open) conn.send(msg); });
}

/* send this player's progress update */
function mpCountProgress() {
  if (blindMode) {
    let n = 0;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (!given[r][c] && board[r][c] !== 0) n++;
    return n;
  }
  return mpCountCorrect();
}

function mpSendProgress() {
  if (!mpActive) return;
  const n = mpCountProgress();
  mpPlayers[mpMySlot].correct = n;
  mpUpdateBars();
  if (mpIsHost) {
    mpBroadcast({ type: 'PROGRESS', slot: mpMySlot, n });
  } else if (mpConn && mpConn.open) {
    mpConn.send({ type: 'PROGRESS', n });
  }
}

/* notify others I hit 3 mistakes */
function mpNotifyLose() {
  if (!mpActive) return;
  mpPlayers[mpMySlot].done = true;
  if (mpIsHost) {
    mpBroadcast({ type: 'LOSE', slot: mpMySlot });
  } else if (mpConn && mpConn.open) {
    mpConn.send({ type: 'LOSE' });
  }
}

/* rebuild live progress bars for all active players */
function mpUpdateBars() {
  const container = document.getElementById('mp-status');
  if (!container || !mpActive) return;
  const total = mpCountTotal();
  container.innerHTML = '';
  if (mpMode === 'team' && mpTeams.length) {
    mpTeams.forEach((team, ti) => {
      const activeTeam = team.filter(s => mpPlayers[s]?.active);
      if (!activeTeam.length) return;
      const isMyTeam = team.includes(mpMySlot);
      const teamProgress = Math.max(...activeTeam.map(s => mpPlayers[s]?.correct || 0));
      const pct = total > 0 ? Math.round((teamProgress / total) * 100) : 0;
      const color = MP_COLORS[team[0]];
      const names = activeTeam.map(s => {
        if (s === mpMySlot) return 'You';
        return mpPlayerNames[s] || `P${s + 1}`;
      }).join(' & ');
      const row = document.createElement('div');
      row.className = 'mp-row mp-team-row' + (isMyTeam ? ' mp-row-me' : '');
      row.innerHTML = `<div class="mp-team-header">
          <span class="mp-team-label">${isMyTeam ? '🫂' : '⚔'} ${names}</span>
          <span class="mp-pct">${pct}%</span>
        </div>
        <div class="mp-bar-wrap"><div class="mp-bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
      container.appendChild(row);
    });
    return;
  }
  mpPlayers.forEach(p => {
    if (!p.active) return;
    const isMe = p.slot === mpMySlot;
    const pct = total > 0 ? Math.round((p.correct / total) * 100) : 0;
    const color = MP_COLORS[p.slot];
    const label = isMe ? 'You' : (mpPlayerNames[p.slot] || `Player ${p.slot + 1}`);
    const badge = (p.rank && typeof p.rank === 'number')
      ? `<span class="mp-rank-badge">${p.rank}${mpOrdinal(p.rank)}</span>` : '';
    const row = document.createElement('div');
    row.className = 'mp-row' + (isMe ? ' mp-row-me' : '');
    row.innerHTML = `<span class="mp-name">${label}</span>
      <div class="mp-bar-wrap"><div class="mp-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <span class="mp-pct">${pct}%</span>${badge}`;
    container.appendChild(row);
  });
}

/* toast when someone else finishes */
function mpToast(msg, duration = 3000) {
  let t = document.getElementById('mp-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'mp-toast';
    t.className = 'mp-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

function mpShowSetup() {
  document.querySelectorAll('#mp-screen-setup .diff-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.diff === currentDiff);
  });
  document.querySelectorAll('.mp-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mpMode);
  });
  const nameInput = document.getElementById('mp-player-name');
  if (nameInput && mpMyName) nameInput.value = mpMyName;
  applyBlindMode();
  mpShowScreen('mp-screen-setup');
}

function mpShowScreen(id) {
  document.querySelectorAll('.mp-screen').forEach(s => { s.style.display = 'none'; });
  const el = document.getElementById(id);
  if (el) el.style.display = '';
  document.getElementById('mp-overlay').classList.add('show');
}

function mpHideOverlay() {
  document.getElementById('mp-overlay').classList.remove('show');
}

function mpDestroy() {
  mpActive = false;
  mpConns = [];
  mpConn = null;
  if (mpPeer) { try { mpPeer.destroy(); } catch (e) {} mpPeer = null; }
  const s = document.getElementById('mp-status');
  s.style.display = 'none';
  s.innerHTML = '';
  document.getElementById('game-screen').classList.remove('mp-layout');
}

function mpCheckAllDone() {
  if (!mpIsHost || !mpActive) return;
  const active = mpPlayers.filter(p => p.active);
  if (active.length > 0 && active.every(p => p.done)) {
    mpBroadcast({ type: 'GAME_OVER' });
    mpHandleGameOver();
  }
}

function mpHandleGameOver() {
  if (document.getElementById('lose-overlay').classList.contains('show')) {
    mpToast('All players finished — tap Try Again to rematch', 5000);
  }
}

/* go back to lobby for a rematch without tearing down connections */
function mpRestartLobby() {
  const active = mpPlayers.filter(p => p.active);
  if (active.some(p => !p.done)) {
    mpToast('Waiting for all players to finish…');
    return;
  }
  document.getElementById('win-overlay').classList.remove('show');
  document.getElementById('lose-overlay').classList.remove('show');
  gameActive = false;
  clearInterval(timerInterval);
  mpPlayers.forEach(pl => { pl.correct = 0; pl.done = false; pl.rank = null; });
  mpFinishRank = 0;
  mpTeamWinSent = false;
  mpPeerSelections = {};
  const s = document.getElementById('mp-status');
  s.style.display = 'none';
  s.innerHTML = '';
  if (mpIsHost) {
    mpUpdateWaitingRoom();
    mpShowScreen('mp-screen-wait');
  } else {
    mpShowScreen('mp-screen-lobby');
  }
}

/* called from winGame() when mpActive — show ranked result */
function mpHandleMyWin() {
  if (mpIsHost) {
    mpFinishRank++;
    const rank = mpFinishRank;
    mpPlayers[mpMySlot].done = true;
    mpPlayers[mpMySlot].rank = rank;
    mpUpdateBars();
    mpBroadcast({ type: 'WIN', slot: mpMySlot, rank, t: elapsed });
    mpCheckAllDone();
    mpShowEndResult(rank);
  } else {
    // estimate rank from what we know locally
    const rank = mpPlayers.filter(p => p.active && typeof p.rank === 'number').length + 1;
    mpPlayers[mpMySlot].done = true;
    mpPlayers[mpMySlot].rank = rank;
    mpUpdateBars();
    if (mpConn && mpConn.open) mpConn.send({ type: 'WIN', t: elapsed });
    mpShowEndResult(rank);
  }
}

function mpShowEndResult(rank) {
  const medals = { 1: '🏆', 2: '🥈', 3: '🥉', 4: '🎖' };
  const ov = document.getElementById('win-overlay');
  ov.querySelector('.overlay-emoji').textContent = medals[rank] || '🎖';
  ov.querySelector('h2').textContent = rank === 1 ? 'You Won!' : `${rank}${mpOrdinal(rank)} Place`;
  ov.querySelector('p').textContent = rank === 1
    ? 'You solved it first — champion!'
    : `You finished in ${rank}${mpOrdinal(rank)} place!`;
  document.getElementById('final-time').textContent = fmt(elapsed);
  document.getElementById('final-diff').textContent =
    currentDiff.charAt(0).toUpperCase() + currentDiff.slice(1);
  ov.classList.add('show');
  if (rank === 1) setTimeout(launchFireworks, 80);
}

function mpShowTeamWin(teamIdx, t) {
  // mark all active players done so mpRestartLobby() isn't blocked
  mpPlayers.forEach(pl => { if (pl.active) pl.done = true; });
  const isMyTeam = teamIdx === mpMyTeam;
  const ov = document.getElementById('win-overlay');
  ov.querySelector('.overlay-emoji').textContent = isMyTeam ? '🏆' : '💪';
  ov.querySelector('h2').textContent = isMyTeam ? 'Your Team Won!' : 'Your Team Lost';
  ov.querySelector('p').textContent = isMyTeam
    ? 'Great teamwork — you solved it first!'
    : 'The other team solved it first. Good effort!';
  document.getElementById('final-time').textContent = fmt(t);
  document.getElementById('final-diff').textContent =
    currentDiff.charAt(0).toUpperCase() + currentDiff.slice(1);
  ov.classList.add('show');
  if (isMyTeam) setTimeout(launchFireworks, 80);
}

/* ---- HOST LOGIC ---- */
function mpUpdateWaitingRoom() {
  const count = mpConns.length + 1;
  const startBtn = document.getElementById('mp-start-btn');
  if (startBtn) {
    startBtn.disabled = count < 2;
    startBtn.textContent = mpMode === 'team' && count < 4
      ? `Start Game (${count}/4 for full teams)` : 'Start Game';
  }
  const list = document.getElementById('mp-player-list');
  if (!list) return;
  const slots = list.querySelectorAll('.mp-slot');
  const mid = Math.ceil(count / 2);
  const teamTag = i => mpMode === 'team' ? ` · ${i < mid ? '🔵 A' : '🔴 B'}` : '';
  slots[0].textContent = `👑 ${mpPlayerNames[0] || 'You'} (Host)${teamTag(0)}`;
  slots[0].className = 'mp-slot mp-slot-host';
  for (let i = 1; i < MP_MAX; i++) {
    if (i <= mpConns.length) {
      slots[i].textContent = (mpPlayerNames[i] || `Player ${i + 1}`) + teamTag(i);
      slots[i].className = 'mp-slot mp-slot-filled';
    } else {
      slots[i].textContent = 'Waiting…';
      slots[i].className = 'mp-slot mp-slot-empty';
    }
  }
}

function mpSetupHostClientConn(connection) {
  if (mpConns.length >= MP_MAX - 1 || mpActive) {
    connection.on('open', () => {
      try { connection.send({ type: 'FULL' }); } catch (e) {}
      setTimeout(() => { try { connection.close(); } catch (e) {} }, 300);
    });
    return;
  }
  const slot = mpConns.length + 1;
  mpConns.push({ conn: connection, slot });
  mpPlayers[slot].active = true;
  const peerName = connection.metadata?.name || `Player ${slot + 1}`;
  mpPlayerNames[slot] = peerName;

  connection.on('open', () => {
    const count = mpConns.length + 1;
    connection.send({ type: 'WELCOME', slot, count, names: { ...mpPlayerNames } });
    mpBroadcast({ type: 'PLAYER_JOIN', count, slot, names: { ...mpPlayerNames } });
    mpUpdateWaitingRoom();
  });

  connection.on('data', data => {
    const pName = mpPlayerNames[slot] || `Player ${slot + 1}`;
    if (data.type === 'PROGRESS') {
      mpPlayers[slot].correct = data.n;
      mpBroadcastExcept({ type: 'PROGRESS', slot, n: data.n }, slot);
      if (mpActive) mpUpdateBars();
    } else if (data.type === 'WIN') {
      if (!mpPlayers[slot].done) {
        mpFinishRank++;
        const rank = mpFinishRank;
        mpPlayers[slot].done = true;
        mpPlayers[slot].rank = rank;
        mpBroadcastExcept({ type: 'WIN', slot, rank, t: data.t }, slot);
        if (mpActive) {
          mpUpdateBars();
          mpToast(`${pName} finished ${rank}${mpOrdinal(rank)}! 🏁`, 5000);
        }
        mpCheckAllDone();
      }
    } else if (data.type === 'LOSE') {
      if (mpMode === 'team' && !mpTeamWinSent) {
        mpTeamWinSent = true;
        const loseTeamIdx = mpTeamOf(slot);
        const winTeamIdx = mpTeams.findIndex((_, i) => i !== loseTeamIdx);
        if (winTeamIdx !== -1) {
          mpBroadcast({ type: 'TEAM_WIN', team: winTeamIdx, t: elapsed });
          gameActive = false;
          clearInterval(timerInterval);
          document.getElementById('lose-overlay').classList.remove('show');
          mpShowTeamWin(winTeamIdx, elapsed);
        }
      } else if (mpMode !== 'team') {
        mpPlayers[slot].done = true;
        mpBroadcastExcept({ type: 'LOSE', slot }, slot);
        if (mpActive) {
          mpUpdateBars();
          mpToast(`${pName} got 3 mistakes 💀`);
        }
        mpCheckAllDone();
      }
    } else if (data.type === 'SELECT') {
      mpHostRelayToTeam({ type: 'SELECT', r: data.r, c: data.c }, slot);
    } else if (data.type === 'CELL') {
      mpHostRelayToTeam({ type: 'CELL', r: data.r, c: data.c, val: data.val }, slot);
    } else if (data.type === 'TEAM_WIN') {
      if (!mpTeamWinSent) {
        mpTeamWinSent = true;
        const winTeam = mpTeamOf(slot);
        mpBroadcastExcept({ type: 'TEAM_WIN', team: winTeam, t: data.t }, slot);
        if (mpActive) {
          gameActive = false;
          clearInterval(timerInterval);
          document.getElementById('lose-overlay').classList.remove('show');
          mpShowTeamWin(winTeam, data.t);
        }
      }
    }
  });

  connection.on('close', () => {
    mpConns = mpConns.filter(c => c.slot !== slot);
    mpPlayers[slot].active = false;
    delete mpPeerSelections[slot];
    if (mpActive) {
      mpBroadcast({ type: 'PLAYER_LEAVE', slot });
      mpUpdateBars();
      renderBoard();
      const pName = mpPlayerNames[slot] || `Player ${slot + 1}`;
      if (mpMode === 'team' && mpTeamOf(slot) === mpMyTeam) {
        mpToast(`Your teammate ${pName} disconnected 💔`);
      } else {
        mpToast(`${pName} left the game`);
      }
    } else {
      mpUpdateWaitingRoom();
    }
  });
}

function mpCreate() {
  mpIsHost = true;
  mpInitState(0);
  mpPlayerNames[0] = mpMyName || 'Host';
  const code = mpRandCode();
  if (mpPeer) { try { mpPeer.destroy(); } catch (e) {} }
  mpPeer = new Peer(code);

  mpPeer.on('open', id => {
    document.getElementById('room-code-display').textContent = id;
    mpUpdateWaitingRoom();
    mpShowScreen('mp-screen-wait');
  });

  mpPeer.on('connection', conn => mpSetupHostClientConn(conn));
  mpPeer.on('error', err => {
    if (err.type === 'unavailable-id') mpCreate();
    else mpShowScreen('mp-screen-choose');
  });
}

function mpHostStartGame() {
  if (mpConns.length === 0) return;
  const activeSlots = [0, ...mpConns.map(c => c.slot)];
  const teams = mpMode === 'team' ? mpBuildTeams(activeSlots) : [];
  const { puzzle: p, solution: sol } = generatePuzzle(currentDiff);
  mpBroadcast({
    type: 'START',
    puzzle: p.map(r => [...r]),
    solution: sol.map(r => [...r]),
    diff: currentDiff,
    mode: mpMode,
    teams,
    names: { ...mpPlayerNames },
    blind: blindMode,
  });
  mpDoStart(p, sol, currentDiff, mpMode, teams, { ...mpPlayerNames }, blindMode);
}

/* ---- CLIENT LOGIC ---- */
function mpUpdateLobby(count) {
  const t = document.getElementById('mp-lobby-text');
  if (t) t.textContent = `${count} / ${MP_MAX} players joined. Waiting for host…`;
  const list = document.getElementById('mp-lobby-player-list');
  if (!list) return;
  const slots = list.querySelectorAll('.mp-slot');
  for (let i = 0; i < MP_MAX; i++) {
    const isMe = i === mpMySlot;
    if (mpPlayers[i] && mpPlayers[i].active) {
      const name = mpPlayerNames[i] || (i === 0 ? 'Host' : `Player ${i + 1}`);
      const prefix = i === 0 ? '👑 ' : (isMe ? '★ ' : '');
      slots[i].textContent = prefix + name;
      slots[i].className = 'mp-slot ' + (isMe ? 'mp-slot-host' : 'mp-slot-filled');
    } else {
      slots[i].textContent = 'Waiting…';
      slots[i].className = 'mp-slot mp-slot-empty';
    }
  }
}

function mpHandleHostMsg(data) {
  if (data.type === 'WELCOME') {
    mpMySlot = data.slot;
    mpPlayers[data.slot].active = true;
    if (data.names) mpPlayerNames = { ...data.names };
  } else if (data.type === 'PLAYER_JOIN') {
    for (let i = 0; i < data.count; i++) mpPlayers[i].active = true;
    if (data.names) mpPlayerNames = { ...data.names };
    mpUpdateLobby(data.count);
  } else if (data.type === 'START') {
    mpDoStart(data.puzzle, data.solution, data.diff, data.mode, data.teams, data.names, data.blind ?? false);
  } else if (data.type === 'PROGRESS') {
    mpPlayers[data.slot].correct = data.n;
    if (mpActive) mpUpdateBars();
  } else if (data.type === 'WIN') {
    mpPlayers[data.slot].done = true;
    mpPlayers[data.slot].rank = data.rank;
    if (mpActive) {
      mpUpdateBars();
      if (data.slot !== mpMySlot) {
        const pName = mpPlayerNames[data.slot] || `Player ${data.slot + 1}`;
        mpToast(`${pName} finished ${data.rank}${mpOrdinal(data.rank)}! 🏁`);
      }
    }
  } else if (data.type === 'LOSE') {
    mpPlayers[data.slot].done = true;
    if (mpActive) {
      mpUpdateBars();
      if (data.slot !== mpMySlot) {
        const pName = mpPlayerNames[data.slot] || `Player ${data.slot + 1}`;
        mpToast(`${pName} got 3 mistakes 💀`);
      }
    }
  } else if (data.type === 'PLAYER_LEAVE') {
    const leaveName = mpPlayerNames[data.slot] || `Player ${data.slot + 1}`;
    mpPlayers[data.slot].active = false;
    delete mpPeerSelections[data.slot];
    if (mpActive) {
      mpUpdateBars();
      renderBoard();
      if (mpMode === 'team' && mpTeamOf(data.slot) === mpMyTeam) {
        mpToast(`Your teammate ${leaveName} disconnected 💔`);
      } else {
        mpToast(`${leaveName} left the game`);
      }
    }
  } else if (data.type === 'FULL') {
    document.getElementById('mp-error').textContent = 'Room is full or game has already started.';
    mpShowScreen('mp-screen-join');
  } else if (data.type === 'SELECT') {
    mpApplyPeerMsg({ type: 'SELECT', r: data.r, c: data.c, slot: data.slot });
  } else if (data.type === 'CELL') {
    mpApplyPeerMsg({ type: 'CELL', r: data.r, c: data.c, val: data.val, slot: data.slot });
  } else if (data.type === 'TEAM_WIN') {
    if (!mpTeamWinSent) {
      mpTeamWinSent = true;
      gameActive = false;
      clearInterval(timerInterval);
      document.getElementById('lose-overlay').classList.remove('show');
      mpShowTeamWin(data.team, data.t);
    }
  } else if (data.type === 'GAME_OVER') {
    mpHandleGameOver();
  }
}

function mpJoin(code) {
  mpIsHost = false;
  mpInitState(-1);

  if (mpPeer) { try { mpPeer.destroy(); } catch (e) {} }
  mpPeer = new Peer();

  mpPeer.on('open', () => {
    mpShowScreen('mp-screen-connecting');
    const connection = mpPeer.connect(code, { reliable: true, metadata: { name: mpMyName || 'Player' } });
    mpConn = connection;

    connection.on('data', data => {
      mpHandleHostMsg(data);
      if (data.type === 'WELCOME') {
        mpUpdateLobby(data.count);
        mpShowScreen('mp-screen-lobby');
      }
    });

    connection.on('close', () => {
      if (!mpActive) {
        // disconnected in lobby before game started
        mpDestroy();
        mpHideOverlay();
        showMenu();
        mpToast('📡 Host disconnected — create a new room to play again');
      } else if (gameActive) {
        gameActive = false;
        clearInterval(timerInterval);
        mpDestroy();
        const ov = document.getElementById('win-overlay');
        ov.querySelector('.overlay-emoji').textContent = '📡';
        ov.querySelector('h2').textContent = 'Host Left';
        ov.querySelector('p').textContent = 'Go back to the menu and create a new room to play again.';
        document.getElementById('final-time').textContent = '';
        document.getElementById('final-diff').textContent = '';
        document.getElementById('play-again-btn').style.display = 'none';
        ov.classList.add('show');
      }
    });

    connection.on('error', () => {
      document.getElementById('mp-error').textContent = 'Could not connect. Check the code.';
      mpShowScreen('mp-screen-join');
    });

    setTimeout(() => {
      if (mpMySlot === -1 && !mpActive) {
        document.getElementById('mp-error').textContent = 'Connection timed out. Check the code.';
        mpShowScreen('mp-screen-join');
      }
    }, 12000);
  });

  mpPeer.on('error', () => {
    document.getElementById('mp-error').textContent = 'Failed to connect. Try again.';
    mpShowScreen('mp-screen-join');
  });
}

/* ---- SHARED GAME START ---- */
function mpDoStart(p, sol, diff, mode = 'race', teams = [], names = {}, blind = false) {
  mpMode = mode;
  mpTeams = teams || [];
  blindMode = blind;
  applyBlindMode();
  mpPlayerNames = names || {};
  mpMyTeam = mpTeamOf(mpMySlot);
  mpTeamWinSent = false;
  mpActive = true;
  mpPlayers.forEach(pl => { pl.correct = 0; pl.done = false; pl.rank = null; });
  currentDiff = diff;

  document.getElementById('win-overlay').classList.remove('show');
  document.getElementById('lose-overlay').classList.remove('show');
  document.getElementById('play-again-btn').style.display = '';
  solution = sol.map(r => [...r]);
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

  const statusEl = document.getElementById('mp-status');
  statusEl.innerHTML = '';
  statusEl.style.display = '';
  mpUpdateBars();
  document.getElementById('game-screen').classList.add('mp-layout');
  showGame();
  mpHideOverlay();
}

/* ---- MP UI EVENT LISTENERS ---- */
// Create flow: setup → create room directly
document.getElementById('mp-setup-continue').addEventListener('click', () => {
  const nameInput = document.getElementById('mp-player-name');
  mpMyName = nameInput ? (nameInput.value.trim() || 'Player') : 'Player';
  mpCreate();
});
document.getElementById('mp-setup-cancel').addEventListener('click', () => mpShowScreen('mp-screen-choose'));
document.getElementById('mp-setup-blind-toggle').addEventListener('click', toggleBlindMode);
document.querySelectorAll('.mp-mode-btn').forEach(b => {
  b.addEventListener('click', () => {
    mpMode = b.dataset.mode;
    document.querySelectorAll('.mp-mode-btn').forEach(x => x.classList.toggle('active', x.dataset.mode === mpMode));
  });
});
// Choose screen: create card → host setup, join card → join screen
document.getElementById('mp-create-btn').addEventListener('click', mpShowSetup);
document.getElementById('mp-show-join-btn').addEventListener('click', () => {
  document.getElementById('mp-error').textContent = '';
  document.getElementById('room-code-input').value = '';
  mpShowScreen('mp-screen-join');
});
document.getElementById('mp-close-btn').addEventListener('click', mpHideOverlay);
document.getElementById('mp-cancel-btn').addEventListener('click', () => { mpDestroy(); mpHideOverlay(); });
document.getElementById('mp-lobby-cancel').addEventListener('click', () => { mpDestroy(); mpHideOverlay(); });
document.getElementById('mp-start-btn').addEventListener('click', mpHostStartGame);
document.getElementById('mp-connect-cancel').addEventListener('click', () => { mpDestroy(); mpHideOverlay(); });
document.getElementById('mp-join-back').addEventListener('click', () => mpShowScreen('mp-screen-choose'));
document.getElementById('mp-join-submit').addEventListener('click', () => {
  const nameInput = document.getElementById('mp-join-name');
  const name = nameInput ? nameInput.value.trim() : '';
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!name) {
    document.getElementById('mp-error').textContent = 'Please enter your name.';
    nameInput?.focus();
    return;
  }
  if (code.length !== 6) {
    document.getElementById('mp-error').textContent = 'Please enter a 6-character room code.';
    return;
  }
  mpMyName = name;
  mpJoin(code);
});
document.getElementById('room-code-input').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});
document.getElementById('room-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('mp-join-submit').click();
});
