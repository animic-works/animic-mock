const $ = (id) => document.getElementById(id);
const q = params();
const code = isValidCode(q.get("code") || "") ? q.get("code") : randomCode();
const level = q.get("level") || "かんたん";
const total = Math.max(10, Number(q.get("time")) || 90);
const role = q.get("role") || "host";
// 1人あたりの推論時間（秒）。?infer= で変えられる
const INFER = Math.max(2, Number(q.get("infer")) || 15) * 1000;

// お題の画像（ロビー・対戦画面と同じ）
const LEVELS = {
  かんたん: { en: "EASY", desc: "背景なし・1キャラクター", art: "images/sample-solo-white-bg.png" },
  ふつう: { en: "NORMAL", desc: "背景あり・1キャラクター", art: "images/sample-solo-with-bg.png" },
  むずかしい: { en: "HARD", desc: "背景あり・2キャラクター", art: "images/sample-duo-with-bg.png" },
};
const lv = LEVELS[level] || LEVELS.かんたん;

// ---------- 参加者と提出内容 ----------
// 提出内容は「特徴~再現度~残り秒~生成回数」、未提出は none。直接開いた場合はサンプルの4人
function parse(value) {
  if (!value || value === "none") return null;
  const [f, sim, remain, gens] = String(value).split("~");
  return { features: artDecode(f), sim: Number(sim), remain: Number(remain), gens: Number(gens) };
}
let names, entries, seat;
try {
  names = JSON.parse(q.get("players") || "null");
  entries = JSON.parse(q.get("entries") || "null");
} catch {}
seat = Number(q.get("seat")) || 0;
if (!Array.isArray(names) || !Array.isArray(entries) || names.length !== entries.length) {
  if (q.get("me") || q.get("them")) {
    names = [q.get("name") || "ゲスト", q.get("opp") || "ぴよ丸"];
    entries = [q.get("me") || "none", q.get("them") || "none"];
  } else {
    names = [q.get("name") || "みく", "ぴよ丸", "ぴくせる侍", "プロンプト職人"];
    entries = ["pink.twin.blue.sailor.smile.white~88.4~41~3", "pink.bob.blue.sailor.smile.sky~79.2~22~5", "blonde.twin.red.hoodie.wink.white~71.6~30~2", "none"];
  }
  seat = 0;
}
const COLORS = [
  ["#ff2d87", "#fff"],
  ["#00b4fc", "#fff"],
  ["#fddb13", "#0b1b2b"],
  ["#ff72b9", "#fff"],
  ["#6fd3ff", "#0b1b2b"],
  ["#ffe98a", "#0b1b2b"],
  ["#5b6573", "#fff"],
];

// 仮のスコア: 再現度 + 提出速度（最大20） + 生成回数（1回で15、1回増えるごとに-3）
function score(e) {
  if (!e) return null;
  const speed = Math.round((Math.max(0, e.remain) / total) * 20);
  const gens = Math.max(0, 15 - (Math.max(1, e.gens) - 1) * 3);
  return { sim: e.sim, speed, gens, total: Math.round((e.sim + speed + gens) * 10) / 10 };
}
const players = names.map((name, i) => {
  const entry = parse(entries[i]);
  return { name: String(name), isMe: i === seat, bg: COLORS[i % COLORS.length][0], fg: COLORS[i % COLORS.length][1], entry, score: score(entry) };
});
const me = players[seat] || players[0];
// 順位（同点は同じ順位、未提出は最下位）
const ranked = [...players].sort((a, b) => (b.score ? b.score.total : -1) - (a.score ? a.score.total : -1));
ranked.forEach((p, i) => {
  const prev = ranked[i - 1];
  p.rank = prev && (prev.score ? prev.score.total : -1) === (p.score ? p.score.total : -1) ? prev.rank : i + 1;
});
// 発表は下位から。最後に1位を出す
const order = [...ranked].reverse();

// ---------- 画面の準備 ----------
$("room-code").textContent = code;
$("level-chip").textContent = `${lv.en}・${lv.desc}`;
$("topic-frame").innerHTML = `<img src="${lv.art}" alt="お題の画像" width="832" height="1216" style="object-position:50% 15%" />`;
const initial = (p) => escapeHtml([...p.name][0]);
const avatar = (p) => `<span class="avatar" style="--c:${p.bg};--fg:${p.fg}">${initial(p)}</span>`;
const art = (p, label = "") => artSvg(p.entry.features, label).replace("<svg ", '<svg preserveAspectRatio="xMidYMax slice" ');
const fmt = (n) => n.toFixed(1);
const narrow = matchMedia("(max-width: 560px)").matches;

