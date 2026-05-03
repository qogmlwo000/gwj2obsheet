// 가벼운 토스트 메시지.

export function showToast(message, type = "") {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const t = document.createElement("div");
  t.className = "toast" + (type ? ` ${type}` : "");
  t.textContent = message;
  root.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
