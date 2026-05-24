// FLOW 탭 — 4개 서브카테고리(TEAM CAPTAIN / PS / 조퇴 / 신규단기).
// 쿠코드를 입력하면 DATA 마스터에서 성함/조 등을 자동 채움(read-only).
// 실시간 구독: subscribeFlow 로 다른 사용자가 추가/수정/삭제한 행을 자동 반영.

import { createGrid } from "../components/grid.js";
import { listMaster, listFlow, upsertFlow, deleteFlow, upsertMaster, subscribeFlow, getTCPosition } from "../db.js";
import { isAdmin, getSession } from "../auth.js";
import { showToast } from "../toast.js";
import { confirmDialog } from "../components/dialog.js";

const SUBS = [
  { id: "captain", label: "TEAM CAPTAIN" },
  { id: "ps",      label: "PS" },
  { id: "leave",   label: "조퇴" },
  { id: "newTemp", label: "신규단기" },
];

// TC 포지션 탭의 포지션 라벨 풀 (FLOW > 캡틴/PS 의 포지션 자동완성용)
const TC_POSITION_LABELS = [
  "Manager 1", "Manager 2", "Manager 3",
  "Pack Main", "Auto Main", "Auto Sub", "Manual Main", "Manual Sub", "ACE", "Direct (Pack)",
  "Pick Main", "6F", "7.2F", "7.3F", "8F", "AGV", "Direct (Pick)",
  "노쇼파악", "TBM", "PPR", "Live Worker", "근태 공유", "IT 장비 관리",
];

function makeColumns(masters) {
  // 캡틴 마스터에서 쿠코드 + 닉네임 옵션 빌드
  const captainOpts = [];
  if (masters?.captainByKu) {
    for (const [ku, m] of masters.captainByKu.entries()) {
      const lbl = `${ku}${m?.nickname ? ` · ${m.nickname}` : ""}${m?.name ? ` (${m.name})` : ""}`;
      captainOpts.push({ value: ku, label: lbl });
    }
    captainOpts.sort((a, b) => a.value.localeCompare(b.value));
  }
  // PS / Perm / Temp 풀
  const psOpts = optsFromMaster(masters?.psByKu);
  const allOpts = [
    ...psOpts,
    ...optsFromMaster(masters?.permByKu),
    ...optsFromMaster(masters?.tempByKu),
  ];
  // 중복 제거
  const seen = new Set();
  const allUniq = allOpts.filter((o) => {
    if (seen.has(o.value)) return false;
    seen.add(o.value); return true;
  });

  return {
    captain: [
      { key: "kucode",   label: "쿠코드", type: "text", getOptions: () => captainOpts },
      { key: "name",     label: "성함",   type: "text", readonly: true },
      { key: "nickname", label: "닉네임", type: "text", readonly: true },
      { key: "position", label: "포지션(비고)", type: "text", getOptions: () => TC_POSITION_LABELS },
    ],
    ps: [
      { key: "kucode",   label: "쿠코드", type: "text", getOptions: () => psOpts },
      { key: "name",     label: "성함",   type: "text", readonly: true },
      { key: "team",     label: "조",     type: "text", readonly: true, width: "80px" },
      { key: "position", label: "포지션(비고)", type: "text", getOptions: () => TC_POSITION_LABELS },
    ],
    leave: [
      { key: "kucode",    label: "쿠코드", type: "text", getOptions: () => allUniq },
      { key: "name",      label: "성함",   type: "text", readonly: true },
      { key: "team",      label: "조",     type: "text", readonly: true, width: "100px" },
      { key: "leaveTime", label: "조퇴시간(비고)", type: "text" },
    ],
    newTemp: [
      { key: "kucode", label: "쿠코드", type: "text" },
      { key: "name",   label: "성함",   type: "text" },
      { key: "gender", label: "성별(비고)", type: "text", getOptions: () => ["남", "여"] },
    ],
  };
}

function optsFromMaster(m) {
  if (!m) return [];
  const out = [];
  for (const [ku, v] of m.entries()) {
    const lbl = `${ku}${v?.name ? ` · ${v.name}` : ""}${v?.team ? ` (${v.team})` : ""}`;
    out.push({ value: ku, label: lbl });
  }
  return out;
}

