// 사원 정보 카드 모달.
// 평균 PACK HTP / PICK HTP, 자주 들어가던 라인 1·2위, 특이사항.
// HTP는 RAW 데이터가 정의되면 거기서 계산. 지금은 자리만.

import { listFlowAll, getSpecialNote, setSpecialNote, getHtpTable } from "../db.js";
import { isAdmin, getSession } from "../auth.js";
import { showToast } from "../toast.js";

export async function openMemberCard(member, ctx) {
  if (!member) return;
  const root = document.getElementById("modal-root");
  root.innerHTML = "";
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const modal = document.createElement("div");
  modal.className = "modal member-card";

  const accent = pickAccent(member); // pack/pick/admin/ps

  modal.innerHTML = `
    <div class="member-card-head ${accent.headClass}">
      <div class="mc-role">${accent.roleLabel}</div>
      <div class="mc-name">${escape(member.name || "-")}</div>
      <div class="mc-meta">${escape(metaLine(member))}</div>
      <button class="btn ghost mc-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="mc-stats">
        <div class="mc-stat">
          <div class="mc-stat-label">평균 PACK HTP</div>
          <div class="mc-stat-value" data-stat="pack-htp">—</div>
          <div class="mc-stat-sub">RAW 탭 준비 중</div>
        </div>
        <div class="mc-stat">
          <div class="mc-stat-label">평균 PICK HTP</div>
          <div class="mc-stat-value" data-stat="pick-htp">—</div>
          <div class="mc-stat-sub">RAW 탭 준비 중</div>
        </div>
      </div>

      <div class="modal-section">
        <h4>자주 들어가던 라인</h4>
        <div class="mc-frequent">
          <div class="freq-card placeholder" data-rank="1">집계 중…</div>
          <div class="freq-card placeholder" data-rank="2">집계 중…</div>
        </div>
      </div>

      <div class="modal-section">
        <h4>특이사항</h4>
        <textarea class="mc-note" rows="3" placeholder="특이사항을 입력하세요 (모든 사용자 입력 가능)"></textarea>
        <div class="mc-note-actions">
          <button class="btn primary mc-save">💾 저장</button>
        </div>
      </div>
    </div>
  `;

  backdrop.appendChild(modal);
  root.appendChild(backdrop);

  const closeCard = () => { document.removeEventListener("keydown", onEsc); backdrop.remove(); };
  const onEsc = (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector(".dialog-modal")) return; // 확인 다이얼로그가 위에 있으면 무시
    closeCard();
  };
  document.addEventListener("keydown", onEsc);

  modal.querySelector(".mc-close").addEventListener("click", closeCard);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeCard(); });

  // 자주 들어가던 라인 집계 + HTP + 특이사항 로드
  await Promise.all([
    fillFrequent(modal, member, ctx),
    fillHtp(modal, member),
    fillNote(modal, member),
  ]);

  // 저장 핸들러 — 특이사항은 모든 사용자가 입력/수정 가능
  const noteEl = modal.querySelector(".mc-note");
  modal.querySelector(".mc-save").addEventListener("click", async () => {
    try {
      await setSpecialNote(member.kucode || member.id, noteEl.value, getSession()?.nickname);
      showToast("특이사항 저장됨", "success");
      closeCard();
    } catch (e) {
      console.error(e);
      showToast("저장 실패", "error");
    }
  });
}

// ---------- helpers ----------

function metaLine(m) {
  const parts = [];
  if (m.kucode) parts.push(m.kucode);
  if (m.team) parts.push(m.team);
  if (m.role === "captain") parts.push("Team Captain");
  if (m.role === "manager") parts.push("Manager");
  if (m.role === "ps") parts.push("PS");
  if (m.role === "perm") parts.push("계약직");
  if (m.role === "temp") parts.push("단기직");
  return parts.join("  ·  ");
}

