/* Bill's Garage — app logic (vanilla JS, no build step, data stays on the device) */
'use strict';

/* ======================= storage (IndexedDB) ======================= */
const DB_NAME = 'bills-garage';
let idb = null;
function openDB() {
  return new Promise((res) => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('files'); };
      r.onsuccess = () => { idb = r.result; res(idb); };
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
function idbGet(store, key) {
  return new Promise((res) => {
    if (!idb) return res(undefined);
    try { const q = idb.transaction(store).objectStore(store).get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }
    catch (e) { res(undefined); }
  });
}
function idbPut(store, key, val) {
  return new Promise((res) => {
    if (!idb) return res(false);
    try { const tx = idb.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = () => res(true); tx.onerror = () => res(false); }
    catch (e) { res(false); }
  });
}
function idbDel(store, key) {
  return new Promise((res) => {
    if (!idb) return res(false);
    try { const tx = idb.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = () => res(true); }
    catch (e) { res(false); }
  });
}

const blank = () => ({
  v: 2,
  settings: { garage: "Bill's Garage", distUnit: 'mi', leadDays: 14, onboarded: false, notify: false, lastNotify: '', lastBackup: '' },
  machines: [], items: [], logs: [], notes: [], receipts: [], warranties: [], fuel: [], readings: [],
});
let S = blank();
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    idbPut('kv', 'state', JSON.parse(JSON.stringify(S)));
    try { localStorage.setItem('bg-state-mirror', JSON.stringify(S)); } catch (e) {}
  }, 120);
}
async function load() {
  await openDB();
  let st = await idbGet('kv', 'state');
  if (!st) { try { st = JSON.parse(localStorage.getItem('bg-state-mirror') || 'null'); } catch (e) {} }
  if (st && st.machines) { S = Object.assign(blank(), st); S.settings = Object.assign(blank().settings, st.settings || {}); }
}

/* photos */
const urlCache = {};
async function putPhoto(blob) { const id = uid(); await idbPut('files', id, blob); return id; }
async function photoURL(id) {
  if (!id) return null;
  if (urlCache[id]) return urlCache[id];
  const b = await idbGet('files', id);
  if (!b) return null;
  urlCache[id] = URL.createObjectURL(b);
  return urlCache[id];
}
function hydratePhotos(root = document) {
  root.querySelectorAll('img[data-fid]').forEach(async (img) => {
    const u = await photoURL(img.dataset.fid);
    if (u) { img.src = u; img.hidden = false; const ph = img.parentElement.querySelector('.art-svg'); if (ph) ph.style.display = 'none'; }
  });
}
function compress(file, max = 1600, q = 0.82) {
  return new Promise((res) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => { URL.revokeObjectURL(u); res(b || file); }, 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(u); res(file); };
    img.src = u;
  });
}

/* ======================= helpers ======================= */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const parseD = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const addMonths = (s, n) => { const d = parseD(s); const day = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() < day) d.setDate(0); return iso(d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
const fmtDate = (s, withYear) => { if (!s) return ''; const d = parseD(s); const y = withYear || d.getFullYear() !== new Date().getFullYear(); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}) }); };
const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; };
const fmtN = (n, u) => { if (n == null) return ''; const r = u === 'hrs' ? Math.round(n * 10) / 10 : Math.round(n); return r.toLocaleString() + (u ? ' ' + u : ''); };
const money = (n) => (n == null || isNaN(n)) ? '' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function humanDays(d) {
  d = Math.abs(Math.round(d));
  if (d === 0) return 'today';
  if (d < 14) return plural(d, 'day');
  if (d < 60) return plural(Math.round(d / 7), 'week');
  if (d < 730) return plural(Math.round(d / 30.4), 'month');
  return plural(Math.round(d / 365), 'year');
}
const M = (id) => S.machines.find((m) => m.id === id);
const I = (id) => S.items.find((i) => i.id === id);
const unitOf = (m) => m.unit || 'none';
const hasMeter = (m) => m.unit === 'mi' || m.unit === 'km' || m.unit === 'hrs';
const isVehicle = (m) => ['car', 'truck', 'motorcycle'].includes(m.cat);

/* ======================= due engine ======================= */
function usageRate(m) {
  const rs = S.readings.filter((r) => r.machineId === m.id).sort((a, b) => a.date.localeCompare(b.date));
  const recent = rs.filter((r) => daysBetween(r.date, todayISO()) <= 180);
  const use = recent.length >= 2 ? recent : rs;
  if (use.length >= 2) {
    const a = use[0], b = use[use.length - 1];
    const days = daysBetween(a.date, b.date);
    if (days >= 3 && b.value > a.value) return (b.value - a.value) / days;
  }
  let r = (CATS[m.cat] || CATS.other).rate;
  if (m.unit === 'km') r *= 1.609;
  return r || 0;
}
/* predicted current reading (readings drift between updates) */
function predictedReading(m) {
  if (!hasMeter(m)) return null;
  const days = Math.max(0, daysBetween(m.readingDate || todayISO(), todayISO()));
  return (m.reading || 0) + usageRate(m) * days;
}

function itemStatus(it) {
  const m = M(it.machineId);
  if (!m) return { state: 'ok', frac: 0, text: '', score: 9 };
  const today = todayISO();
  const useFirst = it.first && !S.logs.some((l) => (l.itemIds || []).includes(it.id) && !l.skipped);
  const every = useFirst ? { u: it.first.u ?? it.every.u, months: it.first.months ?? it.every.months } : it.every;
  const sev = m.severe && it.severe ? { u: it.severe.u ?? every.u, months: it.severe.months ?? every.months } : null;
  const ev = sev || every;
  const out = { state: 'ok', frac: 0, remU: null, remDays: null, dueDate: null, text: '', score: 9 };
  const rate = usageRate(m);
  const cur = m.reading || 0;
  let fracs = [];
  if (ev.u && hasMeter(m)) {
    const last = it.lastReading ?? cur;
    const remU = last + ev.u - cur;
    out.remU = remU;
    fracs.push((cur - last) / ev.u);
    if (rate > 0) { const dd = remU / rate; out.estDays = dd; out.dueDate = addDays(today, Math.round(dd)); }
  }
  if (ev.months) {
    const last = it.lastDate || today;
    const due = addMonths(last, ev.months);
    const total = Math.max(1, daysBetween(last, due));
    out.remDays = daysBetween(today, due);
    fracs.push(daysBetween(last, today) / total);
    if (!out.dueDate || due < out.dueDate) out.dueDate = due;
  }
  out.frac = Math.max(0, Math.min(1, fracs.length ? Math.max(...fracs) : 0));
  const lead = S.settings.leadDays || 14;
  const leadU = ev.u ? Math.max(ev.u * 0.1, m.unit === 'hrs' ? 3 : 300) : 0;
  const overU = out.remU != null && out.remU <= 0;
  const overD = out.remDays != null && out.remDays <= 0;
  const soonU = out.remU != null && (out.remU <= leadU || (out.estDays != null && out.estDays <= lead));
  const soonD = out.remDays != null && out.remDays <= lead;
  if (overU || overD) out.state = 'over'; else if (soonU || soonD) out.state = 'soon';
  const snoozed = it.snoozeUntil && it.snoozeUntil > today;
  if (snoozed && out.state !== 'ok') { out.state = 'snoozed'; }
  // text
  const u = UNIT_LABEL[m.unit];
  if (out.state === 'over') {
    if (overU && (!overD || -out.remU / (ev.u || 1) >= -out.remDays / 30)) out.text = Math.abs(out.remU) < (m.unit === 'hrs' ? 0.5 : 10) ? 'Due now' : `Overdue by ${fmtN(-out.remU, u)}`;
    else out.text = out.remDays === 0 ? 'Due today' : `Overdue by ${humanDays(out.remDays)}`;
    if (it.unknown && !S.logs.some((l) => (l.itemIds || []).includes(it.id))) out.text = 'Due now · last done unknown';
  } else {
    const parts = [];
    if (out.remU != null) parts.push(`${fmtN(out.remU, u)}`);
    if (out.remDays != null && (out.remU == null || out.remDays < (out.estDays ?? Infinity))) parts.push(humanDays(out.remDays));
    out.text = parts.length ? 'Due in ' + parts.join(' or ') : 'No interval set';
    if (out.remU != null && out.estDays != null && out.estDays < 400 && (out.remDays == null || out.estDays < out.remDays)) out.text += ` · ~${fmtDate(out.dueDate)}`;
  }
  if (snoozed) out.text = `Snoozed until ${fmtDate(it.snoozeUntil)}`;
  if (useFirst) out.text += ' · break-in';
  out.score = out.state === 'over' ? -1 + (1 - out.frac) * 0.01 : out.state === 'soon' ? 1 - out.frac : out.state === 'snoozed' ? 3 : 2 + (1 - out.frac);
  return out;
}
function liveItems(machineId) {
  return S.items.filter((i) => i.enabled !== false && (!machineId || i.machineId === machineId) && M(i.machineId) && !M(i.machineId).archived);
}
function ranked(machineId) {
  return liveItems(machineId).map((i) => ({ it: i, st: itemStatus(i) })).sort((a, b) => a.st.score - b.st.score);
}
function machineWorst(mid) {
  const r = ranked(mid);
  return r.length ? r[0].st.state : 'ok';
}

/* create schedule items for a machine from the template database */
function itemFromTemplate(m, tp, opts = {}) {
  const conv = (o) => {
    if (!o) return null;
    let u = null;
    if (m.unit === 'mi') u = o.mi ?? null;
    if (m.unit === 'km') u = o.mi ? Math.round(o.mi * 1.609 / 500) * 500 : null;
    if (m.unit === 'hrs') u = o.hrs ?? null;
    return { u, months: o.months ?? null };
  };
  const ev = conv(tp.every);
  if (!ev.u && !ev.months) ev.months = 12;
  return {
    id: uid(), machineId: m.id, key: tp.key, title: tp.title, icon: tp.icon,
    every: ev, severe: conv(tp.severe), first: opts.isNew ? conv(tp.first) : null,
    lastDate: opts.lastDate || todayISO(), lastReading: opts.lastReading ?? (m.reading || 0),
    enabled: true, need: tp.need || [], how: tp.how || tp.title, notes: '', created: todayISO(),
  };
}
function templatesFor(m) { return TEMPLATES[m.cat] || []; }

/* ======================= router ======================= */
const app = () => $('#app');
let lastScroll = {};
function go(h) { if (location.hash === h) render(); else location.hash = h; }
function back(fallback = '#/') { if (history.length > 1 && document.referrer !== undefined && sessionStorage.getItem('bg-nav') > 1) history.back(); else go(fallback); }
window.addEventListener('hashchange', () => { sessionStorage.setItem('bg-nav', (+sessionStorage.getItem('bg-nav') || 0) + 1); render(); });

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  return h.split('/').filter(Boolean).map(decodeURIComponent);
}
function render() {
  closeFab();
  const r = route();
  if (!S.settings.onboarded && r[0] !== 'welcome' && r[0] !== 'add' && r[0] !== 'added' && r[0] !== 'suggest') { location.replace('#/welcome/1'); return; }
  const [a, b, c, d] = r;
  let html = '';
  try {
    if (!a) html = vGarage();
    else if (a === 'welcome') html = vWelcome(+b || 1);
    else if (a === 'schedule') html = vSchedule();
    else if (a === 'profile') html = vProfile();
    else if (a === 'm' && M(b)) {
      if (c === 'edit') html = vEditMachine(b);
      else if (c === 'specs') html = vSpecs(b);
      else if (c === 'add-maint') html = vAddMaint(b);
      else if (c === 'report') html = vReport(b);
      else if (c === 'recalls') html = vRecalls(b);
      else html = vMachine(b, c || 'upcoming');
    }
    else if (a === 'i' && I(b)) html = vItem(b);
    else if (a === 'add') html = vAdd(+b || 1);
    else if (a === 'added' && M(b)) html = vAdded(b);
    else if (a === 'suggest' && M(b)) html = vSuggest(b);
    else if (a === 'custom' && M(b)) html = vCustom(b, c);
    else if (a === 'receipt' && M(b)) html = vReceipt(b, c);
    else if (a === 'warranty' && M(b)) html = vWarranty(b, c);
    else if (a === 'note' && M(b)) html = vNote(b, c);
    else if (a === 'fuel' && M(b)) html = vFuel(b);
    else if (a === 'checklist' && M(b)) html = vChecklist(b, c);
    else if (a === 'archived') html = vArchived();
    else html = vGarage();
  } catch (e) { console.error(e); html = `<div class="screen"><div class="empty"><b>Something went wrong.</b><span>${esc(e.message)}</span><button class="btn secondary" data-act="home">Back to garage</button></div></div>`; }
  app().innerHTML = html;
  window.scrollTo(0, 0);
  hydratePhotos(app());
  after.forEach((f) => f()); after = [];
}
let after = [];

