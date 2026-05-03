// 쿠코드 → 모든 마스터를 인덱싱하고, 사원 표시용 라벨/색상 정보를 만들어 줍니다.
// 사용처: PACK / PICK / FLOW / 공유 탭 — 성함 셀.

import { listMaster } from "../db.js";

let cache = null;
let cachedShift = null;

export async function buildMemberIndex(shift, force = false) {
  if (!force && cache && cachedShift === shift) return cache;
  const [manager, captain, ps, perm, temp] = await Promise.all([
    listMaster(shift, "manager"),
    listMaster(shift, "captain"),
    listMaster(shift, "ps"),
    listMaster(shift, "perm"),
    listMaster(shift, "temp"),
  ]);
  const map = new Map();
  manager.forEach((r) => map.set(String(r.kucode || r.id), { ...r, role: "manager" }));
  captain.forEach((r) => map.set(String(r.kucode || r.id), { ...r, role: "captain" }));
  ps.forEach((r)      => map.set(String(r.kucode || r.id), { ...r, role: "ps" }));
  perm.forEach((r)    => map.set(String(r.kucode || r.id), { ...r, role: "perm" }));
  temp.forEach((r)    => map.set(String(r.kucode || r.id), { ...r, role: "temp" }));
  cache = { shift, map, manager, captain, ps, perm, temp };
  cachedShift = shift;
  return cache;
}

export function clearMemberIndex() {
  cache = null;
  cachedShift = null;
}

export function lookupMember(index, kucode) {
  const ku = String(kucode || "").trim();
  if (!ku || !index) return null;
  return index.map.get(ku) || null;
}

// 자동 채움 (성함, 조)
export function autofillFromMaster(index, kucode) {
  const m = lookupMember(index, kucode);
  if (!m) return null;
  if (m.role === "manager" || m.role === "captain") {
    return { name: m.name || "", team: "", nickname: m.nickname || "" };
  }
  if (m.role === "ps")   return { name: m.name || "", team: m.team || "" };
  if (m.role === "perm") return { name: m.name || "", team: m.team || "" };
  if (m.role === "temp") return { name: m.name || "", team: "단기직" };
  return null;
}

/**
 * 라벨 빌더. PACK/PICK/FLOW/공유 어디에서나 같은 결과를 보장합니다.
 * 반환: { html, classes: [], plainText }
 */
export function buildMemberLabel(member, fallbackName = "") {
  if (!member) {
    const name = String(fallbackName || "").trim();
    if (!name) return { html: "", classes: [], plainText: "" };
    return { html: escape(name), classes: ["lbl-plain"], plainText: name };
  }

  const name = (member.name || fallbackName || "").trim();
  const nick = (member.nickname || "").trim();
  const role = member.role;

  // 매니저
  if (role === "manager") {
    const txt = `👑 ${nick || name} - ${name}`;
    return { html: escape(txt), classes: ["lbl-manager"], plainText: txt };
  }
  // 팀 캡틴
  if (role === "captain") {
    const txt = `👑 ${nick || name} - ${name}`;
    return { html: escape(txt), classes: ["lbl-captain"], plainText: txt };
  }
  // PS
  if (role === "ps") {
    const txt = `🍀 ${name} - PS`;
    return { html: escape(txt), classes: ["lbl-ps"], plainText: txt };
  }

  // PERM / TEMP — 하이스킬 + 특수 라벨
  const hi = Array.isArray(member.hiSkill) ? member.hiSkill : [];
  const sp = Array.isArray(member.special) ? member.special : [];
  // 하이스킬 (메뉴얼팩 / 오토백 / 집품 / 워터)
  const isManual  = hi.includes("메뉴얼팩") || hi.includes("메뉴얼");
  const isAutoBag = hi.includes("오토백");
  const isPick    = hi.includes("집품");
  const isWaterHi = hi.includes("워터");
  // 특수 (오더피커 / AGV / 워터)
  const isOrderPicker = sp.includes("오더피커");
  const isWS          = sp.includes("워터");

  let suffix = "";
  if (isOrderPicker) suffix = " - OrderPicker";
  else if (isWS) suffix = " - W/S";

  const text = name + suffix;
  const classes = [];
  // 워터 hiSkill 우선 (흐름 효과 살리기)
  if (isWaterHi)       classes.push("lbl-water");
  else if (isPick)     classes.push("lbl-pick");
  else if (isAutoBag)  classes.push("lbl-autobag");
  else if (isManual)   classes.push("lbl-manual");
  else classes.push("lbl-plain");
  if (role === "temp") classes.push("lbl-temp");

  return { html: escape(text), classes, plainText: text };
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
