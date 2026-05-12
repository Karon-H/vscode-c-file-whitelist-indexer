<#
.SYNOPSIS
    安装 pre-push 钩子到当前仓库，启用推送前的敏感数据扫描。
#>

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🔒 安装 pre-push 隐私检查钩子          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 方案 A：配置 core.hooksPath 指向 .githooks/
git config core.hooksPath .githooks
Write-Host "[setup] ✔ 已设置 core.hooksPath = .githooks" -ForegroundColor Green

# 方案 B（兼容）：同时复制一份到 .git/hooks/
$hookSrc  = Join-Path $repoRoot ".githooks\pre-push.ps1"
$hookDest = Join-Path $repoRoot ".git\hooks\pre-push"
if (Test-Path $hookSrc) {
    # Git 钩子可以是 PowerShell 脚本，但需要配置
    Copy-Item $hookSrc $hookDest -Force
    Write-Host "[setup] ✔ 已复制到 .git/hooks/pre-push" -ForegroundColor Green
}

# 验证是否生效
$current = git config core.hooksPath
if ($current -eq ".githooks") {
    Write-Host ""
    Write-Host "[setup] ✅ 安装成功！下次 git push 时将自动扫描敏感数据。" -ForegroundColor Green
    Write-Host "[setup]    如需临时跳过钩子，使用：git push --no-verify" -ForegroundColor DarkYellow
} else {
    Write-Host "[setup] ⚠ 配置未生效，请手动执行：git config core.hooksPath .githooks" -ForegroundColor Yellow
}
