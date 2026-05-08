// PACK / PICK 공통 — 라인/층 단위로 EditableGrid 카드 가로 스트립.
// 25행 기본, 중복값 표시, Pack>/Pick> 우클릭 서브메뉴, 사이트 톤 confirm,
// audit log 기록, Firebase 실시간 onSnapshot.

import { createGrid } from "./grid.js";
import { openContextMenu } from "./context-menu.js";
import { buildMemberLabel, autofillFromMaster } from "./member-label.js";
import { openMemberCard } from "./member-card.js";
import { confirmDialog } from "./dialog.js";
import { openAuditPanel } from "./audit-panel.js";
import { listOps, upsertOps, deleteOps, subscribeOps, logAudit, upsertShare, deleteShare, listShare } from "../db.js";
import { showToast } from "../toast.js";
import { getSession } from "../auth.js";
import { markEditing, unmarkEditing, subscribeEditing } from "./editing-presence.js";

const DEFAULT_ROWS = 25;

// PACK / PICK 그룹 정의를 한 곳에서 공유 (서브메뉴 만들 때 사용)
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
export const PICK_GROUPS_DEF = [
  { id: "6.1F",       label: "6.1F",        variant: "floor", subs: ["싱귤", "멀티"] },
  { id: "6.3F",       label: "6.3F",        variant: "floor", subs: ["싱귤", "멀티"] },
  { id: "AGV (7.1F)", label: "AGV (7.1F)",  variant: "floor", subs: ["싱귤", "멀티"] },
  { id: "7.2F",       label: "7.2F",        variant: "floor", subs: ["싱귤", "멀티"] },
  { id: "7.3F",       label: "7.3F",        variant: "floor", subs: ["싱귤", "멀티"] },
  { id: "8F",         label: "8F",          variant: "floor", subs: ["오더피커", "8.1", "8.2", "8.3"] },
];

