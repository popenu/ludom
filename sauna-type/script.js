/* ===================================================
   サウナ診断 - ロジック
   3軸（温度・水風呂・スタイル）× 各4問 = 12問。
   各軸は重み 2,1,1,1 の合計5点で、必ず奇数になるので同点が出ない。
   結果コード（例：HDS）はURLハッシュに載せてシェアできる。
=================================================== */

"use strict";

// ---------- 軸の定義 ----------
// left / right のどちらに寄ったかで1文字ずつ決まる
const AXES = [
  { name: "温度",     left: { code: "H", label: "灼熱" },   right: { code: "M", label: "マイルド" } },
  { name: "水風呂",   left: { code: "D", label: "ダイブ" }, right: { code: "A", label: "慎重" } },
  { name: "スタイル", left: { code: "S", label: "ソロ" },   right: { code: "G", label: "グループ" } },
];

// ---------- 設問 ----------
// axis: AXESのインデックス, weight: 配点, a/b: 選択肢（side は left/right）
const QUESTIONS = [
  // 温度
  { axis: 0, weight: 2, text: "サウナ室に入った。どこに座る？",
    a: { text: "最上段、ストーブの真ん前", side: "left" },
    b: { text: "下段か入口寄り。まずは様子見", side: "right" } },
  { axis: 2, weight: 2, text: "サウナに行くなら？",
    a: { text: "ひとり。自分のペースで黙々と", side: "left" },
    b: { text: "誰かと。感想を言い合いたい", side: "right" } },
  { axis: 1, weight: 2, text: "水風呂の前に立った。あなたは？",
    a: { text: "掛け水したら、肩まで一気に沈む", side: "left" },
    b: { text: "足→腰→肩、と刻んでゆっくり入る", side: "right" } },
  { axis: 0, weight: 1, text: "ロウリュ（アウフグース）の案内が流れた",
    a: { text: "即入室。熱波は最前列で浴びる", side: "left" },
    b: { text: "混みそうだし、終わった頃に入ろう", side: "right" } },
  { axis: 1, weight: 1, text: "水温計が「9℃（シングル）」を指している",
    a: { text: "むしろ入りたい。目が覚める", side: "left" },
    b: { text: "それはもう水じゃなくて氷", side: "right" } },
  { axis: 2, weight: 1, text: "外気浴中、隣の人が話しかけてきた",
    a: { text: "軽く相槌だけ。今は整っている最中", side: "left" },
    b: { text: "そこから盛り上がる", side: "right" } },
  { axis: 0, weight: 1, text: "温度計が110℃を指している",
    a: { text: "テンションが上がる", side: "left" },
    b: { text: "今日はやめておくか…", side: "right" } },
  { axis: 1, weight: 1, text: "「頭まで潜ってOK」の水風呂だった",
    a: { text: "もちろん潜る", side: "left" },
    b: { text: "顔は濡らしたくない", side: "right" } },
  { axis: 2, weight: 1, text: "ととのった後、まず何をする？",
    a: { text: "余韻に浸って、また次のセットへ", side: "left" },
    b: { text: "サ飯！誰かとビール", side: "right" } },
  { axis: 0, weight: 1, text: "サウナ室の理想の滞在時間は？",
    a: { text: "12分計を1周させたい", side: "left" },
    b: { text: "6〜8分。無理はしない", side: "right" } },
  { axis: 1, weight: 1, text: "水風呂には何分いる？",
    a: { text: "呼吸が落ち着くまで。気づけば2分", side: "left" },
    b: { text: "30秒〜1分。冷えたらすぐ出る", side: "right" } },
  { axis: 2, weight: 1, text: "すごく良いサウナを見つけた",
    a: { text: "胸にしまっておく。混んでほしくない", side: "left" },
    b: { text: "SNSと友達に即布教", side: "right" } },
];

