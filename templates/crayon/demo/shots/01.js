/* shot 01 · 0.0 → 3.0s · 雪夜街角：阿蟹走进路灯那一圈暖黄光里
   所有随机都走 ENGINE.noise / 固定 key —— 镜头里没有 Math.random。 */
(function () {
  const R = Math.round;
  window.SHOTS.push({
    id: 's01',
    start: 0.0,
    end: 3.0,
    enter: { type: 'cut' },
    note: '雪夜街角，两栋蜡笔房子还醒着，阿蟹踩着薄雪从左往右走进路灯光里。',
    cam: { from: { x: 960, y: 561.6, zoom: 1.00 }, to: { x: 864, y: 594, zoom: 1.06 } },
    bg: { kind: 'night-street', lamp: 1.0, snow: 'light' },
    draw: function (g, u, t, API) {
      const W = API.W, H = API.H, E = API.ENGINE;
      // 远雪在角色后面，近雪在角色前面 —— 两次 fx 就够
      E.fx(g, { kind: 'snow', n: 26, key: 's1far', speed: 0.7, size: 0.85 }, t);
      E.char(g, {
        x: R(API.lerp(W * 0.15, W * 0.42, API.ease(u))), y: R(H * 0.86),
        size: API.MH, facing: 'right', action: 'walk', expression: 'neutral', u: u, t: t,
      });
      E.fx(g, { kind: 'snow', n: 40, key: 's1near', speed: 1.05, size: 1.15 }, t);
    },
  });
})();