/* ======================= shared UI pieces ======================= */
const backBtn = (to) => `<button class="rbtn" data-act="back" data-to="${esc(to || '#/')}" aria-label="Back">${icon('back', 18)}</button>`;
function topBar(title, to, right = '') {
  return `<div class="hdr"><div class="left">${backBtn(to)}<div class="h-title sm">${esc(title)}</div></div>${right}</div>`;
}
const steps = (n, on) => `<div class="steps">${Array.from({ length: n }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div>`;
const field = (label, inner) => `<label class="field"><span>${esc(label)}</span>${inner}</label>`;
const inp = (id, val, ph, type = 'text', extra = '') => `<input class="inp" id="${id}" type="${type}" value="${esc(val ?? '')}" placeholder="${esc(ph || '')}" ${extra}>`;
function nav(on) {
  return `<nav class="nav">
    <button class="${on === 'garage' ? 'on' : ''}" data-act="go" data-to="#/">${icon('garage', 24)}Garage</button>
    <button class="${on === 'schedule' ? 'on' : ''}" data-act="go" data-to="#/schedule">${icon('calendar', 24)}Schedule</button>
    <button class="${on === 'profile' ? 'on' : ''}" data-act="go" data-to="#/profile">${icon('person', 24)}Profile</button>
  </nav>`;
}
function chip(it, st) {
  const cls = st.state === 'over' ? 'over' : st.state === 'soon' ? 'warn' : 'ok';
  return `<span class="chip ${cls}">${icon(it.icon, 15)}${esc(shortTitle(it.title))}</span>`;
}
function shortTitle(t) { return t.replace(/ change$| & filter$| inspection$| check$/i, '').replace(/^Sharpen /, '').replace(/^Clean & lube /, '').replace(/^Clean /, ''); }
function machineCard(m, large) {
  const r = ranked(m.id).filter((x) => x.st.state === 'over' || x.st.state === 'soon').slice(0, large ? 3 : 2);
  const chips = r.length ? r.map((x) => chip(x.it, x.st)).join('') : `<span class="chip ghost">${icon('check', 14)}All good</span>`;
  const rd = hasMeter(m) && !large ? `<span class="reading">${fmtN(m.reading, UNIT_LABEL[m.unit])}</span>` : '';
  const tag = large ? 'div' : 'button';
  return `<${tag} class="mcard ${large ? 'large' : ''}" ${large ? '' : `data-act="go" data-to="#/m/${m.id}"`} aria-label="${esc(m.name)}">
    <div class="photo">${art(m.cat, large ? 96 : 76)}${m.photoId ? `<img data-fid="${m.photoId}" alt="" hidden>` : ''}</div>
    <div class="shade"></div>${rd}
    <div class="info"><div class="name">${esc(m.name)}</div><div class="chips">${chips}</div></div>
  </${tag}>`;
}
function mrow(it, st, opts = {}) {
  const m = M(it.machineId);
  const cls = st.state === 'over' ? 'over' : st.state === 'soon' ? 'warn' : '';
  const last = lastLogFor(it.id);
  const meta = last ? `Last ${fmtDate(last.date)}` : it.unknown ? 'Not logged yet' : it.lastDate ? `Since ${fmtDate(it.lastDate)}` : '';
  const logLabel = it.title.length <= 16 ? 'Log ' + it.title.toLowerCase() : 'Log it';
  if (st.state === 'over' && !opts.plain) {
    return `<div class="mrow urgent" data-act="go" data-to="#/i/${it.id}" role="button" tabindex="0">
      <div class="top">${chip(it, st)}<div class="mname" style="text-align:left">${esc(opts.showMachine === false ? it.title : m.name)}</div></div>
      <div class="mid"><span class="desc">${esc(st.text)}</span><span class="meta" style="color:#f3c4c4">${esc(meta)}</span></div>
      <div class="bigacts"><button class="logl" data-act="log" data-id="${it.id}">${esc(logLabel)}</button><button class="rbtn lg" data-act="snooze" data-id="${it.id}" aria-label="Snooze">${icon('snooze', 20)}</button></div>
    </div>`;
  }
  return `<div class="mrow" data-act="go" data-to="#/i/${it.id}" role="button" tabindex="0">
    <div class="top">${chip(it, st)}<div class="mname">${esc(opts.showMachine === false ? it.title : m.name)}</div>
      <div class="acts"><button class="rbtn sm" data-act="snooze" data-id="${it.id}" aria-label="Snooze">${icon('snooze', 14)}</button><button class="logs" data-act="log" data-id="${it.id}">Log</button></div></div>
    <div class="mid"><span class="desc">${esc(opts.showMachine === false ? st.text : `${it.title} · ${st.text}`)}</span><span class="meta">${esc(meta)}</span></div>
    <div class="bar ${cls}"><i style="width:${Math.round(Math.max(0.03, st.frac) * 100)}%"></i></div>
  </div>`;
}
const lastLogFor = (itemId) => S.logs.filter((l) => (l.itemIds || []).includes(itemId) && !l.skipped).sort((a, b) => b.date.localeCompare(a.date))[0];
function empty(ic, title, sub, btn) {
  return `<div class="empty"><div class="ibox">${icon(ic, 26)}</div><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}${btn || ''}</div>`;
}

/* ======================= onboarding ======================= */
const LINEUP = [['Zero-turn mower', 0], ['Generator', 1.9], ['Compact tractor', 3.6], ['Motorcycle', 5.0], ['Pressure washer', 6.6], ['Log splitter', 8.0]];
function vWelcome(n) {
  if (n === 1) {
    after.push(setupHero);
    return `<div class="screen stagger">
      <div class="hero" id="hero">
        <div class="iconlane"><div class="track">${['mower', 'generator', 'tractor', 'motorcycle', 'washer', 'splitter', 'truck', 'car', 'mower', 'generator', 'tractor', 'motorcycle', 'washer', 'splitter', 'truck', 'car'].map((a) => art(a, 120)).join('')}</div></div>
        <div class="floor"></div>
      </div>
      <h1 class="big-title">Keep every machine running</h1>
      <p class="note">Track maintenance, receipts and warranties for your trucks, mowers, generators and everything else in one place.</p>
      <div class="spacer"></div>
      <div class="actions-bottom"><button class="btn primary" data-act="go" data-to="#/welcome/2">Get started</button>
      <button class="btn text" data-act="restore-start">Restore from a backup file</button></div>
    </div>`;
  }
  if (n === 2) return `<div class="screen stagger">
    ${topBar('', '#/welcome/1')}${steps(3, 1)}
    <div class="list">${demoRow('over')}${demoRow('ok')}</div>
    <h2 class="headline">Never miss a service</h2>
    <p class="note">Reminders by miles, engine hours or date, whichever comes first. It learns how much you use each machine and estimates when things are due.</p>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="go" data-to="#/welcome/3">Next</button><button class="btn text" data-act="go" data-to="#/welcome/4">Skip</button></div>
  </div>`;
  if (n === 3) return `<div class="screen stagger">
    ${topBar('', '#/welcome/2')}${steps(3, 2)}
    <h2 class="headline">Everything in one spot</h2>
    <p class="note">Service history, receipts, warranties, notes and part numbers live with each machine. It all stays on this phone, even with no signal in the garage.</p>
    <div class="group">
      <div class="lrow"><div class="ibox">${icon('receipt', 18)}</div><div class="grow"><div class="t">Snap receipts</div><div class="d">Photo it and attach it to the job</div></div></div>
      <div class="lrow"><div class="ibox">${icon('shield', 18)}</div><div class="grow"><div class="t">Warranty countdowns</div><div class="d">Know before coverage runs out</div></div></div>
      <div class="lrow"><div class="ibox">${icon('oil', 18)}</div><div class="grow"><div class="t">Part numbers saved</div><div class="d">Oil type, filters and plugs per machine</div></div></div>
    </div>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="go" data-to="#/welcome/4">Next</button><button class="btn text" data-act="go" data-to="#/welcome/4">Skip</button></div>
  </div>`;
  return `<div class="screen stagger">
    ${topBar('', '#/welcome/3')}${steps(3, 3)}
    <h2 class="headline">Stay on schedule</h2>
    <p class="note">Get a heads-up when something's coming due. On iPhone, add this app to your Home Screen first (Share → Add to Home Screen) so reminders can show up.</p>
    <div class="group">
      <div class="trow"><div class="grow"><div class="t">Name your garage</div><div class="d">Shows at the top of the home screen</div></div></div>
      ${inp('garageName', S.settings.garage, "Bill's Garage")}
    </div>
    <div class="spacer"></div>
    <div class="actions-bottom">
      <button class="btn primary" data-act="finish-onboard" data-notify="1">Turn on reminders & add a machine</button>
      <button class="btn text" data-act="finish-onboard">Not now, just add a machine</button>
    </div>
  </div>`;
}
function demoRow(kind) {
  if (kind === 'over') return `<div class="mrow urgent"><div class="top"><span class="chip over">${icon('blade', 15)}Blades</span><div class="mname">Zero-turn</div><span class="meta" style="color:#fff">Last Sep 2</span></div><div class="desc">Overdue by 4 hrs</div><div class="bigacts"><span class="logl" style="display:grid;place-items:center">Log blades</span><span class="rbtn lg">${icon('snooze', 20)}</span></div></div>`;
  return `<div class="mrow"><div class="top"><span class="chip warn">${icon('oil', 15)}Oil</span><div class="mname">Pickup truck</div><div class="acts"><span class="logs">Log</span></div></div><div class="mid"><span class="desc">Due in 420 mi · ~Nov 14</span><span class="meta">Last Jun 3</span></div><div class="bar warn"><i style="width:86%"></i></div></div>`;
}
function setupHero() {
  const hero = $('#hero'); if (!hero) return;
  const img = new Image();
  img.onload = () => {
    if (!document.body.contains(hero)) return;
    hero.innerHTML = `<div class="lineup" style="background-image:url(lineup.jpg)"></div><div class="label" id="heroLabel">${LINEUP[0][0]}</div>`;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    LINEUP.forEach(([name, t]) => setTimeout(() => { const l = $('#heroLabel'); if (l) { l.textContent = name; l.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); } }, 600 + t * 1000));
  };
  img.src = 'lineup.jpg';
}

