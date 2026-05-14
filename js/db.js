// 통합 데이터 액세스 레이어.
// Firebase가 설정+권한 OK → Firestore. permission-denied 등 실패 시 자동 LocalStorage 폴백.
//
// 실시간 구독: subscribeOps / subscribeMaster / subscribeFlow / subscribeShare /
//             subscribeTCPosition / subscribeDeadlines / subscribeSnop
// 모두 unsubscribe 함수를 반환. LocalStorage 모드에서는 storage 이벤트로 폴백.

import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

const FB_CONFIGURED = isFirebaseConfigured();
const LS_PREFIX = "gw2ob:";

// 런타임 플래그 — 권한 거부 시 false 로 떨어져 이후 모든 작업이 LocalStorage 폴백.
// 일시 네트워크 오류는 useFirebase 를 안 떨어뜨리고 해당 호출만 폴백.
let useFirebase = FB_CONFIGURED;
let fb = null;

async function ensureFirebase() {
  if (!useFirebase || fb?.fs) return fb;
  const { initializeApp, getApps } = await import(
    "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js"
  );
  const fs = await import(
    "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js"
  );
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  fb = { ...(fb || {}), db, fs, app };
  return fb;
}

export async function getFirebaseApp() {
  if (!FB_CONFIGURED) return null;
  // app 인스턴스만 필요할 땐 useFirebase 폴백과 무관하게 RTDB 등에서 사용
  if (fb?.app) return fb.app;
  const { initializeApp, getApps } = await import(
    "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js"
  );
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  fb = { ...(fb || {}), app };
  return app;
}

// 권한 거부 등 Firestore 실패 시 LocalStorage 로 영구 폴백
function isPermDenied(e) {
  const msg = String(e?.message || e?.code || e || "");
  return msg.includes("permission-denied") ||
         msg.includes("PERMISSION_DENIED") ||
         msg.includes("Missing or insufficient");
}

// 일시적 오류(unavailable / network / deadline) — useFirebase 는 유지
function isTransient(e) {
  const msg = String(e?.message || e?.code || e || "");
  return msg.includes("unavailable") ||
         msg.includes("UNAVAILABLE") ||
         msg.includes("network") ||
         msg.includes("deadline") ||
         msg.includes("offline");
}

async function safe(fbFn, lsFn) {
  if (!useFirebase) return lsFn();
  try {
    return await fbFn();
  } catch (e) {
    if (isPermDenied(e)) {
      useFirebase = false;
      console.warn("[db] Firebase 권한 거부 — LocalStorage 폴백 모드로 전환");
      window.dispatchEvent(new CustomEvent("gw2ob:fb-fallback", { detail: { reason: "permission" } }));
      return lsFn();
    }
    if (isTransient(e)) {
      console.warn("[db] Firestore 일시 오류 — 이번 호출만 LocalStorage 폴백:", e?.message || e);
      window.dispatchEvent(new CustomEvent("gw2ob:fb-transient", { detail: { message: String(e?.message || e) } }));
      return lsFn();
    }
    console.warn("[db] Firestore 작업 실패, LocalStorage 폴백:", e?.message || e);
    return lsFn();
  }
}

export function getStorageMode() {
  return useFirebase ? "firestore" : "localstorage";
}
export function isFallbackActive() {
  return FB_CONFIGURED && !useFirebase;
}

// Firestore 결과 + LocalStorage 결과를 id 기준으로 머지.
// LS 에만 있는 행도 살리고, 양쪽에 같은 id 가 있으면 Firestore 우선.
function mergeFsLs(fbList, lsList) {
  const map = new Map();
  for (const r of (lsList || [])) {
    if (r && r.id != null) map.set(String(r.id), r);
  }
  for (const r of (fbList || [])) {
    if (r && r.id != null) map.set(String(r.id), r);
  }
  return [...map.values()];
}

// =================================================================
// Master CRUD
// =================================================================

