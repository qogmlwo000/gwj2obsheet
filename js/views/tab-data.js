// DATA 탭 — 5개 서브카테고리(MANAGER / TEAM CAPTAIN / PS / PERM / TEMP) 각각 EditableGrid.
// 실시간 구독: subscribeMaster 로 다른 사용자가 추가/수정/삭제한 행을 자동 반영.

import { createGrid } from "../components/grid.js";
import { listMaster, upsertMaster, deleteMaster, subscribeMaster, batchUpsertMaster } from "../db.js";
import { isAdmin, clearNicknameCache } from "../auth.js";
import { showToast } from "../toast.js";
import { confirmDialog, alertDialog } from "../components/dialog.js";
import { clearMemberIndex } from "../components/member-label.js";

const SUBS = [
  { id: "manager", label: "MANAGER" },
  { id: "captain", label: "TEAM CAPTAIN" },
  { id: "ps",      label: "PS" },
  { id: "perm",    label: "PERM" },
  { id: "temp",    label: "TEMP" },
];

const COLUMNS = {
  manager: [
    { key: "kucode",   label: "쿠코드", type: "text" },
    { key: "name",     label: "성함",   type: "text" },
    { key: "nickname", label: "닉네임", type: "text" },
    { key: "note",     label: "비고",   type: "text" },
  ],
  captain: [
    { key: "kucode",   label: "쿠코드", type: "text" },
    { key: "name",     label: "성함",   type: "text" },
    { key: "nickname", label: "닉네임", type: "text" },
    { key: "note",     label: "비고",   type: "text" },
  ],
  ps: [
    { key: "kucode", label: "쿠코드", type: "text" },
    { key: "name",   label: "성함",   type: "text" },
    { key: "team",   label: "조",     type: "text", width: "80px" },
    { key: "note",   label: "비고",   type: "text" },
  ],
  perm: [
    { key: "kucode",  label: "쿠코드",   type: "text" },
    { key: "name",    label: "성함",     type: "text" },
    { key: "team",    label: "조",       type: "text", width: "80px" },
    { key: "hiSkill", label: "하이스킬", type: "multi", options: ["메뉴얼팩", "오토백", "집품", "워터"], width: "200px" },
    { key: "special", label: "특수",     type: "multi", options: ["오더피커", "AGV", "워터"], width: "200px" },
    { key: "note",    label: "비고",     type: "text" },
  ],
  temp: [
    { key: "kucode",  label: "쿠코드",   type: "text" },
    { key: "name",    label: "성함",     type: "text" },
    { key: "hiSkill", label: "하이스킬", type: "multi", options: ["메뉴얼팩", "오토백", "집품", "워터"], width: "200px" },
    { key: "special", label: "특수",     type: "multi", options: ["AGV", "워터"], width: "180px" },
    { key: "note",    label: "비고",     type: "text" },
  ],
};

// 행 다중 선택 후 복사 시 사용할 컬럼 (엑셀 핵심 정보)
const COPY_KEYS = {
  manager: ["kucode", "name", "nickname"],
  captain: ["kucode", "name", "nickname"],
  ps:      ["kucode", "name", "team"],
  perm:    ["kucode", "name", "team"],
  temp:    ["kucode", "name"],
};

// 중복 판단 키 — 같은 값이면 중복으로 간주
const DEDUPE_KEYS = {
  manager: ["kucode"],
  captain: ["kucode"],
  ps:      ["kucode"],
  perm:    ["kucode"],
  temp:    ["kucode", "name"], // 단기직은 쿠코드가 비어있을 수 있어 이름까지
};

