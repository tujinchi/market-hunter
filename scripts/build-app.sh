#!/bin/bash
# =============================================
# 市场猎手 — 原生 App 构建脚本
# =============================================
# 用法:
#   ./scripts/build-app.sh android   → 构建 Android APK/AAB
#   ./scripts/build-app.sh ios       → 构建 iOS IPA
#   ./scripts/build-app.sh web       → 构建 PWA（仅 Web）
#   ./scripts/build-app.sh all       → 构建全部平台
# =============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
CAP_DIR="$APP_DIR/capacitor"
PUBLIC_DIR="$APP_DIR/public"
BUILD_DIR="$APP_DIR/build"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     🦅 市场猎手 App 构建工具         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"

# 检查依赖
check_deps() {
  echo -e "${YELLOW}[1/4] 检查依赖...${NC}"

  if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安装，请先安装 Node.js 18+${NC}"
    exit 1
  fi

  # 安装 Capacitor 依赖
  if [ ! -d "$CAP_DIR/node_modules" ]; then
    echo "   安装 Capacitor 依赖..."
    cd "$CAP_DIR" && npm install
  fi

  echo -e "${GREEN}   ✅ 依赖就绪${NC}"
}

# 复制 Web 资源
copy_web() {
  echo -e "${YELLOW}[2/4] 复制 Web 资源...${NC}"

  # 确保 webDir 指向正确的目录
  mkdir -p "$BUILD_DIR"
  cp -r "$PUBLIC_DIR"/* "$BUILD_DIR/"

  echo -e "${GREEN}   ✅ Web 资源已复制到 build/${NC}"
}

# 构建 Android
build_android() {
  echo -e "${YELLOW}[3/4] 构建 Android...${NC}"

  cd "$CAP_DIR"

  # 同步 Web 资源到 Android
  npx cap sync android

  # 进入 Android 项目
  cd android

  # 生成图标资源
  echo "   生成图标资源..."
  if [ -f "../node_modules/.bin/capacitor-assets" ]; then
    npx capacitor-assets generate --iconBackgroundColor '#080c14' --iconBackgroundColorDark '#080c14'
  fi

  # 清理旧构建
  ./gradlew clean

  # 构建 Release AAB（Google Play 推荐格式）
  echo "   构建 Release AAB..."
  ./gradlew bundleRelease

  # 同时构建 APK（用于测试）
  echo "   构建 Release APK..."
  ./gradlew assembleRelease

  echo -e "${GREEN}   ✅ Android 构建完成${NC}"
  echo -e "   📦 AAB: capacitor/android/app/build/outputs/bundle/release/app-release.aab"
  echo -e "   📦 APK: capacitor/android/app/build/outputs/apk/release/app-release.apk"
}

# 构建 iOS
build_ios() {
  echo -e "${YELLOW}[3/4] 构建 iOS...${NC}"

  cd "$CAP_DIR"

  # 同步 Web 资源到 iOS
  npx cap sync ios

  # 生成图标资源
  echo "   生成图标资源..."
  if [ -f "../node_modules/.bin/capacitor-assets" ]; then
    npx capacitor-assets generate --iconBackgroundColor '#080c14' --iconBackgroundColorDark '#080c14'
  fi

  echo -e "${GREEN}   ✅ iOS 项目准备完成${NC}"
  echo -e "   📂 在 Xcode 中打开: capacitor/ios/App.xcworkspace"
  echo -e "   💡 选择 Product → Archive 进行发布构建"
}

# 构建 PWA
build_web() {
  echo -e "${YELLOW}[3/4] 构建 PWA...${NC}"

  mkdir -p "$BUILD_DIR"
  cp -r "$PUBLIC_DIR"/* "$BUILD_DIR/"

  echo -e "${GREEN}   ✅ PWA 构建完成 → $BUILD_DIR${NC}"
}

# 主流程
copy_web

case "${1:-web}" in
  android)
    check_deps
    build_android
    ;;
  ios)
    check_deps
    build_ios
    ;;
  web)
    build_web
    ;;
  all)
    check_deps
    build_web
    build_android
    # build_ios  # iOS 需要 macOS + Xcode
    ;;
  *)
    echo "用法: $0 {android|ios|web|all}"
    exit 1
    ;;
esac

# 签名检查提醒
echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  📋 应用商店提交清单                  ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════╣${NC}"
echo -e "${CYAN}║                                      ║${NC}"
echo -e "${CYAN}║  Google Play:                        ║${NC}"
echo -e "${CYAN}║    1. 创建 Google Play 开发者账号    ║${NC}"
echo -e "${CYAN}║    2. 生成签名密钥（keystore）        ║${NC}"
echo -e "${CYAN}║    3. 上传 AAB 到 Play Console       ║${NC}"
echo -e "${CYAN}║                                      ║${NC}"
echo -e "${CYAN}║  Apple App Store:                    ║${NC}"
echo -e "${CYAN}║    1. 注册 Apple Developer Program   ║${NC}"
echo -e "${CYAN}║    2. 在 Xcode 中配置签名和证书      ║${NC}"
echo -e "${CYAN}║    3. Product → Archive → 上传       ║${NC}"
echo -e "${CYAN}║                                      ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"

echo -e "\n${GREEN}🎉 构建流程完成！${NC}"
