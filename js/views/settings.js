// Bennett 전용 설정 모달.
// - 입장 가능 닉네임 풀
// - DAY/SWING 백업/복원/초기화
// - 마감시간 추가/삭제
// - CSV/Excel 내보내기 (DATA / FLOW / PACK / PICK / 공유)

import {
  getAllowedNicknames, exportShift, importShift, wipeShift,
  getDeadlines, setDeadlines,
} from "../db.js";
import { clearNicknameCache } from "../auth.js";
import { showToast } from "../toast.js";
import { confirmDialog } from "../components/dialog.js";
import {
  exportMasterCsv, exportFlowCsv, exportOpsCsv, exportShareCsv,
} from "../export.js";

export async function openSettings() {
  const root = document.getElementById("modal-root");
  root.innerHTML = "";

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const modal = document.createElement("div");
  modal.className = "modal settings-modal";

  modal.innerHTML = `
    <div class="modal-header">
      <h3>⚙ PDA 일지 설정</h3>
      <button class="btn ghost" data-close>✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-section">
        <h4>⏰ 마감시간</h4>
        <div class="deadlines-list" id="dl-list"></div>
        <form class="deadline-add" id="dl-add">
          <input type="text" placeholder="라벨 (예: D0 마감)" required maxlength="20" />
          <input type="time" required />
          <button class="btn primary" type="submit">추가</button>
        </form>
        <p style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          현재 시각이 마감 1시간 전(긴급) / 15분 전(매우긴급) / 마감 후(지남) 일 때
          상단바 시계가 강조됩니다.
        </p>
      </div>

      <div class="modal-section">
        <h4>입장 가능한 닉네임</h4>
        <div class="nickname-list" id="nick-list"><span class="nickname-tag empty">불러오는 중…</span></div>
        <p style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          DATA → MANAGER · TEAM CAPTAIN 의 닉네임 컬럼이 곧 입장 가능자 목록입니다.
        </p>
      </div>

      <div class="modal-section">
        <h4>📊 CSV 내보내기 (Excel 호환)</h4>
        <div class="csv-grid">
          <fieldset class="csv-block">
            <legend>DATA (마스터)</legend>
            <select id="csv-data-shift" class="csv-select">
              <option value="day">DAY</option>
              <option value="swing">SWING</option>
            </select>
            <select id="csv-data-role" class="csv-select">
              <option value="manager">MANAGER</option>
              <option value="captain">TEAM CAPTAIN</option>
              <option value="ps">PS</option>
              <option value="perm">PERM</option>
              <option value="temp">TEMP</option>
            </select>
            <button class="btn primary" id="csv-data-go">⬇ 내보내기</button>
          </fieldset>

          <fieldset class="csv-block">
            <legend>FLOW (일자별)</legend>
            <select id="csv-flow-shift" class="csv-select">
              <option value="day">DAY</option>
              <option value="swing">SWING</option>
            </select>
            <select id="csv-flow-type" class="csv-select">
              <option value="captain">TEAM CAPTAIN</option>
              <option value="ps">PS</option>
              <option value="leave">조퇴</option>
              <option value="newTemp">신규단기</option>
            </select>
            <div class="csv-date-row">
              <input type="date" id="csv-flow-from" class="csv-date" />
              <span class="csv-dash">~</span>
              <input type="date" id="csv-flow-to" class="csv-date" />
            </div>
            <button class="btn primary" id="csv-flow-go">⬇ 내보내기</button>
          </fieldset>

          <fieldset class="csv-block">
            <legend>PACK / PICK</legend>
            <select id="csv-ops-shift" class="csv-select">
              <option value="day">DAY</option>
              <option value="swing">SWING</option>
            </select>
            <select id="csv-ops-kind" class="csv-select">
              <option value="pack">PACK</option>
              <option value="pick">PICK</option>
              <option value="pack_ws">PACK W/S</option>
              <option value="pick_ws">PICK W/S</option>
            </select>
            <div class="csv-date-row">
              <input type="date" id="csv-ops-from" class="csv-date" />
              <span class="csv-dash">~</span>
              <input type="date" id="csv-ops-to" class="csv-date" />
            </div>
            <button class="btn primary" id="csv-ops-go">⬇ 내보내기</button>
          </fieldset>

          <fieldset class="csv-block">
            <legend>공유 (집결지)</legend>
            <select id="csv-share-shift" class="csv-select">
              <option value="day">DAY</option>
              <option value="swing">SWING</option>
            </select>
            <select id="csv-share-kind" class="csv-select">
              <option value="pack">PACK</option>
              <option value="pick">PICK</option>
            </select>
            <button class="btn primary" id="csv-share-go">⬇ 내보내기</button>
          </fieldset>
        </div>
        <p style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          모든 CSV 파일은 UTF-8 BOM 으로 저장되어 Excel 에서 한글이 깨지지 않습니다.
        </p>
      </div>

      <div class="modal-section">
        <h4>DAY조 데이터</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" data-export="day">⬇ DAY 백업(JSON)</button>
          <button class="btn" data-import="day">⬆ DAY 복원</button>
          <button class="btn danger" data-wipe="day">⚠ DAY 전체 초기화</button>
        </div>
      </div>

      <div class="modal-section">
        <h4>SWING조 데이터</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" data-export="swing">⬇ SWING 백업(JSON)</button>
          <button class="btn" data-import="swing">⬆ SWING 복원</button>
          <button class="btn danger" data-wipe="swing">⚠ SWING 전체 초기화</button>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn primary" data-close>닫기</button>
    </div>
  `;

  backdrop.appendChild(modal);
  root.appendChild(backdrop);

  const onEsc = (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector(".dialog-modal")) return; // 확인 다이얼로그가 위에 있으면 무시
    closeModal();
  };
  const closeModal = () => { document.removeEventListener("keydown", onEsc); backdrop.remove(); };
  document.addEventListener("keydown", onEsc);

  modal.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", closeModal)
  );
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });

  // ---------- 마감시간 ----------
  let deadlines = await getDeadlines();
  function renderDl() {
    // 시간순 정렬 (in-place — 삭제 인덱스도 정렬된 순서 기준)
    deadlines.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const list = modal.querySelector("#dl-list");
    list.innerHTML = "";
    if (deadlines.length === 0) {
      list.innerHTML = `<span class="nickname-tag empty">아직 등록된 마감시간이 없습니다</span>`;
    } else {
      deadlines.forEach((d, i) => {
        const item = document.createElement("div");
        item.className = "deadline-item";
        item.innerHTML = `
          <span class="dl-time">${escape(d.time)}</span>
          <span class="dl-label">${escape(d.label)}</span>
          <button class="btn danger small" data-i="${i}">삭제</button>
        `;
        item.querySelector("button").addEventListener("click", async () => {
          deadlines.splice(i, 1);
          await setDeadlines(deadlines);
          renderDl();
          showToast("마감시간 삭제", "success");
        });
        list.appendChild(item);
      });
    }
  }
  renderDl();

  modal.querySelector("#dl-add").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const [labelInput, timeInput] = form.querySelectorAll("input");
    const label = labelInput.value.trim();
    const time = timeInput.value;
    if (!label || !time) return;
    if (deadlines.some((d) => d.time === time && d.label === label)) {
      showToast("이미 같은 마감시간이 등록돼 있습니다", "error");
      return;
    }
    deadlines.push({ id: crypto.randomUUID(), label, time });
    await setDeadlines(deadlines);
    labelInput.value = ""; timeInput.value = "";
    renderDl();
    showToast("마감시간 추가", "success");
  });

  // ---------- 닉네임 ----------
  const nickList = modal.querySelector("#nick-list");
  try {
    clearNicknameCache();
    const arr = await getAllowedNicknames();
    nickList.innerHTML = "";
    const all = ["Bennett", ...arr.filter((n) => n !== "Bennett")];
    if (all.length === 0) {
      nickList.innerHTML = `<span class="nickname-tag empty">아직 등록된 닉네임이 없습니다</span>`;
    } else {
      all.forEach((n) => {
        const t = document.createElement("span");
        t.className = "nickname-tag";
        t.textContent = n;
        nickList.appendChild(t);
      });
    }
  } catch {
    nickList.innerHTML = `<span class="nickname-tag empty">불러오기 실패</span>`;
  }

  // ---------- CSV 내보내기 ----------
  const today = todayYmd();
  const monthAgo = ymdOffset(-30);
  // 기본값: 최근 30일
  ["csv-flow-from", "csv-ops-from"].forEach((id) => modal.querySelector("#" + id).value = monthAgo);
  ["csv-flow-to", "csv-ops-to"].forEach((id) => modal.querySelector("#" + id).value = today);

  modal.querySelector("#csv-data-go").addEventListener("click", async () => {
    const shift = modal.querySelector("#csv-data-shift").value;
    const role  = modal.querySelector("#csv-data-role").value;
    try { await exportMasterCsv(shift, role); showToast("CSV 저장 완료", "success"); }
    catch (e) { showToast("저장 실패: " + (e?.message || e), "error"); }
  });
  modal.querySelector("#csv-flow-go").addEventListener("click", async () => {
    const shift = modal.querySelector("#csv-flow-shift").value;
    const type  = modal.querySelector("#csv-flow-type").value;
    const from  = modal.querySelector("#csv-flow-from").value;
    const to    = modal.querySelector("#csv-flow-to").value;
    if (!from || !to) { showToast("날짜 범위를 선택해주세요.", "error"); return; }
    try { await exportFlowCsv(shift, type, from, to); showToast("CSV 저장 완료", "success"); }
    catch (e) { showToast("저장 실패: " + (e?.message || e), "error"); }
  });
  modal.querySelector("#csv-ops-go").addEventListener("click", async () => {
    const shift = modal.querySelector("#csv-ops-shift").value;
    const kind  = modal.querySelector("#csv-ops-kind").value;
    const from  = modal.querySelector("#csv-ops-from").value;
    const to    = modal.querySelector("#csv-ops-to").value;
    if (!from || !to) { showToast("날짜 범위를 선택해주세요.", "error"); return; }
    try { await exportOpsCsv(shift, kind, from, to); showToast("CSV 저장 완료", "success"); }
    catch (e) { showToast("저장 실패: " + (e?.message || e), "error"); }
  });
  modal.querySelector("#csv-share-go").addEventListener("click", async () => {
    const shift = modal.querySelector("#csv-share-shift").value;
    const kind  = modal.querySelector("#csv-share-kind").value;
    try { await exportShareCsv(shift, kind); showToast("CSV 저장 완료", "success"); }
    catch (e) { showToast("저장 실패: " + (e?.message || e), "error"); }
  });

  // ---------- export / import / wipe ----------
  modal.querySelectorAll("[data-export]").forEach((b) =>
    b.addEventListener("click", async () => {
      const shift = b.dataset.export;
      try {
        const data = await exportShift(shift);
        downloadJson(`gw2ob-${shift}-${ymd()}.json`, data);
        showToast(`${shift.toUpperCase()} 백업 완료`, "success");
      } catch { showToast("백업 실패", "error"); }
    })
  );
  modal.querySelectorAll("[data-import]").forEach((b) =>
    b.addEventListener("click", async () => {
      const shift = b.dataset.import;
      const file = await pickFile(".json");
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        await importShift(shift, data);
        clearNicknameCache();
        showToast(`${shift.toUpperCase()} 복원 완료`, "success");
      } catch (e) { showToast("복원 실패: " + e.message, "error"); }
    })
  );
  modal.querySelectorAll("[data-wipe]").forEach((b) =>
    b.addEventListener("click", async () => {
      const shift = b.dataset.wipe;
      const ok = await confirmDialog({
        title: "조 데이터 초기화",
        danger: true,
        message: `${shift.toUpperCase()} 조의 모든 데이터를 영구 삭제합니다.\n계속하시겠습니까?`,
        yes: "삭제", no: "취소",
      });
      if (!ok) return;
      try { await wipeShift(shift); clearNicknameCache(); showToast(`${shift.toUpperCase()} 초기화 완료`, "success"); }
      catch { showToast("초기화 실패", "error"); }
    })
  );
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = accept;
    inp.addEventListener("change", () => resolve(inp.files[0] || null));
    inp.click();
  });
}
function ymd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ymdOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
