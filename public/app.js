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
  btn.title = isDark ? 'עבור למצב בהיר' : 'עבור למצב כהה';
  btn.parentElement.classList.toggle('dark-active', isDark);
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateToggleBtn);

// ===== INIT =====
window.onload = () => {
  initTheme();
  const token = localStorage.getItem('token');
  if (token) tryAutoLogin();
};

async function tryAutoLogin() {
  const res = await fetch(`${API}/api/me`, { headers: authHeaders() });
  if (res.ok) { const d = await res.json(); loginSuccess(d); }
  else localStorage.removeItem('token');
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
  const username    = document.getElementById('reg-username').value.trim();
  const displayName = document.getElementById('reg-display').value.trim();
  const password    = document.getElementById('reg-password').value;
  if (!username||!displayName||!password) return showAuthError('נא למלא את כל השדות');
  const res = await fetch(`${API}/api/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,display_name:displayName,password})});
  const data = await res.json();
  if (!res.ok) return showAuthError(data.error||'שגיאה בהרשמה');
  localStorage.setItem('token',data.token);
  loginSuccess(data.user);
}

function loginSuccess(user) {
  currentUser = user;
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('nav-username').textContent = user.display_name;
  document.getElementById('nav-balance').textContent  = formatNum(user.balance);
  if (user.is_admin) {
    document.getElementById('admin-tab').style.display = '';
    document.getElementById('mobile-admin-tab').style.display = '';
  }
  loadMarkets();
}

function logout() {
  localStorage.removeItem('token');
  currentUser = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-overlay').style.display = 'flex';
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
    return `
    <div class="market-card ${q.resolved?'resolved':''}" data-cat="${q.category||'כללי'}" ${!q.resolved?`onclick="openBetModal(${q.id})"`:''}>
      <div class="card-category">${q.category||'כללי'}</div>
      <div class="card-question">${q.question}</div>
      ${dlHtml}
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
          ?`<div class="resolved-badge ${q.result}">${q.result==='YES'?'✓ כן':'✗ לא'} — נסגר</div>`
          :`<div class="bet-buttons">
              <button class="bet-btn yes" onclick="event.stopPropagation();openBetModal(${q.id},'YES')">${q.option_yes||'כן'}</button>
              <button class="bet-btn no"  onclick="event.stopPropagation();openBetModal(${q.id},'NO')">${q.option_no||'לא'}</button>
            </div>`
        }
      </div>
    </div>`;
  }).join('');
}

// ===== BET MODAL =====
async function openBetModal(questionId,choice='YES') {
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
  if(!bets.length){list.innerHTML=`<div class="empty-state"><span class="emoji">📭</span>עדיין לא הנחת הימורים</div>`;return;}
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
  const res=await fetch(`${API}/api/leaderboard`,{headers:authHeaders()});
  const data=await res.json();
  renderLeaderboard(data.users||[]);
}

function renderLeaderboard(users) {
  const list=document.getElementById('leaderboard-list');
  const medals=['🥇','🥈','🥉'],tops=['top1','top2','top3'];
  list.innerHTML=users.map((u,i)=>`
    <div class="lb-item ${tops[i]||''}">
      <div class="lb-rank">${medals[i]||(i+1)}</div>
      <div class="lb-name">${u.display_name}${u.id===currentUser.id?'<span class="lb-you">(אתה)</span>':''}</div>
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
      <div class="admin-q-meta">נפח: ${formatNum(total)} נק"ז${dl?` · סגירה: ${dl}`:''}  · ${q.resolved?`נסגר — ${q.result}`:'פעיל'}</div>
      <div class="admin-q-actions">
        ${!q.resolved?`
          <button class="admin-q-btn resolve-yes" onclick="resolveQuestion(${q.id},'YES')">${q.option_yes||'כן'} ניצחה</button>
          <button class="admin-q-btn resolve-no"  onclick="resolveQuestion(${q.id},'NO')">${q.option_no||'לא'} ניצחה</button>`:''}
        <button class="admin-q-btn delete" onclick="deleteQuestion(${q.id})">מחק</button>
      </div>
    </div>`;
  }).join('');
}

async function createQuestion() {
  const text=document.getElementById('new-question-text').value.trim();
  const category=document.getElementById('new-question-category').value.trim();
  const deadline=document.getElementById('new-question-deadline').value;
  const optYes=document.getElementById('new-option-yes').value.trim();
  const optNo =document.getElementById('new-option-no').value.trim();
  if(!text) return showToast('כתוב שאלה קודם','error');
  const res=await fetch(`${API}/api/questions`,{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({question:text,category:category||'כללי',deadline:deadline||null,option_yes:optYes||'כן',option_no:optNo||'לא'})});
  if(res.ok){
    document.getElementById('new-question-text').value='';
    document.getElementById('new-question-category').value='';
    document.getElementById('new-question-deadline').value='';
    document.getElementById('new-option-yes').value='';
    document.getElementById('new-option-no').value='';
    showToast('שאלה נוצרה בהצלחה','success'); loadAdminQuestions();
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
  document.getElementById('admin-tab-questions').style.display = tab==='questions' ? 'block' : 'none';
  document.getElementById('admin-tab-users').style.display     = tab==='users'     ? 'block' : 'none';
  if (tab==='users') loadAdminUsers();
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
  if (res.ok) { showToast('משתמש נמחק', 'success'); loadAdminUsers(); }
  else { const d = await res.json(); showToast(d.error||'שגיאה','error'); }
}

// ===== COMPLAINTS =====
const FAKE_NAMES = [
  'סטודנט שנה ג' נשבר', 'בוגר PTSD', 'ישבתי בשורה הראשונה',
  'מי שהשאיל עט ולא החזיר', 'הצל של המרצה', 'סטודנט שבור ורוח',
  'ד"ר לא זוכר את שמי', 'יצאתי מהקורס חזק יותר (שקר)',
  'בוגר טראומטי', 'מי שמצלם את הלוח', 'שרדתי את הסמסטר',
  'אנונימי אבל ברור מי זה', 'הכסא האחורי', 'מי שהגיע ב-8 בבוקר',
  'גאוס מקבר שלי', 'המחשבון לא עזר', 'הגשתי יומיים לפני',
  'קפה מהמכונה הרג אותי', 'WiFi בן 404', 'נכשלתי רק כי'
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
        <div class="complaint-stars ${lowClass}">${stars} ${c.rating}/10</div>
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

  const res = await fetch('/api/complaints', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text, rating: selectedStars, author_name: authorName })
  });

  if (res.ok) {
    document.getElementById('complaint-text').value = '';
    selectedStars = 0;
    highlightStars(0);
    document.getElementById('star-count').textContent = '0 / 10';
    showToast('התלונה נשמעה (אולי) 📮', 'success');
    loadComplaints();
  } else {
    const d = await res.json();
    errEl.textContent = d.error || 'שגיאה';
  }
}
