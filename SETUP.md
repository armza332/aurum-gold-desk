# 🚀 AURUM — เช็คลิสต์เปิดใช้จริง (Go-Live)

ทำตามลำดับนี้ให้ครบ ระบบจะพร้อมเทรด **ข้อมูลจริงล้วน ไม่มีเดโม**
> ⚠️ แนะนำให้รันบน **บัญชี Demo ของโบรกเกอร์** อย่างน้อย 1–2 วันก่อนใช้เงินจริง — "ไม่มีเดโมในแอป" (ไม่มีข้อมูลจำลองบนหน้าเว็บ) คนละเรื่องกับ "บัญชีจริง"

---

## ✅ สถานะตอนนี้
- เว็บ (ชั้น 1): `demoMode = false` → **ไม่มีข้อมูลจำลองแล้ว** ก่อนต่อ EA จะขึ้น "ยังไม่เชื่อมต่อ" + ราคา "—" ทุกการ์ดเป็น placeholder
- bridge (ชั้น 2): `bridge/Code.gs` พร้อม deploy
- EA (ชั้น 3): `mt5/Aurum_EA.mq5` **v1.0.0** — โชว์เวอร์ชันบนกราฟ + ส่งขึ้นเว็บให้ตรวจสอบ

---

## 1) Deploy bridge (ครั้งเดียว)
1. <https://script.google.com> → New project → วางทั้งไฟล์ `bridge/Code.gs`
2. (ออปชัน) อยากเก็บไม้ลง Sheet → สร้าง Sheet เปล่า เอา ID ใส่ `const SHEET_ID`
3. **Deploy → New deployment → Web app** · Execute as **Me** · Access **Anyone**
4. ก๊อป **/exec URL**
5. ทดสอบ: เปิด `…/exec?action=status` ควรได้ `{"ok":false,"msg":"no data yet…"}`

## 2) ตั้ง EA บน MT5
1. ก๊อป `Aurum_EA.mq5` → `MQL5/Experts/` → เปิด MetaEditor → **Compile (F7)** ต้องผ่าน
2. **Tools → Options → Expert Advisors → ☑ Allow WebRequest** เพิ่ม:
   ```
   https://script.google.com
   https://script.googleusercontent.com
   ```
3. ลาก EA ลงกราฟ **XAU/USD** + เปิด **AutoTrading**
4. ตั้ง inputs:
   - `BridgeURL` = /exec URL (ข้อ 1)
   - `BridgeSecret` = ตรงกับ `SECRET` ใน Code.gs (ค่าเริ่มต้น `aurum-secret`)
   - `EnableTrading` = true (หรือ false ถ้าจะดูเฉย ๆ ก่อน)
   - ตรวจกฎเหล็ก: `RiskPercent / MinRR / MaxSpreadPts / MaxLot / MaxDailyLossPct`
5. มุมกราฟต้องขึ้น `🥇 AURUM — XAU AI Desk v1.0.0 …`

## 3) ต่อเว็บเข้ากับ bridge
1. เปิดเว็บ <https://armza332.github.io/aurum-gold-desk/>
2. กดปุ่ม **"ยังไม่เชื่อมต่อ"** (มุมขวาบน) → วาง /exec URL → **ทดสอบ** → **บันทึก & เชื่อมต่อ**
3. ปุ่มควรเปลี่ยนเป็น 🟢 **"สด · EA v1.0.0"**

## 4) ตรวจสอบเวอร์ชัน (สำคัญ)
- ปุ่มมุมขวาบน / แถบล่างของเว็บ ต้องโชว์ **EA v1.0.0**
- ถ้าเว็บโชว์เวอร์ชันไม่ตรงกับไฟล์ (`#define EA_VERSION` ใน `Aurum_EA.mq5`) = **กราฟยังรันโค้ดเก่า** → recompile (F7) + ลาก EA ลงใหม่

---

## 🚦 ความหมายของไฟสถานะบนเว็บ
| ไฟ | แปลว่า | ต้องทำ |
|---|---|---|
| ⚪ ยังไม่เชื่อมต่อ | ยังไม่วาง URL | กดปุ่ม วาง /exec |
| 🔴 ต่อไม่ได้ | URL ผิด / deploy ไม่ใช่ Anyone / เน็ต | แก้ตามข้อความ |
| 🟡 รอ EA | bridge ติด แต่ EA ไม่ส่ง | เปิด EA + Allow WebRequest + ใส่ BridgeURL |
| 🟢 สด · EA vX | ครบทุกอย่าง | พร้อมเทรด |

## 🧭 อ่านหน้าเว็บยังไง
- **ออเดอร์**: ไม้ที่เปิดอยู่จริง + TP ขั้นบันได
- **การตัดสินใจ**: โหวต HAWK ×3 + ผล 2/3 + SAGE (ผ่าน/VETO) + กฎเหล็ก
- **สรุปผล**: ไม้/ชนะ/แพ้/กำไร วันนี้+สัปดาห์ (จากประวัติจริง) + พอร์ต = equity จริง
- **บทเรียน**: ไม้ที่แพ้จริง (เตือนตัวเอง)
- **ข่าว & อารมณ์ตลาด**: ยังเป็น placeholder (แหล่งข่าวจริงเป็นเฟสถัดไป)

## ⚠️ ก่อนปล่อยจริง
- ทดสอบบน **Demo account** ก่อน · ดูว่าเปิด/ปิดไม้ + TP1 ครึ่ง + SL→ทุน ทำงาน
- ตรวจ spread ทองช่วงข่าว (กว้าง) · `UseNewsBlock=true` กันข่าว USD ±15 นาที
- เริ่ม `RiskPercent` ต่ำ · ผลย้อนหลัง ≠ ผลอนาคต
