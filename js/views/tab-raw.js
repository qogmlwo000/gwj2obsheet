// RAW (HTP) 탭 — 시스템 RAW 업로드 → 쿠코드별 팩/픽 HTP 집계.
// HTP = Σ(UnitQty) ÷ Σ(TotalHours), TaskCode PACKING→팩 / PICKING→픽 (조 무관 합산).
// 업로드 시 기존 HTP 전체 교체. 결과는 사원 카드(member-card.js)의 평균 HTP 에 표시.

import { getHtpTable, setHtpTable } from "../db.js";
import { downloadRawTemplate, parseRawHtpFile } from "../excel.js";
import { showToast } from "../toast.js";
import { confirmDialog } from "../components/dialog.js";

export async function renderRawTab(root, ctx, params) {
  root.innerHTML = "";
  const page = document.createElement("div");
  page.className = "tab-page";
  const body = document.createElement("div");
  body.className = "tab-body";
  page.appendChild(body);
  root.appendChild(page);

  const bar = document.createElement("div");
  bar.className = "action-bar raw-bar";
  const h2 = document.createElement("h2");
  h2.textContent = "RAW (HTP 집계)";
  bar.appendChild(h2);
  body.appendChild(bar);

  const card = document.createElement("div");
  card.className = "raw-panel";
  card.innerHTML = `
    <p class="raw-desc">시스템 RAW 데이터를 업로드하면 쿠코드별 <b>팩 / 픽 HTP</b>(시간당 처리량)가 계산되어
      <b>사원 카드</b>에 표시됩니다.<br>TaskCode <b>PACKING → 팩</b>, <b>PICKING → 픽</b> · HTP = Σ(UnitQty) ÷ Σ(TotalHours), 쿠코드별 합산(조 무관).</p>
    <div class="raw-actions">
      <button class="btn ghost raw-tmpl">📄 템플릿 다운로드</button>
      <button class="btn primary raw-upload">📥 RAW 업로드 (전체 교체)</button>
    </div>
    <div class="raw-status">불러오는 중…</div>
  `;
  body.appendChild(card);
  const statusEl = card.querySelector(".raw-status");

  async function refreshStatus() {
    try {
      const t = await getHtpTable();
      const n = t.count || Object.keys(t.table || {}).length;
      const when = t.updatedAt ? new Date(t.updatedAt).toLocaleString("ko-KR") : "없음";
      statusEl.innerHTML = `현재 HTP 보유: <b>${n}명</b> · 최종 업데이트: ${when}`;
    } catch (e) {
      statusEl.textContent = "현황 조회 실패: " + (e.message || e);
    }
  }
  await refreshStatus();

  card.querySelector(".raw-tmpl").addEventListener("click", () =>
    downloadRawTemplate()
      .then(() => showToast("RAW 템플릿 다운로드 완료", "success"))
      .catch((e) => showToast("다운로드 실패: " + (e.message || e), "error"))
  );

  const uploadBtn = card.querySelector(".raw-upload");
  uploadBtn.addEventListener("click", async () => {
    const file = await pickFile(".xlsx,.xls,.csv");
    if (!file) return;
    let parsed;
    try {
      parsed = await parseRawHtpFile(file);
    } catch (e) {
      showToast("파일을 읽을 수 없습니다: " + (e.message || e), "error");
      return;
    }
    if (!parsed.kucodeCount) {
      showToast("집계할 데이터가 없습니다 (TaskCode/쿠코드/UnitQty/TotalHours 확인)", "error");
      return;
    }
    const ok = await confirmDialog({
      title: "RAW 업로드 (전체 교체)",
      message: `${parsed.kucodeCount}명의 HTP로 교체할까요?`,
      detail: `<div class="conflict-detail">데이터 행 <b>${parsed.dataRows}</b> · 팩 <b>${parsed.packRows}</b> · 픽 <b>${parsed.pickRows}</b>${parsed.skipped ? ` · 건너뜀 ${parsed.skipped}` : ""}<br>기존 HTP는 새 데이터로 <b>전체 교체</b>됩니다.</div>`,
      yes: "교체", no: "취소",
    });
    if (!ok) return;
    uploadBtn.disabled = true;
    uploadBtn.textContent = "⏳ 적용 중...";
    try {
      await setHtpTable(parsed.table);
      showToast(`✓ HTP ${parsed.kucodeCount}명 적용 완료`, "success");
      await refreshStatus();
    } catch (e) {
      console.error("htp upload failed", e);
      showToast("적용 실패: " + (e.message || e), "error");
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "📥 RAW 업로드 (전체 교체)";
    }
  });

  return () => {};
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = accept;
    inp.addEventListener("change", () => resolve(inp.files[0] || null));
    inp.click();
  });
}