/* ======================= garage (home) ======================= */
function vGarage() {
  const ms = S.machines.filter((m) => !m.archived);
  const r = ranked().filter((x) => x.st.state !== 'snoozed');
  const urgent = r.filter((x) => x.st.state === 'over' || x.st.state === 'soon');
  const later = r.filter((x) => x.st.state === 'ok').slice(0, 6);
  const nudges = [];
  ms.forEach((m) => {
    if (hasMeter(m) && m.readingDate && daysBetween(m.readingDate, todayISO()) >= 21) {
      nudges.push(`<button class="nudge" data-act="reading" data-id="${m.id}"><div class="ibox">${icon('gauge', 20)}</div><div class="grow"><div class="t">Update ${esc(m.name)} ${m.unit === 'hrs' ? 'hours' : 'odometer'}?</div><div class="d">Last updated ${humanDays(daysBetween(m.readingDate, todayISO()))} ago · ${fmtN(m.reading, UNIT_LABEL[m.unit])}</div></div>${icon('back', 16, 'flip')}</button>`);
    }
  });
  S.warranties.forEach((w) => {
    const m = M(w.machineId); if (!m || m.archived || !w.end) return;
    const d = daysBetween(todayISO(), w.end);
    if (d >= 0 && d <= 60) nudges.push(`<button class="nudge warn" data-act="go" data-to="#/m/${m.id}/warranty"><div class="ibox">${icon('shield', 20)}</div><div class="grow"><div class="t">Warranty ends in ${humanDays(d)}</div><div class="d">${esc(m.name)} · ${esc(w.coverage || w.provider || 'Coverage')}</div></div></button>`);
  });
  const recallM = ms.filter((m) => m.recalls && m.recalls.length && !m.recallsSeen);
  recallM.forEach((m) => nudges.push(`<button class="nudge alert" data-act="go" data-to="#/m/${m.id}/recalls"><div class="ibox">${icon('alert', 20)}</div><div class="grow"><div class="t">${plural(m.recalls.length, 'recall')} found</div><div class="d">${esc(m.name)} · tap to review</div></div></button>`));

  return `<div class="screen has-nav">
    <div class="fixed-top">
      <div class="hdr"><button class="title-btn" data-act="rename-garage"><span class="h-title">${esc(S.settings.garage)}</span></button>
        <button class="rbtn lg" data-act="go" data-to="#/add" aria-label="Add machine">${icon('plus', 22)}</button></div>
      ${ms.length ? `<div class="carousel">${ms.map((m) => machineCard(m)).join('')}<button class="mcard add" data-act="go" data-to="#/add"><div><div class="rbtn">${icon('plus', 18)}</div>Add machine</div></button></div>` : ''}
    </div>
    ${!ms.length ? `<div class="card dark" style="text-align:center;padding:28px 18px">${art('truck', 84)}<h2 class="headline" style="margin:8px 0 6px">Add your first machine</h2><p class="note" style="margin-bottom:16px">Truck, mower, generator, anything with an engine. We'll suggest a maintenance schedule for it.</p><button class="btn primary" data-act="go" data-to="#/add">Add machine</button></div>` : ''}
    ${nudges.join('')}
    ${urgent.length ? `<div class="sec-title">Needs attention <button class="link" data-act="go" data-to="#/schedule">See all</button></div><div class="list">${urgent.slice(0, 5).map((x) => mrow(x.it, x.st)).join('')}</div>${urgent.length > 5 ? `<button class="btn secondary" data-act="go" data-to="#/schedule">${urgent.length - 5} more need attention</button>` : ''}` : ''}
    ${later.length ? `<div class="sec-title">${urgent.length ? 'Coming up' : 'Upcoming maintenance'}</div><div class="list">${later.map((x) => mrow(x.it, x.st)).join('')}</div>` : ''}
    ${ms.length && !r.length ? empty('wrench', 'Nothing scheduled yet', 'Open a machine and add maintenance to track.') : ''}
    ${ms.length && r.length && !urgent.length ? `<div class="empty" style="padding:8px">${icon('check', 18)}<span>Nothing due right now. Nice.</span></div>` : ''}
  </div>${nav('garage')}`;
}

/* ======================= machine page ======================= */
function vMachine(id, tab) {
  const m = M(id);
  const sub = hasMeter(m) ? `${fmtN(m.reading, UNIT_LABEL[m.unit])} · updated ${m.readingDate ? fmtDate(m.readingDate) : 'never'}` : esc(CATS[m.cat]?.label || '');
  let body = '';
  if (tab === 'history') body = machineHistory(m);
  else if (tab === 'notes') body = machineNotes(m);
  else if (tab === 'warranty') body = machineDocs(m);
  else body = machineUpcoming(m);
  return `<div class="screen">
    <div class="fixed-top">
      <div class="hdr"><div class="left">${backBtn('#/')}<div class="h-title sm">${esc(m.name)}</div></div>
        <div class="h-actions"><button class="rbtn" data-act="machine-menu" data-id="${m.id}" aria-label="More">${icon('more', 18)}</button></div></div>
      ${machineCard(m, true)}
      <div class="row between" style="font-size:13px;color:var(--muted)"><span>${[m.year, m.make, m.model].filter(Boolean).map(esc).join(' ') || esc(CATS[m.cat]?.label)}</span>${hasMeter(m) ? `<button class="smallbtn" data-act="reading" data-id="${m.id}">${icon('gauge', 14)} ${fmtN(m.reading, UNIT_LABEL[m.unit])}</button>` : ''}</div>
      <div class="tabs">
        <button class="${tab === 'upcoming' ? 'on' : ''}" data-act="go" data-to="#/m/${m.id}">Upcoming</button>
        <button class="${tab === 'history' ? 'on' : ''}" data-act="go" data-to="#/m/${m.id}/history">History</button>
        <button class="${tab === 'notes' ? 'on' : ''}" data-act="go" data-to="#/m/${m.id}/notes">Notes</button>
        <button class="${tab === 'warranty' ? 'on' : ''}" data-act="go" data-to="#/m/${m.id}/warranty">Docs</button>
        <button class="rbtn light" data-act="fab" data-id="${m.id}" aria-label="Add">${icon('plus', 20)}</button>
      </div>
    </div>
    ${body}
  </div>`;
}
function machineUpcoming(m) {
  const r = ranked(m.id);
  const paused = S.items.filter((i) => i.machineId === m.id && i.enabled === false);
  if (!r.length) return empty('wrench', 'No maintenance tracked', 'Pick from suggestions for this machine or add your own.', `<button class="btn primary" data-act="go" data-to="#/m/${m.id}/add-maint" style="width:auto;padding:0 24px">Add maintenance</button>`);
  return `<div class="list">${r.map((x) => mrow(x.it, x.st, { showMachine: false })).join('')}</div>
    <button class="dashed" data-act="go" data-to="#/m/${m.id}/add-maint">${icon('plus', 18)}Add maintenance</button>
    <div class="sec-title">Seasonal checklists</div>
    <div class="group">${Object.entries(CHECKLISTS).map(([k, c]) => `<button class="lrow" data-act="go" data-to="#/checklist/${m.id}/${k}"><div class="ibox">${icon(c.icon, 18)}</div><div class="grow"><div class="t">${c.title}</div><div class="d">${c.items.length} steps · logs as one entry</div></div></button>`).join('')}</div>
    <button class="lrow" data-act="go" data-to="#/m/${m.id}/specs"><div class="ibox">${icon('oil', 18)}</div><div class="grow"><div class="t">Specs & part numbers</div><div class="d">${specSummary(m) || 'Oil type, filters, plugs, tire sizes'}</div></div></button>
    ${paused.length ? `<p class="note">${plural(paused.length, 'item')} turned off. <button class="link muted" style="text-decoration:underline" data-act="go" data-to="#/m/${m.id}/add-maint">Manage</button></p>` : ''}`;
}
function specSummary(m) { const s = m.specs || {}; return [s.oil, s.oilFilter].filter(Boolean).join(' · '); }
function machineHistory(m) {
  const logs = S.logs.filter((l) => l.machineId === m.id).sort((a, b) => b.date.localeCompare(a.date) || (b.reading || 0) - (a.reading || 0));
  const fuel = S.fuel.filter((f) => f.machineId === m.id);
  const yr = String(new Date().getFullYear());
  const spend = (arr) => arr.reduce((s, x) => s + (x.cost || 0), 0);
  const fuelSpend = (arr) => arr.reduce((s, x) => s + (x.total || 0), 0);
  const thisYear = spend(logs.filter((l) => l.date.startsWith(yr))) + fuelSpend(fuel.filter((f) => f.date.startsWith(yr))) + S.receipts.filter((r) => r.machineId === m.id && !r.logId && (r.date || '').startsWith(yr)).reduce((s, r) => s + (r.total || 0), 0);
  const all = spend(logs) + fuelSpend(fuel) + S.receipts.filter((r) => r.machineId === m.id && !r.logId).reduce((s, r) => s + (r.total || 0), 0);
  const mpg = mpgStats(m);
  const head = `<div class="two"><div class="card"><div class="muted" style="font-size:12px">Spent in ${yr}</div><div class="bebas" style="font-size:30px">${money(thisYear) || '$0'}</div></div><div class="card"><div class="muted" style="font-size:12px">${mpg ? 'Avg fuel economy' : 'All time'}</div><div class="bebas" style="font-size:30px">${mpg ? mpg.avg.toFixed(1) + (m.unit === 'km' ? ' km/L' : ' mpg') : money(all) || '$0'}</div></div></div>`;
  const rows = [];
  logs.forEach((l) => rows.push({ date: l.date, html: `<button class="lrow" data-act="edit-log" data-id="${l.id}"><div class="ibox">${icon(l.skipped ? 'snooze' : (I((l.itemIds || [])[0])?.icon || (l.checklist ? 'calendar' : 'wrench')), 18)}</div><div class="grow"><div class="t">${esc(l.title)}${l.skipped ? ' <span class="pill-tag">Skipped</span>' : ''}</div><div class="d">${fmtDate(l.date, true)}${l.reading != null ? ' · ' + fmtN(l.reading, UNIT_LABEL[m.unit]) : ''}${l.shop ? ' · ' + esc(l.shop) : ''}</div></div><div class="v">${money(l.cost)}${l.receiptIds && l.receiptIds.length ? ' ' + icon('receipt', 14) : ''}</div></button>` }));
  fuel.forEach((f) => rows.push({ date: f.date, html: `<button class="lrow" data-act="edit-fuel" data-id="${f.id}"><div class="ibox">${icon('fuel', 18)}</div><div class="grow"><div class="t">Fuel-up${f.mpg ? ` · ${f.mpg.toFixed(1)} mpg` : ''}</div><div class="d">${fmtDate(f.date, true)} · ${f.gallons} ${m.unit === 'km' ? 'L' : 'gal'}${f.reading ? ' · ' + fmtN(f.reading, UNIT_LABEL[m.unit]) : ''}</div></div><div class="v">${money(f.total)}</div></button>` }));
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return `${head}${rows.length ? `<div class="group">${rows.map((r) => r.html).join('')}</div>` : empty('clock', 'No history yet', 'Logged services show up here.')}
    <div class="two no-print"><button class="btn secondary" data-act="go" data-to="#/m/${m.id}/report">${icon('print', 18)}Report</button><button class="btn secondary" data-act="csv" data-id="${m.id}">${icon('download', 18)}CSV</button></div>`;
}
function mpgStats(m) {
  const f = S.fuel.filter((x) => x.machineId === m.id && x.mpg).map((x) => x.mpg);
  if (!f.length) return null;
  return { avg: f.reduce((a, b) => a + b, 0) / f.length };
}
function machineNotes(m) {
  const ns = S.notes.filter((n) => n.machineId === m.id).sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
  return `${ns.length ? `<div class="list">${ns.map((n) => `<button class="notecard" style="text-align:left" data-act="go" data-to="#/note/${m.id}/${n.id}"><div class="row between"><span class="when">${n.pinned ? '📌 ' : ''}${fmtDate(n.date, true)}${n.itemId && I(n.itemId) ? ' · ' + esc(I(n.itemId).title) : ''}</span></div><div style="white-space:pre-wrap">${esc(n.body)}</div></button>`).join('')}</div>` : empty('note', 'No notes yet', 'Torque specs, odd noises, where you bought parts.')}
    <button class="dashed" data-act="go" data-to="#/note/${m.id}">${icon('plus', 18)}Add note</button>`;
}
function machineDocs(m) {
  const ws = S.warranties.filter((w) => w.machineId === m.id);
  const rs = S.receipts.filter((r) => r.machineId === m.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<div class="sec-title">Warranties</div>
    ${ws.length ? `<div class="group">${ws.map((w) => { const d = w.end ? daysBetween(todayISO(), w.end) : null; const tag = d == null ? '' : d < 0 ? '<span class="pill-tag red">Expired</span>' : d <= 60 ? `<span class="pill-tag yellow">${humanDays(d)} left</span>` : `<span class="pill-tag green">Active</span>`; return `<button class="lrow" data-act="go" data-to="#/warranty/${m.id}/${w.id}"><div class="ibox">${icon('shield', 18)}</div><div class="grow"><div class="t">${esc(w.provider || 'Warranty')}</div><div class="d">${esc(w.coverage || '')}${w.end ? ` · ends ${fmtDate(w.end, true)}` : ''}${w.limit ? ` or ${fmtN(w.limit, UNIT_LABEL[m.unit])}` : ''}</div></div>${tag}</button>`; }).join('')}</div>` : `<p class="note">No warranties added.</p>`}
    <button class="dashed" data-act="go" data-to="#/warranty/${m.id}">${icon('plus', 18)}Add warranty</button>
    <div class="sec-title">Receipts</div>
    ${rs.length ? `<div class="group">${rs.map((r) => `<button class="lrow" data-act="go" data-to="#/receipt/${m.id}/${r.id}">${r.photoId ? `<img class="thumb" data-fid="${r.photoId}" alt="" hidden>` : `<div class="ibox">${icon('receipt', 18)}</div>`}<div class="grow"><div class="t">${esc(r.vendor || 'Receipt')}</div><div class="d">${r.date ? fmtDate(r.date, true) : ''}${r.category ? ' · ' + esc(r.category) : ''}</div></div><div class="v">${money(r.total)}</div></button>`).join('')}</div>` : `<p class="note">No receipts yet.</p>`}
    <button class="dashed" data-act="go" data-to="#/receipt/${m.id}">${icon('camera', 18)}Add receipt</button>
    ${isVehicle(m) ? `<button class="lrow" data-act="go" data-to="#/m/${m.id}/recalls"><div class="ibox">${icon('alert', 18)}</div><div class="grow"><div class="t">Safety recalls</div><div class="d">${m.recalls ? (m.recalls.length ? plural(m.recalls.length, 'recall') + ' found' : 'None found') + (m.recallsChecked ? ' · checked ' + fmtDate(m.recallsChecked) : '') : 'Check NHTSA for open recalls'}</div></div></button>` : ''}`;
}

