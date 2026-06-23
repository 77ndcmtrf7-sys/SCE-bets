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
  if (name==='archive')      loadArchive();
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
  _allQuestions = questions;
  const filtered = _currentInstitution === 'all' ? questions : questions.filter(q => (q.institution || 'כללי') === _currentInstitution);
  if (silent && document.querySelectorAll('.market-card').length === filtered.length) {
    updateCardPcts(filtered);
  } else {
    renderMarkets(filtered);
  }
}

function renderMarkets(questions) {
  const grid = document.getElementById('markets-grid');
  if (!questions.length) {
    grid.classList.remove('masonry-active');
    grid.style.height = '';
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
          ${q.result==='YES'?'<span class="winner-check">✓</span>':''}
          <span class="choice-pct">${yesPct}%</span>
          <span class="choice-label">${q.option_yes||'כן'}</span>
        </div>
        <div class="choice-block no-block ${q.result==='NO'?'winner':'loser'}">
          ${q.result==='NO'?'<span class="winner-check">✓</span>':''}
          <span class="choice-pct">${noPct}%</span>
          <span class="choice-label">${q.option_no||'לא'}</span>
        </div>
      </div>
      <div class="resolved-result ${q.result}">
        <span class="resolved-result-label">התוצאה:</span>
        <strong>${q.result==='YES'?(q.option_yes||'כן'):(q.option_no||'לא')}</strong>
      </div>`;

    const catColor  = getCategoryColor(q.category);
    const catStyle  = catColor ? `style="color:${catColor}"` : '';
    const cardBorderStyle = catColor ? `style="border-top-color:${catColor}"` : '';
    const instColor = getInstitutionColor(q.institution);
    const instGrad  = getInstitutionGradient(q.institution);
    const instTag   = (q.institution && q.institution !== 'כללי')
      ? `<span class="inst-tag" style="background:${instGrad};color:#fff;">${q.institution}</span>`
      : '';
    const shortDesc = q.description ? (q.description.split('\n')[0].length > 80
      ? q.description.split('\n')[0].slice(0,80) + '...'
      : q.description.split('\n')[0] + (q.description.includes('\n') || q.description.length > 80 ? '...' : '')
    ) : '';
    return `
    <div class="market-card ${q.resolved?'resolved':''}" data-cat="${q.category||'כללי'}" data-dept="${q.department||''}" data-qid="${q.id}" data-resolved="${q.resolved?1:0}" ${cardBorderStyle}>
      ${q.resolved ? '<div class="closed-ribbon">נסגר</div>' : ''}
      <div class="card-tags-row">${deptTag}<span class="card-category" ${catStyle}>${q.category||'כללי'}</span>${instTag}</div>
      <div class="card-question">${q.question}</div>
      ${shortDesc ? `<div class="card-description">${shortDesc}</div>` : ''}
      ${q.resolved ? resolvedBlock : (currentUser ? betBlocksUser : betBlocksGuest)}
      <div class="card-footer">
        <div class="card-footer-top">
          <div class="card-volume">נפח: <span>${formatNum(total)} נק"ז</span></div>
          <div class="card-stats-row" dir="ltr">
            <span class="stat-yes">${q.yes_count||0}</span>
            <span class="stat-mid">vs</span>
            <span class="stat-no">${q.no_count||0}</span>
            <span class="stat-label">bets</span>
          </div>
        </div>
        ${dlHtml}
      </div>
    </div>`;
  }).join('');
  startCountdowns();
  // event delegation — לחיצה על כרטיס
  const gridEl = document.getElementById('markets-grid');
  gridEl.onclick = (e) => {
    const card = e.target.closest('.market-card');
    if (!card) return;
    // אל תפתח modal אם לחצו על choice-block
    if (e.target.closest('.choice-block')) return;
    if (card.dataset.resolved === '1') return;
    const qid = parseInt(card.dataset.qid);
    if (!qid) return;
    if (currentUser) openBetModal(qid);
    else showAuthOverlay();
  };
  // פריסת masonry + אנימציית כניסה (בפריים הבא כדי שהגבהים יהיו מדויקים)
  requestAnimationFrame(() => layoutMasonry(true));
}

// ===== MASONRY LAYOUT =====
let _masonryRaf = null;

function layoutMasonry(animateIn = false) {
  const grid = document.getElementById('markets-grid');
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll('.market-card'));
  if (!cards.length) { grid.style.height = ''; return; }

  const gap = 14;
  const containerWidth = grid.clientWidth;

  const MIN_COL_WIDTH = 300;
  let cols = Math.max(1, Math.floor((containerWidth + gap) / (MIN_COL_WIDTH + gap)));
  if (window.innerWidth <= 600) cols = 1;

  const colWidth = (containerWidth - gap * (cols - 1)) / cols;
  const colHeights = new Array(cols).fill(0);

  // עמודה אחת — flow רגיל, בלי absolute
  if (cols === 1) {
    grid.classList.remove('masonry-active');
    grid.style.height = '';
    cards.forEach(c => { c.style.top=''; c.style.left=''; c.style.width=''; });
    if (animateIn) animateCardsIn(cards);
    return;
  }

  grid.classList.add('masonry-active');

  cards.forEach((card) => {
    card.style.width = colWidth + 'px';
    let shortestCol = 0;
    for (let c = 1; c < cols; c++) {
      if (colHeights[c] < colHeights[shortestCol]) shortestCol = c;
    }
    // RTL — עמודה 0 בצד ימין
    const x = (cols - 1 - shortestCol) * (colWidth + gap);
    const y = colHeights[shortestCol];
    card.style.left = x + 'px';
    card.style.top  = y + 'px';
    colHeights[shortestCol] += card.offsetHeight + gap;
  });

  grid.style.height = Math.max(...colHeights) + 'px';
  if (animateIn) animateCardsIn(cards);
}

function animateCardsIn(cards) {
  cards.forEach((card, i) => {
    const delay = Math.min(i, 12) * 45; // תקרה — כרטיסים מאוחרים לא נתקעים שקופים
    card.style.opacity = '0';
    card.style.animation = 'none';
    // force reflow כדי שה-animation יופעל מחדש
    void card.offsetWidth;
    setTimeout(() => {
      card.style.animation = 'cardPop 0.5s cubic-bezier(0.2,0.7,0.2,1) both';
      // ביטחון — אם האנימציה לא רצה מסיבה כלשהי, הכרטיס נשאר גלוי
      card.addEventListener('animationend', () => { card.style.opacity = '1'; card.style.animation = ''; }, { once: true });
    }, delay);
  });
}

window.addEventListener('resize', () => {
  if (_masonryRaf) cancelAnimationFrame(_masonryRaf);
  _masonryRaf = requestAnimationFrame(() => layoutMasonry(false));
});


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
  const catColor = getCategoryColor(data.question.category);
  const catTagEl = document.getElementById('modal-category-tag');
  catTagEl.textContent = data.question.category || '';
  catTagEl.style.color = catColor || '';
  document.getElementById('modal-question-text').textContent = data.question.question;
  // תיאור מלא
  const modalDescEl = document.getElementById('modal-description');
  if (modalDescEl) {
    if (data.question.description) {
      modalDescEl.textContent = data.question.description;
      modalDescEl.style.display = '';
    } else {
      modalDescEl.style.display = 'none';
    }
  }
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
  const q=currentBetQuestion;
  // הקופה כולה אחרי שההימור ייכנס (כולל אורחים — שכבר בתוך yes_volume/no_volume)
  const totalVolume = q.yes_volume + q.no_volume + amount;
  // סך ההימורים האמיתיים בצד הנבחר, כולל ההימור הנוכחי
  const realWinSide = currentBetChoice==='YES' ? (q.real_yes||0) : (q.real_no||0);
  const realWinStake = realWinSide + amount;
  let payout;
  if (realWinStake > 0) {
    // אותה נוסחה כמו בשרת: (ההימור שלך / סך ההימורים האמיתיים המנצחים) × כל הקופה
    payout = (amount / realWinStake) * totalVolume;
  } else {
    payout = amount;
  }
  if (payout < amount) payout = amount;
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

// ===== ARCHIVE =====
async function loadArchive() {
  const res  = await fetch('/api/archive', { headers: authHeaders() });
  const data = await res.json();
  renderArchive(data.questions || []);
}

function renderArchive(questions) {
  const grid = document.getElementById('archive-grid');
  if (!questions.length) {
    grid.innerHTML = '<div class="empty-state">אין סקרים בארכיון עדיין 📭</div>';
    return;
  }
  grid.innerHTML = questions.map(q => {
    const total  = q.yes_volume + q.no_volume;
    const yesPct = total > 0 ? Math.round((q.yes_volume / total) * 100) : 50;
    const noPct  = 100 - yesPct;
    const catColor = getCategoryColor(q.category);
    const catStyle = catColor ? `style="color:${catColor}"` : '';
    const cardBorderStyle = catColor ? `style="border-top-color:${catColor}"` : '';
    const deptTag = q.department ? `<span class="dept-tag">${q.department}</span>` : '';
    const winnerYes = q.result === 'YES';
    return `
    <div class="market-card resolved" data-cat="${q.category||'כללי'}" ${cardBorderStyle}>
      <div class="card-tags-row">${deptTag}<span class="card-category" ${catStyle}>${q.category||'כללי'}</span></div>
      <div class="card-question">${q.question}</div>
      ${q.description ? `<div class="card-description">${q.description}</div>` : ''}
      <div class="choice-blocks">
        <div class="choice-block yes-block ${winnerYes?'winner':'loser'}">
          <span class="choice-pct">${yesPct}%</span>
          <span class="choice-label">${q.option_yes||'כן'}</span>
        </div>
        <div class="choice-block no-block ${!winnerYes?'winner':'loser'}">
          <span class="choice-pct">${noPct}%</span>
          <span class="choice-label">${q.option_no||'לא'}</span>
        </div>
      </div>
      <div class="resolved-badge ${q.result}">${winnerYes?'✓ '+(q.option_yes||'כן'):'✗ '+(q.option_no||'לא')} — נסגר</div>
      <div class="card-footer">
        <div class="card-footer-top">
          <div class="card-volume">נפח: <span>${formatNum(total)} נק"ז</span></div>
          <div class="card-stats-row" dir="ltr">
            <span class="stat-yes">${q.yes_count||0}</span>
            <span class="stat-mid">vs</span>
            <span class="stat-no">${q.no_count||0}</span>
            <span class="stat-label">bets</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ===== PORTFOLIO =====
async function loadPortfolio() {
  const res=await fetch(`${API}/api/my-bets`,{headers:authHeaders()});
  const data=await res.json();
  renderPortfolio(data.bets||[]);
}

function renderPortfolio(bets) {
  // מיון: פעילים קודם, אחר כך לפי id יורד (= חדש יותר למעלה)
  bets = [...bets].sort((a, b) => {
    if (!a.won && !b.won && a.payout === null && b.payout === null) return b.id - a.id;
    if (a.won !== null && b.won === null) return 1;  // סגורים אחרי פעילים
    if (a.won === null && b.won !== null) return -1;
    return b.id - a.id;
  });
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
  const colors = ['#ff6eb4','#ff9f0a','#36d3a0','#007aff','#af52de','#fff'];
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


// ===== EDIT SUGGESTION MODAL =====
function openEditSuggestionById(id) {
  const s = _adminSuggestions.find(s => s.id === id);
  if (s) openEditSuggestionModal(s);
}

function openEditSuggestionModal(s) {
  document.getElementById('edit-suggestion-id').value       = s.id;
  document.getElementById('edit-suggestion-question').value = s.question;
  document.getElementById('edit-suggestion-description').value = s.description || '';
  document.getElementById('edit-suggestion-opt-yes').value  = s.option_yes || 'כן';
  document.getElementById('edit-suggestion-opt-no').value   = s.option_no  || 'לא';
  document.getElementById('edit-suggestion-deadline').value = s.deadline ? s.deadline.slice(0,16) : '';
  // קטגוריה
  const catSel = document.getElementById('edit-suggestion-category');
  const standardCats = ['כללי','הרצאות','בחינות','קפיטריה'];
  if (standardCats.includes(s.category)) {
    catSel.value = s.category;
    document.getElementById('edit-suggestion-category-custom').style.display = 'none';
  } else {
    catSel.value = '__custom__';
    document.getElementById('edit-suggestion-category-custom').style.display = '';
    document.getElementById('edit-suggestion-category-custom').value = s.category || '';
  }
  // מחלקה
  document.getElementById('edit-suggestion-dept').value = s.department || '';
  document.getElementById('edit-suggestion-institution').value = s.institution || 'כללי';
  document.getElementById('edit-suggestion-error').textContent = '';
  document.getElementById('edit-suggestion-modal').classList.add('open');
}

function closeEditSuggestionModal(e) {
  if (e && e.target !== document.getElementById('edit-suggestion-modal')) return;
  document.getElementById('edit-suggestion-modal').classList.remove('open');
}

function getEditSuggestionData() {
  return {
    id:          document.getElementById('edit-suggestion-id').value,
    question:    document.getElementById('edit-suggestion-question').value.trim(),
    category:    getCategory('edit-suggestion-category','edit-suggestion-category-custom'),
    department:  document.getElementById('edit-suggestion-dept').value,
    description: document.getElementById('edit-suggestion-description').value.trim(),
    option_yes:  document.getElementById('edit-suggestion-opt-yes').value.trim() || 'כן',
    option_no:   document.getElementById('edit-suggestion-opt-no').value.trim()  || 'לא',
    deadline:    document.getElementById('edit-suggestion-deadline').value || null,
    institution: document.getElementById('edit-suggestion-institution')?.value || 'כללי',
  };
}

async function publishEditedSuggestion() {
  const d = getEditSuggestionData();
  const errEl = document.getElementById('edit-suggestion-error');
  if (!d.question) { errEl.textContent = 'שאלה לא יכולה להיות ריקה'; return; }
  const res = await fetch(`/api/suggestions/${d.id}/approve-edited`, {
    method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...d, as_draft: false })
  });
  if (res.ok) {
    document.getElementById('edit-suggestion-modal').classList.remove('open');
    showToast('ההצעה אושרה ויצאה לאור 🎉', 'success');
    loadAdminSuggestions(); loadAdminQuestions();
  } else {
    const err = await res.json();
    errEl.textContent = err.error || 'שגיאה';
  }
}

async function saveEditedSuggestionAsDraft() {
  const d = getEditSuggestionData();
  const errEl = document.getElementById('edit-suggestion-error');
  if (!d.question) { errEl.textContent = 'שאלה לא יכולה להיות ריקה'; return; }
  const res = await fetch(`/api/suggestions/${d.id}/approve-edited`, {
    method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...d, as_draft: true })
  });
  if (res.ok) {
    document.getElementById('edit-suggestion-modal').classList.remove('open');
    showToast('נשמר כטיוטה — יום אחד אולי יצא לאור 📝', 'success');
    loadAdminSuggestions(); loadAdminQuestions();
  } else {
    const err = await res.json();
    errEl.textContent = err.error || 'שגיאה';
  }
}

