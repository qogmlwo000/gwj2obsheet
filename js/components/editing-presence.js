// 실시간 "입력 중" 인디케이터 — Realtime Database 사용.
//
//   /editing/{shift}/{scope}/{sessionId} = { nickname, ts }
//
// scope 예: "ops:pack:오토백 1.2", "ops:pick:6.1F:싱귤"
//
// 사용:
//   markEditing(scope)   — focus / typing 시 호출 (자동 onDisconnect 제거)
//   unmarkEditing(scope) — blur 시 호출
//   subscribeEditing(scope, callback) — 다른 사용자 편집 상태 구독

import { getFirebaseApp } from "../db.js";
import { isFirebaseConfigured } from "../firebase-config.js";
import { getSession } from "../auth.js";

let rt = null;
const myMarks = new Map();   // scope → { ref, timer }

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

export async function markEditing(scope) {
  const r = await ensureRTDB();
  if (!r) return;
  const sess = getSession();
  if (!sess?.nickname) return;
  const path = `editing/${escapePath(scope)}/${sessionId}`;
  const ref = r.ref(r.db, path);
  await r.set(ref, { nickname: sess.nickname, ts: r.serverTimestamp() });
  r.onDisconnect(ref).remove();
  myMarks.set(scope, ref);
  // 5초 후 자동 정리 (사용자가 unmark 안 부르면 stale 안 되게)
  clearTimeout(myMarks.get(scope + "__t"));
  myMarks.set(scope + "__t", setTimeout(() => unmarkEditing(scope), 6000));
}

export async function unmarkEditing(scope) {
  const r = await ensureRTDB();
  if (!r) return;
  const ref = myMarks.get(scope);
  if (ref) {
    try { await r.remove(ref); } catch {}
    myMarks.delete(scope);
  }
  const t = myMarks.get(scope + "__t");
  if (t) { clearTimeout(t); myMarks.delete(scope + "__t"); }
}

export async function subscribeEditing(scope, callback) {
  const r = await ensureRTDB();
  if (!r) { callback([]); return () => {}; }
  const ref = r.ref(r.db, `editing/${escapePath(scope)}`);
  const handler = r.onValue(ref, (snap) => {
    const all = snap.val() || {};
    const others = Object.entries(all)
      .filter(([sid]) => sid !== sessionId)
      .map(([sid, v]) => ({ sessionId: sid, ...v }));
    callback(others);
  }, () => callback([]));
  return () => { try { r.off(ref); } catch {} };
}

// "ops:pack:오토백 1.2" 같은 scope 에서 / 와 . 등 RTDB 가 안 받는 글자 치환
function escapePath(s) {
  return String(s).replace(/[.#$\[\]\/]/g, "_").replace(/\s+/g, "_");
}
