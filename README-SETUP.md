# 开发环境快速就绪（Windows）

1) 前置安装（请选择适合你机器的安装方式）

- Node.js (含 npm)：https://nodejs.org/  推荐 LTS
- Rust + rustup：https://rustup.rs/  推荐默认 stable 工具链
- Visual Studio Build Tools（Windows，若使用 Tauri）: https://visualstudio.microsoft.com/zh-hans/downloads/
- Tauri CLI（可选，本地打包/开发）：`cargo install tauri-cli` 或 `npm install -D @tauri-apps/cli`

2) 使用仓库内脚本检查并安装依赖（PowerShell 以管理员或普通权限均可）

在项目根运行：

```powershell
.\scripts\setup-dev.ps1
```

脚本会：
- 检查 `node`/`npm`、`rustup`/`cargo`、`tauri` 命令是否可用；
- 为当前会话临时设置 `RUSTUP` 国内镜像环境变量（若同意）；
- 在有条件时运行 `npm install` 和 `cargo check`。

3) 常用手动命令

```powershell
# 安装前端依赖
npm install

# 在 src-tauri 进行 Rust 检查
cd src-tauri
cargo check

# 启动开发（需已正确安装 Tauri & Rust 工具链）
cd ..
npm run tauri:dev
```

4) 镜像配置

仓库已包含：
- `.npmrc`：使用 npmmirror（阿里）镜像
- `.cargo/config.toml`：使用清华 tuna 镜像索引

如果需要为 `rustup` 指定国内镜像，可在 Powershell 中运行（临时）：

```powershell
$env:RUSTUP_DIST_SERVER = "https://mirrors.ustc.edu.cn/rust-static"
$env:RUSTUP_UPDATE_ROOT = "https://mirrors.ustc.edu.cn/rust-static/rustup"
```
