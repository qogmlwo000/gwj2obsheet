// 통합 데이터 액세스 레이어.
// Firebase가 설정+권한 OK → Firestore. permission-denied 등 실패 시 자동 LocalStorage 폴백.
//
// 실시간 구독: subscribeOps / subscribeMaster / subscribeFlow / subscribeShare /
//             subscribeTCPosition / subscribeDeadlines / subscribeSnop
// 모두 unsubscribe 함수를 반환. LocalStorage 모드에서는 storage 이벤트로 폴백.
//
// ── v3 동기화 메커니즘 (masters / flows / ops / share 4개 리스트형 컬렉션 대상) ──
//  1) pending 레지스트리: 오프라인/장애 중 일어난 쓰기·삭제를 `gw2ob:pending:<key>` 에 기록.
//  2) 권위적 읽기(서버 getDocs/onSnapshot 성공) 시:
//     - 서버에 없고 pending 도 아닌 LS 전용 행을 제거 → "삭제한 행이 되살아나는" 좀비 차단.
//     - pending 으로 기록된 쓰기·삭제를 Firestore 로 자동 플러시 (오프라인 복구 동기화).
//  3) 순수 LocalStorage 모드(Firebase 미설정)에서는 pending 이 생기지 않으므로 어떤 행도 prune 되지 않음.

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

// 오류 분류 공통 처리 — safe() / safeRead() / 구독 에러 콜백에서 공유
function classifyFsError(e) {
  if (isPermDenied(e)) {
    if (useFirebase) {
      useFirebase = false;
      console.warn("[db] Firebase 권한 거부 — LocalStorage 폴백 모드로 전환");
      window.dispatchEvent(new CustomEvent("gw2ob:fb-fallback", { detail: { reason: "permission" } }));
    }
    return "perm";
  }
  if (isTransient(e)) {
    console.warn("[db] Firestore 일시 오류 — LocalStorage 폴백:", e?.message || e);
    window.dispatchEvent(new CustomEvent("gw2ob:fb-transient", { detail: { message: String(e?.message || e) } }));
    return "transient";
  }
  console.warn("[db] Firestore 작업 실패, LocalStorage 폴백:", e?.message || e);
  return "other";
}

async function safe(fbFn, lsFn) {
  if (!useFirebase) return lsFn();
  try {
    return await fbFn();
  } catch (e) {
    classifyFsError(e);
    return lsFn();
  }
}

// 읽기 전용 — 결과와 함께 "권위적(서버 성공) 여부"를 반환
async function safeRead(fbFn) {
  if (!useFirebase) return { rows: null, auth: false };
  try {
    return { rows: await fbFn(), auth: true };
  } catch (e) {
    classifyFsError(e);
    return { rows: null, auth: false };
  }
}

// 오프라인 시 Firestore 쓰기 promise 가 영원히 pending 되는 것 방지.
// 메시지에 "deadline" 포함 → isTransient 매칭 → safe() 가 LS 폴백 + pending 기록.
function withTimeout(p, ms = 4000) {
  return Promise.race([
    p,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error("deadline: firestore write timeout (offline?)")), ms)
    ),
  ]);
}

export function getStorageMode() {
  return useFirebase ? "firestore" : "localstorage";
}
export function isFallbackActive() {
  return FB_CONFIGURED && !useFirebase;
}

// =================================================================
// pending 레지스트리 — 오프라인/장애 중의 쓰기·삭제 기록
//   gw2ob:pending:<suffix> = { up: { id: ts }, del: { id: ts } }
//   (id 는 up/del 중 한쪽에만 존재)
// =================================================================

