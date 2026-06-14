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
    onRowContextMenu = null,
    onLabelClick = null,
    onBulkPasteEnd = null,        // (pastedRows) => void — paste 완료 후 일괄 작업용
    makeNewRow = () => ({}),
    emptyText = null,
    highlightText = "",
  } = opts;

  let rows = initialRows.slice();
  let filterText = "";
  let hlText = highlightText || "";
  let sortState = { key: null, dir: 1 };
  const selected = new Set();
  let lastClickedIndex = -1;
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
  selBar.innerHTML = `
    <span class="sel-count">0 행 선택됨</span>
    <button class="btn primary sel-copy-kn" title="쿠코드 + 성함 (Ctrl+C)">📋 쿠코드 | 성함</button>
    <button class="btn ghost sel-copy-ku" title="쿠코드만">📋 쿠코드만</button>
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

  selBar.querySelector(".sel-copy-kn").addEventListener("click", () => copySelection(["kucode", "name"]));
  selBar.querySelector(".sel-copy-ku").addEventListener("click", () => copySelection(["kucode"]));
  selBar.querySelector(".sel-clear").addEventListener("click", () => {
    selected.clear();
    render();
  });

  function onCopyKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "c") return;
    if (selected.size === 0) return;
    if (!wrap.isConnected) return; // 다른 탭으로 전환된 그리드는 무시
    const sel = window.getSelection?.()?.toString();
    if (sel && sel.length > 0) return;
    e.preventDefault();
    copySelection(["kucode", "name"]); // 기본: 쿠코드 | 성함
  }
  document.addEventListener("keydown", onCopyKey);

  // 드래그 종료 — 마우스가 그리드 밖으로 나가도 끝나도록 document 에 등록
  function onMouseUp() {
    dragMode = null;
    pendingDrag = null;
    rangeBase = null;
    wrap.classList.remove("drag-selecting");
  }
  document.addEventListener("mouseup", onMouseUp);

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
      td.colSpan =
        columns.length + (canDelete ? 1 : 0) + (selectable ? 1 : 0);
      td.className = "grid-empty";
      td.textContent = emptyText || (filterText
        ? "검색 결과가 없습니다."
        : "데이터가 없습니다. 행 추가 또는 엑셀에서 붙여넣기 (Ctrl+V).");
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      visible.forEach((row, vi) => {
        const tr = renderRow(row, vi);
        tbody.appendChild(tr);
      });
    }

    if (selected.size > 0) {
      selBar.style.display = "";
      selBar.querySelector(".sel-count").textContent = `${selected.size}개 행 선택됨`;
    } else {
      selBar.style.display = "none";
    }

    restoreFocusState(focusState);
  }

  function renderRow(row, vi) {
    const tr = document.createElement("tr");
    tr.dataset.rowId = row[rowIdKey] ?? "";
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
      if ((row[col.key] ?? "") === v) return;
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
    if (key === "Enter") {
      e.preventDefault();
      moveTo(vi + 1, ci, true);
    } else if (key === "Tab") {
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
    const tr = tbody.children[vi];
    if (!tr) return;
    const inputs = tr.querySelectorAll(".cell-input");
    const idx = colInputIndex(ci);
    if (inputs[idx]) inputs[idx].focus();
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

    // 1) 라인 파싱 — 끝 줄바꿈으로 인한 빈 줄 제거, 단 모든 셀이 비어도 살리진 않음
    const lines = text.replace(/\r/g, "").split("\n")
      .map((l) => l.replace(/\s+$/, ""))           // 트레일링 공백 제거
      .filter((l, idx, arr) => l.length > 0 || (idx < arr.length - 1)); // 마지막만 빈 줄이면 버림
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
    setFilter(text) { filterText = text || ""; render(); },
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
      document.removeEventListener("mouseup", onMouseUp);
      try { wrap.remove(); } catch {}
    },
  };
}