function renderRail(now = -1) {
  $("rail").innerHTML = order
    .map((p, i) => {
      const state = i < now ? "is-scored" : i === now ? "is-now" : "is-wait";
      const label = i < now ? (p.score ? "採点済み" : "未提出") : i === now ? "採点中" : "待機中";
      return `<div class="seat ${state}${p.isMe ? " is-me" : ""}" style="--c:${p.bg}">
        ${i < now ? `<span class="seat-rank">${liveRank(p, now)}</span>` : ""}
        ${avatar(p)}
        <span class="seat-meta"><b>${escapeHtml(p.name)}</b><small>${label}</small></span>
        <span class="seat-score">${i < now ? (p.score ? fmt(p.score.total) : "—") : ""}</span>
      </div>`;
    })
    .join("");
}
// ここまでに発表した人の中での順位
function liveRank(p, upto) {
  const shown = order.slice(0, upto).filter((x) => x.score);
  if (!p.score) return "—";
  return 1 + shown.filter((x) => x.score.total > p.score.total).length;
}

// ---------- 時間の進め方（早送りに対応した時計） ----------
let speed = 1;
let skipping = false;
let clock = 0;
let last = performance.now();
const waiters = new Set();
(function tick(now) {
  clock += (now - last) * speed;
  last = now;
  for (const w of [...waiters]) if (skipping || clock >= w.at) (waiters.delete(w), w.resolve());
  requestAnimationFrame(tick);
})(last);
const sleep = (ms) => new Promise((resolve) => waiters.add({ at: clock + ms, resolve }));

$("fast").addEventListener("click", () => {
  speed = speed === 1 ? 3 : 1;
  $("fast").setAttribute("aria-pressed", String(speed !== 1));
  document.documentElement.style.setProperty("--speed", speed);
});
$("skip").addEventListener("click", () => {
  skipping = true;
});

// ---------- 採点の演出: 本体の再現度評価で使う6つのモデルを順に動かす ----------
// docs/product.md「再現度評価で扱うモデル」: CCIP・WD14 tagger v3・DreamSim・SigLIP 2・DINOv2・Depth Anything V2
// 指標の算出方法は未決定のため、値はモック（提出時の再現度に合うように作る）
const MODELS = [
  // キャラクター一致度
  { id: "ccip", name: "CCIP", what: "キャラクター一致度", cat: "char", w: 0.25, ov: "face" },
  // タグ一致度
  { id: "wd14", name: "WD14 tagger v3", what: "タグ一致度", cat: "tag", w: 0.125, ov: null },
  { id: "pixai", name: "PixAI tagger", what: "タグ一致度", cat: "tag", w: 0.125, ov: null },
  // 内容一致度
  { id: "dreamsim", name: "DreamSim", what: "内容一致度", cat: "content", w: 0.0833, ov: "glow" },
  { id: "siglip", name: "SigLIP 2", what: "内容一致度", cat: "content", w: 0.0833, ov: "glow" },
  { id: "dino", name: "DINOv2", what: "内容一致度", cat: "content", w: 0.0834, ov: "patch" },
  // ポーズ一致度
  { id: "depth", name: "Depth Anything V2", what: "ポーズ一致度", cat: "pose", w: 0.125, ov: "depth" },
  { id: "openpose", name: "OpenPose", what: "ポーズ一致度", cat: "pose", w: 0.125, ov: "pose" },
];
// 再現度の判定指標（4つ。今後減らしていく方針）
const CATS = [
  ["char", "キャラクター一致度", "CCIP"],
  ["tag", "タグ一致度", "WD14・PixAI"],
  ["content", "内容一致度", "DreamSim・SigLIP 2・DINOv2"],
  ["pose", "ポーズ一致度", "Depth・OpenPose"],
];
// お題のタグ（お題の画像に合わせる）
const TOPIC_TAGS = {
  かんたん: ["1girl", "solo", "blonde hair", "very long hair", "low twintails", "yellow eyes", "beret", "pink headwear", "hair ribbon", "hoodie", "blue hoodie", "bike shorts", "smile", "white background", "looking at viewer"],
  ふつう: ["1girl", "solo", "blonde hair", "very long hair", "glasses", "red-framed eyewear", "yellow eyes", "beret", "hoodie", "blue hoodie", "open mouth", "waving", "outdoors", "tree", "looking at viewer"],
  むずかしい: ["2girls", "blonde hair", "white hair", "long hair", "beret", "pink headwear", "hoodie", "maid headdress", "black dress", "frills", "hug", "open mouth", "indoors", "looking at viewer"],
}[level] || [];

