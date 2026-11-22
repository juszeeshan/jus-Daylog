/* Jus Daylog: vanilla JS client. Local-first. Works as a demo with no backend (empty API_URL). */
(() => {
'use strict';

const L = window.JusLogic;
const { addDays, parseISO, isoOf, daysInMonth, starsOf } = L;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CFG = window.APP_CONFIG || {};
const API = String(CFG.API_URL || '').trim();
const DEMO = !API;
const KEY = 'jus-daylog-v1';
const EDIT_DAYS = 7;
const THEMES = ['auto', 'ocean', 'sunrise', 'forest', 'lavender', 'midnight', 'amoled'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DEFAULT_NAMES = ['Exercise', '2-litre water', '6-hour sleep on time', 'Skill development hour', 'Prayer',
  'Read 20 minutes', 'Healthy meals', 'No junk food', 'Journal', 'Plan tomorrow'];
const defaultTasks = () => DEFAULT_NAMES.map((name, i) => ({ id: 't' + (i + 1), name }));
const TABS = [['wheel', 'Wheel'], ['month', 'Month'], ['tasks', 'Tasks'], ['friends', 'Friends'], ['settings', 'Settings']];
const IS_DAYLOG = location.pathname.includes('/daylog');
const ROOT_URL = IS_DAYLOG ? '../' : './';

/* ---------- state ---------- */
const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'; } catch (e) { return 'Asia/Kolkata'; } };
function freshState() {
  const tz = deviceTz();
  return { token: '', dirty: [], tasks: defaultTasks(), logs: {},
    profile: { name: 'Guest', identifier: '', type: 'demo', email: '', tz, startDate: L.todayIn(tz), cycleStartMonth: 7,
      reminders: { enabled: false, times: [] }, username: '', goalStars: 3, discoverable: false, theme: 'auto' } };
}
function loadState() {
  const base = freshState();
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.profile && Array.isArray(s.tasks) && s.tasks.length === 10) {
      return Object.assign(base, { token: s.token || '', tasks: s.tasks, logs: s.logs || {}, dirty: Array.isArray(s.dirty) ? s.dirty : [],
        profile: Object.assign(base.profile, s.profile) });
    }
  } catch (e) { /* ignore corrupt storage */ }
  return base;
}
let state = loadState();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage may be blocked */ } };

let tCache = { at: 0, v: '' };
function today() { const n = Date.now(); if (n - tCache.at > 1000) tCache = { at: n, v: L.todayIn(state.profile.tz) }; return tCache.v; }
const startDate = () => state.profile.startDate || today();
const goal = () => Math.min(5, Math.max(1, Number(state.profile.goalStars) || 3));
const doneOf = (d) => (state.logs[d] || []).length;
const starsFor = (d) => starsOf(doneOf(d), state.tasks.length);
const editable = (d) => d <= today() && d >= addDays(today(), -(EDIT_DAYS - 1)) && d >= startDate();
const myStreak = () => L.streak(state.logs, goal(), today());

const ui = { tab: IS_DAYLOG ? 'daylog' : 'wheel', selected: today(), yearOffset: 0, authMode: 'login', resetStep: 0, resetId: '',
  friends: null, matches: [], addPrefill: '', busy: false, deferredInstall: null };

let toastT;
function toast(s) {
  const el = $('#toast'); if (!el) return;
  el.textContent = s; el.classList.remove('hidden');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hidden'), 2600);
}

/* ---------- theme ---------- */
function applyTheme(t, fromUser) {
  const th = THEMES.includes(t) ? t : 'auto';
  state.profile.theme = th;
  document.documentElement.dataset.theme = th;
  try { localStorage.setItem('jd-theme', th); } catch (e) { /* ignore */ }
  const meta = $('meta[name="theme-color"]');
  if (meta) { const c = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); if (c) meta.content = c; }
  persist();
  if (fromUser) queue('settings');
}

/* ---------- network & sync ---------- */
async function api(action, data) {
  if (DEMO) return { ok: true, demo: true };
  try {
    // Plain-text body keeps this a "simple" CORS request (Apps Script web apps do not answer preflights).
    const res = await fetch(API, { method: 'POST', body: JSON.stringify(Object.assign({ action, token: state.token, tz: state.profile.tz }, data || {})) });
    return await res.json();
  } catch (e) { return { ok: false, error: 'Cannot reach the server. Check your internet.', code: 'net' }; }
}

let syncing = false, syncTimer = null;
function setStatus() {
  const el = $('#sync'); if (!el) return;
  el.textContent = DEMO ? 'Demo mode · this device only' : !state.token ? '' : !navigator.onLine ? (state.dirty.length ? 'Offline · will sync' : 'Offline')
    : syncing || state.dirty.length ? 'Saving…' : 'Synced ✓';
}
function queue(item) {
  if (!state.dirty.includes(item)) state.dirty.push(item);
  persist(); setStatus();
  clearTimeout(syncTimer); syncTimer = setTimeout(sync, 600);
}
const settingsPayload = () => { const p = state.profile; return { name: p.name, email: p.email, startDate: p.startDate, cycleStartMonth: p.cycleStartMonth,
  tz: p.tz, goalStars: p.goalStars, discoverable: p.discoverable, theme: p.theme, reminders: p.reminders }; };

