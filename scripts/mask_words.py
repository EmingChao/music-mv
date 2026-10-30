#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mask_words.py —— 歌词违禁词扫描 + 打码方案生成器（painted-mv 技能包）

用法：
    python mask_words.py <歌词文件.lrc|.txt> [--words=词表路径] [--level=hard|soft]
                         [--json=out.json] [--emit-ly]

    歌词文件   .lrc（带 [mm:ss.xx] 时间戳）或 .txt（纯文本，一行一句）
    --words    词表路径，默认 ../assets/banned_words_zh.txt
               格式：词<TAB>等级<TAB>谐音建议（# 开头为注释）
    --level    hard = 只看 dirty / vulgar / violence（真正会被下架的那类）
               soft = 全部 7 类（默认，含广告法/医疗/导流等软性风险）
    --json     把结构化结果写到文件（方便流水线二次处理）
    --emit-ly  打印可直接粘贴进 src/caption.js 的 `const LY = [...]` 片段

输出：逐行命中表 → 每行建议代码 → 统计 → 人工复核清单 →（可选）LY 片段

设计取舍：
    · 方案优先级固定为「谐音 > 星号 > 删除线」——谐音能保住演唱节奏和情绪，
      星号清晰但生硬，删除线只适合喜剧式的自我审查。词表给了谐音建议就用谐音。
    · 没有可用谐音的暴力/低俗词，推荐「留白」而不是星号：星号在自残、性描写
      语境里依然能读出原意，等于没打码。
    · 子串匹配，宁可多报。单字词（最/死/血）故意不进表，避免误伤正常歌词。
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime

# --------------------------------------------------------------------------- #
# 基础工具
# --------------------------------------------------------------------------- #

LEVELS = ["dirty", "vulgar", "violence", "ad", "medical", "diversion", "platform"]
LEVEL_CN = {
    "dirty": "脏话",
    "vulgar": "低俗",
    "violence": "暴力血腥",
    "ad": "广告法",
    "medical": "医疗夸大",
    "diversion": "导流引流",
    "platform": "平台不鼓励",
}
HARD_LEVELS = {"dirty", "vulgar", "violence"}

# 词表第三列出现这些值时，视为「没有可用谐音」
NO_HOMOPHONE = {"", "留白", "…", "-", "—", "无"}


def dw(s):
    """终端显示宽度：CJK 全角算 2 列。"""
    return sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in s)


def pad(s, w):
    """按显示宽度左对齐补空格；超长则截断加省略号。"""
    s = str(s)
    n = dw(s)
    if n > w:
        out, acc = "", 0
        for ch in s:
            c = 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
            if acc + c > w - 1:
                break
            out += ch
            acc += c
        return out + "…" + " " * max(0, w - acc - 1)
    return s + " " * (w - n)


def rule(w, ch="─"):
    return ch * w


def bar(n, total, width=18):
    if total <= 0:
        return ""
    k = max(1, int(round(width * n / total)))
    return "█" * k


# --------------------------------------------------------------------------- #
# 词表
# --------------------------------------------------------------------------- #

def load_words(path):
    """返回 [{word, level, sug}]，保持文件顺序。"""
    if not os.path.exists(path):
        sys.exit(f"[错误] 词表不存在：{path}")
    words, seen = [], set()
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.rstrip("\n").rstrip("\r")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 2:                       # 容忍空格分隔的第三方词表
                parts = re.split(r"\s{2,}|\s+", line.strip(), maxsplit=2)
            if len(parts) < 2:
                continue
            word = parts[0].strip()
            level = parts[1].strip().lower()
            sug = parts[2].strip() if len(parts) > 2 else ""
            if not word or level not in LEVELS:
                continue
            key = (word, level)
            if key in seen:
                continue
            seen.add(key)
            words.append({"word": word, "level": level, "sug": sug})
    if not words:
        sys.exit(f"[错误] 词表为空或格式不对：{path}")
    # 长词优先，保证「妈的巴子」先于「妈的」命中
    words.sort(key=lambda x: -len(x["word"]))
    return words


# --------------------------------------------------------------------------- #
# 歌词解析
# --------------------------------------------------------------------------- #