// ===== EDIT QUESTION MODAL =====
function openEditQuestionById(id) {
  const q = _adminQuestions.find(q => q.id === id);
  if (q) openEditQuestionModal(q);
}

function openEditQuestionModal(q) {
  document.getElementById('edit-question-id').value          = q.id;
  document.getElementById('edit-question-text').value        = q.question;
  document.getElementById('edit-question-description').value = q.description || '';
  document.getElementById('edit-question-opt-yes').value     = q.option_yes || 'כן';
  document.getElementById('edit-question-opt-no').value      = q.option_no  || 'לא';
  document.getElementById('edit-question-deadline').value    = q.deadline ? q.deadline.slice(0,16) : '';
  // קטגוריה
  const catSel = document.getElementById('edit-question-category');
  const standardCats = ['כללי','הרצאות','בחינות','קפיטריה'];
  if (standardCats.includes(q.category)) {
    catSel.value = q.category;
    document.getElementById('edit-question-category-custom').style.display = 'none';
  } else {
    catSel.value = '__custom__';
    document.getElementById('edit-question-category-custom').style.display = '';
    document.getElementById('edit-question-category-custom').value = q.category || '';
  }
  // מחלקה
  document.getElementById('edit-question-dept').value = q.department || '';
  document.getElementById('edit-question-institution').value = q.institution || 'כללי';
  document.getElementById('edit-question-error').textContent = '';
  document.getElementById('edit-question-modal').classList.add('open');
}

