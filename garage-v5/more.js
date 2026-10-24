/* Garage — backup & data hub, restore points, garage log (print + PDF), data-safety page, feedback.
   Loaded before app.js. Everything here only runs when called, so app.js globals are ready by then. */
'use strict';

const APP_VERSION = '6';
/* Feedback goes to Web3Forms when a key is set (paste the access key from web3forms.com).
   With no key, or no signal, the form opens an email instead. */
const WEB3FORMS_KEY = '';
const FEEDBACK_EMAIL = 'mtsteiner17@gmail.com';

/* ======================= restore points (automatic, on this phone) ======================= */
const SNAP_KEEP = 12;
const sigOf = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return str.length + ':' + h; };
async function getSnaps() { const l = await idbGet('kv', 'snaps'); return Array.isArray(l) ? l : []; }
/* copies the data right away (before any await) so a change made right after is never mixed in */
async function makeSnapshot(label, auto = false) {
  if (!S.machines.length) return null;
  const json = JSON.stringify(S);
  const sig = sigOf(json);
  const list = await getSnaps();
  if (auto && list[0] && list[0].sig === sig) return null; // nothing changed since the last one
  const snap = { id: uid(), at: new Date().toISOString(), label, auto, sig, machines: S.machines.length, logs: S.logs.length, state: JSON.parse(json) };
  list.unshift(snap);
  await idbPut('kv', 'snaps', list.slice(0, SNAP_KEEP));
  return snap;
}
async function autoSnapshot() {
  if (!S.machines.length) return;
  const list = await getSnaps();
  const today = todayISO();
  if (list.some((x) => x.auto && x.at.slice(0, 10) === today)) return;
  await makeSnapshot('Automatic daily save', true);
}
function snapWhen(x) {
  const d = new Date(x.at);
  const day = iso(d) === todayISO() ? 'Today' : daysBetween(iso(d), todayISO()) === 1 ? 'Yesterday' : fmtDate(iso(d), true);
  return `${day} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}
async function fillSnapList() {
  const box = $('#snaplist'); if (!box) return;
  const list = await getSnaps();
  if (!document.body.contains(box)) return;
  box.innerHTML = list.length
    ? list.map((x) => `<button class="lrow" data-act="snap-open" data-id="${x.id}"><div class="ibox">${icon(x.auto ? 'history' : 'save', 18)}</div><div class="grow"><div class="t">${esc(snapWhen(x))}</div><div class="d">${esc(x.label)} · ${plural(x.machines, 'machine')}, ${plural(x.logs, 'service')}</div></div>${icon('back', 16, 'flip')}</button>`).join('')
    : `<p class="note">The first one is saved automatically once you’ve added a machine.</p>`;
}
async function openSnap(id) {
  const x = (await getSnaps()).find((s) => s.id === id); if (!x) return;
  sheet(`${sheetHead('Go back to this point?')}
    <div class="card dark stack"><div class="row between"><span class="muted">Saved</span><b>${esc(snapWhen(x))}</b></div><div class="row between"><span class="muted">Why</span><b>${esc(x.label)}</b></div><div class="row between"><span class="muted">Machines</span><b>${x.machines}</b></div><div class="row between"><span class="muted">Services logged</span><b>${x.logs}</b></div></div>
    <p class="note" style="margin:0">Your garage goes back to exactly how it was then. What’s here now is saved as a new restore point first, so you can always switch back.</p>
    <div class="sheet-actions"><button class="btn primary" data-act="snap-restore" data-id="${x.id}">Go back to this point</button><button class="btn text" data-act="close-sheet">Cancel</button></div>`);
}
async function restoreSnap(id) {
  const x = (await getSnaps()).find((s) => s.id === id); if (!x) return;
  await makeSnapshot('Before going back to ' + snapWhen(x));
  const st = JSON.parse(JSON.stringify(x.state));
  S = Object.assign(blank(), st); S.settings = Object.assign(blank().settings, st.settings || {}, { onboarded: true });
  save(); closeSheet(); go('#/'); toast('Garage restored to ' + snapWhen(x));
}

/* ======================= backup status (used by Settings and Backup & data) ======================= */
function backupSummary() {
  const n = S.machines.length;
  const lb = S.settings.lastBackup;
  if (!n) return { cls: '', icon: 'shield', title: 'Nothing to back up yet', sub: 'Add a machine and backups start here' };
  if (!lb) return { cls: 'warn', icon: 'alert', title: 'No backup file yet', sub: 'Save one so a lost phone doesn’t mean lost records' };
  const ago = daysBetween(lb, todayISO());
  const b = backupStatus();
  const when = ago === 0 ? 'today' : `${humanDays(ago)} ago`;
  if (b && b.over) return { cls: 'warn', icon: 'save', title: `Backup due · last one ${when}`, sub: backupFresh() ? 'Packed and ready. One tap to save it' : 'Time to save a fresh backup file' };
  return { cls: 'ok', icon: 'check', title: `Backed up ${when}`, sub: S.settings.backupEvery ? `Next one ${fmtDate(b ? b.due : addDays(lb, S.settings.backupEvery), true)} · restore points save daily` : 'Restore points save daily on this phone' };
}
const BACKUP_DESC = { 14: 'Good if you log a lot', 30: 'Recommended', 90: 'For a garage that rarely changes', 0: 'Restore points still save daily on this phone' };
function openAutoBackup() {
  sheet(`${sheetHead('Automatic backup')}
    <p class="note" style="margin:0">When it’s time, the app packs up a backup file for you (every machine, log, receipt and photo). It shows up at the top of your garage, and one tap saves it to iCloud Drive, Google Drive or email.</p>
    <div class="group">${BACKUP_OPTS.map(([d, l]) => `<button class="lrow" data-act="backup-every" data-v="${d}"><div class="ibox">${icon(d ? 'history' : 'x', 18)}</div><div class="grow"><div class="t">${d ? l : 'Off'}</div><div class="d">${esc(BACKUP_DESC[d] || '')}</div></div>${S.settings.backupEvery === d ? icon('check', 18) : ''}</button>`).join('')}</div>`);
}

/* ======================= Backup & data hub ======================= */
function vData() {
  const bk = backupSummary();
  const n = S.machines.length;
  after.push(fillSnapList);
  const every = (BACKUP_OPTS.find((o) => o[0] === S.settings.backupEvery) || [0, 'Off'])[1];
  const row = (act, ic, t, d) => `<button class="lrow" ${act}><div class="ibox">${icon(ic, 18)}</div><div class="grow"><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div>${icon('back', 16, 'flip')}</button>`;
  return `<div class="screen">${topBar('Backup & data', '#/profile')}
    <div class="statuscard ${bk.cls}">
      <div class="ibox">${icon(bk.icon, 24)}</div>
      <div class="grow"><div class="t">${bk.title}</div><div class="d">${bk.sub}</div></div>
    </div>
    ${n ? `<button class="btn primary" data-act="backup-now">${icon('save', 18)}Save a backup file now</button>
    <p class="note" style="text-align:center;margin-top:-4px">One file with everything, photos included.</p>` : ''}

    <div class="sec-title">Automatic</div>
    <div class="group">
      ${row('data-act="auto-backup"', 'history', 'Backup file', `${S.settings.backupEvery ? every : 'Off'} · packed for you, one tap to save`)}
    </div>
    <div class="subhead"><b>Restore points</b><span>Saved on this phone each day you make changes, and before every restore or import. Tap one to go back.</span></div>
    <div class="group" id="snaplist"><p class="note">Loading…</p></div>

    <div class="sec-title">Bring data in</div>
    <div class="group">
      <label class="lrow" style="cursor:pointer"><div class="ibox">${icon('upload', 18)}</div><div class="grow"><div class="t">Restore from a backup file</div><div class="d">Moving to a new phone? Start here</div></div>${icon('back', 16, 'flip')}<input type="file" accept=".json,application/json" hidden data-change="restore"></label>
      ${row('data-act="go" data-to="#/import"', 'fileup', 'Import from another app', 'VMT, Fuelly, Drivvo or any spreadsheet')}
    </div>

    <div class="sec-title">Take data out</div>
    <div class="group">
      ${row('data-act="go" data-to="#/log"', 'print', 'Garage log (PDF)', 'Every machine, photo, receipt and note, ready to print')}
      ${row('data-act="csv"', 'sheet', 'Spreadsheet (CSV)', 'All service and fuel history for Excel or Sheets')}
      ${row('data-act="ics-all"', 'calendar', 'Calendar', 'Due dates for Apple, Google or Outlook')}
    </div>

    ${row('data-act="go" data-to="#/safety"', 'shield', 'How your data stays safe', 'What protects it, and what can erase it')}
    <button class="btn text" data-act="reset-all" style="color:#ff6b6b;margin-top:8px">Erase all data on this phone</button>
  </div>`;
}

/* ======================= how your data stays safe ======================= */
const SAFE_POINTS = [
  ['phone', 'It lives on this phone', 'No account, no password, nothing uploaded. It works in the barn with no signal.'],
  ['save', 'Every change saves instantly', 'There’s no Save button to forget. A spare copy is kept alongside it too.'],
  ['history', 'Restore points, automatically', 'A snapshot is kept each day you make changes, and before any restore or import. You can go back to any of them.'],
  ['download', 'Backup files you keep', 'One file holds everything, photos included. The app packs it up on a schedule and reminds you to save it to iCloud Drive, Google Drive or email.'],
  ['upload', 'Easy to move to a new phone', 'Install the app, tap “Restore from a backup file,” pick the file. Everything comes back.'],
  ['check', 'Undo when you slip', 'Deleted something or snoozed the wrong thing? An Undo button shows up right away.'],
];
function safeList() {
  return `<div class="safe">${SAFE_POINTS.map(([ic, t, d]) => `<div class="safe-row"><span class="fi">${icon(ic, 20)}</span><div><div class="t">${t}</div><div class="d">${d}</div></div></div>`).join('')}</div>`;
}
const SAFE_WARN = `<div class="callout"><b>What can erase it:</b> deleting the Home Screen app, clearing your browser’s website data, or losing the phone. That’s exactly what backup files are for, so keep one somewhere else.</div>`;
function onbSafety() {
  return `<div class="screen stagger">
    ${topBar('', '#/welcome/3')}${steps(5, 3)}
    <h2 class="headline">Your records are safe here</h2>
    <p class="note">Years of service history should never vanish. Here’s how this app keeps it.</p>
    ${safeList()}
    ${SAFE_WARN}
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="go" data-to="#/welcome/5">Sounds good</button><button class="btn text" data-act="restore-start">I have a backup file to restore</button></div>
  </div>`;
}
function vSafety() {
  after.push(async () => {
    const el = $('#persist'); if (!el) return;
    let on = null;
    try { if (navigator.storage && navigator.storage.persisted) on = await navigator.storage.persisted(); } catch (e) {}
    const snaps = await getSnaps();
    el.innerHTML = `<div class="kv"><span>Last backup file</span><b>${S.settings.lastBackup ? fmtDate(S.settings.lastBackup, true) : 'Not yet'}</b></div>
      <div class="kv"><span>Restore points</span><b>${snaps.length ? `${snaps.length} · newest ${esc(snapWhen(snaps[0]))}` : 'None yet'}</b></div>
      <div class="kv"><span>Protected storage</span><b>${on === true ? 'On' : on === false ? (isStandalone() ? 'Asked, browser decides' : 'Add to Home Screen') : 'Not available'}</b></div>
      <div class="kv"><span>Opened from</span><b>${isStandalone() ? 'Home Screen app' : 'Browser tab'}</b></div>`;
  });
  return `<div class="screen">${topBar('Your data', S.settings.onboarded ? '#/profile' : '#/welcome/4')}
    <h2 class="headline">How your data stays safe</h2>
    ${safeList()}
    ${SAFE_WARN}
    ${S.settings.onboarded ? `<div class="sec-title">This phone right now</div><div class="card stack" id="persist"><p class="note">Checking…</p></div>
    <button class="btn primary" data-act="go" data-to="#/data">${icon('save', 18)}Go to Backup & data</button>` : ''}
  </div>`;
}

/* ======================= feedback ======================= */
let fb = { type: 'Bug', sent: false, device: true };
const FB_TYPES = [['Bug', 'bug'], ['Idea', 'sparkles'], ['Question', 'note'], ['Other', 'heart']];
const FB_PH = { Bug: 'What went wrong? e.g. “Logged an oil change and it still says overdue.”', Idea: 'What would make this more useful?', Question: 'What are you trying to do?', Other: 'Anything on your mind' };
function deviceInfo() {
  const pf = { 'ios-safari': 'iPhone · Safari', 'ios-chrome': 'iPhone · Chrome', 'ios-other': 'iPhone · other browser', android: 'Android', desktop: 'Computer' }[detectPlatform()] || '';
  return [`App version ${APP_VERSION}`, pf, isStandalone() ? 'Home Screen app' : 'Browser tab', `Screen ${window.innerWidth}×${window.innerHeight}`, `${plural(S.machines.length, 'machine')}, ${plural(S.logs.length, 'log')}`, `Page ${location.hash || '#/'}`].filter(Boolean).join(' · ');
}
function vFeedback() {
  const backTo = S.settings.onboarded ? '#/profile' : '#/welcome/1';
  if (fb.sent) {
    const ok = fb.sent === 'web';
    return `<div class="screen">${topBar('Feedback', backTo)}
      ${empty(ok ? 'check' : 'note', ok ? 'Thanks, it’s on its way' : 'Almost done', ok ? 'Masen reads every one of these. If you left a way to reach you, you may hear back.' : 'Your email app should have opened with the message filled in. Just hit Send there.', `<button class="btn secondary" style="width:auto;padding:0 24px" data-act="fb-again">Send another</button>`)}
    </div>`;
  }
  return `<div class="screen">${topBar('Feedback', backTo)}
    <h2 class="headline">Found a bug? Got an idea?</h2>
    <p class="note">This goes straight to Masen, who built the app. Bugs get fixed faster with a little detail.</p>
    <div class="seg fbseg">${FB_TYPES.map(([t, ic]) => `<button class="${fb.type === t ? 'on' : ''}" data-act="fb-type" data-v="${t}">${t}</button>`).join('')}</div>
    ${field('Message', `<textarea class="inp" id="fb_msg" placeholder="${esc(FB_PH[fb.type])}" style="height:140px">${esc(fb.msg || '')}</textarea>`)}
    <div id="fb_stepsbox" ${fb.type === 'Bug' ? '' : 'hidden'}>${field('What were you doing right before? (optional)', `<textarea class="inp" id="fb_steps" placeholder="e.g. Opened the mower, tapped Log, picked a photo" style="height:84px">${esc(fb.steps || '')}</textarea>`)}</div>
    <div class="two">${field('Your name (optional)', inp('fb_name', fb.name || '', ''))}${field('Email or phone (optional)', inp('fb_contact', fb.contact || '', 'For a reply', 'text', 'autocomplete="email"'))}</div>
    <button class="trow" data-act="fb-device"><div class="grow"><div class="t">Include phone & app details</div><div class="d">${esc(deviceInfo())}. Nothing about your machines.</div></div><span class="switch ${fb.device ? 'on' : ''}" id="fb_dev"></span></button>
    <div class="spacer"></div>
    <div class="actions-bottom"><button class="btn primary" data-act="fb-send">${icon('share', 18)}Send</button></div>
  </div>`;
}
function keepFb() { ['msg', 'steps', 'name', 'contact'].forEach((k) => { const e = document.getElementById('fb_' + k); if (e) fb[k] = e.value; }); }
async function sendFeedback(btn) {
  keepFb();
  const msg = (fb.msg || '').trim();
  if (!msg) { $('#fb_msg').focus(); return toast('Write a quick message first'); }
  const lines = [msg];
  if (fb.type === 'Bug' && (fb.steps || '').trim()) lines.push('', 'Right before: ' + fb.steps.trim());
  if (fb.device) lines.push('', deviceInfo(), navigator.userAgent);
  const subject = `Garage app ${fb.type.toLowerCase()}: ${msg.replace(/\s+/g, ' ').slice(0, 50)}`;
  const contact = (fb.contact || '').trim();
  if (WEB3FORMS_KEY && navigator.onLine !== false) {
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const body = { access_key: WEB3FORMS_KEY, subject, from_name: 'Garage app', name: fb.name || 'Garage app user', type: fb.type, message: lines.join('\n'), contact };
      if (/@/.test(contact)) body.email = contact;
      const r = await fetch('https://api.web3forms.com/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success !== false) { fb = { type: fb.type, device: fb.device, sent: 'web' }; render(); return; }
    } catch (e) {}
    btn.disabled = false; btn.innerHTML = `${icon('share', 18)}Send`;
    toast('Couldn’t send it from here. Opening email instead');
  }
  if (fb.name) lines.push('', 'From: ' + fb.name);
  if (contact) lines.push('Reply to: ' + contact);
  location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  fb = { type: fb.type, device: fb.device, sent: 'mail' };
  setTimeout(render, 600);
}

/* ======================= garage log (on-screen paper + print + real PDF) ======================= */
let logOpts = { mphotos: true, rphotos: true, archived: false };
const ST_LABEL = { over: 'Overdue', soon: 'Due soon', snoozed: 'Snoozed', ok: 'On track' };
function everyText(it, m) {
  const ev = it.every || {}, u = UNIT_LABEL[m.unit];
  const t = [ev.u && hasMeter(m) ? `${fmtN(ev.u, u)}` : '', hasTime(ev) ? timeText(ev) : ''].filter(Boolean).join(' or ');
  return t ? 'Every ' + t + (m.severe && it.severe ? ' (severe duty)' : '') : 'No interval';
}
function lastDoneText(it, m) {
  const l = lastLogFor(it.id);
  if (l) return fmtDate(l.date, true) + (l.reading != null && hasMeter(m) ? ' · ' + fmtN(l.reading, UNIT_LABEL[m.unit]) : '');
  if (it.unknown) return 'Not sure';
  return it.lastDate ? fmtDate(it.lastDate, true) + (it.lastReading != null && hasMeter(m) ? ' · ' + fmtN(it.lastReading, UNIT_LABEL[m.unit]) : '') : '—';
}
function nextDueText(it, m, st) {
  const parts = [];
  if (it.every && it.every.u && hasMeter(m) && st.remU != null) parts.push(fmtN((m.reading || 0) + st.remU, UNIT_LABEL[m.unit]));
  if (st.dueDate) parts.push((st.remU != null && !hasTime(it.every) ? '~' : '') + fmtDate(st.dueDate, true));
  return parts.join(' or ') || '—';
}
function machineData(m) {
  const logs = S.logs.filter((l) => l.machineId === m.id).sort((a, b) => b.date.localeCompare(a.date));
  const fuel = S.fuel.filter((f) => f.machineId === m.id).sort((a, b) => b.date.localeCompare(a.date));
  const receipts = S.receipts.filter((r) => r.machineId === m.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const items = S.items.filter((i) => i.machineId === m.id && i.enabled !== false).map((it) => ({ it, st: itemStatus(it) })).sort((a, b) => a.st.score - b.st.score);
  const spent = logs.reduce((s, l) => s + (l.cost || 0), 0) + fuel.reduce((s, f) => s + (f.total || 0), 0) + receipts.filter((r) => !r.logId).reduce((s, r) => s + (r.total || 0), 0);
  const specs = SPEC_FIELDS.filter(([k]) => m.specs && m.specs[k]).map(([k, l]) => [l, m.specs[k]]);
  return {
    logs, fuel, receipts, items, spent, specs,
    notes: S.notes.filter((n) => n.machineId === m.id).sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date)),
    warranties: S.warranties.filter((w) => w.machineId === m.id),
    mpg: mpgStats(m),
    over: items.filter((x) => x.st.state === 'over').length,
  };
}
function logMachines(mid) {
  if (mid) return [M(mid)];
  return S.machines.filter((m) => logOpts.archived || !m.archived);
}
function machineFacts(m) {
  return [
    ['Type', CATS[m.cat]?.label || ''],
    ['Year / make / model', [m.year, m.make, m.model].filter(Boolean).join(' ')],
    [isVehicle(m) ? 'VIN' : 'Serial #', m.serial || m.vin || ''],
    ['Purchased', m.purchased ? fmtDate(m.purchased, true) : ''],
    [m.unit === 'hrs' ? 'Engine hours' : 'Odometer', hasMeter(m) ? `${fmtN(m.reading, UNIT_LABEL[m.unit])}${m.readingDate ? ' as of ' + fmtDate(m.readingDate, true) : ''}` : ''],
    ['Duty', m.severe ? 'Severe (shorter intervals)' : ''],
    ['Status', m.archived ? 'Archived (sold / retired)' : ''],
  ].filter((x) => x[1]);
}
function logHTML(mid, src) {
  const ms = logMachines(mid);
  const all = ms.map((m) => [m, machineData(m)]);
  const tot = all.reduce((s, [, d]) => s + d.spent, 0);
  const nLogs = all.reduce((s, [, d]) => s + d.logs.filter((l) => !l.skipped).length, 0);
  const nRec = all.reduce((s, [, d]) => s + d.receipts.length, 0);
  const img = (id, cls) => { if (!id) return ''; const u = src(id); return `<img class="${cls}" data-fid="${id}" ${u ? `src="${u}"` : ''} alt="">`; };
  const stCls = (s) => (s === 'over' ? 'red' : s === 'soon' ? 'amber' : s === 'snoozed' ? 'grey' : 'green');
  const cover = `<header class="lg-cover">
      <div class="lg-kicker">${mid ? 'Machine log' : 'Garage log'}</div>
      <h1>${esc(mid ? ms[0].name : S.settings.garage || 'Garage')}</h1>
      <div class="lg-made">${mid ? esc(S.settings.garage) + ' · ' : ''}Made ${fmtDate(todayISO(), true)}</div>
      <div class="lg-stats">
        ${mid ? '' : `<div><b>${ms.length}</b><span>${ms.length === 1 ? 'machine' : 'machines'}</span></div>`}
        <div><b>${nLogs}</b><span>services logged</span></div>
        <div><b>${nRec}</b><span>receipts</span></div>
        <div><b>${money(tot) || '$0'}</b><span>spent, all time</span></div>
      </div>
      ${!mid && ms.length > 1 ? `<table class="lg-t"><thead><tr><th>Machine</th><th>Details</th><th>Reading</th><th>Needs attention</th></tr></thead><tbody>${all.map(([m, d]) => { const top = d.items.find((x) => x.st.state === 'over' || x.st.state === 'soon'); return `<tr><td><b>${esc(m.name)}</b></td><td>${esc([m.year, m.make, m.model].filter(Boolean).join(' ') || CATS[m.cat]?.label || '')}</td><td>${hasMeter(m) ? fmtN(m.reading, UNIT_LABEL[m.unit]) : ''}</td><td>${top ? `<span class="lg-st ${stCls(top.st.state)}">${esc(top.it.title)}</span>` : '<span class="lg-st green">All good</span>'}</td></tr>`; }).join('')}</tbody></table>` : ''}
    </header>`;
  const sec = (title, inner) => inner ? `<section class="lg-sec"><h3>${title}</h3>${inner}</section>` : '';
  const machines = all.map(([m, d]) => {
    const facts = machineFacts(m);
    const photo = logOpts.mphotos ? img(m.photoId, 'lg-photo') : '';
    return `<article class="lg-machine">
      <div class="lg-mhead">
        ${photo ? `<div class="lg-photo-wrap">${photo}</div>` : ''}
        <div class="grow">
          <h2>${esc(m.name)}</h2>
          <dl class="lg-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        </div>
      </div>
      <div class="lg-mini">
        <div><b>${d.logs.filter((l) => !l.skipped).length}</b><span>${d.logs.filter((l) => !l.skipped).length === 1 ? 'service' : 'services'}</span></div>
        <div><b>${money(d.spent) || '$0'}</b><span>spent</span></div>
        ${d.mpg ? `<div><b>${d.mpg.avg.toFixed(1)}</b><span>${m.unit === 'km' ? 'km/L' : 'avg mpg'}</span></div>` : ''}
        <div><b class="${d.over ? 'red' : ''}">${d.over}</b><span>overdue</span></div>
      </div>
      ${sec('Maintenance schedule', d.items.length ? `<table class="lg-t"><thead><tr><th>Task</th><th>Repeats</th><th>Last done</th><th>Next due</th><th>Status</th></tr></thead><tbody>${d.items.map(({ it, st }) => `<tr><td><b>${esc(it.title)}</b>${it.notes ? `<div class="lg-sub">${esc(it.notes)}</div>` : ''}</td><td>${esc(everyText(it, m))}</td><td>${esc(lastDoneText(it, m))}</td><td>${esc(nextDueText(it, m, st))}</td><td><span class="lg-st ${stCls(st.state)}">${ST_LABEL[st.state] || ''}</span></td></tr>`).join('')}</tbody></table>` : '')}
      ${sec('Service history', d.logs.length ? `<table class="lg-t"><thead><tr><th>Date</th><th>Work done</th>${hasMeter(m) ? `<th>${m.unit === 'hrs' ? 'Hours' : 'Odometer'}</th>` : ''}<th>Done by</th><th class="r">Cost</th></tr></thead><tbody>${d.logs.map((l) => `<tr class="${l.skipped ? 'skip' : ''}"><td class="nw">${fmtDate(l.date, true)}</td><td><b>${esc(l.title)}</b>${l.skipped ? ' <span class="lg-st grey">Skipped</span>' : ''}${l.receiptIds && l.receiptIds.length ? ' <span class="lg-st grey">Receipt</span>' : ''}${l.notes ? `<div class="lg-sub">${esc(l.notes)}</div>` : ''}</td>${hasMeter(m) ? `<td class="nw">${l.reading != null ? fmtN(l.reading, UNIT_LABEL[m.unit]) : ''}</td>` : ''}<td>${esc(l.shop || (l.skipped ? '' : 'DIY'))}</td><td class="r">${money(l.cost)}</td></tr>`).join('')}</tbody></table>` : '<p class="lg-empty">No services logged yet.</p>')}
      ${sec('Fuel log', d.fuel.length ? `<table class="lg-t"><thead><tr><th>Date</th><th>Odometer</th><th>${m.unit === 'km' ? 'Liters' : 'Gallons'}</th><th>${m.unit === 'km' ? 'km/L' : 'MPG'}</th><th class="r">Cost</th></tr></thead><tbody>${d.fuel.map((f) => `<tr><td class="nw">${fmtDate(f.date, true)}</td><td>${f.reading ? fmtN(f.reading, UNIT_LABEL[m.unit]) : ''}</td><td>${f.gallons ?? ''}</td><td>${f.mpg ? f.mpg.toFixed(1) : ''}</td><td class="r">${money(f.total)}</td></tr>`).join('')}</tbody></table>` : '')}
      ${sec('Specs & part numbers', d.specs.length ? `<dl class="lg-specs">${d.specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '')}
      ${sec('Warranties', d.warranties.length ? `<table class="lg-t"><thead><tr><th>Provider</th><th>Coverage</th><th>Dates</th><th>Policy / contact</th></tr></thead><tbody>${d.warranties.map((w) => { const left = w.end ? daysBetween(todayISO(), w.end) : null; return `<tr><td><b>${esc(w.provider || 'Warranty')}</b></td><td>${esc(w.coverage || '')}</td><td>${w.start ? fmtDate(w.start, true) : ''}${w.end ? ' – ' + fmtDate(w.end, true) : ''}${w.limit ? ` or ${fmtN(w.limit, UNIT_LABEL[m.unit])}` : ''}${left != null ? ` <span class="lg-st ${left < 0 ? 'red' : left <= 60 ? 'amber' : 'green'}">${left < 0 ? 'Expired' : 'Active'}</span>` : ''}</td><td>${esc([w.policy, w.notes].filter(Boolean).join(' · '))}</td></tr>`; }).join('')}</tbody></table>` : '')}
      ${sec('Notes', d.notes.length ? `<div class="lg-notes">${d.notes.map((n) => `<div class="lg-note"><div class="lg-sub">${fmtDate(n.date, true)}${n.pinned ? ' · Pinned' : ''}${n.itemId && I(n.itemId) ? ' · ' + esc(I(n.itemId).title) : ''}</div><div>${esc(n.body)}</div></div>`).join('')}</div>` : '')}
      ${(m.recalls || []).length ? sec('Safety recalls (NHTSA)', `<div class="lg-notes">${m.recalls.map((r) => `<div class="lg-note"><b>${esc(r.component || 'Recall')}</b> <span class="lg-sub">${esc(r.campaign || '')} ${esc(r.date || '')}</span><div>${esc(r.summary || '')}</div>${r.remedy ? `<div class="lg-sub">Fix: ${esc(r.remedy)}</div>` : ''}</div>`).join('')}</div>`) : ''}
      ${sec('Receipts', d.receipts.length ? `<div class="lg-receipts ${logOpts.rphotos ? '' : 'nophotos'}">${d.receipts.map((r) => `<figure>${logOpts.rphotos ? img(r.photoId, 'lg-rimg') : ''}<figcaption><b>${esc(r.vendor || 'Receipt')}</b><span>${[r.date ? fmtDate(r.date, true) : '', r.category || '', money(r.total)].filter(Boolean).map(esc).join(' · ')}</span></figcaption></figure>`).join('')}</div>` : '')}
    </article>`;
  }).join('');
  return `${cover}${machines}<footer class="lg-foot">${esc(S.settings.garage || 'Garage')} · made with the Garage app · masen.site</footer>`;
}
function vLog(mid) {
  const ms = logMachines(mid);
  const hasArch = !mid && S.machines.some((m) => m.archived);
  const tog = (k, t, d) => `<button class="trow" data-act="log-opt" data-k="${k}"><div class="grow"><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div><span class="switch ${logOpts[k] ? 'on' : ''}"></span></button>`;
  return `<div class="screen logscreen">
    <div class="hdr sticky no-print"><div class="left">${backBtn(mid ? '#/m/' + mid + '/history' : '#/profile')}<div class="h-title sm">${mid ? 'Machine log' : 'Garage log'}</div></div></div>
    <div class="no-print stack">
      <p class="note">${mid ? 'Everything about this machine on clean, printable pages. Handy when you sell it.' : 'Every machine, schedule, service, receipt and note on clean, printable pages.'}</p>
      <details class="logopts"><summary>${icon('settings', 16)} What to include</summary><div class="stack" style="margin-top:8px">
        ${tog('mphotos', 'Machine photos', '')}
        ${tog('rphotos', 'Receipt photos', 'Turn off for a shorter, smaller file')}
        ${hasArch ? tog('archived', 'Archived machines', 'Sold or retired') : ''}
      </div></details>
      <div class="two"><button class="btn primary" data-act="pdf-make" data-id="${mid || ''}">${icon('download', 18)}Save PDF</button><button class="btn secondary" data-act="print">${icon('print', 18)}Print</button></div>
      <div class="sec-title" style="margin-bottom:-4px">Preview</div>
    </div>
    ${ms.length ? `<div class="paper">${logHTML(mid, (id) => urlCache[id])}</div>` : empty('garage', 'Nothing to print yet', 'Add a machine first.')}
  </div>`;
}

