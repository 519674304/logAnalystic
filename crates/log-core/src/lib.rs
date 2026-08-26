//! log-core：领域、应用与基础设施。
//!
//! 职责边界（见 `docs/project/architecture/06-package-structure.md`）：
//! - 领域：日志工作区、规则配置、时延分析；`LogSource` 端口。
//! - 应用：编排服务（`open` / `search` / `read_context`）。
//! - 基础设施：ripgrep 流式引擎（固定缓冲区 + 跨块拼接 + 长行上限）。
//!
//! 本 crate 不依赖 axum / tokio / 网络框架，保持纯逻辑可测试。

pub mod application;
pub mod domain;
pub mod infrastructure;
