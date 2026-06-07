/* agents.js — the 7 AI workers: config, movement, animation, activity text */
(function () {
  'use strict';
  const P = PixelArt.PAL, S = Scene;

  const DEFS = [
    { id:'aurum',  name:'AURUM',  role:'เทรดเดอร์ทอง', tag:'TRADER',
      cfg:{hair:'#2a2118',skin:'#e8b48a',shirt:P.gold,pants:'#34507a',acc:'headset'},
      station:'desk', accent:P.gold,
      idle:'ลับมือรอจังหวะ จิบกาแฟอยู่หน้าจอ ☕' },
    { id:'scanner',name:'SCANNER',role:'ยามเฝ้าตลาด', tag:'SCAN',
      cfg:{hair:'#3a2a18',skin:'#d49a6a',shirt:'#3f9a5c',pants:'#2c3e2c',acc:'cap',accColor:'#2f7d4a'},
      station:'scanner', accent:'#5fe08a',
      idle:'กวาดสายตาทุก 20 วิ — คำนวณ MA/RSI/ATR/ADX' },
    { id:'hawk1',  name:'HAWK-1', role:'นักวิเคราะห์ • สายเทรนด์', tag:'TREND',
      cfg:{hair:'#4a3520',skin:'#e8b48a',shirt:'#3d6ea8',pants:'#24324a',acc:'glasses'},
      station:'hawk1', accent:'#69a8e0',
      idle:'อ่านเทรนด์ H1 — รอ SCANNER ปลุก' },
    { id:'hawk2',  name:'HAWK-2', role:'นักวิเคราะห์ • สายโครงสร้าง', tag:'STRUCT',
      cfg:{hair:'#2a2118',skin:'#c98c5a',shirt:'#2f8a8a',pants:'#234040',acc:'glasses'},
      station:'hawk2', accent:'#5fd0d0',
      idle:'ขีด swing high/low — รอสัญญาณ' },
    { id:'hawk3',  name:'HAWK-3', role:'นักวิเคราะห์ • สายสวนกระแส', tag:'FADE',
      cfg:{hair:'#6a3a1a',skin:'#d49a6a',shirt:'#d9743a',pants:'#4a2e1c',acc:'glasses'},
      station:'hawk3', accent:'#ff9a5a',
      idle:'จับ overbought/oversold — รอจังหวะสวน' },
    { id:'sage',   name:'SAGE',   role:'หัวหน้าฝ่ายความเสี่ยง', tag:'RISK',
      cfg:{hair:'#cfd3da',skin:'#c98c5a',shirt:'#6a4a9a',pants:'#6a4a9a',acc:'robe'},
      station:'sage', accent:'#b08fe0',
      idle:'นั่งสมาธิ ทบทวนเพดานขาดทุนของวัน' },
    { id:'iron',   name:'IRON',   role:'กฎเหล็ก + เครื่องส่งคำสั่ง MT5', tag:'RULES',
      cfg:{hair:'#39414f',skin:'#525d70',shirt:'#4a5566',pants:'#39414f',acc:'robot',accColor:'#6c7890'},
      station:'iron', accent:'#8fa0c0',
      idle:'ยืนเฝ้าเทอร์มินัล MT5 — R:R / spread / lot' }
  ];

  const SPEED = 26; // logical px / sec
  let agents = [];

  function reset() {
    agents = DEFS.map((d, i) => {
      const st = S.STATIONS[d.station];
      return Object.assign({}, d, {
        x: st.x, y: st.y, tx: st.x, ty: st.y,
        facing: 1, frame: 0, animT: 0, bob: 0,
        state: 'idle', pause: Math.random() * 2,
        activity: d.idle, sitting: false, hi: 0 // highlight pulse
      });
    });
    return agents;
  }

  function byId(id) { return agents.find(a => a.id === id); }

  function goTo(id, x, y, sit) {
    const a = byId(id); if (!a) return;
    a.tx = x; a.ty = y; a.sitting = !!sit;
  }
  function goStation(id, sit) {
    const a = byId(id); if (!a) return;
    const st = S.STATIONS[a.station]; a.tx = st.x; a.ty = st.y; a.sitting = !!sit;
  }
  function say(id, text) { const a = byId(id); if (a) a.activity = text; }
  function flash(id) { const a = byId(id); if (a) a.hi = 1; }

  function wander(a) {
    const wp = S.WAYPOINTS[(Math.random() * S.WAYPOINTS.length) | 0];
    a.tx = wp.x + (Math.random() * 10 - 5);
    a.ty = wp.y + (Math.random() * 6 - 3);
  }

  function update(dt, mode) {
    for (const a of agents) {
      const dx = a.tx - a.x, dy = a.ty - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1.2) {
        const v = SPEED * dt;
        a.x += dx / dist * Math.min(v, dist);
        a.y += dy / dist * Math.min(v, dist);
        a.facing = dx < -0.3 ? -1 : (dx > 0.3 ? 1 : a.facing);
        a.state = 'walk';
        a.animT += dt;
        if (a.animT > 0.16) { a.animT = 0; a.frame ^= 1; }
        a.bob = a.frame ? -1 : 0;
      } else {
        a.x = a.tx; a.y = a.ty; a.bob = 0;
        if (a.sitting) { a.state = 'sit'; }
        else {
          a.state = 'idle';
          // idle wandering only in IDLE mode
          if (mode === 'idle') {
            a.pause -= dt;
            if (a.pause <= 0) { wander(a); a.pause = 1.5 + Math.random() * 3; }
          }
        }
      }
      if (a.hi > 0) a.hi = Math.max(0, a.hi - dt * 1.4);
    }
  }

  function draw(ctx, t) {
    // painter's order by feet-y
    const order = agents.slice().sort((a, b) => a.y - b.y);
    for (const a of order) {
      const ox = Math.round(a.x) - 6, oy = Math.round(a.y) - 18 + a.bob;
      // highlight ring when flashing / selected
      if (a.hi > 0.02) {
        ctx.save(); ctx.globalAlpha = a.hi;
        PixelArt.rect(ctx, ox - 1, oy - 2, 14, 22, 'rgba(255,255,255,0.0)');
        ringPulse(ctx, a.x, a.y, a.accent, a.hi);
        ctx.restore();
      }
      PixelArt.drawCharacter(ctx, ox, oy, a.cfg, a.frame, a.state, a.facing);
      // tiny role chip floating dot
      PixelArt.px(ctx, ox + 6, oy - 4, a.accent);
    }
  }
  function ringPulse(ctx, x, y, col, k) {
    ctx.strokeStyle = col; ctx.globalAlpha = 0.5 * k; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y + 1, 9, 4, 0, 0, 7); ctx.stroke();
  }

  // hit-test for taps: returns agent whose sprite box contains (lx,ly) in logical px
  function pick(lx, ly) {
    let best = null, bestD = 1e9;
    for (const a of agents) {
      const cx = a.x, cy = a.y - 9;
      if (lx >= a.x - 8 && lx <= a.x + 8 && ly >= a.y - 22 && ly <= a.y + 3) {
        const d = Math.hypot(lx - cx, ly - cy);
        if (d < bestD) { bestD = d; best = a; }
      }
    }
    return best;
  }

  window.Agents = { DEFS, reset, byId, goTo, goStation, say, flash, update, draw, pick, list: () => agents };
})();
