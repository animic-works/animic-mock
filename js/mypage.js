playWipeOut();
const $ = (id) => document.getElementById(id);
const q = params();

// ?sample で、ログイン中のサンプルの戦績を表示する（保存はしない）
const SAMPLE_ACCOUNT = { provider: "Google", name: "ねこぜ" };
const DAY = 864e5;
const SAMPLE_HISTORY = [
  { key: "s1", at: Date.now() - 0.1 * DAY, level: "ふつう", players: 4, rank: 1, total: 128.4, sim: 91.2, art: "pink.twin.blue.sailor.smile.sky" },
  { key: "s2", at: Date.now() - 0.3 * DAY, level: "ふつう", players: 4, rank: 3, total: 88.0, sim: 70.4, art: "blonde.long.red.hoodie.wink.white" },
  { key: "s3", at: Date.now() - 1.2 * DAY, level: "かんたん", players: 2, rank: 1, total: 112.6, sim: 86.1, art: "pink.bob.blue.sailor.smile.white" },
  { key: "s4", at: Date.now() - 3 * DAY, level: "むずかしい", players: 3, rank: 2, total: 79.3, sim: 64.8, art: "silver.long.green.dress.calm.room" },
  { key: "s5", at: Date.now() - 6 * DAY, level: "かんたん", players: 2, rank: null, total: null, sim: null, art: null },
];
const sample = q.has("sample");
let account = sample ? SAMPLE_ACCOUNT : getAccount();
const history = sample ? SAMPLE_HISTORY : getHistory();
let filter = "all";

const ord = (n) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
const firstChar = (name) => [...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(name)][0]?.segment ?? "?";
function when(at) {
  const diff = Date.now() - at;
  if (diff < 60 * 60e3) return "さっき";
  if (diff < DAY) return `${Math.floor(diff / 3600e3)}時間前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}日前`;
  return new Date(at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function renderProfile() {
  $("profile-avatar").innerHTML = `${escapeHtml(firstChar(account.name))}<span class="account-badge">${PROVIDER_ICONS[account.provider] || ""}</span>`;
  $("profile-name").textContent = account.name;
  $("profile-sub").innerHTML = `<span class="acc-prov">${PROVIDER_ICONS[account.provider] || ""}</span>${escapeHtml(account.provider)}でログイン中`;
}

function renderStats() {
  const played = history.filter((e) => e.total != null);
  const wins = history.filter((e) => e.rank === 1).length;
  const best = played.reduce((m, e) => Math.max(m, e.total), 0);
  const avgSim = played.length ? played.reduce((s, e) => s + (e.sim ?? 0), 0) / played.length : 0;
  const tile = (label, value, unit = "", accent = false) =>
    `<div class="stat${accent ? " is-accent" : ""}"><span class="stat-label">${label}</span><b>${value}<small>${unit}</small></b></div>`;
  $("stats").innerHTML =
    tile("1位", wins, "回", true) +
    tile("対戦", history.length, "回") +
    tile("勝率", history.length ? Math.round((wins / history.length) * 100) : 0, "%") +
    tile("ベストスコア", best ? best.toFixed(1) : "—", best ? "pt" : "") +
    tile("平均の再現度", avgSim ? avgSim.toFixed(1) : "—", avgSim ? "%" : "");
}

function renderMatches() {
  const list = history.filter((e) => filter === "all" || e.rank === 1);
  if (!history.length) {
    $("matches").innerHTML = `<li class="empty">
      <b>まだ戦績がありません</b>
      <span>対戦すると、順位とスコアがここに残ります。</span>
      <button class="pill pill-pink" type="button" data-start>対戦をはじめる</button>
    </li>`;
    return;
  }
  if (!list.length) {
    $("matches").innerHTML = `<li class="empty"><b>1位になった対戦はまだありません</b><span>次の対戦で狙ってみよう！</span></li>`;
    return;
  }
  $("matches").innerHTML = list
    .map((e, i) => {
      const f = e.art ? artDecode(e.art) : null;
      return `<li class="match${e.rank === 1 ? " is-win" : ""}" style="--d:${i}">
        <span class="match-thumb">${f ? artSvg(f, "提出画像") : '<span class="no-entry">未提出</span>'}</span>
        <span class="match-rank">${e.rank ? ord(e.rank) : "—"}</span>
        <span class="match-info">
          <b>${escapeHtml(e.level)}・${e.players}人対戦</b>
          <small>${when(e.at)}</small>
        </span>
        <span class="match-sim">${e.sim != null ? `<span class="meter"><i style="width:${Math.min(100, e.sim)}%"></i></span><small>再現度 ${e.sim.toFixed(1)}</small>` : "<small>提出なし</small>"}</span>
        <span class="match-pt">${e.total != null ? `${e.total.toFixed(1)}<small>pt</small>` : "—"}</span>
      </li>`;
    })
    .join("");
}

function render() {
  const signedIn = !!account;
  $("profile").hidden = $("stats").hidden = $("history").hidden = !signedIn;
  $("guest").hidden = signedIn;
  if (!signedIn) return;
  renderProfile();
  renderStats();
  renderMatches();
}
render();

// 表示名の変更（ログイン中のアカウントに保存する）
function editName(open) {
  $("name-view").hidden = open;
  $("name-form").hidden = !open;
  if (open) {
    $("name-input").value = account.name;
    $("name-input").focus();
    $("name-input").select();
  } else $("name-edit").focus();
}
$("name-edit").addEventListener("click", () => editName(true));
$("name-cancel").addEventListener("click", () => editName(false));
$("name-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("name-input").value.trim();
  if (!name) return;
  account = { ...account, name };
  if (!sample) {
    setAccount(account);
    rememberName(name);
  }
  renderProfile();
  editName(false);
  toast("表示名を変更しました");
});
$("name-form").addEventListener("keydown", (event) => event.key === "Escape" && editName(false));

document.querySelectorAll("[data-filter]").forEach((button) =>
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    renderMatches();
  }),
);

$("logout").addEventListener("click", () => {
  if (!sample) signOut();
  account = null;
  render();
  toast("ログアウトしました");
});
$("guest-login").addEventListener("click", (event) => goLogin("login", {}, event.currentTarget));
const start = (trigger) => wipeTo("login.html", { next: "create" }, trigger);
$("start").addEventListener("click", (event) => start(event.currentTarget));
$("matches").addEventListener("click", (event) => {
  const b = event.target.closest("[data-start]");
  if (b) start(b);
});
