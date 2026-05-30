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
  else localStorage.removeItem('token');
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
    if (navUsername) navUsername.style.display = 'none';
    if (adminTab)   adminTab.style.display   = 'none';
    if (mobileAdmin) mobileAdmin.style.display = 'none';
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
  document.getElementById('nav-username').textContent = user.display_name;
  document.getElementById('nav-balance').textContent  = formatNum(user.balance);
  updateGuestUI(true);
  if (user.is_admin) {
    document.getElementById('admin-tab').style.display = '';
    document.getElementById('mobile-admin-tab').style.display = '';
  }
  loadMarkets();
  startBalancePolling();
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
async function loadMarkets() {
  const res  = await fetch(`${API}/api/questions`,{headers:authHeaders()});
  const data = await res.json();
  renderMarkets(data.questions||[]);
}

function renderMarkets(questions) {
  const grid = document.getElementById('markets-grid');
  if (!questions.length) {
    grid.innerHTML=`<div class="empty-state"><span class="emoji">🤔</span>אין שאלות עדיין</div>`;
    return;
  }
  grid.innerHTML = questions.map(q=>{
    const total=q.yes_volume+q.no_volume;
    const yesPct=total>0?Math.round((q.yes_volume/total)*100):50;
    const noPct=100-yesPct;
    const dl=deadlineInfo(q.deadline);
    const dlHtml=dl?`<div class="card-deadline ${dl.cls}">⏱ ${dl.text}</div>`:'<div style="margin-bottom:14px"></div>';
    const deptTag=q.department?`<div class="dept-tag">${q.department}</div>`:'';
    return `
    <div class="market-card ${q.resolved?'resolved':''}" data-cat="${q.category||'כללי'}" data-dept="${q.department||''}" ${!q.resolved?(currentUser?`onclick="openBetModal(${q.id})"`:'onclick=""'):''}> 
      ${deptTag}
      <div class="card-category">${q.category||'כללי'}</div>
      <div class="card-question">${q.question}</div>
      <div class="card-bar-wrap">
        <div class="card-bar"><div class="card-bar-fill" style="width:${yesPct}%"></div></div>
        <div class="card-bar-labels">
          <span class="yes-label">${q.option_yes||'כן'} ${yesPct}%</span>
          <span class="no-label">${noPct}% ${q.option_no||'לא'}</span>
        </div>
      </div>

      <div class="card-footer">
        <div class="card-volume">נפח: <span>${formatNum(total)} נק"ז</span></div>
        ${q.resolved
          ?`<div class="resolved-badge ${q.result}">${q.result==='YES'?'✓ '+(q.option_yes||'כן'):'✗ '+(q.option_no||'לא')} — נסגר</div>`
          :currentUser
            ?`<div class="bet-buttons">
                <button class="bet-btn yes" onclick="event.stopPropagation();openBetModal(${q.id},'YES')">${q.option_yes||'כן'}</button>
                <button class="bet-btn no"  onclick="event.stopPropagation();openBetModal(${q.id},'NO')">${q.option_no||'לא'}</button>
              </div>`
            :`<div class="bet-buttons">
                <button class="bet-btn yes" onclick="event.stopPropagation();guestVote(${q.id},'YES',this)">${q.option_yes||'כן'}</button>
                <button class="bet-btn no"  onclick="event.stopPropagation();guestVote(${q.id},'NO',this)">${q.option_no||'לא'}</button>
              </div>`
        }
      </div>
      <div class="card-stats-row" dir="ltr">
        <span class="stat-yes">${q.yes_count||0}</span>
        <span class="stat-mid">vs</span>
        <span class="stat-no">${q.no_count||0}</span>
        <span class="stat-label">bets</span>
      </div>
      ${dlHtml}
          </div>`;
  }).join('');
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
  document.getElementById('bet-modal').classList.remove('open');
  showToast(`הימור של ${formatNum(amount)} נק"ז הונח בהצלחה`,'success');
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
  const category=document.getElementById('new-question-category').value.trim();
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
      document.getElementById('new-question-category').value='';
      document.getElementById('new-question-deadline').value='';
      document.getElementById('new-option-yes').value='';
      document.getElementById('new-option-no').value='';
      document.getElementById('new-question-dept').value='';
      showToast('נשמר כטיוטה 📝','success');
      loadAdminSuggestions();
    }
    return;
  }
  const res=await fetch(`${API}/api/questions`,{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({question:text,category:category||'כללי',deadline:deadline||null,option_yes:optYes||'כן',option_no:optNo||'לא',department:dept||''})});
  if(res.ok){
    document.getElementById('new-question-text').value='';
    document.getElementById('new-question-category').value='';
    document.getElementById('new-question-deadline').value='';
    document.getElementById('new-option-yes').value='';
    document.getElementById('new-option-no').value='';
    document.getElementById('new-question-dept').value='';
    showToast('שאלה חדשה בשוק! 🔥','success'); loadAdminQuestions();
  } else { const d=await res.json(); showToast(d.error||'שגיאה','error'); }
}

async function resolveQuestion(id,result) {
  const res=await fetch(`${API}/api/questions/${id}/resolve`,{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({result})});
  if(res.ok){showToast(`שאלה נסגרה — ${result==='YES'?'כן':'לא'} ניצח`,'success');loadAdminQuestions();}
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
    }
  }, 8000);
}

