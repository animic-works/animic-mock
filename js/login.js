playWipeOut();
const q = params();
const code = q.get("code");
const joining = q.get("next") === "join" && isValidCode(code || "");
let provider = null;

const $ = (id) => document.getElementById(id);
if (joining) {
  $("context").hidden = false;
  $("context").innerHTML = `ルーム <code>${code}</code> に参加します`;
  $("name-submit").textContent = "ルームに参加";
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

async function showNameStep(name) {
  const input = $("display-name");
  input.value = name || "";
  $("name-submit").disabled = !input.value.trim();
  await swapStep($("step-method"), $("step-name"));
  input.focus();
}

document.querySelectorAll(".provider").forEach((button) => {
  button.addEventListener("click", async () => {
    document.querySelectorAll(".provider, #guest").forEach((b) => (b.disabled = true));
    const icon = button.querySelector("svg");
    const label = button.querySelector("span");
    const original = label.textContent;
    const spinner = Object.assign(document.createElement("span"), { className: "spinner" });
    icon.replaceWith(spinner);
    label.textContent = `${button.dataset.provider}に接続中…`;
    await wait(1100);
    spinner.replaceWith(icon);
    label.textContent = original;
    document.querySelectorAll(".provider, #guest").forEach((b) => (b.disabled = false));

    provider = button.dataset.provider;
    const text = document.createElement("div");
    text.innerHTML = `<b>${provider}でログインしました</b>アカウント名を表示名に入れています。`;
    $("welcome").replaceChildren(icon.cloneNode(true), text);
    $("welcome").hidden = false;
    showNameStep(button.dataset.name);
  });
});

$("guest").addEventListener("click", () => {
  provider = null;
  $("welcome").hidden = true;
  showNameStep("");
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
  const query = { name, code: joining ? code : randomCode(), role: joining ? "guest" : "host", via: provider };
  buildRoomTo(query, joining
    ? { label: "ルームに参加しています", done: "ルームに入りました！", sub: `${name} さんとして参加` }
    : { label: "ルームを作っています", done: "ルームができました！", sub: "このコードを相手に伝えよう" });
});
