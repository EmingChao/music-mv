---
name: music-mv
description: 把一首歌做成有画面的 MV —— 三种画风：像素游戏风（16bit 对话框歌词）、纸艺拼贴（撕纸+胶带+纸片投影）、扁平绘本/蜡笔手绘（蜡笔线条+水彩填色+纸纹）。画面不是视频模型生成的，是用代码一帧一帧画出来，再卡着音乐节奏剪成片。触发词：MV、音乐视频、歌词视频、歌曲MV、抖音MV、像素MV、拼贴MV、蜡笔MV、绘本MV、手绘MV、music video、lyric video、pixel MV、collage MV、"给这首歌做个视频"、"给这首歌做个MV"、"做一版这种风格的MV"。覆盖听歌测拍、歌词时间轴、定画风、画角色、写分镜、逐镜作画审图、渲染封音交付。
---

# music-mv（DSH / deepseek-v4.1-flash 适配版）

**一句话**：一支 MV 不是"生成"出来的，是**让代码把每一帧画出来**，画面跟着音乐走，最后合成一条视频。

三种画风（用户三选一，不确定就先出样图让他挑）：

| style | 长什么样 | 一句话 |
|---|---|---|
| `pixel` | 16bit 像素游戏：320×180 抖色点阵、整数放大、歌词在游戏对话框里 | 像玩一个 1993 年的 RPG |
| `collage` | 纸艺拼贴：每样东西都是一张撕纸，白纸边 + 纸片投影 + 胶带 | 像一本手工剪贴簿 |
| `crayon` | 扁平绘本 / 蜡笔手绘：蜡笔线条在抖、水彩填色会混色、纸纹 | 像一本画给孩子看的绘本 |

本文件是**总控**：阶段、命令、闸门、排错。深度知识在 `references/`，**用到才读**。

---

## 0. 动手前先记住四件事

1. **画面只由时间决定**。你写的是 `drawFrame(t)` 的一个片段：同一个 `t` 永远画出同一张图。不许存"上一帧的状态"，不许 `Math.random()`。
2. **一次只做一镜**。写完一镜、渲出来、**亲眼看过图**、确认不丑，才做下一镜。禁止一次写完 5 个镜头再一起看图 —— 必翻车，且你定位不到是哪一镜错。
3. **你不画工艺，你只组合**。点阵抖动、撕纸边、蜡笔排线全在 `engine.js` 里，由 `ENGINE.xxx()` 提供。你的镜头脚本只写"什么东西在哪儿、在干嘛"。
4. **你的自我评价不算数，图算数**。每个闸门都要求 `read_image` 真看过。

---

## 1. DSH 工具映射（照这张表换工具，别用记忆里的名字）

| 要干的事 | 用这个工具 | 注意 |
|---|---|---|
| 看渲染出的图 | `read_image` | 会自动降采样；细节看不清就 `--times` 单渲一帧再看 |
| 读文本文件 | `read` | 大文件用 `offset/limit` 分段，别一次吞几百行 |
| 找文件 / 找符号 | `glob` / `grep` | 不要用 shell 的 `find` / `rg` |
| 跑命令 | `bash` | 渲整片用 `run_in_background: true`，再用 `job_output` 收 |
| 问用户 | `ask_user_question` | **一次给 2–4 个选项**，把要问的一次问清（见 §3） |
| 交付成品 | `present` | 传绝对路径 |
| 并行做多镜 | `subagent` | **默认不用**；只在用户明确要求且片长 > 30s 时考虑 |

所有渲染在本机跑，**没有云端渲染**。整片渲染一定走后台任务。

---

## 2. 铁律（违反 = 画面错，90% 的调试时间都花在这 10 条上）

**R1 — 每帧是纯函数。** 随机只用 `ENGINE.noise(key, i)`。禁止 `Math.random()` / `Date.now()` / `performance.now()` / 定时器 / 跨帧变量。
> `./mv.sh check` 会扫出来。症状：多进程渲出来的帧和单帧不一样。

**R2 — 一镜一文件，≤120 行。** `shots/01.js`、`02.js`… 每镜一个文件，`SHOTS.push({...})` 注册。
> 症状：一个文件 400 行以后你改一行就崩，还查不出崩在哪。

**R3 — 镜头脚本只调 `ENGINE.*` 和 `API.*`。** 不要 `ctx.fillRect` 画主体、不要手写渐变、不要自己写抖动。
> 例外：纯装饰的一次性小东西可以，但一旦超过 5 行，就该加进 engine 或抽成局部函数。

**R4 — 不许改 `engine.js` / `character.js` / `assemble.js` / `index.html` 的装配部分。**
> 改引擎 = 三种风格全崩，而且你已经没有基线了。真要改，先问用户。

