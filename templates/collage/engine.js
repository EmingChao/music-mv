// ═══════════════════════════════════════════════════════════════════════════
//  engine.js —— 纸艺拼贴（torn-paper collage）画风引擎
//  工艺封死在这里：每一样东西都是一张独立纸片
//   撕边轮廓 → 暖白纸边(#FFF9EE, 露出 6–10px) → 右下投影(x+8,y+10) → 纸纹
//  定格：UPS=12，每 1/12 秒每张纸片整体挪一次（不是每帧乱抖，那是电子感）
// ═══════════════════════════════════════════════════════════════════════════
(function () {
'use strict';

const UPS = 12;                      // 定格更新率：一秒 12 次
const D2R = Math.PI / 180;
const FONT = '"Hannotate SC","HanziPen SC","Kaiti SC","STKaiti","PingFang SC",sans-serif';
const INK = '#2B2A26', WHITE = '#FFF9EE';
const TAU = Math.PI * 2;
let STEP = 0;                        // 当前定格序号（由 bg/char 按 t 设）
let Z = { W: 1920, H: 1080, CFG: null, API: null };

// ── 种子随机：同一个名字永远拿到同一串数 ──────────────────────────────────
function hstr(s) { s = String(s); let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function lat(seed, i) { let h = (seed ^ Math.imul(i | 0, 0x27d4eb2d)) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296 * 2 - 1; }
function R(key) { const s = hstr(key); let a = s >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function n1(seed, x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lat(seed, i) * (1 - u) + lat(seed, i + 1) * u; }
function fbm(seed, x) { return 0.6 * n1(seed, x) + 0.28 * n1(seed + 101, x * 2.13) + 0.12 * n1(seed + 211, x * 4.37); }
function noise(key, i) { const s = hstr(key); let h = (s + Math.imul(i | 0, 0x9e3779b1)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x21f0aaad); h = Math.imul(h ^ (h >>> 15), 0x735a2d97); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; }
function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function hex2(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function rgba(h, a) { const c = hex2(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function shade(h, f) { return '#' + hex2(h).map(function (v) { return Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)))); }).map(function (v) { return v.toString(16).padStart(2, '0'); }).join(''); }
function clamp(x, a, b) { return Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 1 : b, x)); }

// ── 形状（都是 12–24 个顶点的多边形，绝不出现完美直线/圆）────────────────
function rectP(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
function ellP(cx, cy, rx, ry, step, a0, a1) {
  step = step || 24; a0 = a0 === undefined ? 0 : a0; a1 = a1 === undefined ? TAU : a1;
  const per = Math.PI * (rx + ry) * Math.abs(a1 - a0) / TAU, N = Math.max(12, Math.round(per / step)), out = [];
  for (let i = 0; i < N; i++) { const a = a0 + (a1 - a0) * i / N; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return out;
}
function starP(cx, cy, ro, ri, n, rot) { const out = []; for (let i = 0; i < n * 2; i++) { const a = (rot || 0) + i * Math.PI / n, rr = i % 2 ? ri : ro; out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return out; }
function stripP(line, widths) {         // 一条折线 → 有宽度的纸条
  const Lf = [], Rt = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = widths[i] / 2;
    Lf.push([line[i][0] - dy * w, line[i][1] + dx * w]); Rt.push([line[i][0] + dy * w, line[i][1] - dx * w]);
  }
  return Lf.concat(Rt.reverse());
}
function crescentP(r1, cx2, cy2, r2) {  // 弯月：两段圆弧拼的多边形
  const d = Math.hypot(cx2, cy2), a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const beta = Math.atan2(cy2, cx2), al1 = Math.atan2(h, a), ps = Math.atan2(h, a - d), out = [];
  for (let i = 0; i <= 16; i++) { const t = beta + al1 + (TAU - 2 * al1) * i / 16; out.push([Math.cos(t) * r1, Math.sin(t) * r1]); }
  for (let i = 1; i < 12; i++) { const t = beta + TAU - ps - (TAU - 2 * ps) * i / 12; out.push([cx2 + Math.cos(t) * r2, cy2 + Math.sin(t) * r2]); }
  return out;
}
function polyArea(P) { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function tracePath(g, P) { g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); g.closePath(); }
// 沿周长均匀取 12–24 个顶点，每个顶点沿法向抖 ±6px（手撕的大起伏）
function resample(pts, key, amp) {
  const m = pts.length, cum = [0];
  for (let i = 0; i < m; i++) { const p = pts[i], q = pts[(i + 1) % m]; cum.push(cum[i] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
  const per = cum[m] || 1, out = [], sg = polyArea(pts) >= 0 ? 1 : -1;
  const n = per > 1100 ? 24 : per > 700 ? 20 : per > 380 ? 16 : per > 180 ? 13 : 12;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / n) * per;
    while (j < m - 1 && cum[j + 1] < s) j++;
    const p = pts[j], q = pts[(j + 1) % m], L = (cum[j + 1] - cum[j]) || 1, t = (s - cum[j]) / L;
    const ux = (q[0] - p[0]) / L, uy = (q[1] - p[1]) / L, sg1 = sg;
    const off = (amp === undefined ? 6 : amp) * fbm(hstr(key + i), s / 40) * 1.35;
    out.push([p[0] + (q[0] - p[0]) * t + sg1 * uy * off, p[1] + (q[1] - p[1]) * t - sg1 * ux * off]);
  }
  return out;
}
// 撕边：在顶点之间每 ~9px 插一点，用 fbm 推出毛边（±2.5px 细齿）
function tornPts(pts, key, amp) {
  const n = pts.length, out = [], s1 = hstr(key + ':t1'), s2 = hstr(key + ':t2'), r = R(key + ':tr');
  const sg = polyArea(pts) >= 0 ? 1 : -1;
  let arc = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1e-6;
    const ux = dx / L, uy = dy / L, nx = sg * uy, ny = -sg * ux;
    const N = Math.max(1, Math.round(L / 9));
    for (let k = 0; k < N; k++) {
      const s = k / N, a = arc + s * L;
      const off = (amp === undefined ? 2.4 : amp) * (fbm(s1, a / 30) + 0.45 * fbm(s2, a / 6.5)) + 0.55 * (r() - 0.5);
      out.push([p[0] + ux * s * L + nx * off, p[1] + uy * s * L + ny * off, nx, ny, a]);
    }
    arc += L;
  }
  return out;
}
function normalsOf(P, sg) {             // 每个顶点的外法向 + 斜接系数
  const n = P.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    let ax = b[0] - a[0], ay = b[1] - a[1]; const la = Math.hypot(ax, ay) || 1; ax /= la; ay /= la;
    let bx = c[0] - b[0], by = c[1] - b[1]; const lb = Math.hypot(bx, by) || 1; bx /= lb; by /= lb;
    let nx = sg * (ay + by), ny = -(ax + bx) * sg;
    const ln = Math.hypot(nx, ny) || 1; nx /= ln; ny /= ln;
    out[i] = [nx, ny, Math.min(2.0, 1 / Math.max(0.5, nx * (sg * ay) + ny * (-sg * ax)))];
  }
  return out;
}

// ── 纸种：setup() 里每种预生成一张 256×256 平铺纹理（不每帧现算）──────────
const PAPER = {
  card:    { mot: 0.17, fib: 0.9, spk: 0.5, grain: 0.20 },
  kraft:   { mot: 0.28, fib: 2.6, spk: 1.4, grain: 0.26, fleck: '#6B4526' },
  news:    { mot: 0.13, fib: 0.7, spk: 0.4, grain: 0.16, print: 1 },
  dots:    { mot: 0.10, fib: 0.5, spk: 0.3, grain: 0.14, dot: '#F6ECD2' },
  stripes: { mot: 0.12, fib: 0.5, spk: 0.3, grain: 0.14, stripe: '#D9A882' },
  tissue:  { mot: 0.22, fib: 0.7, spk: 0.3, grain: 0.12, crease: 1 },
  tape:    { mot: 0.15, fib: 0.4, spk: 0.3, grain: 0.12, crepe: 1 }
};
const TILE = {};
function buildTile(kind) {
  const sp = PAPER[kind] || PAPER.card, N = 256;
  const r = R('tile:' + kind);
  const tex = mk(N, N), g = tex.getContext('2d');
  g.fillStyle = WHITE; g.fillRect(0, 0, N, N);              // 白底，用 multiply 给任何颜色上纸纹
  // 斑驳：低分辨率噪声放大 + 模糊（只压暗）
  const cell = 30, sw = Math.ceil(N / cell) + 3;
  const s = mk(sw, sw), sg = s.getContext('2d'), id = sg.createImageData(sw, sw), d = id.data;
  for (let i = 0; i < sw * sw; i++) { const v = r(); d[i * 4] = 78; d[i * 4 + 1] = 70; d[i * 4 + 2] = 60; d[i * 4 + 3] = Math.pow(v, 1.5) * sp.mot * 255; }
  sg.putImageData(id, 0, 0);
  g.save(); g.filter = 'blur(' + (cell * 0.5).toFixed(0) + 'px)'; g.drawImage(s, -cell, -cell, sw * cell, sw * cell); g.restore();
  g.save(); g.filter = 'blur(2px)'; g.globalAlpha = 0.5; g.drawImage(s, -cell * 0.4, -cell * 0.4, sw * cell * 0.7, sw * cell * 0.7); g.restore();
  // 纤维
  g.lineCap = 'round';
  for (let i = 0; i < 90 * sp.fib; i++) {
    const x = r() * N, y = r() * N, L = 3 + r() * 13, an = r() * TAU, b = (r() - 0.5) * L * 0.6;
    g.strokeStyle = 'rgba(96,84,68,' + (0.05 + r() * 0.09).toFixed(3) + ')'; g.lineWidth = 0.4 + r() * 0.7;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(an) * L * 0.5 - Math.sin(an) * b, y + Math.sin(an) * L * 0.5 + Math.cos(an) * b, x + Math.cos(an) * L, y + Math.sin(an) * L); g.stroke();
  }
  // 杂点/碎屑
  for (let i = 0; i < 70 * sp.spk; i++) {
    const rr = 0.4 + r() * r() * 1.6;
    g.fillStyle = sp.fleck ? rgba(sp.fleck, 0.3 + r() * 0.4) : 'rgba(84,72,58,' + (0.12 + r() * 0.22).toFixed(3) + ')';
    g.beginPath(); g.ellipse(r() * N, r() * N, rr, rr * (0.5 + r() * 0.5), r() * 3, 0, TAU); g.fill();
  }
  if (kind === 'news') {                 // 旧报纸：一栏栏灰字
    let cx0 = 4;
    while (cx0 < N) {
      const colW = 54 + r() * 20; let y = 4 + r() * 10;
      while (y < N) {
        if (r() < 0.13) { g.fillStyle = 'rgba(46,44,42,0.62)'; let x = cx0; const end = cx0 + colW * (0.5 + r() * 0.5); while (x < end - 5) { const wl = 5 + r() * 14; g.fillRect(x, y, Math.min(wl, end - x), 4.4); x += wl + 3; } y += 13; }
        else { g.fillStyle = 'rgba(58,56,54,' + (0.3 + r() * 0.18).toFixed(2) + ')'; let x = cx0; const end = cx0 + colW * (r() < 0.15 ? 0.35 + r() * 0.5 : 1); while (x < end - 3) { const wl = 3 + r() * 13; g.fillRect(x, y, Math.min(wl, end - x), 1.9); x += wl + 2 + r() * 2; } y += 6.5; }
      }
      cx0 += colW + 7;
    }
  }
  if (kind === 'dots') {                 // 印刷圆点（略微套不准）
    for (let row = 0, y = 3; y < N + 14; y += 14, row++) for (let x = (row % 2) * 7 - 4; x < N + 14; x += 14) { g.fillStyle = rgba(sp.dot, 0.5 + r() * 0.2); g.beginPath(); g.arc(x + (r() - 0.5) * 0.7, y + (r() - 0.5) * 0.7, 3.4 + (r() - 0.5) * 0.5, 0, TAU); g.fill(); }
  }
  if (kind === 'stripes') {              // 竖条纹花纸
    for (let x = 0; x < N; x += 26) { g.fillStyle = rgba(sp.stripe, 0.5); g.fillRect(x, 0, 7, N); g.fillStyle = rgba(sp.stripe, 0.3); g.fillRect(x + 12, 0, 2, N); }
  }
  if (kind === 'tissue') {               // 薄棉纸：皱痕
    for (let i = 0; i < 60; i++) { g.strokeStyle = r() < 0.5 ? 'rgba(255,250,232,0.5)' : 'rgba(150,130,96,0.22)'; g.lineWidth = 0.5 + r() * 2.2; let x = r() * N, y = r() * N, an = r() * Math.PI; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { an += (r() - 0.5) * 0.9; x += Math.cos(an) * (8 + r() * 26); y += Math.sin(an) * (8 + r() * 26); g.lineTo(x, y); } g.stroke(); }
  }
  if (kind === 'crepe') {                // 纸胶带：细皱纹
    for (let i = 0; i < 160; i++) { g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.4)' : 'rgba(146,116,68,0.18)'; g.lineWidth = 0.5 + r(); const x = r() * N, y = r() * N, L = 3 + r() * 12, an = 1.1 + r() * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * L, y + Math.sin(an) * L); g.stroke(); }
  }
  // 细颗粒：逐像素（每种纸只做一次）
  {
    const id2 = g.getImageData(0, 0, N, N), d2 = id2.data;
    for (let i = 0; i < d2.length; i += 4) { const v = (r() - 0.5) * sp.grain * 120; d2[i] += v; d2[i + 1] += v; d2[i + 2] += v * 0.9; }
    g.putImageData(id2, 0, 0);
  }
  return tex;
}

