/* ===================================================
   HRタイプ診断 - ロジック
   4軸（ヒト/シクミ・攻め/守り・直感/データ・現場/経営）× 各4問 = 16問。
   各軸は重み 2,1,1,1 の合計5点で、必ず奇数になるので同点が出ない。
   結果コード（例：SADM）はURLハッシュに載せてシェアできる。
   タイプの本文は types.js（TYPES）にある。
=================================================== */

"use strict";

// ---------- 軸の定義 ----------
const AXES = [
  { name: "ヒト／シクミ", left: { code: "P", label: "ヒト派" },   right: { code: "S", label: "シクミ派" } },
  { name: "攻め／守り",   left: { code: "A", label: "攻め" },     right: { code: "G", label: "守り" } },
  { name: "直感／データ", left: { code: "I", label: "直感" },     right: { code: "D", label: "データ" } },
  { name: "現場／経営",   left: { code: "F", label: "現場派" },   right: { code: "M", label: "経営派" } },
];

// ---------- 設問 ----------
// axis: AXESのインデックス, weight: 配点, a/b: 選択肢（side は left/right）
const QUESTIONS = [
  { axis: 0, weight: 2, text: "組織の問題に気づいた。最初にやるのは？",
    a: { text: "当事者に話を聞きに行く", side: "left" },
    b: { text: "原因になっている仕組みを洗い出す", side: "right" } },
  { axis: 1, weight: 2, text: "明日から新しい担当を選べるなら？",
    a: { text: "採用・組織づくりで会社を広げる", side: "left" },
    b: { text: "労務・制度運用で会社を固める", side: "right" } },
  { axis: 2, weight: 2, text: "候補者や社員を見るとき、より信じるのは？",
    a: { text: "会ったときの感触", side: "left" },
    b: { text: "実績や数値", side: "right" } },
  { axis: 3, weight: 2, text: "経営と現場の意見が割れた。あなたの立ち位置は？",
    a: { text: "現場の実感を経営に伝える", side: "left" },
    b: { text: "経営の意図を現場に伝える", side: "right" } },
  { axis: 0, weight: 1, text: "行きつけの店を選ぶ基準は？",
    a: { text: "店員さんの感じがいい", side: "left" },
    b: { text: "注文や導線がストレスなく心地いい", side: "right" } },
  { axis: 1, weight: 1, text: "旅行で楽しみなのは？",
    a: { text: "行ったことのない場所を開拓する", side: "left" },
    b: { text: "気に入った場所に何度も通う", side: "right" } },
  { axis: 2, weight: 1, text: "買い物で迷ったら？",
    a: { text: "直感でピンときた方を選ぶ", side: "left" },
    b: { text: "レビューと比較表を見てから決める", side: "right" } },
  { axis: 3, weight: 1, text: "飲み会で自然と座る位置は？",
    a: { text: "若手や新しく入った人の近く", side: "left" },
    b: { text: "幹事や主催者の近く", side: "right" } },
  { axis: 0, weight: 1, text: "職場の揉め事の仲裁を任されたら？",
    a: { text: "両方と1対1でじっくり話す", side: "left" },
    b: { text: "ルールと役割分担を整理して示す", side: "right" } },
  { axis: 1, weight: 1, text: "経営から「何でもやっていい」と言われたら？",
    a: { text: "新しい取り組みを提案する", side: "left" },
    b: { text: "まず今ある歪みや漏れを直す", side: "right" } },
  { axis: 2, weight: 1, text: "施策の効果を聞かれた。どう答える？",
    a: { text: "現場の声や空気の変化を伝える", side: "left" },
    b: { text: "数字と推移を示す", side: "right" } },
  { axis: 3, weight: 1, text: "人事の仕事の醍醐味は？",
    a: { text: "社員の顔つきが変わる瞬間", side: "left" },
    b: { text: "会社の数字や方向が変わる瞬間", side: "right" } },
  { axis: 0, weight: 1, text: "友人の引っ越しを手伝う。あなたの役割は？",
    a: { text: "荷造りしながら話し相手になる", side: "left" },
    b: { text: "段取り表を作って仕切る", side: "right" } },
  { axis: 1, weight: 1, text: "家の中で気になるのは？",
    a: { text: "模様替えや新しい家具のアイデア", side: "left" },
    b: { text: "掃除や整理が行き届いているか", side: "right" } },
  { axis: 2, weight: 1, text: "知らない街で道に迷ったら？",
    a: { text: "勘で歩いてみる", side: "left" },
    b: { text: "地図アプリを開く", side: "right" } },
  { axis: 3, weight: 1, text: "スポーツ観戦で目が行くのは？",
    a: { text: "選手のプレーや表情", side: "left" },
    b: { text: "監督の采配や戦略", side: "right" } },
];

