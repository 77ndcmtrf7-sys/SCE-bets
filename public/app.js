/* ============================================================
   SCE BETS — client logic v2
   API contract: unchanged. No server modifications needed.
   ============================================================ */

let currentUser = null;
let currentBetQuestion = null;
let currentBetChoice = 'YES';
const API = '';
let marketsPollingTimer = null;
let modalOpen = false;

// ── UTILS ──────────────────────────────────────────────────
function authHeaders() { return { Authorization: `Bearer ${localStorage.getItem('token')}` }; }
function formatNum(n) { return Number(n).toLocaleString('he-IL'); }
function esc(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 3200);
}

// ── THEME ──────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('theme');
  const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', saved || sys);
  updateToggleBtn();
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const next = (!current ? sys === 'dark' : current === 'dark') ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateToggleBtn();
}
function updateToggleBtn() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  btn.textContent = isDark ? '☀️' : '🌑';
  btn.title = isDark ? 'מצב בהיר' : 'מצב כהה';
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateToggleBtn);

// ── INIT ───────────────────────────────────────────────────
window.onload = () => {
  initTheme();
  initStars();
  const token = localStorage.getItem('token');
  if (token) tryAutoLogin();
  else { loadMarkets(); updateGuestUI(false); }
  startMarketsPolling();
  loadSuggestionsBadge();
};

async function tryAutoLogin() {
  const res = await fetch(`${API}/api/me`, { headers: authHeaders() });
  if (res.ok) { const d = await res.json(); loginSuccess(d); }
  else { localStorage.removeItem('token'); updateGuestUI(false); loadMarkets(); }
}

// ── PASSWORD TOGGLE ────────────────────────────────────────
function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
  else { input.type = 'password'; btn.textContent = '👁'; }
}

// ── GUEST MODE ─────────────────────────────────────────────
function updateGuestUI(loggedIn = false) {
  const logoutBtn   = document.getElementById('logout-btn');
  const authNavBtn  = document.getElementById('auth-nav-btn');
  const adminTab    = document.getElementById('admin-tab');
  const mobileAdmin = document.getElementById('mobile-admin-tab');
  const navBalance  = document.getElementById('nav-balance-chip');
  const navUsername = document.getElementById('nav-username');
  const profileBtn  = document.getElementById('profile-btn');
  const fab         = document.getElementById('suggest-fab');

  if (loggedIn) {
    if (logoutBtn)   logoutBtn.style.display = '';
    if (authNavBtn)  authNavBtn.style.display = 'none';
    if (navBalance)  navBalance.style.display = '';
    if (navUsername) navUsername.style.display = '';
    if (profileBtn)  profileBtn.style.display = '';
    if (fab)         fab.style.display = '';
  } else {
    if (logoutBtn)   logoutBtn.style.display = 'none';
    if (authNavBtn)  authNavBtn.style.display = '';
    if (navBalance)  navBalance.style.display = 'none';
    if (navUsername) navUsername.style.display = 'none';
    if (profileBtn)  profileBtn.style.display = 'none';
    if (adminTab)    adminTab.style.display = 'none';
    if (mobileAdmin) mobileAdmin.style.display = 'none';
    if (fab)         fab.style.display = '';

    if (!sessionStorage.getItem('guest-banner-dismissed')) {
      const b = document.getElementById('guest-banner');
      if (b) b.style.display = '';
    }
  }
}
function showAuthOverlay() { document.getElementById('auth-overlay').style.display = 'flex'; }
function hideAuthOverlay() {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('auth-error').textContent = '';
}
function dismissGuestBanner() {
  sessionStorage.setItem('guest-banner-dismissed', '1');
  const b = document.getElementById('guest-banner');
  if (b) b.style.display = 'none';
}

// ── AUTH TABS ──────────────────────────────────────────────
function switchTab(tab) {
  document.getElementById('login-form').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('auth-error').textContent = '';
}

// ── LOGIN / REGISTER ───────────────────────────────────────
async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) return showAuthError('אנא מלא את כל השדות');
  const res = await fetch(`${API}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const d = await res.json();
  if (!res.ok) return showAuthError(d.error || 'שגיאה בכניסה');
  localStorage.setItem('token', d.token);
  loginSuccess(d.user);
  hideAuthOverlay();
}
async function register() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!username || !password) return showAuthError('אנא מלא את כל השדות');
  if (password.length < 4) return showAuthError('סיסמה חייבת להכיל לפחות 4 תווים');
  const res = await fetch(`${API}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const d = await res.json();
  if (!res.ok) return showAuthError(d.error || 'שגיאה בהרשמה');
  localStorage.setItem('token', d.token);
  loginSuccess(d.user);
  hideAuthOverlay();
}
function loginSuccess(user) {
  currentUser = user;
  updateGuestUI(true);
  const nu = document.getElementById('nav-username');
  if (nu) nu.textContent = user.display_name || user.username;
  updateBalanceDisplay(user.balance);
  const adminTab    = document.getElementById('admin-tab');
  const mobileAdmin = document.getElementById('mobile-admin-tab');
  if (user.is_admin) {
    if (adminTab)    adminTab.style.display = '';
    if (mobileAdmin) mobileAdmin.style.display = '';
  }
  loadMarkets();
  startBalancePolling();
  dismissGuestBanner();
}
function logout() {
  localStorage.removeItem('token');
  currentUser = null;
  updateGuestUI(false);
  showToast('להתראות! 👋');
  showSection('markets', document.querySelector('.nav-link'));
  loadMarkets();
}
function showAuthError(msg) { document.getElementById('auth-error').textContent = msg; }

