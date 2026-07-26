// ===================================================================
// 布団タワー (Futon Tower)
// タップで布団を真下に落とし、崩さず高く積み上げる物理タワーゲーム
// Matter.js による物理演算 + Supabase によるランキング機能
// ===================================================================

// -------------------------------------------------------------
// Supabase 設定（PLACEHOLDER：本番環境に合わせて後から置き換える）
// -------------------------------------------------------------
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co"; // TODO: 実際のSupabase URLに置き換える
const SUPABASE_ANON_KEY = "YOUR-SUPABASE-ANON-KEY"; // TODO: 実際のAnon Keyに置き換える
const SCORES_TABLE = "futon_tower_scores"; // このゲーム専用のテーブル名（他ゲームと衝突しないように）

let supabaseClient = null;
try {
  if (window.supabase && SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn("Supabaseクライアントの初期化に失敗しました。", e);
}

// -------------------------------------------------------------
// 布団タイプ定義
// -------------------------------------------------------------
// widthMul/heightMul … 基準サイズに対する倍率
// friction/frictionStatic … 摩擦係数（低いほどツルツル滑る）
// restitution … 反発係数
// squishAmp/squishDecay … 着地時の「ぎゅっ」演出の強さ・戻る速さ
const FUTON_TYPES = {
  normal: {
    key: "normal", label: "ふつうの敷布団", badge: "普",
    widthMul: 1.0, heightMul: 1.0,
    friction: 0.6, frictionStatic: 0.9, restitution: 0.04, density: 0.0018,
    squishAmp: 0.16, squishDecay: 0.09,
    baseColor: "#fff6ea", stripeColor: "#ffb08a",
  },
  feather: {
    key: "feather", label: "ふかふか羽毛布団", badge: "羽",
    widthMul: 1.04, heightMul: 1.35,
    friction: 0.5, frictionStatic: 0.75, restitution: 0.22, density: 0.001,
    squishAmp: 0.34, squishDecay: 0.045,
    baseColor: "#fffaf2", stripeColor: "#ffc7e0",
  },
  silk: {
    key: "silk", label: "ツルツル絹布団", badge: "絹",
    widthMul: 0.98, heightMul: 0.8,
    friction: 0.015, frictionStatic: 0.03, restitution: 0.02, density: 0.0015,
    squishAmp: 0.09, squishDecay: 0.12,
    baseColor: "#f3ecff", stripeColor: "#c3a6ff",
  },
  senbei: {
    key: "senbei", label: "せんべい布団", badge: "煎",
    widthMul: 0.9, heightMul: 0.4,
    friction: 0.85, frictionStatic: 1.0, restitution: 0.0, density: 0.0026,
    squishAmp: 0.05, squishDecay: 0.2,
    baseColor: "#f5deae", stripeColor: "#c08a3e",
  },
};

// -------------------------------------------------------------
// Matter.js セットアップ
// -------------------------------------------------------------
const { Engine, World, Bodies, Body, Composite, Events } = Matter;

const engine = Engine.create();
const world = engine.world;
engine.gravity.y = 1.0;

const container = document.getElementById("canvas-container");
const canvas = document.createElement("canvas");
canvas.style.touchAction = "none";
container.appendChild(canvas);
const ctx = canvas.getContext("2d");

let W = 0, H = 0;
let BASE_FUTON_W = 0, BASE_FUTON_H = 0;
const FLOOR_THICKNESS = 40;
const FALL_MARGIN = 260;      // 床(y=0)からこれだけ下に落ちたら「落下」とみなす
const PIXELS_PER_METER = 120; // 高度換算の基準

let floorBody = null;

function buildStage() {
  const rect = container.getBoundingClientRect();
  W = Math.max(240, rect.width);
  H = Math.max(320, rect.height);

  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  BASE_FUTON_W = W * 0.5;
  BASE_FUTON_H = W * 0.085;

  if (floorBody) Composite.remove(world, floorBody);
  const platformW = W * 0.62;
  floorBody = Bodies.rectangle(W / 2, FLOOR_THICKNESS / 2, platformW, FLOOR_THICKNESS, {
    isStatic: true, friction: 0.9, label: "floor",
  });
  Composite.add(world, floorBody);

  // リサイズ直後もタワー頂点が見える位置へカメラを合わせ直す
  recomputeCameraImmediate();
}
window.addEventListener("resize", debounce(buildStage, 200));

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// -------------------------------------------------------------
// カメラ（world座標系：y=0が床、上に積むほどyは負に進む）
// -------------------------------------------------------------
let camTopWorldY = 0; // 画面上端(y=0)に対応するワールドy座標
const TOP_MARGIN = () => H * 0.32;   // タワー頂点をこの画面y以下に保つ
const DROPPER_SCREEN_Y = () => H * 0.14;
const FLOOR_SCREEN_Y_INITIAL = () => H * 0.8;

function resetCamera() {
  camTopWorldY = -FLOOR_SCREEN_Y_INITIAL();
}

function currentTopWorldY() {
  const bodies = Composite.allBodies(world).filter((b) => b.futonType && b.hasLanded && !b.fallen);
  let topY = 0;
  for (const b of bodies) {
    const t = b.position.y - b.h / 2;
    if (t < topY) topY = t;
  }
  return topY;
}

function recomputeCameraImmediate() {
  const topY = currentTopWorldY();
  camTopWorldY = topY - TOP_MARGIN();
}

function updateCamera() {
  const topY = currentTopWorldY();
  const desired = topY - TOP_MARGIN();
  if (desired < camTopWorldY) camTopWorldY = desired; // カメラは上へ進むのみ（後退しない）

  const heightM = Math.max(0, -topY / PIXELS_PER_METER);
  if (heightM > maxHeightM) {
    maxHeightM = heightM;
    heightValueEl.textContent = maxHeightM.toFixed(1) + "m";
  }
}

// -------------------------------------------------------------
// 状態管理
// -------------------------------------------------------------
let started = false, gameOver = false;
let maxHeightM = 0;
let fallCount = 0;
const FALL_MAX = 3;

let dropperX = 0;
let dropperPhase = 0;
let currentType = weightedPickType();
let nextType = weightedPickType();
let canDrop = true;
let activeBody = null;
let particles = [];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

function diffFactor() { return clamp(maxHeightM / 10, 0, 1); }

function weightedPickType() {
  const d = diffFactor();
  const weights = {
    normal: lerp(0.42, 0.28, d),
    feather: lerp(0.18, 0.27, d),
    silk: lerp(0.14, 0.25, d),
    senbei: lerp(0.26, 0.2, d),
  };
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  let r = Math.random() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return "normal";
}

// -------------------------------------------------------------
// UI 要素参照
// -------------------------------------------------------------
const countValueEl = document.getElementById("count-value");
const heightValueEl = document.getElementById("height-value");
const nextBadgeEl = document.getElementById("next-badge");
const missDotsEl = document.getElementById("miss-dots");
const startHint = document.getElementById("start-hint");
const gameoverOverlay = document.getElementById("gameover-overlay");
const overReasonEl = document.getElementById("over-reason");
const finalCountEl = document.getElementById("final-count-value");
const finalHeightEl = document.getElementById("final-height-value");
const scoreForm = document.getElementById("score-form");
const playerNameInput = document.getElementById("player-name");
const btnPlayAgain = document.getElementById("btn-play-again");
const btnRestart = document.getElementById("btn-restart");
const btnRanking = document.getElementById("btn-ranking");
const btnCloseRanking = document.getElementById("btn-close-ranking");
const rankingModal = document.getElementById("ranking-modal");
const rankingListEl = document.getElementById("ranking-list");

function renderMissDots() {
  missDotsEl.innerHTML = "";
  for (let i = 0; i < FALL_MAX; i++) {
    const dot = document.createElement("div");
    dot.className = "dot" + (i < fallCount ? " used" : "");
    missDotsEl.appendChild(dot);
  }
}

function updateNextUI() {
  const def = FUTON_TYPES[nextType];
  nextBadgeEl.textContent = def.badge;
  nextBadgeEl.style.background = def.baseColor;
  nextBadgeEl.style.borderColor = def.stripeColor;
}

function updateCountUI() {
  const count = Composite.allBodies(world).filter((b) => b.futonType && b.hasLanded && !b.fallen).length;
  countValueEl.textContent = count;
}

// -------------------------------------------------------------
// 布団ボディの生成
// -------------------------------------------------------------
function createFutonBody(x, y, typeKey) {
  const def = FUTON_TYPES[typeKey];
  const w = BASE_FUTON_W * def.widthMul;
  const h = BASE_FUTON_H * def.heightMul;
  const body = Bodies.rectangle(x, y, w, h, {
    friction: def.friction,
    frictionStatic: def.frictionStatic,
    restitution: def.restitution,
    density: def.density,
    frictionAir: 0.001,
    chamfer: { radius: Math.min(h * 0.4, 14) },
    label: "futon",
  });
  body.futonType = typeKey;
  body.w = w;
  body.h = h;
  body.hasLanded = false;
  body.fallen = false;
  body.squishT = 0;
  return body;
}

function dropperWorldY() {
  return camTopWorldY + DROPPER_SCREEN_Y();
}

function updateDropper(dt) {
  const d = diffFactor();
  dropperPhase += dt * lerp(0.0018, 0.0034, d);
  const amp = W * 0.3;
  const half = (BASE_FUTON_W * 0.5) + 6;
  dropperX = clamp(W / 2 + Math.sin(dropperPhase) * amp, half, W - half);
}

function dropFuton() {
  if (!started || gameOver || !canDrop) return;
  const body = createFutonBody(dropperX, dropperWorldY(), currentType);
  Composite.add(world, body);
  activeBody = body;
  canDrop = false;

  currentType = nextType;
  nextType = weightedPickType();
  updateNextUI();
}

// -------------------------------------------------------------
// 入力
// -------------------------------------------------------------
function onTap() {
  if (gameOver) return;
  if (!started) {
    started = true;
    startHint.classList.add("hidden");
    return;
  }
  dropFuton();
}
container.addEventListener("pointerdown", onTap);
btnRestart.addEventListener("click", () => resetGame());

// -------------------------------------------------------------
// 衝突処理（着地判定・ぎゅっと沈む演出）
// -------------------------------------------------------------
Events.on(engine, "collisionStart", (event) => {
  for (const pair of event.pairs) {
    for (const b of [pair.bodyA, pair.bodyB]) {
      if (!b.futonType) continue;
      if (!b.hasLanded) {
        b.hasLanded = true;
        if (b === activeBody) {
          activeBody = null;
          canDrop = true;
        }
      }
      const speed = b.speed || 0;
      if (speed > 1.1) {
        const def = FUTON_TYPES[b.futonType];
        b.squishT = Math.min(1, (b.squishT || 0) + clamp(speed / 9, 0.35, 1));
        spawnDust(b.position.x, b.position.y + b.h / 2 * 0.5, def.stripeColor, 6);
      }
    }
  }
});

function updateSquish(dt) {
  const k = dt / 16.67;
  for (const b of Composite.allBodies(world)) {
    if (!b.futonType || b.squishT <= 0) continue;
    const def = FUTON_TYPES[b.futonType];
    b.squishT = Math.max(0, b.squishT - def.squishDecay * k);
  }
}

// -------------------------------------------------------------
// 落下（画面外）判定
// -------------------------------------------------------------
function checkFallen() {
  const bodies = Composite.allBodies(world).filter((b) => b.futonType && !b.fallen);
  let anyFell = false;
  for (const b of bodies) {
    if (b.position.y > FALL_MARGIN || b.position.x < -150 || b.position.x > W + 150) {
      b.fallen = true;
      Composite.remove(world, b);
      if (b === activeBody) {
        activeBody = null;
        canDrop = true;
      }
      fallCount++;
      anyFell = true;
      spawnDust(clamp(b.position.x, 20, W - 20), clamp(b.position.y, 0, H), FUTON_TYPES[b.futonType].stripeColor, 10);
    }
  }
  if (anyFell) {
    renderMissDots();
    if (fallCount >= FALL_MAX) {
      triggerGameOver("布団タワー崩壊！", "布団が" + FALL_MAX + "枚、床の外へ落ちてしまいました。");
    }
  }
}

// -------------------------------------------------------------
// パーティクル演出
// -------------------------------------------------------------
function spawnDust(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 2.5;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.5, life: 1, color, size: 1.5 + Math.random() * 2 });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.04;
    p.vx *= 0.96; p.vy *= 0.96;
    p.life -= 0.025;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// -------------------------------------------------------------
