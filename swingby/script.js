// ===================================================================
// スイングバイ・ディープスペース (Swing-by Deep Space)
// 惑星の重力で周回し、離してスイングバイ。どこまで遠くへ行けるか。
// 自前の万有引力計算 + Canvas 描画（Matter.js 不使用）
// ===================================================================

// -------------------------------------------------------------
// DOM
// -------------------------------------------------------------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");
const distanceEl = document.getElementById("distance");
const debrisEl = document.getElementById("debris");
const magnetEl = document.getElementById("magnet");
const bestEl = document.getElementById("best");
const startHint = document.getElementById("start-hint");
const gameoverEl = document.getElementById("gameover");
const overTitleEl = document.getElementById("over-title");
const finalDistEl = document.getElementById("final-dist");
const finalDebrisEl = document.getElementById("final-debris");
const finalScoreEl = document.getElementById("final-score");
const finalBestEl = document.getElementById("final-best");
const retryBtn = document.getElementById("retry");

// -------------------------------------------------------------
// 定数
// -------------------------------------------------------------
const PPM = 34;              // 1km = 34px（距離換算）
const CELL = 520;            // 惑星・ゴミを配置するセルの大きさ
const SPEED0 = 2.0;          // 初速（序盤はかなりゆっくり）
const BOOST = 0.04;          // 周回中の増速（スイングバイのチャージ）
const MAX_SPEED_MIN = 4.5;   // 序盤の最高速度
const MAX_SPEED_MAX = 13.0;  // 十分進んだときの最高速度
const SPEED_RAMP = 2600;     // このスコアに近づくほど最高速が上がる
const DRIFT_LIMIT = 420;     // これだけ重力圏外が続くと遭難（序盤が遅いので長めに）
const SHIP_R = 8;
const DEBRIS_R = 28;         // 宇宙ゴミの回収半径
const DEBRIS_PT = 20;        // ゴミ1個のスコア
const BEST_KEY = "swingbyBest";

// 磁石アイテム
const MAGNET_TIME = 360;     // 効果時間（約6秒）
const MAGNET_RADIUS = 240;   // 引き寄せる範囲
const MAGNET_PULL = 0.16;    // 引き寄せの強さ
const MAGNET_GET_R = 34;     // 磁石の取得半径

// -------------------------------------------------------------
// 状態
// -------------------------------------------------------------
let W = 0, H = 0;
let ship;
let camX = 0, camY = 0;
let started = false, gameOver = false, holding = false;
let captured = null;
let framesSinceField = 0;
let reached = 0;         // 進んだ距離(km)
let distAccum = 0;       // 距離の内部累積(px)
let debris = 0;          // 回収した宇宙ゴミ数
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let trail = [];
let particles = [];

let cells = new Map();
let starterPlanets = [];
let activePlanets = [];
let activeDebris = [];
let activeMagnets = [];
let magnetTimer = 0;