function animateBalance(newBalance, diff) {
  const el = document.getElementById('nav-balance');
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

// ===== UTILS =====
function authHeaders(){ return {Authorization:`Bearer ${localStorage.getItem('token')}`}; }
function formatNum(n){ return Number(n).toLocaleString('he-IL'); }
function showToast(msg,type='success'){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className=`toast ${type} show`;
  setTimeout(()=>{t.className='toast';},3000);
}

// ===== ADMIN TABS =====
function switchAdminTab(tab, btn) {
  document.querySelectorAll('.admin-inner-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('admin-tab-questions').style.display   = tab==='questions'   ? 'block' : 'none';
  document.getElementById('admin-tab-users').style.display       = tab==='users'       ? 'block' : 'none';
  document.getElementById('admin-tab-suggestions').style.display = tab==='suggestions' ? 'block' : 'none';
  if (tab==='users')       loadAdminUsers();
  if (tab==='suggestions') loadAdminSuggestions();
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
  if (res.ok) { showToast('ביי ביי 👋','success'); loadAdminUsers(); }
  else { const d = await res.json(); showToast(d.error||'שגיאה','error'); }
}

// ===== COMPLAINTS =====
const FAKE_NAMES = [
  "סטודנט שנה ג' נשבר", "בוגר PTSD", "ישבתי בשורה הראשונה",
  "מי שהשאיל עט ולא החזיר", "הצל של המרצה", "סטודנט שבור ורוח",
  'ד"ר לא זוכר את שמי', "יצאתי מהקורס חזק יותר (שקר)",
  "בוגר טראומטי", "מי שמצלם את הלוח", "שרדתי את הסמסטר",
  "אנונימי אבל ברור מי זה", "הכסא האחורי", "מי שהגיע ב-8 בבוקר",
  "גאוס מקבר שלי", "המחשבון לא עזר", "הגשתי יומיים לפני",
  "קפה מהמכונה הרג אותי", "WiFi בן 404", "נכשלתי רק כי"
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
  const category   = document.getElementById('suggest-category').value.trim();
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
    showToast('ההצעה נשלחה למנהל 🚀', 'success');
  } else {
    const d = await res.json();
    errEl.textContent = d.error || 'שגיאה';
  }
}

// ===== ADMIN SUGGESTIONS =====
async function loadAdminSuggestions() {
  const res  = await fetch('/api/suggestions', { headers: authHeaders() });
  const data = await res.json();
  renderAdminSuggestions(data.suggestions || []);

  // Update badge
  const badge = document.getElementById('suggestions-badge');
  if (badge) {
    if (data.suggestions && data.suggestions.length > 0) {
      badge.textContent = data.suggestions.length;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }
}

function renderAdminSuggestions(suggestions) {
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
  if (res.ok) { showToast('סקר נוצר מההצעה 🎉', 'success'); loadAdminSuggestions(); loadAdminQuestions(); }
  else { const d = await res.json(); showToast(d.error||'שגיאה','error'); }
}

async function deleteSuggestion(id) {
  const res = await fetch('/api/suggestions/' + id, { method: 'DELETE', headers: authHeaders() });
  if (res.ok) { showToast('הצעה נדחתה', 'success'); loadAdminSuggestions(); }
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
    toast.innerHTML = 'הצבעת! <button onclick="showAuthOverlay()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:20px;padding:2px 10px;margin-right:8px;cursor:pointer;font-family:Rubik,sans-serif;font-size:12px;">הרשם כדי להמר 🚀</button>';
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

// ===== TOGGLE PASSWORD =====
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

// ===== PROFILE MODAL =====
function openProfileModal() {
  if (!currentUser) return;
  document.getElementById('profile-username-title').textContent = currentUser.username;
  document.getElementById('profile-display').value = currentUser.display_name;
  document.getElementById('profile-password').value = '';
  document.getElementById('profile-error').textContent = '';
  document.getElementById('profile-modal').classList.add('open');
}

function closeProfileModal(e) {
  if (e && e.target !== document.getElementById('profile-modal')) return;
  document.getElementById('profile-modal').classList.remove('open');
}

async function saveProfile() {
  const display_name = document.getElementById('profile-display').value.trim();
  const password     = document.getElementById('profile-password').value;
  const errEl        = document.getElementById('profile-error');
  errEl.textContent  = '';

  if (!display_name) { errEl.textContent = 'שם תצוגה לא יכול להיות ריק'; return; }

  const body = { display_name };
  if (password) {
    if (password.length < 4) { errEl.textContent = 'סיסמה חייבת להיות לפחות 4 תווים'; return; }
    body.password = password;
  }

  const res = await fetch('/api/me/update', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    const data = await res.json();
    currentUser.display_name = data.display_name;
    document.getElementById('nav-username').textContent = data.display_name;
    document.getElementById('profile-modal').classList.remove('open');
    showToast('פרופיל עודכן 👌', 'success');
  } else {
    const d = await res.json();
    errEl.textContent = d.error || 'שגיאה';
  }
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

  const res = await fetch('/api/me/update', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: displayName, password: password || null })
  });

  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'שגיאה'; return; }

  currentUser.display_name = displayName;
  document.getElementById('nav-username').textContent = displayName;
  document.getElementById('profile-modal').classList.remove('open');
  showToast('הפרופיל עודכן ✓', 'success');
}
