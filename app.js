// 🔥 TWOJA KONFIGURACJA FIREBASE 🔥
const firebaseConfig = {
  apiKey: "AIzaSyCkdha2N09Rj_mY1ybjLrgE87NF8-LNyZA",
  authDomain: "crewx-17f23.firebaseapp.com",
  projectId: "crewx-17f23",
  storageBucket: "crewx-17f23.firebasestorage.app",
  messagingSenderId: "938144343104",
  appId: "1:938144343104:web:cbe52e46ea333509d06ba5"
};

// INICJALIZACJA FIREBASE
firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const auth = firebase.auth();

// ═══ ADMIN ════════════════════════════════════════════════════════
const ADMIN_EMAIL = 'rafal.pietrzak.pl@gmail.com';
let currentUser   = null;
let syncDoc       = null;
let unsubscribeSnapshot = null;

// ═══ STATE ════════════════════════════════════════════════════════
let events        = [];
let rates         = [];
let rhGrid        = {};
let trainingRates = JSON.parse(localStorage.getItem('crewxTrainingRates') || '[]');
let rhMeta   = {};
let certs    = [];
let expenses = [];

let currentYear    = new Date().getFullYear();
let currentMonth   = new Date().getMonth();
let selectedDate   = null;
let editingCertIdx = null;
let cloudLoaded    = false;

// ═══ AUTH STATE OBSERVER ══════════════════════════════════════════
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    showApp();
  } else {
    currentUser = null;
    showLogin();
  }
});

// ─── Show login screen ────────────────────────────────────────────
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-root').style.display = 'none';
  if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
}

// ─── Show app after login ─────────────────────────────────────────
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-root').style.display = 'block';

  // Per-user Firestore document
  syncDoc = db.collection('users').doc(currentUser.uid).collection('appData').doc('crewx');

  // Show/hide admin menu
  const adminBtn = document.getElementById('nav-admin');
  if (adminBtn) adminBtn.style.display = currentUser.email === ADMIN_EMAIL ? 'flex' : 'none';

  // Update status bar
  const statusDot  = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  if (statusText) statusText.textContent = currentUser.email.split('@')[0];

  // Load data
  initCloudSync();
  renderRates();
  renderCalendar();
}

// ─── Login function ───────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  const btn   = document.getElementById('login-btn');

  if (!email || !pass) { errEl.textContent = 'Enter email and password.'; return; }

  btn.textContent = 'Signing in...';
  btn.disabled = true;
  errEl.textContent = '';

  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (err) {
    btn.textContent = 'Sign In';
    btn.disabled = false;
    switch (err.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        errEl.textContent = 'Invalid email or password.'; break;
      case 'auth/too-many-requests':
        errEl.textContent = 'Too many attempts. Try again later.'; break;
      default:
        errEl.textContent = err.message;
    }
  }
}

// ─── Logout ───────────────────────────────────────────────────────
function doLogout() {
  if (!confirm('Sign out?')) return;
  events = []; rates = []; rhGrid = {}; rhMeta = {}; certs = []; expenses = [];
  localStorage.clear();
  auth.signOut();
}

// Allow Enter key on login form
document.addEventListener('DOMContentLoaded', () => {
  const passEl = document.getElementById('login-pass');
  if (passEl) passEl.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  const emailEl = document.getElementById('login-email');
  if (emailEl) emailEl.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});

// ═══ CLOUD SYNC — per user ════════════════════════════════════════
function initCloudSync() {
  if (unsubscribeSnapshot) unsubscribeSnapshot();

  syncDoc.get().then(doc => {
    if (!doc.exists) {
      console.log("New user — clean install");
    }
  }).catch(err => console.error("Cloud check error:", err));

  unsubscribeSnapshot = syncDoc.onSnapshot(doc => {
    if (!doc.exists) return;
    const data = doc.data();
    events       = data.events       || [];
    rates        = data.rates        || [];
    rhGrid       = data.rhGrid       || {};
    rhMeta       = data.rhMeta       || {};
    certs        = data.certs        || [];
    expenses     = data.expenses     || [];
    trainingRates = data.trainingRates || [];
    cloudLoaded  = true;

    localStorage.setItem('crewxEvents',   JSON.stringify(events));
    localStorage.setItem('crewxRates',    JSON.stringify(rates));
    localStorage.setItem('crewxRHGrid',   JSON.stringify(rhGrid));
    localStorage.setItem('crewxRHMeta',   JSON.stringify(rhMeta));
    localStorage.setItem('crewxCerts',    JSON.stringify(certs));
    localStorage.setItem('crewxExpenses', JSON.stringify(expenses));

    renderRates();
    renderCalendar();
    updateStats();
    if (document.getElementById('page-certificates')?.classList.contains('active')) renderCerts();
    if (document.getElementById('page-expenses')?.classList.contains('active')) renderExpenses();
  }, err => {
    console.error("Cloud listener error:", err);
    renderRates(); renderCalendar(); updateStats();
  });
}

function saveToCloud() {
  if (!syncDoc) return;
  syncDoc.set({ events, rates, rhGrid, rhMeta, certs, expenses }, { merge: true })
    .catch(err => console.error("Save error:", err));
}

function saveEvents()   { localStorage.setItem('crewxEvents',   JSON.stringify(events));   saveToCloud(); }
function saveRates()    { localStorage.setItem('crewxRates',    JSON.stringify(rates));    saveToCloud(); }
function saveRHGrid()   { localStorage.setItem('crewxRHGrid',   JSON.stringify(rhGrid));   saveToCloud(); }
function saveRHMeta()   { localStorage.setItem('crewxRHMeta',   JSON.stringify(rhMeta));   saveToCloud(); }
function saveCerts()    { localStorage.setItem('crewxCerts',    JSON.stringify(certs));    saveToCloud(); }
function saveExpenses() { localStorage.setItem('crewxExpenses', JSON.stringify(expenses)); saveToCloud(); }

// ═══ ADMIN — user management ══════════════════════════════════════
const ADMIN_FUNCTION_URL = "https://us-central1-crewx-17f23.cloudfunctions.net/adminManageUsers";

async function adminCreateUser() {
  const email = document.getElementById('admin-new-email').value.trim();
  const pass  = document.getElementById('admin-new-pass').value.trim();
  const msgEl = document.getElementById('admin-create-msg');

  if (!email || !pass) { msgEl.style.color='var(--red)'; msgEl.textContent='Email and password required.'; return; }
  if (pass.length < 6) { msgEl.style.color='var(--red)'; msgEl.textContent='Password must be at least 6 characters.'; return; }

  msgEl.style.color = 'var(--gold)'; msgEl.textContent = 'Creating user...';

  try {
    const token = await currentUser.getIdToken();
    const resp  = await fetch(ADMIN_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ action: 'create', email, password: pass })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    msgEl.style.color = 'var(--green)';
    msgEl.textContent = `✅ User ${email} created!`;
    document.getElementById('admin-new-email').value = '';
    document.getElementById('admin-new-pass').value  = '';
    renderAdminPanel();
  } catch (err) {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = '❌ ' + err.message;
  }
}

async function adminDeleteUser(uid, email) {
  if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
  try {
    const token = await currentUser.getIdToken();
    await fetch(ADMIN_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ action: 'delete', uid })
    });
    renderAdminPanel();
  } catch (err) { alert('Error: ' + err.message); }
}

async function adminDisableUser(uid) {
  try {
    const token = await currentUser.getIdToken();
    await fetch(ADMIN_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ action: 'disable', uid })
    });
    renderAdminPanel();
  } catch (err) { alert('Error: ' + err.message); }
}

async function adminEnableUser(uid) {
  try {
    const token = await currentUser.getIdToken();
    await fetch(ADMIN_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ action: 'enable', uid })
    });
    renderAdminPanel();
  } catch (err) { alert('Error: ' + err.message); }
}


