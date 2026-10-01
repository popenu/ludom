/* ===================================================
   いろまぜ - 色の計算
   絵の具の混ざり方を、波長ごとの反射率（380〜730nm、10nm刻み）と
   Kubelka-Munk 理論で計算する。RGB の平均と違い、青＋黄＝緑、
   赤＋青＝紫のように、実際の絵の具に近い結果になる。
=================================================== */
(function (root) {
  "use strict";

  // ---------- 波長と等色関数（CIE 1931 の多峰ガウス近似 / Wyman 2013） ----------
  const WL = [];
  for (let l = 380; l <= 730; l += 10) WL.push(l);
  const g = (l, m, a, b) => { const s = l < m ? a : b; return Math.exp(-0.5 * ((l - m) / s) ** 2); };
  const cieX = (l) => 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2);
  const cieY = (l) => 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
  const cieZ = (l) => 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);
  const XYZ2RGB = [[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]];

  // 波長ごとの「線形 RGB への寄与」。反射率 1.0 の白が無彩色になるよう正規化しておく
  const BAND = WL.map((l) => { const x = cieX(l), y = cieY(l), z = cieZ(l); return XYZ2RGB.map((r) => r[0] * x + r[1] * y + r[2] * z); });
  const WHITE = [0, 1, 2].map((i) => BAND.reduce((s, b) => s + b[i], 0));

  // ---------- 絵の具 ----------
  // f: 波長ごとの反射率、t: 着色力（混ぜたときの効きの強さ）
  const sig = (l, c, w) => 1 / (1 + Math.exp(-(l - c) / w));
  const PIGMENTS = {
    R: { name: "赤", t: 1.0, f: (l) => 0.04 + 0.82 * sig(l, 598, 12) + 0.25 * g(l, 410, 20, 25) },
    Y: { name: "黄", t: 3.0, f: (l) => 0.04 + 0.86 * sig(l, 505, 14) },
    B: { name: "青", t: 1.2, f: (l) => 0.04 + 0.58 * g(l, 455, 40, 38) + 0.15 * sig(l, 690, 15) },
    W: { name: "白", t: 5.0, f: () => 0.92 },
    K: { name: "黒", t: 0.6, f: () => 0.025 },
  };
  const KEYS = ["R", "Y", "B", "W", "K"];
  const ks = (r) => (1 - r) ** 2 / (2 * r);
  const KS = {};
  for (const k of KEYS) KS[k] = WL.map((l) => ks(PIGMENTS[k].f(l)));

  const toSrgb8 = (v) => {
    v = Math.min(1, Math.max(0, v));
    return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
  };

  // recipe: { R: 2, Y: 3, ... } → [r, g, b]（0〜255）
  function mix(recipe) {
    let tot = 0;
    for (const k of KEYS) tot += (recipe[k] || 0) * PIGMENTS[k].t;
    if (tot <= 0) return null;
    const lin = [0, 0, 0];
    for (let j = 0; j < WL.length; j++) {
      let a = 0;
      for (const k of KEYS) if (recipe[k]) a += recipe[k] * PIGMENTS[k].t * KS[k][j];
      a /= tot;
      const r = 1 + a - Math.sqrt(a * a + 2 * a);
      for (let i = 0; i < 3; i++) lin[i] += r * BAND[j][i];
    }
    return lin.map((v, i) => toSrgb8(v / WHITE[i]));
  }

  // ---------- 色差 ΔE2000 ----------
  function rgbToLab(rgb) {
    const lin = rgb.map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    const x = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047;
    const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    const z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  }

  function deltaE(rgb1, rgb2) {
    const [L1, a1, b1] = rgbToLab(rgb1), [L2, a2, b2] = rgbToLab(rgb2);
    const rad = Math.PI / 180;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
    const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G);
    const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
    const hp = (a, b) => { if (a === 0 && b === 0) return 0; const h = Math.atan2(b, a) / rad; return h < 0 ? h + 360 : h; };
    const hp1 = hp(ap1, b1), hp2 = hp(ap2, b2);
    const dL = L2 - L1, dC = Cp2 - Cp1;
    let dh = 0;
    if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
    const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh / 2) * rad);
    const Lm = (L1 + L2) / 2, Cpm = (Cp1 + Cp2) / 2;
    let hm = hp1 + hp2;
    if (Cp1 * Cp2 !== 0) { if (Math.abs(hp1 - hp2) > 180) hm += hm < 360 ? 360 : -360; hm /= 2; }
    const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
    const dTh = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
    const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
    const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
    const Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
    const Rt = -Math.sin(2 * dTh * rad) * Rc;
    return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
  }

  const toCss = (rgb) => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

  const api = { mix, deltaE, toCss, PIGMENTS, KEYS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IroColor = api;
})(this);