/* ---------- real PDF (vector text, tables that split across pages, photos) ---------- */
let pendingPDF = null;
async function photoForPDF(id, max) {
  const b = await getPhotoBlob(id); if (!b) return null;
  try {
    const bmp = window.createImageBitmap ? await createImageBitmap(b) : await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(b); });
    const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
    const sc = Math.min(1, max / Math.max(w0, h0));
    const c = document.createElement('canvas'); c.width = Math.round(w0 * sc); c.height = Math.round(h0 * sc);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return { data: c.toDataURL('image/jpeg', 0.78), w: c.width, h: c.height };
  } catch (e) { return null; }
}
async function makePDF(mid) {
  toast('Building your PDF…');
  try {
    if (!window.jspdf) { await loadScript('vendor/jspdf.umd.min.js'); }
    if (!window.jspdf.jsPDF.API.autoTable) { await loadScript('vendor/jspdf.plugin.autotable.min.js'); }
  } catch (e) { return toast('The PDF tool didn’t load. Connect once, then it works offline'); }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), MX = 40, CW = W - MX * 2;
  const INK = [20, 20, 20], MUTED = [110, 110, 110], LINE = [215, 215, 215];
  const ST_RGB = { over: [200, 30, 30], soon: [190, 120, 0], snoozed: [120, 120, 120], ok: [20, 140, 60] };
  const ms = logMachines(mid);
  const all = ms.map((m) => [m, machineData(m)]);
  const garage = S.settings.garage || 'Garage';
  let y = 0;
  const ensure = (h) => { if (y + h > H - 50) { doc.addPage(); y = 50; } };
  const txt = (t, x, yy, o = {}) => { doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setFontSize(o.size || 10); doc.setTextColor(...(o.color || INK)); doc.text(String(t), x, yy, o.align ? { align: o.align } : undefined); };
  const head = (t) => { ensure(60); y += 14; txt(t.toUpperCase(), MX, y, { bold: true, size: 9, color: MUTED }); doc.setDrawColor(...INK); doc.setLineWidth(1.2); doc.line(MX, y + 5, MX + CW, y + 5); y += 10; };
  const table = (headRow, body, colStyles = {}, statusCol = -1) => {
    doc.autoTable({
      startY: y, head: [headRow], body, margin: { left: MX, right: MX, top: 50, bottom: 50 }, theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.5 }, valign: 'top', overflow: 'linebreak' },
      headStyles: { fontStyle: 'bold', textColor: MUTED, fontSize: 7.5, lineWidth: { bottom: 0.8 }, lineColor: [160, 160, 160] },
      columnStyles: colStyles,
      didParseCell: (h) => { if (h.section === 'body' && h.column.index === statusCol && h.cell.raw && h.cell.raw._st) { h.cell.text = [h.cell.raw.content]; h.cell.styles.textColor = ST_RGB[h.cell.raw._st] || INK; h.cell.styles.fontStyle = 'bold'; } },
    });
    y = doc.lastAutoTable.finalY + 8;
  };
  const statsRow = (pairs) => {
    ensure(48); const bw = CW / pairs.length;
    pairs.forEach(([v, l, red], i) => { const x = MX + i * bw; doc.setFillColor(244, 244, 244); doc.roundedRect(x + (i ? 4 : 0), y, bw - 4, 40, 4, 4, 'F'); txt(v, x + (i ? 12 : 8), y + 19, { bold: true, size: 14, color: red ? ST_RGB.over : INK }); txt(l, x + (i ? 12 : 8), y + 32, { size: 7.5, color: MUTED }); });
    y += 50;
  };

  /* cover */
  doc.setFillColor(12, 12, 12); doc.rect(0, 0, W, 132, 'F');
  txt((mid ? 'MACHINE LOG' : 'GARAGE LOG'), MX, 46, { bold: true, size: 9, color: [18, 255, 84] });
  const title = (mid ? ms[0].name : garage).toUpperCase();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(30); doc.setTextColor(255, 255, 255); doc.text(doc.splitTextToSize(title, CW)[0], MX, 84);
  txt(`${mid ? garage + ' · ' : ''}Made ${fmtDate(todayISO(), true)}`, MX, 108, { size: 10, color: [190, 190, 190] });
  y = 160;
  const nLogs = all.reduce((s, [, d]) => s + d.logs.filter((l) => !l.skipped).length, 0);
  statsRow([...(mid ? [] : [[String(ms.length), ms.length === 1 ? 'machine' : 'machines']]), [String(nLogs), 'services logged'], [String(all.reduce((s, [, d]) => s + d.receipts.length, 0)), 'receipts'], [money(all.reduce((s, [, d]) => s + d.spent, 0)) || '$0', 'spent, all time']]);
  if (!mid && ms.length > 1) {
    head('Machines');
    table(['MACHINE', 'DETAILS', 'READING', 'NEEDS ATTENTION'], all.map(([m, d]) => { const top = d.items.find((x) => x.st.state === 'over' || x.st.state === 'soon'); return [m.name, [m.year, m.make, m.model].filter(Boolean).join(' ') || CATS[m.cat]?.label || '', hasMeter(m) ? fmtN(m.reading, UNIT_LABEL[m.unit]) : '', top ? { content: `${top.it.title} · ${ST_LABEL[top.st.state]}`, _st: top.st.state } : { content: 'All good', _st: 'ok' }]; }), { 0: { fontStyle: 'bold' } }, 3);
  }

  /* one section per machine, each starting on a new page */
  for (let mi = 0; mi < all.length; mi++) {
    const [m, d] = all[mi];
    if (mi > 0 || (!mid && ms.length > 1)) { doc.addPage(); y = 50; } else { y += 10; }
    const ph = logOpts.mphotos && m.photoId ? await photoForPDF(m.photoId, 900) : null;
    let textX = MX, topY = y;
    if (ph) { const bw = 170, bh = 128, s = Math.min(bw / ph.w, bh / ph.h), w = ph.w * s, h = ph.h * s; doc.setFillColor(240, 240, 240); doc.roundedRect(MX, y, bw, bh, 6, 6, 'F'); doc.addImage(ph.data, 'JPEG', MX + (bw - w) / 2, y + (bh - h) / 2, w, h); textX = MX + bw + 18; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...INK);
    const nameLines = doc.splitTextToSize(m.name.toUpperCase(), W - MX - textX); doc.text(nameLines, textX, y + 20); let fy = y + 20 + nameLines.length * 24;
    machineFacts(m).forEach(([k, v]) => { txt(k, textX, fy, { size: 8, color: MUTED }); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...INK); const vl = doc.splitTextToSize(v, W - MX - textX - 92); doc.text(vl, textX + 92, fy); fy += Math.max(13, vl.length * 11.5); });
    y = Math.max(fy, ph ? topY + 128 : fy) + 14;
    statsRow([[String(d.logs.filter((l) => !l.skipped).length), d.logs.filter((l) => !l.skipped).length === 1 ? 'service' : 'services'], [money(d.spent) || '$0', 'spent'], ...(d.mpg ? [[d.mpg.avg.toFixed(1), m.unit === 'km' ? 'km/L' : 'avg mpg']] : []), [String(d.over), 'overdue', d.over > 0]]);
    if (d.items.length) { head('Maintenance schedule'); table(['TASK', 'REPEATS', 'LAST DONE', 'NEXT DUE', 'STATUS'], d.items.map(({ it, st }) => [it.title + (it.notes ? '\n' + it.notes : ''), everyText(it, m), lastDoneText(it, m), nextDueText(it, m, st), { content: ST_LABEL[st.state] || '', _st: st.state }]), { 0: { fontStyle: 'bold', cellWidth: 130 }, 4: { cellWidth: 60 } }, 4); }
    head('Service history');
    if (d.logs.length) {
      const hdr = ['DATE', 'WORK DONE', ...(hasMeter(m) ? [m.unit === 'hrs' ? 'HOURS' : 'ODOMETER'] : []), 'DONE BY', 'COST'];
      table(hdr, d.logs.map((l) => [fmtDate(l.date, true), l.title + (l.skipped ? ' (skipped)' : '') + (l.receiptIds && l.receiptIds.length ? ' · receipt' : '') + (l.notes ? '\n' + l.notes : ''), ...(hasMeter(m) ? [l.reading != null ? fmtN(l.reading, UNIT_LABEL[m.unit]) : ''] : []), l.shop || (l.skipped ? '' : 'DIY'), money(l.cost)]), { 0: { cellWidth: 70 }, [hdr.length - 1]: { halign: 'right', cellWidth: 60 } });
    } else { ensure(20); txt('No services logged yet.', MX, y + 10, { color: MUTED, size: 9 }); y += 22; }
    if (d.fuel.length) { head('Fuel log'); table(['DATE', 'ODOMETER', m.unit === 'km' ? 'LITERS' : 'GALLONS', m.unit === 'km' ? 'KM/L' : 'MPG', 'COST'], d.fuel.map((f) => [fmtDate(f.date, true), f.reading ? fmtN(f.reading, UNIT_LABEL[m.unit]) : '', String(f.gallons ?? ''), f.mpg ? f.mpg.toFixed(1) : '', money(f.total)]), { 4: { halign: 'right' } }); }
    if (d.specs.length) { head('Specs & part numbers'); table(['ITEM', 'SPEC / PART #'], d.specs, { 0: { cellWidth: 150, textColor: MUTED } }); }
    if (d.warranties.length) { head('Warranties'); table(['PROVIDER', 'COVERAGE', 'DATES', 'POLICY / CONTACT'], d.warranties.map((w) => [w.provider || 'Warranty', w.coverage || '', [w.start ? fmtDate(w.start, true) : '', w.end ? fmtDate(w.end, true) : ''].filter(Boolean).join(' – ') + (w.limit ? ` or ${fmtN(w.limit, UNIT_LABEL[m.unit])}` : '') + (w.end && daysBetween(todayISO(), w.end) < 0 ? ' (expired)' : ''), [w.policy, w.notes].filter(Boolean).join(' · ')]), { 0: { fontStyle: 'bold' } }); }
    if (d.notes.length) { head('Notes'); table(['DATE', 'NOTE'], d.notes.map((n) => [fmtDate(n.date, true) + (n.pinned ? '\nPinned' : ''), n.body + (n.itemId && I(n.itemId) ? `\n(${I(n.itemId).title})` : '')]), { 0: { cellWidth: 80 } }); }
    if ((m.recalls || []).length) { head('Safety recalls (NHTSA)'); table(['COMPONENT', 'SUMMARY', 'FIX'], m.recalls.map((r) => [`${r.component || 'Recall'}\n${r.campaign || ''} ${r.date || ''}`, r.summary || '', r.remedy || '']), { 0: { cellWidth: 120, fontStyle: 'bold' } }); }
    if (d.receipts.length) {
      head('Receipts');
      if (!logOpts.rphotos) table(['STORE', 'DATE', 'CATEGORY', 'TOTAL'], d.receipts.map((r) => [r.vendor || 'Receipt', r.date ? fmtDate(r.date, true) : '', r.category || '', money(r.total)]), { 3: { halign: 'right' } });
      else {
        const COLS = 3, GAP = 14, colW = (CW - GAP * (COLS - 1)) / COLS, maxH = 260;
        let col = 0, rowH = 0;
        for (const r of d.receipts) {
          const p = r.photoId ? await photoForPDF(r.photoId, 1100) : null;
          const s = p ? Math.min(colW / p.w, maxH / p.h) : 0, iw = p ? p.w * s : 0, ih = p ? p.h * s : 0;
          const blockH = (p ? ih + 8 : 0) + 30;
          if (col === 0) ensure(blockH); else if (y + blockH > H - 50) { col = 0; y += rowH + 12; rowH = 0; ensure(blockH); }
          const x = MX + col * (colW + GAP);
          if (p) { doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.rect(x, y, iw, ih); doc.addImage(p.data, 'JPEG', x, y, iw, ih); }
          const cy = y + (p ? ih + 14 : 10);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(r.vendor || 'Receipt', colW)[0], x, cy);
          txt([r.date ? fmtDate(r.date, true) : '', r.category || '', money(r.total)].filter(Boolean).join(' · '), x, cy + 12, { size: 8, color: MUTED });
          rowH = Math.max(rowH, blockH);
          if (col === COLS - 1) { col = 0; y += rowH + 12; rowH = 0; } else col++;
        }
        if (col > 0) y += rowH + 12;
      }
    }
  }
  /* footer on every page */
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); txt(`${garage} · ${mid ? ms[0].name + ' · ' : ''}${fmtDate(todayISO(), true)}`, MX, H - 24, { size: 7.5, color: MUTED }); txt(`Page ${i} of ${n}`, W - MX, H - 24, { size: 7.5, color: MUTED, align: 'right' }); }
  const base = (mid ? ms[0].name : garage).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'garage';
  const name = `${base}-log-${todayISO()}.pdf`;
  const blob = doc.output('blob');
  let file; try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) { file = blob; file.name = name; }
  pendingPDF = file;
  const t = $('.toast'); if (t) t.remove();
  sheet(`${sheetHead('PDF ready')}
    <div class="card dark stack"><div class="row between"><span class="muted">Pages</span><b>${n}</b></div><div class="row between"><span class="muted">Size</span><b>${(blob.size / 1048576).toFixed(1)} MB</b></div></div>
    <p class="note" style="margin:0">Save it to Files, print it, or send it with Messages or email.</p>
    <div class="sheet-actions"><button class="btn primary" data-act="pdf-save">${icon('share', 18)}Save or share PDF</button><button class="btn text" data-act="pdf-open">Just open it</button></div>`);
}
async function sharePDF() {
  const f = pendingPDF; if (!f) return;
  if (navigator.canShare && navigator.share) {
    try { if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: f.name }); closeSheet(); return; } }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  download(f.name, f); closeSheet(); toast('PDF saved to Downloads');
}