// -------------------------------------------------------------
// ユーティリティ
// -------------------------------------------------------------
function hash(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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
// セル生成（決定的）：惑星と宇宙ゴミを無限に配置
// -------------------------------------------------------------
function ensureCell(ci, cj) {
  const k = ci + "," + cj;
  let c = cells.get(k);
  if (c) return c;
  c = { ci, cj, planet: null, debris: [] };

  // スタート地点(原点)のすぐ周りには惑星を置かない
  const nearStart = Math.abs(ci) <= 0 && Math.abs(cj) <= 0;
  if (!nearStart && hash(ci, cj) < 0.60) {
    const rr = 26 + hash(ci + 7, cj - 3) * 38;
    c.planet = {
      x: (ci + 0.2 + hash(ci + 1, cj) * 0.6) * CELL,
      y: (cj + 0.2 + hash(ci, cj + 1) * 0.6) * CELL,
      radius: rr,
      gm: rr * 33,
      gravR: rr * 5.0,       // 重力圏を広げて捕まえやすく
      hue: Math.floor(hash(ci + 5, cj + 5) * 360),
      ring: hash(ci - 2, cj + 4) < 0.22,
    };
  }

  const nd = Math.floor(hash(ci + 3, cj + 9) * 4); // 0〜3個
  for (let i = 0; i < nd; i++) {
    c.debris.push({
      x: (ci + hash(ci + i * 13 + 2, cj + 2)) * CELL,
      y: (cj + hash(ci + 1, cj + i * 17 + 5)) * CELL,
      collected: false,
      spin: hash(ci + i, cj + i) * 6.28,
      type: Math.floor(hash(ci + i * 5 + 3, cj + i * 7 + 1) * 3), // 0:パネル 1:金属片 2:ボルト
    });
  }

  // 磁石アイテム（惑星の無いセルに低確率で）
  if (!c.planet && hash(ci + 11, cj + 13) < 0.12) {
    c.magnet = {
      x: (ci + 0.3 + hash(ci + 2, cj + 8) * 0.4) * CELL,
      y: (cj + 0.3 + hash(ci + 8, cj + 2) * 0.4) * CELL,
      collected: false,
    };
  }

  cells.set(k, c);
  return c;
}

function refreshCells() {
  const R = 3;
  const ci0 = Math.floor(ship.x / CELL);
  const cj0 = Math.floor(ship.y / CELL);
  activePlanets = starterPlanets.slice();
  activeDebris = [];
  activeMagnets = [];
  for (let ci = ci0 - R; ci <= ci0 + R; ci++) {
    for (let cj = cj0 - R; cj <= cj0 + R; cj++) {
      const c = ensureCell(ci, cj);
      if (c.planet) activePlanets.push(c.planet);
      for (const d of c.debris) if (!d.collected) activeDebris.push(d);
      if (c.magnet && !c.magnet.collected) activeMagnets.push(c.magnet);
    }
  }
  if (cells.size > 400) {
    for (const [k, c] of cells) {
      if (Math.abs(c.ci - ci0) > R + 2 || Math.abs(c.cj - cj0) > R + 2) cells.delete(k);
    }
  }
}

// -------------------------------------------------------------
// 入力
// -------------------------------------------------------------
function onDown() {
  if (gameOver) return;
  if (!started) { started = true; startHint.classList.add("hidden"); }
  holding = true;
}
function onUp() {
  holding = false;
  captured = null; // 指を離す＝スイングバイで飛び出す（そのままの速度で直進）
}
stage.addEventListener("pointerdown", onDown);
window.addEventListener("pointerup", onUp);
stage.addEventListener("pointercancel", onUp);
retryBtn.addEventListener("click", (e) => { e.stopPropagation(); resetGame(); });

// -------------------------------------------------------------
// 物理
// -------------------------------------------------------------
// 進行度（スコア）に応じて最高速度が上がる：序盤ゆっくり→どんどん速く
function currentMaxSpeed() {
  const ramp = clamp((reached + debris * DEBRIS_PT) / SPEED_RAMP, 0, 1);
  return lerp(MAX_SPEED_MIN, MAX_SPEED_MAX, ramp);
}

function nearestFieldPlanet() {
  let best = null, bd = Infinity;
  for (const p of activePlanets) {
    const d = Math.hypot(p.x - ship.x, p.y - ship.y);
    if (d < p.gravR && d < bd) { bd = d; best = p; }
  }
  return best;
}

function update() {
  refreshCells();

  // 捕獲（長押し中、重力圏内の最寄り惑星に捕まる）
  if (holding) {
    if (captured) {
      const d = Math.hypot(captured.x - ship.x, captured.y - ship.y);
      if (d > captured.gravR) captured = null; // 圏外に出たら解除
    }
    if (!captured) captured = nearestFieldPlanet();
  }

  // 捕まっている間は円軌道で周回（進行方向を接線に固定）＋周回チャージで増速
  if (holding && captured) {
    const dx = ship.x - captured.x, dy = ship.y - captured.y;
    const r = Math.hypot(dx, dy) || 1;
    // 現在の回転の向き（時計/反時計）を維持
    const cross = dx * ship.vy - dy * ship.vx;
    const sign = cross >= 0 ? 1 : -1;
    const tx = sign * (-dy) / r, ty = sign * (dx) / r; // 接線方向の単位ベクトル
    let speed = Math.hypot(ship.vx, ship.vy);
    speed = Math.min(speed + BOOST, currentMaxSpeed()); // 周回するほど加速（上限は進行度で上昇）
    ship.vx = tx * speed;
    ship.vy = ty * speed;
  }

  // 速度上限（進行度に応じて上がる）
  const sp = Math.hypot(ship.vx, ship.vy);
  const mx = currentMaxSpeed();
  if (sp > mx) { ship.vx *= mx / sp; ship.vy *= mx / sp; }

  // 移動
  ship.x += ship.vx;
  ship.y += ship.vy;
  ship.angle = Math.atan2(ship.vy, ship.vx);

  // トレイル
  trail.push({ x: ship.x, y: ship.y });
  if (trail.length > 46) trail.shift();

  // 重力圏内にいるか（遭難判定）
  let inField = false;
  for (const p of activePlanets) {
    if (Math.hypot(p.x - ship.x, p.y - ship.y) < p.gravR) { inField = true; break; }
  }
  framesSinceField = inField ? 0 : framesSinceField + 1;

  // 磁石アイテムの取得
  for (const m of activeMagnets) {
    if (Math.hypot(m.x - ship.x, m.y - ship.y) < MAGNET_GET_R) {
      m.collected = true;
      magnetTimer = MAGNET_TIME;
      for (let s = 0; s < 14; s++) {
        const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
        particles.push({ x: m.x, y: m.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color: "#ff6b8a" });
      }
    }
  }
  // 磁石効果：周辺のゴミを船へ引き寄せる
  if (magnetTimer > 0) {
    magnetTimer--;
    for (const d of activeDebris) {
      if (Math.hypot(d.x - ship.x, d.y - ship.y) < MAGNET_RADIUS) {
        d.x += (ship.x - d.x) * MAGNET_PULL;
        d.y += (ship.y - d.y) * MAGNET_PULL;
      }
    }
  }

  // 宇宙ゴミ回収
  for (const d of activeDebris) {
    if (Math.hypot(d.x - ship.x, d.y - ship.y) < DEBRIS_R) {
      d.collected = true;
      debris++;
      spawnSparkle(d.x, d.y);
    }
  }

  // 惑星に激突
  for (const p of activePlanets) {
    if (Math.hypot(p.x - ship.x, p.y - ship.y) < p.radius + SHIP_R * 0.4) {
      return triggerGameOver("墜落！");
    }
  }
  // 遭難（重力圏外を漂流しすぎ）
  if (framesSinceField > DRIFT_LIMIT) return triggerGameOver("遭難…");

  // 距離：軌道を周回していないとき（直進中）の移動距離を累積する
  // → 直進すれば必ず増え、周回でぐるぐるしている間は増えない
  if (!(holding && captured)) distAccum += Math.hypot(ship.vx, ship.vy);
  const dist = Math.floor(distAccum / PPM);
  if (dist !== reached) {
    reached = dist;
    distanceEl.innerHTML = reached + '<span class="unit">km</span>';
  }
  debrisEl.textContent = "🛰 " + debris;
  if (magnetTimer > 0) {
    magnetEl.classList.remove("hidden");
    magnetEl.textContent = "🧲 " + Math.ceil(magnetTimer / 60) + "s";
  } else {
    magnetEl.classList.add("hidden");
  }

  updateParticles();
}

// -------------------------------------------------------------
// パーティクル（ゴミ回収のキラッ）
// -------------------------------------------------------------
function spawnSparkle(x, y) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 2.5;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: "#ffd166" });
  }
}
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92;
    p.life -= 0.04;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// -------------------------------------------------------------
