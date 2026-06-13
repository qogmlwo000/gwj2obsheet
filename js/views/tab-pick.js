// PICK 탭 — 6.1F~8F 층별 카드(싱귤/멀티) + W/S + 일괄 중복 제거.

import { renderPackPickStrip, PICK_GROUPS_DEF } from "../components/pack-pick-grid.js";
import { buildMemberIndex } from "../components/member-label.js";
import { renderWSTable } from "./tab-ws.js";
import { makeWsCard } from "./tab-pack.js";

export async function renderPickTab(root, ctx) {
  root.innerHTML = "";
  const { shift } = ctx;

  const head = document.createElement("div");
  head.className = "tab-head";

  const title = document.createElement("div");
  title.className = "tab-head-title";
  title.innerHTML = `<span class="tab-head-icon">🛒</span> PICK <small class="tab-head-sub">집품</small>`;
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

  const memberIndex = await buildMemberIndex(shift, true);

  let stripApi = null, wsApi = null;
  let mainCount = 0, wsCount = 0;
  const refresh = () => totalChip.textContent = `총 ${mainCount + wsCount}명`;

  function build() {
    const date = dateInput.value || todayStr();
    // W/S 워터 — 스트립 맨 오른쪽 카드
    const wsCard = makeWsCard();
    stripApi = renderPackPickStrip({
      container: stripHost, kind: "pick", shift, date,
      groups: PICK_GROUPS_DEF, memberIndex,
      onCountChange: (t) => { mainCount = t.total; refresh(); },
      trailingEl: wsCard,
    });
    wsApi = renderWSTable({
      container: wsCard.querySelector(".pp-card-body"),
      kind: "pick", shift, date, memberIndex,
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
