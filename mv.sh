#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  mv.sh —— 一条命令一个动作。你只需要记这 13 个动词，不要自己拼 node/ffmpeg 命令。
#
#   ./mv.sh env                       环境自检（python/ffmpeg/chrome/puppeteer 缺什么）
#   ./mv.sh init  <工程目录> --style=pixel|collage|crayon [--w=1920 --h=1080 --bpm=120 --dur=6]
#   ./mv.sh ncm   <歌.ncm|目录>        网易云 .ncm → mp3（无损还原，可直接喂给 analyze）
#   ./mv.sh analyze <歌.mp3>          测 BPM / 拍位 / 情绪段落 → 工程目录下的 song-analysis.json
#   ./mv.sh lyric <歌.lrc|字幕.srt>    歌词 → lyrics.js（+ 歌词网格 md）
#   ./mv.sh check <工程目录>           静态自检（镜头接线/首尾相接/黑名单/歌词时间轴）退出码 0/1
#   ./mv.sh stills <工程目录> 0.4,1.6  出几张关键帧图 + 拼一张接触表（每镜审图用这个）
#   ./mv.sh sheet <工程目录>           角色设定图（三视图/表情/动作），存 character-sheet.png
#   ./mv.sh sweep <工程目录> 2.0 3.0   区间内每一帧拼一条（看运动、找穿帮）
#   ./mv.sh speed <工程目录>           渲 1 秒测速，报"秒/帧"，超过 0.15 就要优化
#   ./mv.sh render <工程目录>          渲整片（断点续渲：中断了重跑会接着渲）
#   ./mv.sh encode <工程目录>          帧 → 无声 mp4
#   ./mv.sh deliver <工程目录> <歌.mp3> 封原曲 + 抖音参数转码 + ffprobe 自检，最后一行 PASS/FAIL
#
# 出图/出片都在 <工程目录>/out/ 下。渲染 >1 分钟，用 run_in_background 跑 render。
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail
SRC="${BASH_SOURCE[0]}"; case "$SRC" in /*) ;; *) SRC="$PWD/$SRC";; esac
SKILL="$(cd "$(dirname "$SRC")" && pwd)"   # mv.sh 就在 skill 根目录
S="$SKILL/scripts"
# 本机私有配置（不进仓库）：可在这里设 MV_PYTHON / MV_WORKERS
[ -f "$SKILL/mv.local.sh" ] && . "$SKILL/mv.local.sh"
say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }

# 找得到 librosa 的 python（顺序：$MV_PYTHON → python3 → 技能目录下的 .venv）
pick_py() {
  local mod="${1:-}" c
  for c in "${MV_PYTHON:-}" "$(command -v python3 || true)" \
           "$SKILL/.venv/bin/python" "$SKILL/.venv3/bin/python"; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    if [ -z "$mod" ] || "$c" -c "import $mod" >/dev/null 2>&1; then echo "$c"; return 0; fi
  done
  return 1
}

# 从 index.html 里读 CFG 的一个数（键名固定，见 templates/_shared/index.html）
cfg() {   # 从 index.html 读 CFG 里的一个数（macOS 的 grep 不支持 \b，所以用 awk）
  local proj="$1" k="$2" d="${3:-0}" v=""
  if [ -f "$proj/index.html" ]; then
    v=$(awk -v k="$k" 'match($0, k"[ \t]*:[ \t]*[0-9]+([.][0-9]+)?") { s=substr($0,RSTART,RLENGTH); sub(/^[^:]*:[ \t]*/,"",s); print s; exit }' "$proj/index.html")
  fi
  echo "${v:-$d}"
}
out_w() { local p="$1"; local w; w=$(grep -oE "OUT:[[:space:]]*\{[[:space:]]*w:[[:space:]]*[0-9]+" "$p/index.html" | grep -oE '[0-9]+$'); echo "${w:-$(cfg "$p" W 1920)}"; }
out_h() { local p="$1"; local h; h=$(grep -oE "OUT:[[:space:]]*\{[^}]*h:[[:space:]]*[0-9]+" "$p/index.html" | grep -oE '[0-9]+$'); echo "${h:-$(cfg "$p" H 1080)}"; }
need_proj() { [ -n "${1:-}" ] || die "要给工程目录，例如 work/my-mv"; [ -f "$1/index.html" ] || die "$1 里没有 index.html（用 ./mv.sh init 建）"; }

