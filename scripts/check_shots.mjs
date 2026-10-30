#!/usr/bin/env node
// check_shots.mjs <项目目录> —— 镜头装配自检。**不渲帧**，只查那些"渲完才发现"的错。
// 全部过了才允许开始渲整片：退出码 0 = PASS，1 = FAIL。输出是一张 PASS/FAIL 表，照着修就行。
//
//   node scripts/check_shots.mjs work/my-mv
//
// 查什么：
//   1. index.html 里列出的 shots/*.js 都存在；shots/ 里的文件都忘了列（漏列 = 这个镜头不出现在片子里）
//   2. 镜头首尾相接、end>start、draw 是函数、最后一个 end == CFG.DURATION
//   3. 每个镜头的 draw() 真的跑得起来（用假 ctx 空跑 u=0/0.5/1，抓 ReferenceError/TypeError）
//   4. 镜头里没有 Math.random / Date.now / setTimeout / setInterval / requestAnimationFrame（画面必须只由 t 决定）
//   5. 没有 p5 / Three / WebGL / CDN 引用（弱模型环境里这些必挂）
//   6. engine.js 该有的画法函数都在
//   7. lyrics.js 的时间轴：单调、不超片长、每句 ≥0.6s、不超过 16 字
//   8. 单文件行数（>400 行说明该拆镜头了）
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const proj = path.resolve(process.argv[2] || '.');
const R = [];                       // [ok, 名字, 说明]
const ok = (n, m = '') => R.push([true, n, m]);
const bad = (n, m = '') => R.push([false, n, m]);
const warn = (n, m = '') => R.push([null, n, m]);
const rel = (p) => path.relative(proj, p) || p;
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);

// ── 0. 文件 ────────────────────────────────────────────────────────────
const idxPath = path.join(proj, 'index.html');
const idx = read(idxPath);
if (!idx) { console.log(`✗ 没有 ${idxPath}`); process.exit(1); }
// 先取 <script src>：engine/character 可能在别的目录（demo 里是 ../engine.js）
const srcs = [...idx.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b[^>]*?\bsrc="([^"]+)"/g)].map((m) => m[1]);
const pick = (name) => {
  const s = srcs.find((x) => x === name || x.endsWith('/' + name));
  return s ? read(path.join(proj, s)) : null;
};
const eng = pick('engine.js');
const chr = pick('character.js');
const lyr = pick('lyrics.js') || read(path.join(proj, 'lyrics.js'));