function pendingKey(lsKey) {
  return LS_PREFIX + "pending:" + lsKey.slice(LS_PREFIX.length);
}
function readPending(lsKey) {
  try {
    const raw = localStorage.getItem(pendingKey(lsKey));
    const p = raw ? JSON.parse(raw) : null;
    return { up: (p && p.up) || {}, del: (p && p.del) || {} };
  } catch { return { up: {}, del: {} }; }
}
function writePending(lsKey, p) {
  try {
    const empty = !Object.keys(p.up || {}).length && !Object.keys(p.del || {}).length;
    if (empty) localStorage.removeItem(pendingKey(lsKey));
    else localStorage.setItem(pendingKey(lsKey), JSON.stringify(p));
  } catch {}
}
function markPendingUpsert(lsKey, id) {
  if (!FB_CONFIGURED || id == null || id === "") return;
  const p = readPending(lsKey);
  delete p.del[String(id)];
  p.up[String(id)] = Date.now();
  writePending(lsKey, p);
}
function markPendingDelete(lsKey, id) {
  if (!FB_CONFIGURED || id == null || id === "") return;
  const p = readPending(lsKey);
  delete p.up[String(id)];
  p.del[String(id)] = Date.now();
  writePending(lsKey, p);
}
function clearPending(lsKey, id) {
  if (!FB_CONFIGURED || id == null) return;
  const p = readPending(lsKey);
  if (!(String(id) in p.up) && !(String(id) in p.del)) return;
  delete p.up[String(id)];
  delete p.del[String(id)];
  writePending(lsKey, p);
}
function hasPending(lsKey) {
  const p = readPending(lsKey);
  return Object.keys(p.up).length > 0 || Object.keys(p.del).length > 0;
}

// __ 로 시작하는 로컬 전용 키(__errors, __dup, __editStartUpdatedAt 등) 제거
function stripLocal(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (!k.startsWith("__")) out[k] = v;
  }
  return out;
}

// Firestore 결과 + LocalStorage 결과를 id 기준으로 머지.
// - pending.del 행은 항상 숨김 (오프라인 삭제 즉시 반영)
// - pending.up 행은 LS 우선 (미반영 로컬 수정 보존)
// - auth(권위적 결과)면 FB에 없고 pending 도 아닌 LS 전용 행 제거 (좀비 정리)
function mergeRows(fbRows, lsRows, pending, auth) {
  const up = pending?.up || {};
  const del = pending?.del || {};
  const map = new Map();
  for (const r of (lsRows || [])) {
    if (!r || r.id == null) continue;
    const id = String(r.id);
    if (del[id]) continue;
    map.set(id, r);
  }
  const fbIds = new Set();
  for (const r of (fbRows || [])) {
    if (!r || r.id == null) continue;
    const id = String(r.id);
    fbIds.add(id);
    if (del[id]) { map.delete(id); continue; }
    if (up[id] && map.has(id)) continue; // 미반영 로컬 수정 우선
    map.set(id, r);
  }
  if (auth) {
    for (const id of [...map.keys()]) {
      if (!fbIds.has(id) && !up[id]) map.delete(id);
    }
  }
  return [...map.values()];
}

// 권위적 읽기 후 LS 미러를 서버 상태와 일치시킴 (변경 시에만 기록 — 이벤트 루프 차단).
// datePred 가 있으면 그 파티션(해당 날짜)만 교체하고 다른 날짜 행은 보존.
function reconcileMirror(lsKey, mergedRows, datePred) {
  const old = readLS(lsKey) || [];
  const next = datePred
    ? [...old.filter((r) => !datePred(r)), ...mergedRows]
    : mergedRows;
  if (JSON.stringify(next) === JSON.stringify(old)) return;
  const newIds = new Set(next.map((r) => String(r?.id)));
  const pruned = old.filter((r) => r?.id != null && !newIds.has(String(r.id))).map((r) => r.id);
  if (pruned.length) console.info("[db] LS 미러 정리 (서버 기준):", lsKey, pruned);
  writeLS(lsKey, next);
}

// =================================================================
// pending 플러시 — 오프라인 복구 시 자동 동기화
// =================================================================

const flushInFlight = new Set();

function scheduleFlush(scope) {
  if (!FB_CONFIGURED || !useFirebase) return;
  if (!hasPending(scope.lsKey)) return;
  setTimeout(() => { flushPending(scope).catch(() => {}); }, 0);
}