export function renderPackPickStrip(opts) {
  const {
    container, kind, shift, date, groups, memberIndex,
    onCountChange = () => {},
  } = opts;

  container.innerHTML = "";

  const layout = document.createElement("div");
  layout.className = "pp-layout";

  // 좌측 사이드 — 그룹 표시 토글
  const side = document.createElement("aside");
  side.className = "pp-side";
  const sideTitle = document.createElement("div");
  sideTitle.className = "side-nav-title";
  sideTitle.textContent = (kind === "pack" ? "PACK 라인" : "PICK 층");
  side.appendChild(sideTitle);

  const visibility = new Map();
  const visKey = (g, s) => `${g}::${s || "_"}`;

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
      g.subs.forEach((s) => side.appendChild(makeVisToggle(g.id, s, `${g.label} · ${s}`)));
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

  const cards = [];
  let allRows = [];
  let unsub = null;

  async function reload() {
    allRows = await listOps(shift, kind, date);
    markAllDuplicates(allRows, cards);
    rerender();
  }

  // 실시간 구독
  (async () => {
    unsub = await subscribeOps(shift, kind, date, (rows) => {
      allRows = rows;
      markAllDuplicates(allRows, cards);
      rerender();
    });
  })();

  function rerender() {
    // 기존 카드들의 editing subscription 해제
    cards.forEach((c) => { if (c.unsubEditing) try { c.unsubEditing(); } catch {} });
    strip.innerHTML = "";
    cards.length = 0;
    groups.forEach((g) => {
      if (g.subs) g.subs.forEach((s) => { const c = makeCard(g, s); strip.appendChild(c.el); cards.push(c); });
      else { const c = makeCard(g, null); strip.appendChild(c.el); cards.push(c); }
    });
    applyVisibility();
    refreshTotals();
  }

  function makeCard(group, sub) {
    const el = document.createElement("section");
    el.className = `pp-card variant-${group.variant || "default"}`;
    el.dataset.gid = group.id;
    if (sub) el.dataset.sub = sub;

    const head = document.createElement("header");
    head.className = "pp-card-head";

    const title = document.createElement("div");
    title.className = "pp-card-title";
    title.innerHTML = `
      <span class="pp-card-name">${escape(group.label)}${sub ? ` · ${escape(sub)}` : ""}</span>
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

    const grid = createGrid({
      container: body,
      columns: columnDef(memberIndex),
      rows: groupRows,
      canDelete: true,
      selectable: true,
      copyKeys: ["kucode", "name", "team"],
      makeNewRow: () => ({ id: "" }),
      emptyText: "쿠코드를 입력하거나 엑셀에서 붙여넣으세요.",
      onCommit: async (row, key, value) => {
        const ku = String(row.kucode || "").trim();

        // ── 쿠코드를 비우면 → 이름/조 클리어 + 행을 DB에서 삭제 ──
        if (key === "kucode" && !ku) {
          if (row.id) {
            try { await deleteOps(shift, kind, row.id); } catch {}
            // 공유 시트에서도 같은 사람 제거
            try { await deleteShareByKucode(shift, kind, row.kucode || row.name); } catch {}
            await logAudit({
              shift, scope: `ops:${kind}`, target: row.name || "(unknown)",
              action: "delete", by: getSession()?.nickname,
              before: sanitize(row), detail: "쿠코드 비움",
            });
            const idx = allRows.indexOf(row);
            if (idx >= 0) allRows.splice(idx, 1);
          }
          row.id = "";
          row.name = "";
          row.team = "";
          row.__dup = false;        // 명시적 reset (빈 행이 됨)
          markAllDuplicates(allRows, cards);
          cards.forEach((c) => c.gridApi.refresh());
          refreshTotals();
          return { patch: { name: "", team: "" } };
        }
        if (!ku) return {};

        if (key === "kucode") {
          const fill = autofillFromMaster(memberIndex, ku);
          if (fill) { row.name = fill.name || ""; row.team = fill.team || ""; }
          else { row.name = ""; row.team = ""; return { error: "DATA에 없는 쿠코드입니다." }; }
        }
        const before = row.id ? { ...sanitize(row) } : null;
        row.date = date;
        row.line  = (kind === "pack") ? group.id : undefined;
        row.floor = (kind === "pick") ? group.id : undefined;
        row.subType = sub || null;
        const isCreate = !row.id;
        const id = await upsertOps(shift, kind, row.id, sanitize(row));
        row.id = id;
        // ── 공유 시트 자동 동기화 (kucode 를 docId 로 사용) ──
        // PICK 의 경우 sub(싱귤/멀티/8.1 등)는 공유 보드에 의미 없으니 group.id 만 사용.
        try {
          await upsertShare(shift, kind, ku, {
            kucode: ku,
            name: row.name || "",
            team: row.team || "",
            group: group.id,
          });
        } catch (e) { console.warn("share sync failed", e); }

        await logAudit({
          shift, scope: `ops:${kind}`, target: ku,
          action: isCreate ? "create" : "update",
          by: getSession()?.nickname,
          before, after: sanitize(row),
        });
        if (isCreate && !allRows.includes(row)) allRows.push(row);
        markAllDuplicates(allRows, cards);
        cards.forEach((c) => c.gridApi.refresh());
        refreshTotals();
        return { patch: { name: row.name, team: row.team } };
      },
      onDelete: async (row) => {
        const ok = await confirmDialog({
          title: "행 삭제", danger: true,
          message: `${row.name || row.kucode} (${group.label}${sub ? " · " + sub : ""})\n행을 삭제할까요?`,
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
        const idx = allRows.indexOf(row);
        if (idx >= 0) allRows.splice(idx, 1);
        refreshTotals();
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
              label: `${g.label} · ${s}`, icon: "→",
              onClick: () => moveRows(filteredSel.length ? filteredSel : [row], "pick", g.id, s),
            }))),
          },
          { divider: true },
          { label: "복사 (쿠코드/성함/조)", icon: "📋", onClick: () => copyTSV(filteredSel.length ? filteredSel : [row]) },
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
                if (r.id) await deleteOps(shift, kind, r.id);
                await logAudit({ shift, scope: `ops:${kind}`, target: r.kucode, action: "delete", by: getSession()?.nickname, before: sanitize(r) });
              }
              showToast(`${target.length}개 삭제`, "success");
              await reload();
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

    // 25행 기본 — 빈 카드 또는 행 수가 부족할 경우
    if (groupRows.length < DEFAULT_ROWS) {
      const filler = [];
      for (let i = 0; i < DEFAULT_ROWS - groupRows.length; i++) filler.push({ id: "" });
      grid.setRows([...groupRows, ...filler]);
    }

    addBtn.addEventListener("click", () => grid.addRow());

    // ── 입력 중 인디케이터 (RTDB) ──
    const scope = `ops:${kind}:${group.id}${sub ? ":" + sub : ""}`;
    const editingBadge = document.createElement("span");
    editingBadge.className = "editing-badge";
    head.appendChild(editingBadge);

    // 본인 입력: focus 시 mark, blur 시 unmark
    let blurTimer = null;
    body.addEventListener("focusin", (e) => {
      if (!e.target.matches(".cell-input")) return;
      clearTimeout(blurTimer);
      markEditing(scope).catch(() => {});
    });
    body.addEventListener("focusout", (e) => {
      if (!e.target.matches(".cell-input")) return;
      clearTimeout(blurTimer);
      // 다른 셀로 이동했을 수도 있으니 잠깐 대기 후 정리
      blurTimer = setTimeout(() => {
        // 본인이 더 이상 grid 안 셀에 포커스 없을 때만 unmark
        if (!body.contains(document.activeElement)) {
          unmarkEditing(scope).catch(() => {});
        }
      }, 250);
    });

    // 다른 사용자 편집 구독
    subscribeEditing(scope, (others) => {
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
    }).then((un) => { card.unsubEditing = un; });

    return card;
  }

  function applyVisibility() {
    cards.forEach((c) => {
      const k = visKey(c.groupId, c.subId);
      const vis = visibility.get(k) !== false;
      c.el.style.display = vis ? "" : "none";
    });
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
        const newId = await upsertOps(shift, targetKind, null, newRow);
        // 메모리 캐시도 즉시 정리: allRows 에서 옛 row 제거
        const idx = allRows.indexOf(row);
        if (idx >= 0) allRows.splice(idx, 1);
        // 옛 kind 의 share 도 정리 후 새 kind 의 share 갱신
        if (ku) {
          try { await deleteShareByKucode(shift, kind, ku); } catch {}
          try {
            await upsertShare(shift, targetKind, ku, {
              kucode: ku, name: newRow.name || "", team: newRow.team || "",
              group: targetGroup,
            });
          } catch {}
        }
      } else {
        // 같은 kind 안 이동 — line/floor/subType 만 갱신 (docId 그대로)
        row.line  = (targetKind === "pack") ? targetGroup : null;
        row.floor = (targetKind === "pick") ? targetGroup : null;
        row.subType = targetSub || null;
        await upsertOps(shift, targetKind, row.id, sanitize(row));
        // 공유도 갱신
        if (ku) {
          try {
            await upsertShare(shift, targetKind, ku, {
              kucode: ku, name: row.name || "", team: row.team || "",
              group: targetGroup,
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
    // 강제 재로드 (race condition 방지)
    await reload();
    setTimeout(() => reload(), 60);
  }

  // 같은 kucode 의 share row 들을 모두 삭제 (개수 적음)
  async function deleteShareByKucode(shiftV, kindV, kucodeV) {
    const list = await listShare(shiftV, kindV);
    const targets = list.filter((r) => String(r.kucode) === String(kucodeV) || String(r.id) === String(kucodeV));
    for (const r of targets) await deleteShare(shiftV, kindV, r.id);
  }

  function copyTSV(rows) {
    const tsv = rows.map((r) => [r.kucode, r.name, r.team || ""].join("\t")).join("\n");
    navigator.clipboard?.writeText(tsv);
    showToast("복사 완료", "success");
  }

  reload();

  return {
    reload,
    destroy() { if (unsub) unsub(); },
  };
}

// 모든 행에서 같은 kucode 가 2회 이상이면 __dup = true.
// 빈 행 / 데이터 없는 행도 __dup=false 로 반드시 reset.
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

// 카드 안의 모든 grid rows (빈 행 포함) 까지 dup 검사
// — allRows 에 빠진 행도 __dup=false 로 reset 되어야 ⚠️ 표시가 사라짐
function markAllDuplicates(allRows, cards) {
  const all = new Set(allRows || []);
  (cards || []).forEach((c) => {
    if (!c?.gridApi) return;
    c.gridApi.getRows().forEach((r) => all.add(r));
  });
  markDuplicates([...all]);
}

function columnDef(memberIndex) {
  return [
    { key: "kucode", label: "쿠코드", type: "text",  width: "84px" },
    {
      key: "name", label: "성함", type: "label", width: "150px",
      getLabel: (row) => buildMemberLabel(memberIndex && memberIndex.map.get(String(row.kucode)), row.name),
    },
    { key: "team", label: "조", type: "text", readonly: true, width: "52px" },
    { key: "note", label: "비고", type: "text" },
  ];
}

function sanitize(row) {
  const { __errors, __dup, ...rest } = row;
  return rest;
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