**R5 — 一切时间用绝对秒。** `start` / `end` / `t` 都是全片时间。不要维护"镜内时间"（`u` 已经给了镜内进度）。
**镜头必须首尾相接**：`s2.start == s1.end`，最后 `end == CFG.DURATION`。中间留缝 = 黑帧。

**R6 — 一切跟着音乐走。** 先有 `song-analysis.json`（BPM/拍位/段落），再写分镜。卡点用 `API.beatPhase(t)`，不要凭感觉写秒数。

**R7 — 一句歌词一个画面。** 一句歌词里只安排**一个主要动作**。想塞两个 → 拆成两句歌词 / 两个镜头。

**R8 — 先分镜后代码。** `STORYBOARD.md` 里没写的一镜，不许开始写代码。

**R9 — 数字必须实测。** BPM 来自 `./mv.sh analyze`，帧耗时来自 `./mv.sh speed`，视频参数来自 `ffprobe`。不许编。

**R10 — 交付前必须自己看过成片的接触表。** 不是"应该没问题"，是 `read_image` 看过 `out/sheet.jpg`。

---

## 3. 开工前一次问清（`ask_user_question`，一次问完 5 个）

| # | 问题 | 选项 |
|---|---|---|
| 1 | 用哪首歌？ | 用户给文件路径；只有视频就给视频（`./mv.sh analyze` 能拆） |
| 2 | 三种画风选哪个？ | ① 像素游戏风 ② 纸艺拼贴 ③ 扁平绘本/蜡笔 ④ **不确定 → 我先出三张样图你挑** |
| 3 | 横屏还是竖屏？ | ① 竖 1080×1920（抖音/快手/视频号，默认）② 横 1920×1080（B站/YouTube） |
| 4 | 要歌词上屏吗？ | ① 要，我有 LRC/SRT ② 要，但我没有时间轴（我用 `analyze_song` 估 + 你听一遍改）③ 不要歌词，纯画面 |
| 5 | 这支 MV 讲什么？ | 给 2–3 个方向让它选（例：一个人的深夜回家路 / 一件旧物的十年 / 两个人的错过） |

> 只有第 4 问的 ② 会拖时间：**歌词时间轴错 1–2 秒是这类片子最高频的事故**，见 `references/lyrics-and-beats.md`。

---

## 4. 流水线（6 步 + 闸门，一步不许跳）

```
P0 建工程 → P1 听歌+歌词 → P2 定画风 → P3 画角色 → P4 写分镜 → P5 逐镜作画 → P6 出片交付
```

### P0 建工程
```bash
./mv.sh env                                    # 缺什么先修什么；末行 ENV PASS 才继续
./mv.sh init work/my-mv --style=crayon --w=1080 --h=1920 --bpm=92 --dur=<片长>
./mv.sh check work/my-mv                       # 空工程应该 PASS
```
> 像素风的 `W/H` 是"像素世界"（横 320×180 / 竖 180×320），输出分辨率在 `OUT` 里。

**G0**：`ENV PASS` 且 `check` 退出码 0。

### P1 听歌 + 歌词（**这首 MV 的地基**）
```bash
./mv.sh ncm song.ncm                           # 只有拿到网易云 .ncm 时才用：还原成 song.mp3（无损，不重编码）
./mv.sh analyze song.mp3                       # → song-analysis.json：BPM、拍位、段落、情绪起落
./mv.sh lyric song.lrc -o work/my-mv/lyrics.js # LRC → lyrics.js（SRT 也行）
```
做完读 `references/lyrics-and-beats.md`，确认三件事：**BPM 对不对、第一拍偏移 OFF 是多少、每句歌词的起止秒在片长内**。

**G1**：`song-analysis.json` 有 BPM；`check` 的"歌词"行 PASS（没有负时间、没有超片长、每句 ≥0.6s）。

### P2 定画风
用户没选就出样图：用 `templates/<style>/demo/` 直接渲三张（或让用户拿三张 demo 图挑），**不要先写代码再问**。
```bash
./mv.sh stills templates/pixel/demo 1.6        # 每种风格一张
```
**G2**：用户明确说了哪一个，或你已用 `ask_user_question` 拿到选择。

### P3 画角色（**角色漂移的唯一解法**）
角色只存在 `work/my-mv/character.js` 一个文件里，所有镜头都从它取。
```bash
# 改 character.js 的 draw()/EXPRESSIONS/ACTIONS，然后
./mv.sh sheet work/my-mv                       # → out/character-sheet.png（三视图/表情/动作）
read_image out/character-sheet.png             # 必须看
```
**G3**：设定图上能一眼认出"同一只角色"，至少 4 个表情、4 个动作；朝向/表情/动作格都在格子里，没有出框、没有互相压住。