function closeEditQuestionModal(e) {
  if (e && e.target !== document.getElementById('edit-question-modal')) return;
  document.getElementById('edit-question-modal').classList.remove('open');
}

async function saveEditedQuestion() {
  const id          = document.getElementById('edit-question-id').value;
  const question    = document.getElementById('edit-question-text').value.trim();
  const category    = getCategory('edit-question-category','edit-question-category-custom');
  const department  = document.getElementById('edit-question-dept').value;
  const description = document.getElementById('edit-question-description').value.trim();
  const option_yes  = document.getElementById('edit-question-opt-yes').value.trim() || 'כן';
  const option_no   = document.getElementById('edit-question-opt-no').value.trim()  || 'לא';
  const deadline    = document.getElementById('edit-question-deadline').value || null;
  const errEl       = document.getElementById('edit-question-error');

  if (!question) { errEl.textContent = 'שאלה לא יכולה להיות ריקה'; return; }

  const institution = document.getElementById('edit-question-institution')?.value || 'כללי';
  const res = await fetch(`/api/questions/${id}`, {
    method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, category, department, description, option_yes, option_no, deadline, institution })
  });

  if (res.ok) {
    document.getElementById('edit-question-modal').classList.remove('open');
    showToast('הסקר עודכן ✓', 'success');
    loadAdminQuestions(); loadMarkets();
  } else {
    const err = await res.json();
    errEl.textContent = err.error || 'שגיאה';
  }
}


