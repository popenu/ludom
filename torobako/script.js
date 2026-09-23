/* ===================================================
   トロ箱わたり - ゲームロジック
   水に浮かぶ発泡スチロールの箱（トロ箱）を、全部一度ずつ踏んで渡る。
   面は「一筆書きの道」をランダム生成してから箱を並べるので、
   必ず渡り切れる並びしか出ない。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const PROGRESS_KEY = "torobako-progress"; // 到達した最大の面

  // 面ごとの内側グリッドの大きさと箱の数
  const LEVELS = [
    { w: 3, h: 3, k: 7 },
    { w: 4, h: 4, k: 10 },
    { w: 4, h: 4, k: 13 },
    { w: 5, h: 4, k: 15 },
    { w: 5, h: 5, k: 18 },
    { w: 5, h: 5, k: 22 },
    { w: 6, h: 5, k: 24 },
    { w: 6, h: 6, k: 28 },
    { w: 6, h: 6, k: 32 },
    { w: 7, h: 6, k: 36 },
  ];
  function levelSpec(stage) {
    if (stage <= LEVELS.length) return LEVELS[stage - 1];
    // それ以降は最大サイズで箱の数だけ揺らす
    const w = 6 + (stage % 2), h = 6;
    const k = Math.min(w * h - 4, 30 + ((stage - LEVELS.length) % 8));
    return { w, h, k };
  }

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- 面の生成：外周から始まり外周で終わる、長さ k の自己回避路 ----------
  function genPath(w, h, k) {
    const isBorder = (x, y) => x === 0 || y === 0 || x === w - 1 || y === h - 1;
    const visited = new Uint8Array(w * h);
    const path = [];
    let nodes = 0;
    const LIMIT = 120000;
    function dfs(x, y) {
      if (++nodes > LIMIT) return false;
      path.push([x, y]);
      visited[y * w + x] = 1;
      if (path.length === k) {
        if (isBorder(x, y)) return true;
      } else {
        for (const [dx, dy] of shuffle(DIRS.slice())) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || visited[ny * w + nx]) continue;
          if (dfs(nx, ny)) return true;
        }
      }
      path.pop();
      visited[y * w + x] = 0;
      return false;
    }
    const border = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isBorder(x, y)) border.push([x, y]);
    for (let attempt = 0; attempt < 30; attempt++) {
      const [sx, sy] = border[Math.floor(Math.random() * border.length)];
      nodes = 0;
      path.length = 0;
      visited.fill(0);
      if (dfs(sx, sy)) return path.slice();
    }
    return null;
  }

  // 内側グリッドの外周マスに接する、外枠（岸）のマスをひとつ返す（拡張座標）
  function shoreNext(w, h, [x, y]) {
    const opts = [];
    if (x === 0) opts.push({ x: 0, y: y + 1 });
    if (x === w - 1) opts.push({ x: w + 1, y: y + 1 });
    if (y === 0) opts.push({ x: x + 1, y: 0 });
    if (y === h - 1) opts.push({ x: x + 1, y: h + 1 });
    return opts[Math.floor(Math.random() * opts.length)];
  }

  // ---------- 状態 ----------
  const state = {
    phase: "start",   // start | play
    stage: 1,
    W: 0, H: 0,
    grid: [],         // grid[y][x] = { type: water|box|shore|gate, cracked, broken, el }
    cat: { x: 0, y: 0 },
    entry: null,
    boxes: 0,
    remaining: 0,
    moves: 0,
    busy: false,
    gateOpen: false,
  };

  const CRACK_SVG = `<svg class="crack" viewBox="0 0 100 100" aria-hidden="true">
    <path d="M18,8 L40,34 L30,56 L52,72 L44,94" /><path d="M40,34 L72,26 L88,40" /><path d="M52,72 L78,66 L90,84" />
  </svg>`;
  const GATE_SVG = `<svg class="noren" viewBox="0 0 100 100" aria-hidden="true">
    <rect class="noren-bg" x="6" y="6" width="88" height="88" rx="10"/>
    <g class="fish"><path d="M30,54 Q50,34 70,54 Q50,74 30,54 Z M70,54 L84,44 V64 Z"/><circle cx="42" cy="52" r="3" fill="#1c3f8c"/></g>
    <g class="curtain"><rect x="8" y="6" width="26" height="70" rx="3"/><rect x="37" y="6" width="26" height="70" rx="3"/><rect x="66" y="6" width="26" height="70" rx="3"/></g>
  </svg>`;
  const SHORE_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="14" y="30" width="72" height="40" rx="6" fill="#6f7a80"/><path d="M22,50 H78" stroke="#8f9aa0" stroke-width="3" stroke-dasharray="6 6"/></svg>`;

  // ---------- 面の構築 ----------
  function buildLevel() {
    let spec = levelSpec(state.stage);
    let path = genPath(spec.w, spec.h, spec.k);
    // 万一見つからなければ箱を減らして再挑戦
    for (let k = spec.k - 1; !path && k >= 4; k--) path = genPath(spec.w, spec.h, k);
    const { w, h } = spec;
    state.W = w + 2;
    state.H = h + 2;
    state.grid = Array.from({ length: state.H }, () =>
      Array.from({ length: state.W }, () => ({ type: "water" })));
    for (const [x, y] of path) state.grid[y + 1][x + 1] = { type: "box", cracked: false, broken: false };
    const entry = shoreNext(w, h, path[0]);
    const exit = shoreNext(w, h, path[path.length - 1]);
    state.grid[entry.y][entry.x] = { type: "shore" };
    state.grid[exit.y][exit.x] = { type: "gate" };
    state.entry = entry;
    state.boxes = path.length;
    render();
    resetLevel();
  }

  function render() {
    const board = $("board");
    // 猫以外を作り直す
    [...board.querySelectorAll(".cell")].forEach((el) => el.remove());
    board.style.gridTemplateColumns = `repeat(${state.W}, 1fr)`;
    board.style.aspectRatio = `${state.W} / ${state.H}`;
    const cat = $("cat");
    for (let y = 0; y < state.H; y++) {
      for (let x = 0; x < state.W; x++) {
        const c = state.grid[y][x];
        const el = document.createElement("div");
        el.className = "cell " + c.type;
        el.dataset.x = x;
        el.dataset.y = y;
        if (c.type === "box") el.innerHTML = CRACK_SVG;
        if (c.type === "gate") el.innerHTML = GATE_SVG;
        if (c.type === "shore") el.innerHTML = SHORE_SVG;
        el.addEventListener("click", onCellTap);
        board.insertBefore(el, cat);
        c.el = el;
      }
    }
    cat.style.width = `${100 / state.W}%`;
    cat.style.height = `${100 / state.H}%`;
  }

  // 同じ面をはじめからやり直す（ヒビを消して猫を岸へ戻す）
  function resetLevel() {
    for (const row of state.grid) for (const c of row) {
      if (c.type === "box") { c.cracked = false; c.broken = false; c.el.classList.remove("cracked", "broken", "splash"); }
      if (c.type === "gate") c.el.classList.remove("open");
    }
    state.remaining = state.boxes;
    state.moves = 0;
    state.gateOpen = false;
    state.busy = false;
    const cat = $("cat");
    cat.classList.remove("fall", "happy");
    placeCat(state.entry.x, state.entry.y, true);
    $("stage-value").textContent = String(state.stage);
    $("remain-value").textContent = String(state.remaining);
    $("moves-value").textContent = "0";
    $("overlay").classList.add("hidden");
  }

  function placeCat(x, y, instant) {
    state.cat.x = x;
    state.cat.y = y;
    const cat = $("cat");
    if (instant) cat.classList.add("instant");
    cat.style.left = `${(x / state.W) * 100}%`;
    cat.style.top = `${(y / state.H) * 100}%`;
    if (instant) {
      void cat.offsetWidth; // 位置を確定させてからアニメーションを戻す
      cat.classList.remove("instant");
    }
  }

  // ---------- 移動 ----------
  function tryMove(dx, dy) {
    if (state.phase !== "play" || state.busy) return;
    const nx = state.cat.x + dx, ny = state.cat.y + dy;
    if (nx < 0 || ny < 0 || nx >= state.W || ny >= state.H) return;
    const cell = state.grid[ny][nx];
    if (cell.type === "water") { bump(dx, dy); return; }
    if (cell.type === "gate" && !state.gateOpen) { bump(dx, dy); cell.el.classList.add("shake"); setTimeout(() => cell.el.classList.remove("shake"), 400); return; }

    state.moves++;
    $("moves-value").textContent = String(state.moves);
    placeCat(nx, ny, false);

    if (cell.type === "gate") { win(); return; }
    if (cell.type === "shore") { checkDeadEnd(); return; }

    if (cell.cracked) { fall(cell); return; }
    cell.cracked = true;
    cell.el.classList.add("cracked");
    state.remaining--;
    $("remain-value").textContent = String(state.remaining);
    if (state.remaining === 0) {
      state.gateOpen = true;
      for (const row of state.grid) for (const c of row) if (c.type === "gate") c.el.classList.add("open");
    }
    checkDeadEnd();
  }

  function bump(dx, dy) {
    const cat = $("cat");
    cat.style.setProperty("--bx", `${dx * 18}%`);
    cat.style.setProperty("--by", `${dy * 18}%`);
    cat.classList.remove("bump");
    void cat.offsetWidth;
    cat.classList.add("bump");
  }

  function canStep(x, y) {
    if (x < 0 || y < 0 || x >= state.W || y >= state.H) return false;
    const c = state.grid[y][x];
    if (c.type === "box") return !c.cracked;
    if (c.type === "gate") return state.gateOpen;
    return false; // 岸へ戻れても解決にはならないので数えない
  }

  function checkDeadEnd() {
    const { x, y } = state.cat;
    if (DIRS.some(([dx, dy]) => canStep(x + dx, y + dy))) return;
    state.busy = true;
    setTimeout(() => showOverlay("💦", "行き止まり…", `残りの箱 ${state.remaining}。踏む順番を変えてみよう。`, "もう一度", resetLevel), 450);
  }

  function fall(cell) {
    state.busy = true;
    setTimeout(() => {
      cell.broken = true;
      cell.el.classList.add("broken", "splash");
      $("cat").classList.add("fall");
    }, 170);
    setTimeout(() => showOverlay("🌊", "落ちた！", "ヒビの入った箱を、もう一度踏んでしまった。", "もう一度", resetLevel), 1000);
  }

  function win() {
    state.busy = true;
    $("cat").classList.add("happy");
    const next = state.stage + 1;
    saveProgress(next);
    setTimeout(() => showOverlay("🐟", "ごちそう！", `第${state.stage}面クリア ・ ${state.moves}手`, "次の面へ", () => { state.stage = next; buildLevel(); }), 800);
  }

  // ---------- オーバーレイ ----------
  let overlayAction = null;
  function showOverlay(emoji, title, sub, btn, action) {
    $("ov-emoji").textContent = emoji;
    $("ov-title").textContent = title;
    $("ov-sub").textContent = sub;
    $("btn-ov").textContent = btn;
    overlayAction = action;
    $("overlay").classList.remove("hidden");
  }

  // ---------- 進捗 ----------
  function loadProgress() {
    try { return Math.max(1, Number(localStorage.getItem(PROGRESS_KEY)) || 1); } catch (e) { return 1; }
  }
  function saveProgress(stage) {
    try { if (stage > loadProgress()) localStorage.setItem(PROGRESS_KEY, String(stage)); } catch (e) { /* 保存できなくても遊べる */ }
  }

  // ---------- 入力 ----------
  function onCellTap(e) {
    const x = Number(e.currentTarget.dataset.x), y = Number(e.currentTarget.dataset.y);
    const dx = x - state.cat.x, dy = y - state.cat.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;
    tryMove(dx, dy);
  }

  let touchStart = null;
  function onTouchStart(e) { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
  function onTouchEnd(e) {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.hypot(dx, dy) < 24) return; // タップは onCellTap に任せる
    e.preventDefault();
    if (Math.abs(dx) > Math.abs(dy)) tryMove(Math.sign(dx), 0);
    else tryMove(0, Math.sign(dy));
  }

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (state.phase !== "play") return;
    if (!$("overlay").classList.contains("hidden")) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("btn-ov").click(); }
      return;
    }
    const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    const m = map[e.key];
    if (m) { e.preventDefault(); tryMove(m[0], m[1]); }
    else if (e.key === "r" || e.key === "R") resetLevel();
  });

  function showScreen(name) {
    $("screen-start").classList.toggle("hidden", name !== "start");
    $("screen-play").classList.toggle("hidden", name !== "play");
    state.phase = name;
    window.scrollTo(0, 0);
  }

  function renderStart() {
    const p = loadProgress();
    $("btn-continue").classList.toggle("hidden", p <= 1);
    $("continue-stage").textContent = String(p);
  }

  // ---------- 初期化 ----------
  function init() {
    renderStart();
    $("btn-start").addEventListener("click", () => { state.stage = 1; showScreen("play"); buildLevel(); });
    $("btn-continue").addEventListener("click", () => { state.stage = loadProgress(); showScreen("play"); buildLevel(); });
    $("btn-ov").addEventListener("click", () => { if (overlayAction) overlayAction(); });
    $("btn-retry").addEventListener("click", resetLevel);
    $("btn-home").addEventListener("click", () => { renderStart(); showScreen("start"); });
    for (const b of document.querySelectorAll(".dpad-btn")) {
      b.addEventListener("click", () => tryMove(Number(b.dataset.dx), Number(b.dataset.dy)));
    }
    const board = $("board");
    board.addEventListener("touchstart", onTouchStart, { passive: true });
    board.addEventListener("touchend", onTouchEnd);
    showScreen("start");
  }
  init();
})();
