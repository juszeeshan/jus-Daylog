(() => {
'use strict';

/* ---------- config & constants ---------- */
const CFG = window.APP_CONFIG || {};
const API = String(CFG.API_URL || '').trim();
const DEMO = !API;
const KEY = 'dailywheel.state.v1';
const EDIT_DAYS = 7;
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONFULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DEFAULTS = ['Exercise','2-litre water','6-hour sleep, on time','Skill development hour','Prayer',
  'Read 20 minutes','Healthy meals','No junk food','Journal','Plan tomorrow'];
const THEMES = [['auto','Auto','linear-gradient(135deg,#f4f6f8 50%,#111a2e 50%)'],['ocean','Ocean','#0369a1'],['sunrise','Sunrise','#ea580c'],
  ['forest','Forest','#15803d'],['lavender','Lavender','#7c3aed'],['midnight','Midnight','#0b1220'],['amoled','Amoled','#000']];
const TABS = ['wheel','month','tasks','friends','settings'];
// wheel geometry (SVG units)
const R_OUT = 280, R_IN = 62, ARC = 330, GAP = 0.5, C = 300, LABEL_ANG = -105;

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const p2 = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => fmt(new Date());
const dim = (y, m) => new Date(y, m, 0).getDate();
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
const tzName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'; } catch (e) { return 'Asia/Kolkata'; } };
const defTasks = () => DEFAULTS.map((name, i) => ({ id: 't' + (i + 1), name }));
const blank = () => ({ session: null, profile: null, tasks: defTasks(), logs: {}, dirty: { tasks: false, settings: false, days: {} } });
const newProfile = (o) => Object.assign({ name: 'You', identifier: 'demo', type: 'demo', email: '', tz: tzName(),
  startDate: today(), cycleStartMonth: 7, username: '', goalStars: 3, discoverable: true, theme: 'auto',
  reminders: { enabled: false, times: ['21:00'] } }, o || {});
// 5 stars are spread over the day's tasks (10 tasks = 1 star per 2 tasks)
const starsOf = (n, total) => (total ? Math.min(5, Math.floor(n * 5 / total)) : 0);
const starHTML = (s) => `<span class="stars" aria-label="${s} of 5 stars">${'★'.repeat(s)}<span class="off">${'★'.repeat(5 - s)}</span></span>`;

/* ---------- state ---------- */
let S = (() => {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.tasks && s.dirty) return s; } catch (e) {}
  return blank();
})();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const ui = { tab: 'wheel', cycleYear: 0, selected: today(), monthIdx: 0, zoom: false, authMode: 'login', today: today(),
  resetId: '', deferred: null, friends: null, matches: [], addPrefill: '', addParam: '', startTab: '' };