const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function dateStr(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function getEventsForDate(ds) { return events.filter(e => e.date === ds); }

// ═══ PAIRS ════════════════════════════════════════════════════════
function getPairs(inType, outType) {
  const ins  = events.filter(e => e.type === inType).map(e => e.date).sort();
  const outs = events.filter(e => e.type === outType).map(e => e.date).sort();
  const pairs = [], usedOuts = new Set();
  for (const start of ins) {
    const end = outs.find(o => o >= start && !usedOuts.has(o)) || null;
    if (end) usedOuts.add(end);
    pairs.push({ start, end });
  }
  return pairs;
}
function getTrips()            { return getPairs('depart',         'arrive');        }
function getBrazilStays()      { return getPairs('brazil-in',      'brazil-out');    }
function getOnboardStays()     { return getPairs('sign-on',        'sign-off');      }
function getTrainingPeriods()  { return getPairs('training-start', 'training-end'); }

// calendarOnly=true  -> only closed pairs highlighted on calendar
// calendarOnly=false -> open pairs extend to today (for stats)
function getRangeDates(pairs, calendarOnly) {
  const set = new Set();
  for (const p of pairs) {
    if (calendarOnly && !p.end) continue;
    const s = new Date(p.start + 'T00:00:00');
    const e = p.end ? new Date(p.end + 'T00:00:00') : new Date();
    for (let c = new Date(s); c <= e; c.setDate(c.getDate()+1))
      set.add(c.toISOString().slice(0,10));
  }
  return set;
}

function durDays(p) {
  if (!p.end) return null;
  return Math.round((new Date(p.end+'T00:00:00') - new Date(p.start+'T00:00:00')) / 86400000) + 1;
}

// ═══ RATE LOOKUP ═════════════════════════════════════════════════
function getRateForDate(ds) {
  const sorted = [...rates].sort((a,b) => a.from.localeCompare(b.from));
  for (const r of sorted) {
    if (ds >= r.from && (!r.to || ds <= r.to)) return r.amount;
  }
  return 0;
}

// ═══ PAYROLL CALCULATION ══════════════════════════════════════════
function getPayrollPeriods() {
  const awayDates = getRangeDates(getTrips());
  if (awayDates.size === 0 && rates.length === 0) return [];

  const allDates = [...events.map(e => e.date), ...rates.map(r => r.from)].sort();
  if (allDates.length === 0) return [];

  const earliest = new Date(allDates[0] + 'T00:00:00');
  const latest   = new Date();
  // Pokaż okresy do końca bieżącego roku (31 grudnia)
  latest.setMonth(11);  // Grudzień
  latest.setDate(31);

  const periods = [];
  let y = earliest.getFullYear();
  let m = earliest.getMonth(); 

  if (m === 0) { m = 11; y--; } else m--;

  const endY = latest.getFullYear();
  const endM = latest.getMonth();

  while (y < endY || (y === endY && m <= endM)) {
    const prevM = m === 0 ? 11 : m - 1;
    const prevY = m === 0 ? y - 1 : y;
    const periodStart = dateStr(prevY, prevM, 21); 
    const periodEnd   = dateStr(y, m, 20);         

    let days = 0;
    let earnings = 0;
    const s = new Date(periodStart + 'T00:00:00');
    const e = new Date(periodEnd   + 'T00:00:00');
    for (let c = new Date(s); c <= e; c.setDate(c.getDate()+1)) {
      const ds = c.toISOString().slice(0,10);
      if (awayDates.has(ds)) {
        days++;
        earnings += getRateForDate(ds);
      }
    }

    periods.push({
      label: `${MONTHS_S[prevM]} 21 – ${MONTHS_S[m]} 20, ${y}`,
      periodEnd,
      periodStart,
      days,
      earnings
    });

    m++;
    if (m > 11) { m = 0; y++; }
  }

  const today = new Date().toISOString().slice(0,10);
  // Pokaż okresy które mają dni LUB są w przyszłości (do końca roku)
  return periods.filter(p => p.days > 0 || p.periodEnd >= today);
}

// ═══ RENDER RATES LIST ════════════════════════════════════════════
function renderRates() {
  const el = document.getElementById('rates-list');
  if (rates.length === 0) { el.innerHTML = '<div style="font-size:12px;color:var(--gray400);text-align:center;padding:8px 0">No rates added yet</div>'; return; }
  const sorted = [...rates].sort((a,b) => a.from.localeCompare(b.from));
  el.innerHTML = sorted.map((r, i) => `
    <div class="rate-item">
      <div>
        <div class="rate-amount">$${Number(r.amount).toLocaleString()}<span style="font-size:10px;color:var(--gray400);font-weight:400;font-family:'Space Grotesk',sans-serif"> /day</span></div>
        <div class="rate-period">${fmtDate(r.from)} → ${fmtDate(r.to)}</div>
      </div>
      <button class="rate-delete" onclick="deleteRate(${i})" title="Remove">✕</button>
    </div>
  `).join('');
}

function fmtDate(ds) {
  if (!ds) return 'ongoing';
  const [y,m,d] = ds.split('-');
  return `${d}/${m}/${y}`;
}

function parseDMY(str) {
  if (!str || !str.trim()) return null;
  const parts = str.trim().split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return null;
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

function addRate() {
  const amount = parseFloat(document.getElementById('rate-amount').value);
  const fromRaw = document.getElementById('rate-from').value;
  const toRaw   = document.getElementById('rate-to').value;
  const from = parseDMY(fromRaw);
  const to   = parseDMY(toRaw);
  if (!amount || !from) { alert('Enter amount and a valid "from" date (dd/mm/yyyy).'); return; }
  if (toRaw.trim() && !to) { alert('"To" date is not valid. Use dd/mm/yyyy or leave blank.'); return; }
  rates.push({ amount, from, to });
  rates.sort((a,b) => a.from.localeCompare(b.from));
  saveRates();
  document.getElementById('rate-amount').value = '';
  document.getElementById('rate-from').value   = '';
  document.getElementById('rate-to').value     = '';
  renderRates();
  renderPayroll();
  renderCalendar();
}

function deleteRate(i) {
  rates.splice(i, 1);
  saveRates();
  renderRates();
  renderPayroll();
  renderCalendar();
}

function renderPayroll() {
  const body = document.getElementById('payroll-body');
  if (rates.length === 0) {
    body.innerHTML = '<div class="empty-state">Add a day rate above to see payroll calculations</div>';
    return;
  }

  const allDates = rates.map(r => r.from).sort();
  if (allDates.length === 0) {
    body.innerHTML = '<div class="empty-state">Log trip events to calculate earnings</div>';
    return;
  }

  const today      = new Date();
  const todayStr   = today.toISOString().slice(0,10);
  const endOfYear  = new Date(today.getFullYear(), 11, 31);
  const awayDates  = getRangeDates(getTrips());

  // Build set of ALL training dates so we can exclude them from Days Away
  const allTrainingDates = getRangeDates(getTrainingPeriods());
  const earliest   = new Date(allDates[0] + 'T00:00:00');

  let y = earliest.getFullYear();
  let m = earliest.getMonth();
  if (m === 0) { m = 11; y--; } else m--;

  const endY = endOfYear.getFullYear();
  const endM = endOfYear.getMonth();

  const periods = [];
  while (y < endY || (y === endY && m <= endM)) {
    const prevM = m === 0 ? 11 : m - 1;
    const prevY = m === 0 ? y - 1 : y;
    const periodStart = dateStr(prevY, prevM, 21);
    const periodEnd   = dateStr(y, m, 20);

    let days = 0, earnings = 0;
    const s = new Date(periodStart + 'T00:00:00');
    const e = new Date(periodEnd   + 'T00:00:00');
    for (let c = new Date(s); c <= e; c.setDate(c.getDate()+1)) {
      const ds = c.toISOString().slice(0,10);
      // Exclude training days from Days Away to avoid double counting
      if (awayDates.has(ds) && !allTrainingDates.has(ds)) {
        days++; earnings += getRateForDate(ds);
      }
    }

    periods.push({ label: `${MONTHS_S[prevM]} 21 – ${MONTHS_S[m]} 20, ${y}`, periodEnd, periodStart, days, earnings });
    m++; if (m > 11) { m = 0; y++; }
  }

  const visible = periods.filter(p => p.days > 0 || p.periodEnd >= todayStr);
  if (visible.length === 0) {
    body.innerHTML = '<div class="empty-state">Log trip events to calculate earnings</div>';
    return;
  }

  const fmt = ds => { if (!ds) return '—'; const [y,m,d] = ds.split('-'); return `${d}/${m}`; };
  const usd = (v, dec=0) => '$' + parseFloat(v||0).toLocaleString(undefined,{minimumFractionDigits:dec,maximumFractionDigits:dec});

  let grandTotal = 0;

  const cards = visible.map(p => {
    const isCurrent = todayStr >= p.periodStart && todayStr <= p.periodEnd;

    // Expenses
    const periodExps     = (expenses || []).filter(e => e.payrollPeriod === p.periodEnd);
    const expTotal       = periodExps.reduce((s, e) => s + (parseFloat(e.usd) || 0), 0);

    // Training
    const periodTraining = (trainingRates || []).filter(t => t.end >= p.periodStart && t.end <= p.periodEnd);
    const trainingTotal  = periodTraining.reduce((s, t) => s + ((t.rate||0) * (t.days||0)), 0);
    const trainingDaysCount = periodTraining.reduce((s, t) => s + (t.days||0), 0);

    const total = p.earnings + expTotal + trainingTotal;
    grandTotal += total;

    // Expense rows
    const expRows = periodExps.map(e => `
      <div class="pc-line">
        <span class="pc-line-label">↳ ${e.desc}</span>
        <span class="pc-line-val">${usd(e.usd,2)}</span>
      </div>`).join('');

    // Training rows
    const trainRows = periodTraining.map(t => `
      <div class="pc-line">
        <span class="pc-line-label">↳ ${fmt(t.start)}→${fmt(t.end)} · ${t.days}d × ${usd(t.rate)}/d</span>
        <span class="pc-line-val">${usd((t.rate||0)*(t.days||0),0)}</span>
      </div>`).join('');

    return `
    <div class="pc-card ${isCurrent ? 'pc-current' : ''}">

      <!-- Period header -->
      <div class="pc-header">
        <div class="pc-period">${p.label}</div>
        ${isCurrent ? '<div class="pc-badge-current">current</div>' : ''}
      </div>

      <!-- Line items -->
      <div class="pc-body">

        <!-- Days Away -->
        <div class="pc-row ${p.days === 0 ? 'pc-row-zero' : ''}">
          <div class="pc-row-left">
            <span class="pc-row-icon">📅</span>
            <span class="pc-row-name">Days away</span>
            <span class="pc-row-sub">${p.days} days × rate</span>
          </div>
          <span class="pc-row-amount ${p.days > 0 ? 'pc-amount-main' : ''}">${usd(p.earnings)}</span>
        </div>

        <!-- Training -->
        ${trainingDaysCount > 0 ? `
        <div class="pc-row">
          <div class="pc-row-left">
            <span class="pc-row-icon">🎓</span>
            <span class="pc-row-name">Training</span>
            <span class="pc-row-sub">${trainingDaysCount} days</span>
          </div>
          <span class="pc-row-amount pc-amount-training">${usd(trainingTotal)}</span>
        </div>
        ${trainRows}` : ''}

        <!-- Expenses -->
        ${expTotal > 0 ? `
        <div class="pc-row">
          <div class="pc-row-left">
            <span class="pc-row-icon">🧾</span>
            <span class="pc-row-name">Expenses</span>
            <span class="pc-row-sub">${periodExps.length} item${periodExps.length !== 1 ? 's' : ''}</span>
          </div>
          <span class="pc-row-amount pc-amount-exp">${usd(expTotal,2)}</span>
        </div>
        ${expRows}` : ''}

      </div>

      <!-- Total -->
      <div class="pc-total">
        <span>Total payout</span>
        <span class="pc-total-amount">${usd(total)}</span>
      </div>

    </div>`;
  }).join('');

  body.innerHTML = `
    ${cards}
    <div class="pc-grand-total">
      <span>Grand total (all periods)</span>
      <span>${usd(grandTotal)}</span>
    </div>
    <div style="font-size:10px;color:var(--gray400);margin-top:8px;text-align:center">
      Cut-off: 20th each month &nbsp;·&nbsp; Blue border = current period
    </div>
  `;
}


// ═══ STATS ════════════════════════════════════════════════════════
function updateStats() {
  // ── Populate year dropdown ────────────────────────────────────────
  const sel = document.getElementById('stat-year-filter');
  if (sel) {
    // Collect all years from events
    const years = [...new Set(events.map(e => e.date?.slice(0,4)).filter(Boolean))].sort();
    const selectedVal = sel.value || 'all';
    sel.innerHTML = '<option value="all">All years</option>' +
      years.map(y => `<option value="${y}" ${y === selectedVal ? 'selected' : ''}>${y}</option>`).join('');
  }

  const filterYear = sel?.value || 'all';

  // ── Filter helper: keep only dates in selected year ────────────────
  function filterByYear(dateSet) {
    if (filterYear === 'all') return dateSet;
    const filtered = new Set();
    for (const ds of dateSet) {
      if (ds.startsWith(filterYear)) filtered.add(ds);
    }
    return filtered;
  }

  // ── Filter pairs by year ──────────────────────────────────────────
  function filterPairsByYear(pairs) {
    if (filterYear === 'all') return pairs;
    return pairs.filter(p => p.start.startsWith(filterYear) || (p.end && p.end.startsWith(filterYear)));
  }

  const trips           = getTrips();
  const brazilStays     = getBrazilStays();
  const onboardStays    = getOnboardStays();
  const trainingPeriods = getTrainingPeriods();

  const awayDates      = filterByYear(getRangeDates(trips));
  const brazilDates    = filterByYear(getRangeDates(brazilStays));
  const onboardDates   = filterByYear(getRangeDates(onboardStays));
  const trainingDates  = filterByYear(getRangeDates(trainingPeriods));

  const rotEvDates = new Set(events
    .filter(e => ['depart','arrive'].includes(e.type) && (filterYear === 'all' || e.date?.startsWith(filterYear)))
    .map(e => e.date));
  let travel = 0;
  for (const ds of awayDates) { if (rotEvDates.has(ds)) travel++; }

  const filteredTrips    = filterPairsByYear(trips);
  const filteredBrazil   = filterPairsByYear(brazilStays);
  const filteredOnboard  = filterPairsByYear(onboardStays);

  document.getElementById('stat-away').innerHTML     = `${awayDates.size} <span class="stat-unit">d</span>`;
  document.getElementById('stat-brazil').innerHTML   = `${brazilDates.size} <span class="stat-unit">d</span>`;
  document.getElementById('stat-onboard').innerHTML  = `${onboardDates.size} <span class="stat-unit">d</span>`;
  document.getElementById('stat-training').innerHTML = `${trainingDates.size} <span class="stat-unit">d</span>`;
  document.getElementById('stat-travel').innerHTML   = `${travel} <span class="stat-unit">d</span>`;
  const tripCount     = filteredTrips.filter(t=>t.end).length;
  const contractCount = filteredOnboard.filter(o=>o.end).length;
  document.getElementById('stat-trips').innerHTML    = `${tripCount} <span id="stat-contracts" style="font-size:13px;color:var(--gray400)">/ ${contractCount}</span>`;

  // status pill — always based on today regardless of filter
  const todayStr = new Date().toISOString().slice(0,10);
  const allAway    = getRangeDates(trips);
  const allBrazil  = getRangeDates(brazilStays);
  const allOnboard = getRangeDates(onboardStays);
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const inBrazil  = allBrazil.has(todayStr);
  const isOnboard = allOnboard.has(todayStr);
  if (text && text.textContent !== currentUser?.email?.split('@')[0]) {
    if (isOnboard) {
      dot.style.background = '#f97316'; text.textContent = '⚓ Onboard' + (inBrazil ? ' · 🇧🇷' : '');
    } else if (allAway.has(todayStr)) {
      dot.style.background = '#38bdf8'; text.textContent = 'Away' + (inBrazil ? ' · 🇧🇷 Brazil' : '');
    } else {
      dot.style.background = '#94a3b8'; text.textContent = 'At home';
    }
  }

  // lists — always show all (not filtered by year)
  const fmt = ds => { if (!ds) return '—'; const [y,m,d] = ds.split('-'); return `${d}/${m}`; };
  function renderList(listId, infoId, items, labelFn, badgeClass) {
    const info = document.getElementById(infoId);
    const list = document.getElementById(listId);
    if (!items.length) { info.style.display='none'; return; }
    info.style.display='block'; list.innerHTML='';
    items.forEach((item,i) => {
      const d = durDays(item);
      const row = document.createElement('div');
      row.className='info-row';
      row.innerHTML=`<span>${labelFn(item,i)}</span><span class="ibadge ${badgeClass}">${d ? d+'d' : 'ongoing'}</span>`;
      list.appendChild(row);
    });
  }
  renderList('trips-list',   'trips-info',   trips,           (t,i)=>`Trip ${i+1} &nbsp; ${fmt(t.start)} → ${t.end?fmt(t.end):'…'}`, 'ibadge-blue');
  renderList('brazil-list',  'brazil-info',  brazilStays,     (b,i)=>`Stay ${i+1} &nbsp; ${fmt(b.start)} → ${b.end?fmt(b.end):'…'}`, 'ibadge-green');
  renderList('onboard-list', 'onboard-info', onboardStays,    (o,i)=>`Contract ${i+1} &nbsp; ${fmt(o.start)} → ${o.end?fmt(o.end):'…'}`, 'ibadge-amber');

  // Training — custom render with rate display and edit button
  const trainingInfo = document.getElementById('training-info');
  const trainingList = document.getElementById('training-list');
  if (trainingPeriods.length === 0) {
    trainingInfo.style.display = 'none';
  } else {
    trainingInfo.style.display = 'block';
    trainingList.innerHTML = trainingPeriods.map((t, i) => {
      const rateEntry = (trainingRates || []).find(r => r.start === t.start && r.end === t.end);
      const rate      = rateEntry ? rateEntry.rate : null;
      const days      = durDays(t) || '?';
      const earned    = rate !== null ? `$${(rate * days).toLocaleString()}` : '—';
      return `<div class="info-row" style="align-items:center">
        <span>Training ${i+1} &nbsp; ${fmt(t.start)} → ${t.end ? fmt(t.end) : '…'}</span>
        <div style="display:flex;align-items:center;gap:6px;margin-left:auto">
          <span style="font-size:11px;color:var(--gray400)">
            ${rate !== null ? `$${rate}/d · ${days}d · <strong style="color:#a78bfa">${earned}</strong>` : '<span style="color:var(--amber)">⚠️ no rate set</span>'}
          </span>
          <span class="ibadge ibadge-purple" style="cursor:pointer" onclick="editTrainingRate('${t.start}','${t.end}')">✏️ rate</span>
        </div>
      </div>`;
    }).join('');
  }
}

// ═══ CALENDAR RENDER ══════════════════════════════════════════════
function renderCalendar() {
  document.getElementById('month-label').textContent = `${MONTHS[currentMonth]} ${currentYear}`;
  const cal = document.getElementById('calendar');
  cal.innerHTML = '';

  const firstDay    = new Date(currentYear, currentMonth, 1).getDay();
  const offset      = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today       = new Date();

  const trips           = getTrips();
  const onboardStays    = getOnboardStays();
  const trainingPeriods = getTrainingPeriods();
  const awayDates       = getRangeDates(trips, true);
  const brazilDates     = getRangeDates(getBrazilStays(), true);
  const onboardDates    = getRangeDates(onboardStays, true);
  const trainingDates   = getRangeDates(trainingPeriods, true);

  for (let i = 0; i < offset; i++) {
    const e = document.createElement('div'); e.className='day empty'; cal.appendChild(e);
  }

  const EV_LABEL = {
    depart:'left home', arrive:'arrived',
    'brazil-in':'🇧🇷 in', 'brazil-out':'✈️ out',
    'sign-on':'⚓ on', 'sign-off':'🔄 off',
    'training-start':'🎓 start', 'training-end':'✅ end'
  };
  const EV_CLASS = {
    depart:'ev-depart', arrive:'ev-arrive',
    'brazil-in':'ev-brazil-in','brazil-out':'ev-brazil-out',
    'sign-on':'ev-sign-on','sign-off':'ev-sign-off',
    'training-start':'ev-training','training-end':'ev-training'
  };

  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = dateStr(currentYear, currentMonth, d);
    const div = document.createElement('div');
    div.className = 'day';

    const isToday = today.getFullYear()===currentYear && today.getMonth()===currentMonth && today.getDate()===d;
    if (isToday)                div.classList.add('today');
    if (awayDates.has(ds))      div.classList.add('range-away');
    if (brazilDates.has(ds))    div.classList.add('range-brazil');
    if (onboardDates.has(ds))   div.classList.add('range-onboard');
    if (trainingDates.has(ds))  div.classList.add('range-training');
    if (d === 20)               div.classList.add('payroll-end');
    if (d === 21)               div.classList.add('payroll-start');

    let html = `<div class="day-num">${d}</div>`;
    if (d === 20) html += `<div class="payroll-marker">✂ PAY</div>`;

    getEventsForDate(ds).forEach(ev => {
      html += `<span class="event-marker ${EV_CLASS[ev.type]}">${EV_LABEL[ev.type]}</span><br>`;
    });

    const trip = trips.find(t => t.end === ds);
    if (trip && durDays(trip)) html += `<span class="badge-away">${durDays(trip)}d</span>`;

    const contract = onboardStays.find(o => o.end === ds);
    if (contract && durDays(contract)) html += `<span class="badge-onboard">⚓${durDays(contract)}d</span>`;

    const training = trainingPeriods.find(t => t.end === ds);
    if (training && durDays(training)) html += `<span class="badge-training">🎓${durDays(training)}d</span>`;

    div.innerHTML = html;
    div.addEventListener('click', () => openModal(ds));
    cal.appendChild(div);
  }

  updateStats();
  renderPayroll();
}

function changeMonth(dir) {
  currentMonth += dir;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  if (currentMonth < 0)  { currentMonth = 11; currentYear--; }
  renderCalendar();
}

// ═══ MODAL ════════════════════════════════════════════════════════
function openModal(ds) {
  selectedDate = ds;
  const [y,m,d] = ds.split('-');
  document.getElementById('modal-title').textContent = `${parseInt(d)} ${MONTHS[parseInt(m)-1]} ${y}`;
  const dayEvs = getEventsForDate(ds);
  const EV_LABEL = {
    depart:'left home', arrive:'arrived home',
    'brazil-in':'entered Brazil','brazil-out':'left Brazil',
    'sign-on':'sign on','sign-off':'sign off'
  };
  document.getElementById('modal-sub').textContent = dayEvs.length
    ? 'Logged: ' + dayEvs.map(e=>EV_LABEL[e.type]).join(', ')
    : 'Tap an event to log it for this day';

  const blue  = ['depart','arrive'];
  const green = ['brazil-in','brazil-out'];
  const amber = ['sign-on','sign-off'];
  [...blue,...green,...amber].forEach(t => {
    const btn = document.getElementById('btn-'+t);
    btn.classList.remove('active','active-green','active-amber');
    if (dayEvs.some(e=>e.type===t)) {
      if (blue.includes(t))  btn.classList.add('active');
      if (green.includes(t)) btn.classList.add('active-green');
      if (amber.includes(t)) btn.classList.add('active-amber');
    }
  });
  document.getElementById('btn-clear').style.display = dayEvs.length ? 'block' : 'none';
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  selectedDate = null;
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}

function logEvent(type) {
  if (!selectedDate) return;
  const idx = events.findIndex(e => e.date===selectedDate && e.type===type);
  if (idx >= 0) events.splice(idx,1);
  else {
    events.push({ date: selectedDate, type });
    events.sort((a,b) => a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
  }
  saveEvents(); closeModal(); renderCalendar();

  // When training ends — ask for daily rate
  if (type === 'training-end') {
    const trainingPeriods = getTrainingPeriods();
    const lastTraining = trainingPeriods[trainingPeriods.length - 1];
    if (lastTraining && lastTraining.end === selectedDate) {
      const days = durDays(lastTraining);
      const fmt = ds => { if (!ds) return '—'; const [y,m,d] = ds.split('-'); return `${d}/${m}`; };
      document.getElementById('training-rate-sub').textContent =
        `Training: ${fmt(lastTraining.start)} → ${fmt(lastTraining.end)} (${days} days). Enter the daily rate:`;
      document.getElementById('training-rate-input').value = '';
      document.getElementById('training-rate-modal').classList.add('open');
      // Store reference to current training period
      document.getElementById('training-rate-modal').dataset.start = lastTraining.start;
      document.getElementById('training-rate-modal').dataset.end   = lastTraining.end;
    }
  }
}

function clearDay() {
  if (!selectedDate) return;
  events = events.filter(e => e.date !== selectedDate);
  saveEvents(); closeModal(); renderCalendar();
}

function clearAllRates() {
  if (!confirm('Remove all rate periods?')) return;
  rates = [];
  saveRates();
  renderRates();
  renderPayroll();
}

// ═══ INIT ═════════════════════════════════════════════════════════
renderRates();
renderCalendar();
(function(){
  const now = new Date();
  const mEl = document.getElementById('rh-month');
  const yEl = document.getElementById('rh-year');
  if (mEl) mEl.value = now.getMonth();
  if (yEl) yEl.value = now.getFullYear();
})();

// ═══ SIDEBAR ══════════════════════════════════════════════════════
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  if (name === 'certificates') renderCerts();
  if (name === 'expenses')     renderExpenses();
  if (name === 'admin')        renderAdminPanel();
  closeSidebar();
}

// ═══ REST HOURS ═══════════════════════════════════════════════════
const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTHS_FULL = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function shiftToSlots(shift) {
  if (shift === '06-18') return [12, 36];
  if (shift === '18-06') return [[36, 48],[0, 12]]; 
  if (shift === '00-12') return [0, 24];
  if (shift === '12-24') return [24, 48];
  return null;
}

function rhMonthKey(y, m) { return y + '-' + String(m).padStart(2,'0'); }

function getSlots(y, m, day) {
  const k = rhMonthKey(y, m);
  if (!rhGrid[k]) rhGrid[k] = {};
  if (!rhGrid[k][day]) rhGrid[k][day] = new Array(48).fill(false); 
  return rhGrid[k][day];
}

function applyRHSetup() {
  const y     = parseInt(document.getElementById('rh-year').value);
  const m     = parseInt(document.getElementById('rh-month').value);
  const shift = document.getElementById('rh-shift').value;
  const signIn  = document.getElementById('rh-signin').value.trim();
  const signOff = document.getElementById('rh-signoff').value.trim();

  rhMeta.signIn  = signIn;
  rhMeta.signOff = signOff;
  document.getElementById('rh-signin-disp').value  = signIn;
  document.getElementById('rh-signoff-disp').value = signOff;
  saveRHMeta();

  if (shift && shift !== 'custom') {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const k = rhMonthKey(y, m);
    rhGrid[k] = {};

    let signInDay = 0, signOffDay = daysInMonth + 1;
    if (signIn) {
      const parts = signIn.split('/');
      if (parts.length >= 1) signInDay = parseInt(parts[0]) || 0;
    }
    if (signOff) {
      const parts = signOff.split('/');
      if (parts.length >= 1) signOffDay = parseInt(parts[0]) || daysInMonth + 1;
    }

    const ranges = shiftToSlots(shift);
    for (let d = 1; d <= daysInMonth; d++) {
      const slots = new Array(48).fill(false); 
      const active = d >= signInDay && d <= signOffDay;
      if (active && ranges !== null) {
        if (Array.isArray(ranges[0])) {
          for (let s = ranges[0][0]; s < ranges[0][1]; s++) slots[s] = true;
          for (let s = ranges[1][0]; s < ranges[1][1]; s++) slots[s] = true;
        } else {
          for (let s = ranges[0]; s < ranges[1]; s++) slots[s] = true;
        }
      }
      rhGrid[k][d] = slots;
    }
    saveRHGrid();
  }
  renderRH();
}

function toggleSlot(y, m, day, slotIdx) {
  const slots = getSlots(y, m, day);
  slots[slotIdx] = !slots[slotIdx];
  saveRHGrid();
  renderRH();
}

function renderRH() {
  const m = rhMeta;
  const fields = {
    'rh-vessel': m.vessel, 'rh-emp-name': m.empName,
    'rh-company': m.company, 'rh-rank': m.rank,
    'rh-flag': m.flag, 'rh-emp-num': m.empNum,
    'rh-captain': m.captain,
    'rh-signin-disp': m.signIn, 'rh-signoff-disp': m.signOff,
    'rh-comments': m.comments
  };
  for (const [id, val] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.value = val;
  }

  const y = parseInt(document.getElementById('rh-year')?.value || new Date().getFullYear());
  const mo = parseInt(document.getElementById('rh-month')?.value ?? new Date().getMonth());

  document.getElementById('rh-display-month').textContent = MONTHS_FULL[mo] + ' ' + y;
  const shiftEl = document.getElementById('rh-shift');
  document.getElementById('rh-display-shift').textContent = shiftEl?.options[shiftEl?.selectedIndex]?.text || '—';

  const headBot = document.getElementById('rh-head-bot');
  if (headBot) {
    headBot.innerHTML = Array.from({length:48},(_,i)=>`<th>${i%2===0?'00':'30'}</th>`).join('');
  }

  const tbody = document.getElementById('rh-tbody');
  if (!tbody) return;

  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const k = rhMonthKey(y, mo);
  let totalRestSlots = 0, totalWorkSlots = 0;

  let signInDay = 1, signOffDay = daysInMonth;
  if (rhMeta.signIn) {
    const p = rhMeta.signIn.split('/');
    if (p.length >= 1) signInDay = parseInt(p[0]) || 1;
  }
  if (rhMeta.signOff) {
    const p = rhMeta.signOff.split('/');
    if (p.length >= 1) signOffDay = parseInt(p[0]) || daysInMonth;
  }

  let rows = '';
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, mo, d);
    const wday = WEEKDAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];
    const slots = rhGrid[k]?.[d] || new Array(48).fill(false);
    const active = d >= signInDay && d <= signOffDay;

    let restSlots = 0, workSlots = 0;
    let slotCells = '';
    for (let s = 0; s < 48; s++) {
      const isWork = slots[s];
      if (active) {
        if (isWork) workSlots++; else restSlots++;
        const cls = isWork ? 'work' : 'rest';
        slotCells += `<td class="rh-slot ${cls}" onclick="toggleSlot(${y},${mo},${d},${s})" title="${Math.floor(s/2)}:${s%2===0?'00':'30'}"></td>`;
      } else {
        slotCells += `<td class="rh-slot inactive-slot"></td>`;
      }
    }

    if (active) { totalRestSlots += restSlots; totalWorkSlots += workSlots; }

    const restH = (restSlots * 0.5).toFixed(1);
    const workH = (workSlots * 0.5).toFixed(1);
    const minRest = 20; 
    let stCls = 'ok', stTxt = 'OK';
    if (active) {
      if (restSlots < minRest) { stCls = 'fail'; stTxt = 'VIOL'; }
      else if (restSlots < 22) { stCls = 'warn'; stTxt = 'LOW'; }
    }

    rows += `<tr class="${active ? '' : 'inactive'}">
      <td class="rh-cell-date">${d}</td>
      <td class="rh-cell-day">${wday}</td>
      ${slotCells}
      <td class="rh-cell-rest">${active ? restH : ''}</td>
      <td class="rh-cell-work">${active ? workH : ''}</td>
      <td class="rh-cell-status ${stCls}">${active ? stTxt : ''}</td>
    </tr>`;
  }
  tbody.innerHTML = rows;

  const totalRestH = (totalRestSlots * 0.5).toFixed(1);
  const totalWorkH = (totalWorkSlots * 0.5).toFixed(1);
  document.getElementById('rh-total-rest').textContent = totalRestH;
  document.getElementById('rh-total-work').textContent = totalWorkH;

  const badge = document.getElementById('rh-badge');
  if (badge) badge.style.display = (totalRestSlots < 154) ? 'inline' : 'none'; 
}