async function flushPending(scope) {
  const { lsKey, segs } = scope;
  if (!FB_CONFIGURED || !useFirebase) return;
  if (flushInFlight.has(lsKey)) return;
  const p = readPending(lsKey);
  const delIds = Object.keys(p.del);
  const upIds = Object.keys(p.up);
  if (!delIds.length && !upIds.length) return;
  flushInFlight.add(lsKey);
  try {
    const { db, fs } = await ensureFirebase();
    // 삭제 먼저 (쿠코드 변경 = 구 id 삭제 + 신 id 업서트 순서 보장)
    for (const id of delIds) {
      try {
        await withTimeout(fs.deleteDoc(fs.doc(db, ...segs, id)), 8000);
        const cur = readPending(lsKey);
        delete cur.del[id];
        writePending(lsKey, cur);
        console.info("[db] 오프라인 삭제 동기화:", lsKey, id);
      } catch (e) { classifyFsError(e); return; }
    }
    for (const id of upIds) {
      const row = (readLS(lsKey) || []).find((r) => String(r?.id) === id);
      if (!row) {
        const cur = readPending(lsKey);
        delete cur.up[id];
        writePending(lsKey, cur);
        continue;
      }
      const ts = row.updatedAt;
      try {
        await withTimeout(fs.setDoc(fs.doc(db, ...segs, id), stripLocal(row), { merge: true }), 8000);
        // 플러시 도중 사용자가 다시 수정했다면(pending 재기록) 해제하지 않음
        const after = (readLS(lsKey) || []).find((r) => String(r?.id) === id);
        if (!after || after.updatedAt === ts) {
          const cur = readPending(lsKey);
          delete cur.up[id];
          writePending(lsKey, cur);
        }
        console.info("[db] 오프라인 변경 동기화:", lsKey, id);
      } catch (e) { classifyFsError(e); return; }
    }
  } finally {
    flushInFlight.delete(lsKey);
  }
}

// localStorage 의 모든 pending 키를 스캔해 일괄 플러시 (복구·로드 시 안전망)
async function flushAllPending() {
  if (!FB_CONFIGURED || !useFirebase) return;
  const prefix = LS_PREFIX + "pending:";
  const colMap = { master: "masters", flow: "flows", ops: "ops", share: "share" };
  const scopes = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    const parts = k.slice(prefix.length).split(":"); // 예: ["ops","day","pack"]
    const col = colMap[parts[0]];
    if (!col || parts.length !== 3) continue;
    scopes.push({ lsKey: LS_PREFIX + parts.join(":"), segs: [col, parts[1], parts[2]] });
  }
  for (const s of scopes) {
    try { await flushPending(s); } catch {}
  }
}

// =================================================================
// LocalStorage 키 / scope 헬퍼
// =================================================================

const masterKey = (shift, role) => `${LS_PREFIX}master:${shift}:${role}`;
const flowKey   = (shift, type) => `${LS_PREFIX}flow:${shift}:${type}`;
const opsKey    = (shift, kind) => `${LS_PREFIX}ops:${shift}:${kind}`;
const shareKey  = (shift, kind) => `${LS_PREFIX}share:${shift}:${kind}`;

const masterScope = (shift, role) => ({ lsKey: masterKey(shift, role), segs: ["masters", shift, role] });
const flowScope   = (shift, type) => ({ lsKey: flowKey(shift, type),   segs: ["flows", shift, type] });
const opsScope    = (shift, kind) => ({ lsKey: opsKey(shift, kind),    segs: ["ops", shift, kind] });
const shareScope  = (shift, kind) => ({ lsKey: shareKey(shift, kind),  segs: ["share", shift, kind] });

// =================================================================
// Master CRUD
// =================================================================

