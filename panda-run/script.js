// ===================================================================
// パンダ走 (Panda Run)
// 武陵源の峡谷を、丸まったパンダがコロコロ走って谷を飛び越えるランゲーム
// Matter.js による物理 + Canvas 描画
// ===================================================================

const { Engine, World, Composite, Bodies, Body, Events } = Matter;

// -------------------------------------------------------------
// DOM
// -------------------------------------------------------------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const distanceEl = document.getElementById("distance");
const bestEl = document.getElementById("best");
const startHint = document.getElementById("start-hint");
const gameoverEl = document.getElementById("gameover");
const finalDistEl = document.getElementById("final-dist");
const finalBestEl = document.getElementById("final-best");
const retryBtn = document.getElementById("retry");
const stage = document.getElementById("stage");

// -------------------------------------------------------------
// 定数・状態
// -------------------------------------------------------------
const PPM = 18;              // 1メートル = 18px（距離換算）
const STEP = 8;              // 地形を敷く矩形の幅
const BEST_KEY = "pandaRunBest";

let W = 0, H = 0;
let engine, world, panda;
let cameraX = 0, cameraY = 0;
let started = false, gameOver = false, holding = false;
let onGround = false;
let distance = 0;
let best = Number(localStorage.getItem(BEST_KEY) || 0);

// レイアウト（画面高さから決定）
let groundBase = 380;   // 標準の地面の高さ(y)
let amp = 90;           // 起伏の振れ幅
let deathY = 900;       // これより下に落ちたらゲームオーバー
const PANDA_R = 26;
const START_X = 160;

// 地形生成用の状態（プラットフォーム島式）
let terrain = [];        // { body, x, topY, type, gid }
let genX = 0;            // 次に生成するx
let lastY = 0;           // 直前プラットフォームの上面y
let introLeft = 0;       // 開始直後の平地プラットフォーム数
let crumbleGroups = {};  // 崩れる足場の管理  gid -> { cols:[], triggered, timer }
let nextGroupId = 1;

