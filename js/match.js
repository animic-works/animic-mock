playWipeOut();
const $ = (id) => document.getElementById(id);
const q = params();
const sample = q.has("sample");
const list = sample ? SAMPLE_HISTORY : getAccount() ? getHistory() : [];
const e = list.find((x) => x.key === q.get("key"));
if (sample) $("back").href = "mypage.html?sample";

// お題の画像（ロビー・対戦・結果と同じ）
const TOPIC_ART = { かんたん: "images/sample-solo-white-bg.png", ふつう: "images/sample-solo-with-bg.png", むずかしい: "images/sample-duo-with-bg.png" };
const CATS = [
  ["char", "キャラクター一致度", "CCIP"],
  ["tag", "タグ一致度", "WD14・PixAI"],
  ["content", "内容一致度", "DreamSim・SigLIP 2・DINOv2"],
  ["pose", "ポーズ一致度", "Depth・OpenPose"],
];
const ord = (n) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
const fmt = (n) => n.toFixed(1);

function render() {
  if (!e) {
    $("missing").hidden = false;
    return;
  }
  $("detail").hidden = false;
  document.title = `${e.level}・${e.players}人対戦の詳細 | Animic`;
  const f = e.art ? artDecode(e.art) : null;

  // 画像
  $("topic").innerHTML = `<img src="${TOPIC_ART[e.level] || TOPIC_ART.かんたん}" alt="お題の画像" width="832" height="1216" />`;
  // 生成画像のモックは正方形なので、縦長の枠いっぱいに広げて左右を切り取る
  $("mine").innerHTML = f ? artSvg(f, "あなたの提出画像").replace("<svg ", '<svg preserveAspectRatio="xMidYMid slice" ') : '<p class="shot-none">未提出</p>';
  $("vs").innerHTML = e.sim != null ? `<small>再現度</small><b>${fmt(e.sim)}</b>` : "<b>—</b>";

  // 順位と対戦の情報
  $("rank").innerHTML = e.rank ? `${ord(e.rank)}<small>/ ${e.players}人</small>` : "NO ENTRY";
  $("rank").classList.toggle("is-win", e.rank === 1);
  $("meta-title").textContent = `${e.level}・${e.players}人対戦`;
  const date = new Date(e.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  $("meta-sub").innerHTML = `${date}${e.code ? `・ルーム <code>${escapeHtml(e.code)}</code>` : ""}`;
  $("total").innerHTML = e.total != null ? `${fmt(e.total)}<small>pt</small>` : "—";

  // スコアの内訳（再現度 + 提出速度 + 生成回数）と指標
  if (e.total == null) $("breakdown-panel").hidden = true;
  else {
    const term = (label, value, sign = "") => `<span class="term"><small>${label}</small><b>${sign}${value}</b></span>`;
    $("formula").innerHTML =
      term("再現度", fmt(e.sim)) +
      '<span class="op">+</span>' +
      term("提出速度", e.speed ?? "—", "") +
      '<span class="op">+</span>' +
      term(`生成回数${e.gens ? `（${e.gens}回）` : ""}`, e.bonus ?? "—") +
      '<span class="op">=</span>' +
      term("合計", fmt(e.total));
    $("cats").innerHTML = e.cats
      ? CATS.map(
          ([k, label, models]) => `<div class="cat">
            <dt>${label}<small>${models}</small></dt>
            <dd><span class="meter"><i style="width:${e.cats[k]}%"></i></span><b>${fmt(e.cats[k])}</b></dd>
          </div>`,
        ).join("")
      : "";
  }

  // プロンプト（モックでは提出画像の特徴のタグで代用する）
  if (!f) $("prompt-panel").hidden = true;
  else {
    const tags = ["1girl", "solo", ...ART_KEYS.map((k) => artPick(k, f[k]).tag), "looking at viewer"];
    $("tags").innerHTML = tags.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
    $("copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(tags.join(", "));
        toast("プロンプトをコピーしました");
      } catch {
        toast("コピーできませんでした");
      }
    });
  }

  // この対戦の全員の順位
  const account = sample ? SAMPLE_ACCOUNT : getAccount();
  const ranking = e.ranking || [{ name: account?.name || "あなた", rank: e.rank, total: e.total, art: e.art, isMe: true }];
  $("board").innerHTML = ranking
    .map((p, i) => {
      const pf = p.art ? artDecode(p.art) : null;
      return `<li class="${p.isMe ? "is-me" : ""}${p.rank === 1 ? " is-win" : ""}" style="--d:${i}">
        <span class="board-rank">${p.rank ?? "—"}</span>
        <span class="board-thumb">${pf ? artSvg(pf, `${p.name}さんの提出画像`) : ""}</span>
        <span class="board-name">${escapeHtml(p.name)}${p.isMe ? "<small>（あなた）</small>" : ""}</span>
        <span class="board-pt">${p.total != null ? `${fmt(p.total)}<small>pt</small>` : "未提出"}</span>
      </li>`;
    })
    .join("");
}
render();

$("again").addEventListener("click", (event) => wipeTo("login.html", { next: "create" }, event.currentTarget));
$("share").addEventListener("click", () => toast("シェアリンクをコピーしました"));
