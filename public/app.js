let currentUser = null;
let currentBetQuestion = null;
let currentBetChoice = 'YES';
const API = '';

// ===== THEME =====
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
  // sync toggle button appearance
  updateToggleBtn();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  let next;
  if (!current) next = sys === 'dark' ? 'light' : 'dark';
  else next = current === 'dark' ? 'light' : 'dark';
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
  btn.title = isDark ? 'עבור למצב בהיר' : 'עבור למצב כהה';
  btn.parentElement.classList.toggle('dark-active', isDark);
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateToggleBtn);

// ===== INIT =====
window.onload = () => {
  initTheme();
  const token = localStorage.getItem('token');
  if (token) tryAutoLogin();
  else {
    // Guest mode - show app directly
    loadMarkets();
    updateGuestUI();
  }
};

async function tryAutoLogin() {
  const res = await fetch(`${API}/api/me`, { headers: authHeaders() });
  if (res.ok) { const d = await res.json(); loginSuccess(d); }
  else { localStorage.removeItem('token'); updateGuestUI(false); loadMarkets(); }
}

// ===== PASSWORD TOGGLE =====
function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

// ===== GUEST MODE =====
function updateGuestUI(loggedIn = false) {
  const logoutBtn  = document.getElementById('logout-btn');
  const authNavBtn = document.getElementById('auth-nav-btn');
  const adminTab   = document.getElementById('admin-tab');
  const mobileAdmin = document.getElementById('mobile-admin-tab');
  const navBalance = document.getElementById('nav-balance-chip');
  const navUsername = document.getElementById('nav-username');

  if (loggedIn) {
    if (logoutBtn)  logoutBtn.style.display  = '';
    if (authNavBtn) authNavBtn.style.display = 'none';
    if (navBalance) navBalance.style.display = '';
    if (navUsername) navUsername.style.display = '';
  } else {
    if (logoutBtn)  logoutBtn.style.display  = 'none';
    if (authNavBtn) authNavBtn.style.display = '';
    if (navBalance) navBalance.style.display = 'none';
  const _mWrap = document.getElementById('nav-balance-mobile-wrap');
  if (_mWrap) _mWrap.style.display = 'none';
    if (navUsername) navUsername.style.display = 'none';
    if (adminTab)   adminTab.style.display   = 'none';
    if (mobileAdmin) mobileAdmin.style.display = 'none';
    // הצג באנר אורח אם לא נסגר בעבר
    if (!sessionStorage.getItem('guest-banner-dismissed')) {
      const banner = document.getElementById('guest-banner');
      if (banner) banner.style.display = '';
    }
  }
}

function showAuthOverlay() {
  document.getElementById('auth-overlay').style.display = 'flex';
}

function hideAuthOverlay() {
  document.getElementById('auth-overlay').style.display = 'none';
}

// ===== AUTH =====
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t,i) =>
    t.classList.toggle('active', (tab==='login'&&i===0)||(tab==='register'&&i===1)));
  document.getElementById('login-form').style.display    = tab==='login'    ? 'block':'none';
  document.getElementById('register-form').style.display = tab==='register' ? 'block':'none';
  document.getElementById('auth-error').textContent = '';
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username||!password) return showAuthError('נא למלא את כל השדות');
  const res = await fetch(`${API}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  const data = await res.json();
  if (!res.ok) return showAuthError(data.error||'שגיאה בכניסה');
  localStorage.setItem('token',data.token);
  loginSuccess(data.user);
}

async function register() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!username||!password) return showAuthError('נא למלא את כל השדות');
  const res = await fetch(`${API}/api/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,display_name:username,password})});
  const data = await res.json();
  if (!res.ok) return showAuthError(data.error||'שגיאה בהרשמה');
  localStorage.setItem('token',data.token);
  loginSuccess(data.user);
}

function loginSuccess(user) {
  currentUser = user;
  hideAuthOverlay();
  const banner = document.getElementById('guest-banner');
  if (banner) banner.style.display = 'none';
  document.getElementById('nav-username').textContent = user.display_name;
  document.getElementById('nav-balance').textContent  = formatNum(user.balance);
  const _mobVal = document.getElementById('nav-balance-mobile');
  if (_mobVal) _mobVal.textContent = formatNum(user.balance);
  const _mobWrap = document.getElementById('nav-balance-mobile-wrap');
  if (_mobWrap) _mobWrap.style.display = '';
  updateGuestUI(true);
  if (user.is_admin) {
    document.getElementById('admin-tab').style.display = '';
    document.getElementById('mobile-admin-tab').style.display = '';
  }
  loadMarkets();
  startBalancePolling();
  if (user.is_admin) {
    loadSuggestionsBadge();
    setInterval(loadSuggestionsBadge, 30000);
  }
}

function logout() {
  localStorage.removeItem('token');
  currentUser = null;
  updateGuestUI(false);
  loadMarkets();
  showSection('markets', document.querySelector('.nav-tab'));
}

function showAuthError(msg) { document.getElementById('auth-error').textContent = msg; }

// ===== SECTIONS =====
function showSection(name, btn) {
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(`section-${name}`).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name==='markets')     loadMarkets();
  if (name==='portfolio')   loadPortfolio();
  if (name==='leaderboard') loadLeaderboard();
  if (name==='admin')       loadAdminQuestions();
  if (name==='complaints')   loadComplaints();
}