cmd="${1:-help}"; shift || true

case "$cmd" in
# ───────────────────────────────────────────────────────────────────────
env)
  say "── 环境自检 ──"
  local_ok=0
  printf 'node      '; node -v || { echo 缺; local_ok=1; }
  printf 'ffmpeg    '; ffmpeg -version 2>/dev/null | head -1 || { echo "缺（brew install ffmpeg）"; local_ok=1; }
  printf 'chrome    '; ls -d "/Applications/Google Chrome.app" 2>/dev/null || echo "没找到 Chrome（puppeteer 要用）"
  printf 'puppeteer '; (cd "$SKILL" && node -e "console.log('ok  '+require.resolve('puppeteer-core'))" 2>/dev/null) \
      || echo "缺 → 在有 node_modules 的目录里跑，或 cd $SKILL && npm i puppeteer-core"
  printf 'librosa   '; p=$(pick_py librosa) && echo "$p" || echo "没有 → 设 MV_PYTHON 指向有 librosa 的 python，或退到 beat_grid.py（只需 numpy）"
  printf 'numpy     '; p=$(pick_py numpy) && echo "$p" || echo "没有 → 只能手填 BPM"
  printf 'Pillow    '; p=$(pick_py PIL) && echo "$p" || echo "没有 → 接触表/拼图出不来（read_image 看图不受影响）"
  [ $local_ok = 0 ] && echo "ENV PASS" || { echo "ENV FAIL"; exit 1; }
  ;;

# ───────────────────────────────────────────────────────────────────────
init)
  proj="${1:?用法: ./mv.sh init <工程目录> --style=pixel}"; shift || true
  style="pixel"; w=1920; h=1080; bpm=120; dur=6
  for a in "$@"; do case "$a" in
    --style=*) style="${a#*=}";; --w=*) w="${a#*=}";; --h=*) h="${a#*=}";;
    --bpm=*) bpm="${a#*=}";; --dur=*) dur="${a#*=}";;
  esac; done
  [ -d "$SKILL/templates/$style" ] || die "没有这个画风：$style（可选 pixel / collage / crayon）"
  mkdir -p "$proj/shots" "$proj/out"
  cp "$SKILL/templates/_shared/index.html" "$proj/index.html"
  cp "$SKILL/templates/_shared/assemble.js" "$proj/assemble.js"
  cp "$SKILL/templates/_shared/stills.html" "$proj/stills.html"
  cp "$SKILL/templates/$style/engine.js" "$proj/engine.js"
  cp "$SKILL/templates/$style/character.js" "$proj/character.js"
  cat > "$proj/lyrics.js" <<EOF
// 歌词时间轴（scripts/srt2js.py 生成；没歌词就留这样，装配页会自动跳过）
window.LYRICS = [];
EOF
  # 像素风的画布是"像素世界"：W/H 用 320×180，OUT 才是输出分辨率
  if [ "$style" = "pixel" ]; then
    pw=320; ph=180
    if [ "$h" -gt "$w" ]; then pw=180; ph=320; fi
    sed -i '' -e "s/W: 1920, H: 1080,/W: $pw, H: $ph, OUT: { w: $w, h: $h },/" "$proj/index.html"
  else
    sed -i '' -e "s/W: 1920, H: 1080,/W: $w, H: $h,/" "$proj/index.html"
  fi
  sed -i '' -e "s/BPM: 120, OFF: 0.0,/BPM: $bpm, OFF: 0.0,/" -e "s/DURATION: 6.0,/DURATION: $dur,/" "$proj/index.html"
  cat > "$proj/shots/01.js" <<'EOF'
