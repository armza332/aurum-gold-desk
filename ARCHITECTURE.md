# 🥇 AURUM — ห้องเทรดทอง AI · System Architecture

> โปรเจคบอทเทรดทอง XAU/USD ส่วนตัว — AI ทีมเดียวโฟกัสทองอย่างเดียว
> สถาปัตยกรรม 3 ชั้นแบบเดียวกับ Trading War Room แต่ตัดให้เหลือทีม 7 คนที่กระชับ
> เอกสารนี้ = แหล่งความจริงเดียวของวิธีต่อกันของทั้งระบบ

---

## 🗺 สถาปัตยกรรม 3 ชั้น

```
┌────────────────────────────────────────────────────────────────┐
│  ชั้น 1 — สมอง (Web · GitHub Pages)            ✅ สร้างแล้ว (เฟสนี้) │
│  index.html + js/                                                │
│                                                                  │
│  • ห้องเทรด pixel — 7 agents เดินทำงานเป็นทอด ๆ                  │
│  • pipeline: SCANNER → HAWK×3 → SAGE → กฎเหล็ก → MT5            │
│  • การ์ด: ออเดอร์ · การตัดสินใจ · ข่าว/อารมณ์ · สรุปผล · บทเรียน  │
│  • โหมด mock (เดโม) / live (ดึงข้อมูลจริงจาก bridge)             │
└───────────────────────────┬──────────────────────────────────────┘
                            │ Apps Script bridge (HTTPS, action=…)
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  ชั้น 2 — สะพาน (Google Apps Script)            ✅ สร้างแล้ว        │
│  bridge/Code.gs → /exec                                          │
│                                                                  │
│  • เก็บ: LATEST_STATUS · LATEST_PRICES · LIVE_TRADES · คิวคำสั่ง  │
│  • EA POST status/prices/trades · Web GET                       │
│  • Web POST คำสั่ง · EA poll                                     │
│  • บันทึกทุกไม้ลง Google Sheet (สำหรับ "บทเรียน")               │
└───────────────────────────┬──────────────────────────────────────┘
                            │ WebRequest (HTTPS)
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  ชั้น 3 — กล้ามเนื้อ (MT5 Expert Advisor)        ⬜ เฟสถัดไป        │
│  mt5/Aurum_EA.mq5 · magic 992611 · XAU/USD เท่านั้น             │
│                                                                  │
│  • SCANNER: คำนวณ MA/RSI/ATR/ADX เอง ทุก 20 วิ                  │
│  • คิดสัญญาณเอง (SignalMode=EA) + รับ Web signal ได้            │
│  • กฎเหล็ก (IRON) คุมเสี่ยง: R:R / spread / lot / เพดานวัน      │
│  • TP ขั้นบันได: ปิดครึ่งที่ TP1 → เลื่อน SL มาทุน → ปล่อยวิ่ง   │
└────────────────────────────────────────────────────────────────┘
```

---

## 👥 ทีม AI 7 คน (ตรวจกันเองก่อนเข้าทุกไม้)

| Agent | บทบาท | ใช้ AI? | หน้าที่ |
|-------|-------|--------|--------|
| **SCANNER** | ยามเฝ้าตลาด | ❌ โค้ด | สแกนทุก 20 วิ คำนวณ indicator + ดึงข่าวฟรี เจอจังหวะค่อยปลุกทีม |
| **HAWK-1** | นักวิเคราะห์ สายเทรนด์ | ✅ | อ่านเทรนด์ H1 (MA/ADX) |
| **HAWK-2** | นักวิเคราะห์ สายโครงสร้าง | ✅ | swing high/low, เบรก+รีเทสต์ |
| **HAWK-3** | นักวิเคราะห์ สายสวนกระแส | ✅ | overbought/oversold |
| **SAGE** | หัวหน้าฝ่ายเสี่ยง | ✅ | ตรวจซ้ำอิสระ · **VETO ได้** · ปรับ SL/TP |
| **IRON** | กฎเหล็ก + ส่ง MT5 | ❌ โค้ด | หนีบทุกค่า R:R/spread/lot/เพดานวัน — ไม่มีอารมณ์ |
| **AURUM** | เทรดเดอร์ | — | เปิดไม้ · TP ขั้นบันได · เลื่อน SL |

**กติกาเข้าไม้:** SCANNER ปลุก → HAWK โหวต (ต้อง **2/3** เห็นตรง) → SAGE ตรวจซ้ำ (veto ได้) → กฎเหล็กหนีบ → ยิงเข้า MT5
**คติ:** "เข้าน้อยแต่เข้าแม่น" ดีกว่า "เข้ารัวแล้วเจ๊ง"

---

## 🔌 Bridge Contract  ✅ สร้างแล้วที่ `bridge/Code.gs`

ชั้น 1 (`js/bridge.js`) ↔ ชั้น 2 (`bridge/Code.gs`) ↔ ชั้น 3 (EA) คุยกันตามนี้
> **status เก็บ/คืนแบบ FLAT** — `Sim.applyLive()` อ่าน field ที่ระดับบนสุดตรง ๆ

### Web → Bridge (GET)
| Endpoint | คืนค่า |
|---|---|
| `?action=status` | flat: `{ ok, online, ageSec, mode, phase, price, equity, position, daily, weekly, ts }` |
| `?action=prices` | `{ ok, prices:{ "XAU/USD":{bid,ask,spread} }, online }` |
| `?action=trades[&since=ts]` | `{ ok, trades:[ {posId,side,lot,entry,exit,profit,...} ], total }` |
| `?action=news[&win=15]` | `{ ok, news:{risk,block,near,cur} }` |

