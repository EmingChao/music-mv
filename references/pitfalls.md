# 排错（症状 → 原因 → 修法）

> 这类项目的坑分两种：**会报错的**（好办）和**不报错但画错的**（要命）。
> 先按"症状"查表，别从代码第一行开始读。表里每一条都是真见过的。

---

## 0. 先跑这三条，八成的"怪"问题直接消失

```bash
./mv.sh env                    # 环境对不对
./mv.sh check work/my-mv       # 接线/时间轴/黑名单/空跑
./mv.sh speed work/my-mv       # 速度是不是超了
```

---

## 1. 环境 / 启动

| 症状（原文） | 原因 | 修法 |
|---|---|---|
| `找不到 puppeteer：在项目文件夹里 npm i puppeteer（装之前问一下用户）` | 目录里没有 `node_modules/puppeteer-core` | 本 skill 目录已带软链；工程目录里跑就从 skill 根跑 `mv.sh`，或 `npm i puppeteer-core`（**先问用户**） |
| `puppeteer-core 要用本机的 Chrome：设 CHROME_PATH` | 找不到 Chrome | `export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` |
| `Failed to launch the browser process` | Chrome 被占/权限 | 换 `--workers 1`；关掉其它 headless 实例 |
| `缺 --page` / `缺 --out` | 少了参数 | 看 `render_frames.mjs --help`；正常从 `./mv.sh` 走 |
| python 报 `ModuleNotFoundError: librosa` | 裸 python3 没有 librosa | `mv.sh` 会按 `$MV_PYTHON` → `python3` → 技能目录 `.venv` 的顺序找一个能 import 的；手跑就指定 `MV_PYTHON=/path/to/.venv/bin/python`，或写进 `mv.local.sh` |

## 2. 页面 / 渲染

| 症状 | 原因 | 修法 |
|---|---|---|
| 一直等到超时，`sceneReady` 不 resolve | 某 js 语法错 / 引了不存在的文件 / `setup()` 抛错 | 看日志 `[进程1] 页面报错：xxx`；`./mv.sh check` |
| `[进程1] 页面报错：X is not defined` | 用了没定义的函数（常见：`lerp` 没取 `API.lerp`） | 加 `API.`；或用文件内局部函数 |
| 渲出来的图**全黑** | 镜头没注册进 `index.html` / `draw` 在 `u=0` 抛错被吞 | `check` 的"接线"和"空跑"两行；`DEBUG:true` 渲一帧看红框 |
| 渲出来是**上一镜** | 新镜头没接、或 `start` 落在上一镜区间内 | `check` 的"相接" |
| 第 N 帧失败：`Target closed` | 多进程撞车 / 内存 | `--workers 1 --from <N> --force` 补这一帧 |
| `Protocol error (Emulation.setTouchEmulationEnabled): Session closed. Most likely the page has been closed.` | **机器负载太高**（同时跑好几个渲染，`uptime` 的 load 到 40+ 就起不了 Chrome 页面） | 等其它渲染结束；`MV_WORKERS=1`；开工前 `uptime` 看一眼，load 接近核数就别再开新渲染 |
| `还缺 N 帧（第一个是第 X 帧），先补渲再接` | 中途崩过 | 直接再跑一次 `./mv.sh render`（断点续渲会自动补） |
| 出的 jpeg 是花的/半张 | 进程被杀时写了半个文件 | `--force` 重渲那一段 |
| `TimeoutError: Waiting failed: 180000ms exceeded`，且日志里有 `Cannot read properties of null (reading 'appendChild')` | `index.html` 里的 `assemble.js` 没加 `defer`，它在 `<body>` 之前跑，取不到 `#c` | 给 `assemble.js` 那行加 `defer`（`_shared/index.html` 已带，别删） |
| `Protocol error (Emulation.setTouchEmulationEnabled): Session closed` | Chrome 在沙箱里没带 `--no-sandbox`（或机器 load 接近核数） | `render_frames.mjs` 已默认带 `--no-sandbox`；仍报就 `MV_WORKERS=1` 并等其它渲染结束 |
| `SecurityError: tainted canvas` | 加载了外部图片/字体 | 删掉；本 skill 只用系统字体与代码画的一切 |
| 页面越渲越慢 / 内存爆 | `setup()` 里生成的缓存每帧重算，或每帧 new canvas | 缓存到模块级变量，只在 `setup()` 生成一次 |
| 中文不显示（像素风） | 在 320 空间画中文，字号 <8px | 歌词交给 `ENGINE.lyric`（画在 1920 层）；画面小字 ≥8px |
| 字体变成方框/默认黑体 | 字体栈写错或用了没装的字体 | 只用 `"PingFang SC","Noto Sans CJK SC"` 等系统栈；手写体用 `"Hannotate SC","Kaiti SC"` |

## 3. 画面（**不报错但难看**，最花时间）

