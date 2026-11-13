// 动作试镜。把这个动词、道具与表演轮廓替换为本曲歌词里的具体事件。
window.SHOTS.push({
  id: 1, start: START_SEC, end: END_SEC, scene: 'stage', rehearsal: true,
  cam: { to: { zoom: 1 } }, note: '犹豫，向后引臂，纸飞机在选中的鼓点离手。',
  /** 选择镜内的一记鼓作为出手时刻，纸飞机离手后继续飞。 */
  draw(g, u, t, api) {
    const duration = this.end - this.start;
    const release = api.actionCue('snare', this.start, this.end, 0.62);
    const phase = t < release ? (t-this.start) / (release-this.start) * 0.62
      : 0.62 + (t-release) / (this.end-release) * 0.38;
    const pose = api.poseAt(phase, [
      [0, [0, 4, -13]], [0.22, [0, 4, -13]], [0.50, [-3, -8, -17]],
      [0.62, [3, 11, -17]], [0.81, [2, 8, -10]], [1, [1, 6, -9]],
    ]);
    const baseX = api.W * 0.38, ground = Math.round(api.H * 0.77);
    const size = Math.round(api.H * 0.49), unit = Math.max(1, Math.round(size / 23));
    api.ENGINE.char(g, { x: baseX, y: ground, size, facing: 'right', pose, t, u });
    const flight = Math.max(0, (t-release) / duration);
    const handX = flight > 0 ? 11 : pose[1], handY = flight > 0 ? -17 : pose[2];
    window.drawPaperPlane(g, baseX+unit*handX+flight*api.W, ground+unit*handY-flight*api.H*0.38, size*0.36, api.ENGINE);
  },
});
