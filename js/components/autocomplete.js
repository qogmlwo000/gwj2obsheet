// 커스텀 자동완성 드롭다운 — 네이티브 datalist 대체.
// 사이트 디자인 토큰 (var(--surface), --accent 등) 사용으로 통일감 유지.
//
// 사용:
//   attachAutocomplete(inputEl, () => [{ value, label }, ...] 또는 ["str", ...])

let openMenu = null;

function closeAny() {
  if (openMenu) {
    try { openMenu.menu.remove(); } catch {}
    try { openMenu.input?.removeAttribute("aria-expanded"); } catch {}
    openMenu = null;
  }
}

// 스크롤/리사이즈/탭 전환 시 닫기
window.addEventListener("scroll", closeAny, true);
window.addEventListener("resize", closeAny);
window.addEventListener("hashchange", closeAny);
document.addEventListener("mousedown", (e) => {
  if (openMenu && !openMenu.menu.contains(e.target) && e.target !== openMenu.input) {
    closeAny();
  }
});
// 트리거 input 이 DOM 에서 사라지면 즉시 닫기
const liveCheck = setInterval(() => {
  if (openMenu && !document.body.contains(openMenu.input)) closeAny();
}, 500);
// liveCheck 는 메모리 누수 방지 — page unload 시 정리
window.addEventListener("beforeunload", () => clearInterval(liveCheck));

export function attachAutocomplete(input, getOptions) {
  if (!input || input.__hasAutocomplete) return;
  input.__hasAutocomplete = true;
  input.classList.add("has-ac");
  input.setAttribute("autocomplete", "off");

  let highlight = -1;
  let filtered = [];

  function build() {
    closeAny();
    const all = (getOptions && getOptions()) || [];
    if (!all.length) return;
    const q = String(input.value || "").trim().toLowerCase();
    filtered = q
      ? all.filter((o) => {
          const v = (typeof o === "string" ? o : o.value || "").toLowerCase();
          const l = (typeof o === "string" ? "" : o.label || "").toLowerCase();
          return v.includes(q) || l.includes(q);
        })
      : all.slice();
    if (!filtered.length) return;

    const menu = document.createElement("div");
    menu.className = "ac-menu";
    menu.setAttribute("role", "listbox");

    filtered.slice(0, 80).forEach((o, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "ac-item";
      item.setAttribute("role", "option");
      item.dataset.idx = i;

      const value = typeof o === "string" ? o : o.value;
      const label = typeof o === "string" ? "" : (o.label || "");
      // 라벨 형태: "C001 · 킹캡틴 (김캡틴)" 일 때 → 값 / 부가설명 분리
      const extra = label && label !== value
        ? label.replace(value, "").replace(/^[\s·•-]+/, "").trim()
        : "";

      item.innerHTML = `
        <span class="ac-v">${escape(value)}</span>
        ${extra ? `<span class="ac-l">${escape(extra)}</span>` : ""}
      `;

      item.addEventListener("mousedown", (e) => {
        e.preventDefault(); // input 이 blur 되지 않게
        select(o);
      });
      menu.appendChild(item);
    });

    // 위치 — input 바로 아래 (또는 위쪽으로 뒤집기)
    const rect = input.getBoundingClientRect();
    const menuMaxH = 280;
    const below = window.innerHeight - rect.bottom > menuMaxH + 20;
    menu.style.position = "fixed";
    menu.style.left   = `${Math.max(8, rect.left)}px`;
    menu.style.minWidth = `${Math.max(rect.width, 220)}px`;
    menu.style.maxWidth = `${Math.min(420, window.innerWidth - 16)}px`;
    menu.style.maxHeight = `${menuMaxH}px`;
    if (below) menu.style.top = `${rect.bottom + 4}px`;
    else       menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    menu.style.zIndex = "5000";

    document.body.appendChild(menu);
    input.setAttribute("aria-expanded", "true");
    openMenu = { menu, input };
    highlight = -1;
  }

  function select(o) {
    const v = typeof o === "string" ? o : o.value;
    input.value = v;
    // 그리드의 commit 로직이 input/blur 시점에 일어나므로 둘 다 트리거
    input.dispatchEvent(new Event("input",  { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    closeAny();
    input.blur();
  }

  function move(delta) {
    if (!openMenu) return;
    const items = openMenu.menu.querySelectorAll(".ac-item");
    if (!items.length) return;
    if (highlight < 0) highlight = delta > 0 ? 0 : items.length - 1;
    else highlight = Math.max(0, Math.min(items.length - 1, highlight + delta));
    items.forEach((el, i) => el.classList.toggle("active", i === highlight));
    items[highlight]?.scrollIntoView({ block: "nearest" });
  }

  let pasting = false;
  input.addEventListener("paste", () => {
    // 붙여넣기 중에는 드롭다운 안 띄움 (성능 + 시각 깔끔)
    pasting = true;
    closeAny();
    setTimeout(() => { pasting = false; }, 250);
  });
  input.addEventListener("focus", () => { if (!pasting) build(); });
  input.addEventListener("input", () => { if (!pasting) build(); });
  input.addEventListener("blur",  () => setTimeout(() => {
    // 항목 클릭으로 닫힌 경우엔 이미 closed
    if (openMenu && openMenu.input === input) closeAny();
  }, 150));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" && openMenu && highlight >= 0) {
      e.preventDefault();
      select(filtered[highlight]);
    }
    else if (e.key === "Escape") {
      if (openMenu) { e.preventDefault(); closeAny(); }
    }
  });
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