export async function listMaster(shift, role) {
  const ls = readLS(masterKey(shift, role)) || [];
  const fb = await safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const ref = fs.collection(db, "masters", shift, role);
      const snap = await fs.getDocs(ref);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    () => []
  );
  return mergeFsLs(fb, ls);
}

export async function upsertMaster(shift, role, kucode, data) {
  const docId = String(kucode || "").trim();
  if (!docId) return;
  // LocalStorage 에는 항상 저장 (폴백 시 데이터 보존)
  const lsWrite = () => {
    const list = readLS(masterKey(shift, role)) || [];
    const idx = list.findIndex((x) => x.id === docId);
    const row = { id: docId, kucode: docId, ...data, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = { ...list[idx], ...row };
    else list.push(row);
    writeLS(masterKey(shift, role), list);
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const ref = fs.doc(db, "masters", shift, role, docId);
      await fs.setDoc(ref, { ...data, kucode: docId, updatedAt: Date.now() }, { merge: true });
      lsWrite(); // Firestore 성공해도 로컬 미러링 (오프라인 대비)
    },
    lsWrite
  );
}

export async function deleteMaster(shift, role, kucode) {
  const id = String(kucode);
  const lsDel = () => {
    const list = readLS(masterKey(shift, role)) || [];
    writeLS(masterKey(shift, role), list.filter((x) => x.id !== id));
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await fs.deleteDoc(fs.doc(db, "masters", shift, role, id));
      lsDel();
    },
    lsDel
  );
}

// =================================================================
// Flow CRUD (per-day) — captain/ps/leave/newTemp
// =================================================================

export async function listFlow(shift, type, date) {
  const ls = (readLS(flowKey(shift, type)) || []).filter((x) => x.date === date);
  const fb = await safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const ref = fs.collection(db, "flows", shift, type);
      const q = fs.query(ref, fs.where("date", "==", date));
      const snap = await fs.getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    () => []
  );
  return mergeFsLs(fb, ls);
}

export async function upsertFlow(shift, type, id, data) {
  const docId = id || crypto.randomUUID();
  const lsWrite = () => {
    const list = readLS(flowKey(shift, type)) || [];
    const idx = list.findIndex((x) => x.id === docId);
    const row = { id: docId, ...data, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = { ...list[idx], ...row };
    else list.push(row);
    writeLS(flowKey(shift, type), list);
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const ref = fs.doc(db, "flows", shift, type, docId);
      await fs.setDoc(ref, { ...data, updatedAt: Date.now() }, { merge: true });
      lsWrite();
      return docId;
    },
    () => { lsWrite(); return docId; }
  );
}

export async function deleteFlow(shift, type, id) {
  const lsDel = () => {
    const list = readLS(flowKey(shift, type)) || [];
    writeLS(flowKey(shift, type), list.filter((x) => x.id !== id));
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await fs.deleteDoc(fs.doc(db, "flows", shift, type, id));
      lsDel();
    },
    lsDel
  );
}

// =================================================================
// PACK / PICK (kind: pack | pick | pack_ws | pick_ws)
// =================================================================

export async function listOps(shift, kind, date) {
  const ls = (readLS(opsKey(shift, kind)) || []).filter((x) => x.date === date);
  const fb = await safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const ref = fs.collection(db, "ops", shift, kind);
      const q = fs.query(ref, fs.where("date", "==", date));
      const snap = await fs.getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    () => []
  );
  return mergeFsLs(fb, ls);
}

export async function listFlowAll(shift, kind) {
  const ls = readLS(opsKey(shift, kind)) || [];
  const fb = await safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const snap = await fs.getDocs(fs.collection(db, "ops", shift, kind));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    () => []
  );
  return mergeFsLs(fb, ls);
}