/* ======================= menus (top-right ⋯ is always a menu) ======================= */
const mrowBtn = (act, ic, t, d) => `<button class="lrow" ${act}><div class="ibox">${icon(ic, 18)}</div><div class="grow"><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div></button>`;
function openGarageMenu() {
  sheet(`${sheetHead(S.settings.garage || 'Garage')}<div class="group">
    ${mrowBtn('data-act="go-close" data-to="#/add"', 'plus', 'Add a machine', 'Truck, mower, generator, anything')}
    ${S.machines.length ? mrowBtn('data-act="go-close" data-to="#/log"', 'print', 'Print or save garage log', 'PDF with every machine, photo and receipt') : ''}
    ${S.machines.length ? mrowBtn('data-act="backup-now"', 'save', 'Save a backup file', S.settings.lastBackup ? 'Last one ' + fmtDate(S.settings.lastBackup, true) : 'Not backed up yet') : ''}
    ${mrowBtn('data-act="rename-garage-close"', 'edit', 'Rename garage', '')}
  </div>`);
}
function openScheduleMenu() {
  sheet(`${sheetHead('Schedule')}<div class="group">
    ${mrowBtn('data-act="ics-all-close"', 'calendar', 'Add due dates to my calendar', 'Apple, Google or Outlook')}
    ${S.machines.length ? mrowBtn('data-act="go-close" data-to="#/log"', 'print', 'Print or save garage log', '') : ''}
  </div>`);
}