function bindRHMetaFields() {
  const map = {
    'rh-vessel':'vessel','rh-emp-name':'empName','rh-company':'company',
    'rh-rank':'rank','rh-flag':'flag','rh-emp-num':'empNum',
    'rh-captain':'captain','rh-signin-disp':'signIn',
    'rh-signoff-disp':'signOff','rh-comments':'comments'
  };
  for (const [id, key] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { rhMeta[key] = el.value; saveRHMeta(); });
  }
  const cap = document.getElementById('rh-captain');
  const emp = document.getElementById('rh-emp-name');
  if (cap) cap.addEventListener('input', () => {
    const sig = document.getElementById('rh-sig-captain');
    if (sig) sig.textContent = cap.value || '__________________________';
  });
  if (emp) emp.addEventListener('input', () => {
    const sig = document.getElementById('rh-sig-seafarer');
    if (sig) sig.textContent = emp.value || '__________________________';
  });
}

// ═══ CERTIFICATES ═════════════════════════════════════════════════

function certStatus(expiryStr) {
  if (!expiryStr) return { cls: 'ok', label: 'No expiry', days: null };
  const exp = new Date(expiryStr + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((exp - today) / 86400000);
  if (diff < 0)  return { cls: 'expired',  label: 'Expired',    days: diff };
  if (diff < 30) return { cls: 'expiring', label: 'Expires soon', days: diff };
  if (diff < 90) return { cls: 'expiring', label: `${diff}d left`, days: diff };
  return { cls: 'ok', label: `${diff}d left`, days: diff };
}

function renderCerts() {
  const grid = document.getElementById('cert-grid');
  if (!grid) return;

  let expCount = 0;
  let html = certs.map((c, i) => {
    const st = certStatus(c.expiry);
    if (st.cls !== 'ok') expCount++;
    const expDateFmt = c.expiry ? fmtDate(c.expiry) : '—';
    const daysHtml = st.days !== null
      ? `<span class="cert-days-left ${st.cls}">${st.days < 0 ? 'Expired ' + Math.abs(st.days) + 'd ago' : st.days + 'd left'}</span>`
      : '';
    return `<div class="cert-card ${st.cls}">
      <button class="cert-delete" onclick="deleteCert(${i})" title="Delete">✕</button>
      <div class="cert-name">${c.name}</div>
      <div class="cert-issuer">${c.issuer || ''}</div>
      ${c.number ? `<div class="cert-num">${c.number}</div>` : ''}
      <div class="cert-footer">
        <div>
          <div class="cert-exp-label">Expires</div>
          <div class="cert-exp-val ${st.cls}">${expDateFmt}</div>
        </div>
        ${daysHtml}
      </div>
    </div>`;
  }).join('');

  html += `<button class="cert-add-btn" onclick="openCertModal()">
    <span class="cert-add-icon">＋</span>
    Add certificate
  </button>`;

  grid.innerHTML = html;

  const badge = document.getElementById('cert-badge');
  if (badge) badge.style.display = expCount > 0 ? 'inline' : 'none';
  if (badge && expCount > 0) badge.textContent = expCount;
}

function openCertModal(idx) {
  editingCertIdx = idx !== undefined ? idx : null;
  const m = document.getElementById('cert-modal');
  
  // Ta nowa linijka chowa status z poprzedniego skanowania
  const statusEl = document.getElementById('scan-status');
  if (statusEl) statusEl.style.display = 'none';

  document.getElementById('cert-modal-title').textContent = editingCertIdx !== null ? 'Edit Certificate' : 'Add Certificate';
  if (editingCertIdx !== null) {
    const c = certs[editingCertIdx];
    document.getElementById('cert-name-in').value   = c.name   || '';
    document.getElementById('cert-issuer-in').value = c.issuer || '';
    document.getElementById('cert-number-in').value = c.number || '';
    document.getElementById('cert-issue-in').value  = c.issued ? fmtDate(c.issued)  : '';
    document.getElementById('cert-expiry-in').value = c.expiry ? fmtDate(c.expiry) : '';
  } else {
    ['cert-name-in','cert-issuer-in','cert-number-in','cert-issue-in','cert-expiry-in'].forEach(id => {
      document.getElementById(id).value = '';
    });
  }
  m.classList.add('open');
}

function closeCertModal() {
  document.getElementById('cert-modal').classList.remove('open');
  editingCertIdx = null;
}

function handleCertOverlay(e) {
  if (e.target === document.getElementById('cert-modal')) closeCertModal();
}

function saveCert() {
  const name   = document.getElementById('cert-name-in').value.trim();
  const issuer = document.getElementById('cert-issuer-in').value.trim();
  const number = document.getElementById('cert-number-in').value.trim();
  const issued = parseDMY(document.getElementById('cert-issue-in').value);
  const expiry = parseDMY(document.getElementById('cert-expiry-in').value);
  if (!name) { alert('Certificate name is required.'); return; }
  const cert = { name, issuer, number, issued, expiry };
  if (editingCertIdx !== null) certs[editingCertIdx] = cert;
  else certs.push(cert);
  
  certs.sort((a,b) => {
    if (!a.expiry) return 1; if (!b.expiry) return -1;
    return a.expiry.localeCompare(b.expiry);
  });
  saveCerts();
  closeCertModal();
  renderCerts();
}

function deleteCert(i) {
  if (!confirm('Delete this certificate?')) return;
  certs.splice(i, 1);
  saveCerts();
  renderCerts();
}
// ═══ TRAVEL EXPENSES ══════════════════════════════════════════════

function getPayrollMonthOptions() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const options = [];

  // Build ALL periods for current year: Dec(prev) 21 → Jan 20 through Dec 21 → Jan(next) 20
  // That means months Dec(prev year) through Dec(current year)
  const periods = [
    { fromM: 11, fromY: currentYear - 1, toM: 0,  toY: currentYear },  // Dec 21 → Jan 20
    { fromM: 0,  fromY: currentYear,     toM: 1,  toY: currentYear },  // Jan 21 → Feb 20
    { fromM: 1,  fromY: currentYear,     toM: 2,  toY: currentYear },  // Feb 21 → Mar 20
    { fromM: 2,  fromY: currentYear,     toM: 3,  toY: currentYear },  // Mar 21 → Apr 20
    { fromM: 3,  fromY: currentYear,     toM: 4,  toY: currentYear },  // Apr 21 → May 20
    { fromM: 4,  fromY: currentYear,     toM: 5,  toY: currentYear },  // May 21 → Jun 20
    { fromM: 5,  fromY: currentYear,     toM: 6,  toY: currentYear },  // Jun 21 → Jul 20
    { fromM: 6,  fromY: currentYear,     toM: 7,  toY: currentYear },  // Jul 21 → Aug 20
    { fromM: 7,  fromY: currentYear,     toM: 8,  toY: currentYear },  // Aug 21 → Sep 20
    { fromM: 8,  fromY: currentYear,     toM: 9,  toY: currentYear },  // Sep 21 → Oct 20
    { fromM: 9,  fromY: currentYear,     toM: 10, toY: currentYear },  // Oct 21 → Nov 20
    { fromM: 10, fromY: currentYear,     toM: 11, toY: currentYear },  // Nov 21 → Dec 20
    { fromM: 11, fromY: currentYear,     toM: 0,  toY: currentYear+1 } // Dec 21 → Jan 20 (next)
  ];

  periods.forEach(p => {
    const periodEnd = dateStr(p.toY, p.toM, 20);
    options.push({
      label: `${MONTHS_S[p.fromM]} 21 – ${MONTHS_S[p.toM]} 20, ${p.toY}`,
      value: periodEnd
    });
  });

  return options;
}

