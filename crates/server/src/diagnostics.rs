use std::{
    fs, io,
    path::Path,
    time::{Duration, SystemTime},
};

use tracing_appender::{
    non_blocking::WorkerGuard,
    rolling::{RollingFileAppender, Rotation},
};
use tracing_subscriber::EnvFilter;

const LOG_PREFIX: &str = "log-analystic";
const LOG_SUFFIX: &str = "jsonl";
const RETENTION: Duration = Duration::from_secs(7 * 24 * 60 * 60);

/// Sets up the local daily JSONL diagnostic sink and returns the guard that
/// keeps its non-blocking writer alive.
pub fn init(log_dir: &Path) -> io::Result<WorkerGuard> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    init_with_filter(log_dir, filter)
}

fn init_with_filter(log_dir: &Path, filter: EnvFilter) -> io::Result<WorkerGuard> {
    fs::create_dir_all(log_dir)?;
    cleanup_old_logs(log_dir)?;

    let appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix(LOG_PREFIX)
        .filename_suffix(LOG_SUFFIX)
        .build(log_dir)
        .map_err(io::Error::other)?;
    let (writer, guard) = tracing_appender::non_blocking(appender);

    tracing_subscriber::fmt()
        .json()
        .with_current_span(true)
        .with_env_filter(filter)
        .with_writer(writer)
        .try_init()
        .map_err(io::Error::other)?;

    Ok(guard)
}

/// Initializes diagnostics at a caller-selected location for integration tests.
#[doc(hidden)]
pub fn init_for_test(log_dir: &Path) -> io::Result<WorkerGuard> {
    init_with_filter(log_dir, EnvFilter::new("info"))
}

/// Drops the worker after all queued log records have been written.
#[doc(hidden)]
pub fn flush(guard: WorkerGuard) {
    drop(guard);
}

fn cleanup_old_logs(log_dir: &Path) -> io::Result<()> {
    let now = SystemTime::now();

    for entry in fs::read_dir(log_dir)? {
        let entry = entry?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !entry.file_type()?.is_file()
            || !name.starts_with(&format!("{LOG_PREFIX}."))
            || !name.ends_with(&format!(".{LOG_SUFFIX}"))
        {
            continue;
        }

        let modified = entry.metadata()?.modified()?;
        if now.duration_since(modified).unwrap_or_default() > RETENTION {
            fs::remove_file(path)?;
        }
    }

    Ok(())
}

#[cfg(test)]
fn write_json_event(
    log_file: &Path,
    level: &str,
    request_id: &str,
    operation: &str,
) -> io::Result<()> {
    use std::io::Write;

    let timestamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string();
    let event = serde_json::json!({
        "level": level,
        "timestamp": timestamp,
        "requestId": request_id,
        "operation": operation,
    });
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_file)?;
    writeln!(file, "{event}")
}

#[cfg(test)]
mod tests {
    use super::{cleanup_old_logs, write_json_event};
    use std::{
        fs,
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    use serde_json::Value;

    fn temp_log_dir(label: &str) -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock after Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("log-analystic-{label}-{nonce}"));
        fs::create_dir_all(&path).expect("create temporary log directory");
        path
    }

    #[test]
    fn test_writer_emits_newline_delimited_json_with_diagnostic_fields() {
        let log_dir = temp_log_dir("json");
        let log_file = log_dir.join("events.jsonl");

        write_json_event(&log_file, "INFO", "request-123", "workspace.open")
            .expect("write info event");
        write_json_event(&log_file, "ERROR", "request-123", "workspace.open")
            .expect("write error event");

        let contents = fs::read_to_string(&log_file).expect("read event log");
        assert!(contents.ends_with('\n'));
        let events: Vec<Value> = contents
            .lines()
            .map(|line| serde_json::from_str(line).expect("each line is JSON"))
            .collect();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["level"], "INFO");
        assert_eq!(events[1]["level"], "ERROR");
        for event in events {
            assert!(event.get("timestamp").is_some());
            assert_eq!(event["requestId"], "request-123");
            assert_eq!(event["operation"], "workspace.open");
        }

        fs::remove_dir_all(log_dir).expect("remove temporary log directory");
    }

    #[test]
    fn cleanup_removes_log_files_older_than_seven_days_by_mtime() {
        let log_dir = temp_log_dir("retention");
        let stale = log_dir.join("log-analystic.2000-01-01.jsonl");
        let current = log_dir.join("log-analystic.2099-01-01.jsonl");
        fs::write(&stale, "stale").expect("write stale log");
        fs::write(&current, "current").expect("write current log");

        let old_time = SystemTime::now() - Duration::from_secs(8 * 24 * 60 * 60);
        fs::OpenOptions::new()
            .write(true)
            .open(&stale)
            .expect("open stale log for timestamp update")
            .set_times(fs::FileTimes::new().set_modified(old_time))
            .expect("set stale modification time");

        cleanup_old_logs(&log_dir).expect("clean old logs");

        assert!(!stale.exists());
        assert!(current.exists());

        fs::remove_dir_all(log_dir).expect("remove temporary log directory");
    }
}
