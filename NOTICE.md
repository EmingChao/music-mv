# NOTICE / 署名与许可

本 skill（`music-mv`）派生自 **Winhao** 的开源项目 `Win-Hao/music-mv`（MIT License, Copyright (c) 2026 Winhao），
并针对 DeepSeek Harness / `deepseek-v4.1-flash` 重做了装配层、脚本层与文档层。

## 本仓库相对原项目的改动

| 模块 | 原项目 | 本 skill |
|---|---|---|
| 渲染路线 | 双路线：A 用 HyperFrames 直画 Canvas2D；B 用 `render_frames.mjs` 逐帧渲 + HyperFrames 叠歌词 | **单路线**：Puppeteer 逐帧 `renderAt(t)` → JPEG 序列 → ffmpeg 编码 → 原曲换回。去掉 HyperFrames/GSAP 依赖（弱模型少一层 bookkeeping，少一大类坑） |
| 画风实现 | `examples/*/scene.html` 单文件示范（713–965 行一个文件） | 拆成 `engine.js`（画风工艺）+ `character.js`（角色资产）+ `shots/NN.js`（每镜 ≤120 行）+ `index.html`（装配薄壳）+ `assemble.js`（转场/机位/歌词/自检）+ `stills.html`（角色设定图） |
| 画风数量 | 4 种（含纸艺立体书 diorama） | **3 种**（像素 / 纸艺拼贴 / 扁平绘本·蜡笔），按用户要求裁剪 |
| 蜡笔风 | p5 + p5.brush（CDN、异步加载、WebGL） | **纯 Canvas2D 手写**（蜡笔抖线 + 多层低透明度填色 + 缓存纸纹），零外部依赖 |
| 自检 | 靠人看 | `scripts/check_shots.mjs`（接线/首尾相接/黑名单/假 ctx 空跑/歌词轴/引擎接口，退出码 0-1）+ `mv.sh` 11 个动词门面 |
| 歌词 | `srt2js.py` | 增加 `lyric_grid.py`（无 LRC 时用节拍网格顺排）、`mask_words.py` + 词表（发布端字幕合规） |
| 角色 | 各 example 自己画 | 统一 `CHARACTER` 契约 + `ENGINE.sheet()` 角色设定图（三视图/表情/动作），三风格共用同一只角色 |

## 原项目自带脚本（本 skill 保留/改编）

`analyze_song.py`、`srt2js.py`、`contact_sheet.py`、`video_rhythm.py`、`render_frames.mjs`（已补 node_modules 解析）、
`finalize_audio.py`、`check_env.py`、`_common.py` —— 均来自原项目（MIT）。

## 第三方依赖（不打包，用时各自遵守许可）

- Puppeteer（Apache-2.0）—— 逐帧渲染；本 skill 用 `puppeteer-core` + 本机 Chrome
- librosa（ISC）、NumPy（BSD-3-Clause）、Pillow（MIT-CMU）、FFmpeg（LGPL/GPL，看安装版本）
- 字体：只用**系统字体栈**（PingFang SC / Hannotate SC / Kaiti SC 等），不加载外部字体文件

原项目 `examples/` 曾从 CDN 加载 Fusion Pixel Font（OFL-1.1）、LXGW WenKai（OFL-1.1）、hanzi-writer-data（Arphic Public License）；
本 skill **不在运行时加载这些字体**，所以不涉及它们的再分发。

## 内容版权

歌曲、歌词、参考视频的版权归各自作者。本工具只在你自己的电脑上处理你提供的文件，不内置任何歌曲、歌词、
或影视素材。`templates/*/character.js` 里的「阿蟹」是本 skill 的原创默认角色（用于占位与 demo），可自由替换。

## 免责

原项目 README 提到画面里出现过的 Clawd 是 Anthropic 为 Claude Code 设计的形象（非官方同人画法）。
本 skill **不含** Clawd 素材，也不含任何 Anthropic 商标。
