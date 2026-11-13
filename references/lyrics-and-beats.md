# 歌词与实测拍位

`./mv.sh analyze 歌曲.wav -o 工程/song-analysis.json --rhythm 工程/rhythm.js` 同时输出分析与装配页实际加载的事件轨。对既有工程可这样重测。新工程直接用 `init --analysis=分析文件` 从同一份分析导入时钟、鼓点与片名。分析包含 BPM、绝对拍位、小节首拍估计、响度段落、突出重音和分频候选。只有 NumPy 时，省略两个输出选项，读取终端的 BPM/相位，随后手工填写工程的节奏轨。

## 从听校到接触帧

1. 在原曲的开头、中段和尾段分别数两个小节。核对 BPM 半速/倍速、反拍以及前奏拾音。把听准的 BPM、第一拍秒数分别写进 `CFG.BPM` 和 `CFG.OFF`。自动小节首拍按 4/4 推算，其他拍号直接更正小节轨。
2. `rhythm.js` 的 `beats/downbeats/kick/snare/hat` 都是从成片零点算的升序秒数。后三轨分别取低、中、高频的起音，808 延音、人声齿音、叠鼓可能造成错分或漏检。对照波形和声音，删误触、补漏点、移动偏早偏晚的点。必要时自建 `rhyme` 轨标出听准的人声押韵。重新分析会覆盖指定输出，保留听校版时请另选文件名。
3. 渲染时 `API.pulse('kick', t, 0.14)` 在最接近事件的输出帧起跳，并在 0.14 秒内衰减；`API.pulse('rhyme', t)` 同样可用。没有实测拍表时只有 `beats` 使用 BPM/OFF 等距拍网，其余空轨为零。`beatIndex/beatPhase` 表示等距节拍，适合循环、呼吸、步伐；变速与切分读事件轨。
4. 让鼓击对应动作的接触或方向突变。渲染在帧号 `round(事件秒 × FPS)` 硬切时把镜头边界设为 `帧号 / FPS`；准备动作提前数帧，衣摆、余震或收手放在后面。踩镲可动饰物，军鼓可切反应，底鼓可让鞋落地。为每个乐段选主次，避免全屏同时跳动。
5. 检查一处指定重音时，依次出目标帧前一帧、目标帧、后一帧；例如 30 fps 的 2.40 秒可取 `2.36667,2.4,2.43333`。听看带原声的连续片段，记录“目标秒 / 实际帧 / 偏差”。整段固定早晚时查音源与剪辑零点；误差逐渐增加时查速度和拍表。

## 歌词

SRT 直接用 `./mv.sh lyric 歌词.srt -o 工程/lyrics.js`。LRC 或纯文本用 `./mv.sh lyric 歌词.lrc -o 工程/lyrics.js --out= --csv=`，若需要网格可指定 Markdown 与 CSV 输出路径。纯文本顺排仅作初稿。LRC 通常只给开始时间，要听校句尾、间奏以及尾奏。截歌时统一减去原曲片段起点，并裁到片长范围；LRC 网格的 `--offset` 表示首强拍相位。

字幕按呼吸、可读性和实际发声断句；快嘴短于 0.6 秒会提醒，允许保留可读的短词或并入相邻句。歌词起唱、画面切点、动作峰值分别标记。无歌词和开场即开唱都可以有动态片头。需要按发布要求处理用词时，查 `scripts/mask_words.py --help`。

## 增强型 LRC 的字级时间

`lyric_grid.py` 会保留形如 `[00:01.00]<00:01.00>落<00:01.85>地` 的字符起始秒，输出为 `window.LYRICS = [[start, end, text, [{ch, t}, ...]]]`。旧的三项数组继续有效。打开 `CFG.LYRIC.stagger` 时，装配器优先使用这些字级秒数，没有字级数据时回退到句内均分。

## 可选动作落点

旧写法 `api.actionCue('snare', start, end, 0.62)` 保持不变。需要指定听校点时可以传对象。

```js
const release = api.actionCue({ track: 'snare', at: 1.50 }, this.start, this.end);
const landing = api.actionCue({ track: 'kick', index: 18 }, this.start, this.end);
const turn = api.actionCue({ track: 'beats', offset: 0.40 }, this.start, this.end);
```

`at` 和 `time` 是绝对秒，`index` 是节奏轨数组下标，`offset` 是相对镜头起点的秒数。指定值不在镜头范围时会回退到原有的中段近邻策略。停顿和拖拍镜头可以继续不绑定声音事件。