export async function upsertOps(shift, kind, id, data) {
  const docId = id || crypto.randomUUID();
  const lsWrite = () => {
    const list = readLS(opsKey(shift, kind)) || [];
    const idx = list.findIndex((x) => x.id === docId);
    const row = { id: docId, ...data, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = { ...list[idx], ...row };
    else list.push(row);
    writeLS(opsKey(shift, kind), list);
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await fs.setDoc(fs.doc(db, "ops", shift, kind, docId), { ...data, updatedAt: Date.now() }, { merge: true });
      lsWrite();
      return docId;
    },
    () => { lsWrite(); return docId; }
  );
}

export async function deleteOps(shift, kind, id) {
  const lsDel = () => {
    const list = readLS(opsKey(shift, kind)) || [];
    writeLS(opsKey(shift, kind), list.filter((x) => x.id !== id));
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await fs.deleteDoc(fs.doc(db, "ops", shift, kind, id));
      lsDel();
    },
    lsDel
  );
}

// =================================================================
// 공유 시트
// =================================================================

export async function listShare(shift, kind) {
  const ls = readLS(shareKey(shift, kind)) || [];
  const fb = await safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const snap = await fs.getDocs(fs.collection(db, "share", shift, kind));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    () => []
  );
  return mergeFsLs(fb, ls);
}
export async function upsertShare(shift, kind, id, data) {
  const docId = id || crypto.randomUUID();
  const lsWrite = () => {
    const list = readLS(shareKey(shift, kind)) || [];
    const idx = list.findIndex((x) => x.id === docId);
    const row = { id: docId, ...data, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = { ...list[idx], ...row };
    else list.push(row);
    writeLS(shareKey(shift, kind), list);
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await fs.setDoc(fs.doc(db, "share", shift, kind, docId), { ...data, updatedAt: Date.now() }, { merge: true });
      lsWrite();
      return docId;
    },
    () => { lsWrite(); return docId; }
  );
}
export async function deleteShare(shift, kind, id) {
  const lsDel = () => {
    const list = readLS(shareKey(shift, kind)) || [];
    writeLS(shareKey(shift, kind), list.filter((x) => x.id !== id));
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await fs.deleteDoc(fs.doc(db, "share", shift, kind, id));
      lsDel();
    },
    lsDel
  );
}

// =================================================================
// 설정 / 기록
// =================================================================

export async function getDeadlines() {
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const snap = await fs.getDoc(fs.doc(db, "settings", "deadlines"));
      return snap.exists() ? (snap.data().items || []) : [];
    },
    () => readLS(LS_PREFIX + "settings:deadlines") || []
  );
}
export async function setDeadlines(items) {
  const lsWrite = () => writeLS(LS_PREFIX + "settings:deadlines", items);
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await fs.setDoc(fs.doc(db, "settings", "deadlines"), { items, updatedAt: Date.now() });
      lsWrite();
    },
    lsWrite
  );
}

export async function getSnop(shift, date) {
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const snap = await fs.getDoc(fs.doc(db, "settings", `snop_${shift}_${date}`));
      return snap.exists() ? (snap.data().value || "") : "";
    },
    () => {
      const map = readLS(LS_PREFIX + `settings:snop:${shift}`) || {};
      return map[date] || "";
    }
  );
}
export async function setSnop(shift, date, value, by = "") {
  const lsWrite = () => {
    const map = readLS(LS_PREFIX + `settings:snop:${shift}`) || {};
    map[date] = value;
    writeLS(LS_PREFIX + `settings:snop:${shift}`, map);
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await fs.setDoc(fs.doc(db, "settings", `snop_${shift}_${date}`), {
        value, updatedAt: Date.now(), updatedBy: by, shift, date,
      });
      lsWrite();
    },
    lsWrite
  );
}
export async function getYesterdaySnop(shift, today) {
  const d = new Date(today);
  d.setDate(d.getDate() - 1);
  const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return getSnop(shift, y);
}

