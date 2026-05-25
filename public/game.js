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

/* ===== Auth ===== */

let currentUser = null; // { id, username } or null

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.loggedIn) {
      currentUser = data.user;
    } else {
      currentUser = null;
    }
  } catch {
    currentUser = null;
  }
  renderAuthUI();
}

function renderAuthUI() {
  const userInfo = document.getElementById('userInfo');
  const authTabs = document.getElementById('authTabs');
  const userName = document.getElementById('userName');

  if (currentUser) {
    userInfo.style.display = 'flex';
    authTabs.style.display = 'none';
    userName.textContent = currentUser.username;
  } else {
    userInfo.style.display = 'none';
    authTabs.style.display = 'block';
  }
}

async function login(username, password) {
  const msg = document.getElementById('loginMsg');
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.ok) {
      currentUser = data.user;
      renderAuthUI();
      document.getElementById('loginForm').reset();
      msg.textContent = '';
    } else {
      msg.textContent = data.error || 'Login failed';
    }
  } catch {
    msg.textContent = 'Network error';
  }
}

async function register(username, password) {
  const msg = document.getElementById('registerMsg');
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.ok) {
      currentUser = data.user;
      renderAuthUI();
      document.getElementById('registerForm').reset();
      msg.textContent = '';
    } else {
      msg.textContent = data.error || 'Registration failed';
    }
  } catch {
    msg.textContent = 'Network error';
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch { /* ignore */ }
  currentUser = null;
  renderAuthUI();
}

function setupAuthListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('loginForm').style.display = tab === 'login' ? '' : 'none';
      document.getElementById('registerForm').style.display = tab === 'register' ? '' : 'none';
    });
  });

  // Login form
  document.getElementById('loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const username = fd.get('username').trim();
    const password = fd.get('password');
    if (!username || !password) {
      document.getElementById('loginMsg').textContent = 'Please fill in all fields';
      return;
    }
    login(username, password);
  });

  // Register form
  document.getElementById('registerForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const username = fd.get('username').trim();
    const password = fd.get('password');
    if (!username || !password) {
      document.getElementById('registerMsg').textContent = 'Please fill in all fields';
      return;
    }
    if (username.length < 2) {
      document.getElementById('registerMsg').textContent = 'Username must be 2-20 characters';
      return;
    }
    if (password.length < 6) {
      document.getElementById('registerMsg').textContent = 'Password must be at least 6 characters';
      return;
    }
    register(username, password);
  });

  // Logout button
  document.getElementById('btnLogout').addEventListener('click', logout);
}

/* ===== Leaderboard ===== */

async function loadLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    if (res.ok) {
      leaderboard = await res.json();
    } else {
      leaderboard = [];
    }
  } catch {
    leaderboard = [];
    console.warn('Unable to load leaderboard. Make sure server.js is running.');
  }
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
    if (highlightScore != null && entry.score === highlightScore &&
        currentUser && entry.username === currentUser.username) {
      li.classList.add('current');
    }
    li.innerHTML =
      `<div class="lb-row"><span class="lb-rank">${i + 1}</span><span class="lb-name">${escapeHtml(entry.username)}</span><span class="lb-score">${entry.score}</span></div><div class="lb-date">${formatDate(entry.played_at)}</div>`;
    lbList.appendChild(li);
  });
}

function formatDate(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function addToLeaderboard(score) {
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score }),
    });
    const data = await res.json();
    if (data.ok) {
      await loadLeaderboard();
      renderLeaderboard(score);
    } else if (res.status === 401) {
      alert('请先登录后再保存成绩');
    }
  } catch {
    console.warn('Unable to save score.');
  }
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

  if (score > 0) {
    if (currentUser) {
      setTimeout(() => addToLeaderboard(score), 400);
    } else {
      setTimeout(() => {
        ctx.fillStyle = '#ffab00';
        ctx.font = '12px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText('登录后可保存成绩', canvas.width / 2, canvas.height / 2 + 50);
      }, 400);
    }
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

setupAuthListeners();

(async () => {
  await checkAuth();
  await loadLeaderboard();
  renderLeaderboard();
  init();
  draw();
})();
