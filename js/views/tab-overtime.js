// 연장 조사 탭 — 연장 근무 희망자 조사용.
// 표: [NO | 날짜 | 공정 | 구분 | Shift | 쿠코드 | 성명 | 연장시간 | 사유]
//  - 쿠코드만 입력(타각 가능) → 날짜/공정/구분/Shift/성명 자동 기입
//  - 연장시간 / 사유 는 직접 입력 또는 윗칸에서 일괄 적용
//  - 일자별 저장/조회, 연장 인원 합계 표시
//  - 여기 입력된 쿠코드는 같은 일자 PICK/PACK 성함 배경을 주황색으로 연동 (member-label + pack-pick-grid)
//  - HR 메일용 Excel(배경색) 내보내기

import { createGrid } from "../components/grid.js";
import { buildMemberIndex } from "../components/member-label.js";
import { listOvertime, upsertOvertime, deleteOvertime, batchUpsertOvertime, subscribeOvertime } from "../db.js";
import { showToast } from "../toast.js";
import { confirmDialog } from "../components/dialog.js";
import { businessToday } from "../biz-date.js";
import { exportOvertimeXlsx } from "../excel.js";

const BUFFER_ROWS = 3;
const MIN_VISIBLE_ROWS = 18;

// 기본 퇴근시각 (일괄 연장 계산 기준)
const BASE_OFFTIME = { day: "18:00", swing: "04:00" };

// 역할 → 구분(고용형태) 표기
const GUBUN_BY_ROLE = {
  manager: "매니저",
  captain: "캡틴",
  ps: "PS",
  perm: "계약직",
  temp: "단기직",
  cd: "CD",
};

