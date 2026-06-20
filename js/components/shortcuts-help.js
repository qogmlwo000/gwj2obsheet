// 단축키 안내 모달 — "?" 키 또는 상단 ⌨ 버튼으로 열림.

const SHORTCUTS = [
  {
    group: "타각 · 입력",
    items: [
      { keys: ["타각(스캔)"], desc: "쿠코드 칸을 클릭한 뒤 스캔하면 자동으로 다음 행 쿠코드 칸으로 내려감 (연속 타각)" },
      { keys: ["Enter"], desc: "셀에서 같은 칸 다음 행으로 이동 · 확인창에서는 '확인'" },
      { keys: ["Tab"], desc: "다음 입력 칸으로 이동 (마지막 칸에서는 새 행 추가)" },
      { keys: ["Ctrl", "V"], desc: "엑셀에서 복사한 영역을 표에 붙여넣기 (여러 행 한 번에)" },
    ],
  },
  {
    group: "복사 · 삭제",
    items: [
      { keys: ["Ctrl", "C"], desc: "선택한 행의 쿠코드만 복사 (쿠코드 | 성함은 선택바 버튼)" },
      { keys: ["Delete"], desc: "선택한 행 일괄 삭제 (확인창에서 Enter 로 확정)" },
      { keys: ["Backspace"], desc: "입력칸 안에서 글자 삭제 — 행 삭제가 아님" },
    ],
  },
  {
    group: "선택 · 이동 · 기타",
    items: [
      { keys: ["드래그"], desc: "행 체크박스나 셀을 드래그해 여러 행을 한 번에 선택" },
      { keys: ["Shift", "클릭"], desc: "범위 선택 (처음 선택한 행 ~ 클릭한 행)" },
      { keys: ["Esc"], desc: "검색 초기화 · 확인창/모달 닫기 · TC 한 장 보기 종료" },
      { keys: ["?"], desc: "이 단축키 안내 열기" },
    ],
  },
];

let isOpen = false;

export function openShortcutsHelp() {
  if (isOpen) return;
  const root = document.getElementById("modal-root");
  if (!root) return;
  isOpen = true;

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const modal = document.createElement("div");
  modal.className = "modal shortcuts-modal";
  modal.innerHTML = `
    <div class="modal-header">
      <h3>⌨ 단축키 안내</h3>
      <button class="btn ghost" data-close>✕</button>
    </div>
    <div class="modal-body shortcuts-body">
      ${SHORTCUTS.map((g) => `
        <div class="sc-group">
          <div class="sc-group-title">${escape(g.group)}</div>
          ${g.items.map((it) => `
            <div class="sc-row">
              <div class="sc-keys">${it.keys.map((k) => `<kbd class="sc-key">${escape(k)}</kbd>`).join('<span class="sc-plus">+</span>')}</div>
              <div class="sc-desc">${escape(it.desc)}</div>
            </div>
          `).join("")}
        </div>
      `).join("")}
    </div>
  `;
  backdrop.appendChild(modal);
  root.appendChild(backdrop);

  const close = () => {
    isOpen = false;
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
  };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
  document.addEventListener("keydown", onKey);
  modal.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
}

// "?" 키로 열기 — 한 번만 등록 (페이지 수명 동안 유지).
let registered = false;
export function initShortcutsHelp() {
  if (registered) return;
  registered = true;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "?") return;
    const ae = document.activeElement;
    // 입력 중에는 무시 (검색/셀/입력칸에서 ? 타이핑 가능하게)
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
    if (document.querySelector(".modal-backdrop")) return; // 다른 모달이 떠 있으면 무시
    e.preventDefault();
    openShortcutsHelp();
  });
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