// モデルごとの値（0〜1）。プレイヤーごとに決まった値にする
function metricsOf(p) {
  const rand = artRandom(`${code}-${p.name}-judge`);
  const base = p.score.sim / 100;
  const mine = ["1girl", "solo", "looking at viewer", ...ART_KEYS.map((k) => artPick(k, p.entry.features[k]).tag)];
  const conf = (t) => (0.55 + rand() * 0.43).toFixed(2);
  const sub = mine.map((t) => ({ t, c: conf(t), hit: TOPIC_TAGS.includes(t) }));
  const top = TOPIC_TAGS.map((t) => ({ t, c: conf(t), hit: mine.includes(t) }));
  const hits = sub.filter((x) => x.hit).length;
  const f1 = hits ? (2 * hits) / (sub.length + top.length) : 0;
  const v = {};
  for (const m of MODELS) v[m.id] = Math.min(0.99, Math.max(0.05, base + (rand() - 0.5) * 0.18));
  v.wd14 = Math.min(0.99, Math.max(0.05, base * 0.6 + f1 * 0.4));
  v.pixai = Math.min(0.99, Math.max(0.05, v.wd14 + (rand() - 0.5) * 0.08));
  // カテゴリごとの値を、重み付きの合計が提出時の再現度に合うようにそろえる
  const cats = {};
  for (const [c] of CATS) {
    const ms = MODELS.filter((m) => m.cat === c);
    cats[c] = ms.reduce((a, m) => a + v[m.id] * m.w, 0) / ms.reduce((a, m) => a + m.w, 0);
  }
  const weights = Object.fromEntries(CATS.map(([c]) => [c, MODELS.filter((m) => m.cat === c).reduce((a, m) => a + m.w, 0)]));
  const raw = CATS.reduce((a, [c]) => a + cats[c] * weights[c], 0);
  const shift = base - raw;
  for (const [c] of CATS) cats[c] = Math.min(0.995, Math.max(0.02, cats[c] + shift));
  return { v, cats, weights, sub, top, hits, rand };
}
// 表示する値（モデルごとの出力の形）
const showVal = (m, x) =>
  ({
    wd14: `F1 ${x.toFixed(2)}`,
    ccip: `sim ${x.toFixed(3)}`,
    siglip: `cos ${x.toFixed(3)}`,
    dreamsim: `dist ${(1 - x).toFixed(3)}`,
    dino: `cos ${x.toFixed(3)}`,
    depth: `corr ${x.toFixed(3)}`,
    pixai: `F1 ${x.toFixed(2)}`,
    openpose: `OKS ${x.toFixed(3)}`,
  })[m.id];

const ICON_DONE = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>';

function panelHtml(p, i) {
  return `<div class="who">${avatar(p)}<div class="who-name"><span class="eyebrow">Now judging</span><b>${escapeHtml(p.name)}${p.isMe ? '<span class="me-tag">あなた</span>' : ""}</b></div><span class="who-order">${i + 1} / ${order.length}</span></div>
    <div class="infer">
      <div class="infer-row"><b id="infer-step">再現度を推論しています</b><span class="t" id="infer-t">0.0s</span></div>
      <div class="infer-bar"><i id="infer-bar"></i></div>
    </div>
    <ol class="models" id="models">${CATS.map(
      ([c, label]) =>
        `<li class="model-cat" data-cat="${c}"><span>${label}</span><b class="cat-val">—</b></li>` +
        MODELS.filter((m) => m.cat === c)
          .map((m) => `<li class="model" data-m="${m.id}"><span class="model-ico" aria-hidden="true"></span><span class="model-name"><b>${m.name}</b></span><span class="model-val">—</span></li>`)
          .join(""),
    ).join("")}</ol>
    <div class="out" id="out"></div>
    <div class="score">
      <div class="score-top">
        <div class="score-num"><span class="eyebrow">Score</span><b id="score-num">0.0<small>pt</small></b></div>
        <div class="stamp" id="stamp"></div>
      </div>
      <dl class="parts">
        <div><dt>再現度</dt><span class="meter"><i style="--c:var(--pink)" data-w="${p.score ? p.score.sim : 0}"></i></span><dd>${p.score ? fmt(p.score.sim) : "—"}</dd></div>
        <div><dt>回答時間</dt><span class="meter"><i style="--c:var(--cyan)" data-w="${p.score ? (p.score.speed / 20) * 100 : 0}"></i></span><dd>${p.score ? `+${p.score.speed}` : "—"}</dd></div>
        <div><dt>生成回数</dt><span class="meter"><i style="--c:#f5c400" data-w="${p.score ? (p.score.gens / 15) * 100 : 0}"></i></span><dd>${p.score ? `+${p.score.gens}` : "—"}</dd></div>
      </dl>
    </div>`;
}

