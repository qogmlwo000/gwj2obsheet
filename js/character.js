// 정교한 고양이 캐릭터 — 그라디언트 털, 큰 눈, 자연스러운 비례.
// 타이핑 진행률에만 반응 (마우스 추적 안 함).
// 가만히 있을 때는 가운데 응시 + 자동 깜빡임 + 미세한 호흡 애니메이션.

const SVG_NS = "http://www.w3.org/2000/svg";

export function makeCharacter() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "login-character");
  svg.setAttribute("viewBox", "0 0 200 210");
  svg.innerHTML = `
    <defs>
      <radialGradient id="catFur" cx="50%" cy="38%" r="65%">
        <stop offset="0%"  stop-color="#ffffff"/>
        <stop offset="55%" stop-color="#fafafa"/>
        <stop offset="100%" stop-color="#dfe3e8"/>
      </radialGradient>
      <linearGradient id="earInner" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%"   stop-color="#ffd2dd"/>
        <stop offset="100%" stop-color="#ff9fb3"/>
      </linearGradient>
      <radialGradient id="catCheek" cx="50%" cy="50%" r="55%">
        <stop offset="0%"   stop-color="#ffaab5" stop-opacity=".75"/>
        <stop offset="100%" stop-color="#ff88a0" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="eyeIris" cx="50%" cy="40%" r="60%">
        <stop offset="0%"   stop-color="#a5e0fb"/>
        <stop offset="55%"  stop-color="#3aa8df"/>
        <stop offset="100%" stop-color="#0c4a6e"/>
      </radialGradient>
      <radialGradient id="bodyShade" cx="50%" cy="0%" r="100%">
        <stop offset="0%"   stop-color="#fff"/>
        <stop offset="100%" stop-color="#d8dde2"/>
      </radialGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.4"/>
      </filter>
    </defs>

    <!-- 그림자 -->
    <ellipse cx="100" cy="201" rx="44" ry="4.5" fill="rgba(0,0,0,.13)"/>

    <!-- 작은 통통 몸 (앉은 자세) -->
    <g class="char-body">
      <path d="M62 178
               Q56 200 80 200
               Q100 204 120 200
               Q144 200 138 178
               Q130 158 100 158
               Q70 158 62 178 Z"
            fill="url(#bodyShade)" stroke="#c8ccd1" stroke-width="1.6"/>
      <!-- 가슴 흰털 V -->
      <path d="M88 175 Q100 188 112 175"
            fill="none" stroke="#fff" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>
    </g>

    <!-- 발(앞발) -->
    <ellipse cx="82" cy="200" rx="10" ry="3.5" fill="#fafafa" stroke="#c8ccd1" stroke-width="1.2"/>
    <ellipse cx="118" cy="200" rx="10" ry="3.5" fill="#fafafa" stroke="#c8ccd1" stroke-width="1.2"/>
    <!-- 발가락 디테일 -->
    <circle cx="78" cy="200" r="1.2" fill="#ffb5c2"/>
    <circle cx="82" cy="200" r="1.2" fill="#ffb5c2"/>
    <circle cx="86" cy="200" r="1.2" fill="#ffb5c2"/>
    <circle cx="114" cy="200" r="1.2" fill="#ffb5c2"/>
    <circle cx="118" cy="200" r="1.2" fill="#ffb5c2"/>
    <circle cx="122" cy="200" r="1.2" fill="#ffb5c2"/>

    <!-- 머리 (살짝 사다리꼴 둥근 형태) -->
    <path d="M40 110
             Q40 60 100 50
             Q160 60 160 110
             Q160 156 100 162
             Q40 156 40 110 Z"
          fill="url(#catFur)" stroke="#bfc4ca" stroke-width="2.2"/>

    <!-- 왼쪽 귀 (외측) -->
    <path d="M52 80 Q44 26 82 56 Q72 70 52 80 Z"
          fill="url(#catFur)" stroke="#bfc4ca" stroke-width="2.2" stroke-linejoin="round"/>
    <!-- 왼쪽 귀 (내측 분홍) -->
    <path d="M58 75 Q52 38 78 60 Q70 70 58 75 Z" fill="url(#earInner)"/>

    <!-- 오른쪽 귀 (외측) -->
    <path d="M148 80 Q156 26 118 56 Q128 70 148 80 Z"
          fill="url(#catFur)" stroke="#bfc4ca" stroke-width="2.2" stroke-linejoin="round"/>
    <!-- 오른쪽 귀 (내측 분홍) -->
    <path d="M142 75 Q148 38 122 60 Q130 70 142 75 Z" fill="url(#earInner)"/>

    <!-- 이마 줄무늬 (살짝) -->
    <path d="M86 64 Q92 60 98 65" fill="none" stroke="#a8acb1" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
    <path d="M102 65 Q108 60 114 64" fill="none" stroke="#a8acb1" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>

    <!-- 볼 (분홍 글로우) -->
    <ellipse cx="60" cy="120" rx="14" ry="9" fill="url(#catCheek)"/>
    <ellipse cx="140" cy="120" rx="14" ry="9" fill="url(#catCheek)"/>

    <!-- 눈 외곽선(아이라이너 효과) -->
    <ellipse cx="78" cy="103" rx="12" ry="14.5" fill="#1a1a1a" opacity=".15"/>
    <ellipse cx="122" cy="103" rx="12" ry="14.5" fill="#1a1a1a" opacity=".15"/>
    <!-- 눈 흰자 -->
    <ellipse cx="78" cy="103" rx="11" ry="13.5" fill="#ffffff" stroke="#2a2a2a" stroke-width="2"/>
    <ellipse cx="122" cy="103" rx="11" ry="13.5" fill="#ffffff" stroke="#2a2a2a" stroke-width="2"/>

    <!-- 눈동자 (큰 iris + 세로 동공) -->
    <g class="char-pupils">
      <ellipse class="char-iris-l"  cx="78"  cy="103" rx="7"  ry="12"   fill="url(#eyeIris)"/>
      <ellipse class="char-iris-r"  cx="122" cy="103" rx="7"  ry="12"   fill="url(#eyeIris)"/>
      <!-- 동공 -->
      <ellipse class="char-pupil-l" cx="78"  cy="103" rx="2.4" ry="10.5" fill="#0a0a0a"/>
      <ellipse class="char-pupil-r" cx="122" cy="103" rx="2.4" ry="10.5" fill="#0a0a0a"/>
      <!-- 메인 하이라이트 -->
      <ellipse class="char-glint-l"  cx="80.5" cy="98"  rx="2.4" ry="3.4" fill="#ffffff"/>
      <ellipse class="char-glint-r"  cx="124.5" cy="98" rx="2.4" ry="3.4" fill="#ffffff"/>
      <!-- 보조 하이라이트 -->
      <ellipse class="char-glint-l2" cx="76"  cy="110" rx="1.1" ry="1.5" fill="#ffffff" opacity=".75"/>
      <ellipse class="char-glint-r2" cx="120" cy="110" rx="1.1" ry="1.5" fill="#ffffff" opacity=".75"/>
    </g>

    <!-- 코 (분홍 작은 삼각/하트) -->
    <path d="M93 124 Q100 119 107 124 L100 132 Z"
          fill="#ff85a0" stroke="#e96d8a" stroke-width="1.2" stroke-linejoin="round"/>

    <!-- 입 (M자) -->
    <path d="M100 132 Q100 137 95 137 Q90 137 88 134"
          fill="none" stroke="#2a2a2a" stroke-width="2" stroke-linecap="round"/>
    <path d="M100 132 Q100 137 105 137 Q110 137 112 134"
          fill="none" stroke="#2a2a2a" stroke-width="2" stroke-linecap="round"/>

    <!-- 수염 (각 3가닥씩) -->
    <line x1="36"  y1="120" x2="64"  y2="122" stroke="#9aa0a6" stroke-width="1.4" stroke-linecap="round" opacity=".75"/>
    <line x1="34"  y1="128" x2="64"  y2="127" stroke="#9aa0a6" stroke-width="1.4" stroke-linecap="round" opacity=".75"/>
    <line x1="36"  y1="136" x2="64"  y2="132" stroke="#9aa0a6" stroke-width="1.4" stroke-linecap="round" opacity=".75"/>
    <line x1="164" y1="120" x2="136" y2="122" stroke="#9aa0a6" stroke-width="1.4" stroke-linecap="round" opacity=".75"/>
    <line x1="166" y1="128" x2="136" y2="127" stroke="#9aa0a6" stroke-width="1.4" stroke-linecap="round" opacity=".75"/>
    <line x1="164" y1="136" x2="136" y2="132" stroke="#9aa0a6" stroke-width="1.4" stroke-linecap="round" opacity=".75"/>

    <!-- 깜빡임용 윗꺼풀 -->
    <rect class="char-lid-l" x="68"  y="89" width="22" height="0" fill="#fafafa"/>
    <rect class="char-lid-r" x="112" y="89" width="22" height="0" fill="#fafafa"/>
  `;
  return svg;
}

