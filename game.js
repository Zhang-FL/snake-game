const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const lbList = document.getElementById('lbList');
const lbEmpty = document.getElementById('lbEmpty');

const GRID = 20;
const COLS = 20;
const ROWS = 20;
const MAX_LEADERBOARD = 15;
const LB_KEY = 'snakeLeaderboard';

canvas.width = COLS * GRID;
canvas.height = ROWS * GRID;

let snake, food, dir, nextDir, score, highScore, running, paused, speed, timer;
let leaderboard = [];

const COLORS = {
  bg: '#0f0f1a',
  grid: '#111122',
  snakeHead: '#00ff88',
  food: '#ff5252',
  foodGlow: 'rgba(255,82,82,0.4)',
};

/* ===== Leaderboard ===== */

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LB_KEY);
    leaderboard = raw ? JSON.parse(raw) : [];
  } catch {
    leaderboard = [];
  }
}

function saveLeaderboard() {
  localStorage.setItem(LB_KEY, JSON.stringify(leaderboard));
}

function renderLeaderboard(highlightScore) {
  lbList.innerHTML = '';

  if (leaderboard.length === 0) {
    lbEmpty.style.display = 'block';
    return;
  }

  lbEmpty.style.display = 'none';
  leaderboard.forEach((entry, i) => {
    const li = document.createElement('li');
    if (highlightScore != null && entry.score === highlightScore) {
      li.classList.add('current');
    }
    li.innerHTML = `<span class="lb-name">${escapeHtml(entry.name)}</span><span class="lb-score">${entry.score}</span>`;
    lbList.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getRank(score) {
  if (leaderboard.length < MAX_LEADERBOARD) return leaderboard.length + 1;
  const lowest = leaderboard[leaderboard.length - 1].score;
  if (score > lowest) {
    for (let i = 0; i < leaderboard.length; i++) {
      if (score > leaderboard[i].score) return i + 1;
    }
  }
  return null;
}

function addToLeaderboard(name, score) {
  leaderboard.push({ name, score, date: Date.now() });
  leaderboard.sort((a, b) => b.score - a.score || a.date - b.date);
  if (leaderboard.length > MAX_LEADERBOARD) {
    leaderboard = leaderboard.slice(0, MAX_LEADERBOARD);
  }
  saveLeaderboard();
  renderLeaderboard(score);
}

/* ===== Name Prompt Overlay ===== */

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'nameOverlay';
  overlay.innerHTML = `
    <div class="dialog">
      <h3>恭喜上榜！</h3>
      <div class="sub" id="dialogRank">你进入了排行榜第 ? 名</div>
      <input type="text" id="nameInput" maxlength="10" placeholder="输入你的名字" autocomplete="off">
      <div class="btn-row">
        <button class="btn btn-cancel" id="btnSkip">跳过</button>
        <button class="btn" id="btnSave">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('nameInput');
  input.addEventListener('keydown', e => {
    if (e.code === 'Enter') document.getElementById('btnSave').click();
  });

  return overlay;
}

let pendingScore = 0;

function showNamePrompt(score) {
  pendingScore = score;
  const rank = getRank(score);
  document.getElementById('dialogRank').textContent =
    `你进入了排行榜第 ${rank} 名`;

  const overlay = document.getElementById('nameOverlay');
  overlay.classList.add('show');
  setTimeout(() => {
    document.getElementById('nameInput').focus();
  }, 100);
}

function hideNamePrompt() {
  document.getElementById('nameOverlay').classList.remove('show');
  document.getElementById('nameInput').value = '';
}

function submitName() {
  const input = document.getElementById('nameInput');
  const name = input.value.trim() || '匿名玩家';
  addToLeaderboard(name, pendingScore);
  hideNamePrompt();
}

/* ===== Game Logic ===== */

function init() {
  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);
  snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score = 0;
  speed = 120;
  paused = false;
  running = true;
  scoreEl.textContent = '0';
  highScore = leaderboard.length > 0 ? leaderboard[0].score : 0;
  highScoreEl.textContent = highScore;
  placeFood();
  if (timer) clearInterval(timer);
  timer = setInterval(step, speed);
  renderLeaderboard();
}

function placeFood() {
  const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
  const free = [];
  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < ROWS; y++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  food = free[Math.floor(Math.random() * free.length)];
}

function step() {
  if (!running || paused) return;

  dir = { ...nextDir };

  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) return die();
  if (snake.some(s => s.x === head.x && s.y === head.y)) return die();

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score += 10;
    scoreEl.textContent = score;
    if (score > highScore) {
      highScore = score;
      highScoreEl.textContent = highScore;
    }
    placeFood();
    if (speed > 50) {
      speed -= 1;
      clearInterval(timer);
      timer = setInterval(step, speed);
    }
  } else {
    snake.pop();
  }

  draw();
}

function die() {
  running = false;
  clearInterval(timer);
  draw();
  drawGameOver();

  if (score > 0 && getRank(score) !== null) {
    setTimeout(() => showNamePrompt(score), 400);
  }
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px "Courier New"';
  ctx.textAlign = 'center';
  ctx.fillText('游戏结束', canvas.width / 2, canvas.height / 2 - 10);

  ctx.fillStyle = '#aaa';
  ctx.font = '14px "Courier New"';
  ctx.fillText('点击"重新开始"再来一局', canvas.width / 2, canvas.height / 2 + 24);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Grid
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * GRID, 0);
    ctx.lineTo(x * GRID, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * GRID);
    ctx.lineTo(canvas.width, y * GRID);
    ctx.stroke();
  }

  // Food glow
  ctx.fillStyle = COLORS.foodGlow;
  ctx.beginPath();
  ctx.arc(food.x * GRID + GRID / 2, food.y * GRID + GRID / 2, GRID / 2 + 3, 0, Math.PI * 2);
  ctx.fill();

  // Food
  ctx.fillStyle = COLORS.food;
  ctx.beginPath();
  ctx.arc(food.x * GRID + GRID / 2, food.y * GRID + GRID / 2, GRID / 2 - 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Snake body
  for (let i = snake.length - 1; i >= 0; i--) {
    const s = snake[i];
    const ratio = 1 - (i / (snake.length + 6)) * 0.5;
    const px = s.x * GRID + 1;
    const py = s.y * GRID + 1;
    const sz = GRID - 2;

    if (i === 0) {
      ctx.fillStyle = COLORS.snakeHead;
      ctx.beginPath();
      ctx.roundRect(px, py, sz, sz, 5);
      ctx.fill();

      // Eyes
      const ecx = s.x * GRID + GRID / 2;
      const ecy = s.y * GRID + GRID / 2;

      ctx.fillStyle = '#fff';
      if (dir.x === 1) {
        ctx.beginPath(); ctx.arc(ecx + 3, ecy - 4, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ecx + 3, ecy + 4, 2.5, 0, Math.PI * 2); ctx.fill();
      } else if (dir.x === -1) {
        ctx.beginPath(); ctx.arc(ecx - 3, ecy - 4, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ecx - 3, ecy + 4, 2.5, 0, Math.PI * 2); ctx.fill();
      } else if (dir.y === -1) {
        ctx.beginPath(); ctx.arc(ecx - 4, ecy - 3, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ecx + 4, ecy - 3, 2.5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(ecx - 4, ecy + 3, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ecx + 4, ecy + 3, 2.5, 0, Math.PI * 2); ctx.fill();
      }

      ctx.fillStyle = '#000';
      if (dir.x === 1) {
        ctx.beginPath(); ctx.arc(ecx + 4, ecy - 4, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ecx + 4, ecy + 4, 1.2, 0, Math.PI * 2); ctx.fill();
      } else if (dir.x === -1) {
        ctx.beginPath(); ctx.arc(ecx - 2, ecy - 4, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ecx - 2, ecy + 4, 1.2, 0, Math.PI * 2); ctx.fill();
      } else if (dir.y === -1) {
        ctx.beginPath(); ctx.arc(ecx - 4, ecy - 2, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ecx + 4, ecy - 2, 1.2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(ecx - 4, ecy + 4, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ecx + 4, ecy + 4, 1.2, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.fillStyle = `hsl(145, 80%, ${35 + ratio * 20}%)`;
      ctx.beginPath();
      ctx.roundRect(px, py, sz, sz, 4);
      ctx.fill();
    }
  }
}

function changeDir(dx, dy) {
  if (!running) return;
  if (dir.x + dx === 0 && dir.y + dy === 0) return;
  nextDir = { x: dx, y: dy };
}

/* ===== Event Listeners ===== */

document.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!running) return;
    paused = !paused;
    if (paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px "Courier New"';
      ctx.textAlign = 'center';
      ctx.fillText('暂停中', canvas.width / 2, canvas.height / 2);
    } else {
      draw();
    }
    return;
  }

  const keyMap = {
    ArrowUp:    [0, -1],
    ArrowDown:  [0, 1],
    ArrowLeft:  [-1, 0],
    ArrowRight: [1, 0],
    KeyW: [0, -1],
    KeyS: [0, 1],
    KeyA: [-1, 0],
    KeyD: [1, 0],
  };

  const d = keyMap[e.code];
  if (d) {
    e.preventDefault();
    changeDir(d[0], d[1]);
  }
});

document.getElementById('restartBtn').addEventListener('click', init);

window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
    e.preventDefault();
  }
}, { passive: false });

/* ===== Init ===== */

createOverlay();

// Name prompt buttons (must be after overlay creation)
document.getElementById('btnSave').addEventListener('click', submitName);
document.getElementById('btnSkip').addEventListener('click', hideNamePrompt);

loadLeaderboard();
renderLeaderboard();
init();
draw();
