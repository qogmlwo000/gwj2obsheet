// 실시간 접속자 추적 — Firebase Realtime Database 의 onDisconnect 사용.
// 탭이 닫히면 자동으로 presence 노드가 정리됩니다.
//
// 데이터 모델 (RTDB):
//   /presence/{sessionId} = { nickname, role, shift, joinedAt, lastActive }
//
// 사용처:
//   await joinPresence();              // 로그인 후 호출
//   onPresenceChange((users) => ...);  // 변경 구독
//   await leavePresence();             // 로그아웃 시 호출

import { getFirebaseApp } from "../db.js";
import { isFirebaseConfigured } from "../firebase-config.js";
import { getSession } from "../auth.js";

let rt = null;
let myRef = null;
let unsubFn = null;
let allRef = null;

let presenceState = { users: [], myId: null };
const listeners = new Set();

function notifyAll() { listeners.forEach((fn) => fn(presenceState.users)); }
export function onPresenceChange(fn) {
  listeners.add(fn);
  // 즉시 현재 상태 1회 전달
  fn(presenceState.users);
  return () => listeners.delete(fn);
}

async function ensureRTDB() {
  if (rt) return rt;
  if (!isFirebaseConfigured()) return null;
  const app = await getFirebaseApp();
  if (!app) return null;
  const m = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js");
  rt = {
    db: m.getDatabase(app),
    ref: m.ref,
    onValue: m.onValue,
    set: m.set,
    update: m.update,
    onDisconnect: m.onDisconnect,
    serverTimestamp: m.serverTimestamp,
    push: m.push,
    remove: m.remove,
    off: m.off,
  };
  return rt;
}

export async function joinPresence() {
  const session = getSession();
  if (!session?.nickname) return;
  const r = await ensureRTDB();
  if (!r) return; // LocalStorage 모드 — presence 비활성

  // 세션별 고유 ID (탭마다 다름)
  let sessionId = sessionStorage.getItem("gw2ob:presenceId");
  if (!sessionId) {
    sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem("gw2ob:presenceId", sessionId);
  }
  presenceState.myId = sessionId;

  myRef = r.ref(r.db, `presence/${sessionId}`);
  await r.set(myRef, {
    nickname: session.nickname,
    role: session.role || "user",
    shift: session.shift || null,
    joinedAt: r.serverTimestamp(),
    lastActive: r.serverTimestamp(),
  });
  // 탭이 닫히거나 네트워크가 끊기면 자동으로 노드 제거
  r.onDisconnect(myRef).remove();

  // 전체 presence 구독
  if (allRef) { try { r.off(allRef); } catch {} }
  allRef = r.ref(r.db, "presence");
  unsubFn = r.onValue(allRef, (snap) => {
    const all = snap.val() || {};
    presenceState.users = Object.entries(all).map(([id, v]) => ({ id, ...(v || {}) }));
    notifyAll();
  });

  // 5분마다 lastActive 갱신 (살아있는 표시)
  startHeartbeat(r);
}

let heartbeatTimer = null;
function startHeartbeat(r) {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (myRef) r.update(myRef, { lastActive: r.serverTimestamp() }).catch(() => {});
  }, 5 * 60 * 1000);
}

export async function leavePresence() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  const r = await ensureRTDB();
  if (!r) return;
  if (allRef) { try { r.off(allRef); } catch {} allRef = null; }
  if (myRef) {
    try { await r.remove(myRef); } catch {}
    myRef = null;
  }
  presenceState = { users: [], myId: null };
  notifyAll();
}

// 페이지 unload 시 한 번 더 시도 (onDisconnect 폴백)
window.addEventListener("beforeunload", () => {
  if (myRef && rt) {
    try { rt.remove(myRef); } catch {}
  }
});

// =================================================================
// UI — 우측 상단 chip + 클릭 시 popover (닉네임 리스트)
// =================================================================

export function makePresenceChip() {
  const wrap = document.createElement("div");
  wrap.className = "presence-wrap";

  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "presence-chip";
  chip.title = "현재 접속자 보기";
  chip.innerHTML = `
    <span class="presence-dot live"></span>
    <span class="presence-text">현재 접속자: <b>0</b>명</span>
  `;
  wrap.appendChild(chip);

  let popover = null;
  let users = [];

  function togglePopover() {
    if (popover) { closePopover(); return; }
    popover = document.createElement("div");
    popover.className = "presence-popover";
    popover.innerHTML = renderList(users);
    document.body.appendChild(popover);
    positionPopover();
    setTimeout(() => {
      document.addEventListener("mousedown", onDocClick);
      window.addEventListener("scroll", positionPopover, true);
      window.addEventListener("resize", positionPopover);
    }, 0);
  }
  function closePopover() {
    if (popover) popover.remove();
    popover = null;
    document.removeEventListener("mousedown", onDocClick);
    window.removeEventListener("scroll", positionPopover, true);
    window.removeEventListener("resize", positionPopover);
  }
  function positionPopover() {
    if (!popover) return;
    const r = chip.getBoundingClientRect();
    popover.style.top = `${r.bottom + 6}px`;
    popover.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  }
  function onDocClick(e) {
    if (popover && !popover.contains(e.target) && !chip.contains(e.target)) {
      closePopover();
    }
  }

  chip.addEventListener("click", togglePopover);

  const unsub = onPresenceChange((us) => {
    users = us || [];
    chip.querySelector("b").textContent = users.length;
    chip.dataset.count = `👥 ${users.length}`;
    if (popover) popover.innerHTML = renderList(users);
  });

  // LocalStorage 모드면 안내
  if (!isFirebaseConfigured()) {
    chip.classList.add("offline");
    chip.title = "오프라인 모드 — Firebase 미설정";
    chip.querySelector(".presence-text").innerHTML = `오프라인`;
  }

  wrap.dispose = () => { unsub(); closePopover(); };
  return wrap;
}

function renderList(users) {
  if (!users.length) return `<div class="presence-empty">접속 중인 사용자가 없습니다</div>`;
  // 본인을 가장 위로
  const myId = presenceState.myId;
  const sorted = [...users].sort((a, b) => {
    if (a.id === myId) return -1;
    if (b.id === myId) return 1;
    return (a.nickname || "").localeCompare(b.nickname || "");
  });
  return `
    <div class="presence-head">현재 접속자 ${users.length}명</div>
    <div class="presence-list">
      ${sorted.map((u) => `
        <div class="presence-item${u.role === "admin" ? " admin" : ""}${u.id === myId ? " me" : ""}">
          <span class="presence-dot live ${u.shift || ""}"></span>
          <span class="presence-nick">${escape(u.nickname || "—")}</span>
          ${u.id === myId ? `<span class="presence-tag me-tag">나</span>` : ""}
          ${u.role === "admin" ? `<span class="presence-tag admin-tag">관리자</span>` : ""}
          ${u.shift ? `<span class="presence-tag shift-tag">${u.shift === "day" ? "DAY ☀️" : "SWING 🌙"}</span>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
