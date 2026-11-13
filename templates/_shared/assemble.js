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
// 查找落在这一输出帧或更早的最近事件，支持跳帧、倒放及分段并行渲染。
function lastCue(times, t) {
  let left = 0, right = times.length;
  const edge = t + 0.5 / CFG.FPS;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (times[mid] <= edge) left = mid + 1;
    else right = mid;
  }
  return left - 1;
}

// 瞬态衰减按秒计，实测拍位可保留摇摆和局部速度变化。
function pulse(track, t, decay = 0.16) {
  const times = window.MV_RHYTHM?.[track] || [];
  let hit;
  if (times.length) {
    const i = lastCue(times, t);
    if (i < 0) return 0;
    hit = times[i];
  } else if (track === 'beats') {
    hit = CFG.OFF + Math.floor((t + 0.5 / CFG.FPS - CFG.OFF) / BEAT) * BEAT;
    if (hit < CFG.OFF) return 0;
  } else return 0;
  return clamp(1 - Math.max(0, t - hit) / Math.max(0.001, decay));
}

const API = { ...window.MV_MOTION, W: CFG.W, H: CFG.H, OW, OH, BEAT, pulse, beatPhase, beatIndex, onBeat, ease, lerp, clamp, ENGINE, CHAR: CHARACTER,
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

// 拍摄模式先画世界，再按整格裁窗，以最近邻采样实现实际推拉。
const filmCanvas = WC ? document.createElement('canvas') : null;
if (filmCanvas) { filmCanvas.width = CFG.W; filmCanvas.height = CFG.H; }

/** 项目场景先铺环境，再交给镜头绘制人物；前后镜独立选择材质色阶。 */
function paintShot(g, shot, u, t, cam, bgCam = cam) {
  ENGINE.useLook?.(shot.look);
  const name = shot.scene ?? (shot.bg ? undefined : window.MV_DIRECTION?.scene);
  if (name) {
    const scene = window.MV_SCENES?.[name];
    if (!scene?.draw) throw new Error('镜头 ' + shot.id + ' 找不到场景：' + name);
    if (ENGINE.id === 'pixel') ENGINE.bg(g, { bg: {kind: 'custom'} }, t, u, bgCam, CFG);
    g.save();
    scene.draw(g, u, t, API, bgCam);
    g.restore();
  } else if (ENGINE.bg) ENGINE.bg(g, shot, t, u, bgCam, CFG);
  shot.draw(g, u, t, API, cam);
}

// ── 画一个镜头：机位在这里统一处理，引擎和镜头脚本只画世界坐标 ─────────
function renderShot(s, time, xform) {
  if (!s) return;
  const u = clamp((time - s.start) / Math.max(1e-6, s.end - s.start));
  const cam = cameraOf(s, u);
  G.save();
  if (xform) xform();
  if (filmCanvas && s.cam?.mode === 'crop') {
    const world = filmCanvas.getContext('2d', { alpha: false });
    const center = { x: CFG.W / 2, y: CFG.H / 2, zoom: 1 };
    world.save();
    world.fillStyle = '#101014';
    world.fillRect(0, 0, CFG.W, CFG.H);
    paintShot(world, s, u, time, cam, center);
    world.restore();
    const zoom = Math.max(1, cam.zoom);
    const w = Math.max(1, Math.round(CFG.W / zoom)), h = Math.max(1, Math.round(CFG.H / zoom));
    const x = clamp(Math.round(cam.x - w / 2), 0, CFG.W - w);
    const y = clamp(Math.round(cam.y - h / 2), 0, CFG.H - h);
    G.imageSmoothingEnabled = false;
    G.drawImage(filmCanvas, x, y, w, h, 0, 0, CFG.W, CFG.H);
    G.restore();
    return;
  }
  G.translate(CFG.W / 2, CFG.H / 2);
  G.scale(cam.zoom, cam.zoom);
  G.translate(-cam.x, -cam.y);
  G.save();
  paintShot(G, s, u, time, cam);
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
// CFG.LYRIC.stagger 打开时逐字显示。增强型 LRC 的字级时间优先，缺失时按句内进度估算。
function charsOf(line, text, words) {
  const s0 = line.s0, s1 = line.s1, n = Math.max(1, text.length);
  const fallbackPop = Math.max(0.10, Math.min(0.20, (s1 - s0) * 0.22));
  const span = Math.max(0.18, (s1 - s0) * 0.58);
  const out = [];
  for (let i = 0; i < n; i++) {
    let t0 = s0 + (n <= 1 ? 0 : span * (i / (n - 1)));
    if (Array.isArray(words) && words[i] && Number.isFinite(Number(words[i].t))) t0 = Number(words[i].t);
    const next = Array.isArray(words) && words[i + 1] && Number.isFinite(Number(words[i + 1].t))
      ? Number(words[i + 1].t) : s1;
    const pop = Array.isArray(words) && words[i] ? Math.max(0.06, Math.min(0.20, next - t0)) : fallbackPop;
    out.push({ ch: text[i], p: clamp((line.t - t0) / pop) });
  }
  return out;
}
function lyricAt(t) {
  const L = window.LYRICS || [];
  const stag = !!(CFG.LYRIC && CFG.LYRIC.stagger);
  for (let i = 0; i < L.length; i++) {
    const [s0, s1, text, words] = L[i];
    if (t >= s0 - 0.02 && t <= s1 - 0.05) {
      const o = { text, t, s0, s1, i, n: L.length, p: clamp((t - s0) / Math.max(0.2, s1 - s0)) };
      if (stag) o.chars = charsOf(o, String(text), words);
      return o;
    }
  }
  return null;
}

// 将片名叠在第一镜上方，保留首句人声、原曲时长和底部歌词的位置。
function drawIntro(t) {
  const d = window.MV_DIRECTION;
  if (!d?.title || t < 0 || t >= d.introEnd) return;
  const p = t / d.introEnd;
  const settle = ease(p / 0.22);
  const exit = ease((p - 0.82) / 0.18);
  const size = Math.round(Math.min(OW * 0.085, OH * 0.10));
  const x = Math.round(OW * (0.06 + 0.025 * settle));
  const y = Math.round(OH * (0.21 - 0.025 * exit));
  const palette = ENGINE.palette || {};
  ctx.save();
  ctx.globalAlpha = 1 - exit;
  ctx.font = '900 ' + size + 'px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textBaseline = 'middle';
  const maxWidth = OW * 0.80;
  const width = Math.min(ctx.measureText(d.title).width, maxWidth);
  const pad = Math.round(size * 0.18);
  ctx.fillStyle = palette.ink || '#171525';
  ctx.fillRect(x - pad, y - size * 0.67, width + 2 * pad, size * 1.34);
  ctx.fillStyle = palette.lampWarm || '#FFD27A';
  ctx.fillRect(x - pad, y + size * 0.67, (width + 2 * pad) * (0.15 + 0.85 * settle), Math.max(2, pad / 3));
  ctx.fillStyle = palette.white || '#FFFFFF';
  ctx.fillText(d.title, x, y, maxWidth);
  ctx.restore();
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
  ENGINE.useLook?.(cur?.look);
  if (ENGINE.endFrame) ENGINE.endFrame(ctx, t, CFG);          // 质感层：纸纹/扫描线/暗角（输出分辨率）
  drawIntro(t);
  const ly = lyricAt(t);
  if (ly) {
    if (ENGINE.id === 'pixel' && window.MV_DIRECTION?.captions === 'plain') {
      // 保留 Remotion 的逐字显现；字幕绘制在输出分辨率。
      const text = ly.chars ? ly.chars.filter(c => c.p > 0).map(c => c.ch).join('') : ly.text;
      defaultLyric(ctx, { ...ly, text, fullText: ly.text });
    } else if (ENGINE.lyric) ENGINE.lyric(ctx, ly, CFG);             // 画风自己的歌词排版
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
  let size = Math.round(OH * 0.062);
  const family = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif';
  g.font = `700 ${size}px ${family}`;
  // 用完整歌词测宽，保证逐字出现时字号稳定，也为竖屏留出两侧空间。
  if (line.fullText) {
    const width = g.measureText(line.fullText).width;
    if (width > OW * 0.9) {
      size = Math.max(1, Math.floor(size * OW * 0.9 / width));
      g.font = `700 ${size}px ${family}`;
    }
  }
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
  // 本地着色器、三维场景或图像可在首次截图前准备；同一场景只初始化一次。
  const used = new Set(SHOTS.map(s => s.scene ?? (s.bg ? undefined : window.MV_DIRECTION?.scene)));
  for (const name of used) if (name) await window.MV_SCENES?.[name]?.setup?.(CFG, API);
  drawFrame(0);
  return true;
})();
window.renderAt = async (t) => { drawFrame(t); return cv.toDataURL('image/jpeg', 0.95); };
window.drawFrame = drawFrame;