// 描画
// -------------------------------------------------------------
function drawSpace() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#080b1e");
  g.addColorStop(0.6, "#05060f");
  g.addColorStop(1, "#04060f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawStars(factor, density, size, color) {
  const ox = camX * factor, oy = camY * factor;
  const S = 150;
  const i0 = Math.floor((ox - 40) / S), i1 = Math.floor((ox + W + 40) / S);
  const j0 = Math.floor((oy - 40) / S), j1 = Math.floor((oy + H + 40) / S);
  ctx.fillStyle = color;
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      if (hash(i * 2.1, j * 1.7) > density) continue;
      const x = (i + hash(i, j)) * S - ox;
      const y = (j + hash(i + 3, j + 7)) * S - oy;
      const s = size * (0.5 + hash(i + 9, j) * 0.8);
      ctx.globalAlpha = 0.5 + hash(i, j + 5) * 0.5;
      ctx.fillRect(x, y, s, s);
    }
  }
  ctx.globalAlpha = 1;
}

function drawPlanet(p) {
  const sx = p.x - camX, sy = p.y - camY;
  if (sx < -p.gravR - 40 || sx > W + p.gravR + 40 || sy < -p.gravR - 40 || sy > H + p.gravR + 40) return;

  const inField = Math.hypot(p.x - ship.x, p.y - ship.y) < p.gravR;
  const isCaptured = captured === p;

  // 重力圏リング（捕獲可能範囲）
  ctx.beginPath();
  ctx.arc(sx, sy, p.gravR, 0, Math.PI * 2);
  ctx.strokeStyle = isCaptured ? "#5ff2ffcc"
    : inField ? "#5ff2ff66" : "#3a4a8a44";
  ctx.lineWidth = isCaptured ? 2.5 : 1.5;
  ctx.setLineDash(inField ? [] : [4, 8]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 惑星本体
  const grad = ctx.createRadialGradient(sx - p.radius * 0.3, sy - p.radius * 0.3, p.radius * 0.2, sx, sy, p.radius);
  grad.addColorStop(0, `hsl(${p.hue}, 70%, 70%)`);
  grad.addColorStop(1, `hsl(${p.hue}, 65%, 38%)`);
  ctx.beginPath();
  ctx.arc(sx, sy, p.radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.shadowColor = `hsl(${p.hue}, 80%, 55%)`;
  ctx.shadowBlur = 22;
  ctx.fill();
  ctx.shadowBlur = 0;

  // 環（たまに）
  if (p.ring) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-0.5);
    ctx.scale(1, 0.32);
    ctx.beginPath();
    ctx.arc(0, 0, p.radius * 1.7, 0, Math.PI * 2);
    ctx.strokeStyle = `hsl(${p.hue}, 60%, 75%)`;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }
}

