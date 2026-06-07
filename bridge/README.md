# ชั้น 2 — AURUM Bridge (Google Apps Script)

สะพานเชื่อมเว็บ (ชั้น 1) ↔ MT5 EA (ชั้น 3) เก็บ state + คิวคำสั่ง + log ไม้ลง Sheet
ไม่มีไฟล์ build — ก๊อป `Code.gs` ไปวางใน Apps Script ตรง ๆ

## วิธี deploy
1. ไป <https://script.google.com> → **New project**
2. ลบโค้ดเดิม แล้ววางเนื้อหา `Code.gs` ทั้งไฟล์
3. (ถ้าอยากเก็บไม้ลง Google Sheet) สร้าง Sheet เปล่า → ก๊อป ID จาก URL มาวางที่ `const SHEET_ID = '...'`
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. ก๊อป **/exec URL** ที่ได้ ไปใส่ 2 ที่:
   - `js/config.js` → `bridgeURL: '<URL>'` + เปลี่ยน `dataMode: 'live'`
   - EA input → `BridgeURL`
6. MT5 → Tools → Options → Expert Advisors → ☑ Allow WebRequest แล้วเพิ่ม:
   ```
   https://script.google.com
   https://script.googleusercontent.com
   ```

## ทดสอบเร็ว ๆ (หลัง deploy)
เปิด URL พวกนี้บนเบราว์เซอร์:
- `…/exec?action=status` → ควรได้ `{"ok":false,"msg":"no data yet — EA not connected"}` (ปกติ ถ้า EA ยังไม่ส่ง)
- `…/exec?action=news` → ได้ค่าความเสี่ยงข่าวตอนนี้

## ความปลอดภัย (ตามจริง)
- เว็บเป็น GitHub Pages **สาธารณะ** → secret ที่ส่งไปเบราว์เซอร์ถือว่าเปิดเผยอยู่แล้ว
- bridge จึงกัน secret เฉพาะ **การเขียน status/trade จาก EA** (กันคนปลอม dashboard)
- ส่วนคำสั่งจากเว็บ (`cmd`) จำกัดด้วย whitelist: `pause / resume / close_all / signal`
- `SECRET` ใน `Code.gs` ต้องตรงกับ `BridgeSecret` ใน EA

## เปลี่ยน Code.gs แล้วต้องทำไง
Apps Script ต้อง **Deploy → Manage deployments → แก้ deployment เดิม → Version: New** ทุกครั้ง
ไม่งั้น /exec ยังรันโค้ดเวอร์ชันเก่า