// ---------- 8タイプ ----------
const TYPES = {
  HDS: {
    emoji: "🧘", name: "サ道の求道者",
    catchphrase: "整いは、語るものではなく至るもの。",
    desc: "最上段でロウリュを浴び、水風呂には躊躇なく沈み、外気浴では完全に無言。あなたにとってサウナは娯楽ではなく修行であり、儀式。周りの人はあなたの背中を見て、なんとなく居住まいを正します。",
    skill: "12分計を一周させても顔色ひとつ変えない",
    place: "温度110℃超・水風呂シングルの“ガチ施設”。ロウリュ付きの老舗、地方の名店へのひとり旅。",
    aruaru: "サウナハットは黒。タオルを置く位置がいつも同じ。",
    good: "MAS", bad: "MAG",
  },
  HDG: {
    emoji: "🔥", name: "熱波師",
    catchphrase: "熱いのが、いちばん楽しい。",
    desc: "熱いサウナに冷たい水風呂、そして仲間。全部盛りで楽しむ、サウナ界のお祭り係。ロウリュ中は率先して「もう一杯！」と声を上げ、水風呂では真っ先に飛び込んで周りを引きずり込みます。あなたがいると、サウナはイベントになります。",
    skill: "初心者を一晩でサウナーに変える",
    place: "アウフグースイベント、大型スパ、サウナフェス。熱気と人がいるところ。",
    aruaru: "グループチャットのアルバムがサウナ飯だらけ。",
    good: "MDG", bad: "MAS",
  },
  HAS: {
    emoji: "🐢", name: "サウナ室のヌシ",
    catchphrase: "熱さは友達。冷たさは、まあ、知り合い。",
    desc: "熱いサウナ室に誰よりも長く、静かに居座るタイプ。上段でじっくり汗を絞り出すのが至福で、水風呂は「一応入る」程度。誰にも干渉せず、干渉されず。気づけば常連から「あの人いつもいるな」と認識されています。",
    skill: "3セット目でも上段から動かない",
    place: "熱めのドライサウナで、水風呂は20℃前後の“やさしい”施設。塩サウナやスチームも◎。",
    aruaru: "テレビ付きサウナで、ニュースを最後まで見てから出る。",
    good: "HAG", bad: "MDS",
  },
  HAG: {
    emoji: "📣", name: "熱弁サウナー",
    catchphrase: "サウナの話なら、あと2時間いける。",
    desc: "サウナ室の熱さは大歓迎、水風呂はちょっと慎重派。その分、サウナへの熱量は口から出ます。施設の歴史、ストーブの種類、ロウリュのアロマまで語れるサウナ博士。周りは「詳しいな…」と感心しつつ、ちょっと長いなとも思っています。",
    skill: "初対面でもサウナ談義に持ち込む",
    place: "施設ごとに個性がある老舗サウナ巡り。サウナ関連のイベントやトーク。",
    aruaru: "サウナ関連の本と漫画を全巻持っている。",
    good: "HAS", bad: "HDS",
  },
  MDS: {
    emoji: "🧊", name: "水風呂の哲学者",
    catchphrase: "サウナは前座。本番は水風呂。",
    desc: "サウナ室は熱すぎない程度でさっと出て、水風呂には深く、長く。冷たい水の中で呼吸を整えている時間こそが至福。ひとりで静かに、思考をクリアにしていきます。周りからは「あの人、水風呂に長くない？」と思われています。",
    skill: "シングルで2分間、無表情",
    place: "天然水かけ流しの水風呂、川や湖に入れるアウトドアサウナ、テントサウナ。",
    aruaru: "冬でも水風呂の温度がまず気になる。",
    good: "HDS", bad: "HAS",
  },
  MDG: {
    emoji: "🚌", name: "サウナ遠足隊長",
    catchphrase: "ととのうより、盛り上がろう。",
    desc: "熱さはほどほどでいいけれど、水風呂には「せーの」でみんなで入りたい。サウナは目的というより、仲間と過ごす口実。旅行の予定にはだいたいサウナが組み込まれていて、幹事役はたいていあなたです。",
    skill: "全員分の予約を3分で完了させる",
    place: "宿泊できるサウナ施設、貸切のプライベートサウナ、温泉旅館のサウナ。",
    aruaru: "サウナそのものより、その後の予定で盛り上がる。",
    good: "HDG", bad: "HDS",
  },
  MAS: {
    emoji: "🍃", name: "外気浴の仙人",
    catchphrase: "風が吹けば、それで整う。",
    desc: "サウナ室は短め、水風呂もやさしく、そして外気浴が長い。整いの主役は、実は椅子と風。無理をしない、争わない、語らない。あなたにとってサウナは休息のための場所で、気づくと外気浴スペースで寝ています。",
    skill: "インフィニティチェアで意識を手放す",
    place: "外気浴スペースが充実した施設、露天風呂付きのスパ、ぬるめのミストサウナ。",
    aruaru: "整うより先に、眠くなる。",
    good: "HDS", bad: "HDG",
  },
  MAG: {
    emoji: "🍺", name: "サ飯の座長",
    catchphrase: "サウナは、乾杯までの助走。",
    desc: "サウナも水風呂もほどほど。本当の目的は、その後のサ飯と語らいです。汗をかいたあとのビールと生姜焼き定食は正義。誰かと行くと必ず「楽しかった」と言われるタイプで、サウナ選びの基準は「食堂が美味しいか」。",
    skill: "入浴時間より食堂の滞在時間が長い",
    place: "食堂が名物のサウナ、健康ランド、スーパー銭湯。",
    aruaru: "風呂に入る前からメニューを決めている。",
    good: "MDG", bad: "MDS",
  },
};

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const screens = {
  start: $("screen-start"),
  quiz: $("screen-quiz"),
  result: $("screen-result"),
};

