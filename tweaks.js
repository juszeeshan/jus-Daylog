/* Jus Daylog: UX tweaks in their own file. app.js, styles.css and sw.js are NOT edited; this file only needs one <script> tag in index.html, after app.js. It only re-arranges what app.js has drawn and applies first-run defaults.
 *   1. Login screen: "Continue with Google" first, email/password below, demo is a small link at the bottom.
 *   2. Wheel tab: wheel on top, one checklist (today's) below it. Month tab: no checklist until a day is tapped.
 *   3. New accounts start with reminders + "find me by email/number" ON (and can switch them off in Settings).
 *   4. Settings: how to install the app on a phone from Chrome / Safari. */
(() => {
  'use strict';
  if (window.__jdTweaks) return; window.__jdTweaks = true;
  const CSS = `
.auth.k-auth{display:flex;flex-direction:column}
.k-auth .gbtn{margin:6px 0 2px}
.k-demo{background:none;border:0;color:var(--muted);text-decoration:underline;font-size:13px;padding:6px;margin:14px auto 0;width:auto;cursor:pointer}
.steps{margin:4px 0 12px;padding-left:20px}.steps li{margin:3px 0}
.wheel .cell.k-sel .hit{stroke:var(--accent);stroke-opacity:.28}
.wheel .hubdate{font-size:10px;font-weight:700;text-anchor:middle;fill:var(--muted)}
.k-sum{margin:2px 0 8px;font-size:14px}.k-miss{color:var(--red);font-weight:700}.k-ok{color:var(--green);font-weight:700}
.zoomctl .k-home{font-size:19px}`;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const $ = (s) => document.querySelector(s);
  const J = () => window.JusDaylog;
  let picked = false, pendingScroll = false, promptedFor = null;
  const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;

  function layoutAuth(auth) {
    auth.classList.add('k-auth');
    const set = (el, order, hide) => { if (!el) return; el.style.order = String(order); if (hide) el.style.display = 'none'; };
    const g = auth.querySelector('#g-btn'), ors = auth.querySelectorAll(':scope > .or'), ps = auth.querySelectorAll(':scope > p.muted');
    set(auth.querySelector(':scope > h2'), 1);
    set(ps[0], 2);
    set(g, 3);
    set(ors[0], 4, !g);
    set(auth.querySelector('.seg'), 5);
    set(auth.querySelector('#auth-form'), 6);
    set(auth.querySelector('#forgot'), 7);
    set(ors[1], 8, true);
    const demo = auth.querySelector('#start-demo'); if (demo) { demo.classList.add('k-demo'); demo.classList.remove('secondary', 'btn'); demo.textContent = 'Just looking? Open the demo account'; set(demo, 9); }
    if (ps.length > 1) set(ps[ps.length - 1], 10, true);
    // Google One Tap / account chooser: lets people pick their Google account without typing an email.
    if (g && promptedFor !== auth) {
      promptedFor = auth;
      setTimeout(() => { try { if (window.google && google.accounts && google.accounts.id && $('#g-btn')) google.accounts.id.prompt(); } catch (e) { /* ignore */ } }, 700);
    }
  }

  function arrange(root) {
    const wheelCard = root.querySelector('.wheel-wrap') && root.querySelector('.wheel-wrap').closest('section.card');
    const top = root.querySelector('.dashboard-top'), dp = root.querySelector('#day-panel');
    const dpIsToday = dp && /· Today/.test((dp.querySelector('b') || {}).textContent || '');
    if (wheelCard && top) {
      if (wheelCard.compareDocumentPosition(top) & FOLLOWING) { /* wheel already first */ } else top.parentNode.insertBefore(wheelCard, top);
      dayFocus(root, dp, dpIsToday);
      if (dp && dpIsToday) dp.remove();                                           // today's list is already shown once
      else if (dp) wheelCard.parentNode.insertBefore(dp, wheelCard.nextSibling);   // a tapped past day sits right under the wheel
      addHome(root);
      if (pendingScroll) { pendingScroll = false; const t = dp && !dpIsToday ? dp : root.querySelector('.daily-task-card'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
    const note = root.querySelector('#leave-demo'), noteCard = note && note.closest('section.card');
    if (noteCard && wheelCard && noteCard.compareDocumentPosition(wheelCard) & FOLLOWING) root.appendChild(noteCard);   // demo notice goes below, wheel stays on top
    const grid = root.querySelector('.month-grid');
    if (grid) {
      if (dp && dpIsToday && !picked) dp.remove();
      if (!picked && !root.querySelector('.k-hint')) { const h = document.createElement('p'); h.className = 'muted k-hint'; h.textContent = "Tap a day to see or change its tasks. Today's checklist is on the Wheel tab."; grid.parentNode.insertBefore(h, grid.nextSibling); }
      if (picked) { const h = root.querySelector('.k-hint'); if (h) h.remove(); }
    }
  }

  const LBL = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  let labelMap = null, labelKey = '';
  function dateOfPanel(root, dp) {                       // which day is the day panel showing? (match its heading to a wheel cell)
    const label = ((dp.querySelector('b') || {}).textContent || '').replace(/ · Today$/, '');
    const cells = [...root.querySelectorAll('.wheel .cell')]; if (!cells.length) return '';
    const key = cells[0].dataset.pick + cells.length;
    if (!labelMap || labelKey !== key) { labelMap = new Map(); labelKey = key; cells.forEach((c) => { const d = c.dataset.pick; labelMap.set(new Date(d + 'T12:00:00').toLocaleDateString(undefined, LBL), d); }); }
    return labelMap.get(label) || '';
  }
  const todayISO = () => { const st = J() && J().state; return window.JusLogic.todayIn((st && st.profile.tz) || undefined); };

  // The wheel follows the tapped day: highlighted spoke + centre shows that day's score; the list marks done vs missed.
  function dayFocus(root, dp, dpIsToday) {
    const st = J().state, n = st.tasks.length, T = todayISO();
    const sel = dp && !dpIsToday ? dateOfPanel(root, dp) : '';
    root.querySelectorAll('.wheel .cell.k-sel').forEach((c) => c.classList.remove('k-sel'));
    const hub = root.querySelector('.wheel .hubnum');
    if (hub && sel && sel !== T) {
      const done = (st.logs[sel] || []).length, stars = window.JusLogic.starsOf(done, n);
      hub.textContent = done + '/' + n;
      const hs = root.querySelector('.wheel .hubstars'); if (hs) hs.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
      let dl = root.querySelector('.wheel .hubdate');
      if (!dl) { dl = document.createElementNS('http://www.w3.org/2000/svg', 'text'); dl.setAttribute('class', 'hubdate'); dl.setAttribute('x', hub.getAttribute('x')); dl.setAttribute('y', String(Number(hub.getAttribute('y')) - 26)); hub.parentNode.appendChild(dl); }
      dl.textContent = new Date(sel + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
      const cell = root.querySelector('.wheel .cell[data-pick="' + sel + '"]'); if (cell) cell.classList.add('k-sel');
    }
    if (dp && !dpIsToday && !dp.querySelector('.k-sum') && dp.querySelector('.miss')) {        // a finished past day: show what was done and what failed
      let ok = 0, bad = 0;
      dp.querySelectorAll('.day-row').forEach((r) => { const m = r.lastElementChild, input = r.querySelector('input'); if (!m || !input) return; if (input.checked) ok++; else { bad++; m.textContent = '✗'; m.style.color = 'var(--red)'; m.style.fontWeight = '700'; } });
      const p = document.createElement('p'); p.className = 'k-sum'; p.innerHTML = '<span class="k-ok">✓ ' + ok + ' done</span> · <span class="k-miss">✗ ' + bad + ' missed</span>';
      const prog = dp.querySelector('.progress'); if (prog) prog.parentNode.insertBefore(p, prog.nextSibling);
    }
  }
  function addHome(root) {
    const ctl = root.querySelector('.zoomctl'); if (!ctl) return;
    let h = ctl.querySelector('.k-home');
    if (!h) { h = document.createElement('button'); h.className = 'k-home'; h.setAttribute('aria-label', 'Back to today'); h.title = 'Back to today'; h.textContent = '⌂'; ctl.appendChild(h); }
    h.setAttribute('data-select', todayISO());         // app.js already handles data-select: jumps to that day
  }
  function goHome() {                                    // after app.js has selected today: reset zoom, right year, top of page
    const z = document.querySelector('[data-zoom="0"]'); if (z) z.click();
    for (let i = 0; i < 6; i++) {
      const T = todayISO(), cells = [...document.querySelectorAll('.wheel .cell')];
      if (cells.some((c) => c.dataset.pick === T)) break;
      const nav = document.querySelector('[data-year="' + (T < (cells.length ? cells[0].dataset.pick : T) ? -1 : 1) + '"]'); if (!nav) break; nav.click();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const INSTALL = '<section class="card" id="k-install"><b>Install on your phone, like an app</b>'
    + '<p class="muted"><b>Android (Chrome)</b></p><ol class="steps"><li>Open this website in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu (top right).</li><li>Tap <b>Install app</b> (or <b>Add to Home screen</b>), then <b>Install</b>.</li><li>Open <b>Jus Daylog</b> from your home screen. It opens full screen, with no browser bar.</li></ol>'
    + '<p class="muted"><b>iPhone / iPad (Safari)</b></p><ol class="steps"><li>Open this website in <b>Safari</b>.</li><li>Tap <b>Share</b> (square with arrow), then <b>Add to Home Screen</b>.</li></ol>'
    + '<p class="muted" style="font-size:12px">When asked, tap <b>Allow</b> for notifications so reminders can reach you. On iPhone, notifications work only from the installed app.</p></section>';

  function settings(root) { if (root.querySelector('#save-settings') && !root.querySelector('#k-install')) root.insertAdjacentHTML('beforeend', INSTALL); }

  // New accounts: reminders and "find me" start ON. Existing accounts are never changed.
  function defaults() {
    const j = J(); if (!j) return; const st = j.state;
    if (!st || !st.token || st.token === 'demo' || !st.profile.identifier) return;
    const key = 'jd-defaults-' + st.profile.identifier;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) { return; }
    const p = st.profile, r = p.reminders || {};
    const brandNew = p.startDate === window.JusLogic.todayIn(p.tz) && !Object.keys(st.logs || {}).length && !r.enabled && !(r.times || []).length;
    if (!brandNew) return;
    p.reminders = { enabled: true, times: ['20:00'] }; p.discoverable = true;
    if (!st.dirty.includes('settings')) st.dirty.push('settings');        // app.js sends queued settings on its next sync
    try { localStorage.setItem('jus-daylog-v1', JSON.stringify(st)); } catch (e) { /* ignore */ }
    j.render(); window.dispatchEvent(new Event('online'));               // 'online' makes app.js sync right now
  }

  // Browsers only allow the notification prompt after a tap, so ask on the first tap once a signed-in user has reminders on.
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-select],[data-pick]'); if (t) picked = true;
    if (e.target.closest && e.target.closest('[data-pick]')) pendingScroll = true;
    if (e.target.closest && e.target.closest('.k-home')) { picked = false; setTimeout(goHome, 0); }
    if (e.target.closest && e.target.closest('[data-tab]')) picked = false;
    const j = J(); if (!j || !('Notification' in window) || Notification.permission !== 'default') return;
    const st = j.state; if (!st.token || st.token === 'demo' || !(st.profile.reminders || {}).enabled) return;
    try { if (localStorage.getItem('jd-asked-notif')) return; localStorage.setItem('jd-asked-notif', '1'); } catch (x) { return; }
    Notification.requestPermission().then(() => j.render()).catch(() => {});
  }, true);

  function tidy() {
    const root = $('#root'); if (!root) return;
    obs.disconnect();
    try {
      const auth = root.querySelector('section.auth');
      if (auth && root.querySelector('#auth-form')) layoutAuth(auth); else promptedFor = null;
      arrange(root); settings(root);
    } finally { obs.observe(root, { childList: true, subtree: true }); }
    defaults();
  }
  const obs = new MutationObserver(tidy);
  const start = () => { const root = $('#root'); if (!root) return; tidy(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
