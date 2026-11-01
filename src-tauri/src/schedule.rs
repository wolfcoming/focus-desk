use std::path::Path;

use chrono::Duration;

use crate::db::{self, Item, ReminderView};
use crate::judge::{priority, InterruptClass};
use crate::timeutil::{self, now, parse_stored};

struct Candidate {
    class: InterruptClass,
    title: String,
    detail: String,
    item_id: Option<i64>,
    subproject_id: Option<i64>,
    rank: u8,
}

pub fn scan(path: &Path) -> Result<Option<ReminderView>, String> {
    let conn = db::open(path)?;
    scan_conn(&conn)
}

pub fn pending(path: &Path) -> Result<Option<ReminderView>, String> {
    let conn = db::open(path)?;
    let Some(reminder) = db::load_reminder(&conn)? else {
        return Ok(None);
    };
    if let Some(fired) = parse_stored(&reminder.fired_at) {
        if fired + Duration::hours(12) < now() {
            db::clear_reminder(&conn)?;
            return Ok(None);
        }
    }
    Ok(Some(reminder))
}

pub fn scan_conn(conn: &rusqlite::Connection) -> Result<Option<ReminderView>, String> {
    let moment = now();
    let active = db::load_reminder(conn)?;
    let mut best: Option<Candidate> = None;

    for item in db::work_items(conn)? {
        if let Some(class) = classify_item(conn, &item, moment)? {
            push_candidate(
                &mut best,
                class,
                item.title.clone(),
                item_detail(&item, class),
                Some(item.id),
                None,
            );
        }
    }

    for (id, name, touched, snooze) in db::active_subprojects_for_scan(conn)? {
        if snooze
            .as_deref()
            .and_then(parse_stored)
            .map(|until| until > moment)
            .unwrap_or(false)
        {
            continue;
        }
        let stale = parse_stored(&touched)
            .map(|touched_at| touched_at <= moment - Duration::days(3))
            .unwrap_or(false);
        if stale {
            push_candidate(
                &mut best,
                InterruptClass::Stall,
                name.clone(),
                format!("「{name}」已经连续 3 天没有动过下一步。"),
                None,
                Some(id),
            );
        }
    }

    let Some(candidate) = best else {
        return Ok(None);
    };
    if let Some(active) = &active {
        let same = active.class == candidate.class
            && active.item_id == candidate.item_id
            && active.subproject_id == candidate.subproject_id;
        if same || priority(candidate.class) <= priority(active.class) {
            return Ok(None);
        }
    }

    let reminder = ReminderView {
        class: candidate.class,
        title: candidate.title,
        detail: candidate.detail,
        item_id: candidate.item_id,
        subproject_id: candidate.subproject_id,
        fired_at: timeutil::now_iso(),
    };
    db::save_reminder(conn, &reminder)?;
    Ok(Some(reminder))
}

fn push_candidate(
    best: &mut Option<Candidate>,
    class: InterruptClass,
    title: String,
    detail: String,
    item_id: Option<i64>,
    subproject_id: Option<i64>,
) {
    let rank = priority(class);
    let replace = best.as_ref().map(|current| rank > current.rank).unwrap_or(true);
    if replace {
        *best = Some(Candidate { class, title, detail, item_id, subproject_id, rank });
    }
}

fn classify_item(
    conn: &rusqlite::Connection,
    item: &Item,
    moment: chrono::DateTime<chrono::Local>,
) -> Result<Option<InterruptClass>, String> {
    if let Some(until) = item.snooze_until.as_deref().and_then(parse_stored) {
        if until > moment {
            return Ok(None);
        }
    }
    match item.kind.as_str() {
        "task" => {
            if item.important != Some(true) {
                return Ok(None);
            }
            let Some(due) = item.due_at.as_deref().and_then(parse_stored) else {
                return Ok(None);
            };
            if due <= moment + Duration::minutes(30) {
                Ok(Some(InterruptClass::MustNow))
            } else if due.date_naive() == moment.date_naive() {
                Ok(Some(InterruptClass::Today))
            } else {
                Ok(None)
            }
        }
        "waiting" => {
            let Some(follow) = item.follow_up_at.as_deref().and_then(parse_stored) else {
                return Ok(None);
            };
            if follow <= moment {
                Ok(Some(InterruptClass::Today))
            } else {
                Ok(None)
            }
        }
        "daily" => classify_daily(conn, item, moment),
        _ => Ok(None),
    }
}

fn classify_daily(
    conn: &rusqlite::Connection,
    item: &Item,
    moment: chrono::DateTime<chrono::Local>,
) -> Result<Option<InterruptClass>, String> {
    if !timeutil::runs_on(item.repeat_days.as_deref().unwrap_or(""), moment) {
        return Ok(None);
    }
    let day = timeutil::today_key(moment);
    if db::daily_done_today(conn, item.id, &day)? {
        return Ok(None);
    }
    let Some(start) = item.window_start.as_deref().and_then(|value| timeutil::at_clock(moment.date_naive(), value)) else {
        return Ok(None);
    };
    let Some(end) = item.window_end.as_deref().and_then(|value| timeutil::at_clock(moment.date_naive(), value)) else {
        return Ok(None);
    };
    let grace_end = end + Duration::minutes(item.grace_min.unwrap_or(0));
    if moment < start {
        Ok(None)
    } else if moment <= end {
        Ok(Some(InterruptClass::DailySoft))
    } else if moment <= grace_end {
        Ok(None)
    } else if item.interrupt_after_grace {
        Ok(Some(InterruptClass::DailyGrace))
    } else {
        Ok(Some(InterruptClass::DailyGraceQuiet))
    }
}

fn item_detail(item: &Item, class: InterruptClass) -> String {
    match class {
        InterruptClass::MustNow => match item.due_at.as_deref().and_then(parse_stored) {
            Some(due) => format!("截止 {}。这件重要，而且已经到了该动手的时间。", timeutil::format_short(due)),
            None => "这件重要，而且已经到了该动手的时间。".into(),
        },
        InterruptClass::Today if item.kind == "waiting" => {
            format!("跟进时间到了。在等：{}", item.waiting_on.as_deref().unwrap_or("外部回复"))
        }
        InterruptClass::Today => match item.due_at.as_deref().and_then(parse_stored) {
            Some(due) => format!("这件重要，截止是 {}，还没到最后半小时。", timeutil::format_short(due)),
            None => "这件今天要处理。".into(),
        },
        InterruptClass::DailySoft => format!(
            "到了时间窗 {}–{}。先不用切换。",
            item.window_start.as_deref().unwrap_or(""),
            item.window_end.as_deref().unwrap_or("")
        ),
        InterruptClass::DailyGrace => "已经过了宽限。这件允许打断手头的不重要工作。".into(),
        InterruptClass::DailyGraceQuiet => "已经过了宽限。这件不要求打断正在做的重要工作。".into(),
        InterruptClass::Stall => String::new(),
    }
}
