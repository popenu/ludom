/* ===================================================
   テンきっぷ - ソルバー
   4つの数字と四則演算（＋括弧）で 10 を作る式を全探索する。
   ブラウザ（script.js）と Node（難易度分析）の両方から使うため、
   globalThis.TenSolver に公開する。
=================================================== */
(function () {
  "use strict";

  const TARGET = 10;
  const OP_LIST = ["+", "−", "×", "÷"];

  // ---------- 分数（有理数）演算 ----------
  // 中間結果を正確に扱うため、浮動小数ではなく分子/分母の整数ペアで持つ
  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }
  function frac(n, d) {
    if (d === undefined) d = 1;
    if (d === 0) return null;
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d) || 1;
    return { n: n / g, d: d / g };
  }
  const OPS = {
    "+": (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d),
    "−": (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d),
    "×": (a, b) => frac(a.n * b.n, a.d * b.d),
    "÷": (a, b) => (b.n === 0 ? null : frac(a.n * b.d, a.d * b.n)),
  };
  // 演算子の優先度（数字そのものは 3）
  const PREC = { "+": 1, "−": 1, "×": 2, "÷": 2 };

  function isInt(f) { return f.d === 1; }
  function fracToString(f) {
    if (f.d === 1) return String(f.n);
    return `${f.n}/${f.d}`;
  }
  function fracEquals(a, b) { return a.n === b.n && a.d === b.d; }

  // ---------- ノード（値 + 式文字列 + 優先度） ----------
  function leaf(n) {
    return { val: frac(n), expr: String(n), prec: 3, allInt: true };
  }
  // a op b を計算し、必要最小限の括弧で式を組み立てる
  function combine(a, op, b) {
    const val = OPS[op](a.val, b.val);
    if (!val) return null;
    const p = PREC[op];
    const left = a.prec < p ? `(${a.expr})` : a.expr;
    // 右側は同じ優先度でも − と ÷ の後ろなら括弧が要る（a−(b−c)、a÷(b×c)）
    const right = (b.prec < p || (b.prec === p && (op === "−" || op === "÷")))
      ? `(${b.expr})` : b.expr;
    return {
      val,
      expr: `${left}${op}${right}`,
      prec: p,
      allInt: a.allInt && b.allInt && isInt(val),
    };
  }

  // 重複を除いた順列（同じ数字が複数あるとき用）
  function permutations(arr) {
    const out = [];
    const seen = new Set();
    (function rec(cur, rest) {
      if (!rest.length) {
        const key = cur.join(",");
        if (!seen.has(key)) { seen.add(key); out.push(cur.slice()); }
        return;
      }
      for (let i = 0; i < rest.length; i++) {
        rec(cur.concat(rest[i]), rest.slice(0, i).concat(rest.slice(i + 1)));
      }
    })([], arr);
    return out;
  }

  // ---------- 全探索 ----------
  // 戻り値: { count, intCount, intOnly, best, solutions }
  //   count     … 10 になる式の数（文字列として異なるもの）
  //   intCount  … そのうち途中計算がすべて整数で済むものの数
  //   intOnly   … 整数だけで解ける問題かどうか
  //   best      … 見せる用の代表解（整数解 → 括弧が少ない → 短い、の順で選ぶ）
  function solve(digits) {
    const found = new Map(); // expr -> allInt
    const add = (r) => {
      if (r && r.val.d === 1 && r.val.n === TARGET && !found.has(r.expr)) {
        found.set(r.expr, r.allInt);
      }
    };
    for (const p of permutations(digits)) {
      const a = leaf(p[0]), b = leaf(p[1]), c = leaf(p[2]), d = leaf(p[3]);
      for (const o0 of OP_LIST) for (const o1 of OP_LIST) for (const o2 of OP_LIST) {
        // 5 通りの括弧の付け方
        let x, y;
        // ((a b) c) d
        x = combine(a, o0, b); if (x) { y = combine(x, o1, c); if (y) add(combine(y, o2, d)); }
        // (a (b c)) d
        x = combine(b, o1, c); if (x) { y = combine(a, o0, x); if (y) add(combine(y, o2, d)); }
        // (a b) (c d)
        x = combine(a, o0, b); y = combine(c, o2, d); if (x && y) add(combine(x, o1, y));
        // a ((b c) d)
        x = combine(b, o1, c); if (x) { y = combine(x, o2, d); if (y) add(combine(a, o0, y)); }
        // a (b (c d))
        x = combine(c, o2, d); if (x) { y = combine(b, o1, x); if (y) add(combine(a, o0, y)); }
      }
    }
    const solutions = [...found.entries()].map(([expr, allInt]) => ({ expr, allInt }));
    solutions.sort((s, t) => {
      if (s.allInt !== t.allInt) return s.allInt ? -1 : 1;
      const ps = (s.expr.match(/\(/g) || []).length;
      const pt = (t.expr.match(/\(/g) || []).length;
      if (ps !== pt) return ps - pt;
      if (s.expr.length !== t.expr.length) return s.expr.length - t.expr.length;
      return s.expr < t.expr ? -1 : 1;
    });
    const intCount = solutions.filter((s) => s.allInt).length;
    return {
      count: solutions.length,
      intCount,
      intOnly: intCount > 0,
      best: solutions.length ? solutions[0].expr : null,
      solutions,
    };
  }

  globalThis.TenSolver = {
    TARGET, OP_LIST, PREC,
    frac, fracToString, fracEquals, isInt,
    leaf, combine, solve,
  };
})();
