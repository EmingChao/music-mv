/* shot 02 · 3.0 → 6.0s · 同一个街角同一盏灯，阿蟹停下来抬头看 */
(function () {
  const R = Math.round;
  window.SHOTS.push({
    id: 's02',
    start: 3.0,
    end: 6.0,
    enter: { type: 'whip', dir: 'left', dur: 0.26 },
    note: '阿蟹停在灯下抬头看，雪小了下去，灯比刚才更亮。',
    cam: { from: { x: 168, y: 99.0, zoom: 1.06 }, to: { x: 160, y: 93.6, zoom: 1.02 } },
    bg: { kind: 'night-street', lamp: { x: 84, y: 71, base: 152, on: 1, strength: 1.9 } },
    draw: function (g, u, t, API) {
      const W = API.W, H = API.H;
      API.ENGINE.char(g, {
        x: R(W * 0.5), y: R(H * 0.86), size: API.MH, facing: 'right',
        action: 'look-up', expression: u < 0.35 ? 'neutral' : 'happy', u: u, t: t,
      });
      API.ENGINE.fx(g, { kind: 'snow', n: 8, front: false, key: 's2far', speed: 0.7 }, t);
      API.ENGINE.fx(g, { kind: 'snow', n: 14, front: true, key: 's2near', speed: 0.85 }, t);
    },
  });
})();
