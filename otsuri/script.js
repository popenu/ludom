/* ===================================================
   おつり名人 - ゲームロジック
   主人公「薄井さいふ」になって、1日10軒の買い物をする。
   財布は持ち越し。払い方を工夫して、会計後の財布の小銭（硬貨）を
   できるだけ少なくする。各会計の最善は DP で計算して採点する。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const BEST_KEY = "otsuri-best";
  const INTRO_KEY = "otsuri-intro-seen";
  const ROUNDS = 10;           // 1日の買い物の軒数
  const GAUGE = 15;            // 行列のイライラゲージ（秒）
  const GRACE = 6;             // この秒数までは時間の減点なし
  const TIME_PENALTY = 20;     // ゲージ切れ直前の最大減点
  const MISS_PENALTY = 25;     // 最善より硬貨が1枚多いごとの減点

  const DENOMS = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1];   // 大きい順
  const isCoin = (d) => d <= 500;
  const CHANGE_ALL = [5000, 1000, 500, 100, 50, 10, 5, 1];    // 店のお釣り（最少枚数）
  const CHANGE_VENDING = [500, 100, 50, 10];                   // 自販機のお釣り

  const RANKS = [
    { min: 950, name: "キャッシュレス仙人", comment: "財布は紙のように薄い。小銭のほうから避けていく。" },
    { min: 850, name: "端数の魔術師", comment: "「あ、27円あります」が口癖。レジの人もちょっと感動している。" },
    { min: 700, name: "小銭ハンター", comment: "狙った小銭は逃さない。たまに5円玉を見落とす。" },
    { min: 550, name: "財布ダイエット中", comment: "成果は出ている。リバウンドに気をつけて。" },
    { min: 400, name: "ちょっと重め", comment: "ポケットがほんのり重い。歩くとチャリっと鳴る。" },
    { min: -1, name: "小銭ジャラジャラ", comment: "財布が貯金箱になりつつある。まずは1円玉から出してみよう。" },
  ];

  // ---------- お店 ----------
  // price() は会計金額。allowed は使えるお金（自販機は硬貨1・5円と大きい札が使えない）
  const r10 = (a, b) => randInt(a / 10, b / 10) * 10;
  const SHOPS = [
    { name: "コンビニ", icon: "🏪", price: () => randInt(158, 1480), lines: ["ありがとうございましたー", "レシートどうぞ", "またお越しくださいませ"] },
    { name: "ラーメン屋", icon: "🍜", price: () => pick([780, 850, 880, 930, 980, 1050, 1180]) + pick([0, 0, 100, 150]), lines: ["まいど！", "替え玉どうでした？"] },
    { name: "駄菓子屋", icon: "🍬", price: () => randInt(23, 386), lines: ["はい、おつりね", "当たり出た？"] },
    { name: "自販機", icon: "🥤", price: () => r10(110, 200), vending: true, lines: ["（ピッ）"] },
    { name: "書店", icon: "📚", price: () => pick([528, 693, 748, 836, 990, 1078, 1320, 1540, 1760, 2090]), lines: ["カバーおかけしておきました", "しおりどうぞ"] },
    { name: "八百屋", icon: "🥬", price: () => randInt(12, 98) * 10 + pick([0, 3, 4, 8]), lines: ["おまけしとくよ！", "今日はトマトがいいよ"] },
    { name: "100円ショップ", icon: "🛍️", price: () => 110 * randInt(1, 9), lines: ["ありがとうございました", "レシートお返しです"] },
    { name: "カフェ", icon: "☕", price: () => pick([380, 420, 495, 530, 590, 640, 715, 860]), lines: ["お席でお待ちください", "ごゆっくりどうぞ"] },
    { name: "ドラッグストア", icon: "💊", price: () => randInt(298, 3280), lines: ["ポイント2倍デーです", "レシートどうぞ"] },
    { name: "定食屋", icon: "🍱", price: () => pick([680, 750, 820, 900, 950, 1100, 1250]), lines: ["ごはんおかわり無料だよ", "毎度あり！"] },
    { name: "銭湯", icon: "♨️", price: () => pick([520, 550, 580]) + pick([0, 0, 50, 120]), lines: ["ごゆっくり", "いい湯だよ"] },
    { name: "パン屋", icon: "🥐", price: () => randInt(216, 1296), lines: ["焼きたてです", "ありがとうございました"] },
  ];
  const TIMES = ["7:40", "8:15", "10:30", "12:05", "13:20", "15:10", "16:45", "18:00", "19:30", "21:15"];

  // ---------- 小道具 ----------
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const yen = (n) => "¥" + n.toLocaleString("ja-JP");
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const emptyCounts = () => Object.fromEntries(DENOMS.map((d) => [d, 0]));
  const sumOf = (c) => DENOMS.reduce((s, d) => s + d * (c[d] || 0), 0);
  const coinsOf = (c) => DENOMS.reduce((s, d) => s + (isCoin(d) ? c[d] || 0 : 0), 0);
  const piecesOf = (c) => DENOMS.reduce((s, d) => s + (c[d] || 0), 0);

  // ===================================================
  //  計算（DOM に依存しない部分。node でも検証できるよう OtsuriCore として公開）
  // ===================================================

  // 金額を最少枚数に分解（日本の硬貨・紙幣は貪欲法で最少）
  function greedy(amount, denoms) {
    const out = emptyCounts();
    for (const d of denoms) { out[d] = Math.floor(amount / d); amount -= out[d] * d; }
    return out;
  }

  // 店の対応：出しすぎで「お釣りと同じ種類のお金」が入っていたら、それを1枚ずつ返す。
  // （お釣りの最少分解は d を含むなら C−d の分解は d を1枚減らしたものになるので、結果の財布は変わらない）
  function settle(pay, price, changeDenoms) {
    pay = { ...pay };
    const returned = emptyCounts();
    for (;;) {
      const s = sumOf(pay);
      if (s < price) return { ok: false, short: price - s, pay, returned };
      const change = greedy(s - price, changeDenoms);
      const d = DENOMS.find((x) => pay[x] > 0 && change[x] > 0);
      if (d === undefined) return { ok: true, pay, returned, change, changeAmount: s - price };
      pay[d]--; returned[d]++;
    }
  }

  // 会計後の財布
  function after(wallet, pay, change) {
    const w = { ...wallet };
    for (const d of DENOMS) w[d] = w[d] - (pay[d] || 0) + (change[d] || 0);
    return w;
  }

  // 最善の払い方：会計後の硬貨の枚数が最少になる払い方を求める。
  // 支払額 S を固定すると、お釣り greedy(S−price) は決まるので
  //   会計後の硬貨 = 今の硬貨 − 出した硬貨 + お釣りの硬貨
  // となり、「ちょうど S を作るとき、出せる硬貨の最大枚数」を有界ナップサック DP で求めればよい。
  function optimize(wallet, price, allowed, changeDenoms) {
    const items = DENOMS.filter((d) => allowed.includes(d) && wallet[d] > 0);
    const smax = items.reduce((s, d) => s + d * wallet[d], 0);
    if (smax < price) return null;
    // layers[i][S] = 先頭 i 種類でちょうど S を作るときの「出す硬貨の最大枚数」（作れなければ −1）
    const layers = [new Int16Array(smax + 1).fill(-1)];
    layers[0][0] = 0;
    items.forEach((d, i) => {
      const prev = layers[i], cur = new Int16Array(smax + 1).fill(-1);
      const k = wallet[d], c = isCoin(d) ? 1 : 0;
      for (let s = 0; s <= smax; s++) {
        let best = -1;
        for (let j = 0; j <= k && j * d <= s; j++) {
          const v = prev[s - j * d];
          if (v >= 0 && v + c * j > best) best = v + c * j;
        }
        cur[s] = best;
      }
      layers.push(cur);
    });
    const last = layers[items.length];
    const base = coinsOf(wallet);
    let bestS = -1, bestCoins = Infinity;
    for (let s = price; s <= smax; s++) {
      if (last[s] < 0) continue;
      const coins = base - last[s] + coinsOf(greedy(s - price, changeDenoms));
      if (coins < bestCoins) { bestCoins = coins; bestS = s; }   // 同点なら支払額が小さいほう
    }
    // 復元
    const pay = emptyCounts();
    let s = bestS;
    for (let i = items.length; i >= 1; i--) {
      const d = items[i - 1], c = isCoin(d) ? 1 : 0, target = layers[i][s];
      for (let j = 0; j <= wallet[d] && j * d <= s; j++) {
        const v = layers[i - 1][s - j * d];
        if (v >= 0 && v + c * j === target) { pay[d] = j; s -= j * d; break; }
      }
    }
    return { coins: bestCoins, pay };
  }

  // 何も考えない払い方（ゲージ切れのときの自動払い）：お札だけで足りる最小の組み合わせ。
  // お札で足りなければ、大きいお金から順に出す。
  function naivePay(wallet, price, allowed) {
    const bills = [10000, 5000, 1000].filter((d) => allowed.includes(d));
    const n = (d) => (bills.includes(d) ? wallet[d] : 0);
    let best = null;
    for (let a = 0; a <= n(10000); a++) for (let b = 0; b <= n(5000); b++) for (let c = 0; c <= n(1000); c++) {
      const s = a * 10000 + b * 5000 + c * 1000;
      if (s >= price && (!best || s < best.s || (s === best.s && a + b + c < best.k))) best = { s, k: a + b + c, a, b, c };
    }
    const pay = emptyCounts();
    if (best) { pay[10000] = best.a; pay[5000] = best.b; pay[1000] = best.c; return pay; }
    let s = 0;
    for (const d of DENOMS) {
      if (!allowed.includes(d)) continue;
      while (pay[d] < wallet[d] && s < price) { pay[d]++; s += d; }
    }
    return pay;
  }

  // 払い方 pay の結果（店の返却も込み）
  function outcome(wallet, price, pay, changeDenoms) {
    const st = settle(pay, price, changeDenoms);
    if (!st.ok) return st;
    return { ...st, wallet: after(wallet, st.pay, st.change), coins: coinsOf(after(wallet, st.pay, st.change)) };
  }

  const Core = { DENOMS, greedy, settle, after, optimize, naivePay, outcome, coinsOf, sumOf, emptyCounts };
  if (typeof module !== "undefined" && module.exports) module.exports = Core;
  if (typeof document === "undefined") return;   // node から読み込んだときはここまで

  // ===================================================
  //  ここから画面
  // ===================================================

  // ---------- 硬貨・紙幣の絵 ----------
  // 色・大きさは本物の雰囲気だけ。デザインは簡略化したオリジナル（肖像なし）
  const COIN = {
    1:   { g: ["#ffffff", "#c9ced5"], edge: "#9ea5ad", txt: "#6f7780", d: 20.0 },
    5:   { g: ["#f8dc85", "#c5952a"], edge: "#a07620", txt: "#7a5512", d: 22.0, hole: true },
    10:  { g: ["#eea271", "#a8552c"], edge: "#86401f", txt: "#5e2a12", d: 23.5 },
    50:  { g: ["#ffffff", "#b6bec7"], edge: "#8d959e", txt: "#5d656e", d: 21.0, hole: true, milled: true },
    100: { g: ["#f6f7f9", "#a9b1ba"], edge: "#848c95", txt: "#4f5760", d: 22.6, milled: true },
    500: { g: ["#f6edc4", "#b9a35a"], edge: "#93803d", txt: "#5b4c1c", d: 26.5, milled: true, ring: "#d9dde2" },
  };
  const BILL = {
    1000:  { bg: "#8fb4e6", dark: "#2f5ea8" },
    5000:  { bg: "#c3a6df", dark: "#6a3f98" },
    10000: { bg: "#d9c49a", dark: "#7a5a2a" },
  };

  // unit は500円玉の直径（px）
  function pieceSVG(v, unit) {
    if (BILL[v]) {
      const b = BILL[v];
      const w = Math.round(unit * 1.75), h = Math.round(unit * 0.9);
      return `<svg width="${w}" height="${h}" viewBox="0 0 140 72" aria-hidden="true">
        <rect x="1" y="1" width="138" height="70" rx="5" fill="${b.bg}" stroke="${b.dark}" stroke-width="2"/>
        <rect x="6" y="6" width="128" height="60" rx="3" fill="none" stroke="${b.dark}" stroke-width="1.2" opacity="0.55"/>
        <ellipse cx="32" cy="36" rx="17" ry="22" fill="#ffffff" opacity="0.55"/>
        <circle cx="32" cy="36" r="8" fill="none" stroke="${b.dark}" stroke-width="1.5" opacity="0.5"/>
        <text x="${v >= 10000 ? 94 : 96}" y="44" text-anchor="middle" font-size="${v >= 10000 ? 25 : 29}" font-weight="900" fill="${b.dark}" font-family="Menlo, monospace">${v}</text>
        <text x="96" y="60" text-anchor="middle" font-size="10" font-weight="700" fill="${b.dark}" opacity="0.8">LUDOM</text>
        <circle cx="124" cy="15" r="5" fill="${b.dark}" opacity="0.35"/>
      </svg>`;
    }
    const c = COIN[v];
    const s = Math.round(unit * c.d / 26.5);
    let body = `<circle cx="50" cy="50" r="48" fill="url(#cg${v})" stroke="${c.edge}" stroke-width="3"/>`;
    if (c.milled) body += `<circle cx="50" cy="50" r="44.5" fill="none" stroke="${c.edge}" stroke-width="3" stroke-dasharray="2 2.6" opacity="0.6"/>`;
    if (c.ring) body += `<circle cx="50" cy="50" r="34" fill="none" stroke="${c.ring}" stroke-width="6" opacity="0.7"/>`;
    body += `<circle cx="50" cy="50" r="40" fill="none" stroke="${c.edge}" stroke-width="1.5" opacity="0.45"/>`;
    if (c.hole) {
      body += `<circle cx="50" cy="38" r="11" fill="#00000055" stroke="${c.edge}" stroke-width="2"/>`;
      body += `<text x="50" y="80" text-anchor="middle" font-size="26" font-weight="900" fill="${c.txt}" font-family="Menlo, monospace">${v}</text>`;
    } else {
      const fs = v >= 100 ? 32 : 40;
      body += `<text x="50" y="${50 + fs * 0.36}" text-anchor="middle" font-size="${fs}" font-weight="900" fill="${c.txt}" font-family="Menlo, monospace">${v}</text>`;
    }
    return `<svg width="${s}" height="${s}" viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`;
  }

  // 硬貨のグラデーション定義を一度だけページに置く
  function injectDefs() {
    const grads = Object.entries(COIN).map(([v, c]) =>
      `<radialGradient id="cg${v}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${c.g[0]}"/><stop offset="1" stop-color="${c.g[1]}"/></radialGradient>`).join("");
    const holder = document.createElement("div");
    holder.innerHTML = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${grads}</defs></svg>`;
    document.body.appendChild(holder.firstChild);
  }

  // 金種ごとの枚数 → 硬貨・紙幣の絵の並び
  const piecesHTML = (counts, unit) => DENOMS.flatMap((d) => Array(counts[d] || 0).fill(pieceSVG(d, unit))).join("");
  const countsText = (counts) => DENOMS.filter((d) => counts[d] > 0).map((d) => `${d.toLocaleString("ja-JP")}円×${counts[d]}`).join("、");

  // ---------- 主人公（薄井さいふ） ----------
  function heroSVG(mood) {
    const skin = "#f6d6b8", hair = "#24304a";
    let eyes = `<circle cx="41" cy="47" r="3" fill="#24304a"/><circle cx="59" cy="47" r="3" fill="#24304a"/>`;
    let mouth = `<path d="M44,60 Q50,64 56,60" stroke="#24304a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    let extra = "";
    if (mood === "sad") {
      eyes = `<path d="M37,46 Q41,49 45,46 M55,46 Q59,49 63,46" stroke="#24304a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      mouth = `<path d="M44,63 Q50,57 56,63" stroke="#24304a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      extra = `<path d="M38,52 q-2,6 0,8 q2,-2 0,-8 Z" fill="#7cc0f0"/><path d="M33,36 L45,40 M67,36 L55,40" stroke="#24304a" stroke-width="2" stroke-linecap="round"/>`;
    } else if (mood === "fire") {
      eyes = `<circle cx="41" cy="48" r="3.2" fill="#24304a"/><circle cx="59" cy="48" r="3.2" fill="#24304a"/>`;
      extra = `<path d="M34,38 L46,43 M66,38 L54,43" stroke="#24304a" stroke-width="3" stroke-linecap="round"/>`;
      mouth = `<path d="M43,60 L57,60" stroke="#24304a" stroke-width="3" stroke-linecap="round"/>`;
    } else if (mood === "cool") {
      eyes = `<path d="M32,44 L68,44 L66,50 Q60,55 53,50 L50,47 L47,50 Q40,55 34,50 Z" fill="#1a1a1a"/><path d="M36,46 L42,46" stroke="#fff" stroke-width="1.5" opacity="0.7"/>`;
      mouth = `<path d="M44,60 Q52,64 58,58" stroke="#24304a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    } else if (mood === "happy") {
      eyes = `<path d="M37,48 Q41,43 45,48 M55,48 Q59,43 63,48" stroke="#24304a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      mouth = `<path d="M43,57 Q50,66 57,57 Z" fill="#c4473a"/>`;
      extra = `<circle cx="36" cy="55" r="3.5" fill="#f08f8f" opacity="0.55"/><circle cx="64" cy="55" r="3.5" fill="#f08f8f" opacity="0.55"/>`;
    }
    return `<svg viewBox="0 0 100 114" aria-hidden="true">
      <path d="M14,114 Q14,80 50,78 Q86,80 86,114 Z" fill="#2c9a8a"/>
      <path d="M40,80 L50,96 L60,80" fill="#fff"/>
      <rect x="44" y="66" width="12" height="14" fill="${skin}"/>
      <path d="M22,50 Q20,14 50,14 Q80,14 78,50 L78,64 L70,64 L70,40 L30,40 L30,64 L22,64 Z" fill="${hair}"/>
      <ellipse cx="50" cy="48" rx="23" ry="25" fill="${skin}"/>
      <path d="M27,42 Q34,24 52,24 Q70,24 74,42 Q60,32 46,34 Q36,36 27,42 Z" fill="${hair}"/>
      ${eyes}${mouth}${extra}
    </svg>`;
  }

  // 財布の絵。fat が大きいほど膨らむ
  function walletSVG(fat) {
    const bulge = 6 + fat * 10;
    const coins = fat ? `<g>
        <circle cx="38" cy="${22 - fat * 4}" r="9" fill="url(#cg10)" stroke="#86401f" stroke-width="1.5"/>
        <circle cx="54" cy="${18 - fat * 5}" r="10" fill="url(#cg500)" stroke="#93803d" stroke-width="1.5"/>
        <circle cx="70" cy="${22 - fat * 4}" r="8" fill="url(#cg1)" stroke="#9ea5ad" stroke-width="1.5"/>
        <circle cx="62" cy="${24 - fat * 3}" r="8" fill="url(#cg5)" stroke="#a07620" stroke-width="1.5"/>
      </g>` : "";
    return `<svg viewBox="0 0 110 90" aria-hidden="true">
      ${coins}
      <path d="M8,26 Q55,${26 - bulge} 102,26 L102,78 Q55,${78 + bulge} 8,78 Z" fill="#8a5a34" stroke="#5e3b1f" stroke-width="3"/>
      <path d="M14,32 Q55,${32 - bulge * 0.7} 96,32" stroke="#c99a5f" stroke-width="2" stroke-dasharray="4 3" fill="none"/>
      <path d="M8,26 L102,26" stroke="#e0b25a" stroke-width="3"/>
      <rect x="84" y="44" width="18" height="16" rx="4" fill="#6f4527"/><circle cx="92" cy="52" r="3" fill="#e0b25a"/>
    </svg>`;
  }

  // ---------- 効果音（Web Audio） ----------
  let actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq, start, dur, type = "sine", vol = 0.12) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + start;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const sfx = {
    coin(v) { const f = 2400 + (v % 7) * 120; tone(f, 0, 0.12, "sine", 0.07); tone(f * 1.5, 0.04, 0.14, "sine", 0.05); },
    bill() { tone(320, 0, 0.08, "triangle", 0.08); tone(260, 0.05, 0.08, "triangle", 0.06); },
    back() { tone(900, 0, 0.06, "sine", 0.06); },
    register() { tone(1320, 0, 0.45, "sine", 0.1); tone(1760, 0.08, 0.5, "sine", 0.07); },
    perfect() { tone(1320, 0, 0.3); tone(1760, 0.08, 0.3); tone(2640, 0.16, 0.6, "sine", 0.1); },
    ng() { tone(180, 0, 0.25, "square", 0.05); tone(140, 0.12, 0.3, "square", 0.05); },
  };

  // ---------- 状態 ----------
  const state = {
    phase: "start",     // start | intro | pay | settle | result
    wallet: null,
    tray: null,         // 出したお金（金種ごとの枚数）
    round: 0,
    shops: [],
    shop: null,
    price: 0,
    opt: null,          // 最善 { coins, pay }
    naive: 0,           // お札だけで払ったときの硬貨枚数
    score: 0,
    perfect: 0,
    startCoins: 0,
    log: [],
    payT: 0,
    raf: 0,
    pending: [],        // 財布へ飛んでいく途中のお釣り
    timers: [],
    afterIntro: null,
  };

  // ---------- 初期財布 ----------
  // 中途半端な小銭を持たせて、工夫すれば減らせるようにする
  function makeWallet() {
    const w = emptyCounts();
    w[10000] = 1;
    w[5000] = randInt(0, 1);
    w[1000] = randInt(2, 4);
    w[500] = randInt(0, 1);
    w[100] = randInt(1, 4);
    w[50] = randInt(0, 2);
    w[10] = randInt(2, 6);
    w[5] = randInt(0, 2);
    w[1] = randInt(2, 7);
    return w;
  }

  const allowedFor = (shop) => (shop.vending ? [1000, 500, 100, 50, 10] : DENOMS);
  const changeFor = (shop) => (shop.vending ? CHANGE_VENDING : CHANGE_ALL);

  // 会計金額を決める：工夫の余地（お札払いとの差）が大きい金額を優先
  function choosePrice(shop, wallet) {
    const allowed = allowedFor(shop), ch = changeFor(shop);
    const budget = allowed.reduce((s, d) => s + d * wallet[d], 0);
    let fallback = null;
    for (let i = 0; i < 25; i++) {
      let p = shop.price();
      if (p > budget * 0.6) p = Math.max(10, Math.floor(budget * (0.1 + Math.random() * 0.3) / 10) * 10 + (shop.vending ? 0 : randInt(0, 9)));
      if (p <= 0 || p > budget) continue;
      const opt = optimize(wallet, p, allowed, ch);
      if (!opt) continue;
      const nv = outcome(wallet, p, naivePay(wallet, p, allowed), ch).coins;
      const gain = nv - opt.coins;
      if (gain >= 2) return p;
      if (!fallback || gain > fallback.gain) fallback = { p, gain };
    }
    return fallback ? fallback.p : Math.min(budget, 100);
  }

  // ---------- 進行 ----------
  function onStart() {
    audio();
    if (!introSeen()) playIntro(startGame);
    else startGame();
  }

  function startGame() {
    clearTimers();
    state.wallet = makeWallet();
    state.startCoins = coinsOf(state.wallet);
    state.round = 0;
    state.score = 0;
    state.perfect = 0;
    state.log = [];
    state.shops = shuffle(SHOPS.slice()).slice(0, ROUNDS);
    $("score-value").textContent = "0";
    showScreen("play");
    nextShop();
  }

  function nextShop() {
    flushPending();
    state.round++;
    const shop = state.shops[state.round - 1];
    state.shop = shop;
    state.tray = emptyCounts();
    state.price = choosePrice(shop, state.wallet);
    state.opt = optimize(state.wallet, state.price, allowedFor(shop), changeFor(shop));
    state.naive = outcome(state.wallet, state.price, naivePay(state.wallet, state.price, allowedFor(shop)), changeFor(shop)).coins;
    state.phase = "pay";
    $("round-value").textContent = String(state.round);
    $("shop-icon").textContent = shop.icon;
    $("shop-name").textContent = shop.name;
    $("shop-time").textContent = TIMES[state.round - 1];
    $("price-value").textContent = yen(state.price);
    $("shop-note").textContent = shop.vending ? "1円・5円玉、5千円札・1万円札は使えません" : "";
    $("shop-note").classList.toggle("hidden", !shop.vending);
    clerk(shop.vending ? "（ピッ）お金を入れてください" : `${yen(state.price)}になります`);
    hero(pick(["さて、どう出す…", "小銭、減らしたい", "計算、計算…", "端数はいくつ？"]), "normal");
    $("pay-area").classList.remove("hidden");
    $("settle").classList.add("hidden");
    const shopCard = $("shop-card");
    shopCard.classList.remove("enter"); void shopCard.offsetWidth; shopCard.classList.add("enter");
    renderTray();
    renderWallet();
    state.payT = performance.now();
    cancelAnimationFrame(state.raf);
    tickGauge();
  }

  function tickGauge() {
    if (state.phase !== "pay") return;
    const t = (performance.now() - state.payT) / 1000;
    const rest = Math.max(0, 1 - t / GAUGE);
    const fill = $("gauge-fill");
    fill.style.width = `${(1 - rest) * 100}%`;
    fill.className = "gauge-fill" + (rest < 0.3 ? " hot" : rest < 0.6 ? " warm" : "");
    $("queue").textContent = "🧍".repeat(Math.min(5, 1 + Math.floor(t / 3.5)));
    if (rest <= 0) { timeUp(); return; }
    state.raf = requestAnimationFrame(tickGauge);
  }

  function clerk(text, cls) {
    const b = $("clerk-bubble");
    b.textContent = text;
    b.className = "bubble clerk" + (cls ? " " + cls : "");
    b.style.animation = "none"; void b.offsetWidth; b.style.animation = "";
  }
  function hero(text, mood) {
    $("hero-face").innerHTML = heroSVG(mood || "normal");
    $("hero-bubble").textContent = text;
  }

  // ---------- 財布・トレイ ----------
  function addPiece(d) {
    if (state.phase !== "pay") return;
    if (!allowedFor(state.shop).includes(d)) { clerk("そのお金は使えません", "angry"); sfx.ng(); return; }
    if (state.tray[d] >= state.wallet[d]) return;
    state.tray[d]++;
    d >= 1000 ? sfx.bill() : sfx.coin(d);
    renderTray();
    renderWallet();
  }
  function removePiece(d) {
    if (state.phase !== "pay" || !state.tray[d]) return;
    state.tray[d]--;
    sfx.back();
    renderTray();
    renderWallet();
  }
  function clearTray() {
    if (state.phase !== "pay" || !piecesOf(state.tray)) return;
    state.tray = emptyCounts();
    sfx.back();
    renderTray();
    renderWallet();
  }

  function renderTray() {
    const tray = $("tray");
    tray.innerHTML = "";
    for (const d of DENOMS) {
      for (let i = 0; i < state.tray[d]; i++) {
        const b = document.createElement("button");
        b.className = "piece";
        b.setAttribute("aria-label", `${d}円を財布に戻す`);
        b.innerHTML = pieceSVG(d, 34);
        b.addEventListener("click", () => removePiece(d));
        tray.appendChild(b);
      }
    }
    const sum = sumOf(state.tray);
    $("tray-sum").textContent = sum.toLocaleString("ja-JP");
    $("btn-pay").disabled = state.phase !== "pay" || sum === 0;
  }

  function renderWallet() {
    const w = state.wallet;
    const allowed = state.shop ? allowedFor(state.shop) : DENOMS;
    for (const d of DENOMS) {
      const slot = document.querySelector(`.slot[data-d="${d}"]`);
      const left = w[d] - (state.tray ? state.tray[d] : 0);
      slot.querySelector(".slot-count").textContent = `×${left}`;
      slot.classList.toggle("empty", left <= 0);
      slot.classList.toggle("banned", !allowed.includes(d));
    }
    $("coin-value").textContent = String(coinsOf(w));
    $("wallet-coins").textContent = String(coinsOf(w));
    $("wallet-total").textContent = sumOf(w).toLocaleString("ja-JP");
    $("wallet-art").innerHTML = walletSVG(Math.min(2, Math.floor(coinsOf(w) / 9)));
  }

  // ---------- 支払い ----------
  function pay() {
    if (state.phase !== "pay") return;
    const st = settle(state.tray, state.price, changeFor(state.shop));
    if (!st.ok) {
      clerk(`あと${yen(st.short)}足りません`, "angry");
      hero("えっ、あっ…", "sad");
      sfx.ng();
      const card = $("shop-card");
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      return;
    }
    finishPay(st, false);
  }

  function timeUp() {
    if (state.phase !== "pay") return;
    const shop = state.shop;
    const p = naivePay(state.wallet, state.price, allowedFor(shop));
    const st = settle(p, state.price, changeFor(shop));
    clerk("お客様、後ろが詰まってますので…！", "angry");
    finishPay(st, true);
  }

  function finishPay(st, auto) {
    state.phase = "settle";
    cancelAnimationFrame(state.raf);
    const secs = (performance.now() - state.payT) / 1000;
    const before = coinsOf(state.wallet);
    const res = coinsOf(after(state.wallet, st.pay, st.change));
    const opt = state.opt.coins;
    const diff = res - opt;
    const timePen = auto ? 0 : Math.round(TIME_PENALTY * Math.max(0, Math.min(1, (secs - GRACE) / (GAUGE - GRACE))));
    const pts = auto ? 0 : Math.max(0, 100 - MISS_PENALTY * diff - timePen);
    const isPerfect = !auto && diff === 0;
    state.score += pts;
    if (isPerfect) state.perfect++;
    $("score-value").textContent = String(state.score);

    // 財布から出したお金を引く（お釣りはアニメーションで入れる）
    for (const d of DENOMS) state.wallet[d] -= st.pay[d];
    state.tray = emptyCounts();
    renderWallet();

    // セリフ
    const returnedAny = piecesOf(st.returned) > 0;
    if (!auto) {
      if (returnedAny) clerk("こちらはお返ししますね", "");
      else if (st.changeAmount === 0) clerk("ちょうどお預かりします", "happy");
      else clerk(pick(state.shop.lines), "");
    }
    if (auto) hero("あっ…お札で…（ジャラ…）", "sad");
    else if (isPerfect) hero(pick(["完璧。財布が軽い。", "フッ…計算通り。", "小銭よ、さらば。", "これが、薄井流。"]), "cool");
    else if (diff === 1) hero(pick(["惜しい…1枚多い", "ぐぬぬ、もう少し"]), "normal");
    else hero(pick(["ジャラ…（重い）", "小銭が…増えた…", "財布が、太る…"]), "sad");
    auto || isPerfect ? (isPerfect ? sfx.perfect() : sfx.ng()) : sfx.register();

    // 精算パネル
    $("pay-area").classList.add("hidden");
    const box = $("settle");
    box.classList.remove("hidden");
    $("settle-paid").innerHTML = `${yen(sumOf(st.pay))}<span class="mini-pieces">${piecesHTML(st.pay, 18)}</span>`;
    $("settle-returned-row").classList.toggle("hidden", !returnedAny);
    $("settle-returned").innerHTML = piecesHTML(st.returned, 18);
    $("settle-change").innerHTML = st.changeAmount ? `${yen(st.changeAmount)}` : "なし（ちょうど）";
    const changeBox = $("settle-change-pieces");
    changeBox.innerHTML = "";
    for (const d of DENOMS) for (let i = 0; i < st.change[d]; i++) {
      const s = document.createElement("span");
      s.className = "change-piece";
      s.dataset.d = d;
      s.innerHTML = pieceSVG(d, 30);
      changeBox.appendChild(s);
    }
    const stamp = $("settle-stamp");
    stamp.className = "settle-stamp " + (auto ? "ng" : isPerfect ? "perfect" : diff <= 1 ? "ok" : "ng");
    stamp.textContent = auto ? "時間切れ" : isPerfect ? "完璧！" : `最善より +${diff}枚`;
    $("settle-coins").innerHTML = `小銭 <b>${before}</b> → <b class="${isPerfect ? "good" : "bad"}">${res}</b> 枚<small>（最善 ${opt} 枚／お札だけなら ${state.naive} 枚）</small>`;
    $("settle-pts").textContent = auto ? "+0" : `+${pts}` + (timePen ? `（遅れ −${timePen}）` : "");
    $("settle-best").textContent = isPerfect ? "" : `最善の出し方：${countsText(state.opt.pay) || "—"}`;
    $("btn-next").textContent = state.round >= ROUNDS ? "1日の結果へ" : "次のお店へ";

    state.log.push({ shop: state.shop, price: state.price, res, opt, pts, auto, perfect: isPerfect });

    // お釣りが財布に飛んでいく
    state.pending = [];
    const els = [...changeBox.children];
    els.forEach((el, i) => {
      const d = Number(el.dataset.d);
      state.pending.push(d);
      state.timers.push(setTimeout(() => flyToWallet(el, d), 650 + i * 110));
    });
  }

  function flyToWallet(el, d) {
    const idx = state.pending.indexOf(d);
    if (idx < 0) return;
    const slot = document.querySelector(`.slot[data-d="${d}"]`);
    const a = el.getBoundingClientRect(), b = slot.getBoundingClientRect();
    const fly = document.createElement("div");
    fly.className = "flyer";
    fly.innerHTML = el.innerHTML;
    fly.style.left = `${a.left}px`;
    fly.style.top = `${a.top}px`;
    document.body.appendChild(fly);
    el.classList.add("gone");
    requestAnimationFrame(() => {
      fly.style.transform = `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(0.6)`;
      fly.style.opacity = "0.2";
    });
    state.timers.push(setTimeout(() => {
      fly.remove();
      const i = state.pending.indexOf(d);
      if (i < 0) return;
      state.pending.splice(i, 1);
      state.wallet[d]++;
      d >= 1000 ? sfx.bill() : sfx.coin(d);
      renderWallet();
      slot.classList.remove("pop"); void slot.offsetWidth; slot.classList.add("pop");
    }, 480));
  }

  // 途中のお釣りをまとめて財布へ
  function flushPending() {
    clearTimers();
    for (const d of state.pending) state.wallet[d]++;
    state.pending = [];
    document.querySelectorAll(".flyer").forEach((f) => f.remove());
  }
  function clearTimers() {
    state.timers.forEach(clearTimeout);
    state.timers = [];
  }

  function onNext() {
    if (state.phase !== "settle") return;
    if (state.round >= ROUNDS) { flushPending(); finish(); }
    else nextShop();
  }

  // ---------- 結果 ----------
  function finish() {
    state.phase = "result";
    cancelAnimationFrame(state.raf);
    const total = state.score;
    const rank = RANKS.find((r) => total >= r.min);
    const best = loadBest();
    const isNew = best === null || total > best;
    if (isNew) saveBest(total);
    const endCoins = coinsOf(state.wallet);
    $("result-rank").textContent = rank.name;
    $("result-total").textContent = String(total);
    $("result-best").innerHTML = isNew
      ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！'
      : `自己ベスト ${best} 点`;
    $("result-comment").textContent = rank.comment;
    $("result-coins").textContent = `${state.startCoins}→${endCoins}`;
    $("result-perfect").textContent = String(state.perfect);
    $("result-wallet").innerHTML = walletSVG(Math.min(2, Math.floor(endCoins / 9)));
    const list = $("result-list");
    list.innerHTML = "";
    for (const e of state.log) {
      const li = document.createElement("li");
      const mark = e.auto ? "時間切れ" : e.perfect ? "完璧" : `+${e.res - e.opt}枚`;
      const cls = e.auto ? "ng" : e.perfect ? "perfect" : e.res - e.opt <= 1 ? "ok" : "ng";
      li.innerHTML = `<span class="rl-shop">${e.shop.icon} ${e.shop.name}</span><span class="rl-price mono">${yen(e.price)}</span><span class="rl-mark ${cls}">${mark}</span><span class="rl-pts mono">${e.pts}</span>`;
      list.appendChild(li);
    }
    const url = `${location.origin}${location.pathname}`;
    const text = `おつり名人 👛 ${total}/1000点【${rank.name}】\n${ROUNDS}軒まわって小銭 ${state.startCoins}→${endCoins}枚・完璧${state.perfect}回\n#Ludom`;
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
  function introSeen() { try { return localStorage.getItem(INTRO_KEY) === "1"; } catch (e) { return false; } }
  function markIntroSeen() { try { localStorage.setItem(INTRO_KEY, "1"); } catch (e) { /* 保存できなくても遊べる */ } }

  function showScreen(name) {
    for (const s of ["start", "play", "result"]) $("screen-" + s).classList.toggle("hidden", s !== name);
    if (name !== "play") state.phase = name;
    window.scrollTo(0, 0);
  }

  // ===================================================
  //  導入ムービー（SVG/CSS アニメーション＋テロップ）
  // ===================================================
  const coinBurst = () => {
    // 財布から四方へ飛び散る小銭
    const kinds = [1, 5, 10, 50, 100, 1, 10, 1, 5, 10, 100, 1, 50, 10];
    return kinds.map((v, i) => {
      const ang = (i / kinds.length) * Math.PI * 2 + 0.2;
      const dx = Math.round(Math.cos(ang) * (110 + (i % 3) * 30));
      const dy = Math.round(Math.sin(ang) * (80 + (i % 4) * 20)) - 30;
      return `<span class="burst-coin" style="--dx:${dx}px;--dy:${dy}px;--rot:${(i % 2 ? 1 : -1) * (200 + i * 30)}deg">${pieceSVG(v, 30)}</span>`;
    }).join("");
  };

  const SCENES = [
    {
      dur: 3600, cls: "sepia",
      html: () => `<div class="sc-tag">― 3年前 ―</div>
        <div class="sc-wallet shake-loop">${walletSVG(2)}</div>
        <div class="sc-hero left">${heroSVG("sad")}</div>`,
      cap: "かつて、わたしの財布は<br><b>小銭でパンパン</b>だった。",
    },
    {
      dur: 3800, cls: "sepia",
      html: () => `<div class="sc-register">お会計 <span class="mono">¥1,001</span></div>
        <div class="sc-hero center">${heroSVG("sad")}</div>
        <div class="sc-say">1円…1円が…<br>どこかに…</div>
        <div class="sc-queue">🧍🧍🧍🧍<span class="ira">💢</span></div>`,
      cap: "1円玉を探して30秒。<br>背中に刺さる、<b>行列の視線</b>。",
    },
    {
      dur: 3600, cls: "sepia",
      html: () => `<div class="sc-wallet burst">${walletSVG(2)}</div>
        <div class="sc-burst">${coinBurst()}</div>
        <div class="sc-bang">バチーン!!</div>`,
      cap: "そしてある日――<br>財布のファスナーが、<b>はじけた</b>。",
    },
    {
      dur: 3800, cls: "fire",
      html: () => `<div class="sc-rays"></div>
        <div class="sc-hero big">${heroSVG("fire")}</div>
        <div class="sc-name">薄井 さいふ（28）</div>`,
      cap: "わたしは誓った。<br><b>小銭は、持たない。</b>",
    },
    {
      dur: 5200, cls: "",
      html: () => `<div class="sc-register">お会計 <span class="mono">¥3,527</span></div>
        <div class="sc-pay">${pieceSVG(10000, 34)}${pieceSVG(500, 34)}${pieceSVG(10, 34)}${pieceSVG(10, 34)}${pieceSVG(5, 34)}${pieceSVG(1, 34)}${pieceSVG(1, 34)}</div>
        <div class="sc-say2">「10,527円で。」</div>
        <div class="sc-change"><span class="lbl">お釣り ¥7,000</span>${pieceSVG(5000, 34)}${pieceSVG(1000, 34)}${pieceSVG(1000, 34)}</div>
        <div class="sc-hero right cool">${heroSVG("cool")}</div>
        <div class="sc-sparkle">✨</div>`,
      cap: "お釣りは、<b>お札だけで。</b>",
    },
    {
      dur: 3200, cls: "title",
      html: () => `<div class="sc-title">おつり<span>名人</span></div>
        <div class="sc-sub">薄井さいふの、小銭を持たない一日</div>
        <div class="sc-hero mini">${heroSVG("happy")}</div>`,
      cap: "",
    },
  ];

  let intro = { idx: -1, timer: 0, done: null };

  function playIntro(done) {
    state.phase = "intro";
    intro.done = done;
    intro.idx = -1;
    const ov = $("intro");
    ov.classList.remove("hidden");
    $("intro-dots").innerHTML = SCENES.map(() => "<span></span>").join("");
    nextScene();
  }
  function nextScene() {
    clearTimeout(intro.timer);
    intro.idx++;
    if (intro.idx >= SCENES.length) { endIntro(); return; }
    const sc = SCENES[intro.idx];
    const stage = $("intro-stage");
    stage.className = "intro-stage " + sc.cls;
    stage.innerHTML = `<div class="scene-art">${sc.html()}</div>`;
    const cap = $("intro-cap");
    cap.innerHTML = sc.cap;
    cap.classList.remove("show"); void cap.offsetWidth; cap.classList.add("show");
    [...$("intro-dots").children].forEach((d, i) => d.classList.toggle("on", i <= intro.idx));
    intro.timer = setTimeout(nextScene, sc.dur);
  }
  function endIntro() {
    clearTimeout(intro.timer);
    markIntroSeen();
    $("intro").classList.add("hidden");
    $("intro-stage").innerHTML = "";
    $("btn-intro").classList.remove("hidden");
    const done = intro.done;
    intro.done = null;
    if (done) done();
  }

  // ---------- 入力 ----------
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (state.phase === "intro") { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); endIntro(); } return; }
    if (state.phase === "start" || state.phase === "result") {
      if (e.key === "Enter") { e.preventDefault(); onStart(); }
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (state.phase === "pay") pay();
      else if (state.phase === "settle") onNext();
      return;
    }
    if (state.phase !== "pay") return;
    // 1〜9 キー：小さい順に 1円〜1万円
    if (/^[1-9]$/.test(e.key)) { addPiece(DENOMS[9 - Number(e.key)]); return; }
    if (e.key === "Escape") clearTray();
  });
  // iOS のダブルタップズーム対策
  document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });

  // ---------- 初期化 ----------
  function init() {
    injectDefs();
    const wallet = $("wallet-slots");
    DENOMS.forEach((d) => {
      const b = document.createElement("button");
      b.className = "slot" + (d >= 1000 ? " bill" : "");
      b.dataset.d = d;
      b.setAttribute("aria-label", `${d}円を出す`);
      b.innerHTML = `${pieceSVG(d, d >= 1000 ? 30 : 38)}<span class="slot-count">×0</span>`;
      b.addEventListener("click", () => addPiece(d));
      wallet.appendChild(b);
    });
    $("start-art").innerHTML = `<div class="art-wallet">${walletSVG(0)}</div><div class="art-hero">${heroSVG("cool")}</div>`;
    const best = loadBest();
    if (best !== null) { $("start-best").classList.remove("hidden"); $("start-best-value").textContent = String(best); }
    $("btn-intro").classList.toggle("hidden", !introSeen());
    $("btn-start").addEventListener("click", onStart);
    $("btn-retry").addEventListener("click", startGame);
    $("btn-intro").addEventListener("click", () => { audio(); playIntro(() => showScreen("start")); });
    $("btn-skip").addEventListener("click", endIntro);
    $("intro-stage").addEventListener("click", nextScene);
    $("btn-pay").addEventListener("click", pay);
    $("btn-clear").addEventListener("click", clearTray);
    $("btn-next").addEventListener("click", onNext);
    showScreen("start");
  }
  init();
})();
