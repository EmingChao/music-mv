/* ═══════════════════════════════════════════════════════════════════════════
   pixel/engine.js —— 16bit 像素游戏风引擎（window.ENGINE）
   ---------------------------------------------------------------------------
   坐标系：CFG.W × CFG.H = 320 × 180（一个格子 = 一个像素）。装配页把它整数倍
   最近邻放大到 CFG.OUT（1920×1080）；歌词和 endFrame 画在大画布清晰层上。
   铁律：
     1. 一切坐标 Math.round 到整数，没有半像素、没有 0.5 宽的线。
     2. 只用 PAL 里 24 个颜色，没有 rgba 中间色、没有 alpha 渐变。
     3. 渐变 = 4×4 Bayer 有序抖动（bt / dith），逐格决定两层色谁出现。
     4. 主体外面描 1px 深色轮廓（先把深色底形往外扩 1px，再画本体）。
     5. 动画 12fps：pf = floor(t*12)，雪/步伐/抖动只随 pf 变。
     6. 镜头不缩放（缩放会把格子弄得大小不一）：cam 换算成整像素平移，
        背景分三层视差 0.25 / 0.5 / 1.0。
   所有画法函数进门都 snap(g)：把装配页套好的变换压成整数平移，
   这样就算 cam 带 zoom，画出来的格子也还是整整齐齐的 1×1。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict'; const E = (window.ENGINE = window.ENGINE || {}); E.id = 'pixel';
  // ─────────────────────────────────────────────── 调色板（24 色）
  const LIST = [
    '#0B0B14', // 0  ink        最深：轮廓、夜空顶
    '#121428', // 1  night0     深夜蓝
    '#1B2043', // 2  night1     夜蓝
    '#27305C', // 3  night2     蓝（屋顶、树影）
    '#37457C', // 4  night3     亮蓝
    '#4F6298', // 5  skyline    地平线蓝
    '#6E82B4', // 6  snowFar    远处雪影
    '#9DAFD4', // 7  snowMid    雪影
    '#CBD8EE', // 8  snow       雪
    '#EEF3FB', // 9  snowLit    亮雪
    '#FFFFFF', // 10 white      高光 / 近处雪花
    '#3A1220', // 11 crabInk    螃蟹轮廓
    '#8A2226', // 12 crabDark   螃蟹暗部（夜里）
    '#D8402C', // 13 crabRed    番茄红
    '#FF6A3C', // 14 crabLite   亮橘（受光）
    '#F7C48A', // 15 crabBelly  肚子浅杏
    '#4A2C22', // 16 woodDark   深木
    '#8A5637', // 17 wood       木
    '#C8996A', // 18 woodLit    亮木
    '#E8A23C', // 19 amber      琥珀
    '#FFD27A', // 20 lampWarm   暖黄（灯、窗）——全片唯一强调色
    '#FFF4C8', // 21 lampCore   灯芯浅暖 / 歌词字
    '#F0CFA0', // 22 snowWarm   被灯照亮的雪
    '#D9B49A', // 23 snowWarm2  被灯照亮的雪影
  ]; const NAMES = ['ink', 'night0', 'night1', 'night2', 'night3', 'skyline', 'snowFar', 'snowMid',
    'snow', 'snowLit', 'white', 'crabInk', 'crabDark', 'crabRed', 'crabLite', 'crabBelly',
    'woodDark', 'wood', 'woodLit', 'amber', 'lampWarm', 'lampCore', 'snowWarm', 'snowWarm2']; const PAL = {};
  NAMES.forEach((n, i) => { PAL[n] = LIST[i]; }); E.palette = PAL;
  const RGB = LIST.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]); const IDX = new Map();
  RGB.forEach((c, i) => IDX.set((c[0] << 16) | (c[1] << 8) | c[2], i));
  // 打光查表：按到灯的距离把一格颜色换成一档 / 两档更亮更暖的格子
  const LIT1 = [1, 2, 3, 4, 5, 6, 7, 22, 9, 21, 10, 12, 13, 14, 15, 21, 17, 18, 19, 20, 21, 21, 21, 22];
  const LIT2 = [2, 3, 4, 5, 6, 22, 22, 21, 21, 21, 10, 13, 14, 15, 21, 21, 18, 19, 20, 21, 21, 21, 21, 21];
  // ─────────────────────────────────────────────── 基础工具
  const R = Math.round; const S = { W: 320, H: 180, CFG: null, off: { x: 0, y: 0 }, lamp: { on: 0 }, cache: null }; function hash(s) {
    let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return h >>> 0;
  }
  function noise(key, i) { return hash(String(key) + ':' + (i | 0)) / 4294967296; }
  E.noise = noise; const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; const bt = (x, y) => (BAYER[((y | 0) & 3) * 4 + ((x | 0) & 3)] + 0.5) / 16;
  // Bayer 抖动取色：v 连续值，在 ramp[k] 和 ramp[k+1] 之间按格子阈值选一个
  function dith(ramp, v, x, y) {
    const f = Math.max(0, Math.min(ramp.length - 1.0001, v)); const k = Math.floor(f); return (f - k) > bt(x, y) ? ramp[k + 1] : ramp[k];
  }
  E.dither = dith;
  // 把装配页的变换压成整数平移；返回世界→屏幕的整数偏移
  function snap(g) {
    let m; try { m = g.getTransform(); } catch (e) { m = { e: 0, f: 0 }; }
    const ox = R(m.e || 0), oy = R(m.f || 0); g.setTransform(1, 0, 0, 1, ox, oy); lastC = null;
    SBW = g.canvas.width; SBH = g.canvas.height;     // 裁剪范围 = 当前画布（场景 320×180 / 设定图 1920×1080）
    return { x: ox, y: oy };
  }
  let lastC = null, SBW = 320, SBH = 180; function px(g, x, y, c) {
    const xi = R(x), yi = R(y); if (xi < 0 || yi < 0 || xi >= SBW || yi >= SBH) return; if (c !== lastC) { g.fillStyle = c; lastC = c; }
    g.fillRect(xi, yi, 1, 1);
  }
  function rect(g, x, y, w, h, c) {
    const xi = R(x), yi = R(y), wi = R(w), hi = R(h); if (wi <= 0 || hi <= 0 || xi >= SBW || yi >= SBH || xi + wi < 0 || yi + hi < 0) return;
    if (c !== lastC) { g.fillStyle = c; lastC = c; }
    g.fillRect(xi, yi, wi, hi);
  }
  function hline(g, x0, x1, y, c) { if (x1 < x0) { const t = x0; x0 = x1; x1 = t; } rect(g, x0, y, R(x1) - R(x0) + 1, 1, c); }
  function vline(g, x, y0, y1, c) { if (y1 < y0) { const t = y0; y0 = y1; y1 = t; } rect(g, x, y0, 1, R(y1) - R(y0) + 1, c); }
  function line(g, x0, y0, x1, y1, c) {
    x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1); let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy; for (let n = 0; n < 400; n++) {
      px(g, x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // 描 1px 外轮廓：先把深色底形往上下左右各扩 1px 画掉，再由调用方画本体
  function outline(g, x, y, w, h, c) {
    c = c || PAL.ink; rect(g, x - 1, y - 1, w + 2, h + 2, c);
  }
  // 扁椭圆（雪堆、影子、光池）——逐行矩形，不抗锯齿
  function blob(g, cx, cy, rw, rh, c, opt) {
    const o = opt || {}; for (let j = -rh; j <= rh; j++) {
      const t = j / rh; const half = R(rw * Math.sqrt(Math.max(0, 1 - t * t))); if (half <= 0) continue; if (o.dither && Math.abs(j) === rh) {
        for (let i = -half; i <= half; i++) if (bt(cx + i, cy + j) < 0.5) px(g, cx + i, cy + j, c);
      } else rect(g, cx - half, cy + j, half * 2 + 1, 1, c);
    }
  }
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v); const lerp = (a, b, u) => a + (b - a) * u;
  // ─────────────────────────────────────────────── 精灵（≥8 种）
  // 每种都是纯像素：先算一格格颜色再用 rect 铺，坐标全部取整。
  function sprTree(g, x, y, s) {
    const cx = R(x), by = R(y), h = Math.max(9, R(s)); const trunkH = Math.max(2, R(h * 0.15)); rect(g, cx, by - trunkH, 2, trunkH + 1, PAL.woodDark);
    px(g, cx, by - trunkH, PAL.wood); const tiers = 4, th = R(h * 0.30); for (let k = 0; k < tiers; k++) {
      const ty = by - trunkH - R(k * h * 0.165) - th; const hw = Math.max(2, R(h * (0.34 - k * 0.065))); for (let j = 0; j < th; j++) {
        const half = Math.max(1, R(hw * (j + 1) / th)); const yy = ty + j, snowLine = R(th * 0.34);
        let c = j < snowLine ? (j === 0 ? PAL.snowLit : dith([PAL.snow, PAL.snowLit], (j / snowLine) * 1.4, cx, yy))
          : dith([PAL.night1, PAL.night2], 0.4 + (j / th) * 1.2, cx + (j & 1), yy); rect(g, cx - half, yy, half * 2 + 1, 1, c);
        px(g, cx - half, yy, PAL.ink); px(g, cx + half, yy, PAL.ink);
      }
    }
    px(g, cx, by - h, PAL.snowLit); px(g, cx - 1, by - h + 1, PAL.snow); px(g, cx + 1, by - h + 1, PAL.snow);
  }
  function sprHouse(g, x, y, s, opt) {
    const o = opt || {}; const bx = R(x), by = R(y), h = Math.max(12, R(s)), w = Math.max(14, R(h * 1.5));
    const wallC = o.night === false ? PAL.night3 : PAL.night2; rect(g, bx, by - h, w, h, wallC); rect(g, bx + w - 3, by - h, 3, h, PAL.night1);                 // 右边背光一条
    for (let j = 3; j < h; j += 4) hline(g, bx, bx + w - 4, by - h + j, PAL.night1);   // 板壁缝
    // 屋顶：一个雪盖住的三角
    const rh = Math.max(4, R(h * 0.5)), rw = w + 6; for (let j = 0; j < rh; j++) {
      const half = R((rw / 2) * (j + 1) / rh), mid = bx + (w >> 1) - 1;
      const c = j === 0 ? PAL.snowLit : dith([PAL.snow, PAL.snowLit], (j / rh) * 1.7, mid + j, by - h - rh + j);
      for (let i = mid - half; i <= mid + half; i++) px(g, i, by - h - rh + j, i === mid - half || i === mid + half ? PAL.snowMid : c);
    }
    hline(g, bx - 3, bx + w + 2, by - h, PAL.ink);
    // 窗：暖黄，偶尔闪一下
    const wins = o.wins || [[3, 5], [w - 10, 5]]; wins.forEach(([wx, wy], wi) => {
      const lit = !(o.dark && wi === 1); rect(g, bx + wx - 1, by - h + wy - 1, 8, 8, PAL.ink); rect(g, bx + wx, by - h + wy, 6, 6, lit ? PAL.lampWarm : PAL.night1);
      if (lit) { hline(g, bx + wx, bx + wx + 1, by - h + wy + 4, PAL.amber); px(g, bx + wx + 3, by - h + wy, PAL.ink); px(g, bx + wx + 3, by - h + wy + 1, PAL.ink); }
      hline(g, bx + wx - 1, bx + wx + 6, by - h + wy + 6, PAL.snow);
    });
    // 门 + 墙根积雪
    const dw = 7, dx = bx + Math.max(2, (w >> 1) - 5); rect(g, dx, by - R(h * 0.5), dw, R(h * 0.5), PAL.woodDark);
    vline(g, dx + 1, by - R(h * 0.5) + 1, by - 1, PAL.wood); px(g, dx + dw - 2, by - 6, PAL.amber); for (let i = -2; i < w + 2; i++) {
      const hh = 1 + ((Math.sin((i + bx) * 0.9) > 0.1) ? 1 : 0); for (let j = 0; j < hh; j++) px(g, bx + i, by - j, j === hh - 1 ? PAL.snowLit : PAL.snow);
    }
  }
  function sprLamp(g, x, y, s, on) {
    const cx = R(x), by = R(y), h = Math.max(20, R(s)); const top = by - h;
    // 杆：3px 宽（左墨、中亮、右深）
    rect(g, cx - 1, top + 12, 3, h - 12, PAL.ink); rect(g, cx, top + 13, 1, h - 14, on ? PAL.skyline : PAL.night3);
    // 底座台阶
    rect(g, cx - 4, by - 3, 9, 3, PAL.ink); rect(g, cx - 3, by - 4, 7, 2, PAL.night3); rect(g, cx - 2, by - 6, 5, 2, PAL.night3);
    // 灯头：灯笼形
    const hx = cx - 6, hy = top; rect(g, hx - 1, hy - 1, 15, 18, PAL.ink); rect(g, hx, hy, 13, 16, on ? PAL.amber : PAL.night2);
    rect(g, hx + 2, hy + 2, 9, 12, on ? PAL.lampWarm : PAL.night3); if (on) {
      rect(g, hx + 4, hy + 4, 5, 8, PAL.lampCore); px(g, hx + 6, hy - 2, PAL.lampCore); hline(g, hx - 3, hx + 15, hy + 1, PAL.ink);
      hline(g, hx - 2, hx + 14, hy + 2, PAL.amber);
    }
    // 顶帽 + 铁饰
    rect(g, cx - 2, hy - 3, 5, 3, PAL.ink); rect(g, cx - 1, hy - 4, 3, 1, on ? PAL.lampCore : PAL.skyline);
    // 灯头积雪
    hline(g, hx - 1, hx + 13, hy - 5, PAL.snowLit); hline(g, hx + 1, hx + 11, hy - 6, PAL.snow);
    // 底座积雪
    for (let i = -6; i <= 6; i++) { const hh = 1 + (Math.abs(i) < 4 ? 1 : 0); for (let j = 0; j < hh; j++) px(g, cx + i, by - j, j === hh - 1 ? PAL.snowLit : PAL.snow); }
  }
  function sprStar(g, x, y, s, tw) {
    const cx = R(x), cy = R(y), n = Math.max(0, R(s)); const c = tw ? PAL.white : PAL.snowLit; px(g, cx, cy, c);
    if (n >= 1) { px(g, cx - 1, cy, PAL.snowMid); px(g, cx + 1, cy, PAL.snowMid); px(g, cx, cy - 1, PAL.snowMid); px(g, cx, cy + 1, PAL.snowMid); }
    if (n >= 2) { px(g, cx - 2, cy, PAL.skyline); px(g, cx + 2, cy, PAL.skyline); px(g, cx, cy - 2, PAL.skyline); px(g, cx, cy + 2, PAL.skyline); }
  }
  function sprCloud(g, x, y, s) {
    const cx = R(x), cy = R(y), w = Math.max(8, R(s)); const rows = [[0.5, 0], [0.8, -1], [1, -2], [0.8, -3]]; rows.forEach(([f, dy], k) => {
      const half = R(w * f / 2); rect(g, cx - half, cy + dy, half * 2, 1, k === 0 ? PAL.night3 : PAL.night2);
      if (k < 2) hline(g, cx - half + 1, cx + half - 1, cy + dy, PAL.night3);
    });
  }
  function sprFence(g, x, y, s) {
    const cx = R(x), by = R(y), w = Math.max(10, R(s)), h = Math.max(5, R(w * 0.35)); for (let i = 0; i <= w; i += 4) {
      rect(g, cx + i, by - h, 1, h, PAL.woodDark); px(g, cx + i, by - h - 1, PAL.snowLit);
    }
    hline(g, cx, cx + w, by - h + 1, PAL.wood); hline(g, cx, cx + w, by - R(h * 0.55), PAL.woodDark); hline(g, cx, cx + w, by - h - 1, PAL.snow);
    for (let i = 0; i <= w; i += 4) { px(g, cx + i, by - h - 2, PAL.snow); }
  }
  function sprBush(g, x, y, s) {
    const cx = R(x), by = R(y), w = Math.max(5, R(s)); for (let j = 0; j < R(w * 0.6); j++) {
      const f = j / Math.max(1, R(w * 0.6)); const half = R((w / 2) * Math.sqrt(1 - f * f * 0.9));
      for (let i = -half; i <= half; i++) px(g, cx + i, by - j, j === 0 ? PAL.night2 : dith([PAL.night1, PAL.night2], 0.6 + f, cx + i, by - j));
    }
    for (let i = -R(w / 3); i <= R(w / 3); i++) if (Math.sin(i * 1.7) > -0.2) px(g, cx + i, by - R(w * 0.6), PAL.snowLit);
  }
  function sprSign(g, x, y, s) {
    const cx = R(x), by = R(y), h = Math.max(10, R(s)); rect(g, cx, by - h, 2, h, PAL.woodDark);
    const bw = Math.max(8, R(h * 0.7)), bh = Math.max(4, R(h * 0.34)); rect(g, cx - bw / 2 - 1, by - h - 1, bw + 2, bh + 2, PAL.ink);
    rect(g, cx - bw / 2, by - h, bw, bh, PAL.wood); for (let i = 1; i < bw - 1; i += 3) vline(g, cx - bw / 2 + i, by - h + 1, by - h + bh - 2, PAL.woodDark);
    hline(g, cx - bw / 2, cx + bw / 2, by - h - 2, PAL.snowLit);
  }
  const SPRITES = { tree: sprTree, house: sprHouse, lamp: sprLamp, star: sprStar, cloud: sprCloud, fence: sprFence, bush: sprBush, sign: sprSign };
  E.sprite = function (g, spec) {
    g.save(); snap(g); const f = SPRITES[spec.kind] || sprTree; f(g, spec.x, spec.y, spec.size == null ? 20 : spec.size, spec); g.restore();
  }; E.spriteKinds = Object.keys(SPRITES);
  // 内部用（已经 snap 过）
  function spr(kind, g, x, y, s, opt) { (SPRITES[kind] || sprTree)(g, x, y, s, opt); }
  // ─────────────────────────────────────────────── piece：一块主体
  E.piece = function (g, spec) {
    g.save(); snap(g); const x = R(spec.x), y = R(spec.y); const w = Math.max(1, R(spec.w == null ? 8 : spec.w));
    const h = Math.max(1, R(spec.h == null ? 8 : spec.h)); const c = spec.color || PAL.night2; if (spec.shadow) {
      const sx = spec.shadow === true ? 2 : R(spec.shadow); blob(g, x + (w >> 1), y + h + 1, (w >> 1) + sx, 2, PAL.night1, { dither: true });
    }
    if (spec.pts && spec.pts.length > 1) {                       // 折线（绳、栅栏、枝）
      for (let i = 1; i < spec.pts.length; i++) line(g, spec.pts[i - 1][0], spec.pts[i - 1][1], spec.pts[i][0], spec.pts[i][1], c); g.restore(); return;
    }
    rect(g, x - 1, y - 1, w + 2, h + 2, PAL.ink);                 // 1px 深色轮廓
    rect(g, x, y, w, h, c); hline(g, x, x + w - 1, y, spec.top || PAL.night3);            // 上沿受光
    hline(g, x, x + w - 1, y + h - 1, spec.bottom || PAL.night1);  // 下沿阴影
    g.restore();
  }; const _piece = E.piece; function piece(g, spec) { _piece(g, spec); }
  // ─────────────────────────────────────────────── sky / ground
  E.sky = function (g, spec) {
    g.save(); const ramp = spec.colors && spec.colors.length > 1 ? spec.colors : [PAL.ink, PAL.night0, PAL.night1, PAL.night2];
    const y1 = spec.y1 == null ? R(S.H * 0.6) : spec.y1; for (let y = 0; y < y1; y++) {
      const v = Math.pow(y / Math.max(1, y1), 1.25) * (ramp.length - 1.02) * 1.12; for (let x = 0; x < S.W; x++) px(g, x, y, dith(ramp, v, x, y));
    }
    g.restore();
  }; E.ground = function (g, spec) {
    g.save(); const off = snap(g); const y0 = spec.y == null ? R(S.H * 0.6) : R(spec.y); const kind = spec.kind || 'snow';
    const c1 = spec.color || PAL.snowMid, c2 = spec.color2 || PAL.snow;
    const ramp = kind === 'street' ? [PAL.night2, PAL.night3, PAL.night2] : [PAL.snowFar, c1, c2, PAL.snowLit]; for (let y = y0; y < S.H; y++) {
      const v = 0.4 + Math.pow((y - y0) / Math.max(1, S.H - y0), 0.85) * (ramp.length - 1.0);
      for (let x = 0; x < S.W; x++) px(g, x, y, dith(ramp, Math.min(ramp.length - 1.02, v), x + off.x, y));
    }
    hline(g, 0, S.W - 1, y0, PAL.snowMid); g.restore();
  };
  // ─────────────────────────────────────────────── 光
  E.glow = function (g, spec) {
    g.save(); snap(g); const cx = R(spec.x), cy = R(spec.y), r = Math.max(2, R(spec.r || 18));
    const c1 = spec.color || PAL.lampWarm, c2 = spec.core || PAL.lampCore; const st = spec.strength == null ? 1 : spec.strength;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const d = Math.sqrt(i * i + j * j) / r; if (d > 1.25) continue;
      const wob = (noise('glow', Math.round((Math.atan2(j, i) + 3.15) * 9)) - 0.5) * 0.30;
      const v = (1 - d) * st + wob; if (v <= 0.02) continue; const wx = cx + i, wy = cy + j;
      if (v > 0.74) px(g, wx, wy, c2);
      else if (v > 0.38) { if (bt(wx, wy) < (v - 0.38) / 0.36) px(g, wx, wy, c2); else px(g, wx, wy, c1); }
      else if (bt(wx, wy) < v * 2.7) px(g, wx, wy, c1);
    }
    g.restore();
  };
  // ─────────────────────────────────────────────── 一直在动的东西
  E.fx = function (g, spec, t) {
    g.save(); snap(g); const kind = spec.kind || 'snow'; const tt = t || 0, pf = Math.floor(tt * 12 + 1e-6);
    if (kind === 'snow' || kind === 'rain' || kind === 'petal' || kind === 'dust') {
      const n = Math.max(1, spec.n || 60), key = spec.key || kind; const front = kind === 'snow' ? (spec.front ? 1 : 0) : 1;
      const vy = kind === 'rain' ? 70 : kind === 'dust' ? 2 : (front ? 24 : 13); const vx = kind === 'rain' ? -6 : kind === 'petal' ? -3 : -1.4;
      const cols = kind === 'petal' ? [PAL.crabLite, PAL.amber, PAL.crabBelly]
        : kind === 'dust' ? [PAL.skyline, PAL.snowMid] : front ? [PAL.white, PAL.snowLit] : [PAL.snowMid, PAL.snowFar]; for (let i = 0; i < n; i++) {
        const sp = (0.55 + noise(key + 's', i) * 0.9) * (spec.speed || 1); const y0 = noise(key + 'y', i) * (S.H + 24);
        const py = ((((y0 + vy * sp * pf / 12) % (S.H + 24)) + S.H + 24) % (S.H + 24)) - 12; const amp = 1 + noise(key + 'a', i) * (front ? 3.4 : 2);
        const ph = noise(key + 'p', i) * 6.283; let x0 = noise(key + 'x', i) * (S.W + 40) + vx * sp * pf / 12 + amp * Math.sin(pf * 0.30 + ph);
        x0 = ((x0 % (S.W + 40)) + S.W + 40) % (S.W + 40) - 20; const big = noise(key + 'b', i) > (front ? 0.62 : 0.85); const c = cols[big ? 0 : 1]; px(g, x0, py, c);
        if (big) { px(g, x0 + 1, py, cols[1]); px(g, x0, py + 1, cols[1]); }
      }
    } else if (kind === 'sparkle') {
      const n = Math.max(1, spec.n || 24); for (let i = 0; i < n; i++) {
        if (noise(spec.key || 'spk', i + pf * 7) < 0.55) continue; const x0 = noise((spec.key || 'spk') + 'x', i) * S.W, y0 = noise((spec.key || 'spk') + 'y', i) * S.H;
        sprStar(g, x0, y0, 1, pf % 3 === 0);
      }
    } else if (kind === 'light-ray') {
      const x = spec.x == null ? S.W * 0.3 : spec.x, y = spec.y == null ? S.H * 0.2 : spec.y; const len = spec.len || 60, w = spec.w || 14;
      for (let i = 0; i < len; i++) {
        const half = R(w * (1 - i / len) * 0.5); for (let k = -half; k <= half; k++) {
          const xx = R(x + k + i * 0.5), yy = R(y + i); if (bt(xx, yy + (pf >> 1)) < 0.36) px(g, xx, yy, PAL.lampWarm);
        }
      }
    } else if (kind === 'smoke') {
      const bx = spec.x, by = spec.y, n = spec.n || 5; for (let k = 0; k < n; k++) {
        const age = ((pf / 12 * 0.9) + k * 0.25) % 1; const sx = bx + Math.sin(age * 5 + k) * 2 + age * 5; const sy = by - age * 18;
        const c = age < 0.4 ? PAL.snowMid : PAL.skyline;
        if (age < 0.25) rect(g, sx, sy, 2, 2, c); else { hline(g, sx - 1, sx + 1, sy + 1, c); vline(g, sx, sy, sy + 2, c); }
      }
    }
    g.restore();
  };
  // ─────────────────────────────────────────────── 字（小画布上的像素字）
  const GLY = new Map(); function glyph(ch, size, weight) {
    const key = size + '|' + weight + '|' + ch; let gl = GLY.get(key); if (gl) return gl; const box = Math.max(8, size * 2 + 4);
    const c = document.createElement('canvas'); c.width = box; c.height = box; const x = c.getContext('2d', { willReadFrequently: true });
    x.font = (weight || 700) + ' ' + size + 'px "PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif';
    x.textBaseline = 'top'; x.fillStyle = '#fff'; x.fillText(ch, 2, 1); const d = x.getImageData(0, 0, box, box).data, bits = [];
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9; for (let y = 0; y < box; y++) for (let xx = 0; xx < box; xx++) {
      if (d[(y * box + xx) * 4 + 3] > 127) {
        bits.push(xx - 2, y - 1); if (xx < minx) minx = xx; if (xx > maxx) maxx = xx; if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
    }
    gl = { bits: bits, adv: Math.max(2, R(x.measureText(ch).width)), w: maxx - minx + 1, h: maxy - miny + 1 }; GLY.set(key, gl); return gl;
  }
  function drawBits(g, x0, y0, gl, c) {
    const b = gl.bits; if (!b.length) return; if (c !== lastC) { g.fillStyle = c; lastC = c; }
    for (let i = 0; i < b.length; i += 2) {
      const xx = x0 + b[i], yy = y0 + b[i + 1]; if (xx < 0 || yy < 0 || xx >= g.canvas.width || yy >= g.canvas.height) continue; g.fillRect(xx, yy, 1, 1);
    }
  }
  E.text = function (g, s, spec) {
    spec = spec || {}; g.save(); snap(g); const size = Math.max(4, R(spec.size || 10)), weight = spec.weight || 700;
    const chars = String(s == null ? '' : s).split(''); const gs = chars.map((ch) => glyph(ch, size, weight)); let total = 0;
    for (let i = 0; i < gs.length; i++) total += gs[i].adv;
    let cx = spec.align === 'center' ? R(spec.x - total / 2) : spec.align === 'right' ? R(spec.x - total) : R(spec.x); const y0 = R(spec.y);
    if (spec.ink) for (let i = 0; i < gs.length; i++) drawBits(g, cx, y0, gs[i], spec.ink), cx += gs[i].adv;
    cx = spec.align === 'center' ? R(spec.x - total / 2) : spec.align === 'right' ? R(spec.x - total) : R(spec.x);
    const col = spec.color || PAL.snowLit; for (let i = 0; i < gs.length; i++) { drawBits(g, cx, y0, gs[i], col); cx += gs[i].adv; }
    g.restore(); return total;
  }; E.textWidth = function (s, size, weight) {
    let t = 0; const cs = String(s).split(''); for (let i = 0; i < cs.length; i++) t += glyph(cs[i], Math.max(4, R(size || 10)), weight || 700).adv; return t;
  };
  // ─────────────────────────────────────────────── 框（对话框 / 纸条 / 名牌）
  function frameBox(g, x, y, w, h, fill) {
    x = R(x); y = R(y); w = R(w); h = R(h); rect(g, x, y, w, h, PAL.ink);                       // 外墨线
    rect(g, x + 1, y + 1, w - 2, h - 2, PAL.snow);      // 米白里衬
    rect(g, x + 2, y + 2, w - 4, h - 4, PAL.ink);       // 内墨线（双层边框）
    rect(g, x + 3, y + 3, w - 6, h - 6, fill || PAL.night1);
    // 内层高光：顶部一条亮蓝，做出凹陷感
    hline(g, x + 4, x + w - 5, y + 3, PAL.night3); hline(g, x + 4, x + w - 5, y + h - 4, PAL.ink);
  }
  E.frame = function (g, spec) {
    g.save(); snap(g); const kind = spec.kind || 'box'; const x = spec.x == null ? 8 : spec.x, y = spec.y == null ? 8 : spec.y; if (kind === 'dialog' || kind === 'box') {
      frameBox(g, x, y, spec.w || S.W - 16, spec.h || 40, spec.color || PAL.night1);
    } else if (kind === 'plate') {
      rect(g, x, y, spec.w || 40, spec.h || 12, PAL.ink); rect(g, x + 1, y + 1, (spec.w || 40) - 2, (spec.h || 12) - 2, PAL.night2);
      hline(g, x + 2, x + (spec.w || 40) - 3, y + 1, PAL.night3);
    } else if (kind === 'hud') {
      rect(g, x, y, spec.w || 20, spec.h || 6, PAL.ink); rect(g, x + 1, y + 1, (spec.w || 20) - 2, (spec.h || 6) - 2, PAL.crabDark);
    }
    g.restore();
  };
  // ─────────────────────────────────────────────── 灯光：整屏按距离提亮
  function lightIdx(wx, wy) {
    const L = S.lamp; if (!L || !L.on) return 0; const str = L.str || 1; const dx = wx - L.x, dy = wy - L.y; let I = 0;
    const d = Math.sqrt(dx * dx + dy * dy * 1.15); I = Math.max(I, 2.15 * (1 - d / (20 * str)));                 // 灯头四周
    if (wy > L.y + 3) {                                            // 往下的光锥（起点就宽，越往下越宽）
      const fr = (wy - L.y - 3) / Math.max(1, L.gy - L.y - 3); const wdt = 13 + fr * 30 * str; I = Math.max(I, (1 - Math.abs(dx) / wdt) * (0.34 + 0.30 * fr));
    }
    if (wy > L.gy - 26) {                                          // 雪地上的光池
      const e = (dx / (62 * str)) ** 2 + ((wy - L.gy) / (17 * str)) ** 2; I = Math.max(I, 2.3 * (1 - e));
    }
    return Math.min(2, Math.floor(I + bt(wx + S.off.x, wy + S.off.y)));
  }
  E.lightAt = function (wx, wy) { return lightIdx(wx, wy); }; function lightPass(g) {
    if (!S.lamp.on) return; const w = S.W, h = S.H; const img = g.getImageData(0, 0, w, h), d = img.data; for (let sy = 0; sy < h; sy++) {
      const wy = sy - S.off.y; for (let sx = 0; sx < w; sx++) {
        const lv = lightIdx(sx - S.off.x, wy); if (!lv) continue; const i = (sy * w + sx) << 2; const id = IDX.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
        if (id === undefined) continue; const c = RGB[(lv === 2 ? LIT2 : LIT1)[id]]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      }
    }
    g.putImageData(img, 0, 0);
  }
  // ─────────────────────────────────────────────── 角色
  E.char = function (g, o) {
    const CH = window.CHARACTER; if (!CH || !CH.draw) return; g.save(); const off = snap(g); const s = o.size || S.H * 0.24;
    const lv = Math.max(lightIdx(o.x - s * 0.42, o.y - s * 0.5), lightIdx(o.x + s * 0.06, o.y - s * 0.5));
    // 影子：灯照不到的冷蓝，边上抖动
    const sw = Math.max(3, R(s * 0.40)); for (let i = -sw; i <= sw; i++) {
      const e = (i * i) / (sw * sw); if (e > 1) continue; const c = lv > 0 ? PAL.night2 : PAL.night1; if (e > 0.45 && bt(o.x + i + off.x, o.y) < 0.5) continue;
      px(g, o.x + i, o.y + 1, c); if (e < 0.55) px(g, o.x + i, o.y + 2, PAL.night1);
    }
    CH.draw(g, { x: R(o.x), y: R(o.y), size: R(s), facing: o.facing || 'front', expression: o.expression || 'neutral',
      action: o.action || 'stand', u: o.u || 0, t: o.t || 0, hold: o.hold, lit: lv }); g.restore();
  };
  // ─────────────────────────────────────────────── 背景：雪夜街角
  // shot.bg = { kind:'night-street', lamp:{x,y,base,on,strength}, moon:true, snow:60 }
  function drawStreet(g, cam, t, sp, cache) {
    const W = S.W, H = S.H, HZ = R(H * 0.59), pf = Math.floor(t * 12 + 1e-6); const dx = cam.x - W / 2, dy = cam.y - H / 2;
    const lay = (k, fn) => { g.save(); g.translate(R(-dx * (1 - k)), R(-dy * (1 - k))); fn(); g.restore(); };
    // 天空：贴屏幕（远到不动）
    if (cache) g.drawImage(cache.sky, -S.off.x, -S.off.y); else E.sky(g, { y1: HZ + 8 });
    // 星星（12fps 闪） + 月牙
    lay(0.15, () => {
      for (let i = 0; i < 86; i++) {
        const sx = R(noise('star-x', i) * W); const sy = R(Math.pow(noise('star-y', i), 1.3) * HZ * 0.82) + 2; if (sx > W * 0.80 && sy < H * 0.22) continue;
        const per = 6 + Math.floor(noise('star-p', i) * 14), ph = Math.floor(noise('star-ph', i) * per);
        const on = ((pf + ph) % per) < Math.max(2, per * 0.6), tw = ((pf + ph) % per) === 0; const kd = noise('star-k', i);
        sprStar(g, sx, sy, kd < 0.72 ? 0 : kd < 0.92 ? 1 : 2, tw || (kd >= 0.92 && on));
      }
      const mx = R(W * 0.845), my = R(H * 0.135), mr = Math.max(4, R(H * 0.042)); for (let j = -mr - 1; j <= mr + 1; j++) for (let i = -mr - 1; i <= mr + 1; i++) {
        const a = i * i + j * j, b = (i - mr * 0.5) ** 2 + (j + mr * 0.24) ** 2;
        if (a <= mr * mr && b > (mr - 2.2) ** 2) px(g, mx + i, my + j, a > (mr - 1.4) ** 2 ? PAL.snowMid : PAL.snowLit);
      }
    });
    // 远山（视差 0.25）
    lay(0.25, () => {
      for (let x = -10; x < W + 10; x++) {
        const h1 = R(HZ - H * 0.055 + 4 * Math.sin(x * 0.021 + 1.3) + 2 * Math.sin(x * 0.057)); for (let y = h1; y < HZ + 12; y++) {
          const d = y - h1; px(g, x, y, y === h1 ? PAL.skyline : d < 3 ? dith([PAL.skyline, PAL.night3], (d / 3) * 1.4, x, y) : PAL.night3);
        }
        const h2 = R(HZ - H * 0.02 + 3 * Math.sin(x * 0.034 + 4.1) + 2 * Math.sin(x * 0.09 + 2));
        for (let y = h2; y < HZ + 12; y++) px(g, x, y, y === h2 ? PAL.snowFar : PAL.night2);
      }
      for (let i = 0; i < 12; i++) {                       // 远处小松树剪影
        const tx = R(noise('ftree', i) * (W + 30)) - 10, tb = R(HZ + 2), th = 5 + Math.floor(noise('ftreeh', i) * 5);
        for (let j = 0; j < th; j++) { const half = Math.floor(j / 2); hline(g, tx - half, tx + half, tb - th + j, PAL.night1); }
        px(g, tx, tb - th, PAL.snowFar);
      }
    });
    // 房子 + 树（视差 0.5）
    lay(0.5, () => {
      const base = HZ + 2; spr('house', g, R(W * 0.10), base, R(H * 0.19), { wins: [[3, 4], [14, 4]] });
      spr('house', g, R(W * 0.62), base, R(H * 0.15), { wins: [[4, 5]], dark: true }); spr('tree', g, R(W * 0.30), base + 2, R(H * 0.30));
      spr('tree', g, R(W * 0.90), base + 2, R(H * 0.24)); spr('bush', g, R(W * 0.46), base + 1, R(W * 0.05));
    });
    // 雪地（视差 1.0）
    if (cache) g.drawImage(cache.ground, -48, HZ - 1);
    else E.ground(g, { y: HZ, kind: 'snow' });
    // 雪面缓坡
    for (let i = 0; i < 14; i++) {
      const wx = R(noise('ridge-x', i) * (W + 60)) - 30, wy = HZ + 7 + R(noise('ridge-y', i) * (H * 0.30)); const len = 12 + R(noise('ridge-l', i) * 20);
      for (let k = 0; k < len; k++) {
        const yy = wy - R(Math.sin((k / len) * Math.PI) * 2); px(g, wx + k, yy, PAL.snowLit); if (k > 1 && k < len - 2) px(g, wx + k, yy + 1, PAL.snowMid);
      }
    }
    // 前景雪堆
    snowMound(g, R(W * 0.03), H + 6, R(W * 0.20), R(H * 0.09)); snowMound(g, R(W * 0.94), H + 8, R(W * 0.22), R(H * 0.11));
    // 灯座旁的长椅
    bench(g, R(W * 0.70), R(H * 0.775), R(W * 0.12));
  }
  function snowMound(g, cx, by, w, h) {
    for (let j = 0; j < h; j++) {
      const f = j / h, half = R((w / 2) * Math.sqrt(Math.max(0, 1 - f * f))); if (half <= 0) continue; for (let i = -half; i <= half; i++) {
        const top = j === h - 1 || Math.abs(i) === half;
        px(g, cx + i, by - j, top ? PAL.snowLit : dith([PAL.snowMid, PAL.snow, PAL.snowLit], 1.7 - (i + half) / (2 * half + 1) * 1.4 + f * 0.5, cx + i, by - j));
      }
    }
  }
  function bench(g, x, y, ww) {
    const w = R(ww || S.W * 0.17); for (const lx of [2, w - 4]) vline(g, x + lx, y - 10, y, PAL.ink); rect(g, x, y - 13, w, 3, PAL.woodDark);
    hline(g, x, x + w - 1, y - 13, PAL.wood); for (const yy of [y - 10, y - 7]) { hline(g, x, x + w - 1, yy, PAL.ink); hline(g, x, x + w - 1, yy - 1, PAL.wood); }
    hline(g, x, x + w - 1, y - 14, PAL.snowLit); for (let i = 0; i < w; i++) if (Math.sin(i * 0.8) > 0.3) px(g, x + i, y - 15, PAL.snow);
  }
  E.bg = function (g, shot, t, u, cam, CFG) {
    if (CFG) { S.CFG = CFG; S.W = CFG.W; S.H = CFG.H; }
    const sp = (shot && shot.bg) || {}; const H = S.H, W = S.W; const lampO = sp.lamp || {}; const lampX = lampO.x == null ? R(W * 0.26) : R(lampO.x);
    const lampBase = lampO.base == null ? R(H * 0.845) : R(lampO.base); const rodH = Math.max(20, R(H * 0.51)); const lampTop = lampBase - rodH;
    S.lamp = { x: lampX, y: lampTop + R(H * 0.062), gy: lampBase, on: lampO.on == null ? 0 : lampO.on, str: lampO.strength || 1 };
    cam = cam || { x: W / 2, y: H / 2, zoom: 1 }; g.save(); const off = snap(g); S.off = off; drawStreet(g, cam, t || 0, sp, S.cache);
    lightPass(g);                                        // 打光：换色 + 抖动
    // 灯：光晕在灯芯后面，灯头最后画（保持清晰）
    if (S.lamp.on) {
      E.glow(g, { x: lampX, y: S.lamp.y, r: R(15 * (S.lamp.str || 1)), strength: 1.05 });
      // 光池里一闪一闪的亮点
      const pf = Math.floor((t || 0) * 12 + 1e-6); for (let i = 0; i < 22; i++) {
        const a = noise('glint-a', i) * 6.283, rr = Math.sqrt(noise('glint-r', i)) * 0.88; const gx = R(lampX + Math.cos(a) * rr * 62 * (S.lamp.str || 1));
        const gy = R(lampBase + Math.sin(a) * rr * 16 * (S.lamp.str || 1)); if (noise('glint', i + pf * 5) < 0.35) px(g, gx, gy, PAL.lampCore);
      }
    }
    sprLamp(g, lampX, lampBase, rodH, !!S.lamp.on); g.restore();
  }; E.sceneLamp = function () { return S.lamp; };
  // ─────────────────────────────────────────────── endFrame：扫描线 / 暗角 / 颗粒
  E.endFrame = function (g, t, CFG) {
    const W = g.canvas.width, H = g.canvas.height; g.save(); g.fillStyle = 'rgba(0,0,0,0.06)'; for (let y = 1; y < H; y += 3) g.fillRect(0, y, W, 1);      // 每 3 行一条扫描线
    g.restore(); if (S.vig) { g.drawImage(S.vig, 0, 0, W, H); }               // 四角暗角（≤0.12）
    if (S.grain) {
      if (!S.grainPat) S.grainPat = g.createPattern(S.grain, 'repeat'); g.save(); g.fillStyle = S.grainPat; g.fillRect(0, 0, W, H); g.restore();   // 颗粒（≤0.05）
    }
  };
  // ─────────────────────────────────────────────── 歌词：像素游戏对话框（大画布）
  E.lyric = function (g, line, CFG) {
    const W = g.canvas.width, H = g.canvas.height, L = (CFG && CFG.LYRIC) || {}; const fs = Math.min(56, R(L.size || 56));
    const cx = W / 2, cy = H * (L.bottom || 0.90); const text = String(line.text || '');
    const font = '700 ' + fs + 'px "PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif'; g.save(); g.font = font;
    const tw = g.measureText(text).width; const bh = R(fs * 1.5), bw = Math.min(R(W * 0.90), R(Math.max(fs * 7, tw + fs * 2.4)));
    const bx = R(cx - bw / 2), by = R(cy - bh / 2);
    // 双层边框：墨 → 米白 → 墨 → 深紫底
    g.fillStyle = PAL.ink; g.fillRect(bx, by, bw, bh); g.fillStyle = PAL.snow; g.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
    g.fillStyle = PAL.ink; g.fillRect(bx + 7, by + 7, bw - 14, bh - 14); g.fillStyle = PAL.night1; g.fillRect(bx + 9, by + 9, bw - 18, bh - 18);
    g.fillStyle = PAL.night3; g.fillRect(bx + 10, by + 10, bw - 20, 2);   // 内衬上沿的一点光
    // 名字牌
    const nw = R(fs * 2.0), nh = R(fs * 0.66), nx = bx + R(fs * 0.5), ny = by - R(nh * 0.55); g.fillStyle = PAL.ink; g.fillRect(nx, ny, nw, nh);
    g.fillStyle = PAL.snow; g.fillRect(nx + 3, ny + 3, nw - 6, nh - 6); g.fillStyle = PAL.night2; g.fillRect(nx + 5, ny + 5, nw - 10, nh - 10);
    g.font = '700 ' + R(fs * 0.46) + 'px "PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = PAL.lampWarm; g.fillText('阿蟹', nx + nw / 2, ny + nh / 2 + 1);
    // 歌词：打字机 + 硬描边（3px，lineJoin round，不用 shadowBlur）
    const p = Math.max(0, Math.min(1, (line.p - 0.04) / 0.55)); const n = Math.max(1, Math.ceil(text.length * p)); const shown = text.slice(0, n);
    g.font = font; g.textAlign = 'left'; const tx = R(cx - tw / 2), ty = R(cy + 1);
    g.lineWidth = 6; g.strokeStyle = PAL.ink; g.lineJoin = 'round'; g.miterLimit = 2; g.strokeText(shown, tx, ty); g.fillStyle = PAL.lampCore; g.fillText(shown, tx, ty);
    // 打完了：右下角 ▼ 闪
    if (n >= text.length) {
      const ax = bx + bw - R(fs * 1.1), ay = by + bh - R(fs * 0.5); const on = (Math.floor(line.t * 4) % 2) === 0;
      if (on) { g.fillStyle = PAL.lampWarm; g.fillRect(ax, ay, R(fs * 0.42), 5); g.fillRect(ax + 3, ay + 5, R(fs * 0.42) - 6, 5); g.fillRect(ax + 7, ay + 10, R(fs * 0.42) - 14, 4); }
    }
    g.restore();
  };
  // ─────────────────────────────────────────────── setup：把静态的东西烘到离屏
  function makeVig() {
    const w = 480, h = 270, c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const nx = (i / w - 0.5) * 2, ny = (j / h - 0.5) * 2; const r = Math.sqrt(nx * nx * 0.85 + ny * ny * 1.15) / 1.12;
      let a = Math.max(0, (r - 0.52) / 0.48); a = a * a * 0.12;      // 四角 ≤ 0.12
      const k = (j * w + i) << 2; d[k] = 8; d[k + 1] = 8; d[k + 2] = 20; d[k + 3] = R(a * 255);
    }
    x.putImageData(img, 0, 0); return c;
  }
  function makeGrain() {
    const w = 320, h = 320, c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data; let s = 0x2f6e2b1 ^ 20250101; for (let i = 0; i < w * h; i++) {
      s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0; const v = (s >>> 9) & 255, k = i << 2; d[k] = d[k + 1] = d[k + 2] = v > 128 ? 255 : 0;
      d[k + 3] = Math.floor((v / 255) * 13);                          // 颗粒 ≤ 0.05
    }
    x.putImageData(img, 0, 0); return c;
  }
  function buildScene() {
    const W = S.W, H = S.H, HZ = R(H * 0.59), skyH = HZ + 14; const sc = document.createElement('canvas'); sc.width = W; sc.height = skyH;
    const sg = sc.getContext('2d'); SBW = W; SBH = skyH; lastC = null; const sramp = [PAL.ink, PAL.night0, PAL.night1, PAL.night2, PAL.night3];
    for (let y = 0; y < skyH; y++) {
      const v = Math.min(3.95, Math.pow(Math.min(1, y / HZ), 1.35) * 3.9); for (let x = 0; x < W; x++) px(sg, x, y, dith(sramp, v, x, y));
    }
    const gh0 = H - HZ + 2, gw = W + 96, gh = gh0 + 30;     // 多画 30 行：镜头往下摇时底边不露黑
    const gc = document.createElement('canvas'); gc.width = gw; gc.height = gh;
    const gg = gc.getContext('2d'); SBW = gw; SBH = gh; lastC = null; const gramp = [PAL.snowMid, PAL.snow, PAL.snowLit]; for (let y = 0; y < gh; y++) {
      const base = 0.12 + Math.pow(Math.min(1, y / gh0), 0.8) * 2.05; for (let x = 0; x < gw; x++) {
        const wx = x - 48, wv = Math.sin(wx * 0.055) * 0.26 + Math.sin(wx * 0.017 + 1.3) * 0.36 + Math.sin(wx * 0.13) * 0.10;
        px(gg, x, y, dith(gramp, Math.max(0, Math.min(2.95, base + wv * 0.62)), wx, y + HZ - 1));
      }
    }
    S.cache = { sky: sc, ground: gc };
  }
  E.setup = function (CFG) {
    if (CFG) S.CFG = CFG; if (S.CFG) { S.W = S.CFG.W || 320; S.H = S.CFG.H || 180; }
    S.vig = makeVig(); S.grain = makeGrain(); S.grainPat = null; S.cache = null; if (S.CFG && S.CFG.OUT) buildScene();
  };
  // ─────────────────────────────────────────────── 设定图（1920×1080 输出画布）
  E.sheet = function (g, CFG, API) {
    const W = g.canvas.width, H = g.canvas.height; const CH = window.CHARACTER || { name: '角色', desc: '', EXPRESSIONS: ['neutral'], ACTIONS: ['stand'] };
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; SBW = W; SBH = H; lastC = null;
    rect(g, 0, 0, W, H, PAL.night0);                                  // 底：夜蓝
    for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) if (bt(x, y) < 0.5) rect(g, x, y, 8, 8, PAL.ink);
    rect(g, 0, 0, W, 4, PAL.ink); rect(g, 0, H - 4, W, 4, PAL.ink); rect(g, 0, 0, 4, H, PAL.ink); rect(g, W - 4, 0, 4, H, PAL.ink);
    hline(g, 12, W - 13, 10, PAL.night3); hline(g, 12, W - 13, H - 11, PAL.night3); function crab(cx, cy, cw, ch, o) {
      const kk = Math.max(1, Math.round(o.size / 19)); const LW = 30 * kk, LH = 19 * kk;            // 角色虚拟格子 30×19
      const oc = document.createElement('canvas'); oc.width = LW; oc.height = LH; const x = oc.getContext('2d'); x.imageSmoothingEnabled = false;
      SBW = LW; SBH = LH; lastC = null; o.lit = 1; o.x = LW / 2; o.y = LH; CH.draw(x, o); SBW = W; SBH = H; lastC = null;
      const k = Math.max(1, Math.floor(Math.min(cw / LW, ch / LH))); g.imageSmoothingEnabled = false;
      g.drawImage(oc, R(cx - LW * k / 2), R(cy - LH * k / 2), LW * k, LH * k);
    }
    function cell(cx, cy, cw, ch, o, label) {
      const x0 = R(cx - cw / 2), y0 = R(cy - ch / 2); rect(g, x0, y0, cw, ch, PAL.night1);
      for (let i = 2; i < cw - 2; i += 4) { px(g, x0 + i, y0, PAL.night3); px(g, x0 + i, y0 + ch - 1, PAL.night3); }
      for (let j = 2; j < ch - 2; j += 4) { px(g, x0, y0 + j, PAL.night3); px(g, x0 + cw - 1, y0 + j, PAL.night3); }
      crab(cx, cy - R(ch * 0.07), cw - 20, ch - R(ch * 0.26), o);
      E.text(g, label, { x: cx, y: cy + ch / 2 - R(H * 0.038), size: R(H * 0.026), color: PAL.snow, ink: PAL.ink, align: 'center' });
    }
    // 标题
    E.text(g, '角色设定图 · ' + CH.name, { x: W / 2, y: R(H * 0.035), size: R(H * 0.05), color: PAL.lampCore, ink: PAL.ink, align: 'center' });
    E.text(g, (CH.desc || '') + '　·　' + (API && API.ENGINE ? 'pixel 16bit' : 'pixel'), { x: W / 2, y: R(H * 0.098), size: R(H * 0.024), color: PAL.snowMid, ink: PAL.ink, align: 'center' });
    const x0 = R(W * 0.05), span = R(W * 0.90); const top = R(H * 0.145), r1h = R(H * 0.345), r2y = top + r1h + R(H * 0.018), r2h = R(H * 0.20);
    const r3y = r2y + r2h + R(H * 0.018), r3h = R(H * 0.215); const facings = [['front', '正面'], ['left', '左侧'], ['right', '右侧'], ['back', '背面']];
    const exps = (CH.EXPRESSIONS || ['neutral']).slice(0, 5); const acts = (CH.ACTIONS || ['stand']).slice(0, 5);
    const EXCN = { neutral: '平静', happy: '开心', sad: '难过', surprised: '惊讶', sleepy: '困倦' };
    const ACCN = { stand: '站', walk: '走', wave: '挥钳', 'look-up': '抬头', shiver: '发抖' };
    // 第一排：朝向（全身大图）
    const cw1 = R(span / 4); facings.forEach(([f, cn], i) => cell(x0 + R(cw1 * (i + 0.5)), top + (r1h >> 1), cw1 - 18, r1h,
      { size: 57, facing: f, expression: 'neutral', action: 'stand', u: 0.5, t: 0.35 }, cn + ' ' + f));
    // 第二排：表情
    const cw2 = R(span / 5); exps.forEach((e, i) => cell(x0 + R(cw2 * (i + 0.5)), r2y + (r2h >> 1), cw2 - 14, r2h,
      { size: 38, facing: 'front', expression: e, action: 'stand', u: 0.5, t: 0.35 }, e + ' ' + (EXCN[e] || '')));
    // 第三排：动作
    acts.forEach((a, i) => cell(x0 + R(cw2 * (i + 0.5)), r3y + (r3h >> 1), cw2 - 14, r3h,
      { size: 38, facing: 'right', expression: 'happy', action: a, u: 0.62, t: 0.5 }, a + ' ' + (ACCN[a] || ''))); g.restore();
  };
})();
