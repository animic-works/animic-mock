const $ = (id) => document.getElementById(id);
const q = params();
const level = q.get("level") || "かんたん";
const total = Math.max(10, Number(q.get("time")) || 90);
const GRACE = 15; // 生成終了後に画像を選べる時間
const LIMIT = Math.max(0, Number(q.get("limit")) || 0); // 生成できる回数の上限（0は無制限。ロビーで設定）
const code = isValidCode(q.get("code") || "") ? q.get("code") : randomCode();
// 参加者: ロビーから全員の名前（players）と自分の席（seat）を受け取る。直接開いたときはサンプルの4人
const myName = q.get("name") || "ゲスト";
let names = null;
try {
  names = JSON.parse(q.get("players") || "null");
} catch {}
let seat = Number(q.get("seat")) || 0;
if (!Array.isArray(names) || names.length < 2) {
  names = q.get("opp") ? [myName, q.get("opp")] : [myName, "ぴよ丸", "ぴくせる侍", "プロンプト職人"];
  seat = 0;
}
names = names.slice(0, 8).map(String);
seat = Math.min(Math.max(0, seat), names.length - 1);
// アバターの色（ロビーと同じ並び）
const COLORS = [
  ["#ff2d87", "#fff"],
  ["#00b4fc", "#fff"],
  ["#fddb13", "#0b1b2b"],
  ["#ff72b9", "#fff"],
  ["#6fd3ff", "#0b1b2b"],
  ["#ffe98a", "#0b1b2b"],
  ["#5b6573", "#fff"],
];
const players = names.map((name, i) => ({ name: i === seat ? myName : name, isMe: i === seat, bg: COLORS[i % COLORS.length][0], fg: COLORS[i % COLORS.length][1], gens: 0, working: false, submitted: null }));
const me = players[seat];
const others = players.filter((p) => !p.isMe);
const opp = others[0]; // 結果画面（今は1対1の表示）に渡す相手
const role = q.get("role") || "host";
const motion = !reducedMotion;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

$("room-code").textContent = code;
$("level-chip").textContent = `${level}・${total}秒${LIMIT ? `・${LIMIT}回まで` : ""}`;
// お題の画像と難易度の表示は、ロビーの「TOPIC IMAGE」と揃える
const LEVELS = {
  かんたん: { en: "EASY", desc: ["背景なし", "1キャラクター"], art: "images/sample-solo-white-bg.png" },
  ふつう: { en: "NORMAL", desc: ["背景あり", "1キャラクター"], art: "images/sample-solo-with-bg.png" },
  むずかしい: { en: "HARD", desc: ["背景あり", "2キャラクター"], extra: true, art: "images/sample-duo-with-bg.png" },
};
const lv = LEVELS[level] || LEVELS.かんたん;
const topicImg = (alt) => `<img class="topic-art" src="${lv.art}" alt="${alt}" width="832" height="1216" decoding="async" />`;
// 画像の上には何も重ねない。難易度と条件は画像の下のラベルに出す
$("topic-img").innerHTML = topicImg("お題の画像");
$("topic-zoom-art").innerHTML = topicImg("お題の画像（全体）");
$("lv-badge").textContent = lv.en;
$("topic-rule").textContent = lv.desc.join("・");
document.querySelectorAll(".mod-key").forEach((el) => (el.textContent = isMac ? "⌘" : "Ctrl"));

// 開始の合図のあとに、伏せていたお題を裏返して見せる
if (motion) {
  $("topic-img").classList.add("is-veiled");
  $("topic-img").insertAdjacentHTML("beforeend", '<span class="card-back" aria-hidden="true"><img src="images/animic-favicon.svg" alt="" /><span class="eyebrow">Topic image</span></span>');
}
(async () => {
  const fromWipe = document.documentElement.classList.contains("wipe-pending");
  await playWipeOut();
  if (!motion) return;
  await wait(fromWipe ? 900 : 250);
  const kick = document.createElement("div");
  kick.className = "kickoff";
  kick.setAttribute("aria-hidden", "true");
  kick.innerHTML = `<span class="kickoff-band"></span><span class="kickoff-text"><b>START!</b><span>お題にいちばん近い1枚を作ろう</span></span>`;
  document.body.append(kick);
  setTimeout(() => {
    $("topic-img").classList.remove("is-veiled");
    $("topic-img").classList.add("is-flip");
    // 動きが終わったら外す（transform が残ると、帯のすりガラスのぼかしが途切れるため）
    $("topic-img").addEventListener("animationend", () => $("topic-img").classList.remove("is-flip"), { once: true });
  }, 1100);
  setTimeout(() => kick.remove(), 1600);
})();