// ===== CUSTOM CATEGORY COLORS =====
const CUSTOM_CAT_PALETTE = [
  '#7c6af7', // סגול
  '#3b9ede', // כחול
  '#e8874a', // כתום
  '#22b8a0', // טורקיז
  '#d4627a', // ורוד כהה
  '#8fb844', // ירוק זית
  '#c471ed', // סגול בהיר
  '#4ecdc4', // מנטה
];

function getCategoryColor(cat) {
  if (!cat) return null;
  const fixed = { 'הרצאות': '#f0b429', 'בחינות': '#f05252', 'קפיטריה': '#22d98a', 'כללי': '#ff6eb4' };
  if (cat in fixed) return fixed[cat];
  // צבע רנדומלי אבל עקבי לפי שם הקטגוריה
  let hash = 0;
  for (let i = 0; i < cat.length; i++) hash = cat.charCodeAt(i) + ((hash << 5) - hash);
  return CUSTOM_CAT_PALETTE[Math.abs(hash) % CUSTOM_CAT_PALETTE.length];
}

// ===== INSTITUTION FILTER =====
const INSTITUTION_CONFIG = {
  'כללי':       { color: null,      gradient: null },
  'סמי שמעון': { color: '#00e5b0', gradient: 'linear-gradient(135deg, #1a3a5c, #00e5b0)' },
  'בן גוריון':  { color: '#ff8c00', gradient: 'linear-gradient(135deg, #7a3a00, #ff8c00)' },
};