export async function renderDataTab(root, ctx, params) {
  root.innerHTML = "";
  const { shift } = ctx;
  const subId = params.sub || "manager";

  const page = document.createElement("div");
  page.className = "tab-page";

  // 좌측 사이드 네비
  const side = document.createElement("aside");
  side.className = "side-nav";
  const sideTitle = document.createElement("div");
  sideTitle.className = "side-nav-title";
  sideTitle.textContent = "DATA";
  side.appendChild(sideTitle);
  SUBS.forEach((s) => {
    const b = document.createElement("button");
    b.className = "side-nav-item" + (s.id === subId ? " active" : "");
    b.textContent = s.label;
    b.addEventListener("click", () => {
      location.hash = `#/data/${s.id}`;
    });
    side.appendChild(b);
  });
  page.appendChild(side);

  // 본문
  const body = document.createElement("div");
  body.className = "tab-body";

  const cur = SUBS.find((s) => s.id === subId) || SUBS[0];

  const actionBar = document.createElement("div");
  actionBar.className = "action-bar";

  const h2 = document.createElement("h2");
  h2.textContent = `${cur.label} (${shift === "day" ? "DAY ☀️" : "SWING 🌙"})`;
  actionBar.appendChild(h2);

  const search = document.createElement("input");
  search.className = "search-input";
  search.placeholder = "검색 (쿠코드/성함)";
  actionBar.appendChild(search);

  const addBtn = document.createElement("button");
  addBtn.className = "btn primary";
  addBtn.innerHTML = "+ 행 추가";
  actionBar.appendChild(addBtn);

  const pasteHelp = document.createElement("button");
  pasteHelp.className = "btn ghost";
  pasteHelp.innerHTML = "📋 붙여넣기 도움말";
  pasteHelp.addEventListener("click", () =>
    alertDialog({
      title: "엑셀 ↔ 표 데이터 주고받기",
      message: "엑셀에서 셀 영역을 복사한 뒤,\n표의 시작 셀을 클릭하고 Ctrl+V 를 눌러주세요.\n행이 부족하면 자동으로 추가됩니다.\n\n반대로 행 좌측 체크박스로 선택하고 Ctrl+C 를 누르면\n쿠코드/성함/조 가 한꺼번에 클립보드에 복사돼서\n엑셀에 그대로 붙여넣을 수 있어요.",
    })
  );
  actionBar.appendChild(pasteHelp);

  // 중복 제거 버튼 — 우측 끝 정렬
  const dedupeBtn = document.createElement("button");
  dedupeBtn.className = "btn dedupe-btn";
  dedupeBtn.innerHTML = "🧹 중복 제거";
  dedupeBtn.title = "같은 정보가 중복 입력된 행을 정리합니다";
  dedupeBtn.addEventListener("click", () => runDedupe(shift, cur.id, () =>
    renderDataTab(root, ctx, params)
  ));
  actionBar.appendChild(dedupeBtn);

  if (isAdmin()) {
    const wipe = document.createElement("button");
    wipe.className = "btn danger";
    wipe.innerHTML = "⚠ 비우기";
    wipe.title = "이 카테고리의 모든 데이터 삭제";
    wipe.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "카테고리 전체 삭제",
        message: `${cur.label} 데이터를 전부 삭제할까요?`,
        danger: true, yes: "삭제", no: "취소",
      });
      if (!ok) return;
      const list = await listMaster(shift, cur.id);
      for (const r of list) await deleteMaster(shift, cur.id, r.id);
      clearNicknameCache();
      clearMemberIndex();
      showToast("삭제 완료", "success");
      renderDataTab(root, ctx, params);
    });
    actionBar.appendChild(wipe);
  }

  body.appendChild(actionBar);

  const gridHost = document.createElement("div");
  body.appendChild(gridHost);

  page.appendChild(body);
  root.appendChild(page);

  // 데이터 로드
  const initialRows = await listMaster(shift, cur.id);

  const grid = createGrid({
    container: gridHost,
    columns: COLUMNS[cur.id],
    rows: initialRows,
    canDelete: isAdmin(),
    selectable: true,
    copyKeys: COPY_KEYS[cur.id],
    makeNewRow: () => ({ id: "" }),
    onCommit: async (row, key, value, prevSnapshot, opts) => {
      const kucode = (row.kucode || "").trim();
      const bulkMode = opts?.bulk === true;

      // 쿠코드를 비우면 → 행 자체를 마스터에서 삭제 + 다른 컬럼 클리어
      if (key === "kucode" && !kucode) {
        if (row.id) {
          try { await deleteMaster(shift, cur.id, row.id); } catch {}
          if (!bulkMode) {
            if (cur.id === "manager" || cur.id === "captain") clearNicknameCache();
            clearMemberIndex();
          }
        }
        row.id = "";
        row.name = "";
        row.team = "";
        row.nickname = "";
        return { patch: { name: "", team: "", nickname: "" } };
      }
      if (!kucode) return {};

      // 새 행이면 id 부여
      if (!row.id) row.id = kucode;
      // 쿠코드를 바꾼 경우 기존 docId 삭제 후 새로 등록 (bulk 에선 스킵 — onBulkPasteEnd 가 처리)
      if (row.id !== kucode) {
        if (!bulkMode) { try { await deleteMaster(shift, cur.id, row.id); } catch {} }
        row.id = kucode;
      }
      // ── bulk paste: 개별 setDoc 안 함 (onBulkPasteEnd 에서 writeBatch 1회로 처리) ──
      if (bulkMode) return {};

      await upsertMaster(shift, cur.id, kucode, sanitize(row));
      if (cur.id === "manager" || cur.id === "captain") clearNicknameCache();
      clearMemberIndex();
      return {};
    },
    onBulkPasteEnd: async (pastedRows) => {
      // bulk paste 완료 — Firestore writeBatch 로 1회 round-trip
      const valid = pastedRows.filter((r) => (r.kucode || "").trim());
      if (!valid.length) return;
      const payload = valid.map((r) => sanitize(r));
      try {
        const { ok, batches } = await batchUpsertMaster(shift, cur.id, payload);
        // 캐시 1회만 무효화
        if (cur.id === "manager" || cur.id === "captain") clearNicknameCache();
        clearMemberIndex();
        showToast(`✓ ${ok}개 행 일괄 추가 (${batches}배치)`, "success");
      } catch (e) {
        console.error("bulk paste failed", e);
        showToast("일괄 추가 실패: " + (e.message || e), "error");
      }
    },
    onDelete: async (row) => {
      if (row.id) {
        await deleteMaster(shift, cur.id, row.id);
        if (cur.id === "manager" || cur.id === "captain") clearNicknameCache();
        clearMemberIndex();
      }
    },
  });

  search.addEventListener("input", () => {
    grid.setFilter(search.value);
    grid.setHighlight(search.value);
  });
  addBtn.addEventListener("click", () => grid.addRow());

  // ── 실시간 구독: 다른 사용자가 추가/수정/삭제한 행을 자동 반영 ──
  let firstSnapshot = true;
  const unsub = await subscribeMaster(shift, cur.id, (rows) => {
    if (firstSnapshot) {
      // 첫 콜백은 이미 initialRows 로 그렸으니 스킵 (불필요한 리렌더 방지)
      firstSnapshot = false;
      return;
    }
    applyDiff(grid, rows);
    if (cur.id === "manager" || cur.id === "captain") clearNicknameCache();
    clearMemberIndex();
  });

  // 라우터에 cleanup 등록
  return () => { if (unsub) try { unsub(); } catch {} try { grid.destroy(); } catch {} };
}

