# 🦅 市场猎手 — App Store 上架指南

## 📦 项目结构

```
supply-chain-hunter-app/
├── public/                    ← Web 前端（PWA 基础）
│   ├── standalone.html       ← 主应用入口
│   ├── manifest.json         ← PWA 清单
│   ├── sw.js                 ← Service Worker（离线支持）
│   ├── icons/                ← App 图标
│   │   ├── icon.svg          ← 矢量源文件
│   │   └── icon-{72..512}.png ← 各尺寸 PNG
│   └── data/                 ← 分析数据
├── capacitor/                ← Capacitor 原生封装
│   ├── package.json
│   └── capacitor.config.json
├── scripts/
│   ├── build-app.sh          ← 一键构建脚本
│   ├── generate-icons.html   ← 图标生成器（浏览器打开）
│   └── copy-web-assets.js    ← Web 资源复制
└── README.md
```

---

## 🚀 快速开始

### 方式一：PWA（最快，无需应用商店）

PWA 可让用户直接从浏览器"添加到主屏幕"，获得接近原生 App 的体验。

```bash
# 1. 部署 Web 文件到静态服务器
cd public/
# 上传到任意静态托管（CloudStudio / Vercel / Netlify）

# 2. 用手机浏览器访问，自动弹出"添加到主屏幕"
```

### 方式二：Capacitor 原生 App（可上架商店）

需要 Android Studio / Xcode 环境。

```bash
# 1. 安装 Capacitor 依赖
cd capacitor/
npm install

# 2. 生成原生项目
npx cap add android    # Android
npx cap add ios        # iOS（仅 macOS）

# 3. 同步 Web 资源
npx cap sync

# 4. 打开原生 IDE 调试
npx cap open android   # → Android Studio
npx cap open ios       # → Xcode
```

---

## 🏪 Google Play 上架步骤

### 前置条件
- [ ] Google Play 开发者账号（$25 一次性费用）
- [ ] Android Studio 已安装
- [ ] JDK 17+

### Step 1: 生成图标

```bash
# 在浏览器中打开图标生成器
open scripts/generate-icons.html

# 点击"一键下载全部尺寸"
# 将下载的 PNG 放入 public/icons/
```

### Step 2: 生成签名密钥

```bash
keytool -genkey -v \
  -keystore market-hunter.keystore \
  -alias markethunter \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass YOUR_PASSWORD \
  -keypass YOUR_PASSWORD
```

### Step 3: 配置签名

编辑 `capacitor/capacitor.config.json`，填写：

```json
"android": {
  "buildOptions": {
    "keystorePath": "market-hunter.keystore",
    "keystorePassword": "YOUR_PASSWORD",
    "keystoreAlias": "markethunter",
    "keystoreAliasPassword": "YOUR_PASSWORD",
    "releaseType": "AAB"
  }
}
```

### Step 4: 构建 AAB

```bash
cd capacitor/
npx cap sync android
cd android/
./gradlew bundleRelease
```

输出：`android/app/build/outputs/bundle/release/app-release.aab`

### Step 5: 上传到 Play Console

1. 登录 [Google Play Console](https://play.google.com/console)
2. 创建应用 → 填写基本信息
3. 上传 AAB
4. 填写商店信息（标题、描述、截图）
5. 设置内容分级
6. 选择定价（免费/付费）
7. 提交审核

---

## 🍎 Apple App Store 上架步骤

### 前置条件
- [ ] Apple Developer Program（$99/年）
- [ ] macOS + Xcode 15+
- [ ] App 已在 App Store Connect 中创建

### Step 1: 配置 Xcode 项目

```bash
cd capacitor/
npx cap sync ios
npx cap open ios
```

### Step 2: 设置签名

在 Xcode 中：
1. 选择项目 → Signing & Capabilities
2. 勾选 "Automatically manage signing"
3. 选择正确的 Team

### Step 3: 配置 Info.plist

确保 `ios/App/App/Info.plist` 包含：

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
</dict>
```

### Step 4: Archive & Upload

1. 在 Xcode 中选择 `Generic iOS Device`
2. `Product` → `Archive`
3. 在 Organizer 中点击 `Distribute App`
4. 选择 `App Store Connect`
5. 上传后等待处理
6. 在 App Store Connect 中完成商店信息

---

## 🔧 配置参数速查

| 参数 | 位置 | 值 |
|:--|:--|:--|
| App ID | `capacitor.config.json` → `appId` | `com.markethunter.app` |
| App 名称 | `capacitor.config.json` → `appName` | `市场猎手` |
| 主题色 | `manifest.json` → `theme_color` | `#3b82f6` |
| 背景色 | `manifest.json` → `background_color` | `#080c14` |
| 最小 Android SDK | `capacitor.config.json` → `minSdkVersion` | 24 |
| iOS 最低版本 | `capacitor.config.json` → `deploymentTarget` | 15.0 |
| PWA 显示模式 | `manifest.json` → `display` | `standalone` |

---

## 📱 应用权限说明

| 权限 | 用途 |
|:--|:--|
| INTERNET | 拉取云端分析数据 |
| ACCESS_NETWORK_STATE | 判断在线/离线状态 |
| POST_NOTIFICATIONS | 推送最新分析结果 |

> 本 App **不收集任何用户隐私数据**，无需注册登录即可使用全部功能。

---

## 🔄 更新流程

当 Web 前端有更新时：

```bash
# PWA: 重新部署 public/ 到托管服务器
# 用户下次打开自动更新（Service Worker 管理）

# Capacitor: 
cd capacitor/ && npx cap sync
# 然后重新构建 AAB/IPA
```

---

## 💰 定价建议

| 市场 | 建议价位 | 说明 |
|:--|:--|:--|
| PWA | 免费 | 基础分析功能 |
| Google Play | ¥6-12 | 一次买断 |
| App Store | $0.99-2.99 | 一次买断 |
| 可选订阅 | ¥9.9/月 | 每日自动推送 + 深度分析 |

---

## ⚖️ 合规声明

- 所有分析数据来自公开信息（通达信金融数据）
- 不构成投资建议
- 用户需自行判断投资风险
- 不收集个人隐私数据
- 不包含内购消费（纯工具类）
