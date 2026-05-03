// 메인 쉘 — 상단바(브랜드 + 탭 + SNOP[전일 대비] + 시계 + 사용자/⚙/테마/로그아웃) + 본문 라우팅.

import { getSession, isAdmin, clearSession } from "../auth.js";
import { renderDataTab } from "./tab-data.js";
import { renderFlowTab } from "./tab-flow.js";
import { renderPackTab } from "./tab-pack.js";
import { renderPickTab } from "./tab-pick.js";
import { renderShareTab } from "./tab-share.js";
import { renderTCPosTab } from "./tab-tcpos.js";
import { openSettings } from "./settings.js";
import { makeClock } from "../components/clock.js";
import { confirmDialog } from "../components/dialog.js";
import { makePresenceChip, joinPresence, leavePresence } from "../components/presence.js";
import { getSnop, setSnop, getYesterdaySnop, logAudit } from "../db.js";

const TABS = [
  { id: "raw",   label: "RAW" },
  { id: "data",  label: "DATA" },
  { id: "flow",  label: "FLOW" },
  { id: "pack",  label: "PACK" },
  { id: "pick",  label: "PICK" },
  { id: "tcpos", label: "TC 포지션" },
  { id: "share", label: "공유" },
];

let bodyHost = null;
let tabsEl = null;
let clockEl = null;

export function renderShell(root, onLogout) {
  root.innerHTML = "";
  document.body.querySelectorAll(".theme-toggle").forEach((el) => el.remove());

  const session = getSession();
  const shift = session?.shift;

  const shell = document.createElement("div");
  shell.className = "shell";

  const top = document.createElement("header");
  top.className = "shell-top";

  const brand = document.createElement("div");
  brand.className = "shell-brand brand-effect";
  brand.innerHTML = `
    <span class="brand-icon">📋</span>
    <span class="brand-title">
      <span class="brand-gw">GWJ2</span>
      <span class="brand-ob">OB</span>
      <span class="brand-pda">PDA 일지</span>
    </span>
    <span class="shift-pill">${shift === "day" ? "DAY ☀️" : "SWING 🌙"}</span>
  `;
  top.appendChild(brand);

  tabsEl = document.createElement("nav");
  tabsEl.className = "shell-tabs";
  TABS.forEach((t) => {
    const b = document.createElement("button");
    b.className = "shell-tab";
    b.dataset.tab = t.id;
    b.textContent = t.label;
    b.addEventListener("click", () => location.hash = `#/${t.id}`);
    tabsEl.appendChild(b);
  });
  top.appendChild(tabsEl);

  const actions = document.createElement("div");
  actions.className = "shell-actions";

  // SNOP — 전일 대비 표시 포함
  const snopWrap = document.createElement("div");
  snopWrap.className = "snop-wrap";
  snopWrap.innerHTML = `
    <span class="snop-label">D0 SNOP</span>
    <input class="snop-input" type="text" placeholder="-" inputmode="numeric" />
    <span class="snop-diff"></span>
  `;
  actions.appendChild(snopWrap);

  const snopInput = snopWrap.querySelector(".snop-input");
  const snopDiff = snopWrap.querySelector(".snop-diff");
  const today = todayStr();

  async function refreshDiff() {
    const cur = parseSNOP(snopInput.value);
    const yesterday = parseSNOP(await getYesterdaySnop(shift, today));
    if (cur == null || yesterday == null) {
      snopDiff.textContent = "";
      snopDiff.className = "snop-diff";
      return;
    }
    const diff = cur - yesterday;
    if (diff === 0) {
      snopDiff.textContent = "(±0)";
      snopDiff.className = "snop-diff neutral";
    } else if (diff > 0) {
      snopDiff.textContent = `(+${diff.toLocaleString()})`;
      snopDiff.className = "snop-diff positive";
    } else {
      snopDiff.textContent = `(${diff.toLocaleString()})`;
      snopDiff.className = "snop-diff negative";
    }
  }

  getSnop(shift, today).then((v) => {
    snopInput.value = v || "";
    snopInput.dataset.committed = v || "";
    refreshDiff();
  });

  snopInput.addEventListener("input", refreshDiff);

  snopInput.addEventListener("blur", async () => {
    const newVal = snopInput.value.trim();
    const oldVal = snopInput.dataset.committed || "";
    if (newVal === oldVal) return;
    const ok = await confirmSnopChange(oldVal, newVal);
    if (!ok) {
      snopInput.value = oldVal;
      refreshDiff();
      return;
    }
    await setSnop(shift, today, newVal, session?.nickname || "");
    await logAudit({
      shift, scope: "snop", target: today,
      action: oldVal ? "update" : "create",
      by: session?.nickname,
      before: oldVal ? { value: oldVal } : null,
      after: { value: newVal },
    });
    snopInput.dataset.committed = newVal;
    refreshDiff();
  });

  clockEl = makeClock();
  actions.appendChild(clockEl);

  // 실시간 접속자 chip (우상단)
  const presenceChip = makePresenceChip();
  actions.appendChild(presenceChip);
  // 세션이 준비됐으니 presence 등록 (Firebase 미설정 시 자동 무시)
  joinPresence();

  const user = document.createElement("span");
  user.className = "shell-user";
  user.innerHTML = `<b>${escape(session?.nickname || "")}</b>${isAdmin() ? "  ⚡" : ""}`;
  actions.appendChild(user);

  if (isAdmin()) {
    const settings = document.createElement("button");
    settings.className = "icon-btn";
    settings.title = "설정"; settings.textContent = "⚙";
    settings.addEventListener("click", async () => {
      await openSettings();
      clockEl.refresh?.();
    });
    actions.appendChild(settings);
  }

  const themeBtn = makeInlineThemeToggle();
  actions.appendChild(themeBtn);

  const back = document.createElement("button");
  back.className = "icon-btn"; back.title = "조 변경"; back.textContent = "🔄";
  back.addEventListener("click", async () => {
    await leavePresence();
    const s = session;
    delete s.shift;
    sessionStorage.setItem("gw2ob:session", JSON.stringify(s));
    location.hash = ""; location.reload();
  });
  actions.appendChild(back);

  const logout = document.createElement("button");
  logout.className = "icon-btn"; logout.title = "로그아웃"; logout.textContent = "⏻";
  logout.addEventListener("click", async () => {
    await leavePresence();
    clearSession();
    onLogout();
  });
  actions.appendChild(logout);

  top.appendChild(actions);
  shell.appendChild(top);

  bodyHost = document.createElement("main");
  bodyHost.style.flex = "1";
  bodyHost.style.display = "flex";
  bodyHost.style.flexDirection = "column";
  bodyHost.style.minHeight = "0";
  shell.appendChild(bodyHost);

  root.appendChild(shell);

  window.addEventListener("hashchange", routeFromHash);
  if (!location.hash || location.hash === "#") location.hash = "#/data";
  else routeFromHash();
}

function routeFromHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [tab, sub] = hash.split("/");
  const tabId = TABS.find((t) => t.id === tab) ? tab : "data";
  highlightTab(tabId);
  const ctx = { shift: getSession()?.shift };
  const params = { sub };
  if (tabId === "data")  return renderDataTab(bodyHost, ctx, params);
  if (tabId === "flow")  return renderFlowTab(bodyHost, ctx, params);
  if (tabId === "pack")  return renderPackTab(bodyHost, ctx, params);
  if (tabId === "pick")  return renderPickTab(bodyHost, ctx, params);
  if (tabId === "tcpos") return renderTCPosTab(bodyHost, ctx, params);
  if (tabId === "share") return renderShareTab(bodyHost, ctx, params);
  return renderPlaceholder(tabId);
}

function renderPlaceholder(tabId) {
  bodyHost.innerHTML = "";
  const labels = {
    raw: { icon: "🗂", title: "RAW", desc: "원본 데이터 영역 — 다음 단계에서 채워집니다." },
  };
  const info = labels[tabId] || { icon: "🚧", title: tabId, desc: "준비 중" };
  const ph = document.createElement("div");
  ph.className = "placeholder";
  ph.innerHTML = `<div class="placeholder-icon">${info.icon}</div><h2>${info.title}</h2><p>${info.desc}</p>`;
  bodyHost.appendChild(ph);
}

function highlightTab(tabId) {
  if (!tabsEl) return;
  tabsEl.querySelectorAll(".shell-tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tabId)
  );
}

function makeInlineThemeToggle() {
  const btn = document.createElement("button");
  btn.className = "icon-btn"; btn.title = "테마 전환";
  const refresh = () => {
    const t = document.documentElement.getAttribute("data-theme") || "light";
    btn.textContent = t === "light" ? "🌙" : "☀️";
  };
  refresh();
  btn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    const next = cur === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("gw2ob:theme", next);
    refresh();
  });
  return btn;
}

async function confirmSnopChange(oldVal, newVal) {
  return confirmDialog({
    title: "SNOP 수정 확인",
    message: "정말 수정하시겠습니까?",
    detail: `
      <div class="snop-diff-detail">
        <div class="snop-cell old">
          <div class="snop-cell-label">기존 SNOP</div>
          <div class="snop-cell-value">${escape(oldVal || "—")}</div>
        </div>
        <div class="snop-arrow">→</div>
        <div class="snop-cell new">
          <div class="snop-cell-label">변경 SNOP</div>
          <div class="snop-cell-value">${escape(newVal || "—")}</div>
        </div>
      </div>
    `,
    yes: "예", no: "아니오",
  });
}

function parseSNOP(s) {
  if (s == null || s === "") return null;
  const n = Number(String(s).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