TS_RE = re.compile(r"\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]")
META_RE = re.compile(r"^\[(ar|ti|al|by|offset|re|ve|length)\s*:", re.I)


def parse_lyrics(path):
    """返回 [{no, t, ts, text}]；t 为秒（无时间戳时按每行 4 秒顺排）。"""
    if not os.path.exists(path):
        sys.exit(f"[错误] 歌词文件不存在：{path}")
    with open(path, encoding="utf-8", errors="replace") as f:
        raw_lines = f.read().splitlines()

    entries, offset = [], 0.0
    has_ts = False
    for raw in raw_lines:
        line = raw.strip()
        if not line:
            continue
        if META_RE.match(line):
            m = re.match(r"^\[offset\s*:\s*([+-]?\d+)\]", line, re.I)
            if m:
                offset = int(m.group(1)) / 1000.0
            continue
        stamps = TS_RE.findall(line)
        text = TS_RE.sub("", line).strip()
        if stamps:
            has_ts = True
            for mm, ss, frac in stamps:
                sec = int(mm) * 60 + int(ss)
                if frac:
                    sec += int(frac) / (10 ** len(frac))
                entries.append({"t": max(0.0, sec - offset), "text": text})
        else:
            entries.append({"t": None, "text": text})

    if not has_ts:
        for i, e in enumerate(entries):
            e["t"] = i * 4.0

    entries.sort(key=lambda e: e["t"])
    # 去重（同一时间戳的重复行只留一条）
    out, seen_t = [], set()
    for e in entries:
        k = (round(e["t"], 2), e["text"])
        if k in seen_t:
            continue
        seen_t.add(k)
        out.append(e)
    for i, e in enumerate(out):
        e["no"] = i + 1
        e["ts"] = fmt_ts(e["t"])
    return out, has_ts


def fmt_ts(t):
    if t is None:
        return "--:--.--"
    m, s = divmod(max(0.0, t), 60)
    return f"{int(m):02d}:{s:05.2f}"


# --------------------------------------------------------------------------- #
# 扫描
# --------------------------------------------------------------------------- #

def scan(entries, words, level_mode):
    """返回 (hits, overlaps)。hits: [{no, t, ts, text, word, level, sug, span}]"""
    allow = HARD_LEVELS if level_mode == "hard" else set(LEVELS)
    hits = []
    for e in entries:
        text = e["text"]
        if not text:
            continue
        low = text.lower()
        found, taken = [], [False] * len(text)
        for w in words:
            if w["level"] not in allow:
                continue
            needle = w["word"]
            hay = low if needle.isascii() else text
            nd = needle.lower() if needle.isascii() else needle
            start = 0
            while True:
                i = hay.find(nd, start)
                if i < 0:
                    break
                if any(taken[i:i + len(needle)]):
                    start = i + 1
                    continue
                for k in range(i, i + len(needle)):
                    taken[k] = True
                found.append({
                    "no": e["no"], "t": e["t"], "ts": e["ts"], "text": text,
                    "word": text[i:i + len(needle)], "level": w["level"],
                    "sug": w["sug"], "span": (i, i + len(needle)),
                })
                start = i + len(needle)
        found.sort(key=lambda h: h["span"][0])
        hits.extend(found)
    return hits


def decide_plan(hit):
    """方案优先级：谐音 > 星号 > 删除线；暴力/低俗无谐音时退到留白。"""
    sug = hit["sug"]
    usable = sug not in NO_HOMOPHONE
    lv = hit["level"]
    if usable:
        return "homophone", "谐音", f"首选：保留节奏与情绪 → {sug}"
    if sug == "…":
        return "strike", "删除线", "省略式处理（原文用「…」带过）"
    if lv in ("violence", "vulgar"):
        return "blank", "留白", "无谐音可用；星号仍能读出原意，建议留白"
    if lv == "platform":
        return "blank", "留白", "运营向表述，直接删掉不影响听感"
    return "star", "星号", "无谐音可用，星号等宽占位最省事"


# --------------------------------------------------------------------------- #
# 输出：命中表
# --------------------------------------------------------------------------- #

