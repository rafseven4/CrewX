// ═══════════════════════════════════════════════════════════════
//  CrewX — app.js
//  Fixes applied:
//  1. Admin email in single constant only
//  2. Cloud saves debounced (1 s)
//  3. Training rates sourced from Firestore only after login
//  4. Expense payroll dropdown shows all historical periods
//  5. parseDMY validates month/day ranges
//  6. clearDay warns about broken pairs
//  7. Native confirm() replaced with custom dialog everywhere
//  8. adminSettings loaded once per panel open, not on every refresh
//  9. All render functions wrapped in try/catch
// ═══════════════════════════════════════════════════════════════

// ═══ FIREBASE CONFIG ══════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyCkdha2N09Rj_mY1ybjLrgE87NF8-LNyZA",
  authDomain: "crewx-17f23.firebaseapp.com",
  projectId: "crewx-17f23",
  storageBucket: "crewx-17f23.firebasestorage.app",
  messagingSenderId: "938144343104",
  appId: "1:938144343104:web:cbe52e46ea333509d06ba5"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ═══ CONSTANTS ════════════════════════════════════════════════
// Single source of truth — change here only
const ADMIN_EMAIL         = 'rafal.pietrzak.pl@gmail.com';
const ADMIN_FUNCTION_URL  = "https://us-central1-crewx-17f23.cloudfunctions.net/adminManageUsers";
const TEST_EMAIL_URL      = "https://us-central1-crewx-17f23.cloudfunctions.net/sendTestCertEmail";
const SAVE_SETTINGS_URL   = "https://us-central1-crewx-17f23.cloudfunctions.net/saveEmailSettings";
const SCAN_CERT_URL       = "https://us-central1-crewx-17f23.cloudfunctions.net/scanCert";
const SCAN_EXPENSE_URL    = "https://us-central1-crewx-17f23.cloudfunctions.net/scanExpense";

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const MONTHS_S = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec'
];
const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ═══ STATE ════════════════════════════════════════════════════
let currentUser        = null;
let syncDoc            = null;
let unsubscribeSnapshot = null;

let events        = [];
let rates         = [];
let certs         = [];
let expenses      = [];
let trainingRates = [];

let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let selectedDate = null;
let editingCertIdx = null;
let emailSettingsLoaded = false;   // load once per admin panel open

// ─── Debounce timer for cloud saves ───────────────────────────
let _saveTimer = null;
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => _flushSave(), 1000);
}
function _flushSave() {
  if (!syncDoc || !currentUser) return;
  syncDoc.set({ events, rates, certs, expenses, trainingRates }, { merge: true })
    .catch(err => console.error("Save error:", err));
}
// Immediate save for critical operations (logout, etc.)
function saveNow() {
  clearTimeout(_saveTimer);
  _flushSave();
}

// ─── Local helpers ─────────────────────────────────────────────
function localDateStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function todayStr() { return localDateStr(new Date()); }
function dateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function fmtDate(ds) {
  if (!ds) return 'ongoing';
  const [y, m, d] = ds.split('-');
  return `${d}/${m}/${y}`;
}
function fmtShort(ds) {
  if (!ds) return '—';
  const [, m, d] = ds.split('-');
  return `${d}/${m}`;
}