export async function getSpecialNote(kucode) {
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const snap = await fs.getDoc(fs.doc(db, "specialNotes", String(kucode)));
      return snap.exists() ? (snap.data().note || "") : "";
    },
    () => (readLS(LS_PREFIX + "specialNotes") || {})[kucode] || ""
  );
}
export async function setSpecialNote(kucode, note, by = "") {
  const lsWrite = () => {
    const map = readLS(LS_PREFIX + "specialNotes") || {};
    map[kucode] = note;
    writeLS(LS_PREFIX + "specialNotes", map);
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await fs.setDoc(fs.doc(db, "specialNotes", String(kucode)), {
        note, updatedAt: Date.now(), updatedBy: by,
      }, { merge: true });
      lsWrite();
    },
    lsWrite
  );
}

// =================================================================
// Audit log
// =================================================================

export async function logAudit({ shift, scope, target, action, by, before, after, detail }) {
  const entry = {
    ts: Date.now(),
    shift, scope, target, action, by: by || "(unknown)",
    before: before || null, after: after || null, detail: detail || null,
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const id = `${entry.ts}_${Math.random().toString(36).slice(2, 8)}`;
      await fs.setDoc(fs.doc(db, "audit", id), entry);
    },
    () => {
      const list = readLS(LS_PREFIX + "audit") || [];
      list.unshift(entry);
      writeLS(LS_PREFIX + "audit", list.slice(0, 1000));
    }
  );
}

export async function queryAudit({ scope, target, shift, limit = 50 } = {}) {
  // Composite index 회피 — 단일 orderBy + limit 만 사용하고 클라이언트에서 필터링.
  // (where + orderBy 조합은 Firebase composite index 가 필요해 사용자가 콘솔에서 만들어야 함)
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      // 가장 최근 N*5 건을 가져와서 클라이언트 필터링 (인덱스 없이 동작)
      const fetchLimit = (scope || target || shift) ? Math.min(limit * 10, 500) : limit;
      const q = fs.query(
        fs.collection(db, "audit"),
        fs.orderBy("ts", "desc"),
        fs.limit(fetchLimit)
      );
      const snap = await fs.getDocs(q);
      let arr = snap.docs.map((d) => d.data());
      if (scope)  arr = arr.filter((e) => e.scope === scope);
      if (target) arr = arr.filter((e) => e.target === target);
      if (shift)  arr = arr.filter((e) => e.shift === shift);
      return arr.slice(0, limit);
    },
    () => {
      const list = readLS(LS_PREFIX + "audit") || [];
      return list
        .filter((e) =>
          (!scope || e.scope === scope) &&
          (!target || e.target === target) &&
          (!shift || e.shift === shift)
        )
        .slice(0, limit);
    }
  );
}

// =================================================================
// 실시간 구독 — 모두 unsubscribe 함수 반환
// =================================================================
//
// 공통 패턴:
//   1) Firebase 가능하면 onSnapshot 으로 구독.
//   2) 실패/폴백 모드면 window storage 이벤트로 LocalStorage 변경 감지.
//   3) 첫 콜백은 즉시 LS 머지 결과로 호출 (네트워크 지연 가리기).