// ── SECTIONS ───────────────────────────────────────────────
function showSection(name, btn) {
  document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
  const el = document.getElementById(`section-${name}`);
  if (el) el.style.display = '';
  document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const loaders = { portfolio: loadPortfolio, leaderboard: loadLeaderboard, archive: loadArchive, complaints: loadComplaints, admin: loadAdminQuestions };
  if (loaders[name]) loaders[name]();
}
function setMobileTab(btn) {
  document.querySelectorAll('.mob-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ── DEADLINE ───────────────────────────────────────────────
function deadlineInfo(deadline) {
  if (!deadline) return { text: '', urgent: false };
  const diff = new Date(deadline) - Date.now();
  if (diff <= 0) return { text: 'נסגר', urgent: false };
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 5)    return { text: `${m}ד נותר`, urgent: true };
  if (m < 60)   return { text: `${m} דקות`, urgent: m < 60 };
  if (h < 24)   return { text: `${h} שעות`, urgent: true };
  return { text: `${d} ימים`, urgent: false };
}

// ── MARKETS ────────────────────────────────────────────────
async function loadMarkets(silent = false) {
  const res = await fetch(`${API}/api/questions`, { headers: authHeaders() });
  if (!res.ok) return;
  const qs = await res.json();
  if (!silent) renderMarkets(qs);
  else updateCardPcts(qs);
  startCountdowns();
}
function startMarketsPolling() {
  if (marketsPollingTimer) clearInterval(marketsPollingTimer);
  marketsPollingTimer = setInterval(() => {
    if (!modalOpen) loadMarkets(true);
  }, 12000);
}

function getCategoryColor(cat) {
  const map = { 'הרצאות': '#7c6aff', 'בחינות': '#ff6b6b', 'קפיטריה': '#ffd166', 'כללי': '#06d6a0' };
  if (map[cat]) return map[cat];
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = ((h << 5) - h) + cat.charCodeAt(i);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue},70%,65%)`;
}

const INSTITUTION_CONFIG = {
  'סמי שמעון': { gradient: 'linear-gradient(135deg,#7c6aff22,#7c6aff05)' },
  'בן גוריון':  { gradient: 'linear-gradient(135deg,#ff6b6b22,#ff6b6b05)' },
  'כללי':       { gradient: null }
};
function getInstitutionGradient(inst) { return INSTITUTION_CONFIG[inst]?.gradient || null; }

let currentInstFilter = 'all';
function filterByInstitution(inst, btn) {
  currentInstFilter = inst;
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.market-card').forEach(card => {
    const cardInst = card.dataset.inst || 'כללי';
    card.style.display = (inst === 'all' || cardInst === inst) ? '' : 'none';
  });
}

function marketCardHTML(q, { interactive = true } = {}) {
  const yesPct  = q.total_bets > 0 ? Math.round((q.yes_amount / q.total_bets) * 100) : 50;
  const noPct   = 100 - yesPct;
  const vol     = formatNum(q.total_bets || 0);
  const dl      = deadlineInfo(q.deadline);
  const yesLabel = esc(q.yes_label || 'כן');
  const noLabel  = esc(q.no_label  || 'לא');
  const catColor = getCategoryColor(q.category || 'כללי');

  let tagsHTML = `<span class="tag tag-cat" style="background:${catColor}26;border-color:currentColor">${esc(q.category||'כללי')}</span>`;
  if (q.department) tagsHTML += `<span class="tag tag-dept">${esc(q.department)}</span>`;
  if (q.institution && q.institution !== 'כללי') tagsHTML += `<span class="tag tag-inst">${esc(q.institution)}</span>`;

  let footerRight = '';
  if (interactive) {
    if (dl.urgent) footerRight = `<span class="tag tag-urgent">${esc(dl.text)}</span>`;
    footerRight += `<span class="card-bet-hint">הנח הימור ←</span>`;
  } else {
    footerRight = `<span class="tag tag-resolved">נסגר · ${q.result === 'YES' ? yesLabel : noLabel}</span>`;
  }

  const clickAttr = interactive
    ? `onclick="openBetModal(${q.id})" role="button" tabindex="0"`
    : '';

  // The duel: side widths encode live odds; the sides are the actions.
  // Logged-in click opens the bet modal pre-selected; guests cast a guest vote.
  const live = interactive && !q.resolved;
  const yesAction = !live ? '' : currentUser
    ? `onclick="event.stopPropagation();openBetModal(${q.id},'YES')"`
    : `onclick="event.stopPropagation();guestVote(${q.id},'YES')"`;
  const noAction = !live ? '' : currentUser
    ? `onclick="event.stopPropagation();openBetModal(${q.id},'NO')"`
    : `onclick="event.stopPropagation();guestVote(${q.id},'NO')"`;
  const yesLoser = q.resolved && q.result !== 'YES' ? ' loser' : '';
  const noLoser  = q.resolved && q.result !== 'NO'  ? ' loser' : '';

  const duelHTML = `
  <div class="duel">
    <button class="duel-side yes${yesLoser}" id="pct-bar-${q.id}" style="width:${yesPct}%" ${yesAction} aria-label="${yesLabel} ${yesPct}%">
      <span class="duel-pct" id="yes-pct-${q.id}">${yesPct}%</span>
      <span class="duel-name">${yesLabel}</span>
    </button>
    <button class="duel-side no${noLoser}" ${noAction} aria-label="${noLabel} ${noPct}%">
      <span class="duel-pct" id="no-pct-${q.id}">${noPct}%</span>
      <span class="duel-name">${noLabel}</span>
    </button>
  </div>`;

  const resultBanner = q.resolved ? `<div class="card-result-row ${q.result==='YES'?'yes-win':'no-win'}">הוכרע: ${q.result==='YES'?yesLabel:noLabel}</div>` : '';

  return `
<div class="market-card${q.resolved?' resolved':''}" data-id="${q.id}" data-inst="${esc(q.institution||'כללי')}"${q.deadline?` data-deadline="${esc(q.deadline)}"`:''} ${clickAttr}>
  <div class="card-top">
    <div class="card-tags">${tagsHTML}</div>
    <span class="card-volume">${vol} נק"ז</span>
  </div>
  <div class="card-question">${esc(q.question)}</div>
  ${q.description ? `<div class="card-desc">${esc(q.description.length > 90 ? q.description.slice(0,87)+'…' : q.description)}</div>` : ''}
  <div class="card-footer">
    <span class="card-deadline${dl.urgent?' urgent':''}" id="dl-${q.id}">${esc(dl.text)}</span>
    <div style="display:flex;align-items:center;gap:.5rem">${footerRight}</div>
  </div>
  ${resultBanner || duelHTML}
