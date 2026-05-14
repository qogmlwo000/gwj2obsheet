// 공유 탭 — 계약직 시업 집결지(시업 시 모일 곳) 안내.
// PACK 테이블과 PICK 테이블 두 가지. DAY/SWING 분리.
// 입력은 그리드(쿠코드/이름/그룹/비고), 출력은 그룹×이름 보드.
// 실시간 구독: subscribeShare 로 다른 사용자가 추가/수정/삭제한 행을 자동 반영.

import { createGrid } from "../components/grid.js";
import { listShare, upsertShare, deleteShare, subscribeShare } from "../db.js";
import { buildMemberIndex, autofillFromMaster, buildMemberLabel } from "../components/member-label.js";
import { openMemberCard } from "../components/member-card.js";
import { isAdmin } from "../auth.js";
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

  const totalChip = document.createElement("span");
  totalChip.className = "total-chip";
  totalChip.textContent = "총 0명";
  head.appendChild(totalChip);

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

  function refreshTotal() {
    totalChip.textContent = `총 ${rows.filter((r) => r.kucode).length}명`;
  }

  function renderBoard() {
    boardHost.innerHTML = "";
    const grouped = new Map();
    def.groups.forEach((g) => grouped.set(g, []));
    const stray = [];
    rows.forEach((r) => {
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

function sanitize(row) {
  const { __errors, __dup, __editStartUpdatedAt, ...rest } = row;
  return rest;
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
