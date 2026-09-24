/* ===================================================
   一筆書き - ゲームロジック
   格子点をつないだ図形をランダムに作り、「奇数次数の点が 0 個か 2 個」
   （＝一筆書きできる）ものだけ出題する。指でなぞって全部の線を通す。
   線は隣り合う格子点どうしだけ（斜めは1マスに1本）なので交差しない。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const TOTAL = 10;
  const BEST_KEY = "hitofude-best";
  const SKIP_PENALTY = 10;
  const HIT_R = 30;   // 点をつかむ半径（CSS px）

  function levelSpec(q) {
    if (q <= 3) return { cols: 3, rows: 3, minE: 6, maxE: 8, p: 0.5 };
    if (q <= 6) return { cols: 4, rows: 3, minE: 9, maxE: 12, p: 0.5 };
    return { cols: 4, rows: 4, minE: 12, maxE: 16, p: 0.45 };
  }

  // ---------- 図形の生成 ----------
  function candidates(cols, rows) {
    const list = [];
    const id = (x, y) => y * cols + x;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (x + 1 < cols) list.push([id(x, y), id(x + 1, y)]);
      if (y + 1 < rows) list.push([id(x, y), id(x, y + 1)]);
      if (x + 1 < cols && y + 1 < rows) {
        // 斜めはマスごとにどちらか一本（交差させない）
        if (Math.random() < 0.5) list.push([id(x, y), id(x + 1, y + 1)]);
        else list.push([id(x + 1, y), id(x, y + 1)]);
      }
    }
    return list;
  }

  function generate(q) {
    const spec = levelSpec(q);
    const n = spec.cols * spec.rows;
    for (let attempt = 0; attempt < 4000; attempt++) {
      const cand = candidates(spec.cols, spec.rows);
      const edges = cand.filter(() => Math.random() < spec.p);
      if (edges.length < spec.minE || edges.length > spec.maxE) continue;
      const deg = new Array(n).fill(0);
      for (const [a, b] of edges) { deg[a]++; deg[b]++; }
      const odd = deg.filter((d) => d % 2 === 1).length;
      if (odd !== 0 && odd !== 2) continue;
      // 連結か（線のある点だけで）
      const used = deg.map((d) => d > 0);
      const start = used.indexOf(true);
      const seen = new Array(n).fill(false);
      const stack = [start];
      seen[start] = true;
      while (stack.length) {
        const v = stack.pop();
        for (const [a, b] of edges) {
          const w = a === v ? b : b === v ? a : -1;
          if (w >= 0 && !seen[w]) { seen[w] = true; stack.push(w); }
        }
      }
      if (used.some((u, i) => u && !seen[i])) continue;
      return { cols: spec.cols, rows: spec.rows, edges, deg };
    }
    // 保険：家の形
    return { cols: 3, rows: 3, edges: [[0, 1], [1, 2], [0, 3], [2, 5], [3, 5], [0, 4], [1, 4], [2, 4], [3, 4], [4, 5]], deg: null };
  }

  // ---------- 状態 ----------
  const state = {
    phase: "start",
    q: 0,
    misses: 0,
    stageMisses: 0,
    hint: false,
    startAt: 0,
    penalty: 0,
    raf: 0,
    g: null,        // { cols, rows, edges, deg }
    pts: [],        // 画面座標
    used: [],       // 線ごとの通過フラグ
    path: [],       // 通った点の列
    current: -1,
    drawing: false,
    busy: false,
    msgTimer: 0,
  };

  window.__hitofude = state; // 動作確認用（なぞりの自動テストで使う）
  const canvas = $("board");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;

  function layout() {
    const wrap = canvas.parentElement;
    W = wrap.clientWidth;
    H = Math.round(W * 0.92);
    DPR = window.devicePixelRatio || 1;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (state.g) placePoints();
    draw();
  }

  function placePoints() {
    const { cols, rows } = state.g;
    const pad = 48;
    const cw = (W - pad * 2) / (cols - 1);
    const rh = (H - pad * 2) / (rows - 1);
    const cell = Math.min(cw, rh);
    const ox = (W - cell * (cols - 1)) / 2;
    const oy = (H - cell * (rows - 1)) / 2;
    state.pts = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) state.pts.push({ x: ox + x * cell, y: oy + y * cell });
  }

  // ---------- 描画 ----------
  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!state.g) return;
    const { edges, deg } = state.g;
    const p = state.pts;
    // 未通過の線
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    edges.forEach(([a, b], i) => {
      ctx.strokeStyle = state.used[i] ? "#c9402a" : "#cfc6b6";
      ctx.lineWidth = state.used[i] ? 12 : 10;
      ctx.beginPath();
      ctx.moveTo(p[a].x, p[a].y);
      ctx.lineTo(p[b].x, p[b].y);
      ctx.stroke();
    });
    // 点
    const active = new Set();
    for (const [a, b] of edges) { active.add(a); active.add(b); }
    for (const i of active) {
      const isOdd = deg && deg[i] % 2 === 1;
      const r = i === state.current ? 15 : 11;
      ctx.beginPath();
      ctx.arc(p[i].x, p[i].y, r, 0, Math.PI * 2);
      ctx.fillStyle = i === state.current ? "#c9402a" : state.hint && isOdd ? "#f2a65a" : "#1c1a17";
      ctx.fill();
      if (state.hint && isOdd) {
        ctx.beginPath();
        ctx.arc(p[i].x, p[i].y, 20, 0, Math.PI * 2);
        ctx.strokeStyle = "#f2a65a";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }

  // ---------- 進行 ----------
  function startGame() {
    state.q = 0;
    state.misses = 0;
    state.penalty = 0;
    state.startAt = performance.now();
    $("miss-value").textContent = "0";
    showScreen("play");
    layout();
    cancelAnimationFrame(state.raf);
    const tick = () => {
      if (state.phase !== "play") return;
      $("time-value").textContent = String(Math.floor(elapsed()));
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
    nextStage();
  }

  function elapsed() { return (performance.now() - state.startAt) / 1000 + state.penalty; }

  function nextStage(regenerate) {
    state.q += regenerate ? 0 : 1;
    state.g = generate(state.q);
    state.used = state.g.edges.map(() => false);
    state.path = [];
    state.current = -1;
    state.drawing = false;
    state.busy = false;
    state.hint = false;
    state.stageMisses = 0;
    $("q-value").textContent = String(state.q);
    $("edge-total").textContent = String(state.g.edges.length);
    $("edge-value").textContent = "0";
    setMsg("");
    placePoints();
    draw();
  }

  function resetStroke() {
    state.used = state.g.edges.map(() => false);
    state.path = [];
    state.current = -1;
    state.drawing = false;
    $("edge-value").textContent = "0";
    draw();
  }

  function miss(reason) {
    state.misses++;
    state.stageMisses++;
    $("miss-value").textContent = String(state.misses);
    setMsg(reason);
    if (state.stageMisses >= 2 && !state.hint) {
      state.hint = true;
      setMsg(reason + "　ヒント：光っている点から始めよう", 2600);
    }
    state.busy = true;
    canvas.classList.add("shake");
    setTimeout(() => {
      canvas.classList.remove("shake");
      state.busy = false;
      resetStroke();
    }, 450);
  }

  function clearStage() {
    state.busy = true;
    state.drawing = false;
    setMsg("クリア！", 900);
    canvas.classList.add("done");
    setTimeout(() => {
      canvas.classList.remove("done");
      if (state.q >= TOTAL) finish();
      else nextStage();
    }, 800);
  }

  function skip() {
    if (state.phase !== "play" || state.busy) return;
    state.penalty += SKIP_PENALTY;
    nextStage(true);
    setMsg(`別の図形（+${SKIP_PENALTY}秒）`, 1200);
  }

  function showHint() {
    if (state.phase !== "play") return;
    state.hint = true;
    const odd = state.g.deg ? state.g.deg.filter((d) => d % 2 === 1).length : 0;
    setMsg(odd === 2 ? "光っている点から始めて、もう一方で終わる" : "どの点から始めてもOK。始めた点で終わる", 2600);
    draw();
  }

  function setMsg(text, ms) {
    clearTimeout(state.msgTimer);
    $("msg").textContent = text;
    $("msg").classList.toggle("show", !!text);
    if (text && ms) state.msgTimer = setTimeout(() => $("msg").classList.remove("show"), ms);
  }

  // ---------- なぞり ----------
  function pointAt(x, y) {
    let best = -1, bd = HIT_R * HIT_R;
    const active = new Set();
    for (const [a, b] of state.g.edges) { active.add(a); active.add(b); }
    for (const i of active) {
      const dx = state.pts[i].x - x, dy = state.pts[i].y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function edgeBetween(a, b) {
    return state.g.edges.findIndex(([p, q], i) => !state.used[i] && ((p === a && q === b) || (p === b && q === a)));
  }
  function hasUnused(v) {
    return state.g.edges.some(([p, q], i) => !state.used[i] && (p === v || q === v));
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (state.phase !== "play" || state.busy) return;
    e.preventDefault();
    const { x, y } = pos(e);
    const v = pointAt(x, y);
    if (v < 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 取れなくても動く */ }
    resetStroke();
    state.drawing = true;
    state.current = v;
    state.path = [v];
    draw();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!state.drawing || state.busy) return;
    e.preventDefault();
    const { x, y } = pos(e);
    const v = pointAt(x, y);
    if (v < 0 || v === state.current) return;
    const ei = edgeBetween(state.current, v);
    if (ei < 0) return; // つながっていない、または通過済み
    state.used[ei] = true;
    state.current = v;
    state.path.push(v);
    const done = state.used.filter(Boolean).length;
    $("edge-value").textContent = String(done);
    draw();
    if (done === state.g.edges.length) { clearStage(); return; }
    if (!hasUnused(v)) miss("行き止まり…");
  });

  function endStroke(e) {
    if (!state.drawing || state.busy) return;
    state.drawing = false;
    const done = state.used.filter(Boolean).length;
    if (done === 0) { resetStroke(); return; } // ただのタップ
    if (done < state.g.edges.length) miss("指が離れた…");
  }
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
  canvas.addEventListener("pointerleave", (e) => { if (state.drawing) endStroke(e); });

  // ---------- 結果 ----------
  function rankFor(secs, misses) {
    if (misses === 0 && secs < 90) return ["一筆の達人", "ノーミス、しかも速い。筆が迷わない。"];
    if (misses <= 2) return ["筆の職人", "ほぼ迷いなし。奇数の点を見つけるのが速い。"];
    if (misses <= 5) return ["なぞり名人", "いい調子。始める点を先に決めると速くなる。"];
    return ["修行中", "行き止まりは学び。奇数本の点から始めよう。"];
  }

  function finish() {
    state.phase = "result";
    cancelAnimationFrame(state.raf);
    const secs = Math.round(elapsed());
    const [rank, comment] = rankFor(secs, state.misses);
    const best = loadBest();
    const isNew = best === null || secs < best;
    if (isNew) saveBest(secs);
    $("result-time").textContent = String(secs);
    $("result-rank").textContent = rank;
    $("result-sub").textContent = `ミス ${state.misses} 回${state.penalty ? `（別の図形 +${state.penalty}秒 込み）` : ""}`;
    $("result-best").innerHTML = isNew ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！' : `自己ベスト ${best} 秒`;
    $("result-comment").textContent = comment;
    const url = `${location.origin}${location.pathname}`;
    const text = `一筆書き ✍️ 10問を ${secs}秒【${rank}】ミス${state.misses}回\n指でなぞる一筆書きパズル #Ludom`;
    $("btn-share-x").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    $("share-note").textContent = "";
    $("btn-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(text + "\n" + url); $("share-note").textContent = "コピーしました"; }
      catch (e) { $("share-note").textContent = text + "\n" + url; }
    };
    showScreen("result");
  }

  function loadBest() { try { const v = localStorage.getItem(BEST_KEY); return v === null ? null : Number(v); } catch (e) { return null; } }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* 保存できなくても遊べる */ } }

  function showScreen(name) {
    for (const s of ["start", "play", "result"]) $("screen-" + s).classList.toggle("hidden", s !== name);
    state.phase = name;
    window.scrollTo(0, 0);
  }

  window.addEventListener("resize", () => { if (state.phase === "play") layout(); });
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((state.phase === "start" || state.phase === "result") && e.key === "Enter") startGame();
  });

  function init() {
    const best = loadBest();
    if (best !== null) { $("start-best").classList.remove("hidden"); $("start-best-value").textContent = String(best); }
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    $("btn-hint").addEventListener("click", showHint);
    $("btn-skip").addEventListener("click", skip);
    showScreen("start");
  }
  init();
})();
