# dsh-sticky-disclosure

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://github.com/Han-1413141/dsh-sticky-disclosure/actions/workflows/test.yml/badge.svg)](https://github.com/Han-1413141/dsh-sticky-disclosure/actions/workflows/test.yml)
[English](README.en.md) | 中文

DSH Web 客户端插件：**一键收起会话里所有展开的可折叠区块**（Think 思考行、工具卡片、命令卡片、上下文注入行等），带实时计数的常驻按钮 + **可自定义的快捷键**。

![演示动画](docs/assets/demo.gif)

## ✨ 功能

| 功能 | 说明 |
|---|---|
| 🔘 全部收起按钮 | 聊天区右下角常驻药丸，实时计数（`·N` = 当前展开的区块数），一键收起全部展开区块 |
| ⌨️ 自定义快捷键 | 默认 `Ctrl+Alt+C`（macOS `⌘⌥C`），齿轮按钮 → 按下新组合键即改，持久保存 |
| 🎨 原生外观 | 全部使用应用 `--dsw-*` 设计令牌，自动跟随深色/浅色主题 |
| 🪶 无侵入 | 纯 DOM 实现，不动应用代码；卸载即全量还原 |

### 实机截图（真实 DSH Web 实例）

**展开中的 Think 行 + 右下角带计数的「全部收起」按钮**：

![展开状态](docs/assets/screenshot-01-expanded.png)

**快捷键设置面板（齿轮 → 设置 → 按下新组合键）**：

![设置面板](docs/assets/screenshot-03-panel.png)　![捕获新快捷键](docs/assets/screenshot-04-capture.png)

**一键收起后，计数归零**：

![收起后](docs/assets/screenshot-05-collapsed.png)

## 为什么需要它

对话一长，展开的 Think 思考行、工具卡片就会攒下一堆——想收起它们得一个个去点标题。本插件在聊天区右下角放一枚常驻的「全部收起」按钮（实时显示当前展开了几个），再配一个自定义快捷键：**一次点击 / 一次按键，全部收起**，让对话立刻回到清爽的折叠视图。

## 行为细节

- **「全部收起」按钮**常驻会话滚动区右下角，带实时计数（`·N`）；点击收起会话里**所有**展开的可折叠区块。
- **快捷键**（默认 `Ctrl+Alt+C`，macOS `⌘⌥C`）与按钮等效：一键收起所有展开区块，按下立刻有可观察效果。
- 展开/收起状态、流式输出、切换会话都由 `MutationObserver` + 滚动/尺寸监听自动同步，计数始终准确；插件卸载（HMR / 停用）时全部还原。
- 插件加载时打一条 `console.info("[dsh-sticky-disclosure] applied …")`，并提供调试句柄 `window.dshStickyDisclosure`（`expanded()` / `hotkey()` / `setHotkey(spec)`）。

## ⌨️ 自定义快捷键

1. 点击「全部收起」按钮旁的 **⌨ 齿轮按钮**，打开设置面板；
2. 点击 **「设置」**，面板进入捕获状态；
3. **直接按下新的组合键**（必须含 `Ctrl` / `⌘` / `Alt` 之一，例如 `Ctrl+Shift+K`）——立即生效并持久保存（仅存于浏览器 `localStorage`，不会上传）；
4. 按 `Esc` 取消捕获；点 **「恢复默认」** 回到 `Ctrl+Alt+C`。

也可编程设置：

```js
window.dshStickyDisclosure.setHotkey({ ctrl: true, shift: true, code: "KeyK" }) // Ctrl+Shift+K
window.dshStickyDisclosure.hotkey()                                              // "Ctrl+Shift+K"
```

### 快捷键设计要点

- 刻意**不用 Escape**：应用的对话框与 popup 已占用 `Escape`（插件内部用 Esc 取消捕获，不影响应用）；
- **输入框聚焦时同样生效**（焦点通常留在输入框）；
- 避开 IME 组合输入（`isComposing`）与 AltGr 组合（`getModifierState("AltGraph")`，某些布局里 AltGr 会以 Ctrl+Alt 上报，绝不能拦截它输入的字符）。

### 遮挡关系

- 「全部收起」按钮与齿轮固定在会话滚动区的右下角。
- `z-index: 15`（设置面板 16）：高于聊天内容，低于应用浮层（20）与所有弹窗（100/1000 级）——**不会盖住权限弹窗、设置面板或欢迎遮罩**。
- 全部使用 `--dsw-*` 设计令牌，自动跟随主题与字体；入场动画尊重 `prefers-reduced-motion`。

## 安装

> 需求：DeepSeek Harness（dsh CLI）+ Web 前端。插件随 `dsh web` 启动。

### 方式一：`dsh plugin`（需要机器上有 pnpm）

在本仓库**父目录**执行（相对路径会被锚定到调用目录）：

```bash
# 开发调试（符号链接，改 lib/client.js 后刷新页面即生效）：
dsh plugin --profile web add link:./dsh-sticky-disclosure
# 或固定安装：
# dsh plugin --profile web add file:./dsh-sticky-disclosure
```

### 方式二：手工安装（机器上没有 pnpm）