def print_hits(entries, hits):
    if not hits:
        print("  ✓ 没有命中任何词。\n")
        return
    cols = [("行", 4), ("时间", 9), ("命中", 10), ("等级", 11), ("方案", 8),
            ("谐音", 10), ("说明", 30)]
    head = "  " + " ".join(pad(c, w) for c, w in cols)
    print(head)
    print("  " + rule(dw(head) - 2))
    for h in hits:
        style, cn, why = decide_plan(h)
        sug = h["sug"] if h["sug"] not in NO_HOMOPHONE else "—"
        row = [str(h["no"]), h["ts"], h["word"], LEVEL_CN[h["level"]], cn, sug, why]
        print("  " + " ".join(pad(v, w) for v, (_, w) in zip(row, cols)))

    # 每行原文 + 可直接粘贴的 mask 配置
    by_no = {}
    for h in hits:
        by_no.setdefault(h["no"], []).append(h)
    for no in sorted(by_no):
        hs = by_no[no]
        e = next(x for x in entries if x["no"] == no)
        print()
        print(f"  ── 第 {no} 行  {e['ts']}  {rule(46)}")
        print(f"     {e['text']}")
        for h in hs:
            style, cn, why = decide_plan(h)
            cfg = mask_js(h, style)
            print(f"     建议{cn}：{cfg}")
            if h["level"] in ("ad", "medical"):
                print(f"       ↑ 需人工确认语境（「{h['word']}」也可能只是普通叙述）")


def mask_js(h, style):
    """生成一行 JS 配置，供复制进 LY。"""
    if style == "homophone":
        return "{ from: '%s', to: '%s', style: 'homophone' }" % (h["word"], h["sug"])
    return "{ from: '%s', style: '%s' }" % (h["word"], style)


# --------------------------------------------------------------------------- #
# 输出：统计 + 复核清单
# --------------------------------------------------------------------------- #

def print_stats(entries, hits):
    total_line = len(entries)
    hit_lines = len({h["no"] for h in hits})
    print()
    print("  " + rule(60, "═"))
    print(f"  统计：共 {total_line} 行歌词 / 命中 {hit_lines} 行 / {len(hits)} 处")
    if not hits:
        print("  " + rule(60, "═"))
        return
    by_lv = {}
    for h in hits:
        by_lv[h["level"]] = by_lv.get(h["level"], 0) + 1
    for lv in LEVELS:
        n = by_lv.get(lv, 0)
        if n:
            print(f"    {pad(LEVEL_CN[lv], 12)}{pad(n, 4)}{bar(n, len(hits))}")
    by_w = {}
    for h in hits:
        by_w[h["word"]] = by_w.get(h["word"], 0) + 1
    top = sorted(by_w.items(), key=lambda kv: -kv[1])[:6]
    print("    高频词：" + "  ".join(f"{w}×{n}" for w, n in top))
    risk = "高（建议改完再发）" if any(h["level"] in ("dirty", "violence") for h in hits) \
        else "中（可能被限流）" if hits else "低"
    print(f"    整体风险：{risk}")
    print("  " + rule(60, "═"))


def print_checklist(entries, hits):
    no_sug = sorted({h["word"] for h in hits if h["sug"] in NO_HOMOPHONE})
    print()
    print("  人工复核清单（机器只给方案，判断得靠人）")
    items = [
        "谐音后，音频里原词还在——听感上是否仍能对上口型/节奏？对不上就整句重录或消音。",
        "谐音是否改变了原意或破坏押韵？改词后字数变了，字幕时间轴要重新对一遍。",
        "谐音替换词本身是否也是敏感词？（如「草泥马」本身就在词表里）",
        "人名、地名、品牌名是否被误伤？命中词出现在专有名词里时应放过。",
        "广告法/医疗类命中要确认语境：歌词里的「第一」多半不是广告，不必改。",
        "同一句里多处命中，是否合并成一次处理（否则字幕被切得稀碎）？",
        "涉政、涉民族宗教、涉未成年人的内容不在词表内，请对照平台当日《社区规范》人工过一遍。",
        "发布前把成片音量开到最大听一遍：改了字幕没改音频，等于白改。",
    ]
    if no_sug:
        items.append("以下词没有谐音建议，需自己造词或改用星号/留白：" + "、".join(no_sug))
    for i, it in enumerate(items, 1):
        print(f"    {i}. {it}")


