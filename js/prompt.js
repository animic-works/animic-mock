// 対戦画面のプロンプト: ベース／キャラのタブ、語句（トークン）と重み、入力候補、よく使う表現、スマホのシート、検索のモーダル
// js/play.js（$・lv・narrow・updateControls など）と js/prompt-dict.js のあとに読み込む

// ---------- よく使う表現 ----------
// 押すと入力欄に足し、入力欄にある表現はもう一度押すと消せる
// カタカナはひらがなにそろえて、ゆるく探す
const norm = (v) => v.toLowerCase().replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s+/g, " ").trim();

const GROUPS = [
  ["髪の色", "hair"],
  ["髪型", "style"],
  ["目", "eyes"],
  ["服", "outfit"],
  ["表情", "face"],
  ["背景", "bg"],
];
const TIP = `<p class="tip"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 18h6v1.5a2.5 2.5 0 0 1-2.5 2.5h-1A2.5 2.5 0 0 1 9 19.5zM12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2" /></svg><span><b>コツ</b>　お題を<b>髪・目・服・表情・背景</b>に分けて、ひとつずつ言葉にしてみよう。</span></p>`;
let mode = "text";
const sep = () => (mode === "tag" ? ", " : "、");
const splitParts = (value) =>
  value
    .split(/\s*[、,，]\s*/)
    .map((v) => v.trim())
    .filter(Boolean);

// プロンプトは「ベース」（背景・画風など全体）と「キャラ」（1人ずつ）に分ける。2キャラのお題ではキャラ2を足せる
// 中身は語句の並び { t: 語句, w: 重み }。生成に使うときは (語句:1.2) の形にする
const MAX_CHARS = lv.extra ? 2 : 1;
const CHAR_COLORS = ["#f5c400", "var(--cyan)"]; // キャラ1は黄色、キャラ2は水色（ベースは緑）
const blocks = [{ tokens: [] }, { tokens: [] }]; // 0: ベース, 1〜: キャラ
let active = 1;
const blockLabel = (i) => (i === 0 ? "ベース" : MAX_CHARS > 1 ? `キャラ${i}` : "キャラ");
const PLACEHOLDER = {
  text: ["「、」で区切って入力（例：白背景、アニメ塗り）", "「、」で区切って入力（例：ピンクの髪、ツインテール、笑顔）", "「、」で区切って入力（例：銀髪、ロングヘア、赤い目）"],
  tag: ["「,」で区切って入力（例：white background, anime coloring）", "「,」で区切って入力（例：pink hair, twintails, smile）", "「,」で区切って入力（例：silver hair, long hair, red eyes）"],
};
const tokenText = (k) => (k.w === 1 ? k.t : `(${k.t}:${k.w.toFixed(1)})`);
const fullPrompt = () =>
  blocks
    .flatMap((b) => b.tokens)
    .map(tokenText)
    .join(sep());
const hasToken = (i, word) => blocks[i].tokens.some((k) => k.t.toLowerCase() === word.toLowerCase());
const locked = () => $("prompt").disabled;

// 入力欄に書いた分を語句にする（最後の区切りより前だけ。all のときは残りも）
function commitInput(all = false) {
  const input = $("prompt");
  const v = input.value;
  const lastSep = Math.max(v.lastIndexOf("、"), v.lastIndexOf(","), v.lastIndexOf("，"));
  const done = all ? v : lastSep >= 0 ? v.slice(0, lastSep) : "";
  const rest = all ? "" : lastSep >= 0 ? v.slice(lastSep + 1) : v;
  const words = splitParts(done);
  if (!words.length && input.value === rest) return false;
  for (const w of words) if (!hasToken(active, w)) blocks[active].tokens.push({ t: w, w: 1 });
  input.value = rest.trimStart();
  return words.length > 0;
}

function renderTabs() {
  $("ptabs").innerHTML =
    blocks
      .map(
        (b, i) =>
          `<button type="button" class="ptab" role="tab" data-i="${i}" aria-selected="${i === active}" style="--c:${i === 0 ? "#16b37e" : CHAR_COLORS[(i - 1) % 2]}"><i aria-hidden="true"></i>${blockLabel(i)}${
            i === 2 && !locked() ? '<span class="ptab-x" data-remove role="button" aria-label="キャラ2を消す">×</span>' : ""
          }</button>`,
      )
      .join("") +
    (blocks.length - 1 < MAX_CHARS ? `<button type="button" class="ptab-add" id="add-char"${locked() ? " disabled" : ""}>＋ キャラ${blocks.length}</button>` : "");
}

