// ===================================================================
// バチバチキャッチャー (Static Catch)
// 押してチャージ→離して静電吸着で金属ゴミを引き寄せるアーケードゲーム
// Canvas 2D（自前の簡易物理）+ Supabase ランキング
// ===================================================================

// -------------------------------------------------------------
// Supabase 設定（PLACEHOLDER：本番環境に合わせて後から置き換える）
// -------------------------------------------------------------
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co"; // TODO: 実際のSupabase URLに置き換える
const SUPABASE_ANON_KEY = "YOUR-SUPABASE-ANON-KEY"; // TODO: 実際のAnon Keyに置き換える
const SCORES_TABLE = "static_catch_scores"; // このゲーム専用のテーブル名（他ゲームと衝突しないように）

let supabaseClient = null;
try {
  if (window.supabase && SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn("Supabaseクライアントの初期化に失敗しました。", e);
}

// -------------------------------------------------------------
// DOM
// -------------------------------------------------------------
const container = document.getElementById("canvas-container");
const canvas = document.createElement("canvas");
canvas.style.touchAction = "none";
container.appendChild(canvas);
const ctx = canvas.getContext("2d");

const scoreValueEl = document.getElementById("score-value");
const chargeFillEl = document.getElementById("charge-fill");
const chargePctEl = document.getElementById("charge-pct");
const litterFillEl = document.getElementById("litter-fill");
const litterPctEl = document.getElementById("litter-pct");
const startHint = document.getElementById("start-hint");
const gameoverOverlay = document.getElementById("gameover-overlay");
const overTitleEl = document.getElementById("over-title");
const overReasonEl = document.getElementById("over-reason");
const finalScoreEl = document.getElementById("final-score-value");
const scoreForm = document.getElementById("score-form");
const playerNameInput = document.getElementById("player-name");
const btnPlayAgain = document.getElementById("btn-play-again");
const btnRestart = document.getElementById("btn-restart");
const btnRanking = document.getElementById("btn-ranking");
const btnCloseRanking = document.getElementById("btn-close-ranking");
const rankingModal = document.getElementById("ranking-modal");
const rankingListEl = document.getElementById("ranking-list");

// -------------------------------------------------------------
// 落下物タイプ定義
// -------------------------------------------------------------
// reqCharge: 吸着に必要な放電量(%)。null=吸着不可（水滴＝電気を通すので効かない）
const TYPES = {
  light:  { reqCharge: 10,  score: 10,  rBase: 0.028, speed: [1.3, 1.9], color: "#e7e2f5", label: "紙くず" },
  medium: { reqCharge: 50,  score: 30,  rBase: 0.042, speed: [1.6, 2.3], color: "#b9c2d6", label: "空き缶" },
  heavy:  { reqCharge: 100, score: 100, rBase: 0.062, speed: [1.5, 2.0], color: "#8a6a52", label: "ドラム缶" },
  water:  { reqCharge: null, score: 0,  rBase: 0.026, speed: [2.2, 3.0], color: "#5ec8ff", label: "水滴" },
};

const LITTER_MAX = 8; // これを超えるとゲームオーバー

// -------------------------------------------------------------
// 状態
// -------------------------------------------------------------
let W = 0, H = 0;
let started = false, gameOver = false, holding = false;
let score = 0;
let charge = 0;          // 現在のチャージ量 0-100
let litter = 0;          // 溜まったゴミの数
let best = Number(localStorage.getItem("staticCatchBest") || 0);

let player = { x: 0, y: 0, r: 0, hairPhase: 0 };
let pointerTargetX = null;
let objects = [];        // 落下物
let particles = [];      // スパーク・エフェクト
let pulses = [];         // 放電パルスの輪（演出用）
let spawnTimer = 0;
let spawnInterval = 1000;
let elapsedMs = 0;

// -------------------------------------------------------------
// ユーティリティ
// -------------------------------------------------------------
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

// 経過時間に応じた難易度（0→1、90秒でほぼ最大）
function diff() { return clamp(elapsedMs / 90000, 0, 1); }

// -------------------------------------------------------------
// キャンバスサイズ
// -------------------------------------------------------------
function resize() {
  const rect = container.getBoundingClientRect();
  W = Math.max(240, rect.width);
  H = Math.max(320, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  player.r = W * 0.075;
  player.y = H - player.r - H * 0.035;
  if (player.x === 0) player.x = W / 2;
  player.x = clamp(player.x, player.r, W - player.r);
}
window.addEventListener("resize", resize);

// -------------------------------------------------------------
// 入力
// -------------------------------------------------------------
function xFromEvent(evt) {
  const rect = canvas.getBoundingClientRect();
  return evt.clientX - rect.left;
}

function onPointerDown(evt) {
  if (gameOver) return;
  if (!started) {
    started = true;
    startHint.classList.add("hidden");
  }
  holding = true;
  pointerTargetX = xFromEvent(evt);
}
function onPointerMove(evt) {
  if (!holding) return;
  pointerTargetX = xFromEvent(evt);
}
function onPointerUp() {
  if (holding) dischargePulse();
  holding = false;
}

container.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerUp);
btnRestart.addEventListener("click", () => resetGame());

// -------------------------------------------------------------
// プレイヤーの移動・チャージ
// -------------------------------------------------------------
const CHARGE_TIME_MS = 1700; // フルチャージまでの時間

function updatePlayer(dt) {
  if (!started || gameOver) return;

  if (holding) {
    charge = clamp(charge + (dt / CHARGE_TIME_MS) * 100, 0, 100);
    // チャージが進むほど追従が遅くなる（動きにくくなる）。
    // 平方根カーブで序盤から鈍化を体感させ、終盤はほぼ固定に近づける
    const followRate = lerp(0.22, 0.015, Math.sqrt(charge / 100));
    if (pointerTargetX !== null) {
      player.x += (pointerTargetX - player.x) * followRate;
    }
  }
  player.x = clamp(player.x, player.r, W - player.r);
  player.hairPhase += dt * 0.02;
}

// -------------------------------------------------------------
// 放電パルス（吸着）
// -------------------------------------------------------------
const PULSE_MIN_R_RATIO = 0.0;
const PULSE_MAX_R_RATIO = 0.62; // 画面幅に対する最大吸着半径の比率

function dischargePulse() {
  if (!started || gameOver) return;
  const releasedCharge = charge;
  if (releasedCharge < 3) { charge = 0; return; } // ほぼノーチャージなら何も起きない

  const radius = lerp(0, W * PULSE_MAX_R_RATIO, releasedCharge / 100);
  pulses.push({ x: player.x, y: player.y, r: 4, maxR: radius, life: 1 });

  for (const o of objects) {
    if (o.dead || o.type === "water") continue;
    const d = Math.hypot(o.x - player.x, o.y - player.y);
    if (d > radius) continue;
    const def = TYPES[o.type];
    if (def.reqCharge <= releasedCharge) {
      o.caught = true; // 引き寄せアニメーション開始
    } else {
      spawnSparkFizzle(o.x, o.y); // パワー不足：弾かれる演出
    }
  }
  charge = 0;
}

// -------------------------------------------------------------
// 落下物の生成
// -------------------------------------------------------------
function weightedPickType() {
  const d = diff();
  const weights = {
    light: lerp(0.5, 0.32, d),
    medium: lerp(0.28, 0.30, d),
    heavy: lerp(0.08, 0.20, d),
    water: lerp(0.14, 0.18, d),
  };
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  let r = Math.random() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return "light";
}

function spawnObject() {
  const type = weightedPickType();
  const def = TYPES[type];
  const r = W * def.rBase;
  const x = rand(r + 4, W - r - 4);
  const speed = rand(def.speed[0], def.speed[1]) * (H / 700) * lerp(1, 1.4, diff());
  objects.push({ type, x, y: -r - 4, r, vy: speed, caught: false, dead: false, spin: rand(0, Math.PI * 2) });
}

// -------------------------------------------------------------
// 落下物の更新
// -------------------------------------------------------------
function updateObjects(dt) {
  spawnTimer += dt;
  spawnInterval = lerp(1050, 480, diff());
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnObject();
  }

  for (const o of objects) {
    if (o.dead) continue;

    if (o.caught) {
      // 吸着アニメーション：プレイヤーへ吸い込まれる
      const d = Math.hypot(player.x - o.x, player.y - o.y);
      const pull = Math.max(14, d * 0.35);
      o.x += (player.x - o.x) / (d || 1) * pull;
      o.y += (player.y - o.y) / (d || 1) * pull;
      if (d < player.r * 0.6) {
        o.dead = true;
        addScore(TYPES[o.type].score);
        spawnSparkBurst(player.x, player.y, "#7ef2ff");
      }
      continue;
    }

    o.y += o.vy * (dt / 16.67);
    o.spin += dt * 0.002;

    // 地面（プレイヤーの高さ）に到達
    if (o.y + o.r >= player.y - player.r * 0.4) {
      const overlapX = Math.abs(o.x - player.x) < (o.r + player.r * 0.9);
      if (o.type === "water") {
        if (overlapX) {
          charge = 0;
          spawnSparkFizzle(player.x, player.y - player.r);
        }
        o.dead = true;
      } else if (o.type === "heavy") {
        if (overlapX) {
          o.dead = true;
          triggerGameOver("頭に直撃！", "ドラム缶を吸着しきれなかった…");
          return;
        } else {
          o.dead = true;
          addLitter(2); // ドラム缶を取りこぼすと大きめのペナルティ
        }
      } else {
        o.dead = true;
        addLitter(1);
      }
    }
  }

  objects = objects.filter((o) => !o.dead);
}

