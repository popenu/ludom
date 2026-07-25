// ===================================================================
// 核融合ドロップ (Fusion Drop) - メインスクリプト
// Matter.js による物理演算 + Supabase によるランキング機能
// ===================================================================

// -------------------------------------------------------------
// Supabase 設定（PLACEHOLDER：本番環境に合わせて後から置き換える）
// -------------------------------------------------------------
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co"; // TODO: 実際のSupabase URLに置き換える
const SUPABASE_ANON_KEY = "YOUR-SUPABASE-ANON-KEY"; // TODO: 実際のAnon Keyに置き換える

let supabaseClient = null;
try {
  if (window.supabase && SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn("Supabaseクライアントの初期化に失敗しました。", e);
}

// -------------------------------------------------------------
// 元素定義（7段階：番号が大きいほど上位元素）
// -------------------------------------------------------------
// sizeRatio … 元素の「直径 ÷ 箱の幅」。実際の半径は箱幅Wから動的に算出する
//              （スマホ〜PCで箱に対する見た目の比率を統一するため）
// restitution … 反発係数。軽い元素ほど大きく（よく跳ねる）、重い元素ほど小さく設定
// ※ 恒星内元素合成（超新星に至る核融合過程）に沿って質量数順に並べ、
//    有名な中間元素として Mg（マグネシウム）と S（硫黄）を追加した全9段階
const ELEMENTS = [
  { symbol: "H",  name: "水素",       sizeRatio: 0.110, color: "#8ecfff", restitution: 0.58 },
  { symbol: "He", name: "ヘリウム",   sizeRatio: 0.137, color: "#ffe28a", restitution: 0.52 },
  { symbol: "C",  name: "炭素",       sizeRatio: 0.166, color: "#b7b7c9", restitution: 0.44 },
  { symbol: "O",  name: "酸素",       sizeRatio: 0.198, color: "#7ee8fa", restitution: 0.38 },
  { symbol: "Ne", name: "ネオン",     sizeRatio: 0.231, color: "#ff8ac6", restitution: 0.34 },
  { symbol: "Mg", name: "マグネシウム", sizeRatio: 0.270, color: "#9dffb0", restitution: 0.30 },
  { symbol: "Si", name: "ケイ素",     sizeRatio: 0.312, color: "#c9a0ff", restitution: 0.27 },
  { symbol: "S",  name: "硫黄",       sizeRatio: 0.364, color: "#f4d03f", restitution: 0.24 },
  { symbol: "Fe", name: "鉄",         sizeRatio: 0.429, color: "#ffb454", restitution: 0.20 },
];
const MAX_LEVEL = ELEMENTS.length - 1; // Fe のレベル
const SPAWN_MAX_LEVEL = 3; // NEXTとして出現しうる最大レベル（O まで）

// -------------------------------------------------------------
// Matter.js セットアップ
// -------------------------------------------------------------
const { Engine, World, Bodies, Body, Composite, Events } = Matter;

const engine = Engine.create();
const world = engine.world;
engine.gravity.y = 1.1;

const container = document.getElementById("canvas-container");
const canvas = document.createElement("canvas");
canvas.style.touchAction = "none";
container.appendChild(canvas);
const ctx = canvas.getContext("2d");

const WALL_THICKNESS = 24;
const DANGER_LINE_Y = 140;
let W = 0, H = 0;
let spawnY = 46;

let leftWall, rightWall, groundWall;

function buildWalls() {
  const rect = container.getBoundingClientRect();
  W = Math.max(rect.width, 240);
  H = Math.max(rect.height, 320);

  // 実機の高精細ディスプレイ（Retina等）でもぼやけないよう、
  // 見た目の解像度(W,H)より高いピクセル数でキャンバスを描画する
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 箱の幅を基準に各元素の実半径を算出（スマホ〜PCで見た目の比率を統一）
  for (const e of ELEMENTS) {
    e.radius = Math.max(10, Math.round((e.sizeRatio * W) / 2));
  }

  if (leftWall) Composite.remove(world, [leftWall, rightWall, groundWall]);

  leftWall = Bodies.rectangle(-WALL_THICKNESS / 2, H / 2, WALL_THICKNESS, H * 2, { isStatic: true, label: "wall" });
  rightWall = Bodies.rectangle(W + WALL_THICKNESS / 2, H / 2, WALL_THICKNESS, H * 2, { isStatic: true, label: "wall" });
  groundWall = Bodies.rectangle(W / 2, H + WALL_THICKNESS / 2, W * 2, WALL_THICKNESS, { isStatic: true, label: "wall" });
  Composite.add(world, [leftWall, rightWall, groundWall]);

  const dangerLineEl = document.getElementById("danger-line");
  dangerLineEl.style.top = DANGER_LINE_Y + "px";
}

// -------------------------------------------------------------
// 状態管理
// -------------------------------------------------------------
let score = 0;
let currentDropLevel = randomSpawnLevel();
let nextDropLevel = randomSpawnLevel();
let aimX = null;
let canDrop = true;
let gameOverFlag = false;
let overLineSince = null;
let particles = [];
let blackhole = null;
const mergeQueue = [];

const DROP_COOLDOWN_MS = 380;
const GAMEOVER_GRACE_MS = 1000;

function randomSpawnLevel() {
  return Math.floor(Math.random() * (SPAWN_MAX_LEVEL + 1));
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// -------------------------------------------------------------
// UI 要素参照
// -------------------------------------------------------------
const scoreValueEl = document.getElementById("score-value");
const nextElementEl = document.getElementById("next-element");
const gameoverOverlay = document.getElementById("gameover-overlay");
const finalScoreValueEl = document.getElementById("final-score-value");
const scoreForm = document.getElementById("score-form");
const playerNameInput = document.getElementById("player-name");
const btnPlayAgain = document.getElementById("btn-play-again");
const btnRestart = document.getElementById("btn-restart");
const btnRanking = document.getElementById("btn-ranking");
const btnCloseRanking = document.getElementById("btn-close-ranking");
const rankingModal = document.getElementById("ranking-modal");
const rankingListEl = document.getElementById("ranking-list");
const blackholeBanner = document.getElementById("blackhole-banner");
const elementGuideEl = document.getElementById("element-guide");

function renderElementGuide() {
  elementGuideEl.innerHTML = "";
  ELEMENTS.forEach((el, i) => {
    const li = document.createElement("li");
    li.innerHTML =
      `<span class="mini-dot" style="background:${el.color};color:${el.color}"></span>` +
      `<span class="mini-name">${el.symbol} ${el.name}</span>`;
    elementGuideEl.appendChild(li);
    if (i < ELEMENTS.length - 1) {
      const arrow = document.createElement("li");
      arrow.className = "mini-arrow";
      arrow.textContent = "↓ 合体";
      arrow.style.paddingLeft = "22px";
      arrow.style.fontSize = "0.7rem";
      elementGuideEl.appendChild(arrow);
    }
  });
}

function updateScoreUI() {
  scoreValueEl.textContent = score.toLocaleString();
}

function updateNextPreviewUI() {
  const def = ELEMENTS[nextDropLevel];
  nextElementEl.textContent = def.symbol;
  nextElementEl.style.background = def.color;
  nextElementEl.style.color = "#06070f";
}

function addScore(v) {
  score += v;
  updateScoreUI();
}

// -------------------------------------------------------------
// 元素ボディの生成
// -------------------------------------------------------------
function createElementBody(x, y, level) {
  const def = ELEMENTS[level];
  const body = Bodies.circle(x, y, def.radius, {
    restitution: def.restitution, // 元素ごとの反発係数（軽い元素ほどよく跳ねる）
    friction: 0.05,               // 表面摩擦を下げてよく転がる／動くように
    frictionStatic: 0.2,
    frictionAir: 0.001,
    density: 0.0016,
    label: "element",
  });
  body.gameLevel = level;
  body.pendingRemoval = false;
  return body;
}

function dropElement(x) {
  if (!canDrop || gameOverFlag) return;
  const def = ELEMENTS[currentDropLevel];
  const clampedX = clamp(x, WALL_THICKNESS + def.radius, W - WALL_THICKNESS - def.radius);
  const body = createElementBody(clampedX, spawnY, currentDropLevel);
  Composite.add(world, body);

  currentDropLevel = nextDropLevel;
  nextDropLevel = randomSpawnLevel();
  updateNextPreviewUI();

  canDrop = false;
  setTimeout(() => { canDrop = true; }, DROP_COOLDOWN_MS);
}

// -------------------------------------------------------------
// 合体（核融合）処理
// -------------------------------------------------------------
Events.on(engine, "collisionStart", (event) => {
  for (const pair of event.pairs) {
    const { bodyA, bodyB } = pair;
    if (bodyA.isStatic || bodyB.isStatic) continue;
    if (bodyA.gameLevel === undefined || bodyB.gameLevel === undefined) continue;
    if (bodyA.pendingRemoval || bodyB.pendingRemoval) continue;
    if (bodyA.gameLevel === bodyB.gameLevel) {
      bodyA.pendingRemoval = true;
      bodyB.pendingRemoval = true;
      mergeQueue.push([bodyA, bodyB]);
    }
  }
});

function processMergeQueue() {
  while (mergeQueue.length) {
    const [a, b] = mergeQueue.shift();
    const level = a.gameLevel;
    const midX = (a.position.x + b.position.x) / 2;
    const midY = (a.position.y + b.position.y) / 2;

    if (level >= MAX_LEVEL) {
      // 鉄同士の合体 → 触れていた元素を集めてから超新星爆発＆ブラックホール発生
      const touching = findTouchingElements([a, b]);
      Composite.remove(world, [a, b]);
      triggerSupernova(midX, midY, touching);
    } else {
      Composite.remove(world, [a, b]);
      const newLevel = level + 1;
      const newBody = createElementBody(midX, midY, newLevel);
      Composite.add(world, newBody);
      addScore((newLevel + 1) * 10);
      spawnParticles(midX, midY, ELEMENTS[newLevel].color, 12, 2, 4);
    }
  }
}

// -------------------------------------------------------------
// 超新星爆発 & ブラックホール
// -------------------------------------------------------------
// 指定した元素（合体した2つのFe）に接触している他の元素を集める
function findTouchingElements(sources) {
  const found = new Set();
  const bodies = Composite.allBodies(world).filter(
    (b) => !b.isStatic && b.gameLevel !== undefined && !b.pendingRemoval
  );
  for (const src of sources) {
    const srcR = ELEMENTS[src.gameLevel].radius;
    for (const b of bodies) {
      if (sources.includes(b)) continue;
      const d = Math.hypot(src.position.x - b.position.x, src.position.y - b.position.y);
      // 半径の和＋わずかなマージン以内なら「触れている」とみなす
      if (d <= srcR + ELEMENTS[b.gameLevel].radius + 6) found.add(b);
    }
  }
  return [...found];
}

function triggerSupernova(x, y, touching) {
  spawnParticles(x, y, "#ffe9b0", 60, 4, 11);
  spawnParticles(x, y, "#7ee8fa", 30, 3, 8);
  addScore(500);

  const targets = (touching || []).filter((b) => !b.pendingRemoval);

  if (!blackhole) {
    blackhole = {
      x, y,
      elapsed: 0,
      // 触れていた元素をすべて吸い込んだら消滅。無い場合は演出だけ短く出す
      maxLife: targets.length ? 6000 : 1000,
      targets,                        // 吸い込む対象（Feに触れていた元素）
      initialCount: targets.length,   // 進捗リング表示用
    };
    blackholeBanner.classList.remove("hidden");
  } else {
    // 既にブラックホールがある場合は座標を更新し、対象を追加
    blackhole.x = x;
    blackhole.y = y;
    for (const b of targets) {
      if (!blackhole.targets.includes(b)) blackhole.targets.push(b);
    }
    blackhole.initialCount = Math.max(blackhole.initialCount, blackhole.targets.length);
  }
}

function updateBlackhole(dt) {
  if (!blackhole) return;
  blackhole.elapsed += dt;

  const feR = ELEMENTS[MAX_LEVEL].radius;
  const absorbRadius = feR * 0.18;   // 中心にこれだけ近づいたら吸収（消去）
  const FORM_DELAY = 450;            // 発生後この時間は吸わず、ブラックホールだけ見せる(ms)
  const PULL_PX_PER_SEC = 80;        // 吸い寄せ速度（重力ドリフトに打ち勝ちつつ、ゆっくり見える速さ）

  // すでに消えた対象（他の合体などで消滅）を除外
  blackhole.targets = blackhole.targets.filter((b) => !b.pendingRemoval);

  // 発生直後は少し“間”を置いてから、ゆっくり吸い始める
  if (blackhole.elapsed >= FORM_DELAY) {
    const move = (PULL_PX_PER_SEC * dt) / 1000; // 1フレームの移動量（ゆっくり一定速度）
    for (const b of blackhole.targets) {
      const dx = blackhole.x - b.position.x;
      const dy = blackhole.y - b.position.y;
      const dist = Math.hypot(dx, dy) || 1;

      if (dist < absorbRadius) {
        b.pendingRemoval = true;
        Composite.remove(world, b);
        addScore(30);
        spawnParticles(b.position.x, b.position.y, "#a78bfa", 10, 1, 4);
        continue;
      }

      // 吸い込み中は当たり判定をすり抜けにして、他の元素を通り抜け中心へ滑り込ませる
      if (!b.beingAbsorbed) {
        b.beingAbsorbed = true;
        b.isSensor = true;
      }
      // ゆっくり中心へ吸い寄せる（物理速度を打ち消しつつ位置を補間）
      const stepMove = Math.min(move, dist);
      Body.setVelocity(b, { x: 0, y: 0 });
      Body.setPosition(b, {
        x: b.position.x + (dx / dist) * stepMove,
        y: b.position.y + (dy / dist) * stepMove,
      });
      Body.setAngularVelocity(b, 0.2); // くるくる回して吸い込み感を出す
    }
  }

  // 残りの対象を除去してから存否を判定
  blackhole.targets = blackhole.targets.filter((b) => !b.pendingRemoval);

  // 対象をすべて吸い込んだ／対象が居なくなった／保険寿命超過で消滅
  if (blackhole.targets.length === 0 || blackhole.elapsed >= blackhole.maxLife) {
    // 吸い切れずに残った対象があれば当たり判定を元に戻す（すり抜けのまま放置しない）
    for (const b of blackhole.targets) {
      b.isSensor = false;
      b.beingAbsorbed = false;
    }
    blackhole = null;
    blackholeBanner.classList.add("hidden");
  }
}

// -------------------------------------------------------------
// パーティクル演出
// -------------------------------------------------------------
function spawnParticles(x, y, color, count, minSpeed, maxSpeed) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.012 + Math.random() * 0.02,
      size: 1.5 + Math.random() * 2.5,
      color,
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// -------------------------------------------------------------
// ゲームオーバー判定
// -------------------------------------------------------------
function checkGameOver() {
  if (gameOverFlag) return;
  const bodies = Composite.allBodies(world).filter((b) => !b.isStatic && b.gameLevel !== undefined);

  const settledOverLine = bodies.some((b) => {
    const topY = b.position.y - ELEMENTS[b.gameLevel].radius;
    return topY < DANGER_LINE_Y && b.speed < 0.7;
  });

  const now = performance.now();
  if (settledOverLine) {
    if (overLineSince === null) overLineSince = now;
    else if (now - overLineSince > GAMEOVER_GRACE_MS) {
      triggerGameOver();
    }
  } else {
    overLineSince = null;
  }
}

function triggerGameOver() {
  gameOverFlag = true;
  canDrop = false;
  finalScoreValueEl.textContent = score.toLocaleString();
  playerNameInput.value = "";
  gameoverOverlay.classList.remove("hidden");
}

function resetGame() {
  const bodies = Composite.allBodies(world).filter((b) => !b.isStatic);
  Composite.remove(world, bodies);

  score = 0;
  currentDropLevel = randomSpawnLevel();
  nextDropLevel = randomSpawnLevel();
  particles = [];
  blackhole = null;
  overLineSince = null;
  gameOverFlag = false;
  canDrop = true;

  blackholeBanner.classList.add("hidden");
  gameoverOverlay.classList.add("hidden");
  updateScoreUI();
  updateNextPreviewUI();
}

// -------------------------------------------------------------
// 描画
// -------------------------------------------------------------
function drawElementBody(b) {
  const def = ELEMENTS[b.gameLevel];
  const { x, y } = b.position;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, def.radius, 0, Math.PI * 2);
  ctx.fillStyle = def.color;
  ctx.shadowColor = def.color;
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff55";
  ctx.stroke();

  ctx.fillStyle = "#06070f";
  ctx.font = `800 ${Math.max(11, def.radius * 0.42)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(def.symbol, x, y);
  ctx.restore();
}

function drawBlackhole() {
  const { x, y } = blackhole;
  const feR = ELEMENTS[MAX_LEVEL].radius;
  const glowR = feR * 1.3;
  const coreR = feR * 0.32;
  const ringR = feR * 0.52;
  const remaining = blackhole.targets.length;                    // 残りの吸収対象数
  const progress = blackhole.initialCount
    ? 1 - remaining / blackhole.initialCount                      // 吸収進捗（0→1）
    : 1;
  const pulse = 1 + Math.sin(performance.now() / 90) * 0.08;

  ctx.save();
  const grad = ctx.createRadialGradient(x, y, 4, x, y, glowR * pulse);
  grad.addColorStop(0, "#000000");
  grad.addColorStop(0.5, "#3d1f6acc");
  grad.addColorStop(1, "#a78bfa00");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, glowR * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, coreR, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.shadowColor = "#a78bfa";
  ctx.shadowBlur = 24;
  ctx.fill();
  ctx.shadowBlur = 0;

  // 吸収進捗リング
  ctx.beginPath();
  ctx.strokeStyle = "#a78bfa";
  ctx.lineWidth = 3;
  ctx.arc(x, y, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - progress));
  ctx.stroke();

  // 残り吸収数を中央に表示
  ctx.fillStyle = "#e8ecff";
  ctx.font = `800 ${Math.max(12, feR * 0.5)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(remaining, x, y);
  ctx.restore();
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

function drawAimGhost() {
  if (aimX === null || gameOverFlag) return;
  const def = ELEMENTS[currentDropLevel];
  const x = clamp(aimX, WALL_THICKNESS + def.radius, W - WALL_THICKNESS - def.radius);

  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = "#ffffff33";
  ctx.beginPath();
  ctx.moveTo(x, spawnY + def.radius);
  ctx.lineTo(x, H);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.arc(x, spawnY, def.radius, 0, Math.PI * 2);
  ctx.fillStyle = def.color;
  ctx.fill();
  ctx.fillStyle = "#06070f";
  ctx.font = `800 ${Math.max(11, def.radius * 0.42)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(def.symbol, x, spawnY);
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  if (blackhole) drawBlackhole();

  for (const b of Composite.allBodies(world)) {
    if (b.isStatic) continue;
    drawElementBody(b);
  }

  drawParticles();

  if (canDrop) drawAimGhost();
}

// -------------------------------------------------------------
// メインループ
// -------------------------------------------------------------
let lastTime = null;
const FIXED_DT = 1000 / 60;

function loop(timestamp) {
  requestAnimationFrame(loop);
  if (lastTime === null) lastTime = timestamp;
  const realDelta = clamp(timestamp - lastTime, 0, 50);
  lastTime = timestamp;

  Engine.update(engine, FIXED_DT);
  processMergeQueue();
  updateBlackhole(realDelta);
  updateParticles();
  checkGameOver();
  draw();
}

// -------------------------------------------------------------
// 入力ハンドリング
// -------------------------------------------------------------
function getCanvasX(evt) {
  const rect = canvas.getBoundingClientRect();
  return evt.clientX - rect.left;
}

canvas.addEventListener("pointermove", (evt) => {
  aimX = getCanvasX(evt);
});

canvas.addEventListener("pointerdown", (evt) => {
  aimX = getCanvasX(evt);
  dropElement(aimX);
});

canvas.addEventListener("pointerleave", () => {
  aimX = null;
});

window.addEventListener("resize", debounce(() => {
  buildWalls();
}, 200));

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
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
    const { error } = await supabaseClient.from("scores").insert([{ name, score: scoreValue }]);
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
      .from("scores")
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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

btnRestart.addEventListener("click", () => {
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
  buildWalls();
  renderElementGuide();
  updateScoreUI();
  updateNextPreviewUI();
  requestAnimationFrame(loop);
}

init();
