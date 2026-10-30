# pixel —— 16bit 像素游戏风（window.ENGINE / window.CHARACTER）

坐标系就是 **320×180 个格子**（`CFG.W×CFG.H`），一格 = 一个像素；装配页把它整数倍最近邻放大到
`CFG.OUT`（1920×1080）。歌词、扫描线、暗角、颗粒画在 1920×1080 清晰层上。
镜头脚本只写「谁在哪、什么时候、什么动作」，工艺全在引擎里：

- 一切坐标 `Math.round`，没有半像素；`snap(g)` 把装配页的 zoom/pan 压成整数平移，
  所以就算 cam 带 `zoom`，格子也不会变成大小不一的方块。
- 镜头**不真的缩放**：`cam` 只换算成整像素平移 + 三层视差（远 0.25 / 中 0.5 / 近 1.0）。
  想「推近」就写 `zoom:1.0 → 1.06`，引擎会吞掉缩放，只留平移，画面依旧干净。
- 渐变只有 **4×4 Bayer 抖动**（`bt/dith`），没有 `createLinearGradient`。
- 主体一律 1px 深色外轮廓（`outline`：先往 4 邻域扩 1px 画深色，再画本体）。
- 动画 12fps：`pf = Math.floor(t*12)`，雪、脚步、抖动只随 `pf` 变，绝不补间。

## palette（24 色，`ENGINE.palette.名字`）

| 名字 | hex | 用在哪 |
|---|---|---|
| ink | `#0B0B14` | 最深：轮廓、夜空顶、扫描线 |
| night0 | `#121428` | 深夜蓝（画布底） |
| night1 | `#1B2043` | 夜蓝 |
| night2 | `#27305C` | 蓝：屋顶、树影 |
| night3 | `#37457C` | 亮蓝 |
| skyline | `#4F6298` | 地平线蓝、远山脊 |
| snowFar | `#6E82B4` | 远处雪影 |
| snowMid | `#9DAFD4` | 雪影（雪地最近处） |
| snow | `#CBD8EE` | 雪 |
| snowLit | `#EEF3FB` | 亮雪、雪脊 |
| white | `#FFFFFF` | 高光、近处雪花、眼白 |
| crabInk | `#3A1220` | 阿蟹轮廓 |
| crabDark | `#8A2226` | 阿蟹暗部 |
| crabRed | `#D8402C` | 番茄红（本体） |
| crabLite | `#FF6A3C` | 亮橘（受光） |
| crabBelly | `#F7C48A` | 肚子浅杏、壳上浅斑 |
| woodDark | `#4A2C22` | 深木（门、长椅） |
| wood | `#8A5637` | 木 |
| woodLit | `#C8996A` | 亮木 |
| amber | `#E8A23C` | 琥珀（窗、灯座） |
| lampWarm | `#FFD27A` | 暖黄：灯、窗——全片唯一强调色 |
| lampCore | `#FFF4C8` | 灯芯浅暖、歌词字 |
| snowWarm | `#F0CFA0` | 被灯照亮的雪 |
| snowWarm2 | `#D9B49A` | 被灯照亮的雪影 |

调色板 ≤24 色，**不许出现表外颜色**，不许 rgba 中间色、不许 alpha 渐变叠加（`endFrame` 除外）。

## 画法函数（第 2 节全套）

| 函数 | 参数要点 |
|---|---|
| `palette` | 颜色名 → hex 的对象 |
| `noise(key,i)` | 0..1 确定性伪随机（FNV hash）。**镜头里所有随机只能走它** |
| `piece(g,{x,y,w,h,color,pts,shadow})` | 实心块 / 折线块，坐标取整 |
| `sprite(g,{kind,x,y,size,color,opts})` | 见下表 |
| `ground(g,{y,kind,color,color2})` | `kind`: `flat` `hill` `grass` `snow` `street` |
| `sky(g,{y1,kind,colors})` | 抖动渐变天空，`kind`: `night` `dusk` `day` `plain` |
| `fx(g,{kind,n,key,front,spread},t)` | `kind`: `snow` `rain` `petal` `dust` `sparkle` `light-ray` `smoke` |
| `glow(g,{x,y,r,color,core,strength})` | 三档暖光晕，边缘靠抖动衰减 |
| `char(g,{x,y,size,facing,expression,action,u,t})` | 转给 `CHARACTER.draw`，自动算受光档 |
| `text(g,s,{x,y,size,color,ink,align,weight})` | 中文二值化硬像素字（先渲到离屏再阈值化，不是系统抗锯齿） |
| `textWidth(s,size)` | 量宽，给对话框排版用 |
| `frame(g,{kind,x,y,w,h,title})` | `kind`: `dialog` `box` `plate` `hud`（RPG 窗口，双层边框） |
| `lightAt(wx,wy)` | 该点受光档 0/1/2 |

**sprite 支持的 kind（8 种）**：`tree`（松树带雪）、`house`（木屋 + 亮窗 + 屋顶积雪）、
`lamp`（路灯：杆 + 底座 + 灯笼头）、`star`（十字星芒，3 档）、`cloud`（抖动云）、
`fence`（木栅栏）、`bush`（雪灌木）、`sign`（木牌）。尺寸 `size` 是该精灵的高度。

## 一眼可辨的 5 条判据（改完对着看）

1. **格子是方的**：任意斜线/圆边都是阶梯状，没有抗锯齿灰边、没有半像素模糊。
2. **天空和雪地是点阵过渡**：颜色交界是 4×4 抖动，不是平滑渐变。
3. **所有主体有 1px 深色轮廓**：房子、树、路灯、角色外面都有一圈 ink。
4. **暖黄只出现在一处**：灯（和它的光斑、被照亮的雪），其余全是冷蓝。
5. **角色 ≤28% 画面高、中景 20–28%**：脚踩在 y=0.86H 一带，歌词框在 0.90 处不打架。

## 禁止事项

- 禁 p5 / WebGL / CDN / npm / 外部字体 / 图片资源 —— 只有 canvas 2D + fillRect。
- 禁 `createLinearGradient` / `shadowBlur` / `globalAlpha` 做渐变（`endFrame` 的扫描线与暗角除外）。
- 禁半像素：所有坐标 `Math.round`，线宽只能是 1 格。
- 镜头里禁 `Math.random()`、`setTimeout`、`requestAnimationFrame`；画面只能由 `t` 决定。
- 禁超过 24 色的调色板，禁 rgba 中间色。
- 禁把世界坐标写死成 1920×1080 —— 世界永远是 320×180，输出放大由装配页负责。