export async function listMaster(shift, role) {
  const scope = masterScope(shift, role);
  const ls = readLS(scope.lsKey) || [];
  const { rows: fbRows, auth } = await safeRead(async () => {
    const { db, fs } = await ensureFirebase();
    const snap = await fs.getDocs(fs.collection(db, ...scope.segs));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  const merged = mergeRows(fbRows || [], ls, readPending(scope.lsKey), auth);
  if (auth) { reconcileMirror(scope.lsKey, merged); scheduleFlush(scope); }
  return merged;
}

export async function upsertMaster(shift, role, kucode, data) {
  const docId = String(kucode || "").trim();
  if (!docId) return;
  const scope = masterScope(shift, role);
  // LocalStorage 에는 항상 저장 (폴백 시 데이터 보존)
  const lsWrite = () => {
    const list = readLS(scope.lsKey) || [];
    const idx = list.findIndex((x) => x.id === docId);
    const row = { id: docId, kucode: docId, ...data, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = { ...list[idx], ...row };
    else list.push(row);
    writeLS(scope.lsKey, list);
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const ref = fs.doc(db, ...scope.segs, docId);
      await withTimeout(fs.setDoc(ref, { ...data, kucode: docId, updatedAt: Date.now() }, { merge: true }));
      lsWrite(); // Firestore 성공해도 로컬 미러링 (오프라인 대비)
      clearPending(scope.lsKey, docId);
    },
    () => { lsWrite(); markPendingUpsert(scope.lsKey, docId); }
  );
}

// 대량 입력 — Firestore writeBatch 1회 round-trip 으로 최대 500개 처리
// rows: [{ kucode, name, team?, ... }] 형식. id 는 kucode 로 자동 설정.
// 반환: { ok: 성공개수, batches: 배치 수 }
export async function batchUpsertMaster(shift, role, rows) {
  if (!rows || !rows.length) return { ok: 0, batches: 0 };
  const scope = masterScope(shift, role);

  // LS 미러링 — 항상 먼저
  const lsWrite = () => {
    const list = readLS(scope.lsKey) || [];
    const byId = new Map(list.map((r) => [r.id, r]));
    for (const r of rows) {
      const ku = String(r.kucode || r.id || "").trim();
      if (!ku) continue;
      const existing = byId.get(ku) || {};
      byId.set(ku, { ...existing, ...r, id: ku, kucode: ku, updatedAt: Date.now() });
    }
    writeLS(scope.lsKey, [...byId.values()]);
  };
  const kucodes = rows.map((r) => String(r.kucode || r.id || "").trim()).filter(Boolean);

  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      // Firestore writeBatch 는 한 번에 최대 500 ops
      const CHUNK = 450;
      let total = 0;
      let batches = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const batch = fs.writeBatch(db);
        for (const r of chunk) {
          const ku = String(r.kucode || r.id || "").trim();
          if (!ku) continue;
          batch.set(
            fs.doc(db, ...scope.segs, ku),
            { ...stripLocal(r), kucode: ku, updatedAt: Date.now() },
            { merge: true }
          );
          total++;
        }
        await withTimeout(batch.commit(), 15000);
        batches++;
      }
      lsWrite();
      kucodes.forEach((ku) => clearPending(scope.lsKey, ku));
      return { ok: total, batches };
    },
    () => {
      lsWrite();
      kucodes.forEach((ku) => markPendingUpsert(scope.lsKey, ku));
      return { ok: rows.length, batches: 1 };
    }
  );
}

// PACK/PICK ops 도 같은 방식으로 일괄 처리
export async function batchUpsertOps(shift, kind, rows) {
  if (!rows || !rows.length) return { ok: 0, batches: 0 };
  const scope = opsScope(shift, kind);
  const lsWrite = () => {
    const list = readLS(scope.lsKey) || [];
    const byId = new Map(list.map((r) => [r.id, r]));
    for (const r of rows) {
      const id = r.id || crypto.randomUUID();
      r.id = id; // 폴백 경로에서도 호출자가 실제 id 를 받도록 반영
      const existing = byId.get(id) || {};
      byId.set(id, { ...existing, ...r, id, updatedAt: Date.now() });
    }
    writeLS(scope.lsKey, [...byId.values()]);
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const CHUNK = 450;
      let total = 0;
      let batches = 0;
      const assignedIds = [];
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const batch = fs.writeBatch(db);
        for (const r of chunk) {
          const id = r.id || crypto.randomUUID();
          r.id = id;
          assignedIds.push(id);
          batch.set(
            fs.doc(db, ...scope.segs, id),
            { ...stripLocal(r), updatedAt: Date.now() },
            { merge: true }
          );
          total++;
        }
        await withTimeout(batch.commit(), 15000);
        batches++;
      }
      lsWrite();
      assignedIds.forEach((id) => clearPending(scope.lsKey, id));
      return { ok: total, batches, ids: assignedIds };
    },
    () => {
      lsWrite();
      rows.forEach((r) => markPendingUpsert(scope.lsKey, r.id));
      return { ok: rows.length, batches: 1, ids: rows.map((r) => r.id) };
    }
  );
}