function renderExpenses() {
  const wrap = document.getElementById('exp-list-wrap');
  if (!wrap) return;

  if (expenses.length === 0) {
    wrap.innerHTML = '<div class="exp-empty">No expenses yet — upload a Word document above to get started</div>';
    return;
  }

  // Group by payroll period
  const grouped = {};
  expenses.forEach((e, i) => {
    const key = e.payrollPeriod || 'unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ ...e, _idx: i });
  });

  const opts = getPayrollMonthOptions();
  const labelFor = val => {
    const found = opts.find(o => o.value === val);
    return found ? found.label : val;
  };

  wrap.innerHTML = Object.entries(grouped).map(([period, items]) => {
    const periodTotal = items.reduce((s, e) => s + (parseFloat(e.usd) || 0), 0);
    return `
      <div class="exp-group">
        <div class="exp-group-title">
          📅 ${labelFor(period)}
          <span style="float:right;color:var(--green)">Total: $${periodTotal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
        </div>
        ${items.map(e => `
          <div class="exp-card">
            <div class="exp-card-left">
              <div class="exp-card-desc">${e.desc}</div>
              <div class="exp-card-meta">
                ${e.origAmount} ${e.currency} → <strong style="color:var(--green)">$${parseFloat(e.usd).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} USD</strong>
                ${e.notes ? ` · ${e.notes}` : ''}
              </div>
            </div>
            <div class="exp-card-actions">
              <button class="exp-btn-edit" onclick="openExpModal(${e._idx})">✏️ Edit</button>
              <button class="exp-btn-del"  onclick="deleteExpense(${e._idx})">✕</button>
            </div>
          </div>`).join('')}
      </div>`;
  }).join('');
}

