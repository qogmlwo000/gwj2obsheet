// PACK / PICK 공통 — 라인/층 단위로 EditableGrid 카드 가로 스트립.
//
// 개선:
//   - subscribeOps 콜백이 카드 전체 재렌더 대신 셀 단위 patchRow/insertRow/removeRow
//     → 다른 사용자가 입력해도 내가 편집 중인 셀의 포커스/미커밋 값 보존
//   - PACK_GROUPS_DEF / PICK_GROUPS_DEF 가 share 그룹과 SSOT (tab-share.js 에서도 import)
//   - 동적 행수: 데이터 + 빈 행 BUFFER 개 (기본 3, 최소 8 보장)
//   - 카드/사이드 검색 + 매칭 셀 하이라이트
//   - 같은 셀을 다른 매니저가 동시에 편집 중일 때 충돌 경고 후 덮어쓰기/취소
//   - W/S, 컨텍스트 메뉴, 공유 시트 자동 동기화는 그대로 유지

import { createGrid } from "./grid.js";
import { openContextMenu } from "./context-menu.js";
import { buildMemberLabel, buildSkillChipsLabel, autofillFromMaster } from "./member-label.js";
import { openMemberCard } from "./member-card.js";
import { confirmDialog } from "./dialog.js";
import { openAuditPanel } from "./audit-panel.js";
import { listOps, upsertOps, deleteOps, subscribeOps, logAudit, upsertShare, deleteShare, listShare, batchUpsertOps } from "../db.js";
import { showToast } from "../toast.js";
import { getSession } from "../auth.js";
import { markEditing, unmarkEditing, subscribeEditing } from "./editing-presence.js";

const BUFFER_ROWS = 3;        // 데이터 뒤로 항상 유지하는 빈 행 수
const MIN_VISIBLE_ROWS = 25;  // 카드 최소 행 수 (기본 입력 가능 칸)

// PACK / PICK 그룹 정의 — share 보드도 동일 라벨 사용 (SSOT)
export const PACK_GROUPS_DEF = [
  { id: "오토백 1.2",   label: "오토백 1.2",   variant: "autobag" },
  { id: "오토백 2.5",   label: "오토백 2.5",   variant: "autobag" },
  { id: "오토백 4.0",   label: "오토백 4.0",   variant: "autobag" },
  { id: "오토백 RTPB",  label: "오토백 RTPB",  variant: "autobag" },
  { id: "오토백 멀티",  label: "오토백 멀티",  variant: "autobag" },
  { id: "메뉴얼팩",     label: "메뉴얼팩",     variant: "manual"  },
  { id: "ACE 8호",      label: "ACE 8호",      variant: "manual"  },
  { id: "NPB",          label: "NPB",          variant: "manual"  },
  { id: "ACE",          label: "ACE",          variant: "manual"  },
  { id: "메뉴얼 멀티",  label: "메뉴얼 멀티",  variant: "manual"  },
];
// 서브(sub)는 문자열 또는 { id, label } — id 는 저장값(subType), label 은 화면 표시.
export const PICK_GROUPS_DEF = [
  { id: "6.1F",       label: "6.1F",        variant: "floor", subs: ["싱귤", "멀티"] },
  { id: "6.3F",       label: "6.3F",        variant: "floor", subs: ["싱귤", "멀티"] },
  { id: "AGV (7.1F)", label: "7.1F",        variant: "floor", subTitleOnly: true,
    subs: [{ id: "싱귤", label: "7.1F (AGV)" }, { id: "멀티", label: "7.1F (AS/HV)" }] },
  { id: "7.2F",       label: "7.2F",        variant: "floor", subs: ["싱귤", "멀티"] },
  { id: "7.3F",       label: "7.3F",        variant: "floor", subs: ["싱귤", "멀티"] },
  { id: "8F",         label: "8F",          variant: "floor",
    subs: ["오더피커", { id: "8.1", label: "ES" }, "8.2", "8.3"] },
];

// sub 정규화 헬퍼 — 저장값(id) / 표시값(label) / 카드 제목
export function subIdOf(sub)    { return sub == null ? null : (typeof sub === "object" ? sub.id : sub); }
export function subLabelOf(sub) { return sub == null ? "" : (typeof sub === "object" ? sub.label : sub); }
export function cardTitleOf(group, sub) {
  if (sub == null) return group.label;
  const sl = subLabelOf(sub);
  return group.subTitleOnly ? sl : `${group.label} · ${sl}`;
}

// 옛 데이터(과거 라벨 "메뉴얼팩 멀티")를 현재 라벨 ("메뉴얼 멀티") 로 매핑
export const PACK_GROUP_ALIASES = {
  "메뉴얼팩 멀티": "메뉴얼 멀티",
};

export function normalizePackGroup(g) {
  return PACK_GROUP_ALIASES[g] || g;
}

