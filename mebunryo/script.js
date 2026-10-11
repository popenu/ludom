/* ===================================================
   目分量 - ゲームロジック
   12種類のお題からランダムに10問。図をタップ／ドラッグして答え、
   正解とのズレを1問100点で採点する。盤面は 300×300 の SVG 座標系。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const BEST_KEY = "mebunryo-best";
  const QUESTIONS = 10;
  const DEG = Math.PI / 180;

  const RANKS = [
    { min: 930, name: "人間定規", comment: "定規いらず。あなたの目には目盛りが刻まれている。" },
    { min: 860, name: "大工の棟梁", comment: "墨付けも水平もお手のもの。現場が任せられる。" },
    { min: 760, name: "職人見習い", comment: "かなり正確。あと数ミリで一人前。" },
    { min: 640, name: "だいたい派", comment: "日常生活には十分。ケーキの切り分けは揉めない程度。" },
    { min: 500, name: "フリーハンド", comment: "勢いがある。味のある線を引くタイプ。" },
    { min: -1, name: "気分で測る", comment: "見た目より心で測る。それもまた一つの物差し。" },
  ];

  // ---------- 小道具 ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const P = (x, y) => ({ x, y });
  const add = (a, b, k = 1) => P(a.x + b.x * k, a.y + b.y * k);
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const sub = (a, b) => P(a.x - b.x, a.y - b.y);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const f1 = (n) => n.toFixed(1);
  // 画面上の角度（反時計回り・度）→ 単位ベクトル（SVG は y 下向き）
  const dir = (deg) => P(Math.cos(deg * DEG), -Math.sin(deg * DEG));
  const perp = (u) => P(-u.y, u.x);
  const angleOf = (c, q) => (Math.atan2(-(q.y - c.y), q.x - c.x) / DEG + 360) % 360;
  // 周期 period の角度差（0〜period/2）
  function angDiff(a, b, period) {
    const d = (((a - b) % period) + period) % period;
    return Math.min(d, period - d);
  }
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  // ズレ err を許容幅 tol で 0〜100 点に換算
  const toScore = (err, tol) => Math.round(100 * clamp(1 - err / tol, 0, 1));

  // ---------- SVG パーツ ----------
  const n2 = (v) => Math.round(v * 10) / 10;
  const line = (a, b, cls) => `<line x1="${n2(a.x)}" y1="${n2(a.y)}" x2="${n2(b.x)}" y2="${n2(b.y)}" class="${cls}"/>`;
  const circle = (c, r, cls) => `<circle cx="${n2(c.x)}" cy="${n2(c.y)}" r="${n2(r)}" class="${cls}"/>`;
  const label = (p, s, cls = "lbl") => `<text x="${n2(p.x)}" y="${n2(p.y)}" class="${cls}">${s}</text>`;
  const poly = (pts, cls) => `<polygon points="${pts.map((p) => `${n2(p.x)},${n2(p.y)}`).join(" ")}" class="${cls}"/>`;
  // 中心 c を通る、方向 u の線（全長 len）
  const lineThrough = (c, u, len, cls) => line(add(c, u, -len / 2), add(c, u, len / 2), cls);
  // 点を示す十字
  function mark(p, kind) {
    const cls = kind === "user" ? "user" : "ans";
    const s = 9;
    return line(P(p.x - s, p.y), P(p.x + s, p.y), cls) + line(P(p.x, p.y - s), P(p.x, p.y + s), cls) +
      circle(p, 2.5, kind === "user" ? "user-dot" : "ans-dot");
  }
  // 線分上の目盛り（線分に垂直な短い線）
  const tick = (p, u, len, cls) => lineThrough(p, perp(u), len, cls);

  // ---------- お題 ----------
  // make(): 問題パラメータ / input(p, q): 盤面座標 q から回答値 / draw(p, v, reveal): SVG
  // judge(p, v): { err（表示用文字列）, score }
  function segmentTask(id, name, fractions) {
    return {
      id, name,
      make() {
        const c = P(150 + rand(-25, 25), 150 + rand(-45, 45));
        const L = rand(170, 230);
        const u = dir(rand(-35, 35));
        const fr = pick(fractions);
        return { a: add(c, u, -L / 2), u, L, fr };
      },
      prompt(p) {
        return p.fr.d === 2
          ? "線のちょうど<b>真ん中</b>をタップ"
          : `<b>0</b> の端から <b>${p.fr.n}/${p.fr.d}</b> の位置をタップ`;
      },
      input(p, q) { return clamp(dot(sub(q, p.a), p.u) / p.L, 0, 1); },
      draw(p, v, reveal) {
        const b = add(p.a, p.u, p.L);
        let s = line(p.a, b, "ink") + tick(p.a, p.u, 18, "ink") + tick(b, p.u, 18, "ink");
        if (p.fr.d !== 2) {
          const off = perp(p.u);
          s += label(add(p.a, off, -22), "0") + label(add(b, off, -22), "1");
        }
        if (reveal) s += tick(add(p.a, p.u, p.L * p.fr.n / p.fr.d), p.u, 40, "ans");
        if (v !== null) s += tick(add(p.a, p.u, p.L * v), p.u, 34, "user");
        return s;
      },
      judge(p, v) {
        const err = Math.abs(v - p.fr.n / p.fr.d) * 100;
        return { err: `ズレ ${f1(err)}%`, score: toScore(err, fractions[0].d === 2 ? 10 : 12) };
      },
    };
  }

  // 回転する線（角度系のお題の共通部品）。v は反時計回りの角度（度）
  const TASKS = [
    segmentTask("mid", "まんなか", [{ n: 1, d: 2 }]),
    segmentTask("frac", "分数の位置", [{ n: 1, d: 3 }, { n: 2, d: 3 }, { n: 1, d: 4 }, { n: 3, d: 4 }, { n: 1, d: 5 }, { n: 2, d: 5 }, { n: 3, d: 5 }]),

    {
      id: "center", name: "円の中心",
      make() { return { c: P(rand(125, 175), rand(125, 175)), r: rand(65, 110) }; },
      prompt() { return "円の<b>中心</b>をタップ"; },
      input(p, q) { return q; },
      draw(p, v, reveal) {
        let s = circle(p.c, p.r, "ink");
        if (reveal) s += mark(p.c, "ans");
        if (v) s += mark(v, "user");
        return s;
      },
      judge(p, v) {
        const err = dist(v, p.c) / p.r * 100;
        return { err: `ズレ ${f1(err)}%`, score: toScore(err, 25) };
      },
    },

    {
      id: "centroid", name: "重心",
      make() {
        for (;;) {
          const pts = [0, 1, 2].map(() => P(rand(30, 270), rand(40, 270)));
          const [a, b, c] = pts;
          const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
          const sides = [dist(a, b), dist(b, c), dist(c, a)];
          // 細長すぎる三角形は避ける
          if (area > 9000 && Math.min(...sides) > 110) {
            return { pts, g: P((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3), scale: (sides[0] + sides[1] + sides[2]) / 3 };
          }
        }
      },
      prompt() { return "三角形の<b>重心</b>をタップ<small>指1本で支えたとき、つり合う点</small>"; },
      input(p, q) { return q; },
      draw(p, v, reveal) {
        let s = poly(p.pts, "ink");
        if (reveal) s += mark(p.g, "ans");
        if (v) s += mark(v, "user");
        return s;
      },
      judge(p, v) {
        const err = dist(v, p.g) / p.scale * 100;
        return { err: `ズレ ${f1(err)}%`, score: toScore(err, 25) };
      },
    },

    {
      id: "angle", name: "角度",
      make() {
        return { c: P(150, 205), rot: rand(-20, 20), target: pick([30, 45, 60, 75, 105, 120, 135, 150]), len: 115 };
      },
      prompt(p) { return `<b>${p.target}°</b> の角をつくる<small>黒い線から反時計回りに、ドラッグで</small>`; },
      input(p, q) { return (angleOf(p.c, q) - p.rot + 360) % 360; },
      draw(p, v, reveal) {
        let s = line(p.c, add(p.c, dir(p.rot), p.len), "ink") + circle(p.c, 4, "ink-dot");
        if (reveal) s += line(p.c, add(p.c, dir(p.rot + p.target), p.len + 10), "ans");
        if (v !== null) s += line(p.c, add(p.c, dir(p.rot + v), p.len), "user");
        return s;
      },
      judge(p, v) {
        const err = angDiff(v, p.target, 360);
        return { err: `ズレ ${f1(err)}°`, score: toScore(err, 18) };
      },
    },

    {
      id: "right", name: "直角",
      make() { return { c: P(150, 150), rot: rand(0, 360), len: 115 }; },
      prompt() { return "<b>直角（90°）</b>をつくる<small>ドラッグで線を回す</small>"; },
      input(p, q) { return (angleOf(p.c, q) - p.rot + 360) % 360; },
      draw(p, v, reveal) {
        let s = line(p.c, add(p.c, dir(p.rot), p.len), "ink") + circle(p.c, 4, "ink-dot");
        if (reveal) {
          // 近いほうの直角を正解として示す
          const t = v !== null && angDiff(v, 270, 360) < angDiff(v, 90, 360) ? 270 : 90;
          const a = dir(p.rot), b = dir(p.rot + t), k = 16;
          s += line(p.c, add(p.c, b, p.len + 10), "ans");
          s += `<polyline points="${n2(p.c.x + a.x * k)},${n2(p.c.y + a.y * k)} ${n2(p.c.x + (a.x + b.x) * k)},${n2(p.c.y + (a.y + b.y) * k)} ${n2(p.c.x + b.x * k)},${n2(p.c.y + b.y * k)}" class="ans"/>`;
        }
        if (v !== null) s += line(p.c, add(p.c, dir(p.rot + v), p.len), "user");
        return s;
      },
      judge(p, v) {
        const err = angDiff(v, 90, 180);
        return { err: `ズレ ${f1(err)}°`, score: toScore(err, 12) };
      },
    },

    {
      id: "vertical", name: "垂直",
      make() { return { c: P(150, 150), tilt: pick([-1, 1]) * rand(8, 14) }; },
      prompt() { return "線を<b>真っすぐ垂直</b>にする<small>傾いた枠にだまされないで</small>"; },
      input(p, q) { return angleOf(p.c, q) % 180; },
      draw(p, v, reveal) {
        const t = p.tilt;
        let s = `<g transform="rotate(${n2(-t)} 150 150)">` +
          `<rect x="45" y="45" width="210" height="210" class="ink"/>` +
          `<rect x="65" y="65" width="170" height="170" class="ink-faint"/>` +
          [95, 125, 175, 205].map((x) => `<line x1="${x}" y1="65" x2="${x}" y2="235" class="ink-faint"/>`).join("") +
          `</g>`;
        if (reveal) s += lineThrough(p.c, dir(90), 240, "ans");
        if (v !== null) s += lineThrough(p.c, dir(v), 220, "user");
        return s;
      },
      judge(p, v) {
        const err = angDiff(v, 90, 180);
        return { err: `ズレ ${f1(err)}°`, score: toScore(err, 8) };
      },
    },

    {
      id: "parallel", name: "平行",
      make() {
        const phi = Math.random() < 0.5 ? rand(20, 70) : rand(110, 160);
        return { rc: P(90, 95), uc: P(210, 205), phi, len: 130 };
      },
      prompt() { return "黒い線と<b>平行</b>な線を引く<small>ドラッグで線を回す</small>"; },
      input(p, q) { return angleOf(p.uc, q) % 180; },
      draw(p, v, reveal) {
        let s = lineThrough(p.rc, dir(p.phi), p.len, "ink") + circle(p.uc, 4, "ink-dot");
        if (reveal) s += lineThrough(p.uc, dir(p.phi), p.len + 20, "ans");
        if (v !== null) s += lineThrough(p.uc, dir(v), p.len, "user");
        return s;
      },
      judge(p, v) {
        const err = angDiff(v, p.phi, 180);
        return { err: `ズレ ${f1(err)}°`, score: toScore(err, 12) };
      },
    },

    {
      id: "length", name: "同じ長さ",
      make() {
        const Lr = rand(90, 150);
        const th = rand(40, 80); // 右下向き
        const u = P(Math.cos(th * DEG), Math.sin(th * DEG));
        const S = P(50, 100);
        const max = Math.min((285 - S.x) / u.x, (285 - S.y) / u.y);
        return { Lr, u, S, max, ra: P(150 - Lr / 2, 50) };
      },
      prompt() { return "上の線と<b>同じ長さ</b>にする<small>ドラッグで斜めの線を伸ばす</small>"; },
      input(p, q) { return clamp(dot(sub(q, p.S), p.u), 4, p.max); },
      draw(p, v, reveal) {
        const h = P(1, 0);
        const rb = add(p.ra, h, p.Lr);
        let s = line(p.ra, rb, "ink") + tick(p.ra, h, 14, "ink") + tick(rb, h, 14, "ink");
        s += tick(p.S, p.u, 14, "ink") + line(p.S, add(p.S, p.u, p.max), "ink-faint");
        if (reveal) s += tick(add(p.S, p.u, p.Lr), p.u, 34, "ans");
        if (v !== null) {
          const e = add(p.S, p.u, v);
          s += line(p.S, e, "user") + tick(e, p.u, 18, "user");
        }
        return s;
      },
      judge(p, v) {
        const err = Math.abs(v / p.Lr - 1) * 100;
        return { err: `${v > p.Lr ? "長すぎ" : "短すぎ"} ${f1(err)}%`, score: toScore(err, 20) };
      },
    },

    {
      id: "square", name: "正方形",
      make() { return { W: rand(90, 200), bottom: 270 }; },
      prompt() { return "<b>正方形</b>にする<small>上下にドラッグで高さを決める</small>"; },
      input(p, q) { return clamp(p.bottom - q.y, 6, 255); },
      draw(p, v, reveal) {
        const x0 = 150 - p.W / 2, x1 = 150 + p.W / 2, y = p.bottom;
        let s = line(P(x0, y), P(x1, y), "ink") +
          line(P(x0, y), P(x0, 15), "ink-faint") + line(P(x1, y), P(x1, 15), "ink-faint");
        if (reveal) s += line(P(x0 - 10, y - p.W), P(x1 + 10, y - p.W), "ans");
        if (v !== null) s += `<polyline points="${n2(x0)},${y} ${n2(x0)},${n2(y - v)} ${n2(x1)},${n2(y - v)} ${n2(x1)},${y}" class="user"/>`;
        return s;
      },
      judge(p, v) {
        const err = Math.abs(v / p.W - 1) * 100;
        return { err: `${v > p.W ? "縦長" : "横長"} ${f1(err)}%`, score: toScore(err, 18) };
      },
    },

    {
      id: "area", name: "面積の倍",
      make() { return { r0: rand(28, 40), rc: P(62, 62), c: P(178, 182), k: pick([2, 3]) }; },
      prompt(p) { return `小さい円の<b>面積 ${p.k}倍</b>の円にする<small>ドラッグで大きさを決める</small>`; },
      input(p, q) { return clamp(dist(q, p.c), 4, 112); },
      draw(p, v, reveal) {
        let s = circle(p.rc, p.r0, "ink") + label(p.rc, "1") + circle(p.c, 3, "ink-dot");
        if (reveal) s += circle(p.c, p.r0 * Math.sqrt(p.k), "ans");
        if (v !== null) s += circle(p.c, v, "user");
        return s;
      },
      judge(p, v) {
        const ratio = (v / p.r0) ** 2;
        const err = Math.abs(ratio / p.k - 1) * 100;
        return { err: `×${ratio.toFixed(2)}（目標×${p.k}）`, score: toScore(err, 45) };
      },
    },

    {
      id: "glass", name: "コップ半分",
      make() {
        const p = { cx: 150, top: 45, bottom: 265, rt: rand(80, 100), rb: rand(30, 45) };
        p.H = p.bottom - p.top;
        // 底からの高さ h まで入った水の体積（円すい台・定数倍は省略）
        p.vol = (h) => { const r = p.rb + (p.rt - p.rb) * h / p.H; return h * (p.rb * p.rb + p.rb * r + r * r); };
        let lo = 0, hi = p.H;
        for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (p.vol(m) < p.vol(p.H) / 2) lo = m; else hi = m; }
        p.half = lo;
        return p;
      },
      prompt() { return "コップに<b>半分の量</b>の水を入れる<small>高さの半分ではなく、量の半分</small>"; },
      input(p, q) { return clamp(p.bottom - q.y, 0, p.H); },
      draw(p, v, reveal) {
        const at = (h) => { const r = p.rb + (p.rt - p.rb) * h / p.H; return [P(p.cx - r, p.bottom - h), P(p.cx + r, p.bottom - h)]; };
        const [bl, br] = at(0), [tl, tr] = at(p.H);
        let s = "";
        if (v !== null && v > 0) { const [wl, wr] = at(v); s += poly([bl, br, wr, wl], "water"); }
        s += `<polyline points="${n2(tl.x)},${n2(tl.y)} ${n2(bl.x)},${n2(bl.y)} ${n2(br.x)},${n2(br.y)} ${n2(tr.x)},${n2(tr.y)}" class="ink"/>`;
        if (reveal) { const [l, r] = at(p.half); s += line(add(l, P(-12, 0)), add(r, P(12, 0)), "ans"); }
        if (v !== null) { const [l, r] = at(v); s += line(l, r, "user"); }
        return s;
      },
      judge(p, v) {
        const pct = p.vol(v) / p.vol(p.H) * 100;
        const err = Math.abs(pct - 50);
        return { err: `水量 ${Math.round(pct)}%（目標50%）`, score: toScore(err, 20) };
      },
    },
  ];

  // ---------- 状態 ----------
  const state = {
    phase: "start",   // start | input | reveal | result
    list: [],         // 出題するお題
    idx: 0,
    task: null,
    p: null,          // 問題パラメータ
    v: null,          // 回答値
    dragging: false,
    total: 0,
    results: [],      // { name, err, score }
  };

  const board = $("board");

  function render() {
    board.innerHTML = state.task.draw(state.p, state.v, state.phase === "reveal");
  }

  // ---------- 進行 ----------
  function startGame() {
    state.list = shuffle(TASKS.slice()).slice(0, QUESTIONS);
    state.idx = 0;
    state.total = 0;
    state.results = [];
    $("total-value").textContent = "0";
    showScreen("play");
    nextQuestion();
  }

  function nextQuestion() {
    state.task = state.list[state.idx];
    state.p = state.task.make();
    state.v = null;
    state.phase = "input";
    $("q-index").textContent = String(state.idx + 1);
    $("q-name").textContent = state.task.name;
    $("q-text").innerHTML = state.task.prompt(state.p);
    $("judge").classList.add("hidden");
    $("btn-ok").textContent = "決定";
    $("btn-ok").disabled = true;
    render();
  }

  function word(score) {
    if (score >= 97) return "ぴったり！";
    if (score >= 85) return "おみごと";
    if (score >= 65) return "いい線";
    if (score >= 35) return "おしい";
    return "ざっくり";
  }

  function decide() {
    if (state.phase !== "input" || state.v === null) return;
    state.phase = "reveal";
    state.dragging = false;
    const r = state.task.judge(state.p, state.v);
    state.total += r.score;
    state.results.push({ name: state.task.name, err: r.err, score: r.score });
    $("total-value").textContent = String(state.total);
    $("judge-score").textContent = `+${r.score}`;
    $("judge-score").classList.toggle("great", r.score >= 85);
    $("judge-word").textContent = word(r.score);
    $("judge-err").textContent = r.err;
    $("judge").classList.remove("hidden");
    $("btn-ok").textContent = state.idx + 1 >= state.list.length ? "結果を見る" : "次へ";
    render();
  }

  function onOk() {
    if (state.phase === "input") decide();
    else if (state.phase === "reveal") {
      state.idx++;
      if (state.idx >= state.list.length) finish();
      else nextQuestion();
    }
  }

  // ---------- 入力 ----------
  function toBoard(e) {
    const pt = board.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const q = pt.matrixTransform(board.getScreenCTM().inverse());
    return P(q.x, q.y);
  }
  function setFromPointer(e) {
    state.v = state.task.input(state.p, toBoard(e));
    $("btn-ok").disabled = false;
    render();
  }
  board.addEventListener("pointerdown", (e) => {
    if (state.phase !== "input") return;
    e.preventDefault();
    state.dragging = true;
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* 未対応でも続行 */ }
    setFromPointer(e);
  });
  board.addEventListener("pointermove", (e) => {
    if (state.phase === "input" && state.dragging) setFromPointer(e);
  });
  const endDrag = () => { state.dragging = false; };
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", endDrag);

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (state.phase === "start" || state.phase === "result") startGame();
    else onOk();
  });

  // ---------- 結果 ----------
  function finish() {
    state.phase = "result";
    const total = state.total;
    const rank = RANKS.find((r) => total >= r.min);
    const best = loadBest();
    const isNew = best === null || total > best;
    if (isNew) saveBest(total);
    $("result-rank").textContent = rank.name;
    $("result-total").textContent = String(total);
    $("result-best").innerHTML = isNew
      ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！'
      : `自己ベスト ${best} 点`;
    $("result-comment").textContent = rank.comment;
    const list = $("result-list");
    list.innerHTML = "";
    for (const r of state.results) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="rl-name">${r.name}</span><span class="rl-err">${r.err}</span><span class="rl-score ${r.score >= 85 ? "great" : ""}">${r.score}</span>`;
      list.appendChild(li);
    }
    const sorted = state.results.slice().sort((a, b) => b.score - a.score);
    const top = sorted[0], low = sorted[sorted.length - 1];
    const url = `${location.origin}${location.pathname}`;
    const text = `目分量 📏 ${total}/1000点【${rank.name}】\n得意: ${top.name}(${top.score}) / 苦手: ${low.name}(${low.score})\n#Ludom`;
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
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* 保存できなくても遊べる */ } }

  function showScreen(name) {
    for (const s of ["start", "play", "result"]) $("screen-" + s).classList.toggle("hidden", s !== name);
    if (name !== "play") state.phase = name;
    window.scrollTo(0, 0);
  }

  function init() {
    const best = loadBest();
    if (best !== null) { $("start-best").classList.remove("hidden"); $("start-best-value").textContent = String(best); }
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    $("btn-ok").addEventListener("click", onOk);
    showScreen("start");
  }
  init();
})();
