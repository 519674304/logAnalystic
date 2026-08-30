//! marker 匹配器：keyword（大小写不敏感包含）或 regex。

use regex::Regex;

use crate::domain::latency_analysis::spec::{Marker, MarkerMode};

pub enum MarkerMatcher {
    Keyword { needle_lower: String },
    Regex(Regex),
}

impl MarkerMatcher {
    pub fn build(marker: &Marker) -> Result<Self, String> {
        match marker.mode {
            MarkerMode::Keyword => Ok(MarkerMatcher::Keyword {
                needle_lower: marker.pattern.to_lowercase(),
            }),
            MarkerMode::Regex => Regex::new(&marker.pattern)
                .map(MarkerMatcher::Regex)
                .map_err(|e| format!("正则表达式无效: {e}")),
        }
    }

    pub fn matches(&self, line: &str) -> bool {
        match self {
            MarkerMatcher::Keyword { needle_lower } => {
                line.to_lowercase().contains(needle_lower.as_str())
            }
            MarkerMatcher::Regex(re) => re.is_match(line),
        }
    }
}
