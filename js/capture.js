// 화면 캡처 공용 유틸 — html2canvas 동적 로드 (CDN 1회).
// 사용처: 인원현황 / TC 포지션 / 공유 보드의 "이미지로 복사" · "PNG 저장".

let _h2cPromise = null;

export function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (_h2cPromise) return _h2cPromise;
  _h2cPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    s.async = true;
    s.onload = () => resolve(window.html2canvas);
    s.onerror = () => {
      _h2cPromise = null; // 다음 시도에서 재로드 가능
      reject(new Error("html2canvas 로드 실패 (네트워크 확인)"));
    };
    document.head.appendChild(s);
  });
  return _h2cPromise;
}

// 엘리먼트를 고해상도 PNG Blob 으로 캡처
export async function captureElement(el) {
  const h2c = await loadHtml2Canvas();
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const bg = isDark ? "#0d1117" : "#ffffff";
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

export async function copyBlobToClipboard(blob) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error("이 브라우저는 클립보드 이미지 복사를 지원하지 않습니다");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
