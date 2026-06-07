/* news.js — pulls REAL public market sentiment into the "ข่าว & อารมณ์ตลาด" card.
   Source: alternative.me Fear & Greed Index (free, CORS-enabled). It's a crypto/
   risk-on-off proxy — for gold treat it as a broad market-mood gauge, not a
   gold-specific signal. DXY / funding need paid/no-CORS feeds → left as "—" for now.
   Runs only in production (demoMode:false); the demo showcase keeps its scripted news. */
(function () {
  'use strict';
  if (window.CONFIG && CONFIG.demoMode) return;   // don't clobber the demo showcase

  const REFRESH_MS = 5 * 60 * 1000;

  function thaiLabel(c) {
    return ({
      'Extreme Fear': 'กลัวมาก', 'Fear': 'กลัว', 'Neutral': 'กลาง',
      'Greed': 'โลภ', 'Extreme Greed': 'โลภมาก'
    })[c] || c;
  }

  async function pull() {
    try {
      const r = await fetch('https://api.alternative.me/fng/?limit=1');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const d = j && j.data && j.data[0];
      if (!d) return;
      const v = parseInt(d.value, 10);
      Sim.applyMarket({
        fng: v,
        fngLabel: thaiLabel(d.value_classification),
        news: [{ src: 'Alt.me', t: 'Crypto Fear & Greed ' + v + ' (พร็อกซีอารมณ์เสี่ยงตลาด)' }]
      });
    } catch (e) {
      console.warn('[news] F&G fetch failed:', e.message);
    }
  }

  if (window.Sim && Sim.applyMarket) {
    pull();
    setInterval(pull, REFRESH_MS);
  }
})();
