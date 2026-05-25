// 인원 현황 대시보드 — 독립 탭의 핵심 컴포넌트.
// Plan / Actual 는 직접 입력 가능, Gap·Total·채용률·Perm% 는 자동 계산.
// 자동 동기화 모드: TC 포지션 / PACK / PICK / FLOW>신규단기 에서 Actual 값을 끌어옴.

import {
  getHeadcount, setHeadcount, subscribeHeadcount,
  listOps, listFlow, listMaster, getTCPosition,
  subscribeOps, subscribeFlow, subscribeTCPosition,
} from "../db.js";
import { getSession } from "../auth.js";

const ROWS = [
  { group: "perm",  key: "tc",     label: "T/C",    parent: "상용직 (Perm)" },
  { group: "perm",  key: "perm",   label: "Perm",   parent: "상용직 (Perm)" },
  { group: "temp",  key: "temp",   label: "Temp",   parent: "임시직 (Temp)" },
  { group: "temp",  key: "newbie", label: "Newbie", parent: "임시직 (Temp)" },
];

const WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];

export function renderHeadcountDashboard({ container, shift, getDate, onActualChanged }) {
  const root = document.createElement("section");
  root.className = "hc-dash";
  container.appendChild(root);

  let state = blankState();
  let unsub = null;
  let unsubPack = null, unsubPick = null, unsubNewTemp = null, unsubTC = null, unsubCaptain = null;
  let saving = false;
  let saveTimer = null;
  let currentDate = getDate();
  let autoSyncTimer = null;
  let lastComputedActual = null; // 마지막 자동계산 값 (수동 입력 vs 자동 비교용)

  function blankState() {
    return {
      tc:     { plan: 0, actual: 0 },
      perm:   { plan: 0, actual: 0 },
      temp:   { plan: 0, actual: 0 },
      newbie: { plan: 0, actual: 0 },
    };
  }

  function render() {
    const date = getDate();
    const dObj = parseDate(date);
    const shiftLabel = shift === "day" ? "Mother DAY" : "Mother SWING";
    const shiftClass = shift === "day" ? "hc-day" : "hc-swing";

    const permTotal     = sumRow("tc", "perm");
    const tempTotal     = sumRow("temp", "newbie");
    const grand         = {
      plan:   permTotal.plan + tempTotal.plan,
      actual: permTotal.actual + tempTotal.actual,
    };
    const rate   = grand.plan ? (grand.actual / grand.plan) * 100 : 0;
    const permPct = grand.actual ? (permTotal.actual / grand.actual) * 100 : 0;

    root.className = `hc-dash ${shiftClass}`;
    root.innerHTML = `
      <table class="hc-table">
        <thead>
          <tr class="hc-date-row">
            <th class="hc-date" colspan="3">${escape(date)} (${WEEK_KO[dObj.getDay()]})</th>
            <th class="hc-shift-title" colspan="3">${escape(shiftLabel)}</th>
          </tr>
          <tr class="hc-head-row">
            <th class="hc-th-type" colspan="2">Type</th>
            <th>Plan</th>
            <th>Actual</th>
            <th>Gap</th>
          </tr>
        </thead>
        <tbody>
          ${renderGroup("perm", "상용직 (Perm)", ["tc", "perm"], permTotal)}
          ${renderGroup("temp", "임시직 (Temp)", ["temp", "newbie"], tempTotal)}
          <tr class="hc-grand-row">
            <td class="hc-grand-label" colspan="2">Total</td>
            <td class="hc-grand-num">${grand.plan}</td>
            <td class="hc-grand-num">${grand.actual}</td>
            <td class="hc-grand-num">${gapHtml(grand.actual - grand.plan)}</td>
          </tr>
          <tr class="hc-calc-row">
            <td class="hc-calc-label" colspan="2">채용률</td>
            <td class="hc-calc-value" colspan="3">${rate.toFixed(2)}%</td>
          </tr>
          <tr class="hc-calc-row hc-calc-perm">
            <td class="hc-calc-label" colspan="2">Perm %</td>
            <td class="hc-calc-value" colspan="3">${permPct.toFixed(2)}%</td>
          </tr>
        </tbody>
      </table>
    `;

    // 입력 이벤트 바인딩
    root.querySelectorAll("input.hc-input").forEach((el) => {
      el.addEventListener("focus", () => el.select());
      el.addEventListener("input", () => {
        const k = el.dataset.k;
        const f = el.dataset.f;
        const v = parseInt(el.value, 10);
        state[k][f] = Number.isFinite(v) ? Math.max(0, v) : 0;
        scheduleSave();
        renderDerivedOnly();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); el.blur(); }
        if (e.key === "ArrowUp")   { e.preventDefault(); el.value = (parseInt(el.value || "0", 10) + 1); el.dispatchEvent(new Event("input")); }
        if (e.key === "ArrowDown") { e.preventDefault(); el.value = Math.max(0, parseInt(el.value || "0", 10) - 1); el.dispatchEvent(new Event("input")); }
      });
    });
  }

  // 합계와 자동계산 행만 빠르게 재계산
  function renderDerivedOnly() {
    const permTotal = sumRow("tc", "perm");
    const tempTotal = sumRow("temp", "newbie");
    const grand = {
      plan:   permTotal.plan + tempTotal.plan,
      actual: permTotal.actual + tempTotal.actual,
    };
    const rate    = grand.plan ? (grand.actual / grand.plan) * 100 : 0;
    const permPct = grand.actual ? (permTotal.actual / grand.actual) * 100 : 0;

    setText("hc-sub-plan",   "perm", permTotal.plan);
    setText("hc-sub-actual", "perm", permTotal.actual);
    setText("hc-sub-gap",    "perm", null, permTotal.actual - permTotal.plan, true);
    setText("hc-sub-plan",   "temp", tempTotal.plan);
    setText("hc-sub-actual", "temp", tempTotal.actual);
    setText("hc-sub-gap",    "temp", null, tempTotal.actual - tempTotal.plan, true);

    // 행별 gap 셀
    ROWS.forEach((r) => {
      const cell = root.querySelector(`[data-cell-gap="${r.key}"]`);
      if (cell) cell.innerHTML = gapHtml(state[r.key].actual - state[r.key].plan);
    });

    // 그랜드
    const grandRow = root.querySelector(".hc-grand-row");
    if (grandRow) {
      const tds = grandRow.querySelectorAll("td");
      tds[1].textContent = grand.plan;
      tds[2].textContent = grand.actual;
      tds[3].innerHTML = gapHtml(grand.actual - grand.plan);
    }

    const rateCell = root.querySelector(".hc-calc-row:not(.hc-calc-perm) .hc-calc-value");
    if (rateCell) rateCell.textContent = rate.toFixed(2) + "%";
    const permCell = root.querySelector(".hc-calc-perm .hc-calc-value");
    if (permCell) permCell.textContent = permPct.toFixed(2) + "%";
  }

  function setText(cls, group, val, gap, isGap) {
    const el = root.querySelector(`[data-sub="${cls}-${group}"]`);
    if (!el) return;
    if (isGap) el.innerHTML = gapHtml(gap);
    else el.textContent = val;
  }

  function sumRow(...keys) {
    const out = { plan: 0, actual: 0 };
    keys.forEach((k) => {
      out.plan   += state[k]?.plan   || 0;
      out.actual += state[k]?.actual || 0;
    });
    return out;
  }

  function renderGroup(groupId, parentLabel, keys, totals) {
    const items = ROWS.filter((r) => keys.includes(r.key));
    let html = "";
    items.forEach((r, i) => {
      const v = state[r.key];
      const gap = v.actual - v.plan;
      html += `
        <tr class="hc-row hc-row-${groupId}${i === 0 ? " hc-row-first" : ""}${i === items.length - 1 ? " hc-row-last" : ""}">
          ${i === 0 ? `<td class="hc-parent" rowspan="${items.length + 1}"><div class="hc-parent-inner">${escape(parentLabel)}</div></td>` : ""}
          <td class="hc-sub">${escape(r.label)}</td>
          <td class="hc-num"><input class="hc-input" type="number" min="0" inputmode="numeric"
              value="${v.plan}" data-k="${r.key}" data-f="plan" /></td>
          <td class="hc-num"><input class="hc-input" type="number" min="0" inputmode="numeric"
              value="${v.actual}" data-k="${r.key}" data-f="actual" /></td>
          <td class="hc-num hc-gap-cell" data-cell-gap="${r.key}">${gapHtml(gap)}</td>
        </tr>
      `;
    });
    // Subtotal
    html += `
      <tr class="hc-subtotal-row hc-row-${groupId}">
        <td class="hc-sub-label">Total</td>
        <td class="hc-num hc-sub-num" data-sub="hc-sub-plan-${groupId}">${totals.plan}</td>
        <td class="hc-num hc-sub-num" data-sub="hc-sub-actual-${groupId}">${totals.actual}</td>
        <td class="hc-num" data-sub="hc-sub-gap-${groupId}">${gapHtml(totals.actual - totals.plan)}</td>
      </tr>
    `;
    return html;
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saving = true;
      try {
        await setHeadcount(shift, currentDate, state, getSession()?.nickname || "");
      } finally { saving = false; }
    }, 350);
  }

  async function loadAndSubscribe() {
    currentDate = getDate();
    state = normalize(await getHeadcount(shift, currentDate));
    render();
    // 헤드카운트 자체 구독
    if (unsub) { try { unsub(); } catch {} unsub = null; }
    let first = true;
    unsub = await subscribeHeadcount(shift, currentDate, (data) => {
      if (first) { first = false; return; }
      if (saving) return; // 내가 방금 저장한 변경은 무시
      // 다른 사용자가 변경한 값 — 입력 중인 인풋이 없으면 통째로 반영
      const focused = root.querySelector("input.hc-input:focus");
      if (focused) return;
      state = normalize(data);
      render();
    });

    // ─ 자동 동기화: 다른 탭의 데이터가 바뀌면 Actual 재계산 ─
    closeSourceSubs();
    const onChange = () => scheduleAutoSync(150);
    unsubPack    = await subscribeOps(shift, "pack", currentDate, onChange);
    unsubPick    = await subscribeOps(shift, "pick", currentDate, onChange);
    unsubNewTemp = await subscribeFlow(shift, "newTemp", currentDate, onChange);
    unsubCaptain = await subscribeFlow(shift, "captain", currentDate, onChange);  // ★ FLOW>TEAM CAPTAIN
    unsubTC      = await subscribeTCPosition(shift, currentDate, onChange);

    // 초기 자동 동기화도 한 번 실행
    scheduleAutoSync(300);
  }

  function closeSourceSubs() {
    [unsubPack, unsubPick, unsubNewTemp, unsubTC, unsubCaptain].forEach((fn) => {
      if (typeof fn === "function") { try { fn(); } catch {} }
    });
    unsubPack = unsubPick = unsubNewTemp = unsubTC = unsubCaptain = null;
  }

  // 짧은 debounce — 여러 구독이 동시에 폭주해도 한 번만 계산
  function scheduleAutoSync(delay = 200) {
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(runAutoSync, delay);
  }

  async function runAutoSync() {
    autoSyncTimer = null;
    // 입력 중이면 건너뜀 (사용자 수동 편집 보호)
    if (root.querySelector("input.hc-input:focus")) {
      // 다음 기회에 다시
      scheduleAutoSync(1500);
      return;
    }
    try {
      const computed = await computeActualFromSources(shift, currentDate);
      // 변경 사항 검사 — 동일하면 저장 스킵
      const newActual = {
        tc: computed.tc.actual,
        perm: computed.perm.actual,
        temp: computed.temp.actual,
        newbie: computed.newbie.actual,
      };
      const same = lastComputedActual &&
        ["tc","perm","temp","newbie"].every((k) => lastComputedActual[k] === newActual[k]);
      if (same && state.tc.actual === newActual.tc &&
          state.perm.actual === newActual.perm &&
          state.temp.actual === newActual.temp &&
          state.newbie.actual === newActual.newbie) {
        return;
      }
      lastComputedActual = newActual;
      // 상태 업데이트 (Plan 은 유지)
      state.tc.actual     = newActual.tc;
      state.perm.actual   = newActual.perm;
      state.temp.actual   = newActual.temp;
      state.newbie.actual = newActual.newbie;
      render();
      // DB 저장 — 다른 매니저들도 보도록
      saving = true;
      try {
        await setHeadcount(shift, currentDate, state, getSession()?.nickname || "auto");
      } finally { saving = false; }
      onActualChanged?.();
    } catch (e) {
      console.warn("auto-sync failed", e);
    }
  }

  function normalize(d) {
    const out = blankState();
    if (!d) return out;
    for (const k of Object.keys(out)) {
      out[k].plan   = toNum(d[k]?.plan);
      out[k].actual = toNum(d[k]?.actual);
    }
    return out;
  }

  loadAndSubscribe();

  return {
    setDate() { loadAndSubscribe(); },
    resync() { scheduleAutoSync(0); },
    async resetAll() {
      state = blankState();
      lastComputedActual = null;
      render();
      saving = true;
      try {
        await setHeadcount(shift, currentDate, state, getSession()?.nickname || "");
      } finally { saving = false; }
    },
    destroy() {
      if (unsub) { try { unsub(); } catch {} unsub = null; }
      closeSourceSubs();
      if (saveTimer) clearTimeout(saveTimer);
      if (autoSyncTimer) clearTimeout(autoSyncTimer);
      try { container.removeChild(root); } catch {}
    },
  };
}