### Web → Bridge (POST คำสั่ง — whitelist, ไม่ต้องใช้ secret)
```json
{ "kind": "cmd", "cmd": "pause" | "resume" | "close_all" | "signal", "args": null }
```

### EA → Bridge (POST เขียน state — ต้องมี secret)
```json
{ "kind": "status", "secret": "...", "phase": "...", "price": 2348.2,
  "position": {...}, "equity": 10000, "daily": {...}, "prices": {...}, "ts": ... }
{ "kind": "trade",  "secret": "...", "posId": "...", "side": "BUY",
  "profit": 12.4, "votedBy": ["HAWK-1","HAWK-2"], "sageNote": "..." }
```

### EA → Bridge (GET รับคำสั่ง + ความเสี่ยงข่าว)
| Endpoint | คืนค่า |
|---|---|
| `?action=command&since=N&secret=…` | `{ ok, cmd, args, id, ts, news:{risk,block,near,cur} }` |

### รูปร่าง `status.position` (ตรงกับที่ Web การ์ด "ออเดอร์" ใช้)
```json
{ "side": "BUY", "entry": 2348.2, "lot": 0.10, "oz": 10,
  "sl": 2343.8, "tp1": 2354.0, "tp2": 2360.0, "half": false }
```

> ค่า phase ที่ valid: `IDLE · SCANNING · ANALYZING · RISK · RULES · EXECUTING · IN_POSITION`
> **ความปลอดภัย:** secret กันเฉพาะ EA writes (status/trade) เพราะเว็บ public; คำสั่งจากเว็บกันด้วย whitelist แทน — ดู `bridge/README.md`

---

## ⚙️ ตั้งค่า (ชั้น 1)

ทุกอย่างอยู่ที่ `js/config.js` ที่เดียว:

| คีย์ | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `dataMode` | `'mock'` | `mock`=เดโม / `live`=ดึง bridge |
| `bridgeURL` | `''` | วาง Apps Script /exec URL เพื่อไป live |
| `magic` | `992611` | MT5 magic ของโปรเจคนี้ (คนละตัวกับ 992511) |
| `rules.minRR` | `1.8` | reward:risk ขั้นต่ำ |
| `rules.maxSpreadPts` | `25` | spread เกินนี้ข้าม |
| `rules.maxLot` | `0.20` | lot สูงสุด |
| `rules.maxDailyLossPct` | `3.0` | ขาดทุนวันถึงนี้หยุดเทรด |
| `rules.riskPerTradePct` | `1.0` | เสี่ยงต่อไม้ |
| `hawkConsensus` | `2` | ต้องโหวตตรง ≥2 จาก 3 |

> **หมายเหตุ:** กฎเหล็กตัวจริงอยู่ที่ EA (ชั้น 3) — ค่าใน config นี้คือ "กระจก" ให้คนเห็นว่าทำไมไม้ถึงถูกข้าม ต้องตั้งให้ตรงกับ EA

---

## 🚀 รันชั้น 1 ในเครื่อง

ไม่ต้องมี Python/Node — มี static server PowerShell ให้แล้ว:
```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1 8745
# เปิด http://localhost:8745
```

---

## 🗂 โครงสร้างไฟล์

```
TradeXAU USD/
├── index.html          # แอป AURUM (ชั้น 1)
├── serve.ps1           # static server (ไม่ต้องพึ่ง Python/Node)
├── css/styles.css      # ธีม modern
├── js/
│   ├── config.js       # ⭐ ศูนย์รวมตั้งค่า + เพดานเสี่ยง
│   ├── bridge.js       # ⭐ client ชั้น 2 (mock/live)
│   ├── sim.js          # เครื่องยนต์เดโม + applyLive() รับข้อมูลสด
│   ├── agents.js       # นิยาม 7 agents + เดิน/อนิเมชัน
│   ├── scene.js        # วาดห้อง
│   ├── pixel.js        # sprite engine
│   ├── ui.js           # การ์ด HUD + popup + pipeline
│   └── main.js         # boot + render loop + เริ่ม bridge poll
└── design/             # ต้นฉบับ design (อ้างอิง)
```

---

## 📍 สถานะ & ก้าวถัดไป

- ✅ **ชั้น 1 (สมอง)** — เสร็จ: เดโมรันได้, โครง live พร้อม, contract นิยามแล้ว
- ✅ **ชั้น 2 (สะพาน)** — เสร็จ: `bridge/Code.gs` + คู่มือ deploy `bridge/README.md`
- ⬜ **ชั้น 3 (กล้ามเนื้อ)** — สร้าง `mt5/Aurum_EA.mq5` (XAU/USD, magic 992611, 7-agent logic + กฎเหล็ก)

## ⚠️ ข้อควรระวัง
- เดโม/ข้อมูลตัวอย่างเท่านั้นในชั้น 1 — ยังไม่ต่อเงินจริง
- ทดสอบบน **บัญชี Demo** ก่อนเสมอเมื่อมี EA
- กฎเหล็กต้อง enforce ที่ EA จริง ไม่ใช่แค่โชว์บนเว็บ
- ผลย้อนหลัง ≠ ผลอนาคต
