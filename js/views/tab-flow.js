// FLOW 탭 — 4개 카테고리(TEAM CAPTAIN / PS / 조퇴관리 / 신규단기)를 한 화면에 보여주는 보드형.
// 카테고리별 색상 헤더 + No. 열 + 편집 가능 그리드. 쿠코드 입력 시 DATA 마스터에서 자동 채움.
// 실시간 구독: subscribeFlow 로 다른 사용자의 추가/수정/삭제 자동 반영.

import { createGrid } from "../components/grid.js";
import { listMaster, listFlow, upsertFlow, deleteFlow, upsertMaster, subscribeFlow } from "../db.js";
import { getSession } from "../auth.js";
import { showToast } from "../toast.js";
import { confirmDialog } from "../components/dialog.js";

const MIN_ROWS = 15; // 폼처럼 보이도록 기본으로 채우는 행 수

export async function renderFlowTab(root, ctx) {
  root.innerHTML = "";
  const { shift } = ctx;

  // 마스터 인덱스 (자동 채움용) — 모든 역할 통합 조회
  const masters = await loadMasters(shift);

  const CATS = makeCats(masters);

  const page = document.createElement("div");
  page.className = "flow-page";

  // 상단 바 — 타이틀 + 날짜 + 검색
  const top = document.createElement("div");
  top.className = "flow-top action-bar";
  const h2 = document.createElement("h2");
  h2.innerHTML = `📋 FLOW <span class="muted">(${shift === "day" ? "DAY ☀️" : "SWING 🌙"})</span>`;
  top.appendChild(h2);

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "date-input";
  dateInput.value = todayStr();
  top.appendChild(dateInput);

  const todayBtn = document.createElement("button");
  todayBtn.className = "btn ghost";
  todayBtn.textContent = "📅 오늘";
  todayBtn.addEventListener("click", () => {
    dateInput.value = todayStr();
    dateInput.dispatchEvent(new Event("change"));
  });
  top.appendChild(todayBtn);

  const search = document.createElement("input");
  search.className = "search-input";
  search.placeholder = "🔎 쿠코드/이름/닉네임 검색 (,로 여러 명)";
  search.title = "매칭되는 사람만 환하게 표시 · ESC 초기화";
  top.appendChild(search);

  page.appendChild(top);

  // 보드 — 4개 카테고리 카드 가로 배치
  const board = document.createElement("div");
  board.className = "flow-board";
  page.appendChild(board);

  root.appendChild(page);

  const cards = []; // { cat, grid, unsub, reload, countEl }

  for (const cat of CATS) {
    cards.push(makeCatCard(cat, board, shift, dateInput, masters));
  }

  // 날짜 변경 → 모든 카드 reload + 재구독
  dateInput.addEventListener("change", () => {
    cards.forEach((c) => c.onDateChange());
  });

  // 검색 — 모든 그리드에 하이라이트(매칭 외 흐리게)
  search.addEventListener("input", () => {
    cards.forEach((c) => c.grid.setHighlight(search.value));
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { search.value = ""; cards.forEach((c) => c.grid.setHighlight("")); }
  });

  return () => {
    cards.forEach((c) => c.destroy());
  };
}

// ── 카테고리 정의 ──
function makeCats(masters) {
  // TEAM CAPTAIN 카드는 캡틴 + 매니저를 모두 후보로 (TCPOS 와 동일하게 매니저도 TC 로 취급)
  const captainOpts = dedupeOpts([
    ...optsFrom(masters.captainByKu),
    ...optsFrom(masters.managerByKu),
  ]);
  const psOpts = optsFrom(masters.psByKu);
  const allOpts = dedupeOpts([
    ...psOpts,
    ...optsFrom(masters.permByKu),
    ...optsFrom(masters.tempByKu),
    ...optsFrom(masters.cdByKu),
    ...captainOpts,
  ]);

  return [
    {
      id: "captain", label: "TEAM CAPTAIN", color: "captain",
      columns: [
        { key: "_no", label: "No.", type: "rownum", width: "42px" },
        { key: "kucode",   label: "쿠코드", type: "text", getOptions: () => captainOpts },
        { key: "nickname", label: "닉네임", type: "text", readonly: true },
        { key: "name",     label: "성함",   type: "text", readonly: true },
        { key: "note",     label: "비고",   type: "text" },
        { key: "overtime", label: "연장시간", type: "text" },
      ],
    },
    {
      id: "ps", label: "PS", color: "ps",
      columns: [
        { key: "_no", label: "No.", type: "rownum", width: "42px" },
        { key: "kucode",   label: "쿠코드", type: "text", getOptions: () => psOpts },
        { key: "nickname", label: "닉네임", type: "text", readonly: true },
        { key: "name",     label: "성함",   type: "text", readonly: true },
        { key: "note",     label: "비고",   type: "text" },
        { key: "overtime", label: "연장시간", type: "text" },
      ],
    },
    {
      id: "leave", label: "조퇴관리", color: "leave",
      columns: [
        { key: "_no", label: "No.", type: "rownum", width: "42px" },
        { key: "kucode",    label: "쿠코드", type: "text", getOptions: () => allOpts },
        { key: "nickname",  label: "닉네임", type: "text", readonly: true },
        { key: "name",      label: "성함",   type: "text", readonly: true },
        { key: "leaveTime", label: "조퇴시간", type: "text" },
        { key: "reason",    label: "사유",   type: "text" },
      ],
    },
    {
      id: "newTemp", label: "신규단기", color: "newtemp",
      columns: [
        { key: "_no", label: "No.", type: "rownum", width: "42px" },
        { key: "kucode",   label: "쿠코드", type: "text" },
        { key: "name",     label: "성함",   type: "text" },
        { key: "gender",   label: "성별",   type: "text", getOptions: () => ["남", "여"] },
        { key: "note",     label: "비고",   type: "text" },
      ],
    },
  ];
}

