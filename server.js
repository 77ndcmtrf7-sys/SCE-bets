const express = require('express');
const { Pool } = require('pg');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const path    = require('path');

const app    = express();
const SECRET = 'kolbo_market_secret_2025';
const PORT   = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
      username     TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password     TEXT NOT NULL,
      balance      REAL DEFAULT 1000,
      is_admin     INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
    );
    CREATE TABLE IF NOT EXISTS questions (
      id          SERIAL PRIMARY KEY,
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
      created_at  TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
    );
    CREATE TABLE IF NOT EXISTS bets (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      choice      TEXT NOT NULL,
      amount      REAL NOT NULL,
      payout      REAL DEFAULT 0,
      won         INTEGER,
      created_at  TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
    );
  `);
}

initDB().then(async () => {
  // migrations
  try { await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS yes_count INTEGER DEFAULT 0"); } catch(e) {}
  try { await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS no_count INTEGER DEFAULT 0"); } catch(e) {}
  try { await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS department TEXT DEFAULT ''"); } catch(e) {}
  try { await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''"); } catch(e) {}
  try { await pool.query("ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''"); } catch(e) {}
  console.log('DB ready');
}).catch(console.error);

// --- Activity log ---
async function initActivityLog() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id         SERIAL PRIMARY KEY,
      type       TEXT NOT NULL,
      message    TEXT NOT NULL,
      created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
    )
  `);
}
initActivityLog().catch(console.error);

