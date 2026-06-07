//+------------------------------------------------------------------+
//|  Aurum_EA.mq5  —  AURUM Gold Desk · Layer 3 (muscle)             |
//|  XAU/USD only · magic 992611                                     |
//|                                                                  |
//|  The 7-agent team, in code:                                      |
//|    SCANNER  — computes MA/RSI/ATR/ADX, finds a setup             |
//|    HAWK-1/2/3 — trend / structure / fade analysts, vote 2-of-3   |
//|    SAGE     — independent risk check, can VETO, sets SL/TP        |
//|    IRON     — hard rules (R:R, spread, lot, daily-loss) + execute |
//|    AURUM    — manages the open trade (ladder TP, breakeven)       |
//|                                                                  |
//|  Talks to the Apps Script bridge (Layer 2):                      |
//|    POST {kind:status}  every StatusEverySec                      |
//|    POST {kind:trade}   on each close                             |
//|    GET  ?action=command  → pause/resume/close_all + USD news risk |
//|                                                                  |
//|  ⚠ MT5 → Tools → Options → Expert Advisors → Allow WebRequest,   |
//|     add:  https://script.google.com                              |
//|           https://script.googleusercontent.com                   |
//+------------------------------------------------------------------+
#property copyright "AURUM"
#property version   "1.00"
#property strict

// Bump this on every code change so the running EA can be verified against the repo.
// Shown on the chart dashboard and sent to the web (status.ver) — if the web shows a
// different version than this file, the chart is still running an old compile.
#define EA_VERSION "1.0.0"

#include <Trade/Trade.mqh>
CTrade trade;

//============================ INPUTS ================================
input group "── Connection ──"
input string  BridgeURL        = "";            // Apps Script /exec URL (blank = offline, no web sync)
input string  BridgeSecret     = "aurum-secret";// must match SECRET in bridge/Code.gs
input int     StatusEverySec   = 10;            // how often to push status
input int     CommandEverySec  = 15;            // how often to poll commands + news

input group "── Trading ──"
input bool    EnableTrading    = true;          // master on/off (false = analyse only, no orders)
input string  TradeSymbol      = "";            // gold symbol to trade. blank = auto-detect (XAUUSDm/XAUUSD/GOLD...)
input long    MagicNumber      = 992611;        // this project's magic
input double  RiskPercent      = 1.0;           // risk per trade (% of equity)
input int     ScanSeconds      = 20;            // SCANNER cadence (seconds) — runs on new bar too

input group "── IRON hard rules (mirror js/config.js) ──"
input double  MinRR            = 1.8;            // reward:risk floor
input int     MaxSpreadPts     = 25;            // skip if spread above (points)
input double  MaxLot           = 0.20;          // hard lot cap
input double  MaxDailyLossPct  = 3.0;           // stop trading once daily loss hits this

input group "── Signal / exits ──"
input int     FastMA           = 20;            // trend fast EMA
input int     SlowMA           = 50;            // trend slow EMA
input int     RSIPeriod        = 14;
input int     ATRPeriod        = 14;
input int     ADXPeriod        = 14;
input double  MinADX           = 22.0;          // HAWK-1 needs ADX above this for a trend vote
input double  SwingLookback    = 20;            // bars for HAWK-2 structure break
input double  SL_ATR           = 1.5;           // stop = entry ± SL_ATR × ATR
input double  TP1_ATR          = 1.8;           // first target (partial close + move SL to BE)
input double  TP2_ATR          = 3.6;           // runner target
input bool    UseNewsBlock     = true;          // stand down ±window around high-impact USD news

input group "── Self-learning (learns from losses) ──"
input bool    UseLossAdaptive  = true;          // after losses: cut risk, cooldown, then halt the day
input int     MaxConsecLosses  = 5;             // halt entries for the day at this many losses in a row
input int     LossCooldownMin  = 15;            // after a loss, skip new entries for this many minutes (anti-revenge)

//============================ STATE ================================
int    hFast, hSlow, hRSI, hATR, hADX;
datetime g_lastBar      = 0;
datetime g_lastStatus   = 0;
datetime g_lastCommand  = 0;
int      g_lastCmdId    = 0;
bool     g_paused       = false;
bool     g_newsBlock    = false;   // set from bridge command poll
string   g_newsCur      = "";
double   g_dayStartEq   = 0;       // equity at start of trading day
datetime g_dayStamp     = 0;
string   g_phase        = "IDLE";
// last decision (for status + trade record)
string   g_lastVotedBy  = "";
string   g_lastSageNote = "";
ulong    g_halfTicket   = 0;       // ticket that already had its TP1 half banked
// decision snapshot (JSON fragments) sent in status → web "การตัดสินใจ" card
string   g_votesJson    = "[]";
string   g_resultJson   = "null";
string   g_decJson      = "\"votes\":[],\"voteResult\":null,\"sage\":null";
// self-learning from losses
int      g_consecLosses = 0;       // losses in a row (resets on a win)
datetime g_lastLossTime = 0;       // for anti-revenge cooldown
string   SYM            = "";      // resolved gold symbol (set in OnInit)