// -------------------------------------------------------------
// 決定的な擬似乱数（背景の岩配置用）
// -------------------------------------------------------------
function rand(n) {
  const s = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return s - Math.floor(s);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// 距離に応じた難易度（0→1）
function diff(x) { return clamp((x - START_X) / 13000, 0, 1); }

// -------------------------------------------------------------
// キャンバスのサイズ設定
// -------------------------------------------------------------
function resize() {
  const rect = stage.getBoundingClientRect();
  W = Math.max(320, Math.floor(rect.width));
  H = Math.max(360, Math.floor(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// -------------------------------------------------------------
// 地形生成（プラットフォーム島式）
//   ground  … 幅広で着地しやすい足場（多少の起伏あり）
//   narrow  … パンダの半分ほどの細い足場（石柱の頂上／ピンポイント着地）
//   crumble … 乗ると数瞬で崩れて落ちる足場
//   各プラットフォームの間は必ず「谷」。プラットフォームごとに高さ（段差）が変わる
// -------------------------------------------------------------
function addColumn(cx, topY, type, gid) {
  const bottom = groundBase + amp + 320; // 地形の底（十分下）
  const h = bottom - topY;
  if (h < 10) return;
  const body = Bodies.rectangle(cx + STEP / 2, topY + h / 2, STEP + 1, h, {
    isStatic: true,
    friction: 0.9,
    label: "ground",
  });
  body.plat = { type, gid };
  Composite.add(world, body);
  const seg = { body, x: cx, topY, type, gid };
  terrain.push(seg);
  if (gid != null) crumbleGroups[gid].cols.push(seg);
}

// 1枚のプラットフォームを敷き、その後ろに谷ぶんだけ genX を進める
function generatePlatform() {
  const d = diff(genX);

  // タイプ決定（最初の introLeft 枚は必ず幅広 ground）
  let type;
  if (introLeft > 0) { type = "ground"; introLeft--; }
  else {
    type = (Math.random() < 0.30) ? "narrow" : "ground"; // 細い足場 or 通常足場
  }

  // 幅
  let width;
  if (type === "ground") width = 190 + Math.random() * 160;
  else if (type === "narrow") width = 22 + Math.random() * 16;   // パンダ直径(52)の4〜7割＝かなり細い
  else width = 74 + Math.random() * 50;                          // crumble

  // 高さ（段差）：前のプラットフォームから上下に振る。難易度で段差が大きく
  const stepR = lerp(38, 180, d);
  let target = lastY + (Math.random() * 2 - 1) * stepR; // 上下対称に振る
  target -= (lastY - groundBase) * 0.3;                 // 中心へ戻す力（片側の端に張り付かない）
  let topY = clamp(target, groundBase - amp, groundBase + amp * 0.6);

  // crumble はグループ登録
  let gid = null;
  if (type === "crumble") { gid = nextGroupId++; crumbleGroups[gid] = { cols: [], triggered: false, timer: 0 }; }

  // ground だけ緩やかな起伏、narrow/crumble は平ら（着地判定を素直に）
  const bump = type === "ground" ? lerp(8, 46, d) * Math.random() : 0;

  const endX = genX + width;
  let x = genX;
  while (x < endX) {
    let y = topY;
    if (bump) { const t = (x - genX) / width; y = topY - bump * Math.sin(Math.PI * t); }
    addColumn(x, y, type, gid);
    x += STEP;
  }
  lastY = topY;

  // 次の谷
  const gap = lerp(80, 200, d) + Math.random() * 55;
  genX = endX + gap;
}

// 画面前方まで地形を生成
function buildAhead(targetX) {
  let guard = 0;
  while (genX < targetX && guard++ < 60) generatePlatform();
}

// 画面後方の古い地形を削除
function pruneBehind(minX) {
  let removed = 0;
  while (terrain.length && terrain[0].x < minX) {
    const seg = terrain.shift();
    Composite.remove(world, seg.body);
    if (seg.gid != null && crumbleGroups[seg.gid]) {
      const g = crumbleGroups[seg.gid];
      const i = g.cols.indexOf(seg);
      if (i >= 0) g.cols.splice(i, 1);
      if (g.cols.length === 0) delete crumbleGroups[seg.gid];
    }
    if (removed++ > 300) break;
  }
}

// 乗った崩れる足場を時間差で崩落させる
function updateCrumble() {
  for (const id in crumbleGroups) {
    const g = crumbleGroups[id];
    if (!g.triggered) continue;
    g.timer++;
    if (g.timer > 26) { // 約0.43秒で崩落
      for (const seg of g.cols) {
        Composite.remove(world, seg.body);
        const i = terrain.indexOf(seg);
        if (i >= 0) terrain.splice(i, 1);
      }
      delete crumbleGroups[id];
    }
  }
}

// -------------------------------------------------------------
// パンダ
// -------------------------------------------------------------
function createPanda() {
  panda = Bodies.circle(START_X, groundBase - 120, PANDA_R, {
    friction: 0.9,
    frictionStatic: 1,
    frictionAir: 0.003,   // 空気抵抗を下げて、空中で横スピードが落ちにくく
    restitution: 0.18,
    density: 0.0016,
    label: "panda",
  });
  Composite.add(world, panda);
}

// -------------------------------------------------------------
// 入力
// -------------------------------------------------------------
function onPress() {
  if (gameOver) return;
  if (!started) {
    started = true;
    startHint.classList.add("hidden");
  }
  holding = true;
  jump();
}
function onRelease() { holding = false; }

stage.addEventListener("pointerdown", onPress);
window.addEventListener("pointerup", onRelease);
stage.addEventListener("pointercancel", onRelease);
retryBtn.addEventListener("click", (e) => { e.stopPropagation(); resetGame(); });

// -------------------------------------------------------------
// 接地判定
// -------------------------------------------------------------
function bindGroundEvents() {
  Events.on(engine, "beforeUpdate", () => { onGround = false; });

  const handle = (evt, isStart) => {
    for (const p of evt.pairs) {
      let other = null;
      if (p.bodyA.label === "panda" && p.bodyB.label === "ground") other = p.bodyB;
      else if (p.bodyB.label === "panda" && p.bodyA.label === "ground") other = p.bodyA;
      if (!other) continue;

      onGround = true;
      if (isStart) jumps = MAX_JUMPS; // 着地した瞬間だけジャンプ回復

      // 崩れる足場に乗ったら崩落を予約
      const plat = other.plat;
      if (plat && plat.type === "crumble" && plat.gid != null) {
        const g = crumbleGroups[plat.gid];
        if (g && !g.triggered) { g.triggered = true; g.timer = 0; }
      }
    }
  };
  Events.on(engine, "collisionStart", (e) => handle(e, true));
  Events.on(engine, "collisionActive", (e) => handle(e, false));
}

// -------------------------------------------------------------
// 操作パラメータ（手触りの調整ポイント）
// -------------------------------------------------------------
const RUN_SPEED = 5.0;    // 自動走行の巡航速度（ほんの少し遅く）
const RUN_F = 0.014;      // 巡航速度を保つための加速
const JUMP_V = 10.5;      // 1段目ジャンプの初速
const JUMP_V2 = 9.5;      // 2段目ジャンプの初速
const FLOAT_FALL = 2.6;   // 押しっぱなし滞空中の最大落下速度（ふんわり）
const MAX_VX = 11.0;      // 最高速度（下り坂で出過ぎないように）
const MAX_JUMPS = 2;      // 二段ジャンプまで
let jumps = MAX_JUMPS;    // 残ジャンプ回数

// タップでジャンプ（空中ならもう一度で二段ジャンプ）
function jump() {
  if (!started || gameOver) return;
  if (jumps > 0) {
    const v = (jumps === MAX_JUMPS) ? JUMP_V : JUMP_V2;
    // ジャンプのたびに前進の勢いを取り戻す（連続ジャンプでも失速せず向こう岸へ届く）
    const vx = Math.max(panda.velocity.x, RUN_SPEED);
    Body.setVelocity(panda, { x: vx, y: -v });
    jumps--;
  }
}

function applyControls() {
  if (!started || gameOver) return;

  // 自動走行（接地中は巡航速度を保つ＝止まらない）
  if (onGround && panda.velocity.x < RUN_SPEED) {
    Body.applyForce(panda, panda.position, { x: RUN_F, y: 0 });
  }
  // 空中でも前進の勢いをゆるく保つ（連続ジャンプの谷で失速して届かないのを防ぐ）
  else if (!onGround && panda.velocity.x < RUN_SPEED) {
    Body.applyForce(panda, panda.position, { x: RUN_F * 0.7, y: 0 });
  }
  // 押しっぱなしの間は落下をゆるやかに（ふんわり滞空で着地を合わせやすく）
  if (holding && !onGround && panda.velocity.y > FLOAT_FALL) {
    Body.setVelocity(panda, { x: panda.velocity.x, y: FLOAT_FALL });
  }
  // 速度上限
  if (panda.velocity.x > MAX_VX) {
    Body.setVelocity(panda, { x: MAX_VX, y: panda.velocity.y });
  }
}

// -------------------------------------------------------------
// 描画
// -------------------------------------------------------------
function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#f3e9ec");   // 朝もやのピンク
  g.addColorStop(0.45, "#e7e3ea");
  g.addColorStop(1, "#cdd7d2");    // 下は霧の緑がかったグレー
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// 霧から立ち上がる、細く高い奇岩（武陵源の石柱）の層
function drawPillarLayer(factor, fill, cap, spacing, topMin, topMax, fogLine) {
  const camX = cameraX * factor;
  const i0 = Math.floor((camX - 200) / spacing);
  const i1 = Math.floor((camX + W + 200) / spacing);
  for (let i = i0; i <= i1; i++) {
    const x = i * spacing - camX + rand(i) * spacing * 0.6;
    const w = 14 + rand(i * 1.7) * 24;             // 細い柱
    const topY = topMin + rand(i * 2.3) * (topMax - topMin);
    const h = fogLine + 90 - topY;                 // 下は霧の中まで伸ばす
    if (h < 24) continue;
    // 柱本体
    roundRectPath(x, topY, w, h, w * 0.45);
    ctx.fillStyle = fill;
    ctx.fill();
    // 頂の緑
    ctx.beginPath();
    ctx.ellipse(x + w / 2, topY + 3, w * 0.62, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = cap;
    ctx.fill();
  }
}

// 霧のヴェール（柱の足元をぼかして「霧から生えている」感を出す）
function fogVeil(y0, y1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, "#eef2f000");
  g.addColorStop(1, "#eef2f0dd");
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, W, y1 - y0);
}

function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTerrain() {
  // 手前の地形（緑を頂いた岩肌）を柱ごとに塗る。タイプで色を変える
  for (const seg of terrain) {
    // 崩れかけの足場は小刻みに揺れる
    let wob = 0;
    if (seg.gid != null && crumbleGroups[seg.gid] && crumbleGroups[seg.gid].triggered) {
      wob = Math.sin((crumbleGroups[seg.gid].timer + seg.x) * 0.8) * 2;
    }
    const sx = seg.x - cameraX + wob;
    if (sx < -STEP * 2 || sx > W + STEP * 2) continue;
    const sy = seg.topY - cameraY;
    const bottom = H + 40;

    let rock = "#7a6a5c", grass = "#6fa85e";
    if (seg.type === "narrow") { rock = "#8d8478"; grass = "#7bb069"; }   // 明るい石柱
    else if (seg.type === "crumble") { rock = "#a5764f"; grass = "#c48a52"; } // もろい茶

    ctx.fillStyle = rock;
    ctx.fillRect(sx, sy + 12, STEP + 1.5, bottom - sy);
    ctx.fillStyle = grass;
    ctx.fillRect(sx, sy, STEP + 1.5, 14);
  }
}

function drawPanda() {
  const sx = panda.position.x - cameraX;
  const sy = panda.position.y - cameraY;
  const a = panda.angle;
  const r = PANDA_R;

  ctx.save();
  ctx.translate(sx, sy);

  // 影（回転しない）
  ctx.save();
  ctx.rotate(0);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(0, r + 6, r * 0.9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 残ジャンプ表示（空中のとき、頭上に回転しないドットで）
  if (started && !gameOver && !onGround) {
    for (let k = 0; k < MAX_JUMPS; k++) {
      ctx.beginPath();
      ctx.arc((k - (MAX_JUMPS - 1) / 2) * 11, -r - 16, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = k < jumps ? "#3f8f7a" : "#ffffffaa";
      ctx.strokeStyle = "#3f8f7a";
      ctx.lineWidth = 1.2;
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.rotate(a);

  // 空中では手足をひょこっと出す
  if (!onGround) {
    ctx.fillStyle = "#222";
    const legs = [[-0.6, 0.7], [0.6, 0.7], [-0.7, -0.2], [0.7, -0.2]];
    for (const [lx, ly] of legs) {
      ctx.beginPath();
      ctx.ellipse(lx * r, ly * r, r * 0.28, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 体（白い丸）
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = "#fdfdfd";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#e2e2e2";
  ctx.stroke();

  // 耳（黒）
  ctx.fillStyle = "#222";
  for (const ex of [-0.62, 0.62]) {
    ctx.beginPath();
    ctx.arc(ex * r, -r * 0.78, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }

  // 目のまわり（黒い斑）＋目
  for (const ex of [-0.34, 0.34]) {
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.ellipse(ex * r, -r * 0.05, r * 0.24, r * 0.32, ex * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ex * r + ex * 2, -r * 0.05, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  // 鼻
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(0, r * 0.3, r * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function draw() {
  drawSky();
  // 3層のパララックス奇岩（奥→手前）。各層のあとに霧をかけて足元をぼかす
  drawPillarLayer(0.14, "#c6cfce", "#bcd0b4", 200, H * 0.15, H * 0.34, H * 0.60);
  fogVeil(H * 0.44, H * 0.64);
  drawPillarLayer(0.32, "#a8b5b1", "#a4c698", 240, H * 0.23, H * 0.44, H * 0.63);
  fogVeil(H * 0.50, H * 0.71);
  drawPillarLayer(0.58, "#84948e", "#88bd7d", 300, H * 0.33, H * 0.52, H * 0.67);
  fogVeil(H * 0.57, H * 0.78);
  drawTerrain();
  drawPanda();
}

// -------------------------------------------------------------
// カメラ・進行
// -------------------------------------------------------------
function updateCamera() {
  cameraX = panda.position.x - W * 0.32;
  const targetY = panda.position.y - H * 0.52;
  cameraY += (targetY - cameraY) * 0.08;
}

function updateDistance() {
  const d = Math.max(0, Math.floor((panda.position.x - START_X) / PPM));
  if (d !== distance) {
    distance = d;
    distanceEl.innerHTML = distance + '<span class="unit">m</span>';
  }
}

let stuckFrames = 0;
function checkGameOver() {
  if (gameOver) return;
  // 谷に落ちた
  if (panda.position.y > deathY) {
    triggerGameOver();
    return;
  }
  // 壁（登れない崖）にめり込んで進めなくなった
  if (onGround && Math.abs(panda.velocity.x) < 0.6) stuckFrames++;
  else stuckFrames = 0;
  if (stuckFrames > 45) triggerGameOver();
}

function triggerGameOver() {
  gameOver = true;
  holding = false;
  if (distance > best) {
    best = distance;
    localStorage.setItem(BEST_KEY, String(best));
  }
  finalDistEl.textContent = distance;
  finalBestEl.textContent = best;
  bestEl.textContent = "ベスト " + best + "m";
  gameoverEl.classList.remove("hidden");
}

// -------------------------------------------------------------
// リセット／初期化
// -------------------------------------------------------------
function resetWorld() {
  engine = Engine.create();
  world = engine.world;
  engine.gravity.y = 1.0;

  groundBase = H * 0.58;
  amp = H * 0.19;         // 高低差を大きく（谷が深く、段差も大きい）
  deathY = groundBase + amp + 380;

  terrain = [];
  crumbleGroups = {};
  nextGroupId = 1;
  stuckFrames = 0;
  jumps = MAX_JUMPS;
  lastY = groundBase;

  bindGroundEvents();
  createPanda();

  // 開始プラットフォーム（幅広・平ら）をパンダの足元に確実に敷く
  {
    const startEnd = START_X + 240;
    let x = START_X - 200;
    while (x < startEnd) { addColumn(x, groundBase, "ground", null); x += STEP; }
    lastY = groundBase;
    genX = startEnd + (90 + Math.random() * 40); // 最初の谷
  }
  introLeft = 2; // その後さらに数枚は平地
  buildAhead(START_X + W);

  cameraX = panda.position.x - W * 0.32;
  cameraY = panda.position.y - H * 0.52;
}

function resetGame() {
  started = false;
  gameOver = false;
  holding = false;
  distance = 0;
  distanceEl.innerHTML = '0<span class="unit">m</span>';
  bestEl.textContent = "ベスト " + best + "m";
  gameoverEl.classList.add("hidden");
  startHint.classList.remove("hidden");
  resetWorld();
}

// -------------------------------------------------------------
// メインループ
// -------------------------------------------------------------
function loop() {
  requestAnimationFrame(loop);

  if (started && !gameOver) {
    Engine.update(engine, 1000 / 60);
    applyControls();
    updateCrumble();
    buildAhead(cameraX + W + 400);
    pruneBehind(cameraX - 400);
    updateCamera();
    updateDistance();
    checkGameOver();
  }
  draw();
}

// -------------------------------------------------------------
// 起動
// -------------------------------------------------------------
function init() {
  resize();
  bestEl.textContent = "ベスト " + best + "m";
  resetWorld();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", () => {
  resize();
});

init();
