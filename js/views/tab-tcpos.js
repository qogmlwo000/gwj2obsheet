// TC 포지션 탭 — 시업 전 한 화면에 보는 Team Captain 포지션 보드.
// 매니저 / PACK 7 / PICK 7 / 부가 업무 6종 (색상 칩).
// 각 포지션: "닉네임 - 성함" 카드 + 부가 업무 배경색.

import { listMaster, getTCPosition, setTCPosition, logAudit } from "../db.js";
import { isAdmin, getSession } from "../auth.js";
import { showToast } from "../toast.js";
import { openContextMenu, closeContextMenu } from "../components/context-menu.js";

// 포지션 정의
const MANAGER_SLOTS = [
  { id: "mgr1", label: "Manager 1" },
  { id: "mgr2", label: "Manager 2" },
  { id: "mgr3", label: "Manager 3" },
];

const PACK_POSITIONS = [
  { id: "pack-main",   label: "Pack Main"   },
  { id: "auto-main",   label: "Auto Main"   },
  { id: "auto-sub",    label: "Auto Sub"    },
  { id: "manual-main", label: "Manual Main" },
  { id: "manual-sub",  label: "Manual Sub"  },
  { id: "ace",         label: "ACE"         },
  { id: "pack-direct", label: "Direct"      },
];

const PICK_POSITIONS = [
  { id: "pick-main",   label: "Pick Main" },
  { id: "6f",          label: "6F"        },
  { id: "72f",         label: "7.2F"      },
  { id: "73f",         label: "7.3F"      },
  { id: "8f",          label: "8F"        },
  { id: "agv",         label: "AGV"       },
  { id: "pick-direct", label: "Direct"    },
];

// 부가 업무 — id, 라벨, 색상 (배경 + 글자)
const EXTRAS = [
  { id: "noshow",  label: "노쇼파악",     color: "#facc15", fg: "#1a1300" }, // 🟨
  { id: "tbm",     label: "TBM",         color: "#22c55e", fg: "#fff"    }, // 🟩
  { id: "ppr",     label: "PPR",         color: "#3b82f6", fg: "#fff"    }, // 🟦
  { id: "live",    label: "Live Worker", color: "#f97316", fg: "#fff"    }, // 🟧
  { id: "att",     label: "근태 공유",   color: "#a855f7", fg: "#fff"    }, // 🟪
  { id: "it",      label: "IT 장비 관리", color: "#06b6d4", fg: "#0f0f0f" }, // 🟦
];

