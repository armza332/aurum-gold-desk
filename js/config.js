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
    // 'mock' = run the built-in demo simulation (sim.js), no network.
    // 'live' = poll the Apps Script bridge for real EA status/prices/trades.
    dataMode: 'mock',

    // Paste the Apps Script /exec URL here to go live. Empty => forced mock.
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

  // Effective mode: never go live without a URL.
  window.CONFIG.isLive = function () {
    return this.dataMode === 'live' && !!this.bridgeURL;
  };
})();
