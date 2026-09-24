/* ===================================================
   体内時計 - ゲームロジック
   3秒・10秒・30秒の3ラウンド。スタート後、最初の数秒だけ数字と秒針が
   見え、そのあと消える。目標だと思ったところでタップして止め、
   ズレの合計で称号を決める。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const BEST_KEY = "body-clock-best";
  const ROUNDS = [3, 10, 30];               // 目標秒
  const VISIBLE = { 3: 1.0, 10: 2.0, 30: 3.0 }; // 数字が見えている秒数
  const MIN_STOP = 0.3;                     // これより早いタップは誤操作として無視

  const RANKS = [
    { max: 0.5, name: "原子時計", comment: "誤差ほぼゼロ。あなたの中に時報が住んでいる。" },
    { max: 1.0, name: "人間時計", comment: "見事。カップ麺は目をつぶって待てる。" },
    { max: 2.0, name: "駅の時計", comment: "ちゃんと合っている。乗り換えは余裕。" },
    { max: 4.0, name: "腹時計", comment: "だいたい合っている。お昼どきはとくに正確。" },
    { max: 8.0, name: "砂時計", comment: "のんびり派。時間はゆっくり流れている。" },
    { max: Infinity, name: "日時計", comment: "曇りの日は動かないタイプ。" },
  ];

  const state = {
    phase: "start",   // start | ready | running | stopped | result
    round: 0,
    startAt: 0,
    raf: 0,
    results: [],      // { target, time, err }
  };

  // ---------- 時計の描画 ----------
  function buildTicks() {
    let s = "";
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0;
      const a = (i / 60) * Math.PI * 2;
      const r1 = major ? 78 : 84, r2 = 90;
      s += `<line x1="${100 + Math.sin(a) * r1}" y1="${100 - Math.cos(a) * r1}" x2="${100 + Math.sin(a) * r2}" y2="${100 - Math.cos(a) * r2}" class="${major ? "tick major" : "tick"}"/>`;
    }
    $("ticks").innerHTML = s;
  }

  function setHand(seconds, visible) {
    const hand = $("hand");
    hand.style.transform = `rotate(${(seconds % 60) * 6}deg)`;
    hand.style.opacity = visible ? 1 : 0;
  }

  // ---------- 進行 ----------
  function startGame() {
    state.round = 0;
    state.results = [];
    $("total-value").textContent = "0.00";
    $("round-list").innerHTML = "";
    showScreen("play");
    readyRound();
  }

  function readyRound() {
    const target = ROUNDS[state.round];
    state.phase = "ready";
    $("round-value").textContent = String(state.round + 1);
    $("target-value").textContent = String(target);
    $("clock").classList.remove("running", "hidden-phase", "stopped");
    $("clock-text").innerHTML = `<b>${target}秒</b>ぴったりで<br>タップでスタート`;
    $("round-msg").textContent = "";
    setHand(0, true);
    window.scrollTo(0, 0);
  }

  function startRound() {
    state.phase = "running";
    state.startAt = performance.now();
    $("clock").classList.add("running");
    $("clock").classList.remove("hidden-phase");
    cancelAnimationFrame(state.raf);
    const target = ROUNDS[state.round];
    const tick = () => {
      if (state.phase !== "running") return;
      const t = (performance.now() - state.startAt) / 1000;
      if (t < VISIBLE[target]) {
        $("clock-text").innerHTML = `<span class="big">${t.toFixed(1)}</span>`;
        setHand(t, true);
      } else {
        $("clock").classList.add("hidden-phase");
        $("clock-text").innerHTML = `<span class="big dim">…</span>`;
        setHand(t, false);
      }
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
  }

  function stopRound() {
    const t = (performance.now() - state.startAt) / 1000;
    if (t < MIN_STOP) return; // 二度押し防止
    state.phase = "stopped";
    cancelAnimationFrame(state.raf);
    const target = ROUNDS[state.round];
    const err = t - target;
    state.results.push({ target, time: t, err });
    const total = state.results.reduce((s, r) => s + Math.abs(r.err), 0);
    $("total-value").textContent = total.toFixed(2);
    $("clock").classList.remove("running", "hidden-phase");
    $("clock").classList.add("stopped");
    setHand(t, true);
    const sign = err >= 0 ? "+" : "−";
    $("clock-text").innerHTML = `<span class="big">${t.toFixed(2)}</span><span class="err ${Math.abs(err) < 0.3 ? "good" : ""}">${sign}${Math.abs(err).toFixed(2)}秒</span>`;
    $("round-msg").textContent = verdict(Math.abs(err), target);
    const li = document.createElement("li");
    li.innerHTML = `<span class="rl-target">${target}秒</span><span class="rl-time mono">${t.toFixed(2)}秒</span><span class="rl-err mono ${Math.abs(err) < 0.3 ? "good" : ""}">${sign}${Math.abs(err).toFixed(2)}</span>`;
    $("round-list").appendChild(li);
    setTimeout(() => {
      state.round++;
      if (state.round >= ROUNDS.length) finish();
      else readyRound();
    }, 1800);
  }

  function verdict(absErr, target) {
    const ratio = absErr / target;
    if (absErr < 0.1) return "神がかり。時報と同じ精度。";
    if (absErr < 0.3) return "ぴったり。体内時計、正確。";
    if (ratio < 0.08) return "いい感じ。少しだけずれた。";
    if (ratio < 0.2) return "まずまず。次は心の中で数えてみよう。";
    return absErr > 0 && (state.results[state.results.length - 1].err > 0) ? "待ちすぎた。" : "せっかち。";
  }

  function onClockTap() {
    if (state.phase === "ready") startRound();
    else if (state.phase === "running") stopRound();
  }

  // ---------- 結果 ----------
  function rankFor(total) {
    return RANKS.find((r) => total < r.max);
  }

  function finish() {
    state.phase = "result";
    const total = state.results.reduce((s, r) => s + Math.abs(r.err), 0);
    const rank = rankFor(total);
    const best = loadBest();
    const isNew = best === null || total < best;
    if (isNew) saveBest(total);
    $("result-rank").textContent = rank.name;
    $("result-total").textContent = total.toFixed(2);
    $("result-best").innerHTML = isNew
      ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！'
      : `自己ベスト ${best.toFixed(2)} 秒`;
    $("result-comment").textContent = rank.comment;
    const list = $("result-list");
    list.innerHTML = "";
    for (const r of state.results) {
      const sign = r.err >= 0 ? "+" : "−";
      const li = document.createElement("li");
      li.innerHTML = `<span class="rl-target">${r.target}秒</span><span class="rl-time mono">${r.time.toFixed(2)}秒</span><span class="rl-err mono ${Math.abs(r.err) < 0.3 ? "good" : ""}">${sign}${Math.abs(r.err).toFixed(2)}</span>`;
      list.appendChild(li);
    }
    const url = `${location.origin}${location.pathname}`;
    const detail = state.results.map((r) => `${r.target}秒: ${r.err >= 0 ? "+" : "−"}${Math.abs(r.err).toFixed(2)}`).join(" / ");
    const text = `体内時計 ⏱ ズレ合計 ${total.toFixed(2)}秒【${rank.name}】\n${detail}\n#Ludom`;
    $("btn-share-x").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    $("share-note").textContent = "";
    $("btn-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(text + "\n" + url); $("share-note").textContent = "コピーしました"; }
      catch (e) { $("share-note").textContent = text + "\n" + url; }
    };
    showScreen("result");
  }

  function loadBest() {
    try { const v = localStorage.getItem(BEST_KEY); return v === null ? null : Number(v); } catch (e) { return null; }
  }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, v.toFixed(3)); } catch (e) { /* 保存できなくても遊べる */ } }

  function showScreen(name) {
    for (const s of ["start", "play", "result"]) $("screen-" + s).classList.toggle("hidden", s !== name);
    if (name !== "play") state.phase = name;
    window.scrollTo(0, 0);
  }

  // ---------- 入力 ----------
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (state.phase === "start" || state.phase === "result") startGame();
      else onClockTap();
    }
  });

  function init() {
    buildTicks();
    const best = loadBest();
    if (best !== null) { $("start-best").classList.remove("hidden"); $("start-best-value").textContent = best.toFixed(2); }
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    $("clock").addEventListener("click", onClockTap);
    showScreen("start");
  }
  init();
})();
