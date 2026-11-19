(() => {
'use strict';
const CFG = window.APP_CONFIG || {};
const API = String(CFG.API_URL || '').trim();
const DEMO = !API;
const KEY = 'daylog.v1';
const WHEEL_KEY = 'dailywheel.state.v1';   // Daily Wheel's storage: reuse its login if present
const EDIT_DAYS = 7;
const DEFAULTS = ['Exercise','2-litre water','6-hour sleep, on time','Skill development hour','Prayer',
  'Read 20 minutes','Healthy meals','No junk food','Journal','Plan tomorrow'];

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const p2 = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => fmt(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
const tzName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'; } catch (e) { return 'Asia/Kolkata'; } };
const defTasks = () => DEFAULTS.map((name, i) => ({ id: 't' + (i + 1), name }));
const blank = () => ({ session: null, profile: null, tasks: defTasks(), logs: {}, dirty: {} });

/* ---------- stars, streaks, theme (same rules as Daily Wheel) ---------- */
const starsOf = (n, total) => (total ? Math.min(5, Math.floor(n * 5 / total)) : 0);
const goalStars = () => Math.min(5, Math.max(1, (S.profile && S.profile.goalStars) || 3));
function dayStars(ds) {
  const ids = new Set(S.tasks.map((t) => t.id));
  return starsOf((S.logs[ds] || []).filter((id) => ids.has(id)).length, S.tasks.length);
}
function streak() {
  const goal = goalStars();
  let d = today(), cur = 0;
  if (dayStars(d) < goal) d = addDays(d, -1);
  while (cur < 800 && dayStars(d) >= goal) { cur++; d = addDays(d, -1); }
  return cur;
}
function applyTheme(t) {
  const th = t || 'auto';
  if (th === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = th;
  try { localStorage.setItem('dl.theme', th); } catch (e) {}
  const m = document.querySelector('meta[name=theme-color]');
  if (m) { const c = getComputedStyle(document.documentElement).getPropertyValue('--bar').trim(); if (c) m.content = c; }
}
function celebrate(stars) {
  const cols = ['#f59e0b', '#22c55e', '#38bdf8', '#f472b6', '#a78bfa'];
  let conf = '';
  for (let i = 0; i < 28; i++) conf += `<i style="left:${Math.random() * 100}%;background:${cols[i % 5]};animation-delay:${(Math.random() * 0.5).toFixed(2)}s;transform:rotate(${Math.floor(Math.random() * 360)}deg)"></i>`;
  document.querySelectorAll('.celebrate').forEach((x) => x.remove());
  const el = document.createElement('div');
  el.className = 'celebrate';
  el.innerHTML = `<div class="confetti">${conf}</div><div class="cbox"><div class="big">${'★'.repeat(stars)}</div><h2>${stars === 5 ? 'Perfect day!' : 'Goal achieved!'}</h2><p>${streak()}-day star streak 🔥</p></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

let S = (() => { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.tasks) return s; } catch (e) {} return blank(); })();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const ui = { selected: today(), mode: 'login', status: '' };

let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

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

let flushing = false, timer = null;
const queue = () => { clearTimeout(timer); timer = setTimeout(flush, 600); setStatus(); };
function setStatus() {
  const el = $('#st'); if (!el) return;
  el.textContent = DEMO ? 'Demo · this device only' : !navigator.onLine ? 'Offline · will sync'
    : flushing || Object.keys(S.dirty).length ? 'Saving…' : 'Synced ✓';
}
async function flush() {
  if (DEMO || !S.session || !navigator.onLine || flushing) return setStatus();
  flushing = true; setStatus();
  try {
    for (const d of Object.keys(S.dirty)) {
      const sent = JSON.stringify(S.logs[d] || []);
      await call('saveDay', { date: d, done: S.logs[d] || [] });
      if (JSON.stringify(S.logs[d] || []) === sent) delete S.dirty[d];
    }
    flushing = false; persist(); setStatus();
    if (Object.keys(S.dirty).length) queue();
  } catch (e) {
    flushing = false; persist(); setStatus();
    if (e.code === 'auth') { S = blank(); persist(); showAuth(); toast('Please log in again'); }
    else if (e.code === 'net' || e.code === 'bad') setTimeout(flush, 30000);
    else toast(e.message);
  }
}
function applyState(st) {
  const local = S.logs;
  S.logs = st.logs || {};
  for (const d of Object.keys(S.dirty)) S.logs[d] = local[d] || [];
  S.tasks = st.tasks && st.tasks.length ? st.tasks : defTasks();
  S.profile = st.profile; persist(); applyTheme(S.profile && S.profile.theme);
}
async function refresh() {
  if (DEMO || !S.session || !navigator.onLine) return;
  try { applyState((await call('getState')).state); render(); }
  catch (e) { if (e.code === 'auth') { S = blank(); persist(); showAuth(); } }
}

/* ---------- views ---------- */
const canEdit = (ds) => { const t = today(); return ds <= t && ds >= addDays(t, -(EDIT_DAYS - 1)); };
function cls(ds, id, done, t, start) {
  if (ds > t) return 'f';
  if (done.has(id)) return 'g';
  if (ds < start) return 'z';
  return ds === t ? 'p' : 'r';
}

function render() {
  if (!S.profile) return;
  const t = today(), start = S.profile.startDate || t, ds = ui.selected;
  const done = new Set(S.logs[ds] || []), tot = S.tasks.length, cnt = S.tasks.filter((x) => done.has(x.id)).length;
  const ed = canEdit(ds), isToday = ds === t, past = ds < t;
  const label = parse(ds).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  const CIRC = 2 * Math.PI * 42;
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6)).map((d) => {
    const dn = new Set(S.logs[d] || []);
    return `<button class="wd ${d === ds ? 'sel' : ''}" data-d="${d}" aria-label="${d}"><small>${parse(d).toLocaleDateString(undefined, { weekday: 'narrow' })}</small><b>${parse(d).getDate()}</b><div class="bars">${S.tasks.map((k) => `<i class="${cls(d, k.id, dn, t, start)}"></i>`).join('')}</div></button>`;
  }).join('');
  $('#root').innerHTML = `<div class="wrap">
    <div class="top"><h1>DayLog</h1><span id="st"></span></div>
    <div class="card hero"><svg class="ring" viewBox="0 0 100 100" role="img" aria-label="${cnt} of ${tot} done"><circle class="bg" cx="50" cy="50" r="42"/><circle class="fg" cx="50" cy="50" r="42" stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${(CIRC * (1 - (tot ? cnt / tot : 0))).toFixed(1)}"/><text x="50" y="58">${cnt}/${tot}</text></svg>
      <div><h2>${esc(label)}${isToday ? ' · Today' : ''}</h2><div class="stars" aria-label="${starsOf(cnt, tot)} of 5 stars">${'★'.repeat(starsOf(cnt, tot))}<span class="off">${'★'.repeat(5 - starsOf(cnt, tot))}</span></div>
        <p>${cnt === tot ? 'All done. Perfect day! 🎉' : past ? `<span class="miss">${tot - cnt} missed</span>` : `${tot - cnt} to go`} · 🔥 ${streak()}-day streak</p>
        <p style="font-size:12px">Goal ${goalStars()}★ = ${Math.ceil(goalStars() * tot / 5)} tasks</p></div></div>
    <div class="card"><div class="week">${week}</div></div>
    <div class="card"><ul>${S.tasks.map((x) => { const on = done.has(x.id);
      return `<li><button class="t ${on ? 'on' : past && ds >= start ? 'miss' : ''}" data-task="${x.id}" ${ed ? '' : 'disabled'} aria-pressed="${on}"><span class="box">${on ? '✓' : ''}</span><span class="tn">${esc(x.name)}</span></button></li>`; }).join('')}</ul>
      ${ed ? '' : `<p class="note">${ds > t ? 'This day has not started yet.' : 'Only the last ' + EDIT_DAYS + ' days can be edited.'}</p>`}</div>
    <p class="note" style="text-align:center">${DEMO ? 'Demo mode. ' : ''}Themes, task names, friends and the full-year wheel are in Daily Wheel.</p>
    <div style="text-align:center">${DEMO ? '' : '<button class="link" data-act="logout">Log out</button>'}</div></div>`;
  setStatus();
}

function showAuth() {
  const reg = ui.mode === 'reg';
  $('#root').innerHTML = `<div class="wrap auth"><div class="card"><img class="logo" src="icon.svg" alt=""><h1>DayLog</h1>
    <p class="note" style="margin:0 0 14px">Uses the same account as Daily Wheel.</p>
    <div class="seg"><button data-mode="login" class="${reg ? '' : 'on'}">Log in</button><button data-mode="reg" class="${reg ? 'on' : ''}">Create account</button></div>
    <form id="f" novalidate>${reg ? '<label class="fld">Your name<input name="name" autocomplete="name"></label>' : ''}
      <label class="fld">Email or mobile number<input name="ident" inputmode="email" autocomplete="username" autocapitalize="none"></label>
      <label class="fld">Password<input name="pw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}"></label>
      <button class="btn primary wide" type="submit">${reg ? 'Create account' : 'Log in'}</button></form><p class="err" id="err"></p></div></div>`;
}

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const m = e.target.closest('[data-mode]'); if (m) { ui.mode = m.dataset.mode; showAuth(); return; }
  const d = e.target.closest('[data-d]'); if (d) { ui.selected = d.dataset.d; render(); return; }
  const t = e.target.closest('[data-task]');
  if (t) {
    const ds = ui.selected; if (!canEdit(ds)) return;
    const set = new Set(S.logs[ds] || []), id = t.dataset.task, before = dayStars(ds), adding = !set.has(id);
    adding ? set.add(id) : set.delete(id);
    S.logs[ds] = [...set]; S.dirty[ds] = true; persist(); render(); queue();
    const after = dayStars(ds), goal = goalStars();
    if (adding && ((before < goal && after >= goal) || (before < 5 && after === 5))) celebrate(after);
    return;
  }
  if (e.target.closest('[data-act="logout"]')) { (async () => { try { await flush(); await call('logout'); } catch (x) {} S = blank(); persist(); showAuth(); })(); }
});

document.addEventListener('submit', async (e) => {
  e.preventDefault(); if (e.target.getAttribute('id') !== 'f') return;
  const v = Object.fromEntries(new FormData(e.target).entries()), err = $('#err'), btn = $('button[type=submit]');
  err.textContent = '';
  if (!String(v.ident || '').trim() || !v.pw) { err.textContent = 'Enter your email/mobile and password.'; return; }
  btn.disabled = true;
  try {
    const r = await call(ui.mode === 'reg' ? 'register' : 'login', { identifier: v.ident, password: v.pw, name: v.name, tz: tzName() });
    S = blank(); S.session = { token: r.token }; applyState(r.state); ui.selected = today(); render();
  } catch (x) { err.textContent = x.code === 'net' ? 'Cannot reach the server.' : x.message; btn.disabled = false; }
});

window.addEventListener('online', () => { flush(); refresh(); });
window.addEventListener('offline', setStatus);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (ui.selected < addDays(today(), -6) || (!canEdit(ui.selected) && ui.selected > today())) ui.selected = today();
  render(); refresh();
});

/* ---------- boot ---------- */
(function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (DEMO) {
    if (!S.profile) { S.profile = { name: 'Demo', identifier: 'demo', startDate: today(), tz: tzName() }; persist(); }
    render(); return;
  }
  if (!S.session) {                       // reuse Daily Wheel's login if it is already signed in on this device
    try { const w = JSON.parse(localStorage.getItem(WHEEL_KEY)); if (w && w.session && w.session.token) S.session = { token: w.session.token }; } catch (e) {}
  }
  if (S.session && S.profile) { render(); refresh(); flush(); }
  else if (S.session) { refresh().then(() => { if (!S.profile) showAuth(); }); }
  else showAuth();
})();
})();
