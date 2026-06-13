// PACK 탭 — 오토백 / 메뉴얼 라인 카드 스트립 + W/S + 일괄 중복 제거.

import { renderPackPickStrip, PACK_GROUPS_DEF } from "../components/pack-pick-grid.js";
import { buildMemberIndex } from "../components/member-label.js";
import { renderWSTable } from "./tab-ws.js";

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
  root.appendChild(head);

  const stripHost = document.createElement("div");
  root.appendChild(stripHost);

  // PACK 탭 진입 시 항상 최신 마스터로 새로 빌드 (DATA 변경이 즉시 반영되도록)
  const memberIndex = await buildMemberIndex(shift, true);

  let stripApi = null, wsApi = null;
  let mainCount = 0, wsCount = 0;
  const refresh = () => totalChip.textContent = `총 ${mainCount + wsCount}명`;

  function build() {
    const date = dateInput.value || todayStr();
    // W/S 워터 — 스트립 맨 오른쪽 카드 (6F/7F 카드와 같은 위치감)
    const wsCard = makeWsCard();
    stripApi = renderPackPickStrip({
      container: stripHost, kind: "pack", shift, date,
      groups: PACK_GROUPS_DEF, memberIndex,
      onCountChange: (t) => { mainCount = t.total; refresh(); },
      trailingEl: wsCard,
    });
    wsApi = renderWSTable({
      container: wsCard.querySelector(".pp-card-body"),
      kind: "pack", shift, date, memberIndex,
      onCountChange: (n) => {
        wsCount = n; refresh();
        wsCard.querySelector(".pp-card-count").textContent = `${n} 명`;
      },
    });
  }

  dateInput.addEventListener("change", () => {
    if (stripApi?.destroy) stripApi.destroy();
    if (wsApi?.destroy) wsApi.destroy();
    stripHost.innerHTML = "";
    build();
  });

  build();

  return () => {
    if (stripApi?.destroy) try { stripApi.destroy(); } catch {}
    if (wsApi?.destroy) try { wsApi.destroy(); } catch {}
  };
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// W/S 워터 카드 셸 — 스트립의 다른 라인/층 카드와 같은 모양
export function makeWsCard() {
  const el = document.createElement("section");
  el.className = "pp-card pp-ws-card variant-water";
  el.innerHTML = `
    <header class="pp-card-head">
      <div class="pp-card-title">
        <span class="pp-card-name">💧 W/S 워터</span>
        <span class="pp-card-count">0 명</span>
      </div>
      <div class="pp-card-actions">
        <button class="icon-btn small" title="접기/펼치기">▾</button>
      </div>
    </header>
    <div class="pp-card-body"></div>
  `;
  const collapseBtn = el.querySelector(".pp-card-actions .icon-btn");
  collapseBtn.addEventListener("click", () => {
    el.classList.toggle("collapsed");
    collapseBtn.textContent = el.classList.contains("collapsed") ? "▸" : "▾";
  });
  return el;
}
