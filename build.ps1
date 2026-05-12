Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "[INFO] Installing dependencies..." -ForegroundColor Cyan
npm install

Write-Host "[INFO] Running TypeScript check..." -ForegroundColor Cyan
& .\node_modules\.bin\tsc.cmd -p .\ --noEmit

Write-Host "[INFO] Compiling extension..." -ForegroundColor Cyan
& .\node_modules\.bin\tsc.cmd -p .\

Write-Host "[INFO] Packaging VSIX..." -ForegroundColor Cyan
& .\node_modules\.bin\vsce.cmd package

Write-Host "[OK] Build completed." -ForegroundColor Green
