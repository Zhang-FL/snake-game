const express = require('express');
const session = require('express-session');
const BetterSqlite3SessionStore = require('better-sqlite3-session-store');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = 3000;

// Database
const db = new Database(path.join(__dirname, 'data', 'snake.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password   TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leaderboard (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score      INTEGER NOT NULL,
    played_at  INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_leaderboard_score
    ON leaderboard(score DESC, played_at ASC);
`);

// Statements
const stmtFindUser = db.prepare('SELECT * FROM users WHERE username = ?');
const stmtInsertUser = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
const stmtInsertScore = db.prepare('INSERT INTO leaderboard (user_id, score, played_at) VALUES (?, ?, ?)');
const stmtGetLeaderboard = db.prepare(`
  SELECT u.username, lb.score, lb.played_at
  FROM leaderboard lb
  JOIN users u ON u.id = lb.user_id
  ORDER BY lb.score DESC, lb.played_at ASC
  LIMIT 15
`);
const stmtGetUserScoreRank = db.prepare(`
  SELECT COUNT(*) + 1 AS rank FROM leaderboard
  WHERE score > ? OR (score = ? AND played_at < ?)
`);
const stmtUserScores = db.prepare(`
  SELECT score, played_at FROM leaderboard WHERE user_id = ?
`);

// Session
const sessionDb = new Database(path.join(__dirname, 'data', 'sessions.db'));
sessionDb.pragma('journal_mode = WAL');

const SqliteStore = BetterSqlite3SessionStore(session);
const store = new SqliteStore({ client: sessionDb });

app.use(session({
  store,
  secret: process.env.SESSION_SECRET || 'snake-game-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
}));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Login required' });
  }
  next();
}

// Auth: register
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 2-20 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = stmtFindUser.get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = stmtInsertUser.run(username, hash);
  req.session.userId = result.lastInsertRowid;

  res.json({ ok: true, user: { id: result.lastInsertRowid, username } });
});

// Auth: login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = stmtFindUser.get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.userId = user.id;
  res.json({ ok: true, user: { id: user.id, username: user.username } });
});

// Auth: logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// Auth: me
app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ loggedIn: false });
  }
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.json({ loggedIn: false });
  }
  res.json({ loggedIn: true, user });
});

// Leaderboard: get top 15
app.get('/api/leaderboard', (req, res) => {
  const rows = stmtGetLeaderboard.all();
  res.json(rows);
});

// Leaderboard: submit score
app.post('/api/leaderboard', requireAuth, (req, res) => {
  const { score } = req.body || {};
  if (score == null || !Number.isFinite(score) || score <= 0) {
    return res.status(400).json({ error: 'Invalid score' });
  }

  const now = Date.now();
  const userId = req.session.userId;

  // Insert the score
  stmtInsertScore.run(userId, score, now);

  // Compute rank (1-based among all scores)
  const rankResult = stmtGetUserScoreRank.get(score, score, now);
  const rank = rankResult.rank <= 15 ? rankResult.rank : null;

  // If the leaderboard is over 15, trim excess
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM leaderboard').get();
  if (count.cnt > 15) {
    // Get ids to keep (top 15)
    const keepIds = stmtGetLeaderboard.all().map(r => {
      const entry = db.prepare(
        'SELECT lb.id FROM leaderboard lb JOIN users u ON u.id = lb.user_id WHERE u.username = ? AND lb.score = ? AND lb.played_at = ?'
      ).get(r.username, r.score, r.played_at);
      return entry ? entry.id : null;
    }).filter(Boolean);

    if (keepIds.length === 15) {
      const placeholders = keepIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM leaderboard WHERE id NOT IN (${placeholders})`).run(...keepIds);
    }
  }

  res.json({ ok: true, rank });
});

app.listen(PORT, () => {
  console.log(`Snake game server running: http://localhost:${PORT}`);
});
