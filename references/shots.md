# P5 · 写镜头脚本

> 一个镜头 = 一个文件 `shots/NN.js` + 一个 `SHOTS.push({...})`，**不超过 120 行**。
> 你只在里面写"什么东西、在哪、在干嘛"；抖动、撕边、蜡笔排线、纸纹全由 `engine.js` 提供。

---

## 1. 骨架（照抄，改中间）

```js
// shots/03.js —— 3.2–6.4s 雪落在我肩上
SHOTS.push({
  id: 3, start: 3.2, end: 6.4,
  cam:  { from: { x: API.cx, y: API.H*0.50, zoom: 1.00 },
          to:   { x: API.cx, y: API.H*0.47, zoom: 1.05 } },
  bg:   { kind: 'street-night' },
  enter:{ type: 'whip', dir: 'left', dur: 0.24 },
  note: '雪落在我肩上：停下、抬手扫雪、抬头看灯',
  draw(g, u, t, API /*, cam */) {
    const P = ENGINE.palette;

    // ① 环境里一直在动的东西（背景由 ENGINE.bg 画，这里只叠动的东西）
    ENGINE.fx(g, { kind:'snow', n: 90, t, speed: 1.0, alpha: 0.85 });

    // ② 主角：一个主要动作（这里 = 抬手扫肩上的雪）
    const sw = Math.sin(API.clamp(u*1.6) * Math.PI);           // 0→1→0，一次抬手
    ENGINE.char(g, {
      x: API.W*0.46, y: API.H*0.86, size: API.MH,
      facing: 'right',
      expression: u < 0.45 ? 'neutral' : 'sleepy',
      action: sw > 0.25 ? 'wave' : 'stand',
      u, t,
    });

    // ③ 情绪点：抬手最高时，灯亮一下
    ENGINE.glow(g, { x: API.W*0.18, y: API.H*0.46, r: API.W*0.10,
                     color: P.lamp, strength: 0.55 + 0.35*sw });
  },
});
```

再在 `index.html` 里加一行（顺序要和 `start` 一致）：

```html
<script src="shots/03.js"></script>
```

---

## 2. 镜头对象字段（只有这几个）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 序号，报错时靠它定位 |
| `start` / `end` | 秒 | 绝对秒；**必须与相邻镜头首尾相接**；最后一个 `end === CFG.DURATION` |
| `cam` | `{from:{x,y,zoom}, to:{x,y,zoom}}` | 世界坐标机位。不写 = 中心不动 + 缓推 4%。**一镜只做一种慢动作** |
| `bg` | 任意对象 | 传给 `ENGINE.bg` 的自由字段，如 `{kind:'street-night'}` |
| `enter` | `{type,dur,dir}` | 进场转场：`cut/whip/lift/card/flash/fade/zoom` |
| `note` | 字符串 | 人看的一句话（分镜表第 5 列） |
| `draw` | 函数 | `draw(g, u, t, API, cam)`，`u` 是镜内进度 0→1 |

## 3. `API` 能用的东西（装配层给的，不用自己算）

| 名字 | 值 | 用途 |
|---|---|---|
| `API.W/API.H` | 世界宽高（像素风是 320×180） | **一切坐标都相对它算**，别写死数字 |
| `API.OW/API.OH` | 输出宽高（1920×1080） | 只在需要输出级尺寸时用（一般用不到） |
| `API.cx / API.cy` | 画面中心 | 构图基准 |
| `API.MH` | `H*0.24` 中景角色身高 | 角色 `size` 主力值 |
| `API.SAFE_Y` | 歌词区上边界 | 重要东西别画在它下面 |
| `API.BEAT` | 一拍秒数（`60/BPM`） | 算节奏 |
| `API.beatPhase(t)` | 这一拍走到哪 0→1 | 做"跟着拍子呼吸"的抖动 |
| `API.beatIndex(t)` | 第几拍（整数） | 隔拍才动的东西 |
| `API.onBeat(t, tol)` | 是否在拍点上 | 触发一瞬的效果 |
| `API.ease/lerp/clamp` | 缓动/插值/夹紧 | 全部动作都用这三样 |
| `API.ENGINE` / `API.CHAR` | 引擎与角色 | 等价于全局 `ENGINE` / `CHARACTER` |

## 4. `ENGINE` 画法函数（三种风格同名同参）

| 调用 | 画什么 |
|---|---|
| `ENGINE.palette` | 调色板对象，颜色**只能从里面取** |
| `ENGINE.piece(g, {x,y,w,h,color,pts,rot,shadow})` | 一块主体（纸片/精灵/色块）；`pts` 给了就按多边形画 |
| `ENGINE.sprite(g, {kind,x,y,size,color,flip})` | 小东西：`tree/house/lamp/window/cloud/star/car/pole`…（种类见该风格 `STYLE.md`） |
| `ENGINE.ground(g, {y,color,color2,kind})` | 地面带：`flat/hill/grass/snow/street` |
| `ENGINE.sky(g, {colors:[a,b],kind})` | 天空：`gradient/dither/wash/paper` |
| `ENGINE.fx(g, {kind,n,t,...})` | 一直在动的粒子：`snow/rain/dust/light-ray/smoke/sparkle/petal` |
| `ENGINE.glow(g, {x,y,r,color,strength})` | 灯光/月光/发光 |
| `ENGINE.char(g, o)` | 角色（转给 `CHARACTER.draw`），`o.size` 定身高 |
| `ENGINE.text(g, s, {x,y,size,color,align,weight})` | 画风自己的字（画面内小字；**歌词不要用它**） |
| `ENGINE.frame(g, {x,y,w,h,kind})` | 画框/对话框/纸条底 |
| `ENGINE.noise(key, i)` | 固定种子随机 0→1 |