async function logActivity(type, message) {
  try {
    await pool.query('INSERT INTO activity_log (type, message) VALUES ($1, $2)', [type, message]);
  } catch(e) { console.error('logActivity error:', e.message); }
}

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'לא מחובר' });
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, SECRET);
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [payload.id]);
    if (!rows[0]) return res.status(401).json({ error: 'משתמש לא נמצא' });
    req.user = rows[0];
    next();
  } catch { return res.status(401).json({ error: 'טוקן לא תקין' }); }
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
function makeToken(u) { return jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' }); }

app.post('/api/register', async (req, res) => {
  try {
    const { username, display_name, password } = req.body;
    if (!username || !display_name || !password)
      return res.status(400).json({ error: 'נא למלא את כל השדות' });
    if (username.length < 3) return res.status(400).json({ error: 'שם משתמש חייב להיות לפחות 3 תווים' });
    if (password.length < 4) return res.status(400).json({ error: 'סיסמה חייבת להיות לפחות 4 תווים' });

    const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rows[0]) return res.status(400).json({ error: 'שם משתמש תפוס' });

    const hash  = await bcrypt.hash(password, 10);
    const first = await pool.query('SELECT id FROM users LIMIT 1');
    const isAdmin = first.rows.length === 0 ? 1 : 0;

    const r = await pool.query(
      'INSERT INTO users (username, display_name, password, is_admin) VALUES ($1,$2,$3,$4) RETURNING *',
      [username, display_name, hash, isAdmin]
    );
    logActivity('register', `משתמש חדש נרשם: ${display_name}`);
    res.json({ token: makeToken(r.rows[0]), user: userSafe(r.rows[0]) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (!rows[0]) return res.status(400).json({ error: 'שם משתמש לא קיים' });
    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) return res.status(400).json({ error: 'סיסמה שגויה' });
    res.json({ token: makeToken(rows[0]), user: userSafe(rows[0]) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/me', auth, (req, res) => res.json(userSafe(req.user)));

app.get('/api/questions', async (req, res) => {
  try {
    const showAll = req.query.all && req.user?.is_admin;
    const sql = showAll
      ? 'SELECT * FROM questions ORDER BY created_at DESC'
      : 'SELECT * FROM questions ORDER BY resolved ASC, created_at DESC';
    const { rows } = await pool.query(sql);
    res.json({ questions: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/questions/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM questions WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'שאלה לא נמצאה' });
    res.json({ question: rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/questions', adminAuth, async (req, res) => {
  try {
    const { question, category, deadline, option_yes, option_no, description } = req.body;
    if (!question) return res.status(400).json({ error: 'חסר טקסט שאלה' });
    const r = await pool.query(
      'INSERT INTO questions (question, category, deadline, option_yes, option_no, created_by, description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [question, category || 'כללי', deadline || null, option_yes || 'כן', option_no || 'לא', req.user.id, description || '']
    );
    logActivity('question', `סקר חדש פורסם: "${question}"`);
    res.json({ id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bet', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { question_id, choice, amount } = req.body;
    if (!['YES', 'NO'].includes(choice)) return res.status(400).json({ error: 'בחירה לא תקינה' });
    if (!amount || amount < 10) return res.status(400).json({ error: 'מינימום 10 נק"ז' });
    if (amount > req.user.balance) return res.status(400).json({ error: 'אין מספיק נק"ז' });

    const { rows: qRows } = await client.query('SELECT * FROM questions WHERE id = $1', [question_id]);
    if (!qRows[0]) return res.status(404).json({ error: 'שאלה לא נמצאה' });
    if (qRows[0].resolved) return res.status(400).json({ error: 'השאלה כבר נסגרה' });

    await client.query('BEGIN');
    await client.query('INSERT INTO bets (user_id, question_id, choice, amount) VALUES ($1,$2,$3,$4)', [req.user.id, question_id, choice, amount]);
    if (choice === 'YES') await client.query('UPDATE questions SET yes_volume = yes_volume + $1, yes_count = yes_count + 1 WHERE id = $2', [amount, question_id]);
    else await client.query('UPDATE questions SET no_volume = no_volume + $1, no_count = no_count + 1 WHERE id = $2', [amount, question_id]);
    await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, req.user.id]);
    await client.query('COMMIT');

    const { rows: uRows } = await client.query('SELECT balance FROM users WHERE id = $1', [req.user.id]);
    const choiceLabel = choice === 'YES' ? (qRows[0].option_yes || 'כן') : (qRows[0].option_no || 'לא');
    logActivity('bet', `${req.user.display_name} הימר ${amount} נק"ז על "${qRows[0].question}" — ${choiceLabel}`);
    res.json({ success: true, new_balance: uRows[0].balance });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/api/questions/:id/resolve', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { result } = req.body;
    if (!['YES', 'NO'].includes(result)) return res.status(400).json({ error: 'תוצאה לא תקינה' });
    const { rows: qRows } = await client.query('SELECT * FROM questions WHERE id = $1', [req.params.id]);
    if (!qRows[0]) return res.status(404).json({ error: 'שאלה לא נמצאה' });
    if (qRows[0].resolved) return res.status(400).json({ error: 'כבר נסגרה' });

    await client.query('BEGIN');
    await client.query('UPDATE questions SET resolved = 1, result = $1 WHERE id = $2', [result, qRows[0].id]);

    const { rows: winBets }  = await client.query('SELECT * FROM bets WHERE question_id = $1 AND choice = $2', [qRows[0].id, result]);
    const { rows: loseBets } = await client.query('SELECT * FROM bets WHERE question_id = $1 AND choice != $2', [qRows[0].id, result]);

    const winPool  = winBets.reduce((s, b) => s + b.amount, 0);
    const total    = winPool + loseBets.reduce((s, b) => s + b.amount, 0);

    for (const bet of winBets) {
      const payout = winPool > 0 ? (bet.amount / winPool) * total : bet.amount;
      await client.query('UPDATE bets SET won = 1, payout = $1 WHERE id = $2', [payout, bet.id]);
      await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [payout, bet.user_id]);
    }
    for (const bet of loseBets) {
      await client.query('UPDATE bets SET won = 0, payout = 0 WHERE id = $1', [bet.id]);
    }
    await client.query('COMMIT');
    logActivity('resolve', `סקר נסגר — "${qRows[0].question}" — ${result === 'YES' ? (qRows[0].option_yes||'כן') : (qRows[0].option_no||'לא')} ניצח`);
    res.json({ success: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.delete('/api/questions/:id', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows: qRows } = await client.query('SELECT * FROM questions WHERE id = $1', [req.params.id]);
    if (!qRows[0]) return res.status(404).json({ error: 'לא נמצאה' });
    await client.query('BEGIN');
    if (!qRows[0].resolved) {
      const { rows: bets } = await client.query('SELECT * FROM bets WHERE question_id = $1', [qRows[0].id]);
      for (const bet of bets) await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [bet.amount, bet.user_id]);
    }
    await client.query('DELETE FROM bets WHERE question_id = $1', [qRows[0].id]);
    await client.query('DELETE FROM questions WHERE id = $1', [qRows[0].id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.get('/api/my-bets', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.*, q.question, q.resolved, q.result, q.option_yes, q.option_no
      FROM bets b JOIN questions q ON q.id = b.question_id
      WHERE b.user_id = $1 ORDER BY b.created_at DESC
    `, [req.user.id]);
    res.json({ bets: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, display_name, balance FROM users ORDER BY balance DESC LIMIT 20');
    res.json({ users: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// --- Admin: list users ---
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, username, display_name, balance, is_admin FROM users ORDER BY balance DESC');
    res.json({ users: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Admin: delete user ---
app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'משתמש לא נמצא' });
    if (rows[0].is_admin) return res.status(400).json({ error: 'לא ניתן למחוק מנהל' });
    await client.query('BEGIN');
    await client.query('DELETE FROM bets WHERE user_id = $1', [req.params.id]);
    await client.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});


// --- Complaints table ---
async function initComplaints() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS complaints (
      id          SERIAL PRIMARY KEY,
      content     TEXT NOT NULL,
      rating      INTEGER DEFAULT 0,
      author_name TEXT NOT NULL,
      user_id     INTEGER,
      created_at  TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
    )
  `);
}
initComplaints().catch(console.error);

app.get('/api/complaints', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM complaints ORDER BY created_at DESC LIMIT 100');
    res.json({ complaints: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/complaints', async (req, res) => {
  try {
    const { content, rating, author_name } = req.body;
    if (!content || content.trim().length < 5)
      return res.status(400).json({ error: 'תלונה קצרה מדי' });
    await pool.query(
      'INSERT INTO complaints (content, rating, author_name, user_id) VALUES ($1,$2,$3,$4)',
      [content.trim(), rating || 0, author_name || 'אנונימי', req.user?.id||null]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// --- Suggestions table ---
async function initSuggestions() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id          SERIAL PRIMARY KEY,
      question    TEXT NOT NULL,
      category    TEXT DEFAULT 'כללי',
      option_yes  TEXT DEFAULT 'כן',
      option_no   TEXT DEFAULT 'לא',
      department  TEXT DEFAULT '',
      user_id     INTEGER,
      username    TEXT,
      approved    INTEGER DEFAULT 0,
      is_draft    INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
    )
  `);
}
initSuggestions().then(async () => {
  try { await pool.query("ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS department TEXT DEFAULT ''"); } catch(e) {}
  try { await pool.query("ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS is_draft INTEGER DEFAULT 0"); } catch(e) {}
}).catch(console.error);

// Submit suggestion
app.post('/api/suggestions', async (req, res) => {
  try {
    const { question, category, option_yes, option_no } = req.body;
    if (!question || question.trim().length < 5)
      return res.status(400).json({ error: 'שאלה קצרה מדי' });
    const { department } = req.body;
    const { is_draft } = req.body;
    await pool.query(
      'INSERT INTO suggestions (question, category, option_yes, option_no, department, user_id, username, is_draft, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [question.trim(), category||'כללי', option_yes||'כן', option_no||'לא', department||'', req.user?.id||null, req.user?.display_name||'אורח', is_draft?1:0, description||'']
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get suggestions (admin)
app.get('/api/suggestions', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM suggestions WHERE approved = 0 ORDER BY created_at DESC');
    res.json({ suggestions: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Approve suggestion (admin) - creates a question
app.post('/api/suggestions/:id/approve', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM suggestions WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'לא נמצאה' });
    const s = rows[0];
    await pool.query(
      'INSERT INTO questions (question, category, option_yes, option_no, department, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [s.question, s.category, s.option_yes, s.option_no, s.department||'', req.user.id]
    );
    await pool.query('UPDATE suggestions SET approved = 1 WHERE id = $1', [s.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Delete suggestion (admin)
app.delete('/api/suggestions/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM suggestions WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// --- Guest votes ---
async function initGuestVotes() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guest_votes (
      id          SERIAL PRIMARY KEY,
      question_id INTEGER NOT NULL,
      ip_address  TEXT NOT NULL,
      choice      TEXT NOT NULL,
      created_at  TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')),
      UNIQUE(question_id, ip_address)
    )
  `);
}
initGuestVotes().catch(console.error);

app.post('/api/guest-vote', async (req, res) => {
  try {
    const { question_id, choice } = req.body;
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    if (!['YES','NO'].includes(choice))
      return res.status(400).json({ error: 'בחירה לא תקינה' });

    const q = await pool.query('SELECT * FROM questions WHERE id = $1', [question_id]);
    if (!q.rows[0]) return res.status(404).json({ error: 'סקר לא נמצא' });
    if (q.rows[0].resolved) return res.status(400).json({ error: 'הסקר נסגר' });

    // Check already voted
    const existing = await pool.query(
      'SELECT id FROM guest_votes WHERE question_id = $1 AND ip_address = $2',
      [question_id, ip]
    );
    if (existing.rows[0]) return res.status(400).json({ error: 'already_voted' });

    // Insert vote and update volumes (50 nkz weight)
    const GUEST_WEIGHT = 50;
    await pool.query(
      'INSERT INTO guest_votes (question_id, ip_address, choice) VALUES ($1,$2,$3)',
      [question_id, ip, choice]
    );
    if (choice === 'YES') {
      await pool.query('UPDATE questions SET yes_volume = yes_volume + $1, yes_count = yes_count + 1 WHERE id = $2', [GUEST_WEIGHT, question_id]);
    } else {
      await pool.query('UPDATE questions SET no_volume = no_volume + $1, no_count = no_count + 1 WHERE id = $2', [GUEST_WEIGHT, question_id]);
    }

    const choiceLabelGuest = choice === 'YES' ? (q.rows[0].option_yes || 'כן') : (q.rows[0].option_no || 'לא');
    logActivity('guest_vote', `אורח הצביע על "${q.rows[0].question}" — ${choiceLabelGuest}`);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Allow unauthenticated access to questions list and complaints
app.get('/api/questions/public', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM questions ORDER BY resolved ASC, created_at DESC');
    res.json({ questions: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// Delete complaint (admin)
app.delete('/api/complaints/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM complaints WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// Update profile
app.post('/api/me/update', auth, async (req, res) => {
  try {
    const { display_name, password } = req.body;
    if (!display_name) return res.status(400).json({ error: 'שם תצוגה לא יכול להיות ריק' });

    if (password) {
      if (password.length < 4) return res.status(400).json({ error: 'סיסמה חייבת להיות לפחות 4 תווים' });
      const hash = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET display_name=$1, password=$2 WHERE id=$3', [display_name, hash, req.user.id]);
    } else {
      await pool.query('UPDATE users SET display_name=$1 WHERE id=$2', [display_name, req.user.id]);
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    if (req.user.display_name !== display_name) {
      logActivity('rename', `${req.user.display_name} שינה שם ל-${display_name}`);
    }
    res.json({ display_name: rows[0].display_name });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Question chart data from activity_log ---
app.get('/api/questions/:id/chart', async (req, res) => {
  try {
    const qid = req.params.id;
    const { rows: qRows } = await pool.query('SELECT * FROM questions WHERE id=$1', [qid]);
    if (!qRows[0]) return res.status(404).json({ error: 'לא נמצא' });
    const q = qRows[0];

    // שליפת כל הימורים מה-log
    const { rows: logs } = await pool.query(
      `SELECT message, created_at FROM activity_log
       WHERE (type='bet' OR type='guest_vote')
         AND message LIKE $1
       ORDER BY created_at ASC`,
      [`%"${q.question}"%`]
    );

    // שחזור האחוזים לאורך זמן
    let yesVol = 0, noVol = 0;
    const points = [];

    for (const log of logs) {
      const msg = log.message;
      // זיהוי צד
      const isYes = msg.includes(`— ${q.option_yes || 'כן'}`);
      const isNo  = msg.includes(`— ${q.option_no  || 'לא'}`);
      if (!isYes && !isNo) continue;

      // חילוץ סכום (רק הימורים רשומים, לא אורחים)
      const amountMatch = msg.match(/הימר ([\d,]+) נק/);
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g,'')) : 50;

      if (isYes) yesVol += amount;
      else       noVol  += amount;

      const total = yesVol + noVol;
      points.push({
        time: log.created_at,
        yes:  total > 0 ? Math.round((yesVol / total) * 100) : 50,
        no:   total > 0 ? Math.round((noVol  / total) * 100) : 50,
      });
    }

    // נקודת התחלה
    if (points.length > 0) {
      points.unshift({ time: q.created_at, yes: 50, no: 50 });
    }

    // נקודת סיום (מצב נוכחי)
    const curTotal = q.yes_volume + q.no_volume;
    if (points.length > 0) {
      points.push({
        time: q.resolved ? (points[points.length-1]?.time || q.created_at) : new Date().toISOString(),
        yes:  curTotal > 0 ? Math.round((q.yes_volume / curTotal) * 100) : 50,
        no:   curTotal > 0 ? Math.round((q.no_volume  / curTotal) * 100) : 50,
      });
    }

    res.json({ points, option_yes: q.option_yes || 'כן', option_no: q.option_no || 'לא' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Edit suggestion ---
app.put('/api/suggestions/:id', adminAuth, async (req, res) => {
  try {
    const { question, category, option_yes, option_no, department, description, deadline } = req.body;
    await pool.query(
      'UPDATE suggestions SET question=$1, category=$2, option_yes=$3, option_no=$4, department=$5, description=$6 WHERE id=$7',
      [question, category||'כללי', option_yes||'כן', option_no||'לא', department||'', description||'', req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Approve suggestion with edits (publish or draft) ---
app.post('/api/suggestions/:id/approve-edited', adminAuth, async (req, res) => {
  try {
    const { question, category, option_yes, option_no, department, description, deadline, as_draft } = req.body;
    const isDraft = as_draft === true;
    const r = await pool.query(
      'INSERT INTO questions (question, category, deadline, option_yes, option_no, department, description, created_by, is_draft) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [question, category||'כללי', deadline||null, option_yes||'כן', option_no||'לא', department||'', description||'', req.user.id, isDraft]
    );
    await pool.query('UPDATE suggestions SET approved=true WHERE id=$1', [req.params.id]);
    if (!isDraft) logActivity('question', `סקר חדש פורסם: "${question}"`);
    res.json({ id: r.rows[0].id, is_draft: isDraft });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Edit existing question ---
app.put('/api/questions/:id', adminAuth, async (req, res) => {
  try {
    const { question, category, option_yes, option_no, department, description, deadline } = req.body;
    await pool.query(
      'UPDATE questions SET question=$1, category=$2, option_yes=$3, option_no=$4, department=$5, description=$6, deadline=$7 WHERE id=$8',
      [question, category||'כללי', option_yes||'כן', option_no||'לא', department||'', description||'', deadline||null, req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Activity log endpoint ---
app.get('/api/admin/activity', adminAuth, async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM activity_log';
    const params = [];
    if (type && type !== 'all') {
      query += ' WHERE type = $1';
      params.push(type);
    }
    query += ' ORDER BY created_at DESC LIMIT 200';
    const { rows } = await pool.query(query, params);
    res.json({ activity: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`🎓 SCE Bets רץ על http://localhost:${PORT}`));
