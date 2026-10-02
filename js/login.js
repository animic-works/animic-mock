playWipeOut();
const q = params();
// next: create（ルームを作る）・join（ルームに参加）・login（ログインだけして戻る）・save（結果を戦績に残して戻る）
const next = ["join", "login", "save"].includes(q.get("next")) ? q.get("next") : "create";
const code = q.get("code");
const joining = next === "join" && isValidCode(code || "");
// 戻り先はこのモックの画面だけにする（外のURLへは飛ばさない）
const back = /^[a-z]+\.html(\?.*)?$/.test(q.get("back") || "") ? q.get("back") : "index.html";
let provider = null;

const $ = (id) => document.getElementById(id);
if (joining) {
  $("context").hidden = false;
  $("context").innerHTML = `ルーム <code>${code}</code> に参加します`;
  $("name-submit").textContent = "ルームに参加";
}

// ログインだけ・結果の保存: ゲストで進むボタンの代わりに「戻る」を出し、ログインしてできることを見せる
const COPY = {
  login: { title: "ログイン", sub: "ログインしなくても遊べます。", back: "戻る" },
  save: { title: "結果を戦績に残そう", sub: "ログインすると、この対戦の結果を保存できます。", back: "結果へ戻る" },
};
if (COPY[next]) {
  document.title = `${COPY[next].title} | Animic`;
  $("login-title").textContent = COPY[next].title;
  $("login-sub").textContent = COPY[next].sub;
  $("perks").hidden = false;
  $("guest-area").hidden = true;
  $("cancel").hidden = false;
  $("cancel").textContent = next === "save" ? "保存せずに結果へ戻る" : "ログインせずに戻る";
  $("name-submit").textContent = "保存してもどる";
  // 左上の戻るも、来た画面へ戻す
  document.querySelectorAll(".back, .m-icon-btn").forEach((a) => (a.href = back));
  document.querySelector(".back").lastChild.textContent = ` ${COPY[next].back}`;
  document.querySelector(".m-icon-btn").setAttribute("aria-label", COPY[next].back);
}
const rank = Number(q.get("rank"));
if (next === "save" && rank) {
  $("context").hidden = false;
  $("context").innerHTML = `<b>${rank}位</b>${q.get("pt") ? `・${escapeHtml(q.get("pt"))}pt` : ""} の結果を保存します`;
}

// カードを入れ替える（back: 前のステップへ戻るとき）
async function swapStep(from, to, back = false) {
  if (!reducedMotion) {
    from.classList.toggle("is-back", back);
    from.classList.add("step-out");
    await wait(280);
    from.classList.remove("step-out", "is-back");
  }
  from.hidden = true;
  to.hidden = false;
  if (!reducedMotion) {
    to.classList.toggle("is-back", back);
    to.classList.add("step-in");
    to.addEventListener("animationend", () => to.classList.remove("step-in", "is-back"), { once: true });
  }
}

function setWelcome(el, title, text) {
  const body = document.createElement("div");
  body.innerHTML = `<b>${title}</b>${text}`;
  const icon = document.createElement("span");
  icon.innerHTML = PROVIDER_ICONS[provider] || "";
  el.replaceChildren(icon.firstChild || "", body);
  el.hidden = false;
}

async function showNameStep(name, from = $("step-method")) {
  const input = $("display-name");
  input.value = name || "";
  $("name-submit").disabled = !input.value.trim();
  if (from) await swapStep(from, $("step-name"));
  input.focus();
}

// 結果の保存: ログインしたら保存できたことを見せる
function showDone(name, from) {
  $("done-sub").textContent = `${name} さんの戦績に、この対戦の結果を残しました。`;
  setWelcome($("done-welcome"), `${provider}でログインしました`, "次からは対戦の結果が自動で残ります。");
  if (from) swapStep(from, $("step-done"));
  else {
    $("step-method").hidden = true;
    $("step-done").hidden = false;
  }
}
const backTo = (extra = "") => back + (extra ? (back.includes("?") ? "&" : "?") + extra : "");
$("done-back").addEventListener("click", (event) => wipeTo(backTo("saved=1"), {}, event.currentTarget));
$("cancel").addEventListener("click", (event) => wipeTo(back, {}, event.currentTarget));

// すでにログインしている: ログイン方法は選ばずに、表示名の確認から始める
const account = getAccount();
if (account) {
  provider = account.provider;
  if (next === "save") showDone(q.get("name") || account.name);
  else {
    setWelcome($("welcome"), `${provider}でログイン中`, "前回の表示名を入れています。");
    $("step-method").hidden = true;
    $("step-name").hidden = false;
    showNameStep(account.name, null);
  }
}

document.querySelectorAll(".provider").forEach((button) => {
  button.addEventListener("click", async () => {
    document.querySelectorAll(".provider, #guest, #cancel").forEach((b) => (b.disabled = true));
    const icon = button.querySelector("svg");
    const label = button.querySelector("span");
    const original = label.textContent;
    const spinner = Object.assign(document.createElement("span"), { className: "spinner" });
    icon.replaceWith(spinner);
    label.textContent = `${button.dataset.provider}に接続中…`;
    await wait(1100);
    spinner.replaceWith(icon);
    label.textContent = original;
    document.querySelectorAll(".provider, #guest, #cancel").forEach((b) => (b.disabled = false));

    provider = button.dataset.provider;
    if (next === "save") {
      // 対戦で使った表示名のまま保存する
      const name = q.get("name") || button.dataset.name;
      setAccount({ provider, name });
      rememberName(name);
      showDone(name, $("step-method"));
      return;
    }
    setWelcome($("welcome"), `${provider}でログインしました`, "アカウント名を表示名に入れています。");
    showNameStep(button.dataset.name);
  });
});

$("guest").addEventListener("click", () => {
  // ログイン中に「ログインせずに進む」を選んだら、ログアウトしてゲストとして進む
  if (getAccount()) signOut();
  provider = null;
  $("welcome").hidden = true;
  showNameStep(lastName());
});

$("display-name").addEventListener("input", (event) => {
  $("name-submit").disabled = !event.target.value.trim();
});

$("change-method").addEventListener("click", () => swapStep($("step-name"), $("step-method"), true));

$("name-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("display-name").value.trim();
  if (!name) return;
  const submit = $("name-submit");
  submit.disabled = true;
  rememberName(name);
  if (provider) setAccount({ provider, name });
  if (next === "login") return wipeTo(back, {}, submit);
  const query = { name, code: joining ? code : randomCode(), role: joining ? "guest" : "host", via: provider };
  buildRoomTo(query, joining
    ? { label: "ルームに参加しています", done: "ルームに入りました！", sub: `${name} さんとして参加` }
    : { label: "ルームを作っています", done: "ルームができました！", sub: "このコードを相手に伝えよう" });
});
