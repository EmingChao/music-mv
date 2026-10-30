/* shot 01 · 0.0 → 3.0s · 雪夜街角，阿蟹从左边走进路灯的光里 */
(function () {
  const R = Math.round;
  window.SHOTS.push({
    id: 's01',
    start: 0.0,
    end: 3.0,
    enter: { type: 'cut' },
    note: '雪夜街角，阿蟹踩着薄雪从左边走进路灯那一圈暖黄里。',
    cam: { from: { x: 160, y: 93.6, zoom: 1.00 }, to: { x: 144, y: 99.0, zoom: 1.06 } },
    bg: { kind: 'night-street', lamp: { x: 84, y: 71, base: 152, on: 1, strength: 1.0 } },
    draw: function (g, u, t, API) {
      const W = API.W, H = API.H;
      const x = API.lerp(W * 0.15, W * 0.42, API.ease(u));
      API.ENGINE.char(g, {
        x: R(x), y: R(H * 0.86), size: API.MH, facing: 'right',
        action: 'walk', expression: 'neutral', u: u, t: t,
      });
      API.ENGINE.fx(g, { kind: 'snow', n: 22, front: false, key: 's1far', speed: 0.75 }, t);
      API.ENGINE.fx(g, { kind: 'snow', n: 38, front: true, key: 's1near', speed: 1.0 }, t);
    },
  });
})();
