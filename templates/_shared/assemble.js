// ═══════════════════════════════════════════════════════════════════════════
//  assemble.js —— 装配 + 逐帧渲染。三种画风共用，不要在项目里改这个文件。
//  依赖：window.CFG、window.SHOTS、window.ENGINE（engine.js）、
//        window.CHARACTER（character.js，可选）、window.LYRICS（lyrics.js，可选）
//  对外：window.sceneReady（Promise）、window.renderAt(t) → dataURL
//
//  两种画布模式：
//    普通（拼贴、蜡笔）：镜头直接画在输出画布上。
//    像素：CFG.OUT 存在时，镜头画在 W×H 的小画布上（整数倍最近邻放大到 OUT），
//          歌词和质感层画在输出分辨率的清晰层上 —— 画面是像素的，中文字是清楚的。
// ═══════════════════════════════════════════════════════════════════════════
const CFG = window.CFG;
const OW = CFG.OUT ? CFG.OUT.w : CFG.W;      // 输出宽高
const OH = CFG.OUT ? CFG.OUT.h : CFG.H;
const cv = document.getElementById('c') || document.body.appendChild(document.createElement('canvas'));
cv.id = 'c'; cv.width = OW; cv.height = OH;
const ctx = cv.getContext('2d', { alpha: false });       // 输出画布（清晰层）
let G = ctx;                                            // 当前镜头画在哪张画布上
let WC = null;                                          // 像素模式的小画布
if (CFG.OUT) {
  WC = document.createElement('canvas'); WC.width = CFG.W; WC.height = CFG.H;
  G = WC.getContext('2d', { alpha: false });
  G.imageSmoothingEnabled = false;
}
const BEAT = 60 / CFG.BPM;
const SHOTS = window.SHOTS = window.SHOTS || [];
const ENGINE = window.ENGINE = window.ENGINE || {};
const CHARACTER = window.CHARACTER || null;

// ── 小工具（镜头脚本里直接用）──────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, u) => a + (b - a) * u;
const ease = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
const beatPhase = (t) => (((t - CFG.OFF) / BEAT) % 1 + 1) % 1;   // 这一拍走到哪了 0→1
const beatIndex = (t) => Math.floor((t - CFG.OFF) / BEAT);       // 第几拍
const onBeat = (t, tol = 0.06) => beatPhase(t) < tol || beatPhase(t) > 1 - tol;
const API = { W: CFG.W, H: CFG.H, OW, OH, BEAT, beatPhase, beatIndex, onBeat, ease, lerp, clamp, ENGINE, CHAR: CHARACTER,
              SAFE_Y: CFG.H * (1 - CFG.SAFE_BOTTOM),
              cx: CFG.W / 2, cy: CFG.H / 2,                                   // 画面中心
              MH: CFG.H * 0.24 };                                             // 角色中景身高参考

// ── 镜头查找 + 自检 ────────────────────────────────────────────────────
function sortedShots() { return SHOTS.slice().sort((a, b) => a.start - b.start); }
function shotAt(t) {
  const S = sortedShots();
  for (let i = 0; i < S.length; i++) if (t >= S[i].start && t < S[i].end) return S[i];
  return S.length ? S[S.length - 1] : null;
}
function validate() {
  const S = sortedShots(), bad = [];
  if (!S.length) bad.push('一个镜头都没有：shots/*.js 里要 SHOTS.push({...})，并且 index.html 里要有 <script src="shots/xx.js">');
  S.forEach((s, i) => {
    if (!(s.end > s.start)) bad.push(`镜头 ${s.id}：end(${s.end}) 不大于 start(${s.start})`);
    if (i > 0 && Math.abs(s.start - S[i - 1].end) > 0.001) bad.push(`镜头 ${s.id}：和上一个没接上 ${S[i - 1].end} → ${s.start}（中间会黑）`);
    if (typeof s.draw !== 'function') bad.push(`镜头 ${s.id}：没有 draw()`);
  });
  if (S.length && Math.abs(S[S.length - 1].end - CFG.DURATION) > 0.05)
    bad.push(`最后一个镜头 end=${S[S.length - 1].end}，和 CFG.DURATION=${CFG.DURATION} 对不上`);
  if (bad.length) console.warn('⚠ 镜头自检没过：\n - ' + bad.join('\n - '));
  return !bad.length;
}