// ── 카테고리 카드 1개 ──
function makeCatCard(cat, board, shift, dateInput, masters) {
  const card = document.createElement("section");
  card.className = `flow-cat flow-cat-${cat.color}`;

  const head = document.createElement("header");
  head.className = "flow-cat-head";
  head.innerHTML = `<span class="flow-cat-name">${cat.label}</span><span class="flow-cat-count">0명</span>`;
  card.appendChild(head);

  const tools = document.createElement("div");
  tools.className = "flow-cat-tools";
  const addBtn = document.createElement("button");
  addBtn.className = "flow-cat-btn";
  addBtn.textContent = "＋";
  addBtn.title = "행 추가";
  const clearBtn = document.createElement("button");
  clearBtn.className = "flow-cat-btn flow-clear";
  clearBtn.textContent = "🗑";
  clearBtn.title = "이 카테고리 비우기";
  tools.appendChild(addBtn);
  tools.appendChild(clearBtn);
  head.appendChild(tools);

  const gridHost = document.createElement("div");
  gridHost.className = "flow-cat-body";
  card.appendChild(gridHost);
  board.appendChild(card);

  const countEl = head.querySelector(".flow-cat-count");

  let grid = null;
  let unsub = null;
  let currentDate = dateInput.value || todayStr();

  function refreshCount() {
    const n = grid ? grid.getRows().filter((r) => r.kucode).length : 0;
    countEl.textContent = `${n}명`;
  }

  function padRows(realRows) {
    const empties = Math.max(MIN_ROWS - realRows.length, 2);
    const buf = [];
    for (let i = 0; i < empties; i++) buf.push({ id: "" });
    return [...realRows, ...buf];
  }

  grid = createGrid({
    container: gridHost,
    columns: cat.columns,
    rows: [],
    canDelete: true,
    selectable: true,
    copyKeys: ["kucode", "name"],
    makeNewRow: () => ({ id: "" }),
    onCommit: async (row, key, value, prevSnapshot) => {
      const date = dateInput.value || todayStr();
      row.date = date;
      const ku = String(row.kucode || "").trim();

      // 쿠코드 비우면 → 자동채움 클리어 + DB 삭제
      if (key === "kucode" && !ku) {
        if (row.id) { try { await deleteFlow(shift, cat.id, row.id); } catch {} }
        row.id = ""; row.name = ""; row.nickname = ""; row.team = "";
        row.note = ""; row.overtime = ""; row.leaveTime = ""; row.reason = ""; row.gender = "";
        refreshCount();
        return { patch: { name: "", nickname: "" } };
      }
      // 쿠코드 없이 다른 컬럼을 먼저 입력해도 막지 않음 (값은 row 에 보존되고, 쿠코드 입력 시 함께 저장됨).
      // → 빈 행에 비고/연장시간 등을 먼저 쳐도 빨간 테두리(에러)가 생기지 않는다.
      if (!ku) return {};
      // 쿠코드 입력 시 자동 채움 (신규단기 제외 — 수기 입력)
      if (key === "kucode" && cat.id !== "newTemp") {
        const fill = autofill(ku, masters);
        if (fill) {
          row.name = fill.name; row.nickname = fill.nickname; row.team = fill.team;
          if (row.__errors) row.__errors = {}; // 행이 정상이 되었으니 잔여 에러(빨간 테두리) 제거
        } else {
          return { error: "DATA에 없는 쿠코드입니다." };
        }
      }
      // 신규단기는 DATA Temp 마스터에 자동 등록 — "24시간 후 기존단기"로 자연 전환되도록 로스터에 등재.
      // (날짜 파티셔닝: 오늘은 FLOW>신규단기 = Newbie, 다음 날부터는 DATA Temp 소속 = 기존단기)
      if (cat.id === "newTemp" && ku && row.name) {
        const prev = masters.tempByKu.get(ku);
        if (!prev || prev.name !== row.name || (prev.note || "") !== (row.note || "")) {
          const tempData = { kucode: ku, name: row.name, note: row.note || "" };
          try {
            await upsertMaster(shift, "temp", ku, tempData);
            masters.tempByKu.set(ku, tempData); // 로컬 인덱스만 갱신 (키입력당 전체 재조회 제거)
          } catch {}
        }
        if (row.__errors) row.__errors = {};
      }
      // ★ 레이스 방지: upsertFlow await 전에 id 를 미리 할당.
      //   그래야 await 도중 onSnapshot 이 와도 applyDiff 가 findRow(id) 로 기존 행을 찾아
      //   patchRow 경로로 가서, 같은 행이 끝에 한 번 더 insert 되는 중복을 막는다.
      const isCreate = !row.id;
      if (isCreate) row.id = crypto.randomUUID();
      const id = await upsertFlow(shift, cat.id, row.id, {
        ...sanitize(row),
        createdBy: getSession()?.nickname || "unknown",
        createdAt: row.createdAt || Date.now(),
      });
      row.id = id;
      refreshCount();
      return cat.id !== "newTemp" ? { patch: { name: row.name, nickname: row.nickname } } : {};
    },
    onDelete: async (row) => {
      if (row.id) await deleteFlow(shift, cat.id, row.id);
      refreshCount();
    },
  });

  addBtn.addEventListener("click", () => grid.addRow());

  clearBtn.addEventListener("click", async () => {
    const date = dateInput.value || todayStr();
    const real = grid.getRows().filter((r) => r.id);
    if (!real.length) { showToast(`${cat.label}: 삭제할 항목이 없습니다`, "info"); return; }
    const ok = await confirmDialog({
      title: `${cat.label} 비우기`, danger: true,
      message: `${date} ${cat.label} 항목 ${real.length}개를 모두 삭제할까요?`,
      yes: "삭제", no: "취소",
    });
    if (!ok) return;
    let n = 0;
    for (const r of real) { try { await deleteFlow(shift, cat.id, r.id); n++; } catch {} }
    await reload();
    showToast(`${cat.label} ${n}개 삭제`, "success");
  });

  async function reload() {
    currentDate = dateInput.value || todayStr();
    const rows = await listFlow(shift, cat.id, currentDate);
    grid.setRows(padRows(rows));
    refreshCount();
  }

  async function ensureSubscription() {
    if (unsub) { try { unsub(); } catch {} unsub = null; }
    let first = true;
    unsub = await subscribeFlow(shift, cat.id, currentDate, (rows) => {
      if (first) { first = false; return; }
      applyDiff(grid, rows);
      refreshCount();
    });
  }

  reload().then(ensureSubscription);

  return {
    grid,
    onDateChange: async () => { await reload(); await ensureSubscription(); },
    destroy: () => { if (unsub) try { unsub(); } catch {} try { grid.destroy(); } catch {} },
  };
}

