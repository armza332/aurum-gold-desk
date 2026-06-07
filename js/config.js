/* config.js — central configuration for the AURUM gold desk web layer.
   This is the ONE place to flip between demo (mock) and live (bridge) data,
   set the Apps Script bridge URL, and declare IRON's hard-rule risk caps.
   Nothing else in the app should hard-code a URL or a risk number. */
(function () {
  'use strict';

  window.CONFIG = {
    // ----- identity -----
    symbol: 'XAU/USD',
    magic: 992611,            // MT5 EA magic for THIS gold-only project (distinct from 992511)

    // ----- data source -----
    // PRODUCTION default: no demo, no simulated data. The dashboard shows ONLY
    // real data pushed by the EA via the bridge; before it connects it shows
    // empty placeholders ("รอ EA"), never fake numbers.
    // Set demoMode:true ONLY to play the offline showcase simulation.
    demoMode: false,

    // 'mock' (not connected) vs 'live' (poll the bridge). Auto-set to 'live'
    // when a bridgeURL is saved via the connect panel.
    dataMode: 'mock',

    // Paste the Apps Script /exec URL here (or use the ⚙ connect panel) to go live.
    bridgeURL: '',

    pollMs: 4000,             // how often to poll the bridge in live mode

    // ----- IRON: hard rules (code, no emotion) -----
    // These are the gate the EA must also enforce; the web shows them so the
    // human can see why a signal was skipped. Source of truth = EA, mirrored here.
    rules: {
      minRR: 1.8,             // reward:risk must be >= this
      maxSpreadPts: 25,       // skip if spread above this (points)
      maxLot: 0.20,           // never size above this
      maxDailyLossPct: 3.0,   // stop trading once daily loss hits this
      riskPerTradePct: 1.0    // default risk budget per trade
    },

    // ----- voting -----
    hawkConsensus: 2,         // need >= 2 of 3 HAWK analysts to agree
    hawkCount: 3
  };

  // ----- localStorage override (set via the in-app ⚙ connect panel) -----
  // Lets users connect a bridge without editing this file. localStorage wins
  // over the defaults above so a saved URL survives reloads.
  const LS_KEY = 'aurum_bridge';
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved && saved.url) { window.CONFIG.bridgeURL = saved.url; window.CONFIG.dataMode = 'live'; }
  } catch (_e) { /* ignore bad/blocked storage */ }

  // Effective mode: never go live without a URL.
  window.CONFIG.isLive = function () {
    return this.dataMode === 'live' && !!this.bridgeURL;
  };

  // Persist a bridge URL and go live (caller usually reloads to start polling).
  window.CONFIG.save = function (url) {
    url = String(url || '').trim();
    if (!url) return false;
    this.bridgeURL = url; this.dataMode = 'live';
    try { localStorage.setItem(LS_KEY, JSON.stringify({ url })); } catch (_e) {}
    return true;
  };

  // Clear the saved URL and fall back to mock/demo.
  window.CONFIG.disconnect = function () {
    this.bridgeURL = ''; this.dataMode = 'mock';
    try { localStorage.removeItem(LS_KEY); } catch (_e) {}
  };
})();
