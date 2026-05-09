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
const db = firebase.firestore();
const auth = firebase.auth();

// ═══ ADMIN ════════════════════════════════════════════════════════
const ADMIN_EMAIL = 'rafal.pietrzak.pl@gmail.com';
let currentUser = null;
let syncDoc = null;
let unsubscribeSnapshot = null;

// ═══ STATE ════════════════════════════════════════════════════════
let events = [];
let rates = [];
let rhGrid = {};
let trainingRates = JSON.parse(localStorage.getItem('crewxTrainingRates') || '[]');
let rhMeta = {};
let certs = [];
let expenses = [];

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let selectedDate = null;
let editingCertIdx = null;
let cloudLoaded = false;

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
    cleanOrphanedTrainingRates();
  }, err => {
    console.error("Cloud listener error:", err);
    renderRates(); renderCalendar(); updateStats();
  });
}

function saveToCloud() {
  if (!syncDoc) return;
  syncDoc.set({ events, rates, rhGrid, rhMeta, certs, expenses, trainingRates }, { merge: true })
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

    // Training — always from calendar, rate from trainingRates
    const allTrainingPeriods = getTrainingPeriods().filter(t =>
      t.end && t.end >= p.periodStart && t.end <= p.periodEnd
    );
    const trainingTotal = allTrainingPeriods.reduce((s, t) => {
      const rateEntry = (trainingRates || []).find(r => r.start === t.start && r.end === t.end);
      const rate = rateEntry ? (rateEntry.rate || 0) : 0;
      const days = durDays(t) || 0;
      return s + (rate * days);
    }, 0);
    const trainingDaysCount = allTrainingPeriods.reduce((s, t) => s + (durDays(t) || 0), 0);

    const total = p.earnings + expTotal + trainingTotal;
    grandTotal += total;

    // Expense rows
    const expRows = periodExps.map(e => `
      <div class="pc-line">
        <span class="pc-line-label">↳ ${e.desc}</span>
        <span class="pc-line-val">${usd(e.usd,2)}</span>
      </div>`).join('');

    // Training rows
    const trainRows = allTrainingPeriods.map(t => {
      const rateEntry = (trainingRates || []).find(r => r.start === t.start && r.end === t.end);
      const rate = rateEntry ? (rateEntry.rate || 0) : null;
      const days = durDays(t) || 0;
      const earned = rate !== null ? usd(rate * days) : '—';
      const rateLabel = rate !== null ? `${days}d × ${usd(rate)}/d` : `${days}d · <span style="color:var(--amber)">⚠️ rate not set</span>`;
      return `<div class="pc-line">
        <span class="pc-line-label">↳ ${fmt(t.start)}→${fmt(t.end)} · ${rateLabel}</span>
        <span class="pc-line-val">${earned}</span>
      </div>`;
    }).join('');

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

  // ── Filter helper: keep only dates in selected year ───────────────
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
    const btn = document.getElementById(`btn-${t}`);
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

function cleanOrphanedTrainingRates() {
  if (!trainingRates || trainingRates.length === 0) return;
  const activePeriods = getTrainingPeriods();
  const before = trainingRates.length;

  if (activePeriods.length === 0) {
    // No training periods at all — clear everything
    trainingRates = [];
  } else {
    // Keep only rates that have a matching COMPLETE period (both start and end)
    trainingRates = trainingRates.filter(r =>
      activePeriods.some(p => p.start === r.start && p.end === r.end && p.end !== null)
    );
  }

  if (trainingRates.length !== before) {
    console.log(`Cleaned ${before - trainingRates.length} orphaned training rate(s)`);
    saveTrainingRates();
    renderPayroll();
  }
}

function logEvent(type) {
  if (!selectedDate) return;
  const idx = events.findIndex(e => e.date===selectedDate && e.type===type);
  if (idx >= 0) events.splice(idx,1);
  else {
    events.push({ date: selectedDate, type });
    events.sort((a,b) => a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
  }
  saveEvents();

  // Clean up orphaned training rates after any training event change
  if (type === 'training-start' || type === 'training-end') {
    cleanOrphanedTrainingRates();
  }

  closeModal(); renderCalendar();

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
      document.getElementById('training-rate-modal').dataset.start = lastTraining.start;
      document.getElementById('training-rate-modal').dataset.end   = lastTraining.end;
    }
  }
}

function clearDay() {
  if (!selectedDate) return;
  events = events.filter(e => e.date !== selectedDate);
  saveEvents();
  // Clean up orphaned training rates
  cleanOrphanedTrainingRates();
  closeModal(); renderCalendar();
}

function clearAllRates() {
  if (!confirm('