export function renderPackPickStrip(opts) {
  const {
    container, kind, shift, date, groups, memberIndex,
    onCountChange = () => {},
    trailingEl = null, // 스트립 맨 오른쪽에 붙는 추가 카드 (예: W/S 워터)
  } = opts;

  container.innerHTML = "";

  const layout = document.createElement("div");
  layout.className = "pp-layout";

  // ── 좌측 사이드 — 그룹 표시 토글 + 검색 ──
  const side = document.createElement("aside");
  side.className = "pp-side";
  const sideTitle = document.createElement("div");
  sideTitle.className = "side-nav-title";
  sideTitle.textContent = (kind === "pack" ? "PACK 라인" : "PICK 층");
  side.appendChild(sideTitle);

  // 검색 입력
  const searchWrap = document.createElement("div");
  searchWrap.className = "pp-search-wrap";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "pp-search-input";
  searchInput.placeholder = "🔎 쿠코드/이름 검색";
  searchInput.title = "비어 있으면 전체 카드 표시 · ESC 로 초기화";
  searchWrap.appendChild(searchInput);
  side.appendChild(searchWrap);

  const visibility = new Map();
  const visKey = (g, s) => `${g}::${s || "_"}`;

  // 한 번에 보이기/숨기기 (체크박스 전체 토글)
  const showAllBtn = document.createElement("button");
  showAllBtn.className = "btn ghost pp-side-btn";
  showAllBtn.textContent = "👁 모두 보이기";
  showAllBtn.addEventListener("click", () => setAllVisible(true));
  side.appendChild(showAllBtn);
  const hideAllBtn = document.createElement("button");
  hideAllBtn.className = "btn ghost pp-side-btn";
  hideAllBtn.textContent = "🙈 모두 숨기기";
  hideAllBtn.addEventListener("click", () => setAllVisible(false));
  side.appendChild(hideAllBtn);

  function setAllVisible(on) {
    visibility.forEach((_, k) => visibility.set(k, on));
    side.querySelectorAll(".pp-vis-row input[type=checkbox]").forEach((cb) => { cb.checked = on; });
    applyVisibility();
  }

  side.appendChild(makeSep());

  const collapseAllBtn = document.createElement("button");
  collapseAllBtn.className = "btn ghost pp-side-btn";
  collapseAllBtn.textContent = "📕 모두 접기";
  side.appendChild(collapseAllBtn);
  const expandAllBtn = document.createElement("button");
  expandAllBtn.className = "btn ghost pp-side-btn";
  expandAllBtn.textContent = "📖 모두 펼치기";
  side.appendChild(expandAllBtn);

  side.appendChild(makeSep());

  groups.forEach((g) => {
    if (g.subs) {
      const heading = document.createElement("div");
      heading.className = "pp-side-group-title";
      heading.textContent = g.label;
      side.appendChild(heading);
      g.subs.forEach((s) => side.appendChild(makeVisToggle(g.id, subIdOf(s), subLabelOf(s))));
    } else {
      side.appendChild(makeVisToggle(g.id, null, g.label));
    }
  });

  function makeSep() { const d = document.createElement("div"); d.className = "pp-side-sep"; return d; }
  function makeVisToggle(gid, sub, label) {
    const k = visKey(gid, sub);
    visibility.set(k, true);
    const row = document.createElement("label");
    row.className = "pp-vis-row";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = true; cb.className = "row-checkbox";
    cb.addEventListener("change", () => { visibility.set(k, cb.checked); applyVisibility(); });
    const span = document.createElement("span");
    span.textContent = label;
    row.appendChild(cb); row.appendChild(span);
    return row;
  }
  layout.appendChild(side);

  const main = document.createElement("div");
  main.className = "pp-main";
  const strip = document.createElement("div");
  strip.className = "pp-strip";
  main.appendChild(strip);
  layout.appendChild(main);
  container.appendChild(layout);

  const cards = [];       // { groupId, subId, el, gridApi, countEl, ... }
  const colEls = [];      // 서브(싱귤/멀티 등)를 수직으로 묶는 컬럼 요소들
  let allRows = [];       // 모든 카드의 데이터 합 (Firestore + LS 머지된 결과)
  let unsubOps = null;
  let searchText = "";

  // ── 초기 로드 + 실시간 구독 ──
  async function initialLoad() {
    allRows = await listOps(shift, kind, date);
    buildCards();
    refreshTotals();
  }

  (async () => {
    await initialLoad();
    unsubOps = await subscribeOps(shift, kind, date, (rows) => {
      applyRemoteUpdate(rows);
    });
  })();

  function buildCards() {
    // 기존 카드 cleanup — editing 구독 + grid(document 리스너) 모두 해제
    cards.forEach((c) => {
      if (c.unsubEditing) try { c.unsubEditing(); } catch {}
      try { c.gridApi.destroy(); } catch {}
    });
    strip.innerHTML = "";
    cards.length = 0;
    colEls.length = 0;
    groups.forEach((g) => {
      if (g.subs) {
        // 서브(싱귤/멀티 등)는 한 컬럼에 수직으로 쌓음 — 싱귤 아래 멀티
        const colEl = document.createElement("div");
        colEl.className = "pp-col";
        colEl.dataset.gid = g.id;
        g.subs.forEach((s) => {
          const c = makeCard(g, s);
          colEl.appendChild(c.el);
          cards.push(c);
        });
        strip.appendChild(colEl);
        colEls.push(colEl);
      } else {
        const c = makeCard(g, null);
        strip.appendChild(c.el);
        cards.push(c);
      }
    });
    if (trailingEl) strip.appendChild(trailingEl); // W/S 등 — 맨 오른쪽
    applyVisibility();
    applySearch();
  }

  // 컬럼 안의 카드가 모두 숨겨지면 컬럼 자체도 숨김 (빈 공간 방지)
  function syncColVisibility() {
    colEls.forEach((colEl) => {
      const anyVisible = [...colEl.children].some((el) => el.style.display !== "none");
      colEl.style.display = anyVisible ? "" : "none";
    });
  }

  // ── 다른 사용자의 변경 (subscribeOps) 을 카드별 셀 단위로 적용 ──
  // ★ 절대 setRows 로 전체 재정렬하지 않음 — 사용자가 입력 중인 행을 보호
  function applyRemoteUpdate(remoteRows) {
    const remoteMap = new Map();
    remoteRows.forEach((r) => { if (r?.id) remoteMap.set(String(r.id), r); });

    const oldMap = new Map();
    allRows.forEach((r) => { if (r?.id) oldMap.set(String(r.id), r); });

    // 추가/수정
    for (const [id, r] of remoteMap.entries()) {
      const card = findCardForRow(r);
      // 다른 사용자가 행을 다른 그룹으로 옮긴 경우 — 옛 카드에 남은 사본 제거
      const old = oldMap.get(id);
      if (old) {
        const oldCard = findCardForRow(old);
        if (oldCard && oldCard !== card) oldCard.gridApi.removeRow(id);
      }
      if (!card) continue;
      const exists = card.gridApi.findRow(id);
      if (exists) {
        card.gridApi.patchRow(id, r);
      } else {
        // 빈 버퍼 행 위치를 찾아 그 자리만 in-place 교체 (다른 행 순서 절대 변경 X)
        const cur = card.gridApi.getRows();
        const firstBufferIdx = cur.findIndex((row) => !row.id && !row.kucode);
        if (firstBufferIdx >= 0) {
          const newRows = cur.slice();
          newRows[firstBufferIdx] = r;
          card.gridApi.setRows(newRows);
        } else {
          card.gridApi.insertRow(r); // 끝에 추가
        }
      }
    }

    // 삭제 (있던 row 가 remote 에서 사라짐)
    for (const [id, r] of oldMap.entries()) {
      if (!remoteMap.has(id)) {
        const card = findCardForRow(r);
        if (!card) continue;
        card.gridApi.removeRow(id);
      }
    }

    allRows = remoteRows.slice();
    markAllDuplicates(allRows, cards);
    cards.forEach((c) => c.gridApi.refresh());
    refreshTotals();
  }

  function findCardForRow(r) {
    const groupId = r.line || r.floor;
    const sub = r.subType || null;
    return cards.find((c) => c.groupId === String(groupId) && (c.subId || null) === sub);
  }

  function findBufferIndex(gridRows) {
    return gridRows.findIndex((r) => !r.id && !r.kucode);
  }

  function makeBuffer(n) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push({ id: "" });
    return arr;
  }

  function padToMin(rowsArr) {
    if (rowsArr.length >= MIN_VISIBLE_ROWS) return rowsArr;
    return [...rowsArr, ...makeBuffer(MIN_VISIBLE_ROWS - rowsArr.length)];
  }

  function makeCard(group, subDef) {
    // subDef 는 문자열 또는 {id,label} — 저장값(subId)과 표시(subLabel/제목) 분리
    const sub = subIdOf(subDef);           // 저장·매칭에 쓰는 값 (subType)
    const subLabel = subLabelOf(subDef);   // 화면 표시용
    const cardTitle = cardTitleOf(group, subDef);

    const el = document.createElement("section");
    el.className = `pp-card variant-${group.variant || "default"}`;
    el.dataset.gid = group.id;
    if (sub) el.dataset.sub = sub;

    const head = document.createElement("header");
    head.className = "pp-card-head";

    const title = document.createElement("div");
    title.className = "pp-card-title";
    title.innerHTML = `
      <span class="pp-card-name">${escape(cardTitle)}</span>
      <span class="pp-card-count">0 명</span>
    `;
    head.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "pp-card-actions";
    const addBtn = document.createElement("button");
    addBtn.className = "icon-btn small"; addBtn.textContent = "+"; addBtn.title = "행 추가";
    actions.appendChild(addBtn);
    const collapseBtn = document.createElement("button");
    collapseBtn.className = "icon-btn small"; collapseBtn.textContent = "▾"; collapseBtn.title = "접기/펼치기";
    actions.appendChild(collapseBtn);
    head.appendChild(actions);
    el.appendChild(head);

    const body = document.createElement("div");
    body.className = "pp-card-body";
    el.appendChild(body);

    collapseBtn.addEventListener("click", () => {
      el.classList.toggle("collapsed");
      collapseBtn.textContent = el.classList.contains("collapsed") ? "▸" : "▾";
    });

    const groupRows = allRows.filter((r) =>
      String(r.line || r.floor) === String(group.id) &&
      (sub == null ? !r.subType : r.subType === sub)
    );

    const initialPaddedRows = padToMin([...groupRows, ...makeBuffer(BUFFER_ROWS)]);

    const grid = createGrid({
      container: body,
      columns: columnDef(memberIndex),
      rows: initialPaddedRows,
      canDelete: true,
      selectable: true,
      copyKeys: ["kucode", "name", "team"],
      makeNewRow: () => ({ id: "" }),
      emptyText: "쿠코드를 입력하거나 엑셀에서 붙여넣으세요.",
      highlightText: searchText,
      onCommit: async (row, key, value, prevSnapshot, opts) => {
        const ku = String(row.kucode || "").trim();
        const bulkMode = opts?.bulk === true;

        // ── 충돌 감지: 편집 시작 후 다른 사람이 같은 행을 수정했는지 ──
        // bulk paste 중에는 충돌 다이얼로그 스킵 (대량 입력 흐름 방해 방지)
        if (!bulkMode && row.__editStartUpdatedAt && row.updatedAt &&
            row.updatedAt > row.__editStartUpdatedAt) {
          const ok = await confirmDialog({
            title: "⚠ 충돌 감지",
            danger: true,
            message: "방금 다른 사용자가 이 행을 수정했습니다.\n내 변경으로 덮어쓸까요?",
            detail: `<div class="conflict-detail">현재 값(다른 사람): <b>${escape(String(prevSnapshot?.[key] ?? "—"))}</b><br>내 입력: <b>${escape(String(value ?? "—"))}</b></div>`,
            yes: "덮어쓰기", no: "취소(다른 사람 값 유지)",
          });
          if (!ok) {
            // 다른 사람 값 유지 — 원래 값으로 되돌리기
            const remoteVal = prevSnapshot?.[key] ?? "";
            row[key] = remoteVal;
            row.__editStartUpdatedAt = row.updatedAt;
            return { patch: { [key]: remoteVal } };
          }
        }

        // ── 쿠코드를 비우면 → 이름/조 클리어 + 행을 DB에서 삭제 ──
        if (key === "kucode" && !ku) {
          if (row.id) {
            try { await deleteOps(shift, kind, row.id); } catch {}
            try { await deleteShareByKucode(shift, kind, prevSnapshot?.kucode || row.kucode || row.name); } catch {}
            await logAudit({
              shift, scope: `ops:${kind}`, target: prevSnapshot?.name || row.name || "(unknown)",
              action: "delete", by: getSession()?.nickname,
              before: sanitize(prevSnapshot || row), detail: "쿠코드 비움",
            });
            const idx = allRows.findIndex((x) => x === row || x.id === row.id);
            if (idx >= 0) allRows.splice(idx, 1);
          }
          row.id = "";
          row.name = "";
          row.team = "";
          row.__dup = false;
          if (!bulkMode) {
            markAllDuplicates(allRows, cards);
            cards.forEach((c) => c.gridApi.refresh());
            refreshTotals();
            ensureBufferRows();
          }
          return { patch: { name: "", team: "" } };
        }
        if (!ku) {
          // 쿠코드 없이 다른 컬럼만 입력 — 저장되지 않음을 안내 (bulk paste 흐름은 제외)
          if (!bulkMode && key !== "kucode" && String(value || "").trim()) {
            return { error: "쿠코드를 먼저 입력하세요." };
          }
          return {};
        }

        if (key === "kucode") {
          const fill = autofillFromMaster(memberIndex, ku);
          if (fill) { row.name = fill.name || ""; row.team = fill.team || ""; }
          else { row.name = ""; row.team = ""; return { error: "DATA에 없는 쿠코드입니다." }; }
        }
        const before = row.id ? { ...sanitize(prevSnapshot || row) } : null;
        row.date = date;
        row.line  = (kind === "pack") ? group.id : undefined;
        row.floor = (kind === "pick") ? group.id : undefined;
        row.subType = sub || null;
        const isCreate = !row.id;
        // bulk paste: 개별 setDoc / share sync 안 함 — onBulkPasteEnd 가 writeBatch 로 처리
        if (bulkMode) {
          // ★ 레이스 방지: id 를 미리 할당해서 onSnapshot 이 와도 findRow 가 작동하게
          if (!row.id) row.id = crypto.randomUUID();
          if (!allRows.find((x) => x === row)) allRows.push(row);
          return { patch: { name: row.name, team: row.team } };
        }
        // ★ 레이스 방지: upsertOps await 전에 id 를 미리 할당.
        // 그래야 await 도중 Firestore onSnapshot 이 와도 findRow(id) 가 로컬 행을 찾아 patchRow 경로로 가서
        // 행 위치/데이터가 깨지지 않는다.
        if (isCreate) row.id = crypto.randomUUID();
        const id = await upsertOps(shift, kind, row.id, sanitize(row));
        row.id = id;
        row.__editStartUpdatedAt = row.updatedAt || Date.now();

        // 공유 시트 자동 동기화 — Perm(계약직) 만 자동 추가 (TEMP·캡틴 제외)
        if (isPermMember(memberIndex, ku)) {
          try {
            await upsertShare(shift, kind, ku, {
              kucode: ku,
              name: row.name || "",
              team: row.team || "",
              group: group.id,
              date,
            });
          } catch (e) { console.warn("share sync failed", e); }
        }

        // bulk paste 중에는 audit log 스킵 (대량 작성으로 로그 폭주 방지)
        if (!bulkMode) {
          await logAudit({
            shift, scope: `ops:${kind}`, target: ku,
            action: isCreate ? "create" : "update",
            by: getSession()?.nickname,
            before, after: sanitize(row),
          });
        }
        if (isCreate && !allRows.find((x) => x.id === row.id)) allRows.push(row);
        if (!bulkMode) {
          markAllDuplicates(allRows, cards);
          cards.forEach((c) => c.gridApi.refresh());
          refreshTotals();
          ensureBufferRows();
        }
        return { patch: { name: row.name, team: row.team } };
      },
      onBulkPasteEnd: async (pastedRows) => {
        // bulk paste 완료 — writeBatch 로 1회 round-trip
        // 1) 유효한 행만 (kucode + 에러 없음)
        const valid = pastedRows.filter((r) => {
          const ku = String(r.kucode || "").trim();
          if (!ku) return false;
          if (r.__errors && Object.keys(r.__errors).length) return false;
          return true;
        });
        if (valid.length) {
          // 2) 모두 line/floor/subType/date 세팅 + sanitize
          const payload = valid.map((r) => {
            r.date    = date;
            r.line    = (kind === "pack") ? group.id : undefined;
            r.floor   = (kind === "pick") ? group.id : undefined;
            r.subType = sub || null;
            return sanitize(r);
          });
          try {
            const { ok, batches, ids } = await batchUpsertOps(shift, kind, payload);
            // 할당된 id 를 row 에 반영 (batchUpsertOps 가 r.id 를 mutate)
            valid.forEach((r, i) => {
              if (!r.id && ids && ids[i]) r.id = ids[i];
              r.__editStartUpdatedAt = Date.now();
            });
            // 공유 시트도 병렬 처리 — Perm(계약직) 만 자동 추가
            await Promise.allSettled(valid
              .filter((r) => isPermMember(memberIndex, String(r.kucode)))
              .map((r) =>
                upsertShare(shift, kind, String(r.kucode), {
                  kucode: r.kucode, name: r.name || "", team: r.team || "",
                  group: group.id, date,
                })
              ));
            console.log(`[bulk paste] ${ok}개 / ${batches}배치`);
          } catch (e) {
            console.error("bulk paste failed", e);
            showToast("일괄 추가 실패: " + (e.message || e), "error");
          }
        }
        // 3) UI 갱신
        markAllDuplicates(allRows, cards);
        cards.forEach((c) => c.gridApi.refresh());
        refreshTotals();
        ensureBufferRows();
        // 4) 요약 토스트
        const ok = valid.length;
        const fail = pastedRows.length - ok;
        if (fail) showToast(`✓ ${ok}명 추가 · ${fail}개 오류 (DATA 미등록)`, fail > ok ? "error" : "info");
        else if (ok) showToast(`✓ ${ok}명 추가 완료`, "success");
      },
      onDelete: async (row) => {
        const ok = await confirmDialog({
          title: "행 삭제", danger: true,
          message: `${row.name || row.kucode} (${cardTitle})\n행을 삭제할까요?`,
          yes: "삭제", no: "취소",
        });
        if (!ok) return false;
        if (row.id) await deleteOps(shift, kind, row.id);
        if (row.kucode) {
          try { await deleteShareByKucode(shift, kind, row.kucode); } catch {}
        }
        await logAudit({
          shift, scope: `ops:${kind}`, target: row.kucode,
          action: "delete", by: getSession()?.nickname, before: sanitize(row),
        });
        const idx = allRows.findIndex((x) => x === row || x.id === row.id);
        if (idx >= 0) allRows.splice(idx, 1);
        refreshTotals();
        ensureBufferRows();
        return true;
      },
      onLabelClick: (row) => {
        const m = (memberIndex.map.get(String(row.kucode))) || null;
        if (m) openMemberCard(m, { shift });
      },
      onRowContextMenu: (row, sel, e) => {
        const filteredSel = sel.filter((r) => r.kucode);
        const menuItems = [
          { heading: `${filteredSel.length || 1}개 행` },
          {
            label: "Pack 으로 이동",
            icon: "📦",
            sub: PACK_GROUPS_DEF.map((g) => ({
              label: g.label, icon: "→",
              onClick: () => moveRows(filteredSel.length ? filteredSel : [row], "pack", g.id, null),
            })),
          },
          {
            label: "Pick 으로 이동",
            icon: "🛒",
            sub: PICK_GROUPS_DEF.flatMap((g) => g.subs.map((s) => ({
              label: cardTitleOf(g, s), icon: "→",
              onClick: () => moveRows(filteredSel.length ? filteredSel : [row], "pick", g.id, subIdOf(s)),
            }))),
          },
          { divider: true },
          { label: "복사 (쿠코드 | 성함)", icon: "📋", onClick: () => copyCols(filteredSel.length ? filteredSel : [row], ["kucode", "name"]) },
          { label: "복사 (쿠코드만)", icon: "📋", onClick: () => copyCols(filteredSel.length ? filteredSel : [row], ["kucode"]) },
          { label: "수정 이력", icon: "📜", onClick: () => openAuditPanel({ scope: `ops:${kind}`, target: row.kucode, shift, title: `${row.kucode} 수정 이력` }) },
          { divider: true },
          {
            label: "선택 행 삭제", icon: "🗑", danger: true,
            onClick: async () => {
              const ok = await confirmDialog({
                title: "삭제 확인", danger: true,
                message: `선택한 ${(filteredSel.length || 1)}개 행을 삭제할까요?`,
                yes: "삭제", no: "취소",
              });
              if (!ok) return;
              const target = filteredSel.length ? filteredSel : [row];
              for (const r of target) {
                if (r.id) {
                  await deleteOps(shift, kind, r.id);
                  if (r.kucode) { try { await deleteShareByKucode(shift, kind, r.kucode); } catch {} }
                }
                await logAudit({ shift, scope: `ops:${kind}`, target: r.kucode, action: "delete", by: getSession()?.nickname, before: sanitize(r) });
              }
              showToast(`${target.length}개 삭제`, "success");
              // allRows 정리 (다음 onSnapshot 도 이걸 확정)
              target.forEach((r) => {
                const idx = allRows.findIndex((x) => x === r || x.id === r.id);
                if (idx >= 0) allRows.splice(idx, 1);
              });
              markAllDuplicates(allRows, cards);
              cards.forEach((c) => c.gridApi.refresh());
              refreshTotals();
              ensureBufferRows();
            },
          },
        ];
        openContextMenu(e.clientX, e.clientY, menuItems);
      },
    });

    const card = {
      groupId: group.id,
      subId: sub || null,
      label: title.querySelector(".pp-card-name").textContent,
      el, gridApi: grid,
      countEl: title.querySelector(".pp-card-count"),
      group, sub,
    };

    card.count = groupRows.length;
    title.querySelector(".pp-card-count").textContent = `${card.count} 명`;

    addBtn.addEventListener("click", () => grid.addRow());

    // ── 입력 중 인디케이터 + 충돌 감지용 스냅샷 ──
    const scope = `ops:${kind}:${group.id}${sub ? ":" + sub : ""}`;
    const editingBadge = document.createElement("span");
    editingBadge.className = "editing-badge";
    head.appendChild(editingBadge);

    let blurTimer = null;
    body.addEventListener("focusin", (e) => {
      if (!e.target.matches(".cell-input")) return;
      clearTimeout(blurTimer);
      // 충돌 감지용: 이 시점의 updatedAt 저장
      const tr = e.target.closest("tr");
      const rowId = tr?.dataset.rowId || "";
      const targetRow = card.gridApi.findRow(rowId);
      if (targetRow) {
        targetRow.__editStartUpdatedAt = targetRow.updatedAt || 0;
      }
      // 다른 사람에게 알림
      markEditing(scope, { rowId, nickname: getSession()?.nickname }).catch(() => {});
    });
    body.addEventListener("focusout", (e) => {
      if (!e.target.matches(".cell-input")) return;
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!body.contains(document.activeElement)) {
          unmarkEditing(scope).catch(() => {});
        }
      }, 250);
    });

    // 다른 사용자 편집 구독 + 카드/행 강조
    subscribeEditing(scope, (others) => {
      // 카드 배지
      if (others && others.length > 0) {
        el.classList.add("being-edited");
        const names = [...new Set(others.map((o) => o.nickname).filter(Boolean))];
        editingBadge.textContent = names.length === 1
          ? `${names[0]} 입력중...`
          : `${names.length}명 입력중...`;
        editingBadge.style.display = "";
      } else {
        el.classList.remove("being-edited");
        editingBadge.style.display = "none";
      }
      // 행 강조 (rowId 가 있는 경우)
      body.querySelectorAll("tr.remote-editing").forEach((tr) => tr.classList.remove("remote-editing"));
      (others || []).forEach((o) => {
        if (!o.rowId) return;
        const tr = body.querySelector(`tr[data-row-id="${cssEscape(String(o.rowId))}"]`);
        if (tr) {
          tr.classList.add("remote-editing");
          tr.title = `${o.nickname || "다른 매니저"} 입력 중`;
        }
      });
    }).then((un) => { card.unsubEditing = un; });

    return card;
  }

  function applyVisibility() {
    cards.forEach((c) => {
      const k = visKey(c.groupId, c.subId);
      const vis = visibility.get(k) !== false;
      c.el.style.display = vis ? "" : "none";
    });
    applySearch(); // visibility 변경 후 검색도 재반영 (syncColVisibility 포함)
  }

  collapseAllBtn.addEventListener("click", () => cards.forEach((c) => {
    c.el.classList.add("collapsed");
    const b = c.el.querySelector(".pp-card-head .icon-btn:last-child");
    if (b) b.textContent = "▸";
  }));
  expandAllBtn.addEventListener("click", () => cards.forEach((c) => {
    c.el.classList.remove("collapsed");
    const b = c.el.querySelector(".pp-card-head .icon-btn:last-child");
    if (b) b.textContent = "▾";
  }));

  // ── 검색 ──
  searchInput.addEventListener("input", () => {
    searchText = searchInput.value.trim();
    cards.forEach((c) => c.gridApi.setHighlight(searchText));
    applySearch();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      searchText = "";
      cards.forEach((c) => c.gridApi.setHighlight(""));
      applySearch();
    }
  });

  function applySearch() {
    if (!searchText) {
      cards.forEach((c) => {
        const k = visKey(c.groupId, c.subId);
        const vis = visibility.get(k) !== false;
        c.el.style.display = vis ? "" : "none";
        c.el.classList.remove("search-no-match");
      });
      syncColVisibility();
      return;
    }
    // 콤마(,)로 여러 명 동시 검색 — 하나라도 매칭되는 카드는 표시
    const terms = searchText.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
    cards.forEach((c) => {
      const k = visKey(c.groupId, c.subId);
      const visToggle = visibility.get(k) !== false;
      if (!visToggle) { c.el.style.display = "none"; return; }
      const hasMatch = c.gridApi.getRows().some((row) => {
        if (!row.kucode && !row.name) return false;
        const hay = `${row.kucode || ""} ${row.name || ""} ${row.note || ""}`.toLowerCase();
        return terms.some((t) => hay.includes(t));
      });
      c.el.style.display = hasMatch ? "" : "none";
      c.el.classList.toggle("search-no-match", !hasMatch);
    });
    syncColVisibility();
  }

  function refreshTotals() {
    let total = 0;
    cards.forEach((c) => {
      const rows = c.gridApi.getRows().filter((r) => r.kucode);
      const n = rows.length;
      c.count = n;
      c.countEl.textContent = `${n} 명`;
      total += n;
    });
    onCountChange({ total });
  }

  // 빈 행이 부족하면 끝에만 보충 — 기존 순서 절대 변경하지 않음
  // (이전 버그: dataRows 를 먼저 두고 buffers 를 뒤로 옮겨 순서가 깨졌었음)
  function ensureBufferRows() {
    cards.forEach((c) => {
      const cur = c.gridApi.getRows();
      const buffers = cur.filter((r) => !r.id && !r.kucode);
      const needed = Math.max(BUFFER_ROWS - buffers.length, 0);
      if (needed === 0 && cur.length >= MIN_VISIBLE_ROWS) return;
      // 끝에만 빈 행 추가 (순서 보존)
      c.gridApi.setRows(padToMin([...cur, ...makeBuffer(needed)]));
    });
  }

  async function moveRows(rows, targetKind, targetGroup, targetSub) {
    if (!rows.length) return;
    const ok = await confirmDialog({
      title: "이동 확인",
      message: `${rows.length}개 행을\n${targetKind.toUpperCase()} → ${targetGroup}${targetSub ? " · " + targetSub : ""}\n로 이동할까요?`,
      yes: "이동", no: "취소",
    });
    if (!ok) return;
    for (const row of rows) {
      const before = sanitize(row);
      const ku = row.kucode;
      const oldId = row.id;

      if (targetKind !== kind) {
        // 다른 kind 로 이동 — 원본 완전 삭제 후 신규 docId 로 등록
        if (oldId) {
          try { await deleteOps(shift, kind, oldId); } catch {}
        }
        const newRow = { ...sanitize(row), date,
          line:  (targetKind === "pack") ? targetGroup : null,
          floor: (targetKind === "pick") ? targetGroup : null,
          subType: targetSub || null,
        };
        delete newRow.id;
        await upsertOps(shift, targetKind, null, newRow);
        const idx = allRows.findIndex((x) => x === row || x.id === oldId);
        if (idx >= 0) allRows.splice(idx, 1);
        // shift 가 같은 쪽으로 옮긴 거니 deleteShare 후 새 group 으로 upsertShare (Perm 만)
        if (ku) {
          try { await deleteShareByKucode(shift, kind, ku); } catch {}
          if (isPermMember(memberIndex, ku)) {
            try {
              await upsertShare(shift, targetKind, ku, {
                kucode: ku, name: newRow.name || "", team: newRow.team || "",
                group: targetGroup, date,
              });
            } catch {}
          }
        }
      } else {
        // 같은 kind 안 이동 — line/floor/subType 만 갱신 (docId 그대로)
        row.line  = (targetKind === "pack") ? targetGroup : null;
        row.floor = (targetKind === "pick") ? targetGroup : null;
        row.subType = targetSub || null;
        await upsertOps(shift, targetKind, row.id, sanitize(row));
        if (ku && isPermMember(memberIndex, ku)) {
          try {
            await upsertShare(shift, targetKind, ku, {
              kucode: ku, name: row.name || "", team: row.team || "",
              group: targetGroup, date,
            });
          } catch {}
        }
      }
      await logAudit({
        shift, scope: `ops:${targetKind}`, target: ku,
        action: "move", by: getSession()?.nickname,
        before, after: { line: targetGroup, floor: targetGroup, subType: targetSub, kind: targetKind },
      });
    }
    showToast(`${rows.length}명 → ${targetGroup}${targetSub ? " · " + targetSub : ""}`, "success");
    // 강제 재로드 (subscribeOps 가 곧 적용하지만 한 번 더 fresh)
    allRows = await listOps(shift, kind, date);
    buildCards();
    refreshTotals();
  }

  async function deleteShareByKucode(shiftV, kindV, kucodeV) {
    const list = await listShare(shiftV, kindV);
    const targets = list.filter((r) => String(r.kucode) === String(kucodeV) || String(r.id) === String(kucodeV));
    for (const r of targets) await deleteShare(shiftV, kindV, r.id);
  }

  // 지정한 컬럼만 TSV 로 복사 (엑셀 붙여넣기 시 각 컬럼이 A,B 셀로 들어감)
  function copyCols(rows, keys) {
    const real = rows.filter((r) => r.kucode);
    const tsv = real.map((r) => keys.map((k) => r[k] ?? "").join("\t")).join("\n");
    if (!tsv) return;
    navigator.clipboard?.writeText(tsv);
    const label = keys.length === 1 ? "쿠코드" : "쿠코드 | 성함";
    showToast(`${real.length}명 복사 (${label})`, "success");
  }

  function cssEscape(s) {
    if (window.CSS?.escape) return CSS.escape(s);
    return String(s).replace(/["\\]/g, "\\$&");
  }

  return {
    reload: initialLoad,
    destroy() {
      if (unsubOps) { try { unsubOps(); } catch {} unsubOps = null; }
      cards.forEach((c) => {
        if (c.unsubEditing) try { c.unsubEditing(); } catch {}
        try { c.gridApi.destroy(); } catch {}
      });
      cards.length = 0;
      try { container.innerHTML = ""; } catch {}
    },
  };
}

// 모든 행에서 같은 kucode 가 2회 이상이면 __dup = true.
function markDuplicates(rows) {
  const counts = new Map();
  rows.forEach((r) => {
    if (!r) return;
    const k = String(r.kucode || "").trim();
    if (!k) return;
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  rows.forEach((r) => {
    if (!r) return;
    const k = String(r.kucode || "").trim();
    r.__dup = !!(k && counts.get(k) > 1);
  });
}

// 카드 안의 모든 grid rows (빈 행 포함) 까지 dup 검사.
// ★ 같은 id 의 행이 allRows 와 grid 에 서로 다른 객체로 존재할 수 있으므로
//   (원격 스냅샷 후 allRows 가 새 객체 배열로 교체됨) id 기준으로 dedupe — 오탐 방지.
function markAllDuplicates(allRows, cards) {
  const all = [];
  const seenIds = new Set();
  const push = (r) => {
    if (!r) return;
    const id = r.id != null && r.id !== "" ? String(r.id) : null;
    if (id) {
      if (seenIds.has(id)) return;
      seenIds.add(id);
    }
    all.push(r);
  };
  // 화면에 보이는 grid 행을 먼저 (마킹 대상), allRows 는 grid 에 없는 id 만 보충
  (cards || []).forEach((c) => {
    if (!c?.gridApi) return;
    c.gridApi.getRows().forEach(push);
  });
  (allRows || []).forEach(push);
  markDuplicates(all);
}

function columnDef(memberIndex) {
  return [
    { key: "kucode", label: "쿠코드", type: "text",  width: "84px" },
    {
      key: "name", label: "성함", type: "label", width: "150px",
      getLabel: (row) => buildMemberLabel(memberIndex && memberIndex.map.get(String(row.kucode)), row.name),
    },
    { key: "team", label: "조", type: "text", readonly: true, width: "52px" },
    {
      key: "skills", label: "M/A/P", type: "label", width: "64px",
      getLabel: (row) => buildSkillChipsLabel(memberIndex && memberIndex.map.get(String(row.kucode))),
    },
    { key: "note", label: "비고", type: "text" },
  ];
}

function sanitize(row) {
  if (!row) return row;
  const { __errors, __dup, __editStartUpdatedAt, ...rest } = row;
  return rest;
}

// 공유 시트 자동 추가 대상 — Perm(계약직) 만
function isPermMember(memberIndex, kucode) {
  const m = memberIndex?.map?.get(String(kucode));
  return m?.role === "perm";
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
