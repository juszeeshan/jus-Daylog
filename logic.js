/* Jus Daylog: pure helpers shared by the app and by the unit tests (no DOM access).
 * Dates are plain "YYYY-MM-DD" strings. NEVER use Date#toISOString() for them:
 * it converts to UTC and shifts every date by one day for users east of UTC (e.g. India). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JusLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const p2 = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoOf(d); };
  const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m is 1-based

  const fmtCache = new Map();
  /** Today's date ("YYYY-MM-DD") in the given IANA time zone. */
  function todayIn(tz, now) {
    let f = fmtCache.get(tz);
    if (!f) {
      try { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); }
      catch (e) { f = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }); }
      fmtCache.set(tz, f);
    }
    const parts = {};
    f.formatToParts(now || new Date()).forEach((p) => { parts[p.type] = p.value; });
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  /** 5 stars are spread over the day's tasks: with 10 tasks, 1 star per 2 tasks. */
  const starsOf = (done, total) => Math.min(5, Math.floor(done * 5 / (total || 10)));
  const doneCount = (logs, d) => (logs[d] || []).length;
  const metGoal = (logs, d, goal) => starsOf(doneCount(logs, d)) >= goal;

  /** Consecutive days that reached the goal. Today not finished yet does not break it. */
  function streak(logs, goal, today) {
    let d = today;
    if (!metGoal(logs, d, goal)) d = addDays(d, -1);
    let n = 0;
    while (n < 800 && metGoal(logs, d, goal)) { n++; d = addDays(d, -1); }
    return n;
  }

  function bestStreak(logs, goal) {
    let best = 0, run = 0, prev = '';
    Object.keys(logs).sort().forEach((d) => {
      if (metGoal(logs, d, goal)) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; if (run > best) best = run; prev = d; }
    });
    return best;
  }

  /** Days in a row on which BOTH people reached their own goal. */
  function duoStreak(logsA, goalA, logsB, goalB, today) {
    const both = (d) => metGoal(logsA, d, goalA) && metGoal(logsB, d, goalB);
    let d = today;
    if (!both(d)) d = addDays(d, -1);
    let n = 0;
    while (n < 800 && both(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  /** The year (calendar) in which the 12-month cycle containing `today` starts. */
  function cycleStartYear(today, startMonth) {
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
    return m >= startMonth ? y : y - 1;
  }
  /** { y, m } of ring i (0..11) for a cycle that starts in `startMonth` of `cycleYear`. */
  function ringMonth(cycleYear, startMonth, i) {
    const idx = startMonth - 1 + i;
    return { y: cycleYear + Math.floor(idx / 12), m: (idx % 12) + 1 };
  }
  function cycleRange(cycleYear, startMonth) {
    const last = ringMonth(cycleYear, startMonth, 11);
    return { start: `${cycleYear}-${p2(startMonth)}-01`, end: `${last.y}-${p2(last.m)}-${p2(daysInMonth(last.y, last.m))}` };
  }

  /** Completion % over every day in [from, to], including days with no log (those count as missed). */
  function completionPct(logs, from, to, total) {
    if (!from || !to || from > to) return 0;
    let days = 0, done = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) { days++; done += doneCount(logs, d); }
    return days ? Math.round(done / (days * (total || 10)) * 100) : 0;
  }

  return { p2, isoOf, parseISO, addDays, daysInMonth, todayIn, starsOf, doneCount, metGoal, streak, bestStreak,
    duoStreak, cycleStartYear, ringMonth, cycleRange, completionPct };
});
