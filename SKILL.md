---
name: music-mv
description: 制作或修改歌曲 MV、像素说唱 MV 和歌词视频。使用本机 Canvas 逐帧作画、鼓点分镜与原曲合成，兼容纸艺和蜡笔画风。
---

# 像素歌曲 MV 制作

默认做横屏像素 MV，带动态片头，按原曲的鼓点和人声组织镜头。用户指定的画风、画幅、复刻要求或无片头优先。支持纸艺拼贴 `collage` 和蜡笔绘本 `crayon`。只追问缺失的音源、指定片段或影响叙事的关键信息。已有歌名直接用于片头；只有艺名已知且需要署名时才上屏。

本技能通过本机 Canvas 与 Puppeteer 逐帧出片。

## 建工程与定时钟

以下命令从技能目录执行，工程可放在用户的工作目录。建工程时直接导入歌曲分析；以音源文件名作为默认片名，也可显式指定。默认像素世界 **640×360**，逐格最近邻放大 3 倍输出 **1920×1080 / 30 fps**。脸、手势、分层建筑用这一档；追求粗颗粒时用 `--world=320x180`，细线和密集场面可用 `--world=960x540`。世界尺寸必须能等比整数放大。竖屏用 `--w=1080 --h=1920`，自动选 360×640。

```bash
./mv.sh env
./mv.sh ncm 歌曲.ncm                       # 音源是 NCM 时
mkdir -p work
./mv.sh analyze 歌曲.wav -o work/song-analysis.json
./mv.sh init work/mv --analysis=work/song-analysis.json --title=歌名
./mv.sh lyric 歌词.lrc -o work/mv/lyrics.js --out= --csv=  # 有 LRC 时
./mv.sh storyboard work/mv --analysis=work/song-analysis.json  # 只写可编辑的全曲分镜草稿
./mv.sh check work/mv
```

- `direction.js` 控制片名、`introEnd`（原曲内的秒数）和项目色板。开头有人声时让动作与歌词从第一个音节开始，片名叠在上方。用标题的出现、停留、退出引向第一句或第一记重音。长前奏可用第二个镜头揭示场地。明确要求直接开唱且无标题时用 `--no-intro`。
- `rhythm.js` 存绝对秒，包含拍、小节和 kick / snare / hat 三类频带起音候选。听校半速、倍速、第一强拍和切分音。主歌开头、段落转折及末段都选锚点核对。项目级改轨后重新装配或强制重渲相关帧。无 librosa 时 `analyze` 可退回估拍，手工把听准的落点填入工程。详见 [歌词与鼓点](references/lyrics-and-beats.md)。
- 截取歌曲时先准备准确的音频片段，让渲染、歌词和节奏轨共用它的零点。无歌词可保留空的 `lyrics.js`。SRT 用 `./mv.sh lyric 字幕.srt -o work/mv/lyrics.js`。增强型逐字 LRC 会保留字级秒数，普通 LRC 没有字级时间时继续按句内进度估算。

## 导演与分镜

先把一句歌词改写为一个可见事件，再决定美术和技术。每个承担叙事或表演的镜头写出“起始状态 → 声音锚点上的动作 → 镜尾结果”。等待和反应可以停住；舞步等有意循环写明动机。只见人物起伏时，先改重心、手与物件的关系或眼神方向。新工程提供一次性姿势轨和按曲目编写场景的入口。[表演、美术、可选特效与声音](references/performance.md)