function addScore(v) {
  score += v;
  scoreValueEl.textContent = score.toLocaleString();
}

function addLitter(v) {
  if (gameOver) return;
  litter += v;
  updateLitterUI();
  if (litter >= LITTER_MAX) {
    triggerGameOver("ゴミが溢れた！", "コンテナの底にゴミが溜まりすぎました。");
  }
}

function updateLitterUI() {
  const pct = clamp((litter / LITTER_MAX) * 100, 0, 100);
  litterFillEl.style.width = pct + "%";
  litterPctEl.textContent = Math.min(litter, LITTER_MAX) + "/" + LITTER_MAX;
}

// -------------------------------------------------------------
// パーティクル演出
// -------------------------------------------------------------
function spawnSparkBurst(x, y, color) {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1.5 + Math.random() * 3;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color, size: 1.5 + Math.random() * 2 });
  }
}
function spawnSparkFizzle(x, y) {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    particles.push({ x, y, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5 - 1, life: 1, color: "#ff8a8a", size: 1.5 });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.05;
    p.vx *= 0.96; p.vy *= 0.96;
    p.life -= dt / 500;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = pulses.length - 1; i >= 0; i--) {
    const pu = pulses[i];
    pu.r += (pu.maxR - pu.r) * 0.12 + 3;
    pu.life -= dt / 650;
    if (pu.life <= 0) pulses.splice(i, 1);
  }
}

