/* connect.js — in-app "เชื่อมต่อ bridge" panel.
   Lets the user paste the Apps Script /exec URL, TEST it, then SAVE+connect —
   no code editing. Saving persists to localStorage (via CONFIG.save) and reloads
   so main.js boots straight into live polling. Builds its own modal DOM. */
(function () {
  'use strict';
  const C = window.CONFIG;

  let modal, urlInput, statusEl;

  function build() {
    modal = document.createElement('div');
    modal.id = 'connectModal';
    modal.className = 'cmodal';
    modal.innerHTML = `
      <div class="cbox">
        <div class="chead">
          <b>เชื่อมต่อ Bridge</b>
          <button class="cx" data-act="close">✕</button>
        </div>
        <div class="cstate" id="cState"></div>
        <label class="clab">Apps Script /exec URL</label>
        <input id="cUrl" class="cinput" type="url" spellcheck="false"
               placeholder="https://script.google.com/macros/s/…/exec">
        <div class="cmsg" id="cMsg">วาง URL จาก bridge/Code.gs (ดูวิธี deploy ใน bridge/README.md)</div>
        <div class="crow">
          <button class="cbtn ghost" data-act="test">ทดสอบ</button>
          <button class="cbtn gold" data-act="save">บันทึก & เชื่อมต่อ</button>
        </div>
        <button class="cbtn danger wide" data-act="disconnect">ตัดการเชื่อมต่อ — กลับโหมดเดโม</button>
        <div class="cfoot">secret กันเฉพาะการเขียนจาก EA • คำสั่งเว็บจำกัดด้วย whitelist</div>
      </div>`;
    document.body.appendChild(modal);
    urlInput = modal.querySelector('#cUrl');
    statusEl = modal.querySelector('#cState');

    modal.addEventListener('click', e => {
      if (e.target === modal) return close();
      const act = e.target.getAttribute('data-act');
      if (act === 'close') close();
      else if (act === 'test') doTest();
      else if (act === 'save') doSave();
      else if (act === 'disconnect') doDisconnect();
    });
  }

  function refreshState() {
    const live = C.isLive();
    statusEl.className = 'cstate ' + (live ? 'on' : 'off');
    statusEl.textContent = live ? '● เชื่อมต่อแล้ว (live)' : '○ โหมดเดโม (mock)';
    urlInput.value = C.bridgeURL || '';
  }

  function setMsg(text, kind) {
    const m = modal.querySelector('#cMsg');
    m.textContent = text;
    m.className = 'cmsg ' + (kind || '');
  }

  async function doTest() {
    const u = urlInput.value;
    if (!u.trim()) return setMsg('ใส่ URL ก่อน', 'bad');
    setMsg('กำลังทดสอบ…', '');
    const r = await window.Bridge.testURL(u);
    if (r.ok) setMsg('✔ ต่อ bridge ได้ — ' + r.msg, 'good');
    else setMsg('✕ ต่อไม่ได้: ' + r.error + ' (ตรวจ URL / deploy access = Anyone)', 'bad');
  }

  function doSave() {
    const u = urlInput.value;
    if (!C.save(u)) return setMsg('URL ไม่ถูกต้อง', 'bad');
    setMsg('บันทึกแล้ว — กำลังรีโหลดเข้าโหมด live…', 'good');
    setTimeout(() => location.reload(), 600);
  }

  function doDisconnect() {
    C.disconnect();
    setMsg('ตัดการเชื่อมต่อแล้ว — กำลังรีโหลด…', '');
    setTimeout(() => location.reload(), 500);
  }

  function open() { if (!modal) build(); refreshState(); modal.classList.add('show'); }
  function close() { if (modal) modal.classList.remove('show'); }

  window.Connect = { open, close };

  // Wire any element with [data-connect] to open the panel.
  document.addEventListener('click', e => {
    if (e.target.closest('[data-connect]')) { e.preventDefault(); open(); }
  });
})();