export async function renderFlowTab(root, ctx, params) {
  root.innerHTML = "";
  const { shift } = ctx;
  const subId = params.sub || "captain";
  const cur = SUBS.find((s) => s.id === subId) || SUBS[0];

  const page = document.createElement("div");
  page.className = "tab-page";

  // 사이드 네비
  const side = document.createElement("aside");
  side.className = "side-nav";
  const sideTitle = document.createElement("div");
  sideTitle.className = "side-nav-title";
  sideTitle.textContent = "FLOW";
  side.appendChild(sideTitle);
  SUBS.forEach((s) => {
    const b = document.createElement("button");
    b.className = "side-nav-item" + (s.id === subId ? " active" : "");
    b.textContent = s.label;
    b.addEventListener("click", () => {
      location.hash = `#/flow/${s.id}`;
    });
    side.appendChild(b);
  });
  page.appendChild(side);

  // 본문
  const body = document.createElement("div");
  body.className = "tab-body flow-body";

  const actionBar = document.createElement("div");
  actionBar.className = "action-bar flow-action-bar";

  const h2 = document.createElement("h2");
  h2.textContent = `${cur.label} (${shift === "day" ? "DAY ☀️" : "SWING 🌙"})`;
  actionBar.appendChild(h2);

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "date-input";
  dateInput.value = todayStr();
  actionBar.appendChild(dateInput);

  const search = document.createElement("input");
  search.className = "search-input";
  search.placeholder = "검색";
  actionBar.appendChild(search);

  const addBtn = document.createElement("button");
  addBtn.className = "btn primary";
  addBtn.innerHTML = "+ 행 추가";
  actionBar.appendChild(addBtn);

  const clearAllBtn = document.createElement("button");
  clearAllBtn.className = "btn danger";
  clearAllBtn.innerHTML = "🗑 전체 삭제";
  clearAllBtn.title = `이 날짜의 ${cur.label} 항목을 모두 삭제합니다`;
  actionBar.appendChild(clearAllBtn);

  body.appendChild(actionBar);

  const gridHost = document.createElement("div");
  body.appendChild(gridHost);

  page.appendChild(body);
  root.appendChild(page);

  // 마스터 인덱스 로드 (자동 채움용)
  const masters = await loadMasters(shift);
  const COLUMNS = makeColumns(masters);

  let grid;
  let unsubFlow = null;

  async function reload() {
    const date = dateInput.value || todayStr();
    const rows = await listFlow(shift, cur.id, date);
    if (!grid) {
      grid = createGrid({
        container: gridHost,
        columns: COLUMNS[cur.id],
        rows,
        canDelete: true, // FLOW는 매일 입력이라 누구나 자기 행 정리 가능
        makeNewRow: () => ({ id: "" }),
        onCommit: async (row, key, value, prevSnapshot) => {
          const date = dateInput.value || todayStr();
          row.date = date;
          // 쿠코드를 비우면 → 자동 채움 데이터 클리어 + DB에서 행 삭제
          if (key === "kucode" && !String(value || "").trim()) {
            if (row.id) {
              try { await deleteFlow(shift, cur.id, row.id); } catch {}
            }
            row.id = "";
            row.name = "";
            row.team = "";
            row.nickname = "";
            row.position = "";
            row.leaveTime = "";
            row.gender = "";
            return { patch: { name: "", team: "", nickname: "", position: "", leaveTime: "", gender: "" } };
          }
          // 쿠코드 입력 안 됐으면 다른 컬럼은 silent (저장 안 함)
          if (!String(row.kucode || "").trim()) return {};
          // 쿠코드 변경/입력 시 자동 채움
          if (key === "kucode") {
            const patch = await autofill(cur.id, value, masters);
            if (patch) {
              Object.assign(row, patch);
              const id = await upsertFlow(shift, cur.id, row.id, {
                ...sanitize(row),
                createdBy: getSession()?.nickname || "unknown",
                createdAt: row.createdAt || Date.now(),
              });
              row.id = id;
              return { patch };
            } else if (value && cur.id !== "newTemp") {
              return { error: "DATA에 없는 쿠코드입니다." };
            }
          }
          // 신규단기는 마스터에도 자동 등록 (다음 조회 시 잡히도록)
          if (cur.id === "newTemp" && row.kucode && row.name) {
            await upsertMaster(shift, "temp", row.kucode, {
              kucode: row.kucode,
              name: row.name,
            });
            masters.tempByKu = await indexBy(listMaster(shift, "temp"), "kucode");
          }
          // 저장
          if (row.kucode) {
            const id = await upsertFlow(shift, cur.id, row.id, {
              ...sanitize(row),
              createdBy: getSession()?.nickname || "unknown",
              createdAt: row.createdAt || Date.now(),
            });
            row.id = id;
          }
          return {};
        },
        onDelete: async (row) => {
          if (row.id) await deleteFlow(shift, cur.id, row.id);
        },
      });
    } else {
      grid.setRows(rows);
    }
  }

  // 날짜별 실시간 구독을 위한 헬퍼
  let currentDate = dateInput.value || todayStr();
  async function ensureSubscription() {
    if (unsubFlow) { try { unsubFlow(); } catch {} unsubFlow = null; }
    let firstSnapshot = true;
    unsubFlow = await subscribeFlow(shift, cur.id, currentDate, (rows) => {
      if (firstSnapshot) { firstSnapshot = false; return; }
      if (!grid) return;
      applyDiff(grid, rows);
    });
  }

  dateInput.addEventListener("change", async () => {
    currentDate = dateInput.value || todayStr();
    await reload();
    await ensureSubscription();
  });
  search.addEventListener("input", () => {
    if (!grid) return;
    grid.setFilter(search.value);
    grid.setHighlight(search.value);
  });
  addBtn.addEventListener("click", () => grid && grid.addRow());

  clearAllBtn.addEventListener("click", async () => {
    const date = dateInput.value || todayStr();
    const allRows = await listFlow(shift, cur.id, date);
    const real = allRows.filter((r) => r.id);
    if (real.length === 0) {
      showToast("삭제할 항목이 없습니다", "info");
      return;
    }
    const ok = await confirmDialog({
      title: `${cur.label} 전체 삭제`,
      danger: true,
      message: `${date} ${cur.label} 항목 ${real.length}개를 모두 삭제할까요?`,
      detail: `<div class="conflict-detail">이 동작은 되돌릴 수 없습니다.<br>${shift === "day" ? "DAY ☀️" : "SWING 🌙"} · ${cur.label}</div>`,
      yes: "전체 삭제", no: "취소",
    });
    if (!ok) return;
    let n = 0;
    for (const r of real) {
      try { await deleteFlow(shift, cur.id, r.id); n++; } catch {}
    }
    await reload();
    showToast(`${n}개 삭제 완료`, "success");
  });

  await reload();
  await ensureSubscription();

  return () => {
    if (unsubFlow) try { unsubFlow(); } catch {}
    try { grid?.destroy(); } catch {}
  };
}

