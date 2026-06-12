// 체크박스 다중 선택 드롭다운(팝오버).
// openMultiSelect(anchor, options, selected) → Promise<string[]|null>
//   - 외부 클릭 또는 ESC 로 닫히면 변경된 배열을 resolve
//   - 취소(ESC) 시에도 마지막 상태로 resolve (UX 단순화)

export function openMultiSelect(anchorEl, options, selected = []) {
  return new Promise((resolve) => {
    closeAny();

    const selSet = new Set(selected);
    const pop = document.createElement("div");
    pop.className = "multi-popover";

    options.forEach((opt) => {
      const label = document.createElement("label");
      label.className = "multi-option";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selSet.has(opt);
      cb.addEventListener("change", () => {
        if (cb.checked) selSet.add(opt);
        else selSet.delete(opt);
      });
      const span = document.createElement("span");
      span.textContent = opt;
      label.appendChild(cb);
      label.appendChild(span);
      pop.appendChild(label);
    });

    document.body.appendChild(pop);
    position(pop, anchorEl);
    activePopover = pop;

    const onDocClick = (e) => {
      if (!pop.contains(e.target) && !anchorEl.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    const onScroll = () => position(pop, anchorEl);

    setTimeout(() => {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
    }, 0);

    function close() {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      pop.remove();
      activePopover = null;
      resolve(options.filter((o) => selSet.has(o)));
    }
  });
}

let activePopover = null;
function closeAny() {
  if (activePopover) activePopover.remove();
  activePopover = null;
}

function position(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  pop.style.minWidth = `${r.width}px`;
  // 좌우 화면 이탈 보정
  const popW = pop.offsetWidth || 160;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - popW - 8))}px`;
  // 아래 공간이 부족하면 위로
  const popH = pop.offsetHeight || 200;
  if (r.bottom + popH + 8 > window.innerHeight) {
    pop.style.top = `${Math.max(8, r.top - popH - 4)}px`;
  } else {
    pop.style.top = `${r.bottom + 4}px`;
  }
}
