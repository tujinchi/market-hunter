#!/bin/bash
# ============================================================
# 市场猎手 · GitHub 一键初始化脚本
# 
# 用途：将本地项目推送到 GitHub，激活 GitHub Actions 自动管线
# 
# 使用：
#   1. 先在 GitHub.com 创建空仓库：markethunter
#   2. 在 GitHub Settings → Developer Settings → Tokens 创建 PAT
#   3. 运行: bash scripts/setup-github.sh
# ============================================================

set -e

echo "🦅 市场猎手 · GitHub 初始化"
echo "============================"
echo ""

# 检查参数
GITHUB_USER="${1:-}"
REPO_NAME="${2:-markethunter}"

if [ -z "$GITHUB_USER" ]; then
  echo "📋 用法: bash scripts/setup-github.sh <你的GitHub用户名> [仓库名]"
  echo "   例: bash scripts/setup-github.sh zhangsan markethunter"
  echo ""
  echo "⚠️  准备工作:"
  echo "   1. 在 github.com/new 创建空仓库: $REPO_NAME（不要勾选 README）"
  echo "   2. GitHub Settings → Developer settings → Personal access tokens → Generate new token"
  echo "   3. 权限勾选: repo (全部) + workflow"
  exit 1
fi

cd "$(dirname "$0")/.."

echo "📦 仓库: https://github.com/$GITHUB_USER/$REPO_NAME"
echo ""

# 初始化 Git（如果尚未初始化）
if [ ! -d ".git" ]; then
  echo "🔧 初始化 Git..."
  git init
  git checkout -b main 2>/dev/null || git checkout -b master 2>/dev/null || true
else
  echo "✅ Git 已初始化"
fi

# 创建 .gitignore
cat > .gitignore << 'GITIGNORE'
node_modules/
.env
*.log
.DS_Store
Thumbs.db
capacitor/android/
capacitor/ios/
GITIGNORE

# 添加远程仓库
REMOTE_URL="https://github.com/$GITHUB_USER/$REPO_NAME.git"
if git remote | grep -q origin; then
  git remote set-url origin "$REMOTE_URL"
  echo "🔗 远程仓库已更新: $REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
  echo "🔗 远程仓库已添加: $REMOTE_URL"
fi

# 添加所有文件
echo ""
echo "📤 添加文件..."
git add .

# 检查是否有变更
if git diff --cached --quiet; then
  echo "⚠️ 无文件变更"
else
  git commit -m "🚀 市场猎手初始提交"
  echo "✅ 已提交"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 下一步（手动操作）："
echo ""
echo "1️⃣  创建 Personal Access Token:"
echo "   https://github.com/settings/tokens"
echo "   权限: repo + workflow"
echo ""
echo "2️⃣  推送到 GitHub:"
echo "   git push -u origin main"
echo "   （输入用户名 + Token 作为密码）"
echo ""
echo "3️⃣  验证 GitHub Actions:"
echo "   https://github.com/$GITHUB_USER/$REPO_NAME/actions"
echo "   点击 '市场猎手 · 每日自动选股' → 'Run workflow' 手动测试"
echo ""
echo "4️⃣  手机访问:"
echo "   https://a65c72634f914fa09ee79d3ad34e5885.app.codebuddy.work/standalone.html"
echo ""
echo "🎉 设置完成后，每天早上 8:30 自动更新！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