// ---------- お題の拡大（比較の枠では正方形に切り取っているので、押すと縦長の全体を見られる） ----------
const narrow = matchMedia("(max-width: 560px)");
$("topic-img").setAttribute("role", "button");
$("topic-img").setAttribute("aria-label", "お題を拡大して全体を見る");
$("topic-img").tabIndex = 0;
const openTopicZoom = () => !$("topic-img").classList.contains("is-veiled") && $("topic-zoom").showModal();
$("topic-img").addEventListener("click", openTopicZoom);
$("topic-img").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  openTopicZoom();
});
// 背景をタップしても閉じる
$("topic-zoom").addEventListener("click", (event) => {
  if (event.target === $("topic-zoom")) $("topic-zoom").close();
});


// ---------- 対戦状況 ----------
const DOTS = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>';
const stateOf = (submitted, working) => (submitted ? ["提出済み", "is-done"] : working ? ["生成中", "is-working"] : ["考え中", ""]);
const initial = (p) => escapeHtml([...p.name][0]);
function renderRoster() {
  const done = players.filter((p) => (p.isMe ? mine.submitted : p.submitted)).length;
  $("roster").innerHTML = players
    .map((p) => {
      const gens = p.isMe ? success : p.gens;
      const [text, cls] = p.isMe ? stateOf(mine.submitted, jobs.length > 0) : stateOf(p.submitted, p.working);
      const bump = p.last !== undefined && p.last !== text;
      p.last = text;
      const label = `${p.name}${p.isMe ? "（あなた）" : ""}: ${text}・生成 ${gens}回`;
      return `<li class="member ${cls}${p.isMe ? " is-me" : ""}${bump ? " is-bump" : ""}" style="--c:${p.bg};--fg:${p.fg}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
        <span class="m-avatar" aria-hidden="true">${initial(p)}<i class="m-badge"></i></span>
        <span class="m-meta" aria-hidden="true"><span class="m-name">${escapeHtml(p.name)}</span><span class="m-state">${text}${cls === "is-working" ? DOTS : ""}・${gens}回</span></span>
      </li>`;
    })
    .join("");
  $("hud-sum").innerHTML = `<span class="eyebrow">Submitted</span><span><b>${done}</b> / ${players.length}人</span>`;
  fitRoster();
  renderWaitRow();
}

// ウィンドウの幅に合わせて、入りきるいちばん詳しい表示を選ぶ
// 名前＋状態＋提出数 → 提出数を隠す → 名前だけ → アバターだけ（それでも入らなければ横にスクロール）
const ROSTER_MODES = [
  ["", true],
  ["", false],
  ["is-narrow", true],
  ["is-narrow", false],
  ["is-compact", true],
  ["is-compact", false],
];
function fitRoster() {
  const roster = $("roster");
  for (const [mode, showSum] of ROSTER_MODES) {
    roster.classList.remove("is-narrow", "is-compact");
    if (mode) roster.classList.add(mode);
    $("hud-sum").hidden = !showSum;
    if (roster.scrollWidth <= roster.clientWidth + 1) return;
  }
}
new ResizeObserver(() => fitRoster()).observe(document.querySelector(".bar"));

// ---------- 生成と提出 ----------
const mine = { submitted: null };
let phase = "play"; // play → select（生成終了後の選択猶予）→ done
let attempts = 0;
let success = 0;
let selected = null;
const shots = [];
const jobs = []; // 生成中のもの { no, features, start, dur }
const STEPS = 28;

