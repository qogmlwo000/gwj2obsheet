// 닉네임 인증 + 세션 관리.

import { getAllowedNicknames } from "./db.js";

const SESSION_KEY = "gw2ob:session";
export const ADMIN_NICKNAME = "Bennett";

let nicknameCache = null;
let nicknameCacheAt = 0;
const CACHE_TTL_MS = 60_000;

export function clearNicknameCache() {
  nicknameCache = null;
  nicknameCacheAt = 0;
}

export async function loadAllowedNicknames(force = false) {
  if (!force && nicknameCache && Date.now() - nicknameCacheAt < CACHE_TTL_MS) {
    return nicknameCache;
  }
  nicknameCache = await getAllowedNicknames();
  nicknameCacheAt = Date.now();
  return nicknameCache;
}

export async function validateNickname(nickname) {
  const trimmed = (nickname || "").trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed === ADMIN_NICKNAME) {
    return { ok: true, role: "admin", nickname: trimmed };
  }
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
