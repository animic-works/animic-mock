// ギャラリー: 対戦を1つずつ、お題と提出画像を並べて見せる（左右のボタン・ドット・左右キー・横スワイプで切り替え）
const MATCHES = [
  { level: "かんたん", rule: "背景なし・1キャラクター", score: 92, topic: "#e0f6ff", shot: "#ffe4f1" },
  { level: "ふつう", rule: "背景あり・1キャラクター", score: 85, topic: "#fff9d1", shot: "#e0f6ff" },
  { level: "むずかしい", rule: "背景あり・2キャラクター", score: 78, topic: "#ffe4f1", shot: "#fff9d1" },
  { level: "かんたん", rule: "背景なし・1キャラクター", score: 88, topic: "#e3f6ee", shot: "#ffe4f1" },
  { level: "ふつう", rule: "背景あり・1キャラクター", score: 81, topic: "#efe9ff", shot: "#e0f6ff" },
];
let matchIndex = 0;
const matchDots = MATCHES.map((m, i) => {
  const li = document.createElement("li");
  const button = Object.assign(document.createElement("button"), { type: "button" });
  button.setAttribute("aria-label", `${i + 1}つ目の対戦`);
  button.addEventListener("click", () => showMatch(i));
  li.append(button);
  document.getElementById("gallery-dots").append(li);
  return button;
});
function showMatch(index) {
  matchIndex = (index + MATCHES.length) % MATCHES.length;
  const m = MATCHES[matchIndex];
  document.getElementById("viewer-topic").style.setProperty("--tint", m.topic);
  document.getElementById("viewer-shot").style.setProperty("--tint", m.shot);
  document.getElementById("viewer-level").textContent = m.level;
  document.getElementById("viewer-rule").textContent = m.rule;
  document.getElementById("viewer-score").innerHTML = `${m.score}<small>%</small>`;
  document.getElementById("match-no").textContent = matchIndex + 1;
  document.getElementById("viewer-meter").style.width = `${m.score}%`;
  matchDots.forEach((dot, i) => dot.setAttribute("aria-current", String(i === matchIndex)));
}
const slideMatch = (dir) => showMatch(matchIndex + dir);
document.getElementById("gallery-prev").addEventListener("click", () => slideMatch(-1));
document.getElementById("gallery-next").addEventListener("click", () => slideMatch(1));
showMatch(0);

const dialog = document.getElementById("join-dialog");
const input = document.getElementById("room-code");
const msg = document.getElementById("code-msg");
const submit = document.getElementById("join-submit");
const HINT = msg.textContent;

// ログインの入口（PCは上のナビ、スマホは上のバー）
mountAccount(document.getElementById("nav-account"));
mountAccount(document.getElementById("appbar-account"), { compact: true });
document.addEventListener("account-change", () => {
  mountAccount(document.getElementById("nav-account"));
  mountAccount(document.getElementById("appbar-account"), { compact: true });
});

const startButton = document.getElementById("start");
startButton.addEventListener("click", () => wipeTo("login.html", { next: "create" }, startButton));
const navStart = document.getElementById("nav-start");
navStart.addEventListener("click", (event) => {
  event.preventDefault();
  wipeTo("login.html", { next: "create" }, navStart);
});
document.getElementById("nav-join").addEventListener("click", (event) => {
  event.preventDefault();
  document.getElementById("join").click();
});
document.getElementById("appbar-join").addEventListener("click", () => document.getElementById("join").click());
const appbarStart = document.getElementById("appbar-start");
appbarStart.addEventListener("click", () => wipeTo("login.html", { next: "create" }, appbarStart));
document.getElementById("join").addEventListener("click", () => {
  input.value = "";
  update();
  dialog.showModal();
  input.focus();
});
document.getElementById("join-cancel").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

const boxes = document.getElementById("code-boxes");
const cells = [...document.querySelectorAll("#code-cells span")];