let toastT;
function toast(m) {
  const t = $('#toast'); t.textContent = m; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------- themes ---------- */
function applyTheme(t) {
  const th = THEMES.find((x) => x[0] === t) || THEMES[0];
  if (th[0] === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = th[0];
  try { localStorage.setItem('dw.theme', th[0]); } catch (e) {}
  const m = $('meta[name=theme-color]');
  if (m) { const c = getComputedStyle(document.documentElement).getPropertyValue('--bar').trim(); if (c) m.content = c; }
  $$('.sw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themePick === th[0])));
}

/* ---------- cycle (12 rings = 12 months) ---------- */
const startMonth = () => (S.profile && S.profile.cycleStartMonth) || 7;
function cycleYearOf(ds) { const d = parse(ds); return d.getMonth() + 1 >= startMonth() ? d.getFullYear() : d.getFullYear() - 1; }
function ringOf(ds) { return (parse(ds).getMonth() + 1 - startMonth() + 12) % 12; }
function ringMonth(i) { const idx = startMonth() - 1 + i; return { y: ui.cycleYear + Math.floor(idx / 12), m: (idx % 12) + 1 }; }
function cycleLabel() { return startMonth() === 1 ? String(ui.cycleYear) : `${ui.cycleYear}–${p2((ui.cycleYear + 1) % 100)}`; }
function canEdit(ds) { const t = today(); return ds <= t && ds >= addDays(t, -(EDIT_DAYS - 1)); }
function cls(ds, id, done, t, start) {
  if (ds > t) return 'f';
  if (done.has(id)) return 'g';
  if (ds < start) return 'z';
  return ds === t ? 'p' : 'r';
}

/* ---------- stars & streaks ---------- */
const goalStars = () => Math.min(5, Math.max(1, (S.profile && S.profile.goalStars) || 3));
function dayStars(ds) {
  const ids = new Set(S.tasks.map((t) => t.id));
  return starsOf((S.logs[ds] || []).filter((id) => ids.has(id)).length, S.tasks.length);
}
function streakInfo() {
  const goal = goalStars();
  let d = today(), cur = 0;
  if (dayStars(d) < goal) d = addDays(d, -1);
  while (cur < 800 && dayStars(d) >= goal) { cur++; d = addDays(d, -1); }
  const days = Object.keys(S.logs).filter((ds) => dayStars(ds) >= goal).sort();
  let best = 0, run = 0, prev = null;
  days.forEach((x) => { run = prev && addDays(prev, 1) === x ? run + 1 : 1; if (run > best) best = run; prev = x; });
  return { cur, best };
}
function celebrate(stars) {
  const st = streakInfo(), cols = ['#f59e0b', '#22c55e', '#38bdf8', '#f472b6', '#a78bfa'];
  let conf = '';
  for (let i = 0; i < 28; i++) conf += `<i style="left:${Math.random() * 100}%;background:${cols[i % 5]};animation-delay:${(Math.random() * 0.5).toFixed(2)}s;transform:rotate(${Math.floor(Math.random() * 360)}deg)"></i>`;
  document.querySelectorAll('.celebrate').forEach((x) => x.remove());
  const el = document.createElement('div');
  el.className = 'celebrate';
  el.innerHTML = `<div class="confetti">${conf}</div><div class="cbox"><div class="big">${'★'.repeat(stars)}</div><h2>${stars === 5 ? 'Perfect day!' : 'Goal achieved!'}</h2><p>${st.cur}-day star streak 🔥</p></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

/* ---------- network ---------- */
async function call(action, payload = {}) {
  const body = JSON.stringify(Object.assign({ action, token: S.session && S.session.token }, payload));
  let res;
  try { res = await fetch(API, { method: 'POST', body, redirect: 'follow' }); }
  catch (e) { throw Object.assign(new Error('Network error'), { code: 'net' }); }
  let data;
  try { data = await res.json(); } catch (e) { throw Object.assign(new Error('Bad server response'), { code: 'bad' }); }
  if (!data.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { code: data.code || 'err' });
  return data;
}

let flushing = false, syncTimer = null;
function queueSync() { clearTimeout(syncTimer); syncTimer = setTimeout(flush, 700); setSync(); }
function pendingCount() { return (S.dirty.tasks ? 1 : 0) + (S.dirty.settings ? 1 : 0) + Object.keys(S.dirty.days).length; }
function setSync() {
  const el = $('#sync'); if (!el) return;
  el.textContent = DEMO ? 'Demo · this device only'
    : !navigator.onLine ? (pendingCount() ? 'Offline · will sync' : 'Offline')
    : flushing || pendingCount() ? 'Saving…' : 'Synced ✓';
}
const settingsPayload = () => { const p = S.profile; return { name: p.name, email: p.email, startDate: p.startDate,
  cycleStartMonth: p.cycleStartMonth, tz: p.tz, remEnabled: p.reminders.enabled, remTimes: p.reminders.times,
  goalStars: p.goalStars, discoverable: p.discoverable, theme: p.theme }; };

async function flush() {
  if (DEMO || !S.session || !navigator.onLine || flushing) { setSync(); return; }
  flushing = true; setSync();
  try {
    if (S.dirty.tasks) { const sent = JSON.stringify(S.tasks); await call('saveTasks', { tasks: S.tasks }); if (JSON.stringify(S.tasks) === sent) S.dirty.tasks = false; }
    if (S.dirty.settings) { const sent = JSON.stringify(settingsPayload()); await call('saveSettings', { settings: settingsPayload() }); if (JSON.stringify(settingsPayload()) === sent) S.dirty.settings = false; }
    for (const d of Object.keys(S.dirty.days)) {
      const sent = JSON.stringify(S.logs[d] || []);
      await call('saveDay', { date: d, done: S.logs[d] || [] });
      if (JSON.stringify(S.logs[d] || []) === sent) delete S.dirty.days[d];
    }
    flushing = false; persist(); setSync();
    if (pendingCount()) queueSync();
  } catch (e) {
    flushing = false; persist(); setSync();
    if (e.code === 'auth') { toast('Session expired – please log in again'); logout(true); }
    else if (e.code === 'net' || e.code === 'bad') setTimeout(flush, 30000);
    else toast(e.message);
  }
}

function applyState(st) {
  const local = S.logs, lp = S.profile, lt = S.tasks;
  S.logs = st.logs || {};
  for (const d of Object.keys(S.dirty.days)) S.logs[d] = local[d] || [];
  S.tasks = S.dirty.tasks ? lt : (st.tasks && st.tasks.length ? st.tasks : defTasks());
  S.profile = Object.assign(newProfile(), st.profile);
  if (S.dirty.settings && lp) Object.assign(S.profile, { name: lp.name, email: lp.email, startDate: lp.startDate,
    cycleStartMonth: lp.cycleStartMonth, reminders: lp.reminders, goalStars: lp.goalStars, discoverable: lp.discoverable, theme: lp.theme });
  persist();
}

async function refresh() {
  if (DEMO || !S.session || !navigator.onLine) return;
  try {
    const r = await call('getState'); applyState(r.state); applyTheme(S.profile.theme);
    renderParts(); if (ui.tab === 'settings' || ui.tab === 'tasks') setTab(ui.tab);
    if (ui.tab === 'friends') loadFriends();
  } catch (e) { if (e.code === 'auth') { toast('Session expired – please log in again'); logout(true); } }
}

async function logout(force) {
  if (!force) { try { await flush(); } catch (e) {} try { await call('logout'); } catch (e) {} }
  S = blank(); persist(); ui.friends = null; showAuth('login');
}

/* ---------- wheel chart ---------- */
const f2 = (n) => n.toFixed(2);
const polar = (r, deg) => { const a = deg * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
const arc = (r, a1, a2) => { const [x1, y1] = polar(r, a1), [x2, y2] = polar(r, a2); return `M${f2(x1)} ${f2(y1)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x2)} ${f2(y2)}`; };
const sector = (rO, rI, a1, a2) => {
  const p1 = polar(rO, a1), p2_ = polar(rO, a2), p3 = polar(rI, a2), p4 = polar(rI, a1);
  return `M${f2(p1[0])} ${f2(p1[1])}A${rO} ${rO} 0 0 1 ${f2(p2_[0])} ${f2(p2_[1])}L${f2(p3[0])} ${f2(p3[1])}A${rI} ${rI} 0 0 0 ${f2(p4[0])} ${f2(p4[1])}Z`;
};
function locate(ds) {
  if (cycleYearOf(ds) !== ui.cycleYear) return null;
  return { i: ringOf(ds), d: parse(ds).getDate() };
}

function chartSVG() {
  const ids = S.tasks.map((t) => t.id), n = ids.length, t = today(), start = S.profile.startDate || '0000-00-00';
  const ringW = (R_OUT - R_IN) / 12, pad = 1.1, lw = (ringW - 2 * pad) / n, dw = ARC / 31;
  let o = `<svg viewBox="-6 -6 612 612" role="img" aria-label="Habit wheel ${esc(cycleLabel())}" xmlns="http://www.w3.org/2000/svg">`;
  for (let i = 0; i < 12; i++) {
    const { y, m } = ringMonth(i), days = dim(y, m), rOut = R_OUT - i * ringW;
    const [lx, ly] = polar(rOut - ringW / 2, LABEL_ANG);
    o += `<text class="mlabel" x="${f2(lx)}" y="${f2(ly)}" transform="rotate(${LABEL_ANG + 90} ${f2(lx)} ${f2(ly)})">${MON[m - 1].toUpperCase()}</text>`;
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${p2(m)}-${p2(d)}`;
      const a1 = -90 + (d - 1) * dw + GAP / 2, a2 = -90 + d * dw - GAP / 2;
      const done = new Set(S.logs[ds] || []);
      o += `<g class="cell" data-d="${ds}" stroke-width="${(lw * 0.86).toFixed(2)}"><path class="hit" d="${arc(rOut - ringW / 2, a1, a2)}" stroke-width="${f2(ringW)}"/>`;
      for (let k = 0; k < n; k++) o += `<path class="${cls(ds, ids[k], done, t, start)}" d="${arc(rOut - pad - lw * (k + 0.5), a1, a2)}"/>`;
      o += '</g>';
    }
  }
  for (let d = 1; d <= 31; d++) {
    const [x, y] = polar(R_OUT + 10, -90 + (d - 0.5) * dw);
    o += `<text class="dlabel" x="${f2(x)}" y="${f2(y)}">${d}</text>`;
  }
  const mark = (ds, c) => {
    const L = locate(ds); if (!L) return '';
    const { y, m } = ringMonth(L.i); if (L.d > dim(y, m)) return '';
    const rOut = R_OUT - L.i * ringW;
    return `<path class="${c}" d="${sector(rOut, rOut - ringW, -90 + (L.d - 1) * dw, -90 + L.d * dw)}"/>`;
  };
  o += mark(t, 'outline-today');
  if (ui.selected !== t) o += mark(ui.selected, 'outline-sel');
  const cnt = (S.logs[t] || []).filter((id) => ids.includes(id)).length, st = starsOf(cnt, n);
  o += `<circle class="hub" cx="${C}" cy="${C}" r="${R_IN - 5}"/><text class="hubnum" x="${C}" y="${C - 4}">${cnt}/${n}</text><text class="hubstars" x="${C}" y="${C + 16}">${'★'.repeat(st)}${'☆'.repeat(5 - st)}</text></svg>`;
  return o;
}