</div>`;
}

function renderMarkets(questions) {
  const grid = document.getElementById('markets-grid');
  buildTicker(questions);
  updateHeroStats(questions);
  if (!questions.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-title">אין שאלות פעילות כרגע</div><div class="empty-state-sub">בקרוב יתווספו שאלות חדשות</div></div>`;
    return;
  }
  grid.innerHTML = questions.map(q => marketCardHTML(q)).join('');
  grid.querySelectorAll('.market-card').forEach((el, i) => {
    el.style.animationDelay = `${Math.min(i * 0.05, 0.5)}s`;
  });
  filterByInstitution(currentInstFilter, null);
  startCountdowns();
}

// ── HERO STATS + TICKER ────────────────────────────────────
function updateHeroStats(questions) {
  const open = questions.filter(q => !q.resolved).length;
  const vol  = questions.reduce((s, q) => s + (Number(q.total_bets) || 0), 0);
  const o = document.getElementById('stat-open');
  const v = document.getElementById('stat-vol');
  if (o) o.textContent = formatNum(open);
  if (v) v.textContent = formatNum(vol);
}

function buildTicker(questions) {
  const wrap  = document.getElementById('ticker');
  const track = document.getElementById('ticker-track');
  if (!wrap || !track) return;
  const live = questions.filter(q => !q.resolved);
  if (live.length < 2) { wrap.style.display = 'none'; return; }
  const chip = q => {
    const yesPct = q.total_bets > 0 ? Math.round((q.yes_amount / q.total_bets) * 100) : 50;
    const dir = yesPct >= 50 ? 'up' : 'down';
    const txt = q.question.length > 44 ? q.question.slice(0, 42) + '…' : q.question;
    return `<button class="ticker-chip" onclick="openBetModal(${q.id})"><span class="ticker-q">${esc(txt)}</span><span class="ticker-pct ${dir}">${yesPct}%</span></button>`;
  };
  const half = live.map(chip).join('');
  track.innerHTML = half + half; // duplicate for a seamless loop
  wrap.style.display = '';
}

function animatePctChange(el, newVal) {
  const old = parseInt(el.textContent) || 0;
  if (old === newVal) return;
  const start = performance.now();
  const dur = 600;
  function step(now) {
    const t = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(old + (newVal - old) * ease) + '%';
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateCardPcts(questions) {
  questions.forEach(q => {
    const yesPct = q.total_bets > 0 ? Math.round((q.yes_amount / q.total_bets) * 100) : 50;
    const noPct  = 100 - yesPct;
    const yEl = document.getElementById(`yes-pct-${q.id}`);
    const nEl = document.getElementById(`no-pct-${q.id}`);
    const bar = document.getElementById(`pct-bar-${q.id}`);
    if (yEl) animatePctChange(yEl, yesPct);
    if (nEl) animatePctChange(nEl, noPct);
    if (bar) bar.style.width = yesPct + '%';
  });
}

// ── GUEST VOTE ─────────────────────────────────────────────
async function guestVote(questionId, choice) {
  const res = await fetch(`${API}/api/guest-vote`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: questionId, choice })
  });
  const d = await res.json();
  if (d.already_voted) return showToast('כבר הצבעת על שאלה זו', 'error');
  if (!res.ok) return showToast(d.error || 'שגיאה', 'error');
  showToast('הצבעתך נרשמה! 🎯 הירשם כדי להמר ולצבור נק"ז');
  loadMarkets(true);
}

// ── BET MODAL ──────────────────────────────────────────────
async function openBetModal(questionId, choice = 'YES') {
  if (!currentUser) { showAuthOverlay(); return; }
  modalOpen = true;
  const res = await fetch(`${API}/api/questions/${questionId}`, { headers: authHeaders() });
  if (!res.ok) return;
  const q = await res.json();
  currentBetQuestion = q;
  currentBetChoice = choice;

  document.getElementById('modal-category').textContent = q.category || 'כללי';
  document.getElementById('modal-question').textContent = q.question;
  document.getElementById('modal-desc').textContent = q.description || '';

  const yPct = q.total_bets > 0 ? Math.round((q.yes_amount / q.total_bets) * 100) : 50;
  const nPct = 100 - yPct;
  document.getElementById('modal-yes-pct').textContent = yPct + '%';
  document.getElementById('modal-no-pct').textContent  = nPct + '%';
  document.getElementById('modal-yes-label').textContent = q.yes_label || 'כן';
  document.getElementById('modal-no-label').textContent  = q.no_label  || 'לא';
  document.getElementById('modal-yes-vol').textContent  = formatNum(q.yes_amount || 0) + ' נק"ז';
  document.getElementById('modal-no-vol').textContent   = formatNum(q.no_amount  || 0) + ' נק"ז';
  document.getElementById('choice-yes-label-btn').textContent = q.yes_label || 'כן';
  document.getElementById('choice-no-label-btn').textContent  = q.no_label  || 'לא';

  document.getElementById('modal-yes-side').onclick = () => selectChoice('YES');
  document.getElementById('modal-no-side').onclick  = () => selectChoice('NO');

  document.getElementById('bet-amount').value = 50;
  setModalError('');
  updateChoiceButtons();
  updatePayout();

  document.getElementById('bet-modal').style.display = 'flex';
  loadModalChart(questionId);
}

function updateModalOdds() {
  if (!currentBetQuestion) return;
  const q = currentBetQuestion;
  const yPct = q.total_bets > 0 ? Math.round((q.yes_amount / q.total_bets) * 100) : 50;
  document.getElementById('modal-yes-pct').textContent = yPct + '%';
  document.getElementById('modal-no-pct').textContent  = (100 - yPct) + '%';
}

function selectChoice(c) { currentBetChoice = c; updateChoiceButtons(); updatePayout(); }
function updateChoiceButtons() {
  document.getElementById('choice-YES').classList.toggle('active', currentBetChoice === 'YES');
  document.getElementById('choice-NO').classList.toggle('active',  currentBetChoice === 'NO');
}
function setBetAmount(v) { document.getElementById('bet-amount').value = v; updatePayout(); }
function setBetAmountMax() {
  if (currentUser) { document.getElementById('bet-amount').value = currentUser.balance; updatePayout(); }
}
function updatePayout() {
  if (!currentBetQuestion) return;
  const amount = parseFloat(document.getElementById('bet-amount').value) || 0;
  const q = currentBetQuestion;
  const winVol  = currentBetChoice === 'YES' ? (q.yes_amount || 0) : (q.no_amount  || 0);
  const total   = (q.total_bets || 0);
  const payout  = total === 0 ? amount * 2 : amount + (amount / (winVol + amount)) * (total - winVol);
  const profit  = payout - amount;
  document.getElementById('modal-payout').textContent = `${formatNum(Math.round(payout))} נק"ז (+${formatNum(Math.round(profit))})`;
}
function closeBetModal(e) {
  if (e && e.target !== document.getElementById('bet-modal')) return;
  document.getElementById('bet-modal').style.display = 'none';
  modalOpen = false;
  const wrap = document.getElementById('modal-chart-wrap');
  if (wrap) wrap.style.display = 'none';
}

