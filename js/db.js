// 통합 데이터 액세스 레이어.
// Firebase가 설정되어 있으면 Firestore 사용, 아니면 LocalStorage 폴백.

import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

const USE_FIREBASE = isFirebaseConfigured();
const LS_PREFIX = "gw2ob:";

let fb = null;

// Firestore + 공유 app 인스턴스 (presence 모듈도 같은 app 사용)
async function ensureFirebase() {
  if (!USE_FIREBASE || fb) return fb;
  const { initializeApp, getApps } = await import(
    "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js"
  );
  const fs = await import(
    "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js"
  );
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  fb = { db, fs, app };
  return fb;
}

// 외부에서 app 인스턴스만 필요할 때 (presence 모듈)
export async function getFirebaseApp() {
  if (!USE_FIREBASE) return null;
  const r = await ensureFirebase();
  return r?.app || null;
}

// =================================================================
// Master CRUD
// =================================================================

export async function listMaster(shift, role) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const ref = fs.collection(db, "masters", shift, role);
    const snap = await fs.getDocs(ref);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return readLS(masterKey(shift, role)) || [];
}

export async function upsertMaster(shift, role, kucode, data) {
  const docId = String(kucode || "").trim();
  if (!docId) return;
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const ref = fs.doc(db, "masters", shift, role, docId);
    await fs.setDoc(ref, { ...data, kucode: docId, updatedAt: Date.now() }, { merge: true });
    return;
  }
  const list = readLS(masterKey(shift, role)) || [];
  const idx = list.findIndex((x) => x.id === docId);
  const row = { id: docId, kucode: docId, ...data, updatedAt: Date.now() };
  if (idx >= 0) list[idx] = { ...list[idx], ...row };
  else list.push(row);
  writeLS(masterKey(shift, role), list);
}

export async function deleteMaster(shift, role, kucode) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    await fs.deleteDoc(fs.doc(db, "masters", shift, role, String(kucode)));
    return;
  }
  const list = readLS(masterKey(shift, role)) || [];
  writeLS(masterKey(shift, role), list.filter((x) => x.id !== String(kucode)));
}

// =================================================================
// Flow CRUD (per-day records) — captain/ps/leave/newTemp
// =================================================================

export async function listFlow(shift, type, date) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const ref = fs.collection(db, "flows", shift, type);
    const q = fs.query(ref, fs.where("date", "==", date));
    const snap = await fs.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const list = readLS(flowKey(shift, type)) || [];
  return list.filter((x) => x.date === date);
}

export async function upsertFlow(shift, type, id, data) {
  const docId = id || crypto.randomUUID();
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const ref = fs.doc(db, "flows", shift, type, docId);
    await fs.setDoc(ref, { ...data, updatedAt: Date.now() }, { merge: true });
    return docId;
  }
  const list = readLS(flowKey(shift, type)) || [];
  const idx = list.findIndex((x) => x.id === docId);
  const row = { id: docId, ...data, updatedAt: Date.now() };
  if (idx >= 0) list[idx] = { ...list[idx], ...row };
  else list.push(row);
  writeLS(flowKey(shift, type), list);
  return docId;
}

export async function deleteFlow(shift, type, id) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    await fs.deleteDoc(fs.doc(db, "flows", shift, type, id));
    return;
  }
  const list = readLS(flowKey(shift, type)) || [];
  writeLS(flowKey(shift, type), list.filter((x) => x.id !== id));
}

// =================================================================
// PACK / PICK 일자별 운영 기록
// path: ops/{shift}/{kind}/{date}/{group}/{docId}
//   kind: "pack" | "pick"
//   group: 라인명 또는 층명. 추가로 subType (싱귤/멀티)는 row 필드로.
// =================================================================

export async function listOps(shift, kind, date) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const ref = fs.collection(db, "ops", shift, kind);
    const q = fs.query(ref, fs.where("date", "==", date));
    const snap = await fs.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const list = readLS(opsKey(shift, kind)) || [];
  return list.filter((x) => x.date === date);
}

// 전체 일자 (사원 카드의 자주 들어가는 라인 집계 등)
export async function listFlowAll(shift, kind) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const snap = await fs.getDocs(fs.collection(db, "ops", shift, kind));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return readLS(opsKey(shift, kind)) || [];
}

export async function upsertOps(shift, kind, id, data) {
  const docId = id || crypto.randomUUID();
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const ref = fs.doc(db, "ops", shift, kind, docId);
    await fs.setDoc(ref, { ...data, updatedAt: Date.now() }, { merge: true });
    return docId;
  }
  const list = readLS(opsKey(shift, kind)) || [];
  const idx = list.findIndex((x) => x.id === docId);
  const row = { id: docId, ...data, updatedAt: Date.now() };
  if (idx >= 0) list[idx] = { ...list[idx], ...row };
  else list.push(row);
  writeLS(opsKey(shift, kind), list);
  return docId;
}