export async function renderOvertimeTab(root, ctx) {
  root.innerHTML = "";
  const { shift } = ctx;
  const shiftLbl = shift === "day" ? "DAY" : "SWING";

  const memberIndex = await buildMemberIndex(shift, true);

  // ── 헤더 ──
  const head = document.createElement("div");
  head.className = "tab-head";

  const title = document.createElement("div");
  title.className = "tab-head-title";
  title.innerHTML = `<span class="tab-head-icon">⏰</span> 연장 조사 <small class="tab-head-sub">연장 근무 희망자</small>`;
  head.appendChild(title);

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "date-input";
  dateInput.value = businessToday(shift);
  head.appendChild(dateInput);

  const totalChip = document.createElement("span");
  totalChip.className = "total-chip ot-total";
  totalChip.textContent = "연장 0명";
  head.appendChild(totalChip);

  const addBtn = document.createElement("button");
  addBtn.className = "btn ghost";
  addBtn.innerHTML = "+ 행 추가";
  head.appendChild(addBtn);

  const exportBtn = document.createElement("button");
  exportBtn.className = "btn primary";
  exportBtn.innerHTML = "📤 Excel 내보내기";
  exportBtn.title = "HR 메일용 — 배경색이 들어간 엑셀로 저장";
  head.appendChild(exportBtn);

  root.appendChild(head);

  // ── 일괄 적용 바 ──
  const bulkBar = document.createElement("div");
  bulkBar.className = "ot-bulk";
  bulkBar.innerHTML = `
    <div class="ot-bulk-group">
      <span class="ot-bulk-label">연장시간 일괄</span>
      <input class="ot-in ot-off" type="text" value="${BASE_OFFTIME[shift] || "18:00"}" maxlength="5" title="퇴근(기준) 시각" />
      <span class="ot-tilde">~ +</span>
      <input class="ot-in ot-min" type="number" min="0" step="10" value="30" title="연장 분" /> <span class="ot-unit">분</span>
      <button class="btn ghost ot-quick" data-min="30">30분</button>
      <button class="btn ghost ot-quick" data-min="60">60분</button>
      <button class="btn primary ot-apply-time">연장시간 적용</button>
    </div>
    <div class="ot-bulk-group">
      <span class="ot-bulk-label">사유 일괄</span>
      <input class="ot-in ot-reason" type="text" placeholder="예: 물량 증가" title="사유" />
      <button class="btn primary ot-apply-reason">사유 적용</button>
    </div>
    <div class="ot-bulk-hint">행 선택 시 선택 행에만, 선택 없으면 전체 행에 적용</div>
  `;
  root.appendChild(bulkBar);

  const offInput = bulkBar.querySelector(".ot-off");
  const minInput = bulkBar.querySelector(".ot-min");
  const reasonInput = bulkBar.querySelector(".ot-reason");

  // ── 그리드 ──
  const gridHost = document.createElement("div");
  gridHost.className = "ot-grid-host";
  root.appendChild(gridHost);

  const columns = [
    { key: "no",         label: "NO",      type: "rownum", width: "52px" },
    { key: "date",       label: "날짜",     type: "text", readonly: true, width: "112px" },
    { key: "process",    label: "공정",     type: "text", width: "96px" },
    { key: "gubun",      label: "구분",     type: "text", width: "84px" },
    { key: "shiftLabel", label: "Shift",   type: "text", readonly: true, width: "78px" },
    { key: "kucode",     label: "쿠코드",   type: "text", width: "108px", scanAdvance: true },
    { key: "name",       label: "성명",     type: "text", readonly: true, width: "120px" },
    { key: "otTime",     label: "연장시간", type: "text", width: "150px" },
    { key: "reason",     label: "사유",     type: "text", width: "260px" },
  ];

  let rowsData = [];     // 저장된(=쿠코드 있는) 행
  let grid = null;
  let unsub = null;

  // 유효 행 = 쿠코드 있고 오류(미등록/중복)가 없는 행. 인원 합계·엑셀 내보내기 공용.
  function validRows() {
    if (!grid) return [];
    return grid.getRows().filter((r) => {
      const k = String(r.kucode || "").trim();
      return k && !(r.__errors && r.__errors.kucode);
    });
  }
  function refreshCount() {
    totalChip.textContent = `연장 ${validRows().length}명`;
  }

  function makeBuffer(n) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push({ id: "" });
    return arr;
  }
  function padToMin(arr) {
    if (arr.length >= MIN_VISIBLE_ROWS) return arr;
    return [...arr, ...makeBuffer(MIN_VISIBLE_ROWS - arr.length)];
  }
  function gridRows() {
    return padToMin([...rowsData, ...makeBuffer(BUFFER_ROWS)]);
  }
  // 끝에만 빈 행 보충 (순서 보존)
  function ensureBuffer() {
    if (!grid) return;
    const cur = grid.getRows();
    const buffers = cur.filter((r) => !r.id && !String(r.kucode || "").trim());
    const needed = Math.max(BUFFER_ROWS - buffers.length, 0);
    if (needed === 0 && cur.length >= MIN_VISIBLE_ROWS) return;
    grid.setRows(padToMin([...cur, ...makeBuffer(needed)]));
  }

  function deriveProcess(m) {
    if (!m) return "";
    if (m.role === "cd") return m.process ? `${m.process} CD` : "CD";
    return "OB";
  }
  function deriveGubun(m) {
    return m ? (GUBUN_BY_ROLE[m.role] || "") : "";
  }

  function sanitize(row) {
    const { __errors, __dup, __editStartUpdatedAt, no, ...rest } = row;
    return rest;
  }

  const date = () => dateInput.value || businessToday(shift);

  async function load() {
    rowsData = await listOvertime(shift, date());
    if (grid) grid.setRows(gridRows());
    refreshCount();
  }

  grid = createGrid({
    container: gridHost,
    columns,
    rows: padToMin(makeBuffer(MIN_VISIBLE_ROWS)),
    canDelete: true,
    selectable: true,
    copyKeys: ["kucode", "name"],
    makeNewRow: () => ({ id: "" }),
    emptyText: "쿠코드를 입력(타각)하면 자동으로 채워집니다.",
    onCommit: async (row, key, value, prevSnapshot, opts) => {
      const ku = String(row.kucode || "").trim();
      const bulk = opts?.bulk === true;

      // 쿠코드 비우기 → 행 삭제 + 필드 클리어
      if (key === "kucode" && !ku) {
        if (row.id) {
          try { await deleteOvertime(shift, row.id); } catch {}
          const idx = rowsData.findIndex((x) => x === row || x.id === row.id);
          if (idx >= 0) rowsData.splice(idx, 1);
        }
        row.id = ""; row.name = ""; row.process = ""; row.gubun = "";
        if (!bulk) { refreshCount(); ensureBuffer(); }
        return { patch: { name: "", process: "", gubun: "", shiftLabel: shiftLbl, date: date() } };
      }
      if (!ku) {
        if (!bulk && key !== "kucode" && String(value || "").trim()) {
          return { error: "쿠코드를 먼저 입력하세요." };
        }
        return {};
      }

      // 쿠코드 입력/변경 → DATA 조회 후 자동 기입
      if (key === "kucode") {
        // 같은 일자에 이미 입력된 쿠코드면 중복 — HR 인원 중복 집계 방지
        const dup = grid.getRows().find((x) => x !== row && String(x.kucode || "").trim() === ku);
        if (dup) {
          row.name = ""; row.process = ""; row.gubun = "";
          return { error: "이미 입력된 쿠코드입니다." };
        }
        const m = memberIndex.map.get(ku);
        if (!m) {
          row.name = ""; row.process = ""; row.gubun = "";
          return { error: "DATA에 없는 쿠코드입니다." };
        }
        row.name = m.name || "";
        row.process = deriveProcess(m);
        row.gubun = deriveGubun(m);
      } else {
        // 쿠코드 외 컬럼(연장시간·사유 등) 편집 — 쿠코드가 유효(DATA 등록 + 중복 아님)할 때만 저장
        const m = memberIndex.map.get(ku);
        const dup = grid.getRows().find((x) => x !== row && String(x.kucode || "").trim() === ku);
        if (!m || dup) return {}; // 오류 행은 부가 필드만 고쳐도 저장하지 않음
      }
      row.date = date();
      row.shiftLabel = shiftLbl;

      const isCreate = !row.id;
      if (isCreate) row.id = crypto.randomUUID();
      const id = await upsertOvertime(shift, row.id, sanitize(row));
      row.id = id;
      if (isCreate && !rowsData.find((x) => x.id === row.id)) rowsData.push(row);
      if (!bulk) { refreshCount(); ensureBuffer(); }
      return { patch: { name: row.name, process: row.process, gubun: row.gubun, shiftLabel: shiftLbl, date: date() } };
    },
    onBulkPasteEnd: () => { refreshCount(); ensureBuffer(); },
    onDelete: async (row) => {
      if (!String(row.kucode || "").trim() && !row.id) return false; // 빈 버퍼
      const ok = await confirmDialog({
        title: "행 삭제", danger: true,
        message: `${row.name || row.kucode} 행을 삭제할까요?`,
        yes: "삭제", no: "취소",
      });
      if (!ok) return false;
      if (row.id) { try { await deleteOvertime(shift, row.id); } catch {} }
      const idx = rowsData.findIndex((x) => x === row || x.id === row.id);
      if (idx >= 0) rowsData.splice(idx, 1);
      refreshCount(); ensureBuffer();
      return true;
    },
    onBulkDelete: async (rows) => {
      const target = (rows || []).filter((r) => String(r.kucode || "").trim());
      if (!target.length) return;
      const ok = await confirmDialog({
        title: "삭제 확인", danger: true,
        message: `선택한 ${target.length}개 행을 삭제할까요?`,
        yes: "삭제", no: "취소",
      });
      if (!ok) return;
      for (const r of target) { if (r.id) { try { await deleteOvertime(shift, r.id); } catch {} } }
      target.forEach((r) => {
        const i = rowsData.findIndex((x) => x === r || x.id === r.id);
        if (i >= 0) rowsData.splice(i, 1);
      });
      grid.setRows(gridRows());
      refreshCount();
      showToast(`${target.length}개 삭제`, "success");
    },
  });

  addBtn.addEventListener("click", () => grid.addRow());

  // ── 일괄 적용 ── (선택 행 우선, 없으면 전체 유효 행 — 오류/중복 행 제외)
  function targetRows() {
    const valid = validRows();
    const sel = grid.getSelected().filter((r) => valid.includes(r));
    return sel.length ? sel : valid;
  }

  async function bulkSet(field, valueFor) {
    const targets = targetRows();
    if (!targets.length) { showToast("적용할 행이 없습니다 (쿠코드를 먼저 입력하세요)", "error"); return; }
    targets.forEach((r) => { r[field] = valueFor(r); });
    grid.refresh();
    try {
      await batchUpsertOvertime(shift, targets.map((r) => sanitize(r)));
      showToast(`${targets.length}명 ${field === "otTime" ? "연장시간" : "사유"} 적용`, "success");
    } catch (e) {
      showToast("일괄 적용 실패: " + (e.message || e), "error");
    }
  }

  bulkBar.querySelectorAll(".ot-quick").forEach((b) =>
    b.addEventListener("click", () => { minInput.value = b.dataset.min; })
  );
  bulkBar.querySelector(".ot-apply-time").addEventListener("click", () => {
    const off = normalizeTime(offInput.value);
    if (!off) { showToast("퇴근 시각을 HH:MM 형식으로 입력하세요", "error"); return; }
    const min = parseInt(minInput.value, 10);
    if (!Number.isFinite(min) || min < 0) { showToast("연장 분을 숫자로 입력하세요", "error"); return; }
    const end = addMinutes(off, min);
    const val = `${off} ~ ${end}`;
    bulkSet("otTime", () => val);
  });
  bulkBar.querySelector(".ot-apply-reason").addEventListener("click", () => {
    const v = reasonInput.value.trim();
    if (!v) { showToast("사유를 입력하세요", "error"); return; }
    bulkSet("reason", () => v);
  });

  // ── Excel 내보내기 ── (오류/중복 행 제외한 유효 인원만)
  exportBtn.addEventListener("click", async () => {
    const rows = validRows();
    if (!rows.length) { showToast("내보낼 연장 인원이 없습니다", "error"); return; }
    exportBtn.disabled = true;
    const old = exportBtn.innerHTML;
    exportBtn.innerHTML = "⏳ 내보내는 중...";
    try {
      await exportOvertimeXlsx({ shift, shiftLabel: shiftLbl, date: date(), rows });
      showToast(`✓ ${rows.length}명 내보내기 완료`, "success");
    } catch (e) {
      console.error(e);
      showToast("내보내기 실패: " + (e.message || e), "error");
    } finally {
      exportBtn.disabled = false;
      exportBtn.innerHTML = old;
    }
  });

  // ── 날짜 변경 ──
  dateInput.addEventListener("change", async () => {
    // 이전 일자 구독을 먼저 해제 — 로드 중 옛 일자 콜백이 끼어드는 경합 방지
    if (unsub) { try { unsub(); } catch {} unsub = null; }
    await load();
    await resubscribe();
  });

  // ── 실시간 구독 (일자별) ──
  async function resubscribe() {
    if (unsub) { try { unsub(); } catch {} unsub = null; }
    let first = true;
    unsub = await subscribeOvertime(shift, date(), (remote) => {
      if (first) { first = false; return; } // 초기 로드는 load() 가 이미 처리
      applyRemote(remote);
    });
  }

  function applyRemote(remoteRows) {
    if (gridHost.contains(document.activeElement)) {
      // 입력 중이면 데이터만 갱신, 화면 재구성은 보류 (다음 blur 시 ensureBuffer 로 정리)
      rowsData = remoteRows.slice();
      refreshCount();
      return;
    }
    rowsData = remoteRows.slice();
    grid.setRows(gridRows());
    refreshCount();
  }

  await load();
  await resubscribe();

  return () => {
    if (unsub) { try { unsub(); } catch {} unsub = null; }
    try { grid.destroy(); } catch {}
  };
}

// "HH:MM" 정규화 (H:MM, HHMM 허용)
function normalizeTime(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    const m2 = t.match(/^(\d{1,2})(\d{2})$/); // 1830 → 18:30
    if (m2) m = [null, m2[1], m2[2]];
  }
  if (!m) return "";
  const h = Number(m[1]), mm = Number(m[2]);
  if (h > 23 || mm > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function addMinutes(hhmm, min) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  let total = Number(m[1]) * 60 + Number(m[2]) + Number(min || 0);
  total = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60), mm = total % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