function statsHTML() {
  const t = today(), start = S.profile.startDate || t, ids = new Set(S.tasks.map((x) => x.id)), n = S.tasks.length;
  const cnt = (ds) => (S.logs[ds] || []).filter((id) => ids.has(id)).length;
  const last = ringMonth(11), cs = `${ui.cycleYear}-${p2(startMonth())}-01`, ce = `${last.y}-${p2(last.m)}-${p2(dim(last.y, last.m))}`;
  const from = cs > start ? cs : start, to = ce < t ? ce : t;
  let five = 0, done = 0, days = 0;
  for (let x = from; x <= to; x = addDays(x, 1)) { days++; const c = cnt(x); done += c; if (starsOf(c, n) === 5) five++; }
  for (let x = cs; x <= ce && x < from; x = addDays(x, 1)) if (starsOf(cnt(x), n) === 5) five++;
  const pct = days ? Math.round(done / (days * n) * 100) : 0, s = streakInfo();
  return `<div class="stat"><b>🔥${s.cur}</b><span>Star streak</span></div><div class="stat"><b>🏆${s.best}</b><span>Best streak</span></div><div class="stat"><b>⭐${five}</b><span>5★ days</span></div><div class="stat"><b>${pct}%</b><span>Completion</span></div>`;
}

function dayPanelHTML() {
  const ds = ui.selected, t = today(), start = S.profile.startDate || t, done = new Set(S.logs[ds] || []);
  const ed = canEdit(ds), isToday = ds === t, past = ds < t, future = ds > t;
  const tot = S.tasks.length, cnt = S.tasks.filter((x) => done.has(x.id)).length, stars = starsOf(cnt, tot), goal = goalStars();
  const goalTasks = Math.ceil(goal * tot / 5);
  const label = parse(ds).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  let h = `<div class="dayhead"><button class="icon" data-act="day-prev" aria-label="Previous day">‹</button><div><h2>${esc(label)}${isToday ? ' · Today' : ''}</h2>
    <div class="sub">${starHTML(stars)} · ${cnt}/${tot} done${past && cnt < tot ? ` · <span class="miss">${tot - cnt} missed</span>` : ''}${isToday && cnt < tot ? ` · ${tot - cnt} to go` : ''}</div></div>
    <button class="icon" data-act="day-next" aria-label="Next day">›</button></div>
    <div class="bar"><i style="width:${tot ? cnt / tot * 100 : 0}%"></i></div>
    <p class="note" style="margin:0 0 4px">${stars >= goal ? '✅ Goal reached' : `Goal: ${goal}★ = ${goalTasks} tasks`} · 1 star per ${(tot / 5).toFixed(tot % 5 ? 1 : 0)} tasks</p><ul class="tasks">`;
  h += S.tasks.map((x) => {
    const on = done.has(x.id), c = future ? 'f' : on ? 'g' : ds < start ? 'z' : isToday ? 'p' : 'r';
    return `<li><label class="task ${on ? 'on' : ''}"><input type="checkbox" data-task="${x.id}" ${on ? 'checked' : ''} ${ed ? '' : 'disabled'}><span class="line ${c}"></span><span class="tn">${esc(x.name)}</span></label></li>`;
  }).join('');
  h += '</ul>';
  if (!ed) h += `<p class="note">${future ? 'This day has not started yet.' : `Only the last ${EDIT_DAYS} days can be edited.`}</p>`;
  return h;
}

