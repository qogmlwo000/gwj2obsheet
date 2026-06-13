// 우측 하단 슬라이드 알림 패널 — 수정 이력 표시.

import { queryAudit } from "../db.js";

export async function openAuditPanel({ scope, target, shift, title }) {
  closeAuditPanel();
  const root = document.getElementById("toast-root");
  if (!root) return;

  const panel = document.createElement("aside");
  panel.className = "audit-panel";
  panel.innerHTML = `
    <header class="audit-head">
      <div class="audit-title">
        <span class="audit-icon">📜</span>
        <span>${escape(title || "수정 이력")}</span>
      </div>
      <button class="icon-btn small audit-close">✕</button>
    </header>
    <div class="audit-list">로딩 중…</div>
  `;
  document.body.appendChild(panel);
  panel.querySelector(".audit-close").addEventListener("click", closeAuditPanel);

  // ESC 로 닫기 (다이얼로그/컨텍스트 메뉴가 위에 떠있으면 그쪽 우선)
  escHandler = (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector(".dialog-modal") || document.querySelector(".ctx-menu")) return;
    closeAuditPanel();
  };
  document.addEventListener("keydown", escHandler);

  try {
    const entries = await queryAudit({ scope, target, shift, limit: 50 });
    const list = panel.querySelector(".audit-list");
    if (!entries.length) {
      list.innerHTML = `<div class="audit-empty">기록이 없습니다.</div>`;
    } else {
      list.innerHTML = entries.map((e) => formatEntry(e)).join("");
    }
  } catch (e) {
    panel.querySelector(".audit-list").innerHTML =
      `<div class="audit-empty">조회 실패</div>`;
  }
}

let escHandler = null;

export function closeAuditPanel() {
  if (escHandler) { document.removeEventListener("keydown", escHandler); escHandler = null; }
  document.querySelectorAll(".audit-panel").forEach((el) => el.remove());
}

// 스코프 → 사람이 읽기 좋은 라벨
function scopeKo(scope) {
  return ({
    "ops:pack": "PACK", "ops:pick": "PICK",
    "ops:pack_ws": "PACK W/S", "ops:pick_ws": "PICK W/S",
    tcpos: "TC 포지션", snop: "SNOP",
  })[scope] || scope || "";
}

// 행 위치 — "6.1F 싱귤" / "오토백 1.2"
function locStr(o) {
  if (!o) return "";
  const place = o.floor || o.line || "";
  const sub = o.subType ? ` ${o.subType}` : "";
  return `${place}${sub}`.trim();
}

// 사람 식별 — "D123456 | 라라 | D조"
function personStr(o, e) {
  if (!o) o = {};
  const ku = o.kucode || e?.target || "";
  const parts = [ku];
  if (o.name) parts.push(o.name);
  if (o.team) parts.push(o.team.endsWith("조") ? o.team : `${o.team}조`);
  return parts.filter(Boolean).join(" | ");
}

function formatEntry(e) {
  const time = new Date(e.ts).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const actionKo = ({ create: "추가", update: "수정", delete: "삭제", move: "이동" })[e.action] || e.action;
  const actionClass = `audit-${e.action}`;
  const detail = formatDetail(e);
  return `
    <div class="audit-item">
      <div class="audit-row">
        <span class="audit-action ${actionClass}">${actionKo}</span>
        <span class="audit-by">${escape(e.by || "—")}</span>
        <span class="audit-time">${escape(time)}</span>
      </div>
      <div class="audit-target">${escape(scopeKo(e.scope))}</div>
      ${detail ? `<div class="audit-detail">${detail}</div>` : ""}
    </div>
  `;
}

function formatDetail(e) {
  if (e.detail) return escape(String(e.detail));

  // SNOP 등 value 기반 변경
  const beforeVal = e.before && "value" in e.before ? e.before.value : null;
  const afterVal  = e.after && "value" in e.after ? e.after.value : null;
  if (beforeVal != null || afterVal != null) {
    if (beforeVal != null && afterVal != null) return `${escape(String(beforeVal))} ▶ ${escape(String(afterVal))}`;
    return escape(String(afterVal ?? beforeVal ?? ""));
  }

  // 이동 — "D123456 | 라라 | D조 · 6.3F 싱귤 ▶ 6.1F 싱귤"
  if (e.action === "move" && e.before && e.after) {
    const who = personStr(e.before, e);
    const from = locStr(e.before);
    const to = locStr(e.after);
    return `${escape(who)}<br><span class="audit-move">${escape(from || "—")} ▶ ${escape(to || "—")}</span>`;
  }

  // 추가 — "D123456 | 라라 | D조 · 6.1F 싱귤"
  if (e.action === "create" && e.after) {
    const who = personStr(e.after, e);
    const loc = locStr(e.after);
    return loc ? `${escape(who)} · ${escape(loc)}` : escape(who);
  }
  // 삭제
  if (e.action === "delete" && e.before) {
    const who = personStr(e.before, e);
    const loc = locStr(e.before);
    return loc ? `${escape(who)} · ${escape(loc)}` : escape(who);
  }

  // 수정 — 위치가 바뀌었으면 위치 변경, 아니면 바뀐 항목만 한글 라벨로
  if (e.action === "update" && e.before && e.after) {
    const beforeLoc = locStr(e.before), afterLoc = locStr(e.after);
    const who = personStr({ ...e.before, ...e.after }, e);
    if (beforeLoc && afterLoc && beforeLoc !== afterLoc) {
      return `${escape(who)}<br><span class="audit-move">${escape(beforeLoc)} ▶ ${escape(afterLoc)}</span>`;
    }
    const FIELD_KO = { name: "성함", team: "조", note: "비고", position: "포지션", leaveTime: "조퇴", gender: "성별", group: "집결지" };
    const diffs = [];
    Object.keys(FIELD_KO).forEach((k) => {
      const b = e.before[k], a = e.after[k];
      if (b == null && a == null) return;
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        diffs.push(`${FIELD_KO[k]}: ${escape(String(b || "—"))} ▶ ${escape(String(a || "—"))}`);
      }
    });
    return diffs.length ? `${escape(who)}<br>${diffs.slice(0, 4).join("<br>")}` : escape(who);
  }
  return escape(personStr(e.before || e.after, e));
}

function simplify(o) {
  if (!o || typeof o !== "object") return o;
  const { id, kucode, name, team, line, floor, subType, group, note } = o;
  return Object.fromEntries(Object.entries({ kucode, name, team, line, floor, subType, group, note }).filter(([_, v]) => v != null));
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