// remote 행 배열을 받아 grid 의 행과 diff 해서 patch/insert/remove.
// 포커스/미커밋 입력은 grid.js 의 patchRow/removeRow 가 보존함.
function applyDiff(grid, remoteRows) {
  const remoteMap = new Map();
  remoteRows.forEach((r) => { if (r?.id != null) remoteMap.set(String(r.id), r); });
  const local = grid.getRows();
  const localMap = new Map();
  local.forEach((r) => { if (r?.id != null && r.id !== "") localMap.set(String(r.id), r); });

  // 추가/수정
  for (const [id, r] of remoteMap.entries()) {
    if (localMap.has(id)) {
      grid.patchRow(id, r);
    } else {
      grid.insertRow(r);
    }
  }
  // 삭제 (로컬에 있고 remote 에 없는 것 — 단, 빈 신규 행 제외)
  for (const [id, r] of localMap.entries()) {
    if (!remoteMap.has(id)) grid.removeRow(id);
  }
}

// ---------- 중복 제거 ----------
async function runDedupe(shift, sub, refresh) {
  const list = await listMaster(shift, sub);
  const keys = DEDUPE_KEYS[sub] || ["kucode"];
  const seen = new Map();
  const dups = [];
  for (const row of list) {
    const sig = keys
      .map((k) => String(row[k] ?? "").trim().toLowerCase())
      .join("|");
    if (!sig.replace(/\|/g, "")) continue; // 모든 키가 비었으면 스킵
    if (seen.has(sig)) {
      dups.push(row);
    } else {
      seen.set(sig, row);
    }
  }
  if (dups.length === 0) {
    showToast("중복된 행이 없습니다", "success");
    return;
  }
  const ok = await confirmDialog({
    title: "중복 정리",
    message: `중복 ${dups.length}건을 발견했습니다.\n같은 정보의 행 중 가장 위의 한 건만 남기고 나머지를 삭제할까요?`,
    yes: "삭제", no: "취소",
  });
  if (!ok) return;
  for (const r of dups) {
    if (r.id) {
      try { await deleteMaster(shift, sub, r.id); } catch (e) { console.warn(e); }
    }
  }
  showToast(`중복 ${dups.length}건 삭제`, "success");
  clearNicknameCache();
  refresh();
}

function sanitize(row) {
  const { __errors, __dup, __editStartUpdatedAt, ...rest } = row;
  return rest;
}
