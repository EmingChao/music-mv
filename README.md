# music-mv

**把一首歌做成有画面的 MV。** 画面不是视频模型生成的，是**让代码把每一帧画出来**，画面跟着音乐走，最后合成一条视频。

三种画风：**像素游戏风**（16bit 对话框歌词）· **纸艺拼贴**（撕纸＋胶带＋纸片投影）· **扁平绘本／蜡笔手绘**（蜡笔抖线＋水彩填色＋纸纹）。

既可以当一个 agent 技能用（`SKILL.md` 驱动，说一句"给这首歌做个 MV"就跑），也可以在终端里用 `./mv.sh` 一个动词一个动词地手动跑。

---

## 三种画风

| `--style=` | 长相 | 适合 |
|---|---|---|
| `pixel` | 320×180 的像素世界整数放大到 1080p，游戏 HUD 外框，对话框式歌词，中文靠独立清晰层 | 说唱、游戏感、节奏硬的歌 |
| `collage` | 撕纸边缘＋胶带＋纸片投影，手作温度，拼贴构图 | 民谣、怀旧、叙事口吻 |
| `crayon` | 蜡笔抖线＋多层低透明度填色＋缓存纸纹，扁平绘本 | 童谣、治愈、轻松的歌 |

三套画风共用同一只角色（`templates/*/character.js`，默认「阿蟹」，可整个换掉）。

## 为什么是"画"出来的

生成式视频没法卡住具体某一拍、也做不出"歌词第 3 个字亮起来"这种对位。所以这里走的是**逐帧渲染**：

```
templates/*/engine.js   画风工艺（怎么画一笔蜡笔、怎么撕一张纸）
templates/*/character.js 角色资产
shots/NN.js             每镜 ≤120 行，画第 N 镜
index.html              装配薄壳（W/H/OUT/镜头表）
assemble.js             转场 / 机位 / 歌词 / 自检
        │
        ├── mv.sh render → scripts/render_frames.mjs（Puppeteer 逐帧 renderAt(t)）→ JPEG 序列
        ├── mv.sh encode → ffmpeg → 无声 mp4
        └── mv.sh deliver → 封回原曲 + 抖音参数转码 + ffprobe 自检
```

好处：任意时刻的画面都是确定性的、可重渲的、可只渲某一镜的；音符和像素一一对得上。

## 依赖

| 东西 | 干什么用 | 缺了会怎样 |
|---|---|---|
| `python3` + `numpy` | 拍位网格、歌词时间轴 | 只能手填 BPM |
| `librosa`（可选） | 听歌测 BPM／情绪段落 | 退化到 `beat_grid.py`，精度差一点 |
| `Pillow` | 接触表／拼图（审图用） | 审图得一张张看 |
| `ffmpeg` | 编码、封音、转码 | 出不了片 |
| `Google Chrome` | Puppeteer 的渲染内核 | 渲不了帧 |
| `node` + `puppeteer-core` | 逐帧渲染 | 渲不了帧 |

```bash
pip install librosa numpy Pillow
brew install ffmpeg
cd music-mv && npm install          # 只装 puppeteer-core，用本机 Chrome
```

## 安装成 agent 技能

```bash
git clone https://github.com/EmingChao/music-mv.git ~/music-mv
cd ~/music-mv && npm install
./install.sh                        # 实体安装到 ~/.agents/skills/music-mv（不建软链）
```

装完 `./mv.sh env` 应打印 `ENV PASS`。改完源码再跑一次 `./install.sh` 就同步过去了。

## 一次完整的流程

```bash
./mv.sh env                                          # 先确认 python/ffmpeg/Chrome/puppeteer 齐不齐
./mv.sh init ./我的MV --style=pixel --bpm=92 --dur=210
./mv.sh ncm  ~/歌.ncm                                # 网易云 .ncm 先还原（可选，见下）
./mv.sh analyze ./我的MV/歌.mp3                      # → song-analysis.json（BPM/拍位/段落）
./mv.sh lyric   ./歌.lrc                             # → lyrics.js（没有 LRC 就 lyric_grid.py 按拍位顺排）
# … 写 shots/*.js：一镜一个文件 …
./mv.sh check   ./我的MV                              # 静态自检：接线/首尾相接/黑名单/歌词轴，退出码 0/1
./mv.sh stills  ./我的MV 0.4,1.6,2.8                 # 关键帧 + 接触表，逐镜审图
./mv.sh sheet   ./我的MV                              # 角色设定图（三视图/表情/动作）
./mv.sh sweep   ./我的MV 2.0 3.0                     # 区间逐帧拼一条，看运动找穿帮
./mv.sh speed   ./我的MV                             # 渲 1 秒测速，> 0.15 秒/帧就该优化
./mv.sh render  ./我的MV                             # 整片（断点续渲，中断了重跑会接着渲）
./mv.sh encode  ./我的MV                             # 帧 → 无声 mp4
./mv.sh deliver ./我的MV ./歌.mp3                    # 封原曲 + 转码 + 自检，最后一行 PASS/FAIL
```