export async function deleteOps(shift, kind, id) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    await fs.deleteDoc(fs.doc(db, "ops", shift, kind, id));
    return;
  }
  const list = readLS(opsKey(shift, kind)) || [];
  writeLS(opsKey(shift, kind), list.filter((x) => x.id !== id));
}

// =================================================================
// 공유 시트 — 계약직 시업 집결지 (일자 무관, 매일 갱신해서 쓰는 마스터)
// =================================================================

export async function listShare(shift, kind) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const ref = fs.collection(db, "share", shift, kind);
    const snap = await fs.getDocs(ref);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return readLS(shareKey(shift, kind)) || [];
}

export async function upsertShare(shift, kind, id, data) {
  const docId = id || crypto.randomUUID();
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const ref = fs.doc(db, "share", shift, kind, docId);
    await fs.setDoc(ref, { ...data, updatedAt: Date.now() }, { merge: true });
    return docId;
  }
  const list = readLS(shareKey(shift, kind)) || [];
  const idx = list.findIndex((x) => x.id === docId);
  const row = { id: docId, ...data, updatedAt: Date.now() };
  if (idx >= 0) list[idx] = { ...list[idx], ...row };
  else list.push(row);
  writeLS(shareKey(shift, kind), list);
  return docId;
}

export async function deleteShare(shift, kind, id) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    await fs.deleteDoc(fs.doc(db, "share", shift, kind, id));
    return;
  }
  const list = readLS(shareKey(shift, kind)) || [];
  writeLS(shareKey(shift, kind), list.filter((x) => x.id !== id));
}

// =================================================================
// 설정: 마감시간 / 일자별 SNOP / 사원 특이사항
// =================================================================

export async function getDeadlines() {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const snap = await fs.getDoc(fs.doc(db, "settings", "deadlines"));
    return snap.exists() ? (snap.data().items || []) : [];
  }
  return readLS(LS_PREFIX + "settings:deadlines") || [];
}

export async function setDeadlines(items) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    await fs.setDoc(fs.doc(db, "settings", "deadlines"), { items, updatedAt: Date.now() });
    return;
  }
  writeLS(LS_PREFIX + "settings:deadlines", items);
}

export async function getSnop(shift, date) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const snap = await fs.getDoc(fs.doc(db, "settings", `snop_${shift}_${date}`));
    return snap.exists() ? (snap.data().value || "") : "";
  }
  const map = readLS(LS_PREFIX + `settings:snop:${shift}`) || {};
  return map[date] || "";
}

export async function setSnop(shift, date, value, by = "") {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    await fs.setDoc(fs.doc(db, "settings", `snop_${shift}_${date}`), {
      value, updatedAt: Date.now(), updatedBy: by, shift, date,
    });
    return;
  }
  const map = readLS(LS_PREFIX + `settings:snop:${shift}`) || {};
  map[date] = value;
  writeLS(LS_PREFIX + `settings:snop:${shift}`, map);
}

export async function getSpecialNote(kucode) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const snap = await fs.getDoc(fs.doc(db, "specialNotes", String(kucode)));
    return snap.exists() ? (snap.data().note || "") : "";
  }
  const map = readLS(LS_PREFIX + "specialNotes") || {};
  return map[kucode] || "";
}

export async function setSpecialNote(kucode, note, by = "") {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    await fs.setDoc(fs.doc(db, "specialNotes", String(kucode)), {
      note, updatedAt: Date.now(), updatedBy: by,
    }, { merge: true });
    return;
  }
  const map = readLS(LS_PREFIX + "specialNotes") || {};
  map[kucode] = note;
  writeLS(LS_PREFIX + "specialNotes", map);
}

// =================================================================
// Audit log — 누가 무엇을 언제 수정했는지
// path: audit/{shift}/{scope}/{auto}
//   scope: "ops:pack" | "ops:pick" | "master:perm" | ... | "share:pack" | "tcpos"
//   target: 식별 키 (kucode 또는 docId)
//   action: "create" | "update" | "delete" | "move"
// =================================================================

export async function logAudit({ shift, scope, target, action, by, before, after, detail }) {
  const entry = {
    ts: Date.now(),
    shift, scope, target, action, by: by || "(unknown)",
    before: before || null,
    after: after || null,
    detail: detail || null,
  };
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const id = `${entry.ts}_${Math.random().toString(36).slice(2, 8)}`;
    await fs.setDoc(fs.doc(db, "audit", id), entry);
    return;
  }
  const list = readLS(LS_PREFIX + "audit") || [];
  list.unshift(entry);
  writeLS(LS_PREFIX + "audit", list.slice(0, 1000)); // 최근 1000개만
}