### P4 写分镜（**最重要的一步，省 Token 全靠它**）
照 `references/storyboard.md` 的 9 列表，把每句歌词一行写进 `STORYBOARD.md`，**先给用户看**，确认了再写代码。
**G4**：每行都填满 9 列；每个镜头 2–6s；全片至少 5–6 个不同场景；相邻两镜的"怎么接下一个"都写了（`cut/whip/lift/card/flash/fade/zoom` 之一）。
> 反面教训：抽象歌词不解释意境 → 画面好看但看完一头雾水。**"这句在说什么"这一列必须写人话**。

### P5 逐镜作画（每镜 5 步，不许合并）
```bash
# 1. 写 shots/NN.js（≤120 行）——照 references/shots.md 的骨架
# 2. 静态自检
./mv.sh check work/my-mv
# 3. 出这一镜的 3 张图 + 看
./mv.sh stills work/my-mv <镜头的 20%/55%/90% 秒数>
read_image work/my-mv/out/stills.jpg
# 4. 有运动/穿帮再看区间
./mv.sh sweep work/my-mv <start> <end>
# 5. 把"看了什么、发现什么、改了什么"写进 REVIEW.md，然后才做下一镜
```
**G5（每镜）**：`check` PASS + 你已经 `read_image` 看过 + 四问都答了：
① 这镜是不是空的/几乎不动？ ② 角色尺寸对不对（中景占画面高 20–28%）？ ③ 有没有穿帮（道具挡脸、脚没踩地、画面被歌词压住）？ ④ 跟上一镜接得上吗（末帧→首帧角色位置姿势）？

### P6 出片交付
```bash
./mv.sh speed work/my-mv                # 秒/帧 ≤0.15 才继续（>0.3 先优化画法，别硬渲）
./mv.sh render work/my-mv               # 后台跑：bash -c 里加 run_in_background
./mv.sh encode work/my-mv
./mv.sh deliver work/my-mv song.mp3     # 封原曲 + 转码 + ffprobe 自检；末行 DELIVER PASS
./mv.sh stills ... 或用 contact_sheet 出全片接触表，read_image 看过
present work/my-mv/out/deliver.mp4
```
**G6**：`DELIVER PASS` + 全片接触表看过（没有黑帧、没有连着 1 秒不动的段、切点都在打算的地方）+ 每句歌词画面演的就是这句。

---

## 5. 命令表（只记 `mv.sh` 的动词，别自己拼 node/ffmpeg）

| 命令 | 干什么 | 何时用 |
|---|---|---|
| `./mv.sh env` | 环境自检 | P0 |
| `./mv.sh init <dir> --style= --w= --h= --bpm= --dur=` | 建工程（拷引擎+装配页+1 个镜头骨架） | P0 |
| `./mv.sh ncm <ncm\|目录>` | 网易云 .ncm → mp3（原样还原，带标签封面） | 源文件是 .ncm 时，P1 之前 |
| `./mv.sh analyze <song>` | BPM/拍位/段落 → `song-analysis.json` | P1 |
| `./mv.sh lyric <lrc\|srt> [-o lyrics.js]` | 歌词 → `lyrics.js` | P1 |
| `./mv.sh check <dir>` | 静态自检（接线/首尾相接/黑名单/歌词轴/引擎接口）退出码 0/1 | 每镜 |
| `./mv.sh stills <dir> 1.2,3.4` | 出几张关键帧 + 接触表 | 每镜 |
| `./mv.sh sheet <dir>` | 角色设定图 | P3 |
| `./mv.sh sweep <dir> 2.0 3.0` | 区间逐帧拼条（看运动/穿帮） | 每镜 |
| `./mv.sh speed <dir>` | 渲 1 秒测速 | P6 |
| `./mv.sh render <dir>` | 渲整片（断点续渲） | P6 |
| `./mv.sh encode <dir>` | 帧 → 无声 mp4 | P6 |
| `./mv.sh deliver <dir> <song>` | 封原曲 + 抖音参数 + 自检 | P6 |

**改动一个镜头后重渲**：`./mv.sh render` 会跳过已渲的帧；只想重渲某段就加 `--from 12 --to 18 --force`。

---

## 6. 交付标准（数字，拿去对）

| 项 | 要求 |
|---|---|
| 分辨率 | 竖 1080×1920 / 横 1920×1080 |
| 帧率 | 30fps（`CFG.FPS`，别中途改） |
| 编码 | H.264 High / yuv420p / bt709 三件套 / `+faststart` |
| 码率 | 6–12 Mbps（平涂暗场多，别用 crf，用 `-b:v 8M`） |
| 响度 | 整体 −14 LUFS ±1；真峰 ≤ −1 dBTP |
| 音频 | 44.1kHz 立体声，**原曲换回**（渲出来的音轨会被压 2–4dB） |
| 画面 | 前 3 秒不能黑屏；没有连着 1 秒几乎不动的段；切点都在打算的地方 |
| 歌词 | 每句画面演的就是这句；脸/手/道具不被字幕挡住；下方 15% 是歌词区 |