export async function renderTCPosTab(root, ctx) {
  root.innerHTML = "";
  const { shift } = ctx;
  const admin = isAdmin();

  // 헤더
  const head = document.createElement("div");
  head.className = "tab-head";
  head.innerHTML = `
    <div class="tab-head-title"><span class="tab-head-icon">👑</span> TC 포지션 <small class="tab-head-sub">Team Captain</small></div>
  `;

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "date-input";
  dateInput.value = todayStr();
  head.appendChild(dateInput);

  const printBtn = document.createElement("button");
  printBtn.className = "btn ghost";
  printBtn.innerHTML = "🖼 한 장으로 보기";
  printBtn.addEventListener("click", () => {
    document.body.classList.toggle("tc-fullscreen");
  });
  head.appendChild(printBtn);

  // 캡처 버튼 — TC 보드만 PNG 로 저장
  const captureBtn = document.createElement("button");
  captureBtn.className = "btn primary";
  captureBtn.innerHTML = "📸 캡처 (PNG)";
  captureBtn.title = "이 화면을 이미지로 저장 (보고용)";
  captureBtn.addEventListener("click", () => captureBoard());
  head.appendChild(captureBtn);

  root.appendChild(head);

  // 보드 본문
  const board = document.createElement("div");
  board.className = "tc-board";
  root.appendChild(board);

  // 마스터에서 캡틴/매니저 가져오기
  const [captains, managers] = await Promise.all([
    listMaster(shift, "captain"),
    listMaster(shift, "manager"),
  ]);
  const allTCs = [...managers, ...captains];

  let data = await getTCPosition(shift, dateInput.value);
  if (!data || !data.positions) data = { positions: {}, managers: [] };

  function renderBoard() {
    board.innerHTML = "";

    // ── 매니저 행
    const mgrRow = document.createElement("section");
    mgrRow.className = "tc-row tc-mgr-row";
    const mgrLabel = document.createElement("div");
    mgrLabel.className = "tc-row-title";
    mgrLabel.innerHTML = `<span class="tc-row-icon">👑</span> Manager`;
    mgrRow.appendChild(mgrLabel);
    const mgrCards = document.createElement("div");
    mgrCards.className = "tc-row-cards";
    MANAGER_SLOTS.forEach((slot) => mgrCards.appendChild(makePositionCard(slot, "manager")));
    mgrRow.appendChild(mgrCards);
    board.appendChild(mgrRow);

    // ── 두 컬럼: PACK / PICK
    const cols = document.createElement("div");
    cols.className = "tc-cols";

    cols.appendChild(makeSection("📦 PACK", "포장", PACK_POSITIONS, "pack"));
    cols.appendChild(makeSection("🛒 PICK", "집품", PICK_POSITIONS, "pick"));

    board.appendChild(cols);

    // ── 부가 업무 범례
    const legend = document.createElement("section");
    legend.className = "tc-legend";
    legend.innerHTML = `<div class="tc-legend-title">부가 업무</div>`;
    const list = document.createElement("div");
    list.className = "tc-legend-list";
    EXTRAS.forEach((ex) => {
      const chip = document.createElement("span");
      chip.className = "tc-legend-chip";
      chip.style.background = ex.color;
      chip.style.color = ex.fg;
      chip.textContent = ex.label;
      list.appendChild(chip);
    });
    legend.appendChild(list);
    board.appendChild(legend);
  }

  function makeSection(title, sub, positions, kind) {
    const sec = document.createElement("section");
    sec.className = `tc-section tc-section-${kind}`;
    sec.innerHTML = `<div class="tc-section-head"><span class="tc-section-title">${title}</span><span class="tc-section-sub">${sub}</span></div>`;
    const grid = document.createElement("div");
    grid.className = "tc-section-cards";
    positions.forEach((p) => grid.appendChild(makePositionCard(p, kind)));
    sec.appendChild(grid);
    return sec;
  }

  function makePositionCard(slot, kind) {
    const card = document.createElement("article");
    card.className = `tc-pos-card tc-pos-${kind}`;
    const cur = data.positions[slot.id] || { kucode: "", extras: [] };
    const captain = allTCs.find((c) => c.kucode === cur.kucode);
    const extraIds = cur.extras || [];

    // 부가 업무 색상 적용 (가장 첫 번째 extra)
    const firstExtra = extraIds.length ? EXTRAS.find((x) => x.id === extraIds[0]) : null;
    if (firstExtra) {
      card.style.background = firstExtra.color;
      card.style.color = firstExtra.fg;
      card.classList.add("has-extra");
    }

    card.innerHTML = `
      <div class="tc-pos-label">${escape(slot.label)}</div>
      <div class="tc-pos-name">${
        captain
          ? `<span class="tc-pos-nick">${escape(captain.nickname || "?")}</span><span class="tc-pos-sep">-</span><span class="tc-pos-real">${escape(captain.name || "?")}</span>`
          : `<span class="tc-pos-empty">미정</span>`
      }</div>
      <div class="tc-pos-extras">${extraIds.map((id) => {
        const ex = EXTRAS.find((x) => x.id === id);
        if (!ex) return "";
        return `<span class="tc-extra-chip" style="background:${ex.color};color:${ex.fg}">${escape(ex.label)}</span>`;
      }).join("")}</div>
    `;

    if (admin) {
      card.classList.add("editable");
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        openPositionPicker(card, slot, kind);
      });
      card.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { heading: slot.label },
          { label: "TC 변경", icon: "👤", onClick: () => openPositionPicker(card, slot, kind) },
          { label: "비우기", icon: "🚫", danger: true, onClick: async () => {
            data.positions[slot.id] = { kucode: "", extras: [] };
            await persist();
            renderBoard();
          } },
        ]);
      });
    }

    return card;
  }

  // 포지션 → TC + 부가 업무 선택 모달
  function openPositionPicker(anchor, slot, kind) {
    closeContextMenu();
    const cur = data.positions[slot.id] || { kucode: "", extras: [] };

    // 모달 형태로 띄움
    const root = document.getElementById("modal-root");
    root.innerHTML = "";
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const modal = document.createElement("div");
    modal.className = "modal tc-picker-modal";
    modal.innerHTML = `
      <div class="modal-header">
        <h3>${escape(slot.label)} 포지션 설정</h3>
        <button class="btn ghost" data-close>✕</button>
      </div>
      <div class="modal-body">
        <div class="modal-section">
          <h4>Team Captain 선택</h4>
          <div class="tc-picker-list" id="tc-picker-list"></div>
        </div>
        <div class="modal-section">
          <h4>부가 업무</h4>
          <div class="tc-extras-list" id="tc-extras-list"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn ghost" data-close>취소</button>
        <button class="btn primary" data-save>저장</button>
      </div>
    `;
    backdrop.appendChild(modal);
    root.appendChild(backdrop);

    let pickedKu = cur.kucode || "";
    const pickedExtras = new Set(cur.extras || []);

    // TC 목록
    const list = modal.querySelector("#tc-picker-list");
    list.innerHTML = `<button class="tc-picker-item ${pickedKu === "" ? "active" : ""}" data-ku="">— 비우기 —</button>`;
    allTCs.forEach((c) => {
      const item = document.createElement("button");
      item.className = "tc-picker-item" + (pickedKu === c.kucode ? " active" : "");
      item.dataset.ku = c.kucode;
      item.innerHTML = `
        <span class="tc-picker-nick">${escape(c.nickname || "?")}</span>
        <span class="tc-picker-name">${escape(c.name || "")}</span>
        <span class="tc-picker-meta">${escape(c.role === "manager" ? "Manager" : "Captain")}</span>
      `;
      item.addEventListener("click", () => {
        pickedKu = c.kucode;
        list.querySelectorAll(".tc-picker-item").forEach((b) => b.classList.toggle("active", b.dataset.ku === pickedKu));
      });
      list.appendChild(item);
    });
    list.querySelector("[data-ku='']").addEventListener("click", () => {
      pickedKu = "";
      list.querySelectorAll(".tc-picker-item").forEach((b) => b.classList.toggle("active", b.dataset.ku === ""));
    });

    // 부가 업무
    const ex = modal.querySelector("#tc-extras-list");
    EXTRAS.forEach((extra) => {
      const chip = document.createElement("button");
      chip.className = "tc-extra-toggle" + (pickedExtras.has(extra.id) ? " on" : "");
      chip.style.setProperty("--c", extra.color);
      chip.style.setProperty("--cf", extra.fg);
      chip.textContent = extra.label;
      chip.addEventListener("click", () => {
        if (pickedExtras.has(extra.id)) pickedExtras.delete(extra.id);
        else pickedExtras.add(extra.id);
        chip.classList.toggle("on");
      });
      ex.appendChild(chip);
    });

    // 닫기 / 저장
    const close = () => backdrop.remove();
    modal.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    modal.querySelector("[data-save]").addEventListener("click", async () => {
      const before = { ...data.positions[slot.id] };
      data.positions[slot.id] = { kucode: pickedKu, extras: [...pickedExtras] };
      await persist();
      await logAudit({
        shift, scope: "tcpos", target: slot.id,
        action: before.kucode ? "update" : "create",
        by: getSession()?.nickname,
        before, after: data.positions[slot.id],
      });
      close();
      renderBoard();
      showToast("포지션 저장됨", "success");
    });
  }

  async function persist() {
    await setTCPosition(shift, dateInput.value, data);
  }

  dateInput.addEventListener("change", async () => {
    data = await getTCPosition(shift, dateInput.value);
    if (!data || !data.positions) data = { positions: {}, managers: [] };
    renderBoard();
  });

  renderBoard();

  // ───── TC 보드 PNG 캡처 ─────
  async function captureBoard() {
    try {
      captureBtn.disabled = true;
      captureBtn.textContent = "캡처 중…";
      const lib = await ensureHtml2Canvas();
      const target = board;
      // 흰 배경(라이트) / 다크 배경(다크) 적용해서 깔끔하게
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const canvas = await lib(target, {
        backgroundColor: isDark ? "#0d1117" : "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `TC-포지션_${shift.toUpperCase()}_${dateInput.value}.png`;
      a.click();
      showToast("캡처 완료", "success");
    } catch (e) {
      console.error(e);
      showToast("캡처 실패: " + (e.message || e), "error");
    } finally {
      captureBtn.disabled = false;
      captureBtn.innerHTML = "📸 캡처 (PNG)";
    }
  }
}

// html2canvas 동적 로드 (CDN)
let _html2canvasPromise = null;
async function ensureHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  if (_html2canvasPromise) return _html2canvasPromise;
  _html2canvasPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload = () => resolve(window.html2canvas);
    s.onerror = () => reject(new Error("html2canvas 로드 실패 (인터넷 연결 확인)"));
    document.head.appendChild(s);
  });
  return _html2canvasPromise;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
