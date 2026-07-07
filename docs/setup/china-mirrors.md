# 国内镜像与代理配置（针对 M0 脚手架）

下面给出常用工具在中国大陆的镜像/代理配置，已在仓库放置对应文件：`.npmrc` 和 `.cargo/config.toml`。

- npm / Node: 使用阿里 npm 镜像（npmmirror）

  在仓库根已添加 `.npmrc`，内容：

  ```text
  registry=https://registry.npmmirror.com/
  ```

- Cargo / Rust: 使用清华 tuna 镜像索引

  在仓库已添加 `.cargo/config.toml`，内容：

  ```toml
  [source.crates-io]
  replace-with = "tuna"

  [source.tuna]
  registry = "https://mirrors.tuna.tsinghua.edu.cn/git/crates.io-index"
  ```

  另建议在 CI 或本地 shell 中设置环境变量以加速 rustup 下载（临时生效）：

  ```powershell
  $env:RUSTUP_DIST_SERVER = "https://mirrors.ustc.edu.cn/rust-static"
  $env:RUSTUP_UPDATE_ROOT = "https://mirrors.ustc.edu.cn/rust-static/rustup"
  ```

- pip (可选): 使用清华镜像

  在用户主目录（Windows `%%APPDATA%%\\pip\\pip.ini`）或虚拟环境中创建 `pip.ini`：

  ```ini
  [global]
  index-url = https://pypi.tuna.tsinghua.edu.cn/simple
  ```

- 全局代理与 HTTP(S) 代理：

  如需通过公司代理或自建 SOCKS5 代理访问外网，请设置环境变量 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`。

---

说明：仓库内的镜像配置是为了 M0 本地开发的便利，CI/发布环境请参考各自运行环境的安全与合规策略。