// -------------------------------------------------------------
// 描画
// -------------------------------------------------------------
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1c1430");
  g.addColorStop(1, "#0a0710");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 実験室っぽいうっすらグリッド
  ctx.strokeStyle = "#ffffff08";
  ctx.lineWidth = 1;
  const grid = 40;
  for (let x = 0; x < W; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += grid) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

function drawPlayer() {
  const { x, y, r } = player;
  ctx.save();
  ctx.translate(x, y);

  // 影
  ctx.beginPath();
  ctx.ellipse(0, r * 0.75, r * 0.9, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#00000055";
  ctx.fill();

  const chargeT = charge / 100;

  // チャージ中のオーラ
  if (charge > 5) {
    const grad = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * (1.4 + chargeT * 0.8));
    grad.addColorStop(0, `rgba(126,242,255,${0.25 * chargeT})`);
    grad.addColorStop(1, "rgba(126,242,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.4 + chargeT * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }

  // 体（丸いロボ／キャラ）
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = "#3a2f52";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#7ef2ff88";
  ctx.stroke();

  // 顔
  ctx.fillStyle = "#f0ecff";
  for (const ex of [-0.32, 0.32]) {
    ctx.beginPath();
    ctx.arc(ex * r, -r * 0.05, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#3a2f52";
  for (const ex of [-0.32, 0.32]) {
    ctx.beginPath();
    ctx.arc(ex * r, -r * 0.02, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  // 口（にこっと）
  ctx.strokeStyle = "#f0ecff";
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.arc(0, r * 0.15, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // 髪：チャージが溜まるほど逆立つ（静電気の定番演出）
  const strands = 7;
  for (let i = 0; i < strands; i++) {
    const t = i / (strands - 1);
    const baseAngle = lerp(-1.15, 1.15, t) - Math.PI / 2;
    const flat = 0.14; // ほぼ寝た状態
    const spiky = 0.62 + Math.sin(player.hairPhase * 3 + i) * 0.05 * chargeT;
    const len = r * lerp(flat, spiky, chargeT) * (1 + Math.sin(player.hairPhase * 2 + i * 1.3) * 0.08 * chargeT);
    const jitter = chargeT > 0.3 ? (Math.random() - 0.5) * 0.12 * chargeT : 0;
    const ang = baseAngle + jitter;
    const rootX = Math.cos(baseAngle) * r * 0.86;
    const rootY = Math.sin(baseAngle) * r * 0.86;
    const tipX = rootX + Math.cos(ang) * len;
    const tipY = rootY + Math.sin(ang) * len;
    ctx.strokeStyle = chargeT > 0.75 ? "#ffe066" : "#c9bfe8";
    ctx.lineWidth = Math.max(1.4, r * 0.045);
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    if (chargeT > 0.7 && Math.random() < 0.5) {
      ctx.fillStyle = "#ffe066";
      ctx.beginPath();
      ctx.arc(tipX, tipY, r * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ランダムなスパーク粒子（チャージ中）
  if (holding && charge > 8 && Math.random() < 0.6) {
    const a = Math.random() * Math.PI * 2;
    particles.push({
      x: x + Math.cos(a) * r * 1.1, y: y + Math.sin(a) * r * 1.1,
      vx: Math.cos(a) * 0.6, vy: Math.sin(a) * 0.6 - 0.3,
      life: 1, color: "#7ef2ff", size: 1 + Math.random() * 1.5,
    });
  }

  ctx.restore();
}

function drawObject(o) {
  const def = TYPES[o.type];
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.spin);

  if (o.type === "light") {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rr = o.r * (0.7 + (i % 2) * 0.35);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (o.type === "medium") {
    ctx.fillStyle = def.color;
    ctx.strokeStyle = "#6b7484";
    ctx.lineWidth = 1.5;
    const w = o.r * 1.3, h = o.r * 1.8;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.3);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h * 0.22); ctx.lineTo(w / 2, -h * 0.22);
    ctx.moveTo(-w / 2, h * 0.22); ctx.lineTo(w / 2, h * 0.22);
    ctx.strokeStyle = "#ffffff55";
    ctx.stroke();
  } else if (o.type === "heavy") {
    const w = o.r * 1.7, h = o.r * 2.1;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.18);
    ctx.fill();
    // 警戒ストライプ
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.18);
    ctx.clip();
    ctx.fillStyle = "#ffcc33";
    for (let sx = -w; sx < w; sx += w * 0.28) {
      ctx.save();
      ctx.translate(sx, 0);
      ctx.rotate(0.5);
      ctx.fillRect(-w * 0.06, -h, w * 0.09, h * 2);
      ctx.restore();
    }
    ctx.restore();
    ctx.strokeStyle = "#4a3826";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.18);
    ctx.stroke();
  } else if (o.type === "water") {
    ctx.fillStyle = def.color + "cc";
    ctx.beginPath();
    ctx.moveTo(0, -o.r * 1.3);
    ctx.quadraticCurveTo(o.r, 0, 0, o.r);
    ctx.quadraticCurveTo(-o.r, 0, 0, -o.r * 1.3);
    ctx.fill();
    ctx.fillStyle = "#ffffff77";
    ctx.beginPath();
    ctx.arc(-o.r * 0.25, -o.r * 0.1, o.r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawPulses() {
  for (const pu of pulses) {
    ctx.save();
    ctx.globalAlpha = Math.max(pu.life, 0) * 0.7;
    ctx.strokeStyle = "#7ef2ff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, pu.r, 0, Math.PI * 2);
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
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawGroundLine() {
  const y = player.y + player.r * 0.7;
  ctx.strokeStyle = "#ffffff1a";
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function draw() {
  drawBackground();
  drawGroundLine();
  for (const o of objects) drawObject(o);
  drawPulses();
  drawPlayer();
  drawParticles();
}

// -------------------------------------------------------------
// HUD更新
// -------------------------------------------------------------
function updateChargeUI() {
  chargeFillEl.style.width = charge + "%";
  chargePctEl.textContent = Math.round(charge) + "%";
}

// -------------------------------------------------------------
// ゲームオーバー / リセット
// -------------------------------------------------------------
function triggerGameOver(title, reason) {
  if (gameOver) return;
  gameOver = true;
  holding = false;
  if (score > best) {
    best = score;
    localStorage.setItem("staticCatchBest", String(best));
  }
  overTitleEl.textContent = title;
  overReasonEl.textContent = reason || "";
  finalScoreEl.textContent = score.toLocaleString();
  playerNameInput.value = "";
  gameoverOverlay.classList.remove("hidden");
}

function resetGame() {
  started = false;
  gameOver = false;
  holding = false;
  score = 0;
  charge = 0;
  litter = 0;
  objects = [];
  particles = [];
  pulses = [];
  spawnTimer = 0;
  elapsedMs = 0;
  pointerTargetX = null;
  player.x = W / 2;

  scoreValueEl.textContent = "0";
  updateChargeUI();
  updateLitterUI();
  gameoverOverlay.classList.add("hidden");
  startHint.classList.remove("hidden");
}

// -------------------------------------------------------------
// メインループ
// -------------------------------------------------------------
let lastTime = null;
function loop(ts) {
  requestAnimationFrame(loop);
  if (lastTime === null) lastTime = ts;
  const dt = clamp(ts - lastTime, 0, 50);
  lastTime = ts;

  if (started && !gameOver) {
    elapsedMs += dt;
    updatePlayer(dt);
    updateObjects(dt);
    updateChargeUI();
  }
  updateParticles(dt);
  draw();
}

// -------------------------------------------------------------
// Supabase 連携（ランキング）
// -------------------------------------------------------------
async function submitScore(name, scoreValue) {
  if (!supabaseClient) {
    console.warn("Supabaseが未設定のため、スコアを送信できません。");
    return { ok: false, reason: "not-configured" };
  }
  try {
    const { error } = await supabaseClient.from(SCORES_TABLE).insert([{ name, score: scoreValue }]);
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
      `<span class="rank-score">${Number(row.score).toLocaleString()}</span>`;
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

  await submitScore(name, score);

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
  resize();
  resetGame();
  requestAnimationFrame(loop);
}

init();
