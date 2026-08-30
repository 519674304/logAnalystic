use serde::Serialize;

/// 日志条目扩展数据：按来源分型（强类型多实现）。
/// 当前只有端侧 Edge；云端 Cloud 变体接入时在此新增，无需改动 core 字段。
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "source", rename_all = "camelCase")]
pub enum LogExtension {
    Edge(EdgeExt),
}

/// 端侧 logcat 扩展字段。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeExt {
    pub pid: u32,
    pub tid: u32,
    pub app_prefix: String,
    pub package_name: String,
    pub tag: String,
}

impl LogExtension {
    /// 关联键：云端接入后返回 Some(traceId)；端侧恒为 None。
    /// 这是决策④「有 traceId 用 traceId，否则用请求起始时间戳」的统一取键缝。
    pub fn trace_id(&self) -> Option<&str> {
        match self {
            LogExtension::Edge(_) => None,
        }
    }

    /// 应用标识：端侧为 app_prefix。
    pub fn app(&self) -> Option<&str> {
        match self {
            LogExtension::Edge(e) => Some(&e.app_prefix),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edge_has_app_and_no_trace_id() {
        let ext = LogExtension::Edge(EdgeExt {
            pid: 32033,
            tid: 32033,
            app_prefix: "A00010".to_string(),
            package_name: "com.demo.app".to_string(),
            tag: "Order".to_string(),
        });
        assert_eq!(ext.trace_id(), None);
        assert_eq!(ext.app(), Some("A00010"));
    }
}