// ── 机位：一镜只做一种慢动作 ───────────────────────────────────────────
// shot.cam = { from:{x,y,zoom}, to:{x,y,zoom} }，世界坐标，zoom=1 表示画面正好 W×H。
// 不写就默认中心不动 + 极慢推近 4%：比完全静止耐看，又不会晃。
function cameraOf(s, u) {
  const c = s.cam || {};
  const f = Object.assign({ x: CFG.W / 2, y: CFG.H / 2, zoom: 1 }, c.from || {});
  const o = Object.assign({}, f, { zoom: 1.04 }, c.to || {});
  const k = ease(u);
  return { x: lerp(f.x, o.x, k), y: lerp(f.y, o.y, k), zoom: lerp(f.zoom, o.zoom, k) };
}

// ── 画一个镜头：机位在这里统一处理，引擎和镜头脚本只画世界坐标 ─────────
function renderShot(s, time, xform) {
  if (!s) return;
  const u = clamp((time - s.start) / Math.max(1e-6, s.end - s.start));
  const cam = cameraOf(s, u);
  G.save();
  if (xform) xform();
  G.translate(CFG.W / 2, CFG.H / 2);
  G.scale(cam.zoom, cam.zoom);
  G.translate(-cam.x, -cam.y);
  G.save();
  if (ENGINE.bg) ENGINE.bg(G, s, time, u, cam, CFG);
  s.draw(G, u, time, API, cam);
  G.restore();
  G.restore();
}

// ── 转场：两镜画在同一帧上。写 shot.enter 才用，不写就是硬切 ────────────
// enter = { type:'cut'|'whip'|'lift'|'card'|'flash'|'fade'|'zoom', dur:0.26, dir:'left'|'right'|'down' }
function drawTransition(prev, cur, t) {
  const e = cur.enter || {}, type = e.type || 'cut';
  const dur = e.dur == null ? 0.3 : e.dur;
  const p = clamp((t - cur.start) / Math.max(1e-6, dur));
  const k = ease(p);
  if (type === 'cut' || p >= 1 || !prev) { renderShot(cur, t); return; }
  const prevT = prev.end - 0.5 / CFG.FPS;              // 上一镜的最后一帧
  if (type === 'whip') {                                // 横向甩：带三层拖影
    const sgn = e.dir === 'right' ? 1 : -1, off = CFG.W * sgn;
    for (let i = 2; i >= 0; i--) {
      G.globalAlpha = i === 0 ? 1 : 0.3;
      renderShot(prev, prevT, () => G.translate(off * k - off * 0.3 * i, 0));
      renderShot(cur, t, () => G.translate(-off * (1 - k) + off * 0.3 * i, 0));
    }
    G.globalAlpha = 1;
  } else if (type === 'lift') {                         // 纵向提
    const off = CFG.H * (e.dir === 'down' ? -1 : 1);
    renderShot(prev, prevT, () => G.translate(0, -off * k));
    renderShot(cur, t, () => G.translate(0, off * (1 - k)));
  } else if (type === 'card') {                         // 新画面当一张卡片滑进来
    renderShot(prev, prevT);
    const dx = (e.dir === 'left' ? -1 : 1) * CFG.W * (1 - k);
    G.save(); G.beginPath();
    G.rect(CFG.W * 0.055 + dx, CFG.H * 0.05, CFG.W * 0.89, CFG.H * 0.88); G.clip();
    renderShot(cur, t, () => G.translate(dx, 0));
    G.restore();
  } else if (type === 'zoom') {                         // 穿过去
    renderShot(prev, prevT, () => { const z = 1 + 2.2 * k; G.translate(CFG.W / 2, CFG.H / 2); G.scale(z, z); G.translate(-CFG.W / 2, -CFG.H / 2); });
    G.globalAlpha = k; renderShot(cur, t); G.globalAlpha = 1;
  } else if (type === 'fade') {                         // 整屏叠化（尽量少用）
    renderShot(prev, prevT); G.globalAlpha = k; renderShot(cur, t); G.globalAlpha = 1;
  } else if (type === 'flash') {                        // 白闪一下再切
    if (p < 0.5) {
      renderShot(prev, prevT);
      G.globalAlpha = Math.max(0, 1 - Math.abs(p - 0.25) / 0.25);
      G.fillStyle = '#FFF6D8'; G.fillRect(0, 0, CFG.W, CFG.H); G.globalAlpha = 1;
    } else renderShot(cur, t);
  }
}

