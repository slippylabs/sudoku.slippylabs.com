(() => {
  const TARGET_CLUES = 36;
  const INVERT_BASE = 999999;

  const boardEl = document.getElementById('sk-board');
  const numpadEl = document.getElementById('sk-numpad');
  const timerEl = document.getElementById('timer');
  const newGameBtn = document.getElementById('new-game-btn');

  const startScreen = document.getElementById('start-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const startBtn = document.getElementById('start-btn');
  const restartBtn = document.getElementById('restart-btn');
  const finalTimeLineEl = document.getElementById('final-time-line');
  const bestTimeEl = document.getElementById('best-time');
  const startBestTimeEl = document.getElementById('start-best-time');
  const callsignInput = document.getElementById('callsign-input');
  const submitScoreBtn = document.getElementById('submit-score-btn');
  const submitStatusEl = document.getElementById('submit-status');

  const BEST_TIME_KEY = 'sudokuBestTime';
  const CALLSIGN_KEY = 'sudokuCallsign';
  const LEADERBOARD_API = 'https://lab.slippylabs.com/api/scores/sudoku';

  // ---------- generator / solver ----------
  function emptyGrid() { return Array.from({ length: 9 }, () => Array(9).fill(0)); }

  function isValid(grid, r, c, val) {
    for (let i = 0; i < 9; i++) {
      if (grid[r][i] === val) return false;
      if (grid[i][c] === val) return false;
    }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        if (grid[br + dr][bc + dc] === val) return false;
      }
    }
    return true;
  }

  function shuffled(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function fillGrid(grid) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] === 0) {
          for (const val of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
            if (isValid(grid, r, c, val)) {
              grid[r][c] = val;
              if (fillGrid(grid)) return true;
              grid[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  function hasUniqueSolution(grid) {
    const g = grid.map((row) => row.slice());
    let solutions = 0;
    function solve() {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (g[r][c] === 0) {
            for (let val = 1; val <= 9; val++) {
              if (isValid(g, r, c, val)) {
                g[r][c] = val;
                solve();
                g[r][c] = 0;
                if (solutions > 1) return;
              }
            }
            return;
          }
        }
      }
      solutions++;
    }
    solve();
    return solutions === 1;
  }

  function generatePuzzle() {
    const solution = emptyGrid();
    fillGrid(solution);
    const puzzle = solution.map((row) => row.slice());

    const positions = shuffled(
      Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9])
    );

    let clues = 81;
    for (const [r, c] of positions) {
      if (clues <= TARGET_CLUES) break;
      const backup = puzzle[r][c];
      puzzle[r][c] = 0;
      if (hasUniqueSolution(puzzle)) {
        clues--;
      } else {
        puzzle[r][c] = backup;
      }
    }
    return { puzzle, solution };
  }

  function computeConflicts(grid) {
    const conflicts = new Set();
    const mark = (positions) => {
      const byVal = {};
      for (const [r, c] of positions) {
        const v = grid[r][c];
        if (!v) continue;
        (byVal[v] = byVal[v] || []).push(r + ',' + c);
      }
      for (const key in byVal) {
        if (byVal[key].length > 1) byVal[key].forEach((p) => conflicts.add(p));
      }
    };
    for (let r = 0; r < 9; r++) mark(Array.from({ length: 9 }, (_, c) => [r, c]));
    for (let c = 0; c < 9; c++) mark(Array.from({ length: 9 }, (_, r) => [r, c]));
    for (let br = 0; br < 9; br += 3) {
      for (let bc = 0; bc < 9; bc += 3) {
        const cells = [];
        for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) cells.push([br + dr, bc + dc]);
        mark(cells);
      }
    }
    return conflicts;
  }

  // ---------- game state ----------
  let given = emptyGrid();
  let solution = emptyGrid();
  let current = emptyGrid();
  let cellEls = [];
  let selected = null; // {r,c}
  let started = false;
  let solved = false;
  let elapsedSeconds = 0;
  let timerHandle = null;

  function getBestTime() {
    const v = parseInt(localStorage.getItem(BEST_TIME_KEY) || '', 10);
    return Number.isFinite(v) ? v : null;
  }
  function setBestTime(v) { localStorage.setItem(BEST_TIME_KEY, String(v)); }
  function getCallsign() { return localStorage.getItem(CALLSIGN_KEY) || ''; }
  function setCallsign(v) { localStorage.setItem(CALLSIGN_KEY, v); }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function refreshBestTimeLabels() {
    const best = getBestTime();
    startBestTimeEl.textContent = best === null ? '--:--' : formatTime(best);
  }

  function startTimer() {
    elapsedSeconds = 0;
    timerEl.textContent = '0:00';
    timerHandle = setInterval(() => {
      elapsedSeconds++;
      timerEl.textContent = formatTime(elapsedSeconds);
    }, 1000);
  }
  function stopTimer() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
  }

  function buildBoard() {
    boardEl.innerHTML = '';
    cellEls = [];
    for (let r = 0; r < 9; r++) {
      cellEls.push([]);
      for (let c = 0; c < 9; c++) {
        const el = document.createElement('div');
        el.className = 'sk-cell';
        if ((c + 1) % 3 === 0 && c !== 8) el.classList.add('box-right');
        if ((r + 1) % 3 === 0 && r !== 8) el.classList.add('box-bottom');
        el.dataset.r = r;
        el.dataset.c = c;
        boardEl.appendChild(el);
        cellEls[r].push(el);
      }
    }
  }

  function render() {
    const conflicts = computeConflicts(current);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const el = cellEls[r][c];
        const isGiven = given[r][c] !== 0;
        const val = current[r][c];
        el.textContent = val || '';
        el.classList.toggle('given', isGiven);
        el.classList.toggle('conflict', conflicts.has(r + ',' + c));
        el.classList.toggle('selected', !!selected && selected.r === r && selected.c === c);
        const isPeer = !!selected && !(selected.r === r && selected.c === c) &&
          (selected.r === r || selected.c === c ||
            (Math.floor(selected.r / 3) === Math.floor(r / 3) && Math.floor(selected.c / 3) === Math.floor(c / 3)));
        el.classList.toggle('peer', isPeer);
      }
    }
  }

  function selectCell(r, c) {
    selected = { r, c };
    render();
  }

  function setValue(val) {
    if (!selected || solved) return;
    const { r, c } = selected;
    if (given[r][c] !== 0) return;
    current[r][c] = val;

    if (!started && val !== 0) {
      started = true;
      startTimer();
    }

    render();
    checkWin();
  }

  function checkWin() {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (current[r][c] !== solution[r][c]) return;
      }
    }
    solved = true;
    stopTimer();

    finalTimeLineEl.textContent = 'Time: ' + formatTime(elapsedSeconds);
    const best = getBestTime();
    const newBest = best === null || elapsedSeconds < best;
    if (newBest) setBestTime(elapsedSeconds);
    bestTimeEl.textContent = formatTime(newBest ? elapsedSeconds : best);

    callsignInput.value = getCallsign();
    submitStatusEl.textContent = '';
    submitStatusEl.className = 'submit-status';
    submitScoreBtn.disabled = false;
    submitScoreBtn.textContent = 'Submit to Leaderboard';

    gameoverScreen.classList.remove('hidden');
  }

  function newPuzzle() {
    stopTimer();
    started = false;
    solved = false;
    selected = null;
    elapsedSeconds = 0;
    timerEl.textContent = '0:00';

    const gen = generatePuzzle();
    given = gen.puzzle.map((row) => row.slice());
    solution = gen.solution;
    current = gen.puzzle.map((row) => row.slice());

    buildBoard();
    render();
    gameoverScreen.classList.add('hidden');
    refreshBestTimeLabels();
  }

  boardEl.addEventListener('click', (e) => {
    const target = e.target.closest('.sk-cell');
    if (!target || solved) return;
    selectCell(parseInt(target.dataset.r, 10), parseInt(target.dataset.c, 10));
  });

  numpadEl.addEventListener('click', (e) => {
    const target = e.target.closest('.sk-num-btn');
    if (!target || solved) return;
    setValue(parseInt(target.dataset.val, 10));
  });

  window.addEventListener('keydown', (e) => {
    if (solved || !selected) return;
    if (e.key >= '1' && e.key <= '9') setValue(parseInt(e.key, 10));
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') setValue(0);
  });

  newGameBtn.addEventListener('click', newPuzzle);
  startBtn.addEventListener('click', () => { startScreen.classList.add('hidden'); });
  restartBtn.addEventListener('click', newPuzzle);

  async function submitScore() {
    const name = callsignInput.value.trim();
    if (!name) {
      submitStatusEl.textContent = 'Enter a callsign first.';
      submitStatusEl.className = 'submit-status err';
      return;
    }

    setCallsign(name);
    submitScoreBtn.disabled = true;
    submitScoreBtn.textContent = 'Uplinking…';
    submitStatusEl.textContent = '';
    submitStatusEl.className = 'submit-status';

    try {
      const res = await fetch(LEADERBOARD_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score: INVERT_BASE - elapsedSeconds }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        submitStatusEl.textContent = `Banked at rank #${data.rank} globally.`;
        submitStatusEl.className = 'submit-status ok';
        submitScoreBtn.textContent = 'Submitted';
      } else {
        submitStatusEl.textContent = data.error || 'Uplink failed. Try again.';
        submitStatusEl.className = 'submit-status err';
        submitScoreBtn.disabled = false;
        submitScoreBtn.textContent = 'Submit to Leaderboard';
      }
    } catch {
      submitStatusEl.textContent = 'Uplink lost. Check your connection.';
      submitStatusEl.className = 'submit-status err';
      submitScoreBtn.disabled = false;
      submitScoreBtn.textContent = 'Submit to Leaderboard';
    }
  }
  submitScoreBtn.addEventListener('click', submitScore);

  newPuzzle();
})();