// ---------- 状態 ----------
let current = 0;            // 表示中の設問インデックス
let answers = [];           // 各設問で選んだ side（"left" / "right"）
let myCode = null;          // 自分の診断結果コード
let myScores = null;        // 自分の軸ごとの left 得点
let viewingCode = null;     // 表示中のタイプコード（一覧から見ている場合は myCode と異なる）

// ---------- 画面切り替え ----------
function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle("hidden", key !== name);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- 診断開始 ----------
function startQuiz() {
  current = 0;
  answers = [];
  myCode = null;
  myScores = null;
  history.replaceState(null, "", location.pathname);
  $("q-total").textContent = QUESTIONS.length;
  renderQuestion();
  showScreen("quiz");
}

function renderQuestion() {
  const q = QUESTIONS[current];
  $("q-index").textContent = current + 1;
  $("progress-fill").style.width = `${(current / QUESTIONS.length) * 100}%`;
  $("q-axis").textContent = `Q${current + 1}　${AXES[q.axis].name}`;
  $("q-text").textContent = q.text;

  // 選択肢の並びは毎回ランダム（上＝左寄り、という偏りを避ける）
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

  // カードを入れ直してスライドインを再生
  const card = $("quiz-card");
  card.style.animation = "none";
  void card.offsetWidth;
  card.style.animation = "";
}

function choose(side) {
  answers[current] = side;
  current++;
  if (current >= QUESTIONS.length) {
    finish();
  } else {
    renderQuestion();
  }
}

function goBack() {
  if (current === 0) return;
  current--;
  renderQuestion();
}

// ---------- 集計 ----------
function computeScores(ans) {
  const scores = AXES.map(() => ({ left: 0, total: 0 }));
  QUESTIONS.forEach((q, i) => {
    scores[q.axis].total += q.weight;
    if (ans[i] === "left") scores[q.axis].left += q.weight;
  });
  return scores;
}

function scoresToCode(scores) {
  return AXES.map((axis, i) => {
    const s = scores[i];
    return s.left * 2 > s.total ? axis.left.code : axis.right.code;
  }).join("");
}

function finish() {
  myScores = computeScores(answers);
  myCode = scoresToCode(myScores);
  $("progress-fill").style.width = "100%";
  renderResult(myCode, myScores);
  showScreen("result");
}

