// 공유 탭 — 계약직 시업 집결지(시업 시 모일 곳) 안내.
// PACK 테이블과 PICK 테이블 두 가지. DAY/SWING 분리.
// 입력은 그리드(쿠코드/이름/그룹/비고), 출력은 그룹×이름 보드.
// 실시간 구독: subscribeShare 로 다른 사용자가 추가/수정/삭제한 행을 자동 반영.

import { createGrid } from "../components/grid.js";
import { listShare, upsertShare, deleteShare, subscribeShare } from "../db.js";
import { buildMemberIndex, autofillFromMaster, buildMemberLabel } from "../components/member-label.js";
import { openMemberCard } from "../components/member-card.js";
import { isAdmin } from "../auth.js";
import { confirmDialog } from "../components/dialog.js";
import { showToast } from "../toast.js";
import {
  PACK_GROUPS_DEF, PICK_GROUPS_DEF, normalizePackGroup,
} from "../components/pack-pick-grid.js";

// share 보드 그룹 — PACK 은 PACK_GROUPS_DEF, PICK 은 PICK_GROUPS_DEF 와 동일 라벨/순서 (SSOT)
const SHARE_DEFS = {
  pack: {
    label: "PACK 시업 집결지",
    icon: "📦",
    groups: PACK_GROUPS_DEF.map((g) => g.id),
  },
  pick: {
    label: "PICK 시업 집결지",
    icon: "🛒",
    groups: PICK_GROUPS_DEF.map((g) => g.id),
  },
};

const SUBS = [
  { id: "pack", label: "PACK" },
  { id: "pick", label: "PICK" },
];