// ── 1. CFG ─────────────────────────────────────────────────────────────
const num = (re, d) => { const m = idx.match(re); return m ? Number(m[1]) : d; };
const CFG = {
  W: num(/\bW:\s*(\d+)/, 1920), H: num(/\bH:\s*(\d+)/, 1080),
  DURATION: num(/DURATION:\s*([\d.]+)/, 0), BPM: num(/BPM:\s*([\d.]+)/, 120),
  OUT: /\bOUT:\s*\{/.test(idx) ? { w: num(/OUT:\s*\{\s*w:\s*(\d+)/, 1920), h: num(/OUT:\s*\{\s*h:\s*(\d+)/, 1080) } : null,
};
if (CFG.DURATION > 0) ok('CFG', `${CFG.W}×${CFG.H}${CFG.OUT ? ` → 输出 ${CFG.OUT.w}×${CFG.OUT.h}` : ''}，${CFG.DURATION}s，${CFG.BPM}BPM`);
else bad('CFG', 'index.html 里没读到 DURATION');

// ── 2. 脚本接线 ────────────────────────────────────────────────────────
for (const s of srcs) if (!fs.existsSync(path.join(proj, s))) bad('接线', `index.html 引了 ${s}，文件不存在`);
const listed = srcs.filter((s) => /(^|\/)shots\//.test(s));
const shotDir = path.join(proj, 'shots');
const onDisk = fs.existsSync(shotDir) ? fs.readdirSync(shotDir).filter((f) => f.endsWith('.js')).sort() : [];
const missing = onDisk.filter((f) => !listed.includes('shots/' + f));
if (missing.length) bad('接线', `shots/ 里有没列进 index.html 的文件：${missing.join('、')}（这些镜头不会出现在片子里）`);
else ok('接线', `${listed.length} 个镜头文件都接上了`);
if (!srcs.includes('assemble.js') && !srcs.some((s) => s.endsWith('/assemble.js'))) bad('接线', 'index.html 没有引 assemble.js');
for (const need of ['engine.js', 'character.js']) if (!srcs.some((s) => s === need || s.endsWith('/' + need))) bad('接线', `index.html 没有引 ${need}`);
if (!eng) bad('engine.js', '文件不存在或没被 index.html 引用');
if (!chr) warn('character.js', '文件不存在（角色只能由镜头自己画，会漂移）');

// ── 3. 空跑镜头 ────────────────────────────────────────────────────────
const noop = () => {};
const gradStub = () => ({ addColorStop: noop });
const ctxProxy = new Proxy({}, {
  get: (t, k) => {
    if (k === 'canvas') return { width: CFG.W, height: CFG.H };
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return gradStub;
    if (k === 'createPattern') return () => ({ setTransform: noop });
    if (k === 'measureText') return () => ({ width: 10 });
    return noop;
  },
  set: () => true,
});
const engProxy = new Proxy({}, {
  get: (t, k) => (k === 'noise' ? (() => 0.5) : k === 'palette' ? {} : (t[k] !== undefined ? t[k] : noop)),
  set: (t, k, v) => { t[k] = v; return true; },
});
const api = { W: CFG.W, H: CFG.H, OW: CFG.OUT ? CFG.OUT.w : CFG.W, OH: CFG.OUT ? CFG.OUT.h : CFG.H,
  BEAT: 60 / CFG.BPM, beatPhase: () => 0, beatIndex: () => 0, onBeat: () => false,
  ease: (u) => u, lerp: (a, b, u) => a + (b - a) * u, clamp: (x) => x,
  ENGINE: engProxy, CHAR: { draw: noop, handAt: () => ({ x: 0, y: 0 }) },
  SAFE_Y: CFG.H * 0.85, cx: CFG.W / 2, cy: CFG.H / 2, MH: CFG.H * 0.24, palette: {} };
const SHOTS = [];
const sandbox = { window: { SHOTS, LYRICS: [], ENGINE: engProxy, CHARACTER: { draw: noop } }, SHOTS, ENGINE: engProxy, CHARACTER: { draw: noop }, API: api,
  Math, JSON, Number, String, Array, Object, isNaN, isFinite, parseInt, parseFloat, console, undefined };
vm.createContext(sandbox);
// 按 index.html 的顺序把所有脚本都跑一遍（assemble.js 除外：它是装配器，不是内容）。
// 这样 props.js / remap.js 之类的项目级脚本也能在空跑环境里生效。
for (const s of srcs) {
  if (/assemble\.js$/.test(s)) continue;
  if (/(^|\/)engine\.js$/.test(s)) continue;      // engine.js 一画东西就要 canvas，用 engProxy 顶替
  const f = path.join(proj, s);
  if (!fs.existsSync(f)) continue;
  try { vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: s }); }
  catch (e) {
    if (/shots\//.test(s)) bad('加载', `${s} 加载就报错：${e.message}`);
    else warn('加载', `${s} 在空跑环境里跑不通（不影响真渲染）：${e.message}`);
  }
}
const S = SHOTS.slice().sort((a, b) => a.start - b.start);
if (!S.length) bad('镜头', '一个镜头都没注册（shots/*.js 里要 SHOTS.push({...})）');
S.forEach((s, i) => {
  const id = s.id ?? `#${i}`;
  if (typeof s.start !== 'number' || typeof s.end !== 'number') return bad('镜头', `镜头 ${id} 缺 start/end`);
  if (!(s.end > s.start)) bad('镜头', `镜头 ${id}：end(${s.end}) ≤ start(${s.start})`);
  if (i > 0 && Math.abs(s.start - S[i - 1].end) > 0.001) bad('镜头', `镜头 ${id} 和上一个没接上：${S[i - 1].end} → ${s.start}（中间会黑）`);
  if (typeof s.draw !== 'function') return bad('镜头', `镜头 ${id} 没有 draw()`);
  for (const u of [0, 0.5, 1]) {
    const t = s.start + (s.end - s.start) * u;
    try { s.draw(ctxProxy, u, t, api, { x: CFG.W / 2, y: CFG.H / 2, zoom: 1 }); }
    catch (e) { bad('空跑', `镜头 ${id} 在 u=${u} 崩了：${e.message}`); break; }
  }
});
if (S.length && CFG.DURATION && Math.abs(S[S.length - 1].end - CFG.DURATION) > 0.05)
  bad('片长', `最后镜头 end=${S[S.length - 1].end}，CFG.DURATION=${CFG.DURATION}`);
if (S.length && S[0].start > 0.001) bad('片长', `第一个镜头从 ${S[0].start}s 开始，开头会黑`);
if (S.length && !R.some((r) => !r[0])) ok('镜头', `${S.length} 个镜头，${S[0].start}s → ${S[S.length - 1].end}s，首尾相接`);

// ── 4. 黑名单（只查 shots/*.js）────────────────────────────────────────
const BAN = [
  [/Math\.random\s*\(/, 'Math.random() → 画面就不再只由 t 决定，改用 ENGINE.noise(key,i)'],
  [/Date\.now|performance\.now/, '取当前时间 → 改用传进来的 t'],
  [/setTimeout|setInterval|requestAnimationFrame/, '定时器 → 帧由渲染器驱动，别自己开循环'],
  [/https?:\/\//, '外部 URL（CDN/图片）→ 弱模型环境里会挂'],
  [/\bp5\b/, 'p5 → 本项目只用 Canvas2D'],
  [/THREE\.|webgl|WebGL/, 'WebGL → 渲染器在多进程下会黑帧'],
];
for (const s of listed) {
  const f = path.join(proj, s);
  const src = read(f);
  if (!src) continue;
  for (const [re, m] of BAN) {
    const hit = src.match(re);
    if (hit) bad('黑名单', `${s} 里有 ${hit[0]}：${m}`);
  }
  const lines = src.split('\n').length;
  if (lines > 400) warn('体量', `${s} 有 ${lines} 行，镜头建议 ≤120 行（拆镜头，不是一个镜头写 400 行）`);
}

// ── 5. engine.js 接口 ──────────────────────────────────────────────────
if (eng) {
  const need = ['palette', 'piece', 'sprite', 'ground', 'sky', 'fx', 'glow', 'char', 'text', 'frame', 'noise', 'sheet', 'lyric'];
  const lack = need.filter((k) => !new RegExp(`\\b${k}\\s*[:(=]`).test(eng));
  if (lack.length) bad('引擎', `engine.js 少了：${lack.join('、')}`);
  else ok('引擎', `画法函数齐全（${need.length} 个）`);
  for (const [re, m] of [[/https?:\/\//, '外部 URL'], [/\bp5\b/, 'p5']]) if (re.test(eng)) bad('引擎', `engine.js 里有 ${m}`);
}

// ── 6. 歌词时间轴 ──────────────────────────────────────────────────────
const sandbox2 = { window: {}, Math, JSON, Number, String, Array, Object, console };
vm.createContext(sandbox2);
if (lyr) {
  try {
    vm.runInContext(lyr, sandbox2, { filename: 'lyrics.js' });
    const L = sandbox2.window.LYRICS || [];
    if (!L.length) warn('歌词', 'lyrics.js 里没有 window.LYRICS 条目（可以没有歌词，但要确认是有意的）');
    L.forEach(([a, b, txt], i) => {
      if (!(b > a)) bad('歌词', `第 ${i + 1} 句 end 不大于 start：${a}→${b}`);
      if (b - a < 0.6) bad('歌词', `第 ${i + 1} 句只有 ${(b - a).toFixed(2)}s，太短会一闪而过：${txt}`);
      if (a < -0.001) bad('歌词', `第 ${i + 1} 句起点是负数 ${a}（偏移算错了？）`);
      if (CFG.DURATION && b > CFG.DURATION + 1.0) bad('歌词', `第 ${i + 1} 句 ${b}s 超出片长 ${CFG.DURATION}s（还差 ${(b - CFG.DURATION).toFixed(2)}s 就唱完了）`);
      if (i > 0 && a < L[i - 1][1] - 0.3) warn('歌词', `第 ${i} 句和第 ${i + 1} 句重叠超过 0.3s，字幕会打架`);
      if ([...txt].length > 16) warn('歌词', `第 ${i + 1} 句 ${[...txt].length} 字，一行放不下（建议 ≤16 字或拆两句）`);
    });
    if (L.length && !R.some((r) => !r[0] && r[1] === '歌词')) ok('歌词', `${L.length} 句，${L[0][0]}s → ${L[L.length - 1][1]}s`);
  } catch (e) { bad('歌词', `lyrics.js 加载报错：${e.message}`); }
}

// ── 输出 ───────────────────────────────────────────────────────────────
const width = Math.max(...R.map((r) => r[1].length), 4);
console.log('\n' + '─'.repeat(60));
for (const [good, name, msg] of R) {
  const tag = good === true ? ' PASS ' : good === false ? ' FAIL ' : ' WARN ';
  console.log(`${tag} ${name.padEnd(width)}  ${msg}`);
}
const fails = R.filter((r) => r[0] === false).length, warns = R.filter((r) => r[0] === null).length;
console.log('─'.repeat(60));
console.log(fails ? `✗ 有 ${fails} 条没过${warns ? `，${warns} 条提醒` : ''} —— 先修完再渲整片` : `✓ 全过${warns ? `（${warns} 条提醒，能渲但要留意）` : ''}`);
process.exit(fails ? 1 : 0);