async function curtain(p, i) {
  if (reducedMotion || skipping) return;
  const c = document.createElement("div");
  c.className = "curtain";
  c.setAttribute("aria-hidden", "true");
  c.innerHTML = `<span class="curtain-band"></span><span class="curtain-text"><span class="eyebrow">${i === order.length - 1 ? "And the last one" : `Entry ${String(i + 1).padStart(2, "0")}`}</span><b>${escapeHtml(p.name)}</b></span>`;
  c.querySelectorAll(".curtain-band, .curtain-text").forEach((el) => (el.style.animationDuration = `${1.5 / speed}s`));
  document.body.append(c);
  await sleep(1500);
  c.remove();
}

function countUp(el, to, ms) {
  const start = clock;
  return new Promise((resolve) => {
    (function step() {
      const t = skipping ? 1 : Math.min(1, (clock - start) / ms);
      el.innerHTML = `${fmt(to * (1 - Math.pow(1 - t, 4)))}<small>pt</small>`;
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    })();
  });
}

// 画像に重ねる出力（DINOv2 のパッチ・CCIP の顔・深度・全体の光）を用意する
function overlays(frame, rand, isTopic) {
  frame.querySelectorAll(".ov").forEach((o) => o.remove());
  const patch = Array.from({ length: 12 * 18 }, (_, k) => {
    const y = Math.floor(k / 12) / 18;
    const o = Math.min(0.5, Math.max(0, rand() * 0.35 + (y > 0.1 && y < 0.55 ? 0.15 : 0)));
    return `<i style="--c:${rand() < 0.5 ? "#ff2d87" : "#00b4fc"};--o:${o.toFixed(2)};--dl:${(k % 12) * 25 + Math.floor(k / 12) * 18}ms"></i>`;
  }).join("");
  frame.insertAdjacentHTML(
    "beforeend",
    `<span class="ov ov-glow" data-ov="glow"></span>
     <span class="ov ov-patch" data-ov="patch">${patch}</span>
     <span class="ov ov-depth" data-ov="depth"></span>
     <svg class="ov ov-pose" data-ov="pose" viewBox="0 0 100 146" preserveAspectRatio="none"><g fill="none" stroke-width="1.6" stroke-linecap="round">
       <path d="M50 30 L50 58" stroke="#ff2d87"/><path d="M50 36 L36 50 L30 66" stroke="#ffb200"/><path d="M50 36 L64 50 L70 66" stroke="#16b37e"/>
       <path d="M50 58 L42 88 L40 118" stroke="#00b4fc"/><path d="M50 58 L58 88 L60 118" stroke="#7c5cff"/><path d="M50 30 L46 24 M50 30 L54 24" stroke="#fddb13"/></g>
       <g fill="#fff" stroke="#0b1b2b" stroke-width=".6">${[[50,30],[50,36],[36,50],[30,66],[64,50],[70,66],[50,58],[42,88],[40,118],[58,88],[60,118],[46,24],[54,24]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="1.6"/>`).join("")}</g></svg>
     <span class="ov ov-face" data-ov="face"><span><b>${isTopic ? "face · topic" : "face · submit"}</b></span></span>`,
  );
}
function setOverlay(kind) {
  for (const f of [$("topic-frame"), $("mine-frame")]) {
    f.querySelectorAll(".ov").forEach((o) => o.classList.toggle("is-on", o.dataset.ov === kind));
    f.classList.toggle("is-depth", kind === "depth");
  }
}

// 動いているモデルの出力を、パネルの黒い欄に出す
function outFor(m, M, pr) {
  const head = `<div class="out-head"><b>${m.name}</b><span>${m.what}</span><span>${Math.round(pr * 20) * 5}%</span></div>`;
  if (m.cat === "tag") {
    const n = Math.ceil(pr * Math.max(M.sub.length, M.top.length));
    const chips = (list) => list.slice(0, n).map((x) => `<span class="tg${x.hit ? " is-hit" : ""}">${escapeHtml(x.t)}<i>${x.c}</i></span>`).join("");
    return `${head}<div class="tags"><div><h4>お題</h4>${chips(M.top)}</div><div><h4>提出画像</h4>${chips(M.sub)}</div></div>`;
  }
  const val = M.v[m.id] * Math.min(1, Math.round(pr * 1.15 * 40) / 40);
  const cells = Array.from({ length: 64 }, (_, k) => {
    const on = k / 64 < Math.round(pr * 16) / 16;
    return `<i style="--c:${k % 2 ? "#00b4fc" : "#ff2d87"};--o:${on ? (0.25 + ((k * 37) % 70) / 100).toFixed(2) : 0.06}"></i>`;
  }).join("");
  const label = { ccip: "キャラクターの埋め込みの類似度", siglip: "画像の埋め込みのコサイン類似度", dreamsim: "知覚的な距離（小さいほど近い）", dino: "パッチ特徴の類似度", depth: "深度マップの相関" }[m.id];
  return `${head}<div class="metric"><div class="metric-big">${showVal(m, val)}<small>${label}</small></div><div class="vec">${cells}</div></div>`;
}

