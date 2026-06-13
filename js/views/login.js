// 닉네임 입력 화면 — 글래스 카드 + 그라데이션 배경.

import { makeCharacter, bindToInput } from "../character.js";
import { makeThemeToggle } from "../theme.js";
import { validateNickname, setSession, ADMIN_NICKNAME } from "../auth.js";
import { getStorageMode } from "../db.js";

// 로그인/조선택 공용 배경 — 그라데이션 블롭 + 은은한 그리드
export function makeAuthBg() {
  const bg = document.createElement("div");
  bg.className = "auth-bg";
  bg.innerHTML = `
    <div class="auth-blob b1"></div>
    <div class="auth-blob b2"></div>
    <div class="auth-blob b3"></div>
    <div class="auth-grid"></div>
  `;
  return bg;
}

export function renderLogin(root, onSuccess) {
  root.innerHTML = "";
  document.body.appendChild(makeThemeToggleOnce());

  const wrap = document.createElement("div");
  wrap.className = "login-wrap";
  wrap.appendChild(makeAuthBg());

  const card = document.createElement("div");
  card.className = "login-card";

  // 브랜드 칩
  const brand = document.createElement("div");
  brand.className = "auth-brand";
  brand.innerHTML = `
    <span class="auth-brand-icon">📋</span>
    <span class="auth-brand-text">GWJ2 <b>OB</b><span class="auth-brand-dot">·</span>PDA 일지</span>
  `;
  card.appendChild(brand);

  const character = makeCharacter();
  card.appendChild(character);

  const title = document.createElement("h1");
  title.className = "login-title";
  title.innerHTML = `어서오세요 <span class="wave">👋</span>`;
  card.appendChild(title);

  const sub = document.createElement("p");
  sub.className = "login-sub";
  sub.textContent = "등록된 닉네임으로 입장해주세요";
  card.appendChild(sub);

  const field = document.createElement("div");
  field.className = "login-field";
  const fieldIcon = document.createElement("span");
  fieldIcon.className = "login-field-icon";
  fieldIcon.textContent = "👤";
  field.appendChild(fieldIcon);
  const input = document.createElement("input");
  input.className = "login-input";
  input.type = "text";
  input.placeholder = "닉네임";
  input.maxLength = 24;
  input.autocomplete = "off";
  input.spellcheck = false;
  field.appendChild(input);
  card.appendChild(field);

  const err = document.createElement("div");
  err.className = "login-error";
  card.appendChild(err);

  const btn = document.createElement("button");
  btn.className = "login-btn";
  btn.type = "button";
  btn.innerHTML = `<span>입장하기</span><span class="login-btn-arrow">→</span>`;
  card.appendChild(btn);

  const hint = document.createElement("div");
  hint.className = "login-hint";
  const mode = getStorageMode() === "firestore" ? "" : "  ·  ⚠ Firebase 미설정 (LocalStorage 모드)";
  hint.textContent = `문의사항이 있으실 경우 "${ADMIN_NICKNAME}" 개인팀즈 부탁드립니다.${mode}`;
  card.appendChild(hint);

  wrap.appendChild(card);
  root.appendChild(wrap);

  const cleanup = bindToInput(character, input);
  setTimeout(() => input.focus(), 50);

  let busy = false;
  const submit = async () => {
    if (busy) return;
    err.textContent = "";
    const v = input.value.trim();
    if (!v) {
      shake();
      err.textContent = "닉네임을 입력해주세요.";
      return;
    }
    busy = true;
    btn.disabled = true;
    btn.innerHTML = `<span>확인 중…</span>`;
    try {
      const result = await validateNickname(v);
      if (!result.ok) {
        shake();
        err.textContent =
          result.reason === "not_registered"
            ? "등록되지 않은 닉네임입니다. 관리자(Bennett)에게 문의하세요."
            : "닉네임을 입력해주세요.";
        return;
      }
      setSession({ nickname: result.nickname, role: result.role });
      cleanup();
      onSuccess(result);
    } catch (e) {
      console.error(e);
      err.textContent = "확인 중 오류가 발생했습니다.";
    } finally {
      busy = false;
      btn.disabled = false;
      btn.innerHTML = `<span>입장하기</span><span class="login-btn-arrow">→</span>`;
    }
  };

  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  function shake() {
    input.classList.remove("shake");
    void input.offsetWidth;
    input.classList.add("shake");
  }
}

let themeToggleEl = null;
function makeThemeToggleOnce() {
  if (themeToggleEl && document.body.contains(themeToggleEl)) return themeToggleEl;
  themeToggleEl = makeThemeToggle();
  return themeToggleEl;
}