async function sync() {
  if (DEMO || !state.token || syncing || !navigator.onLine) { setStatus(); return; }
  syncing = true; setStatus();
  let retry = false;
  for (const item of [...state.dirty]) {
    const kind = item.split(':')[0], key = item.slice(kind.length + 1);
    let payload, r;
    if (kind === 'day') { payload = { date: key, done: state.logs[key] || [] }; r = await api('saveDay', payload); }
    else if (kind === 'tasks') { payload = { tasks: state.tasks }; r = await api('saveTasks', payload); }
    else if (kind === 'settings') { payload = { settings: settingsPayload() }; r = await api('saveSettings', payload); }
    else { state.dirty = state.dirty.filter((x) => x !== item); continue; }
    const now = kind === 'day' ? { date: key, done: state.logs[key] || [] } : kind === 'tasks' ? { tasks: state.tasks } : { settings: settingsPayload() };
    if (r.ok) { if (JSON.stringify(now) === JSON.stringify(payload)) state.dirty = state.dirty.filter((x) => x !== item); else retry = true; }
    else if (r.code === 'auth') { state.token = ''; syncing = false; persist(); render(); toast('Session expired. Please sign in again.'); return; }
    else if (r.code === 'invalid') { state.dirty = state.dirty.filter((x) => x !== item); toast(r.error || 'Could not save a change'); }
    else { retry = true; break; }  // network/server trouble: keep the queue and try later
  }
  syncing = false; persist(); setStatus();
  if (retry || state.dirty.length) setTimeout(sync, 8000);
}
window.addEventListener('online', () => { sync(); refreshFromServer(); });
window.addEventListener('offline', setStatus);

function applyServerState(st) {
  const logs = Object.assign({}, st.logs || {});
  state.dirty.filter((x) => x.startsWith('day:')).forEach((x) => { const d = x.slice(4); logs[d] = state.logs[d] || []; });
  state.logs = logs;
  if (!state.dirty.includes('tasks') && st.tasks && st.tasks.length === 10) state.tasks = st.tasks;
  const server = Object.assign({}, freshState().profile, st.profile);
  state.profile = state.dirty.includes('settings') ? Object.assign(server, state.profile, { username: server.username, identifier: server.identifier, type: server.type }) : server;
  tCache.at = 0; persist();
}
async function refreshFromServer() {
  if (DEMO || !state.token || !navigator.onLine) return;
  const r = await api('getState');
  if (r.ok) { applyServerState(r); applyTheme(state.profile.theme, false); render(); }
  else if (r.code === 'auth') { state.token = ''; persist(); render(); }
}

