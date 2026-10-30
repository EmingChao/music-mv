/* 镜 02 · 3.0 → 6.0s · 同一街角，阿蟹停在灯下抬头看
   拼贴风用"卡片滑入"最搭：像有人把新的一张纸从左边推上桌。 */
(function () {
  'use strict';
  const W = (window.CFG && window.CFG.W) || 1920;
  const H = (window.CFG && window.CFG.H) || 1080;
  const street = window.COLLAGE_STREET || function () { return { groundY: H * 0.86, lx: W * 0.548, hy: H * 0.44, ls: H * 0.46 }; };

  window.SHOTS.push({
    id: '02',
    start: 3.0,
    end: 6.0,
    note: '同一街角：阿蟹停在 x=0.5W 抬头，灯更亮、雪变少；表情在 u=0.35 时从 neutral 换到 happy（抬头发呆 → 笑）。',
    cam: { from: { x: W * 0.5, y: H * 0.54, zoom: 1.06 }, to: { x: W * 0.515, y: H * 0.545, zoom: 1.12 } },
    enter: { type: 'card', dir: 'left', dur: 0.32 },
    bg: { sky: ['#233868', '#3A5A8A'] },
    draw: function (g, u, t, API, cam) {
      const E = API.ENGINE;
      // 灯更亮（1.55 倍），雪更少（远 18 / 中 12）
      const s = street(g, t, API, { lit: 1.45, far: 18, mid: 12, rays: true });
      const ex = u < 0.35 ? 'neutral' : 'happy';
      E.char(g, { x: W * 0.5, y: s.groundY, size: API.MH * 1.04, facing: 'right', expression: ex, action: 'look-up', u: (t * 0.34) % 1, t: t });
      // 前景两三片近雪
      E.fx(g, { kind: 'snow', n: 6, seed: 'snowNear2', top: -80, bot: H + 80 }, t);
    }
  });
})();
