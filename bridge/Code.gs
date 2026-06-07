/**
 * AURUM Bridge — Google Apps Script Web App (Layer 2)
 * XAU/USD gold desk. Connects the web brain (Layer 1) to the MT5 EA (Layer 3).
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 * POST /  (body = JSON, discriminated by `kind`)
 *   { kind:'status', secret, mode, phase, price, equity, position, daily,
 *     weekly, prices, ts }            ← EA pushes desk state (secret required)
 *   { kind:'trade',  secret, posId, side, entry, exit, profit, ... }
 *                                      ← EA pushes a closed trade (secret req.)
 *   { kind:'cmd', cmd, args }          ← web queues a command (whitelisted, no secret)
 *
 * GET /?action=status                  → flat status obj + {ok, online, ageSec}
 * GET /?action=prices                  → { ok, prices:{ "XAU/USD":{bid,ask,spread} } }
 * GET /?action=trades[&since=ts]       → { ok, trades:[...], total }
 * GET /?action=command&since=N[&secret]→ next pending command for the EA (+ news)
 * GET /?action=news[&win=15]           → { ok, news:{risk,block,near,cur} }
 * GET /?action=clear                   → wipe stored state
 *
 * Why secret only on status/trade (EA writes) but not on cmd:
 *   This is served behind a PUBLIC GitHub Pages site, so any secret shipped to
 *   the browser is already exposed. We therefore only gate the writes that could
 *   poison the dashboard (fake status/trades) and instead constrain `cmd` to a
 *   small safe whitelist (pause/resume/close_all/signal). The EA holds the secret.
 *
 * ── SETUP ───────────────────────────────────────────────────────────────────
 * 1. https://script.google.com → New project → paste this as Code.gs
 * 2. Deploy → New deployment → Web app (Execute as: Me, Access: Anyone)
 * 3. Copy the /exec URL → paste into js/config.js `bridgeURL` and set dataMode:'live'
 *    and into the EA's BridgeURL input.
 * 4. MT5 → Tools → Options → Expert Advisors → Allow WebRequest, add:
 *      https://script.google.com
 *      https://script.googleusercontent.com
 */

const SECRET = 'aurum-secret';   // must match the EA's BridgeSecret input

// Optional: paste a Google Sheet ID to archive every closed trade (for "lessons").
// Leave '' to disable. First run will prompt to authorize Sheets access.
const SHEET_ID = '';

// Commands the web is allowed to queue for the EA.
const CMD_WHITELIST = ['pause', 'resume', 'close_all', 'signal'];

// ── POST: status / trade (from EA) or cmd (from web) ─────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const props = PropertiesService.getScriptProperties();
    const kind = String(data.kind || '');

    // Web → EA command (whitelisted, no secret — see header note).
    if (kind === 'cmd') {
      const c = String(data.cmd || '').toLowerCase();
      if (CMD_WHITELIST.indexOf(c) === -1) {
        return json({ ok: false, error: 'cmd not allowed: ' + c });
      }
      const lastId = parseInt(props.getProperty('LAST_CMD_ID') || '0', 10);
      const newId = lastId + 1;
      props.setProperty('LAST_CMD', JSON.stringify({ id: newId, cmd: c, args: data.args || null, ts: Date.now() }));
      props.setProperty('LAST_CMD_ID', String(newId));
      return json({ ok: true, msg: 'command queued', id: newId });
    }

    // Everything below is an EA write → require the secret.
    if (data.secret !== SECRET) return json({ ok: false, error: 'invalid secret' });

    // EA → closed trade record (for the lessons / journal loop).
    if (kind === 'trade') {
      let trades;
      try { trades = JSON.parse(props.getProperty('LIVE_TRADES') || '[]'); } catch (_e) { trades = []; }
      if (data.posId && trades.some(function (t) { return String(t.posId) === String(data.posId); })) {
        return json({ ok: true, msg: 'duplicate skipped', count: trades.length });
      }
      trades.unshift({
        side: data.side, entry: data.entry, exit: data.exit, profit: data.profit,
        rMult: data.rMult, outcome: data.outcome, lot: data.lot,
        votedBy: data.votedBy || null,        // which HAWKs voted in
        sageNote: data.sageNote || null,      // SAGE's risk note
        openTime: data.openTime, closeTime: data.closeTime, posId: data.posId
      });
      if (trades.length > 500) trades.length = 500;
      props.setProperty('LIVE_TRADES', JSON.stringify(trades));
      appendTradeToSheet_(data);
      return json({ ok: true, msg: 'trade recorded', count: trades.length });
    }

    // EA → desk status push (default). Stored FLAT so the web reads it directly.
    data.receivedAt = Date.now();
    props.setProperty('LATEST_STATUS', JSON.stringify(data));

    if (data.prices && typeof data.prices === 'object') {
      props.setProperty('LATEST_PRICES', JSON.stringify({ prices: data.prices, ts: data.ts, receivedAt: data.receivedAt }));
    }

    let history;
    try { history = JSON.parse(props.getProperty('HISTORY') || '[]'); } catch (_e) { history = []; }
    history.unshift({ ts: data.ts, equity: data.equity, price: data.price,
      phase: data.phase, pnl: data.daily ? data.daily.pnl : null });
    if (history.length > 100) history.length = 100;
    props.setProperty('HISTORY', JSON.stringify(history));

    return json({ ok: true, msg: 'status received' });
  } catch (err) {
    return json({ ok: false, error: err.toString() });
  }
}