> 具体每个 `kind` 支持哪些值，看 `templates/<style>/STYLE.md` 的表格。**不要猜**，猜出来的 `kind` 会被引擎当默认值画成一个方块。

---

## 5. 三个完整范例

### 范例 A：纯环境（前奏，没人）

```js
SHOTS.push({
  id: 1, start: 0, end: 3.2, bg: { kind: 'street-night' },
  cam: { from:{x:API.cx,y:API.H*0.55,zoom:1.0}, to:{x:API.cx,y:API.H*0.52,zoom:1.06} },
  note: '前奏：空街，雪，路灯。',
  draw(g, u, t) {
    const P = ENGINE.palette;
    ENGINE.sky(g, { colors:[P.night, P.night2], kind:'gradient' });
    ENGINE.sprite(g, { kind:'moon', x:API.W*0.78, y:API.H*0.18, size:API.H*0.10, color:P.moon });
    ENGINE.sprite(g, { kind:'house', x:API.W*0.62, y:API.H*0.80, size:API.H*0.30, color:P.wall });
    ENGINE.ground(g, { y:API.H*0.80, color:P.snow, color2:P.snow2, kind:'snow' });
    ENGINE.sprite(g, { kind:'lamp', x:API.W*0.18, y:API.H*0.80, size:API.H*0.26, color:P.pole });
    ENGINE.glow(g, { x:API.W*0.18, y:API.H*0.46, r:API.W*0.13, color:P.lamp, strength:0.5+0.1*Math.sin(t*1.7) });
    ENGINE.fx(g, { kind:'snow', n:110, t, speed:0.9 });
  },
});
```

### 范例 B：中景 + 走路（最常用）

```js
SHOTS.push({
  id: 2, start: 3.2, end: 6.4,
  cam: { from:{x:API.W*0.45,y:API.H*0.52,zoom:1.0}, to:{x:API.W*0.50,y:API.H*0.53,zoom:1.04} },
  enter: { type:'cut' }, note: '走进画面',
  draw(g, u, t, API) {
    const x = API.lerp(API.W*0.15, API.W*0.42, API.ease(u));   // 走 27% 画宽
    ENGINE.ground(g, { y:API.H*0.86, color:ENGINE.palette.snow, kind:'snow' });
    ENGINE.fx(g, { kind:'snow', n:80, t });
    ENGINE.char(g, { x, y:API.H*0.86, size:API.MH, facing:'right',
                     expression:'neutral', action:'walk', u: t*1.6, t });   // u 传绝对速度 → 步频稳定
    ENGINE.glow(g, { x:API.W*0.12, y:API.H*0.44, r:API.W*0.11, color:ENGINE.palette.lamp, strength:0.6 });
  },
});
```

> **走路的 `u` 要传 `t*k`**（绝对时间×步频），不要传镜内 `u`：否则每次换镜头步频都会变，观众看得出"走着走着变快了"。

### 范例 C：特写 + 情绪点（副歌用）

```js
SHOTS.push({
  id: 14, start: 48.0, end: 50.4,
  cam: { from:{x:API.cx,y:API.H*0.42,zoom:1.10}, to:{x:API.cx,y:API.H*0.40,zoom:1.16} },
  enter: { type:'flash', dur:0.16 }, note: '副歌第一句：眼眶红了，但没哭',
  draw(g, u, t, API) {
    ENGINE.frame(g, { x:0, y:0, w:API.W, h:API.H, kind:'vignette' });
    ENGINE.char(g, { x:API.cx, y:API.H*0.92, size:API.H*0.45, facing:'front',
                     expression: u > 0.55 ? 'sad' : 'neutral', action:'stand', u, t });
    ENGINE.fx(g, { kind:'sparkle', n:8, t, alpha:0.5 });
  },
});
```

---

## 6. 写完立刻做的四件事

```bash
./mv.sh check work/my-mv                     # 语法 + 接线 + 首尾相接 + 黑名单 + 空跑
./mv.sh stills work/my-mv <三张的秒数>        # 出图
read_image work/my-mv/out/stills.jpg         # 必须看，不许跳
./mv.sh sweep work/my-mv <start> <end>       # 有运动的镜头再看条带
```
`check` 报的错 **必须先修完**：它抓的是"渲染时才炸"的那一类（未定义变量、镜头漏接、留缝、`Math.random`）。

## 7. 常见错误（都是渲染时才暴露的）

| 现象 | 原因 | 修 |
|---|---|---|
| 画面一片黑 | `shots/NN.js` 没在 `index.html` 里、或 `id` 与文件名混了 | `check` 的"接线" |
| 上一镜的画面还在 | `start/end` 和相邻镜没对齐 | `check` 的"相接" |
| 角色忽大忽小 | `size` 用了不同基准（`MH`/`0.12H` 混用） | 一镜内固定一个 `size`，变景别靠 `cam.zoom` |
| 角色脚不在地上 | `y` 传了身体中心 | `y` 永远是**脚底** |
| 画面在抖/闪 | `Math.random()` 或没固定种子 | 用 `ENGINE.noise` |
| 多进程渲的帧不一样 | `draw` 里存了外部状态 | 纯函数，只读 `t/u` |
| 中文糊（像素风） | 用 `ENGINE.text` 在大字上画 | 画面小字才用；歌词交给 `ENGINE.lyric` |
| 一帧 > 200ms | 每帧现算纸纹/噪声 | 挪进 `setup()` 缓存（见 `pitfalls.md`） |