function update() {
  // 小文字・ハイフン・空白を整え、9文字目以降は受け付けない（貼り付けにも対応）
  const code = normalizeCode(input.value).slice(0, 8);
  if (input.value !== code) input.value = code;
  const chars = [...code];
  const bad = chars.find((ch) => !CODE_CHARS.includes(ch));
  const error = bad ? `「${bad}」はルームコードに使われていません` : "";

  cells.forEach((cell, i) => {
    const ch = chars[i] ?? "";
    cell.textContent = ch;
    cell.classList.toggle("is-filled", Boolean(ch));
    cell.classList.toggle("is-bad", Boolean(ch) && !CODE_CHARS.includes(ch));
    cell.classList.toggle("is-active", i === Math.min(chars.length, 7));
  });
  boxes.classList.toggle("is-complete", chars.length === 8 && !error);

  msg.textContent = error || (code.length === 8 ? "このコードで参加します" : code.length ? `あと${8 - code.length}文字` : HINT);
  msg.classList.toggle("is-error", Boolean(error));
  input.setAttribute("aria-invalid", String(Boolean(error)));
  submit.disabled = Boolean(error) || code.length !== 8;
  return code;
}

// カーソルは常に末尾に置き、マスの表示と入力位置をそろえる
const toEnd = () => input.setSelectionRange(input.value.length, input.value.length);
input.addEventListener("input", () => {
  update();
  toEnd();
});
input.addEventListener("focus", () => {
  boxes.classList.add("is-focused");
  requestAnimationFrame(toEnd);
});
input.addEventListener("blur", () => boxes.classList.remove("is-focused"));
input.addEventListener("click", toEnd);
input.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) event.preventDefault();
});

document.getElementById("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const code = update();
  if (isValidCode(code)) {
    dialog.close();
    wipeTo("login.html", { next: "join", code }, document.getElementById("join"));
  }
});

