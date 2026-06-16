// 쿠코드 → 모든 마스터를 인덱싱하고, 사원 표시용 라벨/색상 정보를 만들어 줍니다.
// 사용처: PACK / PICK / FLOW / 공유 탭 — 성함 셀.

import { listMaster } from "../db.js";

let cache = null;
let cachedShift = null;

export async function buildMemberIndex(shift, force = false) {
  if (!force && cache && cachedShift === shift) return cache;
  const [manager, captain, ps, perm, temp, cd] = await Promise.all([
    listMaster(shift, "manager"),
    listMaster(shift, "captain"),
    listMaster(shift, "ps"),
    listMaster(shift, "perm"),
    listMaster(shift, "temp"),
    listMaster(shift, "cd"),
  ]);
  const map = new Map();
  manager.forEach((r) => map.set(String(r.kucode || r.id), { ...r, role: "manager" }));
  captain.forEach((r) => map.set(String(r.kucode || r.id), { ...r, role: "captain" }));
  ps.forEach((r)      => map.set(String(r.kucode || r.id), { ...r, role: "ps" }));
  perm.forEach((r)    => map.set(String(r.kucode || r.id), { ...r, role: "perm" }));
  temp.forEach((r)    => map.set(String(r.kucode || r.id), { ...r, role: "temp" }));
  cd.forEach((r)      => map.set(String(r.kucode || r.id), { ...r, role: "cd" }));
  cache = { shift, map, manager, captain, ps, perm, temp, cd };
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
  if (m.role === "cd")   return { name: m.name || "", team: m.process ? `${m.process} CD` : "CD" };
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
  // CD — 다른 공정에서 지원 (성함 - 공정 CD)
  if (role === "cd") {
    const proc = (member.process || "").trim();
    const txt = proc ? `${name} - ${proc} CD` : `${name} - CD`;
    return { html: escape(txt), classes: ["lbl-cd"], plainText: txt };
  }

  // PERM / TEMP — 이름 색상은 '진짜 하이스킬러'(하이스킬 필드)만.
  // 팩가능자(packable)·멀티는 이름 색 없음 — M/A/P 블록(buildSkillFlags)에서만 표시.
  const hi = Array.isArray(member.hiSkill) ? member.hiSkill : [];
  const sp = Array.isArray(member.special) ? member.special : [];
  // 하이스킬러 이름 색 (메뉴얼팩 / 오토백 / 집품 / 워터)
  const isManual  = hi.includes("메뉴얼팩") || hi.includes("메뉴얼");
  const isAutoBag = hi.includes("오토백");
  const isPick    = hi.includes("집품");
  const isWaterHi = hi.includes("워터");
  // 특수 (오더피커 / AGV / 워터)
  const isOrderPicker = sp.includes("오더피커");
  const isWS          = sp.includes("워터");

  let suffix = "";
  if (isOrderPicker) suffix = " - OP";
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

// ── 팩가능자 표시 (M/A/P) ──
// 메뉴얼 = 초록(멀티는 주황) / 오토백 = 파랑 / AGV = 분홍 색 블록.
export function buildSkillFlags(member) {
  const hi = Array.isArray(member?.hiSkill) ? member.hiSkill : [];
  const sp = Array.isArray(member?.special) ? member.special : [];
  const pk = Array.isArray(member?.packable) ? member.packable : [];
  const manualMulti  = sp.includes("메뉴얼 멀티");
  const autobagMulti = sp.includes("오토백 멀티");
  // M/A/P 블록 = 팩가능자 ∪ 하이스킬 ∪ 멀티 (단순 가능자도 블록엔 표시, 이름 색은 없음)
  return {
    manual:       pk.includes("메뉴얼") || hi.includes("메뉴얼팩") || hi.includes("메뉴얼") || manualMulti,
    manualMulti,
    autobag:      pk.includes("오토백") || hi.includes("오토백") || autobagMulti,
    autobagMulti,
    agv:          sp.includes("AGV"),
  };
}

// 그리드 label 컬럼용 — M/A/P 색 블록 3개 (가능: 채움 / 불가: 빈 칸)
export function buildSkillChipsLabel(member) {
  if (!member || (member.role !== "perm" && member.role !== "temp")) {
    return { html: "", classes: ["lbl-plain"], plainText: "" };
  }
  const f = buildSkillFlags(member);
  const dot = (on, cls, label, multi = false) =>
    `<span class="skill-dot ${cls}${on ? " on" : ""}${multi ? " multi" : ""}" title="${label}: ${on ? "가능" : "—"}"></span>`;
  const html =
    `<span class="skill-dots">` +
    dot(f.manual, "m", f.manualMulti ? "메뉴얼 멀티" : "메뉴얼", f.manualMulti) +
    dot(f.autobag, "a", f.autobagMulti ? "오토백 멀티" : "오토백", f.autobagMulti) +
    dot(f.agv, "p", "AGV") +
    `</span>`;
  const plain = [
    f.manual && (f.manualMulti ? "메뉴얼멀티" : "메뉴얼"),
    f.autobag && (f.autobagMulti ? "오토백멀티" : "오토백"),
    f.agv && "AGV",
  ].filter(Boolean).join(",");
  return { html, classes: ["lbl-plain", "skill-cell"], plainText: plain };
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