function openExpModal(idx) {
  const opts = getPayrollMonthOptions();
  const sel  = document.getElementById('exp-month-in');
  sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');

  document.getElementById('exp-editing-idx').value = idx !== undefined ? idx : '';

  if (idx !== undefined && expenses[idx]) {
    const e = expenses[idx];
    document.getElementById('exp-desc-in').value     = e.desc     || '';
    document.getElementById('exp-orig-in').value     = e.origAmount || '';
    document.getElementById('exp-currency-in').value = e.currency  || 'USD';
    document.getElementById('exp-usd-in').value      = e.usd       || '';
    document.getElementById('exp-notes-in').value    = e.notes     || '';
    document.getElementById('exp-month-in').value    = e.payrollPeriod || opts[0]?.value;
  } else {
    document.getElementById('exp-desc-in').value     = '';
    document.getElementById('exp-orig-in').value     = '';
    document.getElementById('exp-currency-in').value = 'USD';
    document.getElementById('exp-usd-in').value      = '';
    document.getElementById('exp-notes-in').value    = '';
    // Default to current payroll period
    const todayStr = new Date().toISOString().slice(0,10);
    const currentPeriod = opts.find(o => o.value >= todayStr) || opts[0];
    document.getElementById('exp-month-in').value = currentPeriod?.value || opts[0]?.value;
  }
  document.getElementById('exp-modal').classList.add('open');
}

