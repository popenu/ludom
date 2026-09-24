/* ===================================================
   正直村と嘘つき村 - ゲームロジック
   正直者は常に本当、嘘つきは常に嘘。村人の発言から正体を当てる。
   問題はランダムに作り、全 2^n 通りを総当たりして「答えが一つに決まる」
   ものだけを出題する。3人 → 4人 → 5人と増え、発言の種類も増える。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const TOTAL = 10;
  const BEST_KEY = "honest-village-best";

  const PEOPLE = [
    { name: "あお", color: "#3b82f6" },
    { name: "みどり", color: "#22a06b" },
    { name: "きいろ", color: "#f5b301" },
    { name: "あか", color: "#e5484d" },
    { name: "むらさき", color: "#8b5cf6" },
  ];

  // ---------- 発言の種類 ----------
  // eval(assign) は発言が本当かどうか。assign[i] が true なら i は正直者
  const TYPES = {
    honest: { arity: 1, text: (a) => `${a}は正直者だ`, eval: (s, x) => s[x] },
    liar: { arity: 1, text: (a) => `${a}は嘘つきだ`, eval: (s, x) => !s[x] },
    same: { arity: 2, text: (a, b) => `${a}と${b}は同じ種類だ`, eval: (s, x, y) => s[x] === s[y] },
    diff: { arity: 2, text: (a, b) => `${a}と${b}は違う種類だ`, eval: (s, x, y) => s[x] !== s[y] },
    bothLiar: { arity: 2, text: (a, b) => `${a}も${b}も嘘つきだ`, eval: (s, x, y) => !s[x] && !s[y] },
    bothHonest: { arity: 2, text: (a, b) => `${a}も${b}も正直者だ`, eval: (s, x, y) => s[x] && s[y] },
    oneHonest: { arity: 2, text: (a, b) => `${a}か${b}の少なくとも一人は正直者だ`, eval: (s, x, y) => s[x] || s[y] },
    countLiars: { arity: 0, text: (k) => `この中に嘘つきはちょうど${k}人いる`, eval: (s, k) => s.filter((v) => !v).length === k },
  };
  // 「正直者だ／嘘つきだ／同じ／違う」だけだと、全員の正体を反転させても
  // 矛盾が出ない（答えが必ず2通りになる）。人数を数える発言などの
  // 反転に弱い発言を、どの問題にも最低1つ入れて答えを1つに絞る。
  const ASYM = new Set(["bothLiar", "bothHonest", "oneHonest", "countLiars"]);
  // 3人で「嘘つきの人数」の発言を使うと、答えが「全員嘘つき」にしかならないので
  // 3人のうちは「AもBも」「少なくとも一人」型で答えを絞る
  function levelSpec(q) {
    if (q <= 3) return { n: 3, types: ["honest", "liar", "bothLiar", "bothHonest", "oneHonest"] };
    if (q <= 6) return { n: 4, types: ["honest", "liar", "same", "diff", "countLiars", "bothLiar", "oneHonest"] };
    return { n: 5, types: ["honest", "liar", "same", "diff", "bothLiar", "bothHonest", "oneHonest", "countLiars"] };
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // 発言 { speaker, type, args } が assign のもとで正しいか
  function truth(st, assign) {
    const t = TYPES[st.type];
    return t.eval(assign, ...st.args);
  }
  // 全員の発言と正体に矛盾がないか
  function consistent(statements, assign) {
    return statements.every((st) => truth(st, assign) === assign[st.speaker]);
  }
  function solutions(statements, n) {
    const found = [];
    for (let m = 0; m < (1 << n); m++) {
      const assign = Array.from({ length: n }, (_, i) => ((m >> i) & 1) === 1);
      if (consistent(statements, assign)) found.push(assign);
    }
    return found;
  }

  function makeStatement(speaker, n, types, assign) {
    for (let t = 0; t < 60; t++) {
      const type = pick(types);
      const others = shuffle([...Array(n).keys()].filter((i) => i !== speaker));
      let args;
      if (TYPES[type].arity === 0) args = [1 + Math.floor(Math.random() * (n - 1))];
      else args = others.slice(0, TYPES[type].arity);
      const st = { speaker, type, args };
      if (truth(st, assign) === assign[speaker]) return st;
    }
    return null;
  }

  function makePuzzle(q) {
    const { n, types } = levelSpec(q);
    for (let attempt = 0; attempt < 400; attempt++) {
      const assign = Array.from({ length: n }, () => Math.random() < 0.5);
      if (assign.every((v) => v) || assign.every((v) => !v)) continue; // 全員同じは味気ない
      const statements = [];
      let ok = true;
      for (let i = 0; i < n; i++) {
        const st = makeStatement(i, n, types, assign);
        if (!st) { ok = false; break; }
        statements.push(st);
      }
      if (!ok) continue;
      if (!statements.some((st) => ASYM.has(st.type))) continue;
      if (solutions(statements, n).length !== 1) continue;
      return { n, assign, statements };
    }
    // まず起きないが、念のため答えが1つに決まる問題を返す（全員嘘つき）
    return { n: 3, assign: [false, false, false], statements: [
      { speaker: 0, type: "countLiars", args: [1] }, { speaker: 1, type: "honest", args: [2] }, { speaker: 2, type: "honest", args: [0] },
    ] };
  }

  function statementText(st) {
    const t = TYPES[st.type];
    if (t.arity === 0) return t.text(st.args[0]);
    return t.text(...st.args.map((i) => PEOPLE[i].name));
  }

  // ---------- 描画 ----------
  function hatSVG(color, size) {
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="50" cy="60" r="30" fill="#ffe0c2"/>
      <path d="M22,50 Q50,-6 78,50 Z" fill="${color}"/>
      <rect x="14" y="46" width="72" height="10" rx="5" fill="${color}"/>
      <circle cx="40" cy="64" r="3.5" fill="#2b2118"/><circle cx="60" cy="64" r="3.5" fill="#2b2118"/>
      <path d="M42,76 Q50,82 58,76" stroke="#2b2118" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>`;
  }

  const state = { phase: "start", q: 0, score: 0, startAt: 0, raf: 0, puzzle: null, guess: [], checked: false };

  function renderVillagers() {
    const box = $("villagers");
    box.innerHTML = "";
    box.className = "villagers n" + state.puzzle.n;
    state.puzzle.statements.forEach((st, i) => {
      const p = PEOPLE[i];
      const card = document.createElement("button");
      card.className = "villager";
      card.dataset.i = i;
      card.innerHTML = `
        <div class="v-hat">${hatSVG(p.color, 56)}</div>
        <div class="v-name" style="color:${p.color}">${p.name}</div>
        <div class="v-say">「${statementText(st)}」</div>
        <div class="v-status"></div>`;
      card.addEventListener("click", () => toggle(i));
      box.appendChild(card);
    });
    updateCards();
  }

  function updateCards() {
    const cards = document.querySelectorAll(".villager");
    cards.forEach((card, i) => {
      const g = state.guess[i];
      card.classList.toggle("honest", g === true);
      card.classList.toggle("liar", g === false);
      card.querySelector(".v-status").textContent = g === true ? "正直者" : g === false ? "嘘つき" : "？";
    });
    $("btn-check").disabled = state.checked || state.guess.some((g) => g === null);
  }

  function toggle(i) {
    if (state.phase !== "play" || state.checked) return;
    const g = state.guess[i];
    state.guess[i] = g === null ? true : g === true ? false : null;
    updateCards();
  }

  // ---------- 進行 ----------
  function startGame() {
    state.q = 0;
    state.score = 0;
    state.startAt = performance.now();
    $("score-value").textContent = "0";
    showScreen("play");
    cancelAnimationFrame(state.raf);
    const tick = () => {
      if (state.phase !== "play") return;
      $("time-value").textContent = String(Math.floor((performance.now() - state.startAt) / 1000));
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
    nextQuestion();
  }

  function nextQuestion() {
    state.q++;
    state.checked = false;
    state.puzzle = makePuzzle(state.q);
    state.guess = Array(state.puzzle.n).fill(null);
    $("q-value").textContent = String(state.q);
    $("verdict").classList.add("hidden");
    $("btn-check").classList.remove("hidden");
    $("btn-next").classList.add("hidden");
    renderVillagers();
    window.scrollTo(0, 0);
  }

  function check() {
    if (state.phase !== "play" || state.checked) return;
    state.checked = true;
    const { assign, statements } = state.puzzle;
    const ok = state.guess.every((g, i) => g === assign[i]);
    if (ok) { state.score++; $("score-value").textContent = String(state.score); }
    // 正解を表示し、各発言が本当か嘘かを示す
    const cards = document.querySelectorAll(".villager");
    cards.forEach((card, i) => {
      card.classList.toggle("honest", assign[i]);
      card.classList.toggle("liar", !assign[i]);
      card.classList.toggle("missed", state.guess[i] !== assign[i]);
      card.querySelector(".v-status").textContent = assign[i] ? "正直者" : "嘘つき";
    });
    const list = $("verdict-list");
    list.innerHTML = "";
    statements.forEach((st, i) => {
      const li = document.createElement("li");
      const isTrue = truth(st, assign);
      li.innerHTML = `<b style="color:${PEOPLE[i].color}">${PEOPLE[i].name}</b>は${assign[i] ? "正直者" : "嘘つき"}。「${statementText(st)}」は<b>${isTrue ? "本当" : "嘘"}</b>`;
      list.appendChild(li);
    });
    $("verdict-title").textContent = ok ? "正解！" : "ざんねん… 正解はこちら";
    $("verdict-title").className = "verdict-title " + (ok ? "ok" : "ng");
    $("verdict").classList.remove("hidden");
    $("btn-check").classList.add("hidden");
    $("btn-next").classList.remove("hidden");
    $("btn-next").textContent = state.q >= TOTAL ? "結果を見る" : "次の問題へ";
  }

  function next() {
    if (state.q >= TOTAL) finish();
    else nextQuestion();
  }

  // ---------- 結果 ----------
  function rankFor(score) {
    if (score === 10) return ["村の名探偵", "全問正解。村人が嘘をつく前に気づくレベル。"];
    if (score >= 8) return ["村の長老", "ほぼ見抜いた。嘘つきの方が先に折れる。"];
    if (score >= 6) return ["村の相談役", "いい線。5人になると少し迷う。"];
    if (score >= 4) return ["見習い探偵", "コツはつかめてきた。矛盾を探そう。"];
    return ["通りすがりの旅人", "まずは3人から。誰か一人を仮に正直者と決めてみよう。"];
  }

  function finish() {
    state.phase = "result";
    cancelAnimationFrame(state.raf);
    const secs = Math.round((performance.now() - state.startAt) / 1000);
    const [rank, comment] = rankFor(state.score);
    const best = loadBest();
    const isNew = state.score > best;
    if (isNew) saveBest(state.score);
    $("result-score").textContent = String(state.score);
    $("result-rank").textContent = rank;
    $("result-time").textContent = String(secs);
    $("result-best").innerHTML = isNew ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！' : `自己ベスト ${best} / 10`;
    $("result-comment").textContent = comment;
    const url = `${location.origin}${location.pathname}`;
    const text = `正直村と嘘つき村 🎩 ${state.score}/10 正解【${rank}】${secs}秒\n発言から嘘つきを当てる論理パズル #Ludom`;
    $("btn-share-x").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    $("share-note").textContent = "";
    $("btn-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(text + "\n" + url); $("share-note").textContent = "コピーしました"; }
      catch (e) { $("share-note").textContent = text + "\n" + url; }
    };
    showScreen("result");
  }

  function loadBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* 保存できなくても遊べる */ } }

  function showScreen(name) {
    for (const s of ["start", "play", "result"]) $("screen-" + s).classList.toggle("hidden", s !== name);
    state.phase = name;
    window.scrollTo(0, 0);
  }

  // ---------- キーボード ----------
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((state.phase === "start" || state.phase === "result") && e.key === "Enter") { startGame(); return; }
    if (state.phase !== "play") return;
    if (/^[1-5]$/.test(e.key)) toggle(Number(e.key) - 1);
    else if (e.key === "Enter") { if (state.checked) next(); else if (!$("btn-check").disabled) check(); }
  });

  // ---------- 初期化 ----------
  function init() {
    $("start-art").innerHTML = PEOPLE.slice(0, 3).map((p) => `<div class="art-person">${hatSVG(p.color, 72)}</div>`).join("");
    const best = loadBest();
    if (best > 0) { $("start-best").classList.remove("hidden"); $("start-best-value").textContent = String(best); }
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    $("btn-check").addEventListener("click", check);
    $("btn-next").addEventListener("click", next);
    showScreen("start");
  }
  init();
})();
