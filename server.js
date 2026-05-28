const express  = require('express');
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');

const app    = express();
const SECRET = 'kolbo_market_secret_2025';
const PORT   = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new Database('/tmp/kolbo.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password     TEXT NOT NULL,
    balance      REAL DEFAULT 1000,
    is_admin     INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS questions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    question    TEXT NOT NULL,
    category    TEXT DEFAULT 'כללי',
    yes_volume  REAL DEFAULT 0,
    no_volume   REAL DEFAULT 0,
    deadline    TEXT,
    option_yes  TEXT DEFAULT 'כן',
    option_no   TEXT DEFAULT 'לא',
    resolved    INTEGER DEFAULT 0,
    result      TEXT,
    created_by  INTEGER,
    created_at  TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS bets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    choice      TEXT NOT NULL,
    amount      REAL NOT NULL,
    payout      REAL DEFAULT 0,
    won         INTEGER,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations for existing DBs
try { db.exec("ALTER TABLE questions ADD COLUMN option_yes TEXT DEFAULT 'כן'"); } catch(e) {}
try { db.exec("ALTER TABLE questions ADD COLUMN option_no TEXT DEFAULT 'לא'");  } catch(e) {}
try { db.exec("ALTER TABLE questions ADD COLUMN deadline TEXT");                 } catch(e) {}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'לא מחובר' });
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'משתמש לא נמצא' });
    req.user = user;
    next();
  } catch { return res.status(401).json({ error: 'טוקן לא תקין' }); }
}

function adminAuth(req, res, next) {
  auth(req, res, () => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'אין הרשאות מנהל' });
    next();
  });
}

function userSafe(u) {
  return { id: u.id, username: u.username, display_name: u.display_name, balance: u.balance, is_admin: u.is_admin };
}
function makeToken(u) { return jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' }); }

app.post('/api/register', async (req, res) => {
  try {
    const { username, display_name, password } = req.body;
    if (!username || !display_name || !password)
      return res.status(400).json({ error: 'נא למלא את כל השדות' });
    if (username.length < 3) return res.status(400).json({ error: 'שם משתמש חייב להיות לפחות 3 תווים' });
    if (password.length < 4) return res.status(400).json({ error: 'סיסמה חייבת להיות לפחות 4 תווים' });
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (exists) return res.status(400).json({ error: 'שם משתמש תפוס' });
    const hash    = await bcrypt.hash(password, 10);
    const first   = db.prepare('SELECT id FROM users').get();
    const isAdmin = first ? 0 : 1;
    const r = db.prepare('INSERT INTO users (username, display_name, password, is_admin) VALUES (?, ?, ?, ?)').run(username, display_name, hash, isAdmin);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
    res.json({ token: makeToken(user), user: userSafe(user) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(400).json({ error: 'שם משתמש לא קיים' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'סיסמה שגויה' });
    res.json({ token: makeToken(user), user: userSafe(user) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/me', auth, (req, res) => res.json(userSafe(req.user)));

app.get('/api/questions', auth, (req, res) => {
  const showAll = req.query.all && req.user.is_admin;
  const questions = showAll
    ? db.prepare('SELECT * FROM questions ORDER BY created_at DESC').all()
    : db.prepare('SELECT * FROM questions ORDER BY resolved ASC, created_at DESC').all();
  res.json({ questions });
});

app.get('/api/questions/:id', auth, (req, res) => {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'שאלה לא נמצאה' });
  res.json({ question: q });
});

app.post('/api/questions', adminAuth, (req, res) => {
  try {
    const { question, category, deadline, option_yes, option_no } = req.body;
    if (!question) return res.status(400).json({ error: 'חסר טקסט שאלה' });
    const r = db.prepare('INSERT INTO questions (question, category, deadline, option_yes, option_no, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(question, category || 'כללי', deadline || null, option_yes || 'כן', option_no || 'לא', req.user.id);
    res.json({ id: r.lastInsertRowid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bet', auth, (req, res) => {
  try {
    const { question_id, choice, amount } = req.body;
    if (!['YES', 'NO'].includes(choice)) return res.status(400).json({ error: 'בחירה לא תקינה' });
    if (!amount || amount < 10) return res.status(400).json({ error: 'מינימום 10 נק"ז' });
    if (amount > req.user.balance) return res.status(400).json({ error: 'אין מספיק נק"ז' });
    const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(question_id);
    if (!q) return res.status(404).json({ error: 'שאלה לא נמצאה' });
    if (q.resolved) return res.status(400).json({ error: 'השאלה כבר נסגרה' });
    db.transaction(() => {
      db.prepare('INSERT INTO bets (user_id, question_id, choice, amount) VALUES (?, ?, ?, ?)').run(req.user.id, question_id, choice, amount);
      if (choice === 'YES') db.prepare('UPDATE questions SET yes_volume = yes_volume + ? WHERE id = ?').run(amount, question_id);
      else db.prepare('UPDATE questions SET no_volume = no_volume + ? WHERE id = ?').run(amount, question_id);
      db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, req.user.id);
    })();
    const updated = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, new_balance: updated.balance });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/questions/:id/resolve', adminAuth, (req, res) => {
  try {
    const { result } = req.body;
    if (!['YES', 'NO'].includes(result)) return res.status(400).json({ error: 'תוצאה לא תקינה' });
    const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    if (!q) return res.status(404).json({ error: 'שאלה לא נמצאה' });
    if (q.resolved) return res.status(400).json({ error: 'כבר נסגרה' });
    db.transaction(() => {
      db.prepare('UPDATE questions SET resolved = 1, result = ? WHERE id = ?').run(result, q.id);
      const winBets  = db.prepare('SELECT * FROM bets WHERE question_id = ? AND choice = ?').all(q.id, result);
      const loseBets = db.prepare('SELECT * FROM bets WHERE question_id = ? AND choice != ?').all(q.id, result);
      const winPool  = winBets.reduce((s, b) => s + b.amount, 0);
      const total    = winPool + loseBets.reduce((s, b) => s + b.amount, 0);
      for (const bet of winBets) {
        const payout = winPool > 0 ? (bet.amount / winPool) * total : bet.amount;
        db.prepare('UPDATE bets SET won = 1, payout = ? WHERE id = ?').run(payout, bet.id);
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(payout, bet.user_id);
      }
      for (const bet of loseBets) db.prepare('UPDATE bets SET won = 0, payout = 0 WHERE id = ?').run(bet.id);
    })();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/questions/:id', adminAuth, (req, res) => {
  try {
    const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    if (!q) return res.status(404).json({ error: 'לא נמצאה' });
    db.transaction(() => {
      if (!q.resolved) {
        const bets = db.prepare('SELECT * FROM bets WHERE question_id = ?').all(q.id);
        for (const bet of bets) db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(bet.amount, bet.user_id);
      }
      db.prepare('DELETE FROM bets WHERE question_id = ?').run(q.id);
      db.prepare('DELETE FROM questions WHERE id = ?').run(q.id);
    })();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/my-bets', auth, (req, res) => {
  const bets = db.prepare(`
    SELECT b.*, q.question, q.resolved, q.result, q.option_yes, q.option_no
    FROM bets b JOIN questions q ON q.id = b.question_id
    WHERE b.user_id = ? ORDER BY b.created_at DESC
  `).all(req.user.id);
  res.json({ bets });
});

app.get('/api/leaderboard', auth, (req, res) => {
  const users = db.prepare('SELECT id, display_name, balance FROM users ORDER BY balance DESC LIMIT 20').all();
  res.json({ users });
});

app.listen(PORT, () => console.log(`🎓 SCE Bets רץ על http://localhost:${PORT}`));