// Validates dd/mm/yyyy — also checks sane day and month ranges
function parseDMY(str) {
  if (!str || !str.trim()) return null;
  const parts = str.trim().split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return null;

  const dd = parseInt(d, 10);
  const mm = parseInt(m, 10);
  const yy = parseInt(y, 10);

  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;
  if (yy < 1900 || yy > 2100) return null;

  const iso = `${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  const test = new Date(iso + 'T00:00:00');

  if (
    isNaN(test.getTime()) ||
    test.getFullYear() !== yy ||
    test.getMonth() + 1 !== mm ||
    test.getDate() !== dd
  ) return null;

  return iso;
}

function durDays(p) {
  if (!p || !p.end) return null;
  return Math.round(
    (new Date(p.end + 'T00:00:00') - new Date(p.start + 'T00:00:00')) / 86400000
  ) + 1;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = err => reject(err);
  });
}

// ═══ CUSTOM CONFIRM DIALOG ════════════════════════════════════
// Replaces native confirm() with a styled modal.
// Usage: customConfirm('Title', 'Message text').then(ok => { if(ok) ... });
function customConfirm(title, message, okLabel = 'Delete', okClass = '') {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-overlay');
    const titleEl = document.getElementById('confirm-title');
    const msgEl   = document.getElementById('confirm-msg');
    const okBtn   = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');

    titleEl.textContent = title;
    msgEl.textContent   = message;
    okBtn.textContent   = okLabel;
    okBtn.className     = 'confirm-btn-ok' + (okClass ? ' ' + okClass : '');

    overlay.classList.add('open');

    const cleanup = (result) => {
      overlay.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk     = () => cleanup(true);
    const onCancel = () => cleanup(false);

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// ═══ AUTH ═════════════════════════════════════════════════════
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    showApp();
  } else {
    currentUser = null;
    showLogin();
  }
});

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-root').style.display     = 'none';
  if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-root').style.display     = 'block';

  syncDoc = db.collection('users').doc(currentUser.uid)
               .collection('appData').doc('crewx');

  const adminBtn = document.getElementById('nav-admin');
  if (adminBtn) adminBtn.style.display = currentUser.email === ADMIN_EMAIL ? 'flex' : 'none';

  const statusText = document.getElementById('status-text');
  if (statusText) statusText.textContent = currentUser.email.split('@')[0];

  emailSettingsLoaded = false;
  initCloudSync();
}

async function doLogin() {
  const email  = document.getElementById('login-email').value.trim();
  const pass   = document.getElementById('login-pass').value;
  const errEl  = document.getElementById('login-error');
  const btn    = document.getElementById('login-btn');

  if (!email || !pass) { errEl.textContent = 'Enter email and password.'; return; }

  btn.textContent = 'Signing in…';
  btn.disabled    = true;
  errEl.textContent = '';

  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (err) {
    btn.textContent = 'Sign In';
    btn.disabled    = false;
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

function doLogout() {
  customConfirm('Sign out', 'Are you sure you want to sign out?', 'Sign out', 'confirm-primary')
    .then(ok => {
      if (!ok) return;
      saveNow();
      events = []; rates = []; certs = []; expenses = []; trainingRates = [];
      if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
      auth.signOut();
    });
}

document.addEventListener('DOMContentLoaded', () => {
  const passEl  = document.getElementById('login-pass');
  const emailEl = document.getElementById('login-email');
  if (passEl)  passEl.addEventListener('keydown',  e => { if (e.key === 'Enter') doLogin(); });
  if (emailEl) emailEl.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});

// ═══ CLOUD SYNC ═══════════════════════════════════════════════
function initCloudSync() {
  if (!syncDoc) return;
  if (unsubscribeSnapshot) unsubscribeSnapshot();

  // Show skeleton while loading
  _showCalendarSkeleton();

  unsubscribeSnapshot = syncDoc.onSnapshot(doc => {
    if (!doc.exists) { _hideCalendarSkeleton(); return; }

    const data = doc.data() || {};
    events        = Array.isArray(data.events)        ? data.events        : [];
    rates         = Array.isArray(data.rates)         ? data.rates         : [];
    certs         = Array.isArray(data.certs)         ? data.certs         : [];
    expenses      = Array.isArray(data.expenses)      ? data.expenses      : [];
    trainingRates = Array.isArray(data.trainingRates) ? data.trainingRates : [];

    _hideCalendarSkeleton();
    _safeRender();
    cleanOrphanedTrainingRates();
  }, err => {
    console.error("Cloud listener error:", err);
    _hideCalendarSkeleton();
    _safeRender();
  });
}

function _safeRender() {
  try { renderRates();    } catch(e) { console.error('renderRates:', e); }
  try { renderCalendar(); } catch(e) { console.error('renderCalendar:', e); }
  try { updateStats();    } catch(e) { console.error('updateStats:', e); }

  if (document.getElementById('page-certificates')?.classList.contains('active')) {
    try { renderCerts(); } catch(e) { console.error('renderCerts:', e); }
  }
  if (document.getElementById('page-expenses')?.classList.contains('active')) {
    try { renderExpenses(); } catch(e) { console.error('renderExpenses:', e); }
  }
}

function _showCalendarSkeleton() {
  const cal = document.getElementById('calendar');
  if (!cal) return;
  cal.innerHTML = Array.from({ length: 35 }, () =>
    `<div class="day skeleton" style="min-height:66px"></div>`
  ).join('');
}
function _hideCalendarSkeleton() { /* cleared by renderCalendar */ }

// All state mutations call scheduleSave() — one debounced write
function saveEvents()        { scheduleSave(); }
function saveRates()         { scheduleSave(); }
function saveCerts()         { scheduleSave(); }
function saveExpenses()      { scheduleSave(); }
function saveTrainingRates() { scheduleSave(); }

// ═══ PAIRS & RANGES ═══════════════════════════════════════════
function getPairs(inType, outType) {
  const ins  = events.filter(e => e.type === inType).map(e => e.date).sort();
  const outs = events.filter(e => e.type === outType).map(e => e.date).sort();
  const pairs = [];
  const usedOuts = new Set();
  for (const start of ins) {
    const end = outs.find(o => o >= start && !usedOuts.has(o)) || null;
    if (end) usedOuts.add(end);
    pairs.push({ start, end });
  }
  return pairs;
}
function getTrips()           { return getPairs('depart',         'arrive'); }
function getBrazilStays()     { return getPairs('brazil-in',      'brazil-out'); }
function getOnboardStays()    { return getPairs('sign-on',        'sign-off'); }
function getTrainingPeriods() { return getPairs('training-start', 'training-end'); }

function getRangeDates(pairs, calendarOnly = false) {
  const set = new Set();
  for (const p of pairs) {
    if (calendarOnly && !p.end) continue;
    const s = new Date(p.start + 'T00:00:00');
    const e = p.end ? new Date(p.end + 'T00:00:00') : new Date();
    for (let c = new Date(s); c <= e; c.setDate(c.getDate() + 1)) {
      set.add(localDateStr(c));
    }
  }
  return set;
}

// ═══ RATES & PAYROLL ══════════════════════════════════════════
function getRateForDate(ds) {
  const sorted = [...rates].sort((a, b) => a.from.localeCompare(b.from));
  for (const r of sorted) {
    if (ds >= r.from && (!r.to || ds <= r.to)) return Number(r.amount) || 0;
  }
  return 0;
}

function renderRates() {
  const el = document.getElementById('rates-list');
  if (!el) return;
  if (rates.length === 0) {
    el.innerHTML = '<div style="font-size:12px;color:var(--gray400);text-align:center;padding:8px 0">No rates added yet</div>';
    return;
  }
  const sorted = rates
    .map((r, i) => ({ ...r, originalIdx: i }))
    .sort((a, b) => a.from.localeCompare(b.from));

  el.innerHTML = sorted.map(r => `
    <div class="rate-item">
      <div>
        <div class="rate-amount">$${Number(r.amount).toLocaleString()}<span style="font-size:10px;color:var(--gray400);font-weight:400;font-family:'Space Grotesk',sans-serif"> /day</span></div>
        <div class="rate-period">${fmtDate(r.from)} → ${fmtDate(r.to)}</div>
      </div>
      <button class="rate-delete" onclick="deleteRate(${r.originalIdx})" title="Remove">✕</button>
    </div>
  `).join('');
}

function addRate() {
  const amount  = parseFloat(document.getElementById('rate-amount').value);
  const fromRaw = document.getElementById('rate-from').value;
  const toRaw   = document.getElementById('rate-to').value;
  const from    = parseDMY(fromRaw);
  const to      = parseDMY(toRaw);

  if (!amount || !from) { alert('Enter amount and a valid "from" date (dd/mm/yyyy).'); return; }
  if (toRaw.trim() && !to) { alert('"To" date is not valid. Use dd/mm/yyyy or leave blank.'); return; }

  rates.push({ amount, from, to });
  rates.sort((a, b) => a.from.localeCompare(b.from));
  saveRates();

  document.getElementById('rate-amount').value = '';
  document.getElementById('rate-from').value   = '';
  document.getElementById('rate-to').value     = '';

  renderRates();
  renderPayroll();
  renderCalendar();
}

function deleteRate(i) {
  customConfirm('Remove rate', `Remove the $${Number(rates[i]?.amount).toLocaleString()}/day rate period?`)
    .then(ok => {
      if (!ok) return;
      rates.splice(i, 1);
      saveRates();
      renderRates();
      renderPayroll();
      renderCalendar();
    });
}

function clearAllRates() {
  customConfirm('Clear all rates', 'Remove all day-rate periods? This cannot be undone.')
    .then(ok => {
      if (!ok) return;
      rates = [];
      saveRates();
      renderRates();
      renderPayroll();
    });
}

// Build payroll period list covering ALL data (not just current year)
function getAllPayrollPeriods() {
  const allDates = [
    ...events.map(e => e.date),
    ...rates.map(r => r.from)
  ].filter(Boolean).sort();

  if (allDates.length === 0) return [];

  const today     = new Date();
  const earliest  = new Date(allDates[0] + 'T00:00:00');

  // Start one period before the earliest date
  let y = earliest.getFullYear();
  let m = earliest.getMonth();
  if (m === 0) { m = 11; y--; } else { m--; }

  const endY = today.getFullYear();
  const endM = today.getMonth() + 1; // one period ahead of today

  const periods = [];
  while (y < endY || (y === endY && m <= endM)) {
    const prevM = m === 0 ? 11 : m - 1;
    const prevY = m === 0 ? y - 1 : y;
    periods.push({
      start:  dateStr(prevY, prevM, 21),
      end:    dateStr(y, m, 20),
      label:  `${MONTHS_S[prevM]} 21 – ${MONTHS_S[m]} 20, ${y}`
    });
    m++; if (m > 11) { m = 0; y++; }
  }
  return periods;
}

function renderPayroll() {
  const body = document.getElementById('payroll-body');
  if (!body) return;

  if (rates.length === 0) {
    body.innerHTML = '<div class="empty-state">Add a day rate above to see payroll calculations</div>';
    return;
  }

  const periods = getAllPayrollPeriods();
  if (periods.length === 0) {
    body.innerHTML = '<div class="empty-state">Log trip events to calculate earnings</div>';
    return;
  }

  const todayS         = todayStr();
  const awayDates      = getRangeDates(getTrips());
  const trainingDates  = getRangeDates(getTrainingPeriods());
  const usd = (v, dec = 0) => '$' + parseFloat(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: dec, maximumFractionDigits: dec
  });

  let grandTotal = 0;

  const cards = periods.map(p => {
    // Count away days (excluding training days) and earnings
    let days = 0, earnings = 0;
    const s = new Date(p.start + 'T00:00:00');
    const e = new Date(p.end   + 'T00:00:00');
    for (let c = new Date(s); c <= e; c.setDate(c.getDate() + 1)) {
      const ds = localDateStr(c);
      if (awayDates.has(ds) && !trainingDates.has(ds)) {
        days++; earnings += getRateForDate(ds);
      }
    }

    const isCurrent = todayS >= p.start && todayS <= p.end;
    const isVisible  = days > 0 || p.end >= todayS;
    if (!isVisible) return '';

    // Expenses for this period
    const periodExps  = (expenses || []).filter(e => e.payrollPeriod === p.end);
    const expTotal    = periodExps.reduce((s, e) => s + (parseFloat(e.usd) || 0), 0);

    // Training periods that ended in this payroll window
    const periodTraining = getTrainingPeriods().filter(t => t.end && t.end >= p.start && t.end <= p.end);
    const trainingTotal  = periodTraining.reduce((s, t) => {
      const re = (trainingRates || []).find(r => r.start === t.start && r.end === t.end);
      return s + (re ? Number(re.rate || 0) * (durDays(t) || 0) : 0);
    }, 0);
    const trainingDaysCnt = periodTraining.reduce((s, t) => s + (durDays(t) || 0), 0);

    const total = earnings + expTotal + trainingTotal;
    grandTotal += total;

    const expRows   = periodExps.map(e => `
      <div class="pc-line">
        <span class="pc-line-label">↳ ${e.desc}</span>
        <span class="pc-line-val">${usd(e.usd, 2)}</span>
      </div>`).join('');

    const trainRows = periodTraining.map(t => {
      const re   = (trainingRates || []).find(r => r.start === t.start && r.end === t.end);
      const rate = re ? Number(re.rate || 0) : null;
      const d    = durDays(t) || 0;
      const earned = rate !== null ? usd(rate * d) : '—';
      const lbl    = rate !== null
        ? `${d}d × ${usd(rate)}/d`
        : `${d}d · <span style="color:var(--amber)">⚠️ rate not set</span>`;
      return `<div class="pc-line">
        <span class="pc-line-label">↳ ${fmtShort(t.start)}→${fmtShort(t.end)} · ${lbl}</span>
        <span class="pc-line-val">${earned}</span>
      </div>`;
    }).join('');

    return `
      <div class="pc-card ${isCurrent ? 'pc-current' : ''}">
        <div class="pc-header">
          <div class="pc-period">${p.label}</div>
          ${isCurrent ? '<div class="pc-badge-current">current</div>' : ''}
        </div>
        <div class="pc-body">
          <div class="pc-row ${days === 0 ? 'pc-row-zero' : ''}">
            <div class="pc-row-left">
              <span class="pc-row-icon">📅</span>
              <span class="pc-row-name">Days away</span>
              <span class="pc-row-sub">${days} days × rate</span>
            </div>
            <span class="pc-row-amount ${days > 0 ? 'pc-amount-main' : ''}">${usd(earnings)}</span>
          </div>
          ${trainingDaysCnt > 0 ? `
            <div class="pc-row">
              <div class="pc-row-left">
                <span class="pc-row-icon">🎓</span>
                <span class="pc-row-name">Training</span>
                <span class="pc-row-sub">${trainingDaysCnt} days</span>
              </div>
              <span class="pc-row-amount pc-amount-training">${usd(trainingTotal)}</span>
            </div>
            ${trainRows}` : ''}
          ${expTotal > 0 ? `
            <div class="pc-row">
              <div class="pc-row-left">
                <span class="pc-row-icon">🧾</span>
                <span class="pc-row-name">Expenses</span>
                <span class="pc-row-sub">${periodExps.length} item${periodExps.length !== 1 ? 's' : ''}</span>
              </div>
              <span class="pc-row-amount pc-amount-exp">${usd(expTotal, 2)}</span>
            </div>
            ${expRows}` : ''}
        </div>
        <div class="pc-total">
          <span>Total payout</span>
          <span class="pc-total-amount">${usd(total)}</span>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = cards +
    `<div class="pc-grand-total">
       <span>Grand total (all periods)</span>
       <span>${usd(grandTotal)}</span>
     </div>
     <div style="font-size:10px;color:var(--gray400);margin-top:8px;text-align:center">
       Cut-off: 20th each month &nbsp;·&nbsp; Blue border = current period
     </div>`;
}

