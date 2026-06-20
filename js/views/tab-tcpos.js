// TC 포지션 탭 — 시업 전 한 화면에 보는 Team Captain 포지션 보드.
// 매니저 / PACK 7 / PICK 7 / 부가 업무 6종 (색상 칩).
// 각 포지션: "닉네임 - 성함" 카드 + 부가 업무 배경색.
// 실시간 구독: subscribeTCPosition 로 다른 사용자 변경 자동 반영.

import { listMaster, getTCPosition, setTCPosition, logAudit, subscribeTCPosition } from "../db.js";
import { isAdmin, getSession } from "../auth.js";
import { showToast } from "../toast.js";
import { openContextMenu, closeContextMenu } from "../components/context-menu.js";
import { captureElement, downloadBlob } from "../capture.js";
import { businessToday } from "../biz-date.js";

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
  dateInput.value = businessToday(shift);
  head.appendChild(dateInput);

  const printBtn = document.createElement("button");
  printBtn.className = "btn ghost";
  printBtn.innerHTML = "🖼 한 장으로 보기";
  head.appendChild(printBtn);

  // 전체화면(한 장으로 보기) 종료용 플로팅 버튼 — 상단바가 숨겨져도 빠져나올 수 있게
  const exitFsBtn = document.createElement("button");
  exitFsBtn.className = "tc-exit-fs";
  exitFsBtn.innerHTML = "✕ 닫기 (ESC)";
  exitFsBtn.title = "한 장으로 보기 종료";
  function setFullscreen(on) {
    document.body.classList.toggle("tc-fullscreen", on);
    if (on && !exitFsBtn.isConnected) document.body.appendChild(exitFsBtn);
    else if (!on && exitFsBtn.isConnected) exitFsBtn.remove();
  }
  printBtn.addEventListener("click", () => setFullscreen(!document.body.classList.contains("tc-fullscreen")));
  exitFsBtn.addEventListener("click", () => setFullscreen(false));
  const onFsKey = (e) => {
    if (e.key === "Escape" && document.body.classList.contains("tc-fullscreen")) {
      if (document.querySelector(".tc-picker-modal")) return; // 피커가 위에 있으면 그쪽 우선
      setFullscreen(false);
    }
  };
  document.addEventListener("keydown", onFsKey);

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
  // role 태깅 — 피커에서 Manager / Captain 구분 표시용 (마스터 행에는 role 필드가 없음)
  const allTCs = [
    ...managers.map((m) => ({ ...m, role: "manager" })),
    ...captains.map((c) => ({ ...c, role: "captain" })),
  ];

  let data = await getTCPosition(shift, dateInput.value);
  if (!data || !data.positions) data = { positions: {}, managers: [] };

  let unsubTC = null;
  let pickerOpen = false; // 모달 열려있는 동안 외부 변경으로 깜빡임 방지

  function renderBoard() {
    board.innerHTML = "";

    // ── 매니저 섹션 (3칸)
    board.appendChild(makeSection("👑", "Manager", "매니저", MANAGER_SLOTS, "manager", true));

    // ── PACK / PICK 2단
    const cols = document.createElement("div");
    cols.className = "tc2-cols";
    cols.appendChild(makeSection("📦", "PACK", "포장", PACK_POSITIONS, "pack"));
    cols.appendChild(makeSection("🛒", "PICK", "집품", PICK_POSITIONS, "pick"));
    board.appendChild(cols);

    // ── 부가 업무 범례
    const legend = document.createElement("section");
    legend.className = "tc2-legend";
    legend.innerHTML = `<div class="tc2-legend-title">부가 업무</div>`;
    const list = document.createElement("div");
    list.className = "tc2-legend-list";
    EXTRAS.forEach((ex) => {
      const chip = document.createElement("span");
      chip.className = "tc2-legend-chip";
      chip.style.background = ex.color;
      chip.style.color = ex.fg;
      chip.textContent = ex.label;
      list.appendChild(chip);
    });
    legend.appendChild(list);
    board.appendChild(legend);
  }

  function makeSection(icon, title, sub, positions, kind, mgr = false) {
    const sec = document.createElement("section");
    sec.className = `tc2-section tc2-section-${kind}`;
    const head = document.createElement("div");
    head.className = "tc2-section-head";
    head.innerHTML = `<span class="tc2-section-icon">${icon}</span><span class="tc2-section-title">${escape(title)}</span><span class="tc2-section-sub">${escape(sub)}</span>`;
    sec.appendChild(head);
    const grid = document.createElement("div");
    grid.className = "tc2-grid" + (mgr ? " tc2-grid-mgr" : "");
    positions.forEach((p) => grid.appendChild(makePositionCard(p, kind)));
    sec.appendChild(grid);
    return sec;
  }

  function makePositionCard(slot, kind) {
    const card = document.createElement("article");
    card.className = `tc2-card tc2-${kind}`;
    const cur = data.positions[slot.id] || { kucode: "", extras: [] };
    const captain = allTCs.find((c) => c.kucode === cur.kucode);
    const extraIds = cur.extras || [];

    // 부가 업무 색상 — 좌측 라인 바를 첫 번째 부가 업무 색으로
    const firstExtra = extraIds.length ? EXTRAS.find((x) => x.id === extraIds[0]) : null;
    if (firstExtra) {
      card.classList.add("has-extra");
      card.style.setProperty("--extra", firstExtra.color);
    }

    const extrasHtml = extraIds.map((id) => {
      const ex = EXTRAS.find((x) => x.id === id);
      return ex ? `<span class="tc2-badge" style="background:${ex.color};color:${ex.fg}">${escape(ex.label)}</span>` : "";
    }).join("");

    card.innerHTML = `
      <div class="tc2-pos">${escape(slot.label)}</div>
      <div class="tc2-person${captain ? "" : " empty"}">${
        captain
          ? `<span class="tc2-nick">${escape(captain.nickname || captain.name || "?")}</span>${captain.name ? `<span class="tc2-name">${escape(captain.name)}</span>` : ""}`
          : `<span class="tc2-empty">미정</span>`
      }</div>
      ${extrasHtml ? `<div class="tc2-extras">${extrasHtml}</div>` : ""}
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
    pickerOpen = true;
    const cur = data.positions[slot.id] || { kucode: "", extras: [] };

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
          <input type="text" class="tc-picker-search" id="tc-picker-search" placeholder="🔎 닉네임 / 성함 / 쿠코드 검색" autocomplete="off" />
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

    // TC 목록 — 검색 필터 지원
    const list = modal.querySelector("#tc-picker-list");
    const searchEl = modal.querySelector("#tc-picker-search");
    function renderList(q = "") {
      const query = q.trim().toLowerCase();
      const matched = !query ? allTCs : allTCs.filter((c) =>
        `${c.nickname || ""} ${c.name || ""} ${c.kucode || ""}`.toLowerCase().includes(query)
      );
      list.innerHTML = "";
      const clearBtn = document.createElement("button");
      clearBtn.className = "tc-picker-item" + (pickedKu === "" ? " active" : "");
      clearBtn.dataset.ku = "";
      clearBtn.textContent = "— 비우기 —";
      clearBtn.addEventListener("click", () => {
        pickedKu = "";
        list.querySelectorAll(".tc-picker-item").forEach((b) => b.classList.toggle("active", b.dataset.ku === ""));
      });
      list.appendChild(clearBtn);
      if (!matched.length) {
        const none = document.createElement("div");
        none.className = "tc-picker-none";
        none.textContent = "검색 결과가 없습니다";
        list.appendChild(none);
        return;
      }
      matched.forEach((c) => {
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
    }
    renderList();
    searchEl.addEventListener("input", () => renderList(searchEl.value));
    setTimeout(() => searchEl.focus(), 60);

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

    // 닫기 / 저장 (ESC 포함)
    const onEsc = (e) => { if (e.key === "Escape") close(); };
    const close = () => {
      document.removeEventListener("keydown", onEsc);
      pickerOpen = false;
      backdrop.remove();
    };
    document.addEventListener("keydown", onEsc);
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

  // 실시간 구독 셋업 — 날짜 변경 시 재구독
  async function ensureSubscription() {
    if (unsubTC) { try { unsubTC(); } catch {} unsubTC = null; }
    let firstSnapshot = true;
    unsubTC = await subscribeTCPosition(shift, dateInput.value, (remote) => {
      if (firstSnapshot) { firstSnapshot = false; return; }
      if (pickerOpen) return; // 편집 모달이 열려있으면 깜빡임 방지
      if (!remote || !remote.positions) return;
      data = remote;
      renderBoard();
    });
  }

  dateInput.addEventListener("change", async () => {
    data = await getTCPosition(shift, dateInput.value);
    if (!data || !data.positions) data = { positions: {}, managers: [] };
    renderBoard();
    await ensureSubscription();
  });

  renderBoard();
  await ensureSubscription();

  // ───── TC 보드 PNG 캡처 ─────
  async function captureBoard() {
    try {
      captureBtn.disabled = true;
      captureBtn.textContent = "캡처 중…";
      const blob = await captureElement(board);
      downloadBlob(blob, `TC-포지션_${shift.toUpperCase()}_${dateInput.value}.png`);
      showToast("캡처 완료", "success");
    } catch (e) {
      console.error(e);
      showToast("캡처 실패: " + (e.message || e), "error");
    } finally {
      captureBtn.disabled = false;
      captureBtn.innerHTML = "📸 캡처 (PNG)";
    }
  }

  return () => {
    if (unsubTC) try { unsubTC(); } catch {}
    document.removeEventListener("keydown", onFsKey);
    // "한 장으로 보기" 모드가 켜진 채 탭을 떠나도 잔류하지 않도록
    document.body.classList.remove("tc-fullscreen");
    if (exitFsBtn.isConnected) exitFsBtn.remove();
  };
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
