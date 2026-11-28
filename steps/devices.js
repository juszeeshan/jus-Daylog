/* Jus Steps: devices (several watches over Bluetooth, manual watches, and QR transfer between your own phones).
 * Honest limits: Web Bluetooth can only use STANDARD Bluetooth services. A watch such as NoiseFit keeps its steps/sleep history in a private
 * format that only its own app can read, so steps for a watch are entered here by hand (copy from the NoiseFit app). What can work over
 * Bluetooth, if the watch offers the standard services: battery level, live heart rate, and setting the watch clock (Current Time Service). */
(function (root) {
  'use strict';
  const SVC = { battery: 'battery_service', hr: 'heart_rate', time: 'current_time', info: 'device_information' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- pure helpers (unit-tested) ---------- */
  function parseHR(dv) { const flags = dv.getUint8(0); return (flags & 1) ? dv.getUint16(1, true) : dv.getUint8(1); }       // Heart Rate Measurement characteristic
  function timeBytes(d) {                                                                                                // Current Time characteristic (0x2A2B), local time
    const dow = d.getDay() === 0 ? 7 : d.getDay(), y = d.getFullYear();
    return new Uint8Array([y & 255, y >> 8, d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), dow, Math.floor(d.getMilliseconds() * 256 / 1000), 1]);
  }
  function readTime(dv) { return new Date(dv.getUint16(0, true), dv.getUint8(2) - 1, dv.getUint8(3), dv.getUint8(4), dv.getUint8(5), dv.getUint8(6)); }
  const b64 = (s) => { const u = unescape(encodeURIComponent(s)); return (typeof btoa === 'function' ? btoa(u) : Buffer.from(u, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64 = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const u = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'); return decodeURIComponent(escape(u)); };
  /* The QR text is ASCII: "JS1." + base64url(JSON). Only the last 3 days of totals are shared. */
  function encodePayload(o) { return 'JS1.' + b64(JSON.stringify(o)); }
  function decodePayload(text) {
    text = String(text || '').trim(); if (text.indexOf('JS1.') !== 0 || text.length > 2000) throw new Error('This is not a Jus Steps code.');
    let o; try { o = JSON.parse(unb64(text.slice(4))); } catch (e) { throw new Error('This code is damaged. Try again.'); }
    if (!o || o.v !== 1 || typeof o.id !== 'string' || o.id.length > 40 || typeof o.d !== 'object' || !Number.isFinite(o.t)) throw new Error('This is not a Jus Steps code.');
    const d = {}; Object.keys(o.d).slice(0, 14).forEach((k) => { const n = Math.round(Number(o.d[k])); if (/^\d{4}-\d{2}-\d{2}$/.test(k) && n >= 0 && n <= 200000) d[k] = n; });
    return { v: 1, id: o.id.replace(/[^\w-]/g, ''), n: String(o.n || 'Phone').slice(0, 30), t: o.t, d: d };
  }

  function create(ctx) {
    const { C } = ctx, S = () => ctx.S(), live = {};                       // live[id] = { dev, server, battery, hr, status, offset, services }
    const ui = { scanning: false, qr: '', paste: false, msg: '', stream: null };
    const devById = (id) => S().devices.find((d) => d.id === id);
    const today = () => ctx.todayISO();

    /* ---- Bluetooth ---- */
    const hasBLE = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;
    async function pair(existing) {
      const opts = { optionalServices: [SVC.battery, SVC.hr, SVC.time, SVC.info] };
      if (existing && existing.bleName) opts.filters = [{ name: existing.bleName }]; else opts.acceptAllDevices = true;
      const dev = await navigator.bluetooth.requestDevice(opts);
      const id = existing ? existing.id : 'ble:' + dev.id;
      let rec = devById(id);
      if (!rec) { rec = { id, kind: 'ble', name: dev.name || 'Watch', bleName: dev.name || '', added: Date.now() }; S().devices.push(rec); }
      rec.bleName = dev.name || rec.bleName;
      live[id] = Object.assign(live[id] || {}, { dev, status: 'connecting' });
      dev.addEventListener('gattserverdisconnected', () => { if (live[id]) { live[id].status = 'disconnected'; live[id].hr = 0; } ctx.draw(); });
      ctx.save(true); ctx.draw();
      await connect(id);
    }
    async function connect(id) {
      const L = live[id]; if (!L || !L.dev) return;
      try {
        L.status = 'connecting'; ctx.draw(); L.server = await L.dev.gatt.connect(); L.status = 'connected'; L.services = [];
        try { L.services = (await L.server.getPrimaryServices()).map((s) => s.uuid); } catch (e) { /* some browsers refuse a full listing */ }
        try { const s = await L.server.getPrimaryService(SVC.battery), c = await s.getCharacteristic('battery_level'); L.battery = (await c.readValue()).getUint8(0);
          try { await c.startNotifications(); c.addEventListener('characteristicvaluechanged', (e) => { L.battery = e.target.value.getUint8(0); ctx.draw(); }); } catch (e) { /* optional */ } } catch (e) { L.battery = null; }
        try { const s = await L.server.getPrimaryService(SVC.hr), c = await s.getCharacteristic('heart_rate_measurement'); await c.startNotifications(); L.hasHR = true;
          c.addEventListener('characteristicvaluechanged', (e) => { const bpm = parseHR(e.target.value); if (bpm > 25 && bpm < 240) { L.hr = bpm; recordHR(id, bpm); ctx.drawSoon(); } }); } catch (e) { L.hasHR = false; }
        try { await L.server.getPrimaryService(SVC.time); L.hasTime = true; } catch (e) { L.hasTime = false; }
        if (L.hasTime) await syncTime(id, true);
      } catch (err) { L.status = 'disconnected'; ui.msg = 'Could not connect: ' + (err && err.message || err); }
      ctx.draw();
    }
    function recordHR(id, bpm) { const d = ctx.day(today()); d.hrs = d.hrs || {}; const h = d.hrs[id] = d.hrs[id] || { n: 0, sum: 0, min: bpm, max: bpm }; h.n++; h.sum += bpm; h.min = Math.min(h.min, bpm); h.max = Math.max(h.max, bpm); ctx.save(); }
    async function syncTime(id, quiet) {                                  // reads the watch clock, then writes the phone's time
      const L = live[id]; if (!L || !L.server) return;
      try {
        const svc = await L.server.getPrimaryService(SVC.time), ch = await svc.getCharacteristic('current_time');
        try { L.offset = readTime(await ch.readValue()).getTime() - Date.now(); } catch (e) { L.offset = null; }
        await ch.writeValue(timeBytes(new Date())); L.synced = Date.now();
        ui.msg = (L.offset == null ? '' : 'Watch was ' + Math.abs(Math.round(L.offset / 1000)) + ' s ' + (L.offset < 0 ? 'behind' : 'ahead') + '. ') + 'Time sent to the watch.';
      } catch (err) { L.hasTime = false; if (!quiet) ui.msg = 'This watch does not accept a time update over standard Bluetooth. NoiseFit sets the clock itself when it syncs.'; }
      if (!quiet) ctx.draw();
    }
    function disconnect(id) { const L = live[id]; if (L && L.dev && L.dev.gatt && L.dev.gatt.connected) L.dev.gatt.disconnect(); if (L) { L.status = 'disconnected'; L.hr = 0; } }

    /* ---- QR ---- */
    function myPayload() {
      const T = today(), d = {}; for (let i = 0; i < 3; i++) { const x = C.addDays(T, -i), s = (ctx.peek(x) || {}).steps || 0; if (s) d[x] = s; }
      return encodePayload({ v: 1, id: S().id, n: S().name || 'My phone', t: Date.now(), d: d });
    }
    function importText(text) {
      const p = decodePayload(text); if (p.id === S().id) throw new Error('That is this phone’s own code.');
      const id = 'qr:' + p.id; let rec = devById(id);
      if (!rec) { rec = { id, kind: 'qr', name: p.n, added: Date.now() }; S().devices.push(rec); } else rec.name = p.n;
      let n = 0; Object.keys(p.d).forEach((x) => { const dd = ctx.day(x); dd.src = dd.src || { phone: dd.steps || 0 }; dd.src[id] = p.d[x]; ctx.recompute(dd); n++; });
      rec.lastSync = Date.now(); ctx.save(true);
      const age = Math.round((Date.now() - p.t) / 1000), skew = age > 120 ? ' The code is ' + Math.round(age / 60) + ' min old.' : ' Clocks differ by about ' + Math.abs(age) + ' s.';
      return 'Imported ' + n + ' day' + (n === 1 ? '' : 's') + ' from “' + p.n + '”.' + skew;
    }
    async function startScan() {
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices) { ui.paste = true; ui.msg = 'This browser cannot scan QR codes. Paste the code text instead.'; ctx.draw(); return; }
      try {
        ui.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); ui.scanning = true; ctx.draw();
        const v = document.getElementById('qr-video'); v.srcObject = ui.stream; await v.play();
        const det = new BarcodeDetector({ formats: ['qr_code'] });
        const loop = async () => {
          if (!ui.scanning) return;
          try { const r = await det.detect(v); if (r.length) { const text = r[0].rawValue; stopScan(); try { ui.msg = importText(text); } catch (e) { ui.msg = e.message; } ctx.draw(); return; } } catch (e) { /* keep trying */ }
          setTimeout(loop, 250);
        };
        loop();
      } catch (err) { ui.scanning = false; ui.paste = true; ui.msg = 'Camera not available (' + (err && err.name || 'blocked') + '). Paste the code text instead.'; ctx.draw(); }
    }
    function stopScan() { ui.scanning = false; if (ui.stream) { ui.stream.getTracks().forEach((t) => t.stop()); ui.stream = null; } }

    /* ---- view ---- */
    const ago = (ms) => (ms ? Math.max(0, Math.round((Date.now() - ms) / 60000)) + ' min ago' : '—');
    function card(dev) {
      const L = live[dev.id] || {}, d = ctx.peek(today()), y = ctx.peek(C.addDays(today(), -1)), hr = (d.hrs || {})[dev.id];
      const icon = dev.kind === 'ble' ? '⌚' : dev.kind === 'qr' ? '📱' : '✍️', st = dev.kind === 'ble' ? (L.status === 'connected' ? '<span class="pill">● Connected</span>' : L.status === 'connecting' ? '<span class="pill warn">Connecting…</span>' : '<span class="pill warn">Not connected</span>') : '';
      return `<section class="card"><div class="row between"><div><b>${icon} ${esc(dev.name)}</b> ${st}</div><button class="btn small ghost" data-a="dev-remove" data-v="${esc(dev.id)}" style="color:var(--red)">Remove</button></div>
        ${dev.kind === 'ble' ? `<div class="small muted" style="margin-top:6px">${L.battery != null && L.battery !== undefined ? '🔋 ' + L.battery + '%' : ''} ${L.hr ? ' · ❤ <b style="color:var(--red)">' + L.hr + ' bpm</b>' : L.hasHR === false && L.status === 'connected' ? ' · No heart-rate sharing' : ''}${hr ? ` · today ${Math.round(hr.sum / hr.n)} avg (${hr.min}–${hr.max})` : ''}${L.synced ? ' · time synced ' + ago(L.synced) : ''}</div>
          <div class="row" style="flex-wrap:wrap;margin-top:8px">${L.status === 'connected' ? `<button class="btn small ghost" data-a="dev-disconnect" data-v="${esc(dev.id)}">Disconnect</button>${L.hasTime !== false ? `<button class="btn small ghost" data-a="dev-time" data-v="${esc(dev.id)}">⏱ Sync time</button>` : ''}` : `<button class="btn small" data-a="dev-reconnect" data-v="${esc(dev.id)}">Connect</button>`}</div>
          ${L.services && L.services.length ? `<details class="small muted" style="margin-top:8px"><summary>What this watch shares (${L.services.length})</summary><div style="word-break:break-all">${L.services.map(esc).join('<br>')}</div></details>` : ''}` : ''}
        ${dev.kind === 'qr' ? `<div class="small muted">Imported by QR · ${ago(dev.lastSync)}</div>` : ''}
        ${dev.kind !== 'qr' ? `<div class="grid2" style="margin-top:10px"><label>Steps today<input data-steps="${esc(dev.id)}" data-day="${today()}" type="number" inputmode="numeric" min="0" placeholder="${(d.src || {})[dev.id] || 0}" value="${(d.src || {})[dev.id] || ''}"></label>
          <label>Steps yesterday<input data-steps="${esc(dev.id)}" data-day="${C.addDays(today(), -1)}" type="number" inputmode="numeric" min="0" value="${(y.src || {})[dev.id] || ''}"></label></div><button class="btn small" data-a="dev-steps" data-v="${esc(dev.id)}" style="margin-top:8px">Save steps</button>
          <div class="small muted" style="margin-top:6px">${dev.kind === 'ble' ? 'Steps are not available over standard Bluetooth. Copy them from the NoiseFit app.' : 'Copy the number from the watch app.'}</div>` : `<div class="small muted" style="margin-top:6px">Today: ${((d.src || {})[dev.id] || 0).toLocaleString()} steps</div>`}</section>`;
    }
    function view() {
      const s = S(), devs = s.devices;
      const qr = ui.qr ? `<section class="card center"><b>Scan this on your other phone</b><div style="background:#fff;border-radius:14px;padding:6px;display:inline-block;margin:10px 0" id="qr-box">${root.QRMake(ui.qr, 'M').svg(Math.min(300, window.innerWidth - 90))}</div><div class="small muted">Valid for the numbers shown now · last 3 days of totals</div><div class="row" style="margin-top:8px"><button class="btn small ghost grow" data-a="dev-copy">Copy code</button><button class="btn small ghost grow" data-a="dev-qr-close">Close</button></div></section>` : '';
      const scan = ui.scanning ? `<section class="card center"><b>Point the camera at the QR code</b><video id="qr-video" playsinline muted style="width:100%;border-radius:14px;margin-top:8px;background:#000"></video><button class="btn ghost wide" data-a="dev-scan-stop" style="margin-top:8px">Cancel</button></section>` : '';
      const paste = ui.paste ? `<section class="card"><b>Paste the code</b><textarea id="qr-text" rows="3" placeholder="JS1.…" style="margin:8px 0"></textarea><div class="row"><button class="btn grow" data-a="dev-import">Import</button><button class="btn ghost grow" data-a="dev-paste-close">Close</button></div></section>` : '';
      return `<h1>Devices</h1><p class="muted small center">Several watches and phones, one total.</p>${ui.msg ? `<section class="card banner small">${esc(ui.msg)}<br><button class="btn small ghost" data-a="dev-msg-close" style="margin-top:6px">OK</button></section>` : ''}
        <section class="card"><h2>Steps in the ring come from</h2><select id="dev-source"><option value="max" ${s.settings.source === 'max' ? 'selected' : ''}>Highest of phone and all watches (no double counting)</option><option value="phone" ${s.settings.source === 'phone' ? 'selected' : ''}>This phone only</option>${devs.map((d) => `<option value="${esc(d.id)}" ${s.settings.source === d.id ? 'selected' : ''}>${esc(d.name)} only</option>`).join('')}</select>
        <p class="muted small" style="margin:8px 0 0">Your phone and watch both count the same walk, so adding them would double the total. “Highest” keeps the better of the two.</p></section>
        ${devs.map(card).join('') || '<section class="card muted center">No watches yet.</section>'}
        <section class="card"><h2>Add a watch</h2>${hasBLE() ? '<button class="btn wide" data-a="dev-pair">🔵 Pair over Bluetooth</button><p class="small muted">Choose your watch from the list. Close the NoiseFit app first if the watch does not show up, because a watch usually talks to one app at a time. Repeat for each watch.</p>' : '<p class="small muted">Bluetooth pairing needs Chrome on Android (or desktop Chrome). This browser does not support it.</p>'}
        <div class="row" style="margin-top:8px"><input id="dev-name" placeholder="Watch name (no Bluetooth)" maxlength="30"><button class="btn ghost" data-a="dev-add">Add</button></div></section>
        <section class="card"><h2>QR transfer between your phones</h2><div class="row"><button class="btn grow" data-a="dev-qr">Show my QR</button><button class="btn ghost grow" data-a="dev-scan">Scan a QR</button></div><button class="link small" data-a="dev-paste" style="background:none;border:0;color:var(--blue);margin-top:8px">Paste a code instead</button></section>
        ${qr}${scan}${paste}`;
    }
    function act(a, b) {
      const id = b.dataset.v, val = (q) => (document.querySelector(q) || {}).value || '';
      try {
        if (a === 'dev-pair') { pair().catch((e) => { if (!(e && e.name === 'NotFoundError')) ui.msg = 'Pairing failed: ' + (e && e.message || e); ctx.draw(); }); return; }
        if (a === 'dev-reconnect') { const rec = devById(id), L = live[id]; if (L && L.dev) connect(id); else pair(rec).catch((e) => { if (!(e && e.name === 'NotFoundError')) ui.msg = 'Pairing failed: ' + (e && e.message || e); ctx.draw(); }); return; }
        if (a === 'dev-disconnect') disconnect(id);
        else if (a === 'dev-time') { syncTime(id); return; }
        else if (a === 'dev-remove') { if (!confirm('Remove this device and its steps?')) return; disconnect(id); delete live[id]; S().devices = S().devices.filter((d) => d.id !== id); Object.keys(S().days).forEach((x) => { const d = S().days[x]; if (d.src && d.src[id] !== undefined) { delete d.src[id]; ctx.recompute(d); } }); if (S().settings.source === id) { S().settings.source = 'max'; } ctx.recomputeAll(); ctx.save(true); }
        else if (a === 'dev-add') { const n = val('#dev-name').trim(); if (!n) { ui.msg = 'Type a name first, for example “Noise ColorFit”.'; } else { S().devices.push({ id: 'man:' + Date.now().toString(36), kind: 'manual', name: n.slice(0, 30), added: Date.now() }); ctx.save(true); } }
        else if (a === 'dev-steps') { document.querySelectorAll('input[data-steps]').forEach((i) => { if (i.dataset.steps !== id || i.value === '') return; const dd = ctx.day(i.dataset.day); dd.src = dd.src || { phone: dd.steps || 0 }; dd.src[id] = Math.min(200000, Math.max(0, Math.round(Number(i.value)) || 0)); ctx.recompute(dd); }); ctx.save(true); ui.msg = 'Saved.'; }
        else if (a === 'dev-qr') { ui.qr = myPayload(); }
        else if (a === 'dev-qr-close') ui.qr = '';
        else if (a === 'dev-copy') { navigator.clipboard && navigator.clipboard.writeText(ui.qr).then(() => ctx.toast('Copied')); return; }
        else if (a === 'dev-scan') { startScan(); return; }
        else if (a === 'dev-scan-stop') stopScan();
        else if (a === 'dev-paste') ui.paste = true;
        else if (a === 'dev-paste-close') ui.paste = false;
        else if (a === 'dev-import') { ui.msg = importText(val('#qr-text')); ui.paste = false; }
        else if (a === 'dev-msg-close') ui.msg = '';
      } catch (e) { ui.msg = e.message || String(e); }
      ctx.draw();
    }
    return { view, act, ui, importText, myPayload, holdDraw: () => ui.scanning, live };
  }
  root.StepsDevices = { create, parseHR, timeBytes, readTime, encodePayload, decodePayload };
  if (typeof module === 'object' && module.exports) module.exports = root.StepsDevices;
})(typeof window !== 'undefined' ? window : globalThis);