function updateControls() {
  const canGenerate = phase === "play" && !mine.submitted;
  // 上限は、成功した生成と生成中のものを数える（失敗した生成は数えない）
  const atLimit = LIMIT > 0 && success + jobs.length >= LIMIT;
  $("generate").disabled = !canGenerate || jobs.length >= 3 || atLimit;
  $("gen-limit").textContent = LIMIT ? ` / ${LIMIT}` : "";
  $("prompt").disabled = !canGenerate;
  $("mode-text").disabled = $("mode-tag").disabled = !canGenerate;
  $("chips").querySelectorAll("button").forEach((b) => (b.disabled = !canGenerate));
  $("submit").disabled = !selected || Boolean(mine.submitted) || phase === "done";
  const hint = $("submit-hint");
  hint.textContent = mine.submitted ? `#${mine.submitted.no} を提出しました` : selected ? `#${selected.no} を提出候補にしています` : "画像を1枚選んでください";
  hint.classList.toggle("is-ready", Boolean(selected) && !mine.submitted);
  $("gen-count").textContent = success;
  // 回数の目盛り（上限があるときだけ）。入りきらなければ見出しを隠す
  $("pips").innerHTML = LIMIT
    ? Array.from({ length: LIMIT }, (_, i) => `<i class="${i < success ? "is-used" : i < success + jobs.length ? "is-pending" : ""}"></i>`).join("")
    : "";
  // 目盛りが 0.6rem より細くなるなら、見出しを隠して幅を回す
  const meter = document.querySelector(".meter");
  meter.classList.remove("is-tight");
  const pip = $("pips").firstElementChild;
  if (pip && pip.getBoundingClientRect().width < 9) meter.classList.add("is-tight");
  syncPrompt();
  renderGenMini();
  renderRoster();
}

// 画像の枠の中身は入れ替えるので、札は作っておいて入れ替えのたびに戻す
const genMini = Object.assign(document.createElement("div"), { className: "gen-mini", hidden: true });
genMini.setAttribute("aria-hidden", "true");
function renderGenMini() {
  const mini = genMini;
  if (mini.parentNode !== $("stage-view")) $("stage-view").append(mini);
  const job = newestJob();
  const show = Boolean(selected && job && !mine.submitted);
  if (!show) {
    mini.hidden = true;
    mini.dataset.no = "";
    return;
  }
  if (mini.dataset.no === String(job.no) && !mini.hidden) return;
  mini.dataset.no = String(job.no);
  mini.innerHTML = `<span class="gen-mini-ring" data-job="${job.no}"></span><span>#${job.no} 生成中${jobs.length > 1 ? ` ほか${jobs.length - 1}枚` : ""}</span>`;
  mini.hidden = false;
  tickJobs();
}

const newestJob = () => jobs[jobs.length - 1];
const shotLabel = () => "";

