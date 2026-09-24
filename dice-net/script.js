/* ===================================================
   サイコロ展開図 - ゲームロジック
   立方体の展開図（11種類）はヘキソミノを列挙して「立方体に折れるか」で
   選別する。折りたたみは各マスに法線ベクトルを割り当てて求める。
   出題は「反対側の面は？」と「組み立てるとどれ？」の2種類。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const BEST_KEY = "dice-net-best";
  const TOTAL = 10;

  // 面：色と記号（記号は回転しても同じ形になるものだけ）
  const FACES = [
    { id: "circle", color: "#e5484d", name: "赤の丸" },
    { id: "square", color: "#3b82f6", name: "青の四角" },
    { id: "diamond", color: "#22a06b", name: "緑のひし形" },
    { id: "plus", color: "#f5b301", name: "黄の十字" },
    { id: "ring", color: "#8b5cf6", name: "紫の輪" },
    { id: "cross", color: "#f97316", name: "橙のバツ" },
  ];

  // ---------- ベクトル ----------
  const vkey = (v) => v.join(",");
  const neg = (v) => v.map((x) => -x);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // ---------- 展開図の折りたたみ ----------
  // 根のマスを底面（法線 -Z）に置き、隣へ移るたびに枠（法線 N・東 E・北 T）を回す
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function fold(cells) {
    const idx = new Map(cells.map((c, i) => [c.join(","), i]));
    const frames = new Array(cells.length).fill(null);
    frames[0] = { N: [0, 0, -1], E: [1, 0, 0], T: [0, 1, 0] };
    const queue = [0];
    while (queue.length) {
      const i = queue.shift();
      const [x, y] = cells[i];
      const f = frames[i];
      for (const [dx, dy] of DIRS) {
        const j = idx.get(`${x + dx},${y + dy}`);
        if (j === undefined || frames[j]) continue;
        let g;
        if (dx === 1) g = { N: f.E, E: neg(f.N), T: f.T };
        else if (dx === -1) g = { N: neg(f.E), E: f.N, T: f.T };
        else if (dy === 1) g = { N: f.T, T: neg(f.N), E: f.E };
        else g = { N: neg(f.T), T: f.N, E: f.E };
        frames[j] = g;
        queue.push(j);
      }
    }
    return frames.map((f) => f.N);
  }
  function foldsToCube(cells) {
    const normals = fold(cells);
    return new Set(normals.map(vkey)).size === 6;
  }

  // ---------- 11種類の展開図を列挙 ----------
  const TRANSFORMS = [
    ([x, y]) => [x, y], ([x, y]) => [-y, x], ([x, y]) => [-x, -y], ([x, y]) => [y, -x],
    ([x, y]) => [-x, y], ([x, y]) => [x, -y], ([x, y]) => [y, x], ([x, y]) => [-y, -x],
  ];
  function normalize(cells) {
    const minx = Math.min(...cells.map((c) => c[0])), miny = Math.min(...cells.map((c) => c[1]));
    return cells.map(([x, y]) => [x - minx, y - miny]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }
  const shapeKey = (cells) => normalize(cells).map((c) => c.join(",")).join(";");
  function canonical(cells) {
    let best = null;
    for (const t of TRANSFORMS) {
      const k = shapeKey(cells.map(t));
      if (best === null || k < best) best = k;
    }
    return best;
  }
  function enumerateNets() {
    let current = [[[0, 0]]];
    for (let n = 1; n < 6; n++) {
      const next = new Map();
      for (const cells of current) {
        for (const [x, y] of cells) {
          for (const [dx, dy] of DIRS) {
            const nx = x + dx, ny = y + dy;
            if (cells.some((c) => c[0] === nx && c[1] === ny)) continue;
            const grown = normalize([...cells, [nx, ny]]);
            const k = canonical(grown);
            if (!next.has(k)) next.set(k, grown);
          }
        }
      }
      current = [...next.values()];
    }
    return current.filter(foldsToCube);
  }
  const NETS = enumerateNets(); // 11 個
  // いちばん基本の十字型（横一列4マスの2つ目に上下1マスずつ）を最初の問題に使う
  const CROSS = normalize([[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]]);

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ---------- 描画 ----------
  function symbolSVG(id, size) {
    const s = size;
    switch (id) {
      case "circle": return `<circle r="${s * 0.42}" fill="#fff"/>`;
      case "square": return `<rect x="${-s * 0.36}" y="${-s * 0.36}" width="${s * 0.72}" height="${s * 0.72}" rx="${s * 0.06}" fill="#fff"/>`;
      case "diamond": return `<rect x="${-s * 0.34}" y="${-s * 0.34}" width="${s * 0.68}" height="${s * 0.68}" rx="${s * 0.05}" fill="#fff" transform="rotate(45)"/>`;
      case "plus": return `<rect x="${-s * 0.12}" y="${-s * 0.42}" width="${s * 0.24}" height="${s * 0.84}" rx="${s * 0.05}" fill="#fff"/><rect x="${-s * 0.42}" y="${-s * 0.12}" width="${s * 0.84}" height="${s * 0.24}" rx="${s * 0.05}" fill="#fff"/>`;
      case "ring": return `<circle r="${s * 0.34}" fill="none" stroke="#fff" stroke-width="${s * 0.16}"/>`;
      case "cross": return `<g transform="rotate(45)"><rect x="${-s * 0.11}" y="${-s * 0.42}" width="${s * 0.22}" height="${s * 0.84}" rx="${s * 0.05}" fill="#fff"/><rect x="${-s * 0.42}" y="${-s * 0.11}" width="${s * 0.84}" height="${s * 0.22}" rx="${s * 0.05}" fill="#fff"/></g>`;
    }
    return "";
  }

  // 展開図：cells とマスごとの面番号
  function netSVG(cells, faceOf, highlight) {
    const w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
    const C = 100;
    let s = "";
    cells.forEach(([x, y], i) => {
      const f = FACES[faceOf[i]];
      const hl = highlight === i;
      s += `<g transform="translate(${x * C},${(h - 1 - y) * C})">
        <rect x="4" y="4" width="${C - 8}" height="${C - 8}" rx="10" fill="${f.color}" stroke="${hl ? "#1f2d3d" : "#ffffff"}" stroke-width="${hl ? 8 : 4}"/>
        <g transform="translate(${C / 2},${C / 2})">${symbolSVG(f.id, 56)}</g>
      </g>`;
    });
    return `<svg viewBox="0 0 ${w * C} ${h * C}" style="max-height:${Math.min(300, h * 62)}px" aria-hidden="true">${s}</svg>`;
  }

  // 立方体の見取り図：上・左（手前）・右の3面
  function cubeSVG(top, left, right) {
    const shade = (hex, k) => {
      const n = parseInt(hex.slice(1), 16);
      const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
      return `rgb(${r},${g},${b})`;
    };
    const T = FACES[top], L = FACES[left], R = FACES[right];
    return `<svg viewBox="0 0 100 118" aria-hidden="true">
      <polygon points="50,2 98,29 50,56 2,29" fill="${T.color}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
      <polygon points="2,29 50,56 50,114 2,87" fill="${shade(L.color, 0.78)}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
      <polygon points="50,56 98,29 98,87 50,114" fill="${shade(R.color, 0.62)}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
      <g transform="translate(50,29) matrix(0.866,0.5,-0.866,0.5,0,0)">${symbolSVG(T.id, 30)}</g>
      <g transform="translate(26,72) matrix(0.866,0.5,0,1,0,0)">${symbolSVG(L.id, 30)}</g>
      <g transform="translate(74,72) matrix(0.866,-0.5,0,1,0,0)">${symbolSVG(R.id, 30)}</g>
    </svg>`;
  }

  // ---------- 出題 ----------
  function makeQuestion(q) {
    let cells = q <= 2 ? CROSS : pick(NETS);
    if (q >= 3) cells = normalize(cells.map(pick(TRANSFORMS)));
    const faceOf = shuffle([0, 1, 2, 3, 4, 5]);          // マス i → 面番号
    const normals = fold(cells);
    const faceByNormal = {};
    normals.forEach((n, i) => { faceByNormal[vkey(n)] = faceOf[i]; });

    const mode = q <= 3 ? "opp" : q <= 6 ? pick(["opp", "build"]) : "build";
    if (mode === "opp") {
      const i = Math.floor(Math.random() * 6);
      const face = faceOf[i];
      const answer = faceByNormal[vkey(neg(normals[i]))];
      const others = shuffle([0, 1, 2, 3, 4, 5].filter((f) => f !== face && f !== answer)).slice(0, 3);
      return {
        mode, cells, faceOf, highlight: i,
        text: `「${FACES[face].name}」の反対側の面は？`,
        answer, choices: shuffle([answer, ...others]),
        explain: `「${FACES[face].name}」の向かいは「${FACES[answer].name}」`,
      };
    }
    // build：上・手前・右の3面が見える見取り図。右 = 上 × 手前 で右手系になる
    const dirs = Object.keys(faceByNormal).map((k) => k.split(",").map(Number));
    const top = pick(dirs);
    const front = pick(dirs.filter((d) => dot(d, top) === 0));
    const right = cross(top, front);
    const F = (v) => faceByNormal[vkey(v)];
    const correct = [F(top), F(front), F(right)];
    const cands = [
      correct,
      [F(top), F(right), F(front)],          // 鏡写し
      [F(top), F(front), F(neg(front))],     // 向かい合う面が同時に見える
      [F(top), F(neg(top)), F(right)],       // 同上
    ];
    const seen = new Set();
    const choices = [];
    for (const c of cands) { const k = c.join(","); if (!seen.has(k)) { seen.add(k); choices.push(c); } }
    return {
      mode, cells, faceOf, highlight: -1,
      text: "組み立てると、どれ？",
      answer: correct, choices: shuffle(choices),
      explain: "鏡写しや、向かい合う面が同時に見えるものはニセモノ",
    };
  }

  // ---------- 状態と進行 ----------
  const state = { phase: "start", q: 0, score: 0, startAt: 0, raf: 0, question: null, answered: false };

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
    state.answered = false;
    const qu = makeQuestion(state.q);
    state.question = qu;
    $("q-value").textContent = String(state.q);
    $("net").innerHTML = netSVG(qu.cells, qu.faceOf, qu.highlight);
    $("q-text").textContent = qu.text;
    $("feedback").textContent = "";
    $("feedback").className = "feedback";
    const box = $("choices");
    box.innerHTML = "";
    box.className = "choices " + qu.mode;
    qu.choices.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "choice";
      if (qu.mode === "opp") {
        const f = FACES[c];
        b.innerHTML = `<span class="choice-key">${i + 1}</span><svg viewBox="0 0 100 100" aria-hidden="true"><rect x="6" y="6" width="88" height="88" rx="12" fill="${f.color}"/><g transform="translate(50,50)">${symbolSVG(f.id, 52)}</g></svg><span class="choice-name">${f.name}</span>`;
      } else {
        b.innerHTML = `<span class="choice-key">${i + 1}</span>${cubeSVG(c[0], c[1], c[2])}`;
      }
      b.addEventListener("click", () => answer(i));
      box.appendChild(b);
    });
    window.scrollTo(0, 0);
  }

  function answer(i) {
    if (state.phase !== "play" || state.answered) return;
    state.answered = true;
    const qu = state.question;
    const isSame = (a, b) => (Array.isArray(a) ? a.join(",") === b.join(",") : a === b);
    const ok = isSame(qu.choices[i], qu.answer);
    const btns = [...document.querySelectorAll(".choice")];
    btns.forEach((b, k) => {
      if (isSame(qu.choices[k], qu.answer)) b.classList.add("correct");
      else if (k === i) b.classList.add("wrong");
      b.disabled = true;
    });
    const fb = $("feedback");
    if (ok) { state.score++; $("score-value").textContent = String(state.score); fb.textContent = "正解！"; fb.className = "feedback ok"; }
    else { fb.textContent = "ざんねん… " + qu.explain; fb.className = "feedback ng"; }
    setTimeout(() => {
      if (state.q >= TOTAL) finish();
      else nextQuestion();
    }, ok ? 900 : 1800);
  }

  // ---------- 結果 ----------
  function rankFor(score) {
    if (score === 10) return ["立体視の達人", "頭の中に工作用紙が入っている。"];
    if (score >= 8) return ["空間把握◎", "鏡写しにも引っかからない。"];
    if (score >= 6) return ["なかなかの目", "あと少しで達人。反対側の面から固めよう。"];
    if (score >= 4) return ["練習中", "十字型の展開図から慣れていこう。"];
    return ["展開図ビギナー", "実際に紙で折ってみると一気に分かる。"];
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
    $("result-best").innerHTML = isNew
      ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！'
      : `自己ベスト ${best} / 10`;
    $("result-comment").textContent = comment;
    const url = `${location.origin}${location.pathname}`;
    const text = `サイコロ展開図 🎲 ${state.score}/10 正解【${rank}】${secs}秒\n展開図から立方体を組み立てる空間パズル #Ludom`;
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
    if (state.phase === "play" && /^[1-4]$/.test(e.key)) answer(Number(e.key) - 1);
  });

  // ---------- 初期化 ----------
  function init() {
    // スタート画面：十字の展開図と、組み立てた立方体
    const faceOf = [0, 1, 2, 3, 4, 5];
    $("start-art").innerHTML = `<div class="art-net">${netSVG(CROSS, faceOf, -1)}</div><div class="art-arrow">→</div><div class="art-cube">${(() => {
      const normals = fold(CROSS); const by = {}; normals.forEach((n, i) => { by[vkey(n)] = faceOf[i]; });
      const top = [0, 0, 1], front = [0, -1, 0], right = cross(top, front);
      return cubeSVG(by[vkey(top)], by[vkey(front)], by[vkey(right)]);
    })()}</div>`;
    const best = loadBest();
    if (best > 0) { $("start-best").classList.remove("hidden"); $("start-best-value").textContent = String(best); }
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    showScreen("start");
  }
  init();
})();