function setMobileTab(btn) {
  document.querySelectorAll('.mobile-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
}

// ===== DEADLINE HELPERS =====
function deadlineInfo(deadline) {
  if (!deadline) return null;
  const now=new Date(), end=new Date(deadline), diff=end-now;
  if (diff<0) return {text:'נסגר להימורים',cls:'expired'};
  const mins=Math.floor(diff/60000), hours=Math.floor(diff/3600000);
  if (mins<60)  return {text:`נסגר בעוד ${mins} דקות`,cls:'soon'};
  if (hours<24) return {text:`נסגר בעוד ${hours} שעות`,cls:'soon'};
  return {text:`נסגר ב-${end.toLocaleDateString('he-IL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`,cls:''};
}

// ===== MARKETS =====
async function loadMarkets(silent=false) {
  const res  = await fetch(`${API}/api/questions`,{headers:authHeaders()});
  const data = await res.json();
  const questions = data.questions || [];
  if (silent && document.querySelectorAll('.market-card').length === questions.length) {
    // עדכון אחוזים בלבד — בלי re-render
    updateCardPcts(questions);
  } else {
    renderMarkets(questions);
  }
}

function renderMarkets(questions) {
  const grid = document.getElementById('markets-grid');
  if (!questions.length) {
    grid.innerHTML=`<div class="empty-state"><span class="emoji">🤔</span>אין שאלות עדיין</div>`;
    return;
  }
  grid.innerHTML = questions.map(q=>{
    const total   = q.yes_volume + q.no_volume;
    const yesPct  = total > 0 ? Math.round((q.yes_volume / total) * 100) : 50;
    const noPct   = 100 - yesPct;
    const dl      = deadlineInfo(q.deadline);
    const showCountdown = q.deadline && !q.resolved &&
      (new Date(q.deadline) - Date.now()) < 86400000 &&
      (new Date(q.deadline) - Date.now()) > 0;
    const dlHtml = dl
      ? `<div class="card-deadline ${dl.cls}">
           ${showCountdown
             ? `<span class="card-countdown" data-deadline="${q.deadline}" data-id="${q.id}">⏱ ...</span>`
             : `⏱ ${dl.text}`}
         </div>`
      : '';
    const deptTag = q.department ? `<span class="dept-tag">${q.department}</span>` : '';

    const betBlocksUser = `
      <div class="choice-blocks">
        <button class="choice-block yes-block" onclick="event.stopPropagation();openBetModal(${q.id},'YES')">
          <span class="choice-pct yes-pct" data-qid="${q.id}" data-side="yes">${yesPct}%</span>
          <span class="choice-label">${q.option_yes||'כן'}</span>
        </button>
        <button class="choice-block no-block" onclick="event.stopPropagation();openBetModal(${q.id},'NO')">
          <span class="choice-pct no-pct" data-qid="${q.id}" data-side="no">${noPct}%</span>
          <span class="choice-label">${q.option_no||'לא'}</span>
        </button>
      </div>`;

    const betBlocksGuest = `
      <div class="choice-blocks">
        <button class="choice-block yes-block" onclick="event.stopPropagation();guestVote(${q.id},'YES',this)">
          <span class="choice-pct yes-pct" data-qid="${q.id}" data-side="yes">${yesPct}%</span>
          <span class="choice-label">${q.option_yes||'כן'}</span>
        </button>
        <button class="choice-block no-block" onclick="event.stopPropagation();guestVote(${q.id},'NO',this)">
          <span class="choice-pct no-pct" data-qid="${q.id}" data-side="no">${noPct}%</span>
          <span class="choice-label">${q.option_no||'לא'}</span>
        </button>
      </div>`;

    const resolvedBlock = `
      <div class="choice-blocks resolved-blocks">
        <div class="choice-block yes-block ${q.result==='YES'?'winner':'loser'}">
          <span class="choice-pct">${yesPct}%</span>
          <span class="choice-label">${q.option_yes||'כן'}</span>
        </div>
        <div class="choice-block no-block ${q.result==='NO'?'winner':'loser'}">
          <span class="choice-pct">${noPct}%</span>
          <span class="choice-label">${q.option_no||'לא'}</span>
        </div>
      </div>
      <div class="resolved-badge ${q.result}">${q.result==='YES'?'✓ '+(q.option_yes||'כן'):'✗ '+(q.option_no||'לא')} — נסגר</div>`;

    return `
    <div class="market-card ${q.resolved?'resolved':''}" data-cat="${q.category||'כללי'}" data-dept="${q.department||''}">
      <div class="card-tags-row">${deptTag}<span class="card-category">${q.category||'כללי'}</span></div>
      <div class="card-question">${q.question}</div>
      ${q.resolved ? resolvedBlock : (currentUser ? betBlocksUser : betBlocksGuest)}
      <div class="card-footer">
        <div class="card-volume">נפח: <span>${formatNum(total)} נק"ז</span></div>
        <div class="card-stats-row" dir="ltr">
          <span class="stat-yes">${q.yes_count||0}</span>
          <span class="stat-mid">vs</span>
          <span class="stat-no">${q.no_count||0}</span>
          <span class="stat-label">bets</span>
        </div>
        ${dlHtml}
      </div>
    </div>`;
  }).join('');
  startCountdowns();
  // אנימציית כניסה לכרטיסים
  requestAnimationFrame(() => {
    document.querySelectorAll('.market-card').forEach((card, i) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(12px)';
      setTimeout(() => {
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, i * 60);
    });
  });
}

// ===== ANIMATE PCT UPDATE =====
function animatePctChange(el, newVal) {
  const current = parseInt(el.textContent);
  if (isNaN(current) || current === newVal) return;
  const step = newVal > current ? 1 : -1;
  const duration = Math.abs(newVal - current) * 18;
  let val = current;
  el.classList.add('pct-changing');
  const interval = setInterval(() => {
    val += step;
    el.textContent = val + '%';
    if (val === newVal) {
      clearInterval(interval);
      el.classList.remove('pct-changing');
    }
  }, duration / Math.abs(newVal - current));
}

function updateCardPcts(questions) {
  questions.forEach(q => {
    const total  = q.yes_volume + q.no_volume;
    const yesPct = total > 0 ? Math.round((q.yes_volume / total) * 100) : 50;
    const noPct  = 100 - yesPct;
    const yesEl = document.querySelector(`.yes-pct[data-qid="${q.id}"]`);
    const noEl  = document.querySelector(`.no-pct[data-qid="${q.id}"]`);
    if (yesEl) animatePctChange(yesEl, yesPct);
    if (noEl)  animatePctChange(noEl, noPct);
  });
}

// ===== BET MODAL =====
async function openBetModal(questionId,choice='YES') {
  if (!currentUser) { showAuthOverlay(); return; }
  const res  = await fetch(`${API}/api/questions/${questionId}`,{headers:authHeaders()});
  const data = await res.json();
  if (!res.ok) return;
  currentBetQuestion=data.question; currentBetChoice=choice;
  document.getElementById('modal-category-tag').textContent  = data.question.category||'';
  document.getElementById('modal-question-text').textContent = data.question.question;
  document.getElementById('modal-error').textContent = '';
  const optYes = data.question.option_yes || 'כן';
  const optNo  = data.question.option_no  || 'לא';
  document.getElementById('modal-label-yes').textContent = optYes;
  document.getElementById('modal-label-no').textContent  = optNo;
  document.getElementById('choice-yes').textContent = optYes;
  document.getElementById('choice-no').textContent  = optNo;
  document.getElementById('bet-amount').value = 100;
  const dlEl=document.getElementById('modal-deadline-info');
  const dl=deadlineInfo(data.question.deadline);
  if(dl){dlEl.textContent='⏱ '+dl.text;dlEl.className=`modal-deadline ${dl.cls}`;}
  else dlEl.textContent='';
  updateModalOdds(); updateChoiceButtons(); updatePayout();
  document.getElementById('bet-modal').classList.add('open');
}

function updateModalOdds() {
  if(!currentBetQuestion) return;
  const q=currentBetQuestion, total=q.yes_volume+q.no_volume;
  const yesPct=total>0?Math.round((q.yes_volume/total)*100):50;
  document.getElementById('modal-yes-pct').textContent=`${yesPct}%`;
  document.getElementById('modal-no-pct').textContent=`${100-yesPct}%`;
}

function selectChoice(c) { currentBetChoice=c; updateChoiceButtons(); updatePayout(); }

function updateChoiceButtons() {
  document.getElementById('choice-yes').classList.toggle('active',currentBetChoice==='YES');
  document.getElementById('choice-no').classList.toggle('active', currentBetChoice==='NO');
}

function updatePayout() {
  if(!currentBetQuestion) return;
  const amount=parseFloat(document.getElementById('bet-amount').value)||0;
  const q=currentBetQuestion, total=q.yes_volume+q.no_volume;
  let payout;
  if(total===0){ payout=amount*2; }
  else {
    const winVol=currentBetChoice==='YES'?q.yes_volume:q.no_volume;
    payout=amount+(amount/(winVol+amount))*(total-winVol);
  }
  document.getElementById('bet-payout-val').textContent=`${formatNum(Math.round(payout))} נק"ז`;
}

function closeBetModal(e) {
  if(e&&e.target!==document.getElementById('bet-modal')) return;
  document.getElementById('bet-modal').classList.remove('open');
  currentBetQuestion=null;
}

async function placeBet() {
  const amount=parseInt(document.getElementById('bet-amount').value);
  if(!amount||amount<10) return setModalError('מינימום 10 נק"ז');
  if(amount>currentUser.balance) return setModalError('אין מספיק נק"ז');
  const res=await fetch(`${API}/api/bet`,{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({question_id:currentBetQuestion.id,choice:currentBetChoice,amount})});
  const data=await res.json();
  if(!res.ok) return setModalError(data.error||'שגיאה');
  currentUser.balance=data.new_balance;
  document.getElementById('nav-balance').textContent=formatNum(currentUser.balance);
  const mobVal2 = document.getElementById('nav-balance-mobile');
  if (mobVal2) mobVal2.textContent = formatNum(currentUser.balance);
  document.getElementById('bet-modal').classList.remove('open');
  showToast(`${formatNum(amount)} נק"ז על השולחן. אין דרך חזרה 🎯`, 'success');
  loadMarkets();
}

function setModalError(msg) { document.getElementById('modal-error').textContent=msg; }

// ===== PORTFOLIO =====
async function loadPortfolio() {
  const res=await fetch(`${API}/api/my-bets`,{headers:authHeaders()});
  const data=await res.json();
  renderPortfolio(data.bets||[]);
}

function renderPortfolio(bets) {
  const list=document.getElementById('portfolio-list');
  if(!bets.length){list.innerHTML=`<div class="empty-state"><span class="emoji">📭</span>אין בט</div>`;return;}
  list.innerHTML=bets.map(b=>{
    let cls,txt;
    if(!b.resolved){cls='open';txt='פעיל';}
    else if(b.won){cls='won';txt=`+${formatNum(Math.round(b.payout))} נק"ז`;}
    else{cls='lost';txt='הפסד';}
    return `<div class="portfolio-item">
      <div class="p-choice ${b.choice}">${b.choice==='YES'?(b.option_yes||'כן'):(b.option_no||'לא')}</div>
      <div class="p-question">${b.question}</div>
      <div class="p-amount">${formatNum(b.amount)} נק"ז</div>
      <div class="p-status ${cls}">${txt}</div>
    </div>`;
  }).join('');
}

// ===== LEADERBOARD =====
async function loadLeaderboard() {
  const headers = localStorage.getItem('token') ? authHeaders() : {};
  const res = await fetch(`${API}/api/leaderboard`, { headers });
  const data = await res.json();
  renderLeaderboard(data.users||[]);
}

function renderLeaderboard(users) {
  const list=document.getElementById('leaderboard-list');
  const medals=['🥇','🥈','🥉'],tops=['top1','top2','top3'];
  list.innerHTML=users.map((u,i)=>`
    <div class="lb-item ${tops[i]||''}">
      <div class="lb-rank">${
        i===0 ? '<span style="font-size:22px;filter:hue-rotate(0deg);">🥇</span>' :
        i===1 ? '<span style="font-size:22px;filter:grayscale(0.2) brightness(1.4);">🥈</span>' :
        i===2 ? '<span style="font-size:22px;filter:sepia(0.8) saturate(1.5);">🥉</span>' :
        (i+1)
      }</div>
      <div class="lb-name">${u.display_name}${currentUser && u.id===currentUser.id?'<span class="lb-you">(אתה)</span>':''}${i===0?'<span style="font-size:11px;background:rgba(255,215,0,0.15);color:#ffd700;border:1px solid rgba(255,215,0,0.3);border-radius:20px;padding:2px 8px;margin-right:6px;">מצטיין דיקן</span>':''}</div>
      <div class="lb-balance">${formatNum(u.balance)}<span class="lb-balance-unit">נק"ז</span></div>
    </div>`).join('');
}

// ===== CONFETTI =====
function launchConfetti(x, y) {
  const colors = ['#ff6eb4','#ff9f0a','#34c759','#007aff','#af52de','#fff'];
  for (let i = 0; i < 36; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    const angle = (Math.random() * 360) * (Math.PI / 180);
    const dist  = 80 + Math.random() * 120;
    el.style.cssText = `
      left: ${x}px; top: ${y}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      --dx: ${Math.cos(angle) * dist}px;
      --dy: ${Math.sin(angle) * dist + 60}px;
      --rot: ${Math.random() * 720 - 360}deg;
      --dur: ${0.8 + Math.random() * 0.7}s;
      width: ${5 + Math.random() * 7}px;
      height: ${5 + Math.random() * 7}px;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
}

// ===== COUNTDOWN =====
const countdownTimers = {};

function startCountdowns() {
  // נקה timers קיימים
  Object.values(countdownTimers).forEach(t => clearInterval(t));
  Object.keys(countdownTimers).forEach(k => delete countdownTimers[k]);

  document.querySelectorAll('.card-countdown[data-deadline]').forEach(el => {
    const deadline = new Date(el.dataset.deadline);
    function update() {
      const diff = deadline - Date.now();
      if (diff <= 0) { el.textContent = 'נסגר'; clearInterval(countdownTimers[el.dataset.id]); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 0) {
        el.textContent = `⏱ ${h}ש׳ ${m}ד׳`;
        el.classList.remove('urgent');
      } else if (m > 0) {
        el.textContent = `⏱ ${m}:${String(s).padStart(2,'0')}`;
        el.classList.toggle('urgent', m < 5);
      } else {
        el.textContent = `⏱ ${s}ש׳`;
        el.classList.add('urgent');
      }
    }
    update();
    const id = setInterval(update, 1000);
    countdownTimers[el.dataset.id] = id;
  });
}

// ===== CATEGORY HELPERS =====
function toggleCustomCategory(customInputId, select) {
  const customInput = document.getElementById(customInputId);
  if (!customInput) return;
  if (select.value === '__custom__') {
    customInput.style.display = '';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
    customInput.value = '';
  }
}

function getCategory(selectId, customInputId) {
  const select = document.getElementById(selectId);
  if (!select) return 'כללי';
  if (select.value === '__custom__') {
    const custom = document.getElementById(customInputId)?.value.trim();
    return custom || 'כללי';
  }
  return select.value || 'כללי';
}

// ===== ADMIN =====
async function loadAdminQuestions() {
  const res=await fetch(`${API}/api/questions?all=1`,{headers:authHeaders()});
  const data=await res.json();
  renderAdminQuestions(data.questions||[]);
}

function renderAdminQuestions(questions) {
  const list=document.getElementById('admin-questions-list');
  if(!questions.length){list.innerHTML=`<div style="color:var(--text3);font-size:13px;">אין שאלות עדיין</div>`;return;}
  list.innerHTML=questions.map(q=>{
    const total=q.yes_volume+q.no_volume;
    const dl=q.deadline?new Date(q.deadline).toLocaleString('he-IL'):null;
    return `<div class="admin-q-item">
      <div class="admin-q-text">${q.question}</div>
      <div class="admin-q-meta">נפח: ${formatNum(total)} נק"ז${dl?` · סגירה: ${dl}`:''}  · ${q.resolved?`נסגר — ${q.result==='YES'?(q.option_yes||'כן'):(q.option_no||'לא')}`:'פעיל'}</div>
      <div class="admin-q-actions">
        ${!q.resolved?`
          <button class="admin-q-btn resolve-yes" onclick="resolveQuestion(${q.id},'YES')">${q.option_yes||'כן'} ניצחה</button>
          <button class="admin-q-btn resolve-no"  onclick="resolveQuestion(${q.id},'NO')">${q.option_no||'לא'} ניצחה</button>`:''}
        <button class="admin-q-btn delete" onclick="deleteQuestion(${q.id})">מחק</button>
      </div>
    </div>`;
  }).join('');
}

async function createQuestion(asDraft = false) {
  const text=document.getElementById('new-question-text').value.trim();
  const category=getCategory('new-question-category','new-question-category-custom');
  const deadline=document.getElementById('new-question-deadline').value;
  const optYes=document.getElementById('new-option-yes').value.trim();
  const optNo =document.getElementById('new-option-no').value.trim();
  const dept  =document.getElementById('new-question-dept').value;
  if(!text) return showToast('כתוב שאלה קודם','error');
  if (asDraft) {
    // Save as suggestion (draft)
    const suggestHeaders = { 'Content-Type': 'application/json', ...authHeaders() };
    const res2 = await fetch('/api/suggestions', { method:'POST', headers: suggestHeaders,
      body: JSON.stringify({ question:text, category:category||'כללי', option_yes:optYes||'כן', option_no:optNo||'לא', department:dept||'', is_draft:true })
    });
    if (res2.ok) {
      document.getElementById('new-question-text').value='';
      document.getElementById('new-question-category').value='כללי';
    document.getElementById('new-question-category-custom').value='';
    document.getElementById('new-question-category-custom').style.display='none';
      document.getElementById('new-question-deadline').value='';
      document.getElementById('new-option-yes').value='';
      document.getElementById('new-option-no').value='';
      document.getElementById('new-question-dept').value='';
      showToast('נשמר כטיוטה — יום אחד אולי יצא לאור 📝','success');
      loadAdminSuggestions();
    }
    return;
  }
  const res=await fetch(`${API}/api/questions`,{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({question:text,category:category||'כללי',deadline:deadline||null,option_yes:optYes||'כן',option_no:optNo||'לא',department:dept||''})});
  if(res.ok){
    document.getElementById('new-question-text').value='';
    document.getElementById('new-question-category').value='כללי';
    document.getElementById('new-question-category-custom').value='';
    document.getElementById('new-question-category-custom').style.display='none';
    document.getElementById('new-question-deadline').value='';
    document.getElementById('new-option-yes').value='';
    document.getElementById('new-option-no').value='';
    document.getElementById('new-question-dept').value='';
    showToast('הסקר בשוק! מי אמיץ? 🔥','success'); loadAdminQuestions();
  } else { const d=await res.json(); showToast(d.error||'שגיאה','error'); }
}

async function resolveQuestion(id,result) {
  const res=await fetch(`${API}/api/questions/${id}/resolve`,{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({result})});
  if(res.ok){showToast(`נסגר. מי שניחש נכון — מזל. מי שלא — בניית אופי 💪`,'success');loadAdminQuestions();}
  else{const d=await res.json();showToast(d.error||'שגיאה','error');}
}

async function deleteQuestion(id) {
  if(!confirm('למחוק שאלה זו?')) return;
  const res=await fetch(`${API}/api/questions/${id}`,{method:'DELETE',headers:authHeaders()});
  if(res.ok){showToast('נמחק','success');loadAdminQuestions();}
}

// ===== REAL-TIME BALANCE =====
let balancePoller = null;

function startBalancePolling() {
  if (balancePoller) return;
  balancePoller = setInterval(async () => {
    const res = await fetch('/api/me', { headers: authHeaders() });
    if (!res.ok) return;
    const user = await res.json();
    const newBalance = user.balance;
    if (newBalance !== currentUser.balance) {
      const diff = newBalance - currentUser.balance;
      currentUser.balance = newBalance;
      animateBalance(newBalance, diff);
      if (diff > 50) {
        // זכייה — קונפטי ממרכז המסך
        launchConfetti(window.innerWidth / 2, window.innerHeight / 3);
        showToast(`+${formatNum(Math.round(diff))} נק"ז — ניצחת! 🎉`, 'success');
      }
    }
  }, 8000);
}