// progress: 0~1 (입력 진행률).
// y: -1~1 (수직 변위).
export function lookAt(svg, progress, vertical = 0) {
  const dx = clamp(progress, 0, 1) * 6 - 3;        // -3 ~ +3 px
  const dy = clamp(vertical, -1, 1) * 1.8;
  const t = `translate(${dx}px, ${dy}px)`;
  ["char-iris-l", "char-iris-r",
   "char-pupil-l", "char-pupil-r",
   "char-glint-l", "char-glint-r",
   "char-glint-l2", "char-glint-r2"].forEach((c) => {
    const el = svg.querySelector("." + c);
    if (el) el.style.transform = t;
  });
}

export function blink(svg) {
  const ll = svg.querySelector(".char-lid-l");
  const lr = svg.querySelector(".char-lid-r");
  if (!ll || !lr) return;
  const opts = { duration: 220, easing: "ease-out" };
  ll.animate([{ height: 0 }, { height: 26 }, { height: 0 }], opts);
  lr.animate([{ height: 0 }, { height: 26 }, { height: 0 }], opts);
}

// 입력 박스에 바인딩 — 타이핑 진행률에만 반응.
export function bindToInput(svg, input) {
  let blinkTimer = null;

  const onInput = () => {
    const len = input.value.length;
    const max = Math.max(8, input.maxLength || 24);
    const progress = Math.min(1, len / max);
    const wobble = Math.sin(len * 0.85) * 0.4;
    lookAt(svg, progress, wobble);
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => blink(svg), 420);
  };

  input.addEventListener("input", onInput);

  // 가만히 있을 때 살짝 좌우로 응시(아이들 모션) + 자동 깜빡임
  let idlePhase = 0;
  const idleTimer = setInterval(() => {
    if (input.value.length > 0) return;
    idlePhase += 0.2;
    lookAt(svg, 0.5 + Math.sin(idlePhase) * 0.15, 0);
  }, 90);

  const autoBlink = setInterval(() => {
    if (Math.random() < 0.6) blink(svg);
  }, 4400);

  // 처음에 가운데 응시
  lookAt(svg, 0.5, 0);

  return () => {
    input.removeEventListener("input", onInput);
    clearInterval(idleTimer);
    clearInterval(autoBlink);
    clearTimeout(blinkTimer);
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
