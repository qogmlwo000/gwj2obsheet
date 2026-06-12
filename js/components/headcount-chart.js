// 인원 현황 트렌드 차트 — 채용률 / Perm% 의 시간별 추이.
// 일자별 (최근 30일) / 월별 평균 (최근 12개월) 토글.

import { listHeadcountRange } from "../db.js";

export function renderHeadcountChart({ container, shift }) {
  const root = document.createElement("section");
  root.className = "hc-chart-card";
  container.appendChild(root);

  // 헤더
  const head = document.createElement("header");
  head.className = "hc-chart-head";
  head.innerHTML = `
    <div class="hc-chart-title">
      <span class="hc-chart-icon">📈</span>
      <span class="hc-chart-name">추이 — 채용률 & Perm %</span>
    </div>
  `;

  const toggle = document.createElement("div");
  toggle.className = "hc-chart-toggle";
  toggle.innerHTML = `
    <button class="hc-tog-btn active" data-mode="daily">일자별 (30일)</button>
    <button class="hc-tog-btn" data-mode="monthly">월별 평균 (12개월)</button>
  `;
  head.appendChild(toggle);
  root.appendChild(head);

  // 범례
  const legend = document.createElement("div");
  legend.className = "hc-chart-legend";
  legend.innerHTML = `
    <span class="hc-leg-item"><span class="hc-leg-dot" style="background:#ef4444"></span>채용률</span>
    <span class="hc-leg-item"><span class="hc-leg-dot" style="background:#3b82f6"></span>Perm %</span>
  `;
  root.appendChild(legend);

  // 차트 본문
  const chartHost = document.createElement("div");
  chartHost.className = "hc-chart-svg-host";
  root.appendChild(chartHost);

  // 상태
  let mode = "daily";

  async function reload() {
    chartHost.innerHTML = `<div class="hc-chart-loading">⏳ 데이터 로딩 중...</div>`;
    const range = mode === "daily" ? dayRange(30) : monthRange(12);
    const rows = await listHeadcountRange(shift, range.from, range.to);
    const points = mode === "daily" ? toDaily(rows, range) : toMonthly(rows, range);
    chartHost.innerHTML = "";
    chartHost.appendChild(renderSVG(points, mode));
  }

  toggle.querySelectorAll(".hc-tog-btn").forEach((b) => {
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      toggle.querySelectorAll(".hc-tog-btn").forEach((x) => x.classList.toggle("active", x === b));
      reload();
    });
  });

  reload();

  return {
    refresh: reload,
    destroy() { try { container.removeChild(root); } catch {} },
  };
}

// ──────────────────────────────────────────────────────────
// SVG 라인 차트
// ──────────────────────────────────────────────────────────
function renderSVG(points, mode) {
  const W = 780, H = 280;
  const padL = 44, padR = 24, padT = 14, padB = 38;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "hc-chart-svg");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  if (!points.length) {
    const empty = document.createElementNS("http://www.w3.org/2000/svg", "text");
    empty.setAttribute("x", W / 2);
    empty.setAttribute("y", H / 2);
    empty.setAttribute("text-anchor", "middle");
    empty.setAttribute("class", "hc-chart-empty-text");
    empty.textContent = "데이터가 없습니다 — 인원 현황을 입력하면 추이가 표시됩니다";
    svg.appendChild(empty);
    return svg;
  }

  // Y 축 범위 — 0 ~ max+여유 (최소 110%)
  const allVals = points.flatMap((p) => [p.rate, p.permPct].filter((v) => Number.isFinite(v)));
  const maxV = Math.max(120, Math.ceil((Math.max(...allVals, 100) + 10) / 10) * 10);
  const minV = 0;

  // Y 축 그리드 + 라벨
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const v = minV + (maxV - minV) * (i / yTicks);
    const y = padT + innerH - innerH * (i / yTicks);
    const line = mkSvg("line", {
      x1: padL, x2: padL + innerW, y1: y, y2: y,
      class: "hc-grid-line",
    });
    svg.appendChild(line);
    const lbl = mkSvg("text", {
      x: padL - 8, y: y + 4, "text-anchor": "end",
      class: "hc-axis-label",
    });
    lbl.textContent = `${Math.round(v)}%`;
    svg.appendChild(lbl);
  }

  // X 축 라벨 (간격을 적절히 — 최대 8개)
  const xCount = points.length;
  const labelStep = Math.max(1, Math.ceil(xCount / 8));
  const xAt = (i) => padL + (xCount === 1 ? innerW / 2 : (innerW * i) / (xCount - 1));
  const yAt = (v) => padT + innerH - (innerH * (v - minV)) / (maxV - minV);

  points.forEach((p, i) => {
    if (i % labelStep !== 0 && i !== xCount - 1) return;
    const lbl = mkSvg("text", {
      x: xAt(i), y: H - padB + 18, "text-anchor": "middle",
      class: "hc-axis-label",
    });
    lbl.textContent = formatX(p.x, mode);
    svg.appendChild(lbl);
  });

  // 100% 기준선 강조
  if (maxV >= 100 && minV <= 100) {
    const y100 = yAt(100);
    svg.appendChild(mkSvg("line", {
      x1: padL, x2: padL + innerW, y1: y100, y2: y100,
      class: "hc-grid-line-100",
    }));
  }

  // 라인 그리기 — 데이터 없는 구간(null)은 선을 끊음 (0% 로 그려지는 것 방지)
  const ratePath = pathFor(points.map((p, i) => [xAt(i), Number.isFinite(p.rate) ? yAt(p.rate) : NaN]));
  const permPath = pathFor(points.map((p, i) => [xAt(i), Number.isFinite(p.permPct) ? yAt(p.permPct) : NaN]));

  // 채용률 (빨강)
  svg.appendChild(mkSvg("path", { d: ratePath, class: "hc-line hc-line-rate", fill: "none" }));
  // Perm % (파랑)
  svg.appendChild(mkSvg("path", { d: permPath, class: "hc-line hc-line-perm", fill: "none" }));

  // 점 + 툴팁
  points.forEach((p, i) => {
    const x = xAt(i);
    [
      { v: p.rate,    cls: "hc-dot-rate", color: "#ef4444", label: "채용률" },
      { v: p.permPct, cls: "hc-dot-perm", color: "#3b82f6", label: "Perm %" },
    ].forEach(({ v, cls, color, label }) => {
      if (!Number.isFinite(v)) return;
      const c = mkSvg("circle", {
        cx: x, cy: yAt(v), r: 3.5,
        class: `hc-dot ${cls}`,
        fill: color, stroke: "#fff", "stroke-width": 1.5,
      });
      // 툴팁
      const title = mkSvg("title");
      title.textContent = `${formatX(p.x, mode)} — ${label}: ${v.toFixed(2)}%`;
      c.appendChild(title);
      svg.appendChild(c);
    });
  });

  return svg;
}