async function placeBet() {
  const amount = parseInt(document.getElementById('bet-amount').value);
  if (!amount || amount < 10) return setModalError('סכום מינימלי הוא 10 נק"ז');
  if (!currentUser || amount > currentUser.balance) return setModalError('אין מספיק נק"ז');
  const res = await fetch(`${API}/api/bet`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ question_id: currentBetQuestion.id, choice: currentBetChoice, amount })
  });
  const d = await res.json();
  if (!res.ok) return setModalError(d.error || 'שגיאה בהימור');
  currentUser.balance = d.new_balance;
  updateBalanceDisplay(d.new_balance);
  showToast(`נק"ז על השולחן. אין דרך חזרה 🎯`);
  document.getElementById('bet-modal').style.display = 'none';
  modalOpen = false;
  loadMarkets(true);
}
function setModalError(msg) { document.getElementById('modal-error').textContent = msg; }

// ── CHART ──────────────────────────────────────────────────
async function loadModalChart(questionId) {
  try {
    const res = await fetch(`${API}/api/questions/${questionId}/chart`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.length || data.length < 2) return;

    const wrap   = document.getElementById('modal-chart-wrap');
    const canvas = document.getElementById('modal-chart');
    wrap.style.display = '';

    const w = canvas.offsetWidth || 420;
    const h = 80;
    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const pcts = data.map(d => d.yes_probability * 100);
    const minP = Math.min(...pcts), maxP = Math.max(...pcts);
    const range = maxP - minP || 1;
    const pad = 6;

    const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (w - pad * 2));
    const ys = pcts.map(p => h - pad - ((p - minP) / range) * (h - pad * 2));

    const css = getComputedStyle(document.documentElement);
    const stroke = css.getPropertyValue('--cobalt').trim() || '#3D4FFF';

    // gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, stroke + '40');
    grad.addColorStop(1, stroke + '00');

    ctx.beginPath();
    ctx.moveTo(xs[0], h);
    xs.forEach((x, i) => ctx.lineTo(x, ys[i]));
    ctx.lineTo(xs[xs.length - 1], h);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    xs.forEach((x, i) => i === 0 ? ctx.moveTo(x, ys[i]) : ctx.lineTo(x, ys[i]));
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  } catch { /* silent */ }
}

// ── ARCHIVE ────────────────────────────────────────────────
async function loadArchive() {
  const res = await fetch(`${API}/api/archive`, { headers: authHeaders() });
  if (!res.ok) return;
  const qs = await res.json();
  renderArchive(qs);
}
function renderArchive(questions) {
  const grid = document.getElementById('archive-grid');
  if (!questions.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🗃️</div><div class="empty-state-title">הארכיון ריק</div></div>`;
    return;
  }
  grid.innerHTML = questions.map(q => marketCardHTML(q, { interactive: false })).join('');
}

// ── PORTFOLIO ──────────────────────────────────────────────
async function loadPortfolio() {
  if (!currentUser) {
    document.getElementById('portfolio-list').innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔒</div><div class="empty-state-title">יש להתחבר כדי לראות את ההימורים שלך</div></div>`;
    return;
  }
  const res = await fetch(`${API}/api/my-bets`, { headers: authHeaders() });
  if (!res.ok) return;
  const bets = await res.json();
  renderPortfolio(bets);
}
function renderPortfolio(bets) {
  const el = document.getElementById('portfolio-list');
  if (!bets.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎯</div><div class="empty-state-title">עוד לא הנחת הימורים</div><div class="empty-state-sub">חזור לשוק ובחר שאלה</div></div>`;
    return;
  }
  // active first
  bets.sort((a, b) => {
    const order = { 'פעיל': 0, 'ניצחון': 1, 'הפסד': 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });
  el.innerHTML = bets.map(b => {
    const isActive = !b.resolved;
    const isWin    = b.resolved && b.won;
    const statusClass = isActive ? 'active' : isWin ? 'win' : 'lose';
    const choiceLabel = b.choice === 'YES' ? (b.yes_label || 'כן') : (b.no_label || 'לא');
    let amountDisplay = '', labelText = '';
    if (isActive) { amountDisplay = formatNum(b.amount); labelText = 'בהמתנה'; }
    else if (isWin) { amountDisplay = '+' + formatNum(b.payout); labelText = 'ניצחת 🎉'; }
    else { amountDisplay = '-' + formatNum(b.amount); labelText = 'הפסדת'; }
    return `
<div class="portfolio-item">
  <div class="port-status ${statusClass}"></div>
  <div class="port-main">
    <div class="port-question">${esc(b.question)}</div>
    <div class="port-meta">בחרת: <strong>${esc(choiceLabel)}</strong></div>
  </div>
  <div class="port-right">
    <div class="port-amount ${statusClass}">${amountDisplay} נק"ז</div>
    <div class="port-label">${labelText}</div>
  </div>
</div>`;
  }).join('');
}

// ── LEADERBOARD ────────────────────────────────────────────
async function loadLeaderboard() {
  const res = await fetch(`${API}/api/leaderboard`, { headers: authHeaders() });
  if (!res.ok) return;
  const users = await res.json();
  renderLeaderboard(users);
}
function renderLeaderboard(users) {
  const el = document.getElementById('leaderboard-list');
  const podium = document.getElementById('lb-podium');
  if (!users.length) {
    if (podium) podium.style.display = 'none';
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏆</div><div class="empty-state-title">הטבלה ריקה</div></div>`;
    return;
  }
  const medals = ['🥇','🥈','🥉'];

  const top3 = users.slice(0, 3);
  const rest = users.slice(3);

  if (podium) {
    podium.style.display = '';
    podium.innerHTML = top3.map((u, i) => {
      const isMe = currentUser && u.id === currentUser.id;
      const badge = i === 0 ? `<span class="podium-badge">מצטיין דיקן</span>` : '';
      const meTag = isMe ? ` <span class="lb-me-tag">(אתה)</span>` : '';
      return `
<div class="podium-spot p${i+1}">
  ${badge}
  <div class="podium-medal">${medals[i]}</div>
  <div class="podium-name">${esc(u.display_name || u.username)}${meTag}</div>
  <div class="podium-balance">${formatNum(u.balance)}</div>
</div>`;
    }).join('');
  }

  el.innerHTML = rest.map((u, i) => {
    const isMe = currentUser && u.id === currentUser.id;
    const meTag = isMe ? `<span class="lb-me-tag">(אתה)</span>` : '';
    return `
<div class="lb-row${isMe ? ' me' : ''}">
  <div class="lb-rank">${i + 4}</div>
  <span class="lb-name">${esc(u.display_name || u.username)} ${meTag}</span>
  <span class="lb-balance">${formatNum(u.balance)}</span>
</div>`;
  }).join('');
}

