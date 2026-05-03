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
    makeNewRow = () => ({}),
    emptyText = null,
  } = opts;

  let rows = initialRows.slice();
  let filterText = "";
  let sortState = { key: null, dir: 1 };
  const selected = new Set();
  let lastClickedIndex = -1;

  const wrap = document.createElement("div");
  wrap.className = "grid-wrap";

  const selBar = document.createElement("div");
  selBar.className = "grid-selection-bar";
  selBar.style.display = "none";
  selBar.innerHTML = `
    <span class="sel-count">0 행 선택됨</span>
    <button class="btn primary sel-copy">📋 복사 (Ctrl+C)</button>
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

  selBar.querySelector(".sel-copy").addEventListener("click", () => copySelection());
  selBar.querySelector(".sel-clear").addEventListener("click", () => {
    selected.clear();
    render();
  });

  function onCopyKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "c") return;
    if (selected.size === 0) return;
    const sel = window.getSelection?.()?.toString();
    if (sel && sel.length > 0) return;
    e.preventDefault();
    copySelection();
  }
  document.addEventListener("keydown", onCopyKey);

  function render() {
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
  }

  function renderRow(row, vi) {
    const tr = document.createElement("tr");
    tr.dataset.rowId = row[rowIdKey] ?? "";
    if (selected.has(row)) tr.classList.add("row-selected");

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
      cb.addEventListener("click", (e) => {
        if (e.shiftKey && lastClickedIndex >= 0) {
          const [a, b] = [lastClickedIndex, vi].sort((x, y) => x - y);
          const visible = visibleRows();
          for (let i = a; i <= b; i++) selected.add(visible[i]);
          render();
          e.preventDefault();
          return;
        }
        if (cb.checked) selected.add(row);
        else selected.delete(row);
        lastClickedIndex = vi;
        render();
      });
      td.appendChild(cb);
      tr.appendChild(td);
    }

    columns.forEach((col, ci) => {
      const td = document.createElement("td");
      // 중복 표시: row.__dup === true && col.key === 'kucode'
      if (row.__dup && col.key === "kucode") td.classList.add("dup-cell");
      if (col.type === "multi") {
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

    input.addEventListener("keydown", (e) => onCellKeydown(e, vi, ci));
    input.addEventListener("paste", (e) => onCellPaste(e, vi, ci));
    input.addEventListener("blur", async () => {
      const v = input.value.trim();
      if ((row[col.key] ?? "") === v) return;
      row[col.key] = v;
      const result = await onCommit(row, col.key, v);
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
      .map((c, i) => (c.type !== "multi" && c.type !== "label" && !c.readonly ? i : null))
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
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return;
    e.preventDefault();

    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length > 0);
    const matrix = lines.map((l) => l.split("\t"));

    const startRow = vi;
    const startCol = ci;

    for (let r = 0; r < matrix.length; r++) {
      const targetVi = startRow + r;
      let row;
      const visible = visibleRows();
      if (targetVi < visible.length) row = visible[targetVi];
      else { row = makeNewRow(); rows.push(row); }
      for (let c = 0; c < matrix[r].length; c++) {
        const colIdx = startCol + c;
        const col = columns[colIdx];
        if (!col || col.readonly || col.type === "label") continue;
        const raw = matrix[r][c].trim();
        if (col.type === "multi") {
          row[col.key] = raw
            .split(/[,/·]/)
            .map((s) => s.trim())
            .filter((s) => col.options.includes(s));
        } else {
          row[col.key] = raw;
        }
        await onCommit(row, col.key, row[col.key]);
      }
    }
    render();
  }

  function copySelection() {
    if (selected.size === 0) return;
    const visible = visibleRows();
    const orderedRows = visible.filter((r) => selected.has(r));
    const keys = (copyKeys && copyKeys.length)
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
    refresh() { render(); },
    destroy() { document.removeEventListener("keydown", onCopyKey); },
  };
}