function getInstitutionColor(inst) {
  return INSTITUTION_CONFIG[inst]?.color || null;
}
function getInstitutionGradient(inst) {
  return INSTITUTION_CONFIG[inst]?.gradient || null;
}
let _currentInstitution = 'all';
let _allQuestions = [];

function filterByInstitution(inst, btn) {
  _currentInstitution = inst;
  document.querySelectorAll('.inst-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filtered = inst === 'all' ? _allQuestions : _allQuestions.filter(q => (q.institution || 'כללי') === inst);
  renderMarkets(filtered);
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

let _adminQuestions = [];
function renderAdminQuestions(questions) {
  _adminQuestions = questions;
  const list=document.getElementById('admin-questions-list');
  if(!questions.length){list.innerHTML=`<div style="color:var(--text3);font-size:13px;">אין שאלות עדיין</div>`;return;}
  list.innerHTML=questions.map(q=>{
    const total=q.yes_volume+q.no_volume;
    const dl=q.deadline?new Date(q.deadline).toLocaleString('he-IL'):null;
    return `<div class="admin-q-item">
      <div class="admin-q-text">${q.question}</div>
      <div class="admin-q-meta">נפח: ${formatNum(total)} נק"ז${dl?` · סגירה: ${dl}`:''}  · ${q.resolved?`נסגר — ${q.result==='YES'?(q.option_yes||'כן'):(q.option_no||'לא')}`:'פעיל'}</div>
      <div class="admin-q-actions">
        <button class="admin-q-btn edit" onclick="openEditQuestionById(${q.id})">✏️ ערוך</button>
        ${!q.resolved?`
          <button class="admin-q-btn resolve-yes" onclick="resolveQuestion(${q.id},'YES')">${q.option_yes||'כן'} ניצחה</button>
          <button class="admin-q-btn resolve-no"  onclick="resolveQuestion(${q.id},'NO')">${q.option_no||'לא'} ניצחה</button>`
        :`<button class="admin-q-btn archive" onclick="archiveQuestion(${q.id})">📦 לארכיון</button>`}
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
      body: JSON.stringify({
        question: text, category: category||'כללי',
        option_yes: optYes||'כן', option_no: optNo||'לא',
        department: dept||'', is_draft: true,
        description: document.getElementById('new-question-description')?.value.trim() || '',
        deadline: deadline || null
      })
    });
    if (res2.ok) {
      document.getElementById('new-question-text').value='';
      document.getElementById('new-question-category').value='כללי';
    document.getElementById('new-question-category-custom').value='';
    document.getElementById('new-question-category-custom').style.display='none';
    const descEl = document.getElementById('new-question-description');
    if (descEl) descEl.value = '';
      document.getElementById('new-question-deadline').value='';
      document.getElementById('new-option-yes').value='';
      document.getElementById('new-option-no').value='';
      document.getElementById('new-question-dept').value='';
      showToast('נשמר כטיוטה — יום אחד אולי יצא לאור 📝','success');
      loadAdminSuggestions();
    }
    return;
  }
  const descVal = document.getElementById('new-question-description')?.value.trim() || '';
  const institution = document.getElementById('new-question-institution')?.value || 'כללי';
  const res=await fetch(`${API}/api/questions`,{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({question:text,category:category||'כללי',deadline:deadline||null,option_yes:optYes||'כן',option_no:optNo||'לא',department:dept||'',description:descVal,institution})});
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

async function archiveQuestion(id) {
  if(!confirm('להעביר את הסקר לארכיון עכשיו?')) return;
  const res=await fetch(`${API}/api/questions/${id}/archive`,{method:'POST',headers:authHeaders()});
  if(res.ok){showToast('הסקר הועבר לארכיון 📦','success');loadAdminQuestions();}
  else{const d=await res.json();showToast(d.error||'שגיאה','error');}
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
  document.getElementById('admin-tab-questions').style.display = tab==='questions' ? 'grid' : 'none';
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
  "הגשתי ב23:59",
  "ישבתי בשורה הראשונה - לא עזר",
  "הגשתי דף ריק",
  "יצאתי מהבחינה בטוח שעברתי",
  "רשמתי הכל ולא הבנתי כלום",
  "נתראה במועד ב",
  "המחשבון לא עזר",
  "ישנתי בהרצאה אבל צילמתי את הלוח",
  "קראתי את השאלה עשר פעמים ועדיין לא הבנתי",
  "הייתי בטוח שזה לא בחומר",
  "למדתי את כל הסמסטר בשבוע",
  "קיבלתי 55 וחיוך מהמרצה",
  "הבנתי את החומר רק אחרי הבחינה"
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
    const _cDate = new Date(c.created_at.endsWith('Z') ? c.created_at : c.created_at + 'Z');
    const date = _cDate.toLocaleDateString('he-IL', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Jerusalem' });
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
  const category    = getCategory('suggest-category','suggest-category-custom');
  const description = document.getElementById('suggest-description')?.value.trim() || '';
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
    body: JSON.stringify({ question, category: category||'כללי', option_yes: option_yes||'כן', option_no: option_no||'לא', department: department||'', description, deadline: document.getElementById('suggest-deadline')?.value || null, institution: document.getElementById('suggest-institution')?.value || 'כללי' })
  });

  if (res.ok) {
    document.getElementById('suggest-modal').classList.remove('open');
    document.getElementById('suggest-description').value = '';
    const sdl = document.getElementById('suggest-deadline'); if(sdl) sdl.value='';
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

let _adminSuggestions = [];
function renderAdminSuggestions(suggestions) {
  _adminSuggestions = suggestions;
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
        <button class="admin-q-btn edit" onclick="openEditSuggestionById(${s.id})">✏️ ערוך</button>
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
  if (res.ok) { showToast('ההצעה נזרקה לפח - יחד עם שמחת החיים שלי 🗑️', 'success'); loadAdminSuggestions(); }
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
  if (!dateStr) return '';
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  if (isNaN(d)) return '';
  const opts = { timeZone: 'Asia/Jerusalem' };
  const now = new Date();
  const todayStr = now.toLocaleDateString('he-IL', opts);
  const dStr    = d.toLocaleDateString('he-IL', opts);
  const hh = String(d.toLocaleTimeString('he-IL', { ...opts, hour:'2-digit', hour12:false }).slice(0,2)).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  const timeStr = `${hh}:${mm}`;
  if (todayStr === dStr) return `היום ${timeStr}`;
  const dd = String(d.toLocaleDateString('he-IL', { ...opts, day:'2-digit' })).padStart(2,'0');
  const mo = String(d.toLocaleDateString('he-IL', { ...opts, month:'2-digit' })).padStart(2,'0');
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
