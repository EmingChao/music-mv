// 这个剪影用于动作排练；按本曲人物的轮廓、服装与习惯重画。
window.CHARACTER = {
  name: '投掷者', desc: '压低重心、向后引臂、向前送腕',
  ACTIONS: ['stand', 'windup', 'release', 'follow'], EXPRESSIONS: ['neutral'],
  /** 以脚底为锚点，关节坐标由同一时刻的姿势决定，停住时保持原姿势。 */
  draw(g, o) {
    const E = window.ENGINE;
    const pose = o.pose || ({stand: [0, 4, -13], windup: [-2, -8, -16],
      release: [3, 11, -17], follow: [2, 8, -10]}[o.action] || [0, 4, -13]);
    const [lean, wristX, wristY] = pose;
    const unit = Math.max(1, Math.round(o.size / 23));
    g.save();
    g.translate(Math.round(o.x), Math.round(o.y));
    g.scale(o.facing === 'left' ? -unit : unit, unit);
    const ink = E.tone('figure', 0), coat = E.tone('figure', 0.52), rim = E.tone('figure', 1);
    /** 用整格笔触连接关节，斜肢在放大时仍有像素边缘。 */
    function limb(ax, ay, bx, by, width, color) {
      g.fillStyle = color;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
      for (let i = 0; i <= steps; i++) {
        g.fillRect(Math.round(ax + (bx - ax) * i / steps), Math.round(ay + (by - ay) * i / steps), width, width);
      }
    }
    const shoulder = Math.round(lean);
    limb(-1,-9,-5,-2,2,ink); limb(0,-9,4,-2,2,ink);
    limb(-5,-2,-3,-2,2,ink); limb(4,-2,6,-2,2,ink);
    limb(-1,-11,shoulder-2,-16,5,coat);
    g.fillStyle = ink; g.fillRect(shoulder-1,-22,5,5); g.fillRect(shoulder+1,-20,4,2);
    g.fillStyle = rim; g.fillRect(shoulder+2,-20,2,2);
    const elbowX = Math.round((shoulder + wristX) / 2 - 1);
    const elbowY = Math.round((wristY - 15) / 2 + 2);
    limb(shoulder,-15,elbowX,elbowY,3,coat);
    limb(elbowX,elbowY,wristX,wristY,2,rim);
    g.restore();
  },
};