// 画面の切り替え: ホイール・スワイプ・上下キーで1画面ずつ進み、ページ自体は動かさない。
// セクションを縦に並べ、スクロール位置に応じて表示状態を更新する
(() => {
  const root = document.documentElement;
  const scrollMode = true;
  const screens = [...document.querySelectorAll(".screen")];
  const nav = document.getElementById("nav");
  const navLinks = [...nav.querySelectorAll("a[data-nav]")];
  const indicator = document.getElementById("nav-indicator");
  const pager = document.getElementById("pager");
  const cornerLogo = document.getElementById("corner-logo");
  const appbar = document.getElementById("appbar");
  const indexOf = (id) => screens.findIndex((el) => el.id === id);
  let current = -1;
  let locked = false;
  let unlockTimer;

  // 右端の現在位置
  screens.forEach((el, i) => {
    const li = document.createElement("li");
    const button = Object.assign(document.createElement("button"), { type: "button" });
    button.setAttribute("aria-label", el.getAttribute("aria-label") || el.querySelector("h2")?.textContent || "");
    button.addEventListener("click", () => go(i));
    li.append(button);
    pager.append(li);
  });
  const pagerButtons = [...pager.querySelectorAll("button")];

  function moveIndicator() {
    const link = navLinks.find((a) => a.getAttribute("aria-current") === "page");
    // ヘッダーに対応する項目がない画面では、下線をその場で消す
    indicator.style.opacity = link ? 1 : 0;
    if (!link) return;
    indicator.style.left = `${link.offsetLeft}px`;
    indicator.style.width = `${link.offsetWidth}px`;
    indicator.style.top = `${link.offsetTop + link.offsetHeight - 2}px`;
  }

  function render(index, back) {
    const screen = screens[index];
    if (!scrollMode) {
      root.classList.toggle("is-back", back);
      screens.forEach((el, i) => el.classList.toggle("is-active", i === index));
      screen.scrollTop = 0;
    }
    // ヘッダー: 表示中の項目に下線を移す。ホーム以外では左上にロゴを出す
    const key = screen.dataset.nav;
    navLinks.forEach((a) => (a.dataset.nav === key ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    cornerLogo.classList.toggle("is-shown", key !== "top");
    // スマホ: アプリバーはホーム以外で出す
    appbar.classList.toggle("is-shown", key !== "top");
    pagerButtons.forEach((b, i) => b.setAttribute("aria-current", String(i === index)));
    history.replaceState(null, "", `#${screen.id}`);
    moveIndicator();
    current = index;
  }

  function lock(ms) {
    locked = true;
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => (locked = false), ms);
  }

  function go(index) {
    index = Math.max(0, Math.min(screens.length - 1, index));
    // スクロール版: 該当のセクションまでスクロールする（表示の更新はスクロール位置の監視で行う）
    if (scrollMode) return screens[index].scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
    if (index === current) return;
    render(index, index < current);
    lock(reducedMotion ? 350 : 700);
  }

  const busy = () => document.querySelector("dialog[open], .wipe");
  const onHow = () => screens[current]?.id === "how";
  const onGallery = () => screens[current]?.id === "gallery";

  // タッチ操作では、画面の中身が縦にあふれている場合だけ、端に着くまで中をスクロールさせる
  function canScrollInside(dir) {
    const el = screens[current];
    if (el.scrollHeight <= el.clientHeight + 2) return false;
    return dir > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 2 : el.scrollTop > 2;
  }

  // ---------- 遊び方のカード ----------
  const cards = [...document.querySelectorAll("#how-steps .step")];
  const dotList = document.getElementById("how-dots");
  const total = cards.length;
  let active = 0;
  let lastDir = 1;
  const lastOffset = [];

  const dots = cards.map((card, i) => {
    const li = document.createElement("li");
    const button = Object.assign(document.createElement("button"), { type: "button" });
    button.setAttribute("aria-label", card.getAttribute("aria-label"));
    button.addEventListener("click", () => slideTo(i));
    li.append(button);
    dotList.append(li);
    return button;
  });

  function layout() {
    cards.forEach((card, i) => {
      // 中央からの位置（-1: 左、0: 中央、1: 右）。はみ出す1枚は、進んだ方向と逆側に置く
      let offset = (((i - active) % total) + total) % total;
      if (offset > total / 2 || (offset === total / 2 && lastDir > 0)) offset -= total;
      const far = Math.abs(offset) > 1;
      // 反対側へ回り込むカードは、画面を横切らないよう位置を瞬時に移す
      const wrap = lastOffset[i] != null && Math.abs(offset - lastOffset[i]) > 1;
      if (wrap) card.style.transition = "opacity 0.5s ease";
      card.style.setProperty("--o", offset);
      card.style.setProperty("--s", offset === 0 ? 1 : 0.84);
      card.style.setProperty("--a", far ? 0 : offset === 0 ? 1 : 0.5);
      card.style.zIndex = offset === 0 ? 2 : far ? 0 : 1;
      card.style.visibility = far ? "hidden" : "visible";
      if (wrap) {
        card.offsetWidth;
        card.style.transition = "";
      }
      lastOffset[i] = offset;
      card.classList.toggle("is-active", offset === 0);
      card.setAttribute("aria-hidden", String(offset !== 0));
    });
    dots.forEach((dot, i) => dot.setAttribute("aria-current", String(i === active)));
  }

  function slideTo(index, dir) {
    const next = ((index % total) + total) % total;
    if (next === active) return;
    lastDir = dir ?? (next > active ? 1 : -1);
    active = next;
    layout();
  }
  const slide = (dir) => slideTo(active + dir, dir);

  document.getElementById("how-prev").addEventListener("click", () => slide(-1));
  document.getElementById("how-next").addEventListener("click", () => slide(1));
  cards.forEach((card, i) =>
    card.addEventListener("click", () => {
      if (i !== active) slide(lastOffset[i] < 0 ? -1 : 1);
    }),
  );
  layout();

  // ---------- 入力 ----------
  // ホイール: 参考にした fullPage.js（2.9.7）と同じ判定で、1回の操作につき1画面だけ切り替える。
  // 直近の入力量を記録し、0.2秒以上途切れたら記録を捨てる。
  // 直近10回の平均が直近70回の平均以上（勢いが増している）ときだけ切り替えるため、
  // トラックパッドの慣性のように弱まっていく入力では次の画面へ進まない
  let scrollings = [];
  let prevTime = 0;
  const average = (list, count) => {
    const last = list.slice(Math.max(list.length - count, 1));
    return Math.ceil(last.reduce((sum, value) => sum + value, 0) / count);
  };

  addEventListener(
    "wheel",
    (event) => {
      if (scrollMode || busy()) return;
      event.preventDefault();
      const now = Date.now();
      const value = -event.deltaY;
      const vertical = Math.abs(event.deltaX) < Math.abs(event.deltaY);
      if (scrollings.length > 149) scrollings.shift();
      scrollings.push(Math.abs(value));
      const gap = now - prevTime;
      prevTime = now;
      if (gap > 200) scrollings = [];
      if (locked || !vertical) return;
      if (average(scrollings, 10) >= average(scrollings, 70)) go(current + (value < 0 ? 1 : -1));
    },
    { passive: false },
  );

  let touch = null;
  addEventListener("touchstart", (event) => (touch = { x: event.touches[0].clientX, y: event.touches[0].clientY, t: event.target }), { passive: true });
  addEventListener("touchend", (event) => {
    if (!touch || busy()) return;
    const dx = touch.x - event.changedTouches[0].clientX;
    const dy = touch.y - event.changedTouches[0].clientY;
    const target = touch.t;
    touch = null;
    if (Math.abs(dx) > Math.abs(dy)) {
      // 横スワイプ: 遊び方では手順のカード、ギャラリーでは対戦を送る
      if (Math.abs(dx) >= 40 && onHow() && target.closest("#how-carousel")) slide(Math.sign(dx));
      if (Math.abs(dx) >= 40 && onGallery() && target.closest("#gallery-carousel")) slideMatch(Math.sign(dx));
      return;
    }
    if (scrollMode || locked || Math.abs(dy) < innerHeight * 0.05 || canScrollInside(Math.sign(dy))) return;
    go(current + Math.sign(dy));
  });

  addEventListener("keydown", (event) => {
    if (busy() || event.target.closest?.("input, textarea, select")) return;
    // スクロール版では、遊び方・ギャラリーの左右キー以外はブラウザ本来のスクロールに任せる
    const sideKey = event.key === "ArrowLeft" || event.key === "ArrowRight";
    if (scrollMode && !((onHow() || onGallery()) && sideKey)) return;
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      return go(event.key === "Home" ? 0 : screens.length - 1);
    }
    if (onHow() && sideKey) {
      event.preventDefault();
      return slide(event.key === "ArrowLeft" ? -1 : 1);
    }
    if (onGallery() && sideKey) {
      event.preventDefault();
      return slideMatch(event.key === "ArrowLeft" ? -1 : 1);
    }
    let dir = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }[event.key];
    if (event.key === " " && !event.target.closest?.("button, a")) dir = event.shiftKey ? -1 : 1;
    if (!dir) return;
    event.preventDefault();
    if (!locked) go(current + dir);
  });

  // ヘッダー・左上のロゴ・「SCROLL」からの移動（ロゴはナビの「ホーム」と同じ動き）
  const jump = (event) => {
    const link = event.target.closest("a[href^='#']");
    const index = link ? indexOf(link.getAttribute("href").slice(1)) : -1;
    if (index < 0) return;
    event.preventDefault();
    go(index);
  };
  nav.addEventListener("click", jump);
  cornerLogo.addEventListener("click", jump);
  appbar.addEventListener("click", jump);
  document.querySelectorAll("[data-go='next']").forEach((el) => el.addEventListener("click", () => go(current + 1)));

  if (scrollMode) {
    root.classList.add("is-scroll");
    // 画面の中央にあるセクションを「表示中」として、ヘッダーの下線・右端の位置・左上のロゴを合わせる
    const centered = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && render(screens.indexOf(e.target), false)),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    // 画面に入った、または通り過ぎたセクションの中身を出す（一度出したら戻さない）。
    // リンクで一気に移動した場合も、途中のセクションが空のまま残らないようにする
    const reveal = () => {
      for (const el of screens) if (!el.classList.contains("is-active") && el.getBoundingClientRect().top < innerHeight * 0.85) el.classList.add("is-active");
    };
    addEventListener("scroll", reveal, { passive: true });
    addEventListener("resize", reveal);
    reveal();
    screens.forEach((el) => centered.observe(el));
    render(0, false);
    const start = indexOf(location.hash.slice(1));
    if (start > 0) screens[start].scrollIntoView();
  } else {
    root.classList.add("is-paged");
    render(Math.max(0, indexOf(location.hash.slice(1))), false);
  }
  addEventListener("resize", moveIndicator);
  document.fonts?.ready.then(moveIndicator);
})();