function drawDebris(d) {
  const sx = d.x - camX, sy = d.y - camY;
  if (sx < -34 || sx > W + 34 || sy < -34 || sy > H + 34) return;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(d.spin + performance.now() / 1500); // ゆっくり漂う

  if (d.type === 0) {
    // 壊れたソーラーパネル片
    ctx.fillStyle = "#2f3d78";
    ctx.strokeStyle = "#93a3dd";
    ctx.lineWidth = 1.5;
    ctx.fillRect(-12, -8, 24, 16);
    ctx.strokeRect(-12, -8, 24, 16);
    ctx.strokeStyle = "#6f80c8aa";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, -8); ctx.lineTo(-4, 8);
    ctx.moveTo(4, -8); ctx.lineTo(4, 8);
    ctx.moveTo(-12, 0); ctx.lineTo(12, 0);
    ctx.stroke();
    ctx.fillStyle = "#c7ccdd"; // 金属フレームの突起
    ctx.fillRect(-15, -2, 4, 4);
    ctx.fillRect(11, -2, 4, 4);
  } else if (d.type === 1) {
    // 壊れた金属片（不規則な破片）
    ctx.fillStyle = "#98a0b4";
    ctx.strokeStyle = "#565d70";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-11, -6); ctx.lineTo(6, -10); ctx.lineTo(13, 3);
    ctx.lineTo(3, 11); ctx.lineTo(-10, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#4a5164"; // ボルト穴
    ctx.beginPath(); ctx.arc(-4, -1, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(5, 4, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ccd2e299"; // ハイライト
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(4, -7); ctx.stroke();
  } else {
    // ナット / ボルト（六角）
    ctx.fillStyle = "#b3b9cb";
    ctx.strokeStyle = "#646a80";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * 11, y = Math.sin(a) * 11;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#565d70";
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}

function drawMagnet(m) {
  const sx = m.x - camX, sy = m.y - camY;
  if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) return;
  const pulse = 1 + Math.sin(performance.now() / 200 + m.x) * 0.12;
  // 光の輪
  ctx.beginPath();
  ctx.arc(sx, sy, 16 * pulse, 0, Math.PI * 2);
  ctx.fillStyle = "#ff6b8a22";
  ctx.fill();
  ctx.font = "24px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🧲", sx, sy);
}

function drawMagnetField() {
  if (magnetTimer <= 0) return;
  const pulse = 1 + Math.sin(performance.now() / 120) * 0.05;
  ctx.beginPath();
  ctx.arc(ship.x - camX, ship.y - camY, MAGNET_RADIUS * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = "#ff6b8a55";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 10]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawTrail() {
  if (trail.length < 2) return;
  for (let i = 1; i < trail.length; i++) {
    const a = i / trail.length;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x - camX, trail[i - 1].y - camY);
    ctx.lineTo(trail[i].x - camX, trail[i].y - camY);
    ctx.strokeStyle = `rgba(95,242,255,${a * 0.5})`;
    ctx.lineWidth = a * 3;
    ctx.stroke();
  }
}