export async function renderShareTab(root, ctx, params) {
  root.innerHTML = "";
  const { shift } = ctx;
  const subId = params.sub || "pack";

  const page = document.createElement("div");
  page.className = "tab-page";

  // 사이드 네비
  const side = document.createElement("aside");
  side.className = "side-nav";
  const sideTitle = document.createElement("div");
  sideTitle.className = "side-nav-title";
  sideTitle.textContent = "공유";
  side.appendChild(sideTitle);
  SUBS.forEach((s) => {
    const b = document.createElement("button");
    b.className = "side-nav-item" + (s.id === subId ? " active" : "");
    b.textContent = s.label;
    b.addEventListener("click", () => location.hash = `#/share/${s.id}`);
    side.appendChild(b);
  });
  page.appendChild(side);

  const body = document.createElement("div");
  body.className = "tab-body";
  page.appendChild(body);
  root.appendChild(page);

  const def = SHARE_DEFS[subId] || SHARE_DEFS.pack;
  const memberIndex = await buildMemberIndex(shift, true);

  // 헤더
  const head = document.createElement("div");
  head.className = "action-bar";
  const h2 = document.createElement("h2");
  h2.innerHTML = `${def.icon} ${def.label} <span class="muted">(${shift === "day" ? "DAY ☀️" : "SWING 🌙"})</span>`;
  head.appendChild(h2);

  // 날짜 필터 (오늘만 / 전체)
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "date-input";
  dateInput.value = todayStr();
  dateInput.title = "이 날짜의 집결지만 표시";
  head.appendChild(dateInput);

  const scopeBtn = document.createElement("button");
  scopeBtn.className = "btn ghost";
  scopeBtn.textContent = "📅 오늘만 보기";
  scopeBtn.title = "전체/오늘 토글";
  let scopeToday = true;
  head.appendChild(scopeBtn);

  const totalChip = document.createElement("span");
  totalChip.className = "total-chip";
  totalChip.textContent = "총 0명";
  head.appendChild(totalChip);

  const cleanupBtn = document.createElement("button");
  cleanupBtn.className = "btn ghost";
  cleanupBtn.textContent = "🧹 지난 데이터 정리";
  cleanupBtn.title = "이 날짜 이전의 항목을 모두 삭제합니다";
  head.appendChild(cleanupBtn);

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "btn ghost";
  toggleBtn.textContent = "📋 입력 모드";
  let editMode = false;
  head.appendChild(toggleBtn);
  body.appendChild(head);

  const editorHost = document.createElement("div");
  editorHost.style.display = "none";
  body.appendChild(editorHost);

  const boardHost = document.createElement("div");
  boardHost.className = "share-board";
  body.appendChild(boardHost);

  toggleBtn.addEventListener("click", () => {
    editMode = !editMode;
    editorHost.style.display = editMode ? "" : "none";
    toggleBtn.textContent = editMode ? "✅ 입력 종료" : "📋 입력 모드";
  });

  let rows = await listShare(shift, subId);

  function visibleRows() {
    if (!scopeToday) return rows;
    const d = dateInput.value || todayStr();
    // date 필드가 없으면 (옛 데이터) 함께 표시되지 않도록 — 단, 사용자가 직접 입력한 항목도 살릴 수 있게
    // "오늘만 보기" 켜져 있으면 정확히 그 날짜만, 그렇지 않으면 전체
    return rows.filter((r) => (r.date || "") === d);
  }

  function refreshTotal() {
    const list = visibleRows();
    const tag = scopeToday ? "오늘" : "전체";
    totalChip.textContent = `${tag} ${list.filter((r) => r.kucode).length}명`;
  }

  function renderBoard() {
    boardHost.innerHTML = "";
    const list = visibleRows();

    // 비어 있으면 안내 표시
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "share-board-empty";
      const dateLbl = dateInput.value || todayStr();
      empty.innerHTML = scopeToday
        ? `<div class="share-empty-icon">📭</div>
           <div class="share-empty-title">${escape(dateLbl)} 집결지 데이터가 없습니다</div>
           <div class="share-empty-sub">PACK/PICK 탭에서 인원을 입력하면 자동으로 채워집니다.<br>지난 날짜의 데이터를 보려면 위의 <b>전체 보기</b> 버튼을 누르세요.</div>`
        : `<div class="share-empty-icon">📭</div>
           <div class="share-empty-title">공유 시트가 비어있습니다</div>`;
      boardHost.appendChild(empty);
      return;
    }

    const grouped = new Map();
    def.groups.forEach((g) => grouped.set(g, []));
    const stray = [];
    list.forEach((r) => {
      // PACK: 옛 라벨("메뉴얼팩 멀티") 을 새 라벨("메뉴얼 멀티") 로 정규화
      const rawG = r.group || "";
      const g = subId === "pack" ? normalizePackGroup(rawG) : rawG;
      if (grouped.has(g)) grouped.get(g).push(r);
      else if (g) {
        // PICK: "6.1F · 싱귤" 같은 옛 데이터가 있으면 sub 떼고 매칭 시도
        const base = g.split(" · ")[0];
        if (grouped.has(base)) grouped.get(base).push(r);
        else stray.push(r);
      } else stray.push(r);
    });
    if (stray.length) grouped.set("(미지정)", stray);

    grouped.forEach((items, g) => {
      const card = document.createElement("section");
      const variant = pickVariant(subId, g);
      card.className = `share-board-card variant-${variant}`;
      const head = document.createElement("header");
      head.className = "share-board-head";
      head.innerHTML = `<span class="share-board-name">${escape(g)}</span><span class="share-board-count">${items.length} 명</span>`;
      card.appendChild(head);

      const ul = document.createElement("ul");
      ul.className = "share-board-list";
      if (items.length === 0) {
        const li = document.createElement("li");
        li.className = "share-empty";
        li.textContent = "—";
        ul.appendChild(li);
      } else {
        items.forEach((r) => {
          const li = document.createElement("li");
          const member = memberIndex.map.get(String(r.kucode));
          const label = buildMemberLabel(member, r.name);
          li.className = "share-name";
          li.innerHTML = `<span class="lbl ${(label.classes || []).join(" ")}">${label.html}</span><span class="share-team">${escape(r.team || "")}</span>`;
          li.addEventListener("click", () => {
            if (member) openMemberCard(member, { shift });
          });
          ul.appendChild(li);
        });
      }
      card.appendChild(ul);
      boardHost.appendChild(card);
    });
  }

  // 에디터 그리드
  const columns = [
    { key: "kucode", label: "쿠코드", type: "text", width: "120px" },
    {
      key: "name", label: "성함", type: "label", width: "220px",
      getLabel: (row) => buildMemberLabel(memberIndex.map.get(String(row.kucode)), row.name),
    },
    { key: "team", label: "조", type: "text", readonly: true, width: "80px" },
    { key: "group", label: "집결지", type: "text", width: "180px" },
    { key: "note", label: "비고", type: "text" },
  ];

  const grid = createGrid({
    container: editorHost,
    columns,
    rows,
    canDelete: isAdmin(),
    selectable: true,
    copyKeys: ["kucode", "name", "team", "group"],
    makeNewRow: () => ({ id: "" }),
    onCommit: async (row, key, value, prevSnapshot) => {
      const ku = String(row.kucode || "").trim();
      // 쿠코드 없으면: kucode 컬럼일 때만 에러, 다른 컬럼은 silent
      if (!ku) {
        if (key === "kucode" && value) return { error: "쿠코드를 입력하세요." };
        return {}; // 비어있고 다른 컬럼 입력 → 저장 안 함
      }
      if (key === "kucode") {
        const fill = autofillFromMaster(memberIndex, ku);
        if (fill) { row.name = fill.name; row.team = fill.team; }
        else { return { error: "DATA에 없는 쿠코드입니다." }; }
      }
      row.date = row.date || (dateInput.value || todayStr());
      const id = await upsertShare(shift, subId, row.id, sanitize(row));
      row.id = id;
      const idx = rows.findIndex((r) => r.id === row.id);
      if (idx >= 0) rows[idx] = row; else rows.push(row);
      refreshTotal();
      renderBoard();
      return { patch: { name: row.name, team: row.team } };
    },
    onDelete: async (row) => {
      if (row.id) await deleteShare(shift, subId, row.id);
      const idx = rows.indexOf(row);
      if (idx >= 0) rows.splice(idx, 1);
      refreshTotal();
      renderBoard();
    },
    onLabelClick: (row) => {
      const m = memberIndex.map.get(String(row.kucode));
      if (m) openMemberCard(m, { shift });
    },
  });

  // 날짜/스코프 변경 이벤트
  dateInput.addEventListener("change", () => {
    refreshTotal();
    renderBoard();
  });
  scopeBtn.addEventListener("click", () => {
    scopeToday = !scopeToday;
    scopeBtn.textContent = scopeToday ? "📅 오늘만 보기" : "🌐 전체 보기";
    dateInput.disabled = !scopeToday;
    dateInput.style.opacity = scopeToday ? "" : "0.4";
    refreshTotal();
    renderBoard();
  });

  // 지난 데이터 정리 — 선택한 날짜 이전 항목 모두 삭제
  cleanupBtn.addEventListener("click", async () => {
    const cutoff = dateInput.value || todayStr();
    const stale = rows.filter((r) => r.date && r.date < cutoff);
    const noDate = rows.filter((r) => !r.date);
    const total = stale.length + noDate.length;
    if (total === 0) {
      showToast("정리할 항목이 없습니다", "info");
      return;
    }
    const ok = await confirmDialog({
      title: "지난 데이터 정리",
      danger: true,
      message: `${escape(cutoff)} 이전 항목과 날짜 없는 항목 (${total}개)을 삭제할까요?`,
      detail: `<div class="conflict-detail">현재 ${subId.toUpperCase()} 공유 시트에서 모두 사라집니다.</div>`,
      yes: "삭제", no: "취소",
    });
    if (!ok) return;
    let n = 0;
    for (const r of [...stale, ...noDate]) {
      try { await deleteShare(shift, subId, r.id); n++; } catch {}
    }
    rows = await listShare(shift, subId);
    refreshTotal();
    renderBoard();
    showToast(`${n}개 정리 완료`, "success");
  });

  refreshTotal();
  renderBoard();

  // ── 실시간 구독 ──
  let firstSnapshot = true;
  const unsub = await subscribeShare(shift, subId, (newRows) => {
    if (firstSnapshot) { firstSnapshot = false; return; }
    // 로컬 rows 와 grid 양쪽 모두 갱신
    rows = newRows;
    applyDiffToGrid(grid, newRows);
    refreshTotal();
    renderBoard();
  });

  return () => {
    if (unsub) try { unsub(); } catch {}
    try { grid.destroy(); } catch {}
  };
}

function applyDiffToGrid(grid, remoteRows) {
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

function pickVariant(kind, group) {
  if (kind === "pick") {
    const FLOOR_VARIANTS = {
      "6.1F":       "floor-1",
      "6.3F":       "floor-2",
      "AGV (7.1F)": "floor-3",
      "7.2F":       "floor-4",
      "7.3F":       "floor-5",
      "8F":         "floor-6",
    };
    return FLOOR_VARIANTS[group] || "floor";
  }
  if (group?.includes("오토백")) return "autobag";
  return "manual";
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sanitize(row) {
  const { __errors, __dup, __editStartUpdatedAt, ...rest } = row;
  return rest;
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