//============================ INIT =================================
int OnInit()
{
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(20);

   SYM = ResolveGold();
   SymbolSelect(SYM, true);                       // ensure it's in Market Watch for data
   if(StringFind(SYM,"XAU")<0 && StringFind(SYM,"GOLD")<0 && StringFind(SYM,"GLD")<0)
      PrintFormat("⚠ AURUM: '%s' doesn't look like gold — set TradeSymbol to your XAU symbol", SYM);

   hFast = iMA(SYM, PERIOD_CURRENT, FastMA, 0, MODE_EMA, PRICE_CLOSE);
   hSlow = iMA(SYM, PERIOD_CURRENT, SlowMA, 0, MODE_EMA, PRICE_CLOSE);
   hRSI  = iRSI(SYM, PERIOD_CURRENT, RSIPeriod, PRICE_CLOSE);
   hATR  = iATR(SYM, PERIOD_CURRENT, ATRPeriod);
   hADX  = iADX(SYM, PERIOD_CURRENT, ADXPeriod);
   if(hFast==INVALID_HANDLE || hSlow==INVALID_HANDLE || hRSI==INVALID_HANDLE ||
      hATR==INVALID_HANDLE  || hADX==INVALID_HANDLE)
   {
      Print("AURUM: indicator handle failed"); return INIT_FAILED;
   }

   ResetDayAnchor();
   PrintFormat("AURUM EA v%s online · %s · magic %d · trading=%s · bridge=%s",
               EA_VERSION, SYM, MagicNumber, (EnableTrading?"ON":"OFF"),
               (StringLen(BridgeURL)>0?"set":"offline"));
   return INIT_SUCCEEDED;
}

// Find the broker's gold symbol so the EA trades XAU even if dropped on another
// chart (Exness = XAUUSDm). Honors TradeSymbol; else scans common names; else
// falls back to the chart symbol (and OnInit warns).
string ResolveGold()
{
   if(StringLen(TradeSymbol)>0) return TradeSymbol;
   string cands[] = {"XAUUSDm","XAUUSD","XAUUSD.","XAUUSDc","XAUUSD.r","GOLD","GOLDm","XAUUSD_o"};
   for(int i=0;i<ArraySize(cands);i++)
      if(SymbolSelect(cands[i],true) && SymbolInfoDouble(cands[i],SYMBOL_BID)>0) return cands[i];
   // chart symbol if it's already gold
   if(StringFind(_Symbol,"XAU")>=0 || StringFind(_Symbol,"GOLD")>=0) return _Symbol;
   return _Symbol;   // last resort (OnInit warns)
}

void OnDeinit(const int reason)
{
   IndicatorRelease(hFast); IndicatorRelease(hSlow); IndicatorRelease(hRSI);
   IndicatorRelease(hATR);  IndicatorRelease(hADX);
   Comment("");
}

//============================ TICK ================================
void OnTick()
{
   ManageOpenPosition();          // every tick — react fast to TP1/SL
   RollDayAnchor();

   datetime now = TimeCurrent();

   // poll bridge for commands + news (throttled)
   if(StringLen(BridgeURL)>0 && now - g_lastCommand >= CommandEverySec)
   { PollCommand(); g_lastCommand = now; }

   // run the team pipeline once per new bar
   bool newBar = (iTime(SYM, PERIOD_CURRENT, 0) != g_lastBar);
   if(newBar)
   {
      g_lastBar = iTime(SYM, PERIOD_CURRENT, 0);
      if(EnableTrading && !g_paused && !HasPosition())
         RunPipeline();
   }

   UpdateDashboard();

   // push status to web (throttled)
   if(StringLen(BridgeURL)>0 && now - g_lastStatus >= StatusEverySec)
   { PushStatus(); g_lastStatus = now; }
}

