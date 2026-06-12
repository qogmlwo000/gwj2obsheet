// W/S 워터 테이블. PACK / PICK 탭 상단에 펼치기/숨기기로 사용.
// 컬럼: 쿠코드 / 성함 / 조 / 비고. 자동 채움 + 라벨 표시.
// 실시간 구독: subscribeOps 로 ws kind 변경 자동 반영.

import { createGrid } from "../components/grid.js";
import { buildMemberLabel, buildSkillChipsLabel, autofillFromMaster } from "../components/member-label.js";
import { listOps, upsertOps, deleteOps, subscribeOps } from "../db.js";
import { openMemberCard } from "../components/member-card.js";

const WS_KIND = (parent) => `${parent}_ws`; // ops kind: pack_ws / pick_ws

export function renderWSTable({ container, kind, shift, date, memberIndex, onCountChange }) {
  const opsKind = WS_KIND(kind);

  const head = document.createElement("div");
  head.className = "action-bar mini";
  const count = document.createElement("span");
  count.className = "ws-count";
  count.textContent = "0 명";
  head.appendChild(count);
  const addBtn = document.createElement("button");
  addBtn.className = "btn primary small";
  addBtn.textContent = "+ 행 추가";
  head.appendChild(addBtn);
  container.appendChild(head);

  const gridHost = document.createElement("div");
  container.appendChild(gridHost);

  const columns = [
    { key: "kucode", label: "쿠코드", type: "text", width: "100px" },
    {
      key: "name", label: "성함", type: "label", width: "180px",
      getLabel: (row) => buildMemberLabel(memberIndex.map.get(String(row.kucode)), row.name),
    },
    { key: "team", label: "조", type: "text", readonly: true, width: "60px" },
    {
      key: "skills", label: "M/A/P", type: "label", width: "64px",
      getLabel: (row) => buildSkillChipsLabel(memberIndex.map.get(String(row.kucode))),
    },
    { key: "note", label: "비고", type: "text" },
  ];

  let api = null;
  let unsub = null;

  function refreshCount() {
    const n = api ? api.getRows().filter((r) => r.kucode).length : 0;
    count.textContent = `${n} 명`;
    onCountChange?.(n);
  }

  api = createGrid({
    container: gridHost,
    columns,
    rows: [],
    canDelete: true,
    selectable: true,
    copyKeys: ["kucode", "name", "team"],
    makeNewRow: () => ({ id: "" }),
    emptyText: "쿠코드를 입력하거나 엑셀에서 붙여넣으세요.",
    onCommit: async (row, key, value, prevSnapshot, opts) => {
      const ku = String(row.kucode || "").trim();
      // 쿠코드 비우면 → DB에서 삭제 + 다른 컬럼 클리어
      if (key === "kucode" && !ku) {
        if (row.id) {
          try { await deleteOps(shift, opsKind, row.id); } catch {}
        }
        row.id = "";
        row.name = "";
        row.team = "";
        refreshCount();
        return { patch: { name: "", team: "" } };
      }
      if (!ku) {
        if (!opts?.bulk && key !== "kucode" && String(value || "").trim()) {
          return { error: "쿠코드를 먼저 입력하세요." };
        }
        return {};
      }
      if (key === "kucode") {
        const fill = autofillFromMaster(memberIndex, ku);
        if (fill) { row.name = fill.name; row.team = fill.team; }
        else { return { error: "DATA에 없는 쿠코드입니다." }; }
      }
      row.date = date;
      const id = await upsertOps(shift, opsKind, row.id, sanitize(row));
      row.id = id;
      refreshCount();
      return { patch: { name: row.name, team: row.team } };
    },
    onDelete: async (row) => {
      if (row.id) await deleteOps(shift, opsKind, row.id);
      refreshCount();
    },
    onLabelClick: (row) => {
      const m = memberIndex.map.get(String(row.kucode));
      if (m) openMemberCard(m, { shift });
    },
  });

  addBtn.addEventListener("click", () => api.addRow());

  // 초기 데이터 로드 + 실시간 구독
  let firstSnapshot = true;
  (async () => {
    const initial = await listOps(shift, opsKind, date);
    api.setRows(initial);
    refreshCount();
    unsub = await subscribeOps(shift, opsKind, date, (rows) => {
      if (firstSnapshot) { firstSnapshot = false; return; }
      applyDiff(api, rows);
      refreshCount();
    });
  })();

  return {
    count: () => api ? api.getRows().filter((r) => r.kucode).length : 0,
    reload: async () => {
      const rows = await listOps(shift, opsKind, date);
      api.setRows(rows);
      refreshCount();
    },
    destroy: () => {
      if (unsub) try { unsub(); } catch {}
      try { api.destroy(); } catch {}
    },
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

function sanitize(row) {
  const { __errors, __dup, __editStartUpdatedAt, ...rest } = row;
  return rest;
}
