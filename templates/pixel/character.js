/* ═══════════════════════════════════════════════════════════════════════════
   pixel/character.js —— 阿蟹（番茄红小螃蟹）
   ---------------------------------------------------------------------------
   画法：先在一张 30×19 的「虚拟格子」上摆格子（一格 = 一种颜色），
   再按整数倍 k 放大成 fillRect —— 任何 size 下都是干净整数像素，
   没有半像素、没有抗锯齿。描边 = 深色往 4 个邻格扩 1 格，再画本体。
   一切动作只随 pf = floor(t*12) 变（12fps 逐格动画，绝不补间）。
   锚点：o.x = 身体中线，o.y = 脚底（第 18 行的下沿 = 画面里的地面）。
   两套骨架：正面/背面（左右对称，两只钳都露）与侧身（壳收窄、单只大钳在前、
   单排短腿、眼柄前倾）—— 侧身只画朝向 right 的一版，left 由 draw 镜像。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const GW = 30, GH = 19, FOOT = 18;        // 虚拟格子：宽 30，脚底在第 18 行
  const C = (window.CHARACTER = window.CHARACTER || {});
  C.name = '阿蟹';
  C.desc = '番茄红小螃蟹，壳上三点浅斑，两根竖眼柄，钳一大一小';
  C.EXPRESSIONS = ['neutral', 'happy', 'sad', 'surprised', 'sleepy'];
  C.ACTIONS = ['stand', 'walk', 'wave', 'look-up', 'shiver'];

  let PAL = null, K = 1, OX = 0, OY = 0, CELL = null;

  // 三档受光：夜里 / 灯下 / 过曝
  const SKIN = [
    { a: 'crabRed', b: 'crabLite', d: 'crabDark', s: 'crabBelly' },     // 夜里
    { a: 'crabLite', b: 'crabBelly', d: 'crabRed', s: 'white' },        // 灯下：提亮一档
    { a: 'crabBelly', b: 'white', d: 'crabLite', s: 'white' },          // 过曝
  ];
  function pal() { if (!PAL) PAL = (window.ENGINE && window.ENGINE.palette) || {}; return PAL; }
  C.setup = function (CFG, API) { if (API && API.ENGINE) PAL = API.ENGINE.palette; };

  // ── 正面：壳（10 行椭圆，[y,x0,x1]）+ 两只钳 + 四条腿
  const SHELL = [[6, 13, 16], [7, 11, 18], [8, 9, 20], [9, 8, 21], [10, 8, 21],
    [11, 8, 21], [12, 8, 21], [13, 9, 20], [14, 10, 19], [15, 11, 18]];
  // ── 侧身：壳收窄到 14 格、前低后高
  const SIDE = [[6, 9, 17], [7, 8, 18], [8, 7, 19], [9, 7, 19], [10, 7, 19],
    [11, 7, 19], [12, 8, 19], [13, 9, 18], [14, 10, 17], [15, 11, 16]];
  // 大钳（7×7）/ 小钳（5×5）：[dy, x0, x1]，缺口朝 +x（flip 时朝 -x）
  const BIG = [[0, 2, 5], [1, 0, 7], [2, 0, 7], [3, 0, 2], [4, 0, 2], [5, 0, 7], [6, 2, 5]];
  const SML = [[0, 1, 3], [1, 0, 5], [2, 0, 1], [3, 0, 1], [4, 0, 5], [5, 1, 3]];
  // 正面四条腿（从壳下沿往外下方，走到第 18 行）
  const LEGS = [[[9, 14], [8, 15], [7, 16], [7, 17], [7, 18]],
    [[12, 15], [11, 16], [10, 17], [10, 18]],
    [[19, 14], [20, 15], [21, 16], [21, 17], [21, 18]],
    [[17, 15], [18, 16], [19, 17], [20, 18]]];
  // 侧身四条腿（单排，向外撇）
  const SLEG = [[[9, 14], [8, 15], [7, 16], [7, 17], [7, 18]],
    [[12, 15], [11, 16], [10, 17], [10, 18]],
    [[16, 15], [17, 16], [18, 17], [18, 18]],
    [[18, 14], [19, 15], [20, 16], [21, 17], [21, 18]]];

  function put(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= GW || y >= GH) return;
    CELL.set(y * GW + x, c);
  }
  function row(y, x0, x1, c) { for (let x = x0; x <= x1; x++) put(x, y, c); }
  // 钳子：shape=BIG/SML；flip=true 钳口朝左
  function claw(ox, oy, shape, flip) {
    const w = shape[1][2] - shape[1][1];
    for (const [dy, a, b] of shape) for (let x = a; x <= b; x++) put(ox + (flip ? w - x : x), oy + dy, dy === 0 ? 'b' : 'a');
    put(ox + (flip ? 0 : w), oy + 3, 'k');       // 钳口里的一点暗
  }

  // 一只眼睛（2 格宽），ey = 眼白第一行；out=true 瞳孔偏向外侧（侧身用）
  function eye(x0, ey, ex, out) {
    if (ex === 'happy') { row(ey + 1, x0, x0 + 1, 'k'); row(ey, x0, x0 + 1, 'b'); return; }
    if (ex === 'sleepy') { row(ey, x0, x0 + 1, 'd'); row(ey + 1, x0, x0 + 1, 'w'); return; }
    if (ex === 'surprised') {
      row(ey, x0, x0 + 1, 'w'); row(ey + 1, x0, x0 + 1, 'w'); row(ey + 2, x0, x0 + 1, 'w');
      put(x0, ey + 1, 'k'); return;
    }
    row(ey, x0, x0 + 1, 'w'); row(ey + 1, x0, x0 + 1, 'w');
    put(ex === 'sad' ? x0 : (out ? x0 + 1 : x0), ey + (ex === 'look-up' ? 0 : 1), 'k');
  }

  function start(o, pf) {
    CELL = new Map();
    const skin = SKIN[Math.min(2, Math.max(0, o.lit || 0))];
    const act = o.action || 'stand';
    let bob = 0;
    if (act === 'walk') bob = (pf % 4) % 2 ? 1 : 0;
    else if (act === 'shiver') bob = (pf % 2) ? 1 : 0;
    else bob = (pf % 16) < 8 ? 0 : 1;                     // 站着也呼吸 1 格
    return { skin, act, bob, up: act === 'look-up' ? 1 : 0,
      P: (x, y, c) => put(x, y - bob, c), RW: (y, a, b, c) => row(y - bob, a, b, c) };
  }

  // ─────────────────────────────────────────── 正面 / 背面
  function buildFront(o, pf) {
    const S = start(o, pf), skin = S.skin, P = S.P, RW = S.RW, up = S.up, act = S.act;
    const cA = skin.a, cHi = skin.b, cD = skin.d, cS = skin.s;
    const ex = o.expression || 'neutral', fp = o.facing || 'front';
    for (const [y, x0, x1] of SHELL) for (let x = x0; x <= x1; x++) {
      let c = cA;
      if (y === 6) c = cHi;                                // 顶上一行受光
      else if (x >= x1 - 1) c = cD;                        // 右侧背光
      else if (x <= x0 + 1 && y < 12) c = cHi;             // 左上受光
      P(x, y, c);
    }
    RW(16, 12, 17, cS);                                    // 肚子
    P(10, 9, cS); P(14, 8, cS); P(18, 10, cS);             // 壳上三个浅斑
    P(12, 12, cD); P(18, 13, cD);
    // 四条腿（走路交替抬 1 格）
    const lph = act === 'walk' ? pf % 4 : 0;
    for (let i = 0; i < LEGS.length; i++) {
      const lift = (lph === 1 && i % 2 === 0) || (lph === 3 && i % 2 === 1) ? 1 : 0;
      const path = LEGS[i];
      for (let j = 0; j < path.length; j++) P(path[j][0], path[j][1] - (j ? lift : 0), j === 0 ? cD : (i < 2 ? cA : cD));
    }
    // 两只钳（一大一小；walk 摆 1 格，wave 抬起来）
    const swing = act === 'walk' ? (pf % 4 < 2 ? 0 : 1) : 0;
    const raise = act === 'wave' ? ((pf % 4 < 2) ? 4 : 2) : 0;
    claw(0, 8 - swing - raise, BIG, false);                 // 左（钳口朝内）
    claw(23, 8 + swing - raise, SML, true);                 // 右（小钳，钳口朝外）
    if (fp !== 'back') {
      const ey = 1 - up, st = 3 - up;
      for (const sx of [12, 17]) {                          // 两根竖眼柄
        for (let y = st; y <= 5; y++) P(sx, y, cHi);
        eye(sx === 12 ? 11 : 17, ey, ex, false);
      }
      if (ex === 'sad') { P(13, 1 - up, cD); P(18, 1 - up, cD); }
      const my = 15;                                        // 嘴
      if (ex === 'happy') RW(my, 14, 16, 'k');
      else if (ex === 'sad') { RW(my - 1, 14, 16, 'k'); P(15, my, 'k'); }
      else if (ex === 'surprised') { RW(my, 14, 15, 'k'); RW(my + 1, 14, 15, 'k'); }
      else RW(my, 14, 16, 'k');
    } else { P(10, 11, cS); P(14, 10, cS); P(18, 12, cS); }
    if (act === 'shiver') { P(5, 13, cD); P(25, 12, cD); }
    return CELL;
  }

  // ─────────────────────────────────────────── 侧身（只画朝右，left 由 draw 镜像）
  function buildSide(o, pf) {
    const S = start(o, pf), skin = S.skin, P = S.P, RW = S.RW, up = S.up, act = S.act;
    const cA = skin.a, cHi = skin.b, cD = skin.d, cS = skin.s;
    const ex = o.expression || 'neutral';
    // 远侧小钳（被壳挡住，只露一点）
    P(5, 11, cD); P(4, 12, cA); P(5, 13, cD);
    // 四条短腿（单排、向外撇，走路交替抬 1 格）
    const lph = act === 'walk' ? pf % 4 : 0;
    for (let i = 0; i < SLEG.length; i++) {
      const lift = (lph === 1 && i % 2 === 0) || (lph === 3 && i % 2 === 1) ? 1 : 0;
      const path = SLEG[i];
      for (let j = 0; j < path.length; j++) P(path[j][0], path[j][1] - (j ? lift : 0), j === 0 ? cD : cA);
    }
    // 前臂 + 大钳（跟壳分开画，留一道暗缝，侧面才看得出是钳子）
    const swing = act === 'walk' ? (pf % 4 < 2 ? 0 : 1) : 0;
    const raise = act === 'wave' ? ((pf % 4 < 2) ? 5 : 3) : 0;
    P(20, 9 - swing - raise, cA); P(20, 10 - swing - raise, cA); P(20, 11 - swing - raise, cD);
    claw(21, 5 - swing - raise, BIG, false);                // 前侧大钳，抬在壳前面
    // 壳（前低后高）
    for (const [y, x0, x1] of SIDE) for (let x = x0; x <= x1; x++) {
      let c = cA;
      if (y === 6) c = cHi;                                // 背脊受光
      else if (x >= x1 - 1 && y < 13) c = cD;              // 前端背光
      else if (y >= 12 && x >= 15) c = cD;
      else if (y <= 9 && x <= x0 + 2) c = cHi;             // 后上方受光
      P(x, y, c);
    }
    RW(16, 12, 15, cS);                                    // 肚子
    P(10, 9, cS); P(13, 8, cS); P(16, 11, cS);             // 三个浅斑
    P(12, 12, cD); P(9, 11, cD);
    // 两根眼柄，整体前倾 15°
    const ey = 1 - up, st = 3 - up;
    for (let y = st; y <= 5; y++) P(13, y, cD);            // 远侧眼柄（暗一档）
    P(13, ey, 'w'); P(13, ey + 1, 'w');                    // 远侧眼白（侧面只露一条）
    for (let y = st; y <= 5; y++) P(17, y, cHi);           // 近侧眼柄
    eye(17, ey, ex, true);                                 // 近侧眼睛（略前倾）
    if (ex === 'sleepy') { P(21, ey, 'w'); P(22, ey + 1, 'w'); }   // 打盹的 Z
    const my = 14;                                         // 嘴在壳的前下方
    if (ex === 'happy') { P(18, my, 'k'); P(19, my - 1, 'k'); }
    else if (ex === 'sad') { RW(my - 1, 16, 18, 'k'); P(17, my, 'k'); }
    else if (ex === 'surprised') { RW(my, 17, 18, 'k'); RW(my + 1, 17, 18, 'k'); }
    else RW(my, 16, 18, 'k');
    if (act === 'shiver') { P(8, 13, cD); P(22, 12, cD); }
    return CELL;
  }

  // ─────────────────────────────────────────── 出图
  C.draw = function (g, o) {
    pal();
    o = o || {};
    const size = Math.max(6, o.size || 43);
    K = Math.max(1, Math.round(size / 19));
    const by = Math.round(o.y || 0);
    OX = Math.round(Math.round(o.x || 0) - (GW * K) / 2);
    OY = Math.round(by - (FOOT + 1) * K);
    const t = o.t || 0, pf = Math.floor(t * 12 + 1e-6);
    g.save(); g.imageSmoothingEnabled = false;
    const side = o.facing === 'left' || o.facing === 'right';
    const cells = side ? buildSide(o, pf) : buildFront(o, pf);
    const mirror = o.facing === 'left';
    const X = (gx) => (mirror ? OX + (GW - 1 - gx) * K : OX + gx * K);
    const Y = (gy) => OY + gy * K;
    // 1) 描边：深色往 4 个邻格扩 1 格（先画，本体随后盖住内侧）
    g.fillStyle = pal().crabInk || '#3A1220';
    cells.forEach((c, key) => {
      const x = key % GW, y = (key - x) / GW;
      for (let d = 0; d < 4; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        if (cells.has(ny * GW + nx)) continue;
        g.fillRect(X(nx), Y(ny), K, K);
      }
    });
    // 2) 本体
    const skin = SKIN[Math.min(2, Math.max(0, o.lit || 0))];
    cells.forEach((c, key) => {
      const x = key % GW, y = (key - x) / GW;
      let col;
      if (c === 'a') col = pal()[skin.a];
      else if (c === 'b') col = pal()[skin.b];
      else if (c === 'd') col = pal()[skin.d];
      else if (c === 'w') col = pal().white;
      else if (c === 'k') col = pal().ink;
      else col = pal()[c] || pal()[skin.s];
      g.fillStyle = col;
      g.fillRect(X(x), Y(y), K, K);
    });
    g.restore();
  };

  // 钳尖 / 头顶的屏幕坐标（给道具用）
  C.handAt = function (o) {
    const k = Math.max(1, Math.round(Math.max(6, (o && o.size) || 43) / 19));
    const x0 = Math.round((o && o.x) || 0) - (GW * k) / 2, by = Math.round((o && o.y) || 0);
    return { x: Math.round(x0 + ((o && o.facing === 'left' ? 4 : 26) * k)), y: Math.round(by - 10 * k) };
  };
  C.headAt = function (o) {
    const k = Math.max(1, Math.round(Math.max(6, (o && o.size) || 43) / 19));
    return { x: Math.round((o && o.x) || 0), y: Math.round((o && o.y) || 0) - 19 * k };
  };
})();