function animateBalance(newBalance, diff) {
  const el = document.getElementById('nav-balance');
  const elM = document.getElementById('nav-balance-mobile');
  if (!el) return;

  // Flash animation
  el.style.transition = 'color 0.3s, transform 0.3s';
  el.style.color = diff > 0 ? 'var(--yes)' : 'var(--no)';
  el.style.transform = 'scale(1.2)';

  // Show diff popup
  if (diff !== 0) {
    const popup = document.createElement('span');
    popup.textContent = (diff > 0 ? '+' : '') + formatNum(Math.round(diff));
    popup.style.cssText = `
      position: absolute;
      font-size: 12px;
      font-weight: 700;
      color: ${diff > 0 ? 'var(--yes)' : 'var(--no)'};
      animation: floatUp 1.5s ease forwards;
      pointer-events: none;
      white-space: nowrap;
    `;
    el.parentElement.style.position = 'relative';
    el.parentElement.appendChild(popup);
    setTimeout(() => popup.remove(), 1500);
  }

  setTimeout(() => {
    el.textContent = formatNum(newBalance);
    el.style.color = '';
    el.style.transform = '';
  }, 600);
}

// ===== SOFT REFRESH =====
function softRefresh() {
  // If already on markets - just reload the data
  const marketsSection = document.getElementById('section-markets');
  if (marketsSection && marketsSection.classList.contains('active')) {
    // Animate the grid out then back in
    const grid = document.getElementById('markets-grid');
    if (grid) {
      grid.style.opacity = '0';
      grid.style.transform = 'translateY(8px)';
      grid.style.transition = 'opacity 0.2s, transform 0.2s';
      setTimeout(() => {
        loadMarkets().then(() => {
          grid.style.opacity = '1';
          grid.style.transform = 'translateY(0)';
        });
      }, 200);
    }
  } else {
    // Navigate to markets
    const marketsTab = document.querySelector('.nav-tab');
    showSection('markets', marketsTab);
    loadMarkets();
  }
}