// ── 一张纸片 = 一张缓存画布（撕边 + 白边 + 投影 + 纸纹）──────────────────
const CACHE = new Map();
function autoKey(s) {
  let k = (s.paper || 'card') + '|' + (s.color || '') + '|' + (s.alpha === undefined ? '' : s.alpha) + '|';
  if (s.pts) { for (let i = 0; i < s.pts.length; i++) k += (s.pts[i][0] | 0) + ',' + (s.pts[i][1] | 0) + ';'; }
  else k += 'r' + (s.x | 0) + ',' + (s.y | 0) + ',' + (s.w | 0) + ',' + (s.h | 0);
  return k + '|' + (s.margin || '') + '|' + (s.core || '') + '|' + (s.amp || '');
}
function fillPaper(g, path, spec, key) {   // 颜色 + 纸纹（multiply）+ 印刷纹（over）
  const kind = spec.paper || 'card', t = TILE[kind] || TILE.card;
  g.save(); tracePath(g, path);
  g.fillStyle = spec.color || WHITE; g.fill();
  const ox = -Math.floor(noise(key + ':o1', 11) * 256), oy = -Math.floor(noise(key + ':o2', 12) * 256);
  if (t) {
    g.save(); g.clip(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.92;
    g.translate(ox, oy); g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(-3000, -3000, 7000, 7000); g.restore();
  }
  g.restore();
}
function makePiece(spec) {
  const key = spec.key || autoKey(spec);
  let hit = CACHE.get(key); if (hit) return hit;
  const pts0 = spec.pts || rectP(spec.x, spec.y, spec.w, spec.h);
  const sg = polyArea(pts0) >= 0 ? 1 : -1;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < pts0.length; i++) { const p = pts0[i]; if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const size = Math.max(x1 - x0, y1 - y0), sm = Math.min(x1 - x0, y1 - y0);
  const margin = spec.margin === undefined ? clamp(sm * 0.05, 1.3, 5.5) : spec.margin;
  const core = spec.core === undefined ? clamp(sm * 0.028, 0.8, 3.4) : spec.core;
  const r = R(key + ':pc');
  const A = tornPts(resample(pts0, key, spec.amp === undefined ? 6 : spec.amp), key, spec.jag);
  const N = normalsOf(A, sg);
  const B = A.map(function (p, i) { const dd = core * (0.55 + r() * 0.95); return [p[0] - N[i][0] * dd, p[1] - N[i][1] * dd]; });
  const M = margin > 0 ? A.map(function (p, i) { const dd = margin * (0.7 + r() * 0.7) * N[i][2]; return [p[0] + N[i][0] * dd, p[1] + N[i][1] * dd]; }) : null;
  // 画布范围（含白边 + 投影偏移 + 毛刺）
  const sh = spec.shadow || { x: 8, y: 10, a: 0.22, b: 1.2 };
  let bx0 = x0 - margin * 2 - 6, by0 = y0 - margin * 2 - 6, bx1 = x1 + margin * 2 + 6, by1 = y1 + margin * 2 + 6;
  if (sh.a > 0) { bx0 = Math.min(bx0, x0 - 6); by0 = Math.min(by0, y0 - 6); bx1 = Math.max(bx1, x1 + sh.x + (sh.b || 0) * 2 + 4); by1 = Math.max(by1, y1 + sh.y + (sh.b || 0) * 2 + 4); }
  const W = Math.ceil(bx1 - bx0), H = Math.ceil(by1 - by0);
  const T = mk(W, H), g = T.getContext('2d');
  g.translate(-bx0, -by0);
  // ① 暖白纸边：M（外扩 margin）与 A（撕出的纸芯）都填 #FFF9EE
  if (M) fillPaper(g, M, { paper: 'card', color: WHITE }, key + 'm');
  fillPaper(g, A, { paper: 'card', color: WHITE }, key + 'a');
  // ② 颜色层 B（这种纸的纸纹）
  fillPaper(g, B, spec, key + 'b');
  // ③ 纸厚：右下一道暗线、左上一道亮线（裁在 B 里）
  g.save(); tracePath(g, B); g.clip(); g.lineJoin = 'round';
  g.save(); g.translate(1.1, 1.5); tracePath(g, B); g.lineWidth = 2.6; g.strokeStyle = 'rgba(44,30,18,0.20)'; g.stroke(); g.restore();
  g.save(); g.translate(-1.0, -1.2); tracePath(g, B); g.lineWidth = 2.0; g.strokeStyle = 'rgba(255,252,240,0.26)'; g.stroke(); g.restore();
  g.restore();
  // ④ 撕口上的纤维毛刺（往外支棱出来的暖白小线）
  g.lineCap = 'round';
  for (let i = 0; i < A.length; i++) {
    const p = A[i]; if (r() > 0.34) continue;
    const L = 1.5 + r() * 4.5, an = Math.atan2(p[3], p[2]) + (r() - 0.5) * 1.5;
    g.strokeStyle = 'rgba(255,250,238,' + (0.5 + r() * 0.4).toFixed(2) + ')'; g.lineWidth = 0.5 + r() * 0.5;
    g.beginPath(); g.moveTo(p[0] + p[2] * 0.4, p[1] + p[3] * 0.4); g.lineTo(p[0] + Math.cos(an) * L, p[1] + Math.sin(an) * L); g.stroke();
  }
  // ⑤ 投影烘进缓存（灯在左上，影子往右下）
  const F = mk(W, H), fg = F.getContext('2d');
  if (sh.a > 0) { fg.save(); fg.shadowColor = 'rgba(60,45,30,' + sh.a + ')'; fg.shadowBlur = sh.b || 0; fg.shadowOffsetX = sh.x; fg.shadowOffsetY = sh.y; fg.drawImage(T, 0, 0); fg.restore(); }
  fg.drawImage(T, 0, 0);
  const out = { cv: F, cx: (bx0 + bx1) / 2, cy: (by0 + by1) / 2, w: W, h: H, size: size, key: key };
  CACHE.set(key, out);
  return out;
}
// 定格抖动：每 1/12 秒换一次（种子随定格序号变），位移 2–4px、旋转 ±0.4°
function drawPiece(g, spec) {
  const p = makePiece(spec);
  let jx = 0, jy = 0, jr = 0;
  const amp = spec.jit === undefined ? 2.6 : spec.jit;
  if (amp > 0) {
    const kk = p.key + '#' + STEP;
    jx = (noise(kk, 1) - 0.5) * 2 * amp;
    jy = (noise(kk, 2) - 0.5) * 2 * amp;
    jr = (noise(kk, 3) - 0.5) * 2 * 0.4 * D2R;
  }
  const rot = (spec.rot || 0) + jr + (spec.tilt || 0);
  // px/py：直接给"纸片包围盒中心"的绝对位置（雪、光晕、星星用）；否则用 pts 自带的坐标
  const tx = spec.px === undefined ? p.cx + (spec.ox || 0) : spec.px;
  const ty = spec.py === undefined ? p.cy + (spec.oy || 0) : spec.py;
  g.save();
  g.translate(tx + jx, ty + jy);
  if (rot) g.rotate(rot);
  if (spec.scale && spec.scale !== 1) g.scale(spec.scale, spec.scale);
  if (spec.flip) g.scale(-1, 1);
  const a = spec.alpha === undefined ? 1 : spec.alpha; if (a !== 1) g.globalAlpha = a;
  g.drawImage(p.cv, -p.w / 2, -p.h / 2);
  g.restore();
}

// ═══════════════════════════ 对外画法（ENGINE-API 第 2 节）═══════════════════
const palette = {
  night: '#233868', night2: '#2E4A7C', night3: '#1B2C55', dusk: '#3A5487',
  moon: '#F3E7C6', snow: '#F4F0E7', snowB: '#CBD8EA', white: WHITE, ink: INK,
  kraft: '#B5875A', kraftD: '#8A6340', news: '#E5DFCF', brick: '#9C4537',
  slate: '#4C6087', pine: '#2E5A4F', cream: '#F3E8CB', tape: '#E7D8AE',
  warm: '#FFD46A', lamp: '#F4C452', glass: '#8B9AB4', strip: '#FBF3E2',
  crab: '#E3603A', crabD: '#C14A2D', belly: '#F8DBB5', spot: '#F39060'
};

function piece(g, spec) { drawPiece(g, spec); }

// ── 小东西：都按 100 单位高设计，再乘 size/100 ────────────────────────────
function sprite(g, spec) {
  const kind = spec.kind || 'house';
  const sz = spec.size || (Z.API ? Z.API.MH : 240);
  const u = sz / 100, x = spec.x || 0, y = spec.y || 0;
  const uid = (spec.seed || 'd') + ':' + Math.round(sz);
  const C = spec.color || palette.kraft, C2 = spec.color2 || palette.brick;
  const A = function (name, pts, o) {
    const s = { key: 'sp:' + kind + ':' + uid + ':' + name, pts: pts.map(function (p) { return [x + p[0] * u, y + p[1] * u]; }) };
    for (const k in o) s[k] = o[k];
    drawPiece(g, s);
  };
  if (kind === 'house') {
    const wl = spec.wide || 1;
    const bx = function (p) { return [p[0] * wl, p[1]]; };
    if (spec.chimney !== false) A('chim', [[22, -68], [34, -68], [34, -96], [22, -96]].map(bx), { color: C2, paper: 'news', margin: 2 });
    A('wall', [[-44, 2], [-44, -62], [44, -62], [44, 2]].map(bx), { color: C, paper: spec.paper || 'kraft' });
    A('roof', [[-52, -58], [0, -98], [52, -58]].map(bx), { color: C2, paper: 'card' });
    A('rsnow', [[-48, -56], [0, -94], [48, -56], [39, -53], [0, -79], [-39, -53]].map(bx), { color: WHITE, paper: 'card', amp: 2.4, core: 1.6, margin: 1.8 });
    A('win1', [[-28, -50], [-8, -50], [-8, -32], [-28, -32]], { color: spec.win || palette.lamp, paper: 'card', margin: 1.6, core: 1.2, amp: 1.4 });
    A('win2', [[8, -50], [28, -50], [28, -32], [8, -32]], { color: spec.win || palette.lamp, paper: 'card', margin: 1.6, core: 1.2, amp: 1.4 });
    A('mu1', [[-19, -49], [-17, -49], [-17, -33], [-19, -33]], { color: palette.night3, paper: 'card', margin: 0.8, core: 0.6, amp: 0.6 });
    A('mu2', [[-28, -42], [-8, -42], [-8, -40], [-28, -40]], { color: palette.night3, paper: 'card', margin: 0.8, core: 0.6, amp: 0.6 });
    A('door', [[-10, 2], [-10, -20], [-4, -28], [4, -28], [10, -20], [10, 2]], { color: palette.slate, paper: 'card', margin: 2 });
  } else if (kind === 'tree') {
    A('trunk', [[-5, 2], [5, 2], [4, -24], [-4, -24]], { color: palette.kraftD, paper: 'kraft', margin: 2 });
    A('t1', [[-32, -20], [0, -54], [32, -20]], { color: spec.color || palette.pine, paper: 'card' });
    A('t2', [[-26, -42], [0, -76], [26, -42]], { color: spec.color || palette.pine, paper: 'card' });
    A('t3', [[-19, -62], [0, -92], [19, -62]], { color: spec.color || palette.pine, paper: 'card' });
    if (spec.snow !== false) {
      A('s1', [[-26, -22], [0, -50], [26, -22], [18, -19], [0, -34], [-18, -19]], { color: WHITE, paper: 'card', amp: 1.8, core: 1.2, margin: 1.4 });
      A('s2', [[-20, -44], [0, -72], [20, -44], [13, -41], [0, -55], [-13, -41]], { color: WHITE, paper: 'card', amp: 1.6, core: 1.1, margin: 1.2 });
    }
  } else if (kind === 'lamp') {
    const lit = spec.lit;
    A('base', [[-12, 2], [12, 2], [7, -14], [-7, -14]], { color: palette.night3, paper: 'card', margin: 2.4 });
    A('pole', [[-3.2, -10], [3.2, -10], [2.6, -76], [-2.6, -76]], { color: palette.night3, paper: 'card', margin: 1.8 });
    A('collar', [[-6, -74], [6, -74], [6, -81], [-6, -81]], { color: palette.night3, paper: 'card', margin: 2 });
    A('frame', [[-16, -82], [16, -82], [13, -105], [-13, -105]], { color: palette.night3, paper: 'card', margin: 2.2 });
    A('glass', [[-12.5, -85], [12.5, -85], [10, -102], [-10, -102]], { color: lit ? palette.warm : palette.glass, paper: 'card', margin: 1.1, core: 0.9, alpha: lit ? 1 : 0.9 });
    A('mu1', [[-1.4, -86], [1.4, -86], [1.2, -101], [-1.2, -101]], { color: palette.night3, paper: 'card', margin: 0.7, core: 0.5, amp: 0.5 });
    A('mu2', [[-11, -93], [11, -93], [11, -90.6], [-11, -90.6]], { color: palette.night3, paper: 'card', margin: 0.7, core: 0.5, amp: 0.5 });
    A('cap', [[-19, -104], [19, -104], [13, -111], [0, -118], [-13, -111]], { color: palette.night3, paper: 'card', margin: 2.4 });
    A('capS', [[-13.5, -110], [0, -117], [13.5, -110], [9, -107.5], [0, -112], [-9, -107.5]], { color: WHITE, paper: 'card', amp: 1.4, core: 1, margin: 1.2 });
    A('fin', [[-2.2, -119], [2.2, -119], [1.6, -123], [-1.6, -123]], { color: '#C7A04A', paper: 'card', margin: 0.8, core: 0.6 });
  } else if (kind === 'moon') {
    const s = sz / 100;
    drawPiece(g, { key: 'sp:moon:' + Math.round(sz), pts: crescentP(46 * s, 19 * s, -10 * s, 41 * s).map(function (p) { return [x + p[0], y + p[1]]; }), color: spec.color || palette.moon, paper: 'news', margin: 3, core: 2, amp: 3.2, jit: 1.4, shadow: { x: 8, y: 10, a: 0.22, b: 1.6 } });
  } else if (kind === 'star') {
    const s = sz / 100;
    drawPiece(g, { key: 'sp:star:' + Math.round(sz), pts: starP(0, 0, 44 * s, 19 * s, 5, -Math.PI / 2).map(function (p) { return [x + p[0], y + p[1]]; }), color: spec.color || palette.cream, paper: 'card', margin: 2.4, core: 1.6, amp: 2, jit: 1.6 });
  } else if (kind === 'fence') {
    A('rail1', [[-56, -28], [56, -26], [56, -19], [-56, -21]], { color: palette.kraftD, paper: 'kraft', margin: 2, amp: 3 });
    A('rail2', [[-56, -9], [56, -11], [56, -4], [-56, -2]], { color: palette.kraftD, paper: 'kraft', margin: 2, amp: 3 });
    for (let i = 0; i < 5; i++) {
      const px = -44 + i * 22;
      A('post' + i, [[px - 3.4, 2], [px + 3.4, 2], [px + 3, -40], [px - 3, -40]], { color: palette.kraft, paper: 'kraft', margin: 1.7 });
      A('cap' + i, [[px - 4, -39], [px + 4, -39], [px + 2, -44], [px - 2, -44]], { color: WHITE, paper: 'card', amp: 1.2, core: 0.8, margin: 1.1, shadow: { x: 1.2, y: 1.6, a: 0.18, b: 0.8 } });
    }
    A('snowR', [[-54, -27], [-20, -22], [18, -25], [54, -20], [54, -27], [18, -32], [-20, -29], [-54, -34]], { color: WHITE, paper: 'card', amp: 2, core: 1.2, margin: 1.5 });
  } else if (kind === 'cloud') {
    const s = sz / 100;
    A('c1', ellP(-30 * s, 0, 34 * s, 20 * s, 12), { color: spec.color || palette.cream, paper: 'tissue', alpha: 0.9, amp: 4 });
    A('c2', ellP(10 * s, -8 * s, 40 * s, 24 * s, 12), { color: spec.color || palette.cream, paper: 'tissue', alpha: 0.9, amp: 4 });
    A('c3', ellP(46 * s, 2, 26 * s, 17 * s, 12), { color: spec.color || palette.cream, paper: 'tissue', alpha: 0.9, amp: 4 });
  } else if (kind === 'sign') {
    A('post', [[-3, 2], [3, 2], [2.6, -44], [-2.6, -44]], { color: palette.kraftD, paper: 'kraft', margin: 2 });
    A('board', [[-28, -42], [28, -44], [28, -76], [-28, -74]], { color: spec.color || palette.cream, paper: 'card', margin: 2.6, rot: 0 });
    A('l1', [[-20, -56], [8, -56], [8, -53], [-20, -53]], { color: palette.ink, paper: 'card', margin: 0.6, core: 0.5, amp: 0.6 });
    A('l2', [[-20, -64], [18, -64], [18, -61], [-20, -61]], { color: palette.ink, paper: 'card', margin: 0.6, core: 0.5, amp: 0.6 });
  }
}

// ── 地面 / 地平线（撕纸，白边自然露出来）─────────────────────────────────
function ground(g, spec) {
  const W = Z.W, H = Z.H, y = spec.y === undefined ? H * 0.75 : spec.y;
  const kind = spec.kind || 'flat', c = spec.color || palette.snow;
  let top;
  if (kind === 'hill') top = [[-160, y + 34], [W * 0.16, y - 26], [W * 0.38, y + 10], [W * 0.60, y - 36], [W * 0.84, y + 6], [W + 160, y - 16]];
  else if (kind === 'grass') top = [[-160, y + 10], [W * 0.2, y - 12], [W * 0.34, y + 4], [W * 0.5, y - 10], [W * 0.72, y + 8], [W + 160, y - 6]];
  else if (kind === 'street') top = [[-160, y + 4], [W * 0.3, y - 6], [W * 0.62, y + 5], [W + 160, y - 3]];
  else top = [[-160, y + 6], [W * 0.22, y - 8], [W * 0.5, y + 7], [W * 0.78, y - 7], [W + 160, y + 5]];
  const pts = top.concat([[W + 200, H + 200], [-200, H + 200]]);
  drawPiece(g, { key: 'gnd:' + kind + ':' + Math.round(y) + ':' + c, pts: pts, color: c, paper: spec.paper || 'card', amp: 5, core: 2.6, margin: 2.2, jit: 0, shadow: { a: 0 } });
  if (spec.color2) {
    const pts2 = top.map(function (p) { return [p[0], p[1] - 12] }).concat([[W + 200, y + 30], [-200, y + 30]]);
    drawPiece(g, { key: 'gnd2:' + kind + ':' + Math.round(y) + ':' + spec.color2, pts: pts2, color: spec.color2, paper: 'card', amp: 3.4, core: 1.6, margin: 1.6, jit: 0, shadow: { a: 0 } });
  }
}

// ── 天空：整张卡纸（右边再接一张，接缝是撕的）────────────────────────────
function sky(g, spec) {
  const W = Z.W, H = Z.H, cs = spec.colors || ['#22386A', '#2C4779'];
  // 整幅只用一张纸：撕边只出现在纸的外轮廓，画面内部不留任何直线接缝
  drawPiece(g, { key: 'sky0:' + cs[0], pts: rectP(-40, -40, W + 80, H + 80), color: cs[0], paper: 'kraft', amp: 6, core: 2, margin: 2, jit: 0, shadow: { a: 0 } });
  // 夜色深浅用几团"纸砂云"叠出来（很淡、边缘是撕的），不是第二张天
  const r = R('skytone' + W + H);
  for (let i = 0; i < 3; i++) {
    const bx = W * (0.12 + r() * 0.76), by = H * (-0.05 + r() * 0.42);
    drawPiece(g, { key: 'skytone' + i, pts: ellP(bx, by, W * (0.24 + r() * 0.16), H * (0.14 + r() * 0.12), 18), color: cs[1] || cs[0], paper: 'tissue', alpha: 0.13, amp: 14, core: 0, margin: 0, jit: 1.4, shadow: { a: 0 } });
  }
}

// ── 一直在动的东西（雪 = 白纸屑小方块，各自固定旋转角 + 下落速度）──────────
function fx(g, spec, t) {
  const kind = spec.kind || 'snow', W = Z.W, H = Z.H, n = spec.n || 40;
  const top = spec.top === undefined ? -80 : spec.top, span = (spec.bot === undefined ? H + 80 : spec.bot) - top;
  t = t || 0;
  if (kind === 'snow' || kind === 'petal' || kind === 'dust' || kind === 'sparkle') {
    for (let i = 0; i < n; i++) {
      const r = R((spec.seed || 'fx' + kind) + ':' + i);
      const x0 = r() * (W + 260) - 130, y0 = r() * span;
      const v = 22 + r() * 62, am = 8 + r() * 26, fr = 0.22 + r() * 0.55, ph = r() * TAU;
      const sz = (kind === 'snow' ? 8 + r() * 6 : 5 + r() * 7) * (spec.sz || 1);
      const rot = (r() - 0.5) * 1.4, k9 = i % 7;
      const y = top + ((y0 + v * t) % span);
      const x = x0 + am * Math.sin(t * fr * TAU + ph) - t * v * 0.10;
      const sq = r() < 0.55;
      drawPiece(g, {
        key: 'fx:' + kind + k9, jit: 0.7, rot: rot, px: x, py: y,
        pts: sq ? [[0, -sz / 2], [sz / 2, 0], [0, sz / 2], [-sz / 2, 0]] : ellP(0, 0, sz / 2, sz / 2 * 0.8, sz / 2.2),
        color: spec.color || WHITE, paper: 'card', margin: 1.1, core: 0.7, amp: 1.4,
        shadow: { x: 2.5, y: 3, a: 0.16, b: 0.8 }
      });
    }
  } else if (kind === 'rain') {
    for (let i = 0; i < n; i++) {
      const r = R('rain' + i), x0 = r() * (W + 200) - 100, y0 = r() * span, v = 380 + r() * 240;
      const y = top + ((y0 + v * t) % span), x = x0 - t * 60;
      drawPiece(g, { key: 'fx:rain' + (i % 5), jit: 0, px: x, py: y, pts: [[0, -14], [2.6, -14], [1.6, 14], [-1, 14]], color: '#DCE6F2', paper: 'tissue', alpha: 0.7, margin: 0.6, core: 0.4, amp: 0.8, shadow: { a: 0 } });
    }
  } else if (kind === 'light-ray') {
    const o = spec.px === undefined ? W / 2 : spec.px, oy = spec.py === undefined ? 0 : spec.py;
    const len = spec.len || H * 0.55, w0 = spec.w0 || 20, w1 = spec.w1 || 130;
    const n = spec.n || 3, sp = spec.spread === undefined ? 0.34 : spec.spread;
    for (let i = 0; i < n; i++) {
      const d = (n === 1 ? 0 : i - (n - 1) / 2) * sp * len;
      drawPiece(g, {
        key: 'fx:ray' + i + ':' + Math.round(len), jit: 3.0,
        pts: [[o - w0, oy], [o + w0, oy], [o + w1 + d, oy + len], [o - w1 + d, oy + len]],
        color: spec.color || palette.warm, paper: 'tissue', alpha: spec.alpha === undefined ? 0.09 : spec.alpha,
        margin: 0, core: 0, amp: 5.5, shadow: { a: 0 }
      });
    }
  } else if (kind === 'smoke') {
    for (let i = 0; i < (spec.n || 6); i++) {
      const r = R('smk' + i), ph = r() * TAU, sz = 50 + r() * 60;
      drawPiece(g, { key: 'fx:smoke' + i, jit: 2.6, px: (spec.px || W / 2) + Math.sin(t * 0.6 + ph) * 40, py: (spec.py || H * 0.5) - (t * 30 + i * 40) % 320, pts: ellP(0, 0, sz, sz * 0.8, 16), color: '#E7E2D6', paper: 'tissue', alpha: 0.24, margin: 0, core: 0, amp: 6, shadow: { a: 0 } });
    }
  }
}

// ── 光：不用 shadowBlur 大光晕，用 2–3 层低透明暖黄圆纸片叠出来 ───────────
function glow(g, spec) {
  // 暖光 = 一把"纸砂"：十来片小张薄棉纸随手贴在灯周围，互相重叠出渐弱的光雾。
  // 刻意不做同心圆（同心圆会变成靶心），每片位置/大小/撕边都由 key 决定，只建一次。
  const rr = spec.r || 120, c = spec.color || palette.warm, s = spec.strength === undefined ? 1 : spec.strength;
  const base = 'glow:' + Math.round(rr) + ':' + c;
  for (let i = 0; i < 11; i++) {
    const a = R(base + ':' + i);
    const th = a() * 6.2832, d = (0.06 + 0.66 * Math.sqrt(a())) * rr;
    const rx = rr * (0.26 + 0.30 * a()), ry = rx * (0.70 + 0.45 * a());
    drawPiece(g, {
      key: base + ':' + i, px: spec.x + Math.cos(th) * d, py: spec.y + Math.sin(th) * d * 0.92, jit: 3.0,
      pts: ellP(0, 0, rx, ry, 13 + Math.floor(a() * 9)),
      color: c, paper: 'tissue', alpha: (0.040 + 0.030 * a()) * s, margin: 0, core: 0, amp: 8, shadow: { a: 0 }
    });
  }
}

function char(g, o) {
  o = o || {};
  if (o.t !== undefined) STEP = Math.floor(o.t * UPS + 1e-6);
  if (window.CHARACTER && window.CHARACTER.draw) window.CHARACTER.draw(g, o);
}

// ── 字：写在纸上（整体 0.5° 倾斜 + 逐字微抖 + 极轻错版重影）───────────────
function text(g, str, spec) {
  spec = spec || {};
  const size = spec.size || 48;
  g.save();
  g.font = (spec.weight || 600) + ' ' + size + 'px ' + (spec.font || FONT);
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.translate(spec.x || 0, spec.y || 0);
  g.rotate(-0.5 * D2R + (spec.rot || 0));
  const chars = Array.from(String(str)), ws = chars.map(function (c) { return g.measureText(c).width; });
  let total = 0; for (let i = 0; i < ws.length; i++) total += ws[i] * (spec.track || 1);
  const align = spec.align || 'center';
  let x = align === 'center' ? -total / 2 : align === 'right' ? -total : 0;
  const r = R(spec.key || ('txt:' + str));
  for (let i = 0; i < chars.length; i++) {
    const cw = ws[i];
    g.save(); g.translate(x + cw / 2, (r() - 0.5) * size * 0.035); g.rotate((r() - 0.5) * 1.2 * D2R);
    if (spec.ghost !== 0) { g.globalAlpha = spec.ghostAlpha === undefined ? 0.13 : spec.ghostAlpha; g.fillStyle = spec.color || INK; g.fillText(chars[i], -cw / 2 + 1.6, -1.2); g.globalAlpha = 1; }
    g.fillStyle = spec.color || INK; g.fillText(chars[i], -cw / 2, 0);
    g.restore();
    x += cw * (spec.track || 1);
  }
  g.restore();
}

// ── 画框 / 纸条 / 对话框（拼贴：该直的地方可以是直的，胶带除外全撕边）────
function frame(g, spec) {
  const k = spec.kind || 'paper', x = spec.x || 0, y = spec.y || 0, w = spec.w || 200, h = spec.h || 120;
  drawPiece(g, { key: 'frm:' + k + ':' + Math.round(w) + 'x' + Math.round(h) + ':' + (spec.color || ''), pts: rectP(x, y, w, h), color: spec.color || palette.cream, paper: spec.paper || 'card', margin: 3, amp: 3.4, core: 2, rot: spec.rot, jit: spec.jit === undefined ? 2.4 : spec.jit });
  if (k === 'note') {
    for (let i = 0; i < 3; i++) drawPiece(g, { key: 'frmln' + Math.round(w) + i, pts: rectP(x + w * 0.1, y + h * (0.32 + i * 0.22), w * 0.8, 1.6), color: 'rgba(120,110,95,0.5)', paper: 'card', margin: 0, core: 0, amp: 0.6, shadow: { a: 0 } });
  }
  if (k === 'tape') {
    drawPiece(g, { key: 'frmtape' + Math.round(w), pts: rectP(x + w * 0.15, y - h * 0.16, w * 0.7, h * 0.3), color: palette.tape, paper: 'tape', alpha: 0.72, margin: 0, core: 0, amp: 1.6, rot: -0.12, shadow: { x: 2, y: 3, a: 0.14, b: 1 } });
  }
}

// ── 每镜背景：一整条雪夜街角的"底纸"，房子/路灯/雪/角色交给镜头 ──────────
function bg(g, shot, t, u, cam, CFG) {
  Z.W = CFG.W; Z.H = CFG.H; Z.CFG = CFG;
  STEP = Math.floor(t * UPS + 1e-6);
  const W = CFG.W, H = CFG.H, b = shot.bg || {};
  sky(g, { colors: b.sky || ['#22386A', '#2C4779'] });
  const r = R('bgstars' + W + H);
  for (let i = 0; i < 26; i++) {
    const x = 40 + r() * (W - 80), y = 24 + r() * (H * 0.44), s2 = 4 + r() * 7, isStar = r() < 0.42;
    if (Math.hypot(x - W * 0.85, y - H * 0.15) < H * 0.13) continue;
    drawPiece(g, {
      key: 'star' + i + ':' + Math.round(s2 * 2), px: x, py: y, jit: 1.2,
      pts: isStar ? starP(0, 0, s2 * 1.7, s2 * 0.72, 5, -Math.PI / 2) : ellP(0, 0, s2, s2, 4),
      color: i % 3 ? palette.cream : palette.white, paper: 'card',
      margin: isStar ? 1.5 : 0.7, core: 0.6, amp: 1.2, shadow: { x: 2, y: 2.6, a: 0.2, b: 0.7 }
    });
  }
  sprite(g, { kind: 'moon', x: W * 0.845, y: H * 0.155, size: H * 0.20, seed: 'moon' });
  ground(g, { y: H * 0.665, color: '#33507F', kind: 'hill', paper: 'card' });
  ground(g, { y: H * 0.702, color: '#C3D2E8', kind: 'flat', paper: 'card' });
  ground(g, { y: H * 0.748, color: '#E4DCC9', kind: 'flat', paper: 'card' });
  ground(g, { y: H * 0.800, color: '#F1EBDC', kind: 'flat', paper: 'card' });
}

// ── 歌词：底部贴一张撕边纸条（暖白纸 + 两侧胶带），字写在纸条上 ──────────
function lyric(g, line, CFG) {
  STEP = Math.floor(line.t * UPS + 1e-6);
  const W = Z.OW || CFG.W, H = Z.OH || CFG.H;
  const size = CFG.LYRIC.size || 64;
  g.save(); g.font = '600 ' + size + 'px ' + FONT; const tw = g.measureText(line.text).width; g.restore();
  const ph = size * 1.42, pw = Math.min(W * 0.88, tw + size * 2.4), cx = W / 2, cy = H * CFG.LYRIC.bottom;
  const pop = line.p < 0.10 ? 1 + 0.05 * (1 - line.p / 0.10) : 1;    // 贴上时轻微放大回弹
  drawPiece(g, { key: 'lyr:' + Math.round(pw) + 'x' + Math.round(ph), pts: rectP(cx - pw / 2, cy - ph / 2, pw, ph), color: palette.strip, paper: 'card', margin: 3, amp: 4.2, core: 2.4, jit: 2.6, scale: pop, shadow: { x: 8, y: 10, a: 0.22, b: 1.6 } });
  // 纸条上的横线（横格纸）
  g.save(); g.globalAlpha = 0.16; g.strokeStyle = '#9A8C74'; g.lineWidth = 1.4;   // 纸条上沿的折痕
  const yy = cy - ph * 0.38; g.beginPath(); g.moveTo(cx - pw / 2 + 8, yy); g.lineTo(cx + pw / 2 - 8, yy + 1.2); g.stroke();
  g.restore();
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    drawPiece(g, { key: 'lyrtp' + i, pts: rectP(cx + s * (pw / 2 - 16) - 46, cy - ph * 0.52, 92, 34), color: palette.tape, paper: 'tape', alpha: 0.76, margin: 0, core: 0, amp: 1.8, rot: s * 0.30, jit: 2.2, shadow: { x: 2, y: 3, a: 0.15, b: 1 } });
  }
  text(g, line.text, { x: cx, y: cy, size: size, color: CFG.LYRIC.color || INK, key: 'lyr', ghostAlpha: 0.14 });
}