1. 在 `<DSH_HOME>\profiles\web\package.json`（默认 `%USERPROFILE%\.dsh\profiles\web\package.json`）中：
   - `dependencies` 增加 `"dsh-sticky-disclosure": "link:<本仓库的绝对路径>"`
   - `dsh.profile.bundles` 末尾追加 `"dsh-sticky-disclosure"`
2. 在 profile 的 node_modules 里建目录联接（与 pnpm `link:` 依赖留下的链接一致）：
   ```powershell
   New-Item -ItemType Junction `
     -Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-sticky-disclosure" `
     -Target "<本仓库的绝对路径>"
   ```

### 激活

插件集合变化在**重启时生效**（运行中的服务保持旧图）。**插件 bundle 按 no-cache 提供**：改完 `lib/client.js` 后只需**刷新页面**（Ctrl+F5）即可拿到新代码，无需重启服务。

```bash
# 首次安装后：停掉当前 dsh web 再启动
dsh web
```

验证是否进入插件图（应看到 `id: sticky-disclosure` 与 `name: dsh-sticky-disclosure`）：

```bash
dsh --profile web --dump-config | findstr sticky-disclosure
```

页面加载后，聊天区右下角出现「全部收起」药丸按钮即表示插件已激活。

### 卸载

- 方式一：`dsh plugin --profile web remove dsh-sticky-disclosure`
- 方式二：从 `package.json` 的 `dependencies`/`bundles` 删掉对应条目，删除 `profiles\web\node_modules\dsh-sticky-disclosure` 联接

然后重启 `dsh web`。

## 微调

所有行为参数集中在 `lib/client.js` 顶部常量区：

| 常量 | 默认 | 含义 |
|---|---|---|
| `DEFAULT_HOTKEY` | `Ctrl+Alt+C` | 默认快捷键（可在设置面板修改并持久化） |
| `STORAGE_KEY` | `dsh-sticky-disclosure:hotkey` | 快捷键持久化的 localStorage 键 |
| `DOCK_Z_INDEX` | `15` | 按钮/齿轮遮挡层级（须低于应用浮层 z-20） |
| `PANEL_Z_INDEX` | `16` | 设置面板层级（高于按钮、低于应用浮层） |
| `CONTROL_INSET` | `16` | 「全部收起」按钮距滚动区右下角的间距 |

## 测试

```bash
python test/verify.py   # 需要 Python 3 + playwright（python -m playwright install chromium）
```

`test/` 包含：

- `mock.html` —— 复刻 DSH DOM 契约（`DisclosureRow` 结构 + `[data-conversation-scroll]` 滚动区）的静态测试台；
- `verify.py` —— Playwright 验证脚本（48 项断言）；
- `capture.py` —— 在真实实例上采集演示截图/GIF 的脚本。

覆盖：按钮出现与计数、一键收起全部（含可见区块与输入框聚焦场景）、**自定义快捷键**（设置面板、捕获、Esc 取消、持久化、恢复默认、非法规格拒绝）、状态自动同步、composer 排除、卸载全量还原。

> 本仓库的 CI（`.github/workflows/test.yml`）在每次推送时运行同一套脚本。

## 局限

- 只覆盖**会话聊天流**（`[data-conversation-scroll]` 内）。「轨迹（Trajectory）」视图使用自己的折叠控件，不在范围内。
- 靠 `data-open` / `data-disclosure-row` DOM 契约工作：若上游应用升级改变这些内部结构，需要同步更新选择器。当前契约见 `docs/ARCHITECTURE.md`。

## 目录

```
dsh-sticky-disclosure/
├── .github/workflows/test.yml   # CI：Playwright 验证套件
├── package.json                 # dsh.client(platform: web) + dsh.bundle 声明
├── cordis.patch.yml             # 宿主树入口行（bundle patch）
├── lib/
│   ├── index.js                 # 宿主半身：惰性标记插件（无行为）
│   └── client.js                # 浏览器半身：自包含 bundle（__ModuleLoader__ handoff）
├── test/
│   ├── mock.html                # 复刻 DSH DOM 契约的静态测试台
│   ├── verify.py                # Playwright 验证脚本（48 项断言）
│   └── capture.py               # 演示素材采集脚本
├── docs/
│   ├── assets/                  # 截图与 GIF
│   └── ARCHITECTURE.md          # 架构与实现细节
├── README.md / README.en.md
└── LICENSE
```

## 原理

- 宿主侧 `dsh-client-modules` 扫描 Loader 条目中声明了 `dsh.client.platform === "web"` 的包，把 `exports["./client"]` 指向的构建产物以 `/plugins/<id>/client.js` 提供给浏览器，并注入 `window.__DSH_BOOT__` 入口图。
- 浏览器侧 bundle 通过 `window.__ModuleLoader__.load({ id, factory })` 注册模块，导出 cordis 插件（`name`/`apply`），由 Web shell 的 Loader 激活。
- 插件本体是纯 DOM 层：不动应用代码，只读 `data-open` / `data-disclosure-row` 契约并向原标题行派发 `click`，因此与应用升级/主题/语言无关。

更多细节（管线、契约、状态模型、快捷键配置、遮挡设计）见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## License

[MIT](LICENSE)
