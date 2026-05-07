// 부트스트랩 + 최상위 라우팅(login → shift-pick → shell).
// 그리고 두 가지 친화적 가드:
//   1) file:// 프로토콜로 직접 열렸을 때 — 시작.bat 안내 화면
//   2) Firebase permission-denied 에러 — 토스트로 보안 규칙 안내

import { initTheme } from "./theme.js";
import { getSession } from "./auth.js";
import { renderLogin } from "./views/login.js";
import { renderShiftPick } from "./views/shift-pick.js";
import { renderShell } from "./views/shell.js";

initTheme();

const root = document.getElementById("app");

// ────────────────────────────────────────────────────────────
// file:// 으로 직접 열렸을 때 — 친절 안내
// (ES 모듈은 file:// 에서 보안상 import 자체가 차단되므로 이 코드는 거의 실행되지 않지만,
//  일부 브라우저/플래그 조합에서는 도달 가능)
// ────────────────────────────────────────────────────────────
if (location.protocol === "file:") {
  document.body.innerHTML = `
    <div style="
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: #f4faff;
      color: #0a2540;
      font-family: 'Pretendard','Noto Sans KR',sans-serif;
    ">
      <div style="
        max-width: 520px;
        background: #fff;
        padding: 40px 36px;
        border-radius: 18px;
        box-shadow: 0 20px 60px rgba(56,182,255,.18);
        text-align: center;
      ">
        <div style="font-size: 48px; margin-bottom: 8px">📋</div>
        <h1 style="margin: 0 0 6px; font-size: 22px; font-weight: 800">GWJ2 OB PDA 일지</h1>
        <p style="margin: 0 0 24px; color: #5e7a99; font-size: 14px">
          파일을 직접 열 수는 없습니다.<br>
          로컬 서버에서 실행해야 모든 기능이 동작합니다.
        </p>
        <div style="
          background: #f4faff;
          border: 1px solid #cfe4f7;
          border-radius: 12px;
          padding: 18px 22px;
          text-align: left;
          font-size: 14px;
          line-height: 1.7;
        ">
          <strong style="color: #38b6ff">실행 방법</strong><br>
          1. 같은 폴더의 <code style="background:#e8f4ff;padding:1px 6px;border-radius:4px">시작.bat</code> 파일을 더블클릭<br>
          2. 자동으로 서버가 켜지고 브라우저에 앱이 열립니다<br>
          3. 끝낼 때는 까만 cmd 창을 닫으세요
        </div>
      </div>
    </div>
  `;
  throw new Error("Open via 시작.bat (server) — file:// blocks ES module imports.");
}

function start() {
  const session = getSession();
  if (!session?.nickname) {
    renderLogin(root, () => start());
    return;
  }
  if (!session.shift) {
    renderShiftPick(root, () => start());
    return;
  }
  renderShell(root, () => {
    location.hash = "";
    start();
  });
}

start();

// ────────────────────────────────────────────────────────────
// 전역 에러 — Firebase 보안 규칙 잠금 안내
// ────────────────────────────────────────────────────────────
let permWarned = false;
function isPermissionDenied(err) {
  const msg = String(err?.message || err?.code || err || "");
  return msg.includes("permission-denied") ||
         msg.includes("PERMISSION_DENIED") ||
         msg.includes("Missing or insufficient permissions");
}

async function showPermDeniedToast() {
  if (permWarned) return;
  permWarned = true;
  const m = await import("./toast.js").catch(() => null);
  if (m?.showToast) {
    m.showToast(
      "⚠ Firebase 보안 규칙이 잠겨 있어요. 콘솔에서 테스트 모드로 변경해주세요.",
      "error"
    );
  }
  // 5분 후 다시 알림 가능
  setTimeout(() => { permWarned = false; }, 300000);
}

window.addEventListener("error", (e) => {
  if (isPermissionDenied(e.error)) showPermDeniedToast();
  else console.error("uncaught", e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  if (isPermissionDenied(e.reason)) {
    showPermDeniedToast();
    e.preventDefault?.();  // 콘솔 폭주 방지
  } else {
    console.error("unhandled rejection", e.reason);
  }
});
