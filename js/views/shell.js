// 메인 쉘 — 상단바(브랜드 + 탭 + SNOP[전일 대비] + 시계 + 연결상태/사용자/⚙/테마/로그아웃) + 본문 라우팅.

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
import { setSnop, getYesterdaySnop, logAudit, subscribeSnop, getStorageMode, isFallbackActive } from "../db.js";
import { isFirebaseConfigured } from "../firebase-config.js";
import { showToast } from "../toast.js";

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

// 라우터 정리 — 이전 탭의 cleanup 함수를 다음 라우팅 전에 호출
let currentTabCleanup = null;

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
    <input class="snop-input" type="text" placeholder="-" inputmode="numeric" pattern="[0-9, ]*" maxlength="12" />
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

  // SNOP 실시간 구독 — 다른 매니저가 같은 날짜의 SNOP을 갱신하면 즉시 반영
  let unsubSnop = null;
  (async () => {
    unsubSnop = await subscribeSnop(shift, today, (val) => {
      // 사용자가 현재 입력 중이면 덮어쓰지 않음
      if (document.activeElement === snopInput) return;
      const formatted = formatSnop(val);
      if (snopInput.value === formatted) return;
      snopInput.value = formatted;
      snopInput.dataset.committed = String(val || "");
      refreshDiff();
    });
  })();

  // 입력 중 자동 천 단위 포맷 (커서 위치 유지)
  snopInput.addEventListener("input", (e) => {
    const raw = snopInput.value.replace(/[^\d]/g, "");
    const formatted = raw ? Number(raw).toLocaleString() : "";
    // 커서 보존 (천 구분 추가/제거로 위치 어긋남 방지)
    const cursorEnd = snopInput.selectionEnd;
    const lenBefore = snopInput.value.length;
    snopInput.value = formatted;
    const lenAfter = formatted.length;
    try {
      const newPos = Math.max(0, cursorEnd + (lenAfter - lenBefore));
      snopInput.setSelectionRange(newPos, newPos);
    } catch {}
    refreshDiff();
  });

  snopInput.addEventListener("blur", async () => {
    const newRaw = String(parseSNOP(snopInput.value) ?? "");
    const oldRaw = snopInput.dataset.committed || "";
    if (newRaw === oldRaw) return;
    if (!validateSnop(newRaw)) {
      showToast("SNOP은 양의 정수만 입력 가능합니다.", "error");
      snopInput.value = formatSnop(oldRaw);
      refreshDiff();
      return;
    }
    const ok = await confirmSnopChange(oldRaw, newRaw);
    if (!ok) {
      snopInput.value = formatSnop(oldRaw);
      refreshDiff();
      return;
    }
    await setSnop(shift, today, newRaw, session?.nickname || "");
    await logAudit({
      shift, scope: "snop", target: today,
      action: oldRaw ? "update" : "create",
      by: session?.nickname,
      before: oldRaw ? { value: oldRaw } : null,
      after: { value: newRaw },
    });
    snopInput.dataset.committed = newRaw;
    snopInput.value = formatSnop(newRaw);
    refreshDiff();
  });

  clockEl = makeClock();
  actions.appendChild(clockEl);

  // 연결 상태 칩
  const connChip = makeConnectionChip();
  actions.appendChild(connChip);

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
    runCleanup();
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
    runCleanup();
    if (unsubSnop) try { unsubSnop(); } catch {}
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

function runCleanup() {
  if (typeof currentTabCleanup === "function") {
    try { currentTabCleanup(); } catch (e) { console.warn("tab cleanup error", e); }
  }
  currentTabCleanup = null;
}