// ── CONFETTI ───────────────────────────────────────────────
function launchConfetti(x, y) {
  const colors = ['#3D4FFF','#00B377','#FF4D6B','#FFBE2E'];
  for (let i = 0; i < 22; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.cssText = `left:${x + (Math.random()-0.5)*80}px;top:${y}px;background:${colors[Math.floor(Math.random()*colors.length)]};transform:rotate(${Math.random()*360}deg);animation-delay:${Math.random()*0.3}s;animation-duration:${1.2+Math.random()*0.6}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }
}

// ── COUNTDOWNS ────────────────────────────────────────────
function startCountdowns() {
  clearInterval(window._cdTimer);
  window._cdTimer = setInterval(() => {
    document.querySelectorAll('.market-card[data-deadline]').forEach(card => {
      const el = card.querySelector('[id^="dl-"]');
      if (!el) return;
      const info = deadlineInfo(card.dataset.deadline);
      el.textContent = info.text;
      el.classList.toggle('urgent', info.urgent);
    });
  }, 30000);
}

// ── COMPLAINTS ─────────────────────────────────────────────
const FAKE_NAMES = ['דני כהן','מיה לוי','עמית דוד','שיר ברק','רון אבי','נועה שמש','יובל גל','תמר ים','אורי נגד','ליאור כץ'];

function initStars() {
  const container = document.getElementById('star-rating');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const s = document.createElement('span');
    s.className = 'star'; s.textContent = '★'; s.dataset.val = i;
    s.onclick = () => { document.getElementById('complaint-rating').value = i; highlightStars(i); };
    s.onmouseenter = () => highlightStars(i);
    container.appendChild(s);
  }
  container.onmouseleave = () => highlightStars(parseInt(document.getElementById('complaint-rating').value) || 0);
}
function highlightStars(n) {
  document.querySelectorAll('#star-rating .star').forEach((s, i) => s.classList.toggle('lit', i < n));
}

async function loadComplaints() {
  const res = await fetch(`${API}/api/complaints`, { headers: authHeaders() });
  if (!res.ok) return;
  const items = await res.json();
  renderComplaints(items);
}
function renderComplaints(items) {
  const el = document.getElementById('complaints-list');
  if (!items.length) {
    el.innerHTML = `<div style="color:var(--ink-soft);font-size:.875rem;padding:1rem 0">אין בקשות עדיין. היה הראשון!</div>`;
    return;
  }
  el.innerHTML = items.map(c => {
    const name = FAKE_NAMES[c.id % FAKE_NAMES.length];
    const stars = Array.from({length:10}, (_,i) => `<span class="complaint-star${i<c.rating?' lit':''}">★</span>`).join('');
    const delBtn = currentUser?.is_admin ? `<div class="complaint-actions"><button class="btn-danger btn-sm" onclick="deleteComplaint(${c.id})">מחק</button></div>` : '';
    return `
<div class="complaint-item">
  <div class="complaint-author">${esc(name)}</div>
  <div class="complaint-text">${esc(c.text)}</div>
  <div class="complaint-rating">${stars}</div>
  ${delBtn}
</div>`;
  }).join('');
}
async function submitComplaint() {
  const text   = document.getElementById('complaint-text').value.trim();
  const rating = parseInt(document.getElementById('complaint-rating').value) || 0;
  if (!text) return showToast('אנא כתוב תוכן לבקשה', 'error');
  if (!rating) return showToast('אנא בחר דירוג', 'error');
  const res = await fetch(`${API}/api/complaints`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ text, rating })
  });
  if (!res.ok) return showToast('שגיאה בשליחה', 'error');
  document.getElementById('complaint-text').value = '';
  document.getElementById('complaint-rating').value = 0;
  highlightStars(0);
  showToast('הבקשה נשלחה! תודה 🙏');
  loadComplaints();
}
async function deleteComplaint(id) {
  if (!confirm('למחוק?')) return;
  await fetch(`${API}/api/complaints/${id}`, { method: 'DELETE', headers: authHeaders() });
  loadComplaints();
}

// ── SUGGEST MODAL ──────────────────────────────────────────
function openSuggestModal() {
  if (!currentUser) { showAuthOverlay(); return; }
  document.getElementById('suggest-modal').style.display = 'flex';
}
function closeSuggestModal(e) {
  if (e && e.target !== document.getElementById('suggest-modal')) return;
  document.getElementById('suggest-modal').style.display = 'none';
}
async function submitSuggestion() {
  const text     = document.getElementById('sug-text').value.trim();
  const desc     = document.getElementById('sug-desc').value.trim();
  const category = getCategory('sug-cat', 'sug-cat-custom');
  const dept     = document.getElementById('sug-dept').value;
  const inst     = document.getElementById('sug-inst').value;
  const deadline = document.getElementById('sug-deadline').value;
  if (!text) return showToast('אנא כתוב שאלה', 'error');
  const res = await fetch(`${API}/api/suggestions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ text, description: desc, category, department: dept, institution: inst, deadline: deadline || null })
  });
  if (!res.ok) { const d = await res.json(); return showToast(d.error || 'שגיאה', 'error'); }
  document.getElementById('suggest-modal').style.display = 'none';
  showToast('ההצעה נשלחה! תודה 💡');
}

