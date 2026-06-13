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
import { captureElement, copyBlobToClipboard, downloadBlob } from "../capture.js";
import {
  PACK_GROUPS_DEF, PICK_GROUPS_DEF, normalizePackGroup,
} from "../components/pack-pick-grid.js";

// 공유 PICK 보드 — 6.1F / 6.3F 를 6F 로 통합 (집결지는 층 단위로만 안내)
function shareGroup(subId, rawGroup) {
  if (subId !== "pick") return rawGroup;
  if (rawGroup === "6.1F" || rawGroup === "6.3F") return "6F";
  return rawGroup;
}
function dedupeOrder(arr) {
  const seen = new Set();
  return arr.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
}

// share 보드 그룹 — PACK 은 PACK_GROUPS_DEF, PICK 은 PICK 층(6.1/6.3 → 6F 통합)
const SHARE_DEFS = {
  pack: {
    label: "PACK 시업 집결지",
    icon: "📦",
    groups: PACK_GROUPS_DEF.map((g) => g.id),
  },
  pick: {
    label: "PICK 시업 집결지",
    icon: "🛒",
    groups: dedupeOrder(PICK_GROUPS_DEF.map((g) => shareGroup("pick", g.id))),
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

  // 보드 이미지 캡처 — 시업 공지 보고용 (클립보드 복사 / PNG 저장)
  const captureBtn = document.createElement("button");
  captureBtn.className = "btn primary";
  captureBtn.innerHTML = "📋 이미지로 복사";
  captureBtn.title = "집결지 보드를 이미지로 캡처해 클립보드에 복사 (붙여넣기 가능)";
  head.appendChild(captureBtn);

  const savePngBtn = document.createElement("button");
  savePngBtn.className = "btn ghost";
  savePngBtn.innerHTML = "💾 PNG 저장";
  savePngBtn.title = "집결지 보드를 이미지 파일로 저장";
  head.appendChild(savePngBtn);

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

  // ★ 자동 정리: 7일 이상 지난 / date 없는 항목은 자동으로 제거
  // (사용자가 직접 정리 버튼 안 눌러도 깔끔하게 유지)
  await autoCleanStale(shift, subId, rows);
  rows = await listShare(shift, subId);

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
      // PACK: 옛 라벨("메뉴얼팩 멀티") 을 새 라벨로 정규화 / PICK: 6.1·6.3 → 6F 통합
      const rawG = r.group || "";
      let g = subId === "pack" ? normalizePackGroup(rawG) : shareGroup(subId, rawG);
      if (grouped.has(g)) grouped.get(g).push(r);
      else if (g) {
        // 옛 데이터("6.1F · 싱귤" 등): sub 떼고 6F 통합 후 매칭 시도
        const base = shareGroup(subId, g.split(" · ")[0]);
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
          // 공유 시트는 하이스킬 색 표시 없이 이름만 깔끔하게
          const plainName = (member?.name || r.name || "").trim() || "—";
          li.className = "share-name";
          li.innerHTML = `<span class="share-plain-name">${escape(plainName)}</span><span class="share-team">${escape(r.team || "")}</span>`;
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
      // 쿠코드 없이 다른 컬럼만 입력 — 저장되지 않음을 안내
      if (!ku) {
        if (key !== "kucode" && String(value || "").trim()) {
          return { error: "쿠코드를 먼저 입력하세요." };
        }
        return {};
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

  // ── 보드 캡처 ──
  const dateLabel = () => dateInput.value || todayStr();
  captureBtn.addEventListener("click", async () => {
    captureBtn.disabled = true;
    const original = captureBtn.innerHTML;
    captureBtn.innerHTML = "⏳ 캡처 중...";
    try {
      const blob = await captureElement(boardHost);
      try {
        await copyBlobToClipboard(blob);
        showToast("✓ 클립보드에 복사되었습니다. 어디에든 붙여넣기 (Ctrl+V) 가능!", "success");
      } catch (clipErr) {
        console.warn("clipboard failed, fallback to download", clipErr);
        downloadBlob(blob, `집결지_${subId}_${shift}_${dateLabel()}.png`);
        showToast("클립보드 권한이 없어 PNG로 다운로드했습니다", "info");
      }
    } catch (e) {
      console.error("capture failed", e);
      showToast("캡처 실패: " + (e.message || e), "error");
    } finally {
      captureBtn.disabled = false;
      captureBtn.innerHTML = original;
    }
  });
  savePngBtn.addEventListener("click", async () => {
    savePngBtn.disabled = true;
    try {
      const blob = await captureElement(boardHost);
      downloadBlob(blob, `집결지_${subId}_${shift}_${dateLabel()}.png`);
      showToast("✓ 이미지 저장 완료", "success");
    } catch (e) {
      console.error("save failed", e);
      showToast("저장 실패: " + (e.message || e), "error");
    } finally {
      savePngBtn.disabled = false;
    }
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
      "6F":         "floor-1",
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

// 7일 이상 지난 항목 + date 필드 없는 레거시 항목을 자동 정리.
// 무음 정리 — 로그만 남기고 토스트는 띄우지 않음 (탭 진입 시 자연스러운 청소)
async function autoCleanStale(shift, subId, rows) {
  const today = new Date();
  const cutoff = new Date(today); cutoff.setDate(today.getDate() - 7);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  const stale = rows.filter((r) => !r.date || r.date < cutoffStr);
  if (!stale.length) return;
  try {
    await Promise.allSettled(stale.map((r) => deleteShare(shift, subId, r.id)));
    console.log(`[share auto-clean] ${stale.length}개 항목 자동 정리 (cutoff: ${cutoffStr})`);
  } catch (e) {
    console.warn("share auto-clean failed", e);
  }
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
