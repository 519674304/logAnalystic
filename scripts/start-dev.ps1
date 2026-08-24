param(
    [switch]$SkipInstall   # 跳过依赖安装（node_modules 缺失时也不装）
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path

# 启动后看什么：
#   - 本脚本启动的是 Tauri 桌面应用，成功后会弹出一个原生窗口（标题 logAnalystic）。
#   - 前端由 Vite 开发服务器托管，固定端口 1420（vite.config.ts 的 server.port），
#     与 tauri.conf.json 的 devPath 保持一致。
#   - 仅调试前端时，可用浏览器打开 http://localhost:1420 ；完整应用以弹出的桌面窗口为准。
#   - 端口已设 strictPort: true：若 1420 被占用，Vite 会直接报错退出（而非悄悄换端口），
#     避免 Tauri 窗口加载到错误地址。此时请先释放 1420 再启动。

Write-Host "== logAnalystic 开发环境启动脚本 ==" -ForegroundColor Cyan

function Command-Exists {
    param([string]$cmd)
    return $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

# --- 1. 前置检查 ---
if (-not (Command-Exists node)) {
    Write-Host "✗ 未找到 node。请先安装 Node.js LTS: https://nodejs.org/" -ForegroundColor Red
    exit 1
}
Write-Host "✓ node: $(node --version)"

# 确定包管理器（tauri.conf.json 的 beforeDevCommand 使用 npm run dev）
$PkgManager = $null
if (Command-Exists npm) {
    $PkgManager = "npm"
} elseif (Command-Exists pnpm) {
    $PkgManager = "pnpm"
} else {
    Write-Host "✗ 未找到 npm 或 pnpm。请先安装 Node.js 并确保包含 npm。" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 包管理器: $PkgManager"

if (-not (Command-Exists cargo)) {
    Write-Host "✗ 未找到 cargo。请先安装 Rust 工具链: https://rustup.rs/" -ForegroundColor Red
    exit 1
}
Write-Host "✓ cargo: $(cargo --version)"

# --- 2. 安装前端依赖（node_modules 缺失时）---
if (-not (Test-Path "$ProjectRoot\node_modules")) {
    if ($SkipInstall) {
        Write-Host "警告: node_modules 缺失且已跳过安装，启动可能失败。" -ForegroundColor Yellow
    } else {
        Write-Host "node_modules 缺失，运行 $PkgManager install ..."
        Push-Location $ProjectRoot
        try {
            & $PkgManager install
            if ($LASTEXITCODE -ne 0) { throw "$PkgManager install 失败" }
        } finally {
            Pop-Location
        }
    }
}

# --- 3. 启动 Tauri 开发环境 ---
Write-Host "启动 Tauri 开发环境 ($PkgManager run tauri:dev) ..." -ForegroundColor Green
Push-Location $ProjectRoot
try {
    & $PkgManager run tauri:dev
    if ($LASTEXITCODE -ne 0) { throw "tauri:dev 退出码 $LASTEXITCODE" }
} finally {
    Pop-Location
}
