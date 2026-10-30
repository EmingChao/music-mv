// ══════════════════════════════════════════════════════════════════════════
//  crayon/character.js —— 阿蟹（蜡笔线条 + 水彩填色，纯 Canvas2D）
//
//  单位空间设计：脚在 (0,0)，头顶约 (0,-0.87)，size 就是"身高(px)"。
//  朝向不翻 canvas：facing='left' 时只把 x 乘 -1，jitter/排线仍留在像素空间。
//  蜡笔质感与 engine.js 同一套笔法（ENGINE._pen），所以角色和背景不掉队。
//  钳 = 圆钝掌部 + 一根上翘的可动尖指，两瓣之间留一道缺口（缺口里透出背景）。
//  表情走三条通道：眼球/眼睑形状、嘴的方向、眼柄倾角 —— 小尺寸也分得清。
// ══════════════════════════════════════════════════════════════════════════
(function () {
'use strict';
const C = (window.CHARACTER = window.CHARACTER || {});
C.name = '阿蟹';
C.desc = '番茄红壳的小螃蟹，两根竖眼柄，一大一小两只钳';
C.EXPRESSIONS = ['neutral', 'happy', 'sad', 'surprised', 'sleepy'];
C.ACTIONS = ['stand', 'walk', 'wave', 'look-up', 'shiver'];

const T = {
  shellCy: -0.445, shellRx: 0.385, shellRy: 0.275, shellRxSide: 0.315,
  eyeX: 0.142, eyeY: -0.795, eyeR: 0.068,
  clawY: -0.415, clawSmall: 1 / 1.35,
  mouthY: -0.305, legY: -0.205,
};

C.setup = function () {};

C.draw = function (g, o) {
  const E = window.ENGINE, pen = E && E._pen, P = E && E.palette;
  if (!pen || !o) return;
  const s = o.size || 200, f = o.facing || 'front', flip = f === 'left' ? -1 : 1;
  const back = f === 'back', side = f === 'left' || f === 'right';
  const u = o.hold != null ? o.hold : (o.u === undefined ? 0 : o.u);
  const ex = o.expression || 'neutral', ac = o.action || 'stand';
  const k = 'crab' + (flip < 0 ? 'L' : 'R') + (back ? 'b' : '') + (side ? 's' : '');
  const br = Math.sin(u * Math.PI * 2) * 0.014;                    // 呼吸，永远在动
  const wk = ac === 'walk' ? Math.sin(u * Math.PI * 4) : 0;        // 一个循环两步
  const bob = ac === 'walk' ? -Math.abs(wk) * 0.026 : br;
  const shv = ac === 'shiver' ? Math.sin(u * Math.PI * 8) * 0.010 : 0;
  const bigSide = flip;                                           // 大钳在朝向那侧
  const rx = side ? T.shellRxSide : T.shellRx;                    // 侧身壳收窄
  const lw = Math.max(1.5, s * 0.0135);
  const PX = (a) => o.x + (a + shv) * s * flip;
  const PY = (b) => o.y + b * s;
  const PM = (pts, dy) => pts.map(q => [PX(q[0]), PY(q[1] + (dy || 0))]);

  /* ── 腿 ───────────────────────────────────────────────────────────────── */
  if (side) {
    for (let j = 0; j < 3; j++) {
      const ph = ac === 'walk' ? Math.sin(u * Math.PI * 4 + j * 1.2) : 0;
      const bx = -0.15 + j * 0.135, fy = -Math.max(0, ph) * 0.034;
      pen.wline(g, k + 'lg' + j, PM([[bx, T.legY + 0.02], [bx + 0.02, -0.09], [bx + 0.045, fy]]),
        { w: lw * 2.4, color: P.tomatoDeep, closed: false, layers: 3, gap: 0, jit: s * 0.004 });
    }
  } else {
    for (let sd = -1; sd <= 1; sd += 2) for (let j = 0; j < 3; j++) {
      const ph = ac === 'walk' ? Math.sin(u * Math.PI * 4 + j * 1.05 + (sd > 0 ? Math.PI : 0)) : 0;
      const bx = sd * 0.215, by = T.legY + j * 0.020;
      const fx = sd * (0.355 + j * 0.045), fy = -Math.max(0, ph) * 0.036;
      const kx = sd * (0.315 + j * 0.030), ky = (by + fy) / 2 - 0.030;
      pen.wline(g, k + 'lg' + sd + j, PM([[bx, by], [kx, ky], [fx, fy]]),
        { w: lw * 2.5, color: P.tomatoDeep, closed: false, layers: 3, gap: 0, jit: s * 0.004 });
    }
  }

  /* ── 钳：一个掌 + 两瓣（固定下螯 + 会开合的上指），瓣间一道墨缝 ───────── */
  const claw = (sd, behind) => {
    if (behind && !side) return;
    const SC = sd === bigSide ? 1 : T.clawSmall;
    const waving = ac === 'wave' && sd === bigSide, wv = waving ? Math.sin(u * Math.PI * 4) : 0;
    const R = 0.238 * SC, cxA = behind ? 0.225 : (side ? 0.38 : 0.470);
    const rot = behind ? -0.62 : (waving ? -0.55 : -0.2);
    const cy0 = T.clawY + (waving ? -0.245 + wv * 0.05 : -0.02) + (behind ? -0.235 : 0);
    const op = 0.13 + (waving ? 0.09 + 0.10 * Math.abs(wv) : 0) + (ex === 'surprised' ? 0.08 : 0) + 0.035 * Math.sin(u * Math.PI * 2);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const map = (pts) => PM(pts.map(q => [sd * (q[0] * cr - q[1] * sr + cxA), q[0] * sr + q[1] * cr + cy0]), bob);
    const palm = map(pen.ell(0, 0.008, R * 0.58, R * 0.54, 14));
    const lobeFix = map([[R * 0.04, R * 0.07]].concat(pen.arcPts(0, 0, R * 1.0, R * 0.66, 0.13, 0.9, 8)));
    const lobeMov = map([[R * 0.04, -R * 0.07]].concat(pen.arcPts(0, 0, R * 0.94, R * 0.62, -0.13 - op, -0.9 - op, 8)));
    const ma = -op / 2;
    const slit = map([[Math.cos(ma) * R * 0.40, Math.sin(ma) * R * 0.40], [Math.cos(ma) * R * 0.96, Math.sin(ma) * R * 0.96]]);
    const fillC = behind ? '#9C4632' : '#BE4A34', inkC = behind ? '#74301F' : '#8B3423';
    pen.wline(g, k + 'arm' + sd + (behind ? 'b' : ''), [[PX(sd * (side ? 0.15 : 0.25)), PY(T.clawY + 0.12 - (behind ? 0.15 : 0))], map([[R * 0.12, 0]])[0]],
      { w: lw * 1.8, color: behind ? inkC : P.tomatoDeep, closed: false, layers: 3, gap: 0 });
    pen.wbase(g, palm, P.paper);
    pen.wfill(g, k + 'cp' + sd + (behind ? 'b' : ''), palm, fillC, { alpha: 0.52, slop: s * 0.006, color2: P.tomatoDeep });
    [lobeFix, lobeMov].forEach((lobe, li) => {
      pen.wbase(g, lobe, P.paper);
      pen.wfill(g, k + 'cl' + sd + li + (behind ? 'b' : ''), lobe, fillC, { alpha: 0.54, slop: s * 0.006, color2: P.tomatoDeep });
      pen.wline(g, k + 'cll' + sd + li + (behind ? 'b' : ''), lobe, { w: lw * 1.2, color: inkC, gap: 0.07 });
    });
    pen.wline(g, k + 'slit' + sd + (behind ? 'b' : ''), slit, { w: lw * 1.45, color: behind ? inkC : '#7E2E1F', closed: false, layers: 3, gap: 0, alpha: 0.85 });
  };
  if (side) claw(-flip, true);                                    // 侧身：后面那只钳先画，被壳压住一半

  /* ── 壳：番茄红水彩块 + 排线 + 三个小浅斑 ──────────────────────────────── */
  const shell = PM(pen.sqell(0, T.shellCy, rx, T.shellRy, 30, 0.72), bob);
  pen.wbase(g, shell, P.paper);
  pen.wfill(g, k + 'shf', shell, P.tomato, { alpha: 0.52, slop: s * 0.014, color2: P.tomatoDeep });
  pen.hatch(g, k + 'shh', shell, { angle: 0.34, dist: s * 0.024, color: P.tomatoDeep, alpha: 0.16, w: s * 0.013 });
  pen.wfill(g, k + 'shb', PM(pen.ell(0, T.shellCy + T.shellRy * 0.74, rx * 0.70, T.shellRy * 0.44, 18), bob),
    P.tomatoDeep, { alpha: 0.12, layers: 2, slop: s * 0.012 });
  const spots = side ? [[-0.10, -0.575, 0.040], [0.045, -0.605, 0.033], [0.175, -0.560, 0.036]]
    : [[-0.175, -0.565, 0.040], [0.0, -0.605, 0.034], [0.175, -0.560, 0.038]];
  spots.forEach((sp, i) => {
    const pts = PM(pen.sqell(sp[0], sp[1], sp[2] * 1.25, sp[2], 10, 0.9), bob);
    pen.wfill(g, k + 'sp' + i, pts, '#F8C5A6', { alpha: 0.26 + (back ? 0.16 : 0), layers: 2, slop: s * 0.004, comp: 'source-over' });
  });


  if (side) claw(flip, false); else { claw(-1, false); claw(1, false); }

  /* ── 眼柄 + 眼球 ──────────────────────────────────────────────────────── */
  const LEAN = { sad: 0.075, surprised: 0.0, sleepy: 0.075, happy: 0.03, neutral: 0.02 };
  const lift = ac === 'look-up' ? -0.030 : 0;
  for (let sd = -1; sd <= 1; sd += 2) {
    const lean = LEAN[ex] === undefined ? 0.02 : LEAN[ex];
    const far = side && sd * flip < 0;
    const e0 = sd * T.eyeX * (ex === 'sad' ? 1.28 : 1) + (side ? 0.085 : 0) * flip;
    const ey = T.eyeY + bob + lift + (ex === 'sleepy' ? 0.012 : 0)
      + (ac === 'shiver' ? Math.sin(u * Math.PI * 8 + sd) * 0.007 : 0);
    const topx = e0 + lean * sd * (side ? 1.6 : 1);               // 眼柄倾角 = 情绪
    const st = pen.capsule([PX(sd * 0.098 * (side ? 1.5 : 1)), PY(T.shellCy - T.shellRy * 0.55 + bob)],
      [PX(topx), PY(ey + T.eyeR * 0.6)], Math.max(1.3, s * 0.019), Math.max(1.1, s * 0.014), 5);
    pen.wbase(g, st, P.paper);
    pen.wfill(g, k + 'stf' + sd, st, P.tomato, { alpha: 0.42, slop: s * 0.004 });
    pen.wline(g, k + 'st' + sd, st, { w: lw * 0.9, color: P.tomatoDeep, gap: 0.1 });
    const er = T.eyeR * (ex === 'surprised' ? 1.2 : 1) * (far ? 0.88 : 1);
    const eye = PM(pen.ell(topx, ey, er * 0.94, er, 14), 0);
    if (ex !== 'happy') {                                         // 笑起来的眼睛是闭合的，不画眼白
      if (back) {                                                 // 背面只有眼背：一层淡色，不画亮白
        pen.wfill(g, k + 'eyf' + sd, eye, P.paperDeep, { alpha: 0.34, layers: 2, slop: s * 0.003 });
        pen.wline(g, k + 'ey' + sd, eye, { w: lw * 0.7, alpha: 0.5, gap: 0.2 });
      } else {
        pen.wbase(g, eye, P.cream);
        pen.wfill(g, k + 'eyf' + sd, eye, '#FFFEFA', { alpha: 0.5, layers: 2, slop: s * 0.003, comp: 'source-over' });
        pen.wline(g, k + 'ey' + sd, eye, { w: lw * 0.95, gap: 0.12 });
      }
    }
    if (back) continue;
    if (ex === 'happy') {                                         // 闭眼笑：一条上弯的粗墨弧
      pen.wline(g, k + 'ea' + sd, PM(pen.arcPts(topx, ey + 0.020, er * 1.05, er * 0.78, Math.PI * 1.10, Math.PI * 1.90, 10), 0),
        { w: Math.max(2, er * s * 0.34), color: P.ink, closed: false, layers: 3, gap: 0 });
    } else if (ex === 'sleepy') {                                 // 上眼睑压到一半
      const lid = pen.arcPts(topx, ey + 0.006, er * 0.98, er * 0.98, Math.PI, 2 * Math.PI, 8)
        .concat([[topx + er, ey + 0.006], [topx - er, ey + 0.006]]);
      pen.wfill(g, k + 'lid' + sd, PM(lid, 0), P.tomato, { alpha: 0.82, layers: 2, slop: s * 0.003, comp: 'source-over' });
      pen.wline(g, k + 'lid2' + sd, PM([[topx - er, ey + 0.006], [topx + er, ey + 0.006]], 0),
        { w: lw * 1.2, color: P.ink, closed: false, layers: 3, gap: 0 });
    } else {
      const pr = er * (ex === 'surprised' ? 0.24 : 0.38);
      const px2 = topx + (ex === 'sad' ? -sd * 0.005 : 0) + (side ? 0.010 * flip : 0);
      const py2 = ey + (ex === 'sad' ? 0.018 : 0.008) + (ac === 'look-up' ? -0.016 : 0);
      const pu = PM(pen.ell(px2, py2, pr, pr * 1.06, 10), 0);
      pen.wbase(g, pu, P.ink);
      pen.wline(g, k + 'pu' + sd, pu, { w: lw * 0.5, color: P.ink, layers: 2, gap: 0.1 });
      g.save(); g.globalAlpha = 0.92; g.fillStyle = P.cream;
      g.beginPath(); g.arc(PX(px2 - 0.012), PY(py2 - 0.014), Math.max(1, pr * s * 0.34), 0, 6.2832); g.fill(); g.restore();
      if (ex === 'sad') {                                         // 眼尾下垂
        const a0 = sd > 0 ? 1.15 : 1.99, a1 = sd > 0 ? 1.62 : 1.52;
        pen.wline(g, k + 'li' + sd, PM(pen.arcPts(topx, ey + 0.004, er * 0.94, er * 0.94, Math.PI * a0, Math.PI * a1, 6), 0),
          { w: lw * 1.15, color: P.ink, closed: false, layers: 3, gap: 0 });
        pen.wline(g, k + 'bw' + sd, PM([[topx - sd * er * 0.9, ey - er * 1.15], [topx + sd * er * 0.85, ey - er * 1.5]], 0),
          { w: lw * 0.95, color: P.ink, closed: false, layers: 2, gap: 0 });
      }
    }
  }

  /* ── 嘴 ───────────────────────────────────────────────────────────────── */
  const my = T.mouthY + bob, mx = side ? 0.06 * flip : 0;
  if (!back) {
    const MP = (pts) => PM(pts.map(q => [q[0] + mx, q[1]]), 0);
    if (ex === 'happy') {
      pen.wline(g, k + 'mo', MP(pen.arcPts(0, my - 0.014, 0.055, 0.044, 0.20, Math.PI - 0.20, 8)),
        { w: lw * 1.05, color: P.ink, closed: false, layers: 3, gap: 0, jit: s * 0.003 });
      for (let sd = -1; sd <= 1; sd += 2)
        pen.wfill(g, k + 'bl' + sd, PM(pen.ell(sd * 0.225 + mx, my - 0.016, 0.046, 0.027, 10), bob),
          P.blush, { alpha: 0.3, layers: 2, slop: s * 0.004, comp: 'source-over' });
    } else if (ex === 'sad') {
      pen.wline(g, k + 'mo', MP(pen.arcPts(0, my + 0.030, 0.052, 0.038, Math.PI + 0.24, -0.24, 8)),
        { w: lw * 1.05, color: P.ink, closed: false, layers: 3, gap: 0, jit: s * 0.003 });
    } else if (ex === 'surprised') {
      const mo = MP(pen.ell(0, my, 0.040, 0.048, 10));
      pen.wbase(g, mo, '#5A4448'); pen.wline(g, k + 'mo', mo, { w: lw * 1.1, color: P.ink, layers: 2, gap: 0.1 });
    } else if (ex === 'sleepy') {
      pen.wline(g, k + 'mo', MP([[-0.040, my + 0.006], [0, my - 0.002], [0.041, my + 0.008]]),
        { w: lw * 0.9, color: P.ink, closed: false, layers: 2, gap: 0, jit: s * 0.003 });
    } else {
      pen.wline(g, k + 'mo', MP([[-0.038, my - 0.003], [0, my + 0.011], [0.040, my - 0.002]]),
        { w: lw * 1.0, color: P.ink, closed: false, layers: 2, gap: 0, jit: s * 0.003 });
    }
  }

  /* 壳的轮廓最后压上（留 1–2 处缺口，别闭合）*/
  pen.wline(g, k + 'shl', shell, { w: lw * 1.3, color: P.tomatoDeep, gap: 0.07, jit: s * 0.005 });
};

C.handAt = function (o, which) {
  const s = o.size || 200, flip = o.facing === 'left' ? -1 : 1;
  const sd = which === 'left' ? -1 : 1, SC = sd === flip ? 1 : T.clawSmall;
  const cxH = (o.facing === 'left' || o.facing === 'right') ? 0.33 : 0.47;
  return { x: o.x + sd * (cxH + 0.1 * SC) * s * flip, y: o.y + T.clawY * s };
};
})();