// ── 整屏质感：极轻纸纹 + 四角暗角 + 极细颗粒（都不糊画面）───────────────
let VIG = null, GRAIN = null; const PAT = {};
function endFrame(g, t, CFG) {
  const W = Z.OW || CFG.W, H = Z.OH || CFG.H;
  STEP = Math.floor(t * UPS + 1e-6);
  if (!GRAIN) GRAIN = buildGrain();
  if (!PAT.card) {                                  // 整屏纸纹的 pattern / DOMMatrix 只建一次
    PAT.card = g.createPattern(TILE.card, 'repeat');
    try { PAT.card.setTransform(new DOMMatrix([2.4, 0, 0, 2.4, 0, 0])); } catch (e) { /* 老浏览器就 1:1 */ }
    PAT.grain = g.createPattern(GRAIN, 'repeat');
  }
  g.save();
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.10;
  g.fillStyle = PAT.card; g.fillRect(0, 0, W, H);
  g.restore();
  if (!VIG || VIG.w !== W || VIG.h !== H) {
    const c = mk(W, H), cg = c.getContext('2d');
    const gr = cg.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.30, W / 2, H * 0.5, Math.hypot(W, H) * 0.62);
    gr.addColorStop(0, 'rgb(255,255,255)'); gr.addColorStop(1, 'rgb(196,188,178)');
    cg.fillStyle = gr; cg.fillRect(0, 0, W, H); VIG = { c: c, w: W, h: H };
  }
  g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.10; g.drawImage(VIG.c, 0, 0, W, H); g.restore();
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.04; g.fillStyle = PAT.grain; g.fillRect(0, 0, W, H); g.restore();
}
function buildGrain() {
  // 颗粒：先做 64×64 的细噪点，再平滑放大 3 倍 —— 看着还是"极细颗粒"，
  // 但高频分量少很多，JPEG 帧编码快一倍（整片渲染时间大头就在编码上）
  const N = 64, c = mk(N, N), g = c.getContext('2d'), id = g.createImageData(N, N), d = id.data, r = R('grain');
  for (let i = 0; i < N * N; i++) { const v = 70 + r() * 175; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  g.putImageData(id, 0, 0);
  const S = 192, out = mk(S, S), og = out.getContext('2d');
  og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
  og.drawImage(c, 0, 0, S, S);
  return out;
}

// ── 角色设定图：三排（朝向 / 表情 / 动作），每格一张贴在纸上的纸片 ────────
function sheet(g, CFG, API) {
  Z.W = CFG.W; Z.H = CFG.H; Z.CFG = CFG; Z.API = API || Z.API; STEP = 0;
  const W = CFG.W, H = CFG.H, CH = window.CHARACTER;
  drawPiece(g, { key: 'sheet:bg', pts: rectP(-30, -30, W + 60, H + 60), color: '#E2D6BE', paper: 'kraft', amp: 7, core: 2, margin: 2, jit: 0, shadow: { a: 0 } });
  drawPiece(g, { key: 'sheet:bg2', pts: [[W * 0.5, -30], [W + 30, -30], [W + 30, H * 0.44], [W * 0.3, H * 0.36]], color: '#EADFC8', paper: 'card', amp: 9, core: 2, margin: 2, jit: 0, shadow: { a: 0 } });
  const cell = function (key, x, y, w, h) {
    drawPiece(g, { key: 'sheet:' + key, pts: rectP(x, y, w, h), color: '#FBF4E4', paper: 'card', margin: 2.6, amp: 2.6, core: 1.8, jit: 1.0, shadow: { x: 5, y: 6, a: 0.16, b: 1.2 } });
  };
  text(g, '角色设定图 · ' + (CH ? CH.name : ''), { x: W / 2, y: H * 0.072, size: Math.round(H * 0.046), color: INK, weight: 700, key: 'sheet-title' });
  if (CH) text(g, CH.desc || '', { x: W / 2, y: H * 0.118, size: Math.round(H * 0.021), color: '#6B5F4C', weight: 500, key: 'sheet-desc' });
  // 阿蟹的设计尺寸：宽 312、高 223（含眼柄）。格子里要留三块：上边距 / 角色 / 标签，
  // 角色只在"可用区"内反算 size 并竖直居中，标签永远画在格子下沿内侧 —— 两者都不许出格。
  const FAC = ['front', 'left', 'right', 'back'], FACN = { front: '正面', left: '朝左', right: '朝右', back: '背面' };
  const EXP_N = { neutral: '平静', happy: '高兴', sad: '难过', surprised: '惊讶', sleepy: '困了' };
  const ACT_N = { stand: '站着', walk: '走路', wave: '挥钳', 'look-up': '抬头', shiver: '发抖' };
  // 一列格子：画纸片 → 在可用区里居中画角色 → 标签写在格子下沿上方
  const row = function (tag, n, cw, ch, cy, wf, drawOne, nameOf) {
    const labH = Math.max(ch * 0.20, H * 0.034);
    for (let i = 0; i < n; i++) {
      const cx = W * 0.5 + (i - (n - 1) / 2) * cw, x0 = cx - cw * 0.42, ww = cw * 0.84;
      cell(tag + i, x0, cy, ww, ch);
      const top = cy + ch * 0.07, bot = cy + ch - labH - ch * 0.02;      // 可用区
      const sz = Math.min((bot - top) / 1.03, ww * wf / 1.47);           // 高 223 宽 312
      const fy = (top + bot) / 2 + sz * 0.5;                             // 让角色中心落在可用区中心
      if (CH) drawOne(i, cx, fy, sz);
      text(g, nameOf(i), { x: cx, y: cy + ch - labH * 0.30, size: Math.round(H * 0.0205), color: '#584C3B', key: tag + i });
    }
  };
  // 第一排：四个朝向
  row('f', 4, W * 0.225, H * 0.285, H * 0.150, 0.86,
    function (i, x, y, sz) { CH.draw(g, { x: x, y: y, size: sz, facing: FAC[i], expression: 'neutral', action: 'stand', u: 0.12, t: 0, hold: 0.5 }); },
    function (i) { return FACN[FAC[i]]; });
  // 第二排：五个表情（整只画在格子里，嘴/腮/眼都看得出差别）
  const EXP = (CH && CH.EXPRESSIONS) || ['neutral', 'happy', 'sad', 'surprised', 'sleepy'];
  row('e', EXP.length, W * 0.185, H * 0.245, H * 0.492, 0.94,
    function (i, x, y, sz) { CH.draw(g, { x: x, y: y, size: sz, facing: 'front', expression: EXP[i], action: 'stand', u: 0.42, t: 0.35, hold: 0.5 }); },
    function (i) { return EXP_N[EXP[i]] || EXP[i]; });
  // 第三排：五个动作定格
  const ACT = (CH && CH.ACTIONS) || ['stand', 'walk', 'wave', 'look-up', 'shiver'];
  row('a', ACT.length, W * 0.185, H * 0.190, H * 0.748, 0.88,
    function (i, x, y, sz) { CH.draw(g, { x: x, y: y, size: sz, facing: 'right', expression: 'happy', action: ACT[i], u: i === 1 ? 0.28 : 0.62, t: 0.6, hold: 0.5 }); },
    function (i) { return ACT_N[ACT[i]] || ACT[i]; });
}

function setup(CFG, API) {
  Z = { W: CFG.W, H: CFG.H, CFG: CFG, API: API };
  for (const k in PAPER) TILE[k] = buildTile(k);
  GRAIN = buildGrain();
  return Promise.resolve();
}

window.ENGINE = {
  id: 'collage',
  setup: setup,
  bg: bg, endFrame: endFrame, lyric: lyric, sheet: sheet,
  palette: palette, piece: piece, sprite: sprite, ground: ground, sky: sky,
  fx: fx, glow: glow, char: char, text: text, frame: frame,
  noise: function (key, i) { return noise(key, i); },
  makePiece: makePiece, step: function (t) { return Math.floor(t * UPS + 1e-6); },
  UPS: UPS, FONT: FONT
};
})();
