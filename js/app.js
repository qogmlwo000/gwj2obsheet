// 부트스트랩 + 최상위 라우팅(login → shift-pick → shell).

import { initTheme } from "./theme.js";
import { getSession } from "./auth.js";
import { renderLogin } from "./views/login.js";
import { renderShiftPick } from "./views/shift-pick.js";
import { renderShell } from "./views/shell.js";

initTheme();

const root = document.getElementById("app");

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

// 전역 에러는 콘솔로
window.addEventListener("error", (e) => console.error("uncaught", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => console.error("unhandled rejection", e.reason));
