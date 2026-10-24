/* Garage — app logic (vanilla JS, no build step, data stays on the device) */
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
  settings: { theme: 'shop', swipeHint: false, garage: 'My Garage', distUnit: 'mi', leadDays: 14, onboarded: false, notify: false, lastNotify: '', lastBackup: '', backupEvery: 30, backupSnooze: '', firstUse: '', installDismissed: false },
  machines: [], items: [], logs: [], notes: [], receipts: [], warranties: [], fuel: [], readings: [],
});
let S = blank();
let saveTimer = null, saveSeq = 0;
function save() {
  saveSeq++;
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
  if (!S.settings.firstUse) { S.settings.firstUse = todayISO(); save(); }
}

/* photos */
const urlCache = {};
async function putPhoto(blob) {
  const id = uid();
  let rec = blob;
  try { rec = { type: blob.type || 'image/jpeg', buf: await blob.arrayBuffer() }; } catch (e) {}
  await idbPut('files', id, rec);
  urlCache[id] = URL.createObjectURL(blob);
  return id;
}
async function getPhotoBlob(id) {
  const r = await idbGet('files', id);
  if (!r) return null;
  if (r instanceof Blob) return r;
  if (r.buf) return new Blob([r.buf], { type: r.type || 'image/jpeg' });
  return null;
}
async function photoURL(id) {
  if (!id) return null;
  if (urlCache[id]) return urlCache[id];
  const b = await getPhotoBlob(id);
  if (!b) return null;
  urlCache[id] = URL.createObjectURL(b);
  return urlCache[id];
}
/* every photo the app knows about, so they can be loaded once at start */
const allPhotoIds = () => [...S.machines.map((m) => m.photoId), ...S.receipts.map((r) => r.photoId)].filter(Boolean);
async function warmPhotos() { await Promise.all(allPhotoIds().map((id) => photoURL(id))); }
/* photo layer: shows instantly when already loaded, otherwise fades in. Covers the line-art placeholder. */
function photoTag(id, cls = 'ph') {
  if (!id) return '';
  const u = urlCache[id];
  return `<img class="${cls}${u ? ' ready' : ''}" data-fid="${id}" alt="" decoding="async" ${u ? `src="${u}"` : ''}>`;
}
function hydratePhotos(root = document) {
  root.querySelectorAll('img[data-fid]').forEach(async (img) => {
    if (img.getAttribute('src')) { img.classList.add('ready'); img.hidden = false; return; }
    const u = await photoURL(img.dataset.fid);
    if (!u) { img.remove(); return; }
    img.onload = () => { img.classList.add('ready'); img.hidden = false; };
    img.src = u;
  });
}
/* shrink + fix rotation (uses the photo's EXIF orientation) before saving */
async function compress(file, max = 1600, q = 0.82) {
  let src = null, w = 0, h = 0, url = null;
  try {
    if (window.createImageBitmap) { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = src.width; h = src.height; }
  } catch (e) { src = null; }
  if (!src) {
    src = await new Promise((res) => { const img = new Image(); url = URL.createObjectURL(file); img.onload = () => res(img); img.onerror = () => res(null); img.src = url; });
    if (!src) { if (url) URL.revokeObjectURL(url); return file; }
    w = src.naturalWidth; h = src.naturalHeight;
  }
  const sc = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  if (src.close) src.close();
  if (url) URL.revokeObjectURL(url);
  return new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', q));
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
/* 52310 -> 52,310 while typing (keeps a decimal for engine hours) */
function withCommas(v) {
  v = String(v ?? '').replace(/[^0-9.]/g, '');
  if (!v) return '';
  const [a, ...rest] = v.split('.');
  const intPart = a.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length ? `${intPart || '0'}.${rest.join('').slice(0, 1)}` : intPart;
}
function fmtCommaInputs(root = document) { root.querySelectorAll('input[data-commas]').forEach((i) => { if (i.value) i.value = withCommas(i.value); }); }
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
const NO_METER = ['cat', 'birdfeeder'];
const VEH_CATS = ['car', 'truck', 'motorcycle', 'camper', 'rv'];
const isVehicle = (m) => VEH_CATS.includes(m.cat);
/* time part of an interval: months, or days for short jobs (bird feeders, litter) */
const hasTime = (ev) => !!(ev && (ev.months || ev.days));
const dueFrom = (last, ev) => (ev.days ? addDays(last, ev.days) : addMonths(last, ev.months));
const backDate = (ev) => (ev.days ? addDays(todayISO(), -ev.days) : addMonths(todayISO(), -((ev && ev.months) || 120)));
const timeText = (ev) => (!ev ? '' : ev.days ? (ev.days % 7 === 0 ? plural(ev.days / 7, 'week') : plural(ev.days, 'day')) : ev.months ? (ev.months % 12 === 0 && ev.months >= 12 ? plural(ev.months / 12, 'year') : plural(ev.months, 'month')) : '');

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
  const every = useFirst ? { u: it.first.u ?? it.every.u, months: it.first.months ?? it.every.months, days: it.first.days ?? it.every.days } : it.every;
  const sev = m.severe && it.severe ? { u: it.severe.u ?? every.u, months: it.severe.months ?? every.months, days: every.days } : null;
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
  if (hasTime(ev)) {
    const last = it.lastDate || today;
    const due = dueFrom(last, ev);
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
  const span = hasTime(ev) ? daysBetween(it.lastDate || today, dueFrom(it.lastDate || today, ev)) : 0;
  const soonD = out.remDays != null && out.remDays <= Math.min(lead, Math.max(1, Math.round(span * 0.25)));
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
    return { u, months: o.months ?? null, days: o.days ?? null };
  };
  const ev = conv(tp.every);
  if (!ev.u && !hasTime(ev)) ev.months = 12;
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
  if (!S.settings.onboarded && !['welcome', 'add', 'added', 'suggest', 'install', 'safety', 'feedback'].includes(r[0])) { location.replace('#/welcome/1'); return; }
  const [a, b, c, d] = r;
  const same = render.lastHash === location.hash, y = window.scrollY;
  render.lastHash = location.hash;
  let html = '';
  try {
    if (!a) html = vGarage();
    else if (a === 'welcome') html = vWelcome(+b || 1);
    else if (a === 'schedule') html = vSchedule();
    else if (a === 'profile' || a === 'settings') html = vProfile();
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
    else if (a === 'precheck' && M(b)) html = vPrecheck(b);
    else if (a === 'archived') html = vArchived();
    else if (a === 'install') html = vInstall();
    else if (a === 'import') html = vImport();
    else if (a === 'data') html = vData();
    else if (a === 'log') html = vLog(b && M(b) ? b : null);
    else if (a === 'safety') html = vSafety();
    else if (a === 'feedback') html = vFeedback();
    else html = vGarage();
  } catch (e) { console.error(e); html = `<div class="screen"><div class="empty"><b>Something went wrong.</b><span>${esc(e.message)}</span><button class="btn secondary" data-act="home">Back to garage</button></div></div>`; }
  applyTheme();
  app().innerHTML = html;
  if (same) { const sc = app().firstElementChild; if (sc) sc.style.animation = 'none'; app().querySelectorAll('.stagger > *').forEach((x) => (x.style.animation = 'none')); window.scrollTo(0, y); } else window.scrollTo(0, 0);
  const gname = S.settings.garage || 'Garage';
  if (document.title !== gname) { document.title = gname; const mt = document.querySelector('meta[name="apple-mobile-web-app-title"]'); if (mt) mt.content = gname; }
  hydratePhotos(app());
  fmtCommaInputs(app());
  after.forEach((f) => f()); after = [];
}
let after = [];

