// Bennett 전용 설정 모달.
// - 입장 가능 닉네임 풀
// - DAY/SWING 백업/복원/초기화
// - 마감시간 추가/삭제

import {
  getAllowedNicknames, exportShift, importShift, wipeShift,
  getDeadlines, setDeadlines,
} from "../db.js";
import { clearNicknameCache } from "../auth.js";
import { showToast } from "../toast.js";

export async function openSettings() {
  const root = document.getElementById("modal-root");
  root.innerHTML = "";

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const modal = document.createElement("div");
  modal.className = "modal";

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

  modal.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => backdrop.remove())
  );
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  // ---------- 마감시간 ----------
  let deadlines = await getDeadlines();
  function renderDl() {
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
      const ans = prompt(
        `${shift.toUpperCase()} 조의 모든 데이터를 영구 삭제합니다.\n계속하려면 "${shift}" 라고 정확히 입력하세요.`
      );
      if (ans !== shift) return;
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
function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
