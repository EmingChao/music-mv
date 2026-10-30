// ══════════════════════════════════════════════════════════════════════════ crayon/engine.js —— 扁平绘本 / 蜡笔水彩 画风引擎（纯 Canvas2D，零依赖） 两条铁律（做不对就变成"干净的矢量图"）：
//   1) boil：线条一秒换 12 次抖动种子；**填色种子固定**。相邻帧线在抖、颜色不乱跳。 2) 填色像颜料：低 alpha 叠 3 层，每层错位 + 微转 + 形状不一致（sloppy），
//      multiply 混色，边缘出格/留白，大面用 tiles 一块块涂。 轮廓不是"描边"：3 条抖动细分短线叠加，一圈**不闭合**（留 1 处缺口）。 ══════════════════════════════════════════════════════════════════════════
(function () {
'use strict'; const E = (window.ENGINE = window.ENGINE || {}); E.id = 'crayon';

/* ── 调色板：旧绘本，饱和度略低 ─────────────────────────────────────── */
const PAL = {
  paper: '#F7F1E4', paperDeep: '#E6D9BC', cream: '#FFFDF6', tomato: '#D9573F', tomatoDeep: '#A83B2C', ocher: '#E0A33E', ocherDeep: '#B87A22',
  indigo: '#3A3F63', sage: '#7E9078', ink: '#2A2B33', violet: '#6B5B8E', sky0: '#4A4F72', sky1: '#3A3F62', sky2: '#7A80A6',
  snow: '#E9EAF2', snowShade: '#B7BEDA', lamp: '#F3C46A', lampDeep: '#E29B33', wood: '#A8693A', woodDark: '#6E3F22', iron: '#333A57', blush: '#E8806E', };
E.palette = PAL; const FONT = '"Hannotate SC","HanziPen SC","Kaiti SC","STKaiti","PingFang SC",sans-serif';

/* ── 随机：一切随机都从字符串种子来，镜头里禁 Math.random ───────────── */
function h32(str) {
  let h = 2166136261; const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rnd() {
  let a = h32(Array.prototype.join.call(arguments, '|'));
  return function () {
    a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const noise = (key, i) => rnd('n', key, i === undefined ? 0 : i)(); E.noise = noise;
let BF = 0;                                        // 当前 boil 帧号 = floor(t*12)
const boilF = (t) => Math.floor(t * 12 + 1e-6); E.boilF = boilF; E.bf = () => BF; E.setBF = (b) => { BF = b | 0; };
const clamp = (x, a, b) => (a === undefined ? (x < 0 ? 0 : x > 1 ? 1 : x) : x < a ? a : x > b ? b : x);
const lerp = (a, b, u) => a + (b - a) * u; const ease = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };

/* ── 几何 ──────────────────────────────────────────────────────────── */
function ell(cx, cy, rx, ry, n, rot) {
  n = n || 20; rot = rot || 0; const p = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; p.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return p;
}
function sqell(cx, cy, rx, ry, n, pw) {              // 超椭圆：壳、石头、房子那种"方中带圆"
  n = n || 24; pw = pw || 0.78; const p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); p.push([cx + rx * Math.sign(c) * Math.pow(Math.abs(c), pw), cy + ry * Math.sign(s) * Math.pow(Math.abs(s), pw)]);
  }
  return p;
}
function rectPts(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
function subdiv(pts, step, closed) {
  step = step || 8; closed = closed !== false; const o = [], n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(L / step));
    for (let j = 0; j < k; j++) o.push([lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)]);
  }
  if (!closed) o.push(pts[n - 1]);
  return o;
}
function centroid(pts) { let x = 0, y = 0; for (let i = 0; i < pts.length; i++) { x += pts[i][0]; y += pts[i][1]; } return [x / pts.length, y / pts.length]; }
function wob(key, pts, amp) { const r = rnd(key, 'w'); return pts.map(p => [p[0] + (r() - 0.5) * 2 * amp, p[1] + (r() - 0.5) * 2 * amp]); }
function sloppy(key, pts, amp) {                     // 涂色范围：比轮廓大一点、偏一点
  const r = rnd(key, 'sl'), c = centroid(pts); const dx = (r() - 0.5) * amp * 1.5, dy = (r() - 0.5) * amp * 1.5;
  return pts.map(p => {
    const d = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1, e = amp * (0.12 + r() * 0.75);
    return [p[0] + dx + (p[0] - c[0]) / d * e, p[1] + dy + (p[1] - c[1]) / d * e];
  });
}
function rotPts(pts, ang, cx, cy) { const c = Math.cos(ang), s = Math.sin(ang); return pts.map(p => { const x = p[0] - cx, y = p[1] - cy; return [cx + x * c - y * s, cy + x * s + y * c]; }); }
function capsule(a, b, r0, r1, n) {                  // 一条"腿/柄"：两头圆的长条
  n = n || 4; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -Math.sin(ang), ny = Math.cos(ang), p = []; p.push([a[0] + nx * r0, a[1] + ny * r0], [b[0] + nx * r1, b[1] + ny * r1]);
  for (let i = 1; i < n; i++) { const t = ang + Math.PI / 2 - (i / n) * Math.PI; p.push([b[0] + Math.cos(t) * r1, b[1] + Math.sin(t) * r1]); }
  p.push([b[0] - nx * r1, b[1] - ny * r1], [a[0] - nx * r0, a[1] - ny * r0]);
  for (let i = 1; i < n; i++) { const t = ang - Math.PI / 2 - (i / n) * Math.PI; p.push([a[0] + Math.cos(t) * r0, a[1] + Math.sin(t) * r0]); }
  return p;
}
function arcPts(cx, cy, rx, ry, a0, a1, n) { const p = []; n = n || 10; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return p; }
function path(g, pts) { if (!pts || pts.length < 2) return; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); }
function bbox(pts) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; }
const mapP = (pts, f) => pts.map(p => f(p[0], p[1]));

/* ── 蜡笔线：一条线 = 3–4 条抖动细分线叠出来 ──────────────────────── */
function wline(g, key, pts, o) {
  o = o || {};
  const IB = 1.35;                                   // 全局墨线加粗：1920 上太细就像矢量描边
  const col = o.color || PAL.ink, w = (o.w === undefined ? 3 : o.w) * IB; const layers = o.layers || 3, jit = (o.jit === undefined ? 1.2 : o.jit) * 1.5;
  let P = o.step === 0 ? pts : subdiv(pts, o.step || 8, o.closed !== false); let closed = o.closed !== false;
  if (closed && o.gap !== 0) {                       // 留缺口：绘本味的来源
    const r0 = rnd(key, 'gap'), n = P.length; const gs = Math.floor(r0() * n), gl = Math.max(1, Math.floor(n * (o.gap || 0.13)));
    const Q = []; for (let i = 0; i < n - gl; i++) Q.push(P[(gs + i) % n]);
    if (Q.length > 2) { P = Q; closed = false; }
  }
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = col;
  for (let L = 0; L < layers; L++) {
    const r = rnd(key, 'L', BF, L); const ox = (r() - 0.5) * jit * 1.6, oy = (r() - 0.5) * jit * 1.6;
    g.globalAlpha = (o.alpha === undefined ? 0.34 : o.alpha) * (0.72 + r() * 0.55);
    g.lineWidth = Math.max(0.7, w * (0.6 + r() * 0.75));
    path(g, mapP(P, (x, y) => [x + ox + (r() - 0.5) * 2 * jit, y + oy + (r() - 0.5) * 2 * jit]));
    if (closed) g.closePath();
    g.stroke();
  }
  g.restore();
}

