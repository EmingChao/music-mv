# pixel —— 16bit 像素游戏风（window.ENGINE / window.CHARACTER）

坐标系默认是 **640×360 个格子**（`CFG.W×CFG.H`），一格 = 一个像素；装配页把它整数倍最近邻放大到
`CFG.OUT`（1920×1080）。歌词、扫描线、暗角、颗粒画在 1920×1080 清晰层上。
镜头脚本只写「谁在哪、什么时候、什么动作」，工艺全在引擎里：

- 一切坐标 `Math.round`，没有半像素；`snap(g)` 把装配页的 zoom/pan 压成整数平移，
  所以就算 cam 带 `zoom`，格子也不会变成大小不一的方块。
- 默认机位保留整格平移。要推拉，请给镜头设 `cam: {mode:'crop', from:{zoom:1}, to:{zoom:1.3}}`。画完世界后按整格裁窗、最近邻采样；推近越深，当前取景包含的源像素越少。近景也可重画较大的角色或道具。
- `bg.kind='metro'` 提供分层移动的站台与列车；`custom` 留出整张世界画布，供镜头绘制自己的舞台、房间或街区。老工程省略该字段时使用雪街。
- 色彩过渡可用离散色阶或 4×4 Bayer 点阵。角色轮廓可由明度差、轮廓线或剪影交代。像素表演允许停格及一次性连续动作；12fps 是旧精灵的采样选择。
- 新工程 `scenes.js` 保存本曲场景，镜头用 `scene` 选择；`look` 指向 `direction.js` 的同名材质方案。默认 `texture: 'clean'`、`captions: 'plain'`；复古项目可选 `'crt'` 和 `'dialog'`。

## palette（基础 24 色，`ENGINE.palette.名字`）

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
| lampWarm | `#FFD27A` | 暖黄：灯、窗——雪夜示例的强调色 |
| lampCore | `#FFF4C8` | 灯芯浅暖、歌词字 |
| snowWarm | `#F0CFA0` | 被灯照亮的雪 |
| snowWarm2 | `#D9B49A` | 被灯照亮的雪影 |

旧雪街的 24 个色名供已有精灵使用。项目可在 `palette` 中追加任意数量的 `#RRGGBB` 颜色。人物、场景、道具可在 `ramps` 定义自己的材质，例如 `leaf: ['#102E21','#387C47','#AFDC71']`；`ENGINE.tone('leaf',0.5)` 取绿色中间档，1 取透光色。内置 `green` 提供四级绿。镜头设 `look: '夕照'` 时，`looks: {夕照: {leaf: ['#42492B','#738044','#DDC26A']}}` 只替换指定材质。雪街灯光遇到色阶颜色时沿该材质提亮；自绘场景用 tone 指定受光档。

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

## 审图

检查整数放大的边缘、角色与背景的明度分离、动作接触帧和字幕可读性。扫描线、暗角、HUD、景深和运镜服从本曲美术设定。镜头可在项目场景层使用本地 WebGL 或打包的 Three.js；先验证初始化、随机取帧和带声试镜。详见[镜内表演](../../references/performance.md)。
