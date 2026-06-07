/* main.js — boot, canvas scaling, render loop, tap handling */
(function () {
  'use strict';
  const S = Scene, W = S.W, H = S.H;

  const canvas = document.getElementById('room');
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  ctx.imageSmoothingEnabled = false;

  // offscreen background (re-rendered only when monitor state flips)
  const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
  const bgx = bg.getContext('2d'); bgx.imageSmoothingEnabled = false;
  let lastMon = null;
  function renderBg(mon) { S.drawRoom(bgx, mon); lastMon = mon; }

  function layout() {
    const stage = document.getElementById('stage');
    const dispW = stage.clientWidth;
    const scale = dispW / W;
    canvas.style.width = dispW + 'px';
    canvas.style.height = Math.round(H * scale) + 'px';
    window.__room = { scale, offX: 0, offY: 0 };
  }
  window.addEventListener('resize', layout);

  // taps
  canvas.addEventListener('pointerdown', e => {
    const rect = canvas.getBoundingClientRect();
    const lx = (e.clientX - rect.left) / (rect.width / W);
    const ly = (e.clientY - rect.top) / (rect.height / H);
    const a = Agents.pick(lx, ly);
    if (a) { UI.showAgentPopup(a); e.stopPropagation(); }
    else UI.hidePopup();
  });

  // ---- boot ----
  Sim.init();
  UI.init();
  layout();
  renderBg(Sim.monActive());

  // LAYER 2 — start polling the bridge in live mode; mock mode is a no-op.
  // Live status overwrites demo state; the room/agents keep animating either way.
  Bridge.start(status => Sim.applyLive(status));
  const footEl = document.getElementById('footNote');
  const connBtn = document.getElementById('connBtn');
  const connLabel = document.getElementById('connLabel');
  if (CONFIG.isLive()) {
    if (footEl) footEl.textContent = 'LIVE — เชื่อมต่อ bridge แล้ว • magic ' + CONFIG.magic;
    if (connBtn) connBtn.classList.add('live');
    if (connLabel) connLabel.textContent = 'เชื่อมต่อแล้ว';
  }

  let last = performance.now();
  function frame() {
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05; // clamp

    Sim.update(dt);
    Agents.update(dt, Sim.data.mode);

    const mon = Sim.monActive();
    if (mon !== lastMon) renderBg(mon);

    // draw scene
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);
    Agents.draw(ctx, now / 1000);
    S.drawDeskFront(ctx);     // occlude seated trader's legs
    S.drawGlows(ctx, mon);

    if (Sim.isDirty()) { UI.render(); Sim.clearDirty(); }
  }
  frame();                       // immediate first paint
  setInterval(frame, 1000 / 30); // 30fps — robust even when rAF is throttled
})();