// ステージに1枚を大きく出し、その1枚を提出候補にする
function showShot(shot, { fresh = false } = {}) {
  const switching = selected && selected !== shot;
  selected = shot;
  const view = $("stage-view");
  const effect = fresh && motion ? " is-new" : switching && motion ? " is-switch" : "";
  view.innerHTML = `<div class="stage-shot${effect}">${artSvg(shot.features, `${shot.no}回目の画像`)}${shotLabel(shot.no)}</div>${fresh && motion ? '<span class="reveal" aria-hidden="true"><span></span><span></span><span></span></span>' : ""}`;
  fillFrame(view);
  view.querySelector(".reveal")?.lastElementChild.addEventListener("animationend", (e) => e.target.parentElement.remove());
  $("mine-label").innerHTML = `あなたの画像<small>#${shot.no}</small>`;
  $("shots").querySelectorAll(".shot[data-no]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.no) === shot.no)));
  updateControls();
}

// 生成画像（モックは正方形）を縦長の枠いっぱいに表示する
const fillFrame = (root) => root.querySelectorAll(".stage-shot > svg, .gen > svg, .scan svg").forEach((svg) => svg.setAttribute("preserveAspectRatio", "xMidYMax slice"));

// まだ何も選んでいないときのステージ表示（生成中はスピナーと進み具合を出す）
function showStageIdle() {
  if (selected) return;
  const view = $("stage-view");
  const job = newestJob();
  if (job) {
    view.innerHTML = `<div class="gen" data-job="${job.no}" role="img" aria-label="生成中の画像"><span class="gen-spin"></span></div>
      ${shotLabel(job.no)}
      <div class="gen-hud" aria-hidden="true">
        <div class="gen-hud-row"><span>GENERATING</span><span data-step="${job.no}">STEP 0/${STEPS}</span></div>
        <div class="gen-bar" data-job="${job.no}"><i></i></div>
      </div>`;
    fillFrame(view);
    tickJobs();
    return;
  }
  view.innerHTML = `<div class="stage-empty">
      <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round" aria-hidden="true"><circle cx="60" cy="46" r="24" /><path d="M20 112c3-24 20-36 40-36s37 12 40 36" /></svg>
      <span class="empty-text">まだ画像がありません<span class="empty-sub"><br />プロンプトを書いて「生成する」を押そう</span></span>
    </div>`;
}

// 生成中の進み具合（見た目だけ。終わる時間はモックで先に決めている）
let raf = 0;
function tickJobs() {
  cancelAnimationFrame(raf);
  const now = performance.now();
  for (const job of jobs) {
    const p = Math.min(0.96, (now - job.start) / job.dur);
    document.querySelectorAll(`[data-job="${job.no}"]`).forEach((el) => el.style.setProperty("--p", p));
    const step = `STEP ${String(Math.round(p * STEPS)).padStart(2, "0")}/${STEPS}`;
    document.querySelectorAll(`[data-step="${job.no}"]`).forEach((el) => el.textContent !== step && (el.textContent = step));
  }
  if (jobs.length) raf = requestAnimationFrame(tickJobs);
}

$("generate").addEventListener("click", async () => {
  if ($("generate").disabled) return;
  commitInput(true);
  syncPrompt();
  const prompt = fullPrompt();
  if (!prompt) {
    toast("プロンプトを入力してください");
    $("prompt-box").classList.remove("is-shake");
    void $("prompt-box").offsetWidth;
    $("prompt-box").classList.add("is-shake");
    $("prompt").focus();
    return;
  }
  attempts += 1;
  const no = attempts;
  const { features } = artFromPrompt(prompt, `${code}-${no}`);
  const job = { no, features, start: performance.now(), dur: 1800 + Math.random() * 1600 };
  jobs.push(job);
  const li = document.createElement("li");
  li.innerHTML = `<div class="shot is-pending" aria-label="${no}回目を生成中"><div class="gen"><span class="gen-spin"></span></div><span class="gen-bar" data-job="${no}"><i></i></span></div>`;
  $("shots").prepend(li);
  $("shots").scrollTo({ left: 0, behavior: motion ? "smooth" : "auto" });
  showStageIdle();
  updateControls();
  tickJobs();
  await wait(job.dur);
  jobs.splice(jobs.indexOf(job), 1);
  // モック: まれに生成に失敗する（失敗は生成回数に数えない）
  if (Math.random() < 0.08) {
    li.innerHTML = `<div class="shot is-failed"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 7v6M12 17h.01" /><circle cx="12" cy="12" r="10" /></svg>失敗</div>`;
    toast("生成に失敗しました（回数には数えません）");
    showStageIdle();
    updateControls();
    return;
  }
  success += 1;
  const sim = artSimilarity(features, `${code}-${no}`);
  const shot = { no, features, sim };
  shots.push(shot);
  li.innerHTML = `<button type="button" class="shot" data-no="${no}" aria-pressed="false" aria-label="${no}回目の画像">${artSvg(features, `${no}回目の画像`)}<span class="no">#${no}</span><span class="check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg></span></button>`;
  li.querySelector("button").addEventListener("click", () => {
    if (mine.submitted || phase === "done" || selected === shot) return;
    showShot(shot);
  });
  // できあがった画像はすぐステージに出す（提出前なら）
  if (!mine.submitted && phase !== "done") showShot(shot, { fresh: true });
  else updateControls();
});

// 「確認なしですぐ提出」の設定（この端末に覚えておく）
const QUICK_KEY = "animic-quick-submit";
let quick = false;
try {
  quick = localStorage.getItem(QUICK_KEY) === "1";
} catch {}
function setQuick(on) {
  quick = on;
  $("quick-submit").checked = $("quick-submit-2").checked = on;
  try {
    localStorage.setItem(QUICK_KEY, on ? "1" : "0");
  } catch {}
}
setQuick(quick);
$("quick-submit").addEventListener("change", (e) => setQuick(e.target.checked));
$("quick-submit-2").addEventListener("change", (e) => setQuick(e.target.checked));

$("submit").addEventListener("click", () => {
  if (!selected) return;
  if (quick) return doSubmit();
  $("confirm-shot").innerHTML = artSvg(selected.features, "提出する画像");
  $("confirm").showModal();
});
$("confirm").addEventListener("close", () => {
  if ($("confirm").returnValue === "ok") doSubmit();
});
function doSubmit() {
  if (!selected || mine.submitted) return;
  mine.submitted = { ...selected, remain: Math.max(0, remainSec()), gens: success, late: phase === "select" };
  $("phase").hidden = true;
  updateControls();
  showSubmitted();
  // モック: 自分が提出したら、ほかの人も少しずつ提出する
  submitRest(1800, 1200);
  checkFinish();
}

// ---------- 提出後・採点中の全面表示 ----------
function showSubmitted() {
  $("overlay-body").innerHTML = `
    <div class="overlay-card">${artSvg(mine.submitted.features, "提出した画像")}<span class="stamp">提出済み</span></div>
    <p class="overlay-eyebrow eyebrow">Submitted #${mine.submitted.no}</p>
    <h2>提出しました！</h2>
    <p class="overlay-sub">あとは結果を待つだけ</p>
    <div class="wait-row" id="wait-row"></div>`;
  $("overlay").hidden = false;
  renderWaitRow();
}

// 提出後: ほかの人の提出の進み具合（アバターに提出済みの印が付く）
function renderWaitRow() {
  const row = $("wait-row");
  if (!row) return;
  const waiting = others.filter((p) => !p.submitted);
  const sig = others.map((p) => (p.submitted ? 1 : 0)).join("");
  if (row.dataset.sig === sig) return;
  row.dataset.sig = sig;
  row.classList.toggle("is-done", !waiting.length);
  const text = waiting.length
    ? others.length === 1
      ? `${escapeHtml(others[0].name)} さんの提出を待っています`
      : `あと <b>${waiting.length}</b> 人の提出を待っています`
    : others.length === 1
      ? `${escapeHtml(others[0].name)} さんも提出しました！`
      : "全員が提出しました！";
  row.innerHTML = `<span class="wait-avatars" aria-hidden="true">${others
    .map((p) => `<span class="member ${p.submitted ? "is-done" : "is-waiting"}" style="--c:${p.bg};--fg:${p.fg}"><span class="m-avatar">${initial(p)}<i class="m-badge"></i></span></span>`)
    .join("")}</span><span>${text}</span>`;
}

function showScoring() {
  const m = mine.submitted;
  $("overlay-body").innerHTML = `
    <div class="scan" aria-hidden="true">
      <figure>${m ? artSvg(m.features, "") : '<span class="scan-none">未提出</span>'}</figure>
      <figure>${topicImg("")}</figure>
      <span class="scan-beam"></span>
    </div>
    <p class="overlay-eyebrow eyebrow">Judging</p>
    <h2>採点中…</h2>
    <p class="overlay-sub">AIが再現度を評価しています</p>
    <div class="progress" aria-hidden="true"><i></i></div>`;
  fillFrame($("overlay-body"));
  $("overlay").hidden = false;
}

// ---------- ほかのプレイヤーの動き（モック） ----------
function botGenerate(p) {
  if (p.submitted || phase !== "play") return;
  p.working = true;
  renderRoster();
  setTimeout(() => {
    p.working = false;
    if (!p.submitted) p.gens += 1;
    renderRoster();
    setTimeout(() => botGenerate(p), 4000 + Math.random() * 6000);
  }, 2000 + Math.random() * 1500);
}
others.forEach((p, i) => setTimeout(() => botGenerate(p), 1500 + i * 900 + Math.random() * 1500));
function botSubmit(p) {
  if (p.submitted) return;
  if (p.gens === 0) p.gens = 1;
  const seed = `${code}-${p.name}`;
  const rand = artRandom(seed);
  const features = { ...ART_TOPIC };
  for (const key of ART_KEYS) if (rand() < 0.35) features[key] = ART_FEATURES[key][Math.floor(rand() * ART_FEATURES[key].length)].id;
  p.submitted = { features, sim: artSimilarity(features, seed), remain: Math.max(0, remainSec()), gens: p.gens };
  p.working = false;
  renderRoster();
  checkFinish();
}
// まだ提出していない人を、少しずつずらして提出させる
const submitRest = (base, step) =>
  others.filter((p) => !p.submitted).forEach((p, i) => setTimeout(() => botSubmit(p), base + i * step + Math.random() * step));
others.forEach((p) => setTimeout(() => botSubmit(p), total * 1000 * (0.5 + Math.random() * 0.35)));

// ---------- 残り時間 ----------
const startAt = performance.now();
const remainSec = () => total - (performance.now() - startAt) / 1000;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function setTime(text) {
  const el = $("timer-num");
  if (el.dataset.t === text) return;
  el.dataset.t = text;
  el.setAttribute("aria-label", text);
  el.innerHTML = [...text].map((c) => (c === ":" ? '<span class="colon" aria-hidden="true">:</span>' : `<span aria-hidden="true">${c}</span>`)).join("");
}
const timer = setInterval(() => {
  const remain = remainSec();
  if (phase === "play") {
    const shown = Math.max(0, Math.ceil(remain));
    setTime(fmt(shown));
    $("time-bar").style.setProperty("--left", Math.max(0, remain / total));
    const hurry = shown <= 10 && !mine.submitted;
    $("timer").classList.toggle("is-hurry", shown <= 10);
    document.body.classList.toggle("is-hurry", hurry);
    if (remain <= 0) {
      phase = "select";
      $("timer-label").textContent = "SELECT";
      $("timer").classList.replace("is-hurry", "is-select");
      document.body.classList.remove("is-hurry");
      document.body.classList.add("is-select");
      submitRest(1200, 500);
      if (!mine.submitted) {
        $("phase").innerHTML = `<span class="eyebrow">Time up</span><span class="phase-title">生成終了！</span><span class="phase-count">残り<b id="phase-left">${GRACE}</b>秒で1枚提出</span><span class="phase-note">履歴から選んで「この1枚で提出」<svg class="phase-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-left:4px"><path d="M5 12h14M13 6l6 6-6 6" /></svg><br />生成中の画像も、完成すれば選べます</span>`;
        $("phase").hidden = false;
      }
      updateControls();
    }
  }
  if (phase === "select") {
    const left = Math.max(0, Math.ceil(GRACE + remain));
    setTime(fmt(left));
    $("time-bar").style.setProperty("--left", left / GRACE);
    if ($("phase-left")) $("phase-left").textContent = left;
    if (left <= 0) {
      phase = "done";
      $("phase").hidden = true;
      updateControls();
      checkFinish(true);
    }
  }
}, 200);

// ---------- 採点へ ----------
let finishing = false;
async function checkFinish(timeUp = false) {
  if (finishing) return;
  const allIn = mine.submitted && others.every((p) => p.submitted);
  if (!(timeUp || allIn)) return;
  finishing = true;
  clearInterval(timer);
  document.body.classList.remove("is-hurry");
  // 最後の人の提出が見えるよう、少し置いてから採点に切り替える
  if (mine.submitted) await wait(900);
  showScoring();
  await wait(1900);
  const m = mine.submitted;
  const o = opp.submitted;
  wipeTo("result.html", {
    code,
    level,
    time: total,
    name: me.name,
    opp: opp.name,
    role,
    me: m ? `${artEncode(m.features)}~${m.sim}~${Math.round(m.remain)}~${m.gens}` : "none",
    them: o ? `${artEncode(o.features)}~${o.sim}~${Math.round(o.remain)}~${o.gens}` : "none",
    // 全員の結果（名前と提出内容）。結果画面で一人ずつ採点して発表する
    players: JSON.stringify(players.map((p) => p.name)),
    seat,
    entries: JSON.stringify(
      players.map((p) => {
        const e = p.isMe ? mine.submitted : p.submitted;
        return e ? `${artEncode(e.features)}~${e.sim}~${Math.round(e.remain)}~${e.gens}` : "none";
      }),
    ),
  });
}

// プロンプトの処理（js/prompt.js）を読み込んでから描く
addEventListener("DOMContentLoaded", () => {
  renderChips();
  showStageIdle();
  updateControls();
});
