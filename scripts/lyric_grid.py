#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""lyric_grid.py <lyrics.lrc|txt> [--bpm=120] [--offset=0] [--fps=30] [--maxlen=14] [--gap=0.4]
                 [--out=grid.md] [--csv=grid.csv] [--shots=auto|N]

把 LRC / 纯文本歌词拆成四块可以直接照着做分镜的表：

  ① 句子表      序号 | 起 | 止 | 时长 | 字数 | 建议 sing 时长 | 每秒字数 | 是否超长
  ② 节拍网格    每句起始落在第几拍 / 第几小节，以及"提前 0.2s 进"的落点
  ③ 建议镜号    句长 > 6s、情绪词、超长句 → 切新镜；相邻同镜会提示"可做一镜到底"
  ④ 情感曲线    -3..+3 的启发式打分（叹词 / 重复 / 长音 / 问叹号 → 高）＋ sparkline

末尾附一段可直接粘进 src/karaoke.js（或你自己的 overlay）的 `const LY=[[start,end,"text"],...]`。

用法示例
  python3 lyric_grid.py assets/lyrics.lrc --bpm=96 --offset=0.18
  python3 lyric_grid.py assets/lyrics.lrc --shots=8 --maxlen=12 --out=assets/grid.md
  python3 lyric_grid.py lyrics.txt --bpm=120 --gap=0.6      # 纯文本：时间轴是估的
  cat lyrics.lrc | python3 lyric_grid.py - --bpm=120