// 镜头 1：照着 references/storyboard.md 的 9 列表把它填满，再照着 references/shots.md 写 draw。
window.SHOTS.push({
  id: 1,
  start: 0.0, end: 4.0,                     // 和下一个镜头首尾相接；最后一个 = CFG.DURATION
  cam: { from: { x: API_W / 2, y: API_H / 2, zoom: 1.0 }, to: { x: API_W / 2, y: API_H / 2, zoom: 1.05 } },
  enter: { type: 'cut' },
  note: '这句歌词在说什么：…… 画面演什么：……',
  draw(g, u, t, API, cam) {
    const E = API.ENGINE;
    // 先铺天空和地面（不传 colors/kind 就是各引擎的安全默认值），再站上角色。
    // 想要别的天空/地面：看 templates/<风格>/STYLE.md 里的 kind 表，别自己猜参数名。
    E.sky(g, {});
    E.ground(g, { y: API.H * 0.86 });
    E.char(g, { x: API.W * 0.5, y: API.H * 0.86, size: API.MH, facing: 'right', expression: 'neutral', action: 'stand', u, t });
  },
});
EOF
  sed -i '' -e "s/API_W/$(cfg "$proj" W 1920)/g" -e "s/API_H/$(cfg "$proj" H 1080)/g" \
             -e "s/start: 0.0, end: 4.0,/start: 0.0, end: $dur,/" "$proj/shots/01.js"
  say "建好了：$proj"
  echo "  画风 $style · $(cfg "$proj" W) × $(cfg "$proj" H)$( [ -n "$(grep -c OUT: "$proj/index.html")" ] && echo " → $(out_w "$proj")×$(out_h "$proj")" ) · ${dur}s · ${bpm}BPM"
  echo "  下一步：① 填 shots/01.js 的 note 和 draw ② ./mv.sh check $proj ③ ./mv.sh stills $proj 1.0,3.5"
  ;;

# ───────────────────────────────────────────────────────────────────────
ncm)
  # 网易云 .ncm 是加密壳，librosa / 剪辑软件都读不了。先撬开再进流程。
  [ $# -ge 1 ] || die "要给 .ncm 文件或目录：./mv.sh ncm 歌.ncm"
  ncm_sh="$SKILL/../ncm2mp3/ncm.sh"
  [ -x "$ncm_sh" ] || ncm_sh="$HOME/.agents/skills/ncm2mp3/ncm.sh"
  [ -x "$ncm_sh" ] || die "找不到 ncm2mp3 技能（应在 $SKILL/../ncm2mp3/ncm.sh）"
  say "── .ncm → 音频（原样还原，不重新编码）──"
  "$ncm_sh" "$@"
  ;;

# ───────────────────────────────────────────────────────────────────────
analyze)
  song="${1:?用法: ./mv.sh analyze <歌.mp3>}"; shift || true
  [ -f "$song" ] || die "找不到 $song"
  case "$song" in
    *.ncm|*.NCM) die "这是网易云加密壳，先转：./mv.sh ncm \"$song\"" ;;
  esac
  if p=$(pick_py librosa); then
    "$p" "$S/analyze_song.py" "$song" "$@"
  else
    warn "没有 librosa，退到 beat_grid.py（只给 BPM 和拍位，没有情绪段）"
    pick_py numpy >/dev/null || die "numpy 也没有。直接问用户 BPM，写进 index.html 的 BPM:"
    "$(pick_py numpy)" "$S/beat_grid.py" "$song" "$@"
  fi
  ;;

# ───────────────────────────────────────────────────────────────────────
lyric)
  src="${1:?用法: ./mv.sh lyric <歌.lrc|字幕.srt> [--offset=-0.3] [-o 输出] [--out 网格.md]}"; shift || true
  [ -f "$src" ] || die "找不到 $src"
  case "$src" in
    *.srt) out=""; for a in "$@"; do case "$a" in -o|--out) ;; esac; done
           has_o=0; for a in "$@"; do [ "$a" = "-o" ] && has_o=1; done
           if [ $has_o = 1 ]; then "$(pick_py)" "$S/srt2js.py" "$src" "$@"; else "$(pick_py)" "$S/srt2js.py" "$src" -o "${src%.*}.lyrics.js" "$@"; say "歌词 → ${src%.*}.lyrics.js（拷进工程目录时改名 lyrics.js）"; fi ;;
    *)     "$(pick_py)" "$S/lyric_grid.py" "$src" "$@" ;;
  esac
  ;;

