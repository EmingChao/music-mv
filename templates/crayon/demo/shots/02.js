/* shot 02 · 3.0 → 6.0s · 同一街角：阿蟹停下抬头，灯更亮，雪变少 */
(function () {
  const R = Math.round;
  window.SHOTS.push({
    id: 's02',
    start: 3.0,
    end: 6.0,
    enter: { type: 'whip', dir: 'left', dur: 0.28 },
    note: '阿蟹停在路灯下抬头看——灯比刚才更亮，雪小了，像它把夜里的光都收进了眼睛。',
    cam: { from: { x: 864, y: 594, zoom: 1.06 }, to: { x: 900, y: 578, zoom: 1.02 } },
    bg: { kind: 'night-street', lamp: 1.35, snow: 'less' },
    draw: function (g, u, t, API) {
      const W = API.W, H = API.H, E = API.ENGINE;
      E.fx(g, { kind: 'snow', n: 14, key: 's2far', speed: 0.6, size: 0.8 }, t);
      E.char(g, {
        x: R(W * 0.5), y: R(H * 0.86), size: API.MH, facing: 'right',
        action: 'look-up', expression: u < 0.35 ? 'neutral' : 'happy', u: u, t: t,
      });
      E.fx(g, { kind: 'snow', n: 18, key: 's2near', speed: 0.95, size: 1.0 }, t);
      E.fx(g, { kind: 'sparkle', n: 8, key: 's2gl', x0: W * 0.56, x1: W * 0.71,
        y0: H * 0.28, y1: H * 0.46, color: '#FFE9A8', size: 1.0 }, t);
    },
  });
})();
