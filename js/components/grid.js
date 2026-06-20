// 편집 가능한 그리드.
// - <table> + 셀당 <input>
// - Tab/Shift+Tab, 마지막 셀에서 Tab → 새 행 자동 추가
// - Enter → 같은 컬럼 다음 행
// - Ctrl+V → TSV 클립보드 → 다중 셀 붙여넣기
// - 셀 blur 시 onCommit (upsert)
// - 컬럼 헤더 클릭 → 정렬 토글
// - 행 좌측 체크박스 + Shift+클릭 범위 선택 + Ctrl+C → TSV 복사
// - column.type === 'label' : 커스텀 라벨 (라벨 빌더로 클래스 + 텍스트 표시, 클릭 시 onLabelClick)
// - 우클릭 → onRowContextMenu(row, selectedRows, event)
//
// 실시간 협업용 API:
//   patchRow(id, partial)        — 한 행 데이터 갱신 (포커스/미커밋 입력 보존)
//   insertRow(rowData, atIndex?) — 한 행 삽입 (없는 id 일 때만)
//   removeRow(id)                — 한 행 제거 (편집 중이 아닐 때)
//   render() 자체도 포커스/캐럿/미커밋 값 보존

import { openMultiSelect } from "./multi-select.js";
import { confirmDialog } from "./dialog.js";