const IMG_DIR = "img/";
const imgSrc = (code) => `${IMG_DIR}${code}.jpg`;

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const screens = { start: $("screen-start"), quiz: $("screen-quiz"), result: $("screen-result") };

// ---------- 状態 ----------
let current = 0;
let answers = [];
let myCode = null;
let myScores = null;
let viewingCode = null;

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => el.classList.toggle("hidden", key !== name));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- 診断 ----------
function startQuiz() {
  current = 0; answers = []; myCode = null; myScores = null;
  history.replaceState(null, "", location.pathname);
  $("q-total").textContent = QUESTIONS.length;
  renderQuestion();
  showScreen("quiz");
}

function renderQuestion() {
  const q = QUESTIONS[current];
  $("q-index").textContent = current + 1;
  $("progress-fill").style.width = `${(current / QUESTIONS.length) * 100}%`;
  $("q-number").textContent = `Q${current + 1}`;
  $("q-text").textContent = q.text;

  // 選択肢の上下は毎回ランダム（上＝左寄り、という偏りを避ける）
  const options = Math.random() < 0.5 ? [q.a, q.b] : [q.b, q.a];
  const box = $("q-options");
  box.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.type = "button";
    btn.textContent = opt.text;
    btn.addEventListener("click", () => choose(opt.side));
    box.appendChild(btn);
  });
  $("btn-back").disabled = current === 0;

  const card = $("quiz-card");
  card.style.animation = "none";
  void card.offsetWidth;
  card.style.animation = "";
}

function choose(side) {
  answers[current] = side;
  current++;
  if (current >= QUESTIONS.length) finish(); else renderQuestion();
}

function goBack() {
  if (current === 0) return;
  current--;
  renderQuestion();
}

function computeScores(ans) {
  const scores = AXES.map(() => ({ left: 0, total: 0 }));
  QUESTIONS.forEach((q, i) => {
    scores[q.axis].total += q.weight;
    if (ans[i] === "left") scores[q.axis].left += q.weight;
  });
  return scores;
}

function scoresToCode(scores) {
  return AXES.map((axis, i) => (scores[i].left * 2 > scores[i].total ? axis.left.code : axis.right.code)).join("");
}

function finish() {
  myScores = computeScores(answers);
  myCode = scoresToCode(myScores);
  $("progress-fill").style.width = "100%";
  renderResult(myCode, myScores);
  showScreen("result");
}

