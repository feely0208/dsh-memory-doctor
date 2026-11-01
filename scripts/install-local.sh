#!/bin/bash
# 本地安装：把仓库里的当前版本装到「随包载荷 + 用户插件目录」两处。
#
# 为什么两处都要：壳启动时会按 Resources/bundled-plugins/<dir> 同步到
# <userData>/dsh-home/plugins/<dir>（内容不同就覆盖）。只改后者，重启就丢；
# 只改前者，不重启也看不到。所以两处同进同出，并各留一份备份。
#
# 用法：bash scripts/install-local.sh
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="/Applications/DeepWhale Desktop.app/Contents/Resources"
PAYLOAD="$APP/bundled-plugins/dsh-memory-doctor"
PLUGINS="$HOME/Library/Application Support/DeepWhale Desktop/dsh-home/plugins/dsh-memory-doctor"
TS=$(date '+%Y%m%d-%H%M%S')
VER=$(node -e "console.log(require('$HERE/package.json').version)")

if [ ! -d "$PAYLOAD" ]; then echo "❌ 找不到随包载荷目录：$PAYLOAD"; exit 1; fi
if [ ! -d "$PLUGINS" ]; then echo "❌ 找不到用户插件目录：$PLUGINS"; exit 1; fi

echo "安装 dsh-memory-doctor $VER → 随包载荷 + 用户插件目录"
for DIR in "$PAYLOAD" "$PLUGINS"; do
  cp -a "$DIR" "$DIR.bak-$TS" 2>/dev/null || true
  cp -a "$HERE/lib" "$DIR/" && cp "$HERE/package.json" "$HERE/README.md" "$DIR/"
  rm -f "$DIR"/lib/*.bak-* 2>/dev/null || true
  echo "  ✅ $DIR（备份 .bak-$TS）"
done

echo
echo "校验："
node -e "console.log('  随包载荷  版本:', require('$PAYLOAD/package.json').version)"
node -e "console.log('  用户插件  版本:', require('$PLUGINS/package.json').version)"
grep -q 工作项 "$PAYLOAD/lib/client.js" && echo "  载荷 client.js：含「工作项」页签" || echo "  ⚠️ 载荷 client.js 未含工作项"
grep -q 工作项 "$PLUGINS/lib/client.js" && echo "  插件 client.js：含「工作项」页签" || echo "  ⚠️ 插件 client.js 未含工作项"
echo
echo "下一步：应用内按 ⌘R「重新加载界面」（或重启应用），侧栏「深鲸记忆」应出现「工作项」页签。"