function renderTokens() {
  const box = $("tokens");
  const input = $("prompt");
  box.querySelectorAll(".tok").forEach((el) => el.remove());
  const off = locked() ? " disabled" : "";
  const html = blocks[active].tokens
    .map((k, i) => {
      const cls = k.w > 1 ? " is-up" : k.w < 1 ? " is-down" : "";
      return `<span class="tok${cls}" data-i="${i}"><span class="tok-text" title="押すと書き直せます">${escapeHtml(k.t)}</span>${
        k.w !== 1 ? `<span class="tok-w">${k.w.toFixed(1)}</span>` : ""
      }<span class="tok-ws"><button type="button" data-w="1" aria-label="「${escapeHtml(k.t)}」を強くする"${off || (k.w >= 2 ? " disabled" : "")}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg></button><button type="button" data-w="-1" aria-label="「${escapeHtml(k.t)}」を弱くする"${off || (k.w <= 0.1 ? " disabled" : "")}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14" /></svg></button></span></span>`;
    })
    .join("");
  input.insertAdjacentHTML("beforebegin", html);
  box.classList.toggle("is-tags", mode === "tag");
  input.placeholder = blocks[active].tokens.length ? (mode === "tag" ? "「,」で区切って追加" : "「、」で区切って追加") : PLACEHOLDER[mode][Math.min(active, 2)];
  input.setAttribute("aria-label", `プロンプト（${blockLabel(active)}）`);
}

// 入力候補: 最後の区切りより後ろの言葉で辞書を引き、プロンプト欄の下に出す
let hot = 0;
function renderSuggest() {
  const box = $("suggest");
  const v = $("prompt").value;
  const q = norm(v.split(/[、,，]/).pop() || "");
  if (!q || locked() || document.activeElement !== $("prompt")) {
    box.hidden = true;
    return;
  }
  const hits = DICT.filter((e) => norm(e.ja).includes(q) || norm(e.tag).includes(q))
    .sort((a, b) => Number(!norm(a.ja).startsWith(q) && !norm(a.tag).startsWith(q)) - Number(!norm(b.ja).startsWith(q) && !norm(b.tag).startsWith(q)))
    .slice(0, 8);
  hot = Math.min(hot, Math.max(0, hits.length - 1));
  const mark = (text) => {
    const i = norm(text).indexOf(q);
    return i < 0 ? escapeHtml(text) : `${escapeHtml(text.slice(0, i))}<mark>${escapeHtml(text.slice(i, i + q.length))}</mark>${escapeHtml(text.slice(i + q.length))}`;
  };
  box.innerHTML = hits.length
    ? hits
        .map(
          (e, i) =>
            `<button type="button" role="option" aria-selected="${i === hot}" data-d="${DICT.indexOf(e)}" class="${i === hot ? "is-hot" : ""}"><span>${mark(e.ja)}</span><small>${mark(e.tag)}</small><em>${e.g.label}</em>${i === hot ? '<kbd class="sg-key">Tab</kbd>' : ""}</button>`,
        )
        .join("")
    : `<p class="suggest-none">候補なし ─ 「、」で区切ればそのまま入ります</p>`;
  box.hidden = false;
}
function pickSuggest(e) {
  const input = $("prompt");
  const v = input.value;
  const cut = Math.max(v.lastIndexOf("、"), v.lastIndexOf(","), v.lastIndexOf("，"));
  input.value = cut >= 0 ? v.slice(0, cut + 1) : "";
  commitInput(true);
  const word = wordOf(e);
  if (!hasToken(active, word)) blocks[active].tokens.push({ t: word, w: 1 });
  hot = 0;
  syncPrompt();
  input.focus();
  renderSuggest();
}
$("suggest").addEventListener("mousedown", (event) => event.preventDefault());
$("suggest").addEventListener("click", (event) => {
  const b = event.target.closest("[data-d]");
  if (b) pickSuggest(DICT[Number(b.dataset.d)]);
});

function switchTo(i) {
  commitInput(true);
  active = i;
  syncPrompt();
}

$("ptabs").addEventListener("click", (event) => {
  if (event.target.closest("[data-remove]")) {
    commitInput(true);
    blocks.splice(2, 1);
    if (active >= blocks.length) active = 1;
    syncPrompt();
    return;
  }
  if (event.target.closest("#add-char")) {
    commitInput(true);
    blocks.push({ tokens: [] });
    active = blocks.length - 1;
    syncPrompt();
    $("prompt").focus();
    return;
  }
  const tab = event.target.closest(".ptab");
  if (tab) switchTo(Number(tab.dataset.i));
});