// ── GET: serve the web (status/prices/trades) or feed the EA (command) ───────
function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const action = (e.parameter && e.parameter.action) || 'status';

  if (action === 'status') {
    const raw = props.getProperty('LATEST_STATUS');
    if (!raw) return json({ ok: false, msg: 'no data yet — EA not connected' });
    const data = JSON.parse(raw);
    const ageSec = (Date.now() - data.receivedAt) / 1000;
    data.ok = true; data.ageSec = Math.round(ageSec); data.online = ageSec < 300;
    return json(data);   // FLAT — Sim.applyLive() reads top-level price/phase/position
  }

  if (action === 'prices') {
    const raw = props.getProperty('LATEST_PRICES');
    if (!raw) return json({ ok: false, msg: 'no prices yet' });
    const d = JSON.parse(raw);
    const ageSec = (Date.now() - d.receivedAt) / 1000;
    return json({ ok: true, prices: d.prices, ts: d.ts, ageSec: Math.round(ageSec), online: ageSec < 300 });
  }

  if (action === 'trades') {
    const trades = JSON.parse(props.getProperty('LIVE_TRADES') || '[]');
    const since = parseInt(e.parameter.since || '0', 10);
    const filtered = since > 0 ? trades.filter(function (t) { return t.closeTime > since; }) : trades;
    return json({ ok: true, trades: filtered, total: trades.length });
  }

  // EA polls for the next command + current news risk.
  if (action === 'command') {
    if (e.parameter.secret && e.parameter.secret !== SECRET) return json({ ok: false, error: 'invalid secret' });
    const since = parseInt(e.parameter.since || '0', 10);
    const nr = newsRisk_();
    const raw = props.getProperty('LAST_CMD');
    if (!raw) return json({ ok: true, msg: 'no commands', id: 0, news: nr });
    const cmd = JSON.parse(raw);
    if (cmd.id <= since) return json({ ok: true, msg: 'no new', id: cmd.id, news: nr });
    return json({ ok: true, cmd: cmd.cmd, args: cmd.args, id: cmd.id, ts: cmd.ts, news: nr });
  }

  if (action === 'news') {
    return json({ ok: true, news: newsRisk_(parseInt(e.parameter.win || '15', 10)) });
  }

  if (action === 'clear') {
    ['LATEST_STATUS', 'LATEST_PRICES', 'LAST_CMD', 'LAST_CMD_ID', 'HISTORY', 'LIVE_TRADES']
      .forEach(function (k) { props.deleteProperty(k); });
    return json({ ok: true, msg: 'cleared' });
  }

  return json({ ok: false, msg: 'unknown action: ' + action });
}

// ── News risk (USD-focused, gold cares about USD events) ─────────────────────
// Day-of-week (UTC) high-impact USD events. block=true within ±windowMin (def 15)
// → matches the trader's lesson "เว้น ±15 นาที รอบข่าวแรง". Self-contained.
function newsCalendar_(day) {
  const cal = {
    1: [{ t: '14:00', imp: 'high', cur: 'USD' }],
    2: [{ t: '14:00', imp: 'high', cur: 'USD' }],
    3: [{ t: '12:15', imp: 'medium', cur: 'USD' }, { t: '18:00', imp: 'high', cur: 'USD' }],
    4: [{ t: '12:30', imp: 'high', cur: 'USD' }],
    5: [{ t: '12:30', imp: 'high', cur: 'USD' }],   // NFP / CPI window
    0: [], 6: []
  };
  return cal[day] || [];
}
function newsRisk_(windowMin) {
  windowMin = windowMin || 15;
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return { risk: 'LOW', block: false, near: 9999, cur: '' };
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const events = newsCalendar_(day);
  let nearestHigh = 9999, highCount = 0, blockCur = '';
  for (let i = 0; i < events.length; i++) {
    if (events[i].imp !== 'high') continue;
    const p = events[i].t.split(':');
    const eMin = parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    const away = Math.abs(eMin - nowMin);
    highCount++;
    if (away < nearestHigh) { nearestHigh = away; blockCur = events[i].cur; }
  }
  const block = nearestHigh <= windowMin;
  const risk = block ? 'HIGH' : (highCount >= 1 && nearestHigh <= 120) ? 'MED' : 'LOW';
  return { risk: risk, block: block, near: nearestHigh, cur: blockCur };
}

function appendTradeToSheet_(d) {
  if (!SHEET_ID) return;
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sh = ss.getSheetByName('Trades');
    if (!sh) {
      sh = ss.insertSheet('Trades');
      sh.appendRow(['closeTime', 'date', 'side', 'entry', 'exit', 'profit', 'rMult', 'outcome', 'votedBy', 'posId']);
    }
    const dt = d.closeTime ? new Date(d.closeTime * 1000) : new Date();
    sh.appendRow([dt, Utilities.formatDate(dt, 'GMT', 'yyyy-MM-dd'), d.side, d.entry, d.exit,
      d.profit, d.rMult, d.outcome, (d.votedBy || []).join('+'), String(d.posId)]);
  } catch (_err) { /* not authorized / bad ID — skip silently */ }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