// ---------- 結果表示 ----------
function renderResult(code, scores) {
  const t = TYPES[code];
  if (!t) return;
  viewingCode = code;
  const isMine = !!(code === myCode && scores);

  $("result-kicker").textContent = isMine ? "あなたのHRタイプは" : "このHRタイプは";
  $("result-img").src = imgSrc(code);
  $("result-img").alt = t.name;
  $("result-code").textContent = code;
  $("result-name").textContent = t.name;
  $("result-catch").textContent = `「${t.catch}」`;
  $("result-note").classList.toggle("hidden", !isMine);
  $("result-desc").textContent = t.desc;
  $("result-strengths").textContent = t.strengths.join("／");
  $("result-flip").textContent = t.flip;
  $("result-topic").textContent = `「${t.topic}」`;

  // 軸バー
  const axesBox = $("result-axes");
  axesBox.innerHTML = "";
  AXES.forEach((axis, i) => {
    const isLeft = code[i] === axis.left.code;
    const ratio = scores ? scores[i].left / scores[i].total : (isLeft ? 0.8 : 0.2);
    const pct = Math.round(ratio * 100);
    const el = document.createElement("div");
    el.className = "axis";
    el.innerHTML = `
      <div class="axis-name">${axis.name}</div>
      <div class="axis-labels">
        <span class="${isLeft ? "on" : "off"}">${axis.left.label}</span>
        <span class="${isLeft ? "off" : "on"}">${axis.right.label}</span>
      </div>
      <div class="axis-bar">
        <div class="axis-fill" style="${isLeft ? `left:0; width:${pct}%` : `right:0; width:${100 - pct}%`}"></div>
      </div>`;
    axesBox.appendChild(el);
  });

  // 組むと強い相手
  const p = TYPES[t.partner];
  $("partner-img").src = imgSrc(t.partner);
  $("partner-img").alt = p.name;
  $("partner-name").textContent = p.name;
  $("partner-code").textContent = t.partner;
  $("partner-btn").onclick = () => viewType(t.partner);

  // 自己紹介テンプレ
  $("intro-text").textContent = `「${t.intro}」`;
  $("btn-copy-intro").onclick = async () => {
    const btn = $("btn-copy-intro");
    try { await navigator.clipboard.writeText(t.intro); btn.textContent = "✅ コピーしました"; }
    catch (e) { btn.textContent = "長押しで選択してコピーしてください"; }
    setTimeout(() => { btn.textContent = "📋 テンプレをコピー"; }, 1800);
  };

  // シェア
  const url = `${location.origin}${location.pathname}#${code}`;
  const text = isMine
    ? `私のHRタイプは「${t.name}」（${code}）でした。\n「${t.catch}」\n#HR診断`
    : `HRタイプ「${t.name}」（${code}）\n「${t.catch}」\n#HR診断`;
  $("btn-share-x").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  $("share-note").textContent = "";
  $("btn-copy").onclick = async () => {
    try { await navigator.clipboard.writeText(url); $("share-note").textContent = "リンクをコピーしました"; }
    catch (e) { $("share-note").textContent = url; }
  };

  $("btn-my-result").classList.toggle("hidden", !(myCode && code !== myCode));
  $("btn-retry").textContent = myCode ? "🔄 もう一度診断する" : "✍️ 自分も診断する";

  history.replaceState(null, "", `#${code}`);
  renderCatalog();
}

function viewType(code) {
  renderResult(code, code === myCode ? myScores : null);
  showScreen("result");
}

function renderCatalog() {
  const box = $("catalog");
  box.innerHTML = "";
  Object.entries(TYPES).forEach(([code, t]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "catalog-item" + (code === viewingCode ? " current" : "");
    btn.dataset.row = t.row;
    btn.innerHTML = `
      <img src="${imgSrc(code)}" alt="" loading="lazy" width="48" height="48">
      <span class="catalog-name">${t.name}<span class="catalog-code">${code}</span></span>`;
    btn.addEventListener("click", () => viewType(code));
    box.appendChild(btn);
  });
}

// スタート画面の16体ストリップ
function renderStartStrip() {
  const box = $("start-strip");
  box.innerHTML = "";
  Object.keys(TYPES).forEach((code) => {
    const img = document.createElement("img");
    img.src = imgSrc(code);
    img.alt = TYPES[code].name;
    img.loading = "lazy";
    box.appendChild(img);
  });
}

// ---------- 初期化 ----------
$("btn-start").addEventListener("click", startQuiz);
$("btn-retry").addEventListener("click", startQuiz);
$("btn-back").addEventListener("click", goBack);
$("btn-my-result").addEventListener("click", () => viewType(myCode));
$("btn-catalog").addEventListener("click", () => viewType(Object.keys(TYPES)[0]));

(function init() {
  renderStartStrip();
  const hash = location.hash.replace("#", "").toUpperCase();
  if (TYPES[hash]) viewType(hash); else showScreen("start");
})();