export async function deleteMaster(shift, role, kucode) {
  const id = String(kucode);
  const scope = masterScope(shift, role);
  const lsDel = () => {
    const list = readLS(scope.lsKey) || [];
    writeLS(scope.lsKey, list.filter((x) => x.id !== id));
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await withTimeout(fs.deleteDoc(fs.doc(db, ...scope.segs, id)));
      lsDel();
      clearPending(scope.lsKey, id);
    },
    () => { lsDel(); markPendingDelete(scope.lsKey, id); }
  );
}

// =================================================================
// Flow CRUD (per-day) — captain/ps/leave/newTemp
// =================================================================

export async function listFlow(shift, type, date) {
  const scope = flowScope(shift, type);
  const ls = (readLS(scope.lsKey) || []).filter((x) => x.date === date);
  const { rows: fbRows, auth } = await safeRead(async () => {
    const { db, fs } = await ensureFirebase();
    const ref = fs.collection(db, ...scope.segs);
    const q = fs.query(ref, fs.where("date", "==", date));
    const snap = await fs.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  const merged = mergeRows(fbRows || [], ls, readPending(scope.lsKey), auth);
  if (auth) { reconcileMirror(scope.lsKey, merged, (r) => r.date === date); scheduleFlush(scope); }
  return merged;
}

export async function upsertFlow(shift, type, id, data) {
  const docId = id || crypto.randomUUID();
  const scope = flowScope(shift, type);
  const lsWrite = () => {
    const list = readLS(scope.lsKey) || [];
    const idx = list.findIndex((x) => x.id === docId);
    const row = { id: docId, ...data, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = { ...list[idx], ...row };
    else list.push(row);
    writeLS(scope.lsKey, list);
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const ref = fs.doc(db, ...scope.segs, docId);
      await withTimeout(fs.setDoc(ref, { ...data, updatedAt: Date.now() }, { merge: true }));
      lsWrite();
      clearPending(scope.lsKey, docId);
      return docId;
    },
    () => { lsWrite(); markPendingUpsert(scope.lsKey, docId); return docId; }
  );
}

export async function deleteFlow(shift, type, id) {
  const scope = flowScope(shift, type);
  const lsDel = () => {
    const list = readLS(scope.lsKey) || [];
    writeLS(scope.lsKey, list.filter((x) => x.id !== id));
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await withTimeout(fs.deleteDoc(fs.doc(db, ...scope.segs, id)));
      lsDel();
      clearPending(scope.lsKey, id);
    },
    () => { lsDel(); markPendingDelete(scope.lsKey, id); }
  );
}

// =================================================================
// PACK / PICK (kind: pack | pick | pack_ws | pick_ws)
// =================================================================

export async function listOps(shift, kind, date) {
  const scope = opsScope(shift, kind);
  const ls = (readLS(scope.lsKey) || []).filter((x) => x.date === date);
  const { rows: fbRows, auth } = await safeRead(async () => {
    const { db, fs } = await ensureFirebase();
    const ref = fs.collection(db, ...scope.segs);
    const q = fs.query(ref, fs.where("date", "==", date));
    const snap = await fs.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  const merged = mergeRows(fbRows || [], ls, readPending(scope.lsKey), auth);
  if (auth) { reconcileMirror(scope.lsKey, merged, (r) => r.date === date); scheduleFlush(scope); }
  return merged;
}

// ops 컬렉션 전체 (날짜 무관) — 백업/사원카드 집계용
export async function listFlowAll(shift, kind) {
  const scope = opsScope(shift, kind);
  const ls = readLS(scope.lsKey) || [];
  const { rows: fbRows, auth } = await safeRead(async () => {
    const { db, fs } = await ensureFirebase();
    const snap = await fs.getDocs(fs.collection(db, ...scope.segs));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  const merged = mergeRows(fbRows || [], ls, readPending(scope.lsKey), auth);
  if (auth) { reconcileMirror(scope.lsKey, merged); scheduleFlush(scope); }
  return merged;
}

export async function upsertOps(shift, kind, id, data) {
  const docId = id || crypto.randomUUID();
  const scope = opsScope(shift, kind);
  const lsWrite = () => {
    const list = readLS(scope.lsKey) || [];
    const idx = list.findIndex((x) => x.id === docId);
    const row = { id: docId, ...data, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = { ...list[idx], ...row };
    else list.push(row);
    writeLS(scope.lsKey, list);
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await withTimeout(fs.setDoc(fs.doc(db, ...scope.segs, docId), { ...data, updatedAt: Date.now() }, { merge: true }));
      lsWrite();
      clearPending(scope.lsKey, docId);
      return docId;
    },
    () => { lsWrite(); markPendingUpsert(scope.lsKey, docId); return docId; }
  );
}

export async function deleteOps(shift, kind, id) {
  const scope = opsScope(shift, kind);
  const lsDel = () => {
    const list = readLS(scope.lsKey) || [];
    writeLS(scope.lsKey, list.filter((x) => x.id !== id));
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await withTimeout(fs.deleteDoc(fs.doc(db, ...scope.segs, id)));
      lsDel();
      clearPending(scope.lsKey, id);
    },
    () => { lsDel(); markPendingDelete(scope.lsKey, id); }
  );
}

// =================================================================
// 공유 시트
// =================================================================

export async function listShare(shift, kind) {
  const scope = shareScope(shift, kind);
  const ls = readLS(scope.lsKey) || [];
  const { rows: fbRows, auth } = await safeRead(async () => {
    const { db, fs } = await ensureFirebase();
    const snap = await fs.getDocs(fs.collection(db, ...scope.segs));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  const merged = mergeRows(fbRows || [], ls, readPending(scope.lsKey), auth);
  if (auth) { reconcileMirror(scope.lsKey, merged); scheduleFlush(scope); }
  return merged;
}
export async function upsertShare(shift, kind, id, data) {
  const docId = id || crypto.randomUUID();
  const scope = shareScope(shift, kind);
  const lsWrite = () => {
    const list = readLS(scope.lsKey) || [];
    const idx = list.findIndex((x) => x.id === docId);
    const row = { id: docId, ...data, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = { ...list[idx], ...row };
    else list.push(row);
    writeLS(scope.lsKey, list);
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await withTimeout(fs.setDoc(fs.doc(db, ...scope.segs, docId), { ...data, updatedAt: Date.now() }, { merge: true }));
      lsWrite();
      clearPending(scope.lsKey, docId);
      return docId;
    },
    () => { lsWrite(); markPendingUpsert(scope.lsKey, docId); return docId; }
  );
}
export async function deleteShare(shift, kind, id) {
  const scope = shareScope(shift, kind);
  const lsDel = () => {
    const list = readLS(scope.lsKey) || [];
    writeLS(scope.lsKey, list.filter((x) => x.id !== id));
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await withTimeout(fs.deleteDoc(fs.doc(db, ...scope.segs, id)));
      lsDel();
      clearPending(scope.lsKey, id);
    },
    () => { lsDel(); markPendingDelete(scope.lsKey, id); }
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

// =================================================================
// 인원 현황 대시보드 (per-shift, per-date)
// =================================================================

const DEFAULT_HEADCOUNT = {
  tc:      { plan: 0, actual: 0 },
  perm:    { plan: 0, actual: 0 },
  temp:    { plan: 0, actual: 0 },
  newbie:  { plan: 0, actual: 0 },
};

export async function getHeadcount(shift, date) {
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      const snap = await fs.getDoc(fs.doc(db, "headcount", `${shift}_${date}`));
      return snap.exists() ? snap.data() : { ...DEFAULT_HEADCOUNT };
    },
    () => {
      const map = readLS(LS_PREFIX + `headcount:${shift}`) || {};
      return map[date] || { ...DEFAULT_HEADCOUNT };
    }
  );
}

export async function setHeadcount(shift, date, data, by = "") {
  const lsWrite = () => {
    const map = readLS(LS_PREFIX + `headcount:${shift}`) || {};
    map[date] = data;
    writeLS(LS_PREFIX + `headcount:${shift}`, map);
  };
  return safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      await fs.setDoc(fs.doc(db, "headcount", `${shift}_${date}`), {
        ...data, updatedAt: Date.now(), updatedBy: by, shift, date,
      });
      lsWrite();
    },
    lsWrite
  );
}

export async function listHeadcountRange(shift, fromDate, toDate) {
  // LS — map[date] 형태에서 범위 필터
  const lsAll = readLS(LS_PREFIX + `headcount:${shift}`) || {};
  const lsRows = Object.entries(lsAll)
    .filter(([d]) => d >= fromDate && d <= toDate)
    .map(([d, v]) => ({ date: d, shift, ...v, id: `${shift}_${d}` }));

  const fb = await safe(
    async () => {
      const { db, fs } = await ensureFirebase();
      // 문서 id 가 `${shift}_${date}` 형태이므로 documentId 범위 쿼리 사용
      // → composite index 불필요 (shift+date 이중 where 는 콘솔에서 인덱스를 만들어야 해서 실패했음)
      const q = fs.query(
        fs.collection(db, "headcount"),
        fs.where(fs.documentId(), ">=", `${shift}_${fromDate}`),
        fs.where(fs.documentId(), "<=", `${shift}_${toDate}`),
      );
      const snap = await fs.getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    () => []
  );
  // Merge with LS — Firestore 가 권위적, LS 보조
  const map = new Map();
  for (const r of lsRows) map.set(r.date, r);
  for (const r of fb) if (r.date) map.set(r.date, r);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function subscribeHeadcount(shift, date, callback) {
  const lsK = LS_PREFIX + `headcount:${shift}`;
  const fire = (data) => {
    if (data) callback(data);
    else {
      const map = readLS(lsK) || {};
      callback(map[date] || { ...DEFAULT_HEADCOUNT });
    }
  };
  if (useFirebase) {
    try {
      const { db, fs } = await ensureFirebase();
      const ref = fs.doc(db, "headcount", `${shift}_${date}`);
      const unsub = fs.onSnapshot(
        ref,
        (snap) => fire(snap.exists() ? snap.data() : null),
        (err) => { classifyFsError(err); fire(null); }
      );
      fire(null);
      const unsubLs = makeLsHandler(lsK, () => fire(null));
      return () => { try { unsub(); } catch {} unsubLs(); };
    } catch (e) {
      classifyFsError(e);
    }
  }
  fire(null);
  return makeLsHandler(lsK, () => fire(null));
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
//   1) Firebase 가능하면 onSnapshot 으로 구독 — 스냅샷은 "권위적"으로 처리
//      (LS 미러 reconcile + pending 플러시).
//   2) 실패/폴백 모드면 window storage 이벤트로 LocalStorage 변경 감지.
//   3) storage 이벤트/초기 페인트는 마지막 권위적 스냅샷(lastFb)과 머지
//      → 다른 사용자의 Firestore 행이 일시적으로 사라지지 않음.

function makeLsHandler(key, deliver) {
  const handler = (e) => { if (!e.key || e.key === key) deliver(); };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

// 리스트형 구독 공통 구현
async function subscribeList(scope, lsFilter, datePred, callback, makeQuery) {
  let lastFb = null; // 마지막 권위적 스냅샷 캐시
  const fire = (fbRows, auth) => {
    if (auth) lastFb = fbRows;
    const ls = lsFilter(readLS(scope.lsKey) || []);
    const merged = mergeRows(auth ? fbRows : (lastFb || []), ls, readPending(scope.lsKey), auth);
    callback(merged);
    if (auth) { reconcileMirror(scope.lsKey, merged, datePred); scheduleFlush(scope); }
  };
  if (useFirebase) {
    try {
      const { db, fs } = await ensureFirebase();
      const q = makeQuery(db, fs);
      const unsub = fs.onSnapshot(
        q,
        (snap) => fire(snap.docs.map((d) => ({ id: d.id, ...d.data() })), true),
        (err) => { classifyFsError(err); fire(null, false); }
      );
      fire(null, false);
      const unsubLs = makeLsHandler(scope.lsKey, () => fire(null, false));
      return () => { try { unsub(); } catch {} unsubLs(); };
    } catch (e) {
      classifyFsError(e);
    }
  }
  fire(null, false);
  return makeLsHandler(scope.lsKey, () => fire(null, false));
}

export async function subscribeOps(shift, kind, date, callback) {
  const scope = opsScope(shift, kind);
  return subscribeList(
    scope,
    (ls) => ls.filter((x) => x.date === date),
    (r) => r.date === date,
    callback,
    (db, fs) => fs.query(fs.collection(db, ...scope.segs), fs.where("date", "==", date))
  );
}

export async function subscribeMaster(shift, role, callback) {
  const scope = masterScope(shift, role);
  return subscribeList(
    scope,
    (ls) => ls,
    null,
    callback,
    (db, fs) => fs.collection(db, ...scope.segs)
  );
}

export async function subscribeFlow(shift, type, date, callback) {
  const scope = flowScope(shift, type);
  return subscribeList(
    scope,
    (ls) => ls.filter((x) => x.date === date),
    (r) => r.date === date,
    callback,
    (db, fs) => fs.query(fs.collection(db, ...scope.segs), fs.where("date", "==", date))
  );
}

export async function subscribeShare(shift, kind, callback) {
  const scope = shareScope(shift, kind);
  return subscribeList(
    scope,
    (ls) => ls,
    null,
    callback,
    (db, fs) => fs.collection(db, ...scope.segs)
  );
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
        (err) => { classifyFsError(err); fire(null); }
      );
      fire(null);
      const unsubLs = makeLsHandler(tcPosLsKey, () => fire(null));
      return () => { try { unsub(); } catch {} unsubLs(); };
    } catch (e) {
      classifyFsError(e);
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
        (err) => { classifyFsError(err); fire(null); }
      );
      fire(null);
      const unsubLs = makeLsHandler(lsK, () => fire(null));
      return () => { try { unsub(); } catch {} unsubLs(); };
    } catch (e) {
      classifyFsError(e);
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
        (err) => { classifyFsError(err); fire(null); }
      );
      fire(null);
      const unsubLs = makeLsHandler(lsK, () => fire(null));
      return () => { try { unsub(); } catch {} unsubLs(); };
    } catch (e) {
      classifyFsError(e);
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

// flows 컬렉션 전체 (날짜 무관) — Firestore + LS 머지
async function listFlowSnapshot(shift, type) {
  const scope = flowScope(shift, type);
  const ls = readLS(scope.lsKey) || [];
  const { rows: fbRows, auth } = await safeRead(async () => {
    const { db, fs } = await ensureFirebase();
    const snap = await fs.getDocs(fs.collection(db, ...scope.segs));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  const merged = mergeRows(fbRows || [], ls, readPending(scope.lsKey), auth);
  if (auth) { reconcileMirror(scope.lsKey, merged); scheduleFlush(scope); }
  return merged;
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
  // 머지된(Firestore + LS) 목록을 순회 — Firestore 전용 문서도 빠짐없이 삭제.
  // pending 레지스트리는 지우지 않음: 오프라인 중 wipe 해도 복구 시 삭제가 전파됨.
  for (const role of ["manager", "captain", "ps", "perm", "temp"]) {
    for (const row of await listMaster(shift, role)) await deleteMaster(shift, role, row.id);
    writeLS(masterKey(shift, role), []);
  }
  for (const type of ["captain", "ps", "leave", "newTemp"]) {
    for (const r of await listFlowSnapshot(shift, type)) await deleteFlow(shift, type, r.id);
    writeLS(flowKey(shift, type), []);
  }
  for (const kind of ["pack", "pick", "pack_ws", "pick_ws"]) {
    for (const r of await listFlowAll(shift, kind)) await deleteOps(shift, kind, r.id);
    writeLS(opsKey(shift, kind), []);
  }
  for (const kind of ["pack", "pick"]) {
    for (const r of await listShare(shift, kind)) await deleteShare(shift, kind, r.id);
    writeLS(shareKey(shift, kind), []);
  }
}

// =================================================================
// LocalStorage 입출력
// =================================================================

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

// =================================================================
// 오프라인 복구 자동 동기화 — 모듈 로드 시 1회 + online 이벤트
// =================================================================

if (FB_CONFIGURED) {
  window.addEventListener("online", () => { flushAllPending().catch(() => {}); });
  flushAllPending().catch(() => {});
}