//====================== THE 7-AGENT PIPELINE ======================
// SCANNER → HAWK×3 vote → SAGE veto → IRON rules → execute
void RunPipeline()
{
   g_phase = "SCANNING";
   double atr = Buf(hATR,1);
   if(atr<=0) return;

   // ---- gather indicator reads (closed bar = shift 1) ----
   double fast = Buf(hFast,1),  slow = Buf(hSlow,1);
   double rsi  = Buf(hRSI,1),   adx  = Buf(hADX,1);
   double close= iClose(SYM,PERIOD_CURRENT,1);
   double hi   = iHigh(SYM,PERIOD_CURRENT,iHighest(SYM,PERIOD_CURRENT,MODE_HIGH,(int)SwingLookback,2));
   double lo   = iLow (SYM,PERIOD_CURRENT,iLowest (SYM,PERIOD_CURRENT,MODE_LOW ,(int)SwingLookback,2));

   // SCANNER: is there anything worth waking the team for? (a fresh swing break)
   bool brokeUp   = close > hi;
   bool brokeDown = close < lo;
   if(!brokeUp && !brokeDown) { g_phase="IDLE"; return; }

   g_phase = "ANALYZING";
   // ---- HAWK votes: +1 = BUY, -1 = SELL, 0 = abstain ----
   int h1 = HawkTrend(fast, slow, adx);
   int h2 = HawkStructure(brokeUp, brokeDown);
   int h3 = HawkFade(rsi);

   int buyVotes  = (h1>0)+(h2>0)+(h3>0);
   int sellVotes = (h1<0)+(h2<0)+(h3<0);
   int dir = 0;
   if(buyVotes  >= 2) dir =  1;
   if(sellVotes >= 2) dir = -1;
   g_lastVotedBy = VotedBy(dir, h1, h2, h3);

   // record the decision snapshot for the web "การตัดสินใจ" card (ASCII strings)
   int conf1 = (h1!=0)? (int)MathMin(95.0, adx*3.0) : (int)MathMin(35.0, adx*2.0);
   int conf2 = (brokeUp||brokeDown)? 68 : 30;
   int conf3 = (rsi>=70)? (int)MathMin(95.0,(rsi-50)*2.0) : (rsi<=30? (int)MathMin(95.0,(50-rsi)*2.0):30);
   string n1 = StringFormat("ADX %.0f, EMA%d%sEMA%d", adx, FastMA, (fast>slow?">":"<"), SlowMA);
   string n2 = brokeUp? "broke swing high" : (brokeDown? "broke swing low":"no break");
   string n3 = StringFormat("RSI %.0f", rsi);
   g_votesJson = "[" + HawkJson("HAWK-1","Trend",h1,conf1,n1) + ","
                     + HawkJson("HAWK-2","Structure",h2,conf2,n2) + ","
                     + HawkJson("HAWK-3","Fade",h3,conf3,n3) + "]";
   g_resultJson = (dir!=0)? StringFormat("{\"side\":\"%s\",\"ratio\":\"%d / 3\"}",
                              (dir>0?"BUY":"SELL"), MathMax(buyVotes,sellVotes)) : "null";
   SetDecision("null");
   if(dir==0) { g_phase="IDLE"; return; }   // no 2/3 consensus → stand down

   // ---- self-learning guards (loss streak / anti-revenge cooldown) ----
   if(LossHalt())
   {
      g_lastSageNote = StringFormat("HALT - %d losses in a row (learning: stop for the day)", g_consecLosses);
      SetDecision(StringFormat("{\"verdict\":\"VETO\",\"note\":\"learning halt - %d losses in a row\"}", g_consecLosses));
      g_phase="IDLE"; return;
   }
   if(CooldownActive())
   {
      int mins = (int)MathCeil((LossCooldownMin*60-(TimeCurrent()-g_lastLossTime))/60.0);
      g_lastSageNote = StringFormat("COOLDOWN - %d min after a loss (anti-revenge)", mins);
      SetDecision(StringFormat("{\"verdict\":\"VETO\",\"note\":\"cooldown %d min after a loss\"}", mins));
      g_phase="IDLE"; return;
   }

   // ---- SAGE: independent risk check + VETO ----
   g_phase = "RISK";
   if(UseNewsBlock && g_newsBlock)
   {
      g_lastSageNote = "VETO - high-impact "+g_newsCur+" news window";
      SetDecision("{\"verdict\":\"VETO\",\"note\":\"high-impact "+g_newsCur+" news window\"}");
      g_phase="IDLE"; return;
   }

   double price = (dir>0) ? SymbolInfoDouble(SYM,SYMBOL_ASK) : SymbolInfoDouble(SYM,SYMBOL_BID);
   double sl    = (dir>0) ? price - SL_ATR*atr : price + SL_ATR*atr;
   double tp1   = (dir>0) ? price + TP1_ATR*atr: price - TP1_ATR*atr;
   double tp2   = (dir>0) ? price + TP2_ATR*atr: price - TP2_ATR*atr;
   double rr    = MathAbs(tp2-price)/MathMax(MathAbs(price-sl),_Point);
   if(rr < MinRR)
   {
      g_lastSageNote = StringFormat("VETO - R:R %.2f < %.1f",rr,MinRR);
      SetDecision(StringFormat("{\"verdict\":\"VETO\",\"note\":\"R:R %.2f below %.1f floor\"}",rr,MinRR));
      g_phase="IDLE"; return;
   }
   g_lastSageNote = StringFormat("APPROVE - R:R 1:%.1f, SL@%.2f", rr, sl);
   SetDecision(StringFormat(
      "{\"verdict\":\"APPROVE\",\"note\":\"tighten SL, ladder TP\",\"slFrom\":%.2f,\"slTo\":%.2f,\"rr\":\"1 : %.1f\"}",
      sl, sl, rr));

   // ---- IRON: hard rules gate ----
   g_phase = "RULES";
   if(!IronRules(price, sl)) { g_phase="IDLE"; return; }

   // ---- execute ----
   g_phase = "EXECUTING";
   ExecuteTrade(dir, price, sl, tp1, tp2, atr);
}

