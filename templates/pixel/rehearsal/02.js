// 匹配纸飞机的朝向切入近景，接住上镜的余势。
window.SHOTS.push({
  id: 2, start: START_SEC, end: END_SEC, scene: 'stage', rehearsal: true,
  cam: { to: { zoom: 1 } }, note: '纸飞机掠过镜头，滑翔下降，触地后留在落点。',
  /** 飞行、着地、滑行结束各有独立姿态，停顿不依赖循环。 */
  draw(g, u, t, api) {
    const land = api.actionCue('kick', this.start, this.end, 0.72);
    const p = t < land ? 0.72 * (t-this.start) / (land-this.start)
      : 0.72 + 0.28 * (t-land) / (this.end-land);
    const [x, y, scale] = api.poseAt(p, [
      [0, [-0.10,0.43,0.38]], [0.24, [0.22,0.32,0.45]], [0.54, [0.48,0.55,0.31]],
      [0.72, [0.67,0.745,0.20]], [0.86, [0.73,0.748,0.18]], [1, [0.73,0.748,0.18]],
    ]);
    window.drawPaperPlane(g, x*api.W, y*api.H, scale*api.H, api.ENGINE);
  },
});
