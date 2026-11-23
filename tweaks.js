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
.steps{margin:4px 0 12px;padding-left:20px}.steps li{margin:3px 0}`;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const $ = (s) => document.querySelector(s);
  const J = () => window.JusDaylog;
  let picked = false, promptedFor = null;
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
      if (dp && dpIsToday) dp.remove();                                           // today's list is already shown once
      else if (dp) wheelCard.parentNode.insertBefore(dp, wheelCard.nextSibling);   // a tapped past day sits right under the wheel
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