// HAWK-1 (trend): EMA stack + ADX strength
int HawkTrend(double fast,double slow,double adx)
{
   if(adx < MinADX) return 0;                 // weak/ranging → abstain
   if(fast > slow)  return  1;
   if(fast < slow)  return -1;
   return 0;
}
// HAWK-2 (structure): which side broke
int HawkStructure(bool up,bool down)
{ return up ? 1 : (down ? -1 : 0); }
// HAWK-3 (fade): counter-trend at RSI extremes (else abstain)
int HawkFade(double rsi)
{
   if(rsi >= 70) return -1;                    // overbought → fade down
   if(rsi <= 30) return  1;                    // oversold  → fade up
   return 0;
}
string VotedBy(int dir,int h1,int h2,int h3)
{
   string s="";
   if((dir>0&&h1>0)||(dir<0&&h1<0)) s+="HAWK-1 ";
   if((dir>0&&h2>0)||(dir<0&&h2<0)) s+="HAWK-2 ";
   if((dir>0&&h3>0)||(dir<0&&h3<0)) s+="HAWK-3 ";
   StringTrimRight(s); return s;
}
// one HAWK vote as JSON (matches web renderDecision: name/style/side/conf/note)
string HawkJson(string name,string style,int v,int conf,string note)
{
   string side = (v>0)?"BUY":((v<0)?"SELL":"-");
   return StringFormat("{\"name\":\"%s\",\"style\":\"%s\",\"side\":\"%s\",\"conf\":%d,\"note\":\"%s\"}",
                       name, style, side, conf, note);
}
// assemble the decision fragment (votes + result + sage) sent inside status
void SetDecision(string sageJson)
{
   g_decJson = StringFormat("\"votes\":%s,\"voteResult\":%s,\"sage\":%s",
                            g_votesJson, g_resultJson, sageJson);
}

// IRON: the unfeeling code gate — R:R already checked by SAGE; here spread,
// lot cap and the daily-loss ceiling.
bool IronRules(double price,double sl)
{
   double spread = (double)SymbolInfoInteger(SYM,SYMBOL_SPREAD);
   if(spread > MaxSpreadPts)
   { PrintFormat("IRON skip: spread %.0f > %d", spread, MaxSpreadPts); return false; }

   if(DailyLossPct() <= -MaxDailyLossPct)
   { Print("IRON skip: daily loss cap hit — pausing for the day"); g_paused=true; return false; }

   double lot = LotForRisk(price, sl);
   if(lot < SymbolInfoDouble(SYM,SYMBOL_VOLUME_MIN))
   { Print("IRON skip: computed lot below broker minimum"); return false; }
   return true;
}

// ── Self-learning from losses ───────────────────────────────────────────────
// The bot remembers recent losing closes and protects itself: shrink risk as
// losses stack, sit out a cooldown right after a loss (anti-revenge), and stop
// for the day once it loses MaxConsecLosses in a row. Resets on a win.
double LossRiskFactor()
{
   if(!UseLossAdaptive) return 1.0;
   if(g_consecLosses>=4) return 0.4;   // 4 in a row → quarter size
   if(g_consecLosses>=3) return 0.6;
   if(g_consecLosses>=2) return 0.8;
   return 1.0;
}
bool CooldownActive()
{
   if(!UseLossAdaptive || LossCooldownMin<=0 || g_lastLossTime==0) return false;
   return (TimeCurrent()-g_lastLossTime) < LossCooldownMin*60;
}
bool LossHalt() { return (UseLossAdaptive && MaxConsecLosses>0 && g_consecLosses>=MaxConsecLosses); }

