// 라이트/다크 테마 토글.
// 우선순위: localStorage > prefers-color-scheme > 'light'.

const KEY = "gw2ob:theme";

export function initTheme() {
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") {
    apply(saved);
    return saved;
  }
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = prefersDark ? "dark" : "light";
  apply(initial);
  return initial;
}

export function getTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

export function setTheme(t) {
  apply(t);
  localStorage.setItem(KEY, t);
}

export function toggleTheme() {
  setTheme(getTheme() === "light" ? "dark" : "light");
}

function apply(t) {
  document.documentElement.setAttribute("data-theme", t);
}

export function makeThemeToggle() {
  const btn = document.createElement("button");
  btn.className = "theme-toggle";
  btn.type = "button";
  btn.setAttribute("aria-label", "테마 전환");
  const refresh = () => (btn.textContent = getTheme() === "light" ? "🌙" : "☀️");
  refresh();
  btn.addEventListener("click", () => {
    toggleTheme();
    refresh();
  });
  return btn;
}