# ───────────────────────────────────────────────────────────────────────
check)
  need_proj "${1:-}"; proj="$1"; shift || true
  for f in "$proj"/engine.js "$proj"/character.js "$proj"/assemble.js "$proj"/shots/*.js "$proj"/lyrics.js; do
    [ -f "$f" ] || continue
    node --check "$f" || die "语法错：$f（照上面报的行号改）"
  done
  node "$S/check_shots.mjs" "$proj"
  ;;

# ───────────────────────────────────────────────────────────────────────
stills|sheet|sweep)
  need_proj "${1:-}"; proj="$1"; shift || true
  W=$(out_w "$proj"); H=$(out_h "$proj")
  mkdir -p "$proj/out/stills"
  if [ "$cmd" = "sheet" ]; then
    [ -f "$proj/stills.html" ] || die "$proj 里没有 stills.html（从 templates/_shared/stills.html 拷一份）"
    node "$S/render_frames.mjs" --page "$proj/stills.html" --times 0 --out "$proj/out" --name character-sheet --width "$W" --height "$H" \
      || die "出图失败"
    say "设定图：$proj/out/character-sheet.png"
  elif [ "$cmd" = "sweep" ]; then
    t0="${1:?用法: ./mv.sh sweep <工程> 2.0 3.0}"; t1="${2:?要到几秒}"
    times=$(node -e "const a=+process.argv[1],b=+process.argv[2],o=[];for(let t=a;t<=b+1e-9;t+=1/15)o.push(t.toFixed(3));console.log(o.join(','))" "$t0" "$t1")
    node "$S/render_frames.mjs" --page "$proj/index.html" --times "$times" --out "$proj/out/sweep" --width "$W" --height "$H" --format jpg || die "出图失败"
    "$(pick_py PIL)" "$S/contact_sheet.py" --images "$proj/out/sweep" -o "$proj/out/sweep.jpg" 2>/dev/null || true
    say "区间图：$proj/out/sweep/（拼图 $proj/out/sweep.jpg）"
  else
    times="${1:-}"; [ -n "$times" ] || die "用法: ./mv.sh stills <工程> 0.4,1.6,2.9（逗号分隔的秒数）"
    node "$S/render_frames.mjs" --page "$proj/index.html" --times "$times" --out "$proj/out/stills" --width "$W" --height "$H" --format jpg || die "出图失败"
    "$(pick_py PIL)" "$S/contact_sheet.py" --images "$proj/out/stills" -o "$proj/out/stills.jpg" 2>/dev/null || true
    say "关键帧：$proj/out/stills/（拼图 $proj/out/stills.jpg）"
  fi
  ;;

# ───────────────────────────────────────────────────────────────────────
speed)
  need_proj "${1:-}"; proj="$1"; shift || true
  W=$(out_w "$proj"); H=$(out_h "$proj")
  rm -rf "$proj/out/speed"
  say "渲 1 秒（$(cfg "$proj" FPS 30) 帧）测速度…"
  node "$S/render_frames.mjs" --page "$proj/index.html" --duration 1 --fps "$(cfg "$proj" FPS 30)" \
    --out "$proj/out/speed" --width "$W" --height "$H" --workers 2 --force 2>&1 | tail -3
  ;;

# ───────────────────────────────────────────────────────────────────────
render)
  need_proj "${1:-}"; proj="$1"; shift || true
  W=$(out_w "$proj"); H=$(out_h "$proj"); FPS=$(cfg "$proj" FPS 30); DUR=$(cfg "$proj" DURATION 0)
  [ "$(echo "$DUR > 0" | bc -l 2>/dev/null)" = "1" ] || die "index.html 里 DURATION 不对：$DUR"
  node "$S/check_shots.mjs" "$proj" || die "静态自检没过，先跑 ./mv.sh check 修完再渲"
  say "渲整片：${DUR}s × ${FPS}fps = $(node -e "console.log(Math.round($DUR*$FPS))") 帧，$W×$H"
  node "$S/render_frames.mjs" --page "$proj/index.html" --fps "$FPS" --duration "$DUR" \
    --out "$proj/out/frames" --width "$W" --height "$H" --workers "${MV_WORKERS:-2}" "$@" || die "渲帧失败"
  say "帧好了：$proj/out/frames/（接着 ./mv.sh encode $proj）"
  ;;

# ───────────────────────────────────────────────────────────────────────
encode)
  need_proj "${1:-}"; proj="$1"; shift || true
  FPS=$(cfg "$proj" FPS 30); DUR=$(cfg "$proj" DURATION 6)
  node "$S/render_frames.mjs" --page "$proj/index.html" --fps "$FPS" --duration "$DUR" \
    --out "$proj/out/frames" --encode "$proj/out/raw.mp4" || die "编码失败"
  say "无声成片：$proj/out/raw.mp4"
  ;;

# ───────────────────────────────────────────────────────────────────────
deliver)
  need_proj "${1:-}"; proj="$1"; song="${2:?用法: ./mv.sh deliver <工程> <歌.mp3>}"
  W=$(out_w "$proj"); H=$(out_h "$proj"); shift 2 || true
  [ -f "$proj/out/raw.mp4" ] || die "先 ./mv.sh encode $proj"
  # 1) 把原曲封回去（渲染出的音轨会被编码器压 2–4dB，必须换回原曲并统一响度）
  "$(pick_py)" "$S/finalize_audio.py" "$proj/out/raw.mp4" "$song" -o "$proj/out/deliver.mp4" --target-lufs -14 "$@" \
    || die "封音失败"
  # 2) 抖音交付参数（bt709 三件套 + 高码率，不用 crf：暗场会被压得很低）
  tmp="$proj/out/_d.mp4"
  ffmpeg -v error -y -i "$proj/out/deliver.mp4" -c:v libx264 -preset slow -b:v 8M -maxrate 12M -bufsize 16M \
    -pix_fmt yuv420p -color_range tv -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
    -c:a copy -movflags +faststart "$tmp" || die "转码失败"
  mv "$tmp" "$proj/out/deliver.mp4"
  # 3) 自检：分辨率/帧率/编码/音轨/响度/黑场
  echo "──── 交付自检 ────"
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,codec_name,pix_fmt,bit_rate \
    -of default=nw=1 "$proj/out/deliver.mp4"
  ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels -of default=nw=1 "$proj/out/deliver.mp4"
  ffmpeg -hide_banner -nostats -i "$proj/out/deliver.mp4" -af loudnorm=print_format=summary -f null - 2>&1 | grep -E "Input Integrated|Input True Peak" || true
  ffmpeg -hide_banner -nostats -i "$proj/out/deliver.mp4" -vf blackdetect=d=0.1:pix_th=0.08 -an -f null - 2>&1 | grep -c black_start | xargs -I{} sh -c 'echo "黑场段数：{}（前 3 秒不能有）"'
  # 4) 硬判据
  fail=0
  vw=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=nw=1:nk=1 "$proj/out/deliver.mp4" | tr -dc 0-9)
  vh=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=nw=1:nk=1 "$proj/out/deliver.mp4" | tr -dc 0-9)
  [ "$vw" = "$W" ] || { warn "宽不是 $W（实际 $vw）"; fail=1; }
  [ "$vh" = "$H" ] || { warn "高不是 $H（实际 $vh）"; fail=1; }
  [ "$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "$proj/out/deliver.mp4")" = "audio" ] || { warn "没有音轨"; fail=1; }
  [ -s "$proj/out/deliver.mp4" ] || fail=1
  echo "成片：$proj/out/deliver.mp4"
  [ $fail = 0 ] && echo "DELIVER PASS" || { echo "DELIVER FAIL"; exit 1; }
  ;;

# ───────────────────────────────────────────────────────────────────────
*) awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "${BASH_SOURCE[0]}" ;;
esac