// position size from risk %, clamped to MaxLot and broker step. Risk is scaled
// down by the loss-streak factor so the bot bets smaller after losses.
double LotForRisk(double entry,double sl)
{
   double riskMoney = AccountInfoDouble(ACCOUNT_EQUITY) * RiskPercent/100.0 * LossRiskFactor();
   double slPts     = MathAbs(entry-sl)/_Point;
   double tickVal   = SymbolInfoDouble(SYM,SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(SYM,SYMBOL_TRADE_TICK_SIZE);
   if(tickVal<=0||tickSize<=0||slPts<=0) return 0;
   double valPerPt  = tickVal*(_Point/tickSize);          // money per point per lot
   double lot       = riskMoney/(slPts*valPerPt);
   double step      = SymbolInfoDouble(SYM,SYMBOL_VOLUME_STEP);
   lot = MathFloor(lot/step)*step;
   lot = MathMin(lot, MaxLot);
   lot = MathMin(lot, SymbolInfoDouble(SYM,SYMBOL_VOLUME_MAX));
   return lot;
}

// Open the trade with SL and the RUNNER target (TP2). TP1 is managed in code so
// we can partial-close and move SL to breakeven (ladder). Stash levels in comment.
void ExecuteTrade(int dir,double price,double sl,double tp1,double tp2,double atr)
{
   double lot = LotForRisk(price, sl);
   if(lot<=0) { g_phase="IDLE"; return; }
   string cmt = StringFormat("AURUM|tp1=%.2f", tp1);   // remember TP1 for the ladder

   bool ok = (dir>0) ? trade.Buy (lot, SYM, price, sl, tp2, cmt)
                     : trade.Sell(lot, SYM, price, sl, tp2, cmt);
   if(ok)
   {
      g_phase = "IN_POSITION";
      PrintFormat("AURUM %s %.2f lot @ %.2f · SL %.2f · TP1 %.2f · TP2 %.2f · by %s",
                  (dir>0?"BUY":"SELL"), lot, price, sl, tp1, tp2, g_lastVotedBy);
   }
   else { PrintFormat("AURUM order failed: %d", trade.ResultRetcode()); g_phase="IDLE"; }
}

//====================== MANAGE OPEN POSITION ======================
// Ladder: at TP1, close half and move SL to breakeven; let the rest run to TP2.
void ManageOpenPosition()
{
   if(!PositionSelectByMagic()) { g_halfTicket=0; g_phase="IDLE"; return; }

   long   type  = PositionGetInteger(POSITION_TYPE);
   double entry = PositionGetDouble(POSITION_PRICE_OPEN);
   double vol   = PositionGetDouble(POSITION_VOLUME);
   double cur   = (type==POSITION_TYPE_BUY)? SymbolInfoDouble(SYM,SYMBOL_BID)
                                           : SymbolInfoDouble(SYM,SYMBOL_ASK);
   ulong  ticket= PositionGetInteger(POSITION_TICKET);
   double tp1   = ParseTP1(PositionGetString(POSITION_COMMENT));
   bool   halfDone = (g_halfTicket==ticket);
   g_phase = "IN_POSITION";

   if(tp1>0 && !halfDone)
   {
      bool hit = (type==POSITION_TYPE_BUY)? (cur>=tp1) : (cur<=tp1);
      if(hit)
      {
         double half = NormalizeVolume(vol/2.0);
         if(half>=SymbolInfoDouble(SYM,SYMBOL_VOLUME_MIN))
            trade.PositionClosePartial(ticket, half);          // bank half at TP1
         // move SL to breakeven on the remainder + remember we've laddered this ticket
         trade.PositionModify(ticket, entry, PositionGetDouble(POSITION_TP));
         g_halfTicket = ticket;
         PrintFormat("AURUM TP1 hit — closed half, SL → breakeven %.2f", entry);
      }
   }
}

//============================ BRIDGE I/O ==========================
// POST desk status (FLAT shape — matches Sim.applyLive / Code.gs action=status)
void PushStatus()
{
   string posJson = "null";
   if(PositionSelectByMagic())
   {
      long type   = PositionGetInteger(POSITION_TYPE);
      double entry= PositionGetDouble(POSITION_PRICE_OPEN);
      double vol  = PositionGetDouble(POSITION_VOLUME);
      double sl   = PositionGetDouble(POSITION_SL);
      double tp2  = PositionGetDouble(POSITION_TP);
      double tp1  = ParseTP1(PositionGetString(POSITION_COMMENT));
      bool   half = (g_halfTicket==(ulong)PositionGetInteger(POSITION_TICKET));
      posJson = StringFormat(
         "{\"side\":\"%s\",\"entry\":%.2f,\"lot\":%.2f,\"oz\":%.0f,\"sl\":%.2f,\"tp1\":%.2f,\"tp2\":%.2f,\"half\":%s}",
         (type==POSITION_TYPE_BUY?"BUY":"SELL"), entry, vol, vol*100.0, sl, tp1, tp2, (half?"true":"false"));
   }
   double bid = SymbolInfoDouble(SYM,SYMBOL_BID);
   double ask = SymbolInfoDouble(SYM,SYMBOL_ASK);
   double spread = (double)SymbolInfoInteger(SYM,SYMBOL_SPREAD);
   string mode = HasPosition() ? "signal" : "idle";

   // Full realized stats from history so the web summary is REAL (not demo seed).
   int dTr,dW,dL; double dP; PeriodStats(DayStamp(),  dTr,dW,dL,dP);
   int wTr,wW,wL; double wP; PeriodStats(WeekStart(), wTr,wW,wL,wP);
   int dWR = (dTr>0)? (int)MathRound(100.0*dW/dTr):0;
   int wWR = (wTr>0)? (int)MathRound(100.0*wW/wTr):0;

   string body = StringFormat(
      "{\"kind\":\"status\",\"secret\":\"%s\",\"ver\":\"%s\",\"mode\":\"%s\",\"phase\":\"%s\","
      "\"price\":%.2f,\"equity\":%.2f,\"position\":%s,"
      "\"daily\":{\"trades\":%d,\"win\":%d,\"loss\":%d,\"winrate\":%d,\"pnl\":%.1f},"
      "\"weekly\":{\"trades\":%d,\"win\":%d,\"loss\":%d,\"winrate\":%d,\"pnl\":%.1f},"
      "\"learn\":{\"consec\":%d,\"riskPct\":%.2f,\"cooldown\":%s,\"halt\":%s},"
      "%s,"
      "\"prices\":{\"XAU/USD\":{\"bid\":%.2f,\"ask\":%.2f,\"spread\":%.0f}},"
      "\"ts\":%d}",
      BridgeSecret, EA_VERSION, mode, g_phase, bid, AccountInfoDouble(ACCOUNT_EQUITY), posJson,
      dTr,dW,dL,dWR,dP, wTr,wW,wL,wWR,wP,
      g_consecLosses, RiskPercent*LossRiskFactor(), (CooldownActive()?"true":"false"), (LossHalt()?"true":"false"),
      g_decJson, bid, ask, spread, (int)TimeGMT());
   HttpPost(body);
}

// Realized trade stats for closed deals (our magic/symbol) since `from`.
void PeriodStats(datetime from, int &trades, int &wins, int &losses, double &pnl)
{
   trades=0; wins=0; losses=0; pnl=0;
   if(!HistorySelect(from, TimeCurrent()+1)) return;
   int total = HistoryDealsTotal();
   for(int i=0;i<total;i++)
   {
      ulong t = HistoryDealGetTicket(i);
      if(t==0) continue;
      if(HistoryDealGetInteger(t,DEAL_MAGIC)!=MagicNumber) continue;
      if(HistoryDealGetString(t,DEAL_SYMBOL)!=SYM) continue;
      if(HistoryDealGetInteger(t,DEAL_ENTRY)!=DEAL_ENTRY_OUT) continue;  // realized closes
      double p = HistoryDealGetDouble(t,DEAL_PROFIT)
               + HistoryDealGetDouble(t,DEAL_SWAP)
               + HistoryDealGetDouble(t,DEAL_COMMISSION);
      trades++; pnl+=p; if(p>=0) wins++; else losses++;
   }
}

// Monday 00:00 of the current week (server time).
datetime WeekStart()
{
   MqlDateTime d; TimeToStruct(TimeCurrent(),d);
   int back = (d.day_of_week==0)? 6 : d.day_of_week-1;  // days since Monday (Sun=0)
   return DayStamp() - back*86400;
}

// POST a closed-trade record (kind:trade) — feeds the web "lessons" loop.
void PushTrade(string side,double exit,double profit,string outcome,double lot,ulong posId)
{
   string body = StringFormat(
      "{\"kind\":\"trade\",\"secret\":\"%s\",\"posId\":\"%I64u\",\"side\":\"%s\","
      "\"exit\":%.2f,\"profit\":%.2f,\"outcome\":\"%s\","
      "\"lot\":%.2f,\"votedBy\":\"%s\",\"sageNote\":\"%s\",\"closeTime\":%d}",
      BridgeSecret, posId, side,
      exit, profit, outcome, lot, g_lastVotedBy, g_lastSageNote, (int)TimeGMT());
   HttpPost(body);
}

// GET next command + news risk; act on pause/resume/close_all.
void PollCommand()
{
   string url = TrimSlash(BridgeURL) + "?action=command&since=" + IntegerToString(g_lastCmdId)
              + "&secret=" + BridgeSecret;
   string resp = HttpGet(url);
   if(StringLen(resp)==0) return;

   // crude JSON field reads (no JSON lib in MQL5) — robust enough for our shapes
   g_newsBlock = (StringFind(resp,"\"block\":true")>=0);
   g_newsCur   = JsonStr(resp,"cur");

   int id = (int)JsonNum(resp,"id");
   if(id>g_lastCmdId)
   {
      string cmd = JsonStr(resp,"cmd");
      g_lastCmdId = id;
      if(cmd=="pause")      { g_paused=true;  Print("AURUM: paused by web"); }
      else if(cmd=="resume"){ g_paused=false; Print("AURUM: resumed by web"); }
      else if(cmd=="close_all") CloseAllOwn();
      // "signal" (manual web entry) intentionally not auto-traded in v1 — analyse-first
   }
}

//============================ HELPERS =============================
double Buf(int handle,int shift)
{
   double b[]; if(CopyBuffer(handle,0,shift,1,b)<=0) return 0; return b[0];
}
bool HasPosition() { return PositionSelectByMagic(); }
bool PositionSelectByMagic()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i);
      if(t==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)==MagicNumber &&
         PositionGetString(POSITION_SYMBOL)==SYM) return true;
   }
   return false;
}
void CloseAllOwn()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i);
      if(t==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)==MagicNumber &&
         PositionGetString(POSITION_SYMBOL)==SYM) trade.PositionClose(t);
   }
   Print("AURUM: closed all own positions (web command)");
}
double NormalizeVolume(double v)
{
   double step=SymbolInfoDouble(SYM,SYMBOL_VOLUME_STEP);
   return MathFloor(v/step)*step;
}
double ParseTP1(string comment)
{
   int p=StringFind(comment,"tp1=");
   if(p<0) return 0;
   string tail=StringSubstr(comment,p+4);
   int bar=StringFind(tail,"|"); if(bar>=0) tail=StringSubstr(tail,0,bar);
   return StringToDouble(tail);
}
// day PnL helpers (for IRON's daily-loss cap + status)
void ResetDayAnchor(){ g_dayStartEq=AccountInfoDouble(ACCOUNT_EQUITY); g_dayStamp=DayStamp(); }
void RollDayAnchor(){ if(DayStamp()!=g_dayStamp) { ResetDayAnchor(); g_paused=false; g_consecLosses=0; } }
datetime DayStamp(){ MqlDateTime d; TimeToStruct(TimeCurrent(),d); d.hour=0; d.min=0; d.sec=0; return StructToTime(d); }
double DayPnLMoney(){ return AccountInfoDouble(ACCOUNT_EQUITY)-g_dayStartEq; }
double DailyLossPct(){ if(g_dayStartEq<=0) return 0; return DayPnLMoney()/g_dayStartEq*100.0; }