// ===== UTILS =====
function authHeaders(){ return {Authorization:`Bearer ${localStorage.getItem('token')}`}; }
function formatNum(n){ return Number(n).toLocaleString('he-IL'); }
function showToast(msg,type='success'){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className=`toast ${type} show`;
  setTimeout(()=>{t.className='toast';},3000);
}

// ===== GUEST BANNER =====
function dismissGuestBanner() {
  sessionStorage.setItem('guest-banner-dismissed', '1');
  const banner = document.getElementById('guest-banner');
  if (banner) banner.style.display = 'none';
}

// ===== ADMIN TABS =====
function switchAdminTab(tab, btn) {
  document.querySelectorAll('.admin-inner-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('admin-tab-questions').style.display = tab==='questions' ? 'block' : 'none';
  document.getElementById('admin-tab-users').style.display     = tab==='users'     ? 'block' : 'none';
  document.getElementById('admin-tab-suggestions').style.display = tab==='suggestions' ? 'block' : 'none';
  document.getElementById('admin-tab-activity').style.display  = tab==='activity'  ? 'block' : 'none';
  if (tab==='users')       loadAdminUsers();
  if (tab==='suggestions') loadAdminSuggestions();
  if (tab==='activity')    loadAdminActivity();
}

// ===== ADMIN USERS =====
async function loadAdminUsers() {
  const res  = await fetch('/api/admin/users', { headers: authHeaders() });
  const data = await res.json();
  renderAdminUsers(data.users || []);
}

function renderAdminUsers(users) {
  const list = document.getElementById('admin-users-list');
  if (!users.length) { list.innerHTML = '<div style="color:var(--text3);font-size:13px;">אין משתמשים</div>'; return; }
  list.innerHTML = users.map(u => `
    <div class="admin-user-item">
      <div class="admin-user-name">${u.display_name} <span style="color:var(--text3);font-weight:400;font-size:12px;">(${u.username})</span></div>
      ${u.is_admin ? '<div class="admin-user-badge">מנהל</div>' : ''}
      <div class="admin-user-balance">${formatNum(u.balance)} נק"ז</div>
      ${!u.is_admin ? `<button class="admin-q-btn delete" onclick="deleteUser(${u.id}, '${u.display_name}')">מחק</button>` : ''}
    </div>`
  ).join('');
}

async function deleteUser(id, name) {
  if (!confirm('למחוק את המשתמש "' + name + '"? פעולה זו אינה הפיכה.')) return;
  const res = await fetch('/api/admin/users/' + id, { method: 'DELETE', headers: authHeaders() });
  if (res.ok) { showToast('המשתמש יצא מהבניין 👋', 'success'); loadAdminUsers(); }
  else { const d = await res.json(); showToast(d.error||'שגיאה','error'); }
}

// ===== COMPLAINTS =====
const FAKE_NAMES = [
  "הגשתי ב-23:58 ונשרפתי",
  "ישבתי בשורה הראשונה כדי שיזכור אותי",
  "שאלתי שאלה והרצה אמר שאלה מצוינת ולא ענה",
  "התעוררתי להרצאה של 8 ולא הבנתי למה",
  "יצאתי מהבחינה בטוח שעברתי",
  "סיימתי את הגיליון ב-5 דקות וחיכיתי שעה",
  "רשמתי הכל ולא הבנתי כלום",
  "הגשתי יומיים לפני",
  "המחשבון לא עזר",
  "ישנתי בהרצאה אבל הצלמתי את הלוח",
  "חיכיתי לסיכום בוואטסאפ שלא הגיע",
  "ביקשתי הארכה ואמרו לא",
  "קראתי את השאלה עשר פעמים ועדיין לא הבנתי",
  "הייתי בטוח שזה לא בחומר",
  "אנונימי אבל כולם יודעים מי זה",
  "הגעתי בדיוק כשסגרו את הדלת",
  "עשיתי את הכל נכון לפי התשובות שלאחר הבחינה",
  "לא ישנתי לפני הבחינה ובכל זאת לא עזר",
  "התקנתי את הסביבה שלוש שעות לפני ההגשה",
  "מי שהשאיל עט ולא החזיר",
  "קיבלתי 55 וחיוך מהמרצה",
  "שרדתי את הסמסטר (בדיוק)",
  "הבנתי את החומר רק אחרי הבחינה",
  "ביקשתי ביטול עונשין ואמרו שזה לא קיים פה"
];

let selectedStars = 0;

function initStars() {
  const stars = document.querySelectorAll('.star');
  stars.forEach(s => {
    s.addEventListener('mouseover', () => highlightStars(+s.dataset.val));
    s.addEventListener('mouseout',  () => highlightStars(selectedStars));
    s.addEventListener('click',     () => {
      selectedStars = +s.dataset.val;
      highlightStars(selectedStars);
      document.getElementById('star-count').textContent = selectedStars + ' / 10';
    });
  });
}

function highlightStars(n) {
  document.querySelectorAll('.star').forEach(s => {
    s.classList.toggle('active', +s.dataset.val <= n);
  });
}

async function loadComplaints() {
  initStars();
  const res  = await fetch('/api/complaints', { headers: authHeaders() });
  const data = await res.json();
  renderComplaints(data.complaints || []);
}

function renderComplaints(complaints) {
  const list = document.getElementById('complaints-list');
  if (!complaints.length) {
    list.innerHTML = '<div class="complaints-empty">אין תלונות עדיין — אתם מרוצים מדי 🤔</div>';
    return;
  }
  list.innerHTML = complaints.map(c => {
    const stars = c.rating > 0
      ? '★'.repeat(c.rating) + '☆'.repeat(10 - c.rating)
      : '☆☆☆☆☆☆☆☆☆☆';
    const lowClass = c.rating <= 3 ? 'low' : '';
    const date = new Date(c.created_at).toLocaleDateString('he-IL', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    return `
    <div class="complaint-item">
      <div class="complaint-item-header">
        <div class="complaint-author">${c.author_name}</div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="complaint-stars ${lowClass}">${stars} ${c.rating}/10</div>
          ${currentUser && currentUser.is_admin ? `<button class="admin-q-btn delete" onclick="deleteComplaint(${c.id})" style="font-size:11px;padding:3px 10px;">מחק</button>` : ''}
        </div>
      </div>
      <div class="complaint-text-content">${c.content}</div>
      <div class="complaint-date">${date}</div>
    </div>`;
  }).join('');
}

async function submitComplaint() {
  const text = document.getElementById('complaint-text').value.trim();
  const errEl = document.getElementById('complaint-error');
  errEl.textContent = '';

  if (!text) { errEl.textContent = 'כתוב משהו קודם 🙄'; return; }
  if (text.length < 5) { errEl.textContent = 'תתאמץ קצת יותר'; return; }

  const authorName = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];

  const headers = { 'Content-Type': 'application/json' };
  if (localStorage.getItem('token')) Object.assign(headers, authHeaders());
  const res = await fetch('/api/complaints', {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: text, rating: selectedStars, author_name: authorName })
  });

  if (res.ok) {
    document.getElementById('complaint-text').value = '';
    selectedStars = 0;
    highlightStars(0);
    document.getElementById('star-count').textContent = '0 / 10';
    showToast('הבקשה נשמעה (אולי) 📮', 'success');
    loadComplaints();
  } else {
    const d = await res.json();
    errEl.textContent = d.error || 'שגיאה';
  }
}