---

## 7. flash 最容易犯的 10 个错（先看这张表，能省半天）

1. **一次写完所有镜头**才看图 → 崩了不知道哪镜错。改成一次一镜。
2. **镜头之间留缝 / 忘了改 `CFG.DURATION`** → 中间黑一帧、结尾截断。`check` 会抓，别绕过它。
3. **`Math.random()`** → 多进程渲出来每帧都不一样。用 `ENGINE.noise`。
4. **自己拿 `ctx.fillStyle = '#3a3f63'` 画主体** → 三种风格的调色板全乱。用 `ENGINE.palette` + `ENGINE.piece`。
5. **把秒数写死成"感觉"** → 不卡拍。用 `song-analysis.json` 的拍位，或 `API.beatPhase(t)`。
6. **一句歌词塞三个动作** → 画面糊成一团。一句一个动作。
7. **镜头太长**（8 秒不动） → 像 PPT。一镜 2–6s；副歌 1.5–2.5s。
8. **转场全用 `fade`（整屏叠化）** → 廉价。用 `whip` / `card` / `flash` / `lift`，按画风挑。
9. **改 `engine.js` "就改一点点"** → 全线崩，且失去基线。要改先问。
10. **不看图就说"应该没问题"** → 你的自我评价不可信。`read_image`，看图说话。

---

## 8. 排错（详细版见 `references/pitfalls.md`）

| 症状 | 最可能的原因 | 修法 |
|---|---|---|
| 页面白屏 / `sceneReady` 一直不 resolve | 某个 js 有语法错、或引了不存在的文件 | `./mv.sh check`；看 `render` 输出里的"页面报错" |
| 渲出来是纯黑 | 镜头没注册（忘了 `<script src>`）/ `draw` 里抛错 | `check` 的"接线""空跑"两行 |
| 渲成上一镜的样子 | 新镜头没接进 `index.html`，或 `start/end` 写错 | `check` 的"接线"行 |
| 画面在抖/闪 | `Math.random()`，或填色种子跟 `t` 变 | 用 `ENGINE.noise`，填色种子固定 |
| 中文糊成一团（像素风） | 在像素小画布里写中文 | 歌词必须由 `ENGINE.lyric` 画在输出分辨率上 |
| 出图是黑的但没报错 | Chrome 多进程撞车 / 帧写入失败 | `--workers 1` 重试这一帧 |
| 秒/帧 > 0.3 | 每帧现算纸纹/噪声/渐变 | 挪进 `setup()` 缓存到离屏 canvas |
| 成片音画差 1–2 秒 | 歌词时间轴没减"片段起点" | `references/lyrics-and-beats.md` 的 offset 一节 |
| 输出时长不对 | `--fps` 传错 / `DURATION` 和最后镜头 end 不一致 | `check` 的"片长"行 |

---

## 9. references（用到才读，别一次全读）

| 文件 | 什么时候读 |
|---|---|
| `references/lyrics-and-beats.md` | P1：测拍、歌词时间轴、offset 换算（**最高频事故**） |
| `references/storyboard.md` | P4：9 列分镜表、情绪曲线、转场衔接规则、反面例子 |
| `references/shots.md` | P5：镜头脚本骨架、能用的 API 全表、3 个范例（简单/中景/情绪点） |
| `references/styles.md` | P2/P3：三种画风的工艺口径、什么题材配什么风格、各自 STYLE.md 在哪 |
| `references/pitfalls.md` | 出问题先查这张表（症状→原因→修法，含静默失败） |
| `references/review.md` | P5/P6：审图三层法、6 条过线标准、交付参数与 ffprobe 判读 |
| `references/prompt-cards.md` | 想知道"博主原话怎么说的"、或用户要"照教程里的提示词来" |
| `templates/<style>/STYLE.md` | 写该风格镜头时：这个引擎有哪些 kind、配色在哪改、禁止什么 |

---

## 附：目录说明

```
music-mv/
  SKILL.md                  ← 你正在看的
  mv.sh                     ← 唯一入口，11 个动词
  scripts/                  ← 测拍、歌词、渲帧、封音、自检（不要改）
  templates/_shared/        ← 装配页 index.html + assemble.js + 两份接口契约（不要改）
  templates/{pixel,collage,crayon}/
      engine.js             ← 画风工艺（不要改）
      character.js          ← 默认角色阿蟹（P3 会替换成用户的角色）
      STYLE.md              ← 这个引擎的用法与禁区
      demo/                 ← 两镜样片（可直接渲出来看）
  assets/banned_words_zh.txt← 抖音脏话词表（字幕合规用）
```