// minimal JSON readers
string JsonStr(string src,string key)
{
   int p=StringFind(src,"\""+key+"\":\""); if(p<0) return "";
   p+=StringLen(key)+4; int e=StringFind(src,"\"",p);
   if(e<0) return ""; return StringSubstr(src,p,e-p);
}
double JsonNum(string src,string key)
{
   int p=StringFind(src,"\""+key+"\":"); if(p<0) return 0;
   p+=StringLen(key)+3; return StringToDouble(StringSubstr(src,p,12));
}
string TrimSlash(string u){ if(StringLen(u)>0 && StringGetCharacter(u,StringLen(u)-1)=='/') return StringSubstr(u,0,StringLen(u)-1); return u; }

// WebRequest wrappers ----------------------------------------------------
void HttpPost(string body)
{
   char post[], result[]; string rh;
   // count = StringLen → copies exactly the body bytes, no terminating 0 (what WebRequest wants)
   StringToCharArray(body, post, 0, StringLen(body));
   int code = WebRequest("POST", TrimSlash(BridgeURL), "Content-Type: text/plain\r\n", 5000, post, result, rh);
   if(code==-1) PrintFormat("AURUM WebRequest(POST) err %d — allow %s in Options", GetLastError(), BridgeURL);
}
string HttpGet(string url)
{
   char post[], result[]; string rh;
   int code = WebRequest("GET", url, "", 5000, post, result, rh);
   if(code==-1){ PrintFormat("AURUM WebRequest(GET) err %d — allow URL in Options", GetLastError()); return ""; }
   return CharArrayToString(result);
}

