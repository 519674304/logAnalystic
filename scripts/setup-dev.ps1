param(
    [switch]$UseRustupMirror
)

Write-Host "== M0 开发环境准备脚本 =="

function Command-Exists {
    param([string]$cmd)
    return $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

if (-not (Command-Exists node)) {
    Write-Host "Node.js (node) 未找到。请先安装 Node.js: https://nodejs.org/" -ForegroundColor Yellow
} else {
    Write-Host "node found: $(node --version)"
}

if (-not (Command-Exists npm)) {
    Write-Host "npm 未找到。请确保 Node.js 安装包含 npm。" -ForegroundColor Yellow
} else {
    Write-Host "npm found: $(npm --version)"
}

if (-not (Command-Exists rustup)) {
    Write-Host "rustup 未找到。请安装 rustup: https://rustup.rs/" -ForegroundColor Yellow
} else {
    Write-Host "rustup found: $(rustup --version)"
}

if (-not (Command-Exists cargo)) {
    Write-Host "cargo 未找到。请安装 Rust 工具链（通过 rustup）。" -ForegroundColor Yellow
} else {
    Write-Host "cargo found: $(cargo --version)"
}

if ($UseRustupMirror) {
    Write-Host "为当前会话设置 rustup 国内镜像环境变量..."
    $env:RUSTUP_DIST_SERVER = "https://mirrors.ustc.edu.cn/rust-static"
    $env:RUSTUP_UPDATE_ROOT = "https://mirrors.ustc.edu.cn/rust-static/rustup"
    Write-Host "已设置：RUSTUP_DIST_SERVER 和 RUSTUP_UPDATE_ROOT（仅当前会话）"
}

# npm install
if (Command-Exists npm) {
    Write-Host "开始运行 npm install..."
    try {
        Push-Location -Path "$PSScriptRoot\.."
        npm install
        Pop-Location
        Write-Host "npm install 完成"
    } catch {
        Write-Host "npm install 失败: $_" -ForegroundColor Red
    }
} else {
    Write-Host "跳过 npm install（npm 不可用）" -ForegroundColor Yellow
}

# cargo check
if (Command-Exists cargo) {
    Write-Host "开始运行 cargo check (src-tauri)..."
    try {
        Push-Location -Path "$PSScriptRoot\..\src-tauri"
        cargo check
        Pop-Location
        Write-Host "cargo check 完成"
    } catch {
        Write-Host "cargo check 失败: $_" -ForegroundColor Red
    }
} else {
    Write-Host "跳过 cargo check（cargo 不可用）" -ForegroundColor Yellow
}

Write-Host "脚本结束。若有缺失工具，请先按 README-SETUP.md 指引安装后重试。"
