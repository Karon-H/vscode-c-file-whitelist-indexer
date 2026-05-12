# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-05-12

### Added

- 新增 ESLint + Prettier 代码质量和格式化工具
- 新增单元测试框架（Mocha + assert）
- 新增 LICENSE (MIT) 文件
- 新增 CHANGELOG.md 变更日志
- 新增 `.vscode/extensions.json` 推荐扩展
- 新增 `source_whitelist.example.json` 白名单示例文件
- 新增 `pureUtils.ts` 纯函数模块，便于独立测试

### Changed

- 重构 `extension.ts` 拆分为 7 个模块（types / utils / pureUtils / whitelistState / navigation / commands / config）
- 优化 `.vscodeignore`，排除辅助文件
- 更新 `package.json` publisher 为 `Karon-H`

## [0.0.1] — 2026-05-12

### Added

- C/C++ 定义跳转白名单过滤（`Go to Definition` / `Go to Implementation`）
- 支持两种白名单来源：`compile_commands.json` 和自定义 `source_whitelist` JSON
- 配置向导（`C File Whitelist Indexer: Configure` 命令）
- 命令覆盖：接管内置跳转命令以应用过滤
- 白名单重载命令（`C File Whitelist Indexer: Reload Whitelist`）
- 隐私扫描 Git pre-push 钩子（`.githooks/pre-push.ps1`）
- GitHub Actions 工作流：自动 Build + Release + Secret Scan