function monthGridHTML() {
  const { y, m } = ringMonth(ui.monthIdx), t = today(), start = S.profile.startDate || t;
  const first = (new Date(y, m - 1, 1).getDay() + 6) % 7, days = dim(y, m);
  let h = '<div class="mgrid">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<b>${x}</b>`).join('');
  for (let i = 0; i < first; i++) h += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${p2(m)}-${p2(d)}`, done = new Set(S.logs[ds] || []);
    h += `<button class="mday ${ds === ui.selected ? 'sel' : ''} ${ds === t ? 'today' : ''}" data-d="${ds}"><span>${d}</span><div class="bars">${S.tasks.map((k) => `<i class="${cls(ds, k.id, done, t, start)}"></i>`).join('')}</div></button>`;
  }
  return h + '</div>';
}

const LEGEND = '<div class="legend"><span style="--c:var(--green)">Done</span><span style="--c:var(--red)">Missed</span><span style="--c:var(--amber)">Today, pending</span><span style="--c:var(--faint)">Upcoming</span></div>';

/* ---------- friends ---------- */
const contactsOK = () => 'contacts' in navigator && 'ContactsManager' in window;

function friendRow(r) {
  return `<div class="frow ${r.me ? 'me' : ''}"><div class="fmain"><b>${esc(r.name)}${r.me ? ' (you)' : ''}</b><small>${r.username ? '@' + esc(r.username) : 'no username'} · goal ${r.goal}★</small></div>
    <div class="fstat"><span title="Star streak">🔥${r.streak}</span>${r.duo !== undefined ? `<span title="Streak together">🤝${r.duo}</span>` : ''}${r.me ? '' : `<button class="icon x" data-act="friend-remove" data-u="${esc(r.username)}" aria-label="Remove friend">×</button>`}</div>
    <div class="fweek">${r.week.map((s, i) => `<i class="${s >= r.goal ? 'g' : i === 6 && s < r.goal ? 'p' : s > 0 ? 'p' : 'r'}">${s}</i>`).join('')}</div></div>`;
}

function friendsHTML() {
  const p = S.profile;
  if (DEMO) return '<div class="card"><h2>Friends</h2><p class="note">Friends and shared streaks need the Google backend. Add your Apps Script URL in config.js to turn this on.</p></div>';
  const F = ui.friends, goal = goalStars(), n = S.tasks.length;
  let h = '';
  h += !p.username
    ? '<div class="card"><h2>Pick your username</h2><p class="note" style="margin:0 0 10px">Friends find you by this name. 3–20 letters, numbers or _ .</p><div class="inl"><input id="f-user" placeholder="e.g. ravi_24" maxlength="20" autocapitalize="none" autocomplete="off"><button class="btn primary" data-act="set-username">Save</button></div></div>'
    : `<div class="card"><div class="inl"><div><h2 style="margin:0">@${esc(p.username)}</h2><p class="note" style="margin:2px 0 0">Goal ${starHTML(goal)} = ${Math.ceil(goal * n / 5)} tasks a day</p></div><button class="btn" data-act="invite">Invite</button></div></div>`;
  if (p.username) {
    h += `<div class="card"><h2>Add a friend</h2><div class="inl"><input id="f-add" placeholder="their username" value="${esc(ui.addPrefill)}" autocapitalize="none" autocomplete="off"><button class="btn primary" data-act="friend-add">Add</button></div>`;
    h += contactsOK() ? '<button class="btn wide" style="margin-top:8px" data-act="pick-contacts">📇 Find friends from my contacts</button>'
      : '<p class="note">Contact book matching works in Chrome on Android. You can always add by username or share an invite link.</p>';
    if (ui.matches.length) h += '<div style="margin-top:10px">' + ui.matches.map((m) => `<div class="frow"><div class="fmain"><b>${esc(m.name)}</b><small>@${esc(m.username)}</small></div><button class="btn" data-act="friend-add" data-u="${esc(m.username)}">Add</button></div>`).join('') + '</div>';
    h += '</div>';
  }
  if (!F) return h + '<div class="card"><p class="note">Loading friends…</p></div>';
  if (F.incoming && F.incoming.length) h += '<div class="card"><h2>Requests</h2>' + F.incoming.map((x) => `<div class="frow"><div class="fmain"><b>${esc(x.name)}</b><small>@${esc(x.username)} wants to be friends</small></div><div class="fstat"><button class="btn primary" data-act="friend-accept" data-u="${esc(x.username)}">Accept</button><button class="btn" data-act="friend-decline" data-u="${esc(x.username)}">Decline</button></div></div>`).join('') + '</div>';
  const t = today();
  const me = { me: true, name: p.name || 'You', username: p.username, goal, streak: streakInfo().cur, week: Array.from({ length: 7 }, (_, i) => dayStars(addDays(t, i - 6))) };
  const rows = [me].concat(F.friends || []).sort((a, b) => b.streak - a.streak);
  h += `<div class="card"><h2>Streak board</h2><p class="note" style="margin:0 0 6px">🔥 star streak · 🤝 days you both hit your goals · last 7 days in stars</p>${rows.map(friendRow).join('')}${rows.length === 1 ? '<p class="note">No friends yet. Add one above or tap Invite.</p>' : ''}</div>`;
  if (F.outgoing && F.outgoing.length) h += '<div class="card"><h2>Sent requests</h2>' + F.outgoing.map((x) => `<div class="frow"><div class="fmain"><b>${esc(x.name)}</b><small>@${esc(x.username)} · waiting</small></div><button class="btn" data-act="friend-remove" data-u="${esc(x.username)}">Cancel</button></div>`).join('') + '</div>';
  return h;
}

function renderFriends() { const el = $('#friendsview'); if (el) el.innerHTML = friendsHTML(); }

async function loadFriends() {
  if (DEMO) { renderFriends(); return; }
  try { ui.friends = await call('friends'); }
  catch (e) { toast(e.code === 'net' ? 'Friends need an internet connection' : e.message); if (!ui.friends) ui.friends = { friends: [], incoming: [], outgoing: [] }; }
  renderFriends();
}

async function friendCall(action, payload, okMsg) {
  try { const r = await call(action, payload); toast(r.accepted ? 'You are now friends! 🎉' : okMsg || 'Done'); ui.addPrefill = ''; ui.matches = ui.matches.filter((m) => m.username !== payload.username); await loadFriends(); }
  catch (e) { toast(e.message); }
}

async function pickContacts() {
  try {
    const picked = await navigator.contacts.select(['tel', 'email'], { multiple: true });
    const list = [];
    picked.forEach((c) => { (c.tel || []).forEach((x) => list.push(x)); (c.email || []).forEach((x) => list.push(x)); });
    if (!list.length) return toast('No contacts selected');
    const r = await call('matchContacts', { list: list.slice(0, 200) });
    ui.matches = r.matches || []; renderFriends();
    toast(ui.matches.length ? `${ui.matches.length} found` : 'None of them are here yet. Send an invite!');
  } catch (e) { if (e.name !== 'AbortError') toast(e.message || 'Could not read contacts'); }
}

async function invite() {
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  const url = base + (S.profile.username ? `?add=${encodeURIComponent(S.profile.username)}` : '');
  const text = `Join me on Daily Wheel and let's keep a star streak together!`;
  if (navigator.share) { try { await navigator.share({ title: 'Daily Wheel', text, url }); } catch (e) {} }
  else { try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Invite link copied'); } catch (e) { toast(url); } }
}

async function setUsername() {
  const un = String($('#f-user').value || '').trim().toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9_]{3,20}$/.test(un)) return toast('3–20 letters, numbers or underscore');
  try { await call('saveSettings', { settings: { username: un } }); S.profile.username = un; persist(); toast('Username saved'); renderFriends(); }
  catch (e) { toast(e.message); }
}

