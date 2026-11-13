// 试机用的简化舞台。可为每首歌在此登记任意数量的场景，再在镜头中选择。
window.MV_SCENES = {
  stage: {
    /** 绘制干净的地平线，用来判断重心、手势与飞行方向。 */
    draw(g, u, t, api) {
      const E = api.ENGINE;
      g.fillStyle = E.tone('space', 1); g.fillRect(0, 0, api.W, api.H);
      g.fillStyle = E.tone('space', 0.5); g.fillRect(0, Math.round(api.H * 0.77), api.W, api.H);
    },
  },
};

// 本曲示例道具，两镜共用同一折痕和尖端；主体姿势在 character.js 中。
/** 在世界坐标画一架朝右的纸飞机，纸面和折痕保留整格边缘。 */
window.drawPaperPlane = function (g, x, y, size, E) {
  const k = Math.max(1, Math.round(size / 12));
  const rows = [[0,3],[0,7],[1,12],[2,9],[3,6],[3,4]];
  g.save(); g.translate(Math.round(x), Math.round(y));
  rows.forEach(([left,right], row) => {
    g.fillStyle = E.tone('paper', row < 3 ? 1 : 0.35);
    g.fillRect(left*k, (row-3)*k, (right-left)*k, k);
  });
  g.restore();
};