async function judge(p, i) {
  renderRail(i);
  $("phase-count").textContent = `${i + 1} / ${order.length}`;
  await curtain(p, i);
  const stage = $("stage");
  stage.classList.remove("is-done");
  $("panel").innerHTML = panelHtml(p, i);
  $("mine-label").textContent = narrow ? "提出画像" : `${p.name} の提出画像`;
  $("mine-frame").classList.remove("is-in");
  void $("mine-frame").offsetWidth;
  $("mine-frame").classList.add("is-in");
  $("mine-frame").innerHTML = p.entry
    ? `${art(p, `${p.name}さんの提出画像`)}<span class="scan" aria-hidden="true"></span>`
    : `<div class="missing"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 8l8 8" /></svg>未提出</div>`;
  setOverlay(null);

  if (!p.entry) {
    // 未提出は推論しない
    $("models").hidden = true;
    $("out").hidden = true;
    $("infer-step").textContent = "提出がないため、推論はしません";
    await sleep(1200);
    stage.classList.add("is-done");
    $("score-num").innerHTML = `<span style="font-size:.5em">未提出</span>`;
    document.querySelector(".parts").hidden = true;
    const st = $("stamp");
    st.style.setProperty("--c", "var(--muted)");
    st.innerHTML = "<small>NO ENTRY</small>未提出";
    st.classList.add("is-on");
    await sleep(1800);
    return;
  }

  // 推論: 6つのモデルを順に動かす（合わせて約15秒）。最後の1割で再現度を集計する
  const M = metricsOf(p);
  overlays($("topic-frame"), artRandom(`${code}-topic`), true);
  overlays($("mine-frame"), M.rand, false);
  stage.classList.add("is-infer");
  const RUN = INFER * 0.88;
  const span = RUN / MODELS.length;
  const start = clock;
  let cur = -1;
  await new Promise((resolve) => {
    (function step() {
      const t = Math.min(INFER, clock - start);
      const pr = skipping ? 1 : t / INFER;
      $("infer-bar").style.setProperty("--p", pr);
      $("infer-t").textContent = `${(t / 1000).toFixed(1)}s / ~${(INFER / 1000).toFixed(0)}s`;
      const k = Math.min(MODELS.length, Math.floor(t / span));
      // 終わったモデルに値を出す
      while (cur < k) {
        if (cur >= 0) {
          const m = MODELS[cur];
          const li = $("models").querySelector(`[data-m="${m.id}"]`);
          li.className = "model is-done";
          li.querySelector(".model-ico").innerHTML = ICON_DONE;
          li.querySelector(".model-val").textContent = showVal(m, M.v[m.id]);
          const sameCat = MODELS.filter((x) => x.cat === m.cat);
          if (sameCat[sameCat.length - 1] === m) {
            const cv = $("models").querySelector(`[data-cat="${m.cat}"]`);
            cv.classList.add("is-done");
            cv.querySelector(".cat-val").textContent = (M.cats[m.cat] * 100).toFixed(1);
          }
        }
        cur++;
        if (cur < MODELS.length) {
          const m = MODELS[cur];
          $("models").querySelector(`[data-m="${m.id}"]`).className = "model is-run";
          $("infer-step").textContent = `${m.name} を実行中`;
          setOverlay(m.ov);
        } else {
          $("infer-step").textContent = "4つの指標から再現度を集計";
          setOverlay(null);
        }
      }
      if (cur < MODELS.length) {
        const m = MODELS[cur];
        const mp = Math.min(1, (t - cur * span) / span);
        $("models").querySelector(`[data-m="${m.id}"]`).style.setProperty("--p", mp);
        // 出力は中身が変わったときだけ描き直す（毎フレーム描き直すと登場の動きが始まり直すため）
        // 黒い出力欄は WD14 のタグだけに使う（ほかのモデルの値は一覧に出る）
        const isTag = m.cat === "tag";
        $("out").hidden = !isTag;
        const html = isTag ? outFor(m, M, mp) : "";
        if ($("out").dataset.last !== html) {
          $("out").dataset.last = html;
          $("out").innerHTML = html;
        }
      } else if (!$("out").dataset.agg) {
        // 再現度の集計: カテゴリごとの値と重み
        $("out").dataset.agg = "1";
        $("out").hidden = false;
        $("out").innerHTML = `<div class="out-head"><b>再現度の集計</b><span>重み付きの合計</span><span>${fmt(p.score.sim)}</span></div>
          <dl class="cats">${CATS.map(
            ([c, label, by]) => `<div><dt>${label}<br /><span style="font-weight:500;color:#7f8fa3;font-family:var(--mono);font-size:.56rem">${by}・×${M.weights[c].toFixed(2)}</span></dt><span class="meter"><i style="--c:${c === "tag" ? "var(--ok)" : c === "char" ? "var(--yellow)" : c === "content" ? "var(--cyan)" : "var(--pink)"}" data-w="${(M.cats[c] * 100).toFixed(1)}"></i></span><dd>${(M.cats[c] * 100).toFixed(1)}</dd></div>`,
          ).join("")}</dl>`;
        requestAnimationFrame(() => $("out").querySelectorAll(".meter i").forEach((el) => (el.style.width = `${el.dataset.w}%`)));
      }
      if (pr >= 1) {
        if (skipping) {
          $("models").querySelectorAll(".model").forEach((li) => {
            const m = MODELS.find((x) => x.id === li.dataset.m);
            li.className = "model is-done";
            li.querySelector(".model-val").textContent = showVal(m, M.v[m.id]);
          });
          $("models").querySelectorAll(".model-cat").forEach((cv) => (cv.classList.add("is-done"), (cv.querySelector(".cat-val").textContent = (M.cats[cv.dataset.cat] * 100).toFixed(1))));
        }
        resolve();
      } else requestAnimationFrame(step);
    })();
  });
  await sleep(900);
  stage.classList.remove("is-infer");
  setOverlay(null);
  stage.classList.add("is-done");

  // 点数を出す
  document.querySelectorAll(".parts .meter i").forEach((el) => (el.style.width = `${el.dataset.w}%`));
  await countUp($("score-num"), p.score.total, 1400);
  const r = liveRank(p, i + 1);
  const st = $("stamp");
  st.style.setProperty("--c", r === 1 ? "var(--pink)" : "var(--ink)");
  st.innerHTML = `<small>${r === 1 ? "TOP" : "RANK"}</small>現在 ${r}位`;
  st.classList.add("is-on");
  await sleep(2200);
}

