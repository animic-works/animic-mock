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
    '<img class="wipe-logo" src="images/animic-favicon.svg" alt="" />' +
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
  skipButton.innerHTML = 'スキップ<svg viewBox="0 0 20 16" aria-hidden="true"><path d="M4 2 13 8l-9 6V2Zm11 0v12" /></svg>';
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

// スマホを横にしたら「縦向きで遊んでね」のダイアログを出す。縦に戻すと自動で閉じる
(() => {
  const landscape = matchMedia("(orientation: landscape) and (pointer: coarse) and (max-height: 500px)");
  let dialog;
  let dismissed = false;
  function sync() {
    if (!landscape.matches) {
      dismissed = false;
      if (dialog?.open) dialog.close();
      return;
    }
    if (dismissed) return;
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "dialog dialog-center rotate-dialog";
      dialog.setAttribute("aria-labelledby", "rotate-title");
      dialog.innerHTML =
        '<form class="card" method="dialog">' +
        '<svg class="rotate-icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M11 18.5h2" /></svg>' +
        '<h1 id="rotate-title">縦向きがおすすめです</h1>' +
        '<p class="sub">このアプリは縦向きで遊ぶように作られています。<br />スマホを縦に戻してください。</p>' +
        '<button class="pill" value="close">このまま使う</button>' +
        "</form>";
      dialog.addEventListener("close", () => {
        if (landscape.matches) dismissed = true;
      });
      document.body.append(dialog);
    }
    if (!dialog.open) dialog.showModal();
  }
  landscape.addEventListener("change", sync);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
  else sync();
})();

// ---------- アカウント（モック） ----------
// docs/product.md: ログインは参加の条件にしない。ログインは「戦績を残したい人」向けの任意の機能として扱う。
// サーバーとは通信せず、ログインの状態と戦績はこの端末（localStorage）に覚えておく
const ACCOUNT_KEY = "animic-account";
const HISTORY_KEY = "animic-history";
const NAME_KEY = "animic-name";
const PROVIDER_ICONS = {
  Google:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" /><path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" /><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" /><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" /></svg>',
  Discord:
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="#5865f2"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.332-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z" /></svg>',
};

function readStore(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// { provider: "Google" | "Discord", name: 表示名 } またはログインしていなければ null
const getAccount = () => readStore(ACCOUNT_KEY, null);
const setAccount = (account) => writeStore(ACCOUNT_KEY, account);
function signOut() {
  writeStore(ACCOUNT_KEY, null);
  writeStore(HISTORY_KEY, null);
}
// 最後に使った表示名（ゲストでも次の入力の初期値にする）
const lastName = () => readStore(NAME_KEY, "");
const rememberName = (name) => writeStore(NAME_KEY, name);

// 戦績: 新しい順。同じ対戦（key）は1つだけ残す
const getHistory = () => readStore(HISTORY_KEY, []);
function saveHistory(entry) {
  const list = getHistory().filter((e) => e.key !== entry.key);
  writeStore(HISTORY_KEY, [entry, ...list].slice(0, 30));
}

// ログイン画面へ。戻り先（back）には今の画面を渡す
function goLogin(next, extra = {}, trigger) {
  wipeTo("login.html", { next, back: location.pathname.split("/").pop() + location.search, ...extra }, trigger);
}

// アカウントのボタン: ゲストなら「ログイン」、ログイン中ならアバターを押してメニュー（戦績・ログアウト）を開く
function mountAccount(slot, { compact = false } = {}) {
  const account = getAccount();
  slot.classList.add("account");
  if (!account) {
    slot.innerHTML = `<button class="account-login${compact ? " is-compact" : ""}" type="button" aria-label="ログイン"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5c1.2-4 4-6 7.5-6s6.3 2 7.5 6" /></svg><span>ログイン</span></button>`;
    slot.firstChild.addEventListener("click", (event) => goLogin("login", {}, event.currentTarget));
    return;
  }
  const list = getHistory();
  const ord = (n) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
  const rows = list.slice(0, 3).map(
    (e) =>
      `<li><span class="acc-rank${e.rank === 1 ? " is-win" : ""}">${e.rank ? ord(e.rank) : "—"}</span><span class="acc-what"><b>${escapeHtml(e.level)}・${e.players}人</b><small>${new Date(e.at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</small></span><span class="acc-pt">${e.total != null ? `${e.total.toFixed(1)}<small>pt</small>` : "未提出"}</span></li>`,
  );
  const wins = list.filter((e) => e.rank === 1).length;
  slot.innerHTML = `
    <button class="account-avatar" type="button" aria-haspopup="true" aria-expanded="false" aria-label="アカウント（${escapeHtml(account.name)}）">
      <span class="account-initial">${escapeHtml([...account.name][0] || "?")}</span>
      <span class="account-badge">${PROVIDER_ICONS[account.provider] || ""}</span>
    </button>
    <div class="account-menu" role="menu" hidden>
      <div class="acc-head">
        <span class="account-initial is-lg">${escapeHtml([...account.name][0] || "?")}</span>
        <span><b>${escapeHtml(account.name)}</b><small><span class="acc-prov">${PROVIDER_ICONS[account.provider] || ""}</span>${escapeHtml(account.provider)}でログイン中</small></span>
      </div>
      <div class="acc-stats"><span><b>${list.length}</b>対戦</span><span><b>${wins}</b>勝</span></div>
      <p class="eyebrow acc-label">Recent</p>
      ${rows.length ? `<ol class="acc-history">${rows.join("")}</ol>` : `<p class="acc-empty">まだ戦績がありません。<br />対戦すると、ここに残ります。</p>`}
      <button class="acc-logout" type="button" role="menuitem">ログアウト</button>
    </div>`;
  const button = slot.querySelector(".account-avatar");
  const menu = slot.querySelector(".account-menu");
  const toggle = (open) => {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };
  button.addEventListener("click", () => toggle(menu.hidden));
  document.addEventListener("click", (event) => !slot.contains(event.target) && toggle(false));
  addEventListener("keydown", (event) => event.key === "Escape" && !menu.hidden && (toggle(false), button.focus()));
  slot.querySelector(".acc-logout").addEventListener("click", () => {
    signOut();
    toast("ログアウトしました");
    mountAccount(slot, { compact });
    slot.dispatchEvent(new CustomEvent("account-change", { bubbles: true }));
  });
}