// 背景（高度に応じて 和室→屋根→雲→宇宙 とグラデーションが変化）
// -------------------------------------------------------------
const SCENE_STOPS = [
  { m: 0, top: [255, 243, 224], bottom: [255, 226, 196] },   // 和室（畳部屋の暖色）
  { m: 3, top: [178, 214, 240], bottom: [255, 214, 173] },   // 屋根の上（夕焼け混じりの空）
  { m: 8, top: [111, 170, 224], bottom: [200, 226, 245] },   // 雲の上（澄んだ青空）
  { m: 16, top: [20, 26, 58], bottom: [70, 60, 130] },       // 宇宙手前（藍〜紫のたそがれ）
  { m: 24, top: [4, 6, 20], bottom: [22, 16, 48] },          // 宇宙
];

function colorAtHeight(m) {
  if (m <= SCENE_STOPS[0].m) return SCENE_STOPS[0];
  for (let i = 0; i < SCENE_STOPS.length - 1; i++) {
    const a = SCENE_STOPS[i], b = SCENE_STOPS[i + 1];
    if (m <= b.m) {
      const t = (m - a.m) / (b.m - a.m);
      return {
        top: a.top.map((v, i2) => Math.round(lerp(v, b.top[i2], t))),
        bottom: a.bottom.map((v, i2) => Math.round(lerp(v, b.bottom[i2], t))),
      };
    }
  }
  return SCENE_STOPS[SCENE_STOPS.length - 1];
}