// ── 歌词：挑出当前这句，交给引擎排版（排版是画风的一部分）──────────────
function lyricAt(t) {
  const L = window.LYRICS || [];
  for (let i = 0; i < L.length; i++) {
    const [s0, s1, text] = L[i];
    if (t >= s0 - 0.02 && t <= s1 - 0.05)
      return { text, t, s0, s1, i, n: L.length, p: clamp((t - s0) / Math.max(0.2, s1 - s0)) };
  }
  return null;
}

// ── 一帧 ───────────────────────────────────────────────────────────────
function drawFrame(t) {
  const S = sortedShots(), cur = shotAt(t);
  G.setTransform(1, 0, 0, 1, 0, 0);
  G.globalAlpha = 1;
  G.fillStyle = '#101014'; G.fillRect(0, 0, CFG.W, CFG.H);
  const prev = cur ? S[S.indexOf(cur) - 1] : null;
  const inTrans = cur && cur.enter && cur.enter.dur > 0 && t < cur.start + cur.enter.dur && prev;
  if (inTrans) drawTransition(prev, cur, t); else renderShot(cur, t);
  G.setTransform(1, 0, 0, 1, 0, 0); G.globalAlpha = 1;
  if (WC) {                                   // 像素模式：小画布放大到输出
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(WC, 0, 0, CFG.W, CFG.H, 0, 0, OW, OH);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  if (ENGINE.endFrame) ENGINE.endFrame(ctx, t, CFG);          // 质感层：纸纹/扫描线/暗角（输出分辨率）
  const ly = lyricAt(t);
  if (ly) {
    if (ENGINE.lyric) ENGINE.lyric(ctx, ly, CFG);             // 画风自己的歌词排版
    else defaultLyric(ctx, ly);
  }
  if (CFG.DEBUG) {
    ctx.strokeStyle = 'rgba(255,80,80,.85)'; ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, OW - 2, OH * (1 - CFG.SAFE_BOTTOM));
    ctx.fillStyle = 'rgba(255,80,80,.95)'; ctx.font = '28px sans-serif';
    ctx.fillText(`shot ${cur ? cur.id : '-'} | t=${t.toFixed(2)} | 红线下是歌词区`, 20, 36);
  }
}

// 兜底歌词（引擎没写 lyric 时用）：先保证能看，再谈好看
function defaultLyric(g, line) {
  const size = Math.round(OH * 0.062);
  g.font = `700 ${size}px "PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif`;
  g.textAlign = CFG.LYRIC.align; g.textBaseline = 'middle';
  const y = OH * CFG.LYRIC.bottom;
  g.lineWidth = size * 0.22; g.strokeStyle = CFG.LYRIC.ink; g.lineJoin = 'round';
  g.strokeText(line.text, OW / 2, y);
  g.fillStyle = CFG.LYRIC.color; g.fillText(line.text, OW / 2, y);
}

// ── 就绪 & 渲帧接口（scripts/render_frames.mjs 等这两个）────────────────
window.sceneReady = (async () => {
  validate();
  if (ENGINE.setup) await ENGINE.setup(CFG, API);
  if (CHARACTER && CHARACTER.setup) await CHARACTER.setup(CFG, API);
  drawFrame(0);
  return true;
})();
window.renderAt = async (t) => { drawFrame(t); return cv.toDataURL('image/jpeg', 0.95); };
window.drawFrame = drawFrame;