// ═══ STATS ════════════════════════════════════════════════════
function updateStats() {
  const sel = document.getElementById('stat-year-filter');
  if (sel) {
    const years = [...new Set(events.map(e => e.date?.slice(0,4)).filter(Boolean))].sort();
    const prev  = sel.value || 'all';
    sel.innerHTML = '<option value="all">All years</option>' +
      years.map(y => `<option value="${y}" ${y === prev ? 'selected' : ''}>${y}</option>`).join('');
  }

  const fy = sel?.value || 'all';
  const filterSet = ds => {
    if (fy === 'all') return ds;
    const out = new Set();
    for (const d of ds) if (d.startsWith(fy)) out.add(d);
    return out;
  };

  const trips           = getTrips();
  const brazilStays     = getBrazilStays();
  const onboardStays    = getOnboardStays();
  const trainingPeriods = getTrainingPeriods();

  const awayDates     = filterSet(getRangeDates(trips));
  const brazilDates   = filterSet(getRangeDates(brazilStays));
  const onboardDates  = filterSet(getRangeDates(onboardStays));
  const trainingDates = filterSet(getRangeDates(trainingPeriods));

  const rotEvDates = new Set(events
    .filter(e => ['depart','arrive'].includes(e.type) && (fy === 'all' || e.date?.startsWith(fy)))
    .map(e => e.date));
  let travel = 0;
  for (const ds of awayDates) if (rotEvDates.has(ds)) travel++;

  const filteredTrips   = fy === 'all' ? trips   : trips.filter(t => t.start.startsWith(fy) || (t.end && t.end.startsWith(fy)));
  const filteredOnboard = fy === 'all' ? onboardStays : onboardStays.filter(o => o.start.startsWith(fy) || (o.end && o.end.startsWith(fy)));

  const sh = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  sh('stat-away',     `${awayDates.size} <span class="stat-unit">d</span>`);
  sh('stat-brazil',   `${brazilDates.size} <span class="stat-unit">d</span>`);
  sh('stat-onboard',  `${onboardDates.size} <span class="stat-unit">d</span>`);
  sh('stat-training', `${trainingDates.size} <span class="stat-unit">d</span>`);
  sh('stat-travel',   `${travel} <span class="stat-unit">d</span>`);

  const tripCount     = filteredTrips.filter(t => t.end).length;
  const contractCount = filteredOnboard.filter(o => o.end).length;
  sh('stat-trips', `${tripCount} <span id="stat-contracts" style="font-size:13px;color:var(--gray400)">/ ${contractCount}</span>`);

  // Status pill
  const todaySt   = todayStr();
  const allAway   = getRangeDates(trips);
  const allBrazil = getRangeDates(brazilStays);
  const allOnboard= getRangeDates(onboardStays);
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const inBrazil   = allBrazil.has(todaySt);
  const isOnboard  = allOnboard.has(todaySt);

  if (dot && text && currentUser) {
    if (isOnboard) {
      dot.style.background = '#f97316';
      text.textContent = '⚓ Onboard' + (inBrazil ? ' · 🇧🇷' : '');
    } else if (allAway.has(todaySt)) {
      dot.style.background = '#38bdf8';
      text.textContent = 'Away' + (inBrazil ? ' · 🇧🇷 Brazil' : '');
    } else {
      dot.style.background = '#94a3b8';
      text.textContent = currentUser.email.split('@')[0];
    }
  }

  // Lists
  function renderList(listId, infoId, items, labelFn, badgeClass) {
    const info = document.getElementById(infoId);
    const list = document.getElementById(listId);
    if (!info || !list) return;
    if (!items.length) { info.style.display = 'none'; return; }
    info.style.display = 'block';
    list.innerHTML = items.map((item, i) => {
      const d = durDays(item);
      return `<div class="info-row"><span>${labelFn(item, i)}</span><span class="ibadge ${badgeClass}">${d ? d+'d' : 'ongoing'}</span></div>`;
    }).join('');
  }

  renderList('trips-list',   'trips-info',   trips,       (t,i) => `Trip ${i+1} &nbsp; ${fmtShort(t.start)} → ${t.end ? fmtShort(t.end) : '…'}`,       'ibadge-blue');
  renderList('brazil-list',  'brazil-info',  brazilStays, (b,i) => `Stay ${i+1} &nbsp; ${fmtShort(b.start)} → ${b.end ? fmtShort(b.end) : '…'}`,        'ibadge-green');
  renderList('onboard-list', 'onboard-info', onboardStays,(o,i) => `Contract ${i+1} &nbsp; ${fmtShort(o.start)} → ${o.end ? fmtShort(o.end) : '…'}`,    'ibadge-amber');

  const trainingInfo = document.getElementById('training-info');
  const trainingList = document.getElementById('training-list');
  if (trainingInfo && trainingList) {
    if (trainingPeriods.length === 0) {
      trainingInfo.style.display = 'none';
    } else {
      trainingInfo.style.display = 'block';
      trainingList.innerHTML = trainingPeriods.map((t, i) => {
        const re   = (trainingRates || []).find(r => r.start === t.start && r.end === t.end);
        const rate = re ? re.rate : null;
        const days = durDays(t) || '?';
        const earned = rate !== null ? `$${(rate * days).toLocaleString()}` : '—';
        return `<div class="info-row" style="align-items:center">
          <span>Training ${i+1} &nbsp; ${fmtShort(t.start)} → ${t.end ? fmtShort(t.end) : '…'}</span>
          <div style="display:flex;align-items:center;gap:6px;margin-left:auto">
            <span style="font-size:11px;color:var(--gray400)">
              ${rate !== null
                ? `$${rate}/d · ${days}d · <strong style="color:#a78bfa">${earned}</strong>`
                : '<span style="color:var(--amber)">⚠️ no rate set</span>'}
            </span>
            <span class="ibadge ibadge-purple" style="cursor:pointer"
                  onclick="editTrainingRate('${t.start}','${t.end}')">✏️ rate</span>
          </div>
        </div>`;
      }).join('');
    }
  }
}