/* ======================= actions (merged into app.js's ACT) ======================= */
const MORE_ACT = {
  'garage-menu': () => openGarageMenu(),
  'schedule-menu': () => openScheduleMenu(),
  'rename-garage-close': () => { closeSheet(); setTimeout(() => ACT['rename-garage'](), 60); },
  'ics-all-close': () => { closeSheet(); ACT['ics-all'](); },
  'csv-close': (el) => { closeSheet(); downloadCSV(el.dataset.id); },
  'auto-backup': () => openAutoBackup(),
  'snap-open': (el) => openSnap(el.dataset.id),
  'snap-restore': (el) => restoreSnap(el.dataset.id),
  'log-opt': (el) => { const k = el.dataset.k; logOpts[k] = !logOpts[k]; const open = !!$('.logopts[open]'); render(); if (open) { const d = $('.logopts'); if (d) d.open = true; } },
  'pdf-make': (el) => makePDF(el.dataset.id || null),
  'pdf-save': () => sharePDF(),
  'pdf-open': () => { if (pendingPDF) { const u = URL.createObjectURL(pendingPDF); window.open(u, '_blank') || (location.href = u); closeSheet(); } },
  'fb-type': (el) => { keepFb(); fb.type = el.dataset.v; document.querySelectorAll('.fbseg button').forEach((b) => b.classList.toggle('on', b === el)); const box = $('#fb_stepsbox'); if (box) box.hidden = fb.type !== 'Bug'; const m = $('#fb_msg'); if (m) m.placeholder = FB_PH[fb.type]; },
  'fb-device': () => { fb.device = !fb.device; const s = $('#fb_dev'); if (s) s.classList.toggle('on', fb.device); },
  'fb-send': (el) => sendFeedback(el),
  'fb-again': () => { fb = { type: 'Bug', device: true, sent: false }; render(); },
};