| 症状 | 原因 | 修法 |
|---|---|---|
| 一帧一帧看都在抖/闪 | `Math.random()` 或种子跟 `t` 变 | 一切随机走 `ENGINE.noise(key, i)`；填色种子用 `id`，不用 `t` |
| 抽帧看正常，成片在**闪** | 低透明度层叠顺序随 `t` 变 | 层顺序固定；透明度动画只允许 ≤0.25 且单层 |
| 画面"空" | 中景没前景、没环境动效 | 加一层 `fx`（雪/尘/光）+ 一个近景遮挡物 |
| 像 PPT | 一镜 >8s、几乎不动 | 拆镜；加机位缓推；加环境动效 |
| 角色每镜都不太一样 | 镜头里自己画了人，没用 `ENGINE.char` | 删掉，全部走 `CHARACTER.draw` |
| 角色脚浮空/穿地 | `y` 不是脚底 | `y` = 地面线 |
| 角色太大/太小 | `size` 用了 `H*0.4` 之类手写值 | 用 `API.MH`（中景）/`API.H*0.12`（远景）/`H*0.45`（特写） |
| 道具挡住脸 | 手/钳画在脸前 | `look-up` 时把手放下；`handAt()` 算位置别硬编码 |
| 三种风格看起来只是配色不同 | 工艺没做（没抖动/没撕边/没笔迹） | 回 `styles.md` 的"身份判据"，一条条对 |
| 竖屏时构图全崩 | 用横屏坐标硬编码 | 一律用 `W/H` 比例算；`cy` 别写 540 |

## 4. 音乐 / 时间轴

| 症状 | 原因 | 修法 |
|---|---|---|
| 成片音画差 1–2 秒 | 歌词/分镜用的是"片段内时间"，音频从 0 开始 | 见 `lyrics-and-beats.md`：确认 `--start` 是否用了、`OFF` 是否为第一拍 |
| 歌词比唱晚一点 | LRC 的 `[mm:ss.xx]` 被当成"结束时间" | `srt2js.py` 已按下一句起点算结束；手写 `lyrics.js` 时注意 `[s0,s1]` |
| 句尾被截断 | 最后一句 `end` 太早 | 补 0.5–1s；或 `CFG.DURATION` 加长并同步最后镜头 |
| 卡点差一点 | `CFG.BPM` 不是真 BPM（70↔140 常见） | `./mv.sh analyze --tempo-hint <猜的>` 复测 |
| 成片比原曲短/长 | 帧数 = `ceil(DURATION*FPS)`，`DURATION` 与歌长不一致 | `DURATION` 设成歌长（或截取段长度），`deliver` 会按视频长度封音 |

## 5. 交付

| 症状 | 原因 | 修法 |
|---|---|---|
| `height not divisible by 2` | 宽高奇数 | 用 1080/1920（本 skill 默认都是偶数） |
| 成片发灰/颜色变淡 | 色彩范围没标 | `deliver` 已带 `bt709` 三件套 + `-color_range tv` |
| 声音变小/被压 | 用了渲染器自带的音轨 | 必须 `finalize_audio.py` 换回原曲（渲染音轨会被压 2–4dB） |
| 抖音上传后音画不同步 | `+faststart` 没加 / VFR | `deliver` 已处理；别自己 `ffmpeg -i x.mp4 x.mp4` |
| 前 3 秒黑屏 | 首个镜头 `start > 0` | 第一个 `start` 必须是 0 |
| 末帧黑 | 最后 `end < DURATION` | `check` 的"片长"行 |
| 字幕超出安全区 | 歌词画到了 `SAFE_BOTTOM` 以下 | 歌词 y 用 `1 - CFG.SAFE_BOTTOM` 以内 |

---

## 6. 静默失败清单（不报错、但结果是错的）

1. **`drawFrame` 用了 `G` 而引擎切片画在 `ctx` 上** → 像素风里东西画到清晰层（看着"没放大"）。
2. **`endFrame` 画了不透明底** → 整屏糊成一片灰（它只能叠加，透明度 ≤0.25）。
3. **`cameraOf` 的 `to` 省略了某个字段** → 该字段回落到默认（`zoom:1.04`），你以为是 1.0。
4. **`enter.dur` 没写** → 默认 0.3s；写 `0` 就等于没有转场。
5. **镜头注册顺序和 `start` 不一致** → 不影响播放（装配层会排序），但你会看错"上一镜是谁"。
6. **`engine.js` 的 `bg()` 里读了 `shot.bg` 但没兜底** → 忘写 `bg` 的镜头直接空白。
7. **多进程 `--workers 2` 时某帧抖动不同** → 一定是有跨帧状态（`Math.random`、模块级变量++）。
8. **`puppeteer` 的 `page.goto` 用了 `file://` 相对路径** → 引不到 `shots/xx.js`；`mv.sh` 已转绝对路径，手跑要注意。
9. **改了 `CFG.DURATION` 没改最后镜头 `end`** → 尾部黑一段（`check` 会抓）。
10. **`stills` 出的图和 `render` 出的图不一样** → 说明有状态污染，回去查第 7 条。

---

## 7. 速度（秒/帧 > 0.3 时按顺序做）

1. 纸纹/噪声/渐变 → 挪到 `setup()` 缓存成离屏 canvas / pattern。
2. `fx` 粒子数砍半（雪 120 → 60 看不出来）。
3. 每帧 `save/restore` 太多次 → 合并；`clip()` 少用。
4. 像素风把"逐像素"改成"整块 fillRect + 少量像素点"（除非你在写真光栅）。
5. 还是慢：`--workers 2`（不要再高，会撞车），或接受 3 小时渲完（作者第一支 MV 渲了 7 小时，正常）。