// ── PROFILE MODAL ──────────────────────────────────────────
function openProfileModal() {
  if (!currentUser) return;
  document.getElementById('profile-display-name').value = currentUser.display_name || currentUser.username;
  document.getElementById('profile-password').value = '';
  document.getElementById('profile-modal').style.display = 'flex';
}
function closeProfileModal(e) {
  if (e && e.target !== document.getElementById('profile-modal')) return;
  document.getElementById('profile-modal').style.display = 'none';
}
async function saveProfile() {
  const display_name = document.getElementById('profile-display-name').value.trim();
  const password     = document.getElementById('profile-password').value;
  const body = { display_name };
  if (password) { if (password.length < 4) return showToast('סיסמה חייבת להכיל לפחות 4 תווים', 'error'); body.password = password; }
  const res = await fetch(`${API}/api/me/update`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  });
  const d = await res.json();
  if (!res.ok) return showToast(d.error || 'שגיאה', 'error');
  currentUser.display_name = display_name;
  const nu = document.getElementById('nav-username');
  if (nu) nu.textContent = display_name;
  document.getElementById('profile-modal').style.display = 'none';
  showToast('הפרופיל עודכן ✓');
}

// ── BALANCE POLLING ────────────────────────────────────────
function updateBalanceDisplay(balance) {
  const el = document.getElementById('nav-balance');
  if (el) el.textContent = formatNum(balance);
}
function startBalancePolling() {
  clearInterval(window._balTimer);
  window._balTimer = setInterval(async () => {
    if (!currentUser) return;
    const res = await fetch(`${API}/api/me`, { headers: authHeaders() });
    if (!res.ok) return;
    const d = await res.json();
    const diff = d.balance - currentUser.balance;
    if (diff !== 0) {
      animateBalance(d.balance, diff);
      currentUser.balance = d.balance;
    }
  }, 8000);
}
function animateBalance(newBalance, diff) {
  updateBalanceDisplay(newBalance);
  if (diff > 50) {
    showToast(`+${formatNum(diff)} נק"ז נוספו לחשבונך 🎉`);
    const chip = document.getElementById('nav-balance-chip');
    if (chip) {
      const rect = chip.getBoundingClientRect();
      launchConfetti(rect.left + rect.width / 2, rect.top);
    }
  } else if (diff > 0) {
    showToast(`+${formatNum(diff)} נק"ז 🎉`);
  }
}

// ── SOFT REFRESH ───────────────────────────────────────────
function softRefresh() {
  showSection('markets', document.querySelector('.nav-link'));
  loadMarkets();
}

// ── ADMIN ──────────────────────────────────────────────────
function switchAdminTab(tab, btn) {
  ['questions','users','activity','suggestions'].forEach(t => {
    const el = document.getElementById(`admin-tab-${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const loaders = { questions: loadAdminQuestions, users: loadAdminUsers, activity: () => loadAdminActivity(), suggestions: loadAdminSuggestions };
  if (loaders[tab]) loaders[tab]();
}

async function loadAdminQuestions() {
  const res = await fetch(`${API}/api/admin/questions`, { headers: authHeaders() });
  if (!res.ok) return;
  const qs = await res.json();
  renderAdminQuestions(qs);
}
function renderAdminQuestions(questions) {
  const el = document.getElementById('admin-questions-list');
  if (!questions.length) { el.innerHTML = `<div class="empty-state"><div class="empty-state-title">אין שאלות</div></div>`; return; }
  el.innerHTML = questions.map(q => `
<div class="admin-item">
  <div class="admin-item-top">
    <div class="admin-item-title">${esc(q.question)} ${q.is_draft ? '<span class="tag tag-resolved" style="font-size:.65rem">טיוטה</span>' : ''}</div>
    <div class="admin-item-actions">
      ${!q.resolved ? `
        <button class="btn-sm success" onclick="resolveQuestion(${q.id},'YES')">כן ✓</button>
        <button class="btn-sm" style="background:var(--coral);color:#fff" onclick="resolveQuestion(${q.id},'NO')">לא ✗</button>
      ` : ''}
      <button class="btn-sm outline" onclick="openEditQuestionById(${q.id})">עריכה</button>
      <button class="btn-danger btn-sm" onclick="deleteQuestion(${q.id})">מחק</button>
    </div>
  </div>
  <div class="admin-item-meta">${esc(q.category||'')} · ${esc(q.department||'')} · ${formatNum(q.total_bets||0)} נק"ז</div>
</div>`).join('');
}

async function createQuestion(asDraft = false) {
  const text     = document.getElementById('new-q-text').value.trim();
  const desc     = document.getElementById('new-q-desc').value.trim();
  const yes_lbl  = document.getElementById('new-q-yes-label').value.trim() || 'כן';
  const no_lbl   = document.getElementById('new-q-no-label').value.trim()  || 'לא';
  const category = getCategory('new-q-cat','new-q-cat-custom');
  const dept     = document.getElementById('new-q-dept').value;
  const inst     = document.getElementById('new-q-inst').value;
  const deadline = document.getElementById('new-q-deadline').value;
  if (!text) return showToast('חסרה שאלה', 'error');
  const res = await fetch(`${API}/api/questions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ question: text, description: desc, yes_label: yes_lbl, no_label: no_lbl, category, department: dept, institution: inst, deadline: deadline || null, is_draft: asDraft })
  });
  const d = await res.json();
  if (!res.ok) return showToast(d.error || 'שגיאה', 'error');
  showToast(asDraft ? 'נשמר כטיוטה' : 'השאלה פורסמה! 🚀');
  document.getElementById('new-q-text').value = '';
  document.getElementById('new-q-desc').value = '';
  loadAdminQuestions();
  if (!asDraft) loadMarkets();
}

async function resolveQuestion(id, result) {
  if (!confirm(`לסגור עם תוצאה: ${result}?`)) return;
  const res = await fetch(`${API}/api/questions/${id}/resolve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ result })
  });
  if (!res.ok) return showToast('שגיאה בסגירה', 'error');
  showToast('השאלה נסגרה ✓');
  loadAdminQuestions(); loadMarkets();
}
async function deleteQuestion(id) {
  if (!confirm('למחוק שאלה זו? ההימורים יוחזרו.')) return;
  const res = await fetch(`${API}/api/questions/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) return showToast('שגיאה', 'error');
  showToast('נמחק');
  loadAdminQuestions(); loadMarkets();
}