/* ── 蜡笔填色：低 alpha 叠 3 层 + 错位 + 微转 + multiply ────────────── */
function wfill(g, key, pts, color, o) {
  o = o || {};
  const layers = o.layers || 3, a0 = o.alpha === undefined ? 0.3 : o.alpha;
  const slop = o.slop === undefined ? 3 : o.slop, c = centroid(pts);
  g.save();
  g.globalCompositeOperation = o.comp || 'multiply';
  for (let L = 0; L < layers; L++) {
    const r = rnd(key, 'F', L);
    let Q = slop > 0 ? sloppy(key + '#' + L, pts, slop * (L ? 1.35 : 1)) : pts;
    Q = rotPts(Q, (r() - 0.5) * (o.rot === undefined ? 0.035 : o.rot), c[0], c[1]);
    const dx = (r() - 0.5) * (o.dx === undefined ? 3 : o.dx) * 2, dy = (r() - 0.5) * (o.dy === undefined ? 3 : o.dy) * 2;
    g.globalAlpha = a0 * (0.72 + r() * 0.55);
    g.fillStyle = (o.color2 && L === layers - 1) ? o.color2 : color;
    path(g, mapP(Q, (x, y) => [x + dx, y + dy])); g.closePath(); g.fill();
  }
  g.restore();
}