// ═══ CALENDAR ═════════════════════════════════════════════════
function renderCalendar() {
  const monthLabel = document.getElementById('month-label');
  const cal        = document.getElementById('calendar');
  if (!monthLabel || !cal) return;

  monthLabel.textContent = `${MONTHS[currentMonth]} ${currentYear}`;
  cal.innerHTML = '';

  const firstDay    = new Date(currentYear, currentMonth, 1).getDay();
  const offset      = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today       = new Date();

  const trips           = getTrips();
  const onboardStays    = getOnboardStays();
  const trainingPeriods = getTrainingPeriods();
  const awayDates       = getRangeDates(trips,           true);
  const brazilDates     = getRangeDates(getBrazilStays(),true);
  const onboardDates    = getRangeDates(onboardStays,    true);
  const trainingDates   = getRangeDates(trainingPeriods, true);

  for (let i = 0; i < offset; i++) {
    const e = document.createElement('div');
    e.className = 'day empty';
    cal.appendChild(e);
  }

  const EV_LABEL = {
    depart: 'left home', arrive: 'arrived',
    'brazil-in': '🇧🇷 in', 'brazil-out': '✈️ out',
    'sign-on': '⚓ on', 'sign-off': '🔄 off',
    'training-start': '🎓 start', 'training-end': '✅ end'
  };
  const EV_CLASS = {
    depart: 'ev-depart', arrive: 'ev-arrive',
    'brazil-in': 'ev-brazil-in', 'brazil-out': 'ev-brazil-out',
    'sign-on': 'ev-sign-on', 'sign-off': 'ev-sign-off',
    'training-start': 'ev-training', 'training-end': 'ev-training'
  };

  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = dateStr(currentYear, currentMonth, d);
    const div = document.createElement('div');
    div.className = 'day';

    const isToday = today.getFullYear() === currentYear &&
                    today.getMonth()    === currentMonth &&
                    today.getDate()     === d;

    if (isToday)               div.classList.add('today');
    if (awayDates.has(ds))     div.classList.add('range-away');
    if (brazilDates.has(ds))   div.classList.add('range-brazil');
    if (onboardDates.has(ds))  div.classList.add('range-onboard');
    if (trainingDates.has(ds)) div.classList.add('range-training');
    if (d === 20)              div.classList.add('payroll-end');
    if (d === 21)              div.classList.add('payroll-start');

    let html = `<div class="day-num">${d}</div>`;
    if (d === 20) html += `<div class="payroll-marker">✂ PAY</div>`;

    const dayEvs = events.filter(e => e.date === ds);
    dayEvs.forEach(ev => {
      html += `<span class="event-marker ${EV_CLASS[ev.type] || ''}">${EV_LABEL[ev.type] || ev.type}</span><br>`;
    });

    const trip     = trips.find(t => t.end === ds);
    const contract = onboardStays.find(o => o.end === ds);
    const training = trainingPeriods.find(t => t.end === ds);
    if (trip     && durDays(trip))     html += `<span class="badge-away">${durDays(trip)}d</span>`;
    if (contract && durDays(contract)) html += `<span class="badge-onboard">⚓${durDays(contract)}d</span>`;
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

// ═══ MODAL ════════════════════════════════════════════════════
function openModal(ds) {
  selectedDate = ds;
  const [y, m, d] = ds.split('-');
  const titleEl = document.getElementById('modal-title');
  const subEl   = document.getElementById('modal-sub');
  if (titleEl) titleEl.textContent = `${parseInt(d)} ${MONTHS[parseInt(m)-1]} ${y}`;

  const dayEvs = events.filter(e => e.date === ds);
  const EV_LABEL_LONG = {
    depart: 'left home', arrive: 'arrived home',
    'brazil-in': 'entered Brazil', 'brazil-out': 'left Brazil',
    'sign-on': 'sign on', 'sign-off': 'sign off',
    'training-start': 'training start', 'training-end': 'training end'
  };
  if (subEl) subEl.textContent = dayEvs.length
    ? 'Logged: ' + dayEvs.map(e => EV_LABEL_LONG[e.type] || e.type).join(', ')
    : 'Tap an event to log it for this day';

  const groups = {
    blue:   ['depart','arrive'],
    green:  ['brazil-in','brazil-out'],
    amber:  ['sign-on','sign-off'],
    purple: ['training-start','training-end']
  };
  Object.entries(groups).forEach(([color, types]) => {
    types.forEach(t => {
      const btn = document.getElementById('btn-' + t);
      if (!btn) return;
      btn.classList.remove('active','active-green','active-amber','active-purple');
      if (dayEvs.some(e => e.type === t)) {
        if (color === 'blue')   btn.classList.add('active');
        if (color === 'green')  btn.classList.add('active-green');
        if (color === 'amber')  btn.classList.add('active-amber');
        if (color === 'purple') btn.classList.add('active-purple');
      }
    });
  });

  const clearBtn = document.getElementById('btn-clear');
  if (clearBtn) clearBtn.style.display = dayEvs.length ? 'block' : 'none';
  document.getElementById('modal')?.classList.add('open');
}

function closeModal() {
  document.getElementById('modal')?.classList.remove('open');
  selectedDate = null;
}
function handleOverlayClick(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}

function logEvent(type) {
  if (!selectedDate) return;
  const eventDate = selectedDate;
  const idx       = events.findIndex(e => e.date === eventDate && e.type === type);
  const adding    = idx < 0;

  if (idx >= 0) {
    events.splice(idx, 1);
  } else {
    events.push({ date: eventDate, type });
    events.sort((a,b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  }

  saveEvents();
  if (type === 'training-start' || type === 'training-end') cleanOrphanedTrainingRates();

  let completedTraining = null;
  if (type === 'training-end' && adding) {
    completedTraining = getTrainingPeriods().find(t => t.end === eventDate) || null;
  }

  closeModal();
  renderCalendar();

  if (completedTraining) {
    const days = durDays(completedTraining);
    document.getElementById('training-rate-sub').textContent =
      `Training: ${fmtShort(completedTraining.start)} → ${fmtShort(completedTraining.end)} (${days} days). Enter the daily rate:`;
    document.getElementById('training-rate-input').value = '';
    const modal = document.getElementById('training-rate-modal');
    modal.dataset.start = completedTraining.start;
    modal.dataset.end   = completedTraining.end;
    modal.classList.add('open');
  }
}

function clearDay() {
  if (!selectedDate) return;

  // Warn if clearing this day would break open trip/brazil/onboard pairs
  const dayEvs = events.filter(e => e.date === selectedDate);
  const hasPairOpener = dayEvs.some(e =>
    ['depart','brazil-in','sign-on','training-start'].includes(e.type)
  );

  const confirmMsg = hasPairOpener
    ? 'This day has an event that starts a period. Removing it may break trip or rotation data. Continue?'
    : 'Remove all events from this day?';

  customConfirm('Clear day', confirmMsg, 'Remove', '')
    .then(ok => {
      if (!ok) return;
      events = events.filter(e => e.date !== selectedDate);
      saveEvents();
      cleanOrphanedTrainingRates();
      closeModal();
      renderCalendar();
    });
}

// ═══ TRAINING RATE ════════════════════════════════════════════
function cleanOrphanedTrainingRates() {
  if (!trainingRates || trainingRates.length === 0) return;
  const active = getTrainingPeriods();
  const before = trainingRates.length;
  trainingRates = active.length === 0
    ? []
    : trainingRates.filter(r => active.some(p => p.start === r.start && p.end === r.end && p.end !== null));
  if (trainingRates.length !== before) {
    saveTrainingRates();
    renderPayroll();
  }
}

function closeTrainingRateModal() {
  document.getElementById('training-rate-modal')?.classList.remove('open');
}
function handleTrainingRateOverlay(e) {
  if (e.target === document.getElementById('training-rate-modal')) closeTrainingRateModal();
}
function editTrainingRate(start, end) {
  if (!start || !end) return;
  const modal    = document.getElementById('training-rate-modal');
  const existing = (trainingRates || []).find(r => r.start === start && r.end === end);
  const days     = Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1;
  document.getElementById('training-rate-sub').textContent =
    `Training: ${fmtShort(start)} → ${fmtShort(end)} (${days} days). Enter the daily rate:`;
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
  const days = Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1;
  trainingRates = trainingRates.filter(r => !(r.start === start && r.end === end));
  trainingRates.push({ start, end, rate, days });
  trainingRates.sort((a,b) => a.start.localeCompare(b.start));
  saveTrainingRates();
  closeTrainingRateModal();
  updateStats();
  renderPayroll();
}

// ═══ SIDEBAR / PAGES ══════════════════════════════════════════
function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name)?.classList.add('active');
  document.getElementById('nav-'  + name)?.classList.add('active');
  if (name === 'certificates') { try { renderCerts();    } catch(e) { console.error(e); } }
  if (name === 'expenses')     { try { renderExpenses(); } catch(e) { console.error(e); } }
  if (name === 'admin')        { emailSettingsLoaded = false; renderAdminPanel(); }
  closeSidebar();
}

// ═══ CERTIFICATES ═════════════════════════════════════════════
function certStatus(expiryStr) {
  if (!expiryStr) return { cls: 'ok', label: 'No expiry', days: null };
  const exp   = new Date(expiryStr + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diff  = Math.round((exp - today) / 86400000);
  if (diff < 0)  return { cls: 'expired',  label: 'Expired',       days: diff };
  if (diff < 30) return { cls: 'expiring', label: 'Expires soon',  days: diff };
  if (diff < 90) return { cls: 'expiring', label: `${diff}d left`, days: diff };
  return              { cls: 'ok',       label: `${diff}d left`, days: diff };
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
    <span class="cert-add-icon">＋</span>Add certificate
  </button>`;
  grid.innerHTML = html;

  const badge = document.getElementById('cert-badge');
  if (badge) { badge.style.display = expCount > 0 ? 'inline' : 'none'; if (expCount > 0) badge.textContent = expCount; }
}

function openCertModal(idx) {
  editingCertIdx = idx !== undefined ? idx : null;
  const statusEl = document.getElementById('scan-status');
  if (statusEl) statusEl.style.display = 'none';
  document.getElementById('cert-modal-title').textContent = editingCertIdx !== null ? 'Edit Certificate' : 'Add Certificate';
  if (editingCertIdx !== null) {
    const c = certs[editingCertIdx];
    document.getElementById('cert-name-in').value   = c.name    || '';
    document.getElementById('cert-issuer-in').value = c.issuer  || '';
    document.getElementById('cert-number-in').value = c.number  || '';
    document.getElementById('cert-issue-in').value  = c.issued  ? fmtDate(c.issued)  : '';
    document.getElementById('cert-expiry-in').value = c.expiry  ? fmtDate(c.expiry)  : '';
  } else {
    ['cert-name-in','cert-issuer-in','cert-number-in','cert-issue-in','cert-expiry-in']
      .forEach(id => { document.getElementById(id).value = ''; });
  }
  document.getElementById('cert-modal')?.classList.add('open');
}
function closeCertModal() {
  document.getElementById('cert-modal')?.classList.remove('open');
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
  if (editingCertIdx !== null) {
    certs[editingCertIdx] = cert;
  } else {
    certs.push(cert);
  }
  certs.sort((a,b) => { if (!a.expiry) return 1; if (!b.expiry) return -1; return a.expiry.localeCompare(b.expiry); });
  saveCerts();
  closeCertModal();
  renderCerts();
}

function deleteCert(i) {
  customConfirm('Delete certificate', `Delete "${certs[i]?.name}"? This cannot be undone.`)
    .then(ok => { if (!ok) return; certs.splice(i,1); saveCerts(); renderCerts(); });
}

async function handleCertScan(event) {
  const file = event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('scan-status');
  statusEl.style.display = 'block';
  statusEl.style.color   = 'var(--gold)';
  statusEl.textContent   = '⏳ Scanning… may take a few seconds';
  try {
    const token      = await currentUser.getIdToken();
    const base64Data = await fileToBase64(file);
    const response   = await fetch(SCAN_CERT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ image: base64Data, mediaType: file.type })
    });
    if (!response.ok) throw new Error('Connection error');
    const aiData = await response.json();
    document.getElementById('cert-name-in').value   = aiData.name    || '';
    document.getElementById('cert-issuer-in').value = aiData.issuer  || '';
    document.getElementById('cert-number-in').value = aiData.number  || '';
    document.getElementById('cert-issue-in').value  = aiData.issued  || '';
    document.getElementById('cert-expiry-in').value = aiData.expiry  || '';
    statusEl.style.color   = 'var(--green)';
    statusEl.textContent   = '✅ Done! Review the data and click Save.';
  } catch (err) {
    console.error(err);
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = '❌ Scan failed. Please enter details manually.';
  } finally {
    event.target.value = '';
  }
}

// ═══ EXPENSES ═════════════════════════════════════════════════
// Returns ALL periods from earliest data through one month ahead
function getPayrollMonthOptions() {
  const periods = getAllPayrollPeriods();
  // Ensure at least 13 upcoming periods even with no data
  if (periods.length === 0) {
    const today = new Date();
    let y = today.getFullYear();
    let m = today.getMonth();
    if (m === 0) { m = 11; y--; } else { m--; }
    for (let i = 0; i < 13; i++) {
      const prevM = m === 0 ? 11 : m - 1;
      const prevY = m === 0 ? y - 1 : y;
      periods.push({
        start: dateStr(prevY, prevM, 21),
        end:   dateStr(y, m, 20),
        label: `${MONTHS_S[prevM]} 21 – ${MONTHS_S[m]} 20, ${y}`
      });
      m++; if (m > 11) { m = 0; y++; }
    }
  }
  return periods.map(p => ({ value: p.end, label: p.label }));
}

function renderExpenses() {
  const wrap = document.getElementById('exp-list-wrap');
  if (!wrap) return;
  if (expenses.length === 0) {
    wrap.innerHTML = '<div class="exp-empty">No expenses yet — upload a Word document above to get started</div>';
    return;
  }
  const grouped = {};
  expenses.forEach((e, i) => {
    const key = e.payrollPeriod || 'unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ ...e, _idx: i });
  });
  const opts    = getPayrollMonthOptions();
  const labelFor = val => (opts.find(o => o.value === val) || {}).label || val;

  wrap.innerHTML = Object.entries(grouped).map(([period, items]) => {
    const total = items.reduce((s,e) => s + (parseFloat(e.usd)||0), 0);
    return `<div class="exp-group">
      <div class="exp-group-title">📅 ${labelFor(period)}
        <span style="float:right;color:var(--green)">Total: $${total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
      </div>
      ${items.map(e => `<div class="exp-card">
        <div class="exp-card-left">
          <div class="exp-card-desc">${e.desc}</div>
          <div class="exp-card-meta">${e.origAmount} ${e.currency} → <strong style="color:var(--green)">$${parseFloat(e.usd).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} USD</strong>${e.notes ? ' · '+e.notes : ''}</div>
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
    document.getElementById('exp-desc-in').value     = e.desc        || '';
    document.getElementById('exp-orig-in').value     = e.origAmount  || '';
    document.getElementById('exp-currency-in').value = e.currency    || 'USD';
    document.getElementById('exp-usd-in').value      = e.usd         || '';
    document.getElementById('exp-notes-in').value    = e.notes       || '';
    document.getElementById('exp-month-in').value    = e.payrollPeriod || opts[0]?.value;
  } else {
    document.getElementById('exp-desc-in').value     = '';
    document.getElementById('exp-orig-in').value     = '';
    document.getElementById('exp-currency-in').value = 'USD';
    document.getElementById('exp-usd-in').value      = '';
    document.getElementById('exp-notes-in').value    = '';
    // Default to current period
    const todaySt = todayStr();
    const cur = opts.find(o => o.value >= todaySt) || opts[0];
    document.getElementById('exp-month-in').value = cur?.value || opts[0]?.value;
  }
  document.getElementById('exp-modal').classList.add('open');
}
function closeExpModal() { document.getElementById('exp-modal')?.classList.remove('open'); }
function handleExpModalOverlay(e) { if (e.target === document.getElementById('exp-modal')) closeExpModal(); }

function saveExpense() {
  const desc    = document.getElementById('exp-desc-in').value.trim();
  const orig    = parseFloat(document.getElementById('exp-orig-in').value);
  const currency= document.getElementById('exp-currency-in').value;
  const usdVal  = parseFloat(document.getElementById('exp-usd-in').value);
  const notes   = document.getElementById('exp-notes-in').value.trim();
  const period  = document.getElementById('exp-month-in').value;
  const idxStr  = document.getElementById('exp-editing-idx').value;

  if (!desc)           { alert('Description is required.');        return; }
  if (isNaN(orig))     { alert('Enter a valid original amount.');   return; }
  if (isNaN(usdVal))   { alert('Enter a valid USD amount.');        return; }
  if (!period)         { alert('Select a payroll period.');         return; }

  const entry = { desc, origAmount: orig, currency, usd: usdVal, notes, payrollPeriod: period };
  if (idxStr !== '') { expenses[parseInt(idxStr)] = entry; } else { expenses.push(entry); }
  saveExpenses();
  closeExpModal();
  renderExpenses();
  renderPayroll();
}

function deleteExpense(i) {
  customConfirm('Delete expense', `Delete "${expenses[i]?.desc}"?`)
    .then(ok => {
      if (!ok) return;
      expenses.splice(i,1);
      saveExpenses();
      renderExpenses();
      renderPayroll();
    });
}

async function handleExpenseScan(event) {
  const file = event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('exp-scan-status');
  statusEl.style.display = 'block';
  statusEl.style.color   = 'var(--gold)';
  statusEl.textContent   = '⏳ Reading document and converting currencies… (~15 seconds)';
  try {
    const token      = await currentUser.getIdToken();
    const base64Data = await fileToBase64(file);
    const response   = await fetch(SCAN_EXPENSE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ file: base64Data, fileName: file.name })
    });
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    if (data._parseError) {
      statusEl.style.color = 'var(--amber)';
      statusEl.textContent = '⚠️ Partial read — check and fill manually.';
      openExpModal(); return;
    }
    const notesStr = (data.subtotals || [])
      .map(s => `${s.currency} ${s.total} = $${parseFloat(s.usd).toFixed(2)}`).join(' · ')
      || data.notes || '';

    statusEl.style.color = 'var(--green)';
    statusEl.textContent = `✅ Found ${(data.items||[]).length} items · Total $${parseFloat(data.totalUSD).toFixed(2)} USD`;

    openExpModal();
    setTimeout(() => {
      document.getElementById('exp-desc-in').value     = data.description || file.name;
      document.getElementById('exp-orig-in').value     = data.totalUSD || 0;
      document.getElementById('exp-currency-in').value = 'USD';
      document.getElementById('exp-usd-in').value      = parseFloat(data.totalUSD).toFixed(2) || 0;
      document.getElementById('exp-notes-in').value    = notesStr.substring(0,120);
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

// ═══ ADMIN ════════════════════════════════════════════════════
async function _adminFetch(body) {
  const token = await currentUser.getIdToken(true);
  return fetch(ADMIN_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(body)
  }).then(r => r.json());
}

async function adminCreateUser() {
  const email  = document.getElementById('admin-new-email').value.trim();
  const pass   = document.getElementById('admin-new-pass').value.trim();
  const msgEl  = document.getElementById('admin-create-msg');
  if (!email || !pass)  { msgEl.style.color = 'var(--red)'; msgEl.textContent = 'Email and password required.'; return; }
  if (pass.length < 6)  { msgEl.style.color = 'var(--red)'; msgEl.textContent = 'Password must be at least 6 characters.'; return; }
  msgEl.style.color = 'var(--gold)'; msgEl.textContent = 'Creating user…';
  try {
    const data = await _adminFetch({ action: 'create', email, password: pass });
    if (data.error) throw new Error(data.error);
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = `✅ User ${email} created!`;
    document.getElementById('admin-new-email').value = '';
    document.getElementById('admin-new-pass').value  = '';
    renderAdminPanel();
  } catch (err) {
    msgEl.style.color = 'var(--red)'; msgEl.textContent = '❌ ' + err.message;
  }
}

async function adminDeleteUser(uid, email) {
  const ok = await customConfirm('Delete user', `Delete ${email}? This cannot be undone.`);
  if (!ok) return;
  try {
    await _adminFetch({ action: 'delete', uid });
    renderAdminPanel();
  } catch (err) { alert('Error: ' + err.message); }
}

async function adminDisableUser(uid) {
  try { await _adminFetch({ action: 'disable', uid }); renderAdminPanel(); }
  catch (err) { alert('Error: ' + err.message); }
}

async function adminEnableUser(uid) {
  try { await _adminFetch({ action: 'enable', uid }); renderAdminPanel(); }
  catch (err) { alert('Error: ' + err.message); }
}

async function renderAdminPanel() {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  const wrap = document.getElementById('admin-users-list');
  if (!wrap) return;
  wrap.innerHTML = '<div style="color:var(--gray400);font-size:13px">Loading users…</div>';

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
              &nbsp;·&nbsp; Last login: ${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('en-GB') : 'Never'}
              ${u.disabled ? ' &nbsp;·&nbsp; <span style="color:var(--red)">DISABLED</span>' : ''}
            </div>
          </div>
          <div class="admin-user-actions">
            ${u.disabled
              ? `<button class="admin-btn-enable"  onclick="adminEnableUser('${u.uid}')">Enable</button>`
              : `<button class="admin-btn-disable" onclick="adminDisableUser('${u.uid}')">Disable</button>`}
            <button class="admin-btn-del" onclick="adminDeleteUser('${u.uid}','${u.email}')">Delete</button>
          </div>
        </div>`).join('');
    }
  } catch (err) {
    wrap.innerHTML = `<div style="color:var(--red);font-size:13px">❌ Error: ${err.message}</div>`;
  }

  // Load email settings only once per panel visit
  if (!emailSettingsLoaded) { loadEmailSettings(); emailSettingsLoaded = true; }
}

// ═══ ADMIN EMAIL SETTINGS ═════════════════════════════════════
function loadEmailSettings() {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  db.collection('adminSettings').doc('emailNotifications').get()
    .then(doc => {
      const s = doc.exists ? doc.data() : {
        enabled: true, thresholds: [60,30,7],
        customThreshold: null, fromEmail: ADMIN_EMAIL
      };
      const set = (id, val) => { const el = document.getElementById(id); if(el) el[typeof val === 'boolean' ? 'checked' : 'value'] = val ?? ''; };
      set('alert-enabled',    s.enabled !== false);
      set('alert-60',         s.thresholds?.includes(60) !== false);
      set('alert-30',         s.thresholds?.includes(30) !== false);
      set('alert-7',          s.thresholds?.includes(7)  !== false);
      set('alert-custom',     s.customThreshold || '');
      set('alert-from-email', s.fromEmail || ADMIN_EMAIL);
      updateSchedulePreview(s);
      const status = document.getElementById('firestore-settings-status');
      if (status) status.innerHTML = '<div style="color:var(--green);font-size:12px">✅ Settings loaded from Firestore</div>';
    })
    .catch(() => updateSchedulePreview(null));
}

function getSelectedThresholds() {
  const t = [];
  if (document.getElementById('alert-60')?.checked) t.push(60);
  if (document.getElementById('alert-30')?.checked) t.push(30);
  if (document.getElementById('alert-7')?.checked)  t.push(7);
  const c = parseInt(document.getElementById('alert-custom')?.value);
  if (!isNaN(c) && c > 0 && c <= 365) t.push(c);
  return [...new Set(t)];
}

function updateSchedulePreview(settings) {
  const previewEl = document.getElementById('email-schedule-preview');
  if (!previewEl) return;
  const enabled = document.getElementById('alert-enabled')?.checked;
  if (!enabled) { previewEl.innerHTML = '<span style="color:var(--red)">⏸ Notifications are paused</span>'; return; }
  const thresholds = getSelectedThresholds();
  if (thresholds.length === 0) { previewEl.innerHTML = '<span style="color:var(--amber)">⚠️ No thresholds selected</span>'; return; }
  previewEl.innerHTML = thresholds.sort((a,b) => b-a).map(d => {
    const color = d <= 7 ? 'var(--red)' : d <= 30 ? 'var(--amber)' : 'var(--gold)';
    return `<div>📧 Email sent when <strong style="color:${color}">${d} days</strong> remain before expiry</div>`;
  }).join('') + '<div style="margin-top:6px;color:var(--gray400)">⏰ Runs daily at 08:00 Warsaw time</div>';
}

async function saveEmailSettings() {
  const settings = {
    enabled:         document.getElementById('alert-enabled').checked,
    thresholds:      getSelectedThresholds(),
    customThreshold: parseInt(document.getElementById('alert-custom').value) || null,
    fromEmail:       document.getElementById('alert-from-email').value.trim(),
    updatedAt:       new Date().toISOString(),
    updatedBy:       currentUser.email
  };
  updateSchedulePreview(settings);
  try {
    await db.collection('adminSettings').doc('emailNotifications').set(settings);
    const status = document.getElementById('firestore-settings-status');
    if (status) status.innerHTML = '<div style="color:var(--green);font-size:12px">✅ Saved in Firestore</div>';
  } catch (err) {
    const status = document.getElementById('firestore-settings-status');
    if (status) status.innerHTML = `<div style="color:var(--red);font-size:12px">❌ ${err.message}</div>`;
  }
}

async function sendTestEmail() {
  const msgEl = document.getElementById('email-settings-msg');
  if (!msgEl) return;
  msgEl.style.color = 'var(--gold)'; msgEl.textContent = '⏳ Sending test email…';
  try {
    const token     = await currentUser.getIdToken();
    const fromEmail = document.getElementById('alert-from-email').value.trim();
    const resp      = await fetch(TEST_EMAIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ fromEmail })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = `✅ Test email sent to ${currentUser.email}!`;
  } catch (err) {
    msgEl.style.color = 'var(--red)'; msgEl.textContent = '❌ ' + err.message;
  }
}

// ═══ PWA SERVICE WORKER ═══════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(r  => console.log('CrewX SW registered:', r.scope))
      .catch(e => console.warn('CrewX SW registration failed:', e));
  });
}

// ═══ INITIAL RENDER ═══════════════════════════════════════════
renderRates();
renderCalendar();
