// 인원 현황 대시보드 — 독립 탭.
// FLOW 와 분리되어 깔끔하게 단독 뷰. 캡처·복사 버튼으로 이미지 클립보드 복사 가능.

import { renderHeadcountDashboard, computeActualFromSources } from "../components/headcount-dashboard.js";
import { renderHeadcountChart } from "../components/headcount-chart.js";
import { getHeadcount, setHeadcount } from "../db.js";
import { getSession } from "../auth.js";
import { showToast } from "../toast.js";

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

  // 자동 동기화 — TC 포지션/PACK/PICK/FLOW>신규단기 에서 Actual 값 가져오기
  const syncBtn = document.createElement("button");
  syncBtn.className = "btn ghost";
  syncBtn.innerHTML = "🔄 자동 동기화";
  syncBtn.title = "TC 포지션 · PACK · PICK · FLOW>신규단기 에서 Actual 값을 가져옵니다";
  head.appendChild(syncBtn);

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
  });

  const hcChart = renderHeadcountChart({
    container: chartBox,
    shift,
  });

  dateInput.addEventListener("change", () => {
    hcDash.setDate();
    hcChart.refresh();
  });

  // 자동 동기화 핸들러
  syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true;
    const original = syncBtn.innerHTML;
    syncBtn.innerHTML = "⏳ 동기화 중...";
    try {
      const date = dateInput.value || todayStr();
      const computed = await computeActualFromSources(shift, date);
      const current = await getHeadcount(shift, date);
      // Actual 만 덮어쓰고 Plan 은 유지
      const merged = {
        tc:     { plan: current.tc?.plan     || 0, actual: computed.tc.actual },
        perm:   { plan: current.perm?.plan   || 0, actual: computed.perm.actual },
        temp:   { plan: current.temp?.plan   || 0, actual: computed.temp.actual },
        newbie: { plan: current.newbie?.plan || 0, actual: computed.newbie.actual },
      };
      await setHeadcount(shift, date, merged, getSession()?.nickname || "");
      hcDash.setDate(); // 다시 로드
      hcChart.refresh();
      showToast(
        `✓ 동기화 완료 — T/C:${computed.tc.actual} Perm:${computed.perm.actual} Temp:${computed.temp.actual} Newbie:${computed.newbie.actual}`,
        "success"
      );
    } catch (e) {
      console.error("auto-sync failed", e);
      showToast("동기화 실패: " + (e.message || e), "error");
    } finally {
      syncBtn.disabled = false;
      syncBtn.innerHTML = original;
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

// ──────────────────────────────────────────────────────────
// 캡처 유틸 — html2canvas 동적 로드, 실패 시 SVG foreignObject 폴백
// ──────────────────────────────────────────────────────────
let _h2cPromise = null;
function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (_h2cPromise) return _h2cPromise;
  _h2cPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    s.async = true;
    s.onload = () => resolve(window.html2canvas);
    s.onerror = () => reject(new Error("html2canvas 로드 실패 (네트워크 확인)"));
    document.head.appendChild(s);
  });
  return _h2cPromise;
}

async function captureElement(el) {
  const h2c = await loadHtml2Canvas();
  const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const canvas = await h2c(el, {
    backgroundColor: bg,
    scale: 2,                // 고해상도 (Retina/4K 보기 좋게)
    useCORS: true,
    logging: false,
    windowWidth:  el.scrollWidth,
    windowHeight: el.scrollHeight,
  });
  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob 실패")), "image/png");
  });
}

async function copyBlobToClipboard(blob) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error("이 브라우저는 클립보드 이미지 복사를 지원하지 않습니다");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
