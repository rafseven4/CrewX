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
const syncDoc = db.collection('appData').doc('moje_dane_crewx'); // Stały dokument dla Twoich danych

// ═══ STATE & SYNC ════════════════════════════════════════════════════════
let events = JSON.parse(localStorage.getItem('crewxEvents') || '[]');
let rates  = JSON.parse(localStorage.getItem('crewxRates')  || '[]');
let rhGrid = JSON.parse(localStorage.getItem('crewxRHGrid') || '{}');
let rhMeta = JSON.parse(localStorage.getItem('crewxRHMeta') || '{}');
let certs  = JSON.parse(localStorage.getItem('crewxCerts')  || '[]');

let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let selectedDate = null;
let editingCertIdx = null;

// ═══ CLOUD SYNC — bezpieczna logika startowa ══════════════════════
// Flaga: czy już załadowaliśmy dane z chmury przy starcie
let cloudLoaded = false;

syncDoc.get().then((doc) => {
  if (!doc.exists) {
    // Dokument nie istnieje w chmurze — pierwszy raz na tym koncie
    // Zapisujemy lokalne dane TYLKO jeśli lokalnie coś jest
    const hasLocalData = events.length > 0 || rates.length > 0 || certs.length > 0;
    if (hasLocalData) {
      console.log("Pierwszy raz — wysyłam dane lokalne do chmury");
      saveToCloud();
    } else {
      console.log("Brak danych lokalnych i w chmurze — czysta instalacja");
    }
  }
  // Jeśli dokument istnieje, onSnapshot załaduje dane automatycznie
}).catch(err => console.error("Błąd sprawdzania chmury:", err));

// Nasłuchiwanie zmian na żywo z chmury
syncDoc.onSnapshot((doc) => {
  if (!doc.exists) return;

  const data = doc.data();
  const cloudEvents = data.events || [];
  const cloudRates  = data.rates  || [];
  const cloudRhGrid = data.rhGrid || {};
  const cloudRhMeta = data.rhMeta || {};
  const cloudCerts  = data.certs  || [];

  // Pierwsze załadowanie: chmura wygrywa nad lokalnym
  // Kolejne aktualizacje: zawsze bierz z chmury (real-time sync)
  events = cloudEvents;
  rates  = cloudRates;
  rhGrid = cloudRhGrid;
  rhMeta = cloudRhMeta;
  certs  = cloudCerts;
  cloudLoaded = true;

  // Kopia zapasowa lokalnie
  localStorage.setItem('crewxEvents', JSON.stringify(events));
  localStorage.setItem('crewxRates',  JSON.stringify(rates));
  localStorage.setItem('crewxRHGrid', JSON.stringify(rhGrid));
  localStorage.setItem('crewxRHMeta', JSON.stringify(rhMeta));
  localStorage.setItem('crewxCerts',  JSON.stringify(certs));

  // Odświeżanie interfejsu
  renderRates();
  renderCalendar();
  updateStats();
  if (document.getElementById('page-resthours').classList.contains('active')) renderRH();
  if (document.getElementById('page-certificates').classList.contains('active')) renderCerts();
}, (err) => {
  console.error("Błąd nasłuchiwania chmury:", err);
  // Fallback: używaj danych lokalnych jeśli brak połączenia
  renderRates();
  renderCalendar();
  updateStats();
});

// Zapisywanie do Firebase
function saveToCloud() {
  syncDoc.set({ events, rates, rhGrid, rhMeta, certs }, { merge: true })
    .catch(err => console.error("Błąd zapisu do chmury:", err));
}

