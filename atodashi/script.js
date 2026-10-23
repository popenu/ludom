/* ===================================================
   あと出しじゃんけん - ゲームロジック
   相手の手と指示（勝って・負けて・あいこ）を見て、正しい手を出す。
   30秒で何問正解できるか。間違えると少し止まり、連続正解が途切れる。
   手は 0=グー 1=チョキ 2=パー。x が y に勝つのは (y - x + 3) % 3 === 1。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const BEST_KEY = "atodashi-best";
  const DURATION = 30;      // 制限時間（秒）
  const MISS_LOCK = 600;    // 間違えたときに押せなくなる時間（ms）
  const HANDS = ["✊", "✌️", "✋"];
  const HAND_NAMES = ["グー", "チョキ", "パー"];
  const ORDERS = {
    win: { text: "勝って！", answer: (o) => (o + 2) % 3 },
    lose: { text: "負けて！", answer: (o) => (o + 1) % 3 },
    draw: { text: "あいこ！", answer: (o) => o },
  };

  // 経過時間で出す指示を増やす
  function ordersAt(t) {
    if (t < 8) return ["win"];
    if (t < 18) return ["win", "lose", "lose"];
    return ["win", "lose", "lose", "draw"];
  }

  const RANKS = [
    { min: 32, name: "後出しの神", comment: "目と手が直結している。脳を通っていない。" },
    { min: 26, name: "反射の達人", comment: "「負けて」にも動じない。じゃんけん界の上位層。" },
    { min: 20, name: "なかなかの手", comment: "十分速い。あとは「負けて」の一瞬の迷いだけ。" },
    { min: 12, name: "ふつうの人", comment: "「負けて」で手が止まるのは、人として正常。" },
    { min: -1, name: "つい勝っちゃう人", comment: "負けろと言われても勝ちたい。負けず嫌いの証拠。" },
  ];

  const state = {
    phase: "start",    // start | count | play | result
    startAt: 0,
    raf: 0,
    timers: [],
    q: null,           // { opp, order }
    shownAt: 0,
    lockedUntil: 0,
    score: 0,
    miss: 0,
    combo: 0,
    maxCombo: 0,
    reacts: [],        // 正解までの時間（秒）
    by: { win: [0, 0], lose: [0, 0], draw: [0, 0] }, // [正解, 出題]
  };

  const later = (fn, ms) => state.timers.push(setTimeout(fn, ms));
  const elapsed = () => (performance.now() - state.startAt) / 1000;

  // ---------- 進行 ----------
  function startGame() {
    state.timers.forEach(clearTimeout);
    state.timers = [];
    cancelAnimationFrame(state.raf);
    Object.assign(state, { score: 0, miss: 0, combo: 0, maxCombo: 0, reacts: [], q: null, lockedUntil: 0 });
    state.by = { win: [0, 0], lose: [0, 0], draw: [0, 0] };
    $("score").textContent = "0";
    $("combo").textContent = "0";
    $("time").textContent = DURATION.toFixed(1);
    $("timebar-fill").style.transform = "scaleX(1)";
    $("opp").textContent = "✊";
    $("order").className = "order win";
    $("order").textContent = "勝って！";
    showScreen("play");
    state.phase = "count";
    setHandsEnabled(false);
    const cd = $("countdown");
    cd.classList.remove("hidden");
    [3, 2, 1].forEach((n, i) => later(() => { cd.textContent = String(n); }, i * 600));
    later(() => {
      cd.classList.add("hidden");
      state.phase = "play";
      state.startAt = performance.now();
      setHandsEnabled(true);
      nextQuestion();
      tick();
    }, 1800);
  }

  function tick() {
    if (state.phase !== "play") return;
    const left = Math.max(0, DURATION - elapsed());
    $("time").textContent = left.toFixed(1);
    $("timebar-fill").style.transform = `scaleX(${left / DURATION})`;
    if (left <= 0) { finish(); return; }
    state.raf = requestAnimationFrame(tick);
  }

  function nextQuestion() {
    const pool = ordersAt(elapsed());
    let opp, order;
    // 直前と同じ問題は出さない
    do {
      opp = Math.floor(Math.random() * 3);
      order = pool[Math.floor(Math.random() * pool.length)];
    } while (state.q && state.q.opp === opp && state.q.order === order);
    state.q = { opp, order };
    state.by[order][1]++;
    state.shownAt = performance.now();
    const o = $("opp");
    o.textContent = HANDS[opp];
    o.classList.remove("pop"); void o.offsetWidth; o.classList.add("pop");
    const od = $("order");
    od.textContent = ORDERS[order].text;
    od.className = "order " + order;
    void od.offsetWidth; od.classList.add("pop");
  }

  function play(h) {
    if (state.phase !== "play" || performance.now() < state.lockedUntil) return;
    const q = state.q;
    const ok = h === ORDERS[q.order].answer(q.opp);
    flash(ok);
    if (ok) {
      state.score++;
      state.combo++;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.reacts.push((performance.now() - state.shownAt) / 1000);
      state.by[q.order][0]++;
      $("score").textContent = String(state.score);
      $("combo").textContent = String(state.combo);
      nextQuestion();
    } else {
      state.miss++;
      state.combo = 0;
      $("combo").textContent = "0";
      state.lockedUntil = performance.now() + MISS_LOCK;
      setHandsEnabled(false);
      const st = $("stage");
      st.classList.remove("shake"); void st.offsetWidth; st.classList.add("shake");
      later(() => {
        if (state.phase !== "play") return;
        setHandsEnabled(true);
        nextQuestion();
      }, MISS_LOCK);
    }
  }

  function flash(ok) {
    const f = $("flash");
    f.textContent = ok ? "○" : "×";
    f.className = "flash";
    void f.offsetWidth;
    f.className = "flash " + (ok ? "ok" : "ng");
  }

  function setHandsEnabled(on) {
    for (const b of document.querySelectorAll(".hand")) b.disabled = !on;
  }

  // ---------- 結果 ----------
  function finish() {
    state.phase = "result";
    state.timers.forEach(clearTimeout);
    setHandsEnabled(false);
    const s = state.score;
    const rank = RANKS.find((r) => s >= r.min);
    const best = loadBest();
    const isNew = best === null || s > best;
    if (isNew) saveBest(s);
    const tries = s + state.miss;
    const acc = tries ? Math.round((s / tries) * 100) : 0;
    const avg = state.reacts.length ? state.reacts.reduce((a, b) => a + b, 0) / state.reacts.length : 0;
    $("result-score").textContent = String(s);
    $("result-rank").textContent = rank.name;
    $("result-best").innerHTML = isNew ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！' : `自己ベスト ${best} 問`;
    $("result-comment").textContent = rank.comment;
    $("st-acc").textContent = acc + "%";
    $("st-combo").textContent = String(state.maxCombo);
    $("st-react").textContent = avg.toFixed(2) + "秒";
    // 指示ごとの正解数（その指示で出題されたうち何問正解したか）
    $("breakdown").innerHTML = ["win", "lose", "draw"].map((k) => {
      const [c, n] = state.by[k];
      return `<div class="bd ${k}">${ORDERS[k].text.replace("！", "")}<br><b>${c}</b>/${n}</div>`;
    }).join("");
    const url = `${location.origin}${location.pathname}`;
    const text = `あと出しじゃんけん ✊✌️✋ 30秒で ${s}問正解【${rank.name}】\n正答率 ${acc}%・最大 ${state.maxCombo} 連続\n「負けて」で手が止まる…\n#Ludom`;
    $("btn-share-x").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    $("share-note").textContent = "";
    $("btn-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(text + "\n" + url); $("share-note").textContent = "コピーしました"; }
      catch (e) { $("share-note").textContent = text + "\n" + url; }
    };
    later(() => showScreen("result"), 500);
  }

  function loadBest() {
    try { const v = localStorage.getItem(BEST_KEY); return v === null ? null : Number(v); } catch (e) { return null; }
  }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* 保存できなくても遊べる */ } }

  function showScreen(name) {
    for (const s of ["start", "play", "result"]) $("screen-" + s).classList.toggle("hidden", s !== name);
    if (name !== "play") state.phase = name;
    window.scrollTo(0, 0);
  }

  // ---------- 入力 ----------
  // タッチは pointerdown で即反応させる（click の遅延を避ける）
  for (const b of document.querySelectorAll(".hand")) {
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); play(Number(b.dataset.h)); });
  }
  const KEYS = { 1: 0, 2: 1, 3: 2, a: 0, s: 1, d: 2 };
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const k = e.key.toLowerCase();
    if (state.phase === "play" && k in KEYS) {
      const b = document.querySelector(`.hand[data-h="${KEYS[k]}"]`);
      b.classList.add("pressed");
      setTimeout(() => b.classList.remove("pressed"), 90);
      play(KEYS[k]);
    } else if ((state.phase === "start" || state.phase === "result") && e.key === "Enter") {
      e.preventDefault();
      startGame();
    }
  });

  function init() {
    const best = loadBest();
    if (best !== null) { $("start-best").classList.remove("hidden"); $("start-best-value").textContent = String(best); }
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    showScreen("start");
  }
  init();
})();