function openEditQuestionById(id) {
  fetch(`${API}/api/questions/${id}`, { headers: authHeaders() })
    .then(r => r.json()).then(openEditQuestionModal);
}
function openEditQuestionModal(q) {
  document.getElementById('edit-q-id').value       = q.id;
  document.getElementById('edit-q-text').value     = q.question;
  document.getElementById('edit-q-desc').value     = q.description || '';
  document.getElementById('edit-q-yes-label').value = q.yes_label || 'כן';
  document.getElementById('edit-q-no-label').value  = q.no_label  || 'לא';
  document.getElementById('edit-q-dept').value     = q.department || '';
  document.getElementById('edit-q-inst').value     = q.institution || 'כללי';
  if (q.deadline) document.getElementById('edit-q-deadline').value = q.deadline.slice(0,16);
  const catSel = document.getElementById('edit-q-cat');
  const knownCats = ['הרצאות','בחינות','קפיטריה','כללי'];
  if (knownCats.includes(q.category)) { catSel.value = q.category; document.getElementById('edit-q-cat-custom').style.display = 'none'; }
  else { catSel.value = 'custom'; document.getElementById('edit-q-cat-custom').style.display = ''; document.getElementById('edit-q-cat-custom').value = q.category; }
  document.getElementById('edit-question-modal').style.display = 'flex';
}
function closeEditQuestionModal(e) {
  if (e && e.target !== document.getElementById('edit-question-modal')) return;
  document.getElementById('edit-question-modal').style.display = 'none';
}
async function saveEditedQuestion() {
  const id       = document.getElementById('edit-q-id').value;
  const question = document.getElementById('edit-q-text').value.trim();
  const desc     = document.getElementById('edit-q-desc').value.trim();
  const yes_label = document.getElementById('edit-q-yes-label').value.trim() || 'כן';
  const no_label  = document.getElementById('edit-q-no-label').value.trim()  || 'לא';
  const category = getCategory('edit-q-cat','edit-q-cat-custom');
  const department = document.getElementById('edit-q-dept').value;
  const institution = document.getElementById('edit-q-inst').value;
  const deadline = document.getElementById('edit-q-deadline').value;
  if (!question) return showToast('חסרה שאלה','error');
  const res = await fetch(`${API}/api/questions/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ question, description: desc, yes_label, no_label, category, department, institution, deadline: deadline || null })
  });
  if (!res.ok) return showToast('שגיאה','error');
  showToast('עודכן ✓');
  document.getElementById('edit-question-modal').style.display = 'none';
  loadAdminQuestions(); loadMarkets();
}

async function loadAdminUsers() {
  const res = await fetch(`${API}/api/admin/users`, { headers: authHeaders() });
  if (!res.ok) return;
  const users = await res.json();
  renderAdminUsers(users);
}
function renderAdminUsers(users) {
  const el = document.getElementById('admin-users-list');
  el.innerHTML = users.map(u => `
<div class="admin-item">
  <div class="admin-item-top">
    <div class="admin-item-title">${esc(u.display_name||u.username)} ${u.is_admin?'<span class="lb-badge">Admin</span>':''}</div>
    <div class="admin-item-actions">
      ${!u.is_admin ? `<button class="btn-danger btn-sm" onclick="deleteUser(${u.id},'${esc(u.username)}')">הסר</button>` : ''}
    </div>
  </div>
  <div class="admin-item-meta">${esc(u.username)} · ${formatNum(u.balance)} נק"ז</div>
</div>`).join('');
}
async function deleteUser(id, name) {
  if (!confirm(`למחוק את ${name}?`)) return;
  const res = await fetch(`${API}/api/admin/users/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) return showToast('שגיאה','error');
  showToast('משתמש הוסר');
  loadAdminUsers();
}

