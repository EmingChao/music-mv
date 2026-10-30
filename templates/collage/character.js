/* 纸艺拼贴 · 角色「阿蟹」——一只用番茄红纸剪出来的小螃蟹
   设计坐标：脚底 (0,0)，往上是负。设计身高 DH=241（眼珠顶到脚底）。
   每个部件都是独立纸片：撕边轮廓 → 暖白纸边 → 投影，纸纹由 ENGINE.makePiece 统一做。 */
(function () {
  'use strict';
  const D2R = Math.PI / 180, TAU = Math.PI * 2;
  const COL = {
    shell: '#E3603A', palm: '#DB5733', finger: '#D24E2C', leg: '#C64E2E',
    belly: '#F8DBB5', spot: '#FBD2B8', cheek: '#F29B8B', eye: '#FFF9EE', pupil: '#2B2A26'
  };
  const KSCALE = 2.4;        // 部件纸片统一精细度：一次建好，任何尺寸都靠缩放
  const DH = 223;            // 设计身高（眼珠顶 → 脚底）
  const CR = { K: KSCALE, CFG: null, API: null };
  const PC = {};

  // ── 本地形状 ─────────────────────────────────────────────────────────────
  function ellP(cx, cy, rx, ry, st) {
    const n = Math.max(8, st || 12), out = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return out;
  }
  function stripP(pts, w) {
    const h = w / 2, N = pts.length, nr = [];
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1;
      nr.push([-dy / L * h, dx / L * h]);
    }
    const out = [];
    for (let i = 0; i < N; i++) out.push([pts[i][0] + nr[i][0], pts[i][1] + nr[i][1]]);
    for (let i = N - 1; i >= 0; i--) out.push([pts[i][0] - nr[i][0], pts[i][1] - nr[i][1]]);
    return out;
  }
  function sh(a, b, c) { return { x: 2, y: 3, a: 0.22, b: 2 }; }
  // 钳子轮廓：一整片纸剪出来的钳型，右端有个 V 形钳口（缺口朝外）
  function clawP(s) {
    const P = [[-44, -3], [-30, -26], [2, -30], [32, -24], [56, -14], [30, -4], [54, 4], [24, 14], [-6, 22], [-32, 12]];
    return P.map(function (q) { return [q[0] * s, q[1] * s]; });
  }

  // ── 部件几何表（设计单位，全部绝对坐标；put 按纸片包围盒归位）────────────
  const GEO = {
    shell:  { pts: ellP(0, -104, 96, 52, 26), color: COL.shell, paper: 'card', margin: 2.4, core: 1.5, shadow: sh() },
    belly:  { pts: ellP(0, -62, 30, 12, 14), color: COL.belly, paper: 'card', margin: 1.6, core: 1.3, shadow: { x: 2, y: 2.4, a: 0.16, b: 1.2 } },
    spotA:  { pts: ellP(-54, -126, 11, 9, 12), color: COL.spot, paper: 'card', margin: 1.7, core: 1.1, shadow: { x: 1.4, y: 1.8, a: 0.16, b: 1 } },
    spotB:  { pts: ellP(6, -142, 9, 8, 12), color: COL.spot, paper: 'card', margin: 1.7, core: 1.1, shadow: { x: 1.4, y: 1.8, a: 0.16, b: 1 } },
    spotC:  { pts: ellP(56, -128, 10, 9, 12), color: COL.spot, paper: 'card', margin: 1.7, core: 1.1, shadow: { x: 1.4, y: 1.8, a: 0.16, b: 1 } },
    legL0:  { pts: stripP([[0, 0], [12, 30], [15, 54]], 13), color: COL.leg, paper: 'card', core: 1.3, margin: 1.6, shadow: { x: 2, y: 3, a: 0.2, b: 1.3 } },
    legL1:  { pts: stripP([[0, 0], [24, 32], [30, 54]], 13), color: COL.leg, paper: 'card', core: 1.3, margin: 1.6, shadow: { x: 2, y: 3, a: 0.2, b: 1.3 } },
    legL2:  { pts: stripP([[0, 0], [36, 30], [48, 54]], 13), color: COL.leg, paper: 'card', core: 1.3, margin: 1.6, shadow: { x: 2, y: 3, a: 0.2, b: 1.3 } },
    arm:    { pts: stripP([[0, 0], [10, 18], [22, 32]], 15), color: COL.palm, paper: 'card', core: 1.3, margin: 1.7, shadow: { x: 2, y: 3, a: 0.2, b: 1.3 } },
    clawB:  { pts: clawP(1), color: COL.palm, paper: 'card', core: 1.7, margin: 2.4, shadow: { x: 3, y: 3.6, a: 0.24, b: 1.9 } },
    clawS:  { pts: clawP(0.82), color: COL.palm, paper: 'card', core: 1.7, margin: 2.4, shadow: { x: 2.8, y: 3.2, a: 0.24, b: 1.7 } },
    stalkL: { pts: stripP([[0, 0], [3, -50]], 12), color: COL.leg, paper: 'card', core: 1.1, margin: 1.4, shadow: { x: 1.8, y: 2.4, a: 0.18, b: 1.1 } },
    stalkR: { pts: stripP([[0, 0], [-2, -50]], 12), color: COL.leg, paper: 'card', core: 1.1, margin: 1.4, shadow: { x: 1.8, y: 2.4, a: 0.18, b: 1.1 } },
    eyeL:   { pts: ellP(0, 0, 18, 17, 16), color: COL.eye, paper: 'card', core: 1.3, margin: 1.8, shadow: { x: 2, y: 2.6, a: 0.22, b: 1.4 } },
    eyeR:   { pts: ellP(0, 0, 17, 16, 16), color: COL.eye, paper: 'card', core: 1.3, margin: 1.8, shadow: { x: 2, y: 2.6, a: 0.22, b: 1.4 } },
    pupil:  { pts: ellP(0, 0, 9, 10, 12), color: COL.pupil, paper: 'card', core: 0.7, margin: 1, shadow: { x: 1, y: 1.3, a: 0.18, b: 0.8 } },
    cheek:  { pts: ellP(0, 0, 11, 8, 10), color: COL.cheek, paper: 'card', core: 0.9, margin: 1.1, alpha: 0.75, shadow: { a: 0 } },
    mouthL: { pts: stripP([[-11, 0], [11, 1]], 5), color: COL.pupil, paper: 'card', core: 0.7, margin: 0.9, shadow: { x: 1, y: 1.2, a: 0.18, b: 0.7 } },
    mouthS: { pts: stripP([[-14, -4], [-5, 4], [5, 4], [14, -4]], 5), color: COL.pupil, paper: 'card', core: 0.7, margin: 0.9, shadow: { x: 1, y: 1.2, a: 0.18, b: 0.7 } },
    mouthD: { pts: stripP([[-14, 4], [-5, -4], [5, -4], [14, 4]], 5), color: COL.pupil, paper: 'card', core: 0.7, margin: 0.9, shadow: { x: 1, y: 1.2, a: 0.18, b: 0.7 } },
    mouthO: { pts: ellP(0, 0, 9, 10, 10), color: COL.pupil, paper: 'card', core: 0.7, margin: 1, shadow: { x: 1, y: 1.2, a: 0.18, b: 0.8 } }
  };

  function pc(name) {
    const key = name + '@' + CR.K;
    let p = PC[key];
    if (p) return p;
    const G = GEO[name], E = window.ENGINE, K = CR.K;
    const sp = G.pts.map(function (q) { return [q[0] * K, q[1] * K]; });
    const s = G.shadow || {};
    p = PC[key] = E.makePiece({
      key: 'crab:' + name + ':' + K, pts: sp, color: G.color, paper: G.paper, amp: 1.7, jit: 0,
      core: (G.core === undefined ? 1.2 : G.core) * K,
      margin: (G.margin === undefined ? 1.6 : G.margin) * K,
      shadow: { x: (s.x === undefined ? 2 : s.x) * K, y: (s.y === undefined ? 3 : s.y) * K, a: s.a === undefined ? 0.2 : s.a, b: (s.b === undefined ? 1.2 : s.b) * K },
      alpha: G.alpha === undefined ? 1 : G.alpha
    });
    return p;
  }
  // 注意：纸片内部几何是「设计坐标 × KSCALE」，所以归位偏移也要乘 KSCALE
  function put(g, name, x, y, rot) {
    const p = pc(name), K = CR.K;
    g.save(); g.translate((x || 0) * K, (y || 0) * K); if (rot) g.rotate(rot * D2R);
    g.drawImage(p.cv, p.cx - p.w / 2, p.cy - p.h / 2);
    g.restore();
  }

  // ── 姿势：一秒 12 定格（"手挪纸"的手感，不是每帧现算）────────────────────
  function pose(o, st) {
    const u = o.u === undefined ? 0 : o.u;
    const q = Math.floor(u * 12 + 1e-6) / 12, ph = q * TAU;
    const act = o.action || 'stand', ex = o.expression || 'neutral';
    const P = {
      bob: Math.sin(ph) * 1.6, lean: 0, legAmp: 0, legPh: ph, sx: 0,
      lookX: 0, lookY: 0, armR: 0, armL: 0, open: 0, spread: 0,
      mouth: 'mouthL', cheek: false, closed: false, pScale: 1, eyeY: 0
    };
    if (act === 'walk') { P.legAmp = 15; P.legPh = q * TAU * 2; P.bob += Math.abs(Math.sin(ph * 2)) * 2.6 - 1.3; P.lean = -2.5; P.armL = -10; P.armR = 10; }
    else if (act === 'wave') { P.armR = -74 + Math.sin(ph * 3) * 14; P.open = 1; P.cheek = true; P.mouth = 'mouthS'; }
    else if (act === 'look-up') { P.lookY = -1; P.lean = 2.5; P.bob -= 1.6; P.armL = -12; P.armR = -12; }
    else if (act === 'shiver') {
      P.sx = (window.ENGINE.noise('shv' + st, 1) - 0.5) * 5;
      P.armL = -30; P.armR = -30; P.open = 1; P.spread = 1; P.mouth = 'mouthD';
    }
    if (ex === 'happy') { P.mouth = 'mouthS'; P.cheek = true; P.lookY = -0.4; P.bob += Math.sin(ph * 2) * 1.1; P.armL -= 8; P.armR -= 8; }
    else if (ex === 'sad') { P.mouth = 'mouthD'; P.lookY = 0.9; P.lean += 2; P.armL = 10; P.armR = 10; }
    else if (ex === 'surprised') { P.mouth = 'mouthO'; P.pScale = 1.35; P.spread = 1; P.lookY = -0.6; P.eyeY = -3; P.armL = -38; P.armR = -38; P.open = 1; }
    else if (ex === 'sleepy') { P.closed = true; P.lean += 3; P.bob += Math.sin(ph) * 0.8; P.armL = 8; P.armR = 8; }
    if (!P.closed && Math.floor(u * 12) % 9 === 6) P.closed = true;   // 眨眼
    return P;
  }

  // ── 一只钳（dir=1 右边小钳，dir=-1 左边大钳）────────────────────────────
  function drawArm(g, dir, ang, open, big) {
    const K = CR.K;
    g.save();
    g.translate(86 * dir * K, -94 * K);
    g.scale(dir, 1);
    g.rotate(ang * D2R);
    put(g, 'arm', 0, 0, 0);
    g.translate(16 * K, 24 * K);                 // 腕 / 掌根
    put(g, big ? 'clawB' : 'clawS', 0, 0, (big ? -8 : 8) + (open ? (big ? -10 : 10) : 0));
    g.restore();
  }

  // ── 眼睛：两根竖纸带 + 两颗白纸眼珠 ─────────────────────────────────────
  function drawEyes(g, P, back) {
    if (back) return;
    put(g, 'stalkL', -31, -152, -P.spread * 6 - P.lookX * 1.2);
    put(g, 'stalkR', 29, -152, P.spread * 6 - P.lookX * 1.2);
    const pairs = [[-38, -206, 'eyeL'], [36, -204, 'eyeR']];
    for (let i = 0; i < 2; i++) {
      const e = pairs[i];
      const dx = e[0] + (P.spread * (i ? 6 : -6)) + P.lookX * 2.5, dy = e[1] + P.eyeY + P.lookY * 2.6;
      const K = CR.K, px = dx * K, py = dy * K;
      if (P.closed) {                            // 眨眼/睡着：一小片压扁的暖白眼皮 + 一道墨线
        g.save();
        g.fillStyle = COL.eye;
        g.beginPath(); g.ellipse(px, py, 16 * K, 7 * K, 0, 0, TAU); g.fill();
        g.strokeStyle = COL.pupil; g.lineWidth = 3.4 * K; g.lineCap = 'round';
        g.beginPath(); g.ellipse(px, py - 2 * K, 11 * K, 4 * K, 0, Math.PI * 0.08, Math.PI * 0.92); g.stroke();
        g.restore();
      } else {
        put(g, e[2], dx, dy, 0);
        const pp = pc('pupil'), ps = P.pScale;
        g.save(); g.translate(px + P.lookX * 6 * K, py + P.lookY * 5 * K); g.scale(ps, ps);
        g.drawImage(pp.cv, pp.cx - pp.w / 2, pp.cy - pp.h / 2);
        g.save(); g.globalAlpha = 0.9; g.fillStyle = '#FFFFFF';
        g.beginPath(); g.arc(-8, -10, 6, 0, TAU); g.fill(); g.restore();
        g.restore();
      }
    }
  }

  // ── 对外：画角色 ─────────────────────────────────────────────────────────
  function draw(g, o) {
    const E = window.ENGINE; if (!E) return;
    const size = o.size || 240;
    CR.K = KSCALE;
    const sc = (size / DH) / CR.K;
    const st = E.step(o.t === undefined ? 0 : o.t);
    const P = pose(o, st);
    const facing = o.facing || 'front';
    const back = facing === 'back';
    const mirror = facing === 'left' ? -1 : 1;

    g.save();
    g.translate(o.x, o.y);
    g.save(); g.globalAlpha = 0.14; g.fillStyle = '#4A3A28';     // 雪地上一层淡墨影子
    g.beginPath(); g.ellipse(0, -3 * sc, 104 * sc, 14 * sc, 0, 0, TAU); g.fill(); g.restore();

    g.scale(mirror, 1);
    g.scale(sc, sc);
    g.translate(P.sx * CR.K, P.bob * CR.K);
    g.rotate(P.lean * 0.4 * D2R);

    // 1 六条腿（两侧各三条，绕髋部摆；壳压上去只露外半截）
    const hip = [[-68, -66], [-72, -66], [-76, -66]];
    for (let sd = -1; sd <= 1; sd += 2) {
      for (let i = 0; i < 3; i++) {
        const sw = (P.legAmp ? Math.sin(P.legPh + i * 2.1 + (sd > 0 ? 0.9 : 0)) * P.legAmp : Math.sin(P.legPh * 0.5 + i) * 1.6);
        g.save(); g.translate(hip[i][0] * sd * CR.K, hip[i][1] * CR.K); g.scale(sd, 1);
        g.rotate((sw + (1 - i) * 6) * D2R);
        put(g, 'legL' + i, 0, 0, 0);
        g.restore();
      }
    }
    // 2 壳 + 三个浅斑 + 下巴 + 腮 + 嘴
    put(g, 'shell', 0, 0, 0);
    put(g, 'spotA', 0, 0, 0); put(g, 'spotB', 0, 0, 0); put(g, 'spotC', 0, 0, 0);
    put(g, 'belly', 0, 0, 0);
    if (P.cheek) { put(g, 'cheek', -62, -84, 0); put(g, 'cheek', 60, -84, 0); }
    if (!back) put(g, P.mouth, 0, -92, 0);
    // 3 眼柄 + 眼珠
    drawEyes(g, P, back);
    // 4 两只钳压在最前（右小左大）
    drawArm(g, 1, P.armR, P.open, false);
    drawArm(g, -1, P.armL, P.open, true);
    g.restore();
  }

  // 钳子的世界坐标（像素）
  function handAt(o, which) {
    const size = o.size || 240, sc = size / DH;
    const dir = (which === 0 || which === 'left') ? -1 : 1;
    const mir = (o.facing === 'left') ? -1 : 1;
    const P = pose(o, window.ENGINE ? window.ENGINE.step(o.t || 0) : 0);
    const a = (dir > 0 ? P.armR : P.armL) * D2R;
    const lx = 86 + 16 * Math.cos(a) - 24 * Math.sin(a), ly = -94 + 16 * Math.sin(a) + 24 * Math.cos(a);
    return { x: o.x + mir * lx * dir * sc, y: o.y + (ly + P.bob) * sc, r: 40 * sc };
  }

  function setup(CFG, API) {
    CR.CFG = CFG; CR.API = API;
    CR.K = KSCALE; for (const n in GEO) pc(n);     // 22 张部件纸片先焐好，别在第一帧现做
    return Promise.resolve();
  }

  window.CHARACTER = {
    name: '阿蟹',
    desc: '番茄红壳的小螃蟹 · 两根竖眼柄 · 一大一小两只钳 · 壳上三个浅斑',
    EXPRESSIONS: ['neutral', 'happy', 'sad', 'surprised', 'sleepy'],
    ACTIONS: ['stand', 'walk', 'wave', 'look-up', 'shiver'],
    setup: setup,
    draw: draw,
    handAt: handAt
  };
})();
