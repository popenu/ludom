/* ===================================================
   いろまぜ - ゲームロジック
   お題の色を、赤・黄・青・白・黒の絵の具10マスで作る。全5問。
   お題は裏で作ったレシピから出すので、必ずぴったり作れる。
   色の名前は、いちばん近い伝統色から付ける。
=================================================== */
(function () {
  "use strict";

  const { mix, deltaE, toCss, PIGMENTS, KEYS } = window.IroColor;
  const $ = (id) => document.getElementById(id);
  const BEST_KEY = "iromaze-best";
  const SLOTS = 10;
  const QUESTIONS = 5;

  // 称号（500点満点）
  const RANKS = [
    { min: 470, name: "色の神", comment: "ほぼ全問ぴったり。目にスポイトが付いている。" },
    { min: 420, name: "名人", comment: "見事な調色。画材屋で一目置かれる腕前。" },
    { min: 340, name: "職人", comment: "安定して近い色が作れる。あと1マスの勘を磨こう。" },
    { min: 240, name: "見習い", comment: "方向は合っている。明るさの調整がカギ。" },
    { min: 0, name: "絵の具まみれ", comment: "パレットは楽しく汚れた。次は白から考えてみよう。" },
  ];

  // 伝統色（名前・読み・色）。お題の名前付けにだけ使う
  const NAMED = [
    ["桜色", "さくらいろ", "#fef4f4"], ["薄桜", "うすざくら", "#fdeff2"], ["桃色", "ももいろ", "#f09199"],
    ["撫子色", "なでしこいろ", "#eebbcb"], ["紅梅色", "こうばいいろ", "#f2a0a1"], ["珊瑚色", "さんごいろ", "#f5b1aa"],
    ["薄紅", "うすべに", "#f0908d"], ["今様色", "いまよういろ", "#d0576b"], ["韓紅", "からくれない", "#e95464"],
    ["紅色", "べにいろ", "#d7003a"], ["茜色", "あかねいろ", "#b7282e"], ["臙脂", "えんじ", "#b94047"],
    ["蘇芳", "すおう", "#9e3d3f"], ["小豆色", "あずきいろ", "#96514d"], ["海老茶", "えびちゃ", "#773c30"],
    ["灰桜", "はいざくら", "#e8d3d1"], ["牡丹色", "ぼたんいろ", "#e7609e"], ["躑躅色", "つつじいろ", "#e95295"],
    ["朱色", "しゅいろ", "#eb6101"], ["柿色", "かきいろ", "#ed6d3d"], ["橙色", "だいだいいろ", "#ee7800"],
    ["蜜柑色", "みかんいろ", "#f08300"], ["杏色", "あんずいろ", "#f7b977"], ["肌色", "はだいろ", "#f1bf99"],
    ["樺色", "かばいろ", "#cd5e3c"], ["煉瓦色", "れんがいろ", "#b55233"], ["赤茶", "あかちゃ", "#bb5535"],
    ["弁柄色", "べんがらいろ", "#8f2e14"], ["鳶色", "とびいろ", "#95483f"], ["小麦色", "こむぎいろ", "#e49e61"],
    ["山吹色", "やまぶきいろ", "#f8b500"], ["蒲公英色", "たんぽぽいろ", "#ffd900"], ["菜の花色", "なのはないろ", "#ffec47"],
    ["卵色", "たまごいろ", "#fcd575"], ["刈安色", "かりやすいろ", "#f5e56b"], ["鬱金色", "うこんいろ", "#fabf14"],
    ["芥子色", "からしいろ", "#d0af4c"], ["金茶", "きんちゃ", "#f39800"], ["黄檗色", "きはだいろ", "#fef263"],
    ["鳥の子色", "とりのこいろ", "#fff1cf"], ["香色", "こういろ", "#efcd9a"], ["砂色", "すないろ", "#dcd3b2"],
    ["象牙色", "ぞうげいろ", "#f8f4e6"], ["黄土色", "おうどいろ", "#c39143"], ["狐色", "きつねいろ", "#c38743"],
    ["琥珀色", "こはくいろ", "#bf783a"], ["駱駝色", "らくだいろ", "#bf794e"], ["朽葉色", "くちばいろ", "#917347"],
    ["茶色", "ちゃいろ", "#965042"], ["焦茶", "こげちゃ", "#6f4b3e"], ["栗色", "くりいろ", "#762f07"],
    ["鶸色", "ひわいろ", "#d7cf3a"], ["鶯色", "うぐいすいろ", "#928c36"], ["抹茶色", "まっちゃいろ", "#c5c56a"],
    ["若草色", "わかくさいろ", "#c3d825"], ["萌黄", "もえぎ", "#aacf53"], ["若葉色", "わかばいろ", "#b9d08b"],
    ["苗色", "なえいろ", "#b0ca71"], ["柳色", "やなぎいろ", "#a8c97f"], ["白緑", "びゃくろく", "#d6e9ca"],
    ["草色", "くさいろ", "#7b8d42"], ["苔色", "こけいろ", "#69821b"], ["松葉色", "まつばいろ", "#839b5c"],
    ["海松色", "みるいろ", "#726d40"], ["鶯茶", "うぐいすちゃ", "#715c1f"], ["利休鼠", "りきゅうねずみ", "#888e7e"],
    ["常磐色", "ときわいろ", "#007b43"], ["緑", "みどり", "#3eb370"], ["若竹色", "わかたけいろ", "#68be8d"],
    ["青竹色", "あおたけいろ", "#7ebea5"], ["青磁色", "せいじいろ", "#7ebeab"], ["千歳緑", "ちとせみどり", "#316745"],
    ["深緑", "ふかみどり", "#00552e"], ["萌葱色", "もえぎいろ", "#006e54"], ["青緑", "あおみどり", "#00a497"],
    ["浅葱色", "あさぎいろ", "#00a3af"], ["水浅葱", "みずあさぎ", "#80aba9"], ["錆浅葱", "さびあさぎ", "#5c9291"],
    ["水色", "みずいろ", "#bce2e8"], ["瓶覗", "かめのぞき", "#a2d7dd"], ["空色", "そらいろ", "#a0d8ef"],
    ["勿忘草色", "わすれなぐさいろ", "#89c3eb"], ["露草色", "つゆくさいろ", "#38a1db"], ["縹色", "はなだいろ", "#2792c3"],
    ["薄花色", "うすはないろ", "#698aab"], ["紺碧", "こんぺき", "#007bbb"], ["群青色", "ぐんじょういろ", "#4c6cb3"],
    ["瑠璃色", "るりいろ", "#1e50a2"], ["藍色", "あいいろ", "#165e83"], ["紺色", "こんいろ", "#223a70"],
    ["紺青", "こんじょう", "#192f60"], ["鉄紺", "てつこん", "#17184b"], ["藤色", "ふじいろ", "#bbbcde"],
    ["藤紫", "ふじむらさき", "#8d93c8"], ["桔梗色", "ききょういろ", "#5654a2"], ["菫色", "すみれいろ", "#7058a3"],
    ["江戸紫", "えどむらさき", "#745399"], ["紫", "むらさき", "#884898"], ["菖蒲色", "あやめいろ", "#cc7eb1"],
    ["茄子紺", "なすこん", "#824880"], ["二藍", "ふたあい", "#915c8b"], ["薄紫", "うすむらさき", "#c4a3bf"],
    ["紅藤", "べにふじ", "#cca6bf"], ["梅紫", "うめむらさき", "#aa4c8f"], ["鳩羽色", "はとばいろ", "#95859c"],
    ["胡粉色", "ごふんいろ", "#fffffc"], ["白磁", "はくじ", "#f8fbf8"], ["銀鼠", "ぎんねず", "#afafb0"],
    ["鼠色", "ねずみいろ", "#949495"], ["灰色", "はいいろ", "#7d7d7d"], ["鈍色", "にびいろ", "#727171"],
    ["墨", "すみ", "#595857"], ["黒", "くろ", "#2b2b2b"], ["煤竹色", "すすたけいろ", "#6f514c"],
  ].map(([name, yomi, hex]) => ({ name, yomi, rgb: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) }));

  const state = {
    phase: "start",   // start | play | mixing | judged | result
    q: 0,
    slots: [],        // 置いた絵の具のキー（置いた順）
    target: null,     // { recipe, rgb, name, yomi }
    results: [],      // { target, mine, rgb, score }
    usedNames: new Set(),
  };

  // ---------- お題づくり ----------
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // 問題ごとに使う絵の具の組み合わせ（だんだん難しく）
  function pickKeys(q) {
    const prim = ["R", "Y", "B"];
    if (q === 0) return shuffle(prim).slice(0, 2);
    if (q === 1) return [...shuffle(prim).slice(0, 2), "W"];
    if (q === 2) return prim;
    if (q === 3) return [...prim, Math.random() < 0.5 ? "W" : "K"];
    return [...shuffle(prim).slice(0, rnd(2, 3)), "W", "K"];
  }

  function nearestName(rgb) {
    let best = null, bestD = Infinity;
    for (const c of NAMED) {
      if (state.usedNames.has(c.name)) continue;
      const d = deltaE(rgb, c.rgb);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function makeTarget(q) {
    const keys = pickKeys(q);
    for (;;) {
      const recipe = {};
      let total = 0;
      for (const k of keys) { recipe[k] = rnd(1, 4); total += recipe[k]; }
      if (total > SLOTS) continue;
      const rgb = mix(recipe);
      const named = nearestName(rgb);
      state.usedNames.add(named.name);
      return { recipe, rgb, name: named.name, yomi: named.yomi };
    }
  }

  // ---------- 採点 ----------
  // ΔE2000 から 0〜100 点。1マス違い（ΔE 5 前後）で 80 点ほど、でたらめに混ぜると 20 点前後
  function scoreFor(dE) {
    if (dE < 0.5) return 100;
    return Math.max(0, Math.min(99, Math.round(100 * Math.exp(-((dE / 16) ** 1.4)))));
  }

  function verdict(score) {
    if (score === 100) return "ぴったり！ 完全一致。";
    if (score >= 90) return "おしい！ ほとんど同じ色。";
    if (score >= 75) return "いい線。あと1〜2マスの差。";
    if (score >= 50) return "方向は合っている。";
    return "別の色になった…";
  }

  // ---------- 描画 ----------
  function recipeText(recipe) {
    const parts = KEYS.filter((k) => recipe[k]).map((k) => `${PIGMENTS[k].name}${recipe[k]}`);
    return parts.length ? parts.join("・") : "なし";
  }

  function recipeChips(recipe) {
    return KEYS.filter((k) => recipe[k]).map((k) =>
      `<span class="chip"><i style="background:${PAINT_CSS[k]}"></i>${PIGMENTS[k].name}<b>${recipe[k]}</b></span>`).join("");
  }

  const PAINT_CSS = {};
  for (const k of KEYS) PAINT_CSS[k] = toCss(mix({ [k]: 1 }));

  function countOf(k) { return state.slots.filter((s) => s === k).length; }
  function slotsRecipe() { const r = {}; for (const k of state.slots) r[k] = (r[k] || 0) + 1; return r; }

  function renderPalette() {
    const wells = $("palette").children;
    for (let i = 0; i < SLOTS; i++) {
      const k = state.slots[i];
      const blob = wells[i].firstElementChild;
      wells[i].classList.toggle("filled", !!k);
      blob.style.background = k ? PAINT_CSS[k] : "";
      wells[i].setAttribute("aria-label", k ? `${PIGMENTS[k].name}（タップで取り除く）` : "空きマス");
    }
    for (const k of KEYS) {
      const n = countOf(k);
      const badge = $("count-" + k);
      badge.textContent = n;
      badge.classList.toggle("hidden", n === 0);
    }
    const full = state.slots.length >= SLOTS;
    for (const btn of document.querySelectorAll(".paint")) btn.disabled = full || state.phase !== "play";
    $("btn-mix").disabled = state.slots.length === 0 || state.phase !== "play";
    $("btn-clear").disabled = state.slots.length === 0 || state.phase !== "play";
    $("slot-count").textContent = `${state.slots.length} / ${SLOTS}`;
  }

  function buildPalette() {
    const pal = $("palette");
    pal.innerHTML = "";
    for (let i = 0; i < SLOTS; i++) {
      const w = document.createElement("button");
      w.className = "well";
      w.type = "button";
      w.innerHTML = '<span class="blob"></span>';
      w.addEventListener("click", () => removeAt(i));
      pal.appendChild(w);
    }
  }

  // ---------- 進行 ----------
  function startGame() {
    state.q = 0;
    state.results = [];
    state.usedNames = new Set();
    $("total-value").textContent = "0";
    showScreen("play");
    readyQuestion();
  }

  function readyQuestion() {
    state.phase = "play";
    state.slots = [];
    state.target = makeTarget(state.q);
    $("q-value").textContent = String(state.q + 1);
    $("target-swatch").style.background = toCss(state.target.rgb);
    $("target-name").textContent = state.target.name;
    $("target-yomi").textContent = state.target.yomi;
    $("mine-name").textContent = "？";
    $("mine-yomi").textContent = "まぜると出る";
    clearBowl();
    $("judge").classList.add("hidden");
    $("controls").classList.remove("hidden");
    renderPalette();
  }

  function addPaint(k) {
    if (state.phase !== "play" || state.slots.length >= SLOTS) return;
    state.slots.push(k);
    renderPalette();
    const w = $("palette").children[state.slots.length - 1];
    w.classList.remove("pop"); void w.offsetWidth; w.classList.add("pop");
  }

  function removeAt(i) {
    if (state.phase !== "play" || i >= state.slots.length) return;
    state.slots.splice(i, 1);
    renderPalette();
  }

  function clearSlots() {
    if (state.phase !== "play") return;
    state.slots = [];
    renderPalette();
  }

  function doMix() {
    if (state.phase !== "play" || state.slots.length === 0) return;
    state.phase = "mixing";
    const recipe = slotsRecipe();
    const rgb = mix(recipe);
    const colors = state.slots.map((k) => PAINT_CSS[k]);
    $("palette").classList.add("draining");
    renderPalette();
    animateBowl(colors, rgb, () => {
      $("palette").classList.remove("draining");
      judge(recipe, rgb);
    });
  }

  function judge(recipe, rgb) {
    state.phase = "judged";
    const dE = deltaE(state.target.rgb, rgb);
    const score = scoreFor(dE);
    state.results.push({ target: state.target, mine: recipe, rgb, score });
    const total = state.results.reduce((s, r) => s + r.score, 0);

    $("mine-name").textContent = `${score}点`;
    $("mine-yomi").textContent = `色の差 ΔE ${dE.toFixed(1)}`;
    $("judge-score").textContent = score;
    $("judge-score").classList.toggle("perfect", score === 100);
    $("judge-msg").textContent = verdict(score);
    $("judge-mine").innerHTML = recipeChips(recipe);
    $("judge-answer").innerHTML = recipeChips(state.target.recipe);
    $("btn-next").textContent = state.q + 1 >= QUESTIONS ? "結果を見る" : "次の色へ →";
    $("controls").classList.add("hidden");
    $("judge").classList.remove("hidden");
    countUp($("total-value"), total - score, total);
    state.slots = [];
    renderPalette();
  }

  function next() {
    if (state.phase !== "judged") return;
    state.q++;
    if (state.q >= QUESTIONS) finish();
    else readyQuestion();
  }

  function countUp(el, from, to) {
    const t0 = performance.now(), dur = 500;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = String(Math.round(from + (to - from) * p));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- まぜるアニメーション（あなたの色の円の中で絵の具が渦を巻く） ----------
  const bowl = $("bowl");
  const bctx = bowl.getContext("2d");

  function sizeBowl() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const size = bowl.clientWidth || 120;
    bowl.width = Math.round(size * dpr);
    bowl.height = Math.round(size * dpr);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return size;
  }

  function clearBowl() {
    const s = sizeBowl();
    bctx.clearRect(0, 0, s, s);
  }

  function fillBowl(rgb) {
    const s = sizeBowl();
    bctx.clearRect(0, 0, s, s);
    bctx.fillStyle = toCss(rgb);
    bctx.beginPath(); bctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); bctx.fill();
  }

  function animateBowl(colors, rgb, done) {
    const s = sizeBowl();
    const c = s / 2;
    const dur = 1500;
    const t0 = performance.now();
    const blobs = colors.map((col, i) => ({ col, a0: (i / colors.length) * Math.PI * 2, r0: s * (0.22 + 0.12 * ((i * 7) % 3) / 2) }));
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { fillBowl(rgb); setTimeout(done, 300); return; }
    const frame = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = p * p * (3 - 2 * p);
      bctx.clearRect(0, 0, s, s);
      bctx.save();
      bctx.beginPath(); bctx.arc(c, c, c, 0, Math.PI * 2); bctx.clip();
      bctx.fillStyle = "#f3efe6";
      bctx.fillRect(0, 0, s, s);
      // 渦を巻きながら中心へ寄っていく絵の具
      for (const b of blobs) {
        const ang = b.a0 + e * Math.PI * 5;
        const rad = b.r0 * (1 - e * 0.7);
        const x = c + Math.cos(ang) * rad, y = c + Math.sin(ang) * rad;
        const br = s * (0.2 + e * 0.35);
        bctx.globalAlpha = 0.85;
        bctx.fillStyle = b.col;
        bctx.beginPath(); bctx.arc(x, y, br, 0, Math.PI * 2); bctx.fill();
      }
      // 後半で混ざった色に落ち着く
      bctx.globalAlpha = Math.max(0, (p - 0.35) / 0.65) ** 1.5;
      bctx.fillStyle = toCss(rgb);
      bctx.fillRect(0, 0, s, s);
      bctx.restore();
      bctx.globalAlpha = 1;
      if (p < 1) requestAnimationFrame(frame);
      else { fillBowl(rgb); done(); }
    };
    requestAnimationFrame(frame);
  }

  // ---------- 結果 ----------
  function finish() {
    state.phase = "result";
    const total = state.results.reduce((s, r) => s + r.score, 0);
    const rank = RANKS.find((r) => total >= r.min);
    const best = loadBest();
    const isNew = best === null || total > best;
    if (isNew) saveBest(total);
    $("result-rank").textContent = rank.name;
    $("result-total").textContent = total;
    $("result-best").innerHTML = isNew
      ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！'
      : `自己ベスト ${best} 点`;
    $("result-comment").textContent = rank.comment;
    const list = $("result-list");
    list.innerHTML = "";
    for (const r of state.results) {
      const li = document.createElement("li");
      li.innerHTML =
        `<span class="rl-sw"><i style="background:${toCss(r.target.rgb)}"></i><i style="background:${toCss(r.rgb)}"></i></span>` +
        `<span class="rl-name">${r.target.name}<small>正解 ${recipeText(r.target.recipe)}</small></span>` +
        `<span class="rl-score ${r.score === 100 ? "perfect" : ""}">${r.score}</span>`;
      list.appendChild(li);
    }
    const url = `${location.origin}${location.pathname}`;
    const detail = state.results.map((r) => `${r.target.name} ${r.score}`).join(" / ");
    const text = `いろまぜ 🎨 ${total}/500点【${rank.name}】\n${detail}\n#Ludom`;
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

  // ---------- 入力 ----------
  const KEYMAP = { r: "R", y: "Y", b: "B", w: "W", k: "K", "1": "R", "2": "Y", "3": "B", "4": "W", "5": "K" };
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Enter" || e.key === " ") {
      if (state.phase === "start" || state.phase === "result") { e.preventDefault(); startGame(); }
      else if (state.phase === "play") { e.preventDefault(); doMix(); }
      else if (state.phase === "judged") { e.preventDefault(); next(); }
      return;
    }
    if (e.key === "Backspace" && state.phase === "play") { e.preventDefault(); removeAt(state.slots.length - 1); return; }
    const k = KEYMAP[e.key.toLowerCase()];
    if (k) addPaint(k);
  });

  function init() {
    buildPalette();
    for (const k of KEYS) {
      const btn = document.querySelector(`.paint[data-k="${k}"]`);
      btn.querySelector(".paint-dot").style.background = PAINT_CSS[k];
      btn.addEventListener("click", () => addPaint(k));
    }
    const best = loadBest();
    if (best !== null) { $("start-best").classList.remove("hidden"); $("start-best-value").textContent = best; }
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    $("btn-mix").addEventListener("click", doMix);
    $("btn-clear").addEventListener("click", clearSlots);
    $("btn-next").addEventListener("click", next);
    window.addEventListener("resize", () => { const last = state.results[state.results.length - 1]; if (state.phase === "judged" && last) fillBowl(last.rgb); });
    showScreen("start");
  }
  init();
})();