/* ---------- views ---------- */
function skeleton(tab) {
  if (tab === 'wheel') return `<div class="card"><div class="cyclebar"><button class="icon" data-act="cycle-prev" aria-label="Previous year">‹</button><strong id="cyclelabel"></strong><button class="icon" data-act="cycle-next" aria-label="Next year">›</button><button class="icon" data-act="zoom" aria-label="Zoom">⤢</button></div>
    <div id="chartwrap"><div id="chart"></div></div>${LEGEND}<p class="note" style="text-align:center">Each day = 10 lines (outer line = task 1). Tap a day to open it.</p></div>
    <div id="stats" class="stats"></div><div id="daypanel" class="card"></div>`;
  if (tab === 'month') return `<div class="card"><div class="cyclebar"><button class="icon" data-act="month-prev" aria-label="Previous month">‹</button><select id="monthsel" aria-label="Month"></select><button class="icon" data-act="month-next" aria-label="Next month">›</button></div><div id="monthgrid"></div>${LEGEND}</div><div id="daypanel" class="card"></div>`;
  if (tab === 'tasks') return `<div class="card"><h2>Your 10 daily tasks</h2><p class="note" style="margin:0 0 12px">Tap to rename. Each task is one line in every cell of the wheel (task 1 = outermost line).</p>${S.tasks.map((t, i) => `<label class="fld taskfld"><span class="idx">${i + 1}</span><input data-tid="${t.id}" value="${esc(t.name)}" maxlength="40" aria-label="Task ${i + 1}"></label>`).join('')}<p class="note">Renaming a task keeps your past ticks for that slot.</p></div>`;
  if (tab === 'friends') return '<div id="friendsview"></div>';
  return settingsHTML();
}

