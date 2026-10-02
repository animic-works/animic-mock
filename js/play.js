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

// ---------- よく使う表現 ----------
// 押すと入力欄に足し、入力欄にある表現はもう一度押すと消せる
// 表現の辞書（検索・入力候補用）。Danbooru の tag groups（https://danbooru.donmai.us/wiki_pages/tag_groups）から
// キャラの絵作りによく使うタグを選んでいる。どのタグもベース・キャラのどちらにも入れられる
const T = (list) => list.map(([ja, tag]) => [ja, tag]);
const DICT_GROUPS = [
  { key: "who", label: "人数", extra: T([["1人の女の子", "1girl"], ["2人の女の子", "2girls"], ["1人の男の子", "1boy"], ["1人だけ", "solo"], ["複数の女の子", "multiple girls"]]) },
  { key: "hair", label: "髪の色", extra: T([["茶髪", "brown hair"], ["赤髪", "red hair"], ["白髪", "white hair"], ["灰色の髪", "grey hair"], ["緑の髪", "green hair"], ["紫の髪", "purple hair"], ["オレンジの髪", "orange hair"], ["水色の髪", "aqua hair"], ["2色の髪", "two-tone hair"], ["グラデーションの髪", "gradient hair"], ["メッシュ", "streaked hair"]]) },
  { key: "style", label: "髪型", extra: T([["ショートヘア", "short hair"], ["ミディアムヘア", "medium hair"], ["ベリーロング", "very long hair"], ["ポニーテール", "ponytail"], ["サイドテール", "side ponytail"], ["ハイポニーテール", "high ponytail"], ["三つ編み", "single braid"], ["おさげ（2本の三つ編み）", "twin braids"], ["お団子", "hair bun"], ["2つのお団子", "double bun"], ["前髪ぱっつん", "blunt bangs"], ["サイドの髪", "sidelocks"], ["アホ毛", "ahoge"]]) },
  { key: "eyes", label: "目", extra: T([["茶色の目", "brown eyes"], ["紫の目", "purple eyes"], ["黄色の目", "yellow eyes"], ["ピンクの目", "pink eyes"], ["水色の目", "aqua eyes"], ["オッドアイ", "heterochromia"], ["ジト目", "half-closed eyes"], ["目を閉じる", "closed eyes"], ["つり目", "tsurime"], ["たれ目", "tareme"]]) },
  { key: "face", label: "表情", extra: T([["照れ", "blush"], ["口を開ける", "open mouth"], ["怒り", "angry"], ["悲しい", "sad"], ["驚き", "surprised"], ["泣き顔", "crying"], ["困り顔", "worried"], ["真剣", "serious"], ["考え中", "thinking"], ["ドヤ顔", "smug"], ["舌を出す", "tongue out"], ["にやり", "grin"]]) },
  { key: "outfit", label: "服", extra: T([["制服", "school uniform"], ["メイド服", "maid"], ["着物", "kimono"], ["ブレザー", "blazer"], ["シャツ", "shirt"], ["セーター", "sweater"], ["ジャケット", "jacket"], ["コート", "coat"], ["スカート", "skirt"], ["プリーツスカート", "pleated skirt"], ["ショートパンツ", "shorts"], ["スーツ", "suit"], ["エプロン", "apron"], ["マント", "cape"], ["ネクタイ", "necktie"], ["ニーハイ", "thighhighs"], ["ブーツ", "boots"]]) },
  { key: "head", label: "頭の飾り", extra: T([["髪のリボン", "hair ribbon"], ["ヘアバンド", "hairband"], ["髪飾り", "hair ornament"], ["髪のリボン（蝶結び）", "hair bow"], ["ヘアクリップ", "hairclip"], ["カチューシャ（メイド）", "maid headdress"], ["花の髪飾り", "hair flower"], ["帽子", "hat"], ["ベレー帽", "beret"], ["魔女の帽子", "witch hat"], ["麦わら帽子", "straw hat"], ["野球帽", "baseball cap"], ["フード", "hood"], ["ヘッドホン", "headphones"], ["王冠", "crown"]]) },
  { key: "acc", label: "アクセサリー", extra: T([["眼鏡", "glasses"], ["丸眼鏡", "round eyewear"], ["イヤリング", "earrings"], ["チョーカー", "choker"], ["ネックレス", "necklace"], ["リボン", "ribbon"], ["首のリボン", "neck ribbon"], ["ブレスレット", "bracelet"], ["手袋", "gloves"], ["指なし手袋", "fingerless gloves"], ["マフラー", "scarf"], ["リュック", "backpack"]]) },
  { key: "legs", label: "脚・靴", extra: T([["ニーハイ", "thighhighs"], ["タイツ", "pantyhose"], ["ソックス", "socks"], ["ルーズソックス", "loose socks"], ["ハイソックス", "kneehighs"], ["ブーツ", "boots"], ["ローファー", "loafers"], ["スニーカー", "sneakers"], ["サンダル", "sandals"], ["裸足", "barefoot"]]) },
  { key: "race", label: "耳・種族", extra: T([["猫耳", "cat ears"], ["犬耳", "dog ears"], ["うさ耳", "rabbit ears"], ["きつね耳", "fox ears"], ["しっぽ", "tail"], ["猫のしっぽ", "cat tail"], ["羽", "wings"], ["天使の羽", "angel wings"], ["角", "horns"], ["エルフ", "elf"], ["とがった耳", "pointy ears"], ["天使の輪", "halo"]]) },
  { key: "role", label: "職業・属性", extra: T([["メイド", "maid"], ["巫女", "miko"], ["魔女", "witch"], ["シスター", "nun"], ["看護師", "nurse"], ["アイドル", "idol"], ["騎士", "knight"], ["忍者", "ninja"], ["探偵", "detective"], ["魔法少女", "magical girl"], ["学生", "student"], ["ウェイトレス", "waitress"]]) },
  { key: "hold", label: "持ち物", extra: T([["本を持つ", "holding book"], ["傘を持つ", "holding umbrella"], ["花を持つ", "holding flower"], ["カップを持つ", "holding cup"], ["スマホを持つ", "holding phone"], ["剣を持つ", "holding sword"], ["杖を持つ", "holding staff"], ["ぬいぐるみを持つ", "holding stuffed toy"], ["食べ物を持つ", "holding food"], ["マイクを持つ", "holding microphone"]]) },
  { key: "gesture", label: "しぐさ・視線", extra: T([["振り返る", "looking back"], ["横を向く", "looking to the side"], ["見上げる", "looking up"], ["うつむく", "looking down"], ["首をかしげる", "head tilt"], ["ウインク", "one eye closed"], ["指さす", "pointing"], ["ハートの手", "heart hands"], ["敬礼", "salute"], ["人差し指を口に", "finger to mouth"], ["両手を合わせる", "own hands together"], ["髪をいじる", "playing with own hair"]]) },
  { key: "pose", label: "ポーズ", extra: T([["立つ", "standing"], ["座る", "sitting"], ["ひざまずく", "kneeling"], ["寝そべる", "lying"], ["腕を上げる", "arms up"], ["腕を組む", "crossed arms"], ["手を後ろで組む", "arms behind back"], ["腰に手", "hand on hip"], ["ピース", "v"], ["手を振る", "waving"], ["頬に手", "hand on own cheek"], ["手を広げる", "outstretched arms"]]) },
  { key: "bg", label: "背景", extra: T([["シンプルな背景", "simple background"], ["グラデーション背景", "gradient background"], ["黒背景", "black background"], ["ピンクの背景", "pink background"], ["ぼかした背景", "blurry background"], ["透過背景", "transparent background"]]) },
  { key: "scene", label: "場所・天気", extra: T([["屋外", "outdoors"], ["屋内", "indoors"], ["夜空", "night sky"], ["星空", "starry sky"], ["夕焼け", "sunset"], ["雲", "cloud"], ["森", "forest"], ["海辺", "beach"], ["街", "city"], ["寝室", "bedroom"], ["桜", "cherry blossoms"], ["雪", "snow"], ["雨", "rain"], ["カフェ", "cafe"], ["図書館", "library"], ["屋上", "rooftop"], ["神社", "shrine"], ["水中", "underwater"], ["草原", "field"], ["夜の街", "night, city lights"], ["ファンタジー", "fantasy"]]) },
  { key: "comp", label: "構図", extra: T([["バストアップ", "upper body"], ["膝上（カウボーイショット）", "cowboy shot"], ["全身", "full body"], ["顔のアップ", "portrait"], ["クローズアップ", "close-up"], ["カメラ目線", "looking at viewer"], ["横から", "from side"], ["後ろから", "from behind"], ["上から", "from above"], ["下から", "from below"], ["斜めの構図", "dutch angle"], ["引きの構図", "wide shot"]]) },
  { key: "art", label: "画風", extra: T([["アニメ塗り", "anime coloring"], ["水彩", "watercolor (medium)"], ["油絵", "oil painting (medium)"], ["線画", "lineart"], ["スケッチ", "sketch"], ["ピクセルアート", "pixel art"], ["ちびキャラ", "chibi"], ["レトロアニメ風", "retro artstyle"], ["厚塗り", "impasto"], ["3D", "3d"]]) },
  { key: "quality", label: "品質", extra: T([["傑作", "masterpiece"], ["高画質", "best quality"], ["高解像度", "highres"], ["非常に美しい", "very aesthetic"], ["細部まで描き込み", "highly detailed"], ["最新", "newest"]]) },
  { key: "light", label: "光・効果", extra: T([["逆光", "backlighting"], ["日差し", "sunlight"], ["木漏れ日", "dappled sunlight"], ["ネオン", "neon lights"], ["リムライト", "rim lighting"], ["被写界深度", "depth of field"], ["ボケ", "bokeh"], ["レンズフレア", "lens flare"], ["きらきら", "sparkle"], ["光の粒", "light particles"], ["花びら", "petals"], ["色収差", "chromatic aberration"]]) },
  { key: "color", label: "色調", extra: T([["モノクロ", "monochrome"], ["グレースケール", "greyscale"], ["パステルカラー", "pastel colors"], ["カラフル", "colorful"], ["淡い色", "muted color"], ["ハイコントラスト", "high contrast"], ["セピア", "sepia"], ["暖色", "warm colors"], ["寒色", "cool colors"]]) },
  { key: "season", label: "季節・行事", extra: T([["春", "spring (season)"], ["夏", "summer"], ["秋", "autumn"], ["冬", "winter"], ["紅葉", "autumn leaves"], ["クリスマス", "christmas"], ["ハロウィン", "halloween"], ["お正月", "new year"], ["バレンタイン", "valentine"], ["夏祭り", "summer festival"], ["花火", "fireworks"]]) },
];
// 生成画像のモックで扱う特徴（ART_FEATURES）を先頭に置き、タグが同じものは1つにまとめる
const DICT = (() => {
  const seen = new Set();
  return DICT_GROUPS.flatMap((g) => [...(ART_FEATURES[g.key] || []).map((o) => ({ ja: o.label, tag: o.tag, g })), ...(g.extra || []).map(([ja, tag]) => ({ ja, tag, g }))]).filter((e) => {
    const k = e.tag.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
})();
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
const GENRE_DOTS = { hair: "var(--pink)", style: "#ffb200", eyes: "var(--cyan)", outfit: "#7c5cff", face: "#ff7a45", pose: "#16b37e", who: "#5b6573", head: "#ff72b9", acc: "#e8414f", legs: "#5b6573", race: "#ffb200", role: "#7c5cff", hold: "#00b4fc", gesture: "#ff7a45", bg: "#16b37e", scene: "#00b4fc", comp: "#0b7a54", art: "#ff72b9", quality: "#f5c400", light: "#ffb200", color: "#7c5cff", season: "#e8414f" };
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

renderChips();
showStageIdle();
updateControls();
