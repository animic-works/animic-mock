const $ = (id) => document.getElementById(id);
const q = params();
const code = isValidCode(q.get("code") || "") ? q.get("code") : randomCode();
const roomUrl = `https://animic.party/rooms/${code}`;
const MAX = 8;
// 参加者の色はロゴと同じ色だけを使う（参加順に割り当てる）
const COLORS = [
  ["#ff2d87", "#fff"],
  ["#00b4fc", "#fff"],
  ["#fddb13", "#0b1b2b"],
  ["#0b1b2b", "#fff"],
  ["#ff72b9", "#fff"],
  ["#6fd3ff", "#0b1b2b"],
  ["#ffe98a", "#0b1b2b"],
  ["#5b6573", "#fff"],
];
const isHost = q.get("role") !== "guest";
const me = { name: q.get("name") || "ゲスト", ready: false, isMe: true };
// ログインしていれば、自分のアバターにログインしたサービスの印を付ける
const account = getAccount();
// ホストは開始の操作をするので、準備完了の操作はせず準備OKとして数える
if (isHost) me.ready = true;
const players = isHost ? [me] : [{ name: "ホストさん", ready: true }, me];
const host = players[0];
// モック: あとから参加してくる人
const POOL = ["ぴよ丸", "ぴくせる侍", "プロンプト職人", "もちもち"];

$("code").innerHTML = [...code].map((ch) => `<span>${ch}</span>`).join("");
$("invite-code").innerHTML = [...code].map((ch) => `<span>${ch}</span>`).join("");
$("code").setAttribute("aria-label", `ルームコード ${code}`);
$("bar-code").textContent = code;
$("code-chip-text").textContent = code;
$("room-url").value = roomUrl;
playWipeOut();

async function copy(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast("コピーできませんでした");
  }
}
$("copy").addEventListener("click", () => copy(roomUrl, "招待リンクをコピーしました"));
$("bar-room").addEventListener("click", () => copy(code, "ルームコードをコピーしました"));
$("code-chip").addEventListener("click", () => copy(code, "ルームコードをコピーしました"));
const openInvite = () => $("invite-dialog").showModal();
$("invite").addEventListener("click", openInvite);

// QRっぽい模様（モック）
(() => {
  const ctx = $("qr").getContext("2d");
  let seed = [...code].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 21, 21);
  ctx.fillStyle = "#0b1b2b";
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) if (rand() > 0.55) ctx.fillRect(x, y, 1, 1);
  for (const [x, y] of [[0, 0], [14, 0], [0, 14]]) {
    ctx.fillStyle = "#0b1b2b"; ctx.fillRect(x, y, 7, 7);
    ctx.fillStyle = "#fff"; ctx.fillRect(x + 1, y + 1, 5, 5);
    ctx.fillStyle = "#0b1b2b"; ctx.fillRect(x + 2, y + 2, 3, 3);
  }
})();

// 難易度の英語と説明。選んでいるものだけを挿絵の上に表示する
const LEVELS = {
  かんたん: { en: "EASY", desc: ["背景なし", "1キャラクター"] },
  ふつう: { en: "NORMAL", desc: ["背景あり", "1キャラクター"] },
  むずかしい: { en: "HARD", desc: ["背景あり", "2キャラクター"], extra: true },
};
// 挿絵: お題の条件（背景の有無・キャラクターの人数）に合わせたサンプル画像
const LEVEL_ART = {
  かんたん: "images/sample-solo-white-bg.png",
  ふつう: "images/sample-solo-with-bg.png",
  むずかしい: "images/sample-duo-with-bg.png",
};
// 3枚とも最初から置いておき、選んでいる難易度の絵だけを見せる（切り替えのたびに読み込み待ちにならないように）
document.querySelectorAll("[data-level-art]").forEach((fig) => {
  const imgs = Object.entries(LEVEL_ART).map(
    ([level, src]) => `<img src="${src}" alt="${level}のお題のイメージ" width="832" height="1216" data-level="${level}" decoding="async" hidden />`,
  );
  fig.insertAdjacentHTML("afterbegin", imgs.join(""));
});
function renderLevel() {
  const level = document.querySelector("[name=level]:checked").value;
  const lv = LEVELS[level];
  document.querySelectorAll("[data-level-word]").forEach((el) => (el.innerHTML = `${lv.en}${lv.extra ? "<b>EXTRA</b>" : ""}`));
  document.querySelectorAll("[data-level-desc]").forEach((el) => (el.innerHTML = lv.desc.map((t) => `<span>${t}</span>`).join("")));
  document.querySelectorAll("[data-level-art] img").forEach((img) => (img.hidden = img.dataset.level !== level));
}
document.querySelectorAll("[name=level]").forEach((i) => i.addEventListener("change", renderLevel));
renderLevel();