function pathFor(pts) {
  // 비유한(NaN) 좌표에서 패스를 끊고 다음 유효 점에서 M 으로 재시작
  let d = "";
  let pen = false;
  for (const [x, y] of pts) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) { pen = false; continue; }
    d += pen ? ` L ${x} ${y}` : `${d ? " " : ""}M ${x} ${y}`;
    pen = true;
  }
  return d;
}

function mkSvg(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

// ──────────────────────────────────────────────────────────
// 데이터 변환
// ──────────────────────────────────────────────────────────
function dayRange(n) {
  const today = new Date();
  const from = new Date(today); from.setDate(today.getDate() - (n - 1));
  return { from: fmtDate(from), to: fmtDate(today), n };
}

function monthRange(n) {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() - (n - 1), 1);
  return { from: fmtDate(from), to: fmtDate(today), n };
}

function toDaily(rows, range) {
  const byDate = new Map();
  rows.forEach((r) => byDate.set(r.date, r));
  const out = [];
  const cur = new Date(range.from);
  const end = new Date(range.to);
  while (cur <= end) {
    const d = fmtDate(cur);
    const r = byDate.get(d);
    const { rate, permPct } = computeRates(r);
    out.push({ x: d, rate, permPct, hasData: !!r });
    cur.setDate(cur.getDate() + 1);
  }
  // 데이터가 있는 점들만 연결하면 라인이 끊김 — 빈 날짜는 NaN 으로 라인이 자연스럽게 끊어짐
  // 단, 라인 끊김 방지를 위해 모든 날짜의 값을 유지 (0% 가 아닌 데이터 없으면 직전 값 유지)
  let lastRate = null, lastPerm = null;
  out.forEach((p) => {
    if (!p.hasData) {
      p.rate = lastRate;
      p.permPct = lastPerm;
    } else {
      lastRate = p.rate;
      lastPerm = p.permPct;
    }
  });
  return out;
}

function toMonthly(rows, range) {
  // 월별 평균
  const buckets = new Map(); // "YYYY-MM" → { rateSum, permSum, n }
  rows.forEach((r) => {
    if (!r.date) return;
    const ym = r.date.slice(0, 7);
    const { rate, permPct } = computeRates(r);
    if (!Number.isFinite(rate)) return;
    const b = buckets.get(ym) || { rateSum: 0, permSum: 0, n: 0 };
    b.rateSum += rate;
    b.permSum += Number.isFinite(permPct) ? permPct : 0;
    b.n++;
    buckets.set(ym, b);
  });
  const out = [];
  const cur = new Date(range.from);
  const end = new Date(range.to);
  while (cur <= end) {
    const ym = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
    const b = buckets.get(ym);
    out.push({
      x: ym,
      rate:    b ? b.rateSum / b.n : null,
      permPct: b ? b.permSum / b.n : null,
      hasData: !!b,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function computeRates(r) {
  if (!r) return { rate: null, permPct: null };
  const tc = num(r.tc), perm = num(r.perm), temp = num(r.temp), newbie = num(r.newbie);
  const planTotal = tc.plan + perm.plan + temp.plan + newbie.plan;
  const actualTotal = tc.actual + perm.actual + temp.actual + newbie.actual;
  const permActual = tc.actual + perm.actual;
  const rate = planTotal ? (actualTotal / planTotal) * 100 : null;
  const permPct = actualTotal ? (permActual / actualTotal) * 100 : null;
  return { rate, permPct };
}

function num(v) {
  return {
    plan:   Number(v?.plan)   || 0,
    actual: Number(v?.actual) || 0,
  };
}

function formatX(s, mode) {
  if (mode === "daily") {
    // "2026-05-24" → "5/24"
    const [, m, d] = String(s).split("-");
    return `${Number(m)}/${Number(d)}`;
  }
  // "2026-05" → "5월"
  const [, m] = String(s).split("-");
  return `${Number(m)}월`;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
