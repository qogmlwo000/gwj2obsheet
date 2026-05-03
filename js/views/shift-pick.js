// DAY / SWING 선택 화면.

import { setShift, getSession } from "../auth.js";

export function renderShiftPick(root, onPick) {
  root.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "shift-wrap";

  const session = getSession();
  const greet = document.createElement("div");
  greet.className = "shift-greet";
  greet.innerHTML = `안녕하세요, <b>${escapeHTML(session?.nickname || "")}</b>님 👋  근무하실 조를 선택해주세요`;
  wrap.appendChild(greet);

  const cards = document.createElement("div");
  cards.className = "shift-cards";

  cards.appendChild(makeCard("☀️", "DAY조", "주간 근무", () => pick("day")));
  cards.appendChild(makeCard("🌙", "SWING조", "야간 근무", () => pick("swing")));

  wrap.appendChild(cards);
  root.appendChild(wrap);

  function pick(shift) {
    setShift(shift);
    onPick(shift);
  }
}

function makeCard(icon, title, sub, onClick) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "shift-card";
  const i = document.createElement("div");
  i.className = "shift-card-icon";
  i.textContent = icon;
  const t = document.createElement("div");
  t.className = "shift-card-title";
  t.textContent = title;
  const s = document.createElement("div");
  s.className = "shift-card-sub";
  s.textContent = sub;
  card.append(i, t, s);
  card.addEventListener("click", onClick);
  return card;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
