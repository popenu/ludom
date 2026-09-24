/* ===================================================
   絶対音感テスト - ゲームロジック
   Web Audio で合成したピアノ風の音を鳴らし、鍵盤で答えてもらう。
   絶対音感モードは1音だけ、相対音感モードは先に「ド」を鳴らす。
   全10問。前半は白鍵のみ、後半は黒鍵も出題する。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const TOTAL = 10;
  const BEST_KEY = "pitch-test-best"; // { abs: n, rel: n }

  // C4 から B4 までの12音
  const NOTES = [
    { name: "ド", black: false }, { name: "ド♯", black: true }, { name: "レ", black: false }, { name: "レ♯", black: true },
    { name: "ミ", black: false }, { name: "ファ", black: false }, { name: "ファ♯", black: true }, { name: "ソ", black: false },
    { name: "ソ♯", black: true }, { name: "ラ", black: false }, { name: "ラ♯", black: true }, { name: "シ", black: false },
  ];
  const C4 = 261.63;
  const freqOf = (i) => C4 * Math.pow(2, i / 12);

  const RANKS = [
    { min: 10, name: "調律師", comment: "全問正解。ピアノの調律、頼めますか。" },
    { min: 8, name: "絶対音感の持ち主", comment: "救急車の音でも音名が浮かぶタイプ。" },
    { min: 6, name: "音楽室の主", comment: "なかなかの耳。合唱で頼りにされる人。" },
    { min: 4, name: "カラオケの主役", comment: "だいたい合っている。キーを変えても歌える。" },
    { min: 2, name: "鼻歌名人", comment: "音の高い低いは分かる。名前はこれから。" },
    { min: 0, name: "音の冒険家", comment: "毎回が新しい出会い。相対音感モードから始めよう。" },
  ];

  // ---------- 音 ----------
  let ctx = null;
  function ensureAudio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  // ピアノ風：倍音を重ねて指数減衰させる
  function playNote(index, when, dur) {
    const ac = ensureAudio();
    const t = ac.currentTime + (when || 0);
    dur = dur || 1.4;
    const master = ac.createGain();
    master.connect(ac.destination);
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(0.6, t + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = freqOf(index);
    for (const [h, a] of [[1, 1], [2, 0.45], [3, 0.22], [4, 0.1], [5, 0.05]]) {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = f * h;
      const g = ac.createGain();
      g.gain.value = a;
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  // ---------- 状態 ----------
  const state = {
    phase: "start",
    mode: "abs",
    q: 0,
    score: 0,
    target: -1,
    answered: false,
    log: [],   // { target, pick, ok }
    timer: 0,
  };

  function pickTarget(q) {
    const pool = NOTES.map((n, i) => i).filter((i) => q <= 5 ? !NOTES[i].black : true);
    let t;
    do { t = pool[Math.floor(Math.random() * pool.length)]; } while (t === state.target && pool.length > 1);
    return t;
  }

  // ---------- 鍵盤 ----------
  function buildKeyboard() {
    const kb = $("keyboard");
    kb.innerHTML = "";
    const whites = NOTES.map((n, i) => i).filter((i) => !NOTES[i].black);
    whites.forEach((i) => {
      const k = document.createElement("button");
      k.className = "key white";
      k.dataset.note = i;
      k.innerHTML = `<span>${NOTES[i].name}</span>`;
      k.addEventListener("click", () => answer(i));
      kb.appendChild(k);
    });
    // 黒鍵は白鍵の境目に重ねる（ド♯ はドとレの間、など）
    NOTES.forEach((n, i) => {
      if (!n.black) return;
      const k = document.createElement("button");
      k.className = "key black";
      k.dataset.note = i;
      k.innerHTML = `<span>${n.name}</span>`;
      const whiteIndexBefore = whites.indexOf(i - 1);
      k.style.left = `calc(${(whiteIndexBefore + 1) / whites.length * 100}% - var(--black-w) / 2)`;
      k.addEventListener("click", () => answer(i));
      kb.appendChild(k);
    });
  }

  function setKeysEnabled(on) {
    for (const k of document.querySelectorAll(".key")) k.disabled = !on;
  }

  // ---------- 進行 ----------
  function startGame() {
    ensureAudio();
    state.q = 0;
    state.score = 0;
    state.log = [];
    $("score-value").textContent = "0";
    $("mode-value").textContent = state.mode === "abs" ? "絶対音感" : "相対音感";
    showScreen("play");
    nextQuestion();
  }

  function nextQuestion() {
    state.q++;
    state.answered = false;
    state.target = pickTarget(state.q);
    $("q-value").textContent = String(state.q);
    $("feedback").textContent = "";
    $("feedback").className = "feedback";
    $("prompt").textContent = state.q <= 5 ? "白い鍵盤のどれか" : "黒い鍵盤も出るよ";
    for (const k of document.querySelectorAll(".key")) k.classList.remove("correct", "wrong");
    $("orb-text").textContent = "♪";
    $("note-orb").className = "note-orb";
    setKeysEnabled(false);
    playTarget(() => setKeysEnabled(true));
  }

  // 出題音を鳴らす。相対モードは先に「ド」
  function playTarget(done) {
    const orb = $("note-orb");
    if (state.mode === "rel") {
      orb.classList.add("ref");
      $("orb-text").textContent = "ド";
      playNote(0, 0, 0.9);
      setTimeout(() => {
        orb.classList.remove("ref");
        orb.classList.add("ring");
        $("orb-text").textContent = "？";
        playNote(state.target, 0, 1.4);
        setTimeout(() => { orb.classList.remove("ring"); if (done) done(); }, 700);
      }, 1000);
    } else {
      orb.classList.add("ring");
      $("orb-text").textContent = "？";
      playNote(state.target, 0, 1.4);
      setTimeout(() => { orb.classList.remove("ring"); if (done) done(); }, 700);
    }
  }

  function replay() {
    if (state.phase !== "play" || state.answered) return;
    setKeysEnabled(false);
    playTarget(() => setKeysEnabled(true));
  }

  function answer(i) {
    if (state.phase !== "play" || state.answered) return;
    state.answered = true;
    setKeysEnabled(false);
    const ok = i === state.target;
    const keys = [...document.querySelectorAll(".key")];
    keys.find((k) => Number(k.dataset.note) === state.target).classList.add("correct");
    if (!ok) keys.find((k) => Number(k.dataset.note) === i).classList.add("wrong");
    const fb = $("feedback");
    if (ok) {
      state.score++;
      $("score-value").textContent = String(state.score);
      fb.textContent = `正解！ ${NOTES[state.target].name}`;
      fb.className = "feedback ok";
      $("orb-text").textContent = NOTES[state.target].name;
      $("note-orb").className = "note-orb good";
      playNote(state.target, 0, 0.8);
    } else {
      const d = semitoneDistance(i, state.target);
      fb.textContent = `ざんねん… 正解は ${NOTES[state.target].name}（${d}半音ちがい）`;
      fb.className = "feedback ng";
      $("orb-text").textContent = NOTES[state.target].name;
      $("note-orb").className = "note-orb bad";
      // 自分の音 → 正解の音 の順に聞かせる
      playNote(i, 0, 0.6);
      playNote(state.target, 0.7, 0.9);
    }
    state.log.push({ target: state.target, pick: i, ok });
    setTimeout(() => {
      if (state.q >= TOTAL) finish();
      else nextQuestion();
    }, ok ? 1100 : 2000);
  }

  function semitoneDistance(a, b) {
    const d = Math.abs(a - b) % 12;
    return Math.min(d, 12 - d);
  }

  // ---------- 結果 ----------
  function finish() {
    state.phase = "result";
    const rank = RANKS.find((r) => state.score >= r.min);
    const avg = state.log.reduce((s, e) => s + semitoneDistance(e.pick, e.target), 0) / state.log.length;
    const best = loadBest();
    const prev = best[state.mode] || 0;
    const isNew = state.score > prev;
    if (isNew) { best[state.mode] = state.score; saveBest(best); }
    $("result-rank").textContent = rank.name;
    $("result-score").textContent = String(state.score);
    $("result-sub").textContent = `${state.mode === "abs" ? "絶対音感" : "相対音感"}モード ・ 平均のズレ ${avg.toFixed(1)} 半音`;
    $("result-best").innerHTML = isNew
      ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！'
      : `自己ベスト ${prev} / 10`;
    $("result-comment").textContent = rank.comment;
    const list = $("result-list");
    list.innerHTML = "";
    state.log.forEach((e, i) => {
      const chip = document.createElement("span");
      chip.className = "chip " + (e.ok ? "ok" : "ng");
      chip.textContent = e.ok ? NOTES[e.target].name : `${NOTES[e.target].name}→${NOTES[e.pick].name}`;
      chip.title = `第${i + 1}問`;
      list.appendChild(chip);
    });
    const url = `${location.origin}${location.pathname}`;
    const text = `絶対音感テスト 🎹 ${state.score}/10【${rank.name}】（${state.mode === "abs" ? "絶対" : "相対"}音感モード）\n鳴った音はドレミのどれ？ #Ludom`;
    $("btn-share-x").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    $("share-note").textContent = "";
    $("btn-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(text + "\n" + url); $("share-note").textContent = "コピーしました"; }
      catch (e) { $("share-note").textContent = text + "\n" + url; }
    };
    showScreen("result");
  }

  function loadBest() { try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) { return {}; } }
  function saveBest(b) { try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { /* 保存できなくても遊べる */ } }

  function renderStartBest() {
    const best = loadBest();
    const v = best[state.mode];
    $("start-best").classList.toggle("hidden", !v);
    if (v) $("start-best-value").textContent = String(v);
  }

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
    if (e.key === "r" || e.key === "R") replay();
  });

  // ---------- 初期化 ----------
  function init() {
    buildKeyboard();
    for (const b of document.querySelectorAll(".mode")) {
      b.addEventListener("click", () => {
        state.mode = b.dataset.mode;
        for (const x of document.querySelectorAll(".mode")) x.classList.toggle("active", x === b);
        renderStartBest();
      });
    }
    renderStartBest();
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    $("btn-home").addEventListener("click", () => { renderStartBest(); showScreen("start"); });
    $("btn-replay").addEventListener("click", replay);
    showScreen("start");
  }
  init();
})();
