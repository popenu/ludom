/* ===================================================
   ほんとに何割引？ - ゲームロジック
   スーパーのチラシ・値札シール風の割引計算クイズ。
   6タイプの問題を毎回ランダム生成して10問（序盤は易しく、後半ほど難しく）。
   誤答の選択肢は「よくある勘違い」から作り、勘違いの種類を紐付けて診断する。
=================================================== */
(function () {
  "use strict";

  const QUESTIONS = 10;
  const TIME_BASE = 15;        // 1問の制限時間（秒）
  const TIME_HARD = 20;        // 難しい問題（レベル3）の制限時間
  const POINT_CORRECT = 100;   // 正解の基本点
  const POINT_SPEED = 50;      // 速さボーナスの最大

  // ---------- 勘違いの種類 ----------
  const MISTAKES = {
    add: { name: "割引を足し算しがち", advice: "「30%引き＋50%引き」は80%引きではなく、残りの70%にさらに50%引き＝65%引き。割引は掛け算で重ねよう。" },
    remain: { name: "値引き額と支払額を取り違えがち", advice: "「3割引」で払うのは7割。引かれる分と払う分、どっちを聞かれているか確認しよう。" },
    taxForget: { name: "税込にし忘れがち", advice: "「税抜」表示の値札は、最後に×1.1（食品は×1.08）を忘れずに。" },
    taxOrder: { name: "割引と税をまとめて足し引きしがち", advice: "「2割引で税10%なら1割引」は間違い。×0.8してから×1.1。掛け算は順番を入れ替えてもいいが、足し引きにはできない。" },
    taxRate: { name: "軽減税率をうっかりしがち", advice: "食品（持ち帰り）は8%、それ以外は10%。値札の小さな文字までチェック。" },
    reverseMul: { name: "逆算で掛け算に戻しがち", advice: "4割引で1,200円なら定価は 1,200÷0.6。×1.4 では元に戻らない。" },
    pointSame: { name: "ポイント還元を値引きと同一視しがち", advice: "10%ポイント還元は、値引きされた後の支払額にかかるうえ、使うまでお金じゃない。同じ%なら値引きのほうが得。" },
    secondHalf: { name: "「2点目半額」に弱い", advice: "2点目半額は2個合わせて25%引き、3点目無料は約33%引き。「半額」「無料」の響きに注意。" },
    fixedVsRate: { name: "定額と定率の比較が苦手", advice: "「◯円引き」と「◯%引き」は、買う金額で有利不利が入れ替わる。％を円に直して比べよう。" },
    bulkTrap: { name: "まとめ買い＝お得と思い込みがち", advice: "パックがいつも安いとは限らない。単品セールと合計金額で比べよう。" },
    calc: { name: "計算ミスしがち", advice: "式は合っていそう。最後の掛け算をもう一回だけ見直そう。" },
  };

  // ---------- 小道具 ----------
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  // 3桁区切り（小数も可）
  const num = (n) => {
    const [i, d] = String(Math.round(n * 1000) / 1000).split(".");
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d ? "." + d : "");
  };
  const yen = (n) => `${num(n)}円`;
  // 割合（10分率の整数 A）→ 掛け算の係数の表記（例：A=3 → "0.7"）
  const keep = (A) => (A === 0 ? "1" : `0.${10 - A}`);
  const pct = (A) => `${A * 10}%`;

  // 商品（food は軽減税率8%の対象）
  const GOODS = [
    { name: "ハンドタオル", food: false }, { name: "マグカップ", food: false }, { name: "スニーカー", food: false },
    { name: "電気ケトル", food: false }, { name: "折りたたみ傘", food: false }, { name: "Tシャツ", food: false },
    { name: "フライパン", food: false }, { name: "イヤホン", food: false }, { name: "洗たく洗剤", food: false },
    { name: "リュック", food: false }, { name: "ボールペン10本", food: false }, { name: "クッション", food: false },
  ];
  const FOODS = [
    { name: "幕の内弁当", food: true }, { name: "お刺身盛り合わせ", food: true }, { name: "和牛こま切れ", food: true },
    { name: "にぎり寿司", food: true }, { name: "鶏の唐揚げ", food: true }, { name: "いちご1パック", food: true },
    { name: "うなぎ蒲焼", food: true }, { name: "ローストビーフ", food: true },
  ];
  const PACKS = [
    { name: "ヨーグルト", unit: "個" }, { name: "カップ麺", unit: "個" }, { name: "ツナ缶", unit: "缶" },
    { name: "ボックスティッシュ", unit: "箱" }, { name: "炭酸水", unit: "本" }, { name: "歯ブラシ", unit: "本" },
    { name: "入浴剤", unit: "個" }, { name: "単3電池", unit: "本" },
  ];

  // ---------- 値札・シールの部品（HTML 文字列） ----------
  const tag = (name, priceHtml, sub = "") =>
    `<div class="ptag"><div class="ptag-name">${name}</div>${sub ? `<div class="ptag-sub">${sub}</div>` : ""}<div class="ptag-price">${priceHtml}</div></div>`;
  const price = (n, opt = {}) =>
    `${opt.label ? `<span class="pp-label">${opt.label}</span>` : ""}<span class="pp-num${opt.strike ? " strike" : ""}">${num(n)}</span><span class="pp-yen">円</span>${opt.tax ? `<span class="pp-tax">${opt.tax}</span>` : ""}`;
  const sticker = (html, color = "red", tilt = -8) => `<span class="stk stk-${color}" style="--tilt:${tilt}deg">${html}</span>`;
  const coupon = (html) => `<span class="cpn">${html}</span>`;
  const stickers = (...s) => `<div class="stks">${s.join("")}</div>`;
  const vs = (a, b) => `<div class="vs"><div class="vs-card"><span class="vs-key">A</span>${a}</div><div class="vs-mid">vs</div><div class="vs-card"><span class="vs-key">B</span>${b}</div></div>`;

  // ---------- 選択肢づくり ----------
  // answer: 正解の値 / cands: [{ v, mis }]（優先順）/ step: 埋め草の刻み / fmt: 表示
  function numericChoices(answer, cands, step, fmt, opt = {}) {
    const min = opt.min === undefined ? 1 : opt.min;
    const max = opt.max === undefined ? Infinity : opt.max;
    const used = new Set([answer]);
    const out = [{ v: answer, mis: null }];
    for (const c of cands) {
      if (out.length >= 4) break;
      if (!Number.isInteger(c.v) || c.v < min || c.v > max || used.has(c.v)) continue;
      used.add(c.v);
      out.push(c);
    }
    // 足りない分は正解の近くの値（計算ミス）で埋める
    for (let k = 1; out.length < 4 && k < 50; k++) {
      for (const s of shuffle([1, -1])) {
        const v = answer + s * k * step;
        if (out.length < 4 && v >= min && v <= max && !used.has(v)) { used.add(v); out.push({ v, mis: "calc" }); }
      }
    }
    return shuffle(out).map((c) => ({ label: fmt(c.v), v: c.v, mis: c.mis, correct: c.mis === null }));
  }

  // 「どっちがお得」の選択肢。better: "A" | "B"、same: 「同じ」を出すか、misA/misB/misSame: 誤答の勘違い
  function compareChoices(better, mis, withSame, misSame, word = "お得") {
    const out = [
      { label: `A が${word}`, v: "A", mis: better === "A" ? null : mis, correct: better === "A" },
      { label: `B が${word}`, v: "B", mis: better === "B" ? null : mis, correct: better === "B" },
    ];
    if (withSame) out.push({ label: "どちらも同じ", v: "same", mis: misSame || mis, correct: false });
    return out;
  }

  // ===================================================
  //  問題の生成（タイプごと）
  //  戻り値: { type, typeName, level, pop(HTML), text(HTML), choices, limit, explain[], note }
  // ===================================================

  // 1. 重ね割引
  function genStack(level) {
    const item = pick(GOODS);
    let A, B;
    if (level === 1) { A = pick([2, 3]); B = pick([3, 5]); }
    else if (level === 2) { A = ri(1, 4); B = pick([2, 3, 5]); }
    else { A = ri(2, 5); B = ri(2, 5); }
    // レベル3は半分の確率で「合計何%引き？」
    if (level >= 2 && Math.random() < (level === 3 ? 0.55 : 0.3)) {
      const ans = 100 - (10 - A) * (10 - B);   // 合計の割引率（%）
      const pay = (10 - A) * (10 - B);
      const cands = shuffle([{ v: A * B, mis: "calc" }, { v: pay, mis: "remain" }]);
      cands.unshift({ v: (A + B) * 10, mis: "add" });
      return {
        type: "stack", typeName: "重ね割引", level,
        pop: tag(item.name, price(ri(10, 50) * 100, { label: "定価" })) + stickers(sticker(`${pct(A)}<small>引</small>`, "red", -10), coupon(`クーポン<b>${pct(B)}</b>OFF`)),
        text: `${pct(A)}引きの${item.name}に、さらに<b>${pct(B)}OFFクーポン</b>。<br>定価から見て、合計<b>何%引き</b>？`,
        choices: numericChoices(ans, cands, 5, (v) => (v >= 100 ? "100%引き（タダ）" : `${v}%引き`), { max: 100 }),
        explain: [`残るのは ${keep(A)} × ${keep(B)} = ${pay / 100}`, `→ 定価の${pay}%を払う ＝ <b>${ans}%引き</b>`],
        note: `${pct(A)}＋${pct(B)}＝${pct(A + B)}引き…ではない。2回目の割引は、値下がりした後の値段にかかる。`,
      };
    }
    if (A + B > 9) B = 9 - A;
    const P = level === 1 ? pick([1000, 2000, 3000, 4000, 5000]) : level === 2 ? ri(6, 48) * 100 : ri(11, 59) * 100;
    const ans = P * (10 - A) * (10 - B) / 100;
    return {
      type: "stack", typeName: "重ね割引", level,
      pop: tag(item.name, price(P, { label: "定価" })) + stickers(sticker(`${pct(A)}<small>引</small>`, "red", -10), coupon(`レジで<b>${pct(B)}</b>OFF`)),
      text: `定価${yen(P)}の${item.name}が${pct(A)}引き。<br>レジでさらに<b>${pct(B)}OFF</b>のクーポン。いくら？`,
      choices: numericChoices(ans, [
        { v: P * (10 - A - B) / 10, mis: "add" },
        { v: P - ans, mis: "remain" },
        { v: P * (10 - Math.max(A, B)) / 10, mis: "calc" },
      ], P >= 2000 ? 100 : 50, yen),
      explain: [`${num(P)} × ${keep(A)} × ${keep(B)} = <b>${yen(ans)}</b>`],
      note: `${pct(A)}＋${pct(B)}＝${pct(A + B)}引き（${yen(P * (10 - A - B) / 10)}）ではない。割引は掛け算で重なる。`,
    };
  }

  // 2. 税込・税抜
  function genTax(level) {
    const food = level === 3 && Math.random() < 0.5;
    const item = pick(food ? FOODS : GOODS);
    const T = food ? 8 : 10;
    const B = level === 1 ? pick([1000, 2000, 3000, 1500, 2500, 500]) : level === 2 ? ri(5, 40) * 100 : ri(3, 30) * 100 - pick([20, 2, 50]);
    const A = level === 1 ? ri(1, 3) : ri(1, 5);
    const ans = Math.floor(B * (10 - A) * (100 + T) / 1000);
    const pre = B * (10 - A) / 10;   // 割引後の税抜（小数もありうる）
    const frac = ans !== B * (10 - A) * (100 + T) / 1000;
    return {
      type: "tax", typeName: "税込・税抜", level,
      pop: tag(item.name, price(B, { tax: "（税抜）" }), food ? "食品・持ち帰り" : "") + stickers(sticker(`${A}割<small>引</small>`, "yellow", 8)),
      text: `税抜${yen(B)}の${item.name}が${A}割引。<br><b>税込（${T}%）</b>でいくら？${frac ? "<small>※1円未満は切り捨て</small>" : ""}`,
      choices: numericChoices(ans, [
        { v: Math.floor(pre), mis: "taxForget" },
        { v: Math.floor(B * (100 - 10 * A + T) / 100), mis: "taxOrder" },
        { v: Math.floor(B * (10 - A) * (100 + (T === 10 ? 8 : 10)) / 1000), mis: "taxRate" },
      ], 10, yen),
      explain: [`税抜 ${num(B)} × ${keep(A)} = ${num(pre)}円`, `× ${T === 10 ? "1.1" : "1.08"} = ${num(B * (10 - A) * (100 + T) / 1000)}${frac ? " → 切り捨て" : ""} <b>${yen(ans)}</b>`],
      note: food
        ? "持ち帰りの食品は軽減税率8%。「割引−税」と足し引きでまとめず、×0.8×1.08 のように掛け算で。"
        : `「${A}割引で税1割なら${A - 1 > 0 ? `${A - 1}割引` : "定価"}」とまとめるのはまちがい。掛け算で順に。`,
    };
  }

  // 3. どっちがお得
  // used: 同じセットで既に出した種類（なるべく重ならないようにする）
  function genCompare(level, used = new Set()) {
    const pool = level === 1 ? ["coupon"] : level === 2 ? ["coupon", "second", "point"] : ["second3", "point", "point"];
    const fresh = pool.filter((k) => !used.has(k));
    const kind = pick(fresh.length ? fresh : pool);
    used.add(kind);
    if (kind === "coupon") {
      // ◯円引きクーポン vs ◯%OFF
      for (;;) {
        const P = ri(8, 60) * 100;
        const X = ri(1, 3);
        const rateOff = P * X / 10;
        const C = Math.max(100, Math.round((rateOff + pick([-1, 1]) * ri(1, level === 1 ? 6 : 3) * 100) / 100) * 100);
        if (C === rateOff || C >= P) continue;
        const better = C > rateOff ? "A" : "B";
        return {
          type: "compare", typeName: "どっちがお得", level,
          pop: tag("お会計", price(P)) + vs(coupon(`<b>${num(C)}円</b>引き`), coupon(`<b>${pct(X)}</b>OFF`)),
          text: `お会計${yen(P)}。使えるクーポンは1枚だけ。<br>どっちがお得？`,
          choices: compareChoices(better, "fixedVsRate", false),
          explain: [`A：${num(P)} − ${num(C)} = ${yen(P - C)}`, `B：${num(P)} × ${keep(X)} = ${yen(P - rateOff)}`, `→ <b>${better} がお得</b>`],
          note: `${pct(X)}OFFは${yen(P)}だと${yen(rateOff)}引き。％は円に直して比べる。`,
        };
      }
    }
    if (kind === "second" || kind === "second3") {
      // 2点目半額 / 3点目無料 vs 全品◯割引（同じ商品を2つ／3つ買う）
      const n = kind === "second" ? 2 : 3;
      const item = pick(FOODS);
      const U = ri(3, 12) * 100;
      const X = n === 2 ? pick([2, 3]) : pick([3, 4]);
      const deal = n === 2 ? U * 1.5 : U * 2;       // 2点目半額 / 3点目無料
      const rate = n * U * (10 - X) / 10;
      const better = deal < rate ? "A" : "B";
      const dealName = n === 2 ? "2点目半額" : "3点目無料";
      return {
        type: "compare", typeName: "どっちがお得", level,
        pop: tag(item.name, price(U), `${n}つ買う`) + vs(sticker(n === 2 ? "2点目<br><b>半額</b>" : "3点目<br><b>無料</b>", "yellow", -6), sticker(`全品<br><b>${X}割</b>引`, "red", 6)),
        text: `1つ${yen(U)}の${item.name}を<b>${n}つ</b>買う。<br>A「${dealName}」と B「全品${X}割引」、どっちがお得？`,
        choices: compareChoices(better, "secondHalf", false),
        explain: [
          `A：${num(U)} × ${n === 2 ? "1.5" : "2"} = ${yen(deal)}（${n === 2 ? "25%" : "約33%"}引き）`,
          `B：${num(U)} × ${n} × ${keep(X)} = ${yen(rate)}（${pct(X)}引き）`,
          `→ <b>${better} がお得</b>`,
        ],
        note: n === 2 ? "「2点目半額」は2つ合わせると25%引き。半額の響きほどは安くない。" : "「3点目無料」は3つ合わせて約33%引き。3割引よりは得、4割引よりは損。",
      };
    }
    // ポイント還元 vs 値引き
    for (;;) {
      const item = pick(GOODS);
      const P = ri(2, 10) * 1000;
      const Y = ri(1, 3), Z = ri(1, 2);
      const trap = level === 3 || Math.random() < 0.6;
      const X = trap ? Y + Z : Y + Z - 1;   // trap: 足すと同じ％になる
      if (X < 1) continue;
      const a = P * (10 - X) / 10;                 // A の支払額
      const bPay = P * (10 - Y) / 10;              // B の支払額
      const pt = bPay * Z / 10;                    // B でもらえるポイント
      const b = bPay - pt;                         // B の実質
      if (a === b) continue;                       // 引き分けは出さない
      const better = a < b ? "A" : "B";
      return {
        type: "compare", typeName: "どっちがお得", level,
        pop: tag(item.name, price(P)) + vs(sticker(`<b>${pct(X)}</b><br>引き`, "red", -6), `${sticker(`<b>${pct(Y)}</b><br>引き`, "red", 4)}${sticker(`<b>${pct(Z)}</b><small>pt還元</small>`, "blue", -4)}`),
        text: `${yen(P)}の${item.name}。<br>A「${pct(X)}引き」と B「${pct(Y)}引き＋${pct(Z)}ポイント還元」、実質どっちがお得？<small>※ポイントは支払額に付き、1pt＝1円で必ず使う</small>`,
        choices: compareChoices(better, trap ? "pointSame" : "calc", true, "pointSame"),
        explain: [`A：${num(P)} × ${keep(X)} = ${yen(a)}`, `B：${num(P)} × ${keep(Y)} = ${yen(bPay)}、ポイント ${num(pt)}pt → 実質 ${yen(b)}`, `→ <b>${better} がお得</b>`],
        note: trap
          ? `${pct(Y)}＋${pct(Z)}＝${pct(X)}でも同じではない。ポイントは値引き後の支払額にしか付かない。`
          : "ポイントは「値引き後の支払額×還元率」。円に直して比べる。",
      };
    }
  }

  // 4. まとめ買い
  function genBulk(level) {
    for (;;) {
      const item = pick(PACKS);
      const n = level === 3 ? pick([3, 4, 5]) : pick([3, 4]);
      const U = ri(10, 40) * 10;
      const X = ri(1, 3);
      const single = n * U * (10 - X) / 10;
      const gap = level === 2 ? ri(3, 9) * 10 : ri(1, 4) * 10;
      // パックが損になる問題を多めに（「まとめ買い＝お得」の思い込みを突く）
      const packWorse = Math.random() < 0.6;
      const K = single + (packWorse ? gap : -gap);
      if (K >= n * U || K <= 0 || K === single) continue;
      const better = K < single ? "A" : "B";
      return {
        type: "bulk", typeName: "まとめ買い", level,
        pop: vs(tag(`${item.name} ${n}${item.unit}パック`, price(K)), `${tag(`${item.name} 1${item.unit}`, price(U))}${sticker(`<b>${X}割</b><br>引`, "red", 8)}`),
        text: `${item.name}が<b>${n}${item.unit}</b>ほしい。<br>A「${n}${item.unit}パック${yen(K)}」と B「単品${yen(U)}の${X}割引」、どっちが安い？`,
        choices: compareChoices(better, "bulkTrap", false, null, "安い"),
        explain: [`A：${yen(K)}`, `B：${num(U)} × ${keep(X)} × ${n} = ${yen(single)}`, `→ <b>${better} が${Math.abs(K - single)}円安い</b>`],
        note: better === "B" ? "パックが安いとは限らない。単品セールのほうが安いこともよくある。" : "今回はパックの勝ち。合計で比べるのが確実。",
      };
    }
  }

  // 5. 逆算（割引後の値段から定価）
  function genReverse(level) {
    const item = pick(GOODS);
    const A = level === 2 ? pick([2, 3, 4, 5]) : ri(2, 6);
    const P = level === 2 ? pick([ri(1, 6) * 1000, ri(10, 40) * 100]) : ri(12, 60) * 100;
    const S = P * (10 - A) / 10;
    return {
      type: "reverse", typeName: "逆算", level,
      pop: tag(item.name, price(S, { label: "割引後" }), "定価 ？？？円") + stickers(sticker(`${A}割<small>引</small>`, "red", -8)),
      text: `${A}割引で<b>${yen(S)}</b>だった${item.name}。<br>もとの<b>定価</b>はいくら？`,
      choices: numericChoices(P, [
        { v: S * (10 + A) / 10, mis: "reverseMul" },
        { v: S * 10 / A, mis: "remain" },
        { v: S + A * 100, mis: "calc" },
      ], 100, yen),
      explain: [`定価 × ${keep(A)} = ${num(S)}`, `→ 定価 = ${num(S)} ÷ ${keep(A)} = <b>${yen(P)}</b>`],
      note: `${num(S)} × 1.${A} = ${yen(S * (10 + A) / 10)} では戻らない。${A}割引の後は「定価の${10 - A}割」なので、÷${keep(A)} で戻す。`,
    };
  }

  // 6. 半額シールの上から更に割引（閉店間際）
  function genHalf(level) {
    const item = pick(FOODS);
    const P = level === 1 ? ri(4, 10) * 100 : ri(3, 15) * 100 - pick([0, 20]);
    const A = level === 1 ? pick([1, 2, 3]) : level === 2 ? pick([2, 3, 4]) : pick([3, 4, 5]);
    const ans = P * (10 - A) / 20;
    return {
      type: "half", typeName: "半額シール", level,
      pop: tag(item.name, price(P)) + stickers(sticker("半額", "yellow", -12), sticker(`さらに<br><b>${A}割</b>引`, "red", 10)),
      text: `閉店間際。${yen(P)}の${item.name}に<b>半額シール</b>、<br>その上から<b>さらに${A}割引</b>シール。いくら？`,
      choices: numericChoices(ans, [
        { v: P * (5 - A) / 10, mis: "add" },
        { v: P / 2 - ans, mis: "remain" },
        { v: P * (10 - A) / 10, mis: "calc" },
      ], level === 1 ? 50 : 20, (v) => (v === 0 ? "0円（タダ）" : yen(v)), { min: A === 5 ? 0 : 1 }),
      explain: [`${num(P)} × 0.5 × ${keep(A)} = <b>${yen(ans)}</b>`],
      note: `半額＋${A}割引＝${5 + A}割引…ではない。半額になった${yen(P / 2)}から、さらに${A}割引。`,
    };
  }

  const TYPES = [
    { id: "half", base: 1, gen: genHalf },
    { id: "stack", base: 1.2, gen: genStack },
    { id: "compare", base: 1.8, gen: genCompare },
    { id: "tax", base: 2, gen: genTax },
    { id: "bulk", base: 2.2, gen: genBulk },
    { id: "reverse", base: 2.8, gen: genReverse },
  ];

  // 10問の並び：全タイプ1回ずつ＋ランダム4問。易しいタイプを前、難しいタイプを後ろへ
  function generateSet() {
    const list = TYPES.slice();
    while (list.length < QUESTIONS) {
      const t = pick(TYPES);
      if (list.filter((x) => x === t).length < 2) list.push(t);
    }
    // 難易度順に並べる（揺らぎつき）。同じタイプが続いたら並べ直す
    let order;
    for (let tries = 0; tries < 200; tries++) {
      order = list.map((t) => ({ t, key: t.base + Math.random() * 1.6 })).sort((a, b) => a.key - b.key).map((x) => x.t);
      if (order.every((t, i) => i === 0 || t !== order[i - 1])) break;
    }
    const used = new Set();
    return order.map((t, i) => {
      const level = i < 3 ? 1 : i < 7 ? 2 : 3;
      // 逆算・まとめ買いはレベル1を作らない（最低2）
      const lv = (t.id === "reverse" || t.id === "bulk") ? Math.max(2, level) : level;
      const q = t.gen(lv, used);
      q.limit = lv === 3 ? TIME_HARD : TIME_BASE;
      return q;
    });
  }

  // 得点：正解100点＋速さボーナス（残り時間の割合 × 50）
  const scoreFor = (correct, elapsed, limit) =>
    correct ? POINT_CORRECT + Math.round(POINT_SPEED * Math.max(0, 1 - elapsed / limit)) : 0;

  const Core = { TYPES, MISTAKES, generateSet, scoreFor, gen: { genStack, genTax, genCompare, genBulk, genReverse, genHalf } };
  if (typeof module !== "undefined" && module.exports) module.exports = Core;
  if (typeof document === "undefined") return;   // node から読み込んだときはここまで

  // ===================================================
  //  ここから画面
  // ===================================================
  const $ = (id) => document.getElementById(id);
  const BEST_KEY = "waribiki-best";
  const MAX_SCORE = QUESTIONS * (POINT_CORRECT + POINT_SPEED);

  const RANKS = [
    { min: 1300, name: "値札の鬼", comment: "チラシを見た瞬間に実質価格が浮かぶ。レジの店員より先に合計が言える。" },
    { min: 1100, name: "チラシ読みのプロ", comment: "朝刊のチラシは赤ペン片手に。たまにポイント還元に心が揺れる。" },
    { min: 900, name: "特売ハンター", comment: "得する嗅覚はある。あとは計算のスピードだけ。" },
    { min: 700, name: "ポイントカードは全部持ってる人", comment: "財布がカードで分厚い。でも本当に得してるかは、ちょっと怪しい。" },
    { min: 450, name: "なんとなく得した気分の人", comment: "「80%引き！」の文字に胸が高鳴る。だいたい65%引き。" },
    { min: -1, name: "レジで初めて気づく人", comment: "「あれ、思ったより高い…」が口ぐせ。まずは割引を掛け算するところから。" },
  ];

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
    tap() { tone(700, 0, 0.05, "triangle", 0.06); },
    ok() { tone(988, 0, 0.12, "square", 0.05); tone(1319, 0.09, 0.22, "square", 0.05); },   // レジの「ピピッ」
    ng() { tone(220, 0, 0.18, "sawtooth", 0.05); tone(165, 0.12, 0.28, "sawtooth", 0.05); },
    tick() { tone(1500, 0, 0.03, "sine", 0.04); },
    fin() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.09, 0.25, "triangle", 0.07)); },
  };

  // ---------- 状態 ----------
  const state = {
    phase: "start",      // start | answer | reveal | result
    list: [],
    idx: 0,
    score: 0,
    correct: 0,
    log: [],             // { q, chosen(index or -1), correct, pts, elapsed }
    t0: 0,
    raf: 0,
    lastSec: 0,
  };

  // ---------- 進行 ----------
  function startGame() {
    audio();
    state.list = generateSet();
    state.idx = 0;
    state.score = 0;
    state.correct = 0;
    state.log = [];
    $("score-value").textContent = "0";
    $("correct-value").textContent = "0";
    showScreen("play");
    nextQuestion();
  }

  function nextQuestion() {
    const q = state.list[state.idx];
    state.phase = "answer";
    $("q-index").textContent = String(state.idx + 1);
    $("q-type").textContent = q.typeName;
    $("q-level").textContent = "★".repeat(q.level) + "☆".repeat(3 - q.level);
    $("pop").innerHTML = q.pop;
    $("q-text").innerHTML = q.text;
    const box = $("choices");
    box.innerHTML = "";
    box.className = "choices" + (q.choices.length === 4 ? " grid4" : " col");
    q.choices.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = `<span class="ch-key">${i + 1}</span><span class="ch-label">${c.label}</span><span class="ch-mis"></span>`;
      b.addEventListener("click", () => answer(i));
      box.appendChild(b);
    });
    $("reveal").classList.add("hidden");
    const flyer = $("flyer");
    flyer.classList.remove("enter"); void flyer.offsetWidth; flyer.classList.add("enter");
    state.t0 = performance.now();
    state.lastSec = Math.ceil(q.limit);
    cancelAnimationFrame(state.raf);
    tick();
  }

  function tick() {
    if (state.phase !== "answer") return;
    const q = state.list[state.idx];
    const t = (performance.now() - state.t0) / 1000;
    const rest = Math.max(0, 1 - t / q.limit);
    const fill = $("timer-fill");
    fill.style.width = `${rest * 100}%`;
    fill.className = "timer-fill" + (rest < 0.25 ? " hot" : rest < 0.5 ? " warm" : "");
    const sec = Math.ceil(q.limit - t);
    $("timer-sec").textContent = String(Math.max(0, sec));
    if (sec < state.lastSec && sec <= 3 && sec > 0) sfx.tick();
    state.lastSec = sec;
    if (rest <= 0) { answer(-1); return; }
    state.raf = requestAnimationFrame(tick);
  }

  function answer(i) {
    if (state.phase !== "answer") return;
    const q = state.list[state.idx];
    if (i >= q.choices.length) return;
    state.phase = "reveal";
    cancelAnimationFrame(state.raf);
    const elapsed = Math.min(q.limit, (performance.now() - state.t0) / 1000);
    const ok = i >= 0 && q.choices[i].correct;
    const pts = scoreFor(ok, elapsed, q.limit);
    state.score += pts;
    if (ok) state.correct++;
    state.log.push({ q, chosen: i, correct: ok, pts, elapsed });
    $("score-value").textContent = String(state.score);
    $("correct-value").textContent = String(state.correct);

    // 選択肢の色分け
    const btns = [...$("choices").children];
    btns.forEach((b, k) => {
      b.disabled = true;
      const c = q.choices[k];
      if (c.correct) b.classList.add("is-correct");
      else if (k === i) {
        b.classList.add("is-wrong");
        if (c.mis && c.mis !== "calc") b.querySelector(".ch-mis").textContent = MISTAKES[c.mis].name;
      } else b.classList.add("is-dim");
    });

    const head = $("rv-head");
    if (ok) {
      head.innerHTML = `<span class="rv-stamp ok">正解</span><span class="rv-pts mono">+${pts}</span>`;
      sfx.ok();
    } else {
      head.innerHTML = `<span class="rv-stamp ng">${i < 0 ? "時間切れ" : "ざんねん"}</span><span class="rv-ans">正解は <b>${q.choices.find((c) => c.correct).label}</b></span>`;
      sfx.ng();
    }
    $("rv-explain").innerHTML = q.explain.map((l) => `<div>${l}</div>`).join("");
    $("rv-note").textContent = q.note;
    $("btn-next").textContent = state.idx + 1 >= state.list.length ? "結果を見る" : "次へ";
    $("reveal").classList.remove("hidden");
    $("reveal").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function onNext() {
    if (state.phase !== "reveal") return;
    sfx.tap();
    state.idx++;
    if (state.idx >= state.list.length) finish();
    else { nextQuestion(); window.scrollTo(0, 0); }
  }

  // ---------- 結果 ----------
  function diagnose() {
    const count = {};
    let timeouts = 0;
    for (const r of state.log) {
      if (r.correct) continue;
      if (r.chosen < 0) { timeouts++; continue; }
      const m = r.q.choices[r.chosen].mis || "calc";
      count[m] = (count[m] || 0) + 1;
    }
    const keys = Object.keys(count).sort((a, b) => count[b] - count[a] || (a === "calc") - (b === "calc"));
    return { top: keys[0] || null, count, timeouts };
  }

  function finish() {
    state.phase = "result";
    sfx.fin();
    const total = state.score;
    const rank = RANKS.find((r) => total >= r.min);
    const best = loadBest();
    const isNew = best === null || total > best;
    if (isNew) saveBest(total);
    $("result-rank").textContent = rank.name;
    $("result-total").textContent = String(total);
    $("result-max").textContent = String(MAX_SCORE);
    $("result-correct").textContent = String(state.correct);
    $("result-best").innerHTML = isNew ? '<span class="badge-new">NEW RECORD</span> 自己ベスト更新！' : `自己ベスト ${best} 点`;
    $("result-comment").textContent = rank.comment;

    // 勘違いの診断
    const d = diagnose();
    const dg = $("diagnosis");
    if (d.top) {
      const m = MISTAKES[d.top];
      const others = Object.keys(d.count).filter((k) => k !== d.top).map((k) => `${MISTAKES[k].name}×${d.count[k]}`);
      dg.innerHTML = `<div class="dg-label">あなたのクセ</div><div class="dg-name">${m.name}<span class="dg-n mono">×${d.count[d.top]}</span></div><p class="dg-advice">${m.advice}</p>` +
        (others.length || d.timeouts ? `<div class="dg-others">${others.concat(d.timeouts ? [`時間切れ×${d.timeouts}`] : []).join("　")}</div>` : "");
    } else if (d.timeouts) {
      dg.innerHTML = `<div class="dg-label">あなたのクセ</div><div class="dg-name">考えすぎて時間切れ<span class="dg-n mono">×${d.timeouts}</span></div><p class="dg-advice">選んだ答えはぜんぶ正解。迷ったら「掛け算で重ねる」を信じて、早めに押そう。</p>`;
    } else {
      dg.innerHTML = `<div class="dg-label">あなたのクセ</div><div class="dg-name">勘違いなし！</div><p class="dg-advice">どの罠にも引っかからなかった。チラシの赤字に惑わされない目を持っている。</p>`;
    }

    // 間違えた問題
    const wrong = state.log.filter((r) => !r.correct);
    const list = $("result-list");
    list.innerHTML = "";
    $("result-list-head").classList.toggle("hidden", wrong.length === 0);
    for (const r of wrong) {
      const li = document.createElement("li");
      const no = state.log.indexOf(r) + 1;
      const yours = r.chosen < 0 ? "時間切れ" : r.q.choices[r.chosen].label;
      const mis = r.chosen >= 0 && r.q.choices[r.chosen].mis ? MISTAKES[r.q.choices[r.chosen].mis].name : "";
      li.innerHTML = `<div class="rl-head"><span class="rl-no mono">Q${no}</span><span class="rl-type">${r.q.typeName}</span>${mis ? `<span class="rl-mis">${mis}</span>` : ""}</div>
        <div class="rl-q">${r.q.text}</div>
        <div class="rl-a">あなた：<s>${yours}</s>　正解：<b>${r.q.choices.find((c) => c.correct).label}</b></div>
        <div class="rl-ex">${r.q.explain.join("<br>")}</div>`;
      list.appendChild(li);
    }

    const url = `${location.origin}${location.pathname}`;
    const habit = d.top ? `\nクセ: ${MISTAKES[d.top].name}` : "";
    const text = `ほんとに何割引？ 🏷️ ${total}/${MAX_SCORE}点 ${state.correct}/10問正解【${rank.name}】${habit}\n#Ludom`;
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
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (state.phase === "start" || state.phase === "result") {
      if (e.key === "Enter") { e.preventDefault(); startGame(); }
      return;
    }
    if (state.phase === "answer" && /^[1-4]$/.test(e.key)) { e.preventDefault(); answer(Number(e.key) - 1); return; }
    if (state.phase === "reveal" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onNext(); }
  });
  // iOS のダブルタップズーム対策
  document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });

  // ---------- 初期化 ----------
  function init() {
    const best = loadBest();
    if (best !== null) { $("start-best").classList.remove("hidden"); $("start-best-value").textContent = String(best); }
    $("btn-start").addEventListener("click", startGame);
    $("btn-retry").addEventListener("click", startGame);
    $("btn-next").addEventListener("click", onNext);
    showScreen("start");
  }
  init();
})();
