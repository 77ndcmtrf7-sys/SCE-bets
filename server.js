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
  try { await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS institution TEXT DEFAULT 'כללי'"); } catch(e) {}
  try { await pool.query("ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS institution TEXT DEFAULT 'כללי'"); } catch(e) {}
  try { await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ"); } catch(e) {}
  try { await pool.query("ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''"); } catch(e) {}
  try { await pool.query("ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS deadline TEXT DEFAULT NULL"); } catch(e) {}
  try { await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'binary'"); } catch(e) {}
  try { await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_number REAL"); } catch(e) {}
  try { await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS number_unit TEXT DEFAULT ''"); } catch(e) {}
  try { await pool.query("ALTER TABLE bets ADD COLUMN IF NOT EXISTS guess_number REAL"); } catch(e) {}
  try { await pool.query("ALTER TABLE bets ALTER COLUMN choice DROP NOT NULL"); } catch(e) {}
  try { await pool.query("ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'binary'"); } catch(e) {}
  try { await pool.query("ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS number_unit TEXT DEFAULT ''"); } catch(e) {}
  try { await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS locked INTEGER DEFAULT 0"); } catch(e) {}
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

// אימות אופציונלי — ממלא req.user אם יש טוקן תקין, אבל לא דוחה בקשות בלי טוקן.
// משמש נתיבים שגם אורחים וגם משתמשים רשומים יכולים לגשת אליהם, אך שצריכים
// לדעת מי המשתמש (אם קיים) כדי להתאים את ההתנהגות.
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) { req.user = null; return next(); }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, SECRET);
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [payload.id]);
    req.user = rows[0] || null;
  } catch { req.user = null; }
  next();
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

app.get('/api/questions', optionalAuth, async (req, res) => {
  try {
    await autoLockExpiredQuestions();
    const showAll = req.query.all && req.user?.is_admin;
    const sql = showAll
      ? 'SELECT * FROM questions ORDER BY created_at DESC'
      : `SELECT * FROM questions
         WHERE resolved = 0
            OR (resolved = 1 AND resolved_at IS NOT NULL AND resolved_at > NOW() - INTERVAL '24 hours')
         ORDER BY resolved ASC, created_at DESC`;
    const { rows } = await pool.query(sql);
    await attachRealStakes(rows);
    res.json({ questions: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// נועל אוטומטית סקרים פעילים שעבר מועד הסגירה שלהם, אבל טרם נסגרו בפועל.
// נעילה שונה מסגירה: היא הפיכה (המנהל יכול לפתוח אותה מחדש) ולא קובעת תוצאה/משלמת דבר.
// "deadline" נשמר כטקסט בזמן מקומי (ישראל) בלי אזור זמן, לכן הפרשנות מפורשת ל-Asia/Jerusalem.
// בדיקת regex לפני ה-cast מונעת מצב שבו ערך deadline פגום יחיד גורם ל-UPDATE כולו
// (על כל השאלות) להיכשל בבת אחת — ב-Postgres כשל cast בשורה אחת פוסל את כל הפקודה.
async function autoLockExpiredQuestions() {
  try {
    await pool.query(`
      UPDATE questions
      SET locked = 1
      WHERE resolved = 0
        AND locked = 0
        AND deadline IS NOT NULL
        AND deadline ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}'
        AND (deadline::timestamp AT TIME ZONE 'Asia/Jerusalem') < NOW()
    `);
  } catch(e) { console.error('autoLockExpiredQuestions error:', e.message); }
}

// מוסיף לכל שאלה real_yes / real_no — סך ההימורים האמיתיים (מ-bets) בכל צד.
// משמש את הלקוח כדי להציג רווח פוטנציאלי מדויק (זהה לחישוב התשלום בשרת).
async function attachRealStakes(questions) {
  if (!questions.length) return;
  const ids = questions.map(q => q.id);
  const { rows } = await pool.query(
    `SELECT question_id, choice, COALESCE(SUM(amount),0) AS stake, COUNT(*) AS cnt
     FROM bets WHERE question_id = ANY($1) GROUP BY question_id, choice`,
    [ids]
  );
  const map = {};
  for (const r of rows) {
    if (!map[r.question_id]) map[r.question_id] = { YES: 0, NO: 0, total: 0, count: 0 };
    if (r.choice === 'YES' || r.choice === 'NO') map[r.question_id][r.choice] = parseFloat(r.stake);
    map[r.question_id].total += parseFloat(r.stake);
    map[r.question_id].count += parseInt(r.cnt);
  }

  // ממוצע ניחושים — רק לשאלות מסוג closest_number, ורק אגרגט (לא חושף ניחוש בודד)
  const numberIds = questions.filter(q => q.question_type === 'closest_number').map(q => q.id);
  const avgMap = {};
  if (numberIds.length) {
    const { rows: avgRows } = await pool.query(
      `SELECT question_id, AVG(guess_number) AS avg_guess
       FROM bets WHERE question_id = ANY($1) AND guess_number IS NOT NULL GROUP BY question_id`,
      [numberIds]
    );
    for (const r of avgRows) avgMap[r.question_id] = parseFloat(r.avg_guess);
  }

  for (const q of questions) {
    q.real_yes = map[q.id]?.YES || 0;
    q.real_no  = map[q.id]?.NO  || 0;
    if (q.question_type === 'closest_number') {
      q.number_pool  = map[q.id]?.total || 0;
      q.number_count = map[q.id]?.count || 0;
      q.number_avg   = avgMap[q.id] ?? null;
    }
  }
}

app.get('/api/questions/:id', auth, async (req, res) => {
  try {
    await autoLockExpiredQuestions();
    const { rows } = await pool.query('SELECT * FROM questions WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'שאלה לא נמצאה' });
    await attachRealStakes(rows);
    res.json({ question: rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/questions', adminAuth, async (req, res) => {
  try {
    const { question, category, deadline, option_yes, option_no, description, institution, question_type, number_unit } = req.body;
    if (!question) return res.status(400).json({ error: 'חסר טקסט שאלה' });
    const qType = question_type === 'closest_number' ? 'closest_number' : 'binary';
    const r = await pool.query(
      'INSERT INTO questions (question, category, deadline, option_yes, option_no, created_by, description, institution, question_type, number_unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
      [question, category || 'כללי', deadline || null, option_yes || 'כן', option_no || 'לא', req.user.id, description || '', institution || 'כללי', qType, number_unit || '']
    );
    logActivity('question', `סקר חדש פורסם: "${question}"`);
    res.json({ id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bet', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { question_id, choice, amount, guess_number } = req.body;
    if (!amount || amount < 10) return res.status(400).json({ error: 'מינימום 10 נק"ז' });

    const { rows: qRows } = await client.query('SELECT * FROM questions WHERE id = $1', [question_id]);
    if (!qRows[0]) return res.status(404).json({ error: 'שאלה לא נמצאה' });
    if (qRows[0].resolved) return res.status(400).json({ error: 'השאלה כבר נסגרה' });

    // נעילה — ידנית ע"י מנהל, או אוטומטית אם מועד הסגירה עבר
    let isLocked = qRows[0].locked === 1;
    const DEADLINE_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
    if (!isLocked && qRows[0].deadline && DEADLINE_FORMAT.test(qRows[0].deadline)) {
      const { rows: lockCheck } = await client.query(
        `SELECT (deadline::timestamp AT TIME ZONE 'Asia/Jerusalem') < NOW() AS expired FROM questions WHERE id = $1`,
        [question_id]
      );
      if (lockCheck[0]?.expired) {
        await client.query('UPDATE questions SET locked = 1 WHERE id = $1', [question_id]);
        isLocked = true;
      }
    }
    if (isLocked) return res.status(400).json({ error: 'הסקר נעול להימורים כרגע' });

    const qType = qRows[0].question_type || 'binary';
    let num = null;

    if (qType === 'closest_number') {
      num = parseFloat(guess_number);
      if (guess_number === undefined || guess_number === null || guess_number === '' || isNaN(num)) {
        return res.status(400).json({ error: 'צריך להכניס ניחוש מספרי' });
      }
    } else {
      if (!['YES', 'NO'].includes(choice)) return res.status(400).json({ error: 'בחירה לא תקינה' });
    }

    await client.query('BEGIN');

    // ניכוי אטומי של היתרה בתוך אותה קריאה — מונע מצב שבו שתי בקשות הימור
    // סמוכות (דאבל-קליק, שני טאבים) שתיהן עוברות את הבדיקה לפני שמישהי מהן מנכה בפועל.
    const { rows: balRows } = await client.query(
      'UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING balance',
      [amount, req.user.id]
    );
    if (!balRows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'אין מספיק נק"ז' });
    }

    if (qType === 'closest_number') {
      await client.query('INSERT INTO bets (user_id, question_id, guess_number, amount) VALUES ($1,$2,$3,$4)', [req.user.id, question_id, num, amount]);
    } else {
      await client.query('INSERT INTO bets (user_id, question_id, choice, amount) VALUES ($1,$2,$3,$4)', [req.user.id, question_id, choice, amount]);
      if (choice === 'YES') await client.query('UPDATE questions SET yes_volume = yes_volume + $1, yes_count = yes_count + 1 WHERE id = $2', [amount, question_id]);
      else await client.query('UPDATE questions SET no_volume = no_volume + $1, no_count = no_count + 1 WHERE id = $2', [amount, question_id]);
    }
    await client.query('COMMIT');

    let logMsg;
    if (qType === 'closest_number') {
      const unit = qRows[0].number_unit ? ` ${qRows[0].number_unit}` : '';
      logMsg = `${req.user.display_name} ניחש ${num}${unit} על "${qRows[0].question}" — הימר ${amount} נק"ז`;
    } else {
      const choiceLabel = choice === 'YES' ? (qRows[0].option_yes || 'כן') : (qRows[0].option_no || 'לא');
      logMsg = `${req.user.display_name} הימר ${amount} נק"ז על "${qRows[0].question}" — ${choiceLabel}`;
    }
    logActivity('bet', logMsg);
    res.json({ success: true, new_balance: balRows[0].balance });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/api/questions/:id/resolve', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows: qRows } = await client.query('SELECT * FROM questions WHERE id = $1', [req.params.id]);
    if (!qRows[0]) return res.status(404).json({ error: 'שאלה לא נמצאה' });
    if (qRows[0].resolved) return res.status(400).json({ error: 'כבר נסגרה' });

    const qType = qRows[0].question_type || 'binary';

    if (qType === 'closest_number') {
      const correctNumber = parseFloat(req.body.correct_number);
      if (req.body.correct_number === undefined || req.body.correct_number === null || req.body.correct_number === '' || isNaN(correctNumber)) {
        return res.status(400).json({ error: 'צריך להכניס את המספר הנכון' });
      }

      const { rows: allBets } = await client.query('SELECT * FROM bets WHERE question_id = $1 ORDER BY id ASC', [qRows[0].id]);

      // מיון לפי קרבה למספר הנכון; שוויון נשבר לפי מי הימר קודם
      const sorted = [...allBets].sort((a, b) => {
        const da = Math.abs(a.guess_number - correctNumber);
        const db = Math.abs(b.guess_number - correctNumber);
        if (da !== db) return da - db;
        return a.id - b.id;
      });
      const winners = sorted.slice(0, 3);
      const winnerIds = new Set(winners.map(w => w.id));

      const totalPool   = allBets.reduce((s, b) => s + b.amount, 0);
      const winnerStake = winners.reduce((s, b) => s + b.amount, 0);

      await client.query('BEGIN');
      await client.query('UPDATE questions SET resolved = 1, correct_number = $1, resolved_at = NOW() WHERE id = $2', [correctNumber, qRows[0].id]);

      for (const bet of allBets) {
        if (winnerIds.has(bet.id)) {
          let payout = winnerStake > 0 ? (bet.amount / winnerStake) * totalPool : bet.amount;
          if (payout < bet.amount) payout = bet.amount; // זוכה לעולם לא מקבל פחות מהימורו
          payout = Math.round(payout);
          await client.query('UPDATE bets SET won = 1, payout = $1 WHERE id = $2', [payout, bet.id]);
          await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [payout, bet.user_id]);
        } else {
          await client.query('UPDATE bets SET won = 0, payout = 0 WHERE id = $1', [bet.id]);
        }
      }
      await client.query('COMMIT');
      logActivity('resolve', `סקר נסגר — "${qRows[0].question}" — המספר הנכון: ${correctNumber}`);
      return res.json({ success: true });
    }

    // ===== בינארי (כן/לא) — לוגיקה קיימת ללא שינוי =====
    const { result } = req.body;
    if (!['YES', 'NO'].includes(result)) return res.status(400).json({ error: 'תוצאה לא תקינה' });

    await client.query('BEGIN');
    await client.query('UPDATE questions SET resolved = 1, result = $1, resolved_at = NOW() WHERE id = $2', [result, qRows[0].id]);

    const { rows: winBets }  = await client.query('SELECT * FROM bets WHERE question_id = $1 AND choice = $2', [qRows[0].id, result]);
    const { rows: loseBets } = await client.query('SELECT * FROM bets WHERE question_id = $1 AND choice != $2', [qRows[0].id, result]);

    // הקופה כולה — כולל משקל אורחים (yes_volume/no_volume כבר כוללים אותו).
    const totalVolume = (qRows[0].yes_volume || 0) + (qRows[0].no_volume || 0);
    // סך ההימורים האמיתיים בצד המנצח (משתמשים רשומים בלבד).
    // אורחים מזרימים כסף לקופה אך אינם גובים — כל הקופה מתחלקת בין הזוכים האמיתיים
    // לפי גודל ההימור שלהם.
    const realWinStake = winBets.reduce((s, b) => s + b.amount, 0);

    for (const bet of winBets) {
      let payout = realWinStake > 0
        ? (bet.amount / realWinStake) * totalVolume
        : bet.amount;
      if (payout < bet.amount) payout = bet.amount; // זוכה לעולם לא מקבל פחות מהימורו
      payout = Math.round(payout);
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
app.post('/api/suggestions', optionalAuth, async (req, res) => {
  try {
    const { question, category, option_yes, option_no, department, description, deadline, institution, question_type, number_unit } = req.body;
    if (!question || question.trim().length < 5)
      return res.status(400).json({ error: 'שאלה קצרה מדי' });
    const qType = question_type === 'closest_number' ? 'closest_number' : 'binary';
    const { is_draft } = req.body;
    await pool.query(
      'INSERT INTO suggestions (question, category, option_yes, option_no, department, user_id, username, is_draft, description, deadline, institution, question_type, number_unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [question.trim(), category||'כללי', option_yes||'כן', option_no||'לא', department||'', req.user?.id||null, req.user?.display_name||'אורח', is_draft?1:0, description||'', deadline||null, institution||'כללי', qType, number_unit||'']
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
      'INSERT INTO questions (question, category, option_yes, option_no, department, created_by, institution, description, deadline, question_type, number_unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [s.question, s.category, s.option_yes, s.option_no, s.department||'', req.user.id, s.institution||'כללי', s.description||'', s.deadline||null, s.question_type||'binary', s.number_unit||'']
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
    if (q.rows[0].locked) return res.status(400).json({ error: 'הסקר נעול כרגע' });
    if (q.rows[0].question_type === 'closest_number')
      return res.status(400).json({ error: 'סקרי ניחוש מספר פתוחים למשתמשים רשומים בלבד' });

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

// --- Edit suggestion ---
app.put('/api/suggestions/:id', adminAuth, async (req, res) => {
  try {
    const { question, category, option_yes, option_no, department, description, deadline, institution, question_type, number_unit } = req.body;
    const qType = question_type === 'closest_number' ? 'closest_number' : 'binary';
    await pool.query(
      'UPDATE suggestions SET question=$1, category=$2, option_yes=$3, option_no=$4, department=$5, description=$6, deadline=$7, institution=$8, question_type=$9, number_unit=$10 WHERE id=$11',
      [question, category||'כללי', option_yes||'כן', option_no||'לא', department||'', description||'', deadline||null, institution||'כללי', qType, number_unit||'', req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Approve suggestion with edits (publish or draft) ---
app.post('/api/suggestions/:id/approve-edited', adminAuth, async (req, res) => {
  try {
    const { question, category, option_yes, option_no, department, description, deadline, as_draft, institution, question_type, number_unit } = req.body;
    const qType = question_type === 'closest_number' ? 'closest_number' : 'binary';

    // עדכון ההצעה עם הנתונים החדשים
    await pool.query(
      'UPDATE suggestions SET question=$1, category=$2, option_yes=$3, option_no=$4, department=$5, description=$6, deadline=$7, institution=$8, question_type=$9, number_unit=$10 WHERE id=$11',
      [question, category||'כללי', option_yes||'כן', option_no||'לא', department||'', description||'', deadline||null, institution||'כללי', qType, number_unit||'', req.params.id]
    );

    if (as_draft === true) {
      // שמור כטיוטה — ה-suggestion נשאר עם is_draft=1
      await pool.query('UPDATE suggestions SET is_draft=1, approved=0 WHERE id=$1', [req.params.id]);
      res.json({ success: true, is_draft: true });
    } else {
      // פרסם — יצירת שאלה חדשה ומחיקת ה-suggestion
      const r = await pool.query(
        'INSERT INTO questions (question, category, deadline, option_yes, option_no, department, description, created_by, institution, question_type, number_unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
        [question, category||'כללי', deadline||null, option_yes||'כן', option_no||'לא', department||'', description||'', req.user.id, institution||'כללי', qType, number_unit||'']
      );
      await pool.query('UPDATE suggestions SET approved=1 WHERE id=$1', [req.params.id]);
      logActivity('question', `סקר חדש פורסם: "${question}"`);
      res.json({ id: r.rows[0].id, is_draft: false });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Edit existing question ---
app.put('/api/questions/:id', adminAuth, async (req, res) => {
  try {
    const { question, category, option_yes, option_no, department, description, deadline, institution, number_unit } = req.body;
    await pool.query(
      'UPDATE questions SET question=$1, category=$2, option_yes=$3, option_no=$4, department=$5, description=$6, deadline=$7, institution=$8, number_unit=$9 WHERE id=$10',
      [question, category||'כללי', option_yes||'כן', option_no||'לא', department||'', description||'', deadline||null, institution||'כללי', number_unit||'', req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Manually move a resolved question to the archive ---
app.post('/api/questions/:id/archive', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT resolved FROM questions WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'סקר לא נמצא' });
    if (rows[0].resolved != 1) return res.status(400).json({ error: 'אפשר לארכב רק סקר שנסגר' });
    // מזיז את resolved_at אל מעבר ל-24 שעות אחורה כדי שייכנס מיד לארכיון
    await pool.query("UPDATE questions SET resolved_at = NOW() - INTERVAL '25 hours' WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Lock / unlock a question (reversible; blocks betting without resolving) ---
app.post('/api/questions/:id/lock', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT resolved FROM questions WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'סקר לא נמצא' });
    if (rows[0].resolved == 1) return res.status(400).json({ error: 'אי אפשר לנעול סקר שכבר נסגר' });
    await pool.query('UPDATE questions SET locked = 1 WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/questions/:id/unlock', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id FROM questions WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'סקר לא נמצא' });
    await pool.query('UPDATE questions SET locked = 0 WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Archive endpoint ---
app.get('/api/archive', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM questions
      WHERE resolved = 1
        AND (resolved_at IS NULL OR resolved_at < NOW() - INTERVAL '24 hours')
      ORDER BY COALESCE(resolved_at, created_at::TIMESTAMPTZ) DESC
    `);
    await attachRealStakes(rows);
    res.json({ questions: rows });
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