/* ======================= shared UI pieces ======================= */
const backBtn = (to) => `<button class="rbtn" data-act="back" data-to="${esc(to || '#/')}" aria-label="Back">${icon('back', 18)}</button>`;
function topBar(title, to, right = '') {
  return `<div class="hdr sticky"><div class="left">${backBtn(to)}<div class="h-title sm">${esc(title)}</div></div>${right}</div>`;
}
const steps = (n, on) => `<div class="steps">${Array.from({ length: n }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div>`;
const field = (label, inner) => `<label class="field"><span>${esc(label)}</span>${inner}</label>`;
const inp = (id, val, ph, type = 'text', extra = '') => `<input class="inp" id="${id}" type="${type}" value="${esc(val ?? '')}" placeholder="${esc(ph || '')}" ${extra}>`;
function nav(on) {
  return `<nav class="nav">
    <button class="${on === 'garage' ? 'on' : ''}" data-act="go" data-to="#/">${icon('garage', 24)}Garage</button>
    <button class="${on === 'schedule' ? 'on' : ''}" data-act="go" data-to="#/schedule">${icon('calendar', 24)}Schedule</button>
    <button class="${on === 'profile' ? 'on' : ''}" data-act="go" data-to="#/profile">${icon('settings', 24)}Settings</button>
  </nav>`;
}
function chip(it, st) {
  const cls = st.state === 'over' ? 'over' : st.state === 'soon' ? 'warn' : 'ok';
  return `<span class="chip ${cls}">${icon(it.icon, 15)}${esc(shortTitle(it.title))}</span>`;
}
function shortTitle(t) { t = t.replace(/\s*\(.*?\)/g, ''); const r = shortTitle0(t); return /^[&a-z(]/.test(r) || r.length < 3 ? t.replace(/ & dry| \(.*\)/g, '') : r; }
function shortTitle0(t) { return t.replace(/ change$| & filter$| inspection$| check$/i, '').replace(/^Sharpen /, '').replace(/^Clean & lube /, '').replace(/^Clean /, ''); }
function machineCard(m, large) {
  const r = ranked(m.id).filter((x) => x.st.state === 'over' || x.st.state === 'soon').slice(0, large ? 3 : 2);
  const chips = r.length ? r.map((x) => chip(x.it, x.st)).join('') : `<span class="chip ghost">${icon('check', 14)}All good</span>`;
  const rd = hasMeter(m) && !large ? `<span class="reading">${fmtN(m.reading, UNIT_LABEL[m.unit])}</span>` : '';
  const tag = large ? 'div' : 'button';
  return `<${tag} class="mcard ${large ? 'large' : ''}" ${large ? '' : `data-act="go" data-to="#/m/${m.id}"`} aria-label="${esc(m.name)}">
    <div class="photo">${art(m.cat, large ? 96 : 76)}${photoTag(m.photoId)}</div>
    <div class="shade"></div>${rd}
    <div class="info"><div class="name">${esc(m.name)}</div><div class="chips">${chips}</div></div>
  </${tag}>`;
}
function mrow(it, st, opts = {}) {
  const html = mrowInner(it, st, opts);
  if (opts.plain || st.state === 'snoozed') return html;
  return `<div class="swipe" data-id="${it.id}"><div class="swipe-bg"><span class="sk">${icon('x', 18)}Skip</span><span class="sn">Snooze 1 week${icon('snooze', 18)}</span></div>${html}</div>`;
}
function mrowInner(it, st, opts = {}) {
  const m = M(it.machineId);
  const cls = st.state === 'over' ? 'over' : st.state === 'soon' ? 'warn' : '';
  const last = lastLogFor(it.id);
  const meta = last ? `Last ${fmtDate(last.date)}` : it.unknown ? 'Not logged yet' : it.lastDate ? `Since ${fmtDate(it.lastDate)}` : '';
  const logLabel = it.title.length <= 16 ? 'Log ' + it.title.toLowerCase() : 'Log it';
  /* on a machine's own page the machine name is redundant: show the task title once */
  const head = opts.showMachine === false ? `<div class="tname">${icon(it.icon, 16)}<span>${esc(it.title)}</span></div>` : `${chip(it, st)}<div class="mname"${st.state === 'over' ? ' style="text-align:left"' : ''}>${esc(m.name)}</div>`;
  if (st.state === 'over' && !opts.plain) {
    return `<div class="mrow urgent" data-act="go" data-to="#/i/${it.id}" role="button" tabindex="0">
      <div class="top">${head}</div>
      <div class="mid"><span class="desc">${esc(st.text)}</span><span class="meta" style="color:#f3c4c4">${esc(meta)}</span></div>
      <div class="bigacts"><button class="logl" data-act="log" data-id="${it.id}">${esc(logLabel)}</button><button class="rbtn lg" data-act="snooze" data-id="${it.id}" aria-label="Snooze">${icon('snooze', 20)}</button></div>
    </div>`;
  }
  return `<div class="mrow" data-act="go" data-to="#/i/${it.id}" role="button" tabindex="0">
    <div class="top">${head}
      <div class="acts"><button class="rbtn sm" data-act="snooze" data-id="${it.id}" aria-label="Snooze">${icon('snooze', 14)}</button><button class="logs" data-act="log" data-id="${it.id}">Log</button></div></div>
    <div class="mid"><span class="desc">${esc(st.text)}</span><span class="meta">${esc(meta)}</span></div>
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
        <div class="iconlane"><div class="track">${['mower', 'camper', 'generator', 'tractor', 'motorcycle', 'washer', 'truck', 'ebike', 'mower', 'camper', 'generator', 'tractor', 'motorcycle', 'washer', 'truck', 'ebike'].map((a) => art(a, 120)).join('')}</div></div>
        <div class="floor"></div>
      </div>
      <h1 class="big-title">Keep every machine running</h1>
      <p class="note">Maintenance, receipts and warranties for trucks, campers, mowers and everything else.</p>
      <div class="spacer"></div>
      <div class="actions-bottom"><button class="btn primary" data-act="go" data-to="#/welcome/2">Get started</button>
      <button class="btn text" data-act="restore-start">Restore from a backup file</button></div>
    </div>`;
  }
  if (n === 2) return `<div class="screen stagger">
    ${topBar('', '#/welcome/1')}${steps(5, 1)}
    <div class="demo-frame" aria-hidden="true">${demoRow('over')}${demoRow('ok')}</div>
    <h2 class="headline">Never miss a service</h2>
    <p class="note">Reminders by miles, hours or date, whichever comes first. It learns how much you use each machine.</p>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="go" data-to="#/welcome/3">Next</button><button class="btn text" data-act="go" data-to="#/welcome/5">Skip</button></div>
  </div>`;
  if (n === 3) return `<div class="screen stagger">
    ${topBar('', '#/welcome/2')}${steps(5, 2)}
    <h2 class="headline">Everything in one spot</h2>
    <p class="note">History, receipts, warranties and part numbers live with each machine, on this phone, even with no signal.</p>
    <div class="stack" style="gap:6px">
      <div class="feat"><span class="fi">${icon('receipt', 22)}</span><div><div class="t">Snap receipts</div><div class="d">Attach them to the job</div></div></div>
      <div class="feat"><span class="fi">${icon('shield', 22)}</span><div><div class="t">Warranty countdowns</div><div class="d">Know before coverage runs out</div></div></div>
      <div class="feat"><span class="fi">${icon('checks', 22)}</span><div><div class="t">Pre-trip checklists</div><div class="d">Run through it before you head out</div></div></div>
      <div class="feat"><span class="fi">${icon('oil', 22)}</span><div><div class="t">Part numbers saved</div><div class="d">Oil, filters and plugs per machine</div></div></div>
    </div>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="go" data-to="#/welcome/4">Next</button><button class="btn text" data-act="go" data-to="#/welcome/5">Skip</button></div>
  </div>`;
  if (n === 4) return onbSafety();
  if (n === 5) {
    const cur = ['My Garage', "Bill's Garage"].includes(S.settings.garage) ? '' : S.settings.garage;
    after.push(() => { const i = $('#garageName'); if (i && !cur) setTimeout(() => i.focus(), 400); });
    return `<div class="screen stagger">
    ${topBar('', '#/welcome/4')}${steps(5, 4)}
    <h2 class="headline">Name your garage</h2>
    <p class="note">Shows at the top of the app and under the Home Screen icon.</p>
    <input class="inp bebas" id="garageName" value="${esc(cur)}" placeholder="e.g. Bill's Garage" maxlength="28" autocapitalize="words" enterkeyhint="next" style="font-size:36px;height:72px;text-transform:uppercase">
    <div class="picks">${["The Shop", "The Pole Barn", "Shed HQ", "Dad's Garage", "The Back 40"].map((x) => `<button class="pick" data-act="name-pick" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="field" style="margin-top:6px"><span>Pick a look</span>${themePicker(true)}</div>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="onb-name">Next</button></div>
  </div>`;
  }
  const standalone = isStandalone();
  return `<div class="screen stagger">
    ${topBar('', '#/welcome/5')}${steps(5, 5)}
    <h2 class="headline">${standalone ? 'Stay on schedule' : 'Put it on your Home Screen'}</h2>
    ${standalone ? `<p class="note">Get a heads-up when something is due.</p>` : `<p class="note">Full screen, works offline, reminders can show up. Do this <b style="color:#fff">before</b> adding anything: the Home Screen app keeps its own data.</p>
    ${installSteps(detectPlatform(), true)}`}
    <div class="spacer"></div>
    <div class="actions-bottom">
      ${standalone ? `<button class="btn primary" data-act="finish-onboard" data-notify="1">Turn on reminders & add a machine</button><button class="btn text" data-act="finish-onboard">Not now, just add a machine</button>`
        : `<button class="btn primary" data-act="finish-onboard">Continue</button><button class="btn text" data-act="go" data-to="#/install">More help adding it</button>`}
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

/* ======================= add to home screen ======================= */
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => { installEvt = null; toast('Installed. Open it from your Home Screen'); });
const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
function detectPlatform() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS/.test(ua) ? 'ios-chrome' : /FxiOS|EdgiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
const IOS_SHARE = '<svg class="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>';
function installSteps(pf, compact) {
  const step = (n, t, d) => `<div class="istep"><div class="n">${n}</div><div class="grow"><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div></div>`;
  const SH = `<span class="kbd">${IOS_SHARE}</span>`, ADD = `<span class="kbd" style="color:#fff">${icon('squareplus', 16)}</span>`;
  if (pf === 'android' || pf === 'desktop') {
    return `<div class="stack">${installEvt ? `<button class="btn primary" data-act="install-now">${icon('download', 18)}Install the app</button>` : ''}
      ${step(1, `Open the Chrome menu <span class="kbd" style="color:#fff">${icon('more', 16)}</span>`, 'Three dots, top right.')}
      ${step(2, 'Tap “Add to Home screen” or “Install app”', '')}
      ${step(3, 'Tap Install', 'The icon shows up with your other apps.')}</div>`;
  }
  if (pf === 'ios-chrome') {
    return `<div class="stack">
      ${step(1, `Tap Share ${SH}`, 'Top right, next to the address bar.')}
      ${step(2, `Tap Add to Home Screen ${ADD}`, 'Scroll down if you don’t see it.')}
      ${step(3, 'Tap Add', 'Then open it from the new icon, not from Chrome.')}
      ${compact ? '' : `<p class="note">Safari works best on iPhone for reminders. Same steps: open this site in Safari, tap Share (or ··· then Share), then Add to Home Screen.</p>`}</div>`;
  }
  return `<div class="stack">
    ${step(1, `Tap Share ${SH}`, 'Bottom of Safari. On newer iPhones, tap ··· first.')}
    ${step(2, `Tap Add to Home Screen ${ADD}`, 'Scroll down if you don’t see it.')}
    ${step(3, 'Leave “Open as Web App” on, tap Add', 'Then open it from the new icon from now on.')}
  </div>`;
}
let installTab = null;
function vInstall() {
  const pf = installTab || detectPlatform();
  const tabs = [['ios-safari', 'iPhone · Safari'], ['ios-chrome', 'iPhone · Chrome'], ['android', 'Android']];
  return `<div class="screen">${topBar('Add to Home Screen', S.settings.onboarded ? '#/profile' : '#/welcome/6')}
    ${isStandalone() ? `<div class="nudge"><div class="ibox" style="background:rgba(18,255,84,.15);color:var(--green)">${icon('check', 20)}</div><div class="grow"><div class="t">You’re already using the Home Screen app</div><div class="d">Nothing else to do.</div></div></div>` : ''}
    <div class="seg">${tabs.map(([k, l]) => `<button class="${(pf === k || (pf === 'ios-other' && k === 'ios-safari') || (pf === 'desktop' && k === 'android')) ? 'on' : ''}" data-act="install-tab" data-v="${k}" style="font-size:13px">${l}</button>`).join('')}</div>
    ${installSteps(pf)}
    <div class="callout"><b>Heads up:</b> the Home Screen app keeps its own data. Already logged things here? Back up first, then Restore inside the new app.</div>
    ${S.machines.length ? `<button class="btn secondary" data-act="backup">${icon('save', 18)}Back up what’s here first</button>` : ''}
  </div>`;
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
  if (ms.length && !isStandalone() && !S.settings.installDismissed) nudges.push(`<div class="nudge"><button class="row grow" style="text-align:left" data-act="go" data-to="#/install"><div class="ibox">${icon('squareplus', 20)}</div><div class="grow"><div class="t">Add to your Home Screen</div><div class="d">Opens like an app and keeps your data safer</div></div></button><button class="rbtn sm" data-act="install-dismiss" aria-label="Dismiss">${icon('x', 14)}</button></div>`);
  if (r.length && !S.settings.swipeHint) after.push(() => setTimeout(() => { toast('Tip: swipe a task left to snooze, right to skip'); S.settings.swipeHint = true; save(); }, 900));
  const recallM = ms.filter((m) => m.recalls && m.recalls.length && !m.recallsSeen);
  recallM.forEach((m) => nudges.push(`<button class="nudge alert" data-act="go" data-to="#/m/${m.id}/recalls"><div class="ibox">${icon('alert', 20)}</div><div class="grow"><div class="t">${plural(m.recalls.length, 'recall')} found</div><div class="d">${esc(m.name)} · tap to review</div></div></button>`));

  return `<div class="screen has-nav">
    <div class="fixed-top">
      <div class="hdr"><button class="title-btn" data-act="rename-garage"><span class="h-title">${esc(S.settings.garage)}</span></button>
        <button class="rbtn" data-act="garage-menu" aria-label="More options">${icon('more', 18)}</button></div>
      ${ms.length ? `<div class="carousel">${ms.map((m) => machineCard(m)).join('')}<button class="mcard add" data-act="go" data-to="#/add"><div><div class="rbtn">${icon('plus', 18)}</div>Add machine</div></button></div>` : ''}
    </div>
    ${!ms.length ? `<div class="card dark" style="text-align:center;padding:28px 18px">${art('truck', 84)}<h2 class="headline" style="margin:8px 0 6px">Add your first machine</h2><p class="note" style="margin-bottom:16px">Truck, mower, generator, anything with an engine. We'll suggest a maintenance schedule for it.</p><button class="btn primary" data-act="go" data-to="#/add">Add machine</button></div>` : ''}
    ${nudges.join('')}
    ${urgent.length || backupRow() ? `<div class="sec-title">Needs attention <button class="link" data-act="go" data-to="#/schedule">See all</button></div><div class="list">${backupRow()}${urgent.slice(0, 5).map((x) => mrow(x.it, x.st)).join('')}</div>${urgent.length > 5 ? `<button class="btn secondary" data-act="go" data-to="#/schedule">${urgent.length - 5} more need attention</button>` : ''}` : ''}
    ${later.length ? `<div class="sec-title">${urgent.length ? 'Coming up' : 'Upcoming maintenance'}</div><div class="list">${later.map((x) => mrow(x.it, x.st)).join('')}</div>` : ''}
    ${ms.length && !r.length ? empty('wrench', 'Nothing scheduled yet', 'Open a machine and add maintenance to track.') : ''}
    ${ms.length && r.length && !urgent.length && !backupRow() ? `<div class="empty" style="padding:8px">${icon('check', 18)}<span>Nothing due right now. Nice.</span></div>` : ''}
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
      <div class="hdr sticky"><div class="left">${backBtn('#/')}<div class="h-title sm">${esc(m.name)}</div></div>
        <div class="h-actions"><button class="rbtn" data-act="machine-menu" data-id="${m.id}" aria-label="More">${icon('more', 18)}</button></div></div>
      ${machineCard(m, true)}
      <div class="row between" style="font-size:13px;color:var(--muted);margin-top:-6px"><span>${[m.year, m.make, m.model].filter(Boolean).map(esc).join(' ') || esc(CATS[m.cat]?.label)}</span>${hasMeter(m) ? `<button class="smallbtn" data-act="reading" data-id="${m.id}">${icon('gauge', 14)} ${fmtN(m.reading, UNIT_LABEL[m.unit])}</button>` : ''}</div>
      <div class="tabs sticky">
        <button class="${tab === 'upcoming' ? 'on' : ''}" data-act="go" data-to="#/m/${m.id}">Upcoming</button>
        <button class="${tab === 'history' ? 'on' : ''}" data-act="go" data-to="#/m/${m.id}/history">History</button>
        <button class="${tab === 'notes' ? 'on' : ''}" data-act="go" data-to="#/m/${m.id}/notes">Notes</button>
        <button class="${tab === 'warranty' ? 'on' : ''}" data-act="go" data-to="#/m/${m.id}/warranty">Docs</button>
        <button class="rbtn light" data-act="fab" data-id="${m.id}" aria-label="Add">${icon('plus', 20)}</button>
      </div>
    ${body}
  </div>`;
}
function machineUpcoming(m) {
  const r = ranked(m.id);
  const paused = S.items.filter((i) => i.machineId === m.id && i.enabled === false);
  if (!r.length) return empty('wrench', 'No maintenance tracked', 'Pick from suggestions for this machine or add your own.', `<button class="btn primary" data-act="go" data-to="#/m/${m.id}/add-maint" style="width:auto;padding:0 24px">Add maintenance</button>`);
  const pc = PRECHECKS[m.cat];
  return `${pc && !NO_METER.includes(m.cat) ? `<button class="lrow" data-act="go" data-to="#/precheck/${m.id}"><div class="ibox">${icon('checks', 18)}</div><div class="grow"><div class="t">${esc(pc.title)}</div><div class="d">${plural(pc.items.length, 'item')} · before you head out</div></div>${icon('back', 16, 'flip')}</button>` : ''}
    <div class="list">${r.map((x) => mrow(x.it, x.st, { showMachine: false })).join('')}</div>
    <button class="dashed" data-act="go" data-to="#/m/${m.id}/add-maint">${icon('plus', 18)}Add maintenance</button>
    ${NO_METER.includes(m.cat) ? '' : `<div class="sec-title">Seasonal checklists</div>
    <div class="group">${Object.entries(CHECKLISTS).map(([k, c]) => `<button class="lrow" data-act="go" data-to="#/checklist/${m.id}/${k}"><div class="ibox">${icon(c.icon, 18)}</div><div class="grow"><div class="t">${c.title}</div><div class="d">${c.items.length} steps</div></div></button>`).join('')}</div>
    <button class="lrow" data-act="go" data-to="#/m/${m.id}/specs"><div class="ibox">${icon('oil', 18)}</div><div class="grow"><div class="t">Specs & part numbers</div><div class="d">${specSummary(m) || 'Oil type, filters, plugs, tire sizes'}</div></div></button>`}
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
    ${rows.length ? `<button class="btn secondary" data-act="go" data-to="#/log/${m.id}">${icon('print', 18)}Print or save this machine’s log</button>` : ''}`;
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
    ${rs.length ? `<div class="group">${rs.map((r) => `<button class="lrow" data-act="go" data-to="#/receipt/${m.id}/${r.id}">${r.photoId ? photoTag(r.photoId, 'thumb') : `<div class="ibox">${icon('receipt', 18)}</div>`}<div class="grow"><div class="t">${esc(r.vendor || 'Receipt')}</div><div class="d">${r.date ? fmtDate(r.date, true) : ''}${r.category ? ' · ' + esc(r.category) : ''}</div></div><div class="v">${money(r.total)}</div></button>`).join('')}</div>` : `<p class="note">No receipts yet.</p>`}
    <button class="dashed" data-act="go" data-to="#/receipt/${m.id}">${icon('camera', 18)}Add receipt</button>
    ${isVehicle(m) ? `<button class="lrow" data-act="go" data-to="#/m/${m.id}/recalls"><div class="ibox">${icon('alert', 18)}</div><div class="grow"><div class="t">Safety recalls</div><div class="d">${m.recalls ? (m.recalls.length ? plural(m.recalls.length, 'recall') + ' found' : 'None found') + (m.recallsChecked ? ' · checked ' + fmtDate(m.recallsChecked) : '') : 'Check NHTSA for open recalls'}</div></div></button>` : ''}`;
}

/* ======================= item (task) detail ======================= */
function vItem(id) {
  const it = I(id), m = M(it.machineId), st = itemStatus(it);
  const u = UNIT_LABEL[m.unit];
  const ev = it.every;
  const evText = [ev.u ? `every ${fmtN(ev.u, u)}` : '', hasTime(ev) ? `every ${timeText(ev)}` : ''].filter(Boolean).join(' or ');
  const hist = S.logs.filter((l) => (l.itemIds || []).includes(it.id)).sort((a, b) => b.date.localeCompare(a.date));
  const specs = m.specs || {};
  const need = [...(it.need || [])];
  const specMap = { oil: ['oil', 'oilCap'], filter: ['oilFilter'], air: ['airFilter'], plug: ['plug'], fuel: ['fuelFilter'], blade: ['blade'], belt: ['belt'], battery: ['battery'], tire: ['tires'] };
  const known = [];
  if (it.icon === 'oil' && /oil/i.test(it.title)) { if (specs.oil) known.push(['Engine oil', [specs.oil, specs.oilCap].filter(Boolean).join(' · ')]); if (specs.oilFilter) known.push(['Oil filter', specs.oilFilter]); }
  else (specMap[it.icon] || []).forEach((k) => specs[k] && known.push([specLabel(k), specs[k]]));
  const needRows = known.length ? known : need.map((n) => [n, '']);
  return `<div class="screen">
    <div class="hdr sticky"><div class="left">${backBtn('#/m/' + m.id)}<div class="h-title sm" style="opacity:.0" id="itemHdrTitle">${esc(it.title)}</div></div><div class="h-actions"><button class="rbtn" data-act="item-menu" data-id="${it.id}" aria-label="More">${icon('more', 18)}</button></div></div>
    <div class="photo-hero">${art(m.cat, 110)}${photoTag(m.photoId)}</div>
    <div><h1 class="big-title">${esc(it.title)}</h1><p class="note" style="margin-top:6px">${esc(m.name)}${m.severe && it.severe ? ' · severe duty' : ''}</p></div>
    <div class="status ${st.state}"><div class="row between"><b>${esc(st.text)}</b>${st.dueDate && st.state !== 'over' ? `<span class="muted">${fmtDate(st.dueDate, true)}</span>` : ''}</div><div class="bar ${st.state === 'over' ? 'over' : st.state === 'soon' ? 'warn' : ''}"><i style="width:${Math.round(Math.max(0.03, st.frac) * 100)}%"></i></div></div>
    <div class="two"><button class="btn primary" data-act="log" data-id="${it.id}">Log it</button><button class="btn secondary" data-act="snooze" data-id="${it.id}">Snooze</button></div>
    <div class="sched">
      <button class="lrow" data-act="sched" data-id="${it.id}"><div class="ibox">${icon('history', 18)}</div><div class="grow"><div class="t">Repeats</div><div class="d">${esc(evText ? evText[0].toUpperCase() + evText.slice(1) : 'No interval set')}${hasMeter(m) && ev.u && ev.months ? ', whichever first' : ''}</div></div><span class="pill-tag">Change</span></button>
      <button class="lrow" data-act="sched" data-id="${it.id}"><div class="ibox">${icon('calendar', 18)}</div><div class="grow"><div class="t">Last done</div><div class="d">${it.unknown && !hist.length ? 'Not sure yet · set it so reminders are right' : fmtDate(it.lastDate, true) + (hasMeter(m) && it.lastReading != null ? ' at ' + fmtN(it.lastReading, u) : '')}</div></div><span class="pill-tag">Change</span></button>
    </div>
    <a class="linkrow" href="https://www.youtube.com/results?search_query=${encodeURIComponent([m.year, m.make, m.model, it.how || it.title].filter(Boolean).join(' '))}" target="_blank" rel="noopener">${icon('play', 18)}How to: ${esc(it.title.toLowerCase())} ›</a>
    <div class="sec-title">What you need <button class="link" data-act="go" data-to="#/m/${m.id}/specs">Edit specs</button></div>
    <div class="card">${needRows.length ? needRows.map(([a, b]) => `<div class="need"><div><div style="font-weight:600">${esc(a)}</div>${b ? `<div class="muted" style="font-size:13px">${esc(b)}</div>` : ''}</div><a class="smallbtn" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent(partQuery(m, a, b))}">Find ›</a></div>`).join('') : `<p class="note">Add part numbers in Specs so they show up here.</p>`}</div>
    ${it.notes ? `<div class="card dark"><div class="muted" style="font-size:12px;margin-bottom:4px">Notes</div><div style="white-space:pre-wrap">${esc(it.notes)}</div></div>` : ''}
    <div class="sec-title">History</div>
    ${hist.length ? `<div class="group">${hist.map((l) => `<button class="lrow" data-act="edit-log" data-id="${l.id}"><div class="ibox">${icon(l.skipped ? 'snooze' : it.icon, 18)}</div><div class="grow"><div class="t">${l.skipped ? 'Skipped' : fmtDate(l.date, true)}</div><div class="d">${l.skipped ? fmtDate(l.date, true) : ''}${l.reading != null ? fmtN(l.reading, u) : ''}${l.shop ? ' · ' + esc(l.shop) : ''}</div></div><div class="v">${money(l.cost)}</div></button>`).join('')}</div>` : `<p class="note">Not logged yet${it.lastDate && !it.unknown ? ` · counting from ${fmtDate(it.lastDate, true)}` : ''}.</p>`}
    <button class="btn text" data-act="go" data-to="#/custom/${m.id}/${it.id}">${icon('edit', 16)}Rename or add notes</button>
  </div>`;
}
/* parts search: year + make + model + the part, so results fit the exact machine */
function partQuery(m, label, value) {
  label = String(label || '').replace(/\s*\(.*?\)/g, '').trim();
  const base = [m.year, m.make, m.model].filter(Boolean).join(' ');
  if (value && /\d/.test(value) && /[A-Za-z]/.test(value) && value.length < 30) return `${value} ${label}`.trim() + (base ? ` ${base}` : '');
  return [base, value || label].filter(Boolean).join(' ');
}
const SPEC_FIELDS = [['oil', 'Engine oil type', 'e.g. 10W-30 synthetic'], ['oilCap', 'Oil capacity', 'e.g. 2 qt with filter'], ['oilFilter', 'Oil filter part #', 'e.g. Kohler 52 050 02-S'], ['airFilter', 'Air filter part #', ''], ['fuelFilter', 'Fuel filter part #', ''], ['plug', 'Spark plug', 'e.g. NGK BPR5ES, gap .030"'], ['blade', 'Blades', 'e.g. 54" high-lift, 3 per set'], ['belt', 'Belt(s)', ''], ['battery', 'Battery', 'e.g. Group 65, 750 CCA'], ['tires', 'Tire size & pressure', 'e.g. 275/65R18 · 35 psi'], ['other', 'Other notes', 'Coolant, hydraulic fluid, wipers...']];
const specLabel = (k) => (SPEC_FIELDS.find((f) => f[0] === k) || [k, k])[1];
function vSpecs(id) {
  const m = M(id), s = m.specs || {};
  return `<div class="screen">${topBar('Specs & parts', '#/m/' + id)}
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
    return `<div class="screen">${topBar('Add machine', S.settings.onboarded ? '#/' : '#/welcome/6')}${steps(4, 1)}
      <h2 class="headline">What kind of machine?</h2>
      ${Object.entries(groups).map(([g, list]) => `<div class="grouplabel">${esc(g)}</div><div class="catgrid">${list.map(([k, c]) => `<button class="cat ${draft.cat === k ? 'on' : ''}" data-act="pick-cat" data-cat="${k}">${art(k, 44)}<span>${esc(c.label)}</span></button>`).join('')}</div>`).join('')}
    </div>`;
  }
  if (step === 2 && draft.cat === 'birdfeeder') {
    return `<div class="screen">${topBar('Add a bird feeder', '#/add/1')}${steps(4, 2)}
      ${field('Name', inp('name', draft.name, 'e.g. Back porch feeder'))}
      ${field('Type (optional)', inp('make', draft.make, 'e.g. Tube, hopper, hummingbird'))}
      <div class="spacer"></div>
      <div class="actions-bottom"><button class="btn primary" data-act="add-next-2">Continue</button></div>
    </div>`;
  }
  if (step === 2 && draft.cat === 'cat') {
    return `<div class="screen">${topBar('Add a cat', '#/add/1')}${steps(4, 2)}
      ${field('Name', inp('name', draft.name, 'e.g. Milo'))}
      <div class="two">${field('Breed', inp('make', draft.make, 'e.g. Domestic shorthair'))}${field('Color', inp('model', draft.model, 'e.g. Orange tabby'))}</div>
      ${field('Birth year', inp('year', draft.year, 'Year', 'number', 'inputmode="numeric"'))}
      <div class="spacer"></div>
      <div class="actions-bottom"><button class="btn primary" data-act="add-next-2">Continue</button></div>
    </div>`;
  }
  if (step === 2) {
    const veh = VEH_CATS.includes(draft.cat);
    return `<div class="screen">${topBar('Add machine', '#/add/1')}${steps(4, 2)}
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
      ${unit !== 'none' ? `<div class="card dark" style="text-align:center"><input class="inp bebas" id="reading" inputmode="numeric" data-commas value="${esc(draft.reading)}" placeholder="0" style="font-size:56px;height:84px;text-align:center;background:transparent"><div class="muted">${unit === 'hrs' ? 'hours' : unit === 'km' ? 'kilometers' : 'miles'}</div></div>` : `<p class="note">Reminders will go by date only (good for trailers and electric tools).</p>`}
      <div class="spacer"></div>
      <div class="actions-bottom"><button class="btn primary" data-act="add-next-3" data-unit="${unit}">Continue</button></div>
    </div>`;
  }
  const c = CATS[draft.cat] || CATS.other;
  const unit = draft.unit;
  return `<div class="screen">${topBar(draft.cat === 'cat' ? 'Add a cat' : draft.cat === 'birdfeeder' ? 'Add a bird feeder' : 'Add machine', NO_METER.includes(draft.cat) ? '#/add/2' : '#/add/3')}${steps(4, 4)}
    <div class="photo-hero" style="height:200px" id="draftPhoto">${art(draft.cat, 120)}${photoTag(draft.photoId)}</div>
    <label class="btn secondary" style="cursor:pointer">${icon('camera', 18)}${draft.photoId ? 'Change photo' : 'Add a photo (optional)'}<input type="file" accept="image/*" hidden data-change="draft-photo"></label>
    <div class="card">
      <div class="kv"><span>Name</span><b>${esc(draft.name)}</b></div>
      <div class="kv"><span>Type</span><span>${esc(c.label)}</span></div>
      ${draft.make || draft.model ? `<div class="kv"><span>Make & model</span><span>${esc([draft.year, draft.make, draft.model].filter(Boolean).join(' '))}</span></div>` : ''}
      ${draft.serial ? `<div class="kv"><span>${VEH_CATS.includes(draft.cat) ? 'VIN' : 'Serial'}</span><span>${esc(draft.serial)}</span></div>` : ''}
      ${NO_METER.includes(draft.cat) ? '' : `<div class="kv"><span>${unit === 'hrs' ? 'Hours' : unit === 'none' ? 'Tracking' : 'Odometer'}</span><span>${unit === 'none' ? 'By date' : fmtN(num(draft.reading) || 0, UNIT_LABEL[unit])}</span></div>`}
    </div>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="add-save">${draft.cat === 'cat' ? 'Add cat' : draft.cat === 'birdfeeder' ? 'Add bird feeder' : 'Add machine'}</button><button class="btn text" data-act="go" data-to="#/add/2">Edit details</button></div>
  </div>`;
}
function vAdded(id) {
  const m = M(id);
  return `<div class="screen">${topBar('', '#/m/' + id)}
    <div class="center"><div class="success">${icon(m.cat === 'cat' ? 'cat' : m.cat === 'birdfeeder' ? 'bird' : 'check', 44)}</div><h1 class="big-title">${esc(m.name)}</h1><p class="note">Added to ${esc(S.settings.garage)}.</p></div>
    <div class="actions-bottom"><button class="btn primary" data-act="go" data-to="#/suggest/${id}">Set up maintenance</button><button class="btn text" data-act="go" data-to="#/m/${id}">Later</button></div>
  </div>`;
}
let suggestSel = null, customReturn = null;
/* toggle row: tap the text to edit the interval, tap the switch to turn it on/off */
function srow(ic, title, sub, editAttrs, swAttrs, on) {
  return `<div class="trow srow"><button class="srow-main" ${editAttrs}><div class="ibox">${icon(ic, 18)}</div><div class="grow"><div class="t">${esc(title)}</div><div class="d">${esc(sub)}<span class="edit-hint">${icon('edit', 12)}</span></div></div></button><button class="srow-sw" ${swAttrs} aria-label="On or off"><span class="switch ${on ? 'on' : ''}"></span></button></div>`;
}
function vSuggest(id) {
  const m = M(id);
  const tps = templatesFor(m);
  if (!suggestSel || suggestSel.id !== id) suggestSel = { id, on: Object.fromEntries(tps.map((tp) => [tp.key, !tp.off])), over: {}, last: 'now' };
  if (!tps.length) { after.push(() => go('#/custom/' + id)); return '<div class="screen"></div>'; }
  const customs = S.items.filter((i) => i.machineId === id && !i.key);
  return `<div class="screen">${topBar('Suggested maintenance', '#/m/' + id)}
    <p class="note">Starting points for a typical ${esc((CATS[m.cat] || CATS.other).label.toLowerCase())}. Tap any item to change how often.</p>
    <div class="list">${tps.map((tp) => { const tmp = itemFromTemplate(m, tp); if (suggestSel.over[tp.key]) tmp.every = suggestSel.over[tp.key]; return srow(tp.icon, tp.title, intervalText(tmp, m), `data-act="sug-edit" data-id="${id}" data-key="${tp.key}"`, `data-act="sug-toggle" data-key="${tp.key}"`, suggestSel.on[tp.key]); }).join('')}
      ${customs.map((i) => srow(i.icon, i.title, intervalText(i, m), `data-act="sched" data-id="${i.id}"`, `data-act="item-toggle" data-id="${i.id}"`, i.enabled !== false)).join('')}</div>
    <button class="dashed" data-act="custom-from" data-id="${id}" data-back="#/suggest/${id}">${icon('plus', 18)}Add custom</button>
    <div class="card dark stack"><div style="font-weight:600">When was this last done?</div>
      <div class="seg"><button class="${suggestSel.last === 'now' ? 'on' : ''}" data-act="sug-last" data-v="now">Recently</button><button class="${suggestSel.last === 'date' ? 'on' : ''}" data-act="sug-last" data-v="date">Pick a date</button><button class="${suggestSel.last === 'unknown' ? 'on' : ''}" data-act="sug-last" data-v="unknown">Not sure</button></div>
      ${suggestSel.last === 'date' ? `<div class="${hasMeter(m) ? 'two' : ''}">${field('Date', inp('sg_date', suggestSel.date || addMonths(todayISO(), -3), '', 'date'))}${hasMeter(m) ? field(`At (${UNIT_LABEL[m.unit]})`, inp('sg_r', suggestSel.reading || '', 'Best guess', 'text', 'inputmode="numeric" data-commas')) : ''}</div>` : ''}
      ${suggestSel.last === 'unknown' ? `<p class="note" style="margin:0">Everything starts as due. Log what you do to reset it.</p>` : ''}</div>
    <div class="actions-bottom"><button class="btn primary" data-act="sug-save" data-id="${id}">Use this schedule</button><button class="btn text" data-act="go" data-to="#/m/${id}">Skip for now</button></div>
  </div>`;
}
function intervalText(it, m) {
  const u = UNIT_LABEL[m.unit];
  const p = [];
  if (it.every.u) p.push(`Every ${fmtN(it.every.u, u)}`);
  if (hasTime(it.every)) p.push(`${p.length ? 'or ' : 'Every '}${timeText(it.every)}`);
  return p.join(' ') + (it.first && (it.first.u || it.first.months) ? ` · first at ${it.first.u ? fmtN(it.first.u, u) : plural(it.first.months, 'month')}` : '');
}
function vAddMaint(id) {
  const m = M(id);
  const mine = S.items.filter((i) => i.machineId === id);
  const tps = templatesFor(m);
  return `<div class="screen">${topBar('Add maintenance', '#/m/' + id)}
    <div class="list">
      ${mine.map((i) => srow(i.icon, i.title, intervalText(i, m), `data-act="sched" data-id="${i.id}"`, `data-act="item-toggle" data-id="${i.id}"`, i.enabled !== false)).join('')}
      ${tps.filter((tp) => !mine.some((i) => i.key === tp.key)).map((tp) => srow(tp.icon, tp.title, intervalText(itemFromTemplate(m, tp), m), `data-act="tpl-add-edit" data-id="${id}" data-key="${tp.key}"`, `data-act="tpl-add" data-id="${id}" data-key="${tp.key}"`, false)).join('')}
    </div>
    <button class="dashed" data-act="custom-from" data-id="${id}" data-back="#/m/${id}/add-maint">${icon('plus', 18)}Add custom</button>
    <div class="actions-bottom"><button class="btn primary" data-act="go" data-to="#/m/${id}">Done</button></div>
  </div>`;
}
function vCustom(mid, itemId) {
  const m = M(mid), it = itemId ? I(itemId) : null;
  const unit = m.unit;
  const ev = it ? it.every : { u: null, months: null, days: null };
  return `<div class="screen">${topBar(it ? 'Edit maintenance' : 'Custom maintenance', it ? '#/i/' + it.id : customReturn || '#/m/' + mid + '/add-maint')}
    ${field('What needs doing?', inp('c_title', it?.title, 'e.g. Replace hydraulic filter'))}
    ${intervalFields(m, ev)}
    <div class="${hasMeter(m) ? 'two' : ''}">${field('Last done', inp('c_lastDate', it?.lastDate || todayISO(), '', 'date'))}${hasMeter(m) ? field(`At (${UNIT_LABEL[unit]})`, inp('c_lastReading', it?.lastReading ?? m.reading, '', 'text', 'inputmode="numeric" data-commas')) : ''}</div>
    ${it && it.severe ? `<p class="note">Severe-duty interval: ${esc([it.severe.u ? fmtN(it.severe.u, UNIT_LABEL[unit]) : '', it.severe.months ? plural(it.severe.months, 'month') : ''].filter(Boolean).join(' or '))} (used when Severe duty is on for this machine).</p>` : ''}
    ${field('Parts / notes', `<textarea class="inp" id="c_notes" style="height:90px" placeholder="Part numbers, torque specs, where to buy">${esc(it?.notes || '')}</textarea>`)}
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="custom-save" data-mid="${mid}" data-id="${it ? it.id : ''}">${it ? 'Save changes' : 'Save maintenance'}</button>
    ${it && it.key && templatesFor(m).some((tp) => tp.key === it.key) ? `<button class="btn text" data-act="reset-item" data-id="${it.id}">Reset to suggested interval</button>` : ''}</div>
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
    <label class="viewfinder" style="cursor:pointer">${pid ? photoTag(pid, 'ph contain') : `${icon('scan', 56)}<span>Tap to snap the receipt</span><span class="note">or pick a photo</span>`}<input type="file" accept="image/*" capture="environment" hidden data-change="receipt-photo"></label>
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
    ${field('Provider', inp('w_provider', w?.provider, `e.g. ${m.make || 'Cub Cadet'}`))}
    ${field('Coverage', inp('w_coverage', w?.coverage, 'e.g. Parts & labor, powertrain'))}
    <div class="two">${field('Starts', inp('w_start', w?.start || todayISO(), '', 'date'))}${field('Ends', inp('w_end', w?.end, '', 'date'))}</div>
    ${hasMeter(m) ? field(`Or until (${UNIT_LABEL[m.unit]}, optional)`, inp('w_limit', w?.limit, m.unit === 'hrs' ? 'e.g. 300' : 'e.g. 60,000', 'text', 'inputmode="numeric" data-commas')) : ''}
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
    <div class="two">${field('Date', inp('f_date', todayISO(), '', 'date'))}${field(`Odometer (${UNIT_LABEL[m.unit] || 'mi'})`, inp('f_reading', Math.round(predictedReading(m) || m.reading || 0), '', 'text', 'inputmode="numeric" data-commas'))}</div>
    <div class="two">${field(vol[0].toUpperCase() + vol.slice(1), inp('f_gal', '', 'e.g. 18.4', 'text', 'inputmode="decimal"'))}${field('Total cost', inp('f_total', '', '$0.00', 'text', 'inputmode="decimal"'))}</div>
    <button class="trow" data-act="toggle-full"><div class="grow"><div class="t">Filled the tank</div><div class="d">Needed to calculate ${m.unit === 'km' ? 'km/L' : 'MPG'}</div></div><span class="switch on" id="f_full"></span></button>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="fuel-save" data-mid="${mid}">Save fuel-up</button></div>
  </div>`;
}
function vChecklist(mid, key) {
  const m = M(mid), c = CHECKLISTS[key] || CHECKLISTS.spring;
  return `<div class="screen">${topBar(c.title, '#/m/' + mid)}
    <div class="list">${c.items.map((x, i) => `<button class="trow" data-act="cl-toggle" data-i="${i}"><span class="check" id="cl_${i}"></span><div class="grow"><div class="t" style="font-weight:400;font-size:15px">${esc(x)}</div></div></button>`).join('')}</div>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="cl-save" data-mid="${mid}" data-key="${key}">Save to history</button></div>
  </div>`;
}