//============================ DASHBOARD ===========================
void UpdateDashboard()
{
   string s = "🥇 AURUM — XAU AI Desk  v"+EA_VERSION+"  (magic "+ (string)MagicNumber +")\n";
   s += "─────────────────────────────\n";
   s += "Symbol: " + SYM + "\n";
   s += "Phase : " + g_phase + (g_paused?"   [PAUSED]":"") + "\n";
   s += "Price : " + DoubleToString(SymbolInfoDouble(SYM,SYMBOL_BID),2)
      + "   Spread " + (string)SymbolInfoInteger(SYM,SYMBOL_SPREAD) + "\n";
   s += "Equity: " + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),2)
      + "   Day P/L " + DoubleToString(DayPnLMoney(),2)
      + " (" + DoubleToString(DailyLossPct(),2) + "%)\n";
   if(g_newsBlock) s += "⚠ NEWS BLOCK ("+g_newsCur+") — standing down\n";
   s += "─────────────────────────────\n";
   s += "Rules: R:R≥"+DoubleToString(MinRR,1)+"  spread≤"+(string)MaxSpreadPts
      + "  lot≤"+DoubleToString(MaxLot,2)+"  dayloss≤"+DoubleToString(MaxDailyLossPct,1)+"%\n";
   if(UseLossAdaptive)
      s += "Learn: losses "+(string)g_consecLosses+"/"+(string)MaxConsecLosses
         + " · risk×"+DoubleToString(LossRiskFactor(),2)
         + (LossHalt()?" · HALT":(CooldownActive()?" · COOLDOWN":""))+"\n";
   if(StringLen(g_lastVotedBy)>0)  s += "Votes: "+g_lastVotedBy+"\n";
   if(StringLen(g_lastSageNote)>0) s += "SAGE : "+g_lastSageNote+"\n";
   if(HasPosition())
   {
      PositionSelectByMagic();
      s += "Open : "+(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?"BUY":"SELL")
         + " "+DoubleToString(PositionGetDouble(POSITION_VOLUME),2)+" lot @ "
         + DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN),2)
         + "  P/L "+DoubleToString(PositionGetDouble(POSITION_PROFIT),2);
   }
   Comment(s);
}

