/* ===================================================
   回転寿司カウント - ゲームロジック
   レーンを流れる皿を見せてから質問する、観察・記憶ゲーム。
   問が進むほど皿の数・種類・速さが増え、質問の種類も増える。
   3回まちがえたら閉店。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const BEST_KEY = "sushi-count-best";
  const LIVES = 3;
  const ANSWER_TIME = 8;      // 回答の制限時間（秒）
  const PLATE_W = 76;         // 皿の幅（px）

  // 皿の色ごとの値段（回転寿司の定番）
  const PLATE = {
    white: { color: "#e6e6e6", price: 100, label: "白" },
    blue:  { color: "#3b6fd6", price: 150, label: "青" },
    red:   { color: "#d7263d", price: 200, label: "赤" },
    gold:  { color: "#d4a017", price: 300, label: "金" },
  };
  const TYPES = [
    { id: "salmon", name: "サーモン", plate: "blue" },
    { id: "maguro", name: "まぐろ", plate: "red" },
    { id: "tamago", name: "たまご", plate: "white" },
    { id: "ebi", name: "えび", plate: "blue" },
    { id: "ikura", name: "いくら", plate: "gold" },
    { id: "kappa", name: "かっぱ巻き", plate: "white" },
  ];

  // ---------- 寿司の絵（上から見た皿） ----------
  function sushiSVG(type) {
    const rim = PLATE[type.plate].color;
    const rice = `<rect x="27" y="42" width="46" height="24" rx="10" fill="#fff" stroke="#ddd" stroke-width="1.5"/>`;
    let top = "";
    switch (type.id) {
      case "salmon":
        top = rice + `<rect x="22" y="33" width="56" height="26" rx="12" fill="#f28c38"/>
          <path d="M36,36 L30,56 M50,36 L44,56 M64,36 L58,56" stroke="#ffd7b5" stroke-width="3" stroke-linecap="round"/>`;
        break;
      case "maguro":
        top = rice + `<rect x="22" y="33" width="56" height="26" rx="12" fill="#c8323f"/>
          <rect x="28" y="37" width="30" height="6" rx="3" fill="#e0606c" opacity="0.8"/>`;
        break;
      case "tamago":
        top = rice + `<rect x="22" y="31" width="56" height="28" rx="6" fill="#f5c542"/>
          <rect x="44" y="28" width="12" height="36" rx="2" fill="#222"/>`;
        break;
      case "ebi":
        top = rice + `<rect x="22" y="33" width="50" height="26" rx="12" fill="#f7b09e"/>
          <path d="M34,36 L30,46 L34,56 M46,36 L42,46 L46,56 M58,36 L54,46 L58,56" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
          <path d="M70,40 L82,34 L80,46 L82,58 L70,52 Z" fill="#f28c38"/>`;
        break;
      case "ikura":
        top = `<rect x="26" y="30" width="48" height="40" rx="8" fill="#1f1f1f"/>
          <rect x="30" y="34" width="40" height="32" rx="5" fill="#2f2f2f"/>
          <g fill="#ff7f2a"><circle cx="38" cy="42" r="6"/><circle cx="50" cy="42" r="6"/><circle cx="62" cy="42" r="6"/><circle cx="38" cy="56" r="6"/><circle cx="50" cy="56" r="6"/><circle cx="62" cy="56" r="6"/></g>
          <g fill="#ffd0a8"><circle cx="36" cy="40" r="2"/><circle cx="48" cy="40" r="2"/><circle cx="60" cy="40" r="2"/><circle cx="36" cy="54" r="2"/><circle cx="48" cy="54" r="2"/><circle cx="60" cy="54" r="2"/></g>`;
        break;
      case "kappa":
        top = `<g><circle cx="38" cy="50" r="16" fill="#1f1f1f"/><circle cx="38" cy="50" r="12" fill="#fff"/><circle cx="38" cy="50" r="5" fill="#3fa34d"/>
          <circle cx="63" cy="50" r="16" fill="#1f1f1f"/><circle cx="63" cy="50" r="12" fill="#fff"/><circle cx="63" cy="50" r="5" fill="#3fa34d"/></g>`;
        break;
    }
    return `<svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="#fff" stroke="${rim}" stroke-width="7"/>
      <circle cx="50" cy="50" r="35" fill="none" stroke="#eee" stroke-width="1.5"/>
      ${top}
    </svg>`;
  }

  // ---------- 難易度 ----------
  function paramsFor(r) {
    const n = Math.min(14, 5 + r);                              // 皿の数
    const typeCount = Math.min(TYPES.length, 3 + Math.floor((r - 1) / 3)); // 種類
    const speed = Math.min(0.8, 0.32 + 0.035 * r);              // レーン幅／秒
    const askBefore = r <= 3;                                   // 質問を先に見せる
    const pool = ["count"];
    if (r >= 4) pool.push("order");
    if (r >= 7) pool.push("most");
    if (r >= 10) pool.push("price");
    return { n, typeCount, speed, askBefore, pool };
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ---------- 状態 ----------
  const state = {
    phase: "start",     // start | belt | question | result
    round: 0,
    score: 0,
    lives: LIVES,
    order: [],          // この回の種類の並び（問が進むと先頭から使う数が増える）
    seq: [],            // 今の問で流れる皿
    question: null,     // { type, text, answer, choices, legend }
    log: [],
    plates: [],
    spawnIndex: 0,
    beltOffset: 0,
    lastT: 0,
    raf: 0,
    deadline: 0,
    answered: false,
  };

  // ---------- 進行 ----------
  function startGame() {
    state.round = 0;
    state.score = 0;
    state.lives = LIVES;
    state.order = shuffle(TYPES.slice());
    state.log = [];
    $("score-value").textContent = "0";
    renderLives();
    showScreen("play");
    nextRound();
  }

  function nextRound() {
    state.round++;
    const p = paramsFor(state.round);
    const active = state.order.slice(0, p.typeCount);
    // 皿の並び：同じ種類ばかりにならないよう、最低2種類は混ぜる
    let seq;
    do {
      seq = Array.from({ length: p.n }, () => pick(active));
    } while (new Set(seq.map((t) => t.id)).size < Math.min(2, active.length));
    state.seq = seq;
    state.question = buildQuestion(pick(p.pool), seq, active);
    $("round-value").textContent = String(state.round);
    $("qbox").classList.add("hidden");
    $("feedback").textContent = "";
    $("feedback").className = "feedback";
    $("banner").textContent = p.askBefore
      ? `「${state.question.target}」は何皿？ 数えて！`
      : "流れる皿を覚えて…";
    $("banner").classList.remove("hidden");
    startBelt(p.speed);
  }

  // ---------- 質問 ----------
  function buildQuestion(kind, seq, active) {
    const counts = {};
    for (const t of seq) counts[t.id] = (counts[t.id] || 0) + 1;
    const names = TYPES.map((t) => t.name);

    if (kind === "most") {
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (sorted.length < 2 || sorted[0][1] === sorted[1][1]) kind = "count"; // 同数なら数える問題に
      else {
        const answer = TYPES.find((t) => t.id === sorted[0][0]).name;
        return { kind, text: "いちばん多かったのは？", answer, choices: nameChoices(answer, active) };
      }
    }
    if (kind === "order") {
      const k = 1 + Math.floor(Math.random() * seq.length);
      const answer = seq[k - 1].name;
      return { kind, text: `${k}番目に通ったのは？`, answer, choices: nameChoices(answer, active) };
    }
    if (kind === "price") {
      const sum = seq.reduce((s, t) => s + PLATE[t.plate].price, 0);
      const set = new Set([sum]);
      const deltas = shuffle([-200, -150, -100, -50, 50, 100, 150, 200]);
      for (const d of deltas) { if (set.size >= 4) break; if (sum + d > 0) set.add(sum + d); }
      const legend = [...new Set(seq.map((t) => t.plate))].map((c) => `${PLATE[c].label}皿 ${PLATE[c].price}円`).join("　");
      return { kind, text: "全部で いくら？", answer: `${sum}円`, choices: shuffle([...set].map((v) => `${v}円`)), legend };
    }
    // count
    let target;
    if (Math.random() < 0.85) target = pick(active.filter((t) => counts[t.id]));
    else target = pick(active.filter((t) => !counts[t.id])) || pick(active);
    const answer = counts[target.id] || 0;
    const set = new Set([answer]);
    for (const d of shuffle([-2, -1, 1, 2, 3, -3])) { if (set.size >= 4) break; if (answer + d >= 0) set.add(answer + d); }
    return { kind, target: target.name, text: `「${target.name}」は何皿通った？`, answer: `${answer}皿`, choices: shuffle([...set].map((v) => `${v}皿`)) };
  }

  function nameChoices(answer, active) {
    const others = shuffle(TYPES.filter((t) => t.name !== answer).map((t) => t.name));
    // まず出題中の種類を優先して混ぜる
    const activeNames = active.map((t) => t.name).filter((n) => n !== answer);
    const pool = [...new Set([...shuffle(activeNames), ...others])].slice(0, 3);
    return shuffle([answer, ...pool]);
  }

  // ---------- ベルト ----------
  function startBelt(speed) {
    const lane = $("lane");
    lane.innerHTML = "";
    state.plates = [];
    state.spawnIndex = 0;
    state.phase = "belt";
    state.lastT = performance.now();
    const laneW = lane.clientWidth;
    const gap = PLATE_W * 1.7;
    cancelAnimationFrame(state.raf);
    const tick = (now) => {
      if (state.phase !== "belt") return;
      const dt = Math.min(0.05, (now - state.lastT) / 1000);
      state.lastT = now;
      const dx = speed * laneW * dt;
      state.beltOffset += dx;
      lane.style.backgroundPositionX = `${-state.beltOffset}px`;
      for (const p of state.plates) {
        p.x -= dx;
        p.el.style.transform = `translateX(${p.x}px)`;
      }
      // 画面外へ出た皿を片付ける
      state.plates = state.plates.filter((p) => {
        if (p.x < -PLATE_W - 10) { p.el.remove(); return false; }
        return true;
      });
      // 次の皿を流す
      const last = state.plates[state.plates.length - 1];
      if (state.spawnIndex < state.seq.length && (!last || last.x <= laneW + 10 - gap)) {
        const type = state.seq[state.spawnIndex++];
        const el = document.createElement("div");
        el.className = "plate";
        el.dataset.type = type.id;
        el.setAttribute("aria-label", type.name);
        el.innerHTML = sushiSVG(type);
        el.style.transform = `translateX(${laneW + 10}px)`;
        lane.appendChild(el);
        state.plates.push({ el, x: laneW + 10, type });
      }
      if (state.spawnIndex >= state.seq.length && state.plates.length === 0) { askQuestion(); return; }
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
  }

  function askQuestion() {
    state.phase = "question";
    state.answered = false;
    const q = state.question;
    $("banner").textContent = "はい、質問！";
    $("q-text").textContent = q.text;
    const legend = $("legend");
    legend.classList.toggle("hidden", !q.legend);
    legend.textContent = q.legend || "";
    const box = $("choices");
    box.innerHTML = "";
    q.choices.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = `<span class="choice-key">${i + 1}</span>${c}`;
      b.addEventListener("click", () => answer(c));
      box.appendChild(b);
    });
    $("qbox").classList.remove("hidden");
    state.deadline = performance.now() + ANSWER_TIME * 1000;
    const fill = $("timer-fill");
    fill.classList.remove("urgent");
    const tick = () => {
      if (state.phase !== "question" || state.answered) return;
      const remain = Math.max(0, state.deadline - performance.now());
      fill.style.width = `${(remain / (ANSWER_TIME * 1000)) * 100}%`;
      fill.classList.toggle("urgent", remain < 3000);
      if (remain <= 0) { answer(null); return; }
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
  }

  function answer(choice) {
    if (state.phase !== "question" || state.answered) return;
    state.answered = true;
    const q = state.question;
    const ok = choice === q.answer;
    for (const b of document.querySelectorAll(".choice")) {
      const label = b.textContent.replace(/^\d/, "");
      if (label === q.answer) b.classList.add("correct");
      else if (label === choice) b.classList.add("wrong");
      b.disabled = true;
    }
    const fb = $("feedback");
    if (ok) {
      state.score++;
      $("score-value").textContent = String(state.score);
      fb.textContent = "正解！";
      fb.className = "feedback ok";
    } else {
      state.lives--;
      renderLives();
      fb.textContent = choice === null ? `時間切れ… 答えは「${q.answer}」` : `ざんねん… 答えは「${q.answer}」`;
      fb.className = "feedback ng";
    }
    state.log.push({ round: state.round, text: q.text, answer: q.answer, ok, timeout: choice === null });
    setTimeout(() => {
      if (state.lives <= 0) finish();
      else nextRound();
    }, ok ? 900 : 1500);
  }

  function renderLives() {
    $("lives-value").innerHTML = Array.from({ length: LIVES }, (_, i) =>
      `<span class="${i < state.lives ? "" : "lost"}">🍵</span>`).join("");
  }

  // ---------- 結果 ----------
  function comment(score) {
    if (score === 0) return "皿は速い。まずはサーモンだけ数えよう。";
    if (score <= 3) return "ウォーミングアップ完了。次は皿の色も見てみよう。";
    if (score <= 6) return "常連の目。板前さんも一目置く。";
    if (score <= 9) return "レーンが止まって見える域。";
    if (score <= 12) return "回転寿司の妖精。";
    return "もはや店長。皿の総額まで言い当てる。";
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
      : `自己ベスト ${best} 問`;
    $("result-comment").textContent = comment(state.score);
    const list = $("result-list");
    list.innerHTML = "";
    for (const e of state.log) {
      const li = document.createElement("li");
      li.className = "result-item " + (e.ok ? "ok" : "ng");
      li.innerHTML = `<span class="ri-round">第${e.round}問</span><span class="ri-text"></span><span class="ri-ans"></span>`;
      li.querySelector(".ri-text").textContent = e.text;
      li.querySelector(".ri-ans").textContent = (e.ok ? "○ " : e.timeout ? "⏱ " : "× ") + e.answer;
      list.appendChild(li);
    }
    const url = `${location.origin}${location.pathname}`;
    const text = `回転寿司カウント 🍣 ${state.score}問正解！\n流れる皿を覚える観察・記憶ゲーム #Ludom`;
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
    if (name !== "play") state.phase = name;
    window.scrollTo(0, 0);
  }

  // ---------- キーボード ----------
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (state.phase === "start" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); startGame(); return; }
    if (state.phase === "result" && e.key === "Enter") { startGame(); return; }
    if (state.phase === "question" && /^[1-4]$/.test(e.key)) {
      const c = state.question.choices[Number(e.key) - 1];
      if (c !== undefined) answer(c);
    }
  });

  // ---------- 初期化 ----------
  function init() {
    // スタート画面の飾り：皿を3つ並べる
    $("start-art").innerHTML = ["salmon", "ikura", "tamago"].map((id) =>
      `<div class="art-plate">${sushiSVG(TYPES.find((t) => t.id === id))}</div>`).join("");
    const best = loadBest();
    if (best > 0) { $("start-best").classList.remove("hidden"); $("start-best-value").textContent = String(best); }
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    showScreen("start");
  }
  init();
})();