// ---------- 結果表示 ----------
// scores が null のときは一覧から見ている扱い（バーはそのタイプの「典型」を表示）
function renderResult(code, scores) {
  const t = TYPES[code];
  if (!t) return;
  viewingCode = code;
  const isMine = code === myCode && scores;

  $("result-kicker").textContent = isMine
    ? "あなたのサウナタイプは"
    : (myCode ? "このタイプは" : "このサウナタイプは");
  $("result-emoji").textContent = t.emoji;
  $("result-code").textContent = code;
  $("result-name").textContent = t.name;
  $("result-catch").textContent = `「${t.catchphrase}」`;
  $("result-desc").textContent = t.desc;
  $("result-skill").textContent = t.skill;
  $("result-place").textContent = t.place;
  $("result-aruaru").textContent = t.aruaru;

  // 軸バー
  const axesBox = $("result-axes");
  axesBox.innerHTML = "";
  AXES.forEach((axis, i) => {
    const letter = code[i];
    const isLeft = letter === axis.left.code;
    // 自分の結果なら実スコア、そうでなければ典型値（4/5）を表示
    const ratio = scores ? scores[i].left / scores[i].total : (isLeft ? 0.8 : 0.2);
    const pct = Math.round(ratio * 100);

    const el = document.createElement("div");
    el.className = "axis";
    el.innerHTML = `
      <div class="axis-head"><span class="axis-name">${axis.name}</span></div>
      <div class="axis-labels">
        <span class="${isLeft ? "on" : "off"}">${axis.left.label}</span>
        <span class="${isLeft ? "off" : "on"}">${axis.right.label}</span>
      </div>
      <div class="axis-bar">
        <div class="axis-fill ${isLeft ? "left" : "right"}"
             style="${isLeft ? `left:0; width:${pct}%` : `right:0; width:${100 - pct}%`}"></div>
      </div>
    `;
    axesBox.appendChild(el);
  });

  // 相性
  const good = $("compat-good");
  const bad = $("compat-bad");
  good.textContent = `${TYPES[t.good].emoji} ${TYPES[t.good].name}`;
  bad.textContent = `${TYPES[t.bad].emoji} ${TYPES[t.bad].name}`;
  good.onclick = () => viewType(t.good);
  bad.onclick = () => viewType(t.bad);

  // シェア
  const url = `${location.origin}${location.pathname}#${code}`;
  const text = isMine
    ? `私のサウナタイプは ${t.emoji}「${t.name}」でした！\n「${t.catchphrase}」\n#サウナ診断 #Ludom`
    : `サウナタイプ ${t.emoji}「${t.name}」\n「${t.catchphrase}」\n#サウナ診断 #Ludom`;
  $("btn-share-x").href =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  $("share-note").textContent = "";
  $("btn-copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      $("share-note").textContent = "リンクをコピーしました";
    } catch (e) {
      $("share-note").textContent = url;
    }
  };

  // 自分の結果に戻るボタン：一覧から他タイプを見ているときだけ表示
  $("btn-my-result").classList.toggle("hidden", !(myCode && code !== myCode));
  // まだ診断していない（シェアリンクや一覧から閲覧中）なら文言を変える
  $("btn-retry").textContent = myCode ? "🔄 もう一度診断する" : "🧖 自分も診断する";

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
    btn.innerHTML = `
      <span class="catalog-emoji">${t.emoji}</span>
      <span class="catalog-name">${t.name}<span class="catalog-code">${code}</span></span>
    `;
    btn.addEventListener("click", () => viewType(code));
    box.appendChild(btn);
  });
}

// ---------- 初期化 ----------
$("btn-start").addEventListener("click", startQuiz);
$("btn-retry").addEventListener("click", startQuiz);
$("btn-back").addEventListener("click", goBack);
$("btn-my-result").addEventListener("click", () => viewType(myCode));
$("btn-catalog").addEventListener("click", () => viewType("HDS"));

// URLハッシュに有効なコードがあれば、シェアされた結果として直接表示
(function init() {
  const hash = location.hash.replace("#", "").toUpperCase();
  if (TYPES[hash]) {
    viewType(hash);
  } else {
    showScreen("start");
  }
})();
