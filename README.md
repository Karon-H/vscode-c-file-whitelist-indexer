# C File Whitelist Indexer

> 过滤 C/C++ 跳转结果，只保留当前工程实际参与编译的源文件。

[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90.0-007ACC?logo=visualstudiocode)](https://code.visualstudio.com)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## 概述 {#overview}

**C File Whitelist Indexer** 是一个 VS Code 扩展，解决 IAR / HFP 等嵌入式项目中**同名符号跳转候选过多**的问题。

典型场景：

- SDK 中有多个 `adc_*_driver.c`，内部都有同名的 `adc_driver` 实现
- 默认 `Go to Definition` 会列出所有同名候选，难以定位到当前工程实际使用的文件
- 本插件在跳转结果返回后进行**白名单过滤**，只保留参与当前编译的 `.c/.cpp` 文件

> ⚠ 本插件不替代编译数据库，不修正头文件搜索路径。它解决的是**定义候选过多**的问题。

---

## 工作方式 {#how-it-works}

```
 ┌─────────────────────┐
 │  用户触发跳转 (F12)  │
 └─────────┬───────────┘
           ▼
 ┌─────────────────────┐
 │  cpptools/clangd    │
 │  返回所有定义候选    │
 └─────────┬───────────┘
           ▼
 ┌─────────────────────┐
 │  Whitelist Filter   │ ◄── 加载白名单文件
 │  - 保留匹配的 .c    │
 │  - 保留 .h 头文件    │
 │  - 过滤无关 .c      │
 └─────────┬───────────┘
           ▼
 ┌─────────────────────┐
 │  返回过滤后的结果    │
 └─────────────────────┘
```

### 过滤规则

| 文件类型 | 行为 |
|----------|------|
| `.c / .cc / .cpp / .cxx` | **仅保留**在白名单中的文件 |
| `.h / .hh / .hpp / .hxx` | 默认**全部保留** |
| 其他类型 | 全部保留 |

### 结果处理

- 过滤后只剩 **1 个** → 直接打开
- 过滤后剩 **多个** → `Peek` 仅显示过滤候选；`Go to Definition` 弹出过滤后选择框
- 白名单中有 `.c` 结果时 → **优先返回** `.c` 文件

---

## 安装 {#installation}

### 从 GitHub 安装

```bash
# 1. 克隆仓库
git clone https://github.com/Karon-H/vscode-c-file-whitelist-indexer.git

# 2. 安装依赖并打包
cd vscode-c-file-whitelist-indexer
npm install
npm run package

# 3. 在 VS Code 中安装生成的 .vsix 文件
#    按 Ctrl+Shift+P → "Extensions: Install from VSIX..."
```

### 快速打包

```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

---

## 配置 {#configuration}

### 方式一：使用编译数据库（推荐）

如果你有 `compile_commands.json`，插件会将其中的源文件列表作为白名单。

```json
{
  "cFileWhitelistIndexer.compileCommandsPath": "${workspaceFolder}\\.vscode\\compile_commands_combin_all_debug.json"
}
```

### 方式二：使用自定义白名单

创建一个 JSON 文件，列出参与编译的源文件：

```json
{
  "files": [
    "C:\\project\\sdk\\src\\drivers\\adc_rn8615_v2_driver.c",
    "C:\\project\\sdk\\src\\drivers\\rtc_rn8615_v2_driver.c"
  ]
}
```

然后在设置中指向它：

```json
{
  "cFileWhitelistIndexer.whitelistFile": "${workspaceFolder}\\.vscode\\source_whitelist.json"
}
```

### 方式三：图形化配置

按 `Ctrl+Shift+P`，执行命令：

```
C File Whitelist Indexer: Configure
```

向导会自动扫描工作区中的 `source_whitelist_*.json` 或 `compile_commands_*.json`，选择后自动写入配置。

---

## 完整设置项 {#settings}

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| `cFileWhitelistIndexer.enabled` | `true` | 启用白名单过滤 |
| `cFileWhitelistIndexer.compileCommandsPath` | `""` | `compile_commands.json` 路径 |
| `cFileWhitelistIndexer.whitelistFile` | `""` | 自定义白名单 JSON 路径 |
| `cFileWhitelistIndexer.preferWhitelistedSource` | `true` | 优先返回白名单中的 `.c` 结果 |
| `cFileWhitelistIndexer.allowHeaderResults` | `true` | 保留头文件结果 |
| `cFileWhitelistIndexer.showStatusMessages` | `true` | 重载白名单时显示提示信息 |

---

## 命令 {#commands}

| 命令 | 说明 |
|------|------|
| `C File Whitelist Indexer: Reload Whitelist` | 手动重载白名单 |
| `C File Whitelist Indexer: Configure` | 打开图形化配置向导 |

---

## 推荐搭配：parse_iar_ewp {#integration}

如果你使用 IAR 工程，推荐搭配 [parse_iar_ewp](https://github.com/Karon-H/parse_iar_ewp) 使用：

```bash
# 生成 VSCode 配置 + 编译数据库
parse_iar_ewp.exe app.ewp --config combin_all_debug --write-vscode --with-compile-commands

# 或生成白名单文件
parse_iar_ewp.exe app.ewp --config combin_all_debug --write-vscode --emit-whitelist-for-vscode-plugin
```

执行后会在 `.vscode/` 下生成 `source_whitelist_*.json` 或 `compile_commands_*.json`，插件会自动识别。

---

## 快速验证 {#quick-test}

1. 安装插件并配置白名单文件
2. 按 `Ctrl+Shift+P`，执行 `C File Whitelist Indexer: Reload Whitelist`
3. 打开一个 `.c` 文件，按 `F12` 跳转到符号定义
4. 观察结果是否只包含白名单中的文件

---

## 当前限制 {#limitations}

- 只能过滤 VS Code **已经找到**的定义结果
- 如果底层语言服务本身返回的结果就不正确，本插件无法补全
- 最佳效果仍然依赖准确的 `compile_commands.json` 和收窄的 `browse.path`

---

## 开发 {#development}

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 类型检查
npm run check

# 打包
npm run package
```

### 项目结构

```
src/
  extension.ts    # 主逻辑：白名单状态管理 + Provider 注册
package.json      # 插件 manifest
tsconfig.json     # TypeScript 配置
build.ps1         # 一键构建脚本
```

---

## License {#license}

[MIT](LICENSE)
