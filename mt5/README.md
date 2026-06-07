# ชั้น 3 — AURUM EA (MetaTrader 5)

`Aurum_EA.mq5` — กล้ามเนื้อของระบบ เทรด **XAU/USD** อย่างเดียว · magic **992611**
ทีม 7 คนทำงานในโค้ด: SCANNER → HAWK×3 (โหวต 2/3) → SAGE (veto) → IRON (กฎเหล็ก) → AURUM (จัดการไม้ TP ขั้นบันได)

> ⚠️ ยังไม่ได้คอมไพล์ผ่าน MetaEditor บนเครื่องนี้ (ไม่มี MT5) — ต้องเปิดใน MetaEditor แล้วกด Compile ตรวจอีกที
> ⚠️ **ทดสอบบนบัญชี Demo ก่อนเสมอ** — โค้ดส่งคำสั่งเทรดจริง

## ติดตั้ง
1. ก๊อป `Aurum_EA.mq5` ไปไว้ใน `MQL5/Experts/` ของ MT5
   (MetaEditor → ดูพาธจาก File → Open Data Folder)
2. เปิดใน **MetaEditor** → กด **Compile** (F7) → ได้ `Aurum_EA.ex5`
3. ลาก EA ลงกราฟ **XAU/USD** (timeframe ที่อยากให้สแกน เช่น M5/M15/H1)
4. เปิด **AutoTrading** (ปุ่มบนแถบเครื่องมือ)

## เปิดให้ต่อ bridge (ถ้าจะ sync กับเว็บ)
MT5 → **Tools → Options → Expert Advisors** → ☑ *Allow WebRequest for listed URL* แล้วเพิ่ม:
```
https://script.google.com
https://script.googleusercontent.com
```
จากนั้นใส่ `/exec` URL ลงใน input **BridgeURL** ของ EA และให้ตรงกับที่วางในเว็บ (ปุ่ม "เชื่อมต่อ")
**BridgeSecret** ต้องตรงกับ `SECRET` ใน `bridge/Code.gs`

## Inputs สำคัญ (กฎเหล็ก = IRON — ให้ตรงกับ `js/config.js`)
| Input | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `EnableTrading` | true | false = วิเคราะห์อย่างเดียว ไม่ส่งออเดอร์ |
| `RiskPercent` | 1.0 | เสี่ยงต่อไม้ (% ของ equity) |
| `MinRR` | 1.8 | reward:risk ขั้นต่ำ (SAGE veto ถ้าต่ำกว่า) |
| `MaxSpreadPts` | 25 | spread เกินนี้ IRON ข้าม |
| `MaxLot` | 0.20 | lot สูงสุด |
| `MaxDailyLossPct` | 3.0 | ขาดทุนวันถึงนี้ → หยุดเทรดทั้งวัน |
| `MinADX` | 22 | HAWK-1 (เทรนด์) ต้องการ ADX เกินนี้ถึงโหวต |
| `SL_ATR / TP1_ATR / TP2_ATR` | 1.5 / 1.8 / 3.6 | ระยะ SL/TP เป็นเท่าของ ATR |
| `UseNewsBlock` | true | งดเข้าไม้รอบข่าวแรง USD (รับจาก bridge) |

## ทีมตัดสินใจยังไง (ในโค้ด)
- **SCANNER** — รอ "เบรก swing high/low" ในรอบ `SwingLookback` แท่ง ถึงปลุกทีม
- **HAWK-1 (เทรนด์):** EMA20 vs EMA50 + ADX>MinADX
- **HAWK-2 (โครงสร้าง):** เบรกขึ้น = BUY / เบรกลง = SELL
- **HAWK-3 (สวนกระแส):** RSI≥70 → fade ลง, ≤30 → fade ขึ้น (ไม่งั้นงดออกเสียง)
- ต้อง **2 ใน 3** เห็นทางเดียวกัน ไม่งั้นพับ
- **SAGE:** เช็คข่าว + คำนวณ SL/TP จาก ATR → veto ถ้า R:R < MinRR หรือมีข่าวแรง
- **IRON:** spread / lot cap / เพดานขาดทุนวัน → ผ่านครบค่อยยิง
- **ladder TP:** ถึง TP1 ปิดครึ่ง + เลื่อน SL มาทุน, ที่เหลือวิ่งไป TP2

## คุยกับ bridge
- ทุก `StatusEverySec` (10 วิ): POST `{kind:status}` → เว็บเห็นราคา/เฟส/ออเดอร์/equity
- ทุก `CommandEverySec` (15 วิ): GET `?action=command` → รับ `pause/resume/close_all` + ความเสี่ยงข่าว
- ตอนปิดไม้: POST `{kind:trade}` → เก็บลง LIVE_TRADES/Sheet (ฟีด "บทเรียน")

## ข้อจำกัด v1 (ตั้งใจให้เรียบง่าย/ปลอดภัยก่อน)
- HAWK เป็น **rule-based** (ไม่ใช่ LLM) — LLM วิเคราะห์ทำที่ฝั่งเว็บ/bridge ทีหลังได้
- คำสั่ง `signal` จากเว็บ **ไม่** auto-trade (วิเคราะห์ก่อน) — เปิดใช้ทีหลังได้
- ยังไม่มี trailing stop เต็มรูป (มีแค่ breakeven ที่ TP1)