// ---------- 最終結果 ----------
function confetti() {
  if (reducedMotion) return;
  const c = document.createElement("div");
  c.className = "confetti";
  c.setAttribute("aria-hidden", "true");
  const colors = ["#ff2d87", "#00b4fc", "#fddb13", "#ff72b9", "#ffffff"];
  c.innerHTML = Array.from({ length: 110 }, () => {
    const w = 6 + Math.random() * 8;
    return `<i style="left:${Math.random() * 100}%;--c:${colors[Math.floor(Math.random() * colors.length)]};--w:${w}px;--h:${w * (1.2 + Math.random())}px;--x:${(Math.random() - 0.5) * 40}vw;--r:${(Math.random() - 0.5) * 1440}deg;--t:${2.4 + Math.random() * 2}s;--dl:${Math.random() * 0.8}s"></i>`;
  }).join("");
  document.body.append(c);
  setTimeout(() => c.remove(), 5600);
}

function showFinal() {
  $("stage").hidden = true;
  $("rail").hidden = true;
  $("fast").hidden = true;
  $("skip").hidden = true;
  $("phase-label").innerHTML = '<span class="eyebrow">Result</span><b>結果発表</b>';
  $("track").style.transform = "scaleX(1)";
  const submitted = players.some((p) => p.score);
  const ord = ["1st", "2nd", "3rd"];
  if (!submitted) {
    $("verdict-title").textContent = "NO GAME";
    $("verdict-sub").textContent = "誰も提出しなかったため、勝負不成立です";
  } else if (!me.score) {
    $("verdict-title").textContent = "NO ENTRY";
    $("verdict-sub").textContent = `今回は提出できませんでした。1位は ${ranked[0].name} さん`;
  } else {
    $("verdict-title").textContent = me.rank <= 3 ? `${ord[me.rank - 1]}!` : `${me.rank}th`;
    $("verdict-sub").textContent = me.rank === 1 ? `あなたが1位！ ${players.length}人の中でいちばんお題に近い1枚でした` : `あなたは ${players.length}人中 ${me.rank}位。1位は ${ranked[0].name} さん（${fmt(ranked[0].score.total)}pt）`;
  }
  const top = ranked.filter((p) => p.score).slice(0, 3);
  $("podium").innerHTML = top
    .map(
      (p, i) => `<div class="podium-slot r${i + 1}${p.isMe ? " is-me-slot" : ""}" style="--d:${2 - i}">
        <div class="podium-card-wrap">${i === 0 ? '<span class="crown"><svg width="56" height="42" viewBox="0 0 24 18" aria-hidden="true"><path d="M2 5l5 4 5-7 5 7 5-4-2 11H4z" fill="#fddb13" stroke="#0b1b2b" stroke-width="1.6" stroke-linejoin="round" /></svg></span>' : ""}<div class="podium-card">${art(p, `${p.name}さんの提出画像`)}</div></div>
        <div class="podium-who">${avatar(p)}<b>${escapeHtml(p.name)}</b></div>
        <div class="podium-score">${fmt(p.score.total)}</div>
        <div class="step">${p.rank}</div>
      </div>`,
    )
    .join("");
  $("ranking").innerHTML = ranked
    .map(
      (p, i) => `<li class="${p.isMe ? "is-me" : ""}" style="--d:${i}">
        <span class="no">${p.score ? p.rank : "—"}</span>
        <span class="thumb">${p.score ? art(p) : ""}</span>
        <span class="nm">${avatar(p)}<span>${escapeHtml(p.name)}${p.isMe ? "（あなた）" : ""}</span></span>
        <span class="sub">${p.score ? `再現度 ${fmt(p.score.sim)}・速度 +${p.score.speed}・回数 +${p.score.gens}` : "未提出"}</span>
        <span class="pt">${p.score ? fmt(p.score.total) : "—"}</span>
      </li>`,
    )
    .join("");
  $("final").hidden = false;
  scrollTo({ top: 0 });
  if (me.score && me.rank === 1) confetti();
  else if (submitted) setTimeout(confetti, 900);
}

async function run() {
  await playWipeOut();
  renderRail(0);
  if (reducedMotion) return showFinal();
  for (let i = 0; i < order.length; i++) {
    if (skipping) break;
    $("track").style.transform = `scaleX(${i / order.length})`;
    await judge(order[i], i);
  }
  $("track").style.transform = "scaleX(1)";
  showFinal();
}
run();

const lobbyQuery = { code, name: me.name, role };
$("rematch").addEventListener("click", (e) => wipeTo("lobby.html", lobbyQuery, e.currentTarget));
$("home").addEventListener("click", (e) => wipeTo("index.html", {}, e.currentTarget));
$("share").addEventListener("click", () => toast("シェアリンクをコピーしました"));
