/* ===================================================
   だるまさんがころんだ - ゲームロジック
   長押ししている間だけ前進し、離すと少し滑って止まる。
   鬼は「だるまさんがころんだ」を緩急つけて唱え、言い終わると振り返る。
   振り返り（猶予 GRACE_MS）のあとに動いていたらアウト。
   鬼にタッチでステージクリア。全5ステージの合計タイムを競う。
   描画は 360×480 の論理座標の Canvas。
=================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const BEST_KEY = "darumasan-best";
  const MUTE_KEY = "darumasan-mute";

  // ---------- 調整用の定数 ----------
  const W = 360, H = 480;          // 論理サイズ
  const CHANT = "だるまさんがころんだ".split(""); // 10文字
  const MAX_SPEED = 3.0;           // 最高速度 m/秒
  const ACCEL = 9;                 // 加速 m/秒²
  const DECEL = 18;                // 離したときの減速 m/秒²（＝滑り 約0.17秒・0.25m）
  const MOVE_EPS = 0.02;           // これより速ければ「動いている」
  const TURN_MS = 190;             // 振り返りアニメーション＝反応の猶予
  const TURNBACK_MS = 320;         // 後ろを向き直す時間（この間は判定しない）
  const FEINT_MS = 520;            // フェイント（振り返りかけて戻る）の時間
  const INTRO_MS = 1500;           // ステージ開始前の「よーい」

  // ステージ定義：距離、唱える基本間隔(ms)、パターンの出やすさ、フェイント確率、見ている秒数
  // obs：唱えるたびに障害物が出る確率、最大個数、横切る秒数、種類の出やすさ
  const STAGES = [
    { dist: 12, base: 330, feint: 0.0, watch: [1.4, 2.0], patterns: { normal: 1 },
      obs: null },
    { dist: 15, base: 300, feint: 0.12, watch: [1.5, 2.3], patterns: { normal: 3, hold: 1, rush: 1 },
      obs: { chance: 0.55, max: 1, cross: [2.4, 3.0], kinds: { tire: 1 } } },
    { dist: 18, base: 270, feint: 0.2, watch: [1.6, 2.6], patterns: { normal: 2, hold: 2, rush: 2, slowstart: 1, stutter: 1 },
      obs: { chance: 0.7, max: 1, cross: [2.0, 2.7], kinds: { tire: 1 } } },
    { dist: 21, base: 245, feint: 0.25, watch: [1.7, 3.0], patterns: { normal: 1, hold: 2, rush: 2, slowstart: 1, stutter: 2, burst: 1 },
      obs: { chance: 0.8, max: 2, cross: [1.8, 2.5], kinds: { tire: 3, ball: 1 } } },
    { dist: 24, base: 225, feint: 0.32, watch: [1.8, 3.4], patterns: { normal: 1, hold: 2, rush: 2, slowstart: 2, stutter: 2, burst: 2 },
      obs: { chance: 0.9, max: 2, cross: [1.5, 2.3], kinds: { tire: 2, ball: 1 } } },
  ];
  const OBS_WARN_MS = 750;         // 横から入ってくる前の予告時間
  const OBS_DEPTH = 0.45;          // 当たり判定の奥行き（m）
  const OBS_KINDS = {
    tire: { r: 17, speedK: 1, name: "タイヤ", sub: "タイヤにぶつかった" },
    ball: { r: 10, speedK: 1.6, name: "ボール", sub: "ボールが当たった" },
  };

  // 称号：クリアステージ数（と全クリア時のタイム）で決まる
  const RANKS = [
    { stages: 5, maxTime: 85, name: "気配ゼロの忍", comment: "鬼は振り返るたびに首をかしげていた。いつのまにか背中にタッチ。" },
    { stages: 5, maxTime: 110, name: "だるま名人", comment: "緩急を完全に読み切った。休み時間の伝説として語り継がれる。" },
    { stages: 5, maxTime: Infinity, name: "校庭の主", comment: "石橋を叩いて渡る慎重派。チャイムぎりぎりでも勝ちは勝ち。" },
    { stages: 4, name: "あと一歩の勇者", comment: "最後の鬼は本気だった。夕焼けが目にしみる。" },
    { stages: 3, name: "休み時間の常連", comment: "鬼のクセが見えてきた。手が早いと見つかる。" },
    { stages: 2, name: "つられ屋さん", comment: "急な早口や溜めの「だ！」に体が先に動くタイプ。" },
    { stages: 1, name: "元気な一年生", comment: "まっすぐ進む気持ちは満点。止まるのはこれから覚えよう。" },
    { stages: 0, name: "正直者", comment: "体が止まってくれない。素直なのはいいことです。" },
  ];

  // ---------- 小道具 ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => t * t * (3 - 2 * t);
  function pickWeighted(weights) {
    const keys = Object.keys(weights);
    let total = 0;
    for (const k of keys) total += weights[k];
    let r = Math.random() * total;
    for (const k of keys) { r -= weights[k]; if (r <= 0) return k; }
    return keys[0];
  }

  // ---------- 状態 ----------
  const S = {
    screen: "start",   // start | play | result
    phase: "idle",     // intro | play | out | clear
    clock: 0,          // ゲーム内時計(ms)。タブ非表示中は進まない
    phaseAt: 0,
    stage: 0,
    D: 12,             // ステージの距離
    d: 12,             // のこり距離
    speed: 0,
    holding: false,
    walk: 0,           // 歩きアニメの位相
    stepAcc: 0,        // 足音用
    stageStart: 0,
    results: [],       // { stage, dist, time } / { stage, dist, out:true, left, reason }
    oni: null,
    obstacles: [],     // 横切る障害物 { kind, laneD, x, vx, r, enterAt, spin }
    obsQueue: [],      // 出現予定の時刻(ms)
    outSub: "",
    lastFrame: 0,
  };

  function newOni() {
    return {
      mode: "back",    // back | chant | feint | turning | watch | turnback | caught | touched
      face: 0,         // 0=後ろ向き 1=こちら向き
      modeAt: 0,
      shown: 0,        // 表示済み文字数
      nextAt: 0,
      sched: [],
      feintAt: -1,     // この文字のあとにフェイント
      watchEnd: 0,
      pattern: "normal",
    };
  }

  // 唱えるスケジュールを作る（sched[i] = i文字目を出すまでの待ち時間ms）
  function makeChant(stage) {
    const p = STAGES[stage];
    const pattern = pickWeighted(p.patterns);
    const base = p.base * rand(0.8, 1.25); // 毎回速さが違う
    const d = CHANT.map(() => base * rand(0.85, 1.15));
    d[0] = rand(350, 700); // 向き直ってから唱え始めるまで
    const last = CHANT.length - 1;
    switch (pattern) {
      case "rush": { // 途中から急に早口
        const k = randInt(3, 7);
        for (let i = k; i <= last; i++) d[i] *= 0.4;
        break;
      }
      case "hold": { // 「ころん……だ！」と溜める
        d[last] = rand(700, 1300) + stage * 120;
        d[last - 1] *= 1.3;
        break;
      }
      case "slowstart": { // ゆーっくり始まって後半速い
        for (let i = 1; i <= 5; i++) d[i] *= 1.9;
        for (let i = 6; i <= last; i++) d[i] *= 0.55;
        break;
      }
      case "stutter": { // 途中で間を空けてから一気に
        const k = randInt(3, 7);
        d[k] += rand(600, 1100);
        for (let i = k + 1; i <= last; i++) d[i] *= 0.45;
        break;
      }
      case "burst": { // 最初から最後まで超早口
        for (let i = 1; i <= last; i++) d[i] *= 0.45;
        break;
      }
      default: break;
    }
    for (let i = 1; i <= last; i++) d[i] = Math.max(70, d[i]);
    const feintAt = Math.random() < p.feint ? randInt(2, 7) : -1;
    return { sched: d, pattern, feintAt };
  }

  function startChant(oni) {
    const c = makeChant(S.stage);
    oni.mode = "chant";
    oni.modeAt = S.clock;
    oni.shown = 0;
    oni.sched = c.sched;
    oni.pattern = c.pattern;
    oni.feintAt = c.feintAt;
    oni.nextAt = S.clock + c.sched[0];
    oni.face = 0;
    planObstacles(c.sched);
  }

  // ---------- 障害物（横から転がってくる） ----------
  // 唱えている間に出現させる。振り返っても止まらないので、レーン上で止まるのは危険
  function planObstacles(sched) {
    const ob = STAGES[S.stage].obs;
    S.obsQueue = [];
    if (!ob) return;
    const chantMs = sched.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ob.max; i++) {
      if (Math.random() >= ob.chance * (i === 0 ? 1 : 0.6)) break;
      S.obsQueue.push(S.clock + rand(250, Math.max(400, chantMs * 0.75)));
    }
  }

  function spawnObstacle() {
    const ob = STAGES[S.stage].obs;
    const kind = pickWeighted(ob.kinds);
    const K = OBS_KINDS[kind];
    // レーンはプレイヤーの少し先。鬼の目の前には出さない
    const laneD = S.d - rand(1.0, 3.2);
    if (laneD < 1.2) return;
    if (S.obstacles.some((o) => Math.abs(o.laneD - laneD) < 1.0)) return;
    const fromLeft = Math.random() < 0.5;
    const span = W + 80;
    const vx = (span / (rand(ob.cross[0], ob.cross[1]) * 1000)) * K.speedK * (fromLeft ? 1 : -1);
    S.obstacles.push({
      kind, laneD, vx, r: K.r,
      x: fromLeft ? -40 : W + 40,
      enterAt: S.clock + OBS_WARN_MS,
      spin: 0, bounce: rand(0, 6),
      rumbled: false,
    });
    sfx.warn();
  }

  function updateObstacles(dt) {
    while (S.obsQueue.length && S.clock >= S.obsQueue[0]) {
      S.obsQueue.shift();
      if (S.oni.mode === "chant" || S.oni.mode === "feint") spawnObstacle();
    }
    S.obsQueue.sort((a, b) => a - b);
    for (const o of S.obstacles) {
      if (S.clock < o.enterAt) continue;
      if (!o.rumbled) { o.rumbled = true; o.kind === "tire" ? sfx.rumble() : sfx.boing(); }
      o.x += o.vx * dt;
      o.spin += (o.vx * dt) / o.r;
      o.bounce += dt * 0.012;
    }
    S.obstacles = S.obstacles.filter((o) => o.x > -60 && o.x < W + 60);
  }

  // 障害物との当たり判定（画面上の横位置と、奥行きのレーンで判定）
  function hitObstacle() {
    const pp = playerPos();
    for (const o of S.obstacles) {
      if (S.clock < o.enterAt) continue;
      if (Math.abs(S.d - o.laneD) > OBS_DEPTH) continue;
      const lp = lanePos(o.laneD);
      if (Math.abs(o.x - pp.x) < (11 + o.r) * lp.s) return o;
    }
    return null;
  }

  // のこり距離 d の地点の画面上の位置と縮尺
  function lanePos(d) {
    const p = 1 - d / S.D;
    return { y: lerp(P_NEAR_Y, P_FAR_Y, p), s: lerp(1.25, 0.72, p) };
  }

  // ---------- 効果音（Web Audio） ----------
  let actx = null;
  let muted = false;
  function audio() {
    if (muted) return null;
    if (!actx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { actx = new C(); } catch (e) { return null; }
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq, dur, type, vol, slideTo, delay) {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    chant(i) { tone(480 + (i % 3) * 40 + rand(-10, 10), 0.09, "triangle", 0.09); },
    da() { tone(760, 0.22, "square", 0.08, 520); },
    turn() { tone(260, 0.16, "sine", 0.1, 900); },
    feint(delay) { tone(300, 0.12, "sine", 0.07, 520, delay); },
    step() { tone(140 + rand(-15, 15), 0.05, "sine", 0.06, 90); },
    out() { tone(620, 0.5, "sawtooth", 0.08, 140); tone(300, 0.5, "square", 0.04, 90, 0.05); },
    clear() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.1, null, i * 0.09)); },
    start() { tone(660, 0.12, "triangle", 0.08); tone(880, 0.16, "triangle", 0.08, null, 0.12); },
    warn() { tone(980, 0.07, "square", 0.05); tone(980, 0.07, "square", 0.05, null, 0.12); },
    rumble() { tone(70, 1.2, "sawtooth", 0.05, 55); },
    boing() { tone(300, 0.15, "sine", 0.09, 620); },
    bump() { tone(110, 0.3, "square", 0.1, 50); },
  };

  // ---------- Canvas ----------
  const canvas = $("stage");
  const ctx = canvas.getContext("2d");
  let bg = null; // 背景のキャッシュ
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || W;
    const scale = (cssW / W) * dpr;
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    bg = buildBackground(scale);
    draw();
  }

  // 校庭と夕焼けの背景（静的なのでオフスクリーンに描いておく）
  function buildBackground(scale) {
    const c = document.createElement("canvas");
    c.width = Math.round(W * scale);
    c.height = Math.round(H * scale);
    const g = c.getContext("2d");
    g.scale(scale, scale);
    const HORIZON = 150;

    // 空
    const sky = g.createLinearGradient(0, 0, 0, HORIZON);
    sky.addColorStop(0, "#3b2a5c");
    sky.addColorStop(0.5, "#b8566a");
    sky.addColorStop(0.85, "#f0905a");
    sky.addColorStop(1, "#f8c070");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, HORIZON);

    // 夕日
    const sunG = g.createRadialGradient(286, 132, 4, 286, 132, 80);
    sunG.addColorStop(0, "#fff0b0");
    sunG.addColorStop(0.3, "#ffd07a88");
    sunG.addColorStop(1, "#ffd07a00");
    g.fillStyle = sunG;
    g.fillRect(180, 40, 180, 110);
    g.fillStyle = "#ffe08f";
    g.beginPath(); g.arc(286, 132, 24, 0, Math.PI * 2); g.fill();

    // たなびく雲
    g.fillStyle = "#f7a27e88";
    [[70, 46, 60, 5], [250, 70, 70, 4], [150, 92, 50, 3]].forEach(([x, y, rx, ry]) => {
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
    });

    // カラス
    g.strokeStyle = "#2b1d33";
    g.lineWidth = 1.6;
    g.lineCap = "round";
    [[300, 36, 5], [318, 46, 4], [286, 52, 3.5]].forEach(([x, y, s]) => {
      g.beginPath();
      g.moveTo(x - s, y - s * 0.4); g.quadraticCurveTo(x - s * 0.4, y - s * 0.6, x, y);
      g.quadraticCurveTo(x + s * 0.4, y - s * 0.6, x + s, y - s * 0.4);
      g.stroke();
    });

    // 校舎のシルエット
    g.fillStyle = "#5b3550";
    g.fillRect(6, 92, 150, 58);
    g.fillRect(62, 74, 38, 20);
    g.beginPath(); g.moveTo(58, 76); g.lineTo(81, 62); g.lineTo(104, 76); g.closePath(); g.fill();
    g.fillStyle = "#f3d9b0";
    g.beginPath(); g.arc(81, 84, 6, 0, Math.PI * 2); g.fill(); // 時計
    g.strokeStyle = "#5b3550"; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(81, 84); g.lineTo(81, 80); g.moveTo(81, 84); g.lineTo(84, 85); g.stroke();
    for (let r = 0; r < 3; r++) {
      for (let col = 0; col < 8; col++) {
        g.fillStyle = (r * 8 + col) % 5 === 1 ? "#ffcf7acc" : "#7a4a62";
        g.fillRect(14 + col * 18, 100 + r * 15, 10, 8);
      }
    }
    // フェンスと遠くの木々
    g.fillStyle = "#4a2c45";
    for (let x = 160; x < W; x += 22) {
      g.beginPath(); g.arc(x, 146, 12 + ((x * 7) % 5), Math.PI, 0); g.fill();
    }

    // 校庭（地面）
    const ground = g.createLinearGradient(0, HORIZON, 0, H);
    ground.addColorStop(0, "#b77852");
    ground.addColorStop(0.4, "#d39a68");
    ground.addColorStop(1, "#e8b884");
    g.fillStyle = ground;
    g.fillRect(0, HORIZON, W, H - HORIZON);
    // 夕日の照り返し
    const shine = g.createRadialGradient(300, HORIZON, 10, 300, HORIZON, 260);
    shine.addColorStop(0, "#ffd9906b");
    shine.addColorStop(1, "#ffd99000");
    g.fillStyle = shine;
    g.fillRect(0, HORIZON, W, H - HORIZON);

    // トラックの白線（遠近）
    g.strokeStyle = "#fff6e566";
    g.lineWidth = 3;
    g.beginPath(); g.ellipse(180, 560, 330, 380, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(180, 560, 250, 300, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    // 砂のつぶ
    g.fillStyle = "#a8704a55";
    for (let i = 0; i < 120; i++) {
      const y = HORIZON + 6 + Math.pow((i * 37 % 100) / 100, 1.4) * (H - HORIZON - 10);
      const x = (i * 97) % W;
      const s = 0.6 + (y - HORIZON) / 200;
      g.fillRect(x, y, s * 1.6, s);
    }

    // 鬼の後ろの木
    g.fillStyle = "#5b3a29";
    g.beginPath(); g.moveTo(172, 168); g.lineTo(188, 168); g.lineTo(185, 106); g.lineTo(175, 106); g.closePath(); g.fill();
    g.fillStyle = "#3f4f36";
    [[180, 92, 30], [156, 104, 20], [204, 104, 20], [180, 70, 22]].forEach(([x, y, r]) => {
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    });
    g.fillStyle = "#c9864a66"; // 夕日の当たる縁
    [[196, 86, 14], [212, 100, 10], [192, 64, 10]].forEach(([x, y, r]) => {
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    });

    // スタートライン
    g.fillStyle = "#fff6e5cc";
    g.fillRect(40, 452, 280, 4);
    return c;
  }

  // ---- 鬼（紅い着物に小さな角の子ども） ----
  const ONI_X = 180, ONI_Y = 182, ONI_S = 0.85;
  function drawOni(o) {
    const t = clamp(o.face, 0, 1);
    ctx.save();
    ctx.translate(ONI_X, ONI_Y);
    ctx.scale(ONI_S, ONI_S);
    // 影（夕日は右なので左に伸びる）
    ctx.fillStyle = "#4a2a2a44";
    ctx.beginPath(); ctx.ellipse(-26, 0, 36, 5, 0, 0, Math.PI * 2); ctx.fill();
    // 足
    ctx.fillStyle = "#3a2a2a";
    roundRect(-10, -15, 7, 15, 3); ctx.fill();
    roundRect(3, -15, 7, 15, 3); ctx.fill();
    // 腕（後ろ向きのときは目を覆う＝頭の陰に隠れる）
    ctx.strokeStyle = "#c23a33";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const up = 1 - easeInOut(t);
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * 13, -46);
      if (o.mode === "caught" && sx === 1) {
        // こちらを指さす
        ctx.lineTo(sx * 20, -40);
        ctx.stroke();
        ctx.fillStyle = "#f3c9a4";
        ctx.beginPath(); ctx.arc(sx * 22, -38, 5.5, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      if (o.mode === "touched") {
        ctx.lineTo(sx * 26, -62); ctx.lineTo(sx * 28, -76); // ばんざい
        ctx.stroke();
        continue;
      }
      ctx.lineTo(sx * lerp(20, 24, up), lerp(-28, -58, up));
      ctx.lineTo(sx * lerp(18, 10, up), lerp(-18, -68, up));
      ctx.stroke();
    }
    // 体（着物）
    ctx.fillStyle = "#d9433a";
    ctx.beginPath();
    ctx.moveTo(-20, -13); ctx.lineTo(20, -13); ctx.lineTo(14, -52); ctx.lineTo(-14, -52); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f2c94c";
    ctx.fillRect(-17, -35, 34, 6); // 帯
    if (t > 0.5) { // 前の合わせ
      ctx.strokeStyle = "#a82e28"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-6, -52); ctx.lineTo(4, -35); ctx.stroke();
    }
    // 頭
    const hx = 0, hy = -70, r = 20;
    ctx.save();
    ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "#2a1d1d";
    ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
    // 顔（振り向き具合で横からスライドしてくる）
    const fx = hx + (1 - t) * r * 1.7;
    const fy = hy + 4;
    const sx = 0.3 + 0.7 * t;
    ctx.fillStyle = "#f6d2ad";
    ctx.beginPath(); ctx.ellipse(fx, fy, r * 0.84 * sx, r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
    // 前髪
    ctx.fillStyle = "#2a1d1d";
    ctx.beginPath(); ctx.ellipse(fx, fy - r * 0.78, r * 0.9 * sx, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    if (t > 0.15) {
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(sx, 1);
      // ほっぺ
      ctx.fillStyle = "#f29a8a";
      ctx.beginPath(); ctx.arc(-11, 6, 3.2, 0, Math.PI * 2); ctx.arc(11, 6, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#2a1d1d";
      ctx.fillStyle = "#2a1d1d";
      ctx.lineWidth = 2;
      if (o.mode === "touched") {
        // ＞＜
        ctx.beginPath();
        ctx.moveTo(-10, -3); ctx.lineTo(-5, 0); ctx.lineTo(-10, 3);
        ctx.moveTo(10, -3); ctx.lineTo(5, 0); ctx.lineTo(10, 3);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 8, 3, 0, Math.PI); ctx.stroke();
      } else if (o.mode === "caught") {
        // 目を見開いてニヤリ
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(-7, -1, 4, 0, Math.PI * 2); ctx.arc(7, -1, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#2a1d1d";
        ctx.beginPath(); ctx.arc(-7, 0, 2.2, 0, Math.PI * 2); ctx.arc(7, 0, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 6, 5, 0.1, Math.PI - 0.1); ctx.stroke();
      } else {
        // じーっと見る目
        ctx.beginPath(); ctx.arc(-7, 0, 2.6, 0, Math.PI * 2); ctx.arc(7, 0, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(-6.2, -0.9, 0.9, 0, Math.PI * 2); ctx.arc(7.8, -0.9, 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-3, 9); ctx.lineTo(3, 9); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    // 角
    ctx.fillStyle = "#fff3d6";
    ctx.strokeStyle = "#c9a56a";
    ctx.lineWidth = 1.2;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + s * 5, hy - r + 3); ctx.lineTo(hx + s * 11, hy - r - 9); ctx.lineTo(hx + s * 13, hy - r + 5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- プレイヤー（紅白帽の後ろ姿） ----
  const P_NEAR_Y = 450, P_FAR_Y = 200;
  function playerPos() {
    const p = 1 - S.d / S.D;               // 進んだ割合
    const y = lerp(P_NEAR_Y, P_FAR_Y, p);
    const s = lerp(1.25, 0.72, p);          // 遠くほど小さく
    const x = lerp(196, 188, p);
    return { x, y, s };
  }
  function drawPlayer() {
    const { x, y, s } = playerPos();
    const moving = S.speed > MOVE_EPS;
    const k = S.speed / MAX_SPEED;
    const swing = moving ? Math.sin(S.walk) * k : 0;
    const bob = moving ? Math.abs(Math.sin(S.walk)) * 2 * k : 0;
    const out = S.phase === "out";
    const touch = S.phase === "clear";
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // 影
    ctx.fillStyle = "#4a2a2a44";
    ctx.beginPath(); ctx.ellipse(-30, 0, 42, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(0, -bob);
    // 足
    ctx.fillStyle = "#f3c9a4";
    roundRect(-9, -20 - Math.max(0, swing) * 5, 7, 20, 3); ctx.fill();
    roundRect(2, -20 - Math.max(0, -swing) * 5, 7, 20, 3); ctx.fill();
    ctx.fillStyle = "#fffaf0";
    roundRect(-10, -4 - Math.max(0, swing) * 5, 9, 5, 2); ctx.fill();
    roundRect(1, -4 - Math.max(0, -swing) * 5, 9, 5, 2); ctx.fill();
    // 腕
    ctx.strokeStyle = "#f3c9a4";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    if (touch) {
      ctx.beginPath(); ctx.moveTo(-14, -44); ctx.lineTo(-20, -26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, -44); ctx.lineTo(18, -70); ctx.lineTo(12, -88); ctx.stroke();
    } else if (out) {
      ctx.beginPath(); ctx.moveTo(-14, -44); ctx.lineTo(-26, -58); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, -44); ctx.lineTo(26, -58); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(-14, -44); ctx.lineTo(-18 - swing * 3, -26 + Math.abs(swing) * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, -44); ctx.lineTo(18 + swing * 3, -26 + Math.abs(swing) * 2); ctx.stroke();
    }
    // 半ズボン
    ctx.fillStyle = "#2f3a6b";
    roundRect(-13, -27, 26, 10, 3); ctx.fill();
    // 体操服
    ctx.fillStyle = "#fffaf0";
    roundRect(-15, -50, 30, 26, 8); ctx.fill();
    ctx.fillStyle = "#e9dcc8";
    ctx.fillRect(-15, -30, 30, 3);
    // 頭（後ろ姿：髪と紅白帽）
    ctx.fillStyle = "#f3c9a4";
    ctx.beginPath(); ctx.arc(-15, -61, 3.5, 0, Math.PI * 2); ctx.arc(15, -61, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2a1d1d";
    ctx.beginPath(); ctx.arc(0, -63, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e0483a";
    ctx.beginPath(); ctx.arc(0, -65, 16.5, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
    ctx.fillRect(-16.5, -67, 33, 4);
    ctx.strokeStyle = "#fffaf0aa";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-14, -63); ctx.quadraticCurveTo(0, -56, 14, -63); ctx.stroke(); // ゴムひも
    if (out) {
      // 冷や汗
      ctx.fillStyle = "#8fd0f0";
      ctx.beginPath(); ctx.moveTo(20, -82); ctx.quadraticCurveTo(26, -72, 20, -70); ctx.quadraticCurveTo(14, -72, 20, -82); ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- 障害物 ----
  function drawObstacleWarn(o) {
    const lp = lanePos(o.laneD);
    const a = 0.5 + 0.5 * Math.sin(S.clock / 60);
    // レーンの影
    ctx.fillStyle = `rgba(90, 30, 30, ${0.12 + 0.1 * a})`;
    ctx.fillRect(0, lp.y - 6 * lp.s, W, 12 * lp.s);
    // 端の「！」
    const ex = o.vx > 0 ? 18 : W - 18;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.round(26 * lp.s)}px "Hiragino Kaku Gothic ProN", sans-serif`;
    ctx.lineWidth = 5; ctx.strokeStyle = "#2b1d33"; ctx.lineJoin = "round";
    ctx.strokeText("！", ex, lp.y - 18 * lp.s);
    ctx.fillStyle = a > 0.5 ? "#ffd04a" : "#ff7a4a";
    ctx.fillText("！", ex, lp.y - 18 * lp.s);
    ctx.restore();
  }

  function drawObstacle(o) {
    const lp = lanePos(o.laneD);
    const s = lp.s;
    const r = o.r * s;
    const hop = o.kind === "ball" ? Math.abs(Math.sin(o.bounce)) * 14 * s : 0;
    const cy = lp.y - r - hop;
    ctx.save();
    // 影
    ctx.fillStyle = "#4a2a2a44";
    ctx.beginPath(); ctx.ellipse(o.x, lp.y, r * 1.05, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(o.x, cy);
    ctx.rotate(o.spin);
    if (o.kind === "tire") {
      // 校庭に埋まっているあのタイヤ
      ctx.fillStyle = "#26222a";
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#3d3842";
      ctx.lineWidth = 3 * s;
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(t) * r * 0.62, Math.sin(t) * r * 0.62);
        ctx.lineTo(Math.cos(t) * r * 0.95, Math.sin(t) * r * 0.95);
        ctx.stroke();
      }
      ctx.fillStyle = "#e9a63a"; // 黄色いペンキ
      ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#b77852";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
    } else {
      // ドッジボール
      ctx.fillStyle = "#e85a4a";
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff6e5";
      ctx.lineWidth = 1.8 * s;
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.45, r, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- 吹き出し ----
  function drawBubble(text, opts) {
    const o = opts || {};
    const size = o.size || 19;
    ctx.save();
    ctx.font = `900 ${size}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
    // 最後の1文字だけ大きく・朱色で
    const lastBig = o.lastBig && text.length > 0;
    const head = lastBig ? text.slice(0, -1) : text;
    const tail = lastBig ? text.slice(-1) : "";
    const wHead = ctx.measureText(head).width;
    ctx.font = `900 ${size + 8}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
    const wTail = tail ? ctx.measureText(tail).width : 0;
    const tw = Math.max(40, wHead + wTail);
    const bw = tw + 28, bh = 40;
    const cx = 180, by = 26;
    const bx = clamp(cx - bw / 2, 8, W - 8 - bw);
    ctx.fillStyle = "#fffaf0";
    ctx.strokeStyle = "#2b1d33";
    ctx.lineWidth = 2.5;
    roundRect(bx, by, bw, bh, 20);
    ctx.fill(); ctx.stroke();
    // しっぽ
    ctx.beginPath();
    ctx.moveTo(176, by + bh - 1); ctx.lineTo(186, by + bh + 14); ctx.lineTo(190, by + bh - 1);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(176, by + bh); ctx.lineTo(186, by + bh + 14); ctx.lineTo(190, by + bh);
    ctx.stroke();
    // 文字
    ctx.textBaseline = "middle";
    const tx = bx + (bw - tw) / 2;
    ctx.font = `900 ${size}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
    ctx.fillStyle = o.color || "#2b1d33";
    ctx.textAlign = "left";
    ctx.fillText(head, tx, by + bh / 2 + 1);
    if (tail) {
      ctx.font = `900 ${size + 8}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
      ctx.fillStyle = "#e2553b";
      ctx.fillText(tail, tx + wHead, by + bh / 2 + 1);
    }
    ctx.restore();
  }

  // ---- 中央の大きな文字 ----
  function drawBanner(main, sub, color) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 46px "Hiragino Mincho ProN", "Yu Mincho", serif`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#2b1d33";
    ctx.lineJoin = "round";
    ctx.strokeText(main, W / 2, 300);
    ctx.fillStyle = color || "#fff6ea";
    ctx.fillText(main, W / 2, 300);
    if (sub) {
      ctx.font = `800 16px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeText(sub, W / 2, 342);
      ctx.fillStyle = "#fff6ea";
      ctx.fillText(sub, W / 2, 342);
    }
    ctx.restore();
  }

  function draw() {
    const scale = canvas.width / W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (bg) ctx.drawImage(bg, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const o = S.oni || newOni();

    // 見られている間は画面をうっすら赤く
    if (o.mode === "watch" || o.mode === "turning") {
      const a = o.mode === "turning" ? clamp((S.clock - o.modeAt) / TURN_MS, 0, 1) : 1;
      ctx.fillStyle = `rgba(120, 20, 40, ${0.16 * a})`;
      ctx.fillRect(0, 0, W, H);
    }

    // 予告（レーンの影と「！」）
    for (const ob of S.obstacles) if (S.clock < ob.enterAt) drawObstacleWarn(ob);

    // 奥行き順：鬼 → 障害物とプレイヤー（奥から）
    drawOni(o);
    const py = playerPos().y;
    const active = S.obstacles.filter((ob) => S.clock >= ob.enterAt);
    for (const ob of active) if (lanePos(ob.laneD).y <= py) drawObstacle(ob);
    drawPlayer();
    for (const ob of active) if (lanePos(ob.laneD).y > py) drawObstacle(ob);

    // 吹き出し
    if (S.phase === "intro") {
      drawBubble("…", {});
    } else if (o.mode === "chant" || o.mode === "feint") {
      const txt = CHANT.slice(0, o.shown).join("");
      if (o.mode === "feint") drawBubble(txt + "…", {});
      else if (txt) drawBubble(txt, { lastBig: true });
    } else if (o.mode === "turning" || o.mode === "watch") {
      drawBubble(o.mode === "turning" ? CHANT.join("") + "！" : "じーっ……", { lastBig: o.mode === "turning", color: o.mode === "watch" ? "#b93a26" : null });
    } else if (o.mode === "caught") {
      drawBubble(S.outSub && S.outSub !== "動いたのを見られた" ? "あーあ…" : "みーつけた！", { color: "#b93a26" });
    } else if (o.mode === "touched") {
      drawBubble("タッチされたー！", {});
    }

    // バナー
    const since = S.clock - S.phaseAt;
    if (S.phase === "intro") {
      drawBanner(`ステージ ${S.stage + 1}`, since > INTRO_MS * 0.45 ? `よーい…（${S.D}m）` : `鬼まで ${S.D}m`);
    } else if (S.phase === "out") {
      drawBanner("アウト！", S.outSub || "動いたのを見られた", "#ffb08a");
    } else if (S.phase === "clear") {
      drawBanner("タッチ！", `${S.results[S.results.length - 1].time.toFixed(1)} 秒`, "#ffe08f");
    }
  }

  // ---------- 進行 ----------
  function startGame() {
    audio();
    S.stage = 0;
    S.results = [];
    showScreen("play");
    resize();
    beginStage();
    sfx.start();
  }

  function beginStage() {
    const st = STAGES[S.stage];
    S.D = st.dist;
    S.d = st.dist;
    S.speed = 0;
    S.walk = 0;
    S.oni = newOni();
    S.obstacles = [];
    S.obsQueue = [];
    S.outSub = "";
    setPhase("intro");
    updateHud(0);
  }

  function setPhase(p) {
    S.phase = p;
    S.phaseAt = S.clock;
  }

  function updateHud(time) {
    $("stage-value").textContent = String(S.stage + 1);
    $("dist-value").textContent = Math.max(0, S.d).toFixed(1);
    $("time-value").textContent = time.toFixed(1);
  }

  function totalTime() {
    return S.results.reduce((s, r) => s + (r.out ? 0 : r.time), 0);
  }

  // 鬼の動き
  function updateOni(o) {
    const now = S.clock;
    const k = now - o.modeAt;
    switch (o.mode) {
      case "chant": {
        if (now >= o.nextAt) {
          const i = o.shown;
          o.shown = i + 1;
          if (i === CHANT.length - 1) {
            // 最後の「だ」と同時に振り返る
            sfx.da();
            sfx.turn();
            o.mode = "turning";
            o.modeAt = now;
          } else {
            sfx.chant(i);
            if (i === o.feintAt) {
              o.mode = "feint";
              const wait = rand(60, 160); // 少し間を置いてからチラッ
              o.modeAt = now + wait;
              o.feintAt = -1;
              sfx.feint(wait / 1000);
            } else {
              o.nextAt = now + o.sched[i + 1];
            }
          }
        }
        break;
      }
      case "feint": {
        if (k < 0) break;
        const q = clamp(k / FEINT_MS, 0, 1);
        o.face = 0.42 * Math.sin(Math.PI * q);
        if (q >= 1) {
          o.face = 0;
          o.mode = "chant";
          o.modeAt = now;
          o.nextAt = now + o.sched[o.shown];
        }
        break;
      }
      case "turning": {
        o.face = easeInOut(clamp(k / TURN_MS, 0, 1));
        if (k >= TURN_MS) {
          o.face = 1;
          // 猶予が終わった瞬間に動いていたらアウト
          if (S.speed > MOVE_EPS) { caught(); return; }
          o.mode = "watch";
          o.modeAt = now;
          const w = STAGES[S.stage].watch;
          o.watchEnd = now + rand(w[0], w[1]) * 1000;
        }
        break;
      }
      case "watch": {
        // 猶予が終わった後に動いていたらアウト（慣性で滑っている間も含む）
        if (S.speed > MOVE_EPS) { caught(); return; }
        if (now >= o.watchEnd) { o.mode = "turnback"; o.modeAt = now; }
        break;
      }
      case "turnback": {
        o.face = 1 - easeInOut(clamp(k / TURNBACK_MS, 0, 1));
        if (k >= TURNBACK_MS) startChant(o);
        break;
      }
      default: break;
    }
  }

  function caught(hit) {
    const o = S.oni;
    o.mode = "caught";
    o.face = 1;
    S.speed = 0;
    S.outSub = hit ? OBS_KINDS[hit.kind].sub : "動いたのを見られた";
    S.results.push({ stage: S.stage + 1, dist: S.D, out: true, left: S.d, reason: hit ? hit.kind : "seen" });
    setPhase("out");
    if (hit) sfx.bump();
    sfx.out();
    if (navigator.vibrate) { try { navigator.vibrate(200); } catch (e) { /* 未対応 */ } }
  }

  function touched() {
    const o = S.oni;
    o.mode = "touched";
    o.face = 1;
    S.speed = 0;
    S.d = 0;
    const time = (S.clock - S.stageStart) / 1000;
    S.results.push({ stage: S.stage + 1, dist: S.D, time });
    updateHud(time);
    setPhase("clear");
    sfx.clear();
  }

  function step(dt) {
    S.clock += dt;
    const o = S.oni;
    const since = S.clock - S.phaseAt;
    if (S.phase === "intro") {
      if (since >= INTRO_MS) {
        setPhase("play");
        S.stageStart = S.clock;
        startChant(o);
      }
      return;
    }
    if (S.phase === "out") {
      updateObstacles(dt);
      if (since >= 1900) finish();
      return;
    }
    if (S.phase === "clear") {
      if (since >= 1500) {
        S.stage++;
        if (S.stage >= STAGES.length) finish();
        else beginStage();
      }
      return;
    }
    if (S.phase !== "play") return;

    // プレイヤーの移動（長押しで加速、離すと慣性で少し滑る）
    const sec = dt / 1000;
    if (S.holding) S.speed = Math.min(MAX_SPEED, S.speed + ACCEL * sec);
    else S.speed = Math.max(0, S.speed - DECEL * sec);
    S.d -= S.speed * sec;
    if (S.speed > MOVE_EPS) {
      S.walk += sec * 14 * (0.5 + S.speed / MAX_SPEED);
      S.stepAcc += sec * S.speed;
      if (S.stepAcc > 0.9) { S.stepAcc = 0; sfx.step(); }
    }

    updateObstacles(dt);
    const hit = hitObstacle();
    if (hit) { caught(hit); return; }

    updateOni(o);
    if (S.phase !== "play") return;

    // 鬼までたどり着いたらタッチ（猶予中の滑り込みもセーフ）
    if (S.d <= 0) { touched(); return; }
    updateHud((S.clock - S.stageStart) / 1000);
  }

  function loop(ts) {
    if (S.screen === "play") {
      const dt = S.lastFrame ? clamp(ts - S.lastFrame, 0, 50) : 16;
      step(dt);
      if (S.screen === "play") draw();
    }
    S.lastFrame = ts;
    requestAnimationFrame(loop);
  }

  // ---------- 結果 ----------
  function rankFor(stages, time) {
    if (stages >= 5) return RANKS.find((r) => r.stages === 5 && time < r.maxTime);
    return RANKS.find((r) => r.stages === stages);
  }

  // 自己ベスト：クリア数が多いほど、同じならタイムが短いほど良い
  function isBetter(a, b) {
    if (!b) return true;
    if (a.stages !== b.stages) return a.stages > b.stages;
    return a.time < b.time;
  }
  function bestLabel(b) {
    return b.stages >= 5 ? `全クリア ${b.time.toFixed(1)} 秒` : `${b.stages} ステージ（${b.time.toFixed(1)} 秒）`;
  }

  function finish() {
    S.holding = false;
    setHoldVisual(false);
    const cleared = S.results.filter((r) => !r.out).length;
    const time = totalTime();
    const rank = rankFor(cleared, time);
    const me = { stages: cleared, time };
    const best = loadBest();
    // 1ステージもクリアしていなければ記録にしない
    const isNew = cleared > 0 && isBetter(me, best);
    if (isNew) saveBest(me);
    $("result-rank").textContent = rank.name;
    $("result-stages").textContent = String(cleared);
    $("result-time").textContent = time.toFixed(1);
    $("result-best").innerHTML = isNew
      ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！'
      : best ? `自己ベスト ${bestLabel(best)}` : "";
    $("result-comment").textContent = rank.comment;
    const list = $("result-list");
    list.innerHTML = "";
    for (const r of S.results) {
      const li = document.createElement("li");
      li.innerHTML = r.out
        ? `<span class="rl-name">ステージ${r.stage}</span><span class="rl-dist">あと ${r.left.toFixed(1)}m</span><span class="rl-time out">${r.reason && r.reason !== "seen" ? OBS_KINDS[r.reason].name : "アウト"}</span>`
        : `<span class="rl-name">ステージ${r.stage}</span><span class="rl-dist">${r.dist}m</span><span class="rl-time">${r.time.toFixed(1)}秒</span>`;
      list.appendChild(li);
    }
    const url = `${location.origin}${location.pathname}`;
    const lastOut = S.results.find((r) => r.out);
    const detail = cleared >= 5
      ? `全5ステージ制覇 合計${time.toFixed(1)}秒`
      : `${cleared}/5ステージ（ステージ${lastOut ? lastOut.stage : cleared + 1}で${lastOut && lastOut.reason !== "seen" ? OBS_KINDS[lastOut.reason].name + "に激突" : "見つかった"}）`;
    const text = `だるまさんがころんだ 🌇 ${detail}【${rank.name}】\n#Ludom`;
    $("btn-share-x").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    $("share-note").textContent = "";
    $("btn-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(text + "\n" + url); $("share-note").textContent = "コピーしました"; }
      catch (e) { $("share-note").textContent = text + "\n" + url; }
    };
    showScreen("result");
  }

  function loadBest() {
    try {
      const v = localStorage.getItem(BEST_KEY);
      if (v === null) return null;
      const b = JSON.parse(v);
      return b && typeof b.stages === "number" && typeof b.time === "number" ? b : null;
    } catch (e) { return null; }
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify({ stages: v.stages, time: Math.round(v.time * 100) / 100 })); }
    catch (e) { /* 保存できなくても遊べる */ }
  }

  function showScreen(name) {
    S.screen = name;
    for (const s of ["start", "play", "result"]) $("screen-" + s).classList.toggle("hidden", s !== name);
    if (name !== "play") { S.phase = "idle"; S.holding = false; setHoldVisual(false); }
    if (name === "start") refreshStartBest();
    window.scrollTo(0, 0);
  }

  function refreshStartBest() {
    const best = loadBest();
    if (best) { $("start-best").classList.remove("hidden"); $("start-best-value").textContent = bestLabel(best); }
  }

  // ---------- 入力（タッチ・マウス・スペースキー） ----------
  const holdBtn = $("btn-hold");
  function setHoldVisual(on) { holdBtn.classList.toggle("pressed", on); }
  function press() {
    if (S.screen !== "play") return;
    audio();
    S.holding = true;
    setHoldVisual(true);
  }
  function release() {
    S.holding = false;
    setHoldVisual(false);
  }

  const holdArea = $("hold-area");
  const pointers = new Set(); // 複数の指に対応
  holdArea.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    pointers.add(e.pointerId);
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* 未対応でも続行 */ }
    press();
  });
  const onUp = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) release();
  };
  holdArea.addEventListener("pointerup", onUp);
  holdArea.addEventListener("pointercancel", onUp);
  holdArea.addEventListener("lostpointercapture", onUp);
  // 長押しメニュー・選択・ダブルタップ拡大の抑止
  holdArea.addEventListener("contextmenu", (e) => e.preventDefault());
  holdArea.addEventListener("selectstart", (e) => e.preventDefault());
  holdArea.addEventListener("touchstart", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  holdArea.addEventListener("dblclick", (e) => e.preventDefault());

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (S.screen === "play") { press(); return; }
      if (!e.repeat) startGame();
    } else if (e.key === "Enter" && S.screen !== "play") {
      e.preventDefault();
      startGame();
    }
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); if (pointers.size === 0) release(); }
  });
  // フォーカスが外れたら離したことにする
  window.addEventListener("blur", () => { pointers.clear(); release(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { pointers.clear(); release(); } });
  window.addEventListener("resize", () => { if (S.screen === "play") resize(); });

  // ---------- ミュート ----------
  function setMuted(m) {
    muted = m;
    $("btn-mute").textContent = m ? "🔇" : "🔊";
    try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch (e) { /* 保存できなくても遊べる */ }
  }

  function init() {
    try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { muted = false; }
    setMuted(muted);
    $("btn-mute").addEventListener("click", (e) => { e.currentTarget.blur(); setMuted(!muted); });
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    showScreen("start");
    requestAnimationFrame(loop);
  }
  init();
})();
