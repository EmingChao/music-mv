/* 镜 01 · 0.0 → 3.0s · 雪夜街角，阿蟹从左边走过来
   画法全交给引擎：房子/路灯/树/篱笆是 sprite（一张张纸片），
   雪是 fx（白纸屑小方块），暖光是 2–3 层低透明暖黄圆纸片叠的，不用 shadowBlur。 */
(function () {
  'use strict';
  const W = (window.CFG && window.CFG.W) || 1920;
  const H = (window.CFG && window.CFG.H) || 1080;

  // 一片撕圆纸（灯下的雪地暖斑用）
  function ell(g, E, x, y, rx, ry, color, alpha) {
    const n = 13, pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      pts.push([x + Math.cos(a) * rx, y + Math.sin(a) * ry]);
    }
    E.piece(g, { pts: pts, color: color, paper: 'tissue', alpha: alpha, amp: 5, core: 0, margin: 0, jit: 2.2, shadow: { a: 0 } });
  }

  // 同一条街角（两镜共用；灯亮度和雪量由 02 传参放大）
  window.COLLAGE_STREET = function (g, t, API, o) {
    o = o || {};
    const E = API.ENGINE, lit = o.lit === undefined ? 1 : o.lit;
    const groundY = H * 0.86;
    // 后排建筑：一栋牛皮纸、一栋暗红砖纸
    E.sprite(g, { kind: 'house', x: W * 0.155, y: H * 0.735, size: H * 0.34, color: '#8A6340', color2: '#9C4537', seed: 'hA' });
    E.sprite(g, { kind: 'house', x: W * 0.318, y: H * 0.752, size: H * 0.29, color: '#7C5C4A', color2: '#8E3F31', wide: 0.92, seed: 'hB' });
    // 松树 / 篱笆 / 路牌
    E.sprite(g, { kind: 'tree', x: W * 0.052, y: H * 0.775, size: H * 0.30, seed: 't1' });
    E.sprite(g, { kind: 'tree', x: W * 0.405, y: H * 0.792, size: H * 0.235, seed: 't2' });
    E.sprite(g, { kind: 'fence', x: W * 0.705, y: H * 0.802, size: H * 0.21, seed: 'f1' });
    E.sprite(g, { kind: 'sign', x: W * 0.598, y: H * 0.815, size: H * 0.195, seed: 'sg' });
    // 远层雪
    E.fx(g, { kind: 'snow', n: o.far === undefined ? 38 : o.far, seed: 'snowFar', top: -60, bot: H * 0.80, sz: 0.7 }, t);
    // 路灯：灯罩黄纸 + 纸砂暖光 + 灯下雪地暖斑
    const lx = W * 0.548, ly = H * 0.845, ls = H * 0.46, hy = ly - ls * 0.93;
    E.sprite(g, { kind: 'lamp', x: lx, y: ly, size: ls, lit: true, seed: 'lamp' });
    E.glow(g, { x: lx, y: hy, r: H * 0.16 * lit, color: '#FFD46A', strength: 0.9 * lit });
    ell(g, E, lx, groundY - H * 0.012, H * 0.135 * lit, H * 0.030 * lit, '#F9DF92', 0.20);
    ell(g, E, lx, groundY - H * 0.028, H * 0.085 * lit, H * 0.022 * lit, '#FFD46A', 0.20);
    // 灯下的光锥（三片很淡的暖黄薄纸，顶点在灯罩上；画在角色之前）
    if (o.rays) {
      E.fx(g, { kind: 'light-ray', px: lx, py: hy, n: 3, len: (groundY - hy) * 1.04, w0: 20, w1: 128, spread: 0.30, alpha: 0.085, color: '#FFD46A' }, t);
    }
    // 雪堆：几片撕出来的白纸压在雪地上（下面那 15% 留给歌词，所以都放高一点）
    const mounds = [[0.06, 0.86], [0.20, 0.905], [0.36, 0.855], [0.66, 0.90], [0.86, 0.86], [0.94, 0.82]];
    for (let i = 0; i < mounds.length; i++) {
      const mx = mounds[i][0] * W, my = mounds[i][1] * H, mw = H * (0.05 + (i % 3) * 0.014);
      ell(g, E, mx, my, mw, mw * 0.36, '#FAF5E7', 1);
      ell(g, E, mx - mw * 0.30, my - mw * 0.10, mw * 0.45, mw * 0.20, '#FFFCF2', 1);
    }
    // 中层雪
    E.fx(g, { kind: 'snow', n: o.mid === undefined ? 26 : o.mid, seed: 'snowMid', top: -60, bot: groundY + 40, sz: 1.0 }, t);
    return { lx: lx, ly: ly, ls: ls, hy: hy, groundY: groundY };
  };

  window.SHOTS.push({
    id: '01',
    start: 0.0,
    end: 3.0,
    note: '雪夜街角：深蓝牛皮纸天、旧报纸剪的弯月、两栋纸房子和路灯立在撕纸地平线上；阿蟹从 x=0.28W 走到 0.42W，雪是带旋转的白纸屑。',
    cam: { from: { x: W / 2, y: H * 0.52, zoom: 1.0 }, to: { x: W * 0.45, y: H * 0.55, zoom: 1.06 } },
    enter: { type: 'cut' },
    bg: { sky: ['#22386A', '#33527F'] },
    draw: function (g, u, t, API, cam) {
      const E = API.ENGINE;
      const s = window.COLLAGE_STREET(g, t, API, { lit: 1, far: 34, mid: 24 });
      // 主角：从左边走进来，脚踩 y=0.86H
      const cx = (0.28 + (0.42 - 0.28) * u) * W;
      E.char(g, { x: cx, y: s.groundY, size: API.MH, facing: 'right', expression: 'neutral', action: 'walk', u: (t * 1.5) % 1, t: t });
      // 前景大雪片（压在角色前面，做出前后景纵深）
      E.fx(g, { kind: 'snow', n: 11, seed: 'snowNear', top: -80, bot: H + 80 }, t);
    }
  });
})();
