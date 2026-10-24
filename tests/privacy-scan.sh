#!/bin/bash
# 发布前隐私扫描：确认包里没有我们自己的路径/记忆内容/内部数据
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0
扫() { # 文件 模式 说明
  local hits
  hits=$(grep -rn --binary-files=without-match --exclude-dir=.git --exclude-dir=node_modules -E "$2" "$1" 2>/dev/null | grep -v "privacy-scan.sh" | head -5)
  if [ -n "$hits" ]; then echo "  ❌ $3"; echo "$hits" | sed 's/^/       /'; FAIL=1; else echo "  ✅ $3"; fi
}
echo "  深鲸记忆 · 发布前隐私扫描"
扫 . '/Users/mac|/Users/[a-z][a-z0-9_-]+/|/home/[a-z]' '无本机绝对路径（/Users/…）'
扫 . '官网部署铁律|GitHub API 的两个静默坑|内容分发平台的账号门槛|脱敏 v2|CSDN 稿件交付' '无内部记忆文案'
扫 . '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' '无邮箱/账号'
扫 . 'AKIA[0-9A-Z]{16}|sk_live_[0-9A-Za-z]{20,}|ghp_[0-9A-Za-z]{30,}' '无密钥样式'
# 检查 git 历史里是否还有截图/文档目录
if [ -d .git ] && git log --all --oneline -- docs 2>/dev/null | grep -q .; then
  echo "  ❌ git 历史里仍有 docs/（截图）"; FAIL=1
else
  echo "  ✅ git 历史无 docs/ 截图"
fi
exit $FAIL
