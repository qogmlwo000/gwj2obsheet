// 우클릭 컨텍스트 메뉴.
// openContextMenu(x, y, items) — items: [{label, icon?, danger?, sub?, onClick?, disabled?}]

let active = null;

export function openContextMenu(x, y, items) {
  closeContextMenu();
  const menu = renderMenu(items, () => closeContextMenu());
  document.body.appendChild(menu);
  // 위치 보정
  const r = menu.getBoundingClientRect();
  let left = x;
  let top = y;
  if (x + r.width + 8 > window.innerWidth) left = window.innerWidth - r.width - 8;
  if (y + r.height + 8 > window.innerHeight) top = window.innerHeight - r.height - 8;
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  active = menu;

  setTimeout(() => {
    document.addEventListener("mousedown", onDocClick, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("resize", closeContextMenu);
  }, 0);
}

export function closeContextMenu() {
  document.removeEventListener("mousedown", onDocClick, true);
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("scroll", closeContextMenu, true);
  window.removeEventListener("resize", closeContextMenu);
  if (active) active.remove();
  active = null;
}

function onDocClick(e) {
  if (active && !active.contains(e.target)) closeContextMenu();
}
function onKey(e) {
  if (e.key === "Escape") closeContextMenu();
}

function renderMenu(items, close) {
  const wrap = document.createElement("div");
  wrap.className = "ctx-menu";
  items.forEach((it) => {
    if (it.divider) {
      const hr = document.createElement("div");
      hr.className = "ctx-divider";
      wrap.appendChild(hr);
      return;
    }
    if (it.heading) {
      const h = document.createElement("div");
      h.className = "ctx-heading";
      h.textContent = it.heading;
      wrap.appendChild(h);
      return;
    }
    const row = document.createElement("button");
    row.className = "ctx-item" + (it.danger ? " danger" : "");
    row.disabled = !!it.disabled;
    row.innerHTML =
      (it.icon ? `<span class="ctx-icon">${it.icon}</span>` : "") +
      `<span class="ctx-label">${escape(it.label)}</span>` +
      (it.sub ? `<span class="ctx-arrow">▸</span>` : "");
    if (it.sub) {
      let subEl = null;
      row.addEventListener("mouseenter", () => {
        if (subEl) return;
        subEl = renderMenu(it.sub, close);
        subEl.classList.add("ctx-submenu");
        wrap.appendChild(subEl);
        const r = row.getBoundingClientRect();
        const sr = subEl.getBoundingClientRect();
        let left = r.right - 4;
        if (left + sr.width > window.innerWidth) left = r.left - sr.width + 4;
        subEl.style.position = "fixed";
        subEl.style.left = `${left}px`;
        subEl.style.top = `${r.top}px`;
      });
      row.addEventListener("mouseleave", (e) => {
        // 자식 메뉴 위로 이동한 경우는 유지
        const to = e.relatedTarget;
        if (subEl && to && subEl.contains(to)) return;
        if (subEl) { subEl.remove(); subEl = null; }
      });
    } else if (it.onClick) {
      row.addEventListener("click", () => {
        if (it.disabled) return;
        close();
        it.onClick();
      });
    }
    wrap.appendChild(row);
  });
  return wrap;
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