/* ── 不透明底：让物件挡得住后面的东西（纸色 / 纸纹图案）───────────── */
function wbase(g, pts, color) {
  g.save(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = color || paperPat || PAL.paper;
  path(g, pts); g.closePath(); g.fill(); g.restore();
}

/* ── 短排线：蜡笔来回涂的那一层（种子固定，不抖）──────────────────── */
function hatch(g, key, pts, o) {
  o = o || {};
  const ang = o.angle === undefined ? -0.6 : o.angle, dist = o.dist || 7;
  const b = bbox(pts), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const R = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + 8;
  const ca = Math.cos(ang), sa = Math.sin(ang), n = Math.min(160, Math.ceil(2 * R / dist));
  g.save();
  g.globalCompositeOperation = o.comp || 'multiply';
  if (o.clip !== false) { path(g, pts); g.closePath(); g.clip(); }
  g.strokeStyle = o.color || PAL.ink; g.lineCap = 'butt';
  const r = rnd(key, 'H');
  for (let i = -n; i <= n; i++) {
    const off = (i + (r() - 0.5) * 0.6) * dist;
    const ax = cx - ca * R - sa * off, ay = cy - sa * R + ca * off;
    const bx = cx + ca * R - sa * off, by = cy + sa * R + ca * off;
    g.globalAlpha = (o.alpha === undefined ? 0.26 : o.alpha) * (0.5 + r() * 0.85);
    g.lineWidth = Math.max(0.7, (o.w || 2) * (0.6 + r() * 0.75));
    g.beginPath(); g.moveTo(ax + (r() - 0.5) * 3, ay + (r() - 0.5) * 3);
    g.quadraticCurveTo((ax + bx) / 2 + (r() - 0.5) * 6, (ay + by) / 2 + (r() - 0.5) * 6, bx + (r() - 0.5) * 3, by + (r() - 0.5) * 3);
    g.stroke();
  }
  g.restore();
}

/* ── 纸：暖白水彩纸，细噪点 + 极轻纤维 + 4 角变脏（只在 setup 生成一次）── */
let paperTex = null, paperPat = null, glowWarm = null, glowCool = null;
let W = 1920, H = 1080;
function makePaper(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), r = rnd('paper');
  const N = 96, grid = new Float32Array(N * N);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const at = (i, j) => grid[((j % N) + N) % N * N + (((i % N) + N) % N)];
  const vn = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(at(i, j), at(i + 1, j), sx), lerp(at(i, j + 1), at(i + 1, j + 1), sx), sy);
  };
  const img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const yy = y / 26;
    for (let x = 0; x < w; x++) {
      const m = vn(x / 34, yy) * 0.6 + vn(x / 7, y / 9) * 0.4;   // 低频水渍
      const tooth = r();                                          // 细噪点 = 纸的"牙齿"
      const tone = 0.952 + (m - 0.5) * 0.13 - Math.max(0, tooth - 0.66) * 0.3;
      const k = (y * w + x) * 4;
      d[k] = 249 * tone; d[k + 1] = 243 * tone; d[k + 2] = 229 * tone; d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.globalAlpha = 0.07; g.strokeStyle = '#8a7a60'; g.lineWidth = 0.8;      // 纤维
  for (let i = 0; i < 280; i++) {
    const x = r() * w, y = r() * h, a = r() * 6.28, L = 5 + r() * 16;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * L / 2, y + Math.sin(a + 0.6) * L / 2, x + Math.cos(a) * L, y + Math.sin(a) * L);
    g.stroke();
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'multiply';               // 4 角轻微变脏 / 受潮
  [[0, 0], [w, 0], [0, h], [w, h]].forEach(([cx, cy], i) => {
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * (0.26 + i * 0.03));
    rg.addColorStop(0, 'rgba(192,174,142,0.62)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  });
  g.globalCompositeOperation = 'source-over';
  paperTex = c;
}
function makeGlow(r, gg, bb) {                        // 带颗粒的暖光（加色用）
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data, rr = rnd('glow', r, gg, bb);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dist = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
    const f = Math.pow(clamp(1 - dist), 1.9) * (0.82 + 0.18 * rr()), k = (y * S + x) * 4;
    d[k] = r * f; d[k + 1] = gg * f; d[k + 2] = bb * f; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
function paperFill(g, x0, y0, x1, y1) {
  g.save(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = paperPat || PAL.paper; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.restore();
}

/* ── 天空：横向水彩色带，边缘不规则、带缺口 ─────────────────────────── */
function bandPts(key, x0, yA, x1, yB, n, amp) {
  const k = amp === undefined ? 1 : amp, r = rnd(key, 'band'), top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const x = lerp(x0, x1, i / n), d = yB - yA;
    top.push([x, yA + (r() - 0.5) * d * 0.055 * k]);
    bot.push([x, yB + (r() - 0.5) * d * 0.075 * k + (r() < 0.10 ? -d * 0.10 : 0)]);
  }
  return subdiv(top.concat(bot.reverse()), 26);
}
E.sky = function (g, spec) {
  const s = spec || {};
  const x0 = s.x0 === undefined ? -W * 0.1 : s.x0, x1 = s.x1 === undefined ? W * 1.1 : s.x1;
  const y0 = s.y0 === undefined ? -H * 0.1 : s.y0, y1 = s.y1 === undefined ? H * 0.78 : s.y1;
  const cols = s.colors || [PAL.sky0, PAL.sky1, PAL.sky2], key = s.key || 'sky';
  const D = y1 - y0, at = (f) => lerp(y0, y1, f);
  // 1) 一整片均匀的夜底色（不做中段色块，避免出现"黑板"或"雾墙"）
  wfill(g, key + 'b', bandPts(key + 'b', x0, y0 - D * 0.04, x1, at(1.02), 12), cols[0], { alpha: 0.42, layers: 3, slop: D * 0.02 });
  // 2) 只有最上面一段更深（山脊线在 0.32H 之上，不占画面中段）
  wfill(g, key + 't0', bandPts(key + 't0', x0, y0 - D * 0.04, x1, at(0.32), 9, 1.8), cols[1] || '#3A3F62', { alpha: 0.30, layers: 3, slop: D * 0.018 });
  // 3) 贴近雪线的一点反光：雪把夜照亮
  wfill(g, key + 'h', bandPts(key + 'h', x0, at(0.68), x1, at(1.03), 9, 3.0), cols[2] || '#7A80A6', { alpha: 0.24, layers: 2, slop: D * 0.012 });
  // 4) 两层斜排线让整片天透气（纸纹从下面透上来）
  hatch(g, key + 't', bandPts(key + 't', x0, y0, x1, at(0.62), 8), { angle: -1.15, dist: D * 0.03, color: '#A8AED0', alpha: 0.07, w: 2.6 });
  hatch(g, key + 't3', bandPts(key + 't3', x0, at(0.35), x1, at(1.02), 8), { angle: 0.35, dist: D * 0.045, color: '#B9BEDC', alpha: 0.05, w: 2.4 });
};

/* ── 地面：雪地 / 街道 ─────────────────────────────────────────────── */
E.ground = function (g, spec) {
  const s = spec || {}, y = s.y === undefined ? H * 0.8 : s.y;
  const x0 = s.x0 === undefined ? -W * 0.1 : s.x0, x1 = s.x1 === undefined ? W * 1.1 : s.x1;
  const y2 = s.y2 === undefined ? H * 1.2 : s.y2, key = s.key || 'gnd';
  const snow = (s.kind || 'snow') === 'snow';
  const top = [];
  for (let i = 0; i <= 16; i++) {
    const x = lerp(x0, x1, i / 16);
    top.push([x, y + Math.sin(i * 1.9 + noise(key, i) * 4) * H * 0.004 + (noise(key, 'd' + i) - 0.5) * H * 0.012]);
  }
  const field = subdiv(top.concat([[x1, y2], [x0, y2]]), 30);
  wbase(g, field, PAL.paper);
  wfill(g, key + 'f', field, s.color || (snow ? PAL.snow : '#8E8A88'),
    { alpha: snow ? 0.2 : 0.34, layers: 3, slop: H * 0.012, color2: snow ? PAL.snowShade : '#6E6A6C' });
  // 远雪：地平线下面压一条冷的暗带，远近才拉开
  wfill(g, key + 'far', bandPts(key + 'far', x0, y + H * 0.004, x1, y + H * 0.075, 12), PAL.snowShade, { alpha: 0.3, layers: 2, slop: H * 0.008 });
  // 整片雪地的蜡笔排线（斜的 + 一点点白提亮）
  hatch(g, key + 'h1', field, { angle: -0.92, dist: H * 0.021, color: PAL.snowShade, alpha: 0.13, w: 3 });
  hatch(g, key + 'h2', field, { angle: 0.18, dist: H * 0.05, color: '#FFFFFF', alpha: 0.12, w: 4.5, comp: 'source-over' });
  // 雪堆阴影 + 几笔长的横扫
  const dr = [[0.14, 0.92, 0.15, 0.022], [0.44, 0.97, 0.17, 0.024], [0.70, 0.92, 0.13, 0.018], [0.88, 1.0, 0.09, 0.016]];
  dr.forEach((d, i) => {
    const pts = ell(W * d[0], H * d[1], W * d[2], H * d[3], 18);
    wfill(g, key + 'dr' + i, pts, PAL.snowShade, { alpha: 0.13, layers: 2, slop: H * 0.007 });
    wline(g, key + 'dl' + i, pts.filter(p => p[1] < H * d[1] + 2), { w: 1.7, color: PAL.violet, alpha: 0.3, layers: 2, closed: false, gap: 0 });
  });
  wline(g, key + 'hz', top, { w: 2, color: PAL.violet, alpha: 0.42, layers: 2, closed: false, gap: 0 });
};

/* ── 影子 ─────────────────────────────────────────────────────────── */
E.shadow = function (g, spec) {
  const s = spec || {}, k = 'sh' + Math.round(s.x || 0) + ',' + Math.round(s.y || 0);
  wfill(g, k, ell(s.x || 0, s.y || 0, s.rx || 60, s.ry || 12, 16), s.color || '#8F93B8', { alpha: 0.26, layers: 2, slop: 2 });
};

/* ── piece：一块主体（纸片 / 色块）──────────────────────────────────── */
E.piece = function (g, spec) {
  const s = spec || {}, key = s.key || ('pc' + Math.round(s.x || 0) + ',' + Math.round(s.y || 0));
  let pts = s.pts;
  if (!pts) {
    const x = s.x || 0, y = s.y || 0, w = s.w || 200, h = s.h || 120;
    pts = rectPts(x - w / 2, y - h / 2, w, h);
    if (s.rot) pts = rotPts(pts, s.rot, x, y);
  }
  if (s.shadow) E.shadow(g, { x: s.x, y: (s.y || 0) + (s.h || 120) * 0.5, rx: (s.w || 200) * 0.5, ry: (s.h || 120) * 0.16 });
  wbase(g, pts, s.base || PAL.paper);
  wfill(g, key + 'f', pts, s.color || PAL.ochre, { alpha: s.alpha === undefined ? 0.4 : s.alpha, slop: s.slop === undefined ? 5 : s.slop, color2: s.color2 });
  if (s.hatch !== false) hatch(g, key + 'h', pts, { angle: s.hatchAngle === undefined ? 0.8 : s.hatchAngle, dist: 8, color: s.color || PAL.ochre, alpha: 0.15, w: 2.4 });
  wline(g, key + 'l', pts, { w: s.lw || 3, color: s.ink || PAL.ink, gap: s.gap === undefined ? 0.12 : s.gap });
  return pts;
};

/* ── frame：手绘框 / 窗 / 纸条 ─────────────────────────────────────── */
E.frame = function (g, spec) {
  const s = spec || {}, x = s.x || 0, y = s.y || 0, w = s.w || 300, h = s.h || 200;
  const key = 'fr' + Math.round(x) + ',' + Math.round(y) + Math.round(w);
  const pts = wob(key, rectPts(x, y, w, h), 2);
  if (s.kind === 'note') { wbase(g, pts, PAL.cream); wfill(g, key + 'f', pts, s.color || PAL.ocher, { alpha: 0.2, slop: 4 }); }
  else if (s.kind === 'window') { wbase(g, pts, '#FFF6D2'); wfill(g, key + 'f', pts, s.color || PAL.lamp, { alpha: 0.45, slop: 3 }); }
  else wfill(g, key + 'f', pts, s.color || PAL.ochre, { alpha: 0.16, slop: 5 });
  wline(g, key + 'l1', pts, { w: s.lw || 3.2, color: s.ink || PAL.ink, gap: 0.1 });
  wline(g, key + 'l2', pts.map(p => [p[0] + 2, p[1] + 1.5]), { w: s.lw ? s.lw * 0.5 : 1.8, color: s.ink || PAL.ink, gap: 0.2, alpha: 0.22 });
  return pts;
};

/* ── 光 ───────────────────────────────────────────────────────────── */
E.glow = function (g, spec) {                       // 光 = 一圈圈手绘抖线涂出来的，不是矢量渐变
  const s = spec || {}, x = s.x || 0, y = s.y || 0, r = s.r || 200, k = s.strength === undefined ? 1 : s.strength;
  if (k <= 0) return;
  const sy = s.sy === undefined ? 1 : s.sy, sq = sy < 0.55 ? 0.5 : 1;
  if (s.tex === 'cool') {
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.46 * k;
    g.drawImage(glowCool, x - r, y - r * sy, r * 2, r * 2 * sy); g.restore(); return;
  }
  const key = 'gw' + Math.round(r) + ',' + Math.round(sy * 100), col = s.color || PAL.lamp;
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 11; i >= 1; i--) {
    const f = i / 11, rr = r * (0.16 + 0.84 * f), al = 0.042 * Math.sqrt(1 - f * 0.85) * k;
    wline(g, key + 'r' + i + ',' + BF, wob(key + i + ',' + BF, ell(x, y, rr, rr * sy, 20), rr * 0.05 * sq),
      { w: Math.max(4, r * 0.085 * (1.35 - 0.5 * f)) * sq, color: col, alpha: al, layers: 1, closed: true, gap: 0.1 });
  }
  wfill(g, key + 'core', ell(x, y, r * 0.16, r * 0.16 * sy, 10), '#FFE9A8', { alpha: 0.26 * k, layers: 1, comp: 'lighter' });
  for (let d = 0; d < 9; d++) {
    const an = rnd(key, 'd', d) * 6.283, dd = r * (0.3 + 0.6 * rnd(key, 'e', d));
    wfill(g, key + 'p' + d, ell(x + Math.cos(an) * dd, y + Math.sin(an) * dd * sy, r * 0.026, r * 0.026 * sq, 6),
      '#FFF3CC', { alpha: 0.5 * k, layers: 1, comp: 'lighter' });
  }
  g.restore();
};
/* ── fx：一直在动的东西（种子固定，只由 t 推位置）──────────────────── */
E.fx = function (g, spec, t) {
  const s = spec || {}, kind = s.kind || 'snow', n = s.n || 110;
  const x0 = s.x0 === undefined ? -W * 0.08 : s.x0, x1 = s.x1 === undefined ? W * 1.08 : s.x1;
  const y0 = s.y0 === undefined ? -H * 0.08 : s.y0, y1 = s.y1 === undefined ? H * 0.95 : s.y1;
  const key = kind + (s.key || ''), col = s.color || '#FFFFFF', span = y1 - y0;
  for (let i = 0; i < n; i++) {
    const r = rnd(key, i), ph = r() * 6.28, sp = (18 + r() * 74) * (s.speed || 1);
    const sz = (1.3 + r() * r() * 4.4) * (s.size || 1), sw = 6 + r() * 16;
    const yy = y0 + ((r() * span + t * sp) % span), xx = lerp(x0, x1, r()) + Math.sin(t * 1.2 + ph) * sw;
    if (kind === 'snow') {
      if (sz > 4.2) {                                      // 大雪花：小孩画的三笔小雪星
        for (let j = 0; j < 3; j++) {
          const a = ph + j * Math.PI / 3, ca = Math.cos(a) * sz, sa = Math.sin(a) * sz;
          wline(g, key + 'a' + i + '_' + j, [[xx - ca, yy - sa], [xx + ca, yy + sa]], { color: col, w: 1.7, alpha: 0.55, layers: 2, jit: 0.4, closed: false });
        }
      } else if (sz > 2.6) {
        wline(g, key + 'c' + i, arcPts(xx, yy, sz * 0.95, sz * 0.95, ph, ph + 2.0, 5), { color: col, w: 2, alpha: 0.6, layers: 2, jit: 0.4, closed: false });
      } else {                                             // 小雪粒：实心 + 一点毛边
        g.save(); g.globalAlpha = 0.45 + (i % 5) * 0.07; g.fillStyle = col;
        g.beginPath(); g.arc(xx, yy, Math.max(0.8, sz * 0.8), 0, 6.2832); g.fill();
        g.globalAlpha = 0.2; g.beginPath(); g.arc(xx + sz * 0.55, yy + sz * 0.5, Math.max(1, sz), 0, 6.2832); g.fill();
        g.restore();
      }
    } else if (kind === 'rain') {
      wline(g, key + 'r' + i, [[xx, yy], [xx - sz * 0.9, yy + sz * 4.4]], { color: col, w: 1.5, alpha: 0.38, layers: 2, jit: 0.4, closed: false });
    } else if (kind === 'petal' || kind === 'dust') {
      wline(g, key + 'p' + i, ell(xx, yy, sz * 0.75, sz * 0.45, 6), { color: col, w: 1.6, alpha: 0.55, layers: 2, jit: 0.5, gap: 0.3 });
    } else if (kind === 'sparkle') {
      const a = 1.6 + sz * 0.9;
      wline(g, key + 's' + i, [[xx - a, yy], [xx + a, yy]], { color: col, w: 1.7, alpha: 0.6, layers: 2, jit: 0.4, closed: false });
      wline(g, key + 't' + i, [[xx, yy - a], [xx, yy + a]], { color: col, w: 1.7, alpha: 0.6, layers: 2, jit: 0.4, closed: false });
    } else if (kind === 'smoke') {
      wfill(g, key + 'm' + i, ell(xx, yy, sz * 6, sz * 4.4, 10), '#C8C4BE', { alpha: 0.12, slop: sz * 2 });
    } else if (kind === 'light-ray') {
      const a = ph;
      wline(g, key + 'l' + i, [[xx, yy], [xx + Math.cos(a) * sz * 26, yy + Math.sin(a) * sz * 26]],
        { color: col, w: sz, alpha: 0.16, layers: 1, jit: 1.2, closed: false });
    }
  }
};

/* ── 蜡笔字：0.5° 倾斜 + 轻微错版重影 ─────────────────────────────── */
E.text = function (g, str, spec) {
  const s = spec || {}, size = s.size || 40;
  g.save();
  g.font = (s.weight ? s.weight + ' ' : '') + size + 'px ' + FONT;
  g.textAlign = s.align || 'center'; g.textBaseline = s.baseline || 'middle';
  g.translate(s.x || 0, s.y || 0);
  g.rotate((s.rot === undefined ? 0.5 : s.rot) * Math.PI / 180);
  if (s.ink) {
    g.lineJoin = 'round'; g.strokeStyle = s.ink;
    g.lineWidth = Math.max(1.2, size * 0.05); g.globalAlpha = 0.5;
    g.strokeText(str, 1.2, 1.0);
    g.lineWidth = Math.max(0.8, size * 0.02); g.globalAlpha = 0.75;
    g.strokeText(str, 0, 0);
  }
  g.globalAlpha = 0.14; g.fillStyle = s.ghost || s.color || PAL.ink;
  g.fillText(str, size * 0.05, -size * 0.035);
  g.globalAlpha = 1; g.fillStyle = s.color || PAL.ink; g.fillText(str, 0, 0);
  g.restore();
};

/* ── sprite：8 种零件（房子/树/路灯/月亮/星星/栅栏/云/路牌）─────────── */
E.sprite = function (g, spec) {
  const s = spec || {}, k = s.kind || 'house';
  const key = 's' + k + (s.key || '') + Math.round(s.x || 0) + ',' + Math.round(s.y || 0);
  const x = s.x || 0, y = s.y || 0, sz = s.size || H * 0.15;
  if (k === 'house') {
    const w = s.w || sz * 1.4, h = s.h || sz, tp = y - h, sc = s.color || PAL.ocher, rc = s.roof || PAL.violet;
    const wall = wob(key + 'w', rectPts(x, tp, w, h), 1.8);
    const roof = subdiv([[x - w * 0.07, tp + 3], [x + w * 0.5, tp - h * 0.56], [x + w * 1.07, tp + 3]], 22, false);
    const sn = [[x - w * 0.07, tp + 2], [x + w * 0.5, tp - h * 0.56], [x + w * 1.07, tp + 2], [x + w * 0.87, tp - h * 0.13],
      [x + w * 0.67, tp - h * 0.06], [x + w * 0.5, tp - h * 0.17], [x + w * 0.33, tp - h * 0.06], [x + w * 0.13, tp - h * 0.13]];
    wbase(g, wall); wfill(g, key + 'wf', wall, sc, { alpha: 0.5, slop: 3 });
    hatch(g, key + 'wh', wall, { angle: 0.95, dist: 8, color: sc, alpha: 0.16, w: 2.6 });
    wbase(g, roof); wfill(g, key + 'rf', roof, rc, { alpha: 0.5, slop: 2.5 });
    hatch(g, key + 'rh', roof, { angle: -0.32, dist: 6, color: rc, alpha: 0.18, w: 2.4 });
    wfill(g, key + 'sn', sn, '#EDEDF8', { alpha: 0.55, slop: 2, comp: 'source-over' });
    for (let i = 0; i < (s.wins === undefined ? 2 : s.wins); i++) {
      const ww = w * 0.2, wh = h * 0.24, wx = x + w * (0.15 + 0.34 * i), wy = tp + h * 0.15;
      const wp = wob(key + 'p' + i, rectPts(wx, wy, ww, wh), 1.2);
      wbase(g, wp, '#FFF7D6'); wfill(g, key + 'pf' + i, wp, PAL.lamp, { alpha: 0.6, slop: 1.5, layers: 2 });
      wline(g, key + 'pl' + i, wp, { w: 2.2, gap: 0.12 });
    }
    const dw = w * 0.22, dh = h * 0.44, dp = wob(key + 'dp', rectPts(x + w * 0.61, y - dh, dw, dh), 1.2);
    wbase(g, dp); wfill(g, key + 'df', dp, PAL.wood, { alpha: 0.5, slop: 2 });
    wline(g, key + 'dl', dp, { w: 2.2, gap: 0.1 });
    wline(g, key + 'wl', wall, { w: 2.8, gap: 0.1 });
    wline(g, key + 'rl', roof, { w: 2.8, closed: false, gap: 0.06 });
    wline(g, key + 'sl', subdiv(sn, 12), { w: 1.7, color: PAL.violet, gap: 0.2 });
  } else if (k === 'tree') {
    const h = s.size || H * 0.2, c1 = PAL.woodDark;
    wline(g, key + 'tk', [[x, y], [x + h * 0.035, y - h * 0.42], [x - h * 0.015, y - h * 0.78]], { w: 4, color: c1, closed: false });
    for (let i = 0; i < 3; i++) {
      const yy = y - h * (0.40 + i * 0.155), d = i % 2 ? 1 : -1;
      wline(g, key + 'b' + i, [[x, yy], [x + d * h * 0.17, yy - h * 0.07], [x + d * h * 0.28, yy - h * 0.16]],
        { w: 2.6 - i * 0.4, color: c1, closed: false, layers: 2 });
      wfill(g, key + 's' + i, ell(x + d * h * 0.29, yy - h * 0.185, h * 0.055, h * 0.028, 10), '#E8E8F4', { alpha: 0.34, slop: 1.5, comp: 'source-over' });
    }
  } else if (k === 'lamp') {
    const h = s.h || H * 0.6, tp = y - h, pw = h * 0.021;
    const base = wob(key + 'b', subdiv([[x - h * 0.062, y + 2], [x - h * 0.036, y - h * 0.06], [x + h * 0.036, y - h * 0.06], [x + h * 0.062, y + 2]], 14), 0.8);
    const pole = wob(key + 'p', subdiv([[x - pw, y - h * 0.055], [x - pw * 0.82, tp + h * 0.22], [x + pw * 0.82, tp + h * 0.22], [x + pw, y - h * 0.055]], 28), 0.5);
    const cap = subdiv([[x - h * 0.072, tp + h * 0.066], [x, tp + h * 0.006], [x + h * 0.072, tp + h * 0.066]], 12, false);
    wbase(g, base); wfill(g, key + 'bf', base, PAL.iron, { alpha: 0.5, slop: 1.5 });
    wbase(g, pole); wfill(g, key + 'pf', pole, PAL.iron, { alpha: 0.45, slop: 1.2 });
    wfill(g, key + 'cf', cap, PAL.iron, { alpha: 0.55, slop: 1.2 });
    wline(g, key + 'bl', base, { w: 2.4, gap: 0.14 });
    wline(g, key + 'pl', pole, { w: 2.4, gap: 0.08 });
    wline(g, key + 'cl', cap, { w: 2.6, closed: false, gap: 0 });
    [0.32, 0.66].forEach((f, i) => {
      const ry = tp + h * f, rr = h * (0.021 - i * 0.005);
      wline(g, key + 'r' + i, ell(x, ry, rr, rr * 0.55, 8), { w: 1.8, color: PAL.iron, alpha: 0.4, layers: 2 });
    });
  } else if (k === 'moon') {
    const r = s.r || sz, mp = wob(key + 'm', ell(x, y, r, r * 0.97, 26), 1.4);
    E.glow(g, { x, y, r: r * 3.6, strength: 0.46, tex: 'cool' });
    wbase(g, mp, PAL.cream);
    wfill(g, key + 'mf', mp, '#F8E8B9', { alpha: 0.5, slop: 2, comp: 'source-over' });
    hatch(g, key + 'mh', mp, { angle: 1.05, dist: r * 0.26, color: '#DCC894', alpha: 0.2, w: 2.2 });
    wline(g, key + 'ml', mp, { w: 2.4, color: '#C9B98C', gap: 0.12 });
    wline(g, key + 'mc1', ell(x - r * 0.26, y - r * 0.2, r * 0.19, r * 0.15, 10), { w: 1.3, color: '#D9C79A', alpha: 0.35, layers: 2 });
    wline(g, key + 'mc2', ell(x + r * 0.2, y + r * 0.24, r * 0.25, r * 0.17, 10), { w: 1.3, color: '#D9C79A', alpha: 0.35, layers: 2 });
  } else if (k === 'star') {
    const P = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? sz * 0.4 : sz;
      P.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    wfill(g, key + 'f', P, s.color || '#FFF6D0', { alpha: 0.42, layers: 2, slop: 1, comp: 'source-over' });
    wline(g, key + 'l', P, { w: 1.5, color: s.color || '#FFF6D0', alpha: 0.45, layers: 2, gap: 0.22 });
  } else if (k === 'fence') {
    const w = s.w || sz * 2, h = s.h || sz * 0.5, n = s.n || 5;
    for (let i = 0; i < n; i++) {
      const px = x + w * (i / (n - 1));
      const pp = wob(key + 'p' + i, rectPts(px - h * 0.055, y - h, h * 0.11, h), 1);
      wbase(g, pp); wfill(g, key + 'pf' + i, pp, PAL.wood, { alpha: 0.45, slop: 1.5 });
      wline(g, key + 'pl' + i, pp, { w: 2, gap: 0.2 });
    }
    for (let j = 0; j < 2; j++) {
      const ry = y - h * (0.40 + j * 0.40);
      wline(g, key + 'r' + j, [[x - w * 0.05, ry + 1.5], [x + w * 1.03, ry - 1]], { w: 2.6, color: PAL.wood, alpha: 0.5, closed: false });
    }
  } else if (k === 'cloud') {
    const cw = sz * 3.4, ch = sz * 0.86, nb = s.bumps || 4, bc = [], br = [], top = [];
    for (let i = 0; i < nb; i++) { bc.push(x - cw * 0.5 + cw * (i + 0.5) / nb); br.push(ch * (0.58 + 0.42 * rnd(key, 'b', i)())); }
    for (let j = 0; j <= 34; j++) { const xx = x - cw * 0.53 + cw * 1.06 * (j / 34); let yy = y - ch * 0.04;
      for (let i = 0; i < nb; i++) { const dx = (xx - bc[i]) / (br[i] * 1.2), hh = 1 - dx * dx; if (hh > 0) yy = Math.min(yy, y - ch * 0.04 - Math.sqrt(hh) * br[i]); }
      top.push([xx, yy]); }
    const CP = top.concat([[x + cw * 0.5, y], [x + cw * 0.22, y - ch * 0.10], [x, y + ch * 0.07], [x - cw * 0.24, y - ch * 0.08], [x - cw * 0.5, y]]);
    const CPB = CP.map(p => [x + (p[0] - x) * 1.03, y + (p[1] - y) * 1.09]);
    wbase(g, CPB, PAL.paper);
    wfill(g, key + 'f', CP, s.color || '#DCE1F0', { alpha: 0.52, slop: sz * 0.05, comp: 'source-over' });
    wfill(g, key + 'sh', subdiv([[x - cw * 0.46, y - ch * 0.26], [x, y - ch * 0.34], [x + cw * 0.46, y - ch * 0.28],
      [x + cw * 0.46, y + ch * 0.04], [x, y + ch * 0.09], [x - cw * 0.46, y + ch * 0.03]], 13, true),
      '#BCC3DE', { alpha: 0.26, slop: 3, comp: 'source-over' });
    hatch(g, key + 'h', CP, { angle: -0.5, dist: Math.max(4, sz * 0.16), color: '#AEB6D8', alpha: 0.12 });
    wline(g, key + 'l', CP, { w: 2.4, color: '#F2F6FF', alpha: 0.6, layers: 2, gap: 0.1 });
    wline(g, key + 'l2', [[x - cw * 0.44, y - ch * 0.02], [x - cw * 0.1, y + ch * 0.05], [x + cw * 0.2, y + ch * 0.02], [x + cw * 0.44, y - ch * 0.04]],
      { w: 2, color: '#9FA8CC', alpha: 0.32, closed: false, layers: 2 });
  } else if (k === 'sign') {
    const h = sz * 2.2, bw = sz * 1.2, bh = sz * 0.66;
    wline(g, key + 'po', [[x, y + 2], [x + 1.5, y - h]], { w: 4, color: PAL.woodDark, closed: false });
    const bp = wob(key + 'b', rectPts(x - bw * 0.5, y - h - bh * 0.25, bw, bh), 1.4);
    wbase(g, bp); wfill(g, key + 'bf', bp, PAL.cream, { alpha: 0.55, slop: 2, comp: 'source-over' });
    wline(g, key + 'bl', bp, { w: 2.4, gap: 0.1 });
    wline(g, key + 't1', [[x - bw * 0.3, y - h + bh * 0.18], [x + bw * 0.28, y - h + bh * 0.24]], { w: 2, color: PAL.ink, alpha: 0.45, closed: false, layers: 2 });
    wline(g, key + 't2', [[x - bw * 0.3, y - h + bh * 0.55], [x + bw * 0.1, y - h + bh * 0.6]], { w: 2, color: PAL.ink, alpha: 0.3, closed: false, layers: 2 });
  }
};

/* ── char：转发给 CHARACTER（影子 + boil 帧号）────────────────────── */
E.char = function (g, o) {
  if (!o) return;
  BF = boilF(o.t || 0);
  const C = window.CHARACTER;
  if (!C || !C.draw) return;
  if (o.shadow !== false) {
    const s = o.size || H * 0.2;
    wfill(g, 'cshad', ell(o.x, o.y + s * 0.012, s * 0.33, s * 0.05, 18), '#7C82A8', { alpha: 0.26, layers: 2, slop: s * 0.012 });
  }
  return C.draw(g, o);
};

/* ── 场景：布局一处定义 ─────────────────────────────────────────────── */
const LAY = {};
function layout() {
  LAY.hz = H * 0.745; LAY.feet = H * 0.86;
  LAY.lamp = { x: W * 0.63, y: H * 0.805, h: H * 0.615 };
  LAY.moon = { x: W * 0.775, y: H * 0.135, r: H * 0.05 };
  LAY.houses = [
    { x: W * 0.015, y: H * 0.775, w: W * 0.155, h: H * 0.245, color: '#C2684E', roof: '#4A3D66', wins: 2 },
    { x: W * 0.185, y: H * 0.782, w: W * 0.115, h: H * 0.29, color: '#DCAA55', roof: '#7B3B2F', wins: 2 },
  ];
}
let BX0 = 0, BY0 = 0, BW = 1, BH = 1;
const PH = 4, CK = {};
function bakeNightStreet(g) {
  paperFill(g, BX0, BY0, BX0 + BW, BY0 + BH);
  E.sky(g, { x0: BX0, x1: BX0 + BW, y0: BY0, y1: LAY.hz + H * 0.02, colors: [PAL.sky0, PAL.sky1, PAL.sky2], key: 'sky' });
  const r = rnd('stars');
  for (let i = 0; i < 42; i++) {
    const sx = lerp(BX0, BX0 + BW, r()), sy = lerp(BY0, LAY.hz * 0.9, r() * r());
    if (Math.hypot(sx - LAY.moon.x, sy - LAY.moon.y) < H * 0.12) continue;
    E.sprite(g, { kind: 'star', x: sx, y: sy, size: 1.8 + r() * r() * 7, key: 'st' + i });
  }
  E.sprite(g, { kind: 'moon', x: LAY.moon.x, y: LAY.moon.y, r: LAY.moon.r, key: 'moon' });
  E.sprite(g, { kind: 'cloud', x: W * 0.33, y: H * 0.19, size: H * 0.055, key: 'cl1' });
  E.sprite(g, { kind: 'cloud', x: W * 0.88, y: H * 0.235, size: H * 0.062, key: 'cl2' });
  LAY.houses.forEach((hs, i) => E.sprite(g, Object.assign({ kind: 'house', key: 'hh' + i }, hs)));
  E.sprite(g, { kind: 'fence', x: W * 0.315, y: LAY.hz + H * 0.028, w: W * 0.115, h: H * 0.062, n: 5, key: 'fn' });
  E.sprite(g, { kind: 'tree', x: W * 0.455, y: LAY.hz + H * 0.032, size: H * 0.215, key: 'tr' });
  E.ground(g, { y: LAY.hz, key: 'gd' });
  E.sprite(g, { kind: 'lamp', x: LAY.lamp.x, y: LAY.lamp.y, h: LAY.lamp.h, key: 'lp' });
  E.sprite(g, { kind: 'sign', x: W * 0.80, y: LAY.feet, size: H * 0.045, key: 'sg' });
}
function bake(kind) {
  let arr = CK[kind];
  if (arr) return arr;
  arr = [];
  const old = BF;
  for (let ph = 0; ph < PH; ph++) {
    const c = document.createElement('canvas'); c.width = BW; c.height = BH;
    const g = c.getContext('2d');
    BF = ph;
    g.save(); g.translate(-BX0, -BY0);
    if (kind === 'plain') {
      paperFill(g, BX0, BY0, BX0 + BW, BY0 + BH);
      E.sky(g, { x0: BX0, x1: BX0 + BW, y0: BY0, y1: H * 0.8, key: 's' });
      E.ground(g, { y: LAY.hz, key: 'g' });
    } else bakeNightStreet(g);
    g.restore();
    arr.push(c);
  }
  BF = old; CK[kind] = arr; return arr;
}
function lampLive(g, t, k) {
  const L = LAY.lamp, x = L.x, y = L.y, h = L.h, tp = y - h, cy = tp + h * 0.105;
  const gl = wob('lampGlass', [[x - h * 0.052, tp + h * 0.165], [x - h * 0.034, tp + h * 0.052], [x + h * 0.034, tp + h * 0.052], [x + h * 0.052, tp + h * 0.165]], 1);
  wbase(g, gl, '#FFF8DC');
  wfill(g, 'lampGlassF', gl, PAL.lamp, { alpha: 0.55 * clamp(k), layers: 3, slop: 1.5 });
  wline(g, 'lampGlassL', gl, { w: 2.4, color: PAL.ochreDeep, gap: 0.12 });
  wline(g, 'lampBar', [[x, tp + h * 0.052], [x, tp + h * 0.165]], { w: 2, color: PAL.ochreDeep, closed: false, layers: 2 });
  wline(g, 'lampBar2', [[x - h * 0.042, tp + h * 0.112], [x + h * 0.042, tp + h * 0.112]], { w: 1.8, color: PAL.ochreDeep, closed: false, layers: 2 });
  E.glow(g, { x: x, y: cy, r: h * 0.26 * clamp(k, 0, 1.7), strength: 0.55 * k });
  E.glow(g, { x: x, y: y + H * 0.015, r: h * 0.30 * clamp(k, 0, 1.7), strength: 0.42 * k, sy: 0.3 });
  // 小孩子画灯会加几根短光线：比画光圈更像手绘
  if (k > 0.12) for (let i = 0; i < 7; i++) {
    const a = -Math.PI * (0.10 + 0.135 * i), r0 = h * 0.135, r1 = h * (0.185 + 0.022 * (i % 2));
    wline(g, 'ray' + i, [[x + Math.cos(a) * r0, cy + Math.sin(a) * r0], [x + Math.cos(a) * r1, cy + Math.sin(a) * r1]],
      { w: 2.2, color: PAL.lampDeep, alpha: 0.4 * clamp(k), closed: false, layers: 2 });
  }
}

/* ── bg：静态场景是 4 个 boil 相位的离屏图，每帧只 blit ──────────────── */
E.bg = function (g, shot, t, u, cam, CFG) {
  const b = (shot && shot.bg) || {}, kind = b.kind || 'night-street';
  const bf = boilF(t);
  BF = bf;
  const arr = bake(kind);
  g.save(); g.drawImage(arr[((bf % PH) + PH) % PH], BX0, BY0, BW, BH); g.restore();
  if (kind !== 'plain') lampLive(g, t, b.lamp === undefined ? 1 : b.lamp);
};

/* ── 纸的收尾：纸纹 ≤0.12 + 四角 vignette ≤0.10 + 冷色偏 ≤0.05 ──────── */
let vigTex = null, finTex = null;
function makeVignette(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.30, w / 2, h * 0.5, Math.hypot(w, h) * 0.62);
  rg.addColorStop(0, 'rgba(255,255,255,0)');
  rg.addColorStop(0.6, 'rgba(214,198,170,0.34)');
  rg.addColorStop(1, 'rgba(166,146,114,0.86)');
  g.fillStyle = rg; g.fillRect(0, 0, w, h);
  vigTex = c;
}
function makeFinish(w, h) {                                  // 三层 multiply 预合成一张，每帧只贴一次
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'multiply';
  if (paperTex) { g.globalAlpha = 0.12; g.drawImage(paperTex, 0, 0, w, h); }
  if (vigTex) { g.globalAlpha = 0.10; g.drawImage(vigTex, 0, 0, w, h); }
  g.globalAlpha = 0.05; g.fillStyle = '#6E7BA8'; g.fillRect(0, 0, w, h);
  return c;
}
E.endFrame = function (g, t, CFG) {
  const w = (CFG && CFG.W) || W, h = (CFG && CFG.H) || H;
  if (!finTex || finTex.width !== w) finTex = makeFinish(w, h);
  g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(finTex, 0, 0, w, h); g.restore();
};

/* ── 歌词：奶白手写 + 墨色双层抖动手描边（不黑体、不硬投影）─────────── */
E.lyric = function (g, line, CFG) {
  if (!line || !line.text) return;
  const L = CFG.LYRIC || {}, w = CFG.W, h = CFG.H;
  // 蜡笔风的字是"墨写、纸白托底"：主色用墨（纸白字落在纸白地上会看不见），
  // 外圈光晕用纸白，这样在雪地/夜空/纸卡上都咬得住。
  const size = L.size || 72, col = PAL.ink, halo = PAL.paper || '#F7F1E4';
  const fade = clamp(Math.min((line.t - line.s0) / 0.28, (line.s1 - line.t) / 0.34));
  if (fade <= 0.001) return;
  const bf = boilF(line.t), r1 = rnd('ly1', bf, line.i), r2 = rnd('ly2', bf, line.i);
  g.save();
  g.translate(w * 0.5, h * (L.bottom || 0.9));
  g.rotate(-0.4 * Math.PI / 180);
  g.font = '600 ' + size + 'px ' + FONT;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.strokeStyle = halo;
  g.globalAlpha = fade * 0.62; g.lineWidth = Math.max(6, size * 0.14);
  g.strokeText(line.text, (r1() - 0.5) * 2.0, (r1() - 0.5) * 2.0);
  g.globalAlpha = fade * 0.9; g.lineWidth = Math.max(3, size * 0.07);
  g.strokeText(line.text, (r2() - 0.5) * 1.4, (r2() - 0.5) * 1.4);
  g.globalAlpha = fade * 0.96; g.fillStyle = col; g.fillText(line.text, 0, 0);
  g.restore();
};

/* ── 设定图：三排（朝向 4 / 表情 5 / 动作 5）+ 标题 ─────────────────── */
const ACT_CN = { stand: '站', walk: '走', wave: '招手', 'look-up': '抬头', shiver: '发抖' };
const FACE_CN = { front: '正面', left: '左侧', right: '右侧', back: '背面' };
E.sheet = function (g, CFG, API) {
  const w = CFG.W || W, h = CFG.H || H, C = window.CHARACTER;
  paperFill(g, 0, 0, w, h);
  E.text(g, '角色设定图 · ' + ((C && C.name) || '阿蟹'), { x: w * 0.5, y: h * 0.075, size: h * 0.058, color: PAL.ink });
  if (C && C.desc) E.text(g, C.desc, { x: w * 0.5, y: h * 0.128, size: h * 0.026, color: '#7A6A5C', alpha: 0.8 });
  wline(g, 'stitle', [[w * 0.30, h * 0.115], [w * 0.70, h * 0.113]], { w: 2, color: PAL.violet, alpha: 0.35, closed: false, layers: 2 });
  [0.505, 0.765].forEach((f, i) => wline(g, 'ssep' + i, [[w * 0.05, h * f], [w * 0.95, h * f]], { w: 1.6, color: PAL.violet, alpha: 0.28, closed: false, layers: 2 }));
  if (!C || !C.draw) return;
  BF = 0;
  const faces = ['front', 'left', 'right', 'back'], exps = C.EXPRESSIONS || ['neutral', 'happy', 'sad', 'surprised'],
    acts = C.ACTIONS || ['stand', 'walk', 'wave', 'look-up'];
  const put = (x, y, size, o) => E.char(g, Object.assign({ x: x, y: y, size: size, facing: 'front', expression: 'neutral', action: 'stand', u: 0.25, t: 0, shadow: true }, o));
  const cap = (s, x, y) => E.text(g, s, { x: x, y: y, size: h * 0.023, color: PAL.violet });
  faces.forEach((f, i) => {
    const x = w * (0.21 + i * 0.195), y = h * 0.455;
    put(x, y, h * 0.275, { facing: f, u: 0.3 });
    cap(FACE_CN[f] || f, x, y + h * 0.042);
  });
  exps.forEach((e, i) => {
    const x = w * (0.14 + i * (0.72 / Math.max(1, exps.length - 1))), y = h * 0.715;
    put(x, y, h * 0.155, { expression: e, u: 0.3 });
    cap(e, x, y + h * 0.03);
  });
  acts.forEach((a, i) => {
    const x = w * (0.14 + i * (0.72 / Math.max(1, acts.length - 1))), y = h * 0.945;
    put(x, y, h * 0.155, { action: a, u: 0.62, hold: a === 'walk' ? 0.625 : undefined });
    cap(ACT_CN[a] || a, x, y + h * 0.028);
  });
};

/* ── setup：纸纹/光晕/vignette 只生成一次，静态场景预烘 4 个 boil 相位 ── */
E.setup = function (CFG, API) {
  W = (CFG && CFG.W) || 1920; H = (CFG && CFG.H) || 1080;
  layout();
  makePaper(W, H);
  const pc = document.createElement('canvas'); pc.width = 8; pc.height = 8;
  paperPat = pc.getContext('2d').createPattern(paperTex, 'repeat');
  glowWarm = makeGlow(255, 196, 108);
  glowCool = makeGlow(198, 212, 255);
  makeVignette(W, H);
  finTex = makeFinish(W, H);
  BX0 = -W * 0.05; BY0 = -H * 0.04;
  BW = Math.round(W * 1.10); BH = Math.round(H * 1.12);
  BF = 0;
  bake('night-street');
};

/* character.js 用同一套蜡笔笔法，两个文件共享质感（这是画风的一部分）*/
E._pen = { wline: wline, wfill: wfill, wbase: wbase, hatch: hatch, ell: ell, sqell: sqell,
  subdiv: subdiv, arcPts: arcPts, capsule: capsule, wob: wob, rnd: rnd, rotPts: rotPts, bbox: bbox, mapP: mapP };
})();