// ===== SUGGEST MODAL =====
function openSuggestModal() {
  document.getElementById('suggest-question').value = '';
  document.getElementById('suggest-category').value = '';
  document.getElementById('suggest-opt-yes').value = '';
  document.getElementById('suggest-opt-no').value = '';
  document.getElementById('suggest-error').textContent = '';
  document.getElementById('suggest-modal').classList.add('open');
}

function closeSuggestModal(e) {
  if (e && e.target !== document.getElementById('suggest-modal')) return;
  document.getElementById('suggest-modal').classList.remove('open');
}

async function submitSuggestion() {
  const question   = document.getElementById('suggest-question').value.trim();
  const category   = getCategory('suggest-category','suggest-category-custom');
  const option_yes = document.getElementById('suggest-opt-yes').value.trim();
  const option_no  = document.getElementById('suggest-opt-no').value.trim();
  const errEl      = document.getElementById('suggest-error');
  errEl.textContent = '';

  if (!question) { errEl.textContent = 'כתוב שאלה קודם 🙄'; return; }

  const department = document.getElementById('suggest-dept').value;
  const sugHeaders = { 'Content-Type': 'application/json' };
  if (localStorage.getItem('token')) Object.assign(sugHeaders, authHeaders());
  const res = await fetch('/api/suggestions', {
    method: 'POST',
    headers: sugHeaders,
    body: JSON.stringify({ question, category: category||'כללי', option_yes: option_yes||'כן', option_no: option_no||'לא', department: department||'' })
  });

  if (res.ok) {
    document.getElementById('suggest-modal').classList.remove('open');
    showToast('ההצעה בדרך. המנהל יחליט את גורלה ⚖️', 'success');
  } else {
    const d = await res.json();
    errEl.textContent = d.error || 'שגיאה';
  }
}

