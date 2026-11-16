#!/usr/bin/env python3
"""将带声成片压缩为适合发布的 H.264 MP4。"""
import argparse
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    """按目标大小计算视频码率，两遍编码后检查输出。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('-o', '--out', required=True, type=Path)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--target-mb', type=float, help='目标上限，十进制 MB，默认 50')
    mode.add_argument('--preset', choices=['1600k'], help='视频平均码率 1600 kbps，音轨直通')
    args = parser.parse_args()
    if args.target_mb is None and not args.preset:
        args.target_mb = 50
    if not args.source.is_file() or args.source.resolve() == args.out.resolve():
        parser.error('输入文件必须存在，输出不能与输入相同')
    if args.target_mb is not None and (not math.isfinite(args.target_mb) or args.target_mb <= 0):
        parser.error('输入文件必须存在、输出不能与输入相同，目标大小须为正数')
    info = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(args.source)
    ]))
    streams = info['streams']
    video = next((s for s in streams if s['codec_type'] == 'video'), None)
    audio = next((s for s in streams if s['codec_type'] == 'audio'), None)
    duration = float(info['format'].get('duration') or 0)
    if not video or not audio or duration <= 0:
        parser.error('成片需要视频、音频和可读取的时长')
    # 优先复制 AAC 音轨，其他音频转为 AAC 192k，并为封装开销留余量。
    audio_copy = bool(args.preset) or (audio.get('codec_name') == 'aac' and int(audio.get('bit_rate') or 0) > 0)
    audio_rate = 0 if args.preset else (int(audio.get('bit_rate') or 192000) if audio_copy else 192000)
    target_bytes = int(args.target_mb * 1_000_000) if args.target_mb is not None else None
    bitrate = 1_600_000 if args.preset else min(4_000_000, int(target_bytes * 8 * 0.97 / duration - audio_rate))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.mv-compress-', dir=args.out.parent) as tmp:
        result = Path(tmp) / 'result.mp4'
        if target_bytes is not None and args.source.stat().st_size <= target_bytes and video.get('codec_name') == 'h264' and audio.get('codec_name') == 'aac':
            shutil.copyfile(args.source, result)
        else:
            if bitrate < 100_000:
                parser.error('目标大小不足以容纳音轨与视频，请提高 --target-mb')
            common = ['ffmpeg', '-v', 'error', '-y', '-i', str(args.source), '-map', '0:v:0',
                      '-c:v', 'libx264', '-preset', 'slow', '-b:v', str(bitrate), '-pix_fmt', 'yuv420p',
                      '-passlogfile', str(Path(tmp) / 'pass')]
            subprocess.run(common + ['-pass', '1', '-an', '-f', 'null', os.devnull], check=True)
            audio_args = ['-c:a', 'copy'] if audio_copy else ['-c:a', 'aac', '-b:a', '192k']
            subprocess.run(common + ['-pass', '2', '-map', '0:a:0'] + audio_args +
                           ['-movflags', '+faststart', str(result)], check=True)
        if target_bytes is not None and result.stat().st_size > target_bytes:
            raise SystemExit('压缩结果超过目标大小，请调整目标或检查音轨码率')
        os.replace(result, args.out)
    mode_info = '视频目标平均码率 1600 kbps' if args.preset else f'目标 ≤ {args.target_mb:g} MB'
    print(f'发布版：{args.out}  {args.source.stat().st_size / 1e6:.2f} MB → {args.out.stat().st_size / 1e6:.2f} MB，{mode_info}')


if __name__ == '__main__':
    main()
