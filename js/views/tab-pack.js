// PACK 탭 — 오토백 / 메뉴얼 라인 카드 스트립 + W/S + 일괄 중복 제거.

import { renderPackPickStrip, PACK_GROUPS_DEF } from "../components/pack-pick-grid.js";
import { buildMemberIndex } from "../components/member-label.js";
import { renderWSTable } from "./tab-ws.js";
import { confirmDialog } from "../components/dialog.js";
import { listOps, deleteOps, logAudit } from "../db.js";
import { getSession } from "../auth.js";
import { showToast } from "../toast.js";

export async function renderPackTab(root, ctx) {
  root.innerHTML = "";
  const { shift } = ctx;

  const head = document.createElement("div");
  head.className = "tab-head";

  const title = document.createElement("div");
  title.className = "tab-head-title";
  title.innerHTML = `<span class="tab-head-icon">📦</span> PACK <small class="tab-head-sub">포장</small>`;
  head.appendChild(title);

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "date-input";
  dateInput.value = todayStr();
  head.appendChild(dateInput);

  const totalChip = document.createElement("span");
  totalChip.className = "total-chip";
  totalChip.textContent = "총 0명";
  head.appendChild(totalChip);

  const dedupeBtn = document.createElement("button");
  dedupeBtn.className = "btn dedupe-btn";
  dedupeBtn.innerHTML = "🧹 중복값 일괄 삭제";
  dedupeBtn.title = "중복 쿠코드 행 중 가장 마지막에 입력된 1개만 남기고 모두 삭제";
  head.appendChild(dedupeBtn);
  root.appendChild(head);

  const wsWrap = document.createElement("section");
  wsWrap.className = "ws-wrap";
  const wsHead = document.createElement("button");
  wsHead.type = "button";
  wsHead.className = "ws-head";
  wsHead.innerHTML = `<span>💧 W/S 워터 — PACK</span><span class="ws-toggle">▾</span>`;
  wsWrap.appendChild(wsHead);
  const wsBody = document.createElement("div");
  wsBody.className = "ws-body";
  wsWrap.appendChild(wsBody);
  wsHead.addEventListener("click", () => {
    wsWrap.classList.toggle("collapsed");
    wsHead.querySelector(".ws-toggle").textContent =
      wsWrap.classList.contains("collapsed") ? "▸" : "▾";
  });
  root.appendChild(wsWrap);

  const stripHost = document.createElement("div");
  root.appendChild(stripHost);

  // PACK 탭 진입 시 항상 최신 마스터로 새로 빌드 (DATA 변경이 즉시 반영되도록)
  const memberIndex = await buildMemberIndex(shift, true);

  let stripApi = null, wsApi = null;
  let mainCount = 0, wsCount = 0;
  const refresh = () => totalChip.textContent = `총 ${mainCount + wsCount}명`;

  function build() {
    const date = dateInput.value || todayStr();
    stripApi = renderPackPickStrip({
      container: stripHost, kind: "pack", shift, date,
      groups: PACK_GROUPS_DEF, memberIndex,
      onCountChange: (t) => { mainCount = t.total; refresh(); },
    });
    wsApi = renderWSTable({
      container: wsBody, kind: "pack", shift, date, memberIndex,
      onCountChange: (n) => { wsCount = n; refresh(); },
    });
  }

  dateInput.addEventListener("change", () => {
    if (stripApi?.destroy) stripApi.destroy();
    stripHost.innerHTML = "";
    wsBody.innerHTML = "";
    build();
  });

  dedupeBtn.addEventListener("click", () =>
    runBulkDedupe(shift, "pack", dateInput.value || todayStr(), async () => {
      if (stripApi?.destroy) stripApi.destroy();
      stripHost.innerHTML = "";
      wsBody.innerHTML = "";
      build();
      // 신규 stripApi 생성 후 한번 더 강제 reload
      setTimeout(() => stripApi?.reload && stripApi.reload(), 50);
    })
  );

  build();
}

// 일괄 중복 제거 — 같은 kucode 가 여러 곳에 있으면 가장 최근(updatedAt)만 남김
async function runBulkDedupe(shift, kind, date, refresh) {
  const all = await listOps(shift, kind, date);
  // kucode 기준 그룹화
  const groups = new Map();
  all.forEach((r) => {
    const k = String(r.kucode || "").trim();
    if (!k) return;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });
  const toDelete = [];
  groups.forEach((arr, ku) => {
    if (arr.length <= 1) return;
    arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    // 가장 최근 1개를 유지하고 나머지는 삭제
    arr.slice(1).forEach((r) => toDelete.push(r));
  });
  if (toDelete.length === 0) {
    await import("../components/dialog.js").then((m) =>
      m.alertDialog({ title: "중복 없음", message: "중복된 쿠코드가 없습니다.", kind: "success" })
    );
    return;
  }
  const ok = await confirmDialog({
    title: "중복 일괄 삭제",
    message: `중복 ${toDelete.length}건을 발견했습니다.\n같은 쿠코드 중 가장 마지막에 입력된 1건만 남기고 나머지를 삭제할까요?`,
    danger: true, yes: "삭제", no: "취소",
  });
  if (!ok) return;
  for (const r of toDelete) {
    if (r.id) await deleteOps(shift, kind, r.id);
    await logAudit({
      shift, scope: `ops:${kind}`, target: r.kucode,
      action: "delete", detail: "bulk-dedupe",
      by: getSession()?.nickname, before: r,
    });
  }
  showToast(`중복 ${toDelete.length}건 삭제`, "success");
  refresh();
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