export async function queryAudit({ scope, target, shift, limit = 50 } = {}) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    let q = fs.collection(db, "audit");
    const conds = [];
    if (scope)  conds.push(fs.where("scope", "==", scope));
    if (target) conds.push(fs.where("target", "==", target));
    if (shift)  conds.push(fs.where("shift", "==", shift));
    if (conds.length) q = fs.query(q, ...conds, fs.orderBy("ts", "desc"), fs.limit(limit));
    else q = fs.query(q, fs.orderBy("ts", "desc"), fs.limit(limit));
    const snap = await fs.getDocs(q);
    return snap.docs.map((d) => d.data());
  }
  const list = readLS(LS_PREFIX + "audit") || [];
  return list
    .filter((e) =>
      (!scope || e.scope === scope) &&
      (!target || e.target === target) &&
      (!shift || e.shift === shift)
    )
    .slice(0, limit);
}

// =================================================================
// 실시간 구독 — Firestore onSnapshot 사용. LocalStorage는 폴링.
// returns unsubscribe function.
// =================================================================

export async function subscribeOps(shift, kind, date, callback) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const ref = fs.collection(db, "ops", shift, kind);
    const q = fs.query(ref, fs.where("date", "==", date));
    return fs.onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(rows);
    });
  }
  // LocalStorage 폴링: 다른 탭의 storage 이벤트 감지
  const handler = (e) => {
    if (e.key === opsKey(shift, kind)) {
      listOps(shift, kind, date).then(callback);
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

// 어제 SNOP (전일 대비 표시용)
export async function getYesterdaySnop(shift, today) {
  const d = new Date(today);
  d.setDate(d.getDate() - 1);
  const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return getSnop(shift, y);
}

// =================================================================
// TC 포지션
// path: tcpos/{shift}/{date} (단일 문서, 모든 포지션 한 곳에)
// =================================================================

export async function getTCPosition(shift, date) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const ref = fs.doc(db, "tcpos", `${shift}_${date}`);
    const snap = await fs.getDoc(ref);
    return snap.exists() ? snap.data() : { positions: {}, managers: [] };
  }
  const map = readLS(LS_PREFIX + `tcpos:${shift}`) || {};
  return map[date] || { positions: {}, managers: [] };
}

export async function setTCPosition(shift, date, data) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    await fs.setDoc(fs.doc(db, "tcpos", `${shift}_${date}`), {
      ...data, updatedAt: Date.now(), shift, date,
    });
    return;
  }
  const map = readLS(LS_PREFIX + `tcpos:${shift}`) || {};
  map[date] = data;
  writeLS(LS_PREFIX + `tcpos:${shift}`, map);
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
// 백업/복원
// =================================================================

export async function exportShift(shift) {
  const result = { shift, exportedAt: Date.now(), masters: {}, flows: {}, ops: {}, share: {} };
  for (const role of ["manager", "captain", "ps", "perm", "temp"]) {
    result.masters[role] = await listMaster(shift, role);
  }
  for (const type of ["captain", "ps", "leave", "newTemp"]) {
    result.flows[type] = await listFlowSnapshot(shift, type);
  }
  for (const kind of ["pack", "pick"]) {
    result.ops[kind] = await listFlowAll(shift, kind);
  }
  for (const kind of ["pack", "pick"]) {
    result.share[kind] = await listShare(shift, kind);
  }
  return result;
}

async function listFlowSnapshot(shift, type) {
  if (USE_FIREBASE) {
    const { db, fs } = await ensureFirebase();
    const snap = await fs.getDocs(fs.collection(db, "flows", shift, type));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return readLS(flowKey(shift, type)) || [];
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
    if (USE_FIREBASE) {
      const { db, fs } = await ensureFirebase();
      const snap = await fs.getDocs(fs.collection(db, "flows", shift, type));
      for (const d of snap.docs) await fs.deleteDoc(fs.doc(db, "flows", shift, type, d.id));
    } else {
      writeLS(flowKey(shift, type), []);
    }
  }
  for (const kind of ["pack", "pick"]) {
    if (USE_FIREBASE) {
      const { db, fs } = await ensureFirebase();
      const snap = await fs.getDocs(fs.collection(db, "ops", shift, kind));
      for (const d of snap.docs) await fs.deleteDoc(fs.doc(db, "ops", shift, kind, d.id));
    } else {
      writeLS(opsKey(shift, kind), []);
    }
  }
  for (const kind of ["pack", "pick"]) {
    if (USE_FIREBASE) {
      const { db, fs } = await ensureFirebase();
      const snap = await fs.getDocs(fs.collection(db, "share", shift, kind));
      for (const d of snap.docs) await fs.deleteDoc(fs.doc(db, "share", shift, kind, d.id));
    } else {
      writeLS(shareKey(shift, kind), []);
    }
  }
}

// =================================================================
// 모드 정보
// =================================================================

export function getStorageMode() {
  return USE_FIREBASE ? "firestore" : "localstorage";
}

// =================================================================
// LocalStorage 헬퍼
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
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.warn("writeLS failed", key, e); }
}