// プレイヤーの枠（参加順に並べ、先頭がホスト）
const shown = new Set(players);
function renderPlayers() {
  const cells = [];
  for (let i = 0; i < Math.min(MAX, players.length + 1); i++) {
    const p = players[i];
    if (!p) {
      cells.push(`<li><button type="button" class="player is-empty" data-invite><span class="plus" aria-hidden="true">+</span>招待する</button></li>`);
      continue;
    }
    const [bg, fg] = COLORS[i % COLORS.length];
    const joined = shown.has(p) ? "" : " is-joined";
    shown.add(p);
    const tag = p === host ? `<span class="tag">ホスト</span>` : p.isMe ? `<span class="tag me">あなた</span>` : "";
    cells.push(`<li class="player${p.isMe ? " is-me" : ""}${joined}" style="--c:${bg};--on:${fg}">
      ${tag}
      <span class="avatar${p.isMe && account?.icon?.src ? " has-image" : ""}" aria-hidden="true"${p.isMe && account?.icon?.color ? ` style="background:${account.icon.color};color:${account.icon.ink}"` : ""}>${p.isMe && account?.icon?.src ? `<img src="${escapeHtml(account.icon.src)}" alt="" />` : escapeHtml([...p.name][0])}${p.isMe && account ? `<span class="account-badge">${PROVIDER_ICONS[account.provider] || ""}</span>` : ""}</span>
      <b class="name">${escapeHtml(p.name)}${p.isMe && p === host ? "<small>（あなた）</small>" : ""}</b>
      <span class="ready ${p.ready ? "is-on" : ""}">${p.ready ? "準備OK" : "準備中"}</span>
    </li>`);
  }
  $("players").innerHTML = cells.join("");
}
$("players").addEventListener("click", (event) => {
  if (event.target.closest("[data-invite]")) openInvite();
});

function render() {
  renderPlayers();
  const count = players.length;
  const enough = count >= 2;
  const readyCount = players.filter((p) => p.ready).length;
  $("member-count").innerHTML = `${count}<small> / ${MAX}</small>`;

  // ルール: ホストは選択肢、ゲストは決まった内容の文章
  $("rules-edit").hidden = !isHost;
  $("rules-view").hidden = isHost;
  const val = (name) => document.querySelector(`[name=${name}]:checked`).value;
  $("view-level").textContent = val("level");
  $("view-time").textContent = `${val("time")}秒`;
  $("view-limit").textContent = val("limit") === "0" ? "無制限" : `${val("limit")}回`;

  // 開始: ホストは「対戦をはじめる」だけ、ゲストは「準備完了」だけ
  $("go-status").innerHTML = `準備OK <b>${readyCount} / ${count}</b>人`;
  $("go-status").classList.toggle("is-all", count >= 2 && readyCount === count);
  // スマホの下部バーにも同じ準備状況を出す
  $("go-status-bar").innerHTML = `準備OK<b>${readyCount}/${count}</b>`;
  $("go-status-bar").classList.toggle("is-all", count >= 2 && readyCount === count);
  $("start").hidden = !isHost;
  $("start").disabled = !enough;
  $("ready").hidden = isHost;
  $("ready").textContent = me.ready ? "準備完了を取り消す" : "準備完了にする";
  $("note").textContent = isHost ? "" : "ホストが開始します";
}
render();

// 他の参加者の動き（モック）: 時間差で入ってきて、しばらくすると準備完了にする
(async () => {
  const arrivals = isHost ? POOL.slice(0, 3) : POOL.slice(1, 3);
  for (const [i, name] of arrivals.entries()) {
    await wait(i === 0 ? 2500 : 2200);
    const p = { name, ready: false };
    players.push(p);
    render();
    toast(`${name} さんが参加しました`);
    setTimeout(() => {
      p.ready = true;
      render();
    }, 1800 + i * 900);
  }
})();

$("ready").addEventListener("click", async () => {
  me.ready = !me.ready;
  render();
  // ゲストのときは、準備完了するとホストが開始する想定
  if (!isHost && me.ready && players.length >= 2) {
    await wait(1800);
    if (me.ready) startCountdown();
  }
});

// 準備中の人がいるときは、そのまま始めてよいか確認する
$("start").addEventListener("click", () => {
  const waiting = players.filter((p) => !p.ready);
  if (!waiting.length) return startCountdown();
  $("start-sub").textContent = `準備中の人が${waiting.length}人います。このまま対戦をはじめますか？`;
  $("waiting").innerHTML = waiting
    .map((p) => {
      const [bg, fg] = COLORS[players.indexOf(p) % COLORS.length];
      return `<li style="--c:${bg};--on:${fg}"><span class="avatar" aria-hidden="true">${escapeHtml([...p.name][0])}</span>${escapeHtml(p.name)}<small>準備中</small></li>`;
    })
    .join("");
  $("start-dialog").showModal();
});
$("start-dialog").addEventListener("close", () => {
  if ($("start-dialog").returnValue === "start") startCountdown();
});

async function startCountdown() {
  const level = document.querySelector("[name=level]:checked").value;
  const time = document.querySelector("[name=time]:checked").value;
  const limit = document.querySelector("[name=limit]:checked").value;
  $("countdown-label").textContent = `${level}・${time}秒・${limit === "0" ? "生成回数は無制限" : `生成${limit}回まで`}`;
  $("countdown").hidden = false;
  for (const n of [3, 2, 1]) {
    const el = $("countdown-num");
    el.textContent = n;
    el.style.animation = "none";
    el.offsetWidth;
    el.style.animation = "";
    await wait(900);
  }
  $("countdown-num").textContent = "START!";
  $("countdown-num").style.fontSize = "clamp(3.5rem, 16vw, 7rem)";
  $("countdown-sub").textContent = "お題を公開します";
  await wait(700);
  // 結果画面は今のところ1対1のため、最初の相手も別に渡す
  const opponent = players.find((p) => p !== me);
  // 対戦画面で全員の様子を出すため、参加者全員の名前と自分の席も渡す
  wipeTo("play.html", {
    code,
    level,
    time,
    limit,
    name: me.name,
    opp: opponent?.name || "ぴよ丸",
    players: JSON.stringify(players.map((p) => p.name)),
    seat: players.indexOf(me),
    role: isHost ? "host" : "guest",
  });
}

// 退出
document.querySelectorAll(".leave").forEach((b) => b.addEventListener("click", () => $("leave-dialog").showModal()));
$("leave-dialog").addEventListener("close", () => {
  if ($("leave-dialog").returnValue === "leave") go("index.html");
});
