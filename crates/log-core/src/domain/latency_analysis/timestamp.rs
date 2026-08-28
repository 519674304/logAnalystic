//! 时延分析专用时间戳解析：`YYYY-MM-DD HH:MM:SS[.mmm]` → 距 Unix 纪元的毫秒数。
//!
//! 不引入 chrono，用 Gregorian 历法的 `days_from_civil` 精确计算天数；
//! 解析结果只用于同一分析时间窗内求时延差值，不涉及时区换算。

/// 把日志时间戳解析为毫秒数；格式非法（字段缺失、非数字、越界）返回 `None`。
pub fn timestamp_to_ms(s: &str) -> Option<i64> {
    let s = s.trim();
    let (date, time) = s.split_once(' ')?;

    let mut dp = date.split('-');
    let year: i64 = dp.next()?.parse().ok()?;
    let month: i64 = dp.next()?.parse().ok()?;
    let day: i64 = dp.next()?.parse().ok()?;
    if dp.next().is_some() {
        return None;
    }

    // 可选毫秒：`.mmm` 右补零到 3 位（`.1` = 100ms）。
    let (time_part, millis) = match time.split_once('.') {
        Some((t, m)) => {
            let m = m.trim();
            if m.is_empty() || m.len() > 3 || !m.chars().all(|c| c.is_ascii_digit()) {
                return None;
            }
            let padded = format!("{m:0<3}");
            (t, padded.parse::<i64>().ok()?)
        }
        None => (time, 0),
    };

    let mut tp = time_part.split(':');
    let hour: i64 = tp.next()?.parse().ok()?;
    let minute: i64 = tp.next()?.parse().ok()?;
    let second: i64 = tp.next()?.parse().ok()?;
    if tp.next().is_some() {
        return None;
    }

    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || !(0..=23).contains(&hour)
        || !(0..=59).contains(&minute)
        || !(0..=60).contains(&second)
    {
        return None;
    }

    let days = days_from_civil(year, month, day);
    Some(days * 86_400_000 + hour * 3_600_000 + minute * 60_000 + second * 1000 + millis)
}

/// Howard Hinnant 的 `days_from_civil`：精确覆盖 Gregorian 历法的天数差。
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400; // [0, 399]
    let mp = (m + 9) % 12; // 3 月 = 0
    let doy = (153 * mp + 2) / 5 + d - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    era * 146_097 + doe - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_with_millis() {
        let a = timestamp_to_ms("2026-07-05 10:00:00.000").unwrap();
        let b = timestamp_to_ms("2026-07-05 10:00:00.100").unwrap();
        assert_eq!(b - a, 100);
    }

    #[test]
    fn parses_without_millis() {
        assert_eq!(
            timestamp_to_ms("2026-07-05 10:00:00").unwrap(),
            timestamp_to_ms("2026-07-05 10:00:00.000").unwrap(),
        );
    }

    #[test]
    fn spans_seconds_and_days() {
        let a = timestamp_to_ms("2026-07-05 10:00:00.000").unwrap();
        let b = timestamp_to_ms("2026-07-05 10:00:01.000").unwrap();
        assert_eq!(b - a, 1000);
        let c = timestamp_to_ms("2026-07-06 10:00:00.000").unwrap();
        assert_eq!(c - a, 86_400_000);
    }

    #[test]
    fn rejects_invalid() {
        assert!(timestamp_to_ms("not a timestamp").is_none());
        assert!(timestamp_to_ms("").is_none());
        assert!(timestamp_to_ms("2026-13-40 99:99:99").is_none());
    }
}
