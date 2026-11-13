"""依据输出画幅生成可直接渲染的工程；已有工程保留自己的装配文件。"""
import argparse
import json
import math
import shutil
from pathlib import Path


def main():
    """校验尺寸与时钟，把模板参数写入工程。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("--style", choices=["pixel", "collage", "crayon"], default="pixel")
    parser.add_argument("--w", type=int, default=1920)
    parser.add_argument("--h", type=int, default=1080)
    parser.add_argument("--world", help="像素世界宽x高，例如 640x360、320x180")
    parser.add_argument("--analysis", type=Path, help="导入 analyze 的 JSON，沿用片长、BPM 与实测节奏")
    parser.add_argument("--bpm", type=float)
    parser.add_argument("--dur", type=float)
    parser.add_argument("--title", help="片名，默认取工程目录名")
    parser.add_argument("--no-intro", action="store_true", help="关闭片名叠层")
    a = parser.parse_args()
    analysis = {}
    if a.analysis:
        try:
            analysis = json.loads(a.analysis.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            parser.error(f"读不到歌曲分析：{error}")
        if not isinstance(analysis, dict) or "duration" not in analysis:
            parser.error("歌曲分析应包含 duration 字段")
    a.dur = a.dur if a.dur is not None else analysis.get("duration", 6)
    a.bpm = a.bpm if a.bpm is not None else analysis.get("bpm") or 120
    if min(a.w, a.h) <= 0 or a.w % 2 or a.h % 2:
        parser.error("输出宽高须为正偶数，以便编码 yuv420p")
    if not all(isinstance(n, (float, int)) and math.isfinite(n) and n > 0 for n in [a.dur, a.bpm]) or a.dur < 1 / 30:
        parser.error("BPM 须为正数，片长至少一帧")
    if a.world and a.style != "pixel":
        parser.error("--world 仅用于像素画风")
    w, h = a.w, a.h
    if a.style == "pixel":
        if a.world:
            try:
                w, h = map(int, a.world.lower().replace("×", "x").split("x"))
            except ValueError:
                parser.error("--world 格式为 宽x高")
            if min(w, h) <= 0 or a.w % w or a.h % h or a.w // w != a.h // h:
                parser.error("像素世界必须能以同一整数倍率放大到输出宽高")
        else:
            # 选择让长边最接近 640 格的整比画布，竖屏自动交换长短边。
            divisors = (v for v in range(1, math.gcd(w, h) + 1) if w % v == h % v == 0)
            scale = min(divisors, key=lambda v: abs(max(w, h) / v - 640))
            w, h = w // scale, h // scale

    # 同一份拍表供首镜切点、循环动作和逐帧瞬态读取。
    drums = analysis.get("drums", {})
    if not isinstance(drums, dict):
        parser.error("drums 应为按轨名组织的时间数组")
    tracks = {**drums, "beats": analysis.get("beats", []), "downbeats": analysis.get("downbeats", [])}
    for track, times in tracks.items():
        if not isinstance(times, list) or not all(isinstance(t, (float, int)) and math.isfinite(t)
                                                  and t >= 0 for t in times) or times != sorted(times):
            parser.error(f"节奏轨 {track} 需要升序、非负、有限的秒数")
        tracks[track] = [t for t in times if t < a.dur]
    proj = a.project
    if (proj / "index.html").exists() or (proj / "shots").exists():
        parser.error("此处已有工程，请选新的工程目录")
    shared = Path(__file__).resolve().parents[1] / "templates" / "_shared"
    (proj / "shots").mkdir(parents=True, exist_ok=True)
    (proj / "out").mkdir(exist_ok=True)
    for name in ["assemble.js", "stills.html", "motion.js"]:
        shutil.copyfile(shared / name, proj / name)
    style_dir = shared.parent / a.style
    rehearsal = style_dir / "rehearsal"
    has_rehearsal = rehearsal.is_dir()
    shutil.copyfile(style_dir / "engine.js", proj / "engine.js")
    shutil.copyfile((rehearsal if has_rehearsal else style_dir) / "character.js", proj / "character.js")
    if has_rehearsal:
        shutil.copyfile(rehearsal / "scenes.js", proj / "scenes.js")
    for name, content in [("lyrics.js", "window.LYRICS = [];"), ("rhythm.js", "window.MV_RHYTHM = " + json.dumps(tracks) + ";")]:
        (proj / name).write_text(content + "\n", encoding="utf-8")

    # 片头在原曲内显示；把片名作为独立 JS 字符串，避免特殊字符破坏 HTML。
    beat = 60 / a.bpm
    intro_end = min(4 * beat, 4.0, a.dur)
    near_bar = [t for t in tracks["downbeats"] if intro_end * 0.65 <= t <= min(4, a.dur)]
    if near_bar:
        intro_end = min(near_bar, key=lambda t: abs(t - intro_end))
    intro_end = min(a.dur, max(1, round(intro_end * 30)) / 30)
    song_title = Path(str(analysis.get("file", ""))).stem
    direction = {"title": a.title if a.title is not None else song_title or proj.resolve().name,
                 "introEnd": 0 if a.no_intro else intro_end, "palette": {}}
    if has_rehearsal:
        direction.update(scene="stage", texture="clean", captions="plain",
                         ramps={"space": ["#364146", "#97A9A3", "#DADCD0"],
                                "figure": ["#1D292B", "#475957", "#D88959"],
                                "paper": ["#596C69", "#AEBBB0", "#FFF3CB"]}, looks={})
    (proj / "direction.js").write_text("// 片名、片头结束秒及像素色板，可按曲目调整。\nwindow.MV_DIRECTION = "
                                      + json.dumps(direction, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    dims = f"W: {w}, H: {h},"
    if a.style == "pixel":
        dims += f" OUT: {{ w: {a.w}, h: {a.h} }},"
    html = (shared / "index.html").read_text().replace("W: 1920, H: 1080,", dims)
    if has_rehearsal:
        html = html.replace('<script defer src="lyrics.js">', '<script defer src="scenes.js"></script>\n<script defer src="lyrics.js">')
    html = html.replace("BPM: 120,", f"BPM: {a.bpm},").replace("DURATION: 6.0,", f"DURATION: {a.dur},")
    off = tracks["downbeats"][:1] or tracks["beats"][:1] or [0]
    html = html.replace("OFF: 0.0,", f"OFF: {off[0]},")
    # 在小节边界从建立镜切入表演。极短片只保留建立镜。
    cut = intro_end
    spans = [(0, a.dur)] if a.dur - cut < 1 / 30 else [(0, cut), (cut, a.dur)]
    tags = []
    for i, (start, end) in enumerate(spans, 1):
        name = f"{i:02}.js"
        shot = ((rehearsal if has_rehearsal else shared / "shots") / name).read_text().replace("START_SEC", str(start)).replace("END_SEC", str(end))
        (proj / "shots" / name).write_text(shot, encoding="utf-8")
        tags.append(f'<script defer src="shots/{name}"></script>')
    html = html.replace('<script defer src="shots/01.js"></script>', "\n".join(tags))
    (proj / "index.html").write_text(html, encoding="utf-8")
    print(f"已建工程 {proj}，{a.style}，世界 {w}×{h}，输出 {a.w}×{a.h}，{a.dur:g} 秒")


if __name__ == "__main__":
    main()
