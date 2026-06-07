/* ui.js — HUD panels, agent popup, pipeline, timeline, controls */
(function () {
  'use strict';
  const D = Sim.data;
  const $ = id => document.getElementById(id);

  const KIND_COLOR = { good: '#5fe08a', bad: '#ff6b6b', alert: '#ffce63', info: '#8fb8e0', mute: '#5f7196' };
  const PHASE_TEXT = {
    IDLE: 'ว่าง — เฝ้าตลาด', SCANNING: 'พบจังหวะ! กำลังปลุกทีม', ANALYZING: 'นักวิเคราะห์กำลังโหวต',
    RISK: 'หัวหน้าความเสี่ยงตรวจซ้ำ', RULES: 'กฎเหล็กกำลังหนีบค่า', EXECUTING: 'กำลังส่งคำสั่ง MT5', IN_POSITION: 'ถือออเดอร์อยู่'
  };

  const STAGES = [
    { k: 'scan', label: 'SCANNER', sub: 'สแกน', idx: 1 },
    { k: 'hawk', label: 'HAWK 2/3', sub: 'โหวต', idx: 2 },
    { k: 'sage', label: 'SAGE', sub: 'เสี่ยง', idx: 3 },
    { k: 'rules', label: 'กฎเหล็ก', sub: 'โค้ด', idx: 4 },
    { k: 'mt5', label: 'MT5', sub: 'ยิงไม้', idx: 5 }
  ];

  function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function render() {
    // ---- status bar ----
    $('clock').textContent = Sim.fmtClock(D.clockMin);
    $('price').textContent = D.price.toFixed(2);
    const chg = D.price - D.prevPrice;
    const priceEl = $('priceWrap');
    priceEl.classList.toggle('up', chg >= 0); priceEl.classList.toggle('down', chg < 0);
    $('priceArrow').textContent = chg >= 0 ? '▲' : '▼';

    const idlePill = D.mode === 'idle';
    const modePill = $('modePill');
    modePill.textContent = idlePill ? '● ว่าง' : '● มีสัญญาณ';
    modePill.className = 'pill ' + (idlePill ? 'idle' : 'live');
    $('phaseLabel').textContent = PHASE_TEXT[D.phase] || D.phase;

    // ---- toggle button ----
    $('toggleBtn').innerHTML = idlePill
      ? '<span class="bt">▶ จำลองสัญญาณเข้า</span><span class="bs">ดูทีมทำงานเป็นทอด ๆ</span>'
      : '<span class="bt">■ เคลียร์ / ปิดไม้</span><span class="bs">กลับสู่โหมดว่าง</span>';

    renderPipeline();
    renderPosition();
    renderDecision();
    renderMarket();
    renderSummary();
    renderLessons();
    renderLog();
  }

  function renderPipeline() {
    const cur = Sim.PHASES.indexOf(D.phase);
    $('pipeline').innerHTML = STAGES.map((s, i) => {
      let cls = 'pstage';
      if (D.mode !== 'idle') {
        if (s.idx < cur || (s.k === 'mt5' && cur >= 5)) cls += ' done';
        if (s.idx === cur || (s.k === 'mt5' && (cur === 5 || cur === 6))) cls += ' active';
      }
      const arrow = i < STAGES.length - 1 ? '<span class="parrow">›</span>' : '';
      return `<div class="${cls}"><b>${s.label}</b><i>${s.sub}</i></div>${arrow}`;
    }).join('');
  }

  function renderPosition() {
    const box = $('posCard');
    if (!D.position) {
      box.className = 'card pos flat';
      box.innerHTML = `<div class="ctitle">ออเดอร์</div>
        <div class="flatmsg"><div class="big">— ไม่มีไม้เปิด —</div>
        <div class="sub">AURUM กำลังเดินเล่น รอ SCANNER เจอจังหวะคุ้มเข้า</div></div>`;
      return;
    }
    const p = D.position, diff = (D.price - p.entry), pl = D.pnl();
    const good = pl >= 0;
    const rMult = (Math.abs(D.price - p.entry) / Math.abs(p.entry - D.sage.slFrom)).toFixed(2);
    box.className = 'card pos ' + (good ? 'win' : 'lose');
    box.innerHTML = `
      <div class="ctitle">ออเดอร์ที่เปิดอยู่ <span class="side ${p.side==='BUY'?'buy':'sell'}">${p.side} XAU/USD</span></div>
      <div class="pnlrow">
        <div class="pnl ${good ? 'g' : 'r'}">${good ? '+' : ''}$${pl.toFixed(2)}</div>
        <div class="pnlsub">${good ? '+' : ''}${diff.toFixed(2)} • ${p.lot} lot ${p.half ? '• ปิดครึ่งแล้ว' : ''}</div>
      </div>
      <div class="grid4">
        <div><span>เข้า</span><b>${p.entry.toFixed(2)}</b></div>
        <div><span>ราคาตอนนี้</span><b class="lcd">${D.price.toFixed(2)}</b></div>
        <div><span>SL</span><b class="r">${p.sl.toFixed(2)}</b></div>
        <div><span>TP1 / TP2</span><b class="g">${p.tp1}/${p.tp2}</b></div>
      </div>
      ${ladder(p)}`;
  }
  function ladder(p) {
    const lo = p.sl, hi = p.tp2, span = hi - lo;
    const pos = x => Math.max(0, Math.min(100, (x - lo) / span * 100));
    return `<div class="ladder">
      <div class="lbar"><div class="lfill" style="width:${pos(D.price)}%"></div>
        <span class="lmark e" style="left:${pos(p.entry)}%" title="เข้า"></span>
        <span class="lmark t" style="left:${pos(p.tp1)}%" title="TP1"></span>
        <span class="lnow" style="left:${pos(D.price)}%"></span>
      </div>
      <div class="lkey"><span class="r">SL ${p.sl.toFixed(0)}</span><span class="g">TP2 ${p.tp2}</span></div>
    </div>`;
  }

  function renderDecision() {
    const vr = D.voteResult;
    const votes = D.votes.map(v => `
      <div class="vote ${v.side === 'BUY' ? 'buy' : (v.side === 'SELL' ? 'sell' : '')} ${vr ? 'on' : 'off'}">
        <div class="vhead"><b>${v.name}</b><span>${v.style}</span></div>
        <div class="vside">${v.side} <i>${v.conf}%</i></div>
        <div class="vnote">${esc(v.note)}</div>
      </div>`).join('');
    let sageState;
    if (D.sage.verdict === 'APPROVE')
      sageState = `<div class="verdict ok">SAGE: ผ่าน ✔</div><div class="snote">${esc(D.sage.note)}</div>
         <div class="schips"><span>SL ${D.sage.slFrom}→<b>${D.sage.slTo}</b></span><span>R:R <b>${D.sage.rr}</b></span></div>`;
    else if (D.sage.verdict === 'VETO')
      sageState = `<div class="verdict no">SAGE: VETO ✕</div><div class="snote">${esc(D.sage.note || 'หัวหน้าความเสี่ยงเบรกไม้นี้')}</div>`;
    else
      sageState = `<div class="verdict wait">SAGE: รอผลโหวต…</div><div class="snote">หัวหน้าความเสี่ยงตรวจซ้ำอิสระ มีสิทธิ์ VETO ก่อนปล่อยผ่าน</div>`;
    const rules = D.rules.map(r => `<li class="${r.ok ? 'ok' : 'no'}"><span>${esc(r.k)}</span><b>${esc(r.v)}</b></li>`).join('');
    $('decCard').innerHTML = `
      <div class="ctitle">การตัดสินใจ ${vr ? `<span class="badge g">โหวต ${vr.ratio} = ${vr.side}</span>` : '<span class="badge mute">รอสัญญาณ</span>'}</div>
      <div class="votes">${votes}</div>
      <div class="sage">${sageState}</div>
      <div class="rulesbox"><div class="rtitle">⛓ กฎเหล็ก (โค้ด ไม่มีอารมณ์)</div><ul class="rules">${rules}</ul></div>`;
  }

  function renderMarket() {
    const m = D.market;
    const demo = (window.CONFIG && CONFIG.isLive()) ? ' <span class="badge mute">เดโม — ยังไม่ดึงจริง</span>' : '';
    $('mktCard').innerHTML = `
      <div class="ctitle">ข่าว & อารมณ์ตลาด${demo}</div>
      <div class="fng">
        <div class="fngtop"><span>Fear & Greed</span><b>${m.fng} • ${m.fngLabel}</b></div>
        <div class="fngbar"><div class="fngfill" style="width:${m.fng}%"></div><span class="fngdot" style="left:${m.fng}%"></span></div>
      </div>
      <div class="mgrid">
        <div><span>DXY</span><b class="${m.dxyChg<0?'g':'r'}">${m.dxy} (${m.dxyChg}%)</b></div>
        <div><span>Funding</span><b>+${m.funding}%</b></div>
        <div><span>Long/Short</span><b>${m.longShort}</b></div>
      </div>
      <ul class="news">${m.news.map(n => `<li><span class="nsrc">${n.src}</span>${esc(n.t)}</li>`).join('')}</ul>`;
  }

  function renderSummary() {
    const d = D.daily, w = D.weekly;
    const blk = (o, label) => `
      <div class="sumblk">
        <div class="sumlab">${label}</div>
        <div class="sumpnl ${o.pnl>=0?'g':'r'}">${o.pnl>=0?'+':''}$${o.pnl.toFixed(1)}</div>
        <div class="sumrow"><span>ไม้ ${o.trades}</span><span class="g">ชนะ ${o.win}</span><span class="r">แพ้ ${o.loss}</span><span>${o.winrate}%</span></div>
      </div>`;
    $('sumCard').innerHTML = `<div class="ctitle">สรุปผล</div><div class="sumwrap">${blk(d,'วันนี้')}${blk(w,'สัปดาห์นี้')}</div>
      <div class="equity">พอร์ต <b class="lcd">$${D.equity.toFixed(0)}</b></div>`;
  }

  function renderLessons() {
    const body = D.lessons.length
      ? D.lessons.map(l => `<div class="lesson"><div class="lhead"><span>${esc(l.when)}</span><b class="r">${l.tag}</b></div><div class="ltext">${esc(l.lesson)}</div></div>`).join('')
      : `<div class="ltext" style="opacity:.6;padding:4px 0">ยังไม่มีไม้ที่แพ้ — ดีแล้ว 👍</div>`;
    $('lesCard').innerHTML = `<div class="ctitle">บทเรียนจากไม้ที่แพ้ <span class="badge mute">บอทจำไว้เตือนตัวเอง</span></div>${body}`;
  }

  function renderLog() {
    $('logList').innerHTML = D.log.map(e => `
      <li><span class="lt">${e.t}</span><span class="lw" style="color:${KIND_COLOR[e.kind]||'#8fb8e0'}">${esc(e.who)}</span><span class="lx">${esc(e.text)}</span></li>`).join('');
  }

  // ---------- agent popup ----------
  let popTimer = null;
  function showAgentPopup(a) {
    const canvas = document.getElementById('room');
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const pop = $('popup');
    pop.style.setProperty('--ac', a.accent);
    pop.innerHTML = `<div class="pname"><b>${a.name}</b><span>${esc(a.role)}</span></div>
      <div class="pact">${esc(a.activity)}</div><div class="ptag">แตะที่ว่างเพื่อปิด</div>`;
    pop.classList.add('show');
    const pw = Math.min(200, cw - 16);
    pop.style.width = pw + 'px';
    let left = a.x / 220 * cw - pw / 2;
    left = Math.max(8, Math.min(cw - pw - 8, left));
    const anchor = (a.y - 20) / 150 * ch;
    let top = anchor - pop.offsetHeight - 4;
    pop.classList.toggle('below', top < 6);
    if (top < 6) top = (a.y + 4) / 150 * ch;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    Agents.flash(a.id);
  }
  function hidePopup() { $('popup').classList.remove('show'); }

  function init() {
    $('toggleBtn').addEventListener('click', () => { Sim.toggle(); });
    document.addEventListener('pointerdown', e => {
      if (!e.target.closest('#popup') && !e.target.closest('#room')) hidePopup();
    });
    render();
  }

  window.UI = { init, render, showAgentPopup, hidePopup };
})();