async function routeFromHash() {
  runCleanup(); // 이전 탭 정리

  const hash = location.hash.replace(/^#\/?/, "");
  const [tab, sub] = hash.split("/");
  const tabId = TABS.find((t) => t.id === tab) ? tab : "data";
  highlightTab(tabId);
  const ctx = { shift: getSession()?.shift };
  const params = { sub };

  let result;
  if (tabId === "data")       result = renderDataTab(bodyHost, ctx, params);
  else if (tabId === "flow")  result = renderFlowTab(bodyHost, ctx, params);
  else if (tabId === "pack")  result = renderPackTab(bodyHost, ctx, params);
  else if (tabId === "pick")  result = renderPickTab(bodyHost, ctx, params);
  else if (tabId === "tcpos") result = renderTCPosTab(bodyHost, ctx, params);
  else if (tabId === "share") result = renderShareTab(bodyHost, ctx, params);
  else { renderPlaceholder(tabId); return; }

  // 탭이 Promise 를 반환하면 await, cleanup 함수면 보관
  if (result && typeof result.then === "function") {
    try { currentTabCleanup = await result; } catch (e) { console.warn("tab render error", e); }
  } else if (typeof result === "function") {
    currentTabCleanup = result;
  }
}

function renderPlaceholder(tabId) {
  bodyHost.innerHTML = "";
  const labels = {
    raw: {
      icon: "🚧",
      title: "RAW 데이터",
      desc: "준비 중 — 향후 PACK/PICK HTP(시간당 처리량) 집계를 위한 원본 데이터 영역이 추가됩니다.<br><br><small>완성 시: 일자별 작업 시작/종료 시각, 처리 건수 자동 산출, 사원 카드의 평균 HTP 통계 연동.</small>",
    },
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

// ── 연결 상태 칩 (🟢 실시간 / 🟡 로컬 전용 / 🟠 오프라인) ──
function makeConnectionChip() {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "conn-chip";
  chip.title = "연결 상태";

  function refresh() {
    let state, label, title;
    if (!isFirebaseConfigured()) {
      state = "local"; label = "🟡 로컬 전용";
      title = "Firebase 미설정 — LocalStorage 만 사용. 다른 매니저와 실시간 동기화 안 됨.";
    } else if (!navigator.onLine) {
      state = "offline"; label = "🟠 오프라인";
      title = "네트워크 끊김 — 로컬 저장 후 복구 시 자동 동기화 시도.";
    } else if (isFallbackActive()) {
      state = "local"; label = "🟡 로컬 전용";
      title = "Firebase 보안 규칙 잠김 — README 의 규칙 안내를 확인해주세요.";
    } else {
      state = "live"; label = "🟢 실시간";
      title = "Firebase 정상 — 다른 매니저와 실시간 동기화 중.";
    }
    chip.dataset.state = state;
    chip.textContent = label;
    chip.title = title;
  }

  refresh();
  window.addEventListener("online", refresh);
  window.addEventListener("offline", refresh);
  window.addEventListener("gw2ob:fb-fallback", refresh);
  window.addEventListener("gw2ob:fb-transient", refresh);

  chip.addEventListener("click", () => {
    showToast(chip.title, chip.dataset.state === "live" ? "success" : "info");
  });

  return chip;
}

async function confirmSnopChange(oldVal, newVal) {
  return confirmDialog({
    title: "SNOP 수정 확인",
    message: "정말 수정하시겠습니까?",
    detail: `
      <div class="snop-diff-detail">
        <div class="snop-cell old">
          <div class="snop-cell-label">기존 SNOP</div>
          <div class="snop-cell-value">${escape(formatSnop(oldVal) || "—")}</div>
        </div>
        <div class="snop-arrow">→</div>
        <div class="snop-cell new">
          <div class="snop-cell-label">변경 SNOP</div>
          <div class="snop-cell-value">${escape(formatSnop(newVal) || "—")}</div>
        </div>
      </div>
    `,
    yes: "예", no: "아니오",
  });
}

function parseSNOP(s) {
  if (s == null || s === "") return null;
  const cleaned = String(s).replace(/[, ]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function validateSnop(s) {
  if (s === "" || s == null) return true; // 비우는 건 허용
  return /^\d+$/.test(String(s));
}

function formatSnop(v) {
  const n = parseSNOP(v);
  if (n == null) return "";
  return n.toLocaleString();
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
