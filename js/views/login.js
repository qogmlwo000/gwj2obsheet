// 닉네임 입력 화면.

import { makeCharacter, bindToInput } from "../character.js";
import { makeThemeToggle } from "../theme.js";
import { validateNickname, setSession, ADMIN_NICKNAME } from "../auth.js";
import { getStorageMode } from "../db.js";

export function renderLogin(root, onSuccess) {
  root.innerHTML = "";
  document.body.appendChild(makeThemeToggleOnce());

  const wrap = document.createElement("div");
  wrap.className = "login-wrap";

  const card = document.createElement("div");
  card.className = "login-card";

  const character = makeCharacter();
  card.appendChild(character);

  const title = document.createElement("h1");
  title.className = "login-title";
  title.textContent = "닉네임을 입력해주세요";
  card.appendChild(title);

  const input = document.createElement("input");
  input.className = "login-input";
  input.type = "text";
  input.placeholder = "예) Bennett";
  input.maxLength = 24;
  input.autocomplete = "off";
  input.spellcheck = false;
  card.appendChild(input);

  const err = document.createElement("div");
  err.className = "login-error";
  card.appendChild(err);

  const btn = document.createElement("button");
  btn.className = "login-btn";
  btn.type = "button";
  btn.textContent = "입장";
  card.appendChild(btn);

  const hint = document.createElement("div");
  hint.className = "login-hint";
  const mode = getStorageMode() === "firestore" ? "" : "  ·  ⚠ Firebase 미설정 (LocalStorage 모드)";
  hint.textContent = `처음이라면 "${ADMIN_NICKNAME}" 으로 입장하세요${mode}`;
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
    btn.textContent = "확인 중…";
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
      btn.textContent = "입장";
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
