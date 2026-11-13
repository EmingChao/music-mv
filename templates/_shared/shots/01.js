// 建立镜：人物从远处进入表演位置，侧移的列车给观众方向参照。
window.SHOTS.push({
  id: 1, start: START_SEC, end: END_SEC,
  bg: { kind: 'metro' },
  cam: { to: { zoom: 1 } },
  note: '进站，片名出现在移动的车窗上方。',
  /** 走位按镜内进度变化，落脚按音乐拍位变化。 */
  draw(g, u, t, api) {
    const landing = Math.max(api.pulse('kick', t, 0.16), 0.65 * api.pulse('beats', t, 0.16));
    api.ENGINE.char(g, {
      x: api.W * (0.18 + 0.40 * api.ease(u)), y: api.H * (0.80 - 0.014 * (1 - landing)),
      size: api.H * (0.20 + 0.09 * u), facing: 'right', action: 'walk', expression: 'neutral', t, u,
    });
  },
});
