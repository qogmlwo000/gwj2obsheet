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
      <div class="audit-target">${escape(e.scope || "")} · ${escape(e.target || "")}</div>
      ${detail ? `<div class="audit-detail">${detail}</div>` : ""}
    </div>
  `;
}

function formatDetail(e) {
  if (e.detail) return escape(String(e.detail));
  if (e.action === "move" && e.before && e.after) {
    return `${escape(JSON.stringify(simplify(e.before)))} → ${escape(JSON.stringify(simplify(e.after)))}`;
  }
  if (e.action === "update" && e.before && e.after) {
    const diffs = [];
    Object.keys({ ...e.before, ...e.after }).forEach((k) => {
      const b = e.before[k], a = e.after[k];
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        diffs.push(`${k}: ${escape(String(b ?? "—"))} → ${escape(String(a ?? "—"))}`);
      }
    });
    return diffs.slice(0, 4).join("<br>");
  }
  if (e.action === "create" && e.after) {
    return escape(JSON.stringify(simplify(e.after)));
  }
  if (e.action === "delete" && e.before) {
    return escape(JSON.stringify(simplify(e.before)));
  }
  return "";
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