/* ---------- wheel ---------- */
const R_OUT = 270, R_IN = 72, ARC = 330, GAP = 0.5, C = 300, LABEL_ANG = -105;
const f2 = (n) => n.toFixed(2);
const polar = (r, deg) => { const a = deg * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
const arcPath = (r, a1, a2) => { const [x1, y1] = polar(r, a1), [x2, y2] = polar(r, a2); return `M${f2(x1)} ${f2(y1)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x2)} ${f2(y2)}`; };
const sectorPath = (rO, rI, a1, a2) => {
  const p1 = polar(rO, a1), p2 = polar(rO, a2), p3 = polar(rI, a2), p4 = polar(rI, a1);
  return `M${f2(p1[0])} ${f2(p1[1])}A${rO} ${rO} 0 0 1 ${f2(p2[0])} ${f2(p2[1])}L${f2(p3[0])} ${f2(p3[1])}A${rI} ${rI} 0 0 0 ${f2(p4[0])} ${f2(p4[1])}Z`;
};
const startMonth = () => Number(state.profile.cycleStartMonth) || 7;
const cycleYear = () => L.cycleStartYear(today(), startMonth()) + ui.yearOffset;
const cycleLabel = () => { const y = cycleYear(); return startMonth() === 1 ? String(y) : `${y}–${String(y + 1).slice(2)}`; };

function lineClass(d, id, T, start) {
  if (d > T) return 'f';
  if ((state.logs[d] || []).includes(id)) return 'g';
  if (d < start) return 'z';
  return d === T ? 'p' : 'r';
}

function wheelSvg() {
  const T = today(), start = startDate(), ids = state.tasks.map((t) => t.id), n = ids.length, cy = cycleYear(), sm = startMonth();
  const ringW = (R_OUT - R_IN) / 12, pad = 1, lw = (ringW - 2 * pad) / n, dw = ARC / 31;
  let o = `<svg class="wheel" viewBox="-6 -6 612 612" role="img" aria-label="Habit wheel ${esc(cycleLabel())}">`;
  const where = {};
  for (let i = 0; i < 12; i++) {
    const { y, m } = L.ringMonth(cy, sm, i), days = daysInMonth(y, m), rOut = R_OUT - i * ringW;
    const [lx, ly] = polar(rOut - ringW / 2, LABEL_ANG);
    o += `<text class="mlabel" x="${f2(lx)}" y="${f2(ly)}" transform="rotate(${LABEL_ANG + 90} ${f2(lx)} ${f2(ly)})">${MON[m - 1]}</text>`;
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${L.p2(m)}-${L.p2(d)}`, a1 = -90 + (d - 1) * dw + GAP / 2, a2 = -90 + d * dw - GAP / 2;
      where[ds] = { rOut, a1: a1 - GAP / 2, a2: a2 + GAP / 2 };
      o += `<g class="cell" data-pick="${ds}" stroke-width="${(lw * 0.88).toFixed(2)}"><path class="hit" d="${arcPath(rOut - ringW / 2, a1, a2)}" stroke-width="${f2(ringW)}"/>`;
      for (let k = 0; k < n; k++) o += `<path class="${lineClass(ds, ids[k], T, start)}" d="${arcPath(rOut - pad - lw * (k + 0.5), a1, a2)}"/>`;
      o += '</g>';
    }
  }
  for (let d = 1; d <= 31; d++) { const [x, y] = polar(R_OUT + 11, -90 + (d - 0.5) * dw); o += `<text class="dlabel" x="${f2(x)}" y="${f2(y)}">${d}</text>`; }
  const ring = (ds, cls) => { const w = where[ds]; return w ? `<path class="${cls}" d="${sectorPath(w.rOut, w.rOut - ringW, w.a1, w.a2)}"/>` : ''; };
  o += ring(T, 'outline-today');
  if (ui.selected !== T) o += ring(ui.selected, 'outline-sel');
  const cnt = doneOf(T), st = starsOf(cnt, n);
  o += `<circle class="hub" cx="${C}" cy="${C}" r="${R_IN - 6}"/><text class="hubnum" x="${C}" y="${C - 2}">${cnt}/${n}</text>`
    + `<text class="hubstars" x="${C}" y="${C + 20}">${'★'.repeat(st)}${'☆'.repeat(5 - st)}</text></svg>`;
  return o;
}

/* ---------- views ---------- */
const starsHtml = (s) => `<span class="stars" aria-label="${s} of 5 stars">${'★'.repeat(s)}<span class="off">${'★'.repeat(5 - s)}</span></span>`;
const LEGEND = '<div class="legend"><span style="--c:var(--green)">Done</span><span style="--c:var(--red)">Missed</span><span style="--c:var(--amber)">Today, pending</span><span style="--c:var(--grey)">Upcoming / before start</span></div>';

function cycleStats() {
  const T = today(), r = L.cycleRange(cycleYear(), startMonth());
  const from = r.start > startDate() ? r.start : startDate(), to = r.end < T ? r.end : T;
  let five = 0;
  Object.keys(state.logs).forEach((d) => { if (d >= r.start && d <= r.end && starsFor(d) === 5) five++; });
  return { pct: L.completionPct(state.logs, from, to, state.tasks.length), five };
}

function todayCard() {
  const T = today(), done = state.logs[T] || [], n = state.tasks.length;
  return `<section class="card daily-task-card"><div class="top"><div><b>Today's To-Do</b><div class="muted">${done.length} of ${n} completed · ${n - done.length} remaining</div></div>`
    + `<button class="btn secondary small" data-tab="tasks">Edit tasks</button></div><div class="progress"><i style="width:${done.length / n * 100}%"></i></div>`
    + `<div class="daily-task-list">${state.tasks.map((t) => `<label class="day-row compact-task"><input class="task-check" type="checkbox" data-task="${t.id}" data-day="${T}" ${done.includes(t.id) ? 'checked' : ''} ${editable(T) ? '' : 'disabled'}><span class="task-name">${esc(t.name)}</span></label>`).join('')}</div></section>`;
}

function overviewCard() {
  const s = cycleStats();
  return `<section class="card annual-overview"><b>Annual progress</b><div class="annual-number">${s.pct}%</div><div class="muted">Task completion</div>`
    + `<div class="stat"><b>${myStreak()} 🔥</b><span class="muted">Current star streak</span></div>`
    + `<div class="stat"><b>${L.bestStreak(state.logs, goal())} 🏆</b><span class="muted">Best streak</span></div>`
    + `<div class="stat"><b>${s.five} ⭐</b><span class="muted">5-star days</span></div>`
    + `<div class="muted" style="font-size:12px">Daily goal: ${goal()} ★ = ${Math.ceil(goal() * state.tasks.length / 5)} tasks</div></section>`;
}

function annualSummaries() {
  const T = today(), start = startDate(), cy = cycleYear(), sm = startMonth(), n = state.tasks.length;
  const months = Array.from({ length: 12 }, (_, i) => {
    const { y, m } = L.ringMonth(cy, sm, i), first = `${y}-${L.p2(m)}-01`, last = `${y}-${L.p2(m)}-${L.p2(daysInMonth(y, m))}`;
    const from = first > start ? first : start, to = last < T ? last : T;
    const pct = L.completionPct(state.logs, from, to, n);
    return `<div class="summary-month"><span>${MON[m - 1]}</span><b>${pct}%</b><i><em style="width:${pct}%"></em></i></div>`;
  }).join('');
  const cs = L.cycleRange(cy, sm).start;
  const weeks = Array.from({ length: 52 }, (_, i) => {
    let cnt = 0, any = false;
    for (let j = 0; j < 7; j++) { const d = addDays(cs, i * 7 + j); if (d <= T && d >= start) { cnt += doneOf(d); any = true; } }
    return `<div class="week-cell" title="Week ${i + 1}: ${cnt} tasks done" style="opacity:${any ? Math.max(0.25, Math.min(1, cnt / (7 * n))) : 0.12}">${i + 1}</div>`;
  }).join('');
  return `<section class="card"><div class="top"><b>Monthly habits</b><span class="muted">${esc(cycleLabel())}</span></div><div class="month-summary">${months}</div>`
    + `<div class="top" style="margin-top:16px"><b>Weekly habits</b><span class="muted">52 weeks</span></div><div class="week-summary">${weeks}</div>`
    + '<div class="muted" style="font-size:11px;margin-top:6px">Darker squares = more tasks completed that week.</div></section>';
}

function panel(d) {
  const done = state.logs[d] || [], n = state.tasks.length, T = today(), ed = editable(d), start = startDate();
  const label = parseISO(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  let note;
  if (d > T) note = 'This day has not started yet.';
  else if (d < start) note = 'Before your tracking start date.';
  else if (d < T) note = `<span class="miss">${n - done.length} missed</span>`;
  else note = `Goal ${goal()}★ = ${Math.ceil(goal() * n / 5)} tasks`;
  return `<section class="card" id="day-panel"><div class="top"><div><b>${esc(label)}${d === T ? ' · Today' : ''}</b><div class="muted">${starsHtml(starsFor(d))} · ${ed ? 'Editable' : 'Read only'}</div></div><span class="pill">${done.length}/${n}</span></div>`
    + `<div class="progress"><i style="width:${done.length / n * 100}%"></i></div><p class="muted">${note}${!ed && d <= T && d >= start ? ` · only the last ${EDIT_DAYS} days can be edited` : ''}</p>`
    + state.tasks.map((t) => `<label class="day-row"><input class="task-check" type="checkbox" data-task="${t.id}" ${done.includes(t.id) ? 'checked' : ''} ${ed ? '' : 'disabled'}><span class="task-name">${esc(t.name)}</span><span style="color:${done.includes(t.id) ? 'var(--green)' : 'var(--muted)'}">${done.includes(t.id) ? '✓' : '○'}</span></label>`).join('')
    + '<div class="top" style="margin-top:12px"><button class="btn secondary small" data-shift="-1">← Previous</button><button class="btn secondary small" data-shift="1">Next →</button></div></section>';
}

function wheelView() {
  return `<div class="top"><h2>Annual planner</h2><div class="cyclenav"><button class="btn secondary small" data-year="-1" aria-label="Previous year">‹</button> <b>${esc(cycleLabel())}</b> <button class="btn secondary small" data-year="1" aria-label="Next year">›</button></div></div>`
    + `<div class="dashboard-top">${todayCard()}${overviewCard()}</div><section class="card"><div class="wheel-wrap">${wheelSvg()}</div>${LEGEND}<p class="muted" style="text-align:center;font-size:12px;margin:6px 0 0">Each day is 10 lines (outermost = task 1). Tap a day to open it.</p></section>`
    + annualSummaries() + panel(ui.selected);
}

function monthView() {
  const d = parseISO(ui.selected), y = d.getFullYear(), m = d.getMonth(), T = today(), start = startDate();
  const pad = new Date(y, m, 1).getDay(), n = daysInMonth(y, m + 1);
  let cells = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<div class="muted" style="text-align:center">${x}</div>`).join('') + '<div></div>'.repeat(pad);
  for (let i = 1; i <= n; i++) {
    const ds = `${y}-${L.p2(m + 1)}-${L.p2(i)}`;
    cells += `<button class="month-day ${ds === ui.selected ? 'sel' : ''} ${ds === T ? 'today' : ''}" data-select="${ds}"><b>${i}</b><div class="bars">${state.tasks.map((t) => `<i class="${lineClass(ds, t.id, T, start)}"></i>`).join('')}</div></button>`;
  }
  return `<div class="top"><button class="btn secondary small" data-month="-1" aria-label="Previous month">‹</button><h2>${d.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h2><button class="btn secondary small" data-month="1" aria-label="Next month">›</button></div><div class="month-grid">${cells}</div>${LEGEND}${panel(ui.selected)}`;
}

function tasksView() {
  return `<h2>Your 10 daily tasks</h2><p class="muted">Rename any task. Your history stays attached to its slot.</p><section class="card">${state.tasks.map((t, i) => `<label class="field"><span>Task ${i + 1}</span><input maxlength="40" data-rename="${t.id}" value="${esc(t.name)}"></label>`).join('')}</section>`;
}

/* friends */
function weekRow(w) { return `<div class="wk">${w.map((x) => `<i class="${x.met ? 'g' : x.stars > 0 ? 'p' : 'r'}" title="${esc(x.date)}">${x.stars}</i>`).join('')}</div>`; }
function friendRow(f, mine) {
  return `<div class="friend ${mine ? 'me' : ''}"><div class="fmain"><b>${esc(f.name || f.username)}${mine ? ' (you)' : ''}</b><div class="muted">${f.username ? '@' + esc(f.username) : 'no username yet'} · goal ${f.goal}★</div></div>`
    + `<div class="fstat"><span title="Star streak">🔥 ${f.streak}</span>${f.duo !== undefined ? `<span title="Days you both hit your goals">🤝 ${f.duo}</span>` : ''}${mine ? '' : `<button class="btn secondary small" data-friend-remove="${esc(f.username)}" aria-label="Remove friend">×</button>`}</div>${weekRow(f.stars7)}</div>`;
}
function friendsView() {
  if (DEMO) return '<h2>Friends & streaks</h2><section class="card"><p class="muted">Friends and shared streaks need the Google backend. Put your Apps Script URL in config.js to turn this on.</p></section>';
  const p = state.profile, F = ui.friends;
  let h = '<h2>Friends & streaks</h2>';
  if (!p.username) h += '<section class="card"><b>Pick your username</b><p class="muted">Friends find you by it. 3–20 letters, numbers or underscore.</p><form id="username-form" class="inline"><input name="username" maxlength="20" autocapitalize="none" autocomplete="off" placeholder="e.g. ravi_24" required><button class="btn">Save</button></form></section>';
  else {
    h += `<section class="card"><div class="top"><div><b>@${esc(p.username)}</b><div class="muted">Goal ${goal()}★ = ${Math.ceil(goal() * state.tasks.length / 5)} tasks a day</div></div><button class="btn secondary small" id="invite">Invite</button></div></section>`;
    h += `<section class="card"><b>Add a friend</b><form id="friend-form" class="inline"><input name="username" minlength="3" maxlength="20" pattern="[a-zA-Z0-9_@]+" placeholder="their username" value="${esc(ui.addPrefill)}" autocapitalize="none" autocomplete="off" required><button class="btn">Send request</button></form>`
      + `<button class="btn secondary" id="contacts" style="margin-top:8px">📇 Find friends from my contacts</button><p class="muted" style="font-size:12px">Contact matching works in supported browsers (Chrome on Android). Only the contacts you pick are sent.</p>`
      + ui.matches.map((m) => `<div class="friend"><div><b>${esc(m.name)}</b><div class="muted">@${esc(m.username)}</div></div><button class="btn small" data-friend-add="${esc(m.username)}">Add</button></div>`).join('') + '</section>';
  }
  if (!F) return h + '<section class="card"><p class="muted">Loading friends…</p></section>';
  if (F.incoming.length) h += '<section class="card"><b>Requests</b>' + F.incoming.map((x) => `<div class="friend"><div><b>${esc(x.name)}</b><div class="muted">@${esc(x.username)} wants to be friends</div></div><div class="fstat"><button class="btn small" data-friend-accept="${esc(x.username)}">Accept</button><button class="btn secondary small" data-friend-decline="${esc(x.username)}">Decline</button></div></div>`).join('') + '</section>';
  const me = { name: p.name, username: p.username, goal: goal(), streak: myStreak(), stars7: Array.from({ length: 7 }, (_, i) => { const d = addDays(today(), i - 6), s = starsFor(d); return { date: d, stars: s, met: s >= goal() }; }) };
  const rows = [me].concat(F.friends).sort((a, b) => b.streak - a.streak);
  h += `<section class="card"><b>Streak board</b><p class="muted" style="font-size:12px;margin:2px 0 6px">🔥 star streak · 🤝 days you both hit your goals · last 7 days in stars</p>${rows.map((r) => friendRow(r, r === me)).join('')}${rows.length === 1 ? '<p class="muted">No friends yet. Add one above or tap Invite.</p>' : ''}<p class="muted" style="font-size:12px">Friends only see your name, username, goal, streak and star counts, never your task names.</p></section>`;
  if (F.outgoing.length) h += '<section class="card"><b>Sent requests</b>' + F.outgoing.map((x) => `<div class="friend"><div><b>${esc(x.name)}</b><div class="muted">@${esc(x.username)} · waiting</div></div><button class="btn secondary small" data-friend-remove="${esc(x.username)}">Cancel</button></div>`).join('') + '</section>';
  return h;
}
async function loadFriends() {
  if (DEMO || !state.token) return;
  const r = await api('friends');
  if (r.ok) ui.friends = { friends: r.friends || [], incoming: r.incoming || [], outgoing: r.outgoing || [] };
  else { if (!ui.friends) ui.friends = { friends: [], incoming: [], outgoing: [] }; if (r.code === 'auth') { state.token = ''; persist(); render(); return; } toast(r.error); }
  if (ui.tab === 'friends') render();
}
async function friendAction(action, username, okMsg) {
  const r = await api(action, Object.assign({ username }, action === 'friendRespond' ? { accept: okMsg === 'Friend added' } : {}));
  if (!r.ok) { toast(r.error || 'Something went wrong'); return; }
  toast(r.accepted ? 'You are now friends! 🎉' : okMsg);
  ui.addPrefill = ''; ui.matches = ui.matches.filter((m) => m.username !== username);
  await loadFriends(); render(true);
}

function settingsView() {
  const p = state.profile, r = p.reminders || { enabled: false, times: [] }, n = state.tasks.length;
  const notif = 'Notification' in window ? Notification.permission : 'unsupported', devTz = deviceTz();
  return `<h2>Settings</h2><section class="card"><b>Theme</b><div class="swatches" style="margin-top:8px">${THEMES.map((t) => `<button class="swatch" data-theme="${t}" aria-pressed="${p.theme === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></section>`
    + `<section class="card"><label class="field">Name<input id="p-name" maxlength="60" value="${esc(p.name)}"></label><label class="field">Email (for reminders)<input id="p-email" type="email" value="${esc(p.email || '')}" placeholder="you@example.com"></label>`
    + (DEMO ? '' : `<label class="field">Username<input id="p-username" value="${esc(p.username || '')}" maxlength="20" autocapitalize="none"></label>`)
    + `<label class="field">Daily star goal<select id="p-goal">${[1, 2, 3, 4, 5].map((g) => `<option value="${g}" ${goal() === g ? 'selected' : ''}>${g} ★ = ${Math.ceil(g * n / 5)} of ${n} tasks</option>`).join('')}</select></label>`
    + `<label class="field">Tracking starts<input type="date" id="p-start" value="${esc(p.startDate)}" max="${today()}"></label>`
    + `<label class="field">Year starts in<select id="p-month">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${startMonth() === i + 1 ? 'selected' : ''}>${new Date(2020, i, 1).toLocaleString(undefined, { month: 'long' })}</option>`).join('')}</select></label>`
    + `<label class="day-row"><input id="p-discover" type="checkbox" ${p.discoverable ? 'checked' : ''}> Let people who have my number/email in their contacts find me</label>`
    + `<label class="day-row"><input id="p-rem" type="checkbox" ${r.enabled ? 'checked' : ''}> Remind me about unfinished tasks</label>`
    + `<label class="field">Reminder times (up to 3, 24-hour HH:mm, comma separated)<input id="p-times" value="${esc((r.times || []).join(', '))}" placeholder="08:00, 20:30"></label>`
    + `<p class="muted" style="font-size:12px">Time zone: ${esc(p.tz)}${p.tz !== devTz ? ` · <button class="link" id="use-device-tz">use this device (${esc(devTz)})</button>` : ''}</p>`
    + `<button class="btn" id="save-settings" style="width:100%">Save settings</button></section>`
    + `<section class="card"><b>Reminders</b><p class="muted">${DEMO ? 'Email reminders need the Google backend. ' : 'Email reminders are sent by your Google script even when the app is closed. '}Phone notifications only fire while the app is open or running in the background; web apps cannot run timers once fully closed.</p>`
    + `<button class="btn secondary" id="notif" ${notif === 'unsupported' ? 'disabled' : ''}>${notif === 'granted' ? '🔔 Phone notifications on' : notif === 'denied' ? '🔕 Blocked in browser settings' : 'Enable phone notifications'}</button></section>`
    + `<section class="card"><b>Account</b><p class="muted">${esc(p.identifier || 'Local demo account')}</p><div class="stack"><button class="btn secondary" id="install">Install app</button>${DEMO ? '<button class="btn secondary" id="reset-demo">Reset demo data</button>' : '<button class="btn secondary" id="logout">Log out</button>'}</div><p class="muted" style="font-size:12px">iPhone: Share → Add to Home Screen. Android: browser menu → Install app.</p></section>`;
}

function daylogView() {
  const T = today(), n = state.tasks.length, d = doneOf(T), s = starsOf(d, n);
  return `<section class="card" style="text-align:center"><h2 style="margin:0">Today</h2><div style="font-size:42px;font-weight:800">${d}/${n}</div><div style="font-size:24px">${starsHtml(s)}</div>`
    + `<p>Goal ${goal()}★ · 🔥 ${myStreak()} day streak</p><div class="progress"><i style="width:${d / n * 100}%"></i></div></section>`
    + `<section class="card"><b>Last 7 days</b><div class="day-strip" style="margin-top:8px">${Array.from({ length: 7 }, (_, i) => { const x = addDays(T, i - 6); return `<button class="chip ${x === ui.selected ? 'sel' : ''}" data-select="${x}"><b>${starsFor(x)}★</b>${x.slice(8)}/${x.slice(5, 7)}</button>`; }).join('')}</div></section>`
    + panel(ui.selected) + `<p style="text-align:center"><a class="link" href="${ROOT_URL}">Open the full annual planner →</a>${DEMO || !state.token ? '' : ' · <button class="link" id="logout">Log out</button>'}</p>`;
}

function authView() {
  const m = ui.authMode;
  if (m === 'reset') {
    return `<section class="card auth"><h2>Reset password</h2><form id="reset-form">${ui.resetStep === 1
      ? '<p class="muted">We will email a 6-digit code to the email on your account.</p><label class="field">Email or mobile number<input name="ident" required autocapitalize="none"></label>'
      : '<p class="muted">Enter the code from your email and choose a new password.</p><label class="field">6-digit code<input name="code" inputmode="numeric" maxlength="6" required></label><label class="field">New password<input name="password" type="password" minlength="6" required autocomplete="new-password"></label>'}`
      + `<div id="auth-error" class="err" role="alert"></div><button class="btn" style="width:100%">${ui.resetStep === 1 ? 'Send code' : 'Change password'}</button></form><button class="link" id="show-login">Back to sign in</button></section>`;
  }
  const reg = m === 'register';
  return `<section class="card auth"><h2>Welcome to Jus Daylog</h2><p class="muted">Sign in or create an account to sync across devices.</p>`
    + `<div class="seg"><button class="${reg ? '' : 'on'}" id="show-login">Sign in</button><button class="${reg ? 'on' : ''}" id="show-register">Create account</button></div>`
    + `<form id="auth-form">${reg ? '<label class="field">Your name<input name="name" autocomplete="name" maxlength="60" required></label>' : ''}`
    + `<label class="field">Email or mobile number<input name="ident" required autocomplete="username" autocapitalize="none"></label>`
    + `<label class="field">Password<input name="password" type="password" minlength="6" required autocomplete="${reg ? 'new-password' : 'current-password'}"></label>`
    + `<div id="auth-error" class="err" role="alert"></div><button class="btn" style="width:100%">${reg ? 'Create account' : 'Sign in'}</button></form>${reg ? '' : '<button class="link" id="forgot">Forgot password?</button>'}</section>`;
}

/* ---------- render ---------- */
// A redraw (e.g. when the friends list finishes loading) must never wipe what the person is typing.
const fieldKey = (i) => (i.form && i.form.getAttribute('id') || '') + '/' + (i.name || i.id);
function snapshotFields(root) {
  const keep = {}; let focus = '';
  root.querySelectorAll('input[name],input[id]').forEach((i) => {
    if (i.type === 'checkbox' || i.type === 'radio' || i.hasAttribute('data-rename')) return;
    const k = fieldKey(i); keep[k] = i.value; if (i === document.activeElement) focus = k;
  });
  return { keep, focus };
}
function restoreFields(root, snap) {
  root.querySelectorAll('input[name],input[id]').forEach((i) => {
    if (i.type === 'checkbox' || i.type === 'radio' || i.hasAttribute('data-rename')) return;
    const k = fieldKey(i);
    if (k in snap.keep && snap.keep[k] !== i.value) i.value = snap.keep[k];
    if (k === snap.focus) { try { i.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  });
}
function render(freshInputs) {
  const root = $('#root'), tabs = $('#tabs'), y = window.scrollY, snap = freshInputs ? null : snapshotFields(root);
  if (!DEMO && !state.token) { tabs.classList.add('hidden'); root.innerHTML = authView(); setStatus(); return; }
  tabs.classList.toggle('hidden', IS_DAYLOG);
  if (!IS_DAYLOG) tabs.innerHTML = TABS.map(([id, n]) => `<button data-tab="${id}" class="${ui.tab === id ? 'active' : ''}">${n}</button>`).join('');
  const views = { wheel: wheelView, month: monthView, tasks: tasksView, friends: friendsView, settings: settingsView, daylog: daylogView };
  root.innerHTML = (views[ui.tab] || wheelView)();
  if (snap) restoreFields(root, snap);
  setStatus(); window.scrollTo(0, y);
}
function go(tab) { ui.tab = tab; render(true); window.scrollTo(0, 0); if (tab === 'friends') loadFriends(); }
function select(d, scroll) {
  ui.selected = d; render();
  if (scroll) { const el = $('#day-panel'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

/* ---------- celebration ---------- */
function celebrate(stars) {
  document.querySelectorAll('.celebrate').forEach((x) => x.remove());
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { toast('★ Goal reached!'); return; }
  const cols = ['#f59e0b', '#22c55e', '#38bdf8', '#f472b6', '#a78bfa'];
  let conf = '';
  for (let i = 0; i < 28; i++) conf += `<i style="left:${Math.random() * 100}%;background:${cols[i % 5]};animation-delay:${(Math.random() * 0.5).toFixed(2)}s"></i>`;
  const el = document.createElement('div');
  el.className = 'celebrate'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="confetti">${conf}</div><div class="cbox"><div class="big">${'★'.repeat(stars)}</div><h2>${stars === 5 ? 'Perfect day!' : 'Goal achieved!'}</h2><p>${myStreak()}-day star streak 🔥</p></div>`;
  document.body.append(el); setTimeout(() => el.remove(), 2400);
}

/* ---------- phone notifications (only while the app is open/backgrounded) ---------- */
async function notify(title, body) {
  try { const reg = await navigator.serviceWorker.ready; await reg.showNotification(title, { body, icon: ROOT_URL + 'icons/icon-192.png', tag: 'jd-reminder' }); }
  catch (e) { try { new Notification(title, { body }); } catch (x) { /* unsupported */ } }
}
function checkReminders() {
  const r = state.profile.reminders;
  if (!r || !r.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date(), hm = new Intl.DateTimeFormat('en-GB', { timeZone: state.profile.tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  if (!(r.times || []).includes(hm)) return;
  const key = today() + '|' + hm;
  try { if (localStorage.getItem('jd-lastnotif') === key) return; } catch (e) { /* ignore */ }
  const pending = state.tasks.filter((t) => !(state.logs[today()] || []).includes(t.id));
  if (!pending.length) return;
  try { localStorage.setItem('jd-lastnotif', key); } catch (e) { /* ignore */ }
  notify(`${pending.length} task${pending.length > 1 ? 's' : ''} left today`, pending.slice(0, 4).map((t) => t.name).join(', ') + (pending.length > 4 ? '…' : ''));
}
setInterval(() => { rolloverIfNewDay(); checkReminders(); }, 20000);
let lastToday = today();
function rolloverIfNewDay() {
  const t = today(); if (t === lastToday) return;
  if (ui.selected === lastToday) ui.selected = t;
  lastToday = t; render();
}

/* ---------- settings ---------- */
async function saveSettings() {
  const times = $('#p-times').value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3);
  if (times.some((x) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(x))) { toast('Use HH:mm for reminder times, e.g. 08:00, 20:30'); return; }
  const email = $('#p-email').value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Enter a valid email address'); return; }
  const un = DEMO ? '' : $('#p-username').value.trim().toLowerCase().replace(/^@/, '');
  if (un && !/^[a-z0-9_]{3,20}$/.test(un)) { toast('Username: 3–20 letters, numbers or underscore'); return; }
  const before = JSON.stringify(state.profile);
  Object.assign(state.profile, { name: $('#p-name').value.trim() || state.profile.name, email, goalStars: Number($('#p-goal').value) || 3,
    startDate: $('#p-start').value || state.profile.startDate, cycleStartMonth: Number($('#p-month').value) || 7,
    discoverable: $('#p-discover').checked, reminders: { enabled: $('#p-rem').checked, times } });
  if (!DEMO && un !== (state.profile.username || '')) {            // username must be unique: ask the server now
    const r = await api('saveSettings', { settings: Object.assign(settingsPayload(), { username: un }) });
    if (!r.ok) { state.profile = JSON.parse(before); toast(r.error || 'Could not save'); render(); return; }
    state.profile.username = un;
  } else queue('settings');
  ui.yearOffset = 0; ui.selected = today(); persist(); toast('Settings saved'); render();
}

/* ---------- events ---------- */
document.addEventListener('click', async (e) => {
  const pick = e.target.closest('[data-pick]');
  if (pick) { select(pick.dataset.pick, true); return; }
  const b = e.target.closest('button'); if (!b) return;
  const ds = b.dataset;
  if (ds.tab) { go(ds.tab); return; }
  if (ds.year) { ui.yearOffset += Number(ds.year); render(); return; }
  if (ds.shift) { ui.selected = addDays(ui.selected, Number(ds.shift)); render(); return; }
  if (ds.select) { ui.selected = ds.select; render(); return; }
  if (ds.month) {
    const d = parseISO(ui.selected); d.setDate(1); d.setMonth(d.getMonth() + Number(ds.month));
    const first = isoOf(d), T = today();
    ui.selected = T.slice(0, 7) === first.slice(0, 7) ? T : first; render(); return;
  }
  if (ds.theme) { applyTheme(ds.theme, true); render(); return; }
  if (ds.friendAdd) { friendAction('friendRequest', ds.friendAdd, 'Request sent'); return; }
  if (ds.friendAccept) { friendAction('friendRespond', ds.friendAccept, 'Friend added'); return; }
  if (ds.friendDecline) { friendAction('friendRespond', ds.friendDecline, 'Declined'); return; }
  if (ds.friendRemove) { if (confirm('Remove this friend / cancel the request?')) friendAction('friendRemove', ds.friendRemove, 'Removed'); return; }
  switch (b.id) {
    case 'show-login': ui.authMode = 'login'; render(true); break;
    case 'show-register': ui.authMode = 'register'; render(true); break;
    case 'forgot': ui.authMode = 'reset'; ui.resetStep = 1; render(true); break;
    case 'save-settings': saveSettings(); break;
    case 'use-device-tz': state.profile.tz = deviceTz(); tCache.at = 0; queue('settings'); render(); break;
    case 'logout': { try { await sync(); await api('logout'); } catch (x) { /* ignore */ } state = freshState(); ui.friends = null; ui.matches = []; ui.tab = IS_DAYLOG ? 'daylog' : 'wheel'; persist(); applyTheme('auto', false); render(true); break; }
    case 'reset-demo': if (confirm('Delete all demo data on this device?')) { state = freshState(); persist(); applyTheme('auto', false); ui.selected = today(); render(); } break;
    case 'install': if (ui.deferredInstall) { ui.deferredInstall.prompt(); ui.deferredInstall = null; } else toast('Use your browser menu → Install app / Add to Home Screen'); break;
    case 'notif': if ('Notification' in window) { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Phone notifications enabled' : 'Notifications not allowed'); render(); } break;
    case 'invite': {
      const url = location.origin + location.pathname.replace(/daylog\/?(index\.html)?$/, '').replace(/index\.html$/, '') + '?add=' + encodeURIComponent(state.profile.username || '');
      const text = 'Join me on Jus Daylog and let us keep a star streak together!';
      if (navigator.share) { try { await navigator.share({ title: 'Jus Daylog', text, url }); } catch (x) { /* cancelled */ } }
      else { try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Invite link copied'); } catch (x) { toast(url); } }
      break;
    }
    case 'contacts': {
      if (!(navigator.contacts && navigator.contacts.select)) { toast('Contact picker is not supported here. Add by username or share an invite.'); break; }
      try {
        const picked = await navigator.contacts.select(['email', 'tel'], { multiple: true });
        const list = picked.flatMap((c) => [...(c.email || []), ...(c.tel || [])]);
        if (!list.length) { toast('No contacts selected'); break; }
        const r = await api('matchContacts', { list: list.slice(0, 100) });
        if (!r.ok) { toast(r.error || 'Could not match contacts'); break; }
        ui.matches = r.matches || []; toast(ui.matches.length ? `${ui.matches.length} found` : 'None of them are here yet. Send an invite!'); render();
      } catch (x) { if (x && x.name !== 'AbortError') toast('Could not read contacts'); }
      break;
    }
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('[data-task]')) {
    const id = t.dataset.task, d = t.dataset.day || ui.selected;
    if (!editable(d)) { t.checked = !t.checked; toast('This day is read-only'); return; }
    const before = starsFor(d), set = new Set(state.logs[d] || []);
    if (t.checked) set.add(id); else set.delete(id);
    state.logs[d] = state.tasks.map((x) => x.id).filter((x) => set.has(x));
    persist(); queue('day:' + d);
    const after = starsFor(d);
    render();
    if (t.checked && after > before && ((before < goal() && after >= goal()) || after === 5)) celebrate(after);
  } else if (t.matches('[data-rename]')) {                         // empty name: put the default back
    const task = state.tasks.find((x) => x.id === t.dataset.rename), i = state.tasks.indexOf(task);
    if (!t.value.trim()) { t.value = DEFAULT_NAMES[i] || 'Task ' + (i + 1); task.name = t.value; persist(); queue('tasks'); }
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.matches('[data-rename]') && t.value.trim()) {
    const task = state.tasks.find((x) => x.id === t.dataset.rename);
    if (task) { task.name = t.value.trim().slice(0, 40); persist(); queue('tasks'); }
  }
});

function setBusy(form, on) { const b = form.querySelector('button:not([type=button])'); if (b) b.disabled = on; }
document.addEventListener('submit', async (e) => {
  const form = e.target, fid = form.getAttribute('id');   // (form.id can be shadowed by an input named "id")
  if (!['auth-form', 'reset-form', 'friend-form', 'username-form'].includes(fid)) return;
  e.preventDefault();
  const fd = new FormData(form), err = $('#auth-error');
  if (fid === 'auth-form') {
    setBusy(form, true); if (err) err.textContent = '';
    const reg = ui.authMode === 'register';
    const r = await api(reg ? 'register' : 'login', { identifier: fd.get('ident'), password: fd.get('password'), name: fd.get('name') || '' });
    if (!r.ok) { if (err) err.textContent = r.error || 'Unable to continue'; setBusy(form, false); return; }
    state = freshState(); state.token = r.token; applyServerState(r.state); applyTheme(state.profile.theme, false);
    ui.selected = today(); ui.friends = null; ui.yearOffset = 0; ui.tab = IS_DAYLOG ? 'daylog' : 'wheel'; persist();
    if (ui.pendingInvite) { ui.addPrefill = ui.pendingInvite; ui.pendingInvite = ''; ui.tab = IS_DAYLOG ? 'daylog' : 'friends'; }
    render(true); if (ui.tab === 'friends') loadFriends();
  } else if (fid === 'reset-form') {
    setBusy(form, true); if (err) err.textContent = '';
    if (ui.resetStep === 1) {
      ui.resetId = String(fd.get('ident') || ''); const r = await api('requestReset', { identifier: ui.resetId });
      if (!r.ok) { err.textContent = r.error || 'Could not send the code'; setBusy(form, false); return; }
      ui.resetStep = 2; render(true); const e2 = $('#auth-error'); if (e2) e2.textContent = 'If the account has an email, a code was sent.';
    } else {
      const r = await api('resetPassword', { identifier: ui.resetId, code: String(fd.get('code') || '').trim(), password: fd.get('password') });
      if (!r.ok) { err.textContent = r.error || 'Could not change the password'; setBusy(form, false); return; }
      ui.authMode = 'login'; render(true); toast('Password changed. Please sign in.');
    }
  } else if (fid === 'friend-form') {
    friendAction('friendRequest', String(fd.get('username') || '').toLowerCase().replace(/^@/, ''), 'Request sent');
  } else if (fid === 'username-form') {
    const un = String(fd.get('username') || '').trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,20}$/.test(un)) { toast('Username: 3–20 letters, numbers or underscore'); return; }
    const r = await api('saveSettings', { settings: Object.assign(settingsPayload(), { username: un }) });
    if (!r.ok) { toast(r.error || 'Could not save username'); return; }
    state.profile.username = un; persist(); toast('Username saved'); render(true);
  }
});

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ui.deferredInstall = e; });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { rolloverIfNewDay(); refreshFromServer(); checkReminders(); } });

/* ---------- boot ---------- */
function boot() {
  const q = new URLSearchParams(location.search), hash = location.hash.replace('#', '');
  ui.pendingInvite = String(q.get('add') || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const want = q.get('tab') || hash;
  if (!IS_DAYLOG && TABS.some((t) => t[0] === want)) ui.tab = want;
  if (q.has('add') || q.has('tab')) { try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ } }
  applyTheme(state.profile.theme, false);
  if (DEMO) { state.token = 'demo'; persist(); }
  else if (state.token && ui.pendingInvite) { ui.addPrefill = ui.pendingInvite; ui.pendingInvite = ''; if (!IS_DAYLOG) ui.tab = 'friends'; }
  ui.selected = today();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  render();
  if (ui.tab === 'friends') loadFriends();
  if (state.token && !DEMO) { refreshFromServer(); sync(); }
}
boot();
window.JusDaylog = { get state() { return state; }, render, streak: myStreak };
})();