async function loadAdminSuggestions() {
  const res = await fetch(`${API}/api/suggestions`, { headers: authHeaders() });
  if (!res.ok) return;
  const items = await res.json();
  renderAdminSuggestions(items);
}
function renderAdminSuggestions(items) {
  const el = document.getElementById('admin-suggestions-list');
  if (!items.length) { el.innerHTML = `<div class="empty-state"><div class="empty-state-title">אין הצעות ממתינות</div></div>`; return; }
  el.innerHTML = items.map(s => `
<div class="admin-item">
  <div class="admin-item-top">
    <div class="admin-item-title">${esc(s.text)} ${s.is_draft?'<span class="tag tag-resolved" style="font-size:.65rem">טיוטה</span>':''}</div>
    <div class="admin-item-actions">
      <button class="btn-sm success" onclick="approveSuggestion(${s.id})">אשר</button>
      <button class="btn-sm accent" onclick="openEditSuggestionById(${s.id})">עריכה ופרסום</button>
      <button class="btn-danger btn-sm" onclick="deleteSuggestion(${s.id})">מחק</button>
    </div>
  </div>
  <div class="admin-item-meta">${esc(s.category||'')} · ${esc(s.department||'')} · ${esc(s.institution||'')}</div>
</div>`).join('');
}
async function approveSuggestion(id) {
  const res = await fetch(`${API}/api/suggestions/${id}/approve`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) return showToast('שגיאה','error');
  showToast('ההצעה אושרה ופורסמה ✓');
  loadAdminSuggestions(); loadMarkets(); loadSuggestionsBadge();
}
async function deleteSuggestion(id) {
  if (!confirm('למחוק?')) return;
  await fetch(`${API}/api/suggestions/${id}`, { method: 'DELETE', headers: authHeaders() });
  loadAdminSuggestions(); loadSuggestionsBadge();
}
function openEditSuggestionById(id) {
  fetch(`${API}/api/suggestions`, { headers: authHeaders() })
    .then(r => r.json()).then(items => {
      const s = items.find(x => x.id === id);
      if (s) openEditSuggestionModal(s);
    });
}
function openEditSuggestionModal(s) {
  document.getElementById('edit-sug-id').value       = s.id;
  document.getElementById('edit-sug-text').value     = s.text;
  document.getElementById('edit-sug-desc').value     = s.description || '';
  document.getElementById('edit-sug-yes-label').value = s.yes_label || 'כן';
  document.getElementById('edit-sug-no-label').value  = s.no_label  || 'לא';
  document.getElementById('edit-sug-dept').value     = s.department || '';
  document.getElementById('edit-sug-inst').value     = s.institution || 'כללי';
  if (s.deadline) document.getElementById('edit-sug-deadline').value = s.deadline.slice(0,16);
  const catSel = document.getElementById('edit-sug-cat');
  const knownCats = ['הרצאות','בחינות','קפיטריה','כללי'];
  if (knownCats.includes(s.category)) { catSel.value = s.category; document.getElementById('edit-sug-cat-custom').style.display = 'none'; }
  else { catSel.value = 'custom'; document.getElementById('edit-sug-cat-custom').style.display = ''; document.getElementById('edit-sug-cat-custom').value = s.category; }
  document.getElementById('edit-suggestion-modal').style.display = 'flex';
}
function closeEditSuggestionModal(e) {
  if (e && e.target !== document.getElementById('edit-suggestion-modal')) return;
  document.getElementById('edit-suggestion-modal').style.display = 'none';
}
function getEditSuggestionData() {
  return {
    id:          document.getElementById('edit-sug-id').value,
    text:        document.getElementById('edit-sug-text').value.trim(),
    description: document.getElementById('edit-sug-desc').value.trim(),
    yes_label:   document.getElementById('edit-sug-yes-label').value.trim() || 'כן',
    no_label:    document.getElementById('edit-sug-no-label').value.trim()  || 'לא',
    category:    getCategory('edit-sug-cat','edit-sug-cat-custom'),
    department:  document.getElementById('edit-sug-dept').value,
    institution: document.getElementById('edit-sug-inst').value,
    deadline:    document.getElementById('edit-sug-deadline').value || null
  };
}
async function publishEditedSuggestion() {
  const data = getEditSuggestionData();
  if (!data.text) return showToast('חסרה שאלה','error');
  const res = await fetch(`${API}/api/suggestions/${data.id}/approve-edited`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ...data, as_draft: false })
  });
  if (!res.ok) return showToast('שגיאה','error');
  showToast('פורסם ✓');
  document.getElementById('edit-suggestion-modal').style.display = 'none';
  loadAdminSuggestions(); loadMarkets(); loadSuggestionsBadge();
}
async function saveEditedSuggestionAsDraft() {
  const data = getEditSuggestionData();
  const res = await fetch(`${API}/api/suggestions/${data.id}/approve-edited`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ...data, as_draft: true })
  });
  if (!res.ok) return showToast('שגיאה','error');
  showToast('נשמר כטיוטה');
  document.getElementById('edit-suggestion-modal').style.display = 'none';
  loadAdminSuggestions(); loadSuggestionsBadge();
}

async function loadAdminActivity(type = 'all') {
  const url = type === 'all' ? `${API}/api/admin/activity` : `${API}/api/admin/activity?type=${type}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) return;
  const items = await res.json();
  renderAdminActivity(items, type);
}
function renderAdminActivity(items, activeType = 'all') {
  const container = document.getElementById('admin-tab-activity');
  if (!container) return;

  if (!document.getElementById('activity-filter-bar')) {
    const filterBar = document.createElement('div');
    filterBar.id = 'activity-filter-bar';
    filterBar.className = 'activity-filter-bar';
    const types = [['all','הכל'],['bet','הימורים'],['register','הרשמות'],['rename','שינוי שם'],['guest_vote','הצבעות אורח'],['question','שאלות'],['resolve','סגירות']];
    filterBar.innerHTML = types.map(([t,l]) =>
      `<button class="filter-chip${t===activeType?' active':''}" onclick="filterActivity('${t}',this)">${l}</button>`
    ).join('');
    container.insertAdjacentElement('afterbegin', filterBar);
  }

  const listEl = document.getElementById('admin-activity-list');
  if (!items.length) { listEl.innerHTML = `<div style="color:var(--ink-soft);padding:1rem">אין פעילות</div>`; return; }
  const dotClass = (type) => {
    if (type.includes('bet')) return 'bet';
    if (type.includes('register')) return 'register';
    if (type.includes('resolve')) return 'resolve';
    if (type.includes('question')) return 'question';
    return '';
  };
  listEl.innerHTML = `<div class="activity-log">` + items.map(a => `
<div class="activity-row">
  <div class="activity-dot ${dotClass(a.type)}"></div>
  <span class="activity-text">${esc(a.description || a.type)}</span>
  <span class="activity-time">${formatActivityTime(a.created_at)}</span>
</div>`).join('') + `</div>`;
}
function filterActivity(type, btn) {
  document.querySelectorAll('.activity-filter-bar .filter-chip').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadAdminActivity(type);
}
function formatActivityTime(dateStr) {
  if (!dateStr) return '';
  try {
    return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(dateStr));
  } catch { return dateStr; }
}

async function loadSuggestionsBadge() {
  if (!currentUser?.is_admin) return;
  const res = await fetch(`${API}/api/suggestions`, { headers: authHeaders() });
  if (!res.ok) return;
  const items = await res.json();
  const count = items.length;
  ['suggestions-badge','admin-suggestions-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) { el.textContent = count; el.style.display = ''; }
    else el.style.display = 'none';
  });
  setTimeout(loadSuggestionsBadge, 30000);
}

// ── CATEGORY HELPERS ───────────────────────────────────────
function toggleCustomCategory(customInputId, selectId) {
  const sel = document.getElementById(selectId);
  const inp = document.getElementById(customInputId);
  if (!sel || !inp) return;
  inp.style.display = sel.value === 'custom' ? '' : 'none';
}
function getCategory(selectId, customInputId) {
  const sel = document.getElementById(selectId);
  if (!sel) return 'כללי';
  if (sel.value === 'custom') {
    const inp = document.getElementById(customInputId);
    return inp?.value.trim() || 'כללי';
  }
  return sel.value;
}

// ── ESC TO CLOSE MODALS ────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const modals = ['bet-modal','suggest-modal','edit-suggestion-modal','edit-question-modal','profile-modal','auth-overlay'];
  modals.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.style.display !== 'none') {
      el.style.display = 'none';
      if (id === 'bet-modal') modalOpen = false;
    }
  });
});
