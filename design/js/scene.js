/* scene.js — room geometry, static background render, stations & waypoints */
(function () {
  'use strict';
  const P = PixelArt.PAL, rect = PixelArt.rect, px = PixelArt.px,
        hline = PixelArt.hline, vline = PixelArt.vline, blit = PixelArt.blit, shade = PixelArt.shade;

  const W = 220, H = 150, FLOOR_Y = 86;

  // station = where an agent goes "on duty"; pose anchor is the feet position
  const STATIONS = {
    desk:    { x: 104, y: 106, label: 'โต๊ะเทรด' },
    scanner: { x: 31,  y: 100, label: 'จุดเฝ้าตลาด' },
    hawk1:   { x: 30,  y: 130, label: 'โต๊ะวิเคราะห์' },
    hawk2:   { x: 46,  y: 134, label: 'โต๊ะวิเคราะห์' },
    hawk3:   { x: 40,  y: 122, label: 'โต๊ะวิเคราะห์' },
    sage:    { x: 184, y: 120, label: 'มุมความเสี่ยง' },
    iron:    { x: 160, y: 106, label: 'เทอร์มินัล MT5' }
  };
  // floor waypoints for idle wandering (kept clear of furniture)
  const WAYPOINTS = [
    { x: 70, y: 132 }, { x: 110, y: 138 }, { x: 150, y: 134 },
    { x: 90, y: 120 }, { x: 130, y: 122 }, { x: 60, y: 116 },
    { x: 168, y: 132 }, { x: 104, y: 128 }, { x: 46, y: 112 }, { x: 188, y: 138 }
  ];

  const STARS = [[24,16],[31,22],[40,15],[49,24],[55,18],[36,30],[44,38],[27,34],[58,32]];

  // ---- static room background (drawn once into bg canvas) ----------------
  function drawRoom(ctx, monActive) {
    // walls
    rect(ctx, 0, 0, W, FLOOR_Y, P.wall);
    rect(ctx, 0, 0, W, 10, P.wallTop);
    // subtle vertical light bands
    for (let x = 0; x < W; x += 22) rect(ctx, x, 10, 1, FLOOR_Y - 10, P.wallLit);
    rect(ctx, 0, FLOOR_Y - 4, W, 4, P.skirt); // skirting board

    drawWindow(ctx);
    drawClock(ctx, 198, 14);
    drawShelf(ctx, 78, 22);
    drawPosters(ctx, 150, 14);

    // ---- floor ----
    for (let y = FLOOR_Y; y < H; y++) {
      const band = ((y - FLOOR_Y) >> 2) % 2;
      rect(ctx, 0, y, W, 1, band ? P.floorA : P.floorB);
    }
    for (let y = FLOOR_Y + 2; y < H; y += 8) hline(ctx, 0, y, W, P.floorLine);
    // plank seams (slight perspective fan)
    for (let i = 0; i < 10; i++) {
      const sx = 10 + i * 22;
      for (let y = FLOOR_Y; y < H; y += 1) {
        if ((y % 8) < 7) px(ctx, sx + Math.round((sx - W / 2) * (y - FLOOR_Y) / 260), y, P.floorLine);
      }
    }
    drawRug(ctx);

    // ---- furniture (back to front, but front lips re-drawn later) ----
    drawScannerStation(ctx);
    drawMT5(ctx, monActive);
    drawSageCorner(ctx);
    drawHawkTable(ctx);
    drawDesk(ctx, monActive); // back portion; front lip via drawDeskFront
    drawPlant(ctx, 8, 60);
    drawPlant(ctx, 206, 70);
    drawLampGlow(ctx);
  }

  function drawRug(ctx) {
    const x = 72, y = 116, w = 80, h = 26;
    rect(ctx, x, y, w, h, P.rugEdge);
    rect(ctx, x + 2, y + 2, w - 4, h - 4, P.rug);
    // teal diamond pattern
    for (let i = 0; i < 5; i++) {
      const cx = x + 12 + i * 14, cy = y + h / 2;
      px(ctx, cx, cy - 2, P.rugAlt); rect(ctx, cx - 1, cy - 1, 3, 1, P.rugAlt);
      rect(ctx, cx - 2, cy, 5, 1, P.rugAlt); rect(ctx, cx - 1, cy + 1, 3, 1, P.rugAlt); px(ctx, cx, cy + 2, P.rugAlt);
    }
    hline(ctx, x + 2, y + 2, w - 4, shade(P.rug, 0.12));
  }

  function drawWindow(ctx) {
    const x = 16, y = 10, w = 46, h = 42;
    rect(ctx, x - 2, y - 2, w + 4, h + 4, P.frame);
    rect(ctx, x, y, w, h, P.sky);
    rect(ctx, x, y, w, 14, P.skyHi); // glow near top
    // moon
    rect(ctx, x + 33, y + 6, 6, 6, P.moon);
    rect(ctx, x + 34, y + 5, 4, 1, P.moon); rect(ctx, x + 34, y + 12, 4, 1, P.moon);
    px(ctx, x + 36, y + 8, shade(P.moon, -0.15));
    STARS.forEach(s => px(ctx, s[0], s[1], P.star));
    // mullions
    vline(ctx, x + w / 2, y, h, P.frame); hline(ctx, x, y + h / 2, w, P.frame);
    // city silhouette
    rect(ctx, x, y + h - 8, w, 8, '#0a1224');
    for (let i = 0; i < 6; i++) rect(ctx, x + 2 + i * 8, y + h - 6 - (i % 3) * 2, 5, 8, '#0c1730');
    // a few lit windows
    px(ctx, x + 5, y + h - 5, P.amber); px(ctx, x + 19, y + h - 4, P.amber); px(ctx, x + 35, y + h - 6, P.amber);
    // sill
    rect(ctx, x - 3, y + h + 2, w + 6, 2, P.frameLit);
  }

  function drawClock(ctx, x, y) {
    rect(ctx, x, y, 11, 11, P.frame); rect(ctx, x + 1, y + 1, 9, 9, '#dfe6f2');
    px(ctx, x + 5, y + 5, '#2a3550');
    vline(ctx, x + 5, y + 2, 3, '#2a3550'); hline(ctx, x + 6, y + 5, 3, '#7a8499');
  }

  function drawShelf(ctx, x, y) {
    rect(ctx, x, y + 8, 56, 2, P.shelf);
    // books
    const cols = ['#7b3f3f', '#3f6b7b', '#5a7b3f', '#7b6b3f', '#5a4a7b'];
    for (let i = 0; i < 14; i++) {
      const bx = x + 2 + i * 3, bh = 5 + (i % 3);
      if (i === 6) continue; // gap for trophy
      rect(ctx, bx, y + 8 - bh, 2, bh, cols[i % cols.length]);
    }
    // gold trophy in the gap
    rect(ctx, x + 18, y + 2, 4, 4, P.gold); rect(ctx, x + 19, y + 6, 2, 2, P.goldDk);
    px(ctx, x + 17, y + 3, P.gold); px(ctx, x + 22, y + 3, P.gold);
  }

  function drawPosters(ctx, x, y) {
    // two framed charts
    for (let i = 0; i < 2; i++) {
      const px0 = x + i * 22;
      rect(ctx, px0, y, 18, 16, P.frame); rect(ctx, px0 + 1, y + 1, 16, 14, '#101a30');
      // mini uptrend
      let yy = y + 12;
      for (let k = 0; k < 14; k++) { px(ctx, px0 + 2 + k, yy, i ? P.chartR : P.chartG); if (k % 2) yy += (i ? 1 : -1); yy = Math.max(y + 3, Math.min(y + 13, yy)); }
    }
  }

  function drawDesk(ctx, active) {
    const x = 84, y = 80, w = 50;
    // desktop
    rect(ctx, x, y, w, 6, P.deskTop);
    rect(ctx, x, y, w, 1, shade(P.deskTop, 0.2));
    // monitor
    const mx = x + 16, my = y - 22;
    rect(ctx, mx - 1, my - 1, 22, 18, P.monEdge);
    rect(ctx, mx, my, 20, 16, P.monBody);
    drawScreen(ctx, mx + 1, my + 1, 18, 14, active);
    rect(ctx, mx + 8, my + 16, 4, 3, P.monEdge); // stand
    rect(ctx, mx + 5, y - 1, 10, 1, P.monEdge);   // base
    // keyboard + mouse
    rect(ctx, x + 6, y + 2, 14, 2, '#c9cfdb'); rect(ctx, x + 24, y + 2, 3, 2, '#c9cfdb');
    // a small gold bar paperweight
    rect(ctx, x + 40, y + 1, 7, 3, P.gold); px(ctx, x + 40, y + 1, P.goldHi);
  }
  // front edge + legs re-drawn after characters so a seated trader is occluded
  function drawDeskFront(ctx) {
    const x = 84, y = 80, w = 50;
    rect(ctx, x, y + 6, w, 4, P.deskEdge);       // front apron
    rect(ctx, x + 2, y + 10, 3, 14, P.deskLeg);  // legs
    rect(ctx, x + w - 5, y + 10, 3, 14, P.deskLeg);
  }

  function drawScreen(ctx, x, y, w, h, active) {
    rect(ctx, x, y, w, h, active ? P.screen : '#0a1418');
    if (active) {
      // candlestick-ish uptrend
      let yy = y + h - 3;
      for (let k = 0; k < w; k += 2) {
        const up = (k % 4 === 0);
        const c = up ? P.chartG : P.chartR;
        rect(ctx, x + k, yy - (up ? 2 : 0), 1, 3, c);
        if (up) yy = Math.max(y + 2, yy - 1); else yy = Math.min(y + h - 1, yy + 1);
      }
      // price line
      hline(ctx, x, y + 2, w, P.amber);
      px(ctx, x + w - 2, y + 2, P.goldHi);
    } else {
      // sleeping dots
      px(ctx, x + 4, y + h - 3, '#27506b'); px(ctx, x + 8, y + h - 3, '#27506b'); px(ctx, x + 12, y + h - 3, '#27506b');
    }
  }

  function drawScannerStation(ctx) {
    const x = 18, y = 70;
    rect(ctx, x, y + 8, 26, 8, P.deskTop);     // table
    rect(ctx, x + 2, y + 16, 2, 6, P.deskLeg); rect(ctx, x + 22, y + 16, 2, 6, P.deskLeg);
    // radar scope
    rect(ctx, x + 4, y - 4, 14, 13, P.monEdge); rect(ctx, x + 5, y - 3, 12, 11, '#06201c');
    // radar sweep
    for (let r = 1; r <= 5; r += 2) { rect(ctx, x + 10 - r, y + 2 - r, r * 2 + 1, 1, P.chartGd); rect(ctx, x + 10 - r, y + 2 + r, r * 2 + 1, 1, P.chartGd); }
    px(ctx, x + 11, y + 2, P.chartG); vline(ctx, x + 11, y - 1, 3, P.chartG);
  }

  function drawMT5(ctx, active) {
    const x = 148, y = 64;
    rect(ctx, x, y, 22, 24, P.metalDk);          // server rack
    rect(ctx, x + 1, y + 1, 20, 22, P.metal);
    for (let i = 0; i < 5; i++) {
      const ry = y + 2 + i * 4;
      rect(ctx, x + 2, ry, 18, 3, P.metalDk);
      px(ctx, x + 4, ry + 1, (i % 2 ? P.led : P.ledAmber)); // status LEDs
      px(ctx, x + 6, ry + 1, active && i < 2 ? P.led : '#2a323e');
      rect(ctx, x + 13, ry + 1, 5, 1, '#2a323e');
    }
    rect(ctx, x, y + 24, 22, 2, P.metalHi);
    // "MT5" tag
    rect(ctx, x + 6, y - 4, 10, 4, P.ink); 
  }

  function drawSageCorner(ctx) {
    const x = 168, y = 96;
    // armchair
    rect(ctx, x, y, 18, 14, '#3a2e52');
    rect(ctx, x + 1, y + 1, 16, 6, '#4a3a6a'); // back cushion
    rect(ctx, x - 2, y + 4, 4, 9, '#3a2e52'); rect(ctx, x + 16, y + 4, 4, 9, '#3a2e52'); // arms
    // side table + scales (risk)
    rect(ctx, x + 22, y + 6, 8, 2, P.deskTop); rect(ctx, x + 25, y + 8, 2, 5, P.deskLeg);
    rect(ctx, x + 24, y + 2, 4, 1, P.gold); px(ctx, x + 23, y + 3, P.gold); px(ctx, x + 28, y + 3, P.gold);
  }

  function drawHawkTable(ctx) {
    const x = 22, y = 116;
    rect(ctx, x, y, 40, 12, shade(P.deskTop, -0.05)); // round-ish table
    rect(ctx, x + 2, y - 1, 36, 2, shade(P.deskTop, 0.18));
    rect(ctx, x + 18, y + 12, 4, 10, P.deskLeg);
    // three papers / a small chart on table
    rect(ctx, x + 6, y + 3, 7, 6, '#dfe6f2'); rect(ctx, x + 16, y + 3, 7, 6, '#dfe6f2'); rect(ctx, x + 26, y + 3, 7, 6, '#dfe6f2');
    hline(ctx, x + 7, y + 6, 5, P.chartG); hline(ctx, x + 17, y + 6, 5, P.chartR); hline(ctx, x + 27, y + 5, 5, P.amber);
  }

  function drawPlant(ctx, x, y) {
    rect(ctx, x + 1, y + 8, 6, 6, '#7a4a2c'); rect(ctx, x + 1, y + 8, 6, 1, '#8a5a36');
    rect(ctx, x, y, 8, 9, '#2f6b45'); rect(ctx, x + 1, y - 2, 6, 4, '#3a7d52'); px(ctx, x + 4, y - 3, '#46915f');
    px(ctx, x + 2, y + 2, '#256038'); px(ctx, x + 6, y + 4, '#256038');
  }

  function drawLampGlow(ctx) {
    // hanging lamp over desk
    vline(ctx, 109, 0, 14, '#1a2438');
    rect(ctx, 104, 12, 12, 4, '#2a2f3a'); rect(ctx, 105, 13, 10, 2, P.goldHi);
  }

  // soft additive glows drawn each frame on the live canvas
  function drawGlows(ctx, monActive) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // desk lamp warm pool
    radial(ctx, 109, 18, 40, 'rgba(255,206,120,0.10)');
    if (monActive) radial(ctx, 110, 70, 34, 'rgba(110,215,224,0.10)');
    radial(ctx, 38, 66, 18, 'rgba(95,224,138,0.06)'); // scanner
    ctx.restore();
  }
  function radial(ctx, cx, cy, r, col) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  }

  window.Scene = { W, H, FLOOR_Y, STATIONS, WAYPOINTS, drawRoom, drawDeskFront, drawGlows };
})();
