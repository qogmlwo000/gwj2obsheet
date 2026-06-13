// 닉네임 인증 + 세션 관리.
// 관리자: Bennett(고정) + 설정에서 추가한 관리자 닉네임 목록 (settings/admins).

import { getAllowedNicknames, getAdmins } from "./db.js";

const SESSION_KEY = "gw2ob:session";
export const ADMIN_NICKNAME = "Bennett";

let nicknameCache = null;
let nicknameCacheAt = 0;
let adminCache = null;
let adminCacheAt = 0;
const CACHE_TTL_MS = 60_000;

export function clearNicknameCache() {
  nicknameCache = null;
  nicknameCacheAt = 0;
}

export function clearAdminCache() {
  adminCache = null;
  adminCacheAt = 0;
}

export async function loadAllowedNicknames(force = false) {
  if (!force && nicknameCache && Date.now() - nicknameCacheAt < CACHE_TTL_MS) {
    return nicknameCache;
  }
  nicknameCache = await getAllowedNicknames();
  nicknameCacheAt = Date.now();
  return nicknameCache;
}

export async function loadAdmins(force = false) {
  if (!force && adminCache && Date.now() - adminCacheAt < CACHE_TTL_MS) {
    return adminCache;
  }
  adminCache = await getAdmins().catch(() => []) || [];
  adminCacheAt = Date.now();
  return adminCache;
}

export async function validateNickname(nickname) {
  const trimmed = (nickname || "").trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed === ADMIN_NICKNAME) {
    return { ok: true, role: "admin", nickname: trimmed };
  }
  // 추가 관리자 목록 (설정에서 등록)
  const admins = await loadAdmins();
  const adminHit = admins.find((n) => String(n).toLowerCase() === trimmed.toLowerCase());
  if (adminHit) return { ok: true, role: "admin", nickname: String(adminHit) };
  const list = await loadAllowedNicknames();
  const found = list.find((n) => n.toLowerCase() === trimmed.toLowerCase());
  if (found) return { ok: true, role: "user", nickname: found };
  return { ok: false, reason: "not_registered" };
}

export function setSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function isAdmin() {
  const s = getSession();
  return s && s.role === "admin";
}

export function setShift(shift) {
  const s = getSession() || {};
  s.shift = shift;
  setSession(s);
}
