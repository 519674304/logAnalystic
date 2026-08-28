# 开发环境快速就绪

本项目是「Vite 前端 + Rust 后端服务」的结构，无 Tauri 运行时依赖。

## 前置安装

- Node.js（含 npm）：https://nodejs.org/  推荐 LTS
- Rust + rustup：https://rustup.rs/  默认 stable 工具链

> 无需安装 Tauri CLI 或 Visual Studio Build Tools。

## 一键启动（Windows PowerShell）

在项目根运行：

```powershell
.\scripts\start-dev.ps1
```

脚本会：

- 检查 `node` / `npm` / `cargo` 是否可用；
- 若 `node_modules` 缺失，自动 `npm install`；
- 分别打开两个窗口：Rust 后端（`cargo run -p server`，http://127.0.0.1:8080）与 Vite 前端（`npm run dev`，http://localhost:1420）。

浏览器访问 http://localhost:1420 ，前端经 HTTP 调用 127.0.0.1:8080 的后端。

## 手动启动

```powershell
# 安装前端依赖
npm install

# 启动后端（监听 127.0.0.1:8080）
cargo run -p server

# 另开一个终端启动前端（监听 1420）
npm run dev
```

## 环境准备（可选）

```powershell
.\scripts\setup-dev.ps1
```

脚本会检查工具链并运行 `npm install` 与 `cargo check`。

## 镜像配置

仓库已包含：

- `.npmrc`：npmmirror（阿里）镜像
- `.cargo/config.toml`：清华 tuna 镜像索引

如为 `rustup` 指定国内镜像（临时，仅当前会话）：

```powershell
$env:RUSTUP_DIST_SERVER = "https://mirrors.ustc.edu.cn/rust-static"
$env:RUSTUP_UPDATE_ROOT = "https://mirrors.ustc.edu.cn/rust-static/rustup"
```
