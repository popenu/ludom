/* ===================================================
   線路つなぎ - ゲームロジック
   盤面はランダムな全域木（ループなし・全マスひとつながり）として生成し、
   各タイルをランダムに回転させて出題する。タップで右回転。
   車庫から線路をたどって全タイルに到達できれば開通。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const BEST_KEY = "rail-link-best"; // { "4": ms, "5": ms, ... } サイズ別ベストタイム

  // 接続方向はビットで持つ（上=1 右=2 下=4 左=8）
  const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;
  const DIRS = [
    { bit: UP, dx: 0, dy: -1, opp: DOWN, end: [50, 0] },
    { bit: RIGHT, dx: 1, dy: 0, opp: LEFT, end: [100, 50] },
    { bit: DOWN, dx: 0, dy: 1, opp: UP, end: [50, 100] },
    { bit: LEFT, dx: -1, dy: 0, opp: RIGHT, end: [0, 50] },
  ];
  // 右に90°回すと 上→右→下→左 と移る
  function rotateMask(m, times) {
    times = ((times % 4) + 4) % 4;
    for (let i = 0; i < times; i++) m = ((m << 1) & 15) | (m >> 3);
    return m;
  }
  const popcount = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

  // ---------- 状態 ----------
  const state = {
    phase: "start",   // start | play
    stage: 1,
    n: 4,
    tiles: [],        // { shape, rot, mask, angle, el, svg }
    src: 0,
    moves: 0,
    startAt: 0,
    raf: 0,
    solved: false,
  };

  function sizeFor(stage) {
    return Math.min(8, 4 + Math.floor((stage - 1) / 2));
  }

  // ---------- 盤面生成：ランダム全域木 ----------
  function generate(n) {
    const conn = new Uint8Array(n * n);
    const inTree = new Uint8Array(n * n);
    const src = Math.floor(n / 2) * n + Math.floor(n / 2);
    inTree[src] = 1;
    const frontier = [];
    const pushFrontier = (c) => {
      const x = c % n, y = (c - x) / n;
      for (const d of DIRS) {
        const nx = x + d.dx, ny = y + d.dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const nb = ny * n + nx;
        if (!inTree[nb]) frontier.push({ from: c, to: nb, d });
      }
    };
    pushFrontier(src);
    while (frontier.length) {
      const i = Math.floor(Math.random() * frontier.length);
      const e = frontier[i];
      frontier[i] = frontier[frontier.length - 1];
      frontier.pop();
      if (inTree[e.to]) continue;
      inTree[e.to] = 1;
      conn[e.from] |= e.d.bit;
      conn[e.to] |= e.d.opp;
      pushFrontier(e.to);
    }
    return { conn, src };
  }

  // ---------- 接続判定：車庫から幅優先 ----------
  function connectivity() {
    const n = state.n;
    const depth = new Int16Array(n * n).fill(-1);
    const queue = [state.src];
    depth[state.src] = 0;
    let count = 1;
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi];
      const x = c % n, y = (c - x) / n;
      const m = state.tiles[c].mask;
      for (const d of DIRS) {
        if (!(m & d.bit)) continue;
        const nx = x + d.dx, ny = y + d.dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const nb = ny * n + nx;
        if (depth[nb] >= 0) continue;
        if (!(state.tiles[nb].mask & d.opp)) continue;
        depth[nb] = depth[c] + 1;
        count++;
        queue.push(nb);
      }
    }
    return { depth, count };
  }

  // ---------- 描画 ----------
  function tileSVG(shape, isSrc) {
    let base = "", dash = "";
    for (const d of DIRS) {
      if (!(shape & d.bit)) continue;
      base += `<line class="rail-base" x1="50" y1="50" x2="${d.end[0]}" y2="${d.end[1]}"/>`;
      dash += `<line class="rail-dash" x1="50" y1="50" x2="${d.end[0]}" y2="${d.end[1]}"/>`;
    }
    let center = "";
    if (isSrc) {
      center = `<circle class="depot" cx="50" cy="50" r="21"/><circle class="depot-in" cx="50" cy="50" r="8"/>`;
    } else if (popcount(shape) === 1) {
      center = `<circle class="station" cx="50" cy="50" r="16"/>`;
    }
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${base}${dash}${center}</svg>`;
  }

  function buildBoard() {
    const board = $("board");
    board.innerHTML = "";
    board.style.gridTemplateColumns = `repeat(${state.n}, 1fr)`;
    board.dataset.size = state.n;
    state.tiles.forEach((t, i) => {
      const b = document.createElement("button");
      b.className = "tile";
      b.setAttribute("aria-label", i === state.src ? "車庫" : popcount(t.shape) === 1 ? "駅" : "線路");
      b.innerHTML = tileSVG(t.shape, i === state.src);
      b.addEventListener("click", () => rotate(i, 1));
      b.addEventListener("contextmenu", (e) => { e.preventDefault(); rotate(i, -1); });
      board.appendChild(b);
      t.el = b;
      t.svg = b.firstElementChild;
      t.svg.style.transform = `rotate(${t.angle}deg)`;
    });
  }

  function updateConnections() {
    const { depth, count } = connectivity();
    state.tiles.forEach((t, i) => t.el.classList.toggle("on", depth[i] >= 0));
    return { depth, count };
  }

  // ---------- 進行 ----------
  function newStage(regenerate) {
    const n = sizeFor(state.stage);
    state.n = n;
    const { conn, src } = generate(n);
    state.src = src;
    state.tiles = Array.from(conn, (shape) => {
      const rot = Math.floor(Math.random() * 4);
      return { shape, rot, mask: rotateMask(shape, rot), angle: rot * 90 };
    });
    // 最初から開通している盤面は出さない：向きに意味のあるタイルを1つ回す
    if (connectivity().count === n * n) {
      const idx = state.tiles.findIndex((t) => t.shape !== 15 && t.shape !== 5 && t.shape !== 10);
      const t = state.tiles[idx >= 0 ? idx : 0];
      t.rot = (t.rot + 1) % 4; t.mask = rotateMask(t.shape, t.rot); t.angle += 90;
    }
    state.moves = 0;
    state.solved = false;
    $("stage-value").textContent = String(state.stage);
    $("size-value").textContent = `${n}×${n}`;
    $("moves-value").textContent = "0";
    $("clear").classList.add("hidden");
    $("board").classList.remove("solved");
    buildBoard();
    updateConnections();
    state.startAt = performance.now();
    cancelAnimationFrame(state.raf);
    tick();
    if (!regenerate) window.scrollTo(0, 0);
  }

  function tick() {
    if (state.phase !== "play" || state.solved) return;
    $("time-value").textContent = ((performance.now() - state.startAt) / 1000).toFixed(1);
    state.raf = requestAnimationFrame(tick);
  }

  function rotate(i, delta) {
    if (state.phase !== "play" || state.solved) return;
    const t = state.tiles[i];
    t.rot = (t.rot + delta + 4) % 4;
    t.mask = rotateMask(t.shape, t.rot);
    t.angle += delta * 90;
    t.svg.style.transform = `rotate(${t.angle}deg)`;
    state.moves++;
    $("moves-value").textContent = String(state.moves);
    const { depth, count } = updateConnections();
    if (count === state.n * state.n) onSolved(depth);
  }

  function onSolved(depth) {
    state.solved = true;
    cancelAnimationFrame(state.raf);
    const ms = performance.now() - state.startAt;
    $("time-value").textContent = (ms / 1000).toFixed(1);
    // 車庫から遠い順に灯りがともる
    let maxDepth = 0;
    state.tiles.forEach((t, i) => {
      t.el.style.setProperty("--delay", `${depth[i] * 45}ms`);
      if (depth[i] > maxDepth) maxDepth = depth[i];
    });
    $("board").classList.add("solved");

    const best = loadBest();
    const key = String(state.n);
    const isNew = !best[key] || ms < best[key];
    if (isNew) { best[key] = Math.round(ms); saveBest(best); }
    $("clear-time").textContent = (ms / 1000).toFixed(1) + "秒";
    $("clear-moves").textContent = state.moves + "手";
    $("clear-best").innerHTML = isNew
      ? `<span class="badge-new">NEW RECORD</span> ${state.n}×${state.n} の自己ベスト更新！`
      : `${state.n}×${state.n} の自己ベスト ${(best[key] / 1000).toFixed(1)}秒`;
    setTimeout(() => $("clear").classList.remove("hidden"), maxDepth * 45 + 500);
  }

  // ---------- 自己ベスト ----------
  function loadBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveBest(best) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) { /* 保存できなくても遊べる */ }
  }
  function renderStartBest() {
    const best = loadBest();
    const sizes = Object.keys(best).map(Number).sort((a, b) => a - b);
    $("start-best").classList.toggle("hidden", sizes.length === 0);
    $("start-best-list").innerHTML = sizes
      .map((n) => `<span class="best-chip">${n}×${n} <b>${(best[n] / 1000).toFixed(1)}</b>秒</span>`)
      .join("");
  }

  function showScreen(name) {
    $("screen-start").classList.toggle("hidden", name !== "start");
    $("screen-play").classList.toggle("hidden", name !== "play");
    state.phase = name;
  }

  // ---------- 初期化 ----------
  function init() {
    renderStartBest();
    $("btn-start").addEventListener("click", () => { state.stage = 1; showScreen("play"); newStage(false); });
    $("btn-next").addEventListener("click", () => { state.stage++; newStage(false); });
    $("btn-regen").addEventListener("click", () => newStage(true));
    $("btn-home").addEventListener("click", () => { cancelAnimationFrame(state.raf); renderStartBest(); showScreen("start"); });
    showScreen("start");
  }
  init();
})();