# --------------------------------------------------------------------------- #
# 输出：LY 片段
# --------------------------------------------------------------------------- #

def js_str(s):
    if "'" in s and '"' not in s:
        return '"%s"' % s.replace("\\", "\\\\")
    return "'%s'" % s.replace("\\", "\\\\").replace("'", "\\'")


def emit_ly(entries, hits, src, level_mode, has_ts):
    by_no = {}
    for h in hits:
        by_no.setdefault(h["no"], []).append(h)

    print()
    print("  " + rule(60, "═"))
    print("  可粘贴的 LY 片段（复制下面整段到 src/caption.js 顶部）")
    print("  " + rule(60, "═"))
    print()
    print(f"// 由 mask_words.py 生成 · 源文件 {os.path.basename(src)} · 级别 {level_mode}")
    print(f"// 时间轴：{'LRC 时间戳' if has_ts else '无时间戳，按每行 4 秒顺排（务必手工校准）'}")
    print(f"// 命中 {len({h['no'] for h in hits})} 行 / {len(hits)} 处")
    print("const LY = [")
    for i, e in enumerate(entries):
        t0 = e["t"]
        if i + 1 < len(entries):
            t1 = max(t0 + 0.8, entries[i + 1]["t"] - 0.06)
        else:
            t1 = t0 + 3.2
        opts = []
        masks = []
        for h in by_no.get(e["no"], []):
            style, _, _ = decide_plan(h)
            masks.append(mask_js(h, style))
        if masks:
            opts.append("mask: [%s]" % ", ".join(masks))
        opt_s = "{ %s }" % ", ".join(opts) if opts else "{}"
        print("  [%.2f, %.2f, %s, %s]," % (t0, t1, js_str(e["text"]), opt_s))
    print("];")


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #

def main():
    ap = argparse.ArgumentParser(
        description="歌词违禁词扫描 + 打码方案生成器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("lyrics", help="歌词文件 .lrc 或 .txt")
    ap.add_argument("--words", default=None, help="词表路径，默认 assets/banned_words_zh.txt")
    ap.add_argument("--level", default="soft", choices=["hard", "soft"],
                    help="hard=只看脏话/低俗/暴力；soft=全部（默认）")
    ap.add_argument("--json", default=None, help="把结果写成 JSON")
    ap.add_argument("--emit-ly", action="store_true", help="打印可粘贴的 const LY 片段")
    a = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    wpath = a.words or os.path.join(root, "assets", "banned_words_zh.txt")

    words = load_words(wpath)
    entries, has_ts = parse_lyrics(a.lyrics)
    hits = scan(entries, words, a.level)

    print()
    print("  ═══ 歌词违禁词扫描 ═══")
    print(f"  输入：{a.lyrics}   （{len(entries)} 行，{'LRC 时间戳' if has_ts else '纯文本，按每行 4 秒顺排'}）")
    print(f"  词表：{os.path.basename(wpath)}（{len(words)} 条）   级别：{a.level}"
          f"（{'仅脏话/低俗/暴力' if a.level == 'hard' else '全部 7 类'}）")
    print()
    print_hits(entries, hits)
    print_stats(entries, hits)
    print_checklist(entries, hits)
    if a.emit_ly:
        emit_ly(entries, hits, a.lyrics, a.level, has_ts)

    if a.json:
        data = {
            "source": os.path.abspath(a.lyrics),
            "wordlist": os.path.abspath(wpath),
            "level": a.level,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "has_timestamps": has_ts,
            "lines": [
                {
                    "no": e["no"], "t": round(e["t"], 3), "ts": e["ts"], "text": e["text"],
                    "hits": [
                        dict(word=h["word"], level=h["level"], suggest=h["sug"],
                             plan=decide_plan(h)[0], span=list(h["span"]))
                        for h in hits if h["no"] == e["no"]
                    ],
                }
                for e in entries
            ],
            "stats": {
                "lines": len(entries),
                "hit_lines": len({h["no"] for h in hits}),
                "hit_count": len(hits),
                "by_level": {lv: sum(1 for h in hits if h["level"] == lv) for lv in LEVELS},
            },
        }
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\n  JSON 已写入：{a.json}")

    print()
    return 0 if not hits else 0


if __name__ == "__main__":
    sys.exit(main())
