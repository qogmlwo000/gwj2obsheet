// 상단바 시계: 현재시각(초 단위) + 가장 가까운 마감시간(D-1h부터 긴급 효과).
// 마감시간은 settings 컬렉션에서 가져오며 Bennett 설정에서 추가/삭제.

import { getDeadlines } from "../db.js";

export function makeClock() {
  const wrap = document.createElement("div");
  wrap.className = "clock-wrap";
  wrap.innerHTML = `
    <div class="clock-time">--:--:--</div>
    <div class="clock-deadline"></div>
  `;
  const time = wrap.querySelector(".clock-time");
  const dl = wrap.querySelector(".clock-deadline");

  let deadlines = [];
  let timer = null;

  async function loadDl() {
    try { deadlines = await getDeadlines(); } catch { deadlines = []; }
  }

  function tick() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    time.textContent = `${hh}:${mm}:${ss}`;

    // 가장 가까운 미래의 마감시간
    const target = nextDeadline(deadlines, now);
    wrap.classList.remove("urgent", "very-urgent", "passed");
    if (target) {
      const diff = target.date - now;
      const minutes = diff / 60000;
      dl.textContent = `${target.label} ${formatDiff(diff)}`;
      if (diff <= 0) wrap.classList.add("passed");
      else if (minutes <= 15) wrap.classList.add("very-urgent");
      else if (minutes <= 60) wrap.classList.add("urgent");
    } else {
      dl.textContent = "마감시간 미설정";
    }
  }

  loadDl().then(tick);
  timer = setInterval(tick, 1000);

  // 외부에서 마감시간 변경 시 호출
  wrap.refresh = async () => { await loadDl(); tick(); };
  wrap.dispose = () => clearInterval(timer);

  return wrap;
}

function nextDeadline(deadlines, now) {
  if (!deadlines || deadlines.length === 0) return null;
  let best = null;
  for (const d of deadlines) {
    const date = parseTimeToday(d.time, now);
    if (!date) continue;
    if (!best || date < best.date) best = { ...d, date };
    // 이미 지난 마감은 다음날 같은 시각 후보로 두진 않음 (단순화)
  }
  // 가장 가까운 미래 마감
  const future = deadlines
    .map((d) => ({ ...d, date: parseTimeToday(d.time, now) }))
    .filter((d) => d.date && d.date > now)
    .sort((a, b) => a.date - b.date);
  if (future.length) return future[0];
  // 모두 지나갔다면 가장 마지막에 지난 것 반환 (passed 효과)
  const past = deadlines
    .map((d) => ({ ...d, date: parseTimeToday(d.time, now) }))
    .filter((d) => d.date && d.date <= now)
    .sort((a, b) => b.date - a.date);
  return past[0] || null;
}

function parseTimeToday(timeStr, now) {
  const m = String(timeStr || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

function formatDiff(ms) {
  const sign = ms < 0 ? "-" : "";
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${sign}D${sign === "-" ? "+" : "-"}${h}h ${m}m`;
  if (m > 0) return `${sign}D${sign === "-" ? "+" : "-"}${m}m ${String(s).padStart(2,"0")}s`;
  return `${sign}D${sign === "-" ? "+" : "-"}${s}s`;
}