function settingsHTML() {
  const p = S.profile, r = p.reminders || { enabled: false, times: [] }, tm = [0, 1, 2].map((i) => r.times[i] || '');
  const notif = 'Notification' in window ? Notification.permission : 'unsupported', n = S.tasks.length;
  return `<div class="card"><h2>Theme</h2><div class="swatches">${THEMES.map((t) => `<button class="sw" data-theme-pick="${t[0]}" title="${t[1]}" aria-label="${t[1]} theme" aria-pressed="${(p.theme || 'auto') === t[0]}" style="background:${t[2]}"></button>`).join('')}</div></div>
    <div class="card"><h2>Profile</h2>
    <label class="fld">Name<input id="s-name" value="${esc(p.name || '')}" maxlength="60"></label>
    <label class="fld">Login<input value="${esc(p.identifier)}" disabled></label>
    <label class="fld">Email for reminders<input id="s-email" type="email" inputmode="email" value="${esc(p.email || '')}" placeholder="you@example.com"></label></div>
    <div class="card"><h2>Star goal</h2><p class="note" style="margin:0 0 8px">5 stars are shared across your ${n} tasks. Reach your goal to keep the streak alive.</p>
    <label class="fld">Daily goal<select id="s-goal">${[1, 2, 3, 4, 5].map((g) => `<option value="${g}" ${goalStars() === g ? 'selected' : ''}>${'★'.repeat(g)} · ${Math.ceil(g * n / 5)} of ${n} tasks</option>`).join('')}</select></label>
    <label class="row"><input type="checkbox" id="s-disc" ${p.discoverable !== false ? 'checked' : ''}> Let people who have my number/email in their contacts find me</label></div>
    <div class="card"><h2>Wheel</h2>
    <label class="fld">Tracking starts on (earlier days stay grey)<input id="s-start" type="date" value="${esc(p.startDate || today())}" max="${today()}"></label>
    <label class="fld">Year starts in<select id="s-cycle">${MONFULL.map((m, i) => `<option value="${i + 1}" ${p.cycleStartMonth === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div>
    <div class="card"><h2>Reminders</h2>
    <label class="row"><input type="checkbox" id="s-rem" ${r.enabled ? 'checked' : ''}> Remind me about unfinished tasks</label>
    <div class="times">${tm.map((v) => `<input class="s-time" type="time" value="${v}" aria-label="Reminder time">`).join('')}</div>
    <p class="note">${DEMO ? 'Email reminders need the Google backend. ' : 'Email reminders are sent by your Google script, even when the app is closed. '}Phone notifications below work while the app is open or running in the background.</p>
    <div class="actions" style="margin-top:10px"><button class="btn" data-act="notif" ${notif === 'unsupported' ? 'disabled' : ''}>${notif === 'granted' ? '🔔 Phone notifications on' : notif === 'denied' ? '🔕 Blocked in browser settings' : 'Enable phone notifications'}</button></div></div>
    <div class="card actions"><button class="btn primary" data-act="save-settings">Save settings</button>
    <button class="btn" id="install" data-act="install" ${ui.deferred ? '' : 'hidden'}>Install app</button>
    <p class="note" style="margin:0">iPhone: tap Share → Add to Home Screen. Android/Chrome: menu → Install app.</p>
    ${DEMO ? '<button class="btn danger" data-act="reset-demo">Reset demo data</button>' : '<button class="btn danger" data-act="logout">Log out</button>'}</div>`;
}

function setTab(tab) {
  ui.tab = tab;
  $('#view').innerHTML = skeleton(tab);
  $$('.tabs button').forEach((b) => b.removeAttribute('aria-current'));
  const cur = $(`.tabs button[data-tab="${tab}"]`); if (cur) cur.setAttribute('aria-current', 'page');
  window.scrollTo(0, 0);
  renderParts();
  if (tab === 'friends') loadFriends();
}

function renderParts() {
  if (!S.profile) return;
  const set = (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; };
  if (ui.tab === 'wheel') { const cl = $('#cyclelabel'); if (cl) cl.textContent = cycleLabel(); set('chart', chartSVG()); set('stats', statsHTML()); }
  if (ui.tab === 'month') {
    const sel = $('#monthsel');
    if (sel) sel.innerHTML = Array.from({ length: 12 }, (_, i) => { const { y, m } = ringMonth(i); return `<option value="${i}" ${i === ui.monthIdx ? 'selected' : ''}>${MONFULL[m - 1]} ${y}</option>`; }).join('');
    set('monthgrid', monthGridHTML());
  }
  if (ui.tab === 'friends') renderFriends();
  set('daypanel', dayPanelHTML());
  const cw = $('#chartwrap'); if (cw) cw.classList.toggle('zoom', ui.zoom);
  setSync();
}

function select(ds) { ui.selected = ds; ui.cycleYear = cycleYearOf(ds); ui.monthIdx = ringOf(ds); renderParts(); }

function toggleTask(id, on) {
  const ds = ui.selected; if (!canEdit(ds)) return;
  const before = dayStars(ds), set = new Set(S.logs[ds] || []);
  on ? set.add(id) : set.delete(id);
  S.logs[ds] = [...set]; S.dirty.days[ds] = true; persist(); renderParts(); queueSync();
  const after = dayStars(ds), goal = goalStars();
  if (on && ((before < goal && after >= goal) || (before < 5 && after === 5))) celebrate(after);
}

function shiftMonth(delta) {
  let i = ui.monthIdx + delta;
  if (i < 0) { ui.cycleYear--; i = 11; } else if (i > 11) { ui.cycleYear++; i = 0; }
  ui.monthIdx = i; renderParts();
}

function saveSettings() {
  const p = S.profile, email = $('#s-email').value.trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Enter a valid email address');
  const times = [...new Set($$('.s-time').map((i) => i.value).filter(Boolean))].sort();
  p.name = $('#s-name').value.trim() || p.name;
  p.email = email;
  p.startDate = $('#s-start').value || p.startDate;
  p.cycleStartMonth = Number($('#s-cycle').value) || 7;
  p.goalStars = Number($('#s-goal').value) || 3;
  p.discoverable = $('#s-disc').checked;
  p.reminders = { enabled: $('#s-rem').checked, times };
  S.dirty.settings = true; persist();
  ui.cycleYear = cycleYearOf(ui.selected); ui.monthIdx = ringOf(ui.selected);
  toast('Settings saved'); queueSync();
}

/* ---------- auth screens ---------- */
function showAuth(mode) {
  ui.authMode = mode || 'login';
  $('#app').hidden = true; const a = $('#auth'); a.hidden = false;
  const reg = ui.authMode === 'reg';
  a.innerHTML = `<div class="authcard"><img class="logo" src="icon.svg" alt=""><h1>Daily Wheel</h1><p class="tag">10 daily habits. One wheel. 365 days.</p>
    <div class="seg"><button data-act="auth-login" class="${reg ? '' : 'on'}">Log in</button><button data-act="auth-reg" class="${reg ? 'on' : ''}">Create account</button></div>
    <form id="authform" novalidate>
      ${reg ? '<label class="fld">Your name<input name="name" autocomplete="name" maxlength="60"></label>' : ''}
      <label class="fld">Email or mobile number<input name="ident" inputmode="email" autocomplete="username" autocapitalize="none"></label>
      <label class="fld">Password<input name="pw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}"></label>
      ${reg ? '<label class="fld" id="emailfld" hidden>Email for reminders (optional)<input name="email" type="email" autocomplete="email"></label>' : ''}
      <button class="btn primary wide" type="submit">${reg ? 'Create account' : 'Log in'}</button>
      ${reg ? '' : '<div style="text-align:center"><button type="button" class="link" data-act="forgot">Forgot password?</button></div>'}
    </form><p id="autherr" class="err"></p></div>`;
}

function showForgot(step) {
  const a = $('#auth'); $('#app').hidden = true; a.hidden = false; ui.resetStep = step;
  a.innerHTML = `<div class="authcard"><img class="logo" src="icon.svg" alt=""><h1>Reset password</h1>
    <form id="resetform" novalidate>${step === 1
      ? '<p class="tag">We\'ll email a 6-digit code to the email on your account.</p><label class="fld">Email or mobile number<input name="ident" autocapitalize="none"></label><button class="btn primary wide">Send code</button>'
      : '<p class="tag">Enter the code from your email and pick a new password.</p><label class="fld">6-digit code<input name="code" inputmode="numeric" maxlength="6"></label><label class="fld">New password<input name="pw" type="password" autocomplete="new-password"></label><button class="btn primary wide">Change password</button>'}
    </form><p id="autherr" class="err"></p><button class="link" data-act="auth-login">Back to log in</button></div>`;
}

async function onAuthSubmit(form) {
  const v = Object.fromEntries(new FormData(form).entries()), err = $('#autherr'), btn = $('button[type=submit]', form);
  err.textContent = '';
  if (!String(v.ident || '').trim() || !v.pw) { err.textContent = 'Enter your email/mobile and password.'; return; }
  btn.disabled = true;
  try {
    const reg = ui.authMode === 'reg';
    const r = await call(reg ? 'register' : 'login', { identifier: v.ident, password: v.pw, name: v.name, email: v.email, tz: tzName() });
    S = blank(); S.session = { token: r.token }; applyState(r.state); persist(); ui.friends = null; enterApp();
  } catch (e) { err.textContent = e.code === 'net' ? 'Cannot reach the server. Check your internet.' : e.message; btn.disabled = false; }
}

async function onResetSubmit(form) {
  const v = Object.fromEntries(new FormData(form).entries()), err = $('#autherr'), btn = $('button', form);
  err.textContent = ''; btn.disabled = true;
  try {
    if (ui.resetStep === 1) { ui.resetId = v.ident; await call('requestReset', { identifier: v.ident }); showForgot(2); $('#autherr').textContent = 'If the account has an email, a code was sent.'; }
    else { await call('resetPassword', { identifier: ui.resetId, code: v.code, newPassword: v.pw }); showAuth('login'); toast('Password changed. Please log in.'); }
  } catch (e) { err.textContent = e.message; btn.disabled = false; }
}

/* ---------- app shell ---------- */
function enterApp() {
  $('#auth').hidden = true; $('#app').hidden = false;
  applyTheme(S.profile.theme);
  ui.today = today(); ui.selected = ui.today; ui.cycleYear = cycleYearOf(ui.today); ui.monthIdx = ringOf(ui.today);
  $('#banner').textContent = DEMO ? 'Demo mode: your data is saved only on this device. Add your Apps Script URL in config.js for login, sync, friends and email reminders.' : '';
  let tab = TABS.includes(ui.startTab) ? ui.startTab : 'wheel';
  if (ui.addParam && !DEMO) { ui.addPrefill = ui.addParam; ui.addParam = ''; tab = 'friends'; }
  ui.startTab = '';
  setTab(tab); flush(); checkReminders();
}

/* ---------- reminders (in-app / background notifications) ---------- */
async function notify(title, body) {
  try { const reg = await navigator.serviceWorker.ready; await reg.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'dw-reminder' }); }
  catch (e) { try { new Notification(title, { body }); } catch (_) {} }
}
function checkReminders() {
  if (!S.profile || !S.profile.reminders || !S.profile.reminders.enabled) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date(), hm = `${p2(now.getHours())}:${p2(now.getMinutes())}`;
  if (!(S.profile.reminders.times || []).includes(hm)) return;
  const key = today() + '|' + hm; if (localStorage.getItem('dw.lastnotif') === key) return;
  const done = new Set(S.logs[today()] || []), pending = S.tasks.filter((t) => !done.has(t.id));
  if (!pending.length) return;
  localStorage.setItem('dw.lastnotif', key);
  notify(`${pending.length} task${pending.length > 1 ? 's' : ''} left today`, pending.slice(0, 4).map((t) => t.name).join(', ') + (pending.length > 4 ? '…' : ''));
}

/* ---------- events ---------- */
document.addEventListener('click', async (e) => {
  const sw = e.target.closest('[data-theme-pick]');
  if (sw) { S.profile.theme = sw.dataset.themePick; applyTheme(S.profile.theme); S.dirty.settings = true; persist(); queueSync(); return; }
  const tab = e.target.closest('[data-tab]'); if (tab) { setTab(tab.dataset.tab); return; }
  const cell = e.target.closest('[data-d]'); if (cell) { select(cell.dataset.d); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const u = el.dataset.u;
  switch (el.dataset.act) {
    case 'cycle-prev': ui.cycleYear--; renderParts(); break;
    case 'cycle-next': ui.cycleYear++; renderParts(); break;
    case 'zoom': ui.zoom = !ui.zoom; renderParts(); break;
    case 'day-prev': select(addDays(ui.selected, -1)); break;
    case 'day-next': select(addDays(ui.selected, 1)); break;
    case 'month-prev': shiftMonth(-1); break;
    case 'month-next': shiftMonth(1); break;
    case 'save-settings': saveSettings(); break;
    case 'logout': logout(false); break;
    case 'reset-demo': if (confirm('Delete all demo data on this device?')) { S = blank(); S.profile = newProfile(); persist(); enterApp(); } break;
    case 'auth-login': showAuth('login'); break;
    case 'auth-reg': showAuth('reg'); break;
    case 'forgot': showForgot(1); break;
    case 'install': if (ui.deferred) { ui.deferred.prompt(); ui.deferred = null; el.hidden = true; } break;
    case 'notif':
      if ('Notification' in window) { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Phone notifications enabled' : 'Notifications not allowed'); setTab('settings'); }
      break;
    case 'set-username': setUsername(); break;
    case 'invite': invite(); break;
    case 'pick-contacts': pickContacts(); break;
    case 'friend-add': { const name = u || ($('#f-add') && $('#f-add').value); if (!String(name || '').trim()) return toast('Enter a username'); friendCall('friendRequest', { username: name }, 'Request sent'); break; }
    case 'friend-accept': friendCall('friendRespond', { username: u, accept: true }, 'Friend added'); break;
    case 'friend-decline': friendCall('friendRespond', { username: u, accept: false }, 'Declined'); break;
    case 'friend-remove': if (confirm('Remove this friend / cancel request?')) friendCall('friendRemove', { username: u }, 'Removed'); break;
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('[data-task]')) toggleTask(t.dataset.task, t.checked);
  else if (t.id === 'monthsel') { ui.monthIdx = Number(t.value); renderParts(); }
  else if (t.matches('[data-tid]')) {
    const task = S.tasks.find((x) => x.id === t.dataset.tid), i = S.tasks.indexOf(task);
    if (!t.value.trim()) t.value = DEFAULTS[i] || 'Task ' + (i + 1);
    task.name = t.value.trim().slice(0, 40); S.dirty.tasks = true; persist(); queueSync(); toast('Task saved');
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.name === 'ident' && ui.authMode === 'reg') { const f = $('#emailfld'); if (f) f.hidden = t.value.includes('@') || !t.value.trim(); }
  if (t.matches('[data-tid]') && t.value.trim()) {
    const task = S.tasks.find((x) => x.id === t.dataset.tid); task.name = t.value.trim().slice(0, 40); S.dirty.tasks = true; persist(); queueSync();
  }
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const fid = e.target.getAttribute && e.target.getAttribute('id');
  if (fid === 'authform') onAuthSubmit(e.target);
  if (fid === 'resetform') onResetSubmit(e.target);
});

window.addEventListener('online', () => { flush(); refresh(); });
window.addEventListener('offline', setSync);
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ui.deferred = e; const b = $('#install'); if (b) b.hidden = false; });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { rollover(); refresh(); checkReminders(); } });

function rollover() {
  if (!S.profile || ui.today === today()) return;
  const wasToday = ui.selected === ui.today; ui.today = today();
  if (wasToday) { ui.selected = ui.today; ui.cycleYear = cycleYearOf(ui.today); ui.monthIdx = ringOf(ui.today); }
  renderParts();
}
setInterval(() => { rollover(); checkReminders(); }, 20000);

/* ---------- boot ---------- */
function boot() {
  const q = new URLSearchParams(location.search);
  ui.addParam = String(q.get('add') || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  ui.startTab = q.get('tab') || '';
  if (q.has('add') || q.has('tab')) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (DEMO) { if (!S.profile) { S.profile = newProfile(); persist(); } S.profile = Object.assign(newProfile(), S.profile); enterApp(); return; }
  if (S.session && S.profile) { S.profile = Object.assign(newProfile(), S.profile); enterApp(); refresh(); } else showAuth('login');
}
boot();
})();
