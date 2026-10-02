// 表現の辞書（プロンプトの検索・入力候補・よく使う表現で使う）。js/art.js のあと、js/prompt.js の前に読み込む
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

// 検索のジャンル一覧の色
const GENRE_DOTS = { hair: "var(--pink)", style: "#ffb200", eyes: "var(--cyan)", outfit: "#7c5cff", face: "#ff7a45", pose: "#16b37e", who: "#5b6573", head: "#ff72b9", acc: "#e8414f", legs: "#5b6573", race: "#ffb200", role: "#7c5cff", hold: "#00b4fc", gesture: "#ff7a45", bg: "#16b37e", scene: "#00b4fc", comp: "#0b7a54", art: "#ff72b9", quality: "#f5c400", light: "#ffb200", color: "#7c5cff", season: "#e8414f" };
