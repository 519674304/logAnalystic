# 服务端入口拆分：B 批次

## 目标

在不改变 HTTP 接口、响应、日志字段或组合根依赖装配的前提下，把 `crates/server/src/main.rs` 中的 handler 与路由组装职责拆出，使该文件只负责启动和组合根。

## 固定边界

- 保留既有 URL、请求 DTO、响应结构、状态码和请求诊断中间件。
- `AppState` 仍是服务端组合状态；handler 通过 `State<AppState>` 和 `Extension<RequestId>` 接收依赖。
- DTO 和领域映射继续分别位于 `dto.rs`、`mapping.rs`；本批次不调整其行为。
- 不处理未决的时延业务语义与区间统计。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `handlers.rs` | `AppState`、`RequestId`、API 错误响应，以及每个 HTTP handler。 |
| `router.rs` | 路由表、CORS 与请求诊断中间件；暴露 `router(state)`。 |
| `main.rs` | `app()` 中的 infrastructure 装配，以及进程启动。 |
| `main.rs` 单元测试 | 仅保留组合根无关的纯函数测试；新模块各自拥有测试。 |

## 实施与证据

1. 先增加一个路由冒烟测试，断言完整 router 同时保留 `GET /health` 与时延分析端点；在缺少 `router` 模块时应编译失败。
2. 新建 `handlers.rs`，迁移状态、错误转换与 handler，逐字保持请求处理和观测字段不变。
3. 新建 `router.rs`，迁移 operation 判定、请求诊断中间件及路由/CORS 组装；由 `main.rs` 调用。
4. 执行 `cargo test -p server`、`cargo test --workspace`、`cargo check --workspace`、三项 Node 契约/基线检查和前端构建。
5. 使用 `git diff --check`，并确认 `main.rs` 不再声明 handler 或路由构造函数。