// ===== SUGGESTIONS BADGE =====
async function loadSuggestionsBadge() {
  if (!currentUser || !currentUser.is_admin) return;
  try {
    const res  = await fetch('/api/suggestions', { headers: authHeaders() });
    const data = await res.json();
    const badge = document.getElementById('suggestions-badge');
    if (!badge) return;
    const count = (data.suggestions || []).length;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  } catch(e) {}
}

// ===== ADMIN SUGGESTIONS =====
async function loadAdminSuggestions() {
  const res  = await fetch('/api/suggestions', { headers: authHeaders() });
  const data = await res.json();
  renderAdminSuggestions(data.suggestions || []);

  // badge is handled in renderAdminSuggestions
}

function renderAdminSuggestions(suggestions) {
  const badge = document.getElementById('suggestions-badge');
  if (badge) {
    if (suggestions.length > 0) { badge.textContent = suggestions.length; badge.style.display = 'inline'; }
    else badge.style.display = 'none';
  }
  const list = document.getElementById('admin-suggestions-list');
  if (!suggestions.length) {
    list.innerHTML = '<div style="color:var(--text3);font-size:13px;">אין הצעות חדשות</div>';
    return;
  }
  list.innerHTML = suggestions.map(s => `
    <div class="admin-q-item">
      <div class="admin-q-text">${s.question}</div>
      <div class="admin-q-meta">
        ${s.is_draft?'<span style="background:rgba(245,158,11,0.15);color:#f59e0b;border-radius:20px;padding:1px 8px;font-size:11px;margin-left:6px;">טיוטה</span>':''}
        מאת: ${s.username||'אנונימי'} · קטגוריה: ${s.category}
        · אפשרויות: ${s.option_yes} / ${s.option_no}
      </div>
      <div class="admin-q-actions">
        <button class="admin-q-btn resolve-yes" onclick="approveSuggestion(${s.id})">✓ אשר וצור סקר</button>
        <button class="admin-q-btn delete" onclick="deleteSuggestion(${s.id})">✗ דחה</button>
      </div>
    </div>`
  ).join('');
}

