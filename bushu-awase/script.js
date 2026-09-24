/* ===================================================
   部首あわせ - ゲームロジック
   6つの部品（3つの漢字ぶん）を出し、2つタップでくっつける。
   漢字になれば +1、3つ作ると次のセット。60秒で何字できるか。
   セットは「意図しない組み合わせが別の漢字にならない」ものだけ出す。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const DATA = globalThis.BUSHU_DATA;   // [漢字, 部品A, 部品B, 読み]
  const TIME_LIMIT = 60;
  const PASS_PENALTY = 5;
  const BEST_KEY = "bushu-awase-best";

  // 部品の組み合わせ（順不同）→ 漢字
  const pairKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  const PAIRS = new Map();
  for (const e of DATA) PAIRS.set(pairKey(e[1], e[2]), e);

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 3つの漢字を選んでセットにする。6部品がすべて違う文字で、
  // 意図しない2部品の組み合わせが収録漢字にならないことを確認する
  function makeSet(used) {
    let pool = DATA.filter((e) => !used.has(e[0]));
    if (pool.length < 3) pool = DATA.slice();
    for (let t = 0; t < 300; t++) {
      const cand = shuffle(pool.slice()).slice(0, 3);
      const parts = cand.flatMap((e) => [e[1], e[2]]);
      if (new Set(parts).size !== 6) continue;
      let ok = true;
      for (let i = 0; i < 6 && ok; i++) {
        for (let j = i + 1; j < 6; j++) {
          const hit = PAIRS.get(pairKey(parts[i], parts[j]));
          if (hit && !cand.includes(hit)) { ok = false; break; }
        }
      }
      if (ok) return cand;
    }
    return shuffle(pool.slice()).slice(0, 3);
  }

  // ---------- 状態 ----------
  const state = {
    phase: "start",
    score: 0,
    endAt: 0,
    raf: 0,
    set: [],          // 今のセットの漢字エントリ
    tiles: [],        // { part, el, done }
    selected: null,   // 選択中のタイル index
    busy: false,
    used: new Set(),
    log: [],
    msgTimer: 0,
  };

  // ---------- 進行 ----------
  function startGame() {
    state.score = 0;
    state.used = new Set();
    state.log = [];
    state.endAt = performance.now() + TIME_LIMIT * 1000;
    $("score-value").textContent = "0";
    $("time-penalty").textContent = "";
    showScreen("play");
    nextSet();
    cancelAnimationFrame(state.raf);
    tick();
  }

  function nextSet() {
    state.set = makeSet(state.used);
    for (const e of state.set) state.used.add(e[0]);
    const parts = shuffle(state.set.flatMap((e) => [e[1], e[2]]));
    state.tiles = parts.map((part) => ({ part, done: false }));
    state.selected = null;
    state.busy = false;
    renderTiles();
    setMade("？", "部品を2つ選ぼう", false);
    setMsg("");
  }

  function tick() {
    if (state.phase !== "play") return;
    const remainMs = Math.max(0, state.endAt - performance.now());
    $("time-value").textContent = String(Math.ceil(remainMs / 1000));
    $("time-fill").style.width = (remainMs / (TIME_LIMIT * 1000)) * 100 + "%";
    $("time-fill").classList.toggle("urgent", remainMs < 10000);
    if (remainMs <= 0) { finish(); return; }
    state.raf = requestAnimationFrame(tick);
  }

  // ---------- 表示 ----------
  function renderTiles() {
    const box = $("tiles");
    box.innerHTML = "";
    state.tiles.forEach((t, i) => {
      const b = document.createElement("button");
      b.className = "tile" + (t.done ? " done" : "") + (state.selected === i ? " sel" : "");
      b.textContent = t.part;
      b.disabled = t.done;
      b.setAttribute("aria-label", `部品 ${t.part}`);
      b.addEventListener("click", () => onTile(i));
      box.appendChild(b);
      t.el = b;
    });
  }

  function setMade(kanji, reading, big) {
    $("made-kanji").textContent = kanji;
    $("made-reading").textContent = reading;
    $("made").classList.toggle("hit", !!big);
    if (big) {
      $("made").classList.remove("pop");
      void $("made").offsetWidth;
      $("made").classList.add("pop");
    }
  }

  function setMsg(text) {
    clearTimeout(state.msgTimer);
    $("msg").textContent = text;
    $("msg").classList.toggle("show", !!text);
    if (text) state.msgTimer = setTimeout(() => $("msg").classList.remove("show"), 1500);
  }

  function shake(el) {
    if (!el) return;
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }

  function showPenalty() {
    const el = $("time-penalty");
    el.textContent = "−" + PASS_PENALTY + "秒";
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  // ---------- 操作 ----------
  function onTile(i) {
    if (state.phase !== "play" || state.busy) return;
    const t = state.tiles[i];
    if (t.done) return;
    if (state.selected === null) { state.selected = i; renderTiles(); return; }
    if (state.selected === i) { state.selected = null; renderTiles(); return; }
    const a = state.tiles[state.selected], b = t;
    const hit = PAIRS.get(pairKey(a.part, b.part));
    if (hit && state.set.includes(hit)) {
      a.done = b.done = true;
      state.selected = null;
      state.score++;
      $("score-value").textContent = String(state.score);
      state.log.push(hit);
      setMade(hit[0], hit[3], true);
      renderTiles();
      if (state.tiles.every((x) => x.done)) {
        state.busy = true;
        setTimeout(() => { if (state.phase === "play") nextSet(); }, 650);
      }
    } else {
      shake(a.el); shake(b.el);
      setMsg(`「${a.part}」と「${b.part}」はくっつかない`);
      state.selected = null;
      setTimeout(renderTiles, 350);
    }
  }

  function pass() {
    if (state.phase !== "play" || state.busy) return;
    state.endAt -= PASS_PENALTY * 1000;
    showPenalty();
    if (state.endAt - performance.now() <= 0) { finish(); return; }
    nextSet();
  }

  // ---------- 結果 ----------
  function comment(score) {
    if (score === 0) return "まずは「日」と「月」から。明るくなる。";
    if (score <= 4) return "小学校の漢字ドリルを思い出してきた。";
    if (score <= 9) return "いい調子。へんとつくりが見えてきた。";
    if (score <= 14) return "漢字検定の準備はできている。";
    if (score <= 19) return "書道の先生も一目置く速さ。";
    return "もはや辞書。部首をつかさどる者。";
  }

  function finish() {
    state.phase = "result";
    cancelAnimationFrame(state.raf);
    const best = loadBest();
    const isNew = state.score > best;
    if (isNew) saveBest(state.score);
    $("result-score").textContent = String(state.score);
    $("result-best").innerHTML = isNew
      ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！'
      : `自己ベスト ${best} 字`;
    $("result-comment").textContent = comment(state.score);
    const list = $("result-list");
    list.innerHTML = "";
    for (const e of state.log) {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.innerHTML = `<span class="chip-parts"></span><span class="chip-kanji"></span><span class="chip-reading"></span>`;
      chip.querySelector(".chip-parts").textContent = `${e[1]}＋${e[2]}`;
      chip.querySelector(".chip-kanji").textContent = e[0];
      chip.querySelector(".chip-reading").textContent = e[3];
      list.appendChild(chip);
    }
    const url = `${location.origin}${location.pathname}`;
    const made = state.log.slice(0, 8).map((e) => e[0]).join("");
    const text = `部首あわせ ✍️ 60秒で ${state.score}字 できた！${made ? `\n${made}` : ""}\n部品をくっつけて漢字を作るゲーム #Ludom`;
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
    if (state.phase === "start" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); startGame(); return; }
    if (state.phase === "result" && e.key === "Enter") { startGame(); return; }
    if (state.phase !== "play") return;
    if (/^[1-6]$/.test(e.key)) onTile(Number(e.key) - 1);
    else if (e.key === "p" || e.key === "P") pass();
  });

  // ---------- 初期化 ----------
  function init() {
    const best = loadBest();
    if (best > 0) { $("start-best").classList.remove("hidden"); $("start-best-value").textContent = String(best); }
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    $("btn-pass").addEventListener("click", pass);
    showScreen("start");
  }
  init();
})();