function vPrecheck(mid) {
  const m = M(mid), c = PRECHECKS[m.cat] || PRECHECKS.other;
  return `<div class="screen">${topBar(c.title, '#/m/' + mid)}
    <div class="list">${c.items.map((x, i) => `<button class="trow" data-act="cl-toggle" data-i="${i}"><span class="check" id="cl_${i}">${icon('check', 16)}</span><div class="grow"><div class="t" style="font-weight:500;font-size:16px">${esc(x)}</div></div></button>`).join('')}</div>
    <button class="btn text" data-act="go" data-to="#/note/${mid}">${icon('note', 16)}Something off? Add a note</button>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="pre-done" data-mid="${mid}">Done</button></div>
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
    <div class="hdr sticky"><div class="h-title">Schedule</div><button class="rbtn" data-act="schedule-menu" aria-label="More options">${icon('more', 18)}</button></div>
    ${r.length ? sec('Overdue', g.over) + sec('This week', g.week) + sec('This month', g.month) + sec('Later', g.later) + sec('Snoozed', g.snoozed) : empty('calendar', 'Nothing scheduled', 'Add a machine and its maintenance shows up here.', `<button class="btn primary" style="width:auto;padding:0 24px" data-act="go" data-to="#/add">Add machine</button>`)}
  </div>${nav('schedule')}`;
}

