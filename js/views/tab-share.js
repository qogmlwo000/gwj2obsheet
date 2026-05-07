// 공유 탭 — 계약직 시업 집결지(시업 시 모일 곳) 안내.
// PACK 테이블과 PICK 테이블 두 가지. DAY/SWING 분리.
// 입력은 그리드(쿠코드/이름/그룹/비고), 출력은 그룹×이름 보드.

import { createGrid } from "../components/grid.js";
import { listShare, upsertShare, deleteShare } from "../db.js";
import { buildMemberIndex, autofillFromMaster, buildMemberLabel } from "../components/member-label.js";
import { openMemberCard } from "../components/member-card.js";
import { isAdmin } from "../auth.js";

const SHARE_DEFS = {
  pack: {
    label: "PACK 시업 집결지",
    icon: "📦",
    groups: ["오토백 1.2", "오토백 2.5", "오토백 4.0", "오토백 RTPB", "오토백 멀티",
             "메뉴얼팩", "ACE 8호", "메뉴얼팩 멀티", "NPB", "ACE"],
  },
  pick: {
    label: "PICK 시업 집결지",
    icon: "🛒",
    groups: ["6.1F", "6.3F", "AGV (7.1F)", "7.2F", "7.3F", "8F"],
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
    rows.forEach((r) => {
      const g = r.group || "(미지정)";
      if (!grouped.has(g)) grouped.set(g, []);
      grouped.get(g).push(r);
    });

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
    onCommit: async (row, key, value) => {
      const ku = String(row.kucode || "").trim();
      if (!ku) return { error: key === "kucode" ? "쿠코드를 입력하세요." : undefined };
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
}

function pickVariant(kind, group) {
  if (kind === "pick") return "floor";
  if (group?.includes("오토백")) return "autobag";
  return "manual";
}

function sanitize(row) { const { __errors, ...rest } = row; return rest; }

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