async function approveSuggestion(id) {
  const res = await fetch('/api/suggestions/' + id + '/approve', { method: 'POST', headers: authHeaders() });
  if (res.ok) { showToast('ההצעה אושרה ויצאה לאור 🎉', 'success'); loadAdminSuggestions(); loadAdminQuestions(); }
  else { const d = await res.json(); showToast(d.error||'שגיאה','error'); }
}

async function deleteSuggestion(id) {
  const res = await fetch('/api/suggestions/' + id, { method: 'DELETE', headers: authHeaders() });
  if (res.ok) { showToast('ההצעה נדחתה לפח ההיסטוריה 🗑️', 'success'); loadAdminSuggestions(); }
}

// ===== ADMIN ACTIVITY LOG =====
async function loadAdminActivity(type = 'all') {
  const url = type === 'all' ? '/api/admin/activity' : `/api/admin/activity?type=${type}`;
  const res  = await fetch(url, { headers: authHeaders() });
  const data = await res.json();
  renderAdminActivity(data.activity || []);
}

function renderAdminActivity(items) {
  const list = document.getElementById('admin-activity-list');

  // רנדר פילטר בר רק בפעם הראשונה
  if (!document.getElementById('activity-filter-bar')) {
    const filterBar = document.createElement('div');
    filterBar.id = 'activity-filter-bar';
    filterBar.className = 'activity-filter-bar';
    filterBar.innerHTML = `
      <button class="activity-filter-btn active" data-type="all" onclick="filterActivity('all', this)">הכל</button>
      <button class="activity-filter-btn" data-type="bet" onclick="filterActivity('bet', this)">🎯 הימורים</button>
      <button class="activity-filter-btn" data-type="register" onclick="filterActivity('register', this)">👤 הרשמות</button>
      <button class="activity-filter-btn" data-type="rename" onclick="filterActivity('rename', this)">✏️ שינוי שם</button>
      <button class="activity-filter-btn" data-type="guest_vote" onclick="filterActivity('guest_vote', this)">👀 אורחים</button>
      <button class="activity-filter-btn" data-type="question" onclick="filterActivity('question', this)">📊 סקרים</button>
      <button class="activity-filter-btn" data-type="resolve" onclick="filterActivity('resolve', this)">🏁 סגירות</button>`;
    list.parentNode.insertBefore(filterBar, list);
  }

  const icons = { bet: '🎯', register: '👤', resolve: '🏁', guest_vote: '👀', question: '📊', rename: '✏️' };

  if (!items.length) {
    list.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:12px 0;">אין פעילות עדיין</div>';
    return;
  }

  list.innerHTML = items.map(item => `
    <div class="activity-item">
      <span class="activity-icon">${icons[item.type] || '•'}</span>
      <span class="activity-msg">${item.message}</span>
      <span class="activity-time">${formatActivityTime(item.created_at)}</span>
    </div>`).join('');
}