/* ======================= profile ======================= */
const THEMES = [
  ['shop', 'Shop', '#000', 'none', 'auto', '#383838', '#12ff54'],
  ['pegboard', 'Pegboard', '#17120d', 'radial-gradient(circle at 50% 50%, rgba(0,0,0,.55) 0 2.2px, transparent 2.8px)', '22px 22px', '#2e261d', '#ff8f2a'],
  ['diamond', 'Diamond plate', '#111417', 'linear-gradient(45deg, transparent 44%, rgba(255,255,255,.07) 45% 55%, transparent 56%), linear-gradient(-45deg, transparent 44%, rgba(255,255,255,.05) 45% 55%, transparent 56%)', '18px 9px', '#2b3137', '#5cc8ff'],
  ['barn', 'Pole barn', '#0e130f', 'repeating-linear-gradient(90deg, rgba(0,0,0,.35) 0 2px, transparent 2px 46px), repeating-linear-gradient(90deg, rgba(255,255,255,.03) 0 1px, transparent 1px 7px)', 'auto', '#26302a', '#ffc61a'],
];
function themePicker(mini) {
  const cur = S.settings.theme || 'shop';
  return `<div class="themes ${mini ? 'mini' : ''}">${THEMES.map(([k, l, bg, pat, size, card, acc]) => `<button class="theme ${cur === k ? 'on' : ''}" data-act="set-theme" data-v="${k}"><div class="sw" style="background-color:${bg};background-image:${pat};background-size:${size}"><i style="background:${card}"></i><b style="background:${acc}"></b></div><span>${l}</span></button>`).join('')}</div>`;
}
function applyTheme() {
  const t = S.settings.theme || 'shop';
  if (document.documentElement.dataset.theme !== t) {
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = (THEMES.find((x) => x[0] === t) || THEMES[0])[2];
  }
}
function vProfile() {
  const yr = String(new Date().getFullYear());
  const ms = S.machines.filter((m) => !m.archived);
  const spendBy = ms.map((m) => ({ m, v: S.logs.filter((l) => l.machineId === m.id && l.date.startsWith(yr)).reduce((s, l) => s + (l.cost || 0), 0) + S.fuel.filter((f) => f.machineId === m.id && f.date.startsWith(yr)).reduce((s, f) => s + (f.total || 0), 0) + S.receipts.filter((r) => r.machineId === m.id && !r.logId && (r.date || '').startsWith(yr)).reduce((s, r) => s + (r.total || 0), 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...spendBy.map((x) => x.v));
  const total = spendBy.reduce((s, x) => s + x.v, 0);
  const archived = S.machines.filter((m) => m.archived).length;
  const nperm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const row = (act, ic, t, d, extra = '') => `<button class="lrow" ${act}><div class="ibox">${icon(ic, 18)}</div><div class="grow"><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div>${extra}</button>`;
  const bkState = backupSummary();
  return `<div class="screen has-nav">
    <div class="hdr sticky"><div class="h-title">Settings</div></div>
    ${total ? `<div class="card"><div class="row between"><div><div class="muted" style="font-size:12px">Spent in ${yr}</div><div class="bebas" style="font-size:38px">${money(total)}</div></div><div class="muted" style="text-align:right;font-size:13px">${plural(S.logs.filter((l) => !l.skipped).length, 'service')} logged</div></div>
      <div class="stack" style="margin-top:10px">${spendBy.map((x) => `<div><div class="row between" style="font-size:13px"><span>${esc(x.m.name)}</span><span class="muted">${money(x.v)}</span></div><div class="bar" style="margin-top:4px;background:#222"><i style="width:${Math.round(x.v / max * 100)}%;background:#fff"></i></div></div>`).join('')}</div></div>` : ''}
    <div class="sec-title">Backup & data</div>
    <button class="datacard" data-act="go" data-to="#/data">
      <div class="ibox ${bkState.cls}">${icon(bkState.icon, 22)}</div>
      <div class="grow"><div class="t">${bkState.title}</div><div class="d">${bkState.sub}</div></div>${icon('back', 16, 'flip')}
    </button>
    <div class="group">
      ${row('data-act="go" data-to="#/log"', 'print', 'Print or save garage log', 'A PDF of every machine, photo and receipt')}
    </div>
    <div class="sec-title">Garage</div>
    <div class="group">
      ${row('data-act="rename-garage"', 'garage', 'Name', esc(S.settings.garage))}
      ${row('data-act="theme-sheet"', 'palette', 'Theme', esc((THEMES.find((x) => x[0] === (S.settings.theme || 'shop')) || THEMES[0])[1]))}
      ${row('data-act="toggle-units"', 'gauge', 'Distance for new vehicles', S.settings.distUnit === 'km' ? 'Kilometers' : 'Miles')}
      ${archived ? row('data-act="go" data-to="#/archived"', 'storage', 'Archived machines', plural(archived, 'machine')) : ''}
    </div>
    <div class="sec-title">Reminders</div>
    <div class="group">
      ${row('data-act="notify-on"', 'bell', 'Notifications', nperm === 'granted' ? 'On' : nperm === 'denied' ? 'Blocked in browser settings' : nperm === 'unsupported' ? 'Add to Home Screen first' : 'Off')}
      ${row('data-act="lead-days"', 'clock', 'Warn me', `${S.settings.leadDays} days before`)}
      ${row('data-act="ics-all"', 'calendar', 'Add due dates to my calendar', 'Works with Apple, Google or Outlook')}
    </div>
    <div class="sec-title">Help</div>
    <div class="group">
      ${row('data-act="go" data-to="#/safety"', 'shield', 'How your data stays safe', 'Where it lives and how backups work')}
      ${row('data-act="go" data-to="#/install"', 'squareplus', 'Add to Home Screen', isStandalone() ? 'Done' : 'Opens full screen, works offline')}
      ${row('data-act="go" data-to="#/feedback"', 'bug', 'Report a bug or send an idea', 'Goes straight to the person who built this')}
    </div>
    <a class="credit" href="https://masen.site" target="_blank" rel="noopener">Built in a garage by a design student who should’ve been studying · <b>masen.site</b></a>
    <p class="note" style="text-align:center;font-size:12px">Version ${typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''}</p>
  </div>${nav('profile')}`;
}
function vArchived() {
  const ms = S.machines.filter((m) => m.archived);
  return `<div class="screen">${topBar('Archived', '#/profile')}
    ${ms.length ? `<div class="group">${ms.map((m) => `<div class="lrow"><div class="ibox">${art(m.cat, 22)}</div><div class="grow"><div class="t">${esc(m.name)}</div><div class="d">${plural(S.logs.filter((l) => l.machineId === m.id).length, 'service')} in history</div></div><button class="smallbtn" data-act="unarchive" data-id="${m.id}">Restore</button></div>`).join('')}</div>` : empty('storage', 'Nothing archived')}
  </div>`;
}

/* ======================= import (VMT, Fuelly, Drivvo, spreadsheets…) ======================= */
let imp = null;
const IMP_FIELDS = [
  ['date', 'Date', /date|when|day/i],
  ['title', 'What was done', /service|description|maint|task|work|performed|item|title|type|category|reason/i],
  ['reading', 'Odometer / mileage', /odometer|odo\b|mileage|miles|\bkm\b|kilomet|reading/i],
  ['hours', 'Engine hours', /hour|hrs|engine time/i],
  ['cost', 'Cost', /total|cost|price|amount|paid|spent|\$/i],
  ['cost2', 'Plus (e.g. labor)', /labou?r|parts/i],
  ['shop', 'Shop / where', /shop|vendor|location|store|dealer|provider|garage|place|where|station/i],
  ['notes', 'Notes', /note|comment|remark|detail|memo/i],
  ['vehicle', 'Vehicle / machine', /vehicle|car|asset|machine|equipment|nickname|^name$|unit/i],
  ['gallons', 'Fuel amount', /gallon|volume|litre|liter|qty|quantity|fuel amount/i],
];
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/).slice(0, 8).join('\n');
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}
function parseAnyDate(v) {
  v = String(v || '').trim(); if (!v) return null;
  let m;
  if ((m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) { let y = +m[3]; if (y < 100) y += 2000; let a = +m[1], b = +m[2]; if (a > 12) [a, b] = [b, a]; return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`; }
  if (/^\d{5}$/.test(v)) { const d = new Date(Date.UTC(1899, 11, 30) + +v * 864e5); return d.toISOString().slice(0, 10); }
  const t = Date.parse(v); return isNaN(t) ? null : iso(new Date(t));
}
function guessMapping(header) {
  const map = {}; const used = new Set();
  IMP_FIELDS.forEach(([k, , re]) => {
    let idx = header.findIndex((h, i) => !used.has(i) && re.test(h) && !(k === 'cost' && /labou?r|parts/i.test(h) && header.some((x) => /total/i.test(x))));
    if (k === 'cost') { const ti = header.findIndex((h, i) => !used.has(i) && /total/i.test(h)); if (ti >= 0) idx = ti; }
    if (k === 'title') { const si = header.findIndex((h, i) => !used.has(i) && /service|description|task|work|performed/i.test(h)); if (si >= 0) idx = si; }
    if (idx >= 0) { map[k] = idx; used.add(idx); }
  });
  return map;
}
function loadImport(text, name) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('empty');
  let best = 0, bestScore = -1;
  rows.slice(0, 20).forEach((r, i) => { const sc = r.filter((c) => IMP_FIELDS.some(([, , re]) => re.test(c)) && c.length < 40).length; if (sc > bestScore) { bestScore = sc; best = i; } });
  const header = rows[best].map((h, i) => h || `Column ${i + 1}`);
  const data = rows.slice(best + 1).filter((r) => r.filter(Boolean).length >= 2);
  imp = { name, header, data, map: guessMapping(header), target: S.machines.find((m) => !m.archived)?.id || 'new', newName: '', newCat: 'car', vmap: {}, suggest: true };
}
function impRecords() {
  if (!imp) return [];
  const g = (r, k) => (imp.map[k] != null && imp.map[k] !== '' ? r[imp.map[k]] : '');
  return imp.data.map((r) => {
    const gal = num(g(r, 'gallons'));
    const title = g(r, 'title');
    const cost = (num(g(r, 'cost')) || 0) + (num(g(r, 'cost2')) || 0);
    return { date: parseAnyDate(g(r, 'date')), title, reading: num(g(r, 'reading')), hours: num(g(r, 'hours')), cost: cost || null, shop: g(r, 'shop'), notes: g(r, 'notes'), vehicle: g(r, 'vehicle') || '', gallons: gal, fuel: !!gal && (!title || /fuel|gas|fill|diesel|petrol/i.test(title)) };
  }).filter((x) => x.date && (x.title || x.fuel));
}
function vImport() {
  const ms = S.machines.filter((m) => !m.archived);
  if (!imp) return `<div class="screen">${topBar('Import', '#/profile')}
    <h2 class="headline">Bring your history over</h2>
    <p class="note">Any CSV export works: VMT, Fuelly, Drivvo, Simply Auto or a spreadsheet. You can fix the column matches before saving.</p>
    <div class="istep"><div class="n">1</div><div class="grow"><div class="t">Export from the old app</div><div class="d">Look for Export, Share or Backup and pick CSV. Save it to Files (or email it to yourself and save the attachment).</div></div></div>
    <div class="istep"><div class="n">2</div><div class="grow"><div class="t">Pick the file here</div><div class="d">Nothing is uploaded anywhere. It’s read right on this phone.</div></div></div>
    <label class="btn primary" style="cursor:pointer">${icon('fileup', 18)}Choose CSV file<input type="file" accept=".csv,text/csv,text/plain,.txt,.tsv" hidden data-change="import-file"></label>
    <p class="note">Excel file? Open it in Google Sheets or Numbers and export as CSV.</p>
  </div>`;
  const recs = impRecords();
  const opt = (k) => `<select class="inp" data-change="imp-map" data-k="${k}"><option value="">— none —</option>${imp.header.map((h, i) => `<option value="${i}" ${imp.map[k] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select>`;
  const vehicles = imp.map.vehicle != null && imp.map.vehicle !== '' ? [...new Set(recs.map((r) => r.vehicle).filter(Boolean))] : [];
  const mOpts = (sel) => `${ms.map((m) => `<option value="${m.id}" ${sel === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}<option value="new" ${sel === 'new' ? 'selected' : ''}>+ New machine</option><option value="skip" ${sel === 'skip' ? 'selected' : ''}>Skip these</option>`;
  const catSel = (k, cur) => `<select class="inp" data-change="imp-cat" data-k="${esc(k)}">${Object.entries(CATS).filter(([c]) => c !== 'cat').map(([c, v]) => `<option value="${c}" ${cur === c ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`;
  vehicles.forEach((v) => { if (!imp.vmap[v]) { const hit = ms.find((m) => m.name.toLowerCase() === v.toLowerCase() || [m.year, m.make, m.model].filter(Boolean).join(' ').toLowerCase() === v.toLowerCase()); imp.vmap[v] = { to: hit ? hit.id : 'new', cat: guessCat(v) }; } });
  const nFuel = recs.filter((r) => r.fuel).length;
  return `<div class="screen">${topBar('Import', '#/profile')}
    <div class="card dark"><div class="row between"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(imp.name)}</b><button class="smallbtn" data-act="imp-reset">Change file</button></div><div class="note" style="margin-top:4px">${plural(recs.length - nFuel, 'service')}${nFuel ? ` and ${plural(nFuel, 'fuel-up')}` : ''} ready to import</div></div>
    <div class="sec-title">Match the columns</div>
    <div class="stack">${IMP_FIELDS.map(([k, l]) => `<div class="maprow"><span>${l}</span>${opt(k)}</div>`).join('')}</div>
    <div class="sec-title">Preview</div>
    <div class="tbl"><table><tr><th>Date</th><th>What</th><th>Reading</th><th>Cost</th>${vehicles.length ? '<th>Vehicle</th>' : ''}</tr>${recs.slice(0, 6).map((r) => `<tr><td>${esc(fmtDate(r.date, true))}</td><td>${esc(r.fuel ? `Fuel-up ${r.gallons}` : r.title.slice(0, 26))}</td><td>${r.reading != null ? fmtN(r.reading) : r.hours != null ? fmtN(r.hours, 'hrs') : ''}</td><td>${money(r.cost)}</td>${vehicles.length ? `<td>${esc(r.vehicle)}</td>` : ''}</tr>`).join('')}</table></div>
    ${recs.length ? '' : `<p class="note" style="color:#ff8a8a">No rows with a date and a description yet. Check the Date and What was done columns above.</p>`}
    <div class="sec-title">Which machine?</div>
    ${vehicles.length ? vehicles.map((v) => `<div class="card stack"><b>${esc(v)}</b><select class="inp" data-change="imp-vto" data-k="${esc(v)}">${mOpts(imp.vmap[v].to)}</select>${imp.vmap[v].to === 'new' ? catSel(v, imp.vmap[v].cat) : ''}</div>`).join('')
      : `<div class="card stack"><select class="inp" data-change="imp-target">${mOpts(imp.target)}</select>${imp.target === 'new' ? `${inp('imp_name', imp.newName, 'Name, e.g. 2019 Ford F-150')}${catSel('', imp.newCat)}` : ''}</div>`}
    <button class="trow" data-act="imp-suggest"><div class="grow"><div class="t">Add the suggested schedule to new machines</div><div class="d">Imported services then set when each one was last done</div></div><span class="switch ${imp.suggest ? 'on' : ''}"></span></button>
    <div class="actions-bottom"><button class="btn primary" data-act="imp-run" ${recs.length ? '' : 'disabled'}>Import ${plural(recs.length, 'record')}</button></div>
  </div>`;
}
function guessCat(v) {
  if (/sprinter|transit|promaster|camper ?van|winnebago (revel|solis|travato)|storyteller|roadtrek/i.test(v)) return 'camper';
  if (/motorhome|class [abc]\b|\brv\b|thor|jayco|coachmen|fleetwood|newmar|tiffin/i.test(v)) return 'rv';
  return /zero|\bztr?\d*|z\d{3}/i.test(v) ? 'zeroturn' : /tractor|kubota|deere \d|mahindra|kioti/i.test(v) ? 'tractor' : /mower|cub cadet|toro|husqvarna|craftsman|ariens|scag|exmark|bad boy/i.test(v) ? 'riding'
    : /e-?bike|rad ?power|aventon|lectric|trek|specialized/i.test(v) ? 'ebike' : /sur-?ron|talaria|e-?ride|stark varg/i.test(v) ? 'edirt' : /generator|honda eu|champion|predator/i.test(v) ? 'generator'
    : /harley|motorcycle|yamaha r|kawasaki|ducati|ktm|suzuki gsx/i.test(v) ? 'motorcycle' : /polaris|can-?am|razor|rzr|atv|utv|gator/i.test(v) ? 'atv' : /trailer/i.test(v) ? 'trailer' : /boat|mercury|evinrude|pontoon/i.test(v) ? 'boat'
    : /truck|f-?\d50|silverado|ram \d|sierra|tundra|tacoma|colorado|frontier|ridgeline|ranger|gladiator/i.test(v) ? 'truck' : 'car';
}
const MATCH_RULES = [
  [/trans(mission)?/i, ['trans']], [/diff/i, ['diff']], [/pump oil/i, ['pumpoil']], [/fork/i, ['forks']], [/gear (oil|lube)/i, ['gearlube']],
  [/oil/i, ['oil']], [/rotat/i, ['rotate']], [/cabin/i, ['cabin']], [/air ?filter|engine air/i, ['airfilter']], [/fuel filter/i, ['fuelfilter']],
  [/brake fluid|bleed/i, ['brakefluid', 'bleed']], [/brake|pads?\b|rotor/i, ['brakes', 'brakepads']], [/wiper/i, ['wipers']], [/batter/i, ['battery']],
  [/coolant|antifreeze|radiator/i, ['coolant']], [/spark|plugs?\b/i, ['plugs', 'plug']], [/blade/i, ['blades']], [/belt/i, ['belt', 'cvt']],
  [/grease|lube/i, ['grease', 'chainlube']], [/chain/i, ['chain', 'chainlube']], [/tire|tyre/i, ['tires']], [/inspect/i, ['inspection']],
];
function matchItems(mid, title) {
  const items = S.items.filter((i) => i.machineId === mid);
  const t = (title || '').toLowerCase();
  const out = new Set();
  items.forEach((i) => { if (t && (t === i.title.toLowerCase() || t.includes(i.title.toLowerCase()))) out.add(i.id); });
  t.split(/[,;+&/]| and /).forEach((part) => {
    const rule = MATCH_RULES.find(([re]) => re.test(part)); if (!rule) return;
    const hit = items.find((i) => rule[1].includes(i.key)); if (hit) out.add(hit.id);
  });
  return [...out];
}
function runImport() {
  makeSnapshot('Before importing ' + (imp && imp.name ? imp.name : 'a file')).catch(() => {});
  const recs = impRecords(); if (!recs.length) return;
  const snap = snapshot();
  const created = {};
  const newMachine = (name, cat, rs) => {
    const c = CATS[cat] || CATS.car;
    const hrs = rs.some((r) => r.hours != null) && !rs.some((r) => r.reading != null);
    const unit = hrs ? 'hrs' : c.unit === 'mi' ? S.settings.distUnit : c.unit === 'hrs' && rs.some((r) => r.reading != null) ? 'hrs' : c.unit;
    const ym = String(name).match(/^((?:19|20)\d\d)\s+(\S+)\s*(.*)$/);
    const m = { id: uid(), name: name || c.label, cat, make: ym ? ym[2] : '', model: ym ? ym[3] : '', year: ym ? ym[1] : '', unit, reading: 0, readingDate: '', photoId: null, severe: false, archived: false, specs: {}, created: todayISO() };
    S.machines.push(m);
    if (imp.suggest) templatesFor(m).forEach((tp) => { const it = itemFromTemplate(m, tp); it.unknown = true; it.lastDate = backDate(it.every); it.lastReading = -1e9; it.first = null; S.items.push(it); });
    return m;
  };
  const groups = {};
  recs.forEach((r) => {
    let to = imp.map.vehicle != null && imp.map.vehicle !== '' && r.vehicle ? imp.vmap[r.vehicle]?.to : imp.target;
    if (!to || to === 'skip') return;
    const key = to === 'new' ? 'new:' + (r.vehicle || '') : to;
    (groups[key] = groups[key] || []).push(r);
  });
  let nLogs = 0, nFuel = 0;
  Object.entries(groups).forEach(([key, rs]) => {
    let m;
    if (key.startsWith('new:')) { const v = key.slice(4); m = newMachine(v || val('imp_name') || imp.newName || 'Imported vehicle', v ? imp.vmap[v].cat : imp.newCat, rs); created[m.id] = true; }
    else m = M(key);
    if (!m) return;
    rs.sort((a, b) => a.date.localeCompare(b.date)).forEach((r) => {
      const rd = m.unit === 'hrs' ? (r.hours ?? r.reading) : r.reading;
      if (r.fuel) { S.fuel.push({ id: uid(), machineId: m.id, date: r.date, reading: rd, gallons: r.gallons, total: r.cost, full: true }); if (rd != null) setReading(m, rd, r.date); nFuel++; return; }
      doLog(matchItems(m.id, r.title), { machineId: m.id, title: r.title, date: r.date, reading: hasMeter(m) ? rd : null, cost: r.cost, shop: r.shop, notes: r.notes });
      nLogs++;
    });
    if (S.fuel.some((f) => f.machineId === m.id)) recalcMPG(m.id);
    if (created[m.id]) { S.items.filter((i) => i.machineId === m.id && i.lastReading === -1e9).forEach((i) => { i.lastReading = (m.reading || 0) - (i.every.u || 0); }); if (!m.readingDate) m.readingDate = todayISO(); }
  });
  imp = null; save(); go('#/');
  toast(`Imported ${plural(nLogs, 'service')}${nFuel ? ` + ${plural(nFuel, 'fuel-up')}` : ''}`, () => { S = snap; save(); render(); });
}

/* ======================= report (printable) ======================= */
function vReport(id) {
  const m = M(id);
  const logs = S.logs.filter((l) => l.machineId === id && !l.skipped).sort((a, b) => a.date.localeCompare(b.date));
  const total = logs.reduce((s, l) => s + (l.cost || 0), 0);
  return `<div class="screen">
    <div class="hdr sticky no-print"><div class="left">${backBtn('#/m/' + id + '/history')}<div class="h-title sm">Service report</div></div><button class="smallbtn" data-act="print">${icon('print', 14)} Print</button></div>
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
    <div class="photo-hero" style="height:180px">${art(m.cat, 110)}${photoTag(m.photoId)}</div>
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
  fmtCommaInputs(s);
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
    <div class="two">${field('Date', inp('l_date', editing ? editing.date : todayISO(), '', 'date'))}${hasMeter(m) ? field(m.unit === 'hrs' ? 'Hours' : 'Odometer', inp('l_reading', rd, '', 'text', 'inputmode="numeric" data-commas')) : '<div></div>'}</div>
    ${!editing && others.length ? `<div class="stack tight"><span class="muted" style="font-size:12px">Did anything else at the same time?</span>${others.slice(0, 5).map((x) => `<button class="trow" style="min-height:48px" data-act="log-also" data-id="${x.it.id}"><span class="check" data-also="${x.it.id}"></span><div class="grow"><div class="t" style="font-size:15px">${esc(x.it.title)}</div><div class="d">${esc(x.st.text)}</div></div></button>`).join('')}</div>` : ''}
    <div class="two">${field('Cost (optional)', inp('l_cost', editing?.cost, '$0.00', 'text', 'inputmode="decimal"'))}${field('Done by', `<select class="inp" id="l_shop"><option value="">Me (DIY)</option>${[...new Set(S.logs.map((l) => l.shop).filter(Boolean))].map((s) => `<option ${editing?.shop === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}<option value="__new">A shop…</option></select>`)}</div>
    ${field('Notes (optional)', inp('l_notes', editing?.notes, 'e.g. Used Mobil 1 5W-30, filter FL-820S'))}
    <label class="btn secondary" style="cursor:pointer;height:46px">${icon('camera', 18)}<span id="l_photoLabel">${editing && editing.receiptIds && editing.receiptIds.length ? 'Receipt attached · add another' : 'Attach receipt photo'}</span><input type="file" accept="image/*" hidden data-change="log-photo"></label>
    ${editing ? `<button class="btn danger" data-act="log-del" data-id="${editing.id}">Delete entry</button>` : ''}
    <div class="sheet-actions"><button class="btn primary" data-act="log-save" data-item="${it ? it.id : ''}" data-log="${editing ? editing.id : ''}">${editing ? 'Save changes' : 'Save'}</button></div>`);
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
    <div class="sheet-actions"><button class="btn primary" data-act="reading-save" data-id="${mid}">Save</button></div>`, (s) => {
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
    <button class="lrow" data-act="go-close" data-to="#/log/${id}"><div class="ibox">${icon('print', 18)}</div><div class="grow"><div class="t">Print or save its log</div><div class="d">PDF with history, receipts and photos, handy when selling</div></div></button>
    <button class="lrow" data-act="csv-close" data-id="${id}"><div class="ibox">${icon('sheet', 18)}</div><div class="grow"><div class="t">Export history to a spreadsheet</div><div class="d">CSV for Excel or Google Sheets</div></div></button>
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
    <button class="lrow" data-act="sched" data-id="${id}"><div class="ibox">${icon('history', 18)}</div><div class="grow"><div class="t">Change interval or last done</div></div></button>
    <button class="lrow" data-act="go-close" data-to="#/custom/${it.machineId}/${id}"><div class="ibox">${icon('edit', 18)}</div><div class="grow"><div class="t">Rename or add notes</div></div></button>
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
  if (PRECHECKS[m.cat] && !NO_METER.includes(m.cat)) items.push([PRECHECKS[m.cat].title, 'checks', `#/precheck/${mid}`]);
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
    <div class="two">${field('Date', inp('o_date', todayISO(), '', 'date'))}${hasMeter(m) ? field(m.unit === 'hrs' ? 'Hours' : 'Odometer', inp('o_reading', Math.round((predictedReading(m) || 0) * 10) / 10, '', 'text', 'inputmode="numeric" data-commas')) : '<div></div>'}</div>
    <div class="two">${field('Cost', inp('o_cost', '', '$0.00', 'text', 'inputmode="decimal"'))}${field('Shop (optional)', inp('o_shop', '', 'DIY'))}</div>
    ${field('Notes', inp('o_notes', '', ''))}
    <div class="sheet-actions"><button class="btn primary" data-act="oneoff-save" data-id="${mid}">Save</button></div>`);
}
function prompt2(title, label, val, onSave, type = 'text') {
  sheet(`${sheetHead(title)}${field(label, inp('p_val', val, '', type))}<div class="sheet-actions"><button class="btn primary" id="p_save">Save</button></div>`, (s) => {
    const i = $('#p_val', s); setTimeout(() => i.focus(), 250);
    $('#p_save', s).addEventListener('click', () => { onSave(i.value); closeSheet(); });
  });
}
function confirm2(title, msg, yes, onYes, danger = true) {
  sheet(`${sheetHead(title)}<p class="note" style="margin:0">${esc(msg)}</p><div class="sheet-actions"><button class="btn ${danger ? 'danger' : 'primary'}" id="c_yes">${esc(yes)}</button><button class="btn text" data-act="close-sheet">Cancel</button></div>`, (s) => {
    $('#c_yes', s).addEventListener('click', () => { closeSheet(); onYes(); });
  });
}

/* ---------- quick schedule editor (interval + last done) ---------- */
function estReadingOn(m, date) {
  if (!hasMeter(m)) return null;
  const days = Math.max(0, daysBetween(date, m.readingDate || todayISO()));
  const v = (m.reading || 0) - usageRate(m) * days;
  return Math.max(0, m.unit === 'hrs' ? Math.round(v * 10) / 10 : Math.round(v / 10) * 10);
}
let schedUnknown = false;
/* shared "repeat every" fields: distance/hours + a time (days, weeks or months) */
function intervalFields(m, ev) {
  const u = UNIT_LABEL[m.unit], meter = hasMeter(m);
  const presetsU = m.unit === 'hrs' ? [10, 25, 50, 100, 200] : m.unit === 'km' ? [5000, 8000, 10000, 15000] : [3000, 5000, 7500, 10000];
  const tUnit = ev.days ? (ev.days % 7 === 0 ? 'weeks' : 'days') : 'months';
  const tVal = ev.days ? (tUnit === 'weeks' ? ev.days / 7 : ev.days) : ev.months ?? '';
  const short = ev.days || (!meter && !ev.months);
  const tp = short && ev.days ? [[3, 'days', '3 days'], [1, 'weeks', '1 wk'], [2, 'weeks', '2 wk'], [1, 'months', '1 mo'], [3, 'months', '3 mo']] : [[1, 'months', '1 mo'], [3, 'months', '3 mo'], [6, 'months', '6 mo'], [12, 'months', '1 yr'], [24, 'months', '2 yr']];
  return `<div class="field"><span>Repeat every</span>
    ${meter ? `<div class="row" style="gap:8px">${inp('s_u', ev.u ?? '', 'off', 'text', 'inputmode="numeric" data-commas')}<span class="muted" style="min-width:28px">${u}</span></div>
      <div class="picks">${presetsU.map((v) => `<button class="pick" data-act="s-pick" data-v="${v}">${fmtN(v, u)}</button>`).join('')}</div>
      <span class="faint" style="font-size:12px;margin-top:4px">or</span>` : ''}
    <div class="row" style="gap:8px">${inp('s_t', tVal, 'off', 'number', 'inputmode="numeric"')}<select class="inp" id="s_tu" style="width:132px">${['days', 'weeks', 'months'].map((x) => `<option ${x === tUnit ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="picks">${tp.map(([n, un, l]) => `<button class="pick" data-act="s-tpick" data-n="${n}" data-u="${un}">${l}</button>`).join('')}</div>
    ${meter ? `<span class="faint" style="font-size:12px">Whichever comes first. Leave one empty to ignore it.</span>` : ''}
  </div>`;
}
function readInterval(m) {
  const u = hasMeter(m) ? num(val('s_u')) : null, t = num(val('s_t')), tu = val('s_tu');
  return { u: u || null, months: t && tu === 'months' ? t : null, days: t && tu !== 'months' ? (tu === 'weeks' ? t * 7 : t) : null };
}
function openSched(id) {
  const it = I(id), m = M(it.machineId), u = UNIT_LABEL[m.unit], meter = hasMeter(m);
  schedUnknown = !!it.unknown && !lastLogFor(it.id);
  sheet(`${sheetHead(it.title)}
    ${intervalFields(m, it.every)}
    <div class="field"><span>Last done</span>
      <div class="${meter ? 'two' : ''}">${inp('s_date', schedUnknown ? '' : it.lastDate, '', 'date')}${meter ? inp('s_r', schedUnknown ? '' : (it.lastReading ?? ''), 'at ' + (u || ''), 'text', 'inputmode="numeric" data-commas') : ''}</div>
      <div class="picks">${[['Today', 0], ['1 mo ago', 1], ['3 mo ago', 3], ['6 mo ago', 6], ['1 yr ago', 12]].map(([l, n]) => `<button class="pick" data-act="s-ago" data-v="${n}">${l}</button>`).join('')}<button class="pick ${schedUnknown ? 'on' : ''}" data-act="s-unknown" id="s_unk">Not sure</button></div>
    </div>
    <div class="preview" id="s_prev"></div>
    <div class="sheet-actions"><button class="btn primary" data-act="sched-save" data-id="${id}">Save</button></div>`, (sh) => {
    sh.addEventListener('input', (e) => { if (e.target.id === 's_date' || e.target.id === 's_r') { schedUnknown = false; const k = $('#s_unk'); if (k) k.classList.remove('on'); } schedPreview(id); });
    sh.addEventListener('change', () => schedPreview(id));
    schedPreview(id);
  });
}
function schedDraft(id) {
  const it = I(id), m = M(it.machineId);
  const d = val('s_date') || todayISO();
  return { ...it, every: readInterval(m), lastDate: d, lastReading: hasMeter(m) ? (num(val('s_r')) ?? estReadingOn(m, d)) : it.lastReading, unknown: false, snoozeUntil: null, first: lastLogFor(it.id) ? null : it.first };
}
/* edit a suggested item's interval before it's added */
function openTplSheet(mid, key) {
  const m = M(mid), tp = templatesFor(m).find((x) => x.key === key);
  const base = itemFromTemplate(m, tp);
  const ev = (suggestSel.over && suggestSel.over[key]) || base.every;
  sheet(`${sheetHead(tp.title)}
    ${intervalFields(m, ev)}
    <div class="sheet-actions"><button class="btn primary" data-act="tpl-save" data-mid="${mid}" data-key="${key}">Done</button>
    <button class="btn text" data-act="tpl-reset" data-key="${key}">Use suggested (${esc(intervalText(base, m).replace(/^Every /, '').toLowerCase())})</button></div>`);
}
function refreshSchedPreview() { const b = $('[data-act=sched-save]'); if (b) schedPreview(b.dataset.id); }
function schedPreview(id) {
  const box = $('#s_prev'); if (!box) return;
  const d = schedDraft(id);
  if (!d.every.u && !hasTime(d.every)) { box.innerHTML = 'Set at least one: a distance/hours or a number of months.'; return; }
  if (schedUnknown) { box.innerHTML = '<b>Shows as due now</b> until you log it.'; return; }
  const st = itemStatus(d);
  box.innerHTML = `Next due: <b>${st.dueDate ? fmtDate(st.dueDate, true) : '—'}</b> · ${esc(st.text)}`;
}

/* ---------- backup reminder (works like a maintenance item) ---------- */
function backupStatus() {
  const every = S.settings.backupEvery;
  if (!every || !S.machines.length) return null;
  const base = S.settings.lastBackup ? addDays(S.settings.lastBackup, every) : addDays(S.settings.firstUse || todayISO(), 7);
  const due = S.settings.backupSnooze && S.settings.backupSnooze > base ? S.settings.backupSnooze : base;
  const d = daysBetween(todayISO(), due);
  return { due, d, over: d <= 0 };
}
function backupRow() {
  const b = backupStatus(); if (!b || !b.over) return '';
  return `<div class="mrow urgent backup">
    <div class="top"><span class="chip warn">${icon('save', 15)}Backup</span><div class="mname" style="text-align:left">Automatic backup</div></div>
    <div class="mid"><span class="desc">${backupFresh() ? 'Packed and ready · tap to save it' : S.settings.lastBackup ? `Last backup ${humanDays(daysBetween(S.settings.lastBackup, todayISO()))} ago` : 'Never backed up'}</span><span class="meta" style="color:#f3c4c4">${esc((BACKUP_OPTS.find((o) => o[0] === S.settings.backupEvery) || [0, ''])[1])}</span></div>
    <div class="bigacts"><button class="logl" data-act="backup-now">Save backup</button><button class="rbtn lg" data-act="backup-snooze" aria-label="Snooze">${icon('snooze', 20)}</button></div>
  </div>`;
}
const BACKUP_OPTS = [[14, 'Every 2 weeks'], [30, 'Every month'], [90, 'Every 3 months'], [0, 'Off']];
function openBackupSnooze() {
  sheet(`${sheetHead('Automatic backup')}<div class="group">
    ${[[1, 'Tomorrow'], [7, 'In a week']].map(([d, l]) => `<button class="lrow" data-act="backup-snooze-set" data-days="${d}"><div class="ibox">${icon('snooze', 18)}</div><div class="grow"><div class="t">${l}</div></div></button>`).join('')}
    ${BACKUP_OPTS.map(([d, l]) => `<button class="lrow" data-act="backup-every" data-v="${d}"><div class="ibox">${icon(d ? 'history' : 'x', 18)}</div><div class="grow"><div class="t">${d ? 'Remind me ' + l.toLowerCase() : 'Turn off backup reminders'}</div></div>${S.settings.backupEvery === d ? icon('check', 18) : ''}</button>`).join('')}
  </div>`);
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
function doSnooze(id, d) { const it = I(id); if (!it) return; undoable(d ? `Snoozed ${d === 1 ? 'until tomorrow' : humanDays(d)}` : 'Un-snoozed', () => { it.snoozeUntil = d ? addDays(todayISO(), d) : null; }); }
function doSkip(id) { const it = I(id); if (!it) return; const m = M(it.machineId); undoable('Skipped this time', () => { doLog([it.id], { machineId: m.id, title: it.title, date: todayISO(), reading: hasMeter(m) ? m.reading : null, skipped: true }); }); }

/* swipe a task: left = snooze a week, right = skip this time */
let swipeState = null, swallowClick = false;
document.addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.swipe > .mrow');
  if (!row || e.button > 0 || e.target.closest('button')) return;
  swipeState = { row, wrap: row.parentElement, x0: e.clientX, y0: e.clientY, dx: 0, on: false, id: row.parentElement.dataset.id };
});
document.addEventListener('pointermove', (e) => {
  const st = swipeState; if (!st) return;
  const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
  if (!st.on) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { swipeState = null; return; }
    if (Math.abs(dx) < 12) return;
    st.on = true; st.row.style.transition = 'none'; try { st.row.setPointerCapture(e.pointerId); } catch (err) {}
  }
  st.dx = dx;
  const w = st.row.offsetWidth, lim = w * 0.32;
  st.row.style.transform = `translateX(${dx}px)`;
  st.wrap.dataset.dir = dx < 0 ? 'left' : 'right';
  st.wrap.classList.toggle('armed', Math.abs(dx) > lim);
});
function endSwipe() {
  const st = swipeState; swipeState = null; if (!st || !st.on) return;
  swallowClick = true; setTimeout(() => (swallowClick = false), 60);
  const w = st.row.offsetWidth, go2 = Math.abs(st.dx) > w * 0.32;
  st.row.style.transition = 'transform .22s ease';
  if (!go2) { st.row.style.transform = ''; st.wrap.classList.remove('armed'); return; }
  st.row.style.transform = `translateX(${st.dx < 0 ? -w : w}px)`;
  if (navigator.vibrate) try { navigator.vibrate(10); } catch (err) {}
  setTimeout(() => (st.dx < 0 ? doSnooze(st.id, 7) : doSkip(st.id)), 200);
}
document.addEventListener('pointerup', endSwipe);
document.addEventListener('pointercancel', () => { const st = swipeState; swipeState = null; if (st && st.on) { st.row.style.transition = 'transform .2s'; st.row.style.transform = ''; } });
document.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);
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
  itemIds.forEach((id) => { const it = I(id); if (!it) return; if (!it.lastDate || (it.unknown && !data.skipped) || data.date >= it.lastDate) { it.unknown = false; it.lastDate = data.date; if (data.reading != null) it.lastReading = data.reading; else if (hasMeter(m)) it.lastReading = m.reading; } it.snoozeUntil = null; });
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
  'name-pick': (el) => { const i = $('#garageName'); if (i) { i.value = el.dataset.v; i.focus(); } document.querySelectorAll('.pick').forEach((p) => p.classList.toggle('on', p === el)); },
  'onb-name': () => { const v = val('garageName'); if (!v) { $('#garageName').focus(); return toast('Give your garage a name'); } S.settings.garage = v; save(); go('#/welcome/6'); },
  'install-tab': (el) => { installTab = el.dataset.v; render(); },
  'install-now': async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; render(); },
  'install-dismiss': (el, e) => { e.stopPropagation(); S.settings.installDismissed = true; save(); render(); },
  sched: (el, e) => { e && e.stopPropagation(); closeSheet(); openSched(el.dataset.id); },
  's-pick': (el) => { const i = $('#s_u'); if (i) { i.value = Number(el.dataset.v).toLocaleString(); refreshSchedPreview(); } },
  's-tpick': (el) => { $('#s_t').value = el.dataset.n; $('#s_tu').value = el.dataset.u; refreshSchedPreview(); },
  'tpl-save': (el) => { const m = M(el.dataset.mid); const ev = readInterval(m); if (!ev.u && !hasTime(ev)) return toast('Set how often it repeats'); suggestSel.over = suggestSel.over || {}; suggestSel.over[el.dataset.key] = ev; suggestSel.on[el.dataset.key] = true; closeSheet(); render(); },
  'tpl-reset': (el) => { if (suggestSel.over) delete suggestSel.over[el.dataset.key]; closeSheet(); render(); },
  'sug-edit': (el, e) => { e.stopPropagation(); openTplSheet(el.dataset.id, el.dataset.key); },
  'tpl-add-edit': (el) => { const m = M(el.dataset.id); const tp = templatesFor(m).find((x) => x.key === el.dataset.key); const it = itemFromTemplate(m, tp); S.items.push(it); save(); render(); openSched(it.id); },
  's-ago': (el) => {
    const id = $('[data-act=sched-save]').dataset.id, it = I(id), m = M(it.machineId);
    const d = addMonths(todayISO(), -(+el.dataset.v)); $('#s_date').value = d;
    if ($('#s_r')) $('#s_r').value = withCommas(String(+el.dataset.v === 0 ? Math.round(predictedReading(m) * 10) / 10 : estReadingOn(m, d)));
    schedUnknown = false; $('#s_unk').classList.remove('on'); schedPreview(id);
  },
  's-unknown': (el) => { schedUnknown = !schedUnknown; el.classList.toggle('on', schedUnknown); if (schedUnknown) { $('#s_date').value = ''; if ($('#s_r')) $('#s_r').value = ''; } schedPreview($('[data-act=sched-save]').dataset.id); },
  'sched-save': (el) => {
    const it = I(el.dataset.id), m = M(it.machineId);
    const d = schedDraft(it.id);
    if (!d.every.u && !hasTime(d.every)) return toast('Set how often it repeats');
    const snap = snapshot();
    it.every = d.every; it.snoozeUntil = null;
    if (schedUnknown) { it.unknown = true; it.lastDate = backDate(d.every); if (d.every.u) it.lastReading = (m.reading || 0) - d.every.u; }
    else { it.unknown = false; it.lastDate = d.lastDate; if (hasMeter(m)) it.lastReading = d.lastReading; }
    if (lastLogFor(it.id)) it.first = null;
    save(); closeSheet(); render(); toast('Schedule updated', () => { S = snap; save(); render(); });
  },
  'backup-snooze': () => openBackupSnooze(),
  'theme-sheet': () => sheet(`${sheetHead('Theme')}${themePicker()}`),
  'set-theme': (el) => { S.settings.theme = el.dataset.v; save(); applyTheme(); document.querySelectorAll('.theme').forEach((t) => t.classList.toggle('on', t.dataset.v === el.dataset.v)); if (!$('#scrim')) return; render(); },
  'imp-reset': () => { imp = null; render(); },
  'imp-suggest': (el) => { imp.suggest = !imp.suggest; el.querySelector('.switch').classList.toggle('on', imp.suggest); },
  'imp-run': () => runImport(),
  'backup-snooze-set': (el) => { S.settings.backupSnooze = addDays(todayISO(), +el.dataset.days); save(); closeSheet(); render(); toast('Backup reminder snoozed'); },
  'backup-every': (el) => { S.settings.backupEvery = +el.dataset.v; S.settings.backupSnooze = ''; save(); closeSheet(); render(); toast(+el.dataset.v ? 'Automatic backup updated' : 'Automatic backup off'); },
  'backup-save': () => shareBackup(),
  'backup-now': () => (backupFresh() ? shareBackup() : doBackup()),
  'finish-onboard': async (el) => {
    S.settings.onboarded = true; save();
    if (el.dataset.notify && 'Notification' in window) { try { const p = await Notification.requestPermission(); S.settings.notify = p === 'granted'; save(); } catch (e) {} }
    newDraft(); go(S.machines.length ? '#/' : '#/add');
  },
  'rename-garage': () => prompt2('Garage name', 'Name', S.settings.garage, (v) => { S.settings.garage = v.trim() || 'My Garage'; save(); render(); }),
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
    if (NO_METER.includes(draft.cat)) { if (!draft.name) draft.name = draft.cat === 'cat' ? 'Cat' : 'Bird feeder'; draft.unit = 'none'; draft.reading = ''; return go('#/add/4'); }
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
  'custom-from': (el) => { customReturn = el.dataset.back; go('#/custom/' + el.dataset.id); },
  'sug-toggle': (el) => { suggestSel.on[el.dataset.key] = !suggestSel.on[el.dataset.key]; el.querySelector('.switch').classList.toggle('on', suggestSel.on[el.dataset.key]); },
  'sug-last': (el) => { if ($('#sg_date')) { suggestSel.date = val('sg_date'); suggestSel.reading = val('sg_r'); } suggestSel.last = el.dataset.v; render(); },
  'sug-save': (el) => {
    const m = M(el.dataset.id);
    templatesFor(m).filter((tp) => suggestSel.on[tp.key] && !S.items.some((i) => i.machineId === m.id && i.key === tp.key)).forEach((tp) => {
      const it = itemFromTemplate(m, tp, { isNew: m.isNew });
      if (suggestSel.over && suggestSel.over[tp.key]) { it.every = suggestSel.over[tp.key]; it.first = null; }
      if (suggestSel.last === 'date') { const d = val('sg_date') || todayISO(); it.lastDate = d; it.lastReading = hasMeter(m) ? (num(val('sg_r')) ?? estReadingOn(m, d)) : it.lastReading; it.first = null; }
      if (suggestSel.last === 'unknown') { it.unknown = true; it.lastDate = backDate(it.every); if (it.every.u) it.lastReading = (m.reading || 0) - it.every.u; it.first = null; }
      S.items.push(it);
    });
    save(); suggestSel = null; go('#/m/' + m.id); toast('Schedule saved');
  },
  'item-toggle': (el) => { const it = I(el.dataset.id); it.enabled = it.enabled === false; save(); el.querySelector('.switch').classList.toggle('on', it.enabled); },
  'tpl-add': (el) => { const m = M(el.dataset.id); const tp = templatesFor(m).find((x) => x.key === el.dataset.key); S.items.push(itemFromTemplate(m, tp)); save(); render(); toast(`Tracking ${tp.title.toLowerCase()}`); },
  'custom-save': (el) => {
    const m = M(el.dataset.mid);
    const title = val('c_title'); if (!title) { $('#c_title').focus(); return toast('Give it a name'); }
    const ev = readInterval(m);
    if (!ev.u && !hasTime(ev)) return toast('Set how often it repeats');
    let it = el.dataset.id ? I(el.dataset.id) : null;
    if (!it) { it = { id: uid(), machineId: m.id, key: null, icon: guessIcon(title), need: [], how: title, enabled: true, created: todayISO() }; S.items.push(it); }
    it.title = title; it.every = ev; it.notes = val('c_notes');
    it.lastDate = val('c_lastDate') || todayISO(); if (hasMeter(m)) it.lastReading = num(val('c_lastReading')) ?? m.reading;
    it.snoozeUntil = null;
    const back = customReturn; customReturn = null;
    save(); go(el.dataset.id ? '#/i/' + it.id : back || '#/m/' + m.id); toast('Saved');
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
  'snooze-set': (el) => { closeSheet(); doSnooze(el.dataset.id, +el.dataset.days); },
  skip: (el) => { closeSheet(); doSkip(el.dataset.id); },
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
      const blob = await getPhotoBlob(pendingReceipt.photoId);
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
  'pre-done': (el) => { const left = document.querySelectorAll('.check:not(.on)').length; go('#/m/' + el.dataset.mid); toast(left ? `${plural(left, 'item')} not checked` : 'All set. Have a good one'); },
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
  'reset-all': () => confirm2('Erase everything?', 'All machines, history, receipts, photos and restore points on this phone will be deleted. Save a backup file first if you might want any of it.', 'Erase all data', async () => { S = blank(); S.settings.onboarded = false; save(); if (idb) { const tx = idb.transaction('files', 'readwrite'); tx.objectStore('files').clear(); idbDel('kv', 'snaps'); } go('#/welcome/1'); }),
};
if (typeof MORE_ACT !== 'undefined') Object.assign(ACT, MORE_ACT);
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
  'import-file': async (el) => { const f = el.files[0]; if (!f) return; try { loadImport(await f.text(), f.name); render(); } catch (e) { toast("Couldn't read that file. Is it a CSV?"); } },
  'imp-map': (el) => { imp.map[el.dataset.k] = el.value === '' ? '' : +el.value; render(); },
  'imp-target': (el) => { const n = $('#imp_name'); if (n) imp.newName = n.value; imp.target = el.value; render(); },
  'imp-vto': (el) => { imp.vmap[el.dataset.k].to = el.value; render(); },
  'imp-cat': (el) => { const n = $('#imp_name'); if (n) imp.newName = n.value; if (el.dataset.k) imp.vmap[el.dataset.k].cat = el.value; else imp.newCat = el.value; },
};

/* ======================= exports ======================= */
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
let pendingBackup = null;
/* builds the backup file (all data + every photo). Kept ready so "Save backup" can open the share sheet in one tap. */
async function buildBackup() {
  const seq = saveSeq;
  const files = {};
  const ids = new Set(allPhotoIds());
  for (const id of ids) { const b = await getPhotoBlob(id); if (b) files[id] = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); }
  const name = `${(S.settings.garage || 'garage').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'garage'}-backup-${todayISO()}.json`;
  const json = JSON.stringify({ app: 'bills-garage', made: new Date().toISOString(), ...S, files });
  let file;
  try { file = new File([json], name, { type: 'application/json' }); } catch (e) { file = new Blob([json], { type: 'application/json' }); file.name = name; }
  pendingBackup = { file, seq, size: json.length, photos: Object.keys(files).length };
  return pendingBackup;
}
const backupFresh = () => pendingBackup && pendingBackup.seq === saveSeq;
async function doBackup() {
  closeSheet();
  if (!backupFresh()) { toast('Packing up your data…'); await buildBackup(); const t = $('.toast'); if (t) t.remove(); }
  const b = pendingBackup;
  sheet(`${sheetHead('Backup ready')}
    <div class="card dark stack"><div class="row between"><span class="muted">Machines</span><b>${S.machines.length}</b></div><div class="row between"><span class="muted">Services logged</span><b>${S.logs.length}</b></div><div class="row between"><span class="muted">Photos</span><b>${b.photos}</b></div><div class="row between"><span class="muted">Size</span><b>${(b.size / 1048576).toFixed(b.size > 1048576 ? 1 : 2)} MB</b></div></div>
    <p class="note" style="margin:0">Save it somewhere off this phone: <b style="color:#fff">Save to Files → iCloud Drive</b>, Google Drive, or email it to yourself. One file has everything, photos included.</p>
    <div class="sheet-actions"><button class="btn primary" data-act="backup-save">${icon('save', 18)}Save backup file</button></div>`);
}
async function shareBackup() {
  const f = pendingBackup && pendingBackup.file; if (!f) return doBackup();
  let shared = false;
  if (navigator.canShare && navigator.share) {
    try { if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: f.name }); shared = true; } }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  if (!shared) download(f.name, f);
  S.settings.lastBackup = todayISO(); S.settings.backupSnooze = ''; save(); closeSheet(); render(); toast('Backup saved');
}
async function restoreFile(file, confirmed) {
  if (!file) return;
  try {
    const j = JSON.parse(await file.text());
    if (!j.machines) throw new Error('bad');
    if (!confirmed && S.machines.length) {
      const made = j.made ? iso(new Date(j.made)) : j.settings && j.settings.lastBackup; const when = made ? ', saved ' + fmtDate(made, true) : '';
      return confirm2('Restore this backup?', `It has ${plural(j.machines.length, 'machine')} and ${plural((j.logs || []).length, 'service')}${when}. What’s on this phone now gets swapped out, but a restore point is saved first so you can switch back from Backup & data.`, 'Restore backup', () => restoreFile(file, true), false);
    }
    await makeSnapshot('Before restoring a backup');
    for (const [id, d] of Object.entries(j.files || {})) { const b = await (await fetch(d)).blob(); await idbPut('files', id, { type: b.type || 'image/jpeg', buf: await b.arrayBuffer() }); delete urlCache[id]; }
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
  const bk = backupStatus();
  if (!over.length && !soon.length) {
    if (bk && bk.over && S.settings.lastNotify !== todayISO()) { try { const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration()); if (reg) reg.showNotification('Your garage backup is ready', { body: 'One tap to save it. Open the app and tap Save backup.', icon: 'icon-192.png', tag: 'garage-backup' }); } catch (e) {} S.settings.lastNotify = todayISO(); save(); return; }
    if (force) toast('Reminders on. Nothing due right now'); return;
  }
  const title = over.length ? `${plural(over.length, 'thing')} overdue` : `${plural(soon.length, 'thing')} due soon`;
  const body = [...over, ...soon].slice(0, 3).map((x) => `${M(x.it.machineId).name}: ${x.it.title}`).join('\n');
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg) reg.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'garage-due' });
    else new Notification(title, { body, icon: 'icon-192.png' });
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
window.addEventListener('scroll', () => { const t = document.getElementById('itemHdrTitle'); if (t) t.style.opacity = window.scrollY > 170 ? 1 : 0; }, { passive: true });
document.addEventListener('input', (e) => {
  const i = e.target;
  if (!i.matches || !i.matches('input[data-commas]')) return;
  const before = i.value, caretFromEnd = before.length - (i.selectionStart ?? before.length);
  const after = withCommas(before);
  if (after !== before) { i.value = after; const pos = Math.max(0, after.length - caretFromEnd); try { i.setSelectionRange(pos, pos); } catch (err) {} }
}, true);
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el && CHANGE[el.dataset.change]) CHANGE[el.dataset.change](el, e); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { autoSnapshot().catch(() => {}); } if (!document.hidden) { checkNotify(); if (!$('#scrim') && !route().some((x) => ['add', 'custom', 'receipt', 'warranty', 'note', 'fuel', 'specs', 'edit'].includes(x))) render(); } });