// remote 행 배열로 grid diff (포커스/미커밋 보존)
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
  const [managers, captains, ps, perm, temp, cd] = await Promise.all([
    listMaster(shift, "manager"),
    listMaster(shift, "captain"),
    listMaster(shift, "ps"),
    listMaster(shift, "perm"),
    listMaster(shift, "temp"),
    listMaster(shift, "cd"),
  ]);
  return {
    managerByKu: indexBy(managers, "kucode"),
    captainByKu: indexBy(captains, "kucode"),
    psByKu:      indexBy(ps, "kucode"),
    permByKu:    indexBy(perm, "kucode"),
    tempByKu:    indexBy(temp, "kucode"),
    cdByKu:      indexBy(cd, "kucode"),
  };
}

function indexBy(list, key) {
  const m = new Map();
  for (const r of list) m.set(String(r[key] || r.id), r);
  return m;
}

function optsFrom(m) {
  if (!m) return [];
  const out = [];
  for (const [ku, v] of m.entries()) {
    const lbl = `${ku}${v?.nickname ? ` · ${v.nickname}` : ""}${v?.name ? ` (${v.name})` : ""}`;
    out.push({ value: ku, label: lbl });
  }
  return out;
}

function dedupeOpts(opts) {
  const seen = new Set();
  return opts.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
}

// 모든 마스터에서 쿠코드 조회 → 성함/닉네임/조 자동 채움
function autofill(ku, masters) {
  const k = String(ku).trim();
  const m =
    masters.managerByKu.get(k) ||
    masters.captainByKu.get(k) ||
    masters.psByKu.get(k) ||
    masters.permByKu.get(k) ||
    masters.tempByKu.get(k) ||
    masters.cdByKu.get(k);
  if (!m) return null;
  return { name: m.name || "", nickname: m.nickname || "", team: m.team || "" };
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sanitize(row) {
  const { __errors, __dup, __editStartUpdatedAt, ...rest } = row;
  return rest;
}
