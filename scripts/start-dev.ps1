param(
    [switch]$SkipInstall   # 跳过依赖安装（node_modules 缺失时也不装）
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path

# 启动后看什么：
#   - 本脚本启动两个进程（各一个窗口）：
#       1) Rust 本机 Web 服务（cargo run -p server），仅监听 127.0.0.1:8080。
#       2) Vite 前端开发服务器（npm run dev），固定端口 1420（vite.config.ts 的 server.port）。
#   - 浏览器打开 http://localhost:1420 访问前端，前端经 HTTP 调用 127.0.0.1:8080 的服务端。
#   - 端口均设 strictPort：若 1420 被占用，Vite 会报错退出；服务端 8080 被占用时也会报 bind 失败。
#     请先释放对应端口再启动。

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

# 确定包管理器（前端依赖与脚本均经 package.json）
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

# --- 3. 启动开发环境（Rust 服务端 + Vite 前端，各一个窗口）---
Write-Host "启动 Rust 服务端 (cargo run -p server) -> http://127.0.0.1:8080" -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/k cargo run -p server" -WorkingDirectory $ProjectRoot

Write-Host "启动 Vite 前端 ($PkgManager run dev) -> http://localhost:1420" -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/k $PkgManager run dev" -WorkingDirectory $ProjectRoot

Write-Host "两个窗口已打开：服务端 8080、前端 1420。浏览器访问 http://localhost:1420" -ForegroundColor Cyan