//====================== CLOSED-TRADE → BRIDGE =====================
// Detect our closes via OnTradeTransaction and push the record for "lessons".
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest& req,
                        const MqlTradeResult& res)
{
   if(trans.type!=TRADE_TRANSACTION_DEAL_ADD) return;
   if(StringLen(BridgeURL)==0) return;

   ulong dealTicket = trans.deal;
   if(!HistoryDealSelect(dealTicket)) return;
   if(HistoryDealGetInteger(dealTicket,DEAL_MAGIC)!=MagicNumber) return;
   if(HistoryDealGetString(dealTicket,DEAL_SYMBOL)!=SYM) return;
   if(HistoryDealGetInteger(dealTicket,DEAL_ENTRY)!=DEAL_ENTRY_OUT) return;  // closes only

   double profit = HistoryDealGetDouble(dealTicket,DEAL_PROFIT)
                 + HistoryDealGetDouble(dealTicket,DEAL_SWAP)
                 + HistoryDealGetDouble(dealTicket,DEAL_COMMISSION);
   double exit   = HistoryDealGetDouble(dealTicket,DEAL_PRICE);
   double lot    = HistoryDealGetDouble(dealTicket,DEAL_VOLUME);
   ulong  posId  = HistoryDealGetInteger(dealTicket,DEAL_POSITION_ID);
   long   dtype  = HistoryDealGetInteger(dealTicket,DEAL_TYPE);
   string side   = (dtype==DEAL_TYPE_SELL)?"BUY":"SELL";   // closing deal is opposite the entry
   string outcome= (profit>=0)?"win":"loss";

   // self-learning: track the losing streak (a win resets it, a loss extends it
   // and starts the anti-revenge cooldown)
   if(profit < 0)      { g_consecLosses++; g_lastLossTime = TimeCurrent();
                         PrintFormat("AURUM learn: loss #%d in a row → risk ×%.2f", g_consecLosses, LossRiskFactor()); }
   else if(profit > 0) { g_consecLosses = 0; }

   PushTrade(side, exit, profit, outcome, lot, posId);
}
//+------------------------------------------------------------------+
