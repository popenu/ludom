/* ===================================================
   消えるまるばつ - ゲームロジック
   まるもばつも盤に置けるのは3つまで。4つ目を置くと、その人の
   いちばん古い印が消える。3つ並んだら勝ち。60手で引き分け。
   CPU は negamax（αβ枝刈り）で読む。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const BEST_KEY = "kieru-marubatsu-best-streak-v2";
  const MAX = 3;           // 1人が置ける数
  const MOVE_LIMIT = 60;   // これを超えたら引き分け
  const CPU_DELAY = 520;
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const CPU_DEPTH = 4;     // CPU が読む手数

  const state = {
    mode: "cpu",          // cpu | pvp
    humanSide: "o",       // CPU 戦であなたが持つ印（○が先攻）
    q: { o: [], x: [] },  // 置いた順の印 { cell, id, rot }
    turn: "o",
    moves: 0,
    over: false,
    busy: false,
    nextId: 1,
    score: { o: 0, x: 0 },
    streak: 0,            // CPU への連勝数
    fresh: null,          // 今置いた印の id（書き込みアニメ用）
    gone: null,           // 今消えた印（消えるアニメ用）
    winLine: null,
    timer: 0,
  };

  // ---------- 盤面の判定 ----------
  const other = (s) => (s === "o" ? "x" : "o");
  const cellsOf = (side) => state.q[side].map((p) => p.cell);
  const isWin = (cells) => cells.length === MAX && LINES.find((l) => l.every((c) => cells.includes(c))) || null;
  const empties = (a, b) => [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((c) => !a.includes(c) && !b.includes(c));
  // 印を置いたあとの並び（4つ目なら先頭が消える）
  const placed = (cells, c) => (cells.length >= MAX ? cells.slice(1) : cells.slice()).concat(c);

  // ---------- CPU ----------
  // 手番側 me から見た静的評価。次に消える印（3つ持っているときの先頭）は数えない
  function heuristic(me, op) {
    const live = (cells) => (cells.length === MAX ? cells.slice(1) : cells);
    const lm = live(me), lo = live(op);
    let s = 0;
    for (const l of LINES) {
      const a = l.filter((c) => lm.includes(c)).length;
      const b = l.filter((c) => lo.includes(c)).length;
      const free = l.filter((c) => !me.includes(c) && !op.includes(c)).length;
      if (a === 2 && free === 1) s += 10;
      if (b === 2 && free === 1) s -= 10;
    }
    if (me.includes(4)) s += 2;
    if (op.includes(4)) s -= 2;
    return s;
  }

  function negamax(me, op, depth, alpha, beta, ply) {
    let best = -Infinity;
    for (const c of empties(me, op)) {
      const nm = placed(me, c);
      let v;
      if (isWin(nm)) v = 1000 - ply;
      else if (depth <= 1) v = -heuristic(op, nm);
      else v = -negamax(op, nm, depth - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function bestMoves(me, op, depth) {
    let best = -Infinity, list = [];
    for (const c of empties(me, op)) {
      const nm = placed(me, c);
      const v = isWin(nm) ? 1000 : depth <= 1 ? -heuristic(op, nm) : -negamax(op, nm, depth - 1, -Infinity, Infinity, 1);
      if (v > best) { best = v; list = [c]; }
      else if (v === best) list.push(c);
    }
    return list;
  }

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function cpuChoose(side) {
    const me = cellsOf(side), op = cellsOf(other(side));
    return pick(bestMoves(me, op, CPU_DEPTH));
  }

  // ---------- 進行 ----------
  function newGame() {
    clearTimeout(state.timer);
    state.q = { o: [], x: [] };
    state.turn = "o";
    state.moves = 0;
    state.over = false;
    state.busy = false;
    state.fresh = null;
    state.gone = null;
    state.winLine = null;
    $("result").classList.add("hidden");
    render();
    maybeCpu();
  }

  function startMatch(mode) {
    state.mode = mode;
    state.score = { o: 0, x: 0 };
    if (mode === "cpu") {
      $("name-o").textContent = state.humanSide === "o" ? "あなた" : "CPU";
      $("name-x").textContent = state.humanSide === "x" ? "あなた" : "CPU";
    } else {
      $("name-o").textContent = "まる";
      $("name-x").textContent = "ばつ";
    }
    showScreen("play");
    newGame();
  }

  const isCpuTurn = () => state.mode === "cpu" && state.turn !== state.humanSide;

  function maybeCpu() {
    if (state.over || !isCpuTurn()) return;
    state.busy = true;
    state.timer = setTimeout(() => {
      state.busy = false;
      place(state.turn, cpuChoose(state.turn));
    }, CPU_DELAY);
  }

  function onCell(cell) {
    if (state.over || state.busy || isCpuTurn()) return;
    if (cellsOf("o").includes(cell) || cellsOf("x").includes(cell)) return;
    place(state.turn, cell);
  }

  function place(side, cell) {
    const q = state.q[side];
    const piece = { cell, id: state.nextId++, rot: Math.round((Math.random() - 0.5) * 16) };
    q.push(piece);
    state.gone = q.length > MAX ? { ...q.shift(), side } : null;
    state.fresh = piece.id;
    state.moves++;
    const line = isWin(cellsOf(side));
    if (line) { state.winLine = line; finish(side); return; }
    if (state.moves >= MOVE_LIMIT) { finish(null); return; }
    state.turn = other(side);
    render();
    maybeCpu();
  }

  function finish(winner) {
    state.over = true;
    if (winner) state.score[winner]++;
    render();
    let title, sub, cls = winner || "";
    if (state.mode === "cpu") {
      const human = state.humanSide;
      if (!winner) { title = "引き分け"; sub = `${MOVE_LIMIT}手で決着つかず`; }
      else if (winner === human) { title = "勝ち！"; sub = `${state.moves}手で3つ並べた`; }
      else { title = "負け…"; sub = `CPU が${state.moves}手で並べた`; }
      if (winner === human) {
        state.streak++;
        const best = loadBest();
        if (state.streak > best) { saveBest(state.streak); sub += `\n${state.streak} 連勝（自己ベスト）`; }
        else if (state.streak > 1) sub += `\n${state.streak} 連勝中`;
      } else if (winner) state.streak = 0;
    } else {
      title = winner ? `${winner === "o" ? "まる" : "ばつ"}の勝ち！` : "引き分け";
      sub = winner ? `${state.moves}手で3つ並べた` : `${MOVE_LIMIT}手で決着つかず`;
    }
    $("result-title").textContent = title;
    $("result-title").className = "result-title " + cls;
    $("result-sub").textContent = sub;
    $("result-sub").style.whiteSpace = "pre-line";
    const url = `${location.origin}${location.pathname}`;
    const text = state.mode === "cpu"
      ? `消えるまるばつ ⭕❌ CPUに${title.replace(/[！…]/g, "")}（${state.moves}手）\n置けるのは3つまで、4つ目で1つ目が消える三目並べ\n#Ludom`
      : `消えるまるばつ ⭕❌ ${title.replace(/！/g, "")}（${state.moves}手）\n#Ludom`;
    $("btn-share-x").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    setTimeout(() => { if (state.over) $("result").classList.remove("hidden"); }, winner ? 900 : 400);
  }

  // ---------- 描画 ----------
  const center = (c) => [50 + (c % 3) * 100, 50 + Math.floor(c / 3) * 100];

  function pieceSvg(side, p, cls) {
    const [x, y] = center(p.cell);
    const tr = `transform="rotate(${p.rot} ${x} ${y})"`;
    if (side === "o") return `<g class="piece o ${cls}" ${tr}><circle cx="${x}" cy="${y}" r="29"/></g>`;
    const d = 26;
    return `<g class="piece x ${cls}" ${tr}><path d="M${x - d} ${y - d} L${x + d} ${y + d}"/><path d="M${x + d} ${y - d} L${x - d} ${y + d}"/></g>`;
  }

  function render() {
    // 罫線（少し手書きっぽく揺らす）
    let s = `<path class="grid-line" d="M101 14 Q99 150 101 286"/><path class="grid-line" d="M199 14 Q201 150 199 286"/>` +
      `<path class="grid-line" d="M14 101 Q150 99 286 101"/><path class="grid-line" d="M14 199 Q150 201 286 199"/>`;
    if (state.gone) s += pieceSvg(state.gone.side, state.gone, "vanish");
    for (const side of ["o", "x"]) {
      const q = state.q[side];
      q.forEach((p, i) => {
        // 手番の人が3つ持っているとき、いちばん古い印は次に消える
        const doomed = !state.over && side === state.turn && q.length === MAX && i === 0;
        s += pieceSvg(side, p, (p.id === state.fresh ? "new " : "") + (doomed ? "doomed" : ""));
      });
    }
    if (state.winLine) {
      const [a, , b] = state.winLine;
      const [x1, y1] = center(a), [x2, y2] = center(b);
      const dx = (x2 - x1) * 0.18, dy = (y2 - y1) * 0.18;
      s += `<line class="win-line" x1="${x1 - dx}" y1="${y1 - dy}" x2="${x2 + dx}" y2="${y2 + dy}"/>`;
    }
    const lock = state.over || state.busy || isCpuTurn();
    for (let c = 0; c < 9; c++) {
      const [x, y] = center(c);
      const taken = cellsOf("o").includes(c) || cellsOf("x").includes(c);
      s += `<rect class="cell-hit ${lock || taken ? "disabled" : ""}" data-cell="${c}" x="${x - 50}" y="${y - 50}" width="100" height="100" role="gridcell" aria-label="${c + 1}番のマス"/>`;
    }
    $("board").innerHTML = s;
    state.fresh = null;
    state.gone = null;

    $("moves").textContent = String(state.moves);
    $("score-o").textContent = String(state.score.o);
    $("score-x").textContent = String(state.score.x);
    document.querySelector(".hud-side.o").classList.toggle("active", !state.over && state.turn === "o");
    document.querySelector(".hud-side.x").classList.toggle("active", !state.over && state.turn === "x");
    const msg = $("turn-msg");
    msg.className = "turn-msg " + state.turn;
    if (state.over) msg.textContent = "";
    else if (state.mode === "cpu") msg.textContent = isCpuTurn() ? "CPU が考え中…" : `あなたの番（${state.turn === "o" ? "○" : "×"}）`;
    else msg.textContent = `${state.turn === "o" ? "まる ○" : "ばつ ×"} の番`;
  }

  // ---------- 入力 ----------
  $("board").addEventListener("click", (e) => {
    const t = e.target.closest("[data-cell]");
    if (t) onCell(Number(t.dataset.cell));
  });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // テンキー配置（7 8 9 / 4 5 6 / 1 2 3）で置ける
    const map = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };
    if ($("screen-play").classList.contains("hidden")) return;
    if (e.key in map) onCell(map[e.key]);
    else if ((e.key === "Enter" || e.key === " ") && state.over) { e.preventDefault(); newGame(); }
  });

  function bindSeg(id, onChange) {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      for (const x of $(id).querySelectorAll("button")) x.classList.toggle("on", x === b);
      onChange(b.dataset.v);
    });
  }

  function loadBest() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* 保存できなくても遊べる */ } }

  function showScreen(name) {
    for (const s of ["start", "play"]) $("screen-" + s).classList.toggle("hidden", s !== name);
    if (name === "start") {
      clearTimeout(state.timer);
      const best = loadBest();
      $("start-best").classList.toggle("hidden", best === 0);
      $("start-best-value").textContent = String(best);
    }
    window.scrollTo(0, 0);
  }

  function init() {
    bindSeg("seg-order", (v) => { state.humanSide = v === "first" ? "o" : "x"; });
    $("btn-cpu").addEventListener("click", () => startMatch("cpu"));
    $("btn-pvp").addEventListener("click", () => startMatch("pvp"));
    $("btn-again").addEventListener("click", newGame);
    $("btn-restart").addEventListener("click", newGame);
    $("btn-menu").addEventListener("click", () => showScreen("start"));
    $("btn-menu2").addEventListener("click", () => showScreen("start"));
    showScreen("start");
  }
  init();
})();
