// 可随机访问的姿势轨。各节点格式为 [时间, 数值通道数组]，时间可用秒或归一化进度。
window.MV_MOTION = {
  /** 两姿势间平滑插值；首尾与相同姿势保持，绝不把进度取模。 */
  poseAt(time, keys) {
    if (time <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [end, next] = keys[i];
      if (time > end) continue;
      const [start, prev] = keys[i-1];
      const p = (time-start) / (end-start), eased = p*p*(3-2*p);
      return prev.map((v, j) => v + (next[j]-v)*eased);
    }
    return keys[keys.length-1][1];
  },
  /** 选择一次动作落点。旧写法传轨道名，新写法可传 {track, at, index, offset, fraction}。 */
  actionCue(trackOrCue, start, end, fraction = 0.6) {
    const cue = typeof trackOrCue === 'string' ? { track: trackOrCue, fraction } : { fraction, ...(trackOrCue || {}) };
    const duration = end - start;
    const track = cue.track || 'beats';
    const times = window.MV_RHYTHM?.[track] || [];
    const explicit = Number.isFinite(Number(cue.at)) ? Number(cue.at)
      : Number.isFinite(Number(cue.time)) ? Number(cue.time)
      : Number.isFinite(Number(cue.offset)) ? start + Number(cue.offset)
      : Number.isInteger(cue.index) && times[cue.index] !== undefined ? Number(times[cue.index]) : null;
    if (explicit !== null && explicit >= start && explicit <= end) {
      const pad = Math.min(0.0001, Math.max(0.000001, duration / 1000));
      return Math.min(end - pad, Math.max(start + pad, explicit));
    }
    const target = start + duration * (Number.isFinite(Number(cue.fraction)) ? Number(cue.fraction) : 0.6);
    const margin = duration * 0.15;
    let best = target, distance = Infinity;
    for (const when of times) {
      if (when <= start + margin) continue;
      if (when >= end - margin) break;
      if (Math.abs(when - target) < distance) { best = when; distance = Math.abs(when - target); }
    }
    return best;
  },

};