1. 用一句话说清人物要做什么、遇到什么阻力、副歌有什么改变。为本曲设计一个能在远景、中景、特写中反复辨认的物件或动作。像素初始化的投掷试镜用来核对单次动作、鼓点与道具连续性。正式 MV 按全曲分镜替换试镜的时间跨度、场景和角色，交付前检查工程中已没有标为 `rehearsal: true` 的占位镜头。根据故事改 `character.js`，用 `./mv.sh sheet work/mv` 检查角色的侧面剪影、动作极值及主色。画风和配色见 [画风选择](references/styles.md) 与 [像素引擎](templates/pixel/STYLE.md)。
2. 按**乐段 → 小节 → 镜头 → 镜内动作落点**写本地 `STORYBOARD.md`。第一行安排片头，最后一行安排尾音或切黑。歌词可以跨镜，镜头也可以跨句。表中写明动作的准备、接触、回收，主体相对场景的位置变化，以及为什么在这一拍切。先用 `./mv.sh storyboard` 生成可编辑草稿，再按[分镜范例](references/storyboard.md)补齐场景、动作和结果。草稿只写 `STORYBOARD.md`，不会覆盖 `shots/*.js`。
3. 两种解释都成立时，可先用同一小节比较不同叙事构图和运动。先做一段带原声的连续样剪，包含开场或代表性的主歌入副歌。能认出人物动机、听得出主次重音、两镜之间方向连续，再扩到整首。用户要求先审分镜或样片时，在该节点交付。
4. 每镜在 `shots/NN.js` 注册，加入 `index.html` 的脚本表。镜头首尾相接，最后一个 `end` 等于 `CFG.DURATION`。由绝对秒 `t`、镜内进度 `u` 和确定性种子算出全部状态。色板、角色和可复用的场景资产放在工程内。镜头写法见[接口与实例](references/shots.md)。
5. 同场景换机位时保留视线、运动方向或道具的位置关系。利用走位、遮挡揭示、前后景速度差、轮廓变化和景别切换；近景允许脸或道具占满画面。像素运镜可指定 `cam.mode='crop'` 做整格取景、最近邻推近。停顿时给出要观众看清的细节和恢复运动的声音提示。

## 审片与交付

```bash
./mv.sh check work/mv
./mv.sh stills work/mv 0,0.4,1.2           # 替换成准备、接触和回收时刻
./mv.sh sweep work/mv 1.0 1.5             # 每秒 15 格，查动作方向与遮挡
./mv.sh speed work/mv
```

```bash
./mv.sh render work/mv
./mv.sh encode work/mv
./mv.sh deliver work/mv 歌曲.wav
```
逐帧管线支持断点续渲。修改已缓存镜头后加 `render work/mv --from 12 --to 18 --force`（时间换成本次范围）。

完成带声成片后生成发布版。Canvas 的 deliver 和 Remotion 的 rmaster 默认额外输出 small MP4，目标 50 MB；可用环境变量 MV_TARGET_MB 设置目标，或执行 `./mv.sh compress 成片.mp4 -o 发布版.mp4 --target-mb 50`。需要固定视频平均码率 1600 kbps 时，执行 `./mv.sh compress 成片.mp4 -o 发布版.mp4 --preset 1600k`，或设置 MV_COMPRESS_PRESET=1600k 后运行 deliver / rmaster。该模式使用双遍 slow 编码并直接复制音轨，实际文件大小随片长变化。对比发布版的字幕边缘、暗部、快速镜头和音画同步。压缩前的成片保留在原路径，发布版单独保存，两者都交付。两遍编码按片长和音轨码率分配大小。

全片交付前听看带声成片；接触表检查构图与景别分布。用 `scripts/video_rhythm.py 成片.mp4 --analysis work/song-analysis.json` 定位疑似停滞、黑帧和切点；加 `--loops --start 秒 --end 秒` 可筛查周期往复，对照镜表逐帧复核突变。有意停顿、字幕和颗粒都可能影响检测。至少抽查片头到首句、主歌一个切分、一次段落转换和尾拍。30 fps 下，硬切或指定接触帧与**听校后的目标**通常应差至多 1 帧；有意抢拍或拖拍则记录偏移。回看两侧相邻帧确认是哪一帧接触，普通 `sweep` 会隔帧抽样。若连续几镜只有字幕、颗粒或灯在动，回到分镜调整走位、动作轮廓或景别。在 `REVIEW.md` 记下实测落点与修正。[审片方法](references/review.md) · [排错](references/pitfalls.md)

在 Codex 中按宿主工具处理本地文件与成片，网页调试走 Chrome DevTools MCP。DSH / Antigravity 可用各自的本地命令、图像查看与后台任务工具。交付可打开的成片绝对路径，并说明歌词估时、人工对拍或尚未复核的段落。