// 語句の −／＋ と、語句を押して書き直す
$("tokens").addEventListener("click", (event) => {
  const tok = event.target.closest(".tok");
  if (!tok) {
    $("prompt").focus();
    return;
  }
  if (locked()) return;
  const k = blocks[active].tokens[Number(tok.dataset.i)];
  const btn = event.target.closest("button[data-w]");
  if (btn) {
    k.w = Math.min(2, Math.max(0.1, Math.round((k.w + Number(btn.dataset.w) * 0.1) * 10) / 10));
    syncPrompt();
    return;
  }
  if (event.target.closest(".tok-text")) {
    commitInput(true);
    blocks[active].tokens.splice(Number(tok.dataset.i), 1);
    $("prompt").value = k.t;
    syncPrompt();
    $("prompt").focus();
    renderSuggest();
  }
});

function renderChips() {
  $("chips").innerHTML = GROUPS.map(
    ([label, key]) =>
      `<div class="chip-row" data-key="${key}"><span>${label}</span><div class="chip-opts">${ART_FEATURES[key]
        .map((o) => {
          const word = escapeHtml(mode === "tag" ? o.tag : o.label);
          return `<button type="button" data-word="${word}" aria-pressed="false">${word}</button>`;
        })
        .join("")}</div></div>`,
  ).join("") + TIP;
  syncPrompt();
}

// 語句・表現の押された状態・語数・消すボタン・タブを揃える
function syncPrompt() {
  $("chips")
    .querySelectorAll(".chip-row")
    .forEach((row) => {
      row.querySelectorAll("button[data-word]").forEach((b) => b.setAttribute("aria-pressed", String(hasToken(active, b.dataset.word))));
    });
  $("prompt-len").textContent = `${blocks[active].tokens.length}語（合計 ${blocks.reduce((n, b) => n + b.tokens.length, 0)}語）`;
  $("clear").disabled = locked() || (!blocks[active].tokens.length && !$("prompt").value);
  $("search-base").disabled = $("search-char").disabled = locked();
  renderTabs();
  renderTokens();
}

$("chips").addEventListener("click", (event) => {
  const b = event.target.closest("button[data-word]");
  if (!b) return;
  commitInput(true);
  const word = b.dataset.word;
  const list = blocks[active].tokens;
  const i = list.findIndex((k) => k.t.toLowerCase() === word.toLowerCase());
  if (i >= 0) list.splice(i, 1);
  else list.push({ t: word, w: 1 });
  syncPrompt();
  b.classList.remove("is-pop");
  void b.offsetWidth;
  b.classList.add("is-pop");
  // スマホでは押すたびにキーボードが出ないよう、入力欄にフォーカスを移さない
  if (!narrow.matches) $("prompt").focus();
});

