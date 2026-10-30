# crayon —— 扁平绘本 / 蜡笔水彩（纯 Canvas2D，零依赖）

> 一句话：**蜡笔线条 + 水彩填色 + 纸纹**。不是"矢量图加一层噪点"。
> 一眼可辨的三件事：线在抖（12fps boil）、颜色是叠出来的（不是一片平涂）、每个轮廓都留缺口。

## 1. 调色板 `ENGINE.palette`

| key | hex | 用途 |
|---|---|---|
| `paper` | `#F7F1E4` | 底色：暖白水彩纸 |
| `paperDeep` | `#E6D9BC` | 纸的暗部 / 旧纸边 |
| `cream` | `#FFFDF6` | 歌词、眼白、雪的高光 |
| `tomato` | `#D9573F` | 番茄红（阿蟹的壳、屋顶、灯笼） |
| `tomatoDeep` | `#A83B2C` | 番茄红的暗部 / 壳的轮廓线 |
| `ocher` | `#E0A33E` | 赭黄（墙、暖光、星星） |
| `ocherDeep` | `#B87A22` | 赭黄暗部 |
| `indigo` | `#3A3F63` | 深靛（夜、窗框） |
| `sage` | `#7E9078` | 灰绿（树、远山） |
| `ink` | `#2A2B33` | 墨（线、嘴、瞳孔） |
| `violet` | `#6B5B8E` | 冷紫（夜色里的影子） |
| `sky0/sky1/sky2` | `#4A4F72` `#3A3F62` `#7A80A6` | 夜空（顶 / 更深的顶 / 雪线反光） |
| `snow` / `snowShade` | `#E9EAF2` `#B7BEDA` | 雪 / 雪的冷影 |
| `lamp` / `lampDeep` | `#F3C46A` `#E29B33` | 灯光 / 灯芯 |
| `wood` / `woodDark` | `#A8693A` `#6E3F22` | 木（门、栅栏、树枝） |
| `iron` | `#333A57` | 铁（灯杆、灯罩） |
| `blush` | `#E8806E` | 腮红 |

## 2. 工艺参数（改这些就等于换画风，慎动）

- **boil**：`bf = floor(t*12)` —— 一秒换 12 次抖动种子。**线用 `bf`，填色用固定串**。
- **蜡笔线**（`_pen.wline`）：一条"线" = **3–4 条**抖动细分线叠加；线段先按 8px 细分，每个端点 `±(jit*1.5)`（默认 jit 1.2 → ±1.8px）抖动；每条 alpha 0.3、线宽 `w*1.35`、圆头；默认留 **13%** 缺口（`gap`），轮廓永远不闭合。
- **水彩填色**（`_pen.wfill`）：**3 层** alpha 0.3，每层平移 ±(slop)、旋转 ±0.8°，形状各自 wobble；`globalCompositeOperation='multiply'` 混色；`color2` 给第二色让色块不匀。
- **排线补齐**（`_pen.hatch`）：短斜线，`dist` 4–10px、alpha 0.12–0.16、**种子固定不跟 bf**（排线是"涂上去的颜料"，不该抖）。
- **垫底**（`_pen.wbase`）：每个实体先铺一层不透明的纸色/纸纹，避免 multiply 叠到后景上发脏。
- **纸**：`setup()` 生成一次纸纹（fbm 水渍 + 齿噪 + 纤维 + 四角变脏），`endFrame` 里 multiply ≤0.12。
- 静态层按 **4 个 boil 相位** 预烘到离屏 canvas，`bg` 每帧只 `drawImage` 一张 → 线还在抖，但几乎不花时间。

## 3. API 全表

```js
ENGINE.bg(g, shot, t, u, cam, CFG)      // 镜头背景（shot.bg 传参）
ENGINE.endFrame(g, t, CFG)              // 输出分辨率的纸纹 + 暗角 + 冷色调
ENGINE.lyric(g, line, CFG)              // 手写歌词（奶白字 + 墨色双层抖动手描边）
ENGINE.sheet(g, CFG, API)               // 三排设定图（朝向 / 表情 / 动作）
ENGINE.char(g, {x,y,size,facing,expression,action,u,t,hold,shadow})
```

### `sprite(g, spec)` —— `spec.kind`
`house`(x,y,w,h,color,roof,win,windows[]) · `tree`(x,y,size) · `lamp`(x,y,h,lit) · `moon`(x,y,r)
`star`(x,y,size) · `fence`(x,y,w,h) · `cloud`(x,y,size,color) · `sign`(x,y,size,text)

### `fx(g, spec, t)` —— `spec.kind`
`snow` · `rain` · `petal` · `dust` · `sparkle` · `smoke` · `light-ray`
参数：`x0,x1,y0,y1,n,speed,size,color,key`（种子只跟 `key`+粒子序号走，时间推进用 `t`）

### `ground(g, spec)`
`kind:'snow'|'plain'` · `y` 地平线 · `y2` 下边界 · `x0,x1` · `color`（雪地 = 亮面 + 冷影带 + 两遍排线 + 雪堆）

### `sky(g, spec)`
`y0,y1` · `colors:[顶,更深,雪线反光]`（三层罩染 + 两层斜排线，不做色块）

### `frame(g, spec)`
`kind:'note'|'window'|其它` · `x,y,w,h,rot,color,ink,lw`（画框 / 便签 / 窗玻璃）

### `piece(g, spec)`
任意多边形或矩形：`pts` 或 `x,y,w,h,rot`；`color,color2,alpha,slop,base,ink,lw,gap,shadow,hatch,hatchAngle`

### `text(g, str, spec)`
`x,y,size,color,ink,align,weight,rot`（默认 0.5° 倾斜 + ≤0.15 的重影；手写栈 `Hannotate SC / HanziPen SC / Kaiti SC / STKaiti`）

### `glow(g, spec)`
`x,y,r,strength,sy,tex:'warm'|'cool'` —— 加色光晕（`lighter`），灯光/月亮用地上的光池用 `sy<1` 压扁。

### `noise(key, i)` / `_pen`
`ENGINE.noise(key,i)` → [0,1) 稳定随机；`ENGINE._pen` 暴露 `wline/wfill/wbase/hatch/ell/sqell/arcPts/capsule/wob/rnd/rotPts/bbox`，`character.js` 靠它共用同一套笔法。

## 4. 一眼可辨的 5 条

1. 每条线是 3–4 条抖动短线叠出来的，边缘毛、宽窄不匀，还留缺口。
2. 填色叠 3 层低 alpha，色块里有深浅不匀和排线，边缘出格 3–6px。
3. 12fps boil：相邻两帧线在跳，**填色不动**。
4. 画面最外层压纸纹 + 四角脏 + 轻微冷色偏，像旧纸。
5. 歌词是手写体 + 墨色手描边（两层、每层错 1px），不是黑体 + 硬投影。

## 5. 禁止

- ❌ p5 / p5.brush / 任何 CDN / WebGL / npm 包 / 外部字体文件 / 图片资源
- ❌ `Math.random()`（镜头里一律 `ENGINE.noise(key,i)`）
- ❌ `setTimeout` / `requestAnimationFrame`（渲染器逐帧调 `renderAt(t)`，必须纯函数）
- ❌ 用 `shadowBlur` 假装手绘阴影（用低 alpha 填色 + 排线）
- ❌ 把填色画成一片均匀色块 / 用闭合平滑矢量路径描边