function closeExpModal() {
  document.getElementById('exp-modal').classList.remove('open');
}

function handleExpModalOverlay(e) {
  if (e.target === document.getElementById('exp-modal')) closeExpModal();
}

function saveExpense() {
  const desc     = document.getElementById('exp-desc-in').value.trim();
  const orig     = parseFloat(document.getElementById('exp-orig-in').value);
  const currency = document.getElementById('exp-currency-in').value;
  const usd      = parseFloat(document.getElementById('exp-usd-in').value);
  const notes    = document.getElementById('exp-notes-in').value.trim();
  const period   = document.getElementById('exp-month-in').value;
  const idxStr   = document.getElementById('exp-editing-idx').value;

  if (!desc)        { alert('Description is required.'); return; }
  if (isNaN(orig))  { alert('Enter a valid original amount.'); return; }
  if (isNaN(usd))   { alert('Enter a valid USD amount.'); return; }
  if (!period)      { alert('Select a payroll period.'); return; }

  const entry = { desc, origAmount: orig, currency, usd, notes, payrollPeriod: period };

  if (idxStr !== '') expenses[parseInt(idxStr)] = entry;
  else expenses.push(entry);

  saveExpenses();
  closeExpModal();
  renderExpenses();
  renderPayroll();
}

function deleteExpense(i) {
  if (!confirm('Delete this expense?')) return;
  expenses.splice(i, 1);
  saveExpenses();
  renderExpenses();
  renderPayroll();
}

