<#
.SYNOPSIS
    Git pre-push hook — 推送前扫描敏感数据，发现则阻止推送。
.DESCRIPTION
    将此文件放置到 .githooks/pre-push 并通过以下命令启用：
      git config core.hooksPath .githooks

    它会扫描即将推送的 commit 中是否包含常见的敏感信息模式。
    如果发现问题，推送会被中断，并提示具体位置。
#>

$ErrorActionPreference = "Stop"

# 远程目标信息（由 Git 传入）
$remoteName = $args[0]
$remoteUrl  = $args[1]

Write-Host "`n[pre-push] 🔍 正在扫描敏感数据..." -ForegroundColor Cyan
Write-Host "[pre-push]    目标: $remoteUrl`n" -ForegroundColor DarkGray

# ============================================================
# 敏感模式定义
# ============================================================
$secretPatterns = @(
    # 密钥关键词
    @{ Name = "Password/Secret 关键词"; Pattern = '(?i)(password|passwd|pwd|secret|secretkey|secret_key)\s*[:=]\s*[''"][^''"]+[''"]' }
    @{ Name = "API Token/Key 关键词";     Pattern = '(?i)(api[_-]?key|api[_-]?secret|apikey|token|auth[_-]?token|access[_-]?key|bearer)\s*[:=]\s*[''"][^''"]+[''"]' }
    @{ Name = "Private Key 关键词";       Pattern = '(?i)(private[_-]?key|privatekey|pgp[_-]?private|ssh[_-]?private)\s*[:=]\s*[''"][^''"]+[''"]' }

    # 私钥文件内容特征
    @{ Name = "RSA/DSA/EC 私钥内容";     Pattern = '-----BEGIN\s+(RSA|DSA|EC|PGP|OPENSSH)\s+PRIVATE\s+KEY-----' }

    # 连接字符串中的密码
    @{ Name = "连接字符串密码";           Pattern = '(?i)(Server|Host|DataSource)\s*=\s*.+;(Password|Pwd|User\s*Id)\s*=' }

    # AWS 凭证
    @{ Name = "AWS Access Key";           Pattern = '(?i)aws[_-]?access[_-]?key[_-]?id\s*[:=]\s*[''"][A-Z0-9]{16,}[''"]' }
    @{ Name = "AWS Secret Key";           Pattern = '(?i)aws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*[''"][A-Za-z0-9/=+]{40,}[''"]' }

    # 通用凭据文件
    @{ Name = ".env 文件";                Pattern = '^(?i)(DB_|MYSQL_|POSTGRES_|REDIS_|MONGO_|SECRET|TOKEN|API_KEY|PASSWORD)' }
)

# ============================================================
# 获取即将推送的 commit 范围
# 从 stdin 读取: <local-ref> <local-sha> <remote-ref> <remote-sha>
# ============================================================
$hasIssues = $false

$stdin = @($input)
if ($stdin.Count -eq 0) {
    # 兼容手动测试：扫描 HEAD 与其 parent 的差异
    $localSha = git rev-parse HEAD 2>$null
    $remoteSha = git rev-parse @{u} 2>$null
    if (-not $remoteSha) { $remoteSha = "HEAD" }
    $range = "$remoteSha..$localSha"
} else {
    # 读取 stdin 每一行
    $range = ""
    foreach ($line in $stdin) {
        $parts = $line.Trim() -split '\s+'
        if ($parts.Count -ge 2) {
            $localSha = $parts[1]
            # 全 0 表示新分支/删除分支
            if ($localSha -notmatch '^0+$') {
                $range = "$range $localSha"
            }
        }
    }
    if ([string]::IsNullOrWhiteSpace($range)) {
        Write-Host "[pre-push] ✓ 没有需要扫描的 commit" -ForegroundColor Green
        exit 0
    }
    # 获取这些 commit 相对于远程的差异
    # 我们用被 push 的 commit 逐个扫描
}

# 获取所有将被推送的 commit 的 diff
if ($stdin.Count -eq 0 -or $range -eq "") {
    $diffOutput = git diff --cached -- . 2>$null
    if (-not $diffOutput) {
        $diffOutput = git diff HEAD~1..HEAD -- . 2>$null
    }
} else {
    $diffOutput = & git diff @($range.Split(' ', [StringSplitOptions]::RemoveEmptyEntries) | ForEach-Object { "$_^..$_" }) 2>$null
}

if (-not $diffOutput) {
    Write-Host "[pre-push] ✓ 没有差异需要扫描" -ForegroundColor Green
    exit 0
}

# ============================================================
# 执行扫描
# ============================================================
$findings = @()

foreach ($pattern in $secretPatterns) {
    $matches = $diffOutput | Select-String -Pattern $pattern.Pattern -AllMatches
    foreach ($match in $matches) {
        $line = $match.Line.Trim()
        # 跳过 package-lock.json 中的 npm 包名误报
        if ($line -match 'node_modules/|package-lock\.json') { continue }
        # 跳过注释行
        if ($line -match '^\s*[/#]') { continue }

        $findings += @{
            File    = $match.Filename
            Line    = $match.LineNumber
            Content = $line.Substring(0, [Math]::Min($line.Length, 100))
            Type    = $pattern.Name
        }
    }
}

# ============================================================
# 报告结果
# ============================================================
if ($findings.Count -gt 0) {
    $hasIssues = $true
    Write-Host "[pre-push] ⛔ 发现可能的敏感数据！推送已阻止`n" -ForegroundColor Red

    foreach ($f in $findings) {
        Write-Host "  ⚠  [$($f.Type)]" -ForegroundColor Yellow
        if ($f.File) {
            Write-Host "     文件: $($f.File):$($f.Line)" -ForegroundColor DarkYellow
        }
        Write-Host "     内容: $($f.Content)" -ForegroundColor Gray
        Write-Host ""
    }

    Write-Host "────────────────────────────────────────────" -ForegroundColor DarkRed
    Write-Host "  请检查上述内容，确认无误后移除敏感信息再提交。" -ForegroundColor Red
    Write-Host "  提示: 可以用 git diff --cached 查看即将提交的内容" -ForegroundColor DarkYellow
    Write-Host "────────────────────────────────────────────" -ForegroundColor DarkRed
    exit 1
} else {
    Write-Host "[pre-push] ✓ 未发现敏感数据，继续推送" -ForegroundColor Green
    exit 0
}
