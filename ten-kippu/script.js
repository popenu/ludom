/* ===================================================
   テンきっぷ - ゲームロジック
   切符の4桁で 10 を作る「テンパズル」を 60 秒のタイムアタックで遊ぶ。
   数字 → 記号 → 数字 の順にタップすると 2 つの数字が計算結果にまとまり、
   3 回まとめて残った 1 つが 10 なら正解。式の探索は solver.js が担当。
=================================================== */
(function () {
  "use strict";

  const S = globalThis.TenSolver;
  const $ = (id) => document.getElementById(id);

  const TIME_LIMIT = 60;    // 制限時間（秒）
  const PASS_PENALTY = 5;   // パスで減る秒数
  const BEST_KEY = "ten-kippu-best";

  // ---------- 難易度 ----------
  // 正解数に応じて、整数だけで解ける式の数（intCount）の範囲を絞って出題する。
  // 解き筋が多い切符ほど人にとっても易しい傾向があるので、序盤は多いもの、
  // 終盤は少ないものを出す。分数が必要な切符（1158 など）は出さない。
  function tierFor(solved) {
    if (solved <= 2) return { min: 41, max: Infinity };
    if (solved <= 5) return { min: 12, max: 40 };
    if (solved <= 8) return { min: 5, max: 20 };
    return { min: 1, max: 8 };
  }

  function randomDigits() {
    return [0, 0, 0, 0].map(() => Math.floor(Math.random() * 10));
  }

  // 同じ組み合わせは 1 回のプレイ中に出さない
  function pickProblem(solved, usedKeys) {
    const { min, max } = tierFor(solved);
    let fallback = null;
    for (let i = 0; i < 80; i++) {
      const digits = randomDigits();
      const key = digits.slice().sort().join("");
      if (usedKeys.has(key)) continue;
      const r = S.solve(digits);
      if (!r.intOnly) continue;
      const p = { digits, key, best: r.best, intCount: r.intCount };
      if (r.intCount >= min && r.intCount <= max) return p;
      if (!fallback) fallback = p;
    }
    while (!fallback) {
      const digits = randomDigits();
      const r = S.solve(digits);
      if (r.intOnly) fallback = { digits, key: digits.slice().sort().join(""), best: r.best, intCount: r.intCount };
    }
    return fallback;
  }

  // ---------- 状態 ----------
  const state = {
    phase: "start",      // start | play | result
    score: 0,
    endAt: 0,            // performance.now() 基準の終了時刻
    problem: null,       // { digits, key, best }
    currentLogged: false,
    serial: 0,
    tiles: [],           // 画面上の数字（ソルバーのノード + id）
    history: [],         // 戻す用のスナップショット
    selA: null, op: null, selB: null,
    busy: false,         // 正解・不正解の演出中は入力を受け付けない
    log: [],             // 結果画面用 { digits, status, expr }
    used: new Set(),
    raf: 0,
    msgTimer: 0,
  };
  let tileSeq = 0;

  const el = {
    screens: { start: $("screen-start"), play: $("screen-play"), result: $("screen-result") },
    tiles: $("tiles"),
    flash: $("ticket-flash"),
    serial: $("ticket-serial"),
    msg: $("msg"),
    time: $("time-value"),
    fill: $("time-fill"),
    penalty: $("time-penalty"),
    score: $("score-value"),
    undo: $("btn-undo"),
    ops: [...document.querySelectorAll(".op")],
  };

  function showScreen(name) {
    for (const k in el.screens) el.screens[k].classList.toggle("hidden", k !== name);
    state.phase = name;
    window.scrollTo(0, 0);
  }

  function loadBest() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* プライベートモード等は無視 */ }
  }

  // ---------- 進行 ----------
  function startGame() {
    state.score = 0;
    state.log = [];
    state.used = new Set();
    state.serial = 0;
    state.endAt = performance.now() + TIME_LIMIT * 1000;
    el.score.textContent = "0";
    el.penalty.textContent = "";
    showScreen("play");
    nextProblem();
    cancelAnimationFrame(state.raf);
    tick();
  }

  function nextProblem() {
    const p = pickProblem(state.score, state.used);
    state.used.add(p.key);
    state.problem = p;
    state.currentLogged = false;
    state.serial += 1;
    el.serial.textContent = "No. " + String(state.serial).padStart(4, "0");
    state.tiles = p.digits.map((n) => Object.assign({ id: ++tileSeq }, S.leaf(n)));
    state.history = [];
    clearSelection();
    state.busy = false;
    renderTiles();
    setMsg("");
  }

  function tick() {
    if (state.phase !== "play") return;
    const remainMs = Math.max(0, state.endAt - performance.now());
    el.time.textContent = String(Math.ceil(remainMs / 1000));
    el.fill.style.width = (remainMs / (TIME_LIMIT * 1000)) * 100 + "%";
    el.fill.classList.toggle("urgent", remainMs < 10000);
    if (remainMs <= 0) { finish(); return; }
    state.raf = requestAnimationFrame(tick);
  }

  function finish() {
    cancelAnimationFrame(state.raf);
    if (state.problem && !state.currentLogged) {
      state.log.push({ digits: state.problem.digits, status: "timeup", expr: state.problem.best });
      state.currentLogged = true;
    }
    el.time.textContent = "0";
    el.fill.style.width = "0%";
    const best = loadBest();
    const isNew = state.score > best;
    if (isNew) saveBest(state.score);
    renderResult(isNew ? state.score : best, isNew);
    showScreen("result");
  }

  // ---------- 表示 ----------
  // 負の数はハイフンではなくマイナス記号で見せる
  function displayValue(f) {
    return S.fracToString(f).replace("-", "−");
  }

  function renderTiles() {
    el.tiles.innerHTML = "";
    for (const t of state.tiles) {
      const b = document.createElement("button");
      b.className = "tile";
      if (t.id === state.selA) b.classList.add("sel-a");
      if (t.id === state.selB) b.classList.add("sel-b");
      if (t.prec < 3) b.classList.add("merged");
      const txt = displayValue(t.val);
      if (txt.length >= 3) b.classList.add("small");
      b.textContent = txt;
      b.dataset.id = t.id;
      b.setAttribute("aria-label", txt + (t.prec < 3 ? "（" + t.expr + "）" : ""));
      b.addEventListener("click", () => onTile(t.id));
      el.tiles.appendChild(b);
    }
    for (const o of el.ops) o.classList.toggle("active", o.dataset.op === state.op);
    el.undo.disabled = state.history.length === 0;
  }

  function setMsg(text) {
    clearTimeout(state.msgTimer);
    el.msg.textContent = text;
    el.msg.classList.toggle("show", !!text);
    if (text) state.msgTimer = setTimeout(() => el.msg.classList.remove("show"), 1800);
  }

  function shake(node) {
    if (!node) return;
    node.classList.remove("shake");
    void node.offsetWidth; // アニメーションを再生し直すためのリフロー
    node.classList.add("shake");
  }

  function flashTicket(kind, text) {
    el.flash.textContent = text;
    el.flash.className = "ticket-flash show " + kind;
    setTimeout(() => { el.flash.className = "ticket-flash"; }, 520);
  }

  function showPenalty() {
    el.penalty.textContent = "−" + PASS_PENALTY + "秒";
    el.penalty.classList.remove("show");
    void el.penalty.offsetWidth;
    el.penalty.classList.add("show");
  }

  // ---------- 操作 ----------
  function clearSelection() {
    state.selA = null;
    state.op = null;
    state.selB = null;
  }

  function onTile(id) {
    if (state.phase !== "play" || state.busy) return;
    if (state.selA === id) {
      // 1つ目を取り消し。2つ目が選ばれていればそれを1つ目に繰り上げる
      state.selA = state.selB;
      state.selB = null;
    } else if (state.selB === id) {
      state.selB = null;
    } else if (state.selA === null) {
      state.selA = id;
    } else {
      state.selB = id;
    }
    renderTiles();
    tryMerge();
  }

  function onOp(op) {
    if (state.phase !== "play" || state.busy) return;
    state.op = state.op === op ? null : op;
    renderTiles();
    tryMerge();
  }

  // 数字・記号・数字が揃ったら計算して 1 つにまとめる
  function tryMerge() {
    if (state.selA === null || state.selB === null || !state.op) return;
    const a = state.tiles.find((t) => t.id === state.selA);
    const b = state.tiles.find((t) => t.id === state.selB);
    const node = S.combine(a, state.op, b);
    if (!node) {
      setMsg("0 では割れない");
      shake(el.tiles.querySelector(`[data-id="${b.id}"]`));
      state.op = null;
      renderTiles();
      return;
    }
    state.history.push(state.tiles.slice());
    const merged = Object.assign({ id: ++tileSeq }, node);
    state.tiles = state.tiles
      .filter((t) => t.id !== b.id)
      .map((t) => (t.id === a.id ? merged : t));
    clearSelection();
    renderTiles();
    if (state.tiles.length === 1) checkAnswer(merged);
  }

  function checkAnswer(node) {
    state.busy = true;
    if (S.isInt(node.val) && node.val.n === S.TARGET) {
      state.score += 1;
      el.score.textContent = String(state.score);
      state.log.push({ digits: state.problem.digits, status: "solved", expr: node.expr });
      state.currentLogged = true;
      flashTicket("ok", node.expr + " = 10");
      setTimeout(() => { if (state.phase === "play") nextProblem(); }, 550);
    } else {
      // 10 にならなかった：最後の計算だけ自動で戻す（それ以前は「戻す」で）
      setMsg(node.expr + " = " + displayValue(node.val) + "　≠ 10");
      shake(el.tiles.querySelector(".tile"));
      setTimeout(() => {
        state.busy = false;
        if (state.phase === "play") undo(true);
      }, 650);
    }
  }

  function undo(keepMsg) {
    if (state.phase !== "play" || state.busy) return;
    if (!state.history.length) return;
    state.tiles = state.history.pop();
    clearSelection();
    renderTiles();
    if (!keepMsg) setMsg("");
  }

  function pass() {
    if (state.phase !== "play" || state.busy) return;
    state.endAt -= PASS_PENALTY * 1000;
    state.log.push({ digits: state.problem.digits, status: "passed", expr: state.problem.best });
    state.currentLogged = true;
    showPenalty();
    if (state.endAt - performance.now() <= 0) { finish(); return; }
    nextProblem();
  }

  // ---------- 結果 ----------
  function comment(score) {
    if (score === 0) return "まずは1問。足し算と引き算だけで解ける切符もあります。";
    if (score <= 2) return "ウォーミングアップ完了。次は手が勝手に動くはず。";
    if (score <= 5) return "いい調子。改札を通る前に1問解けるレベル。";
    if (score <= 8) return "なかなかの計算力。車内アナウンスより速い。";
    if (score <= 11) return "駅員も振り返る速さ。";
    return "もはや自動改札。人間の速度ではない。";
  }

  function renderResult(best, isNew) {
    $("result-score").textContent = String(state.score);
    $("result-best").innerHTML = isNew
      ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！'
      : `自己ベスト ${best} 問`;
    $("result-comment").textContent = comment(state.score);

    const list = $("result-list");
    list.innerHTML = "";
    const labels = { solved: "正解", passed: "パス", timeup: "時間切れ" };
    for (const e of state.log) {
      const li = document.createElement("li");
      li.className = "result-item " + e.status;
      const digits = document.createElement("span");
      digits.className = "ri-digits";
      digits.textContent = e.digits.join(" ");
      const status = document.createElement("span");
      status.className = "ri-status";
      status.textContent = labels[e.status];
      const expr = document.createElement("span");
      expr.className = "ri-expr";
      expr.textContent = e.expr ? e.expr + " = 10" : "";
      li.append(digits, status, expr);
      list.appendChild(li);
    }

    const url = `${location.origin}${location.pathname}`;
    const text = `テンきっぷ 🎫 60秒で ${state.score}問 解けた！\n切符の4桁で10をつくる計算パズル #Ludom`;
    $("btn-share-x").href =
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    $("share-note").textContent = "";
    $("btn-copy").onclick = async () => {
      try {
        await navigator.clipboard.writeText(text + "\n" + url);
        $("share-note").textContent = "コピーしました";
      } catch (e) {
        $("share-note").textContent = text + "\n" + url;
      }
    };
  }

  // ---------- キーボード ----------
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (state.phase === "start" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); startGame(); return; }
    if (state.phase === "result" && e.key === "Enter") { startGame(); return; }
    if (state.phase !== "play") return;
    const keyOps = { "+": "+", "-": "−", "*": "×", "x": "×", "/": "÷" };
    if (/^[1-4]$/.test(e.key)) {
      const t = state.tiles[Number(e.key) - 1];
      if (t) onTile(t.id);
    } else if (keyOps[e.key]) {
      onOp(keyOps[e.key]);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      undo();
    } else if (e.key === "p" || e.key === "P") {
      pass();
    }
  });

  // ---------- 初期化 ----------
  function init() {
    const best = loadBest();
    if (best > 0) {
      $("start-best").classList.remove("hidden");
      $("start-best-value").textContent = String(best);
    }
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    el.undo.addEventListener("click", () => undo());
    $("btn-pass").addEventListener("click", pass);
    for (const o of el.ops) o.addEventListener("click", () => onOp(o.dataset.op));
    showScreen("start");
  }
  init();
})();