// ─── AI Expense Scanner (Word .docx) ────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = err => reject(err);
  });
}

async function handleExpenseScan(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('exp-scan-status');
  statusEl.style.display  = 'block';
  statusEl.style.color    = 'var(--gold)';
  statusEl.textContent    = '⏳ Reading document and converting currencies... (~15 seconds)';

  try {
    const base64Data = await fileToBase64(file);
    const CLOUD_FUNCTION_URL = "https://us-central1-crewx-17f23.cloudfunctions.net/scanExpense";

    const response = await fetch(CLOUD_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: base64Data, fileName: file.name })
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    if (data._parseError) {
      statusEl.style.color = 'var(--amber)';
      statusEl.textContent = '⚠️ Częściowy odczyt — sprawdź dane i uzupełnij ręcznie.';
      openExpModal();
      return;
    }

    // Build notes from subtotals
    const subtotalStr = (data.subtotals || [])
      .map(s => `${s.currency} ${s.total} = $${parseFloat(s.usd).toFixed(2)}`)
      .join(' · ');

    const notes = subtotalStr || data.notes || '';

    statusEl.style.color = 'var(--green)';
    statusEl.textContent = `✅ Znaleziono ${(data.items||[]).length} pozycji · Łącznie $${parseFloat(data.totalUSD).toFixed(2)} USD`;

    // Open modal pre-filled
    openExpModal();
    setTimeout(() => {
      document.getElementById('exp-desc-in').value     = data.description || file.name;
      document.getElementById('exp-orig-in').value     = data.totalUSD || 0;
      document.getElementById('exp-currency-in').value = 'USD';
      document.getElementById('exp-usd-in').value      = parseFloat(data.totalUSD).toFixed(2) || 0;
      document.getElementById('exp-notes-in').value    = notes.substring(0, 120);
    }, 100);

  } catch (err) {
    console.error(err);
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = `❌ ${err.message}`;
    openExpModal();
  } finally {
    event.target.value = '';
  }
}

// Konwersja pliku na tekst Base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

// Main function to send image to cloud
async function handleCertScan(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('scan-status');
  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--gold)';
  statusEl.textContent = '⏳ Scanning... (JPG/PNG/PDF — may take a few seconds)';

  try {
    const base64Data = await fileToBase64(file);
    const mediaType = file.type;

    // Twój bezpieczny adres Firebase!
    const CLOUD_FUNCTION_URL = "https://us-central1-crewx-17f23.cloudfunctions.net/scanCert";

    const response = await fetch(CLOUD_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: base64Data,
        mediaType: mediaType
      })
    });

    if (!response.ok) throw new Error("Connection error");

    const aiData = await response.json();

    // Wypełnianie inputów na żywo
    document.getElementById('cert-name-in').value = aiData.name || '';
    document.getElementById('cert-issuer-in').value = aiData.issuer || '';
    document.getElementById('cert-number-in').value = aiData.number || '';
    document.getElementById('cert-issue-in').value = aiData.issued || '';
    document.getElementById('cert-expiry-in').value = aiData.expiry || '';

    statusEl.style.color = 'var(--green)';
    statusEl.textContent = '✅ Done! Review the data and click Save.';

  } catch (error) {
    console.error(error);
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = '❌ Scan failed. Please enter details manually.';
  } finally {
    event.target.value = ''; // Resetujemy pole pliku
  }
}

// ═══ TRAINING RATE MODAL ═════════════════════════════════════════════

// Training rates stored in state variables at top of file

function saveTrainingRates() {
  localStorage.setItem('crewxTrainingRates', JSON.stringify(trainingRates));
  saveToCloud();
}

function closeTrainingRateModal() {
  document.getElementById('training-rate-modal').classList.remove('open');
}

