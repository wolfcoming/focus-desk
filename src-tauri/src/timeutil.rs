use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, NaiveDateTime};

pub fn now() -> DateTime<Local> {
    Local::now()
}

pub fn iso(dt: DateTime<Local>) -> String {
    dt.to_rfc3339()
}

pub fn now_iso() -> String {
    iso(now())
}

pub fn today_key(now: DateTime<Local>) -> String {
    now.format("%Y-%m-%d").to_string()
}

pub fn parse_stored(value: &str) -> Option<DateTime<Local>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.with_timezone(&Local))
}

pub fn parse_user_time(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("需要一个时间".into());
    }
    if let Some(dt) = parse_stored(value) {
        return Ok(iso(dt));
    }
    if let Ok(date) = NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        let naive = date
            .and_hms_opt(18, 0, 0)
            .ok_or("时间无效")?;
        return localize(naive);
    }
    let naive = NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M")
        .or_else(|_| NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S"))
        .map_err(|_| "时间格式无法识别".to_string())?;
    localize(naive)
}

fn localize(naive: NaiveDateTime) -> Result<String, String> {
    let dt = naive
        .and_local_timezone(Local)
        .single()
        .ok_or("这个时间在当前时区里无效")?;
    Ok(iso(dt))
}

pub fn at_clock(day: NaiveDate, hhmm: &str) -> Option<DateTime<Local>> {
    let (hour, minute) = hhmm.split_once(':')?;
    let hour: u32 = hour.parse().ok()?;
    let minute: u32 = minute.parse().ok()?;
    if hour > 23 || minute > 59 {
        return None;
    }
    day.and_hms_opt(hour, minute, 0)?
        .and_local_timezone(Local)
        .single()
}

pub fn valid_hhmm(value: &str) -> bool {
    let Some(day) = NaiveDate::from_ymd_opt(2026, 1, 1) else {
        return false;
    };
    at_clock(day, value).is_some()
}

pub fn runs_on(repeat_days: &str, now: DateTime<Local>) -> bool {
    let iso_day = now.weekday().number_from_monday().to_string();
    repeat_days
        .split(',')
        .any(|part| part.trim() == iso_day)
}

pub fn add_minutes(base: DateTime<Local>, minutes: i64) -> DateTime<Local> {
    base + Duration::minutes(minutes.max(1))
}

pub fn format_short(dt: DateTime<Local>) -> String {
    dt.format("%m-%d %H:%M").to_string()
}
