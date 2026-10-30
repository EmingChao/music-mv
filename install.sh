#!/usr/bin/env bash
# 把本仓库装成 agent 技能（实体安装，不建软链）。
#   ./install.sh                  → ~/.agents/skills/music-mv
#   ./install.sh /别的/目录        → 指定目标
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${1:-$HOME/.agents/skills/music-mv}"

[ "$SRC" = "$DEST" ] && { echo "✓ 已经是安装目录本身：$DEST"; exit 0; }

mkdir -p "$DEST"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude install.sh --exclude .git --exclude node_modules \
    --exclude __pycache__ --exclude .DS_Store --exclude out \
    "$SRC/" "$DEST/"
else
  echo "! 没有 rsync，退化为覆盖拷贝（不删除旧文件）"
  ( cd "$SRC" && find . -type f ! -path './.git/*' ! -path './node_modules/*' \
      ! -name install.sh ! -name .DS_Store -exec sh -c '
        for f do d="$0/${f#./}"; mkdir -p "$(dirname "$d")"; cp -p "$f" "$d"; done' "$DEST" {} + )
fi

# rsync --exclude 不会删除已存在的被排除项，上一个 python 版本的 pyc 会一直留着
rm -rf "$DEST/scripts/__pycache__"

chmod 755 "$DEST/mv.sh"
chmod 644 "$DEST/SKILL.md" "$DEST/NOTICE.md" "$DEST/README.md" 2>/dev/null || true

# 运行依赖：逐帧渲染要 puppeteer-core
if command -v node >/dev/null 2>&1 && [ ! -d "$DEST/node_modules/puppeteer-core" ]; then
  echo "→ 装 puppeteer-core…"
  ( cd "$DEST" && npm install --no-audit --no-fund ) || echo "! npm install 失败，手动在 $DEST 跑一次 npm install"
fi

echo "✓ 已安装 → $DEST"
[ -x "$DEST/mv.sh" ] && "$DEST/mv.sh" env 2>&1 | tail -6 || true
