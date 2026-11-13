// 表演镜：沿上镜行进方向切近人物，重拍压肩，随后抬手回应。
window.SHOTS.push({
  id: 2, start: START_SEC, end: END_SEC,
  bg: { kind: 'metro' },
  cam: { mode: 'crop', from: { zoom: 1.10 }, to: { zoom: 1.25 } },
  note: '人物转向观众，近景接住第一句。',
  /** 听见身后的声音后停步、向声源转头、抬手回应，再回到静止姿势。 */
  draw(g, u, t, api) {
    const turn = api.actionCue('snare', this.start, this.end, 0.5);
    const before = t < turn;
    const p = before ? 0.5 * (t-this.start) / (turn-this.start)
      : 0.5 + 0.5 * (t-turn) / (this.end-turn);
    const [x, height] = api.poseAt(p, [
      [0,[0.41,0.44]], [0.40,[0.54,0.43]], [0.5,[0.54,0.46]], [1,[0.55,0.46]],
    ]);
    const action = p < 0.4 ? 'walk' : p < 0.5 ? 'stand' : p < 0.76 ? 'wave' : 'stand';
    api.ENGINE.char(g, {x: api.W*x, y: api.H*0.82, size: api.H*height,
      facing: before ? 'right' : 'front', expression: before ? 'neutral' : 'happy',
      action, u: p, t: p < 0.76 ? t : turn});
  },
});
