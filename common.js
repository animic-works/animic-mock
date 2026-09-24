// mock/ のモック画面で共通の処理
const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 0・O・1・I・L を除く

function normalizeCode(value) {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function isValidCode(code) {
  return code.length === 8 && [...code].every((ch) => CODE_CHARS.includes(ch));
}

function randomCode() {
  return Array.from(crypto.getRandomValues(new Uint32Array(8)), (n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
}

function params() {
  return new URLSearchParams(location.search);
}

function go(path, query = {}) {
  const search = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ""));
  location.href = search.size ? `${path}?${search}` : path;
}

let toastTimer;
function toast(message) {
  let el = document.getElementById("toast");
  if (!el) {
    el = Object.assign(document.createElement("p"), { id: "toast", className: "toast" });
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

// 「戻る」ボタン: 履歴があれば戻り、なければ指定のページへ
document.addEventListener("click", (event) => {
  const back = event.target.closest("[data-back]");
  if (!back) return;
  event.preventDefault();
  if (history.length > 1) history.back();
  else location.href = back.dataset.back;
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

// 画面遷移のアニメーション（transition.css と組み合わせて使う）
const WIPE_KEY = "animic-wipe";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function createWipe(state, content = "") {
  const wipe = document.createElement("div");
  wipe.className = `wipe ${state}${content ? " has-room" : ""}`;
  wipe.setAttribute("aria-hidden", "true");
  wipe.innerHTML =
    '<span class="wipe-band"></span><span class="wipe-band"></span><span class="wipe-band"></span>' +
    '<img class="wipe-logo" src="animic-favicon.svg" alt="" />' +
    content;
  document.body.append(wipe);
  return wipe;
}

function roomMarkup(label, code, sub = "") {
  const chars = [...code].map((ch) => `<span>${ch}</span>`).join("");
  return `<div class="wipe-room"><p class="wipe-room-label">${escapeHtml(label)}</p><div class="wipe-code">${chars}</div><p class="wipe-room-sub">${escapeHtml(sub)}</p></div>`;
}

function clearWipeFlag() {
  try {
    sessionStorage.removeItem(WIPE_KEY);
  } catch {}
}

// 演出中に何かキーを押したら飛ばす（Shift などの修飾キーだけは除く）。
// そのキーは演出を飛ばす操作としてだけ扱い、画面側のキー操作には渡さない。
// ボタンを Enter で押して演出を始めた場合に同じキーで飛ばさないよう、開始直後は受け付けない
const MODIFIER_KEYS = ["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn"];
function onSkipKey(callback, armDelay = 400) {
  const armedAt = performance.now() + armDelay;
  const handler = (event) => {
    if (event.repeat || MODIFIER_KEYS.includes(event.key) || performance.now() < armedAt) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    callback();
  };
  addEventListener("keydown", handler, true);
  return () => removeEventListener("keydown", handler, true);
}

function setWipeFlag(value) {
  try {
    sessionStorage.setItem(WIPE_KEY, JSON.stringify(value));
  } catch {}
}

// 帯で画面を塗りつぶしてから移動する
async function wipeTo(path, query, trigger) {
  if (reducedMotion) return go(path, query);
  if (document.querySelector(".wipe")) return;
  trigger?.classList.add("is-pressed");
  createWipe("is-in");
  setWipeFlag({ type: "logo" });
  // 3色の帯が塗り終わり、ロゴが弾んでから移動する。キーを押したら、遷移先の演出も省いてすぐ移動する
  let skipped = false;
  let onSkip;
  const skipSignal = new Promise((resolve) => (onSkip = resolve));
  const stop = onSkipKey(() => {
    skipped = true;
    onSkip();
  });
  await Promise.race([wait(1600), skipSignal]);
  stop();
  if (skipped) clearWipeFlag();
  go(path, query);
}

// 帯で塗りつぶし、ルームコードをスロットのように回して確定させてからロビーへ移動する。
// 画面下部の「スキップ」ボタン、または何かキーを押すと、演出を飛ばしてすぐ移動できる
async function buildRoomTo(query, { label, done, sub }) {
  if (reducedMotion) return go("lobby.html", query);
  if (document.querySelector(".wipe")) return;
  const code = query.code;
  const wipe = createWipe("is-in", roomMarkup(label, "--------", sub));
  setWipeFlag({ type: "room", code, label: done, sub });
  const spans = [...wipe.querySelectorAll(".wipe-code span")];
  const labelEl = wipe.querySelector(".wipe-room-label");
  spans.forEach((span) => span.classList.add("is-spinning"));

  // スキップ: 待ち時間を途中で打ち切れるようにする
  let skipped = false;
  let onSkip;
  const skipSignal = new Promise((resolve) => (onSkip = resolve));
  const pause = (ms) => Promise.race([wait(ms), skipSignal]);
  const skipButton = Object.assign(document.createElement("button"), { type: "button", className: "wipe-skip" });
  skipButton.innerHTML = 'スキップ<kbd aria-hidden="true">どのキーでも</kbd>';
  skipButton.setAttribute("aria-label", "演出をスキップしてロビーへ進む");
  wipe.append(skipButton);
  const skip = () => {
    if (skipped) return;
    skipped = true;
    onSkip();
  };
  skipButton.addEventListener("click", skip);
  const stopKey = onSkipKey(skip);

  let spin;
  await pause(900);
  if (!skipped) {
    skipButton.focus({ preventScroll: true });
    let settled = 0;
    spin = setInterval(() => {
      for (let i = settled; i < spans.length; i++) spans[i].textContent = CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }, 55);
    await pause(700);
    for (let i = 0; i < spans.length && !skipped; i++) {
      settled = i + 1;
      spans[i].textContent = code[i];
      spans[i].classList.replace("is-spinning", "is-set");
      await pause(150);
    }
    clearInterval(spin);
    if (!skipped) {
      labelEl.textContent = done;
      await pause(900);
    }
  }
  clearInterval(spin);
  stopKey();
  skipButton.disabled = true;
  // 飛ばした場合は、ロビー側でコードを見せ直す演出も省いてすぐ表示する
  if (skipped) clearWipeFlag();
  go("lobby.html", query);
}

// 前の画面が帯で塗りつぶして来た場合、帯を抜いて中身を登場させる。
// 読み込み中のちらつきは、<head> で html に wipe-pending を付けて防ぐ
async function playWipeOut() {
  const pending = document.documentElement.classList.contains("wipe-pending");
  let flag = null;
  try {
    flag = JSON.parse(sessionStorage.getItem(WIPE_KEY));
    sessionStorage.removeItem(WIPE_KEY);
  } catch {}
  if (!pending) return;
  if (reducedMotion) {
    document.documentElement.classList.remove("wipe-pending");
    return;
  }

  // まず塗りつぶした状態で表示し、フォントの読み込みを待つ（途中で文字の大きさが変わらないように）
  const content = flag?.type === "room" && isValidCode(flag.code || "") ? roomMarkup(flag.label || "", flag.code, flag.sub || "") : "";
  const wipe = createWipe("is-cover", content);
  // キーを押したら、帯とカードの登場を待たずにすぐ画面を出す
  let skipped = false;
  const finish = () => {
    skipped = true;
    stopKey();
    wipe.remove();
    document.body.classList.remove("is-entering");
  };
  const stopKey = onSkipKey(finish, 0);
  document.querySelectorAll(".card > *").forEach((el, i) => el.style.setProperty("--i", i));
  document.querySelectorAll("[data-enter]").forEach((el, i) => el.style.setProperty("--i", i));
  document.querySelectorAll(".code span").forEach((el, i) => el.style.setProperty("--c", i));
  document.documentElement.classList.remove("wipe-pending");
  await Promise.all([wait(content ? 450 : 250), Promise.race([document.fonts.ready, wait(1500)])]);
  if (skipped) return;

  document.body.classList.add("is-entering");
  wipe.classList.replace("is-cover", "is-out");
  // 最後に抜ける帯（水色）のアニメーションが終わったら片付ける
  wipe.querySelector(".wipe-band").addEventListener("animationend", () => wipe.remove());
  setTimeout(() => {
    if (!skipped) finish();
  }, 2800);
}

// ブラウザの「戻る」でキャッシュから復元されたときに塗りが残らないようにする
addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  document.querySelectorAll(".wipe").forEach((el) => el.remove());
  document.querySelectorAll(".is-pressed").forEach((el) => el.classList.remove("is-pressed"));
});
