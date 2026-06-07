/* sim.js — demo data + signal pipeline orchestration (drives agents & HUD) */
(function () {
  'use strict';
  const A = Agents, S = Scene;

  const PHASES = ['IDLE', 'SCANNING', 'ANALYZING', 'RISK', 'RULES', 'EXECUTING', 'IN_POSITION'];

  const data = {
    mode: 'idle',           // 'idle' | 'signal'
    phase: 'IDLE',
    ver: null,              // EA version reported via status (production verify)
    clockMin: 21 * 60 + 58, // 21:58
    price: 2348.20,
    prevPrice: 2348.20,
    market: {
      fng: 62, fngLabel: 'โลภ (Greed)',
      dxy: 104.18, dxyChg: -0.31,
      funding: 0.012, longShort: 1.42,
      news: [
        { src: 'Yahoo', t: 'DXY อ่อนตัว ‑0.3% • บอนด์ยีลด์ลง หนุนทอง' },
        { src: 'Binance', t: 'Funding +0.012% • Long/Short 1.42' },
        { src: 'Fear&Greed', t: 'ดัชนีอารมณ์ 62 — ฝั่งโลภคุมตลาด' }
      ]
    },
    position: null,         // set when in a trade
    votes: [
      { id: 'hawk1', name: 'HAWK‑1', style: 'เทรนด์', side: 'BUY',  conf: 78, note: 'เทรนด์ H1 ขาขึ้นชัด ราคายืนเหนือ MA50 + ADX 27' },
      { id: 'hawk2', name: 'HAWK‑2', style: 'โครงสร้าง', side: 'BUY', conf: 71, note: 'เบรก swing high 2346.8 แล้วยืนได้ รีเทสต์ผ่าน' },
      { id: 'hawk3', name: 'HAWK‑3', style: 'สวนกระแส', side: 'SELL', conf: 55, note: 'RSI แตะ 68 ใกล้ overbought เสี่ยงย่อสั้น' }
    ],
    voteResult: null,       // {side, ratio} once resolved
    sage: {
      verdict: null, // 'APPROVE' | 'VETO'
      note: 'ผ่าน — กระชับ SL ขึ้นมา ลดความเสี่ยงต่อไม้เหลือ 0.8% ของพอร์ต และตั้ง TP แบบขั้นบันได',
      slFrom: 2342.40, slTo: 2343.80, rr: '1 : 2.1'
    },
    // IRON's hard rules — caps come from CONFIG so the EA and web stay in sync.
    rules: (function () {
      const R = (window.CONFIG && window.CONFIG.rules) || {};
      return [
        { k: `Reward : Risk ≥ ${R.minRR ?? 1.8}`, v: '1 : 2.1', ok: true },
        { k: `Spread ≤ ${R.maxSpreadPts ?? 25} จุด`, v: '18 จุด', ok: true },
        { k: `ขนาดไม้ ≤ ${R.maxLot ?? 0.20} lot`, v: '0.10 lot', ok: true },
        { k: `ขาดทุนสะสมวันนี้ ≤ ${R.maxDailyLossPct ?? 3.0}%`, v: '‑0.6%', ok: true }
      ];
    })(),
    daily: { trades: 4, win: 3, loss: 1, pnl: 182.4, winrate: 75 },
    weekly: { trades: 21, win: 14, loss: 7, pnl: 640.2, winrate: 67 },
    equity: 10000,
    lessons: [
      { when: 'เมื่อวาน 21:40', tag: '‑$48', lesson: 'เข้าสวนตอนข่าว NFP ออก — ครั้งหน้าเว้น ±15 นาที รอบข่าวแรง' },
      { when: 'จันทร์ 14:10', tag: '‑$33', lesson: 'ไล่ราคาหลังเบรก 30 จุด — รอ retest จะได้ราคาดีกว่า' }
    ],
    log: []
  };

  let dirty = true, seq = [], seqT = 0, ambientT = 0, priceT = 0;

  function fmtClock(m) { m = Math.floor(((m % 1440) + 1440) % 1440); const h = (m / 60) | 0, mm = m % 60; return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; }
  function log(who, text, kind) {
    data.log.unshift({ t: fmtClock(data.clockMin), who, text, kind: kind || 'info' });
    if (data.log.length > 60) data.log.pop();
    dirty = true;
  }
  function setPhase(p) { data.phase = p; dirty = true; }

  // ---------- IDLE ----------
  function enterIdle(announce) {
    data.mode = 'idle'; setPhase('IDLE');
    seq = []; seqT = 0;
    if (data.position && announce) {
      const p = data.position, pl = pnl(p);
      log('MT5', `ปิดไม้ ${p.side} — ${pl >= 0 ? '+' : ''}$${pl.toFixed(1)} (${p.side==='BUY'?'+':''}${(data.price-p.entry).toFixed(2)})`, pl >= 0 ? 'good' : 'bad');
      data.daily.trades++; if (pl >= 0) data.daily.win++; else data.daily.loss++;
      data.daily.pnl += pl; data.daily.winrate = Math.round(data.daily.win / data.daily.trades * 100);
    }
    data.position = null; data.voteResult = null; data.sage.verdict = null;
    A.list().forEach(a => { a.sitting = false; A.say(a.id, a.idle); });
    if (announce) log('AURUM', 'ไม่มีสัญญาณ — ลุกจากโต๊ะ เดินยืดเส้นในห้อง 🚶', 'info');
    dirty = true;
  }

  // ---------- SIGNAL PIPELINE ----------
  function step(at, fn) { seq.push({ at, fn, done: false }); }
  function enterSignal() {
    data.mode = 'signal'; seq = []; seqT = 0;
    data.voteResult = null; data.sage.verdict = null;

    step(0.0, () => {
      setPhase('SCANNING');
      A.flash('scanner'); A.say('scanner', '⚡ เจอจังหวะ! XAU/USD H1 เบรก 2346.8 + วอลุ่มหนุน');
      A.goTo('scanner', 96, 112);
      log('SCANNER', 'พบจังหวะเข้า — ปลุกทีมนักวิเคราะห์', 'alert');
      log('NEWS', 'ดึงข่าวสด: DXY ‑0.3% • F&G 62 • Funding +0.012%', 'info');
    });
    step(1.6, () => {
      setPhase('ANALYZING');
      A.goTo('hawk1', 84, 118); A.goTo('hawk2', 100, 122); A.goTo('hawk3', 116, 118);
      A.say('hawk1', 'ดูเทรนด์ H1...'); A.say('hawk2', 'เช็คโครงสร้างราคา...'); A.say('hawk3', 'หา overbought...');
      log('HAWK ×3', 'นักวิเคราะห์ 3 มุมมองแยกกันคิด', 'info');
    });
    step(3.6, () => {
      data.voteResult = { side: 'BUY', ratio: '2 / 3' };
      data.votes.forEach(v => { A.say(v.id, `${v.side} • มั่นใจ ${v.conf}%`); A.flash(v.id); });
      log('HAWK ×3', 'โหวต 2/3 = BUY (HAWK‑3 ขอสวน) → ผ่านเกณฑ์', 'good');
    });
    step(5.0, () => {
      setPhase('RISK');
      A.goTo('sage', 124, 116); A.say('sage', 'ขอตรวจความเสี่ยงอิสระก่อน...');
      log('SAGE', 'หัวหน้าความเสี่ยงตรวจซ้ำ มีสิทธิ์ VETO', 'info');
    });
    step(6.8, () => {
      data.sage.verdict = 'APPROVE'; A.flash('sage');
      A.say('sage', '✔ ผ่าน — แต่กระชับ SL ขึ้น และตั้ง TP ขั้นบันได');
      log('SAGE', `ผ่าน ✔ ปรับ SL ${data.sage.slFrom}→${data.sage.slTo} • R:R ${data.sage.rr}`, 'good');
    });
    step(8.2, () => {
      setPhase('RULES');
      A.goStation('iron'); A.flash('iron');
      A.say('iron', 'กฎเหล็กหนีบทุกค่า: R:R 1:2.1 ✓ spread 18 ✓ lot 0.10 ✓');
      log('กฎเหล็ก', 'ผ่านด่านโค้ดครบทุกข้อ — ไม่มีอารมณ์', 'good');
    });
    step(9.8, () => {
      setPhase('EXECUTING');
      A.goTo('aurum', 104, 106, true); // rush to desk & sit
      A.say('aurum', 'รับคำสั่ง — ส่งเข้า MT5 ✅');
      // send others back near their posts
      A.goStation('scanner'); A.goStation('hawk1'); A.goStation('hawk2'); A.goStation('hawk3'); A.goStation('sage');
    });
    step(11.0, () => {
      setPhase('IN_POSITION');
      data.position = { side: 'BUY', entry: data.price, lot: 0.10, oz: 10,
        sl: data.sage.slTo, tp1: 2354.0, tp2: 2360.0, openMin: data.clockMin, half: false };
      log('MT5', `เปิด BUY 0.10 @ ${data.price.toFixed(2)} • SL ${data.sage.slTo} • TP1 2354 / TP2 2360`, 'good');
      A.say('aurum', 'เปิดไม้แล้ว — เฝ้าจอ เลื่อน SL ตามกำไร');
      A.say('iron', 'เฝ้าออเดอร์ที่ MT5 — พร้อมปิดครึ่งที่ TP1');
    });
  }

  function pnl(p) { if (!p) return 0; const d = (data.price - p.entry) * (p.side === 'BUY' ? 1 : -1); return d * p.oz; }
  data.pnl = () => pnl(data.position);

  // ---------- per-frame ----------
  function update(dt) {
    // Demo drivers run ONLY in offline demo mode. In production (demoMode:false)
    // or when live, the bridge/EA is the only source of data.
    if (!window.CONFIG || window.CONFIG.isLive() || !window.CONFIG.demoMode) return;

    // clock drifts forward slowly
    data.clockMin += dt * 0.25;

    // price random walk (slight upward drift while in a BUY for nicer demo)
    priceT += dt;
    if (priceT > 0.7) {
      priceT = 0;
      data.prevPrice = data.price;
      const drift = data.position ? 0.18 : 0;
      data.price += (Math.random() - 0.5) * 0.9 + drift;
      data.price = Math.round(data.price * 100) / 100;
      // manage TP1 ladder
      const p = data.position;
      if (p && !p.half && data.price >= p.tp1) {
        p.half = true; p.sl = p.entry; // move SL to breakeven
        log('MT5', `ถึง TP1 ${p.tp1} — ปิดครึ่ง +$${((p.tp1-p.entry)*p.oz/2).toFixed(1)} • เลื่อน SL มาทุน`, 'good');
        A.say('aurum', 'ปิดครึ่งที่ TP1 ✓ SL มาที่ทุน ปล่อยที่เหลือวิ่ง');
        A.flash('aurum');
      }
      dirty = true;
    }

    // signal sequence
    if (seq.length) {
      seqT += dt;
      for (const s of seq) if (!s.done && seqT >= s.at) { s.done = true; s.fn(); }
    }

    // idle ambience
    if (data.mode === 'idle') {
      ambientT += dt;
      if (ambientT > 7.5) {
        ambientT = 0;
        const lines = ['สแกนรอบที่ผ่านมา — ยังไม่เจอจังหวะคุ้มเข้า', 'ตลาดออกข้าง spread กว้าง รอก่อน', 'เทรนด์ยังไม่ชัด — ขอข้อมูลเพิ่ม'];
        log('SCANNER', lines[(Math.random() * lines.length) | 0], 'mute');
      }
    }
  }

  function toggle() { if (data.mode === 'idle') enterSignal(); else enterIdle(true); dirty = true; }

  // ---------- LIVE: map a bridge status payload onto demo state ----------
  // Called by main.js when CONFIG is live. Each field is optional so a partial
  // payload (e.g. price-only heartbeat) still updates cleanly. Shape mirrors
  // the action=status contract documented in bridge.js.
  function applyLive(s) {
    if (!s || typeof s !== 'object' || s.ok === false) return;
    if (typeof s.price === 'number') { data.prevPrice = data.price; data.price = s.price; }
    if (typeof s.equity === 'number') data.equity = s.equity;
    if (s.phase && PHASES.includes(s.phase)) data.phase = s.phase;
    if (s.mode === 'idle' || s.mode === 'signal') data.mode = s.mode;
    if (s.position === null) data.position = null;
    else if (s.position && typeof s.position === 'object') data.position = s.position;
    if (s.daily && typeof s.daily === 'object') Object.assign(data.daily, s.daily);
    if (s.weekly && typeof s.weekly === 'object') Object.assign(data.weekly, s.weekly);
    // real decision from the EA (votes / 2-of-3 result / SAGE verdict)
    if (Array.isArray(s.votes)) data.votes = s.votes;
    if (s.voteResult !== undefined) data.voteResult = s.voteResult;
    if (s.sage !== undefined) data.sage = s.sage || { verdict: null };
    if (s.ver) data.ver = s.ver;
    dirty = true;
  }

  // Wipe ALL seed values to a neutral, no-fake-data state. Used for production
  // (not connected yet) and when switching to live — the dashboard then shows
  // only what the EA actually sends; everything else reads "—" / "รอ EA".
  function blank() {
    data.mode = 'idle'; data.phase = 'IDLE';
    data.price = 0; data.prevPrice = 0; data.equity = 0;
    data.position = null;
    data.votes = []; data.voteResult = null; data.sage = { verdict: null };
    data.lessons = [];
    data.daily  = { trades: 0, win: 0, loss: 0, pnl: 0, winrate: 0 };
    data.weekly = { trades: 0, win: 0, loss: 0, pnl: 0, winrate: 0 };
    data.market = { fng: null, fngLabel: '', dxy: null, dxyChg: null, funding: null, longShort: null, news: [] };
    dirty = true;
  }
  function enterLive() { blank(); }

  // Map real closed trades (from bridge action=trades) → the "บทเรียน" card (losses).
  function tsLabel(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000), p = n => (n < 10 ? '0' : '') + n;
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function applyLiveTrades(trades) {
    if (!Array.isArray(trades)) return;
    const losses = trades.filter(t => Number(t.profit) < 0).slice(0, 5);
    data.lessons = losses.map(t => ({
      when: tsLabel(t.closeTime),
      tag: '‑$' + Math.abs(Number(t.profit)).toFixed(0),
      lesson: (t.side || '') + ' ปิด @ ' + (t.exit != null ? Number(t.exit).toFixed(2) : '?')
            + ' • ' + (t.sageNote || (t.votedBy ? ('โหวตโดย ' + t.votedBy) : 'ทบทวนสาเหตุที่แพ้'))
    }));
    dirty = true;
  }

  function init() {
    A.reset();
    enterIdle(false);
    if (window.CONFIG && CONFIG.demoMode) {
      log('SYSTEM', 'ออนไลน์ (เดโม) — ทีม AI เข้าประจำที่ มอนิเตอร์ XAU/USD', 'info');
      log('SCANNER', 'เริ่มสแกนตลาด (จำลอง) ทุก 20 วินาที', 'mute');
    } else {
      blank();   // production: no fake data until the EA connects
      log('SYSTEM', 'โหมดจริง — รอเชื่อมต่อ EA ผ่าน Bridge (กดปุ่ม "เชื่อมต่อ")', 'info');
    }
  }

  window.Sim = {
    data, init, update, toggle, enterIdle, enterSignal, applyLive, enterLive, blank, applyLiveTrades,
    isDirty: () => dirty, clearDirty: () => { dirty = false; },
    fmtClock, PHASES, monActive: () => data.phase === 'IN_POSITION' || data.phase === 'EXECUTING'
  };
})();