function pickAccent(m) {
  if (m.role === "manager" || m.role === "captain" || m.role === "ps") {
    return { headClass: "mc-head-admin", roleLabel: roleKo(m.role) };
  }
  return { headClass: "mc-head-default", roleLabel: roleKo(m.role) };
}
function roleKo(r) {
  return ({
    manager: "Manager", captain: "Team Captain",
    ps: "PS", perm: "계약직", temp: "단기직",
  })[r] || "사원";
}

async function fillFrequent(modal, member, ctx) {
  const cards = modal.querySelectorAll(".freq-card");
  try {
    const ku = String(member.kucode || member.id || "");
    if (!ku) {
      cards.forEach((c, i) => { c.textContent = "기록 없음"; c.classList.remove("placeholder"); });
      return;
    }
    // PACK / PICK flow 전체 스캔
    const [packAll, pickAll] = await Promise.all([
      listFlowAll(ctx.shift, "pack"),
      listFlowAll(ctx.shift, "pick"),
    ]);
    const lineCount = new Map();
    for (const r of packAll) {
      if (String(r.kucode) !== ku) continue;
      const k = `pack:${r.line || "-"}`;
      lineCount.set(k, (lineCount.get(k) || 0) + 1);
    }
    for (const r of pickAll) {
      if (String(r.kucode) !== ku) continue;
      const k = `pick:${r.floor || "-"}${r.subType ? "/" + r.subType : ""}`;
      lineCount.set(k, (lineCount.get(k) || 0) + 1);
    }
    const sorted = [...lineCount.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 2);
    if (top.length === 0) {
      cards.forEach((c) => { c.textContent = "기록 없음"; c.classList.remove("placeholder"); c.classList.add("muted"); });
      return;
    }
    top.forEach((entry, i) => {
      const card = cards[i];
      const [k, count] = entry;
      const [type, label] = k.split(":");
      const freqClass = type === "pick" ? "freq-pick" : (label.includes("메뉴얼") || label.includes("ACE") || label.includes("NPB")) ? "freq-manual" : "freq-autobag";
      card.className = `freq-card ${freqClass}`;
      card.innerHTML = `
        <span class="freq-rank">#${i+1}</span>
        <span class="freq-label">${escape(label)}</span>
        <span class="freq-count">${count}회</span>
      `;
    });
    if (top.length === 1) {
      cards[1].textContent = "—";
      cards[1].className = "freq-card muted";
    }
  } catch (e) {
    console.warn(e);
    cards.forEach((c) => { c.textContent = "조회 실패"; });
  }
}

// RAW 업로드로 집계된 HTP 표시 — 팩/픽 = Σ(UnitQty)/Σ(TotalHours)
async function fillHtp(modal, member) {
  const ku = String(member.kucode || member.id || "");
  const setStat = (key, val, sub) => {
    const v = modal.querySelector(`[data-stat="${key}"]`);
    if (v) v.textContent = val;
    const subEl = v?.closest(".mc-stat")?.querySelector(".mc-stat-sub");
    if (subEl) subEl.textContent = sub;
  };
  try {
    const t = await getHtpTable();
    const e = ku ? (t.table || {})[ku] : null;
    const fmt = (q, h) => (h > 0 ? (q / h) : null);
    const pack = e ? fmt(e.pq, e.ph) : null;
    const pick = e ? fmt(e.kq, e.kh) : null;
    setStat("pack-htp", pack != null ? pack.toFixed(1) : "—",
      pack != null ? `${Math.round(e.pq).toLocaleString()} ÷ ${e.ph.toFixed(1)}h` : "데이터 없음");
    setStat("pick-htp", pick != null ? pick.toFixed(1) : "—",
      pick != null ? `${Math.round(e.kq).toLocaleString()} ÷ ${e.kh.toFixed(1)}h` : "데이터 없음");
  } catch (e) {
    console.warn("htp fill failed", e);
  }
}

async function fillNote(modal, member) {
  try {
    const ku = String(member.kucode || member.id || "");
    if (!ku) return;
    const note = await getSpecialNote(ku);
    modal.querySelector(".mc-note").value = note || "";
  } catch {}
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
