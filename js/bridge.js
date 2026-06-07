/* bridge.js — client for LAYER 2 (Google Apps Script bridge).
   Mirrors the proven action= contract of the parent project so the gold EA
   can reuse the same bridge shape. In mock mode every call is a safe no-op,
   so the demo runs with zero network. Flip CONFIG.dataMode + bridgeURL to live.

   ── CONTRACT (Web ⇄ Bridge ⇄ EA) ─────────────────────────────────────────
   Web GET  url?action=status&t=<ts>   -> { mode, phase, price, equity,
                                            position, daily, weekly, ts }
   Web GET  url?action=prices&t=<ts>   -> { "XAU/USD": { bid, ask, spread } }
   Web GET  url?action=trades&t=<ts>   -> [ { posId, side, lot, entry, ... } ]
   Web POST url  body={cmd:'PAUSE'|'RESUME'|'CLOSE_ALL'|'SIGNAL', ...}
                                        -> queued for the EA to poll
   EA  POST url  body={action:'status'|'trade', ...}  (writes the above)
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  const C = window.CONFIG;

  function url() { return C.bridgeURL.replace(/\/$/, ''); }
  function live() { return C.isLive(); }

  async function getJSON(action) {
    if (!live()) return null;
    try {
      const r = await fetch(`${url()}?action=${action}&t=${Date.now()}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('[bridge] GET', action, 'failed:', e.message);
      return null;
    }
  }

  async function getStatus() { return getJSON('status'); }
  async function getPrices() { return getJSON('prices'); }
  async function getTrades() { return getJSON('trades'); }

  // Queue a command for the EA. no-cors because Apps Script doesn't echo CORS.
  async function sendCommand(payload) {
    if (!live()) { console.info('[bridge] (mock) command:', payload); return false; }
    try {
      await fetch(url(), {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      return true;
    } catch (e) {
      console.warn('[bridge] POST command failed:', e.message);
      return false;
    }
  }

  let timer = null;
  // Poll the bridge and feed real state into the sim/UI. Falls back silently.
  function start(onStatus) {
    if (!live()) { console.info('[bridge] mock mode — demo data, no polling'); return; }
    async function tick() {
      const status = await getStatus();
      if (status && typeof onStatus === 'function') onStatus(status);
    }
    tick();
    timer = setInterval(tick, C.pollMs);
    console.info('[bridge] live — polling', url(), 'every', C.pollMs, 'ms');
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  window.Bridge = { getStatus, getPrices, getTrades, sendCommand, start, stop, isLive: live };
})();
