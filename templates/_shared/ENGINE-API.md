# 画风引擎接口（ENGINE-API）

三种画风各有一个 `engine.js`，接口完全一样。装配页 `index.html` 只认这些名字，不认识具体画法。
改引擎时不许改接口名和参数顺序：改了三种风格就装不进同一个装配页。

## 1. 必须导出的东西

全部挂在 `window.ENGINE` 上（浏览器里直接 `<script src="engine.js">` 加载，不许 npm、不许 CDN、不许 import）。

```js
window.ENGINE = {
  id: 'pixel' | 'collage' | 'crayon',
  setup(CFG, API)   {},        // 可选，可 async：预生成纸纹、调色板、字体。返回 Promise 会被 await
  bg(g, shot, t, u, cam, CFG) {},  // 每镜背景，世界坐标（机位变换已经套好，直接按 0..W/0..H 画）
  endFrame(g, t, CFG) {},      // 整屏质感：纸纹 / 扫描线 / 暗角 / 颗粒。屏幕坐标，每帧最后、歌词之前
  lyric(g, line, CFG) {},      // 歌词上屏。line = { text, t, s0, s1, i, n, p }，p 是这句唱到哪（0→1）
  sheet(g, CFG, API) {},       // 角色设定图（三视图 + 表情表 + 动作定格），见第 4 节
  // 下面是给镜头脚本用的画法函数（镜头脚本里写 ENGINE.xxx，不用 E.）
};
```

`shot` 是镜头对象（见第 3 节），`bg` 可以读 `shot.bg` 这个自由字段来换背景。

## 2. 镜头脚本能用的画法函数

每个引擎至少要有这些（名字固定，参数可以带默认值）：

| 名字 | 用途 |
|---|---|
| `palette` | 这个画风的调色板对象（颜色名 → 值），镜头只能用里面的颜色 |
| `piece(g, spec)` | 画一块主体（纸片 / 精灵 / 色块）。`spec` 里至少认 `{ x, y, w, h, color, pts, rot, shadow }` |
| `sprite(g, spec)` | 画一个小东西（树、房子、路灯、云、窗）：`{ kind: 'tree', x, y, size, color }`，`kind` 至少支持 8 种，见 STYLE.md |
| `ground(g, spec)` | 画地平线/地面带：`{ y, color, color2, kind: 'flat'|'hill'|'grass'|'snow'|'street' }` |
| `sky(g, spec)` | 画天空：`{ colors: ['#..','#..'], kind: 'gradient'|'dither'|'wash'|'paper' }` |
| `fx(g, spec, t)` | 一直在动的东西：`{ kind: 'snow'|'rain'|'dust'|'light-ray'|'smoke'|'sparkle'|'petal', ... }`，内部种子必须固定 |
| `glow(g, spec)` | 光：`{ x, y, r, color, strength }`（灯、窗、月光） |
| `char(g, o)` | 画角色：转调 `CHARACTER.draw(g, o)`，外面加影子、按 `o.size` 定身高 |
| `text(g, s, spec)` | 这个画风的字：`{ x, y, size, color, ink, align, weight }`（像素字 / 纸条手写 / 蜡笔字） |
| `frame(g, spec)` | 画框、对话框、纸条底（像素红框 / 剪贴纸条 / 手绘框）：`{ x, y, w, h, kind }` |
| `noise(key, i)` | 固定种子随机：`0→1`。镜头里的随机一律用它，禁 `Math.random()` |

允许的写法：`ENGINE.piece(g, {...})`。**不许**在镜头里手写 `Math.random()`、`Date.now()`、`setTimeout`、`requestAnimationFrame`。

## 3. 镜头对象（shots/NN.js）

```js
SHOTS.push({
  id: 1,
  start: 0.0, end: 4.4,
  cam: { from: { x: 960, y: 540, zoom: 1.0 }, to: { x: 960, y: 500, zoom: 1.05 } },
  bg: { kind: 'night-street' },                 // 给 ENGINE.bg 的自由字段
  enter: { type: 'cut' },                       // cut | whip | lift | card | flash | fade | zoom
  note: '前奏：雪夜街角，主角从右边走进来',        // 人看的
  draw(g, u, t, API, cam) { /* 世界坐标，画背景上的东西 */ },
});
```

- `u` 镜头内进度 0→1，`t` 全片秒。**画面只能由 t 决定**：不许存上一帧状态。
- 镜头之间必须首尾相接（`start` = 上一个的 `end`），最后一个 `end` = `CFG.DURATION`。装配页会自检并在 console 报错。
- 机位只允许一种慢动作，`from → to` 走到底；不来回推拉。
- 角色永远是 `ENGINE.char(g, { x, y, size, facing, expression, action, u, t, hold })`。

## 4. `sheet()` 排什么

一张 1920×1080 的图，三排：

1. 第一排：`facing` = `front` / `left` / `right` / `back` 四个全身
2. 第二排：`CHARACTER.EXPRESSIONS` 里每个表情一个头像（至少 4 个）
3. 第三排：`CHARACTER.ACTIONS` 里每个动作一个定格（至少 4 个，写动作名在下面）

每格下面写字（用 `ENGINE.text`），标题写「角色设定图 · <角色一句话描述>」。背景用这个画风的纸/底色，别用纯白。

## 5. 性能与稳定

- 一帧必须在 **80 ms 以内**画完（1080p）。超了整片渲不完：先把纸纹、噪声、渐变缓存到离屏 canvas，只在 `setup()` 里生成一次。
- 不许用 WebGL、不许用 p5、不许用 `document.fonts` 之外的外部资源；字体只用系统字体栈（中文：`"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif`）。
- 像素风的字必须二值化成硬像素；不许在放大后画字。
- `endFrame` 里的质感层不许整屏覆盖不透明色（会把画面糊掉），只能 multiply/overlay 类叠加，透明度 ≤ 0.25。

## 6. 画幅

`CFG.W / CFG.H` 可能是 1920×1080，也可能是 1080×1920（竖屏）。
引擎内部布局一律相对 `W/H` 算（用比例，不写死像素坐标），竖屏时地平线、纸片大小、歌词位置都要跟着成立。

**像素风例外**：项目里给 CFG 加 `OUT: { w: 1920, h: 1080 }`，并让 `W: 320, H: 180`（竖屏 `W: 180, H: 320`）。
装配页会把镜头画在 320×180 的小画布上，整数倍最近邻放大到 1920×1080，**歌词和 `endFrame` 质感层画在大画布上**。
所以像素风的 `lyric()`：画面像素化，字用系统字体画在输出分辨率上（配像素风的框、硬边、不加抗锯齿阴影），中文才清楚。
`ENGINE.text()` 因为要画在 320 空间里，只用于画面内的小字（招牌、HUD），字号 ≥8，字号小于 8 的中文会糊，宁可不写。

## 7. 三种风格的身份证（写 STYLE.md 前先对一遍）

三种引擎画的是同一个角色、同一段 demo，必须一眼看出"这是像素 / 这是纸 / 这是蜡笔"，
而不是"三张 canvas 插画换了配色"。判断标准写在各自 STYLE.md 的"一眼可辨"那一节里。