/* M splash: plays once per launch, tap to skip */
function runSplash() {
  const sp = document.getElementById('splash'); if (!sp) return;
  const v = document.getElementById('splashVid');
  let done = false;
  const hide = () => { if (done) return; done = true; sp.classList.add('out'); setTimeout(() => sp.remove(), 450); };
  sp.addEventListener('click', hide);
  let stilled = false;
  const still = () => { if (stilled || done || !v.isConnected) return; stilled = true; v.outerHTML = '<img src="loader-poster.jpg" alt="">'; setTimeout(hide, 800); };
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return still();
  v.addEventListener('ended', () => setTimeout(hide, 150));
  v.addEventListener('error', still, true);
  const p = v.play(); if (p && p.catch) p.catch(still);
  setTimeout(hide, 4500);
}
runSplash();

(async function boot() {
  await load();
  try { await warmPhotos(); } catch (e) {}
  try { await autoSnapshot(); } catch (e) {}
  if ('serviceWorker' in navigator) { try { await navigator.serviceWorker.register('sw.js'); } catch (e) {} }
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
  render();
  setTimeout(() => checkNotify(), 1500);
  /* automatic backup: when one is due, pack it up quietly so saving it is a single tap */
  setTimeout(() => { const b = backupStatus(); if (b && b.over && !backupFresh()) buildBackup().then(() => { if (!route()[0] || route()[0] === 'data') render(); }).catch(() => {}); }, 2500);
  /* keep the PDF tool on the phone for offline use */
  setTimeout(() => { ['vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js'].forEach((u) => fetch(u).catch(() => {})); }, 9000);
})();