export function createGrid(opts) {
  const {
    container,
    columns,
    rowIdKey = "id",
    rows: initialRows = [],
    canDelete = false,
    selectable = true,
    copyKeys = null,
    onCommit = async () => ({}),
    onDelete = async () => {},
    onBulkDelete = null,          // (rows) => void — 선택 행 일괄 삭제 (Delete 키 + 선택바 버튼)
    onRowContextMenu = null,
    onLabelClick = null,
    onBulkPasteEnd = null,        // (pastedRows) => void — paste 완료 후 일괄 작업용
    makeNewRow = () => ({}),
    emptyText = null,
    highlightText = "",
    virtualize = false, // true: 가상 스크롤(보이는 창만 렌더). DATA 같은 대용량 그리드만.
  } = opts;

  let rows = initialRows.slice();
  let filterText = "";
  let hlText = highlightText || "";
  let sortState = { key: null, dir: 1 };

  // ── 가상 스크롤(windowing) — 화면에 보이는 행만 DOM 으로 렌더 ──
  const OVERSCAN = 8;        // 위/아래 여유 행
  let rowH = 0;              // 측정된 행 높이(px)
  let rowHMeasured = false;
  let scrollRaf = null;
  let lastWin = { start: -1, end: -1 }; // 현재 렌더된 창 — 스크롤 시 변할 때만 재렌더
  const selected = new Set();
  let lastClickedIndex = -1;
  // 바코드 타각용: scanAdvance 컬럼에서 커밋(blur) 후 다음 행 같은 칸으로 자동 이동
  let scanAdvancePending = null; // 이동 대기 중인 행 인덱스(vi)
  // 체크박스 mousedown + drag 로 범위 선택
  let dragMode = null; // 'select' | 'deselect' | 'range' | null
  // 셀 위에서 드래그 시작 → 다른 행 진입 시 행 범위 선택으로 전환
  let pendingDrag = null; // { startVi }
  let rangeBase = null;   // 드래그 시작 전 선택 스냅샷 (방향 반전 시 복원용)

  const wrap = document.createElement("div");
  wrap.className = "grid-wrap";

  const selBar = document.createElement("div");
  selBar.className = "grid-selection-bar";
  selBar.style.display = "none";
  // 기본 복사 = '쿠코드만' (주 버튼 + Ctrl+C). '쿠코드 | 성함' 은 선택형 보조 버튼.
  selBar.innerHTML = `
    <span class="sel-count">0 행 선택됨</span>
    <button class="btn primary sel-copy-ku" title="쿠코드만 복사 (Ctrl+C)">📋 쿠코드</button>
    <button class="btn ghost sel-copy-kn" title="쿠코드 | 성함 복사">📋 쿠코드 | 성함</button>
    ${(onBulkDelete || canDelete) ? `<button class="btn ghost danger sel-delete" title="선택 행 삭제 (Delete)">🗑 삭제</button>` : ""}
    <button class="btn ghost sel-clear">해제</button>
  `;
  wrap.appendChild(selBar);

  const scroll = document.createElement("div");
  scroll.className = "grid-scroll";

  const table = document.createElement("table");
  table.className = "grid";

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  if (selectable) {
    const th = document.createElement("th");
    th.className = "col-select";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "row-checkbox header-checkbox";
    cb.title = "전체 선택";
    cb.addEventListener("change", () => {
      const visible = visibleRows();
      if (cb.checked) visible.forEach((r) => selected.add(r));
      else visible.forEach((r) => selected.delete(r));
      render();
    });
    th.appendChild(cb);
    trh.appendChild(th);
  }

  columns.forEach((c) => {
    const th = document.createElement("th");
    th.dataset.colKey = c.key;
    if (c.width) th.style.width = c.width;
    const span = document.createElement("span");
    span.textContent = c.label;
    th.appendChild(span);
    if (c.type === "rownum") {
      th.className = "col-rownum";
      trh.appendChild(th);
      return; // 행번호 열은 정렬 비활성
    }
    const sortIcon = document.createElement("span");
    sortIcon.className = "sort-icon";
    th.appendChild(sortIcon);
    th.classList.add("sortable");
    th.addEventListener("click", () => toggleSort(c.key));
    trh.appendChild(th);
  });
  if (canDelete) {
    const th = document.createElement("th");
    th.className = "col-actions";
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  scroll.appendChild(table);
  wrap.appendChild(scroll);
  container.appendChild(wrap);

  selBar.querySelector(".sel-copy-ku").addEventListener("click", () => copySelection(["kucode"]));
  selBar.querySelector(".sel-copy-kn").addEventListener("click", () => copySelection(["kucode", "name"]));
  selBar.querySelector(".sel-clear").addEventListener("click", () => {
    selected.clear();
    render();
  });
  const selDeleteBtn = selBar.querySelector(".sel-delete");
  if (selDeleteBtn) selDeleteBtn.addEventListener("click", () => triggerBulkDelete());

  function onCopyKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "c") return;
    if (selected.size === 0) return;
    if (!wrap.isConnected) return; // 다른 탭으로 전환된 그리드는 무시
    const sel = window.getSelection?.()?.toString();
    if (sel && sel.length > 0) return;
    e.preventDefault();
    copySelection(["kucode"]); // 기본: 쿠코드만
  }
  document.addEventListener("keydown", onCopyKey);

  // ── 선택 행 일괄 삭제 ──
  // onBulkDelete 가 있으면 그걸 우선 사용(탭별 커스텀 정리 로직).
  // 없으면 canDelete + onDelete 로 그리드가 직접 일괄 삭제(확인은 한 번만).
  function triggerBulkDelete() {
    if (selected.size === 0) return;
    const visible = visibleRows();
    const rowsToDelete = visible.filter((r) => selected.has(r));
    if (!rowsToDelete.length) return;
    if (onBulkDelete) { onBulkDelete(rowsToDelete); return; }
    if (canDelete) { genericBulkDelete(rowsToDelete); }
  }
  function rowHasData(r) {
    if (!r) return false;
    if (r[rowIdKey]) return true;
    return columns.some((c) => {
      const v = r[c.key];
      return Array.isArray(v) ? v.length > 0 : (v != null && v !== "");
    });
  }
  async function genericBulkDelete(rowsToDelete) {
    // 빈 버퍼 행은 제외 — 실제 데이터가 있는 행만 삭제
    const real = rowsToDelete.filter(rowHasData);
    if (!real.length) return;
    const ok = await confirmDialog({
      title: "삭제 확인", danger: true,
      message: `선택한 ${real.length}개 행을 삭제할까요?`,
      yes: "삭제", no: "취소",
    });
    if (!ok) return;
    for (const row of real) {
      try {
        const result = await onDelete(row);
        if (result === false) continue; // onDelete 가 취소 신호를 주면 건너뜀
      } catch (e) { console.warn("일괄 삭제 중 한 행 실패", e); }
      const idx = rows.indexOf(row);
      if (idx >= 0) rows.splice(idx, 1);
      selected.delete(row);
    }
    render();
  }
  // Delete 키 → 선택된 행이 있으면 어느 입력창에서든 일괄 삭제.
  // (글자 단위 삭제는 Backspace 로 가능하므로 입력 중에도 충돌 없음)
  function onDeleteKey(e) {
    if (e.key !== "Delete") return;
    if (selected.size === 0) return;
    if (!onBulkDelete && !canDelete) return; // 삭제 불가 그리드는 무시
    if (!wrap.isConnected) return; // 다른 탭으로 전환된 그리드는 무시
    e.preventDefault();
    triggerBulkDelete();
  }
  document.addEventListener("keydown", onDeleteKey);

  // 드래그 종료 — 마우스가 그리드 밖으로 나가도 끝나도록 document 에 등록
  function onMouseUp() {
    dragMode = null;
    pendingDrag = null;
    rangeBase = null;
    wrap.classList.remove("drag-selecting");
  }
  document.addEventListener("mouseup", onMouseUp);

  // 스크롤 시 — 창(window)이 실제로 바뀔 때만 재렌더.
  // (창이 그대로면 재렌더 안 함 → 입력 중 포커스/미커밋 값 보존, 불필요한 rebuild 방지)
  function onGridScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      const h = rowH || 34;
      const total = visibleRows().length;
      const count = Math.ceil((scroll.clientHeight || 600) / h) + OVERSCAN * 2;
      let start = Math.max(0, Math.floor(scroll.scrollTop / h) - OVERSCAN);
      if (start + count > total) start = Math.max(0, total - count);
      if (start !== lastWin.start) render();
    });
  }
  if (virtualize) scroll.addEventListener("scroll", onGridScroll, { passive: true });

  function totalCols() {
    return columns.length + (canDelete ? 1 : 0) + (selectable ? 1 : 0);
  }
  // 윈도우 위/아래 여백을 채우는 스페이서 행 (스크롤바 높이 유지)
  function spacerRow(h) {
    const tr = document.createElement("tr");
    tr.className = "grid-vspacer";
    tr.setAttribute("aria-hidden", "true");
    const td = document.createElement("td");
    td.colSpan = totalCols();
    td.style.height = `${h}px`;
    tr.appendChild(td);
    return tr;
  }
  // 데이터 인덱스 vi 가 뷰포트에 보이도록 스크롤 + 필요 시 재렌더
  function ensureIndexVisible(vi) {
    const h = rowH || 34;
    const top = vi * h;
    const vpH = scroll.clientHeight || 600;
    if (top < scroll.scrollTop) { scroll.scrollTop = top; render(); }
    else if (top + h > scroll.scrollTop + vpH) { scroll.scrollTop = top - vpH + h * 2; render(); }
    else if (!tbody.querySelector(`tr[data-vindex="${vi}"]`)) { render(); }
  }

  // 셀 드래그 범위 선택 적용 — 시작 행 ~ 현재 행 사이를 모두 체크
  function applyDragRange(curVi) {
    if (!pendingDrag) return;
    const visible = visibleRows();
    const [a, b] = [pendingDrag.startVi, curVi].sort((x, y) => x - y);
    selected.clear();
    if (rangeBase) rangeBase.forEach((r) => selected.add(r));
    for (let i = a; i <= b; i++) {
      if (visible[i]) selected.add(visible[i]);
    }
    render();
  }

  // ── 포커스 상태 저장/복구 (재렌더 시 사용자 입력 보존) ──
  function saveFocusState() {
    const active = document.activeElement;
    if (!active || !active.matches(".cell-input")) return null;
    if (!tbody.contains(active)) return null;
    const tr = active.closest("tr");
    if (!tr) return null;
    return {
      rowId: tr.dataset.rowId || "",
      colIndex: active.dataset.col,
      value: active.value,
      selectionStart: active.selectionStart,
      selectionEnd: active.selectionEnd,
    };
  }
  function restoreFocusState(state) {
    if (!state) return;
    // 1) rowId 로 우선 매칭
    let tr = null;
    if (state.rowId) {
      tr = tbody.querySelector(`tr[data-row-id="${cssEscape(state.rowId)}"]`);
    }
    if (!tr) return;
    const input = tr.querySelector(`.cell-input[data-col="${state.colIndex}"]`);
    if (!input) return;
    // 사용자가 입력 중이던 미커밋 값 복원
    input.value = state.value;
    input.focus();
    try {
      input.setSelectionRange(state.selectionStart, state.selectionEnd);
    } catch {}
  }

  function render() {
    const focusState = saveFocusState();
    // tbody 를 비우면 콘텐츠 높이가 0이 돼 브라우저가 scrollTop 을 0으로 리셋함 →
    // 재구성 후 원래 스크롤 위치를 복원 (가상 스크롤 필수).
    const keepScrollTop = scroll.scrollTop;
    const vpRaw = scroll.clientHeight; // tbody 비우기 전 실제 뷰포트 높이 (비운 뒤엔 헤더 높이로 줄어듦)

    thead.querySelectorAll("th").forEach((th) => {
      const k = th.dataset.colKey;
      const icon = th.querySelector(".sort-icon");
      if (!icon || !k) return;
      if (sortState.key !== k || sortState.dir === 0) icon.textContent = "";
      else icon.textContent = sortState.dir > 0 ? " ▲" : " ▼";
    });

    tbody.innerHTML = "";
    const visible = visibleRows();

    if (selectable) {
      const headCb = thead.querySelector(".header-checkbox");
      const allSel = visible.length > 0 && visible.every((r) => selected.has(r));
      const someSel = visible.some((r) => selected.has(r));
      headCb.checked = allSel;
      headCb.indeterminate = !allSel && someSel;
    }

    if (visible.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = totalCols();
      td.className = "grid-empty";
      td.textContent = emptyText || (filterText
        ? "검색 결과가 없습니다."
        : "데이터가 없습니다. 행 추가 또는 엑셀에서 붙여넣기 (Ctrl+V).");
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else if (!virtualize) {
      // 비가상: 전체 행 렌더 (PACK/PICK/FLOW/공유 — 기존 동작 그대로)
      visible.forEach((row, i) => tbody.appendChild(renderRow(row, i)));
    } else {
      // ── 가상 스크롤: 뷰포트에 보이는 행 + overscan 만 렌더 ──
      const total = visible.length;
      const h = rowH || 34;
      // vpRaw 는 tbody 비우기 전 측정값. 너무 작으면(첫 페인트/빈 컨테이너) 창 높이로 폴백.
      const vpH = vpRaw >= h * 2 ? vpRaw : (window.innerHeight || 600);
      // keepScrollTop 사용 — tbody.innerHTML="" 직후 scroll.scrollTop 은 0으로 리셋됐기 때문
      let start = Math.max(0, Math.floor(keepScrollTop / h) - OVERSCAN);
      const count = Math.ceil(vpH / h) + OVERSCAN * 2;
      if (start + count > total) start = Math.max(0, total - count);
      const end = Math.min(total, start + count);

      if (start > 0) tbody.appendChild(spacerRow(start * h));
      for (let i = start; i < end; i++) {
        tbody.appendChild(renderRow(visible[i], i));
      }
      if (end < total) tbody.appendChild(spacerRow((total - end) * h));
      lastWin = { start, end };
    }
    if (visible.length === 0) lastWin = { start: 0, end: 0 };

    // 스페이서로 전체 높이 복원됐으니 원래 스크롤 위치로 되돌림
    if (scroll.scrollTop !== keepScrollTop) scroll.scrollTop = keepScrollTop;

    if (selected.size > 0) {
      selBar.style.display = "";
      selBar.querySelector(".sel-count").textContent = `${selected.size}개 행 선택됨`;
    } else {
      selBar.style.display = "none";
    }

    restoreFocusState(focusState);

    // 첫 페인트 후 실제 행 높이 1회 측정 — 추정치와 다르면 한 번만 다시 그림 (가상 스크롤 전용)
    if (virtualize && !rowHMeasured) {
      const sample = tbody.querySelector("tr[data-vindex]");
      if (sample) {
        const measured = sample.offsetHeight;
        rowHMeasured = true;
        if (measured && Math.abs(measured - (rowH || 34)) > 1) { rowH = measured; render(); return; }
        rowH = measured || rowH || 34;
      }
    }
  }

  function renderRow(row, vi) {
    const tr = document.createElement("tr");
    tr.dataset.rowId = row[rowIdKey] ?? "";
    tr.dataset.vindex = vi;
    tr.classList.add(vi % 2 ? "v-odd" : "v-even"); // 가상 스크롤 — nth-child 대신 명시 줄무늬
    if (selected.has(row)) tr.classList.add("row-selected");
    // 검색 중이면 매칭 안 되는 행은 어둡게(반투명) — 검색한 사람만 환하게
    if (hlText) {
      const hasData = !!(row.kucode || row.name);
      const matched = hasData && rowMatchesHl(row);
      tr.classList.toggle("search-dim", !matched);
      if (matched) tr.classList.add("search-hit");
    }

    if (onRowContextMenu) {
      tr.addEventListener("contextmenu", (e) => {
        // 빈 행에서는 메뉴 띄우지 않음
        if (!row.kucode && !selected.has(row)) return;
        e.preventDefault();
        const sel = selected.has(row) ? [...selected] : [row];
        onRowContextMenu(row, sel, e);
      });
    }

    if (selectable) {
      const td = document.createElement("td");
      td.className = "cell-select";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "row-checkbox";
      cb.checked = selected.has(row);

      // ── mousedown: 드래그 범위 선택 모드 시작 ──
      cb.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        if (e.shiftKey && lastClickedIndex >= 0) {
          // Shift+click — 기존 범위 선택
          const [a, b] = [lastClickedIndex, vi].sort((x, y) => x - y);
          const visible = visibleRows();
          for (let i = a; i <= b; i++) selected.add(visible[i]);
          dragMode = "select";
          render();
          e.preventDefault();
          return;
        }
        // 첫 행 토글 + 같은 모드로 드래그 시작
        const willCheck = !cb.checked;
        dragMode = willCheck ? "select" : "deselect";
        if (willCheck) selected.add(row);
        else selected.delete(row);
        lastClickedIndex = vi;
        render();
        e.preventDefault();
      });

      // 클릭 자체는 mousedown 에서 처리하니 click 은 차단 (중복 토글 방지)
      cb.addEventListener("click", (e) => e.preventDefault());

      // ── 드래그 중 다른 행 진입 시 같은 모드로 추가/제거 ──
      tr.addEventListener("mouseenter", () => {
        if (dragMode === "range") { applyDragRange(vi); return; }
        if (dragMode === "select" || dragMode === "deselect") {
          if (dragMode === "select") selected.add(row);
          else selected.delete(row);
          render();
          return;
        }
        // 셀에서 시작한 드래그가 다른 행으로 진입 → 행 범위 선택 모드 발동
        if (pendingDrag && pendingDrag.startVi !== vi) {
          dragMode = "range";
          rangeBase = new Set(selected);
          lastClickedIndex = pendingDrag.startVi;
          wrap.classList.add("drag-selecting"); // 텍스트 선택 방지
          try { window.getSelection()?.removeAllRanges(); } catch {}
          const active = document.activeElement;
          if (active && active.matches?.(".cell-input")) active.blur();
          applyDragRange(vi);
        }
      });

      td.appendChild(cb);
      tr.appendChild(td);
    }

    // ── 셀 아무 곳에서나 드래그 시작 가능 (다른 행으로 넘어가면 범위 선택) ──
    if (selectable) {
      tr.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        if (e.target.closest(".row-checkbox") || e.target.closest(".row-delete")) return;
        pendingDrag = { startVi: vi };
      });
    }

    columns.forEach((col, ci) => {
      const td = document.createElement("td");
      // 중복 표시: row.__dup === true && col.key === 'kucode'
      if (row.__dup && col.key === "kucode") td.classList.add("dup-cell");
      // 검색어 하이라이트
      if (hlText && matchesHl(row, col, hlText)) td.classList.add("hl-cell");
      if (col.type === "rownum") {
        // 행 번호 (표시 전용) — 데이터가 있는 행만 번호 부여
        td.className = "cell-rownum";
        const hasData = !!(row.kucode || row.name);
        td.textContent = hasData ? String(vi + 1).padStart(2, "0") : "";
      } else if (col.type === "multi") {
        td.appendChild(buildMultiCell(row, col));
      } else if (col.type === "label") {
        // 라벨 클래스를 td 자체에 적용 (chip 대신 셀 전체 배경색)
        const info = col.getLabel ? col.getLabel(row) : { html: row[col.key] || "", classes: [] };
        td.classList.add("cell-label-td");
        (info.classes || []).forEach((c) => td.classList.add(c));
        td.appendChild(buildLabelCell(row, col, info));
      } else {
        td.appendChild(buildTextCell(row, col, vi, ci));
      }
      tr.appendChild(td);
    });

    if (canDelete) {
      const td = document.createElement("td");
      td.className = "cell-actions";
      const btn = document.createElement("button");
      btn.className = "row-delete";
      btn.title = "행 삭제";
      btn.textContent = "🗑";
      btn.addEventListener("click", async () => {
        // onDelete 가 직접 confirm 처리하면 그 결과(false)를 신호로 사용
        const result = await onDelete(row);
        if (result === false) return;
        // onDelete 내부에서 confirm 안 했다면 여기서 확인
        if (result === undefined) {
          const ok = await confirmDialog({
            title: "행 삭제", danger: true,
            message: `${row.kucode || row.name || "이 행"}을 삭제할까요?`,
            yes: "삭제", no: "취소",
          });
          if (!ok) return;
        }
        const idx = rows.indexOf(row);
        if (idx >= 0) rows.splice(idx, 1);
        selected.delete(row);
        render();
      });
      td.appendChild(btn);
      tr.appendChild(td);
    }
    return tr;
  }

  function buildTextCell(row, col, vi, ci) {
    const input = document.createElement("input");
    input.className = "cell-input";
    input.type = "text";
    input.value = row[col.key] ?? "";
    input.dataset.col = ci;
    input.dataset.row = vi;
    if (col.readonly) {
      input.readOnly = true;
      input.classList.add("readonly");
      input.tabIndex = -1;
    }
    if (row.__errors && row.__errors[col.key]) {
      input.classList.add("error");
      input.title = row.__errors[col.key];
    }

    // 옵션 자동완성 — col.getOptions(row) 가 배열을 반환하면 커스텀 드롭다운 부착
    if (typeof col.getOptions === "function" && !col.readonly) {
      // 비동기 import 로 그리드 모듈 의존성 가볍게 유지
      import("./autocomplete.js").then((m) => {
        m.attachAutocomplete(input, () => col.getOptions(row));
      }).catch(() => {});
    }

    input.addEventListener("keydown", (e) => onCellKeydown(e, vi, ci));
    input.addEventListener("paste", (e) => onCellPaste(e, vi, ci));
    input.addEventListener("blur", async () => {
      const v = input.value.trim();
      // scanAdvance 칸은 값이 그대로여도(같은 코드 재타각 등) 다음 행으로 내려가도록 처리
      const advance = col.scanAdvance && scanAdvancePending === vi;
      if ((row[col.key] ?? "") === v) {
        if (advance) {
          scanAdvancePending = null;
          setTimeout(() => moveTo(vi + 1, ci, true), 0);
        }
        return;
      }
      const prevSnapshot = { ...row };
      row[col.key] = v;
      const result = await onCommit(row, col.key, v, prevSnapshot);
      if (result?.patch) Object.assign(row, result.patch);
      if (result?.error) {
        row.__errors = { ...(row.__errors || {}), [col.key]: result.error };
      } else if (row.__errors) {
        delete row.__errors[col.key];
      }
      render();
      // 타각 연속 입력: 커밋·재렌더가 끝난 뒤 다음 행 같은 칸으로 포커스 이동
      if (advance) {
        scanAdvancePending = null;
        setTimeout(() => moveTo(vi + 1, ci, true), 0);
      }
    });
    return input;
  }

  function buildLabelCell(row, col, info) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cell-label";
    btn.innerHTML = (info && info.html) || "";
    btn.addEventListener("click", () => {
      if (onLabelClick) onLabelClick(row, col);
    });
    return btn;
  }

  function buildMultiCell(row, col) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cell-multi";
    if (row.__errors && row.__errors[col.key]) {
      btn.classList.add("error");
      btn.title = row.__errors[col.key];
    }
    const renderChips = () => {
      btn.innerHTML = "";
      const arr = row[col.key] || [];
      arr.forEach((v) => {
        const chip = document.createElement("span");
        chip.className = "cell-chip";
        chip.textContent = v;
        btn.appendChild(chip);
      });
    };
    renderChips();
    btn.addEventListener("click", async () => {
      const next = await openMultiSelect(btn, col.options || [], row[col.key] || []);
      const prev = JSON.stringify(row[col.key] || []);
      if (JSON.stringify(next) !== prev) {
        row[col.key] = next;
        await onCommit(row, col.key, next);
        renderChips();
      }
    });
    return btn;
  }

  function onCellKeydown(e, vi, ci) {
    const key = e.key;
    const col = columns[ci];
    if (key === "Enter") {
      e.preventDefault();
      if (col && col.scanAdvance) {
        // 타각/입력 후 Enter → 커밋(blur) 시킨 뒤, blur 핸들러가 다음 행으로 이동
        scanAdvancePending = vi;
        e.target.blur();
      } else {
        moveTo(vi + 1, ci, true);
      }
    } else if (key === "Tab") {
      // 스캐너가 Tab 접미를 보내는 경우에도 다음 행 같은 칸으로 내려가도록
      if (col && col.scanAdvance && !e.shiftKey) {
        e.preventDefault();
        scanAdvancePending = vi;
        e.target.blur();
        return;
      }
      const cols = textColIndices();
      const lastTextCol = cols[cols.length - 1];
      if (!e.shiftKey && ci === lastTextCol && vi === visibleRows().length - 1) {
        e.preventDefault();
        addRowAndFocus(0);
      }
    }
  }

  function moveTo(vi, ci, createIfNeeded = false) {
    const visible = visibleRows();
    if (vi >= visible.length) {
      if (!createIfNeeded) return;
      addRowAndFocus(ci);
      return;
    }
    if (vi < 0) return;
    if (virtualize) ensureIndexVisible(vi); // 창 밖이면 스크롤 + 재렌더 (비가상은 전 행이 이미 DOM)
    const tr = tbody.querySelector(`tr[data-vindex="${vi}"]`);
    if (!tr) return;
    // 정확히 같은 컬럼(data-col)의 편집 가능한 입력칸을 찾는다.
    // (읽기전용 컬럼도 .cell-input 이라 위치 기반 인덱싱은 어긋날 수 있어 data-col 로 직접 매칭)
    let input = tr.querySelector(`.cell-input[data-col="${ci}"]:not(.readonly)`);
    if (!input) {
      const indices = textColIndices();
      const targetCi = indices.includes(ci) ? ci : (indices.length ? indices[0] : ci);
      input = tr.querySelector(`.cell-input[data-col="${targetCi}"]:not(.readonly)`);
    }
    if (input) input.focus();
  }

  function colInputIndex(ci) {
    const indices = textColIndices();
    return indices.indexOf(ci) >= 0 ? indices.indexOf(ci) : 0;
  }

  function textColIndices() {
    return columns
      .map((c, i) => (c.type !== "multi" && c.type !== "label" && c.type !== "rownum" && !c.readonly ? i : null))
      .filter((x) => x !== null);
  }

  function visibleRows() {
    let list = rows.filter((r) => matchesFilter(r));
    if (sortState.key && sortState.dir !== 0) {
      const key = sortState.key;
      const dir = sortState.dir;
      list = list.slice().sort((a, b) => {
        const av = toComparable(a[key]);
        const bv = toComparable(b[key]);
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }
    return list;
  }

  function toComparable(v) {
    if (Array.isArray(v)) v = v.join(",");
    if (v == null) return "";
    const n = Number(v);
    if (!Number.isNaN(n) && /^\s*-?\d+(\.\d+)?\s*$/.test(String(v))) return n;
    return String(v).toLowerCase();
  }

  function toggleSort(key) {
    if (sortState.key !== key) sortState = { key, dir: 1 };
    else if (sortState.dir === 1) sortState = { key, dir: -1 };
    else sortState = { key: null, dir: 0 };
    scroll.scrollTop = 0; // 정렬 바뀌면 맨 위로 — 창이 범위 밖에 머무는 것 방지
    render();
  }

  function addRowAndFocus(ci) {
    const r = makeNewRow();
    rows.push(r);
    render();
    const visible = visibleRows();
    const idx = visible.indexOf(r);
    setTimeout(() => moveTo(idx, ci), 0);
  }

  async function onCellPaste(e, vi, ci) {
    const cb = e.clipboardData;
    if (!cb) return;
    const text = cb.getData("text/plain");
    if (!text) return;
    // 단일 셀 붙여넣기 (탭/줄바꿈 없음) — 브라우저 기본 동작 유지
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();

    // 1) 라인 파싱 — 트레일링 공백 제거 후 앞/뒤 빈 줄 제거.
    //    (엑셀에서 복사할 때 선행 빈 셀/줄바꿈이 포커스 행을 먹어 한 칸 밀리는 문제 방지. 가운데 빈 줄은 유지)
    const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, ""));
    while (lines.length && lines[0].trim() === "") lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    if (!lines.length) return;
    const matrix = lines.map((l) => l.split("\t"));

    // 2) 모든 행에 대해 동기적으로 데이터 입력 후 한 번만 render
    // 시작 시점의 visible 스냅샷을 1회 캡처 — 정렬/필터 활성 시에도 대상 행이 어긋나지 않음
    const baseVisible = visibleRows();
    const targets = []; // { row, fields: [{key, value}] }
    for (let r = 0; r < matrix.length; r++) {
      const targetVi = vi + r;
      let row;
      if (targetVi < baseVisible.length) row = baseVisible[targetVi];
      else { row = makeNewRow(); rows.push(row); }

      const fields = [];
      for (let c = 0; c < matrix[r].length; c++) {
        const colIdx = ci + c;
        const col = columns[colIdx];
        if (!col || col.readonly || col.type === "label") continue;
        const raw = matrix[r][c].trim();
        let val;
        if (col.type === "multi") {
          val = raw.split(/[,/·]/).map((s) => s.trim()).filter((s) => col.options.includes(s));
        } else {
          val = raw;
        }
        row[col.key] = val;
        fields.push({ key: col.key, value: val });
      }
      if (fields.length) targets.push({ row, fields });
    }

    if (!targets.length) return;

    // 3) 즉시 한 번 render — 사용자에게 값이 들어간 모습 보이기
    render();

    // 4) 모든 commit 을 병렬로 실행 (각 row 의 first field 만 보내면 onCommit 이 row 전체 저장하므로 키는 kucode 우선)
    //    중복 commit 방지 — 각 row 당 한 번만 commit (kucode 또는 첫 비-readonly 키)
    const opts = { bulk: true, totalRows: targets.length };
    const commits = targets.map(({ row, fields }, idx) => {
      // 첫 필드만 commit — onCommit 은 row 전체를 처리
      const f = fields.find((x) => x.key === "kucode") || fields[0];
      const isLast = idx === targets.length - 1;
      return Promise.resolve(onCommit(row, f.key, f.value, { ...row }, { ...opts, isLast }))
        .then((result) => ({ row, key: f.key, result }))
        .catch((err) => ({ row, key: f.key, result: { error: String(err?.message || err) } }));
    });
    const results = await Promise.all(commits);

    // 5) 결과 패치 적용
    for (const { row, key, result } of results) {
      if (result?.patch) Object.assign(row, result.patch);
      if (result?.error) {
        row.__errors = { ...(row.__errors || {}), [key]: result.error };
      } else if (row.__errors) {
        delete row.__errors[key];
      }
    }

    // 6) 최종 render
    render();

    // 7) bulk 완료 알림 — 부모(예: pack-pick-grid)가 dup/총계 등 일괄 갱신
    if (typeof onBulkPasteEnd === "function") {
      try { onBulkPasteEnd(targets.map((t) => t.row)); } catch (e) { console.warn(e); }
    }
  }

  // keysArg 지정 시 그 컬럼만 복사 (쿠코드만 / 쿠코드|성함). 미지정 시 copyKeys 또는 전체.
  function copySelection(keysArg) {
    if (selected.size === 0) return;
    const visible = visibleRows();
    const orderedRows = visible.filter((r) => selected.has(r));
    const keys = (keysArg && keysArg.length)
      ? keysArg
      : (copyKeys && copyKeys.length)
        ? copyKeys
        : columns.filter((c) => c.type !== "multi" && c.type !== "label").map((c) => c.key);
    const tsv = orderedRows
      .map((r) => keys.map((k) => {
        const v = r[k];
        if (Array.isArray(v)) return v.join(",");
        return v == null ? "" : String(v);
      }).join("\t"))
      .join("\n");
    if (!tsv) return;
    navigator.clipboard?.writeText(tsv).then(
      () => flashCopied(), () => fallbackCopy(tsv)
    );
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flashCopied(); }
    finally { ta.remove(); }
  }

  function flashCopied() {
    selBar.querySelector(".sel-count").textContent = "✅ 클립보드에 복사됨";
    setTimeout(() => {
      if (selected.size > 0)
        selBar.querySelector(".sel-count").textContent = `${selected.size}개 행 선택됨`;
    }, 1200);
  }

  function matchesFilter(row) {
    if (!filterText) return true;
    const t = filterText.toLowerCase();
    return columns.some((c) => {
      const v = row[c.key];
      if (Array.isArray(v)) return v.join(" ").toLowerCase().includes(t);
      return String(v ?? "").toLowerCase().includes(t);
    });
  }

  // 콤마(,)로 여러 검색어 — 하나라도 매칭되면 hit
  function hlTermList(hl) {
    return String(hl ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  function matchesHl(row, col, hl) {
    const terms = hlTermList(hl);
    if (!terms.length) return false;
    const v = row[col.key];
    const s = (Array.isArray(v) ? v.join(" ") : String(v ?? "")).toLowerCase();
    return terms.some((t) => s.includes(t));
  }
  function rowMatchesHl(row) {
    const terms = hlTermList(hlText);
    if (!terms.length) return true;
    return terms.some((t) =>
      columns.some((c) => {
        const v = row[c.key];
        const s = (Array.isArray(v) ? v.join(" ") : String(v ?? "")).toLowerCase();
        return s.includes(t);
      })
    );
  }

  // CSS.escape 폴리필 (구형 브라우저 호환)
  function cssEscape(s) {
    if (window.CSS?.escape) return CSS.escape(s);
    return String(s).replace(/["\\]/g, "\\$&");
  }

  // 한 행이 입력 중인지 확인 (active input 이 그 행 안에 있음)
  function isRowFocused(row) {
    const id = row[rowIdKey];
    const tr = tbody.querySelector(`tr[data-row-id="${cssEscape(String(id ?? ""))}"]`);
    if (!tr) return false;
    return tr.contains(document.activeElement);
  }

  render();

  return {
    addRow() { addRowAndFocus(0); },
    setRows(newRows) {
      rows = newRows.slice();
      selected.clear();
      lastClickedIndex = -1;
      render();
    },
    getRows() { return rows.slice(); },
    getSelected() { return [...selected]; },
    clearSelection() { selected.clear(); render(); },
    setFilter(text) { filterText = text || ""; scroll.scrollTop = 0; render(); },
    setHighlight(text) { hlText = text || ""; render(); },
    refresh() { render(); },

    // ── 실시간 협업: 한 행만 patch (포커스/미커밋 보존) ──
    patchRow(id, partial) {
      const key = String(id ?? "");
      const row = rows.find((r) => String(r[rowIdKey] ?? "") === key);
      if (!row) return false;
      // 입력 중인 행은 데이터만 머지 (사용자가 blur 시 합쳐서 commit)
      if (isRowFocused(row)) {
        for (const [k, v] of Object.entries(partial || {})) {
          // 사용자가 직접 입력 중인 컬럼은 절대 덮어쓰지 않음
          const active = document.activeElement;
          const ci = active?.dataset?.col;
          const col = ci != null ? columns[Number(ci)] : null;
          if (col && col.key === k) continue;
          row[k] = v;
        }
        render();
        return true;
      }
      Object.assign(row, partial || {});
      render();
      return true;
    },
    insertRow(rowData, atIndex) {
      const id = rowData?.[rowIdKey];
      if (id != null) {
        const exist = rows.find((r) => String(r[rowIdKey] ?? "") === String(id));
        if (exist) return false; // 이미 있음
      }
      if (atIndex == null) rows.push(rowData);
      else rows.splice(atIndex, 0, rowData);
      render();
      return true;
    },
    removeRow(id) {
      const key = String(id ?? "");
      const idx = rows.findIndex((r) => String(r[rowIdKey] ?? "") === key);
      if (idx < 0) return false;
      const row = rows[idx];
      // 입력 중인 행은 삭제하지 않음 (다음 동기화 때 다시 처리)
      if (isRowFocused(row)) return false;
      rows.splice(idx, 1);
      selected.delete(row);
      render();
      return true;
    },
    findRow(id) {
      const key = String(id ?? "");
      return rows.find((r) => String(r[rowIdKey] ?? "") === key) || null;
    },

    destroy() {
      document.removeEventListener("keydown", onCopyKey);
      document.removeEventListener("keydown", onDeleteKey);
      document.removeEventListener("mouseup", onMouseUp);
      scroll.removeEventListener("scroll", onGridScroll);
      if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = null; }
      try { wrap.remove(); } catch {}
    },
  };
}