function filterActivity(type, btn) {
  document.querySelectorAll('.activity-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadAdminActivity(type);
}

function formatActivityTime(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${mm}`;
  if (isToday) return `היום ${timeStr}`;
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mo} ${timeStr}`;
}

// ===== GUEST VOTE =====
async function guestVote(questionId, choice, btn) {
  const res = await fetch('/api/guest-vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: questionId, choice })
  });
  const data = await res.json();

  if (res.ok) {
    loadMarkets();
    // Show prompt to register
    const toast = document.getElementById('toast');
    toast.innerHTML = 'הצבעת! עכשיו תתפלל 🕯️ <button onclick="showAuthOverlay()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:20px;padding:2px 10px;margin-right:8px;cursor:pointer;font-family:Rubik,sans-serif;font-size:12px;">הרשם כדי להמר 🚀</button>';
    toast.className = 'toast success show';
    setTimeout(() => { toast.className = 'toast'; toast.textContent=''; }, 5000);
  } else if (data.error === 'already_voted') {
    showToast('כבר הצבעת על הסקר הזה', 'error');
  } else {
    showToast(data.error || 'שגיאה', 'error');
  }
}

// ===== DELETE COMPLAINT =====
async function deleteComplaint(id) {
  if (!confirm('למחוק את הבקשה הזו?')) return;
  const res = await fetch('/api/complaints/' + id, { method: 'DELETE', headers: authHeaders() });
  if (res.ok) { showToast('נמחק', 'success'); loadComplaints(); }
  else { const d = await res.json(); showToast(d.error||'שגיאה','error'); }
}

// ===== PROFILE MODAL =====
function openProfileModal() {
  if (!currentUser) return;
  document.getElementById('profile-username-display').textContent = currentUser.display_name;
  document.getElementById('profile-display-name').value = currentUser.display_name;
  document.getElementById('profile-password').value = '';
  document.getElementById('profile-error').textContent = '';
  document.getElementById('profile-modal').classList.add('open');
}

function closeProfileModal(e) {
  if (e && e.target !== document.getElementById('profile-modal')) return;
  document.getElementById('profile-modal').classList.remove('open');
}

async function saveProfile() {
  const displayName = document.getElementById('profile-display-name').value.trim();
  const password    = document.getElementById('profile-password').value;
  const errEl = document.getElementById('profile-error');
  errEl.textContent = '';

  if (!displayName) { errEl.textContent = 'שם תצוגה לא יכול להיות ריק'; return; }
  if (password && password.length < 4) { errEl.textContent = 'סיסמה חייבת להיות לפחות 4 תווים'; return; }

  const body = { display_name: displayName };
  if (password) body.password = password;

  const res = await fetch('/api/me/update', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'שגיאה'; return; }

  currentUser.display_name = data.display_name;
  const navUser = document.getElementById('nav-username');
  if (navUser) navUser.textContent = data.display_name;
  document.getElementById('profile-modal').classList.remove('open');
  showToast('שם חדש, אותו ציון 😌', 'success');
}
