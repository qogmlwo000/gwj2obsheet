// 사이트 톤 확인/알림 모달.
// confirmDialog({ title, message, danger?, yes?, no? }) → Promise<boolean>
// alertDialog({ title, message, kind?: 'success'|'error'|'info' }) → Promise<void>

export function confirmDialog({
  title = "확인",
  message = "",
  danger = false,
  yes = "확인",
  no = "취소",
  detail = null, // 추가 상세(예: HTML string)
} = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById("modal-root");
    if (!root) return resolve(false);

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const modal = document.createElement("div");
    modal.className = "modal dialog-modal" + (danger ? " danger" : "");

    modal.innerHTML = `
      <div class="dialog-icon">${danger ? "⚠️" : "❓"}</div>
      <h3 class="dialog-title">${escape(title)}</h3>
      <p class="dialog-message">${escape(message)}</p>
      ${detail ? `<div class="dialog-detail">${detail}</div>` : ""}
      <div class="dialog-actions">
        <button class="btn ghost" data-no>${escape(no)}</button>
        <button class="btn ${danger ? "danger" : "primary"}" data-yes>${escape(yes)}</button>
      </div>
    `;

    backdrop.appendChild(modal);
    root.appendChild(backdrop);

    const onKey = (e) => { if (e.key === "Escape") close(false); };
    const close = (v) => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(v);
    };
    document.addEventListener("keydown", onKey);
    modal.querySelector("[data-yes]").addEventListener("click", () => close(true));
    modal.querySelector("[data-no]").addEventListener("click", () => close(false));
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(false); });

    // 위험 동작은 "취소"에 기본 포커스 — Enter 실수로 삭제되는 것 방지
    setTimeout(() => modal.querySelector(danger ? "[data-no]" : "[data-yes]").focus(), 50);
  });
}

export function alertDialog({ title = "알림", message = "", kind = "info" } = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById("modal-root");
    if (!root) return resolve();
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const modal = document.createElement("div");
    modal.className = `modal dialog-modal kind-${kind}`;
    const icon = kind === "success" ? "✅" : kind === "error" ? "❌" : "ℹ️";
    modal.innerHTML = `
      <div class="dialog-icon">${icon}</div>
      <h3 class="dialog-title">${escape(title)}</h3>
      <p class="dialog-message">${escape(message)}</p>
      <div class="dialog-actions">
        <button class="btn primary" data-ok>확인</button>
      </div>
    `;
    backdrop.appendChild(modal);
    root.appendChild(backdrop);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const close = () => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve();
    };
    document.addEventListener("keydown", onKey);
    modal.querySelector("[data-ok]").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    setTimeout(() => modal.querySelector("[data-ok]").focus(), 50);
  });
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
