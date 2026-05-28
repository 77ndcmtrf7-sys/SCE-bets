const express  = require('express');
const sqlite3  = require('sqlite3').verbose();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');

const app    = express();
const SECRET = 'kolbo_market_secret_2025';
const PORT   = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== DB SETUP =====
const db = new sqlite3.Database('kolbo.db');

function dbRun(sql, params = []) {
  return new Promise((res, rej) =>
    db.run(sql, params, function(err) { err ? rej(err) : res(this); })
  );
}
function dbGet(sql, params = []) {
  return new Promise((res, rej) =>
    db.get(sql, params, (err, row) => err ? rej(err) : res(row))
  );
}
function dbAll(sql, params = []) {
  return new Promise((res, rej) =>
    db.all(sql, params, (err, rows) => err ? rej(err) : res(rows))
  );
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password     TEXT NOT NULL,
    balance      REAL DEFAULT 1000,
    is_admin     INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    question    TEXT NOT NULL,
    category    TEXT DEFAULT 'כללי',
    yes_volume  REAL DEFAULT 0,
    no_volume   REAL DEFAULT 0,
    deadline    TEXT,
    resolved    INTEGER DEFAULT 0,
    result      TEXT,
    created_by  INTEGER,
    created_at  TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS bets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    choice      TEXT NOT NULL,
    amount      REAL NOT NULL,
    payout      REAL DEFAULT 0,
    won         INTEGER,
    created_at  TEXT DEFAULT (datetime('now'))
  )`);
});


// ===== MIGRATIONS (add new columns to existing DB) =====
db.serialize(() => {
  db.run("ALTER TABLE questions ADD COLUMN option_yes TEXT DEFAULT 'כן'", ()=>{});
  db.run("ALTER TABLE questions ADD COLUMN option_no  TEXT DEFAULT 'לא'", ()=>{});
  db.run("ALTER TABLE questions ADD COLUMN deadline   TEXT",               ()=>{});
});

// ===== AUTH MIDDLEWARE =====
async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'לא מחובר' });
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, SECRET);
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [payload.id]);
    if (!user) return res.status(401).json({ error: 'משתמש לא נמצא' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'טוקן לא תקין' });
  }
}

async function adminAuth(req, res, next) {
  await auth(req, res, () => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'אין הרשאות מנהל' });
    next();
  });
}

function userSafe(u) {
  return { id: u.id, username: u.username, display_name: u.display_name, balance: u.balance, is_admin: u.is_admin };
}
function makeToken(u) {
  return jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
}

// ===== ROUTES =====

app.post('/api/register', async (req, res) => {
  try {
    const { username, display_name, password } = req.body;
    if (!username || !display_name || !password)
      return res.status(400).json({ error: 'נא למלא את כל השדות' });
    if (username.length < 3)
      return res.status(400).json({ error: 'שם משתמש חייב להיות לפחות 3 תווים' });
    if (password.length < 4)
      return res.status(400).json({ error: 'סיסמה חייבת להיות לפחות 4 תווים' });

    const exists = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
    if (exists) return res.status(400).json({ error: 'שם משתמש תפוס' });

    const hash    = await bcrypt.hash(password, 10);
    const first   = await dbGet('SELECT id FROM users');
    const isAdmin = first ? 0 : 1;
    const r       = await dbRun(
      'INSERT INTO users (username, display_name, password, is_admin) VALUES (?, ?, ?, ?)',
      [username, display_name, hash, isAdmin]
    );
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [r.lastID]);
    res.json({ token: makeToken(user), user: userSafe(user) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(400).json({ error: 'שם משתמש לא קיים' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'סיסמה שגויה' });
    res.json({ token: makeToken(user), user: userSafe(user) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/me', auth, (req, res) => res.json(userSafe(req.user)));

app.get('/api/questions', auth, async (req, res) => {
  try {
    const showAll = req.query.all && req.user.is_admin;
    const questions = showAll
      ? await dbAll('SELECT * FROM questions ORDER BY created_at DESC')
      : await dbAll('SELECT * FROM questions ORDER BY resolved ASC, created_at DESC');
    res.json({ questions });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/questions/:id', auth, async (req, res) => {
  try {
    const q = await dbGet('SELECT * FROM questions WHERE id = ?', [req.params.id]);
    if (!q) return res.status(404).json({ error: 'שאלה לא נמצאה' });
    res.json({ question: q });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/questions', adminAuth, async (req, res) => {
  try {
    const { question, category, deadline, option_yes, option_no } = req.body;
    if (!question) return res.status(400).json({ error: 'חסר טקסט שאלה' });
    const r = await dbRun(
      'INSERT INTO questions (question, category, deadline, option_yes, option_no, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [question, category || 'כללי', deadline || null, option_yes || 'כן', option_no || 'לא', req.user.id]
    );
    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bet', auth, async (req, res) => {
  try {
    const { question_id, choice, amount } = req.body;
    if (!['YES', 'NO'].includes(choice))
      return res.status(400).json({ error: 'בחירה לא תקינה' });
    if (!amount || amount < 10)
      return res.status(400).json({ error: 'מינימום 10 נק"ז' });
    if (amount > req.user.balance)
      return res.status(400).json({ error: 'אין מספיק נק"ז' });

    const q = await dbGet('SELECT * FROM questions WHERE id = ?', [question_id]);
    if (!q)         return res.status(404).json({ error: 'שאלה לא נמצאה' });
    if (q.resolved) return res.status(400).json({ error: 'השאלה כבר נסגרה' });

    await dbRun('INSERT INTO bets (user_id, question_id, choice, amount) VALUES (?, ?, ?, ?)',
      [req.user.id, question_id, choice, amount]);

    if (choice === 'YES') {
      await dbRun('UPDATE questions SET yes_volume = yes_volume + ? WHERE id = ?', [amount, question_id]);
    } else {
      await dbRun('UPDATE questions SET no_volume = no_volume + ? WHERE id = ?', [amount, question_id]);
    }
    await dbRun('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, req.user.id]);

    const updated = await dbGet('SELECT balance FROM users WHERE id = ?', [req.user.id]);
    res.json({ success: true, new_balance: updated.balance });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/questions/:id/resolve', adminAuth, async (req, res) => {
  try {
    const { result } = req.body;
    if (!['YES', 'NO'].includes(result))
      return res.status(400).json({ error: 'תוצאה לא תקינה' });

    const q = await dbGet('SELECT * FROM questions WHERE id = ?', [req.params.id]);
    if (!q)         return res.status(404).json({ error: 'שאלה לא נמצאה' });
    if (q.resolved) return res.status(400).json({ error: 'כבר נסגרה' });

    await dbRun('UPDATE questions SET resolved = 1, result = ? WHERE id = ?', [result, q.id]);

    const winBets  = await dbAll('SELECT * FROM bets WHERE question_id = ? AND choice = ?',  [q.id, result]);
    const loseBets = await dbAll('SELECT * FROM bets WHERE question_id = ? AND choice != ?', [q.id, result]);

    const winPool  = winBets.reduce((s, b) => s + b.amount, 0);
    const losePool = loseBets.reduce((s, b) => s + b.amount, 0);
    const total    = winPool + losePool;

    for (const bet of winBets) {
      const payout = winPool > 0 ? (bet.amount / winPool) * total : bet.amount;
      await dbRun('UPDATE bets SET won = 1, payout = ? WHERE id = ?', [payout, bet.id]);
      await dbRun('UPDATE users SET balance = balance + ? WHERE id = ?', [payout, bet.user_id]);
    }
    for (const bet of loseBets) {
      await dbRun('UPDATE bets SET won = 0, payout = 0 WHERE id = ?', [bet.id]);
    }

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/questions/:id', adminAuth, async (req, res) => {
  try {
    const q = await dbGet('SELECT * FROM questions WHERE id = ?', [req.params.id]);
    if (!q) return res.status(404).json({ error: 'לא נמצאה' });

    if (!q.resolved) {
      const bets = await dbAll('SELECT * FROM bets WHERE question_id = ?', [q.id]);
      for (const bet of bets) {
        await dbRun('UPDATE users SET balance = balance + ? WHERE id = ?', [bet.amount, bet.user_id]);
      }
    }
    await dbRun('DELETE FROM bets WHERE question_id = ?', [q.id]);
    await dbRun('DELETE FROM questions WHERE id = ?', [q.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/my-bets', auth, async (req, res) => {
  try {
    const bets = await dbAll(`
      SELECT b.*, q.question, q.resolved, q.result, q.option_yes, q.option_no
      FROM bets b JOIN questions q ON q.id = b.question_id
      WHERE b.user_id = ? ORDER BY b.created_at DESC
    `, [req.user.id]);
    res.json({ bets });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leaderboard', auth, async (req, res) => {
  try {
    const users = await dbAll(
      'SELECT id, display_name, balance FROM users ORDER BY balance DESC LIMIT 20'
    );
    res.json({ users });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`🎓 קולבו מרקט רץ על http://localhost:${PORT}`));
