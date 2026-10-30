# 纸艺拼贴 · STYLE

> 一眼要认出来：**每样东西都是一张剪/撕下来的纸，贴在一张更大的纸上。**
> 不是"一张插画上叠纸纹加白描边"。写镜头只要摆东西，纸的工艺由引擎封死。

## 一句话画法

撕边轮廓 → 暖白纸边（#FFF9EE，露出 6–10px）→ 下方投影（x+8/y+10，rgba(60,45,30,0.22)，极轻模糊）→ 纸纹（噪点 + 纤维 + 报纸灰字/圆点/条纹/皱痕）。
**公式固定，不要在每个镜头里自己画。**

## palette（ENGINE.palette，全部 hex）

| 键 | hex | 用在哪 |
|---|---|---|
| night | `#233868` | 夜空卡纸（主） |
| night2 | `#2E4A7C` | 夜空纸砂云 |
| night3 | `#1B2C55` | 灯柱铁件、门框暗部 |
| dusk | `#3A5487` | 远山纸 |
| moon | `#F3E7C6` | 月亮（旧报纸剪的） |
| snow | `#F4F0E7` / snowB `#CBD8EA` | 雪地亮面 / 冷面 |
| white | `#FFF9EE` | **纸边**，全片唯一的白 |
| ink | `#2B2A26` | 深墨（字、瞳孔、嘴） |
| kraft `#B5875A` / kraftD `#8A6340` | 牛皮纸：房子墙、树干 |
| news `#E5DFCF` | 旧报纸：月亮、烟囱 |
| brick `#9C4537` | 砖红：屋顶 |
| slate `#4C6087` | 门、铁件 |
| pine `#2E5A4F` | 松树 |
| cream `#F3E8CB` | 纸牌、云、浅纸 |
| tape `#E7D8AE` | 胶带 |
| warm `#FFD46A` / lamp `#F4C452` | 暖光纸砂 / 亮灯窗 |
| glass `#8B9AB4` | 熄灯的窗 |
| strip `#FBF3E2` | 歌词纸条 |
| crab `#E3603A` / crabD `#C14A2D` | 阿蟹壳 / 腿·眼柄 |
| belly `#F8DBB5` / spot `#F39060` | 肚皮 / 壳上浅斑 |

## PAPER 纸种表（`piece({paper:'kraft'})`）

| kind | 长什么样 | 常用在哪 |
|---|---|---|
| `card` | 干净卡纸：细颗粒 + 极短纤维 | 默认，剪的纸片 |
| `kraft` | 牛皮纸：斑驳重、长纤维、深色杂点 | 房子墙、树干、底色 |
| `news` | 旧报纸：灰字栏 + 网点图 | 月亮、烟囱、旧纸 |
| `dots` | 印刷圆点花纸 | 窗帘、围巾、包装纸 |
| `stripes` | 竖条纹花纸 | 遮阳篷、布 |
| `tissue` | 半透明薄棉纸：皱痕 | 光晕、烟、云、光锥 |
| `tape` | 纸胶带：细皱纹、半透明 | 贴歌词、贴照片 |

纹理在 `setup()` 里一次生成（256×256 白底乘纹理），`createPattern` 平铺，**不许每帧现算**。

## kind 全表

- `sprite({kind})`：`house` `tree` `lamp` `moon` `star` `fence` `cloud` `sign`
  （`house` 可加 `color/color2/win/wide`；`lamp` 加 `lit`）
- `ground({kind})`：`flat` `hill` `grass` `street`（上沿永远是撕的，白边自然露出来）
- `sky({colors:[c1,c2]})`：整幅只有**一张**纸，深浅靠 `c2` 的纸砂云叠出来，画面内部不留直线接缝
- `fx({kind})`：`snow` `rain` `dust` `sparkle` `petal` `light-ray` `smoke`
  （`n` 数量 / `sz` 大小倍率 / `seed` / `top,bot` / `light-ray` 另有 `px,py,len,w0,w1,spread,alpha`）
- `frame({kind})`：`paper`（一张纸片）`note`（带横线的便签）`tape`（顶上贴一条胶带）
- `glow({x,y,r,strength})`：2–3 层低透明暖黄薄纸叠出来，**不用 shadowBlur 大光晕**

## 一眼可辨 5 条

1. **每样东西都要有纸边 + 投影**：没有白边的东西看起来就是"画的"。
2. **不许完美直线、完美圆**：撕边 12–24 个顶点、法向抖 ±6px；圆也要用 12–18 边形撕。
3. **纸纹看得见**：大色块必须是纸（kraft 斑驳 / news 灰字 / 噪点纤维），不是纯色填充。
4. **定格抖动**：`UPS=12`，每 1/8 秒抖一次 2–4px、转 ±0.4°，一秒之内不变 —— 是"手挪纸"，不是电子抖。
5. **文字写在纸上**：字有 0.5° 倾斜 + ≤0.15 的错版重影；歌词永远贴在底部 0.90 的撕边纸条上（两侧胶带）。

## 禁止

- ❌ `Math.random()` / `Date.now()` / `setTimeout` / `rAF` —— 随机一律 `ENGINE.noise(key,i)`，画面只由 `t` 决定
- ❌ p5 / WebGL / Three / CDN / npm / 外部字体 / 图片资源（贴图也是代码生成的）
- ❌ `shadowBlur` 大光晕、渐变光斑、发光滤镜（暖光是纸砂，不是灯）
- ❌ 整屏不透明覆盖层（`endFrame` 只叠 ≤0.12 纸纹 + ≤0.10 暗角 + ≤0.04 颗粒）
- ❌ 在镜头里自己写撕边/纸纹 —— 那是 `ENGINE.piece()` 的活
- ❌ 每帧重算纹理 / 重建纸片（纸片按 `key` 缓存，`setup()` 焐热）

## 60 行镜头脚本的样子

```js
window.SHOTS.push({
  id: '01', start: 0, end: 3.0, enter: { type: 'cut' },
  note: '雪夜街角，阿蟹走进灯下',
  cam: { from: { x: W/2, y: H*0.52, zoom: 1.0 }, to: { x: W*0.45, y: H*0.55, zoom: 1.06 } },
  bg: { sky: ['#22386A', '#33527F'] },
  draw: function (g, u, t, API) {
    const E = API.ENGINE;
    E.sprite(g, { kind: 'house', x: W*0.155, y: H*0.735, size: H*0.34, color: '#8A6340', color2: '#9C4537' });
    E.fx(g, { kind: 'snow', n: 34, seed: 'snowFar', sz: 0.7 }, t);
    E.glow(g, { x: W*0.548, y: H*0.42, r: H*0.16, strength: 0.9 });
    E.char(g, { x: (0.15 + 0.27*u) * W, y: H*0.86, size: API.MH, facing: 'right', action: 'walk', expression: 'neutral', u: t*1.5 % 1, t: t });
  }
});
```