function rgb(arr) { return `rgb(${arr[0]},${arr[1]},${arr[2]})`; }

function drawBackground() {
  const heightAtScreenTop = Math.max(0, -camTopWorldY / PIXELS_PER_METER);
  const heightAtScreenBottom = Math.max(0, -(camTopWorldY + H) / PIXELS_PER_METER);
  const cTop = colorAtHeight(heightAtScreenTop);
  const cBottom = colorAtHeight(heightAtScreenBottom);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(cTop.top));
  g.addColorStop(1, rgb(cBottom.bottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// 装飾（雲・星・屋根瓦）：ワールド座標に一度だけ生成し、カメラと一緒にスクロールさせる
let decorations = [];
function buildDecorations() {
  decorations = [];
  const maxM = 40;
  for (let m = 1; m < maxM; m += rand(0.4, 0.9)) {
    const worldY = -m * PIXELS_PER_METER;
    const worldX = rand(0, W);
    if (m >= 2.2 && m <= 4.2) {
      decorations.push({ kind: "roof", x: worldX, y: worldY, s: rand(10, 18) });
    } else if (m >= 6 && m <= 14) {
      decorations.push({ kind: "cloud", x: worldX, y: worldY, s: rand(24, 46) });
    } else if (m >= 15) {
      decorations.push({ kind: "star", x: worldX, y: worldY, s: rand(1, 2.4) });
    }
  }
}

function drawDecorations() {
  for (const d of decorations) {
    const screenY = d.y - camTopWorldY;
    if (screenY < -60 || screenY > H + 60) continue;
    if (d.kind === "roof") {
      ctx.fillStyle = "#8a5a4a99";
      ctx.beginPath();
      ctx.moveTo(d.x - d.s, screenY + d.s);
      ctx.lineTo(d.x, screenY - d.s);
      ctx.lineTo(d.x + d.s, screenY + d.s);
      ctx.closePath();
      ctx.fill();
    } else if (d.kind === "cloud") {
      ctx.fillStyle = "#ffffffb0";
      ctx.beginPath();
      ctx.ellipse(d.x, screenY, d.s, d.s * 0.5, 0, 0, Math.PI * 2);
      ctx.ellipse(d.x + d.s * 0.6, screenY + d.s * 0.12, d.s * 0.6, d.s * 0.36, 0, 0, Math.PI * 2);
      ctx.ellipse(d.x - d.s * 0.6, screenY + d.s * 0.12, d.s * 0.55, 0.32 * d.s, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === "star") {
      const tw = 0.6 + Math.sin(performance.now() / 500 + d.x) * 0.4;
      ctx.fillStyle = `rgba(255,255,255,${tw})`;
      ctx.beginPath();
      ctx.arc(d.x, screenY, d.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// -------------------------------------------------------------
// 描画：布団
// -------------------------------------------------------------
function drawFutonShape(w, h, def, squishT, angle) {
  const squish = (squishT || 0) * def.squishAmp;
  ctx.save();
  ctx.rotate(angle || 0);
  ctx.scale(1 + squish * 0.6, 1 - squish);

  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(h * 0.42, 12));
  ctx.fillStyle = def.baseColor;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = def.stripeColor + "cc";
  ctx.stroke();

  ctx.strokeStyle = def.stripeColor + "88";
  ctx.lineWidth = Math.max(1.5, h * 0.1);
  ctx.beginPath();
  ctx.moveTo(-w * 0.3, 0);
  ctx.lineTo(w * 0.3, 0);
  ctx.stroke();

  if (def.key === "feather") {
    // ふかふか感：上端にふわふわの丸み
    ctx.fillStyle = def.stripeColor + "55";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc((w / 6) * i, -h / 2, h * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (def.key === "silk") {
    // ツルツル感：斜めのハイライト
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(h * 0.42, 12));
    ctx.clip();
    const shine = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    shine.addColorStop(0.35, "#ffffff00");
    shine.addColorStop(0.5, "#ffffffaa");
    shine.addColorStop(0.65, "#ffffff00");
    ctx.fillStyle = shine;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  } else if (def.key === "senbei") {
    // せんべい感：ごま粒の点々
    ctx.fillStyle = def.stripeColor + "aa";
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      ctx.beginPath();
      ctx.arc((w / 9) * i, h * 0.15 * (i % 2 === 0 ? 1 : -1), 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawFutonBody(b) {
  ctx.save();
  ctx.translate(b.position.x, b.position.y - camTopWorldY);
  drawFutonShape(b.w, b.h, FUTON_TYPES[b.futonType], b.squishT, b.angle);
  ctx.restore();
}

function drawFloor() {
  const platformW = W * 0.62;
  const screenY = 0 - camTopWorldY;
  if (screenY > H + FLOOR_THICKNESS || screenY < -FLOOR_THICKNESS) return;
  ctx.save();
  ctx.fillStyle = "#c99a6688";
  ctx.beginPath();
  ctx.roundRect(W / 2 - platformW / 2, screenY, platformW, FLOOR_THICKNESS, 8);
  ctx.fill();
  ctx.strokeStyle = "#8a5a3e99";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawDropper() {
  if (gameOver) return;
  const screenY = dropperWorldY() - camTopWorldY;
  ctx.save();
  ctx.translate(dropperX, screenY);
  const bob = Math.sin(performance.now() / 220) * 3;
  ctx.translate(0, bob);
  // クランプ（吊り具）
  ctx.strokeStyle = "#c9a06c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-14, -18); ctx.lineTo(-14, -6);
  ctx.moveTo(14, -18); ctx.lineTo(14, -6);
  ctx.stroke();
  const def = FUTON_TYPES[currentType];
  const w = BASE_FUTON_W * def.widthMul * 0.7, h = BASE_FUTON_H * def.heightMul * 0.7;
  drawFutonShape(w, h, def, 0, 0);
  ctx.restore();

  // 落下ガイド線
  if (canDrop) {
    ctx.save();
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = "#4a362833";
    ctx.beginPath();
    ctx.moveTo(dropperX, screenY + 14);
    ctx.lineTo(dropperX, H);
    ctx.stroke();
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y - camTopWorldY, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function draw() {
  drawBackground();
  drawDecorations();
  drawFloor();
  for (const b of Composite.allBodies(world)) {
    if (!b.futonType || b.fallen) continue;
    drawFutonBody(b);
  }
  drawParticles();
  drawDropper();
}

// -------------------------------------------------------------
// ゲームオーバー / リセット
// -------------------------------------------------------------
function triggerGameOver(title, reason) {
  if (gameOver) return;
  gameOver = true;
  const count = Composite.allBodies(world).filter((b) => b.futonType && b.hasLanded && !b.fallen).length;
  overReasonEl.textContent = reason || "";
  document.querySelector("#gameover-overlay h2").textContent = title || "GAME OVER";
  finalCountEl.textContent = count;
  finalHeightEl.textContent = maxHeightM.toFixed(1) + "m";
  playerNameInput.value = "";
  gameoverOverlay.classList.remove("hidden");
}

function resetGame() {
  const bodies = Composite.allBodies(world).filter((b) => b.futonType);
  Composite.remove(world, bodies);

  started = false;
  gameOver = false;
  maxHeightM = 0;
  fallCount = 0;
  activeBody = null;
  canDrop = true;
  particles = [];
  currentType = weightedPickType();
  nextType = weightedPickType();
  dropperPhase = 0;

  resetCamera();
  renderMissDots();
  updateNextUI();
  updateCountUI();
  heightValueEl.textContent = "0.0m";

  gameoverOverlay.classList.add("hidden");
  startHint.classList.remove("hidden");
}

// -------------------------------------------------------------
// メインループ
// -------------------------------------------------------------
let lastTime = null;
const FIXED_DT = 1000 / 60;

function loop(ts) {
  requestAnimationFrame(loop);
  if (lastTime === null) lastTime = ts;
  const dt = clamp(ts - lastTime, 0, 50);
  lastTime = ts;

  if (started && !gameOver) {
    Engine.update(engine, FIXED_DT);
    updateDropper(dt);
    updateSquish(dt);
    checkFallen();
    updateCamera();
    updateCountUI();
  }
  updateParticles();
  draw();
}

// -------------------------------------------------------------
// Supabase 連携（ランキング）
// -------------------------------------------------------------
async function submitScore(name, heightM) {
  if (!supabaseClient) {
    console.warn("Supabaseが未設定のため、スコアを送信できません。");
    return { ok: false, reason: "not-configured" };
  }
  try {
    const { error } = await supabaseClient.from(SCORES_TABLE).insert([{ name, score: Math.round(heightM * 10) }]);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.error("スコア送信エラー：", e);
    return { ok: false, reason: "error" };
  }
}

async function fetchTopScores() {
  if (!supabaseClient) {
    return { ok: false, reason: "not-configured", data: [] };
  }
  try {
    const { data, error } = await supabaseClient
      .from(SCORES_TABLE)
      .select("name, score")
      .order("score", { ascending: false })
      .limit(10);
    if (error) throw error;
    return { ok: true, data: data || [] };
  } catch (e) {
    console.error("ランキング取得エラー：", e);
    return { ok: false, reason: "error", data: [] };
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderRanking(result) {
  rankingListEl.innerHTML = "";
  if (!result.ok) {
    const li = document.createElement("li");
    li.className = "ranking-empty";
    li.textContent =
      result.reason === "not-configured"
        ? "Supabaseが未設定です（script.js冒頭のURL/Anon Keyを設定してください）"
        : "ランキングの取得に失敗しました";
    rankingListEl.appendChild(li);
    return;
  }
  if (result.data.length === 0) {
    const li = document.createElement("li");
    li.className = "ranking-empty";
    li.textContent = "まだ記録がありません";
    rankingListEl.appendChild(li);
    return;
  }
  result.data.forEach((row, i) => {
    const li = document.createElement("li");
    li.innerHTML =
      `<span class="rank-no">${i + 1}</span>` +
      `<span class="rank-name">${escapeHtml(row.name)}</span>` +
      `<span class="rank-score">${(Number(row.score) / 10).toFixed(1)}m</span>`;
    rankingListEl.appendChild(li);
  });
}

async function openRankingModal() {
  rankingModal.classList.remove("hidden");
  rankingListEl.innerHTML = `<li class="ranking-loading">読み込み中...</li>`;
  const result = await fetchTopScores();
  renderRanking(result);
}

// -------------------------------------------------------------
// UI イベント
// -------------------------------------------------------------
scoreForm.addEventListener("submit", async (evt) => {
  evt.preventDefault();
  const name = playerNameInput.value.trim() || "名無し";
  const submitBtn = scoreForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "送信中...";

  await submitScore(name, maxHeightM);

  submitBtn.disabled = false;
  submitBtn.textContent = "スコアを登録";
  gameoverOverlay.classList.add("hidden");
  resetGame();
  openRankingModal();
});

btnPlayAgain.addEventListener("click", () => {
  gameoverOverlay.classList.add("hidden");
  resetGame();
});

btnRanking.addEventListener("click", () => {
  openRankingModal();
});

btnCloseRanking.addEventListener("click", () => {
  rankingModal.classList.add("hidden");
});

// -------------------------------------------------------------
// 初期化
// -------------------------------------------------------------
function init() {
  buildStage();
  buildDecorations();
  resetGame();
  requestAnimationFrame(loop);
}

init();