$("prompt").addEventListener("input", () => {
  hot = 0;
  renderSuggest();
  if (commitInput()) syncPrompt();
  else $("clear").disabled = locked() || (!blocks[active].tokens.length && !$("prompt").value);
});
$("prompt").addEventListener("keydown", (event) => {
  const input = $("prompt");
  // 日本語の変換中でも Tab で候補を確定できるようにする（変換が終わってから入れる）
  if (event.key === "Tab" && !$("suggest").hidden && $("suggest").querySelector("[data-d]")) {
    event.preventDefault();
    const pick = DICT[Number($("suggest").querySelectorAll("[data-d]")[hot].dataset.d)];
    if (event.isComposing) {
      input.addEventListener("compositionend", () => setTimeout(() => pickSuggest(pick)), { once: true });
      input.blur();
      input.focus();
    } else pickSuggest(pick);
    return;
  }
  if (event.isComposing) return;
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    $("generate").click();
    return;
  }
  const opts = $("suggest").querySelectorAll("[data-d]");
  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && opts.length && !$("suggest").hidden) {
    event.preventDefault();
    hot = (hot + (event.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length;
    renderSuggest();
    return;
  }
  if (event.key === "Tab" && opts.length) {
    event.preventDefault();
    pickSuggest(DICT[Number(opts[hot].dataset.d)]);
    return;
  }
  if (event.key === "Escape" && !$("suggest").hidden) {
    event.preventDefault();
    $("suggest").hidden = true;
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (opts.length && !$("suggest").hidden) {
      pickSuggest(DICT[Number(opts[hot].dataset.d)]);
      return;
    }
    if (commitInput(true)) syncPrompt();
    renderSuggest();
  }
  // 空のまま Backspace で、最後の語句を書き直しに戻す
  if (event.key === "Backspace" && !input.value && blocks[active].tokens.length) {
    event.preventDefault();
    input.value = blocks[active].tokens.pop().t;
    syncPrompt();
  }
});
$("prompt").addEventListener("focus", renderSuggest);
$("prompt").addEventListener("blur", () => {
  if (commitInput(true)) syncPrompt();
  renderSuggest();
});
$("clear").addEventListener("click", () => {
  blocks[active].tokens = [];
  $("prompt").value = "";
  syncPrompt();
  renderSuggest();
  $("prompt").focus();
});
// ---------- スマホ: プロンプトのシートを畳む／開く ----------
function setSheet(collapsed) {
  const compose = document.querySelector(".compose");
  if (collapsed) commitInput(true);
  compose.classList.toggle("is-collapsed", collapsed);
  $("sheet-peek").hidden = !collapsed;
  $("grip").setAttribute("aria-expanded", String(!collapsed));
  $("grip").setAttribute("aria-label", collapsed ? "プロンプト欄を開く" : "プロンプト欄を畳む");
  compose.classList.remove("is-sheet-anim");
  void compose.offsetWidth;
  compose.classList.add("is-sheet-anim");
  if (collapsed) {
    syncPeek();
    $("prompt").blur();
  }
}
function syncPeek() {
  const words = blocks.flatMap((b) => b.tokens).map((k) => k.t);
  $("peek-text").textContent = words.length ? `プロンプト ${words.length}語 ─ ${words.join("、")}` : "プロンプトを書く";
}
let swiped = false;
$("grip").addEventListener("click", () => {
  if (swiped) return (swiped = false);
  setSheet(!document.querySelector(".compose").classList.contains("is-collapsed"));
});
$("sheet-peek").addEventListener("click", () => setSheet(false));
// つまみを上下にスワイプ
let dragY = null;
$("grip").addEventListener("pointerdown", (e) => (dragY = e.clientY));
addEventListener("pointerup", (e) => {
  if (dragY == null) return;
  const dy = e.clientY - dragY;
  dragY = null;
  if (Math.abs(dy) < 24) return;
  swiped = true;
  setTimeout(() => (swiped = false), 400);
  setSheet(dy > 0);
});