function toNum(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function gapHtml(gap) {
  if (!gap) return `<span class="hc-gap-zero">–</span>`;
  if (gap > 0) return `<span class="hc-gap-up">▲${gap}</span>`;
  return `<span class="hc-gap-down">▼${Math.abs(gap)}</span>`;
}

function parseDate(s) {
  if (!s) return new Date();
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// ──────────────────────────────────────────────────────────
// 자동 동기화 — 다른 탭/마스터에서 Actual 카운트 계산
// ──────────────────────────────────────────────────────────
export async function computeActualFromSources(shift, date) {
  const [pack, pick, newTemp, captain, tcpos, permMaster, tempMaster] = await Promise.all([
    listOps(shift, "pack", date),
    listOps(shift, "pick", date),
    listFlow(shift, "newTemp", date),
    listFlow(shift, "captain", date),         // ★ FLOW > TEAM CAPTAIN 도 포함
    getTCPosition(shift, date),
    listMaster(shift, "perm"),
    listMaster(shift, "temp"),
  ]);

  // T/C Actual = FLOW>captain + TC 포지션에 배정된 고유 쿠코드 (Union, dedupe)
  const tcKus = new Set();
  captain.forEach((r) => {
    const ku = String(r?.kucode || "").trim();
    if (ku) tcKus.add(ku);
  });
  if (tcpos?.positions) {
    for (const slot of Object.values(tcpos.positions)) {
      const ku = String(slot?.kucode || "").trim();
      if (ku) tcKus.add(ku);
    }
  }

  const permSet = new Set(permMaster.map((r) => String(r.kucode || r.id)));
  const tempSet = new Set(tempMaster.map((r) => String(r.kucode || r.id)));

  // PACK + PICK 의 모든 쿠코드 (중복 제거)
  const opsKus = new Set();
  [...pack, ...pick].forEach((r) => {
    const ku = String(r?.kucode || "").trim();
    if (ku) opsKus.add(ku);
  });

  // Perm Actual = ops 의 쿠코드 중 perm 마스터에 있는 것
  // Temp Actual = ops 의 쿠코드 중 perm 에는 없고 temp 에 있는 것 (또는 둘 다 없는 미분류)
  let permActual = 0;
  let tempActual = 0;
  for (const ku of opsKus) {
    if (permSet.has(ku)) permActual++;
    else if (tempSet.has(ku)) tempActual++;
    else tempActual++; // DATA 미등록도 임시직으로 간주
  }

  // Newbie Actual = FLOW > newTemp 에 입력된 행 수 (id 가 있는 것만)
  const newbieActual = newTemp.filter((r) => r.id).length;

  return {
    tc:     { actual: tcKus.size },
    perm:   { actual: permActual },
    temp:   { actual: tempActual },
    newbie: { actual: newbieActual },
  };
}
