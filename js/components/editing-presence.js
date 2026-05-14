// 실시간 "입력 중" 인디케이터 — Realtime Database 사용.
//
//   /editing/{escapedScope}/{sessionId} = { nickname, ts }
//
// scope 예: "ops:pack:오토백 1.2", "ops:pick:6.1F:싱귤"
//
// 사용:
//   markEditing(scope)              — focus / typing 시 호출 (자동 onDisconnect 제거)
//   unmarkEditing(scope)            — blur 시 호출
//   subscribeEditing(scope, cb)     — 다른 사용자 편집 상태 구독, unsubscribe 함수 반환

import { getFirebaseApp } from "../db.js";
import { isFirebaseConfigured } from "../firebase-config.js";
import { getSession } from "../auth.js";

let rt = null;
const myRefs   = new Map();  // scope → RTDB ref
const myTimers = new Map();  // scope → setTimeout id

async function ensureRTDB() {
  if (rt) return rt;
  if (!isFirebaseConfigured()) return null;
  const app = await getFirebaseApp();
  if (!app) return null;
  const m = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js");
  rt = {
    db: m.getDatabase(app),
    ref: m.ref, set: m.set, remove: m.remove,
    onValue: m.onValue, onDisconnect: m.onDisconnect,
    serverTimestamp: m.serverTimestamp, off: m.off,
  };
  return rt;
}

const sessionId = (() => {
  let id = sessionStorage.getItem("gw2ob:presenceId");
  if (!id) {
    id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem("gw2ob:presenceId", id);
  }
  return id;
})();

export async function markEditing(scope, extra = {}) {
  const r = await ensureRTDB();
  if (!r) return;
  const sess = getSession();
  if (!sess?.nickname) return;
  const path = `editing/${escapePath(scope)}/${sessionId}`;
  const ref = r.ref(r.db, path);
  // extra 에서 nickname 이 들어와도 무시 (세션 값 우선)
  const { nickname: _ignored, ...rest } = extra || {};
  try {
    await r.set(ref, { nickname: sess.nickname, ts: r.serverTimestamp(), ...rest });
    r.onDisconnect(ref).remove();
  } catch (e) {
    // 권한 없음 등 — 조용히 무시 (UX 영향 X)
    return;
  }
  myRefs.set(scope, ref);
  // 6초 후 자동 정리 (사용자가 unmark 안 부르면 stale 안 되게)
  const prevT = myTimers.get(scope);
  if (prevT) clearTimeout(prevT);
  myTimers.set(scope, setTimeout(() => unmarkEditing(scope), 6000));
}

export async function unmarkEditing(scope) {
  const r = await ensureRTDB();
  const ref = myRefs.get(scope);
  if (ref && r) {
    try { await r.remove(ref); } catch {}
  }
  myRefs.delete(scope);
  const t = myTimers.get(scope);
  if (t) { clearTimeout(t); myTimers.delete(scope); }
}

export async function subscribeEditing(scope, callback) {
  const r = await ensureRTDB();
  if (!r) { callback([]); return () => {}; }
  const ref = r.ref(r.db, `editing/${escapePath(scope)}`);
  r.onValue(ref, (snap) => {
    const all = snap.val() || {};
    const others = Object.entries(all)
      .filter(([sid]) => sid !== sessionId)
      .map(([sid, v]) => ({ sessionId: sid, ...v }));
    callback(others);
  }, () => callback([]));
  return () => { try { r.off(ref); } catch {} };
}

// RTDB path 는 . # $ [ ] / 금지.
// 충돌 방지를 위해 각 금지 문자를 고유한 escape 시퀀스로 치환.
// "오토백 1.2" → "오토백_1_dt_2",  "오토백 12" → "오토백_12"  (구분됨)
function escapePath(s) {
  return String(s ?? "")
    .replace(/_/g, "_und_")
    .replace(/\./g, "_dt_")
    .replace(/#/g, "_hs_")
    .replace(/\$/g, "_dl_")
    .replace(/\[/g, "_ob_")
    .replace(/\]/g, "_cb_")
    .replace(/\//g, "_sl_")
    .replace(/\s+/g, "_");
}