// ---------- プロンプトを検索 ----------
// ジャンル: "all" はすべて、それ以外は DICT_GROUPS の key。選んだカードはいま開いているタブに入る
let searchCat = "all";
const wordOf = (e) => (mode === "tag" ? e.tag : e.ja);
const slug = (e) => e.tag.toLowerCase().replace(/[^a-z0-9]+/g, "_");
// サンプル画像: images/prompts/<タグ>.webp があればそれを使う（Danbooru などから差し替える想定）。
// なければ、絵で表せる特徴は生成画像のモックで描き、それ以外は手元のサンプル画像を出す
const LOCAL = ["images/sample-solo-white-bg.png", "images/sample-solo-with-bg.png", "images/sample-duo-with-bg.png", "images/hero-character.webp"];
function sampleFallback(e) {
  const opt = ART_FEATURES[e.g.key]?.find((o) => o.tag === e.tag);
  if (opt) return artSvg({ ...ART_TOPIC, [e.g.key]: opt.id, ...(e.g.key === "bg" ? {} : { bg: "white" }) }, "").replace("<svg ", '<svg preserveAspectRatio="xMidYMin slice" ');
  const i = [...e.tag].reduce((a, c) => a + c.charCodeAt(0), 0) % LOCAL.length;
  return `<img src="${LOCAL[i]}" alt="" loading="lazy" class="is-crop-face" />`;
}
function searchGroups() {
  if (searchCat === "all") return DICT_GROUPS;
  return DICT_GROUPS.filter((g) => g.key === searchCat);
}
const inPrompt = (e) => hasToken(active, wordOf(e));
function renderNav() {
  const count = (gs) => DICT.filter((e) => gs.includes(e.g)).length;
  const picked = (gs) => DICT.filter((e) => gs.includes(e.g) && inPrompt(e)).length;
  const btn = (key, label, gs, dot) => {
    const n = picked(gs);
    return `<button type="button" data-cat="${key}" aria-pressed="${searchCat === key}" style="--dot:${dot}"><i aria-hidden="true"></i>${label}${n ? `<span class="sd-in">${n}</span>` : ""}<small>${count(gs)}</small></button>`;
  };
  $("search-cats").innerHTML = `<h2>Genre</h2>` + btn("all", "すべて", DICT_GROUPS, "var(--ink)") + DICT_GROUPS.map((g) => btn(g.key, g.label, [g], GENRE_DOTS[g.key])).join("");
}
function renderSearch() {
  const q = norm($("search-q").value);
  const groups = searchGroups();
  $("search-title").textContent = `${blockLabel(active)}プロンプトを検索`;
  renderNav();
  // 検索語があるときは、ジャンルをまたいで探す
  const pool = q ? DICT : DICT.filter((e) => groups.includes(e.g));
  const hits = pool.filter((e) => !q || norm(e.ja).includes(q) || norm(e.tag).includes(q) || norm(e.g.label).includes(q));
  const mark = (text) => {
    const i = q ? norm(text).indexOf(q) : -1;
    return i < 0 ? escapeHtml(text) : `${escapeHtml(text.slice(0, i))}<mark>${escapeHtml(text.slice(i, i + q.length))}</mark>${escapeHtml(text.slice(i + q.length))}`;
  };
  $("search-sub").innerHTML = q ? `「<b>${escapeHtml($("search-q").value.trim())}</b>」の結果 ${hits.length}件` : `${groups.length === 1 ? groups[0].label : "すべて"} <b>${hits.length}</b>件`;
  $("search-results").innerHTML = hits.length
    ? hits
        .map(
          (e) => `<button type="button" class="sd-card" data-d="${DICT.indexOf(e)}" aria-pressed="${inPrompt(e)}">
            <span class="sd-img"><span class="sd-noimg" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="m3.5 18 5.5-5.5 4 4 2.5-2.5 5 5" /></svg>No Image</span><span class="sd-genre">${e.g.label}</span><span class="sd-check" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7" /></svg></span></span>
            <span class="sd-text"><b>${mark(e.ja)}</b><code>${mark(e.tag)}</code></span>
          </button>`,
        )
        .join("")
    : `<p class="sd-empty">見つかりませんでした。プロンプト欄にそのまま書くこともできます</p>`;
  // サンプル画像は未用意のため、いまはすべて「No Image」を出す
  $("search-target").textContent = blockLabel(active);
  const total = blocks.reduce((n, b) => n + b.tokens.length, 0);
  $("search-picked").textContent = `プロンプト 合計${total}語`;
}
// tab: 入れる先のタブ（0: ベース, 1〜: キャラ）。一覧はどちらも同じ
function openSearch(tab) {
  searchCat = "all";
  $("search-q").value = "";
  commitInput(true);
  active = tab;
  syncPrompt();
  renderSearch();
  $("search").showModal();
  $("search-results").scrollTop = 0;
  if (!narrow.matches) $("search-q").focus();
}
$("search-base").addEventListener("click", () => openSearch(0));
$("search-char").addEventListener("click", () => openSearch(active === 0 ? 1 : active));
$("search-done").addEventListener("click", () => $("search").close());
$("search-q").addEventListener("input", renderSearch);
$("search-cats").addEventListener("click", (event) => {
  const b = event.target.closest("[data-cat]");
  if (!b) return;
  searchCat = b.dataset.cat;
  $("search-q").value = "";
  renderSearch();
  $("search-results").scrollTop = 0;
});
$("search-results").addEventListener("click", (event) => {
  const b = event.target.closest("[data-d]");
  if (!b || locked()) return;
  const e = DICT[Number(b.dataset.d)];
  const list = blocks[active].tokens;
  const word = wordOf(e);
  const i = list.findIndex((k) => k.t.toLowerCase() === word.toLowerCase());
  if (i >= 0) list.splice(i, 1);
  else list.push({ t: word, w: 1 });
  syncPrompt();
  // カードは作り直さず、押された状態と左の件数だけ更新する
  b.setAttribute("aria-pressed", String(i < 0));
  renderNav();
  $("search-picked").textContent = `プロンプト 合計${blocks.reduce((n, x) => n + x.tokens.length, 0)}語`;
});
$("search-close").addEventListener("click", () => $("search").close());
$("search").addEventListener("click", (event) => event.target === $("search") && $("search").close());
// ⌘/Ctrl+K でも開く
addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !locked()) {
    event.preventDefault();
    openSearch(active);
  }
});

function setMode(next) {
  mode = next;
  $("mode-text").setAttribute("aria-pressed", String(mode === "text"));
  $("mode-tag").setAttribute("aria-pressed", String(mode === "tag"));
  $("seg").classList.toggle("is-tag", mode === "tag");
  renderChips();
  updateControls();
}
$("mode-text").addEventListener("click", () => setMode("text"));
$("mode-tag").addEventListener("click", () => setMode("tag"));
