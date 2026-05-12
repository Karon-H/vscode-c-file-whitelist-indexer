# C File Whitelist Indexer

这个 VSCode 扩展的目标很单一:

- 保留 `cpptools` 或 `clangd` 的解析能力
- 在“转到定义 / 转到实现”结果返回后
- 过滤掉不在工程白名单里的 `.c/.cpp` 候选

现在的实现还会直接接管常用跳转命令：

- `Go to Definition`
- `Peek Definition`
- `Go to Implementation`
- `Peek Implementation`

这样可以避免只注册额外 provider 时，被底层 `cpptools` 结果再次混入的问题。

它适合 IAR / HFP 这种场景:

- 同一个 `sdk/src/drivers` 里有很多 `adc_*_driver.c`
- 它们内部都有同名实现，比如 `adc_driver`
- VSCode 会把很多同名实现一起列出来

这个扩展不能替代编译数据库，也不能修正头文件搜索。
它解决的是“定义候选太多，尤其是很多不参与当前工程编译的 `.c`”这个问题。

如果你同时在用 `parse_iar_ewp.py`：

- 推荐把它生成的 `.vscode/source_whitelist_<配置名>.json` 作为插件输入
- `selected_drivers_<配置名>.json` 仅用于人工核对，不是插件输入文件

## 1. 工作方式

扩展会读取下面任意一种白名单来源:

- `compile_commands.json`
- 自定义 `source_whitelist.json`

然后在 `Go to Definition` / `Go to Implementation` 返回结果后做过滤:

- `.c/.cc/.cpp/.cxx` 只有在白名单中才保留
- `.h/.hpp` 默认保留
- 如果存在白名单中的 `.c` 结果，默认优先返回它

如果白名单过滤后只剩 1 个结果，会直接打开。

如果还剩多个白名单结果：

- `Peek` 会只显示过滤后的候选
- 普通跳转会弹出一个只包含过滤后结果的选择框

## 2. 推荐搭配

最推荐直接使用你现有脚本生成的编译数据库:

```bash
parse_iar_ewp.exe app.ewp --config combin_all_debug --write-vscode --with-compile-commands
```

然后在工作区设置里写:

```json
{
  "cFileWhitelistIndexer.compileCommandsPath": "${workspaceFolder}\\.vscode\\compile_commands_combin_all_debug.json"
}
```

这样扩展会把 `compile_commands` 里出现的源文件当成“参与当前工程编译的源文件白名单”。

## 3. 也支持自定义白名单

如果你不想生成 `compile_commands.json`，也可以手写一个:

```json
{
  "files": [
    "C:\\code\\project\\sdk\\src\\drivers\\adc_rn8615_v2_driver.c",
    "C:\\code\\project\\sdk\\src\\drivers\\rtc_rn8615_v2_driver.c"
  ]
}
```

然后配置:

```json
{
  "cFileWhitelistIndexer.whitelistFile": "${workspaceFolder}\\.vscode\\source_whitelist.json"
}
```

如果你在用 `parse_iar_ewp.py`，也可以直接生成这个文件：

```bash
parse_iar_ewp.exe app.ewp --config combin_all_debug --write-vscode --emit-whitelist-for-vscode-plugin
```

默认文件名形如：

- `.vscode/source_whitelist_combin_all_debug.json`

## 4. 关键设置

```json
{
  "cFileWhitelistIndexer.enabled": true,
  "cFileWhitelistIndexer.preferWhitelistedSource": true,
  "cFileWhitelistIndexer.allowHeaderResults": true,
  "cFileWhitelistIndexer.compileCommandsPath": "${workspaceFolder}\\.vscode\\compile_commands_combin_all_debug.json",
  "cFileWhitelistIndexer.showStatusMessages": true
}
```

## 4.1 图形化配置

如果你不想手改 `settings.json`，可以直接在 VSCode 里执行命令：

- `C File Whitelist Indexer: Configure`

这个向导会：

- 自动扫描工作区里的 `.vscode/source_whitelist_*.json`
- 或自动扫描 `.vscode/compile_commands_*.json`
- 让你点选要使用哪个文件
- 自动写入工作区设置
- 自动执行一次白名单重载

对于你当前这种 IAR 工程，优先推荐选：

- `使用 source_whitelist 文件`

## 5. 本地打包

```bash
npm install
npm run compile
npm run package
```

产物会是一个 `.vsix`，可直接在 VSCode 安装。

也可以直接执行:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

## 5.1 安装后建议

工作区 `settings.json` 可以先这样配:

```json
{
  "cFileWhitelistIndexer.enabled": true,
  "cFileWhitelistIndexer.preferWhitelistedSource": true,
  "cFileWhitelistIndexer.allowHeaderResults": true,
  "cFileWhitelistIndexer.compileCommandsPath": "${workspaceFolder}\\.vscode\\compile_commands_combin_all_debug.json"
}
```

然后执行命令:

- `C File Whitelist Indexer: Reload Whitelist`

再测试 `adc_driver` / `rtc_driver` 这类符号跳转结果。

## 6. 当前限制

- 它只能过滤 VSCode 已经找到的定义结果
- 如果底层语言服务根本没返回正确实现，这个扩展也“变不出来”
- 最佳效果仍然依赖:
  - 尽量准确的 `compile_commands.json`
  - 尽量收窄的 `browse.path`

## 7. 如果你发现“还是看到很多别的 .c”

先确认以下几点：

- 已安装的是这次重新打包后的新版 `.vsix`
- 执行过 `C File Whitelist Indexer: Reload Whitelist`
- 工作区设置里确实指向了当前配置对应的 `.vscode/source_whitelist_*.json` 或 `compile_commands_*.json`
- 你触发的是 VSCode 自带的跳转命令，比如 `F12`、`Alt+F12`、右键“转到定义/查看定义”

如果你安装的是旧版扩展，虽然 provider 内部做了过滤，但 VSCode 仍可能把 `cpptools` 自己的候选一起合并显示，看起来就像“没有屏蔽其他 .c 文件”。
