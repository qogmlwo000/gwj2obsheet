// 인원 현황 대시보드 — 독립 탭.
// FLOW 와 분리되어 깔끔하게 단독 뷰. 캡처·복사 버튼으로 이미지 클립보드 복사 가능.

import { renderHeadcountDashboard } from "../components/headcount-dashboard.js";
import { renderHeadcountChart } from "../components/headcount-chart.js";
import { confirmDialog } from "../components/dialog.js";
import { showToast } from "../toast.js";
import { captureElement, copyBlobToClipboard, downloadBlob } from "../capture.js";

export async function renderHeadcountTab(root, ctx) {
  root.innerHTML = "";
  const { shift } = ctx;

  const page = document.createElement("div");
  page.className = "hc-page";

  const head = document.createElement("div");
  head.className = "hc-page-head";

  const titleBox = document.createElement("div");
  titleBox.className = "hc-page-title";
  titleBox.innerHTML = `
    <span class="hc-page-icon">📊</span>
    <span class="hc-page-name">인원 현황 대시보드</span>
    <span class="hc-page-shift">${shift === "day" ? "DAY ☀️" : "SWING 🌙"}</span>
  `;
  head.appendChild(titleBox);

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "date-input";
  dateInput.value = todayStr();
  head.appendChild(dateInput);

  const todayBtn = document.createElement("button");
  todayBtn.className = "btn ghost";
  todayBtn.textContent = "📅 오늘";
  todayBtn.addEventListener("click", () => {
    dateInput.value = todayStr();
    dateInput.dispatchEvent(new Event("change"));
  });
  head.appendChild(todayBtn);

  // 새로고침 — Actual 값 재계산 (자동 동기화는 백그라운드로 동작)
  const syncBtn = document.createElement("button");
  syncBtn.className = "btn ghost";
  syncBtn.innerHTML = "🔁 새로고침";
  syncBtn.title = "TC 포지션 · PACK · PICK · FLOW>신규단기 에서 Actual 값을 즉시 다시 가져옵니다 (자동 동기화는 항상 활성)";
  head.appendChild(syncBtn);

  // 초기화 — 이 날짜의 모든 입력값 (Plan + Actual) 을 0 으로 리셋
  const resetBtn = document.createElement("button");
  resetBtn.className = "btn danger";
  resetBtn.innerHTML = "🧹 초기화";
  resetBtn.title = "이 날짜의 인원 현황을 모두 0 으로 초기화합니다";
  head.appendChild(resetBtn);

  const captureBtn = document.createElement("button");
  captureBtn.className = "btn primary hc-capture-btn";
  captureBtn.innerHTML = `<span class="hc-cap-icon">📋</span> 이미지로 복사`;
  captureBtn.title = "대시보드를 이미지로 캡처하여 클립보드에 복사 (붙여넣기 가능)";
  head.appendChild(captureBtn);

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn ghost";
  saveBtn.innerHTML = `💾 PNG 저장`;
  saveBtn.title = "이미지 파일로 저장";
  head.appendChild(saveBtn);

  page.appendChild(head);

  // 대시보드 컨테이너 — 캡처 대상
  const dashBox = document.createElement("div");
  dashBox.className = "hc-page-dash-box";
  page.appendChild(dashBox);

  // 트렌드 차트 — 하단
  const chartBox = document.createElement("div");
  chartBox.className = "hc-page-chart-box";
  page.appendChild(chartBox);

  root.appendChild(page);

  const hcDash = renderHeadcountDashboard({
    container: dashBox,
    shift,
    getDate: () => dateInput.value || todayStr(),
    onActualChanged: () => hcChart?.refresh(),
  });

  const hcChart = renderHeadcountChart({
    container: chartBox,
    shift,
  });

  dateInput.addEventListener("change", () => {
    hcDash.setDate();
    hcChart.refresh();
  });

  // 새로고침 — 즉시 재계산
  syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true;
    const original = syncBtn.innerHTML;
    syncBtn.innerHTML = "⏳ 새로고침 중...";
    try {
      hcDash.resync();
      // 짧은 시간 후 차트도 갱신
      setTimeout(() => hcChart?.refresh(), 600);
      showToast("✓ Actual 값을 다시 가져왔습니다", "success");
    } catch (e) {
      showToast("새로고침 실패: " + (e.message || e), "error");
    } finally {
      setTimeout(() => {
        syncBtn.disabled = false;
        syncBtn.innerHTML = original;
      }, 400);
    }
  });

  // 초기화 — 모든 값 0 으로 리셋 (Plan + Actual)
  resetBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "인원 현황 초기화",
      danger: true,
      message: `${dateInput.value || todayStr()} 의 인원 현황을 모두 0 으로 초기화할까요?`,
      detail: `<div class="conflict-detail">Plan, Actual 8개 값이 모두 0 이 됩니다.<br>이 동작은 되돌릴 수 없습니다.<br>(자동 동기화는 계속 활성 — 잠시 후 Actual 은 다른 탭에서 다시 계산됩니다)</div>`,
      yes: "초기화", no: "취소",
    });
    if (!ok) return;
    try {
      await hcDash.resetAll();
      hcChart?.refresh();
      showToast("✓ 초기화 완료", "success");
    } catch (e) {
      showToast("초기화 실패: " + (e.message || e), "error");
    }
  });

  captureBtn.addEventListener("click", async () => {
    captureBtn.disabled = true;
    captureBtn.classList.add("loading");
    const original = captureBtn.innerHTML;
    captureBtn.innerHTML = `<span class="hc-cap-icon">⏳</span> 캡처 중...`;
    try {
      const dash = dashBox.querySelector(".hc-dash");
      if (!dash) throw new Error("대시보드를 찾을 수 없습니다");
      const blob = await captureElement(dash);
      try {
        await copyBlobToClipboard(blob);
        showToast("✓ 클립보드에 복사되었습니다. 어디에든 붙여넣기 (Ctrl+V) 가능!", "success");
      } catch (clipErr) {
        // 클립보드 권한 거부 등 — PNG 다운로드로 폴백
        console.warn("clipboard failed, fallback to download", clipErr);
        downloadBlob(blob, `인원현황_${shift}_${dateInput.value || todayStr()}.png`);
        showToast("클립보드 권한이 없어 PNG로 다운로드했습니다", "info");
      }
    } catch (e) {
      console.error("capture failed", e);
      showToast("캡처 실패: " + (e.message || e), "error");
    } finally {
      captureBtn.disabled = false;
      captureBtn.classList.remove("loading");
      captureBtn.innerHTML = original;
    }
  });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      const dash = dashBox.querySelector(".hc-dash");
      if (!dash) throw new Error("대시보드를 찾을 수 없습니다");
      const blob = await captureElement(dash);
      downloadBlob(blob, `인원현황_${shift}_${dateInput.value || todayStr()}.png`);
      showToast("✓ 이미지 저장 완료", "success");
    } catch (e) {
      console.error("save failed", e);
      showToast("저장 실패: " + (e.message || e), "error");
    } finally {
      saveBtn.disabled = false;
    }
  });

  return () => {
    try { hcDash?.destroy(); } catch {}
    try { hcChart?.destroy(); } catch {}
  };
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