function handleTrainingRateOverlay(e) {
  if (e.target === document.getElementById('training-rate-modal')) closeTrainingRateModal();
}

function editTrainingRate(start, end) {
  const modal = document.getElementById('training-rate-modal');
  const existing = (trainingRates || []).find(r => r.start === start && r.end === end);
  const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
  const fmt2 = ds => { if (!ds) return '—'; const [y,m,d] = ds.split('-'); return `${d}/${m}`; };
  document.getElementById('training-rate-sub').textContent =
    `Training: ${fmt2(start)} → ${fmt2(end)} (${days} days). Enter the daily rate:`;
  document.getElementById('training-rate-input').value = existing ? existing.rate : '';
  modal.dataset.start = start;
  modal.dataset.end   = end;
  modal.classList.add('open');
}

function saveTrainingRate() {
  const modal = document.getElementById('training-rate-modal');
  const rate  = parseFloat(document.getElementById('training-rate-input').value) || 0;
  const start = modal.dataset.start;
  const end   = modal.dataset.end;

  if (!start || !end) { closeTrainingRateModal(); return; }

  const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;

  // Remove existing entry for same period
  trainingRates = trainingRates.filter(r => !(r.start === start && r.end === end));
  trainingRates.push({ start, end, rate, days });
  trainingRates.sort((a,b) => a.start.localeCompare(b.start));
  saveTrainingRates();

  closeTrainingRateModal();
  renderPayroll();
}

// Hook training rates into cloud sync
const _origSaveToCloud = saveToCloud;
function saveToCloud() {
  if (!syncDoc) return;
  syncDoc.set({ events, rates, rhGrid, rhMeta, certs, expenses, trainingRates }, { merge: true })
    .catch(err => console.error("Save error:", err));
}

// ═══ ADMIN EMAIL SETTINGS ════════════════════════════════════════════

const EMAIL_SETTINGS_KEY = 'crewxEmailSettings';
const TEST_EMAIL_URL = "https://us-central1-crewx-17f23.cloudfunctions.net/sendTestCertEmail";
const SAVE_SETTINGS_URL = "https://us-central1-crewx-17f23.cloudfunctions.net/saveEmailSettings";

function loadEmailSettings() {
  // Load from Firestore admin settings doc
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;

  db.collection('adminSettings').doc('emailNotifications').get().then(doc => {
    const settings = doc.exists ? doc.data() : {
      enabled: true,
      thresholds: [60, 30, 7],
      customThreshold: null,
      fromEmail: 'rafal.pietrzak.pl@gmail.com'
    };

    document.getElementById('alert-enabled').checked    = settings.enabled !== false;
    document.getElementById('alert-60').checked         = settings.thresholds?.includes(60) !== false;
    document.getElementById('alert-30').checked         = settings.thresholds?.includes(30) !== false;
    document.getElementById('alert-7').checked          = settings.thresholds?.includes(7)  !== false;
    document.getElementById('alert-custom').value       = settings.customThreshold || '';
    document.getElementById('alert-from-email').value   = settings.fromEmail || 'rafal.pietrzak.pl@gmail.com';

    updateSchedulePreview(settings);
  }).catch(() => updateSchedulePreview(null));
}

function updateSchedulePreview(settings) {
  const previewEl = document.getElementById('email-schedule-preview');
  if (!previewEl) return;

  const enabled = document.getElementById('alert-enabled')?.checked;
  if (!enabled) {
    previewEl.innerHTML = '<span style="color:var(--red)">⏸ Notifications are paused</span>';
    return;
  }

  const thresholds = getSelectedThresholds();
  if (thresholds.length === 0) {
    previewEl.innerHTML = '<span style="color:var(--amber)">⚠️ No thresholds selected — no emails will be sent</span>';
    return;
  }

  const lines = thresholds.sort((a,b) => b-a).map(d => {
    const color = d <= 7 ? 'var(--red)' : d <= 30 ? 'var(--amber)' : 'var(--gold)';
    return `<div>📧 Email sent when <strong style="color:${color}">${d} days</strong> remain before expiry</div>`;
  });
  lines.push('<div style="margin-top:6px;color:var(--gray400)">⏰ Runs daily at 08:00 Warsaw time</div>');
  previewEl.innerHTML = lines.join('');
}

function getSelectedThresholds() {
  const thresholds = [];
  if (document.getElementById('alert-60')?.checked) thresholds.push(60);
  if (document.getElementById('alert-30')?.checked) thresholds.push(30);
  if (document.getElementById('alert-7')?.checked)  thresholds.push(7);
  const custom = parseInt(document.getElementById('alert-custom')?.value);
  if (!isNaN(custom) && custom > 0 && custom <= 365) thresholds.push(custom);
  return [...new Set(thresholds)]; // remove duplicates
}

async function saveEmailSettings() {
  const msgEl = document.getElementById('email-settings-msg');
  if (!msgEl) return;

  const settings = {
    enabled:         document.getElementById('alert-enabled').checked,
    thresholds:      getSelectedThresholds(),
    customThreshold: parseInt(document.getElementById('alert-custom').value) || null,
    fromEmail:       document.getElementById('alert-from-email').value.trim(),
    updatedAt:       new Date().toISOString(),
    updatedBy:       currentUser.email,
  };

  updateSchedulePreview(settings);

  try {
    // Save to Firestore adminSettings collection
    await db.collection('adminSettings').doc('emailNotifications').set(settings);
    msgEl.style.color   = 'var(--green)';
    msgEl.textContent   = '✅ Settings saved!';
    setTimeout(() => { msgEl.textContent = ''; }, 3000);
  } catch (err) {
    msgEl.style.color   = 'var(--red)';
    msgEl.textContent   = '❌ Error: ' + err.message;
  }
}

async function sendTestEmail() {
  const msgEl = document.getElementById('email-settings-msg');
  msgEl.style.color   = 'var(--gold)';
  msgEl.textContent   = '⏳ Sending test email...';

  try {
    const token = await currentUser.getIdToken();
    const fromEmail = document.getElementById('alert-from-email').value.trim();

    const resp = await fetch(TEST_EMAIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ fromEmail })
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    msgEl.style.color   = 'var(--green)';
    msgEl.textContent   = `✅ Test email sent to ${currentUser.email}!`;
  } catch (err) {
    msgEl.style.color   = 'var(--red)';
    msgEl.textContent   = '❌ ' + err.message;
  }
}

// ═══ RENDER ADMIN PANEL ══════════════════════════════════════════
async function renderAdminPanel() {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  const wrap = document.getElementById('admin-users-list');
  if (!wrap) return;
  wrap.innerHTML = '<div style="color:var(--gray400);font-size:13px">Loading users...</div>';

  try {
    const token = await currentUser.getIdToken(true);
    const resp  = await fetch(ADMIN_FUNCTION_URL + '?action=list', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    if (!data.users || data.users.length === 0) {
      wrap.innerHTML = '<div class="exp-empty">No users yet.</div>';
    } else {
      wrap.innerHTML = data.users.map(u => `
        <div class="admin-user-card">
          <div class="admin-user-info">
            <div class="admin-user-email">${u.email}</div>
            <div class="admin-user-meta">
              Created: ${u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB') : '—'}
              &nbsp;·&nbsp;
              Last login: ${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('en-GB') : 'Never'}
              ${u.disabled ? ' &nbsp;·&nbsp; <span style="color:var(--red)">DISABLED</span>' : ''}
            </div>
          </div>
          <div class="admin-user-actions">
            ${u.disabled
              ? `<button class="admin-btn-enable" onclick="adminEnableUser('${u.uid}')">Enable</button>`
              : `<button class="admin-btn-disable" onclick="adminDisableUser('${u.uid}')">Disable</button>`}
            <button class="admin-btn-del" onclick="adminDeleteUser('${u.uid}', '${u.email}')">Delete</button>
          </div>
        </div>`).join('');
    }
  } catch (err) {
    wrap.innerHTML = `<div style="color:var(--red);font-size:13px">❌ Error: ${err.message}</div>`;
  }

  loadEmailSettings();
}
