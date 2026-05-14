// 상단바 시계: 현재시각(초 단위) + 가장 가까운 마감시간.
// - 모든 마감이 지난 후에는 "내일 ⏰ 가장 빠른 마감" 안내
// - 마감 후 30분 이내까지만 "지남" 강조
// - subscribeDeadlines 로 Bennett 가 마감을 추가/삭제하면 즉시 반영

import { getDeadlines, subscribeDeadlines } from "../db.js";

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
  let unsubDl = null;

  function tick() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    time.textContent = `${hh}:${mm}:${ss}`;

    wrap.classList.remove("urgent", "very-urgent", "passed");
    const target = nextDeadline(deadlines, now);
    if (!target) {
      dl.textContent = "마감시간 미설정";
      return;
    }
    const diff = target.date - now;
    const minutes = diff / 60000;
    const prefix = target.nextDay ? "내일 " : "";
    dl.textContent = `${prefix}${target.label} ${formatDiff(diff)}`;
    if (target.nextDay) return; // 내일 마감 → 강조 효과 없음
    if (diff <= 0) {
      // 마감 후 30분 이내까지만 passed 효과
      if (-diff <= 30 * 60 * 1000) wrap.classList.add("passed");
    } else if (minutes <= 15) wrap.classList.add("very-urgent");
    else if (minutes <= 60) wrap.classList.add("urgent");
  }

  (async () => {
    try { deadlines = await getDeadlines(); } catch { deadlines = []; }
    tick();
    // 실시간 구독: 다른 사용자(Bennett) 가 변경하면 즉시 반영
    unsubDl = await subscribeDeadlines((items) => {
      deadlines = items || [];
      tick();
    });
  })();

  timer = setInterval(tick, 1000);

  wrap.refresh = async () => {
    try { deadlines = await getDeadlines(); } catch {}
    tick();
  };
  wrap.dispose = () => {
    clearInterval(timer);
    if (unsubDl) try { unsubDl(); } catch {}
  };

  return wrap;
}

function nextDeadline(deadlines, now) {
  if (!deadlines || deadlines.length === 0) return null;

  // 1) 오늘 안에 미래 마감이 있으면 그 중 가장 빠른 것
  const future = deadlines
    .map((d) => ({ ...d, date: parseTimeToday(d.time, now), nextDay: false }))
    .filter((d) => d.date && d.date > now)
    .sort((a, b) => a.date - b.date);
  if (future.length) return future[0];

  // 2) 오늘 모두 지났다면 - 마지막에 지난 게 30분 이내면 그것을 passed 로 보여줌
  const past = deadlines
    .map((d) => ({ ...d, date: parseTimeToday(d.time, now), nextDay: false }))
    .filter((d) => d.date && d.date <= now)
    .sort((a, b) => b.date - a.date);
  if (past.length && (now - past[0].date) <= 30 * 60 * 1000) return past[0];

  // 3) 그 외에는 내일 가장 빠른 마감 안내
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const next = deadlines
    .map((d) => ({ ...d, date: parseTimeAt(d.time, tomorrow), nextDay: true }))
    .filter((d) => d.date)
    .sort((a, b) => a.date - b.date);
  return next[0] || null;
}

function parseTimeToday(timeStr, now) {
  return parseTimeAt(timeStr, now);
}

function parseTimeAt(timeStr, base) {
  const m = String(timeStr || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(base);
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
