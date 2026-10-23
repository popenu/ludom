/* ===================================================
   お得はどっち？ - ゲームロジック
   2つの値札を見て、量あたりで安いほうを選ぶ10問タイムアタック。
   問題は毎回ランダム生成。後半ほど単価の差が小さく、単位も混ざる。
   間違いは +3秒。答え合わせの間はタイマーを止める。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const BEST_KEY = "otoku-docchi-best";
  const QUESTIONS = 10;
  const PENALTY = 5;          // 間違えたときの加算秒
  const SHOW_RIGHT = 1100;    // 正解後の表示時間（ms）
  const SHOW_WRONG = 1800;

  // 商品カタログ。base は1単位あたりのだいたいの値段（円）、per は単価表示の基準量
  const ITEMS = [
    { name: "豚こま切れ", unit: "g", base: 1.25, qty: [200, 250, 300, 350, 400, 450, 500, 600, 800, 1000], per: 100, icon: "pork", easy: true },
    { name: "鶏むね肉", unit: "g", base: 0.78, qty: [250, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000], per: 100, icon: "chicken", easy: true },
    { name: "牛切り落とし", unit: "g", base: 2.8, qty: [150, 200, 250, 300, 400, 500], per: 100, icon: "beef", easy: true },
    { name: "合いびき肉", unit: "g", base: 1.35, qty: [200, 250, 300, 400, 500, 800, 1000], per: 100, icon: "mince", easy: true },
    { name: "生鮭切り身", unit: "切れ", base: 140, qty: [2, 3, 4, 5, 6], per: 1, icon: "salmon" },
    { name: "たまご", unit: "個", base: 26, qty: [6, 10, 12, 20], per: 1, icon: "egg" },
    { name: "牛乳", unit: "ml", base: 0.25, qty: [500, 900, 1000], per: 100, icon: "milk" },
    { name: "緑茶", unit: "ml", base: 0.13, qty: [500, 525, 600, 650, 2000], per: 100, icon: "tea" },
    { name: "お米", unit: "kg", base: 480, qty: [2, 5, 10], per: 1, icon: "rice" },
    { name: "トイレットペーパー", unit: "ロール", base: 42, qty: [4, 8, 12, 18], per: 1, icon: "tp" },
    { name: "納豆", unit: "パック", base: 32, qty: [3, 4, 6], per: 1, icon: "natto" },
  ];

  // 何問目かで変わる難しさ。diff は単価の差（割合）の範囲
  function stage(i) {
    if (i < 3) return { diff: [0.1, 0.2], easyOnly: true, mixed: false };
    if (i < 6) return { diff: [0.05, 0.1], easyOnly: false, mixed: false };
    return { diff: [0.02, 0.05], easyOnly: false, mixed: true };
  }

  // 称号はタイム（ミスの加算込み）とミスの数の両方で決める。適当に速く押すだけでは上位にならない
  const RANKS = [
    { max: 25, miss: 1, name: "特売ハンター", comment: "値札を見た瞬間に単価が見えている。チラシいらず。" },
    { max: 35, miss: 2, name: "家計の達人", comment: "迷わず安いほうへ。カゴに入れるのが速い。" },
    { max: 50, miss: 3, name: "買い物上手", comment: "ちゃんと比べられている。あとはスピード。" },
    { max: 75, miss: 5, name: "ふつうの買い物客", comment: "じっくり比べる派。売り場で少し立ち止まる。" },
    { max: Infinity, miss: Infinity, name: "値札を見ない人", comment: "安さより直感。それもまた買い物。" },
  ];

  // ---------- 小道具 ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const yen = (n) => n.toLocaleString("ja-JP");

  // スーパーらしい値段（末尾が 8 か 0）に寄せる
  function nicePrice(x) {
    const n = Math.round(x);
    for (let d = 0; d < 10; d++) {
      for (const v of [n - d, n + d]) if (v > 0 && (v % 10 === 8 || v % 10 === 0)) return v;
    }
    return n;
  }

  function fmtQty(unit, q) {
    if (unit === "g" && q >= 1000) return { n: String(q / 1000), u: "kg" };
    if (unit === "ml" && q >= 1000) return { n: String(q / 1000), u: "L" };
    return { n: String(q), u: unit };
  }
  const perLabel = (it) => (it.per === 1 ? `1${it.unit}` : `${it.per}${it.unit}`);
  const unitPrice = (it, p) => (p.price / p.qty) * it.per;

  // ---------- 問題を作る ----------
  function makeQuestion(i, used) {
    const st = stage(i);
    for (let tries = 0; tries < 500; tries++) {
      const pool = ITEMS.filter((it) => (!st.easyOnly || it.easy) && !used.has(it.name));
      const it = pick(pool.length ? pool : ITEMS);
      let qa = pick(it.qty), qb = pick(it.qty);
      if (qa === qb) continue;
      // 後半の g・ml は、kg（L）と g（ml）が混ざる組み合わせを優先する
      if (st.mixed && (it.unit === "g" || it.unit === "ml") && it.qty.some((q) => q >= 1000) && Math.random() < 0.7) {
        if ((qa >= 1000) === (qb >= 1000)) continue;
      }
      const ua = it.base * rand(0.88, 1.12);
      const r = rand(st.diff[0], st.diff[1]) + 1;
      const ub = Math.random() < 0.5 ? ua * r : ua / r;
      const a = { qty: qa, price: nicePrice(ua * qa) };
      const b = { qty: qb, price: nicePrice(ub * qb) };
      // 量が多いほうが値段も高い（そうでないと見ただけでわかってしまう）
      if ((a.qty > b.qty) !== (a.price > b.price)) continue;
      const pa = unitPrice(it, a), pb = unitPrice(it, b);
      const d = Math.abs(pa - pb) / Math.min(pa, pb);
      if (d < Math.max(0.015, st.diff[0] - 0.01) || d > st.diff[1] + 0.03) continue;
      // 表示上の単価（小数1桁）が同じに見えるものは避ける
      if (pa.toFixed(1) === pb.toFixed(1)) continue;
      used.add(it.name);
      return { item: it, opts: [a, b], answer: pa < pb ? 0 : 1, units: [pa, pb] };
    }
    throw new Error("問題を作れませんでした");
  }

  // ---------- 商品の絵（viewBox 0 0 100 80） ----------
  const ICONS = {
    pork: () => meat("#ef9a9a", "#f8c9c9"),
    beef: () => meat("#c94a4a", "#e58d86"),
    mince: () => `<rect x="12" y="18" width="76" height="46" rx="10" fill="#f4f4f4"/><g fill="#d97a74">${dots(22, 26, 8, 5, 7, 3.2)}</g><g fill="#efb3ae">${dots(26, 29, 7, 4, 7, 2.2)}</g>`,
    chicken: () => `<rect x="10" y="18" width="80" height="46" rx="10" fill="#f4f4f4"/><path d="M20 50 Q22 26 44 28 Q56 30 54 46 Q50 58 30 58 Q20 58 20 50Z" fill="#f6d2c8"/><path d="M50 52 Q50 30 70 30 Q82 32 80 46 Q78 58 62 58 Q50 58 50 52Z" fill="#f2c4b8"/>`,
    salmon: () => `<rect x="10" y="18" width="80" height="46" rx="10" fill="#f4f4f4"/>${[20, 46].map((x) => `<path d="M${x} 56 Q${x - 2} 28 ${x + 14} 26 Q${x + 30} 28 ${x + 28} 54 Z" fill="#f59a6b"/><path d="M${x + 6} 50 Q${x + 12} 36 ${x + 22} 34" stroke="#fde3d4" stroke-width="2.5" fill="none"/>`).join("")}`,
    egg: () => `<rect x="10" y="22" width="80" height="40" rx="8" fill="#e9e5d8"/>${[0, 1].map((r) => [0, 1, 2, 3, 4].map((c) => `<ellipse cx="${20 + c * 15}" cy="${33 + r * 18}" rx="6.2" ry="7.5" fill="#f4e3c8"/>`).join("")).join("")}`,
    milk: () => `<path d="M36 22 L50 12 L64 22 L64 70 L36 70 Z" fill="#fff" stroke="#c9d6e8" stroke-width="2"/><path d="M36 22 L64 22" stroke="#c9d6e8" stroke-width="2"/><rect x="36" y="38" width="28" height="16" fill="#4a86d8"/><text x="50" y="50" font-size="9" text-anchor="middle" fill="#fff" font-weight="800">MILK</text>`,
    tea: () => `<rect x="40" y="10" width="20" height="8" rx="2" fill="#2f8a4a"/><path d="M38 20 Q38 18 40 18 L60 18 Q62 18 62 20 L64 30 L64 70 Q64 74 60 74 L40 74 Q36 74 36 70 L36 30 Z" fill="#cfe9c8" stroke="#a9cfa0" stroke-width="2"/><rect x="36" y="40" width="28" height="16" fill="#2f8a4a"/><text x="50" y="52" font-size="9" text-anchor="middle" fill="#fff" font-weight="800">お茶</text>`,
    rice: () => `<path d="M28 18 L72 18 L76 72 L24 72 Z" fill="#f6f1e2" stroke="#d9cfae" stroke-width="2"/><rect x="34" y="34" width="32" height="20" rx="4" fill="#d9442f"/><text x="50" y="48" font-size="10" text-anchor="middle" fill="#fff" font-weight="800">お米</text>`,
    tp: () => [0, 1, 2].map((c) => `<g transform="translate(${18 + c * 22} 22)"><rect width="20" height="44" rx="4" fill="#fff" stroke="#d6dde6" stroke-width="2"/><ellipse cx="10" cy="4" rx="10" ry="4" fill="#eef2f6" stroke="#d6dde6" stroke-width="1.5"/><ellipse cx="10" cy="4" rx="3" ry="1.4" fill="#c7cfd9"/></g>`).join(""),
    natto: () => [0, 1, 2].map((c) => `<g transform="translate(${14 + c * 24} ${30 - (c % 2) * 6})"><rect width="22" height="20" rx="3" fill="#fff" stroke="#e0d6c0" stroke-width="2"/><rect x="2" y="7" width="18" height="6" fill="#e2552e"/></g>`).join(""),
  };
  function meat(c1, c2) {
    return `<rect x="10" y="18" width="80" height="46" rx="10" fill="#f4f4f4"/>` +
      `<path d="M18 48 Q20 28 40 30 Q50 32 48 46 Q44 58 28 56 Q18 56 18 48Z" fill="${c1}"/>` +
      `<path d="M42 50 Q44 30 64 28 Q80 28 82 42 Q82 56 62 56 Q44 58 42 50Z" fill="${c1}"/>` +
      `<path d="M26 44 Q34 36 42 40 M52 44 Q62 34 74 38" stroke="${c2}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  }
  function dots(x0, y0, cols, rows, gap, r) {
    let s = "";
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) s += `<circle cx="${x0 + x * gap + (y % 2) * 3}" cy="${y0 + y * gap}" r="${r}"/>`;
    return s;
  }

  // ---------- 状態 ----------
  const state = {
    phase: "start",   // start | play | result
    qs: [],
    idx: 0,
    locked: false,
    startAt: 0,       // 現在の計測区間の開始時刻
    banked: 0,        // それまでに経過した秒（停止中を除く）
    penalty: 0,
    misses: 0,
    raf: 0,
    timer: 0,
    log: [],          // { q, choice, ok }
  };

  const elapsed = () => state.banked + (state.startAt ? (performance.now() - state.startAt) / 1000 : 0) + state.penalty;
  function runClock() { state.startAt = performance.now(); }
  function stopClock() { if (state.startAt) { state.banked += (performance.now() - state.startAt) / 1000; state.startAt = 0; } }

  // ---------- 進行 ----------
  function startGame() {
    clearTimeout(state.timer);
    const used = new Set();
    state.qs = [];
    for (let i = 0; i < QUESTIONS; i++) {
      if (used.size >= ITEMS.length - 1) used.clear();
      state.qs.push(makeQuestion(i, used));
    }
    state.idx = 0;
    state.banked = 0;
    state.penalty = 0;
    state.misses = 0;
    state.log = [];
    state.startAt = 0;
    $("miss").textContent = "0";
    showScreen("play");
    showQuestion();
    cancelAnimationFrame(state.raf);
    const tick = () => {
      if (state.phase !== "play") return;
      $("time").textContent = elapsed().toFixed(1);
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
  }

  function labelHtml(it, p) {
    const q = fmtQty(it.unit, p.qty);
    return `<div class="tray"><svg viewBox="0 0 100 80" aria-hidden="true">${ICONS[it.icon]()}</svg></div>` +
      `<div class="label"><div class="label-name">${it.name}</div>` +
      `<div class="label-row"><span class="label-key">内容量</span><span class="label-qty">${q.n}<small>${q.u}</small></span></div>` +
      `<div class="label-row"><span class="label-key">お値段</span><span class="label-price">${yen(p.price)}<small>円</small></span></div>` +
      `<div class="label-tax">税込</div></div>`;
  }

  function showQuestion() {
    const q = state.qs[state.idx];
    $("q-index").textContent = String(state.idx + 1);
    $("q-text").innerHTML = `<b>${perLabel(q.item)}あたり</b>で安いのはどっち？`;
    for (let i = 0; i < 2; i++) {
      const el = $("card-" + i);
      el.className = "product";
      el.disabled = false;
      el.innerHTML = labelHtml(q.item, q.opts[i]);
    }
    $("feedback").className = "feedback";
    $("feedback").innerHTML = "";
    state.locked = false;
    runClock();
  }

  function choose(i) {
    if (state.phase !== "play" || state.locked) return;
    state.locked = true;
    stopClock();
    const q = state.qs[state.idx];
    const ok = i === q.answer;
    if (!ok) { state.misses++; state.penalty += PENALTY; $("miss").textContent = String(state.misses); }
    state.log.push({ q, choice: i, ok });
    for (let k = 0; k < 2; k++) {
      const el = $("card-" + k);
      el.disabled = true;
      el.classList.add(k === q.answer ? "right" : k === i ? "wrong" : "other");
      el.insertAdjacentHTML("beforeend", `<div class="unit">${perLabel(q.item)}あたり<br><b>${q.units[k].toFixed(1)}</b>円</div>`);
    }
    if (!ok) $("card-" + i).insertAdjacentHTML("beforeend", `<div class="stamp">+${PENALTY}秒</div>`);
    const fb = $("feedback");
    const gap = Math.abs(q.units[0] - q.units[1]);
    fb.className = "feedback " + (ok ? "good" : "bad");
    fb.innerHTML = ok
      ? `正解！<small>${perLabel(q.item)}あたり ${gap.toFixed(1)}円 安い</small>`
      : `ざんねん、${q.answer === 0 ? "左" : "右"}が安い<small>${perLabel(q.item)}あたり ${gap.toFixed(1)}円の差</small>`;
    state.timer = setTimeout(() => {
      state.idx++;
      if (state.idx >= state.qs.length) finish();
      else showQuestion();
    }, ok ? SHOW_RIGHT : SHOW_WRONG);
  }

  // ---------- 結果 ----------
  function finish() {
    state.phase = "result";
    cancelAnimationFrame(state.raf);
    const total = Math.round(elapsed() * 10) / 10;
    const rank = RANKS.find((r) => total <= r.max && state.misses <= r.miss);
    const best = loadBest();
    const isNew = best === null || total < best;
    if (isNew) saveBest(total);
    $("result-rank").textContent = rank.name;
    $("result-time").textContent = total.toFixed(1);
    $("result-detail").textContent = `正解 ${QUESTIONS - state.misses}/${QUESTIONS}` + (state.misses ? `（ミス ${state.misses} 回 × +${PENALTY}秒）` : "（ノーミス）");
    $("result-best").innerHTML = isNew ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！' : `自己ベスト ${best.toFixed(1)} 秒`;
    $("result-comment").textContent = rank.comment;
    const list = $("result-list");
    list.innerHTML = "";
    for (const r of state.log) {
      const { item: it, opts, units, answer } = r.q;
      const s = (p) => { const f = fmtQty(it.unit, p.qty); return `${f.n}${f.u} ${yen(p.price)}円`; };
      const li = document.createElement("li");
      li.innerHTML = `<span class="rl-mark ${r.ok ? "" : "bad"}">${r.ok ? "○" : "×"}</span>` +
        `<span class="rl-body">${it.name} <small>${s(opts[0])} / ${s(opts[1])}</small></span>` +
        `<span class="rl-unit">${answer === 0 ? "左" : "右"} ${units[answer].toFixed(1)}円</span>`;
      list.appendChild(li);
    }
    const url = `${location.origin}${location.pathname}`;
    const text = `お得はどっち？ 🛒 10問 ${total.toFixed(1)}秒【${rank.name}】\n正解 ${QUESTIONS - state.misses}/${QUESTIONS}\n500g450円と300g310円、安いのはどっち？\n#Ludom`;
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
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, v.toFixed(1)); } catch (e) { /* 保存できなくても遊べる */ } }

  function showScreen(name) {
    for (const s of ["start", "play", "result"]) $("screen-" + s).classList.toggle("hidden", s !== name);
    state.phase = name;
    window.scrollTo(0, 0);
  }

  // ---------- 入力 ----------
  $("card-0").addEventListener("click", () => choose(0));
  $("card-1").addEventListener("click", () => choose(1));
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (state.phase === "play") {
      if (e.key === "ArrowLeft" || e.key === "1") choose(0);
      else if (e.key === "ArrowRight" || e.key === "2") choose(1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      startGame();
    }
  });

  function init() {
    const best = loadBest();
    if (best !== null) { $("start-best").classList.remove("hidden"); $("start-best-value").textContent = best.toFixed(1); }
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    showScreen("start");
  }
  init();
})();
