const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'snake.db'));
db.pragma('foreign_keys = ON');

const jsonPath = path.join(__dirname, '..', 'data', 'leaderboard.json');

if (!fs.existsSync(jsonPath)) {
  console.log('No leaderboard.json found. Nothing to migrate.');
  process.exit(0);
}

const count = db.prepare('SELECT COUNT(*) AS cnt FROM leaderboard').get();
if (count.cnt > 0) {
  console.log('leaderboard table already has data. Skipping migration.');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
if (data.length === 0) {
  console.log('leaderboard.json is empty. Nothing to migrate.');
  process.exit(0);
}

const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)');
const findUser = db.prepare('SELECT id FROM users WHERE username = ?');
const insertScore = db.prepare('INSERT INTO leaderboard (user_id, score, played_at) VALUES (?, ?, ?)');

const placeholderHash = bcrypt.hashSync('migrated', 10);

const uniqueNames = [...new Set(data.map(e => e.name))];
for (const name of uniqueNames) {
  insertUser.run(name, placeholderHash);
  console.log(`  User created: ${name}`);
}

const migrate = db.transaction(() => {
  let count = 0;
  for (const entry of data) {
    const user = findUser.get(entry.name);
    if (user) {
      insertScore.run(user.id, entry.score, entry.date);
      count++;
    }
  }
  return count;
});

const migrated = migrate();
console.log(`Migrated ${migrated} leaderboard entries from JSON to SQLite.`);

// Rename old file as backup
fs.renameSync(jsonPath, jsonPath + '.bak');
console.log('Backed up leaderboard.json → leaderboard.json.bak');

db.close();