/* ======================= item (task) detail ======================= */
function vItem(id) {
  const it = I(id), m = M(it.machineId), st = itemStatus(it);
  const u = UNIT_LABEL[m.unit];
  const ev = it.every;
  const evText = [ev.u ? `every ${fmtN(ev.u, u)}` : '', ev.months ? `every ${plural(ev.months, 'month')}` : ''].filter(Boolean).join(' or ');
  const hist = S.logs.filter((l) => (l.itemIds || []).includes(it.id)).sort((a, b) => b.date.localeCompare(a.date));
  const specs = m.specs || {};
  const need = [...(it.need || [])];
  const specMap = { oil: ['oil', 'oilCap'], filter: ['oilFilter'], air: ['airFilter'], plug: ['plug'], fuel: ['fuelFilter'], blade: ['blade'], belt: ['belt'], battery: ['battery'], tire: ['tires'] };
  const known = [];
  if (it.icon === 'oil' && /oil/i.test(it.title)) { if (specs.oil) known.push(['Engine oil', [specs.oil, specs.oilCap].filter(Boolean).join(' · ')]); if (specs.oilFilter) known.push(['Oil filter', specs.oilFilter]); }
  else (specMap[it.icon] || []).forEach((k) => specs[k] && known.push([specLabel(k), specs[k]]));
  const needRows = known.length ? known : need.map((n) => [n, '']);
  return `<div class="screen">
    <div class="hdr"><div class="left">${backBtn('#/m/' + m.id)}</div><div class="h-actions"><button class="rbtn" data-act="item-menu" data-id="${it.id}" aria-label="More">${icon('more', 18)}</button></div></div>
    <div class="photo-hero">${art(m.cat, 110)}${m.photoId ? `<img data-fid="${m.photoId}" alt="" hidden>` : ''}</div>
    <div><h1 class="big-title">${esc(it.title)}</h1><p class="note" style="margin-top:6px">${esc(m.name)} · ${esc(evText || 'no interval')}${m.severe && it.severe ? ' · severe duty' : ''}</p></div>
    ${mrow(it, st, { plain: true })}
    ${st.state === 'over' ? `<div class="two"><button class="btn primary" data-act="log" data-id="${it.id}">Log it</button><button class="btn secondary" data-act="snooze" data-id="${it.id}">Snooze</button></div>` : ''}
    <a class="linkrow" href="https://www.youtube.com/results?search_query=${encodeURIComponent([m.year, m.make, m.model, it.how || it.title].filter(Boolean).join(' '))}" target="_blank" rel="noopener">${icon('play', 18)}How to: ${esc(it.title.toLowerCase())} ›</a>
    <div class="sec-title">What you need <button class="link" data-act="go" data-to="#/m/${m.id}/specs">Edit specs</button></div>
    <div class="card">${needRows.length ? needRows.map(([a, b]) => `<div class="need"><div><div style="font-weight:600">${esc(a)}</div>${b ? `<div class="muted" style="font-size:13px">${esc(b)}</div>` : ''}</div><a class="smallbtn" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent([m.make, m.model, b || a].filter(Boolean).join(' '))}">Find ›</a></div>`).join('') : `<p class="note">Add part numbers in Specs so they show up here.</p>`}</div>
    ${it.notes ? `<div class="card dark"><div class="muted" style="font-size:12px;margin-bottom:4px">Notes</div><div style="white-space:pre-wrap">${esc(it.notes)}</div></div>` : ''}
    <div class="sec-title">History</div>
    ${hist.length ? `<div class="group">${hist.map((l) => `<button class="lrow" data-act="edit-log" data-id="${l.id}"><div class="ibox">${icon(l.skipped ? 'snooze' : it.icon, 18)}</div><div class="grow"><div class="t">${l.skipped ? 'Skipped' : fmtDate(l.date, true)}</div><div class="d">${l.skipped ? fmtDate(l.date, true) : ''}${l.reading != null ? fmtN(l.reading, u) : ''}${l.shop ? ' · ' + esc(l.shop) : ''}</div></div><div class="v">${money(l.cost)}</div></button>`).join('')}</div>` : `<p class="note">Not logged yet${it.lastDate && !it.unknown ? ` · counting from ${fmtDate(it.lastDate, true)}` : ''}.</p>`}
    <button class="btn secondary" data-act="go" data-to="#/custom/${m.id}/${it.id}">${icon('edit', 18)}Edit interval</button>
  </div>`;
}
const SPEC_FIELDS = [['oil', 'Engine oil type', 'e.g. 10W-30 synthetic'], ['oilCap', 'Oil capacity', 'e.g. 2 qt with filter'], ['oilFilter', 'Oil filter part #', 'e.g. Kohler 52 050 02-S'], ['airFilter', 'Air filter part #', ''], ['fuelFilter', 'Fuel filter part #', ''], ['plug', 'Spark plug', 'e.g. NGK BPR5ES, gap .030"'], ['blade', 'Blades', 'e.g. 54" high-lift, 3 per set'], ['belt', 'Belt(s)', ''], ['battery', 'Battery', 'e.g. Group 65, 750 CCA'], ['tires', 'Tire size & pressure', 'e.g. 275/65R18 · 35 psi'], ['other', 'Other notes', 'Coolant, hydraulic fluid, wipers...']];
const specLabel = (k) => (SPEC_FIELDS.find((f) => f[0] === k) || [k, k])[1];
function vSpecs(id) {
  const m = M(id), s = m.specs || {};
  return `<div class="screen">${topBar('Specs & parts', '#/m/' + id)}
    <p class="note">Save these once and they show up on every job that needs them.</p>
    ${SPEC_FIELDS.map(([k, l, ph]) => field(l, k === 'other' ? `<textarea class="inp" id="sp_${k}" placeholder="${esc(ph)}" style="height:96px">${esc(s[k] || '')}</textarea>` : inp('sp_' + k, s[k], ph))).join('')}
    <div class="actions-bottom"><button class="btn primary" data-act="save-specs" data-id="${id}">Save specs</button></div>
  </div>`;
}

/* ======================= add machine flow ======================= */
let draft = null;
function newDraft() { draft = { cat: null, name: '', make: '', model: '', year: '', vin: '', unit: null, reading: '', isNew: false, photoId: null, purchased: '' }; }
function vAdd(step) {
  if (!draft) newDraft();
  if (step === 1) {
    const groups = {};
    Object.entries(CATS).forEach(([k, c]) => (groups[c.group] = groups[c.group] || []).push([k, c]));
    return `<div class="screen">${topBar('Add machine', S.settings.onboarded ? '#/' : '#/welcome/4')}${steps(4, 1)}
      <h2 class="headline">What kind of machine?</h2>
      ${Object.entries(groups).map(([g, list]) => `<div class="grouplabel">${esc(g)}</div><div class="catgrid">${list.map(([k, c]) => `<button class="cat ${draft.cat === k ? 'on' : ''}" data-act="pick-cat" data-cat="${k}">${art(k, 44)}<span>${esc(c.label)}</span></button>`).join('')}</div>`).join('')}
    </div>`;
  }
  if (step === 2) {
    const veh = ['car', 'truck', 'motorcycle'].includes(draft.cat);
    return `<div class="screen">${topBar('Add machine', '#/add/1')}${steps(4, 2)}
      <h2 class="headline">Tell us about it</h2>
      ${veh ? `<div class="card dark stack"><div class="t" style="font-weight:600">Have the VIN?</div><p class="note" style="margin:0">We'll fill in year, make and model. It's on the driver's door jamb or the dash by the windshield.</p><div class="row">${inp('vin', draft.vin, '17-character VIN', 'text', 'autocapitalize="characters" maxlength="17" style="text-transform:uppercase"')}<button class="smallbtn" style="height:46px;padding:0 16px" data-act="decode-vin">Look up</button></div><div id="vinmsg" class="note"></div></div>` : ''}
      ${field('Nickname', inp('name', draft.name, veh ? 'e.g. Dad’s F-150' : 'e.g. Back-yard mower'))}
      <div class="two">${field('Make', inp('make', draft.make, 'Brand'))}${field('Model', inp('model', draft.model, 'Model'))}</div>
      <div class="two">${field('Year', inp('year', draft.year, 'Year', 'number', 'inputmode="numeric"'))}${field(veh ? 'VIN (optional)' : 'Serial # (optional)', inp('serial', draft.serial, veh ? 'VIN' : 'Serial #'))}</div>
      <div class="trow" data-act="toggle-draft-new"><div class="grow"><div class="t">It's brand new</div><div class="d">Adds the first break-in service where it applies</div></div><span class="switch ${draft.isNew ? 'on' : ''}"></span></div>
      <div class="spacer"></div>
      <div class="actions-bottom"><button class="btn primary" data-act="add-next-2">Continue</button></div>
    </div>`;
  }
  if (step === 3) {
    const c = CATS[draft.cat] || CATS.other;
    const unit = draft.unit || (c.unit === 'mi' ? S.settings.distUnit : c.unit);
    return `<div class="screen">${topBar('Add machine', '#/add/2')}${steps(4, 3)}
      <h2 class="headline">${unit === 'hrs' ? 'Current engine hours' : unit === 'none' ? 'How do you track it?' : 'Current odometer'}</h2>
      <p class="note">This is what reminders count from. ${unit === 'hrs' ? 'Look for the hour meter near the seat or dash.' : ''}</p>
      <div class="seg">${[['mi', 'Miles'], ['km', 'Km'], ['hrs', 'Hours'], ['none', 'Time only']].filter(([k]) => ['car', 'truck', 'motorcycle'].includes(draft.cat) ? k !== 'hrs' || true : true).map(([k, l]) => `<button class="${unit === k ? 'on' : ''}" data-act="draft-unit" data-unit="${k}">${l}</button>`).join('')}</div>
      ${unit !== 'none' ? `<div class="card dark" style="text-align:center"><input class="inp bebas" id="reading" inputmode="decimal" value="${esc(draft.reading)}" placeholder="0" style="font-size:56px;height:84px;text-align:center;background:transparent"><div class="muted">${unit === 'hrs' ? 'hours' : unit === 'km' ? 'kilometers' : 'miles'}</div></div>` : `<p class="note">Reminders will go by date only (good for trailers and electric tools).</p>`}
      <div class="spacer"></div>
      <div class="actions-bottom"><button class="btn primary" data-act="add-next-3" data-unit="${unit}">Continue</button></div>
    </div>`;
  }
  const c = CATS[draft.cat] || CATS.other;
  const unit = draft.unit;
  return `<div class="screen">${topBar('Add machine', '#/add/3')}${steps(4, 4)}
    <div class="photo-hero" style="height:200px" id="draftPhoto">${art(draft.cat, 120)}${draft.photoId ? `<img data-fid="${draft.photoId}" alt="" hidden>` : ''}</div>
    <label class="btn secondary" style="cursor:pointer">${icon('camera', 18)}${draft.photoId ? 'Change photo' : 'Add a photo (optional)'}<input type="file" accept="image/*" hidden data-change="draft-photo"></label>
    <div class="card">
      <div class="kv"><span>Name</span><b>${esc(draft.name)}</b></div>
      <div class="kv"><span>Type</span><span>${esc(c.label)}</span></div>
      ${draft.make || draft.model ? `<div class="kv"><span>Make & model</span><span>${esc([draft.year, draft.make, draft.model].filter(Boolean).join(' '))}</span></div>` : ''}
      ${draft.serial ? `<div class="kv"><span>${['car', 'truck', 'motorcycle'].includes(draft.cat) ? 'VIN' : 'Serial'}</span><span>${esc(draft.serial)}</span></div>` : ''}
      <div class="kv"><span>${unit === 'hrs' ? 'Hours' : unit === 'none' ? 'Tracking' : 'Odometer'}</span><span>${unit === 'none' ? 'By date' : fmtN(num(draft.reading) || 0, UNIT_LABEL[unit])}</span></div>
    </div>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="add-save">Add machine</button><button class="btn text" data-act="go" data-to="#/add/2">Edit details</button></div>
  </div>`;
}
function vAdded(id) {
  const m = M(id);
  return `<div class="screen">${topBar('', '#/m/' + id)}
    <div class="center"><div class="success">${icon('check', 44)}</div><h1 class="big-title">Machine added</h1><p class="note">${esc(m.name)} is in your garage.</p></div>
    <div class="card row"><div class="lrow" style="padding:0;background:none"><div class="ibox">${icon('wrench', 18)}</div><div class="grow"><div class="t">Set up its maintenance?</div><div class="d">We'll suggest a starting schedule for a ${esc((CATS[m.cat] || CATS.other).label.toLowerCase())}.</div></div></div></div>
    <div class="actions-bottom"><button class="btn primary" data-act="go" data-to="#/suggest/${id}">See suggested maintenance</button><button class="btn text" data-act="go" data-to="#/m/${id}">Later</button></div>
  </div>`;
}
let suggestSel = null;
function vSuggest(id) {
  const m = M(id);
  const tps = templatesFor(m);
  if (!suggestSel || suggestSel.id !== id) suggestSel = { id, on: Object.fromEntries(tps.map((tp) => [tp.key, true])), last: 'now' };
  if (!tps.length) { after.push(() => go('#/custom/' + id)); return '<div class="screen"></div>'; }
  return `<div class="screen">${topBar('Suggested maintenance', '#/m/' + id)}
    <p class="note">Based on a typical ${esc((CATS[m.cat] || CATS.other).label.toLowerCase())}. Turn off anything you don't need. You can edit every interval later to match your owner's manual.</p>
    <div class="list">${tps.map((tp) => { const tmp = itemFromTemplate(m, tp); return `<button class="trow" data-act="sug-toggle" data-key="${tp.key}"><div class="ibox" style="width:36px;height:36px;border-radius:50%;background:var(--btn);display:grid;place-items:center">${icon(tp.icon, 18)}</div><div class="grow"><div class="t">${esc(tp.title)}</div><div class="d">${esc(intervalText(tmp, m))}</div></div><span class="switch ${suggestSel.on[tp.key] ? 'on' : ''}"></span></button>`; }).join('')}</div>
    <div class="card dark stack"><div style="font-weight:600">When was this stuff last done?</div>
      <div class="seg"><button class="${suggestSel.last === 'now' ? 'on' : ''}" data-act="sug-last" data-v="now">Just now / recently</button><button class="${suggestSel.last === 'unknown' ? 'on' : ''}" data-act="sug-last" data-v="unknown">Not sure</button></div>
      <p class="note" style="margin:0">${suggestSel.last === 'now' ? 'Reminders count from today.' : 'Everything starts as due so you can log what you do and reset it.'}</p></div>
    <div class="actions-bottom"><button class="btn primary" data-act="sug-save" data-id="${id}">Use this schedule</button><button class="btn text" data-act="go" data-to="#/m/${id}">Skip for now</button></div>
  </div>`;
}
function intervalText(it, m) {
  const u = UNIT_LABEL[m.unit];
  const p = [];
  if (it.every.u) p.push(`Every ${fmtN(it.every.u, u)}`);
  if (it.every.months) p.push(`${p.length ? 'or ' : 'Every '}${plural(it.every.months, 'month')}`);
  return p.join(' ') + (it.first && (it.first.u || it.first.months) ? ` · first at ${it.first.u ? fmtN(it.first.u, u) : plural(it.first.months, 'month')}` : '');
}
function vAddMaint(id) {
  const m = M(id);
  const mine = S.items.filter((i) => i.machineId === id);
  const tps = templatesFor(m);
  return `<div class="screen">${topBar('Add maintenance', '#/m/' + id)}
    <p class="note">Pick what to track on ${esc(m.name)}. Turn on anything you want to add.</p>
    <div class="list">
      ${mine.map((i) => `<button class="trow" data-act="item-toggle" data-id="${i.id}"><div class="grow"><div class="t">${esc(i.title)}</div><div class="d">${esc(intervalText(i, m))}</div></div><span class="switch ${i.enabled !== false ? 'on' : ''}"></span></button>`).join('')}
      ${tps.filter((tp) => !mine.some((i) => i.key === tp.key)).map((tp) => { const tmp = itemFromTemplate(m, tp); return `<button class="trow" data-act="tpl-add" data-id="${id}" data-key="${tp.key}"><div class="grow"><div class="t">${esc(tp.title)}</div><div class="d">${esc(intervalText(tmp, m))}</div></div><span class="switch"></span></button>`; }).join('')}
    </div>
    <button class="dashed" data-act="go" data-to="#/custom/${id}">${icon('plus', 18)}Add custom</button>
    <div class="actions-bottom"><button class="btn primary" data-act="go" data-to="#/m/${id}">Done</button></div>
  </div>`;
}
function vCustom(mid, itemId) {
  const m = M(mid), it = itemId ? I(itemId) : null;
  const unit = m.unit;
  const ev = it ? it.every : { u: null, months: null };
  return `<div class="screen">${topBar(it ? 'Edit maintenance' : 'Custom maintenance', it ? '#/i/' + it.id : '#/m/' + mid + '/add-maint')}
    <h2 class="headline">${it ? esc(it.title) : 'What needs doing?'}</h2>
    ${field('Name', inp('c_title', it?.title, 'e.g. Replace hydraulic filter'))}
    ${hasMeter(m) ? `<div class="two">${field('Repeat every', inp('c_u', ev.u, unit === 'hrs' ? 'e.g. 50' : 'e.g. 5000', 'number', 'inputmode="decimal"'))}${field('Unit', `<input class="inp" value="${unit === 'hrs' ? 'hours' : unit === 'km' ? 'km' : 'miles'}" disabled>`)}</div>` : ''}
    ${field(hasMeter(m) ? 'Or every (months)' : 'Repeat every (months)', inp('c_months', ev.months, 'e.g. 12', 'number', 'inputmode="numeric"'))}
    <div class="two">${field('Last done', inp('c_lastDate', it?.lastDate || todayISO(), '', 'date'))}${hasMeter(m) ? field(`At (${UNIT_LABEL[unit]})`, inp('c_lastReading', it?.lastReading ?? m.reading, '', 'number', 'inputmode="decimal"')) : ''}</div>
    ${it && it.severe ? `<p class="note">Severe-duty interval: ${esc([it.severe.u ? fmtN(it.severe.u, UNIT_LABEL[unit]) : '', it.severe.months ? plural(it.severe.months, 'month') : ''].filter(Boolean).join(' or '))} (used when Severe duty is on for this machine).</p>` : ''}
    ${field('Parts / notes', `<textarea class="inp" id="c_notes" style="height:90px" placeholder="Part numbers, torque specs, where to buy">${esc(it?.notes || '')}</textarea>`)}
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="custom-save" data-mid="${mid}" data-id="${it ? it.id : ''}">${it ? 'Save changes' : 'Save maintenance'}</button>
    ${it && it.key && templatesFor(m).some((tp) => tp.key === it.key) ? `<button class="btn text" data-act="reset-item" data-id="${it.id}">Reset to suggested interval</button>` : `<button class="btn text" data-act="back" data-to="#/m/${mid}">Cancel</button>`}</div>
  </div>`;
}

/* ======================= receipts / warranty / notes / fuel ======================= */
let pendingReceipt = null;
function vReceipt(mid, rid) {
  const m = M(mid), r = rid ? S.receipts.find((x) => x.id === rid) : null;
  if (!r && (!pendingReceipt || pendingReceipt.mid !== mid)) pendingReceipt = { mid, photoId: null, ocr: null };
  const pid = r ? r.photoId : pendingReceipt.photoId;
  const o = (!r && pendingReceipt.ocr) || {};
  return `<div class="screen">${topBar(r ? 'Receipt' : 'Add receipt', '#/m/' + mid + '/warranty')}
    <label class="viewfinder" style="cursor:pointer">${pid ? `<img data-fid="${pid}" alt="Receipt" hidden>` : `${icon('scan', 56)}<span>Tap to snap the receipt</span><span class="note">or pick a photo</span>`}<input type="file" accept="image/*" capture="environment" hidden data-change="receipt-photo"></label>
    ${pid && !r ? `<button class="btn secondary" data-act="ocr" ${window.Tesseract === undefined ? '' : ''}>${icon('search', 18)}Read the receipt for me</button><div id="ocrmsg" class="note"></div>` : ''}
    ${field('Store / shop', inp('r_vendor', r?.vendor ?? o.vendor, 'e.g. Tractor Supply'))}
    <div class="two">${field('Date', inp('r_date', r?.date || o.date || todayISO(), '', 'date'))}${field('Total', inp('r_total', r?.total ?? o.total, '$0.00', 'text', 'inputmode="decimal"'))}</div>
    ${field('Category', `<select class="inp" id="r_cat">${['Parts', 'Service', 'Fuel', 'Tires', 'Registration', 'Insurance', 'Other'].map((c) => `<option ${(r?.category || 'Parts') === c ? 'selected' : ''}>${c}</option>`).join('')}</select>`)}
    ${field('Attach to machine', `<select class="inp" id="r_mid">${S.machines.filter((x) => !x.archived).map((x) => `<option value="${x.id}" ${x.id === mid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`)}
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="receipt-save" data-mid="${mid}" data-id="${r ? r.id : ''}">${r ? 'Save' : 'Save receipt'}</button>
    ${r ? `<button class="btn danger" data-act="receipt-del" data-id="${r.id}">Delete receipt</button>` : ''}</div>
  </div>`;
}
function vWarranty(mid, wid) {
  const m = M(mid), w = wid ? S.warranties.find((x) => x.id === wid) : null;
  return `<div class="screen">${topBar(w ? 'Warranty' : 'Add warranty', '#/m/' + mid + '/warranty')}
    <h2 class="headline">Warranty details</h2>
    ${field('Provider', inp('w_provider', w?.provider, `e.g. ${m.make || 'Cub Cadet'}`))}
    ${field('Coverage', inp('w_coverage', w?.coverage, 'e.g. Parts & labor, powertrain'))}
    <div class="two">${field('Starts', inp('w_start', w?.start || todayISO(), '', 'date'))}${field('Ends', inp('w_end', w?.end, '', 'date'))}</div>
    ${hasMeter(m) ? field(`Or until (${UNIT_LABEL[m.unit]}, optional)`, inp('w_limit', w?.limit, m.unit === 'hrs' ? 'e.g. 300' : 'e.g. 60000', 'number', 'inputmode="decimal"')) : ''}
    ${field('Policy # (optional)', inp('w_policy', w?.policy, 'Policy or claim #'))}
    ${field('Phone / notes (optional)', inp('w_notes', w?.notes, 'Claim phone number, dealer'))}
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="warranty-save" data-mid="${mid}" data-id="${w ? w.id : ''}">Save warranty</button>
    ${w ? `<button class="btn danger" data-act="warranty-del" data-id="${w.id}">Delete</button>` : `<button class="btn text" data-act="go" data-to="#/receipt/${mid}">Attach a receipt</button>`}</div>
  </div>`;
}
function vNote(mid, nid) {
  const m = M(mid), n = nid ? S.notes.find((x) => x.id === nid) : null;
  const items = S.items.filter((i) => i.machineId === mid);
  return `<div class="screen">${topBar(n ? 'Note' : 'Add note', '#/m/' + mid + '/notes')}
    <h2 class="headline">What do you want to remember?</h2>
    ${field('Machine', `<select class="inp" id="n_mid">${S.machines.filter((x) => !x.archived).map((x) => `<option value="${x.id}" ${x.id === mid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`)}
    ${field('Note', `<textarea class="inp" id="n_body" placeholder="Write what you noticed, fixed or want to remember…">${esc(n?.body || '')}</textarea>`)}
    ${field('Link to maintenance (optional)', `<select class="inp" id="n_item"><option value="">None</option>${items.map((i) => `<option value="${i.id}" ${n?.itemId === i.id ? 'selected' : ''}>${esc(i.title)}</option>`).join('')}</select>`)}
    <button class="trow" data-act="toggle-pin"><div class="grow"><div class="t">Pin to top</div></div><span class="switch ${n?.pinned ? 'on' : ''}" id="n_pin"></span></button>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="note-save" data-mid="${mid}" data-id="${n ? n.id : ''}">Save note</button>${n ? `<button class="btn danger" data-act="note-del" data-id="${n.id}">Delete note</button>` : ''}</div>
  </div>`;
}
function vFuel(mid) {
  const m = M(mid);
  const vol = m.unit === 'km' ? 'liters' : 'gallons';
  return `<div class="screen">${topBar('Fuel-up', '#/m/' + mid + '/history')}
    <div class="two">${field('Date', inp('f_date', todayISO(), '', 'date'))}${field(`Odometer (${UNIT_LABEL[m.unit] || 'mi'})`, inp('f_reading', Math.round(predictedReading(m) || m.reading || 0), '', 'number', 'inputmode="decimal"'))}</div>
    <div class="two">${field(vol[0].toUpperCase() + vol.slice(1), inp('f_gal', '', 'e.g. 18.4', 'text', 'inputmode="decimal"'))}${field('Total cost', inp('f_total', '', '$0.00', 'text', 'inputmode="decimal"'))}</div>
    <button class="trow" data-act="toggle-full"><div class="grow"><div class="t">Filled the tank</div><div class="d">Needed to calculate ${m.unit === 'km' ? 'km/L' : 'MPG'}</div></div><span class="switch on" id="f_full"></span></button>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="fuel-save" data-mid="${mid}">Save fuel-up</button></div>
  </div>`;
}
function vChecklist(mid, key) {
  const m = M(mid), c = CHECKLISTS[key] || CHECKLISTS.spring;
  return `<div class="screen">${topBar(c.title, '#/m/' + mid)}
    <p class="note">Check off what you did. It saves to ${esc(m.name)}'s history as one entry.</p>
    <div class="list">${c.items.map((x, i) => `<button class="trow" data-act="cl-toggle" data-i="${i}"><span class="check" id="cl_${i}"></span><div class="grow"><div class="t" style="font-weight:400;font-size:15px">${esc(x)}</div></div></button>`).join('')}</div>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="cl-save" data-mid="${mid}" data-key="${key}">Save to history</button></div>
  </div>`;
}

/* ======================= schedule tab ======================= */
function vSchedule() {
  const r = ranked();
  const g = { over: [], week: [], month: [], later: [], snoozed: [] };
  r.forEach((x) => {
    if (x.st.state === 'snoozed') return g.snoozed.push(x);
    if (x.st.state === 'over') return g.over.push(x);
    const d = x.st.dueDate ? daysBetween(todayISO(), x.st.dueDate) : 9999;
    if (d <= 7) g.week.push(x); else if (d <= 31) g.month.push(x); else g.later.push(x);
  });
  const sec = (t, arr) => arr.length ? `<div class="sec-title">${t}</div><div class="list">${arr.map((x) => mrow(x.it, x.st)).join('')}</div>` : '';
  return `<div class="screen has-nav">
    <div class="hdr"><div class="h-title">Schedule</div><button class="rbtn" data-act="ics-all" aria-label="Add all to calendar">${icon('calendar', 18)}</button></div>
    ${r.length ? sec('Overdue', g.over) + sec('This week', g.week) + sec('This month', g.month) + sec('Later', g.later) + sec('Snoozed', g.snoozed) : empty('calendar', 'Nothing scheduled', 'Add a machine and its maintenance shows up here.', `<button class="btn primary" style="width:auto;padding:0 24px" data-act="go" data-to="#/add">Add machine</button>`)}
  </div>${nav('schedule')}`;
}

/* ======================= profile ======================= */
function vProfile() {
  const yr = String(new Date().getFullYear());
  const ms = S.machines.filter((m) => !m.archived);
  const spendBy = ms.map((m) => ({ m, v: S.logs.filter((l) => l.machineId === m.id && l.date.startsWith(yr)).reduce((s, l) => s + (l.cost || 0), 0) + S.fuel.filter((f) => f.machineId === m.id && f.date.startsWith(yr)).reduce((s, f) => s + (f.total || 0), 0) + S.receipts.filter((r) => r.machineId === m.id && !r.logId && (r.date || '').startsWith(yr)).reduce((s, r) => s + (r.total || 0), 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...spendBy.map((x) => x.v));
  const total = spendBy.reduce((s, x) => s + x.v, 0);
  const archived = S.machines.filter((m) => m.archived).length;
  const nperm = ('Notification' in window) ? Notification.permission : 'unsupported';
  return `<div class="screen has-nav">
    <div class="hdr"><div class="h-title">Profile</div></div>
    <div class="card"><div class="row between"><div><div class="muted" style="font-size:12px">Spent in ${yr}</div><div class="bebas" style="font-size:38px">${money(total) || '$0'}</div></div><div class="muted" style="text-align:right;font-size:13px">${plural(ms.length, 'machine')}<br>${plural(S.logs.filter((l) => !l.skipped).length, 'service')} logged</div></div>
      ${spendBy.length ? `<div class="stack" style="margin-top:10px">${spendBy.map((x) => `<div><div class="row between" style="font-size:13px"><span>${esc(x.m.name)}</span><span class="muted">${money(x.v)}</span></div><div class="bar" style="margin-top:4px;background:#222"><i style="width:${Math.round(x.v / max * 100)}%;background:#fff"></i></div></div>`).join('')}</div>` : ''}</div>
    <div class="sec-title">Settings</div>
    <div class="group">
      <button class="lrow" data-act="rename-garage"><div class="ibox">${icon('garage', 18)}</div><div class="grow"><div class="t">Garage name</div><div class="d">${esc(S.settings.garage)}</div></div></button>
      <button class="lrow" data-act="toggle-units"><div class="ibox">${icon('gauge', 18)}</div><div class="grow"><div class="t">Distance for new vehicles</div><div class="d">${S.settings.distUnit === 'km' ? 'Kilometers' : 'Miles'}</div></div><span class="pill-tag">Change</span></button>
      <button class="lrow" data-act="lead-days"><div class="ibox">${icon('clock', 18)}</div><div class="grow"><div class="t">"Due soon" warning</div><div class="d">${S.settings.leadDays} days ahead</div></div></button>
      <button class="lrow" data-act="notify-on"><div class="ibox">${icon('bell', 18)}</div><div class="grow"><div class="t">Reminders</div><div class="d">${nperm === 'granted' ? 'On · shows when you open the app' : nperm === 'denied' ? 'Blocked in browser settings' : nperm === 'unsupported' ? 'Add to Home Screen to enable' : 'Off · tap to turn on'}</div></div></button>
      <button class="lrow" data-act="ics-all"><div class="ibox">${icon('calendar', 18)}</div><div class="grow"><div class="t">Add schedule to calendar</div><div class="d">Downloads a calendar file with every due date</div></div></button>
    </div>
    <div class="sec-title">Your data</div>
    <div class="group">
      <button class="lrow" data-act="backup"><div class="ibox">${icon('download', 18)}</div><div class="grow"><div class="t">Back up everything</div><div class="d">${S.settings.lastBackup ? 'Last backup ' + fmtDate(S.settings.lastBackup, true) : 'Never backed up · saves a file with photos included'}</div></div></button>
      <label class="lrow" style="cursor:pointer"><div class="ibox">${icon('upload', 18)}</div><div class="grow"><div class="t">Restore from backup</div><div class="d">Replaces what's on this phone</div></div><input type="file" accept=".json,application/json" hidden data-change="restore"></label>
      <button class="lrow" data-act="csv"><div class="ibox">${icon('receipt', 18)}</div><div class="grow"><div class="t">Export history (CSV)</div><div class="d">Open in Excel or Google Sheets</div></div></button>
      ${archived ? `<button class="lrow" data-act="go" data-to="#/archived"><div class="ibox">${icon('storage', 18)}</div><div class="grow"><div class="t">Archived machines</div><div class="d">${plural(archived, 'machine')}</div></div></button>` : ''}
    </div>
    <p class="note" style="margin-top:8px">Data stays on this device in this browser. Back up now and then, especially before switching phones. Maintenance intervals are general starting points, so check your owner's manuals.</p>
    <button class="btn text" data-act="reset-all" style="color:#ff6b6b">Erase all data</button>
  </div>${nav('profile')}`;
}
function vArchived() {
  const ms = S.machines.filter((m) => m.archived);
  return `<div class="screen">${topBar('Archived', '#/profile')}
    ${ms.length ? `<div class="group">${ms.map((m) => `<div class="lrow"><div class="ibox">${art(m.cat, 22)}</div><div class="grow"><div class="t">${esc(m.name)}</div><div class="d">${plural(S.logs.filter((l) => l.machineId === m.id).length, 'service')} in history</div></div><button class="smallbtn" data-act="unarchive" data-id="${m.id}">Restore</button></div>`).join('')}</div>` : empty('storage', 'Nothing archived')}
  </div>`;
}

/* ======================= report (printable) ======================= */
function vReport(id) {
  const m = M(id);
  const logs = S.logs.filter((l) => l.machineId === id && !l.skipped).sort((a, b) => a.date.localeCompare(b.date));
  const total = logs.reduce((s, l) => s + (l.cost || 0), 0);
  return `<div class="screen">
    <div class="hdr no-print"><div class="left">${backBtn('#/m/' + id + '/history')}<div class="h-title sm">Service report</div></div><button class="rbtn" data-act="print" aria-label="Print">${icon('print', 18)}</button></div>
    <div><h1 class="big-title">${esc(m.name)}</h1><p class="note">${esc([m.year, m.make, m.model].filter(Boolean).join(' '))}${m.serial ? ' · ' + esc(m.serial) : ''}${hasMeter(m) ? ' · ' + fmtN(m.reading, UNIT_LABEL[m.unit]) : ''} · Report made ${fmtDate(todayISO(), true)}</p></div>
    <div class="card"><div class="kv"><span>Services logged</span><b>${logs.length}</b></div><div class="kv"><span>Total spent</span><b>${money(total) || '$0'}</b></div></div>
    ${logs.length ? `<div class="group">${logs.map((l) => `<div class="lrow"><div class="grow"><div class="t">${esc(l.title)}</div><div class="d">${fmtDate(l.date, true)}${l.reading != null ? ' · ' + fmtN(l.reading, UNIT_LABEL[m.unit]) : ''}${l.shop ? ' · ' + esc(l.shop) : ''}${l.notes ? ' · ' + esc(l.notes) : ''}</div></div><div class="v">${money(l.cost)}</div></div>`).join('')}</div>` : `<p class="note">No services logged yet.</p>`}
    <button class="btn primary no-print" data-act="print">${icon('print', 18)}Print or save as PDF</button>
  </div>`;
}
function vRecalls(id) {
  const m = M(id);
  if (!m.recallsSeen && m.recalls) { m.recallsSeen = true; save(); }
  const list = m.recalls || [];
  return `<div class="screen">${topBar('Recalls', '#/m/' + id + '/warranty')}
    <p class="note">From the NHTSA recall database for ${esc([m.year, m.make, m.model].filter(Boolean).join(' ') || m.name)}. A dealer can tell you if a recall was already fixed on your VIN.</p>
    ${!(m.year && m.make && m.model) ? `<p class="note">Add the year, make and model in Edit machine to check recalls.</p>` : `<button class="btn secondary" data-act="check-recalls" data-id="${id}">${icon('search', 18)}${m.recallsChecked ? 'Check again' : 'Check for recalls'}</button>`}
    <div id="recallmsg" class="note"></div>
    ${list.length ? `<div class="list">${list.map((r) => `<div class="card stack"><div class="row between"><b>${esc(r.component || 'Recall')}</b><span class="pill-tag red">${esc(r.campaign || '')}</span></div><div class="muted" style="font-size:14px">${esc(r.summary || '')}</div>${r.remedy ? `<div style="font-size:14px"><b>Fix:</b> ${esc(r.remedy)}</div>` : ''}<div class="faint" style="font-size:12px">${esc(r.date || '')}</div></div>`).join('')}</div>` : m.recallsChecked ? empty('check', 'No recalls found') : ''}
  </div>`;
}
function vEditMachine(id) {
  const m = M(id);
  return `<div class="screen">${topBar('Edit machine', '#/m/' + id)}
    <div class="photo-hero" style="height:180px">${art(m.cat, 110)}${m.photoId ? `<img data-fid="${m.photoId}" alt="" hidden>` : ''}</div>
    <label class="btn secondary" style="cursor:pointer">${icon('camera', 18)}${m.photoId ? 'Change photo' : 'Add a photo'}<input type="file" accept="image/*" hidden data-change="machine-photo" data-id="${id}"></label>
    ${field('Nickname', inp('e_name', m.name, ''))}
    <div class="two">${field('Make', inp('e_make', m.make, 'Brand'))}${field('Model', inp('e_model', m.model, 'Model'))}</div>
    <div class="two">${field('Year', inp('e_year', m.year, 'Year', 'number'))}${field(isVehicle(m) ? 'VIN' : 'Serial #', inp('e_serial', m.serial, ''))}</div>
    ${field('Purchase date (optional)', inp('e_purchased', m.purchased, '', 'date'))}
    <button class="trow" data-act="toggle-severe" data-id="${id}"><div class="grow"><div class="t">Severe duty</div><div class="d">Towing, dusty mowing, short trips, heavy loads. Uses shorter intervals.</div></div><span class="switch ${m.severe ? 'on' : ''}"></span></button>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="edit-save" data-id="${id}">Save</button></div>
  </div>`;
}

/* ======================= sheets ======================= */
function sheet(html, onOpen) {
  closeSheet();
  const s = document.createElement('div');
  s.className = 'scrim'; s.id = 'scrim';
  s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="handle"></div>${html}</div>`;
  s.addEventListener('click', (e) => { if (e.target === s) closeSheet(); });
  document.body.appendChild(s);
  hydratePhotos(s);
  if (onOpen) onOpen(s);
}
function closeSheet() { const s = $('#scrim'); if (s) s.remove(); }
const sheetHead = (t) => `<div class="hdr"><div class="h-title">${esc(t)}</div><button class="rbtn" data-act="close-sheet" aria-label="Close">${icon('x', 16)}</button></div>`;

function openLog(itemId, logId) {
  const editing = logId ? S.logs.find((l) => l.id === logId) : null;
  const it = itemId ? I(itemId) : editing ? I((editing.itemIds || [])[0]) : null;
  const m = M(editing ? editing.machineId : it.machineId);
  const others = ranked(m.id).filter((x) => x.it.id !== (it && it.id) && (x.st.state !== 'ok' || x.st.frac > 0.7));
  const pred = predictedReading(m);
  const rd = editing ? editing.reading : pred != null ? (m.unit === 'hrs' ? Math.round(pred * 10) / 10 : Math.round(pred)) : null;
  sheet(`${sheetHead(editing ? 'Edit service' : 'Log ' + (it ? shortTitle(it.title).toLowerCase() : 'service'))}
    ${editing ? field('What was done', inp('l_title', editing.title, '')) : `<div class="row" style="gap:10px"><span class="chip">${icon(it.icon, 15)}${esc(it.title)}</span><span class="muted">${esc(m.name)}</span></div>`}
    <div class="two">${field('Date', inp('l_date', editing ? editing.date : todayISO(), '', 'date'))}${hasMeter(m) ? field(m.unit === 'hrs' ? 'Hours' : 'Odometer', inp('l_reading', rd, '', 'number', 'inputmode="decimal"')) : '<div></div>'}</div>
    ${!editing && others.length ? `<div class="stack tight"><span class="muted" style="font-size:12px">Did anything else at the same time?</span>${others.slice(0, 5).map((x) => `<button class="trow" style="min-height:48px" data-act="log-also" data-id="${x.it.id}"><span class="check" data-also="${x.it.id}"></span><div class="grow"><div class="t" style="font-size:15px">${esc(x.it.title)}</div><div class="d">${esc(x.st.text)}</div></div></button>`).join('')}</div>` : ''}
    <div class="two">${field('Cost (optional)', inp('l_cost', editing?.cost, '$0.00', 'text', 'inputmode="decimal"'))}${field('Done by', `<select class="inp" id="l_shop"><option value="">Me (DIY)</option>${[...new Set(S.logs.map((l) => l.shop).filter(Boolean))].map((s) => `<option ${editing?.shop === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}<option value="__new">A shop…</option></select>`)}</div>
    ${field('Notes (optional)', inp('l_notes', editing?.notes, 'e.g. Used Mobil 1 5W-30, filter FL-820S'))}
    <label class="btn secondary" style="cursor:pointer;height:46px">${icon('camera', 18)}<span id="l_photoLabel">${editing && editing.receiptIds && editing.receiptIds.length ? 'Receipt attached · add another' : 'Attach receipt photo'}</span><input type="file" accept="image/*" capture="environment" hidden data-change="log-photo"></label>
    <button class="btn primary" data-act="log-save" data-item="${it ? it.id : ''}" data-log="${editing ? editing.id : ''}">${editing ? 'Save changes' : 'Save'}</button>
    ${editing ? `<button class="btn danger" data-act="log-del" data-id="${editing.id}">Delete entry</button>` : ''}`);
  logPhotos = [];
}
let logPhotos = [];

function openReading(mid) {
  const m = M(mid);
  let val = '';
  sheet(`${sheetHead(m.unit === 'hrs' ? 'Update hours' : 'Update odometer')}
    <p class="note" style="margin:0">Last: ${fmtN(m.reading, UNIT_LABEL[m.unit])} on ${fmtDate(m.readingDate, true)}</p>
    <div class="numpad-display" id="np">${fmtN(m.reading, '')}</div>
    <div class="numpad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => `<button data-np="${k}">${k}</button>`).join('')}</div>
    <button class="btn primary" data-act="reading-save" data-id="${mid}">Save</button>`, (s) => {
    s.querySelectorAll('[data-np]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.np;
      if (k === '⌫') val = val.slice(0, -1); else if (!(k === '.' && val.includes('.')) && val.length < 9) val += k;
      $('#np').textContent = val ? Number(val).toLocaleString(undefined, { maximumFractionDigits: 1 }) + (val.endsWith('.') ? '.' : '') : fmtN(m.reading, '');
      $('#np').dataset.v = val;
    }));
  });
}
function openSnooze(id) {
  const it = I(id);
  sheet(`${sheetHead('Snooze')}
    <p class="note" style="margin:0">${esc(it.title)} · ${esc(M(it.machineId).name)}</p>
    <div class="group">
      ${[[1, 'Tomorrow'], [3, '3 days'], [7, '1 week'], [14, '2 weeks'], [30, '1 month']].map(([d, l]) => `<button class="lrow" data-act="snooze-set" data-id="${id}" data-days="${d}"><div class="ibox">${icon('snooze', 18)}</div><div class="grow"><div class="t">${l}</div></div></button>`).join('')}
      <button class="lrow" data-act="skip" data-id="${id}"><div class="ibox">${icon('x', 18)}</div><div class="grow"><div class="t">Skip this time</div><div class="d">Resets the interval and notes it was skipped</div></div></button>
      ${it.snoozeUntil ? `<button class="lrow" data-act="snooze-set" data-id="${id}" data-days="0"><div class="ibox">${icon('bell', 18)}</div><div class="grow"><div class="t">Un-snooze</div></div></button>` : ''}
    </div>`);
}
function openMachineMenu(id) {
  const m = M(id);
  sheet(`${sheetHead(m.name)}<div class="group">
    <button class="lrow" data-act="go-close" data-to="#/m/${id}/edit"><div class="ibox">${icon('edit', 18)}</div><div class="grow"><div class="t">Edit machine</div><div class="d">Name, photo, severe duty</div></div></button>
    ${hasMeter(m) ? `<button class="lrow" data-act="reading" data-id="${id}"><div class="ibox">${icon('gauge', 18)}</div><div class="grow"><div class="t">Update ${m.unit === 'hrs' ? 'hours' : 'odometer'}</div></div></button>` : ''}
    <button class="lrow" data-act="go-close" data-to="#/m/${id}/specs"><div class="ibox">${icon('oil', 18)}</div><div class="grow"><div class="t">Specs & part numbers</div></div></button>
    <button class="lrow" data-act="go-close" data-to="#/m/${id}/report"><div class="ibox">${icon('print', 18)}</div><div class="grow"><div class="t">Service report</div><div class="d">Print or save a PDF, handy when selling</div></div></button>
    <button class="lrow" data-act="ics-machine" data-id="${id}"><div class="ibox">${icon('calendar', 18)}</div><div class="grow"><div class="t">Add to calendar</div></div></button>
    <button class="lrow" data-act="duplicate" data-id="${id}"><div class="ibox">${icon('plus', 18)}</div><div class="grow"><div class="t">Duplicate</div><div class="d">For a second identical machine</div></div></button>
    <button class="lrow" data-act="archive" data-id="${id}"><div class="ibox">${icon('storage', 18)}</div><div class="grow"><div class="t">Archive (sold / retired)</div><div class="d">Keeps its history</div></div></button>
    <button class="lrow" data-act="delete-machine" data-id="${id}" style="color:#ff6b6b"><div class="ibox">${icon('trash', 18)}</div><div class="grow"><div class="t">Delete</div></div></button>
  </div>`);
}
function openItemMenu(id) {
  const it = I(id);
  sheet(`${sheetHead(it.title)}<div class="group">
    <button class="lrow" data-act="log" data-id="${id}"><div class="ibox">${icon('check', 18)}</div><div class="grow"><div class="t">Log it</div></div></button>
    <button class="lrow" data-act="snooze" data-id="${id}"><div class="ibox">${icon('snooze', 18)}</div><div class="grow"><div class="t">Snooze or skip</div></div></button>
    <button class="lrow" data-act="go-close" data-to="#/custom/${it.machineId}/${id}"><div class="ibox">${icon('edit', 18)}</div><div class="grow"><div class="t">Edit interval</div></div></button>
    <button class="lrow" data-act="ics-item" data-id="${id}"><div class="ibox">${icon('calendar', 18)}</div><div class="grow"><div class="t">Add to calendar</div></div></button>
    <button class="lrow" data-act="go-close" data-to="#/note/${it.machineId}"><div class="ibox">${icon('note', 18)}</div><div class="grow"><div class="t">Add a note</div></div></button>
    <button class="lrow" data-act="item-off" data-id="${id}"><div class="ibox">${icon('x', 18)}</div><div class="grow"><div class="t">Stop tracking</div><div class="d">History is kept</div></div></button>
  </div>`);
}
function openFab(mid) {
  const m = M(mid);
  const items = [['Maintenance', 'wrench', `#/m/${mid}/add-maint`], ['Log a service', 'check', 'log-any'], ['Receipt', 'receipt', `#/receipt/${mid}`], ['Warranty', 'shield', `#/warranty/${mid}`], ['Note', 'note', `#/note/${mid}`]];
  if (hasMeter(m)) items.splice(2, 0, [m.unit === 'hrs' ? 'Update hours' : 'Update odometer', 'gauge', 'reading']);
  if (isVehicle(m)) items.splice(3, 0, ['Fuel-up', 'fuel', `#/fuel/${mid}`]);
  const f = document.createElement('div');
  f.className = 'fabmenu'; f.id = 'fab';
  f.innerHTML = items.map(([l, ic, to], i) => `<button class="it" style="animation-delay:${i * 35}ms" data-act="fab-go" data-to="${to}" data-id="${mid}"><span>${l}</span><span class="rbtn">${icon(ic, 20)}</span></button>`).join('') + `<button class="close" data-act="fab-close" aria-label="Close">${icon('x', 20)}</button>`;
  f.addEventListener('click', (e) => { if (e.target === f) closeFab(); });
  document.body.appendChild(f);
}
function closeFab() { const f = $('#fab'); if (f) f.remove(); }
function openAnyLog(mid) {
  const r = ranked(mid);
  sheet(`${sheetHead('What did you do?')}<div class="group">${r.map((x) => `<button class="lrow" data-act="log" data-id="${x.it.id}"><div class="ibox">${icon(x.it.icon, 18)}</div><div class="grow"><div class="t">${esc(x.it.title)}</div><div class="d">${esc(x.st.text)}</div></div></button>`).join('')}
    <button class="lrow" data-act="log-oneoff" data-id="${mid}"><div class="ibox">${icon('wrench', 18)}</div><div class="grow"><div class="t">Something else (one-time repair)</div></div></button></div>`);
}
function openOneOff(mid) {
  const m = M(mid);
  sheet(`${sheetHead('Log a repair')}
    ${field('What was done', inp('o_title', '', 'e.g. Replaced starter'))}
    <div class="two">${field('Date', inp('o_date', todayISO(), '', 'date'))}${hasMeter(m) ? field(m.unit === 'hrs' ? 'Hours' : 'Odometer', inp('o_reading', Math.round((predictedReading(m) || 0) * 10) / 10, '', 'number')) : '<div></div>'}</div>
    <div class="two">${field('Cost', inp('o_cost', '', '$0.00', 'text', 'inputmode="decimal"'))}${field('Shop (optional)', inp('o_shop', '', 'DIY'))}</div>
    ${field('Notes', inp('o_notes', '', ''))}
    <button class="btn primary" data-act="oneoff-save" data-id="${mid}">Save</button>`);
}
function prompt2(title, label, val, onSave, type = 'text') {
  sheet(`${sheetHead(title)}${field(label, inp('p_val', val, '', type))}<button class="btn primary" id="p_save">Save</button>`, (s) => {
    const i = $('#p_val', s); setTimeout(() => i.focus(), 250);
    $('#p_save', s).addEventListener('click', () => { onSave(i.value); closeSheet(); });
  });
}
function confirm2(title, msg, yes, onYes, danger = true) {
  sheet(`${sheetHead(title)}<p class="note" style="margin:0">${esc(msg)}</p><button class="btn ${danger ? 'danger' : 'primary'}" id="c_yes">${esc(yes)}</button><button class="btn text" data-act="close-sheet">Cancel</button>`, (s) => {
    $('#c_yes', s).addEventListener('click', () => { closeSheet(); onYes(); });
  });
}

/* ======================= toast + undo ======================= */
let toastTimer;
function toast(msg, undo) {
  const old = $('.toast'); if (old) old.remove();
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button>Undo</button>' : ''}`;
  if (undo) t.querySelector('button').addEventListener('click', () => { undo(); t.remove(); });
  document.body.appendChild(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 4500);
}
const snapshot = () => JSON.parse(JSON.stringify(S));
function undoable(msg, fn) { const snap = snapshot(); fn(); save(); render(); toast(msg, () => { S = snap; save(); render(); }); }

/* ======================= mutations ======================= */
function setReading(m, value, date = todayISO()) {
  if (value == null || !hasMeter(m)) return;
  S.readings.push({ id: uid(), machineId: m.id, date, value });
  if (!m.readingDate || date >= m.readingDate) { if (value >= (m.reading || 0) || date > m.readingDate) { m.reading = value; m.readingDate = date; } }
}
function doLog(itemIds, data) {
  const m = M(data.machineId);
  const titles = itemIds.map((id) => I(id)?.title).filter(Boolean);
  const log = { id: uid(), machineId: m.id, itemIds, title: data.title || titles.join(' + '), date: data.date, reading: data.reading, cost: data.cost, shop: data.shop, notes: data.notes, receiptIds: data.receiptIds || [], skipped: !!data.skipped, checklist: data.checklist };
  S.logs.push(log);
  itemIds.forEach((id) => { const it = I(id); if (!it) return; if (!it.lastDate || data.date >= it.lastDate) { it.unknown = false; it.lastDate = data.date; if (data.reading != null) it.lastReading = data.reading; else if (hasMeter(m)) it.lastReading = m.reading; } it.snoozeUntil = null; });
  if (data.reading != null) setReading(m, data.reading, data.date);
  (data.receiptIds || []).forEach((rid) => { const r = S.receipts.find((x) => x.id === rid); if (r) r.logId = log.id; });
  return log;
}
function recomputeItem(it) {
  const m = M(it.machineId);
  const last = lastLogFor(it.id);
  const lastAny = S.logs.filter((l) => (l.itemIds || []).includes(it.id)).sort((a, b) => b.date.localeCompare(a.date))[0];
  const l = lastAny || last;
  if (l) { it.lastDate = l.date; it.lastReading = l.reading ?? it.lastReading; }
  else { it.lastDate = it.created || it.lastDate; }
}

/* ======================= actions ======================= */
const val = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
const ACT = {
  go: (el) => go(el.dataset.to),
  'go-close': (el) => { closeSheet(); go(el.dataset.to); },
  home: () => go('#/'),
  back: (el) => go(el.dataset.to || '#/'),
  'close-sheet': () => closeSheet(),
  print: () => window.print(),
  'restore-start': () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.onchange = () => restoreFile(i.files[0]); i.click(); },
  'finish-onboard': async (el) => {
    S.settings.garage = val('garageName') || S.settings.garage;
    S.settings.onboarded = true; save();
    if (el.dataset.notify && 'Notification' in window) { try { const p = await Notification.requestPermission(); S.settings.notify = p === 'granted'; save(); } catch (e) {} }
    newDraft(); go(S.machines.length ? '#/' : '#/add');
  },
  'rename-garage': () => prompt2('Garage name', 'Name', S.settings.garage, (v) => { S.settings.garage = v.trim() || "Bill's Garage"; save(); render(); }),
  'pick-cat': (el) => { draft.cat = el.dataset.cat; draft.unit = null; go('#/add/2'); },
  'toggle-draft-new': () => { draft.isNew = !draft.isNew; keepDraftFields(); render(); },
  'decode-vin': async () => {
    keepDraftFields();
    const vin = val('vin').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const msg = $('#vinmsg');
    if (vin.length !== 17) { msg.textContent = 'A VIN is 17 letters and numbers.'; return; }
    msg.textContent = 'Looking it up…';
    try {
      const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
      const j = await r.json(); const d = (j.Results || [])[0] || {};
      if (!d.Make) throw new Error('not found');
      const title = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      draft.vin = vin; draft.serial = vin; draft.make = title(d.Make); draft.model = d.Model || ''; draft.year = d.ModelYear || '';
      if (/motorcycle/i.test(d.VehicleType || '')) draft.cat = 'motorcycle'; else if (/pickup/i.test(d.BodyClass || '')) draft.cat = 'truck';
      draft.trim = [d.Trim, d.DisplacementL ? Number(d.DisplacementL).toFixed(1) + 'L' : '', d.FuelTypePrimary].filter(Boolean).join(' · ');
      if (!draft.name) draft.name = `${draft.year} ${draft.make} ${draft.model}`.trim();
      render(); setTimeout(() => { const m2 = $('#vinmsg'); if (m2) m2.textContent = `Found: ${draft.year} ${draft.make} ${draft.model}${draft.trim ? ' · ' + draft.trim : ''}`; }, 30);
    } catch (e) { msg.textContent = "Couldn't look that up (no signal or unknown VIN). You can type it in below."; }
  },
  'add-next-2': () => {
    keepDraftFields();
    if (!draft.name) draft.name = [draft.make, draft.model].filter(Boolean).join(' ') || (CATS[draft.cat] || CATS.other).label;
    go('#/add/3');
  },
  'draft-unit': (el) => { const r = $('#reading'); if (r) draft.reading = r.value; draft.unit = el.dataset.unit; render(); },
  'add-next-3': (el) => { const r = $('#reading'); draft.reading = r ? r.value : ''; draft.unit = el.dataset.unit; go('#/add/4'); },
  'add-save': () => {
    const m = { id: uid(), name: draft.name, cat: draft.cat || 'other', make: draft.make, model: draft.model, year: draft.year, serial: draft.serial, trim: draft.trim, unit: draft.unit || 'none', reading: num(draft.reading) || 0, readingDate: todayISO(), photoId: draft.photoId, severe: false, archived: false, isNew: draft.isNew, specs: {}, created: todayISO() };
    S.machines.push(m);
    if (hasMeter(m)) S.readings.push({ id: uid(), machineId: m.id, date: todayISO(), value: m.reading });
    save(); suggestSel = null; newDraft(); go('#/added/' + m.id);
  },
  'sug-toggle': (el) => { suggestSel.on[el.dataset.key] = !suggestSel.on[el.dataset.key]; el.querySelector('.switch').classList.toggle('on', suggestSel.on[el.dataset.key]); },
  'sug-last': (el) => { suggestSel.last = el.dataset.v; render(); },
  'sug-save': (el) => {
    const m = M(el.dataset.id);
    templatesFor(m).filter((tp) => suggestSel.on[tp.key] && !S.items.some((i) => i.machineId === m.id && i.key === tp.key)).forEach((tp) => {
      const it = itemFromTemplate(m, tp, { isNew: m.isNew });
      if (suggestSel.last === 'unknown') { it.unknown = true; it.lastDate = addMonths(todayISO(), -(it.every.months || 120)); if (it.every.u) it.lastReading = (m.reading || 0) - it.every.u; it.first = null; }
      S.items.push(it);
    });
    save(); suggestSel = null; go('#/m/' + m.id); toast('Schedule saved');
  },
  'item-toggle': (el) => { const it = I(el.dataset.id); it.enabled = it.enabled === false; save(); el.querySelector('.switch').classList.toggle('on', it.enabled); },
  'tpl-add': (el) => { const m = M(el.dataset.id); const tp = templatesFor(m).find((x) => x.key === el.dataset.key); S.items.push(itemFromTemplate(m, tp)); save(); render(); toast(`Tracking ${tp.title.toLowerCase()}`); },
  'custom-save': (el) => {
    const m = M(el.dataset.mid);
    const title = val('c_title'); if (!title) { $('#c_title').focus(); return toast('Give it a name'); }
    const u = num(val('c_u')), months = num(val('c_months'));
    if (!u && !months) return toast('Set how often it repeats');
    let it = el.dataset.id ? I(el.dataset.id) : null;
    if (!it) { it = { id: uid(), machineId: m.id, key: null, icon: guessIcon(title), need: [], how: title, enabled: true, created: todayISO() }; S.items.push(it); }
    it.title = title; it.every = { u: u || null, months: months || null }; it.notes = val('c_notes');
    it.lastDate = val('c_lastDate') || todayISO(); if (hasMeter(m)) it.lastReading = num(val('c_lastReading')) ?? m.reading;
    it.snoozeUntil = null;
    save(); go(el.dataset.id ? '#/i/' + it.id : '#/m/' + m.id); toast('Saved');
  },
  'reset-item': (el) => { const it = I(el.dataset.id); const m = M(it.machineId); const tp = templatesFor(m).find((x) => x.key === it.key); if (!tp) return; const fresh = itemFromTemplate(m, tp); it.every = fresh.every; it.severe = fresh.severe; it.title = tp.title; save(); render(); toast('Reset to suggested'); },
  log: (el, e) => { e.stopPropagation(); closeFab(); openLog(el.dataset.id); },
  'log-also': (el) => { el.querySelector('.check').classList.toggle('on'); },
  'log-save': async (el) => {
    const editing = el.dataset.log ? S.logs.find((l) => l.id === el.dataset.log) : null;
    const it = el.dataset.item ? I(el.dataset.item) : null;
    const m = M(editing ? editing.machineId : it.machineId);
    let shop = val('l_shop');
    if (shop === '__new') { shop = window.prompt('Shop name?') || ''; }
    const data = { machineId: m.id, date: val('l_date') || todayISO(), reading: hasMeter(m) ? num(val('l_reading')) : null, cost: num(val('l_cost')), shop, notes: val('l_notes') };
    const rids = [];
    for (const b of logPhotos) { const pid = await putPhoto(b); const r = { id: uid(), machineId: m.id, photoId: pid, date: data.date, vendor: shop || '', total: data.cost, category: 'Service' }; S.receipts.push(r); rids.push(r.id); }
    if (editing) {
      const snap = snapshot();
      Object.assign(editing, { title: val('l_title') || editing.title, date: data.date, reading: data.reading, cost: data.cost, shop: data.shop, notes: data.notes });
      editing.receiptIds = [...(editing.receiptIds || []), ...rids];
      rids.forEach((rid) => { const r = S.receipts.find((x) => x.id === rid); if (r) r.logId = editing.id; });
      (editing.itemIds || []).forEach((id) => { const i2 = I(id); if (i2) recomputeItem(i2); });
      if (data.reading != null) setReading(m, data.reading, data.date);
      save(); closeSheet(); render(); toast('Updated', () => { S = snap; save(); render(); });
      return;
    }
    const also = [...document.querySelectorAll('[data-also]')].filter((c) => c.classList.contains('on')).map((c) => c.dataset.also);
    const snap = snapshot();
    const ids = [it.id, ...also];
    doLog(ids, { ...data, receiptIds: rids });
    save(); closeSheet(); render();
    const next = itemStatus(it);
    toast(`Logged. Next: ${next.dueDate ? fmtDate(next.dueDate, true) : next.text.replace('Due in ', 'in ')}`, () => { S = snap; save(); render(); });
  },
  'log-del': (el) => { const l = S.logs.find((x) => x.id === el.dataset.id); closeSheet(); undoable('Entry deleted', () => { S.logs = S.logs.filter((x) => x.id !== l.id); (l.itemIds || []).forEach((id) => { const it = I(id); if (it) recomputeItem(it); }); }); },
  'edit-log': (el) => openLog(null, el.dataset.id),
  'edit-fuel': (el) => { const f = S.fuel.find((x) => x.id === el.dataset.id); confirm2('Fuel-up', `${fmtDate(f.date, true)} · ${f.gallons} gal · ${money(f.total)}`, 'Delete fuel-up', () => undoable('Fuel-up deleted', () => { S.fuel = S.fuel.filter((x) => x.id !== f.id); recalcMPG(f.machineId); })); },
  'log-any': () => {},
  'log-oneoff': (el) => openOneOff(el.dataset.id),
  'oneoff-save': (el) => {
    const m = M(el.dataset.id); const title = val('o_title'); if (!title) return toast('What was done?');
    const snap = snapshot();
    doLog([], { machineId: m.id, title, date: val('o_date') || todayISO(), reading: hasMeter(m) ? num(val('o_reading')) : null, cost: num(val('o_cost')), shop: val('o_shop'), notes: val('o_notes') });
    save(); closeSheet(); go('#/m/' + m.id + '/history'); toast('Logged', () => { S = snap; save(); render(); });
  },
  snooze: (el, e) => { e.stopPropagation(); openSnooze(el.dataset.id); },
  'snooze-set': (el) => { const it = I(el.dataset.id); const d = +el.dataset.days; closeSheet(); undoable(d ? `Snoozed ${d === 1 ? 'until tomorrow' : 'for ' + humanDays(d)}` : 'Un-snoozed', () => { it.snoozeUntil = d ? addDays(todayISO(), d) : null; }); },
  skip: (el) => { const it = I(el.dataset.id); const m = M(it.machineId); closeSheet(); undoable('Skipped. Interval reset', () => { doLog([it.id], { machineId: m.id, title: it.title, date: todayISO(), reading: hasMeter(m) ? m.reading : null, skipped: true }); }); },
  reading: (el, e) => { e && e.stopPropagation(); closeFab(); openReading(el.dataset.id); },
  'reading-save': (el) => {
    const m = M(el.dataset.id); const v = num($('#np').dataset.v || '');
    if (v == null) { closeSheet(); return; }
    if (v < (m.reading || 0) && !window.confirm(`That's lower than the last reading (${fmtN(m.reading, UNIT_LABEL[m.unit])}). Save anyway?`)) return;
    const snap = snapshot(); setReading(m, v); if (v < (snap.machines.find((x) => x.id === m.id).reading || 0)) { m.reading = v; m.readingDate = todayISO(); }
    save(); closeSheet(); render(); toast(`${m.name}: ${fmtN(v, UNIT_LABEL[m.unit])}`, () => { S = snap; save(); render(); });
  },
  'machine-menu': (el) => openMachineMenu(el.dataset.id),
  'item-menu': (el) => openItemMenu(el.dataset.id),
  'item-off': (el) => { const it = I(el.dataset.id); closeSheet(); go('#/m/' + it.machineId); undoable(`Stopped tracking ${it.title.toLowerCase()}`, () => { it.enabled = false; }); },
  fab: (el) => openFab(el.dataset.id),
  'fab-close': () => closeFab(),
  'fab-go': (el) => {
    closeFab(); const to = el.dataset.to, id = el.dataset.id;
    if (to === 'reading') openReading(id); else if (to === 'log-any') openAnyLog(id); else go(to);
  },
  'save-specs': (el) => { const m = M(el.dataset.id); m.specs = Object.fromEntries(SPEC_FIELDS.map(([k]) => [k, val('sp_' + k)]).filter(([, v]) => v)); save(); go('#/m/' + m.id); toast('Specs saved'); },
  'toggle-severe': (el) => { const m = M(el.dataset.id); m.severe = !m.severe; save(); el.querySelector('.switch').classList.toggle('on', m.severe); },
  'edit-save': (el) => {
    const m = M(el.dataset.id);
    Object.assign(m, { name: val('e_name') || m.name, make: val('e_make'), model: val('e_model'), year: val('e_year'), serial: val('e_serial'), purchased: val('e_purchased') });
    save(); go('#/m/' + m.id); toast('Saved');
  },
  archive: (el) => { const m = M(el.dataset.id); closeSheet(); go('#/'); undoable(`${m.name} archived`, () => { m.archived = true; }); },
  unarchive: (el) => { const m = M(el.dataset.id); m.archived = false; save(); render(); toast('Restored'); },
  'delete-machine': (el) => { const m = M(el.dataset.id); confirm2(`Delete ${m.name}?`, 'This removes the machine and all of its history, notes, receipts and warranties. Archive it instead if you sold it.', 'Delete forever', () => { go('#/'); undoable(`${m.name} deleted`, () => { const id = m.id; S.machines = S.machines.filter((x) => x.id !== id); ['items', 'logs', 'notes', 'receipts', 'warranties', 'fuel', 'readings'].forEach((k) => (S[k] = S[k].filter((x) => x.machineId !== id))); }); }); },
  duplicate: (el) => { const m = M(el.dataset.id); const c = JSON.parse(JSON.stringify(m)); c.id = uid(); c.name = m.name + ' (2)'; S.machines.push(c); S.items.filter((i) => i.machineId === m.id).forEach((i) => S.items.push({ ...JSON.parse(JSON.stringify(i)), id: uid(), machineId: c.id, lastDate: todayISO(), lastReading: c.reading })); save(); closeSheet(); go('#/m/' + c.id + '/edit'); toast('Duplicated. Rename it'); },
  'receipt-save': async (el) => {
    const mid = val('r_mid') || el.dataset.mid;
    let r = el.dataset.id ? S.receipts.find((x) => x.id === el.dataset.id) : null;
    if (!r) { r = { id: uid(), photoId: pendingReceipt?.photoId || null }; S.receipts.push(r); }
    Object.assign(r, { machineId: mid, vendor: val('r_vendor'), date: val('r_date'), total: num(val('r_total')), category: val('r_cat') });
    pendingReceipt = null; save(); go('#/m/' + mid + '/warranty'); toast('Receipt saved');
  },
  'receipt-del': (el) => { const r = S.receipts.find((x) => x.id === el.dataset.id); go('#/m/' + r.machineId + '/warranty'); undoable('Receipt deleted', () => { S.receipts = S.receipts.filter((x) => x.id !== r.id); }); },
  ocr: async () => {
    const msg = $('#ocrmsg'); msg.textContent = 'Reading… (first time takes a moment)';
    try {
      if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
      const blob = await idbGet('files', pendingReceipt.photoId);
      const { data } = await window.Tesseract.recognize(blob, 'eng');
      const text = data.text || '';
      const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
      const amounts = [...text.matchAll(/(?:total|amount|balance|due)[^\d$]{0,20}\$?\s*(\d{1,5}[.,]\d{2})/gi)].map((x) => parseFloat(x[1].replace(',', '.')));
      const all = [...text.matchAll(/\$?\s*(\d{1,5}\.\d{2})\b/g)].map((x) => parseFloat(x[1]));
      const total = amounts.length ? amounts[amounts.length - 1] : all.length ? Math.max(...all) : null;
      const dm = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
      let date = null; if (dm) { let y = +dm[3]; if (y < 100) y += 2000; date = `${y}-${String(+dm[1]).padStart(2, '0')}-${String(+dm[2]).padStart(2, '0')}`; if (isNaN(parseD(date))) date = null; }
      pendingReceipt.ocr = { vendor: lines[0] ? lines[0].slice(0, 40) : '', total, date };
      if ($('#r_vendor') && !val('r_vendor')) $('#r_vendor').value = pendingReceipt.ocr.vendor;
      if ($('#r_total') && total != null) $('#r_total').value = total.toFixed(2);
      if ($('#r_date') && date) $('#r_date').value = date;
      msg.textContent = 'Filled in what we could read. Double-check it.';
    } catch (e) { msg.textContent = "Couldn't read it. Needs a signal the first time. Type it in instead."; }
  },
  'warranty-save': (el) => {
    let w = el.dataset.id ? S.warranties.find((x) => x.id === el.dataset.id) : null;
    if (!w) { w = { id: uid(), machineId: el.dataset.mid }; S.warranties.push(w); }
    Object.assign(w, { provider: val('w_provider'), coverage: val('w_coverage'), start: val('w_start'), end: val('w_end'), limit: num(val('w_limit')), policy: val('w_policy'), notes: val('w_notes') });
    save(); go('#/m/' + w.machineId + '/warranty'); toast('Warranty saved');
  },
  'warranty-del': (el) => { const w = S.warranties.find((x) => x.id === el.dataset.id); go('#/m/' + w.machineId + '/warranty'); undoable('Warranty deleted', () => { S.warranties = S.warranties.filter((x) => x.id !== w.id); }); },
  'toggle-pin': () => $('#n_pin').classList.toggle('on'),
  'note-save': (el) => {
    const body = val('n_body'); if (!body) return toast('Write something first');
    let n = el.dataset.id ? S.notes.find((x) => x.id === el.dataset.id) : null;
    if (!n) { n = { id: uid(), date: todayISO() }; S.notes.push(n); }
    Object.assign(n, { machineId: val('n_mid') || el.dataset.mid, body, itemId: val('n_item') || null, pinned: $('#n_pin').classList.contains('on') });
    save(); go('#/m/' + n.machineId + '/notes'); toast('Note saved');
  },
  'note-del': (el) => { const n = S.notes.find((x) => x.id === el.dataset.id); go('#/m/' + n.machineId + '/notes'); undoable('Note deleted', () => { S.notes = S.notes.filter((x) => x.id !== n.id); }); },
  'toggle-full': () => $('#f_full').classList.toggle('on'),
  'fuel-save': (el) => {
    const m = M(el.dataset.mid);
    const g = num(val('f_gal')); if (!g) return toast('How much fuel?');
    const f = { id: uid(), machineId: m.id, date: val('f_date') || todayISO(), reading: num(val('f_reading')), gallons: g, total: num(val('f_total')), full: $('#f_full').classList.contains('on') };
    S.fuel.push(f); if (f.reading) setReading(m, f.reading, f.date); recalcMPG(m.id);
    save(); go('#/m/' + m.id + '/history'); toast(f.mpg ? `${f.mpg.toFixed(1)} ${m.unit === 'km' ? 'km/L' : 'mpg'}` : 'Fuel-up saved');
  },
  'cl-toggle': (el) => el.querySelector('.check').classList.toggle('on'),
  'cl-save': (el) => {
    const m = M(el.dataset.mid), c = CHECKLISTS[el.dataset.key];
    const done = c.items.filter((_, i) => $('#cl_' + i).classList.contains('on'));
    if (!done.length) return toast('Check off at least one step');
    const snap = snapshot();
    const match = S.items.filter((i) => i.machineId === m.id && ((el.dataset.key === 'winter' && /winter|storage/i.test(i.title))));
    doLog(match.map((i) => i.id), { machineId: m.id, title: c.title, date: todayISO(), reading: hasMeter(m) ? m.reading : null, notes: done.join(' · '), checklist: el.dataset.key });
    save(); go('#/m/' + m.id + '/history'); toast(`${c.title} saved`, () => { S = snap; save(); render(); });
  },
  'check-recalls': async (el) => {
    const m = M(el.dataset.id); const msg = $('#recallmsg'); msg.textContent = 'Checking…';
    try {
      const r = await fetch(`https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(m.make)}&model=${encodeURIComponent(m.model)}&modelYear=${encodeURIComponent(m.year)}`);
      const j = await r.json();
      m.recalls = (j.results || []).map((x) => ({ campaign: x.NHTSACampaignNumber, component: x.Component, summary: x.Summary, remedy: x.Remedy, date: x.ReportReceivedDate }));
      m.recallsChecked = todayISO(); m.recallsSeen = true; save(); render();
    } catch (e) { msg.textContent = "Couldn't reach NHTSA right now. Try again with a signal."; }
  },
  'toggle-units': () => { S.settings.distUnit = S.settings.distUnit === 'km' ? 'mi' : 'km'; save(); render(); },
  'lead-days': () => prompt2('"Due soon" warning', 'Days ahead', S.settings.leadDays, (v) => { S.settings.leadDays = Math.max(1, Math.min(90, num(v) || 14)); save(); render(); }, 'number'),
  'notify-on': async () => {
    if (!('Notification' in window)) return toast('On iPhone: Share → Add to Home Screen, then open it from there');
    const p = await Notification.requestPermission(); S.settings.notify = p === 'granted'; save(); render();
    if (p === 'granted') { S.settings.lastNotify = ''; checkNotify(true); }
  },
  'ics-all': () => downloadICS(ranked().map((x) => x.it), 'garage-maintenance.ics'),
  'ics-machine': (el) => { closeSheet(); downloadICS(ranked(el.dataset.id).map((x) => x.it), 'maintenance.ics'); },
  'ics-item': (el) => { closeSheet(); downloadICS([I(el.dataset.id)], 'maintenance.ics'); },
  backup: () => doBackup(),
  csv: (el) => downloadCSV(el.dataset.id),
  'reset-all': () => confirm2('Erase everything?', 'All machines, history, receipts and photos on this phone will be deleted. Make a backup first if you might want it.', 'Erase all data', async () => { S = blank(); S.settings.onboarded = false; save(); if (idb) { const tx = idb.transaction('files', 'readwrite'); tx.objectStore('files').clear(); } go('#/welcome/1'); }),
};
function keepDraftFields() {
  if (!draft) return;
  [['name', 'name'], ['make', 'make'], ['model', 'model'], ['year', 'year'], ['serial', 'serial']].forEach(([id, k]) => { const e = document.getElementById(id); if (e) draft[k] = e.value.trim(); });
  const v = document.getElementById('vin'); if (v && v.value.trim()) { draft.vin = v.value.trim().toUpperCase(); if (!draft.serial) draft.serial = draft.vin; }
}
function guessIcon(t) {
  const s = t.toLowerCase();
  return /oil/.test(s) ? 'oil' : /blade/.test(s) ? 'blade' : /batter/.test(s) ? 'battery' : /air/.test(s) ? 'air' : /filter/.test(s) ? 'filter' : /plug/.test(s) ? 'plug' : /tire|wheel|bearing/.test(s) ? 'tire' : /belt/.test(s) ? 'belt' : /grease|lube/.test(s) ? 'grease' : /chain/.test(s) ? 'chain' : /brake/.test(s) ? 'brake' : /coolant|fluid|hydraul/.test(s) ? 'coolant' : /fuel|gas/.test(s) ? 'fuel' : /winter|storage/.test(s) ? 'snow' : /wiper/.test(s) ? 'wiper' : 'wrench';
}
function recalcMPG(mid) {
  const fs = S.fuel.filter((f) => f.machineId === mid).sort((a, b) => (a.reading || 0) - (b.reading || 0));
  let lastFull = null, galSince = 0;
  fs.forEach((f) => { f.mpg = null; galSince += f.gallons || 0; if (f.full) { if (lastFull && f.reading && lastFull.reading && f.reading > lastFull.reading) f.mpg = (f.reading - lastFull.reading) / galSince; lastFull = f; galSince = 0; } });
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

/* file inputs */
const CHANGE = {
  'draft-photo': async (el) => { const f = el.files[0]; if (!f) return; keepDraftFields(); draft.photoId = await putPhoto(await compress(f)); render(); },
  'machine-photo': async (el) => { const f = el.files[0]; if (!f) return; const m = M(el.dataset.id); m.photoId = await putPhoto(await compress(f)); save(); render(); },
  'receipt-photo': async (el) => { const f = el.files[0]; if (!f) return; const id = await putPhoto(await compress(f, 2000, 0.85)); const r = route(); if (r[2]) { const rc = S.receipts.find((x) => x.id === r[2]); rc.photoId = id; save(); } else { pendingReceipt.photoId = id; pendingReceipt.ocr = null; } render(); },
  'log-photo': async (el) => { const f = el.files[0]; if (!f) return; logPhotos.push(await compress(f, 2000, 0.85)); $('#l_photoLabel').textContent = `${plural(logPhotos.length, 'photo')} attached · add another`; },
  restore: (el) => restoreFile(el.files[0]),
};

/* ======================= exports ======================= */
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
async function doBackup() {
  toast('Packing up your data…');
  const files = {};
  const ids = new Set([...S.machines.map((m) => m.photoId), ...S.receipts.map((r) => r.photoId)].filter(Boolean));
  for (const id of ids) { const b = await idbGet('files', id); if (b) files[id] = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); }
  S.settings.lastBackup = todayISO(); save();
  download(`garage-backup-${todayISO()}.json`, new Blob([JSON.stringify({ app: 'bills-garage', ...S, files })], { type: 'application/json' }));
  render();
}
async function restoreFile(file) {
  if (!file) return;
  try {
    const j = JSON.parse(await file.text());
    if (!j.machines) throw new Error('bad');
    for (const [id, d] of Object.entries(j.files || {})) { const b = await (await fetch(d)).blob(); await idbPut('files', id, b); }
    delete j.files; delete j.app;
    S = Object.assign(blank(), j); S.settings = Object.assign(blank().settings, j.settings || {}, { onboarded: true });
    save(); go('#/'); toast(`Restored ${plural(S.machines.length, 'machine')}`);
  } catch (e) { toast("That file isn't a garage backup"); }
}
function downloadCSV(mid) {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Machine', 'Date', 'What', 'Reading', 'Unit', 'Cost', 'Shop', 'Notes', 'Skipped']];
  S.logs.filter((l) => !mid || l.machineId === mid).sort((a, b) => a.date.localeCompare(b.date)).forEach((l) => { const m = M(l.machineId); rows.push([m?.name, l.date, l.title, l.reading, m ? UNIT_LABEL[m.unit] : '', l.cost, l.shop, l.notes, l.skipped ? 'yes' : '']); });
  S.fuel.filter((f) => !mid || f.machineId === mid).forEach((f) => { const m = M(f.machineId); rows.push([m?.name, f.date, `Fuel-up ${f.gallons} gal${f.mpg ? ' (' + f.mpg.toFixed(1) + ' mpg)' : ''}`, f.reading, m ? UNIT_LABEL[m.unit] : '', f.total, '', '', '']); });
  download(`maintenance-history${mid ? '-' + (M(mid).name || '').replace(/\W+/g, '-').toLowerCase() : ''}.csv`, new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
}
function downloadICS(items, name) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bills Garage//EN', 'CALSCALE:GREGORIAN'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  let n = 0;
  items.forEach((it) => {
    const st = itemStatus(it), m = M(it.machineId);
    const d = (st.state === 'over' ? todayISO() : st.dueDate) || null; if (!d) return;
    const dt = d.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${it.id}-${dt}@billsgarage`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${dt}`, `DTEND;VALUE=DATE:${addDays(d, 1).replace(/-/g, '')}`,
      `SUMMARY:${(m.name + ': ' + it.title).replace(/[,;]/g, ' ')}`, `DESCRIPTION:${st.text.replace(/[,;]/g, ' ')}`, 'BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Maintenance due', 'END:VALARM', 'END:VEVENT');
    n++;
  });
  lines.push('END:VCALENDAR');
  if (!n) return toast('Nothing with a due date yet');
  download(name, new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  toast(`${plural(n, 'reminder')} ready. Open the file to add them`);
}

/* ======================= reminders ======================= */
async function checkNotify(force) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!force && S.settings.lastNotify === todayISO()) return;
  const r = ranked();
  const over = r.filter((x) => x.st.state === 'over'), soon = r.filter((x) => x.st.state === 'soon');
  if (!over.length && !soon.length) { if (force) toast('Reminders on. Nothing due right now'); return; }
  const title = over.length ? `${plural(over.length, 'thing')} overdue` : `${plural(soon.length, 'thing')} due soon`;
  const body = [...over, ...soon].slice(0, 3).map((x) => `${M(x.it.machineId).name}: ${x.it.title}`).join('\n');
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg) reg.showNotification(title, { body, icon: 'icon.svg', badge: 'icon.svg', tag: 'garage-due' });
    else new Notification(title, { body, icon: 'icon.svg' });
  } catch (e) {}
  S.settings.lastNotify = todayISO(); save();
}

/* ======================= events + boot ======================= */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (fn) { if (el.tagName === 'A') return; e.preventDefault(); fn(el, e); }
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape') { closeSheet(); closeFab(); }
});
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el && CHANGE[el.dataset.change]) CHANGE[el.dataset.change](el, e); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkNotify(); if (!$('#scrim') && !route().some((x) => ['add', 'custom', 'receipt', 'warranty', 'note', 'fuel', 'specs', 'edit'].includes(x))) render(); } });

(async function boot() {
  await load();
  if ('serviceWorker' in navigator) { try { await navigator.serviceWorker.register('sw.js'); } catch (e) {} }
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
  render();
  setTimeout(() => checkNotify(), 1500);
})();