渲染超过一分钟，别在前台等——丢后台跑，`out/` 下能看到进度。

## 13 个动词

| 动词 | 作用 |
|---|---|
| `env` | 环境自检，缺什么直接说 |
| `init <工程目录> --style=pixel\|collage\|crayon` | 从模板生成工程目录 |
| `ncm <歌.ncm\|目录>` | 网易云加密壳还原（转调 `ncm2mp3`） |
| `analyze <歌.mp3>` | 测 BPM／拍位／情绪段落 |
| `lyric <歌.lrc\|字幕.srt>` | 歌词 → `lyrics.js` ＋ 歌词网格 |
| `check <工程目录>` | 静态自检，退出码 0/1 |
| `stills <工程目录> 0.4,1.6` | 出关键帧 ＋ 接触表 |
| `sheet <工程目录>` | 角色设定图 |
| `sweep <工程目录> 2.0 3.0` | 区间逐帧拼条，查运动/穿帮 |
| `speed <工程目录>` | 渲 1 秒测速 |
| `render <工程目录>` | 渲整片（断点续渲） |
| `encode <工程目录>` | 帧 → 无声 mp4 |
| `deliver <工程目录> <歌.mp3>` | 封原曲 ＋ 抖音参数转码 ＋ ffprobe 自检 |

## 目录结构

```
music-mv/
├── SKILL.md              技能主文档（agent 读这个）
├── mv.sh                 13 个动词的命令门面
├── references/           写分镜/定画风/审图/踩坑的参考资料
├── templates/
│   ├── _shared/          index.html · assemble.js · stills.html
│   ├── pixel/            engine.js · character.js
│   ├── collage/          engine.js · character.js
│   └── crayon/           engine.js · character.js
├── scripts/              analyze_song · beat_grid · lyric_grid · mask_words
│                         render_frames.mjs · check_shots.mjs · contact_sheet
│                         finalize_audio · video_rhythm · srt2js · check_env
├── assets/               字幕黑名单词表
└── install.sh            装到 ~/.agents/skills/music-mv
```

## 配合 [ncm2mp3](https://github.com/EmingChao/ncm2mp3)

网易云下载的歌是 `.ncm` 加密壳，剪辑软件直接打不开。`./mv.sh ncm` 会去调兄弟仓库
[ncm2mp3](https://github.com/EmingChao/ncm2mp3)（零依赖、不重新编码、音质不掉），装好后：

```bash
./mv.sh ncm ~/歌.ncm        # → 同名 mp3/flac + 封面 + 标题歌手专辑
./mv.sh analyze ~/歌.mp3
```

## 署名 · 许可 · 免责

- 派生自 **Winhao** 的开源项目 [`Win-Hao/music-mv`](https://github.com/Win-Hao/music-mv)（MIT，Copyright (c) 2026 Winhao）。
  原始许可随附在 `LICENSE-winhao-music-mv`，相对原项目的改动清单在 [`NOTICE.md`](NOTICE.md)：渲染路线从双路线收成单路线、
  画风实现拆成 `engine/character/shots`、蜡笔风改成纯 Canvas2D、加了自检脚本与歌词合规工具等。
- 本仓库同样以 **MIT** 发布，见 [`LICENSE`](LICENSE)。
- 歌曲、歌词、参考影像的版权归各自作者。本工具只在你自己的电脑上处理你提供的文件，不内置任何歌曲或影视素材；
  `templates/*/character.js` 里的「阿蟹」是本项目的原创占位角色，可自由替换。
- 用它处理**你有权处理**的音频。