时间约定：表格里的时间 = 音频时间（秒）。粘进 LY 之前，如果成片只截了歌的一段，记得整体减去 clip 起点。
"""
import argparse
import csv
import io
import os
import re
import sys

# ------------------------------------------------------------------ 解析

TS_RE = re.compile(r'\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]')          # [mm:ss] / [mm:ss.xx] / [mm:ss.xxx] / [mm:ss:xx]
ENH_RE = re.compile(r'<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>')                    # 增强型 LRC 的逐字时间戳
META_RE = re.compile(r'^\[(ti|ar|al|by|offset|re|ve|length|tool|encoding):(.*)\]$', re.I)

# 不算"要唱的字"：标点、空白、装饰符
PUNCT = set('，。！？、；：,.!?;:\'"“”‘’…—–-~～（）()《》〈〉「」『』【】[]{}·/\\|　 \t')


def count_chars(text):
    """要唱的字数：去掉空白和标点后剩下的字符数（中英混排都按字算）。"""
    return sum(1 for ch in text if not ch.isspace() and ch not in PUNCT)


def strip_marks(text):
    """去掉时间戳和逐字标记，留下纯歌词。"""
    t = TS_RE.sub('', text)
    t = ENH_RE.sub('', t)
    return t.strip()


def ts_to_sec(tag):
    """'mm:ss' / 'mm:ss.xx' / 'mm:ss:xx' / 'mm:ss.xxx' → 秒。"""
    m = re.match(r'^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$', tag.strip())
    if not m:
        return 0.0
    mm, ss, fr = int(m.group(1)), int(m.group(2)), m.group(3)
    return mm * 60 + ss + (0.0 if fr is None else int(fr) / (10 ** len(fr)))


def parse_lrc(raw):
    """返回 (entries, meta, untimed, warnings)。

    entries: [(start_seconds, text)]，按时间升序，text 已去标签（可能是空串 = 间奏占位）。
    untimed: 没有任何时间戳的歌词行（会被顺排到末尾并告警）。
    """
    meta, entries, untimed, warns = {}, [], [], []
    offset_ms = 0
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue
        m = META_RE.match(s)
        if m:
            k, v = m.group(1).lower(), m.group(2).strip()
            meta[k] = v
            if k == 'offset':
                try:
                    offset_ms = int(float(v))
                except ValueError:
                    warns.append('[offset:%s] 不是数字，已忽略' % v)
            continue
        stamps = list(TS_RE.finditer(s))
        if not stamps:
            # 只有逐字标记的增强行（没有 [mm:ss.xx] 行首戳）：用第一个词的时间当句首
            enh = list(ENH_RE.finditer(s))
            if enh:
                entries.append((ts_to_sec(enh[0].group(0)[1:-1]), ENH_RE.sub('', s).strip()))
                continue
            if count_chars(s):
                untimed.append(s)
            continue
        text = strip_marks(s)
        for st in stamps:
            entries.append((ts_to_sec(st.group(0)[1:-1]), text))
    entries.sort(key=lambda x: x[0])
    if offset_ms:
        # LRC 的 [offset:+500] 约定：正值让歌词提前 0.5s 出现
        entries = [(max(0.0, t - offset_ms / 1000.0), txt) for t, txt in entries]
        warns.append('应用了 LRC 头部的 [offset:%+d]（歌词整体%s %.2fs）'
                     % (offset_ms, '提前' if offset_ms > 0 else '延后', abs(offset_ms) / 1000.0))
    return entries, meta, untimed, warns


def estimate_duration(text, gap):
    """纯文本模式下一句大概占多久：约 4.2 字/秒 + 0.35s 余量，最短 1.2s。"""
    return max(1.2, count_chars(text) / 4.2 + 0.35)


def sentences_from_plain(lines, gap):
    """纯文本：按 --gap 顺排。返回 (sentences, total_end)。"""
    out, t = [], 0.0
    for txt in lines:
        d = estimate_duration(txt, gap)
        out.append((t, t + d, txt))
        t += d + gap
    return out, t


def append_untimed(sents, untimed, gap):
    """有时间戳 + 有裸行：裸行按 gap 顺排在最后，并告警。"""
    t = sents[-1][1] + gap if sents else 0.0
    for txt in untimed:
        d = estimate_duration(txt, gap)
        sents.append((t, t + d, txt))
        t += d + gap
    return sents


# ------------------------------------------------------------------ 分析

INTERJ = ['啊', '呀', '哦', '噢', '唉', '嘿', '哈', '呜', '哇', '嗯', '啦', '吧', '哟', '喂', '喔', '哼']
HIGH_WORDS = ['爱', '哭', '笑', '梦', '痛', '别', '永远', '再见', '燃烧', '奔跑', '拥抱',
              '自由', '孤独', '喊', '回家', '远方', '天亮', '坠落', '想念', '心碎', '疯']
CUT_REASONS = ['上句 %.1fs > 6s', '本句 %.1fs > 6s']


def emotion_of(start, end, text):
    """-3..+3 的启发式情绪分，返回 (score, [触发的理由])。"""
    dur, chars = end - start, count_chars(text)
    score, why = 0, []
    if '！' in text or '!' in text:
        score += 2
        why.append('感叹号')
    if '？' in text or '?' in text:
        score += 1
        why.append('问号')
    hits = [w for w in INTERJ if w in text]
    if hits:
        score += min(2, len(hits))
        why.append('叹词「%s」' % ''.join(hits[:3]))
    if re.search(r'([\u4e00-\u9fff])\1', text):
        score += 1
        why.append('重复字')
    if dur >= 5.0:
        score += 1
        why.append('长音 %.1fs' % dur)
    strong = [w for w in HIGH_WORDS if w in text]
    if strong:
        score += 1
        why.append('情绪词「%s」' % '/'.join(strong[:3]))
    if dur <= 1.5 and chars <= 5:
        score -= 1
        why.append('短促气声')
    if text.endswith(('，', ',')) and dur >= 3.0:
        score -= 1
        why.append('长句未完（逗号收尾）')
    score = max(-3, min(3, score))
    return score, why


SPARK = '▁▂▃▄▅▆▇█'


def sparkline(scores):
    if not scores:
        return ''
    return ''.join(SPARK[int(round((s + 3) / 6.0 * (len(SPARK) - 1)))] for s in scores)


def beat_info(start, bpm, offset):
    beat = 60.0 / bpm
    bp = (start - offset) / beat             # 相对 offset 的拍位置，可为负（这句在 offset 之前）
    bp_eff = max(0.0, bp)                    # 小节/拍位按 0 起算，负拍不许出现 "0 小节"
    idx = int(bp_eff // 1)
    bar = int(bp_eff // 4) + 1
    in_bar = idx % 4 + 1
    dev = bp - round(bp)                     # 距离最近整拍，单位=拍
    if abs(dev) <= 0.06:
        hint = '正拍 ✓'
    elif abs(dev) <= 0.15:
        hint = '近拍（%.0fms）' % (dev * beat * 1000)
    else:
        hint = '偏 %.2f 拍' % dev
    if bp < 0:
        hint = '早于 offset %.2fs；' % (offset - start) + hint
    return beat, bp, bar, in_bar, dev, hint


def plan_shots(sents, forced, maxlen):
    """返回 (shot_ids, reasons, grouped)。forced 为 None 时自动分镜。"""
    n = len(sents)
    shot_ids, reasons = [], []
    if forced:
        total = max(1e-6, sents[-1][1] - sents[0][0])
        for i, (a, b, txt) in enumerate(sents):
            sid = min(forced - 1, int((a - sents[0][0]) / total * forced)) + 1
            shot_ids.append(sid)
            reasons.append('--shots=%d 按时长均分' % forced)
        return shot_ids, reasons

    cur, shot_start = 1, sents[0][0] if sents else 0.0
    for i, (a, b, txt) in enumerate(sents):
        dur, chars = b - a, count_chars(txt)
        if i == 0:
            shot_ids.append(cur)
            reasons.append('开场')
            continue
        prev_dur = sents[i - 1][1] - sents[i - 1][0]
        why = []
        if prev_dur > 6:
            why.append('上句 %.1fs > 6s' % prev_dur)
        if dur > 6:
            why.append('本句 %.1fs > 6s' % dur)
        if any(w in txt for w in HIGH_WORDS):
            why.append('情绪词「%s」' % next(w for w in HIGH_WORDS if w in txt))
        if chars > maxlen:
            why.append('超长句 %d 字 > %d' % (chars, maxlen))
        if a - shot_start > 8:
            why.append('本镜已 %.1fs > 8s' % (a - shot_start))
        if why:
            cur += 1
            shot_start = a
            shot_ids.append(cur)
            reasons.append('；'.join(why))
        else:
            shot_ids.append(cur)
            reasons.append('同镜续接')
    return shot_ids, reasons


def group_shots(sents, shot_ids):
    groups = []
    for i, sid in enumerate(shot_ids):
        if groups and groups[-1][0] == sid:
            groups[-1][2] = i
        else:
            groups.append([sid, i, i])
    out = []
    for sid, i0, i1 in groups:
        out.append((sid, i0, i1, sents[i0][0], sents[i1][1]))
    return out


# ------------------------------------------------------------------ 报告

def fmt(t):
    return '%.2f' % t


def esc(text):
    return text.replace('|', '\\|')


def build_report(path, meta, sents, args, plain_mode, warns):
    bpm = args.bpm
    beat = 60.0 / bpm
    total = sents[-1][1] - sents[0][0] if sents else 0.0
    shot_ids, reasons = plan_shots(sents, args.shots, args.maxlen)
    groups = group_shots(sents, shot_ids)
    scores, whys = [], []
    for a, b, txt in sents:
        sc, wy = emotion_of(a, b, txt)
        scores.append(sc)
        whys.append(wy)

    L = []
    L.append('# 歌词网格 · %s' % (meta.get('ti') or os.path.basename(path)))
    L.append('')
    L.append('> 源 `%s`  ·  bpm **%g**  ·  offset **%gs**  ·  一拍 **%.3fs**  ·  句数 **%d**  ·  总时长 **%.2fs**  ·  fps %g'
             % (path, bpm, args.offset, beat, len(sents), total, args.fps))
    if meta.get('ar'):
        L.append('> 歌手 %s%s' % (meta['ar'], ('  ·  专辑 ' + meta['al']) if meta.get('al') else ''))
    if plain_mode:
        L.append('> ⚠️ **时间轴是估的**：输入里没有 `[mm:ss.xx]` 时间戳，按 `--gap=%g` 顺排（约 4.2 字/秒）。拿到真 LRC 后用真时间重跑。' % args.gap)
    for w in warns:
        L.append('> ⚠️ %s' % w)
    L.append('')
    L.append('---')
    L.append('')

    # ① 句子表
    L.append('## ① 句子表')
    L.append('')
    L.append('| # | 起 | 止 | 时长 | 字数 | 建议 sing | 字/秒 | 超长 |')
    L.append('|---:|---:|---:|---:|---:|---:|---:|:--|')
    for i, (a, b, txt) in enumerate(sents, 1):
        dur, chars = b - a, count_chars(txt)
        sing = min(dur * 0.95, max(0.7, chars / 5.2 + 0.3)) if chars else 0.0
        sps = chars / dur if dur > 0 else 0.0
        over = '**是** %d>%d' % (chars, args.maxlen) if chars > args.maxlen else ''
        L.append('| %d | %s | %s | %s | %d | %s | %.2f | %s |'
                 % (i, fmt(a), fmt(b), fmt(dur), chars, fmt(sing), sps, over))
    L.append('')
    L.append('> `建议 sing` = min(时长×0.95, 字数/5.2+0.3)：karaoke 逐字填充用的时长（`LY` 的 `opts.sing`）。'
             '字/秒 > 5 说明这句偏赶，考虑拆成两行或让字挤一点；< 2 说明可以拖长音做动作。')
    L.append('')

    # ② 节拍网格
    L.append('## ② 节拍网格')
    L.append('')
    L.append('| # | 句首 | 第几拍 | 小节.拍 | 偏差 | 建议进（提前 0.2s） | 提示 |')
    L.append('|---:|---:|---:|:--|---:|---:|:--|')
    for i, (a, b, txt) in enumerate(sents, 1):
        _, bp, bar, in_bar, dev, hint = beat_info(a, bpm, args.offset)
        t_in = max(0.0, a - 0.2)
        bp_in = (t_in - args.offset) / beat
        L.append('| %d | %s | %.2f | %d 小节 %d 拍 | %+.2f 拍 | %s（%.2f 拍） | %s |'
                 % (i, fmt(a), bp + 1, bar, in_bar, dev, fmt(t_in), bp_in + 1, hint))
    L.append('')
    L.append('> 拍号从 `offset`（第一个强拍）开始数，4/4 拍一小节。**切镜落在小节第 1 拍最稳**；'
             '落在第 2/3/4 拍也可以，但要在下一句之前留够动作时间。偏差 > 0.25 拍说明这句是"散拍"唱的，'
             '别硬卡拍，改成提前 0.2s 进、靠动作带。')
    L.append('')

    # ③ 建议镜号
    L.append('## ③ 建议镜号')
    L.append('')
    L.append('| 镜 | 句 | 时间 | 时长 | 理由 |')
    L.append('|:--|:--|:--|---:|:--|')
    for sid, i0, i1, a, b in groups:
        lines_txt = ('%d' % (i0 + 1)) if i0 == i1 else ('%d–%d' % (i0 + 1, i1 + 1))
        span_txt = '%s–%s' % (fmt(a), fmt(b))
        reason = '；'.join(dict.fromkeys(reasons[i0:i1 + 1])) if i1 > i0 else reasons[i0]
        L.append('| %02d | %s | %s | %s | %s |'
                 % (sid, lines_txt, span_txt, fmt(b - a), esc(reason)))
    L.append('')
    same = [(g[1] + 1, g[2] + 1) for g in groups if g[2] > g[1]]
    if same:
        L.append('**可做一镜到底**：' + '、'.join('句 %d–%d' % (x, y) for x, y in same)
                 + ' 落在同一镜里 → 不切镜，用机位推进 / 角色动作 / 光变化顶住节奏。')
    else:
        L.append('**没有相邻同镜**：每句都换镜。句短于 2s 的话会显得碎，可以把两句并进一个镜（用 brushWipe 之外的内部运动过渡）。')
    L.append('')
    L.append('> 规则：上句或本句 > 6s、出现情绪词、字数 > %d、或本镜已超 8s → 切新镜。'
             '`--shots=N` 可强制均分成 N 个镜。' % args.maxlen)
    L.append('')

    # ④ 情感曲线
    L.append('## ④ 情感曲线占位（-3..+3）')
    L.append('')
    L.append('| # | 句 | 分值 | 触发 |')
    L.append('|---:|:--|---:|:--|')
    for i, (a, b, txt) in enumerate(sents, 1):
        L.append('| %d | %s | %+d | %s |'
                 % (i, esc(txt if len(txt) <= 18 else txt[:17] + '…'), scores[i - 1],
                    esc('、'.join(whys[i - 1]) or '平稳')))
    L.append('')
    L.append('```')
    L.append('情感曲线（左→右 = 句 1..%d，▁=-3 █=+3）' % len(sents))
    L.append('  ' + sparkline(scores))
    L.append('```')
    L.append('')
    L.append('> 启发式，不是分析结果：叹词 / 重复字 / 长音 / 问叹号 / 情绪词 → 高，短促气声 / 逗号收尾的长句 → 低。'
             '直接当"这段该用什么颜色、机位该推还是拉、笔触该重还是轻"的初稿，边看边改。')
    L.append('')

    # ⑤ 代码
    L.append('## ⑤ 可直接粘贴')
    L.append('')
    L.append('```js')
    L.append('// 粘进 src/karaoke.js 的 const LY（或你自己的 overlay）；时间已按音频秒，截片时整体减去 clip 起点')
    L.append('const LY = [')
    for i, (a, b, txt) in enumerate(sents):
        sing = min((b - a) * 0.95, max(0.7, count_chars(txt) / 5.2 + 0.3)) if count_chars(txt) else 0.0
        body = txt.replace('\\', '\\\\').replace('"', '\\"')
        L.append('  [%.2f, %.2f, "%s", { sing: %.2f }],' % (a, b, body, sing))
    L.append('];')
    L.append('```')
    L.append('')
    L.append('> 每句都写了 `sing`：想让它按句长自动唱就删掉 `{ sing: … }`（karaoke.js 的默认值是 min(句长×0.85, 字数×0.3)）。')
    return '\n'.join(L) + '\n'


def write_csv(path, sents, args, shot_ids, scores):
    bpm = args.bpm
    beat = 60.0 / bpm
    with io.open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['idx', 'start', 'end', 'dur', 'chars', 'sing', 'chars_per_sec',
                    'overlong', 'beat', 'bar', 'bar_beat', 'shot', 'emotion', 'text'])
        for i, (a, b, txt) in enumerate(sents, 1):
            dur, chars = b - a, count_chars(txt)
            sing = min(dur * 0.95, max(0.7, chars / 5.2 + 0.3)) if chars else 0.0
            _, bp, bar, in_bar, _dev, _hint = beat_info(a, bpm, args.offset)
            w.writerow([i, '%.2f' % a, '%.2f' % b, '%.2f' % dur, chars, '%.2f' % sing,
                        '%.2f' % (chars / dur if dur > 0 else 0),
                        'Y' if chars > args.maxlen else '',
                        '%.2f' % bp, bar, in_bar, shot_ids[i - 1], scores[i - 1], txt])


# ------------------------------------------------------------------ main

def main(argv):
    ap = argparse.ArgumentParser(
        prog='lyric_grid.py',
        description='LRC/纯文本歌词 → 句子表 + 节拍网格 + 建议镜号 + 情感曲线（Markdown + CSV）',
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('lyrics', help='歌词文件（.lrc / .txt），或 - 从 stdin 读')
    ap.add_argument('--bpm', type=float, default=120.0, help='歌曲 BPM（默认 120；测拍用 painted-animation/scripts/beat_grid.py）')
    ap.add_argument('--offset', type=float, default=0.0, help='第一个强拍在音频里的秒数（默认 0）')
    ap.add_argument('--fps', type=float, default=30.0, help='成片帧率，只写进表头做参考（默认 30）')
    ap.add_argument('--maxlen', type=int, default=14, help='一句多少字算超长（默认 14）')
    ap.add_argument('--gap', type=float, default=0.4, help='纯文本顺排时句与句之间的空隙秒数（默认 0.4）')
    ap.add_argument('--out', default='grid.md', help='Markdown 输出路径（默认 grid.md；传空串跳过）')
    ap.add_argument('--csv', default='grid.csv', help='CSV 输出路径（默认 grid.csv；传空串跳过）')
    ap.add_argument('--shots', default='auto', help='auto（默认，按规则自动分镜）或整数 N 强制均分 N 个镜')
    args = ap.parse_args(argv)

    if args.bpm <= 0:
        ap.error('--bpm 必须 > 0')
    if args.fps <= 0:
        ap.error('--fps 必须 > 0')
    if args.maxlen < 1:
        ap.error('--maxlen 必须 >= 1')
    forced = None
    if str(args.shots).lower() != 'auto':
        try:
            forced = int(args.shots)
        except ValueError:
            ap.error('--shots 只接受 auto 或正整数，收到 %r' % args.shots)
        if forced < 1:
            ap.error('--shots 必须 >= 1')
    args.shots = forced

    # ---- 读输入
    warns = []
    if args.lyrics == '-':
        raw, path = sys.stdin.read(), '<stdin>'
    else:
        path = args.lyrics
        if not os.path.isfile(path):
            sys.stderr.write('FAIL  找不到歌词文件: %s\n' % path)
            return 1
        try:
            raw = io.open(path, encoding='utf-8-sig', errors='replace').read()
        except OSError as e:
            sys.stderr.write('FAIL  读不了 %s: %s\n' % (path, e))
            return 1
    if not raw.strip():
        sys.stderr.write('FAIL  歌词文件是空的: %s\n' % path)
        return 1

    entries, meta, untimed, lrc_warns = parse_lrc(raw)
    warns.extend(lrc_warns)
    plain_mode = False

    if not entries:
        # 没有一行带时间戳 → 纯文本模式
        plain_mode = True
        lines = untimed or [ln.strip() for ln in raw.splitlines() if count_chars(ln.strip())]
        if not lines:
            sys.stderr.write('FAIL  %s 里没有可用的歌词行\n' % path)
            return 1
        sents, _ = sentences_from_plain(lines, args.gap)
        warns.append('输入没有任何 `[mm:ss.xx]` 时间戳，已按纯文本顺排（--gap=%g）' % args.gap)
    else:
        # 用"下一条非空句"的起点当上一句的止
        sents = []
        n = len(entries)
        for i, (t, txt) in enumerate(entries):
            if not count_chars(txt):
                continue
            end = None
            for j in range(i + 1, n):
                if count_chars(entries[j][1]):
                    end = entries[j][0]
                    break
            if end is None:
                end = t + max(2.0, count_chars(txt) / 3.0)
            if end <= t:                       # 同一时间戳的多句（合唱/双语）：给个最小可见时长
                end = t + max(1.2, count_chars(txt) / 4.0)
                warns.append('句「%s」的止时间 <= 起时间（同一时间戳），已按字数估成 %.2fs' % (txt[:10], end - t))
            sents.append((t, end, txt))
        if untimed:
            warns.append('有 %d 行没有时间戳，已按 --gap=%g 顺排到末尾：%s'
                         % (len(untimed), args.gap, ' / '.join(x[:12] for x in untimed[:3])))
            sents = append_untimed(sents, untimed, args.gap)

    if not sents:
        sys.stderr.write('FAIL  解析后没有任何句子\n')
        return 1

    shot_ids, _reasons = plan_shots(sents, forced, args.maxlen)
    scores = [emotion_of(a, b, t)[0] for a, b, t in sents]

    report = build_report(path, meta, sents, args, plain_mode, warns)
    sys.stdout.write(report)
    sys.stdout.flush()

    wrote = []
    if args.out:
        out_dir = os.path.dirname(os.path.abspath(args.out))
        if out_dir and not os.path.isdir(out_dir):
            os.makedirs(out_dir)
        io.open(args.out, 'w', encoding='utf-8').write(report)
        wrote.append(args.out)
    if args.csv:
        csv_dir = os.path.dirname(os.path.abspath(args.csv))
        if csv_dir and not os.path.isdir(csv_dir):
            os.makedirs(csv_dir)
        write_csv(args.csv, sents, args, shot_ids, scores)
        wrote.append(args.csv)
    sys.stderr.write('[lyric_grid] %d 句 · %d 个镜 · %s\n'
                     % (len(sents), len(set(shot_ids)), ' · '.join('写出 ' + p for p in wrote) if wrote else '未写文件'))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
