// 로그인 화면 SVG — PDA 일지 컨셉의 클립보드 + 체크리스트.
// 입력 진행률에 따라 체크 항목이 순차적으로 채워지는 애니메이션.

const SVG_NS = "http://www.w3.org/2000/svg";

export function makeCharacter() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "login-character");
  svg.setAttribute("viewBox", "0 0 200 220");
  svg.innerHTML = `
    <defs>
      <linearGradient id="boardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stop-color="var(--accent)"/>
        <stop offset="100%" stop-color="var(--accent-2)"/>
      </linearGradient>
      <linearGradient id="paperGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#f1f6fb"/>
      </linearGradient>
      <filter id="boardShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="var(--accent)" flood-opacity=".25"/>
      </filter>
    </defs>

    <!-- 바닥 그림자 -->
    <ellipse cx="100" cy="208" rx="62" ry="5" fill="rgba(0,0,0,.14)"/>

    <!-- 클립보드 본체 -->
    <g filter="url(#boardShadow)">
      <rect x="38" y="34" width="124" height="172" rx="14" fill="url(#boardGrad)"/>
    </g>
    <!-- 안쪽 종이 -->
    <rect x="48" y="54" width="104" height="142" rx="8" fill="url(#paperGrad)"/>

    <!-- 클립 (상단 메탈 부분) -->
    <rect x="78" y="22" width="44" height="22" rx="6"
          fill="var(--accent-2)" stroke="var(--accent)" stroke-width="2"/>
    <rect x="84" y="14" width="32" height="14" rx="4"
          fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/>

    <!-- 헤더 라인 (DAY/SWING 분위기) -->
    <rect x="58" y="62" width="40" height="4" rx="2" fill="var(--accent)" opacity=".75"/>
    <rect x="105" y="62" width="20" height="4" rx="2" fill="var(--accent-2)" opacity=".55"/>

    <!-- 체크리스트 항목 4개 -->
    <g class="check-items">
      <!-- 1번째 -->
      <g class="check-item" data-idx="0">
        <rect class="check-box" x="58" y="80" width="15" height="15" rx="3"
              fill="#ffffff" stroke="#94a3b8" stroke-width="1.6"/>
        <path class="check-mark" d="M61 88 L66 92 L72 84"
              fill="none" stroke="#22c55e" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"
              stroke-dasharray="22" stroke-dashoffset="22"/>
        <line class="check-line" x1="80" y1="88" x2="138" y2="88"
              stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round"/>
      </g>
      <!-- 2번째 -->
      <g class="check-item" data-idx="1">
        <rect class="check-box" x="58" y="105" width="15" height="15" rx="3"
              fill="#ffffff" stroke="#94a3b8" stroke-width="1.6"/>
        <path class="check-mark" d="M61 113 L66 117 L72 109"
              fill="none" stroke="#22c55e" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"
              stroke-dasharray="22" stroke-dashoffset="22"/>
        <line class="check-line" x1="80" y1="113" x2="130" y2="113"
              stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round"/>
      </g>
      <!-- 3번째 -->
      <g class="check-item" data-idx="2">
        <rect class="check-box" x="58" y="130" width="15" height="15" rx="3"
              fill="#ffffff" stroke="#94a3b8" stroke-width="1.6"/>
        <path class="check-mark" d="M61 138 L66 142 L72 134"
              fill="none" stroke="#22c55e" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"
              stroke-dasharray="22" stroke-dashoffset="22"/>
        <line class="check-line" x1="80" y1="138" x2="125" y2="138"
              stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round"/>
      </g>
      <!-- 4번째 -->
      <g class="check-item" data-idx="3">
        <rect class="check-box" x="58" y="155" width="15" height="15" rx="3"
              fill="#ffffff" stroke="#94a3b8" stroke-width="1.6"/>
        <path class="check-mark" d="M61 163 L66 167 L72 159"
              fill="none" stroke="#22c55e" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"
              stroke-dasharray="22" stroke-dashoffset="22"/>
        <line class="check-line" x1="80" y1="163" x2="135" y2="163"
              stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round"/>
      </g>
    </g>

    <!-- 펜 (살짝 기운) -->
    <g class="pen" transform="translate(110 175) rotate(-22)">
      <rect x="0" y="0" width="42" height="7" rx="2" fill="var(--accent)"/>
      <rect x="-2" y="1" width="3" height="5" fill="var(--accent-2)"/>
      <polygon points="42,0 50,3.5 42,7" fill="var(--accent-2)"/>
      <circle cx="50" cy="3.5" r="1.4" fill="var(--accent)"/>
    </g>

    <!-- 반짝이 디테일 -->
    <text x="172" y="50" font-size="14" fill="var(--accent)" opacity=".7">✦</text>
    <text x="22" y="92" font-size="11" fill="var(--accent)" opacity=".6">✧</text>
    <text x="178" y="170" font-size="12" fill="var(--accent)" opacity=".55">✦</text>
  `;
  return svg;
}

// 입력 진행률(0~1) 에 따라 체크 박스가 1→4 순차적으로 채워짐.
export function lookAt(svg, progress, vertical = 0) {
  const total = 4;
  const filled = Math.min(total, Math.floor(progress * total + 0.001));
  const items = svg.querySelectorAll(".check-item");
  items.forEach((item, i) => {
    const box = item.querySelector(".check-box");
    const mark = item.querySelector(".check-mark");
    const line = item.querySelector(".check-line");
    if (!box || !mark) return;
    if (i < filled) {
      box.setAttribute("fill", "#22c55e");
      box.setAttribute("stroke", "#16a34a");
      mark.setAttribute("stroke", "#ffffff");
      mark.style.strokeDashoffset = "0";
      mark.style.transition = "stroke-dashoffset .35s ease-out";
      if (line) line.style.opacity = ".35";
    } else {
      box.setAttribute("fill", "#ffffff");
      box.setAttribute("stroke", "#94a3b8");
      mark.setAttribute("stroke", "#22c55e");
      mark.style.strokeDashoffset = "22";
      mark.style.transition = "stroke-dashoffset .25s ease-in";
      if (line) line.style.opacity = ".7";
    }
  });
}

// 살짝 흔들리는 펄스 효과 (입력 시 피드백)
export function blink(svg) {
  const board = svg.querySelector("rect[fill='url(#boardGrad)']");
  if (!board) return;
  board.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.02)" }, { transform: "scale(1)" }],
    { duration: 300, easing: "ease-out" }
  );
}

// 입력 박스에 바인딩 — 타이핑 진행률에만 반응
export function bindToInput(svg, input) {
  let blinkTimer = null;

  const onInput = () => {
    const len = input.value.length;
    const max = Math.max(8, input.maxLength || 24);
    const progress = Math.min(1, len / max);
    lookAt(svg, progress);
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => blink(svg), 360);
  };

  input.addEventListener("input", onInput);

  // 초기 상태 — 첫 항목 1개만 미리 체크해서 살아있는 느낌
  setTimeout(() => lookAt(svg, 0.05), 100);

  // 가만히 있을 때 부드러운 idle 모션 (살짝 들숨/날숨)
  let phase = 0;
  const idleTimer = setInterval(() => {
    phase += 0.05;
    const s = 1 + Math.sin(phase) * 0.005;
    svg.style.transform = `scale(${s})`;
  }, 60);

  return () => {
    input.removeEventListener("input", onInput);
    clearInterval(idleTimer);
    clearTimeout(blinkTimer);
    svg.style.transform = "";
  };
}