function makeLsHandler(key, deliver) {
  const handler = (e) => { if (!e.key || e.key === key) deliver(); };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export async function subscribeOps(shift, kind, date, callback) {
  // Firestore 결과 + LS 결과 머지해서 콜백 호출.
  // → Firestore 가 빈 결과를 반환해도 LS 데이터가 사라지지 않음.
  const fireMerged = (fbRows) => {
    const ls = (readLS(opsKey(shift, kind)) || []).filter((x) => x.date === date);
    callback(mergeFsLs(fbRows, ls));
  };

  if (useFirebase) {
    try {
      const { db, fs } = await ensureFirebase();
      const ref = fs.collection(db, "ops", shift, kind);
      const q = fs.query(ref, fs.where("date", "==", date));
      const unsub = fs.onSnapshot(
        q,
        (snap) => fireMerged(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => {
          if (isPermDenied(err)) {
            useFirebase = false;
            window.dispatchEvent(new CustomEvent("gw2ob:fb-fallback", { detail: { reason: "permission" } }));
          }
          // 권한·네트워크 오류 시에도 LS 데이터로 한 번 콜백
          fireMerged([]);
        }
      );
      fireMerged([]);
      // LS 변경 (다른 탭에서 LocalStorage 업데이트한 경우)도 감지
      const unsubLs = makeLsHandler(opsKey(shift, kind), () => fireMerged([]));
      return () => { try { unsub(); } catch {} unsubLs(); };
    } catch (e) {
      if (isPermDenied(e)) useFirebase = false;
    }
  }
  fireMerged([]);
  return makeLsHandler(opsKey(shift, kind), () => fireMerged([]));
}

export async function subscribeMaster(shift, role, callback) {
  const fireMerged = (fbRows) => {
    const ls = readLS(masterKey(shift, role)) || [];
    callback(mergeFsLs(fbRows, ls));
  };
  if (useFirebase) {
    try {
      const { db, fs } = await ensureFirebase();
      const ref = fs.collection(db, "masters", shift, role);
      const unsub = fs.onSnapshot(
        ref,
        (snap) => fireMerged(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => { if (isPermDenied(err)) { useFirebase = false; } fireMerged([]); }
      );
      fireMerged([]);
      const unsubLs = makeLsHandler(masterKey(shift, role), () => fireMerged([]));
      return () => { try { unsub(); } catch {} unsubLs(); };
    } catch (e) {
      if (isPermDenied(e)) useFirebase = false;
    }
  }
  fireMerged([]);
  return makeLsHandler(masterKey(shift, role), () => fireMerged([]));
}

export async function subscribeFlow(shift, type, date, callback) {
  const fireMerged = (fbRows) => {
    const ls = (readLS(flowKey(shift, type)) || []).filter((x) => x.date === date);
    callback(mergeFsLs(fbRows, ls));
  };
  if (useFirebase) {
    try {
      const { db, fs } = await ensureFirebase();
      const ref = fs.collection(db, "flows", shift, type);
      const q = fs.query(ref, fs.where("date", "==", date));
      const unsub = fs.onSnapshot(
        q,
        (snap) => fireMerged(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => { if (isPermDenied(err)) { useFirebase = false; } fireMerged([]); }
      );
      fireMerged([]);
      const unsubLs = makeLsHandler(flowKey(shift, type), () => fireMerged([]));
      return () => { try { unsub(); } catch {} unsubLs(); };
    } catch (e) {
      if (isPermDenied(e)) useFirebase = false;
    }
  }
  fireMerged([]);
  return makeLsHandler(flowKey(shift, type), () => fireMerged([]));
}

export async function subscribeShare(shift, kind, callback) {
  const fireMerged = (fbRows) => {
    const ls = readLS(shareKey(shift, kind)) || [];
    callback(mergeFsLs(fbRows, ls));
  };
  if (useFirebase) {
    try {
      const { db, fs } = await ensureFirebase();
      const ref = fs.collection(db, "share", shift, kind);
      const unsub = fs.onSnapshot(
        ref,
        (snap) => fireMerged(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => { if (isPermDenied(err)) { useFirebase = false; } fireMerged([]); }
      );
      fireMerged([]);
      const unsubLs = makeLsHandler(shareKey(shift, kind), () => fireMerged([]));
      return () => { try { unsub(); } catch {} unsubLs(); };
    } catch (e) {
      if (isPermDenied(e)) useFirebase = false;
    }
  }
  fireMerged([]);
  return makeLsHandler(shareKey(shift, kind), () => fireMerged([]));
}

export async function subscribeTCPosition(shift, date, callback) {
  const tcPosLsKey = LS_PREFIX + `tcpos:${shift}`;
  const fire = (data) => {
    if (data) callback(data);
    else {
      const map = readLS(tcPosLsKey) || {};
      callback(map[date] || { positions: {}, managers: [] });
    }
  };
  if (useFirebase) {
    try {
      const { db, fs } = await ensureFirebase();
      const ref = fs.doc(db, "tcpos", `${shift}_${date}`);
      const unsub = fs.onSnapshot(
        ref,
        (snap) => fire(snap.exists() ? snap.data() : null),
        (err) => { if (isPermDenied(err)) { useFirebase = false; } fire(null); }
      );
      fire(null);
      const unsubLs = makeLsHandler(tcPosLsKey, () => fire(null));
      return () => { try { unsub(); } catch {} unsubLs(); };
    } catch (e) {
      if (isPermDenied(e)) useFirebase = false;
    }
  }
  fire(null);
  return makeLsHandler(tcPosLsKey, () => fire(null));
}

export async function subscribeDeadlines(callback) {
  const lsK = LS_PREFIX + "settings:deadlines";
  const fire = (items) => {
    if (items) callback(items);
    else callback(readLS(lsK) || []);
  };
  if (useFirebase) {
    try {
      const { db, fs } = await ensureFirebase();
      const ref = fs.doc(db, "settings", "deadlines");
      const unsub = fs.onSnapshot(
        ref,
        (snap) => fire(snap.exists() ? (snap.data().items || []) : []),
        (err) => { if (isPermDenied(err)) { useFirebase = false; } fire(null); }
      );
      fire(null);
      const unsubLs = makeLsHandler(lsK, () => fire(null));
      return () => { try { unsub(); } catch {} unsubLs(); };
    } catch (e) {
      if (isPermDenied(e)) useFirebase = false;
    }
  }
  fire(null);
  return makeLsHandler(lsK, () => fire(null));
}

export async function subscribeSnop(shift, date, callback) {
  const lsK = LS_PREFIX + `settings:snop:${shift}`;
  const fire = (val) => {
    if (val != null) callback(val);
    else {
      const map = readLS(lsK) || {};
      callback(map[date] || "");
    }
  };
  if (useFirebase) {
    try {
      const { db, fs } = await ensureFirebase();
      const ref = fs.doc(db, "settings", `snop_${shift}_${date}`);
      const unsub = fs.onSnapshot(
        ref,
        (snap) => fire(snap.exists() ? (snap.data().value || "") : ""),
        (err) => { if (isPermDenied(err)) { useFirebase = false; } fire(null); }
      );
      fire(null);
      const unsubLs = makeLsHandler(lsK, () => fire(null));
      return () => { try { unsub(); } catch {} unsubLs(); };
    } catch (e) {
      if (isPermDenied(e)) useFirebase = false;
    }
  }
  fire(null);
  return makeLsHandler(lsK, () => fire(null));
}

// =================================================================
// TC 포지션
// =================================================================

export async function getTCPosition(shift, date) {
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const snap = await fs.getDoc(fs.doc(db, "tcpos", `${shift}_${date}`));
      return snap.exists() ? snap.data() : { positions: {}, managers: [] };
    },
    () => {
      const map = readLS(LS_PREFIX + `tcpos:${shift}`) || {};
      return map[date] || { positions: {}, managers: [] };
    }
  );
}

export async function setTCPosition(shift, date, data) {
  const lsWrite = () => {
    const map = readLS(LS_PREFIX + `tcpos:${shift}`) || {};
    map[date] = data;
    writeLS(LS_PREFIX + `tcpos:${shift}`, map);
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await fs.setDoc(fs.doc(db, "tcpos", `${shift}_${date}`), {
        ...data, updatedAt: Date.now(), shift, date,
      });
      lsWrite();
    },
    lsWrite
  );
}

// =================================================================
// 닉네임 풀
// =================================================================

export async function getAllowedNicknames() {
  const shifts = ["day", "swing"];
  const roles = ["manager", "captain"];
  const all = await Promise.all(
    shifts.flatMap((s) => roles.map((r) => listMaster(s, r)))
  );
  const set = new Set();
  for (const list of all) {
    for (const row of list) {
      const nick = (row.nickname || "").trim();
      if (nick) set.add(nick);
    }
  }
  return [...set];
}

// =================================================================
// 백업 / 복원 / 초기화
// =================================================================

export async function exportShift(shift) {
  const result = { shift, exportedAt: Date.now(), masters: {}, flows: {}, ops: {}, share: {} };
  for (const role of ["manager", "captain", "ps", "perm", "temp"]) {
    result.masters[role] = await listMaster(shift, role);
  }
  for (const type of ["captain", "ps", "leave", "newTemp"]) {
    result.flows[type] = await listFlowSnapshot(shift, type);
  }
  for (const kind of ["pack", "pick", "pack_ws", "pick_ws"]) {
    result.ops[kind] = await listFlowAll(shift, kind);
  }
  for (const kind of ["pack", "pick"]) {
    result.share[kind] = await listShare(shift, kind);
  }
  return result;
}

async function listFlowSnapshot(shift, type) {
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const snap = await fs.getDocs(fs.collection(db, "flows", shift, type));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    () => readLS(flowKey(shift, type)) || []
  );
}

export async function importShift(shift, payload) {
  if (!payload || payload.shift !== shift) {
    throw new Error("백업 파일의 조와 현재 조가 다릅니다.");
  }
  for (const [role, list] of Object.entries(payload.masters || {})) {
    for (const row of list) await upsertMaster(shift, role, row.id || row.kucode, row);
  }
  for (const [type, list] of Object.entries(payload.flows || {})) {
    for (const row of list) await upsertFlow(shift, type, row.id, row);
  }
  for (const [kind, list] of Object.entries(payload.ops || {})) {
    for (const row of list) await upsertOps(shift, kind, row.id, row);
  }
  for (const [kind, list] of Object.entries(payload.share || {})) {
    for (const row of list) await upsertShare(shift, kind, row.id, row);
  }
}

export async function wipeShift(shift) {
  for (const role of ["manager", "captain", "ps", "perm", "temp"]) {
    const list = await listMaster(shift, role);
    for (const row of list) await deleteMaster(shift, role, row.id);
  }
  for (const type of ["captain", "ps", "leave", "newTemp"]) {
    const list = readLS(flowKey(shift, type)) || [];
    for (const r of list) await deleteFlow(shift, type, r.id);
    writeLS(flowKey(shift, type), []);
  }
  for (const kind of ["pack", "pick", "pack_ws", "pick_ws"]) {
    const list = readLS(opsKey(shift, kind)) || [];
    for (const r of list) await deleteOps(shift, kind, r.id);
    writeLS(opsKey(shift, kind), []);
  }
  for (const kind of ["pack", "pick"]) {
    const list = readLS(shareKey(shift, kind)) || [];
    for (const r of list) await deleteShare(shift, kind, r.id);
    writeLS(shareKey(shift, kind), []);
  }
}

// =================================================================
// LocalStorage 키
// =================================================================

const masterKey = (shift, role) => `${LS_PREFIX}master:${shift}:${role}`;
const flowKey   = (shift, type) => `${LS_PREFIX}flow:${shift}:${type}`;
const opsKey    = (shift, kind) => `${LS_PREFIX}ops:${shift}:${kind}`;
const shareKey  = (shift, kind) => `${LS_PREFIX}share:${shift}:${kind}`;

function readLS(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { console.warn("readLS failed", key, e); return null; }
}
function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    // 같은 탭에서 발생한 setItem 도 다른 곳에 알릴 수 있도록 커스텀 이벤트
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }
  catch (e) { console.warn("writeLS failed", key, e); }
}
