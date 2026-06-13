// DAY / SWING 선택 화면 — 낮/밤 테마 카드.

import { setShift, getSession, clearSession } from "../auth.js";
import { makeAuthBg } from "./login.js";

export function renderShiftPick(root, onPick) {
  root.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "shift-wrap";
  wrap.appendChild(makeAuthBg());

  const session = getSession();
  const nickname = session?.nickname || "";

  // 인사 헤더 — 아바타 + 닉네임
  const head = document.createElement("div");
  head.className = "shift-head";
  head.innerHTML = `
    <div class="shift-avatar">${escapeHTML(initialOf(nickname))}</div>
    <div class="shift-greet">안녕하세요, <b>${escapeHTML(nickname)}</b>님 <span class="wave">👋</span></div>
    <div class="shift-greet-sub">오늘 근무하실 조를 선택해주세요</div>
  `;
  wrap.appendChild(head);

  // 현재 시각 기준 추천 (05~16시 = DAY, 그 외 = SWING)
  const hour = new Date().getHours();
  const nowShift = hour >= 5 && hour < 16 ? "day" : "swing";

  const cards = document.createElement("div");
  cards.className = "shift-cards";
  cards.appendChild(makeDayCard(nowShift === "day", () => pick("day")));
  cards.appendChild(makeSwingCard(nowShift === "swing", () => pick("swing")));
  wrap.appendChild(cards);

  // 다른 닉네임으로 돌아가기
  const back = document.createElement("button");
  back.type = "button";
  back.className = "shift-back";
  back.textContent = "← 다른 닉네임으로 입장";
  back.addEventListener("click", () => {
    clearSession();
    onPick(null); // 세션이 비었으므로 로그인 화면으로 라우팅됨
  });
  wrap.appendChild(back);

  root.appendChild(wrap);

  function pick(shift) {
    setShift(shift);
    onPick(shift);
  }
}

function makeDayCard(recommended, onClick) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "shift-card day";
  card.innerHTML = `
    ${recommended ? `<span class="shift-now-badge">지금 시간대</span>` : ""}
    <div class="shift-sky">
      <span class="orb"></span>
      <span class="cloud c1"></span>
      <span class="cloud c2"></span>
      <span class="cloud c3"></span>
    </div>
    <div class="shift-card-title">DAY조</div>
    <div class="shift-card-sub">☀️ 주간 근무</div>
    <div class="shift-card-cta">입장 →</div>
  `;
  card.addEventListener("click", onClick);
  return card;
}

function makeSwingCard(recommended, onClick) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "shift-card swing";
  card.innerHTML = `
    ${recommended ? `<span class="shift-now-badge">지금 시간대</span>` : ""}
    <div class="shift-sky">
      <span class="orb"></span>
      <span class="star s1">✦</span>
      <span class="star s2">✧</span>
      <span class="star s3">✦</span>
      <span class="star s4">✧</span>
      <span class="star s5">✦</span>
    </div>
    <div class="shift-card-title">SWING조</div>
    <div class="shift-card-sub">🌙 야간 근무</div>
    <div class="shift-card-cta">입장 →</div>
  `;
  card.addEventListener("click", onClick);
  return card;
}

function initialOf(name) {
  const t = String(name || "").trim();
  return t ? t[0].toUpperCase() : "?";
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