function applyDiff(grid, remoteRows) {
  const remoteMap = new Map();
  remoteRows.forEach((r) => { if (r?.id != null) remoteMap.set(String(r.id), r); });
  const local = grid.getRows();
  const localMap = new Map();
  local.forEach((r) => { if (r?.id != null && r.id !== "") localMap.set(String(r.id), r); });
  for (const [id, r] of remoteMap.entries()) {
    if (localMap.has(id)) grid.patchRow(id, r);
    else grid.insertRow(r);
  }
  for (const [id] of localMap.entries()) {
    if (!remoteMap.has(id)) grid.removeRow(id);
  }
}

// ---------- helpers ----------

async function loadMasters(shift) {
  const [captains, ps, perm, temp] = await Promise.all([
    listMaster(shift, "captain"),
    listMaster(shift, "ps"),
    listMaster(shift, "perm"),
    listMaster(shift, "temp"),
  ]);
  return {
    captainByKu: indexByKey(captains, "kucode"),
    psByKu:      indexByKey(ps, "kucode"),
    permByKu:    indexByKey(perm, "kucode"),
    tempByKu:    indexByKey(temp, "kucode"),
  };
}

function indexByKey(list, key) {
  const m = new Map();
  for (const r of list) m.set(String(r[key] || r.id), r);
  return m;
}
async function indexBy(promiseList, key) {
  return indexByKey(await promiseList, key);
}

async function autofill(subId, kucode, masters) {
  const ku = String(kucode || "").trim();
  if (!ku) return null;
  if (subId === "captain") {
    const m = masters.captainByKu.get(ku);
    if (m) return { name: m.name || "", nickname: m.nickname || "" };
    return null;
  }
  if (subId === "ps") {
    const m = masters.psByKu.get(ku);
    if (m) return { name: m.name || "", team: m.team || "" };
    return null;
  }
  if (subId === "leave") {
    // ps → perm → temp 순으로 조회
    const ps = masters.psByKu.get(ku);
    if (ps) return { name: ps.name || "", team: ps.team || "" };
    const perm = masters.permByKu.get(ku);
    if (perm) return { name: perm.name || "", team: perm.team || "" };
    const temp = masters.tempByKu.get(ku);
    if (temp) return { name: temp.name || "", team: "단기직" };
    return null;
  }
  if (subId === "newTemp") {
    // 신규단기는 자동 채움하지 않음 (사용자가 직접 입력)
    return null;
  }
  return null;
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sanitize(row) {
  const { __errors, __dup, __editStartUpdatedAt, ...rest } = row;
  return rest;
}