function drawShip() {
  const sx = ship.x - camX, sy = ship.y - camY;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(ship.angle);

  // 捕獲中は重力線
  if (holding && captured) {
    ctx.save();
    ctx.rotate(-ship.angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(captured.x - ship.x, captured.y - ship.y);
    ctx.strokeStyle = "#5ff2ff55";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // エンジン炎
  const flame = 6 + Math.random() * 6;
  ctx.beginPath();
  ctx.moveTo(-SHIP_R, -3); ctx.lineTo(-SHIP_R - flame, 0); ctx.lineTo(-SHIP_R, 3);
  ctx.fillStyle = "#ff9a3c";
  ctx.fill();

  // 機体
  ctx.beginPath();
  ctx.moveTo(SHIP_R + 4, 0);
  ctx.lineTo(-SHIP_R, -SHIP_R * 0.8);
  ctx.lineTo(-SHIP_R * 0.5, 0);
  ctx.lineTo(-SHIP_R, SHIP_R * 0.8);
  ctx.closePath();
  ctx.fillStyle = "#eaf0ff";
  ctx.shadowColor = "#5ff2ff";
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - camX, p.y - camY, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// 最寄り惑星への誘導矢印（遭難が近づくと表示）
function drawGuideArrow() {
  const t = framesSinceField / DRIFT_LIMIT;
  if (t < 0.45) return;
  let np = null, nd = Infinity;
  for (const p of activePlanets) {
    const d = Math.hypot(p.x - ship.x, p.y - ship.y);
    if (d < nd) { nd = d; np = p; }
  }
  if (!np) return;
  const ang = Math.atan2(np.y - ship.y, np.x - ship.x);
  const sx = ship.x - camX, sy = ship.y - camY;
  const a = clamp((t - 0.45) / 0.55, 0, 1);
  ctx.save();
  ctx.translate(sx + Math.cos(ang) * 46, sy + Math.sin(ang) * 46);
  ctx.rotate(ang);
  ctx.fillStyle = `rgba(255,90,110,${a})`;
  ctx.beginPath();
  ctx.moveTo(11, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 遭難警告（重力圏外が続くと画面ふちが赤く点滅＋残り秒）
function drawDangerFrame() {
  const t = framesSinceField / DRIFT_LIMIT;
  if (t < 0.5) return;
  const a = clamp((t - 0.5) / 0.5, 0, 1);
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 110);
  ctx.save();
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.62);
  g.addColorStop(0, "rgba(255,0,0,0)");
  g.addColorStop(1, `rgba(255,20,40,${a * 0.28 * pulse})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = `rgba(255,70,90,${a * pulse})`;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);
  const remain = Math.max(0, DRIFT_LIMIT - framesSinceField);
  ctx.fillStyle = `rgba(255,130,150,${a})`;
  ctx.font = "700 15px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("⚠ 遭難まで " + (remain / 60).toFixed(1) + "s", W / 2, H - 22);
  ctx.restore();
}

function draw() {
  camX = ship.x - W / 2;
  camY = ship.y - H / 2;

  drawSpace();
  drawStars(0.3, 0.5, 1, "#8892c8");
  drawStars(0.6, 0.35, 1.6, "#dfe6ff");

  for (const p of activePlanets) drawPlanet(p);
  for (const m of activeMagnets) drawMagnet(m);
  for (const d of activeDebris) drawDebris(d);
  drawMagnetField();
  drawTrail();
  drawParticles();
  drawShip();
  drawGuideArrow();
  drawDangerFrame();
}

// -------------------------------------------------------------
// ゲームオーバー / リセット
// -------------------------------------------------------------
function triggerGameOver(title) {
  gameOver = true;
  holding = false;
  const score = reached + debris * DEBRIS_PT;
  if (score > best) { best = score; localStorage.setItem(BEST_KEY, String(best)); }
  overTitleEl.textContent = title;
  finalDistEl.textContent = reached;
  finalDebrisEl.textContent = debris;
  finalScoreEl.textContent = score;
  finalBestEl.textContent = best;
  bestEl.textContent = "BEST " + best;
  gameoverEl.classList.remove("hidden");
}

function resetGame() {
  started = false;
  gameOver = false;
  holding = false;
  captured = null;
  framesSinceField = 0;
  reached = 0;
  distAccum = 0;
  debris = 0;
  magnetTimer = 0;
  trail = [];
  particles = [];
  cells = new Map();

  ship = { x: 0, y: 0, vx: SPEED0, vy: 0, angle: 0 };

  // スタート直後に確実に届く最初の惑星（船の直線経路から少し外して置く）
  starterPlanets = [{
    x: 640, y: -150, radius: 48,
    gm: 48 * 33, gravR: 48 * 4.6, hue: 200, ring: false,
  }];

  distanceEl.innerHTML = '0<span class="unit">km</span>';
  debrisEl.textContent = "🛰 0";
  bestEl.textContent = "BEST " + best;
  gameoverEl.classList.add("hidden");
  startHint.classList.remove("hidden");
  refreshCells();
}

// -------------------------------------------------------------
// メインループ
// -------------------------------------------------------------
function loop() {
  requestAnimationFrame(loop);
  if (started && !gameOver) update();
  draw();
}

function init() {
  resize();
  bestEl.textContent = "BEST " + best;
  resetGame();
  requestAnimationFrame(loop);
}
window.addEventListener("resize", resize);
init();