function saveEvents() { localStorage.setItem('crewxEvents', JSON.stringify(events)); saveToCloud(); }
function saveRates()  { localStorage.setItem('crewxRates',  JSON.stringify(rates));  saveToCloud(); }
function saveRHGrid() { localStorage.setItem('crewxRHGrid', JSON.stringify(rhGrid)); saveToCloud(); }
function saveRHMeta() { localStorage.setItem('crewxRHMeta', JSON.stringify(rhMeta)); saveToCloud(); }
function saveCerts()  { localStorage.setItem('crewxCerts',  JSON.stringify(certs));  saveToCloud(); }


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
function getTrips()        { return getPairs('depart',   'arrive');    }
function getBrazilStays()  { return getPairs('brazil-in','brazil-out');}
function getOnboardStays() { return getPairs('sign-on',  'sign-off');  }

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

  // Generuj okresy do końca roku niezależnie od wyjazdów
  const today = new Date();
  const endOfYear = new Date(today.getFullYear(), 11, 31);

  // Znajdź najwcześniejszą datę rate
  const allDates = rates.map(r => r.from).sort();
  if (allDates.length === 0) {
    body.innerHTML = '<div class="empty-state">Log trip events to calculate earnings</div>';
    return;
  }

  const awayDates = getRangeDates(getTrips());
  const earliest = new Date(allDates[0] + 'T00:00:00');

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
      if (awayDates.has(ds)) {
        days++;
        earnings += getRateForDate(ds);
      }
    }

    periods.push({
      label: `${MONTHS_S[prevM]} 21 – ${MONTHS_S[m]} 20, ${y}`,
      periodEnd, periodStart, days, earnings
    });

    m++;
    if (m > 11) { m = 0; y++; }
  }

  // Pokaż: okresy z dniami + bieżący + wszystkie przyszłe
  const todayStr = today.toISOString().slice(0,10);
  const visible = periods.filter(p => p.days > 0 || p.periodEnd >= todayStr);

  if (visible.length === 0) {
    body.innerHTML = '<div class="empty-state">Log trip events to calculate earnings</div>';
    return;
  }

  let totalDays = 0, totalEarn = 0;
  visible.forEach(p => { totalDays += p.days; totalEarn += p.earnings; });

  const rows = visible.map(p => {
    const isCurrent = todayStr <= p.periodEnd && todayStr >= p.periodStart;
    return `<tr class="${isCurrent ? 'current-period' : ''}">
      <td class="period-col">${p.label}</td>
      <td class="days-col">${p.days}</td>
      <td class="earn-col">$${p.earnings.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <table class="payroll-table">
      <thead><tr>
        <th>Period</th>
        <th style="text-align:center">Days</th>
        <th style="text-align:right">Earned</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td>Total</td>
          <td class="days-col">${totalDays}</td>
          <td class="earn-col">$${totalEarn.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
        </tr>
      </tbody>
    </table>
    <div style="font-size:10px;color:var(--gray400);margin-top:8px;text-align:center">
      Highlighted row = current active period &nbsp;·&nbsp; cut-off: 20th each month
    </div>
  `;
}

// ═══ STATS ════════════════════════════════════════════════════════
function updateStats() {
  const trips        = getTrips();
  const brazilStays  = getBrazilStays();
  const onboardStays = getOnboardStays();
  const awayDates    = getRangeDates(trips);
  const brazilDates  = getRangeDates(brazilStays);
  const onboardDates = getRangeDates(onboardStays);

  const rotEvDates = new Set(events.filter(e => ['depart','arrive'].includes(e.type)).map(e => e.date));
  let travel = 0;
  for (const ds of awayDates) { if (rotEvDates.has(ds)) travel++; }

  document.getElementById('stat-away').innerHTML     = `${awayDates.size} <span class="stat-unit">d</span>`;
  document.getElementById('stat-brazil').innerHTML   = `${brazilDates.size} <span class="stat-unit">d</span>`;
  document.getElementById('stat-onboard').innerHTML  = `${onboardDates.size} <span class="stat-unit">d</span>`;
  document.getElementById('stat-travel').innerHTML   = `${travel} <span class="stat-unit">d</span>`;
  document.getElementById('stat-trips').textContent  = trips.filter(t=>t.end).length;
  document.getElementById('stat-contracts').textContent = onboardStays.filter(o=>o.end).length;

  // status pill
  const todayStr = new Date().toISOString().slice(0,10);
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const inBrazil  = brazilDates.has(todayStr);
  const isOnboard = onboardDates.has(todayStr);
  if (isOnboard) {
    dot.style.background = '#f97316'; text.textContent = '⚓ Onboard' + (inBrazil ? ' · 🇧🇷' : '');
  } else if (awayDates.has(todayStr)) {
    dot.style.background = '#38bdf8'; text.textContent = 'Away' + (inBrazil ? ' · 🇧🇷 Brazil' : '');
  } else {
    dot.style.background = '#94a3b8'; text.textContent = 'At home';
  }

  // lists
  const fmt = ds => ds.slice(5).replace('-','/');
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
  renderList('trips-list',  'trips-info',  trips,        (t,i)=>`Trip ${i+1} &nbsp; ${fmt(t.start)} → ${t.end?fmt(t.end):'…'}`, 'ibadge-blue');
  renderList('brazil-list', 'brazil-info', brazilStays,  (b,i)=>`Stay ${i+1} &nbsp; ${fmt(b.start)} → ${b.end?fmt(b.end):'…'}`, 'ibadge-green');
  renderList('onboard-list','onboard-info',onboardStays, (o,i)=>`Contract ${i+1} &nbsp; ${fmt(o.start)} → ${o.end?fmt(o.end):'…'}`, 'ibadge-amber');
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

  const trips        = getTrips();
  const onboardStays = getOnboardStays();
  const awayDates    = getRangeDates(trips, true);
  const brazilDates  = getRangeDates(getBrazilStays(), true);
  const onboardDates = getRangeDates(onboardStays, true);

  for (let i = 0; i < offset; i++) {
    const e = document.createElement('div'); e.className='day empty'; cal.appendChild(e);
  }

  const EV_LABEL = {
    depart:'left home', arrive:'arrived',
    'brazil-in':'🇧🇷 in', 'brazil-out':'✈️ out',
    'sign-on':'⚓ on', 'sign-off':'🔄 off'
  };
  const EV_CLASS = {
    depart:'ev-depart', arrive:'ev-arrive',
    'brazil-in':'ev-brazil-in','brazil-out':'ev-brazil-out',
    'sign-on':'ev-sign-on','sign-off':'ev-sign-off'
  };

  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = dateStr(currentYear, currentMonth, d);
    const div = document.createElement('div');
    div.className = 'day';

    const isToday = today.getFullYear()===currentYear && today.getMonth()===currentMonth && today.getDate()===d;
    if (isToday)              div.classList.add('today');
    if (awayDates.has(ds))    div.classList.add('range-away');
    if (brazilDates.has(ds))  div.classList.add('range-brazil');
    if (onboardDates.has(ds)) div.classList.add('range-onboard');
    if (d === 20)             div.classList.add('payroll-end');
    if (d === 21)             div.classList.add('payroll-start');

    let html = `<div class="day-num">${d}</div>`;
    if (d === 20) html += `<div class="payroll-marker">✂ PAY</div>`;

    getEventsForDate(ds).forEach(ev => {
      html += `<span class="event-marker ${EV_CLASS[ev.type]}">${EV_LABEL[ev.type]}</span><br>`;
    });

    const trip = trips.find(t => t.end === ds);
    if (trip && durDays(trip)) html += `<span class="badge-away">${durDays(trip)}d</span>`;

    const contract = onboardStays.find(o => o.end === ds);
    if (contract && durDays(contract)) html += `<span class="badge-onboard">⚓${durDays(contract)}d</span>`;

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
  if (name === 'resthours')  { renderRH(); bindRHMetaFields(); }
  if (name === 'certificates') renderCerts();
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
// ═══ AI SCANNER (CLAUDE) ══════════════════════════════════════════

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

// Główna funkcja wysyłająca obraz do naszej chmury
async function handleCertScan(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('scan-status');
  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--gold)';
  statusEl.textContent = '⏳ Skanowanie w toku... (może to potrwać kilkanaście sekund)';

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

    if (!response.ok) throw new Error("Błąd podczas połączenia z chmurą");

    const aiData = await response.json();

    // Wypełnianie inputów na żywo
    document.getElementById('cert-name-in').value = aiData.name || '';
    document.getElementById('cert-issuer-in').value = aiData.issuer || '';
    document.getElementById('cert-number-in').value = aiData.number || '';
    document.getElementById('cert-issue-in').value = aiData.issued || '';
    document.getElementById('cert-expiry-in').value = aiData.expiry || '';

    statusEl.style.color = 'var(--green)';
    statusEl.textContent = '✅ Gotowe! Sprawdź poprawność danych i kliknij Save.';

  } catch (error) {
    console.error(error);
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = '❌ Wystąpił błąd podczas skanowania. Wprowadź dane ręcznie.';
  } finally {
    event.target.value = ''; // Resetujemy pole pliku
  }
}
