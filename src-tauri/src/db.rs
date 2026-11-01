use chrono::Duration;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::judge::{
    class_name, parse_class, verdict_name, CurrentWork, InterruptClass, Judgment, Verdict,
};
use crate::timeutil::{self, now, parse_stored};

pub const PROJECT_CAP: i64 = 3;
pub const SUBPROJECT_CAP: i64 = 5;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub outcome: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Subproject {
    pub id: i64,
    pub project_id: i64,
    pub project_name: String,
    pub name: String,
    pub done_criteria: String,
    pub target_date: Option<String>,
    pub status: String,
    pub last_touched_at: String,
    pub next_title: Option<String>,
    pub kind: String,
    pub progress: String,
    pub important: Option<bool>,
    pub due_at: Option<String>,
    pub repeat_days: Option<String>,
    pub remind_at: Option<String>,
    pub progress_percent: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkLog {
    pub id: i64,
    pub subproject_id: i64,
    pub body: String,
    pub progress: String,
    pub progress_percent: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: i64,
    pub kind: String,
    pub title: String,
    pub notes: String,
    pub project_id: Option<i64>,
    pub subproject_id: Option<i64>,
    pub project_name: Option<String>,
    pub subproject_name: Option<String>,
    pub important: Option<bool>,
    pub due_at: Option<String>,
    pub estimate_min: Option<i64>,
    pub status: String,
    pub repeat_days: Option<String>,
    pub window_start: Option<String>,
    pub window_end: Option<String>,
    pub grace_min: Option<i64>,
    pub interrupt_after_grace: bool,
    pub waiting_on: Option<String>,
    pub follow_up_at: Option<String>,
    pub started_at: Option<String>,
    pub snooze_until: Option<String>,
    pub quadrant: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyView {
    pub item: Item,
    pub state: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggested {
    pub item: Item,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayBoard {
    pub day: String,
    pub slots: Vec<Item>,
    pub dailies: Vec<DailyView>,
    pub chores: Vec<Item>,
    pub suggestions: Vec<Suggested>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverrideNote {
    pub created_at: String,
    pub raw_text: String,
    pub reason: String,
    pub verdict: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyPacket {
    pub inbox: Vec<Item>,
    pub stale: Vec<Subproject>,
    pub follow_ups: Vec<Item>,
    pub undated_important: Vec<Item>,
    pub overrides: Vec<OverrideNote>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub active_projects: i64,
    pub active_subprojects: i64,
    pub project_cap: i64,
    pub subproject_cap: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderView {
    pub class: InterruptClass,
    pub title: String,
    pub detail: String,
    pub item_id: Option<i64>,
    pub subproject_id: Option<i64>,
    pub fired_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemDraft {
    pub id: Option<i64>,
    pub kind: String,
    pub title: String,
    pub notes: String,
    pub project_id: Option<i64>,
    pub subproject_id: Option<i64>,
    pub important: Option<bool>,
    pub due_at: Option<String>,
    pub estimate_min: Option<i64>,
    pub repeat_days: Option<String>,
    pub window_start: Option<String>,
    pub window_end: Option<String>,
    pub grace_min: Option<i64>,
    pub interrupt_after_grace: bool,
    pub waiting_on: Option<String>,
    pub follow_up_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewProject {
    pub name: String,
    pub outcome: String,
    pub status: String,
    pub pause_project_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSubproject {
    pub project_id: i64,
    pub kind: String,
    pub name: String,
    pub important: bool,
    pub progress: String,
    pub due_at: Option<String>,
    pub repeat_days: Option<String>,
    pub remind: bool,
    pub remind_at: Option<String>,
    pub progress_percent: Option<i64>,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('upcoming','active','paused','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subprojects (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  done_criteria TEXT NOT NULL DEFAULT '',
  target_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','paused','done','archived')),
  last_touched_at TEXT NOT NULL,
  stall_snooze_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('inbox','task','daily','waiting','someday')),
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  project_id INTEGER REFERENCES projects(id),
  subproject_id INTEGER REFERENCES subprojects(id),
  important INTEGER,
  due_at TEXT,
  estimate_min INTEGER,
  status TEXT NOT NULL CHECK (status IN ('inbox','open','doing','done','dropped')),
  repeat_days TEXT,
  window_start TEXT,
  window_end TEXT,
  grace_min INTEGER,
  interrupt_after_grace INTEGER NOT NULL DEFAULT 0,
  waiting_on TEXT,
  follow_up_at TEXT,
  started_at TEXT,
  snooze_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS today_slots (
  day TEXT NOT NULL,
  position INTEGER NOT NULL,
  item_id INTEGER NOT NULL REFERENCES items(id),
  PRIMARY KEY (day, position)
);
CREATE TABLE IF NOT EXISTS daily_marks (
  item_id INTEGER NOT NULL REFERENCES items(id),
  day TEXT NOT NULL,
  state TEXT NOT NULL,
  PRIMARY KEY (item_id, day)
);
CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  matched_item_id INTEGER,
  incoming_item_id INTEGER,
  incoming_class TEXT NOT NULL,
  verdict TEXT NOT NULL,
  reason TEXT NOT NULL,
  accepted INTEGER NOT NULL,
  snooze_min INTEGER,
  match_source TEXT NOT NULL DEFAULT 'rules'
);
CREATE TABLE IF NOT EXISTS work_logs (
  id INTEGER PRIMARY KEY,
  subproject_id INTEGER NOT NULL REFERENCES subprojects(id),
  body TEXT NOT NULL,
  progress TEXT NOT NULL,
  progress_percent INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminder_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  class TEXT NOT NULL,
  item_id INTEGER,
  subproject_id INTEGER,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  fired_at TEXT NOT NULL
);
"#;

const ITEM_SELECT: &str = "
SELECT i.id, i.kind, i.title, i.notes, i.project_id, i.subproject_id,
       i.important, i.due_at, i.estimate_min, i.status,
       i.repeat_days, i.window_start, i.window_end, i.grace_min, i.interrupt_after_grace,
       i.waiting_on, i.follow_up_at, i.started_at, i.snooze_until,
       i.created_at, i.updated_at, i.completed_at,
       p.name, s.name
FROM items i
LEFT JOIN projects p ON p.id = i.project_id
LEFT JOIN subprojects s ON s.id = i.subproject_id
";

pub fn open(path: &std::path::Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let conn = Connection::open(path).map_err(|err| err.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|err| err.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|err| err.to_string())?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(SCHEMA).map_err(|err| err.to_string())?;
    ensure_column(conn, "subprojects", "kind", "TEXT NOT NULL DEFAULT 'regular'")?;
    ensure_column(conn, "subprojects", "progress", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(conn, "subprojects", "progress_percent", "INTEGER")?;
    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<(), String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|err| err.to_string())?;
    let names = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    if names.iter().any(|name| name == column) {
        return Ok(());
    }
    conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"), [])
        .map(|_| ())
        .map_err(|err| err.to_string())
}

const SUB_FROM: &str = "
SELECT s.id, s.project_id, p.name, s.name, s.done_criteria, s.target_date, s.status, s.last_touched_at,
       (SELECT i.title FROM items i WHERE i.subproject_id = s.id AND i.kind = 'task' AND i.status IN ('open','doing') ORDER BY CASE i.status WHEN 'doing' THEN 0 ELSE 1 END, i.id LIMIT 1),
       COALESCE(s.kind, 'regular'),
       COALESCE(s.progress, ''),
       (SELECT i.important FROM items i WHERE i.subproject_id = s.id AND i.kind = 'task' ORDER BY i.id LIMIT 1),
       (SELECT i.due_at FROM items i WHERE i.subproject_id = s.id AND i.kind = 'task' ORDER BY i.id LIMIT 1),
       (SELECT i.repeat_days FROM items i WHERE i.subproject_id = s.id AND i.kind = 'daily' ORDER BY i.id LIMIT 1),
       (SELECT i.window_start FROM items i WHERE i.subproject_id = s.id AND i.kind = 'daily' ORDER BY i.id LIMIT 1),
       s.progress_percent
FROM subprojects s
JOIN projects p ON p.id = s.project_id
";

pub fn list_projects(conn: &Connection) -> Result<Vec<Project>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, outcome, status, created_at, updated_at
             FROM projects
             ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, id DESC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], map_project)
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())
}

pub fn create_project(conn: &Connection, input: &NewProject) -> Result<Project, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("大项目需要一个名称".into());
    }
    if !matches!(input.status.as_str(), "upcoming" | "active" | "paused") {
        return Err("新建时只能是即将开始、进行中或暂停".into());
    }
    let _ = input.pause_project_id;
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    let stamp = timeutil::now_iso();
    tx.execute(
        "INSERT INTO projects (name, outcome, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        params![name, input.outcome.trim(), input.status, stamp],
    )
    .map_err(|err| err.to_string())?;
    let id = tx.last_insert_rowid();
    tx.commit().map_err(|err| err.to_string())?;
    get_project(conn, id)
}

pub fn set_project_status(
    conn: &Connection,
    id: i64,
    status: &str,
    pause_project_id: Option<i64>,
) -> Result<Project, String> {
    if !matches!(status, "upcoming" | "active" | "paused" | "archived") {
        return Err("状态无效".into());
    }
    let _ = pause_project_id;
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    let stamp = timeutil::now_iso();
    let changed = tx
        .execute(
            "UPDATE projects SET status = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, status, stamp],
        )
        .map_err(|err| err.to_string())?;
    if changed != 1 {
        return Err("找不到这个大项目".into());
    }
    if matches!(status, "paused" | "archived") {
        tx.execute(
            "UPDATE subprojects SET status = 'paused', updated_at = ?2 WHERE project_id = ?1 AND status = 'active'",
            params![id, stamp],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())?;
    get_project(conn, id)
}

pub fn list_subprojects(conn: &Connection, project_id: Option<i64>) -> Result<Vec<Subproject>, String> {
    let sql = format!(
        "{SUB_FROM} WHERE (?1 IS NULL OR s.project_id = ?1)
         ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, s.id DESC"
    );
    let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![project_id], map_subproject)
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())
}

pub fn create_subproject(conn: &Connection, input: &NewSubproject) -> Result<Subproject, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("子任务需要一个名称".into());
    }
    let kind = match input.kind.as_str() {
        "regular" | "periodic" => input.kind.as_str(),
        _ => return Err("子任务只能是常规任务或周期性任务".into()),
    };
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    let project = get_project(&tx, input.project_id)?;
    if project.status == "archived" {
        return Err("这个大项目已经归档".into());
    }
    let stamp = timeutil::now_iso();
    let progress_percent = if kind == "regular" && input.progress == "doing" {
        match input.progress_percent {
            Some(value) if (0..=100).contains(&value) => Some(value),
            Some(_) => return Err("进行中的进度要在 0 到 100 之间".into()),
            None => None,
        }
    } else {
        None
    };
    let (status, progress) = if kind == "periodic" {
        ("active", String::new())
    } else {
        match input.progress.as_str() {
            "not_started" => ("paused", "not_started".to_string()),
            "doing" => ("active", "doing".to_string()),
            "done" => ("done", "done".to_string()),
            _ => return Err("进度只能是未开始、进行中或已完成".into()),
        }
    };
    if kind == "regular" && progress == "doing" && project.status != "active" {
        tx.execute(
            "UPDATE projects SET status = 'active', updated_at = ?2 WHERE id = ?1",
            params![project.id, stamp],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.execute(
        "INSERT INTO subprojects (project_id, name, done_criteria, target_date, status, last_touched_at, created_at, updated_at, kind, progress, progress_percent)
         VALUES (?1, ?2, '', NULL, ?3, ?4, ?4, ?4, ?5, ?6, ?7)",
        params![input.project_id, name, status, stamp, kind, progress, progress_percent],
    )
    .map_err(|err| err.to_string())?;
    let sub_id = tx.last_insert_rowid();
    if kind == "periodic" {
        let repeat = normalize_repeat(input.repeat_days.as_deref())?;
        let (window_start, window_end, grace) = if input.remind {
            let start = input.remind_at.as_deref().unwrap_or("").trim();
            if !timeutil::valid_hhmm(start) {
                return Err("打开定时提醒后，要选一个时间".into());
            }
            let end = remind_window_end(start);
            (Some(start.to_string()), Some(end), Some(12 * 60))
        } else {
            (None, None, None)
        };
        tx.execute(
            "INSERT INTO items (kind, title, notes, project_id, subproject_id, status, repeat_days, window_start, window_end, grace_min, interrupt_after_grace, created_at, updated_at)
             VALUES ('daily', ?1, '', ?2, ?3, 'open', ?4, ?5, ?6, ?7, 0, ?8, ?8)",
            params![name, input.project_id, sub_id, repeat, window_start, window_end, grace, stamp],
        )
        .map_err(|err| err.to_string())?;
    } else {
        let due = normalize_optional(input.due_at.as_deref())?;
        let item_status = if progress == "done" { "done" } else { "open" };
        let completed = if progress == "done" { Some(stamp.as_str()) } else { None };
        tx.execute(
            "INSERT INTO items (kind, title, notes, project_id, subproject_id, important, due_at, estimate_min, status, interrupt_after_grace, created_at, updated_at, completed_at)
             VALUES ('task', ?1, '', ?2, ?3, ?4, ?5, 25, ?6, 0, ?7, ?7, ?8)",
            params![name, input.project_id, sub_id, bool_int(input.important), due, item_status, stamp, completed],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())?;
    get_subproject(conn, sub_id)
}

fn normalize_repeat(value: Option<&str>) -> Result<String, String> {
    let days = value
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|day| matches!(*day, "1" | "2" | "3" | "4" | "5" | "6" | "7"))
        .collect::<Vec<_>>();
    if days.is_empty() {
        return Err("周期性任务要选重复日期".into());
    }
    Ok(days.join(","))
}

fn remind_window_end(start: &str) -> String {
    let mut parts = start.split(':');
    let hour: u32 = parts.next().unwrap_or("0").parse().unwrap_or(0);
    let minute: u32 = parts.next().unwrap_or("0").parse().unwrap_or(0);
    let total = hour * 60 + minute + 30;
    if total >= 24 * 60 {
        return "23:59".into();
    }
    format!("{:02}:{:02}", total / 60, total % 60)
}

pub fn set_subproject_status(
    conn: &Connection,
    id: i64,
    status: &str,
    pause_subproject_id: Option<i64>,
) -> Result<Subproject, String> {
    if !matches!(status, "active" | "paused" | "done" | "archived") {
        return Err("状态无效".into());
    }
    let _ = pause_subproject_id;
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    if status == "active" {
        let kind: String = tx
            .query_row(
                "SELECT COALESCE(kind, 'regular') FROM subprojects WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|_| "找不到这个子任务".to_string())?;
        if kind != "periodic" {
            let open_tasks: i64 = tx
                .query_row(
                    "SELECT COUNT(*) FROM items WHERE subproject_id = ?1 AND kind = 'task' AND status IN ('open','doing')",
                    params![id],
                    |row| row.get(0),
                )
                .map_err(|err| err.to_string())?;
            if open_tasks == 0 {
                return Err("进行中的子任务要有一个下一步".into());
            }
        }
    }
    let stamp = timeutil::now_iso();
    let changed = tx
        .execute(
            "UPDATE subprojects SET status = ?2, updated_at = ?3, last_touched_at = ?3 WHERE id = ?1",
            params![id, status, stamp],
        )
        .map_err(|err| err.to_string())?;
    if changed != 1 {
        return Err("找不到这个子任务".into());
    }
    tx.commit().map_err(|err| err.to_string())?;
    get_subproject(conn, id)
}

pub fn set_subproject_progress(
    conn: &Connection,
    id: i64,
    progress: &str,
    progress_percent: Option<i64>,
    log: Option<&str>,
) -> Result<Subproject, String> {
    if !matches!(progress, "not_started" | "doing" | "done") {
        return Err("进度只能是未开始、进行中或已完成".into());
    }
    let progress_percent = if progress == "doing" {
        match progress_percent {
            Some(value) if (0..=100).contains(&value) => Some(value),
            Some(_) => return Err("进行中的进度要在 0 到 100 之间".into()),
            None => None,
        }
    } else {
        None
    };
    let status = match progress {
        "not_started" => "paused",
        "doing" => "active",
        "done" => "done",
        _ => unreachable!(),
    };
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    let (kind, sub_status, project_id): (String, String, i64) = tx
        .query_row(
            "SELECT COALESCE(kind, 'regular'), status, project_id FROM subprojects WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "找不到这个子任务".to_string())?;
    if kind == "periodic" {
        return Err("周期性任务没有进度".into());
    }
    if sub_status == "archived" {
        return Err("这个子任务已经归档".into());
    }
    let project = get_project(&tx, project_id)?;
    if project.status == "archived" {
        return Err("这个大项目已经归档".into());
    }
    let stamp = timeutil::now_iso();
    if progress == "doing" && project.status != "active" {
        tx.execute(
            "UPDATE projects SET status = 'active', updated_at = ?2 WHERE id = ?1",
            params![project.id, stamp],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.execute(
        "UPDATE subprojects SET status = ?2, progress = ?3, progress_percent = ?4, updated_at = ?5, last_touched_at = ?5 WHERE id = ?1",
        params![id, status, progress, progress_percent, stamp],
    )
    .map_err(|err| err.to_string())?;
    if progress == "done" {
        tx.execute(
            "UPDATE items SET status = 'done', completed_at = COALESCE(completed_at, ?2), updated_at = ?2, snooze_until = NULL
             WHERE subproject_id = ?1 AND kind = 'task' AND status IN ('open','doing')",
            params![id, stamp],
        )
        .map_err(|err| err.to_string())?;
    } else {
        let open: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM items WHERE subproject_id = ?1 AND kind = 'task' AND status IN ('open','doing')",
                params![id],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())?;
        if open == 0 {
            tx.execute(
                "UPDATE items SET status = 'open', completed_at = NULL, updated_at = ?2, snooze_until = NULL
                 WHERE id = (
                   SELECT id FROM items WHERE subproject_id = ?1 AND kind = 'task' AND status = 'done'
                   ORDER BY id LIMIT 1
                 )",
                params![id, stamp],
            )
            .map_err(|err| err.to_string())?;
        }
    }
    let body = log.unwrap_or("").trim();
    if !body.is_empty() {
        tx.execute(
            "INSERT INTO work_logs (subproject_id, body, progress, progress_percent, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, body, progress, progress_percent, stamp],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())?;
    get_subproject(conn, id)
}

pub fn list_work_logs(conn: &Connection, project_id: Option<i64>) -> Result<Vec<WorkLog>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT w.id, w.subproject_id, w.body, w.progress, w.progress_percent, w.created_at
             FROM work_logs w
             JOIN subprojects s ON s.id = w.subproject_id
             WHERE (?1 IS NULL OR s.project_id = ?1)
             ORDER BY w.id DESC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok(WorkLog {
                id: row.get(0)?,
                subproject_id: row.get(1)?,
                body: row.get(2)?,
                progress: row.get(3)?,
                progress_percent: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())
}

fn purge_items(conn: &Connection, id_query: &str, id: i64) -> Result<(), String> {
    let run = |sql: String| conn.execute(&sql, params![id]).map(|_| ()).map_err(|err| err.to_string());
    run(format!("DELETE FROM today_slots WHERE item_id IN ({id_query})"))?;
    run(format!("DELETE FROM daily_marks WHERE item_id IN ({id_query})"))?;
    run(format!("UPDATE activity_logs SET matched_item_id = NULL WHERE matched_item_id IN ({id_query})"))?;
    run(format!("UPDATE activity_logs SET incoming_item_id = NULL WHERE incoming_item_id IN ({id_query})"))?;
    run(format!("DELETE FROM reminder_state WHERE item_id IN ({id_query})"))?;
    run(format!("DELETE FROM items WHERE id IN ({id_query})"))
}

pub fn delete_subproject(conn: &Connection, id: i64) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    let found: i64 = tx
        .query_row("SELECT COUNT(*) FROM subprojects WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|err| err.to_string())?;
    if found != 1 {
        return Err("找不到这个子任务".into());
    }
    purge_items(&tx, "SELECT id FROM items WHERE subproject_id = ?1", id)?;
    tx.execute("DELETE FROM work_logs WHERE subproject_id = ?1", params![id])
        .map_err(|err| err.to_string())?;
    tx.execute("DELETE FROM reminder_state WHERE subproject_id = ?1", params![id])
        .map_err(|err| err.to_string())?;
    tx.execute("DELETE FROM subprojects WHERE id = ?1", params![id])
        .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(())
}

pub fn delete_project(conn: &Connection, id: i64) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    let found: i64 = tx
        .query_row("SELECT COUNT(*) FROM projects WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|err| err.to_string())?;
    if found != 1 {
        return Err("找不到这个大项目".into());
    }
    purge_items(
        &tx,
        "SELECT id FROM items WHERE project_id = ?1 OR subproject_id IN (SELECT id FROM subprojects WHERE project_id = ?1)",
        id,
    )?;
    tx.execute(
        "DELETE FROM reminder_state WHERE subproject_id IN (SELECT id FROM subprojects WHERE project_id = ?1)",
        params![id],
    )
    .map_err(|err| err.to_string())?;
    tx.execute(
        "DELETE FROM work_logs WHERE subproject_id IN (SELECT id FROM subprojects WHERE project_id = ?1)",
        params![id],
    )
    .map_err(|err| err.to_string())?;
    tx.execute("DELETE FROM subprojects WHERE project_id = ?1", params![id])
        .map_err(|err| err.to_string())?;
    tx.execute("DELETE FROM projects WHERE id = ?1", params![id])
        .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(())
}

pub fn capture(conn: &Connection, title: &str) -> Result<Item, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("先写一句话".into());
    }
    let stamp = timeutil::now_iso();
    conn.execute(
        "INSERT INTO items (kind, title, notes, status, interrupt_after_grace, created_at, updated_at)
         VALUES ('inbox', ?1, '', 'inbox', 0, ?2, ?2)",
        params![title, stamp],
    )
    .map_err(|err| err.to_string())?;
    get_item(conn, conn.last_insert_rowid())
}

pub fn save_item(conn: &Connection, draft: &ItemDraft) -> Result<Item, String> {
    let title = draft.title.trim();
    if title.is_empty() {
        return Err("需要一个标题".into());
    }
    let mut prepared = prepare_draft(conn, draft, title)?;
    if let Some(id) = draft.id {
        if let Ok(existing) = get_item(conn, id) {
            if existing.status == "doing" && prepared.kind == "task" {
                prepared.status = "doing".into();
            }
        }
    }
    let stamp = timeutil::now_iso();
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    if prepared.kind == "task" && prepared.subproject_id.is_none() {
        let project_id = prepared.project_id.ok_or("项目任务要挂在大项目上")?;
        let project = get_project(&tx, project_id)?;
        if project.status == "archived" {
            return Err("这个大项目已经归档".into());
        }
        if project.status != "active" {
            tx.execute(
                "UPDATE projects SET status = 'active', updated_at = ?2 WHERE id = ?1",
                params![project_id, stamp],
            )
            .map_err(|err| err.to_string())?;
        }
        tx.execute(
            "INSERT INTO subprojects (project_id, name, done_criteria, target_date, status, last_touched_at, created_at, updated_at, kind, progress, progress_percent)
             VALUES (?1, ?2, '', NULL, 'active', ?3, ?3, ?3, 'regular', 'doing', NULL)",
            params![project_id, prepared.title, stamp],
        )
        .map_err(|err| err.to_string())?;
        prepared.subproject_id = Some(tx.last_insert_rowid());
    }
    if prepared.kind == "task" {
        if let Some(sub_id) = prepared.subproject_id {
            activate_subproject(&tx, sub_id)?;
        }
    }
    let id = if let Some(id) = draft.id {
        let changed = tx
            .execute(
                "UPDATE items SET kind=?2, title=?3, notes=?4, project_id=?5, subproject_id=?6, important=?7,
                 due_at=?8, estimate_min=?9, status=?10, repeat_days=?11, window_start=?12, window_end=?13,
                 grace_min=?14, interrupt_after_grace=?15, waiting_on=?16, follow_up_at=?17, updated_at=?18, snooze_until=NULL
                 WHERE id=?1",
                params![
                    id, prepared.kind, prepared.title, prepared.notes, prepared.project_id, prepared.subproject_id,
                    prepared.important, prepared.due_at, prepared.estimate_min, prepared.status, prepared.repeat_days,
                    prepared.window_start, prepared.window_end, prepared.grace_min, prepared.interrupt, prepared.waiting_on,
                    prepared.follow_up_at, stamp
                ],
            )
            .map_err(|err| err.to_string())?;
        if changed != 1 {
            return Err("找不到这条记录".into());
        }
        id
    } else {
        tx.execute(
            "INSERT INTO items (kind, title, notes, project_id, subproject_id, important, due_at, estimate_min, status,
             repeat_days, window_start, window_end, grace_min, interrupt_after_grace, waiting_on, follow_up_at, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?17)",
            params![
                prepared.kind, prepared.title, prepared.notes, prepared.project_id, prepared.subproject_id,
                prepared.important, prepared.due_at, prepared.estimate_min, prepared.status, prepared.repeat_days,
                prepared.window_start, prepared.window_end, prepared.grace_min, prepared.interrupt, prepared.waiting_on,
                prepared.follow_up_at, stamp
            ],
        )
        .map_err(|err| err.to_string())?;
        tx.last_insert_rowid()
    };
    if let Some(sub_id) = prepared.subproject_id {
        touch_subproject_tx(&tx, sub_id, &stamp)?;
    }
    tx.commit().map_err(|err| err.to_string())?;
    get_item(conn, id)
}

pub fn list_items(conn: &Connection, kind: Option<&str>) -> Result<Vec<Item>, String> {
    let sql = format!("{ITEM_SELECT} WHERE (?1 IS NULL OR i.kind = ?1) AND i.status != 'dropped' ORDER BY i.id DESC");
    let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![kind], map_item)
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())
}

pub fn get_item(conn: &Connection, id: i64) -> Result<Item, String> {
    let sql = format!("{ITEM_SELECT} WHERE i.id = ?1");
    conn.query_row(&sql, params![id], map_item)
        .map_err(|_| "找不到这条记录".to_string())
}

pub fn complete_task(conn: &Connection, id: i64) -> Result<Item, String> {
    let item = get_item(conn, id)?;
    if item.kind == "daily" {
        return complete_daily(conn, id);
    }
    let stamp = timeutil::now_iso();
    conn.execute(
        "UPDATE items SET status = 'done', completed_at = ?2, updated_at = ?2, snooze_until = NULL WHERE id = ?1",
        params![id, stamp],
    )
    .map_err(|err| err.to_string())?;
    if let Some(sub_id) = item.subproject_id {
        touch_subproject(conn, sub_id)?;
    }
    get_item(conn, id)
}

pub fn complete_daily(conn: &Connection, id: i64) -> Result<Item, String> {
    let day = timeutil::today_key(now());
    conn.execute(
        "INSERT INTO daily_marks (item_id, day, state) VALUES (?1, ?2, 'done')
         ON CONFLICT(item_id, day) DO UPDATE SET state = 'done'",
        params![id, day],
    )
    .map_err(|err| err.to_string())?;
    snooze_item(conn, id, 12 * 60)?;
    get_item(conn, id)
}

pub fn drop_item(conn: &Connection, id: i64) -> Result<(), String> {
    let stamp = timeutil::now_iso();
    let changed = conn
        .execute(
            "UPDATE items SET status = 'dropped', updated_at = ?2, snooze_until = NULL WHERE id = ?1",
            params![id, stamp],
        )
        .map_err(|err| err.to_string())?;
    if changed != 1 {
        return Err("找不到这条记录".into());
    }
    Ok(())
}

pub fn start_item(conn: &Connection, id: i64) -> Result<Item, String> {
    let item = get_item(conn, id)?;
    if item.kind != "task" {
        return Err("只有项目任务可以标成正在做".into());
    }
    let stamp = timeutil::now_iso();
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    tx.execute(
        "UPDATE items SET status = 'open', updated_at = ?1 WHERE status = 'doing' AND id != ?2",
        params![stamp, id],
    )
    .map_err(|err| err.to_string())?;
    let changed = tx
        .execute(
            "UPDATE items SET status = 'doing', started_at = COALESCE(started_at, ?2), updated_at = ?2, snooze_until = NULL
             WHERE id = ?1 AND status != 'done' AND status != 'dropped'",
            params![id, stamp],
        )
        .map_err(|err| err.to_string())?;
    if changed != 1 {
        return Err("这条任务不能开始".into());
    }
    if let Some(sub_id) = item.subproject_id {
        touch_subproject_tx(&tx, sub_id, &stamp)?;
    }
    tx.commit().map_err(|err| err.to_string())?;
    get_item(conn, id)
}

pub fn set_today(conn: &Connection, ids: &[i64]) -> Result<(), String> {
    if ids.len() > 3 {
        return Err("今日项目重点最多 3 件".into());
    }
    let day = timeutil::today_key(now());
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    tx.execute("DELETE FROM today_slots WHERE day = ?1", params![day])
        .map_err(|err| err.to_string())?;
    for (index, id) in ids.iter().enumerate() {
        let item = get_item(&tx, *id)?;
        if item.kind != "task" || matches!(item.status.as_str(), "done" | "dropped" | "inbox") {
            return Err("今日三件只能是未完成的项目任务".into());
        }
        tx.execute(
            "INSERT INTO today_slots (day, position, item_id) VALUES (?1, ?2, ?3)",
            params![day, (index as i64) + 1, id],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())?;
    Ok(())
}

pub fn today_board(conn: &Connection) -> Result<TodayBoard, String> {
    let moment = now();
    let day = timeutil::today_key(moment);
    let mut stmt = conn
        .prepare(&format!(
            "{ITEM_SELECT}
             JOIN today_slots t ON t.item_id = i.id
             WHERE t.day = ?1 AND i.status NOT IN ('done','dropped')
             ORDER BY t.position"
        ))
        .map_err(|err| err.to_string())?;
    let slots = stmt
        .query_map(params![day], map_item)
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    let dailies = list_items(conn, Some("daily"))?
        .into_iter()
        .filter(|item| {
            item.status != "dropped"
                && timeutil::runs_on(item.repeat_days.as_deref().unwrap_or(""), moment)
        })
        .map(|item| {
            let state = daily_state(conn, item.id, &day, &item, moment)?;
            Ok(DailyView { item, state })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let chores = list_items(conn, Some("task"))?
        .into_iter()
        .filter(|item| {
            item.important == Some(false)
                && matches!(item.status.as_str(), "open" | "doing")
                && item
                    .due_at
                    .as_deref()
                    .and_then(parse_stored)
                    .map(|due| due.date_naive() <= moment.date_naive())
                    .unwrap_or(false)
        })
        .collect();

    Ok(TodayBoard {
        day,
        slots,
        dailies,
        chores,
        suggestions: rule_suggestions(conn)?,
    })
}

pub fn weekly_packet(conn: &Connection) -> Result<WeeklyPacket, String> {
    let moment = now();
    let inbox = list_items(conn, Some("inbox"))?
        .into_iter()
        .filter(|item| item.status == "inbox")
        .collect();
    let stale_cutoff = timeutil::iso(moment - Duration::days(3));
    let mut stmt = conn
        .prepare(
            &format!(
                "{SUB_FROM} WHERE s.status = 'active' AND COALESCE(s.kind, 'regular') != 'periodic' AND s.last_touched_at <= ?1
                 ORDER BY s.last_touched_at"
            ),
        )
        .map_err(|err| err.to_string())?;
    let stale = stmt
        .query_map(params![stale_cutoff], map_subproject)
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    let follow_ups = list_items(conn, Some("waiting"))?
        .into_iter()
        .filter(|item| {
            item.status == "open"
                && item
                    .follow_up_at
                    .as_deref()
                    .and_then(parse_stored)
                    .map(|due| due <= moment)
                    .unwrap_or(false)
        })
        .collect();
    let undated_important = list_items(conn, Some("task"))?
        .into_iter()
        .filter(|item| {
            item.important == Some(true)
                && item.due_at.is_none()
                && matches!(item.status.as_str(), "open" | "doing")
        })
        .collect();
    let week = timeutil::iso(timeutil::start_of_week(moment));
    let mut log_stmt = conn
        .prepare(
            "SELECT created_at, raw_text, reason, verdict FROM activity_logs
             WHERE accepted = 0 AND created_at >= ?1 ORDER BY id DESC LIMIT 8",
        )
        .map_err(|err| err.to_string())?;
    let overrides = log_stmt
        .query_map(params![week], |row| {
            Ok(OverrideNote {
                created_at: row.get(0)?,
                raw_text: row.get(1)?,
                reason: row.get(2)?,
                verdict: row.get(3)?,
            })
        })
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(WeeklyPacket {
        inbox,
        stale,
        follow_ups,
        undated_important,
        overrides,
    })
}

pub fn limits(conn: &Connection) -> Result<Limits, String> {
    Ok(Limits {
        active_projects: count(conn, "SELECT COUNT(*) FROM projects WHERE status = 'active'")?,
        active_subprojects: count(conn, "SELECT COUNT(*) FROM subprojects WHERE status = 'active'")?,
        project_cap: PROJECT_CAP,
        subproject_cap: SUBPROJECT_CAP,
    })
}

pub fn bump_follow_up(conn: &Connection, id: i64, days: i64) -> Result<Item, String> {
    let next = timeutil::iso(now() + Duration::days(days.max(1)));
    let stamp = timeutil::now_iso();
    conn.execute(
        "UPDATE items SET follow_up_at = ?2, snooze_until = NULL, updated_at = ?3 WHERE id = ?1 AND kind = 'waiting'",
        params![id, next, stamp],
    )
    .map_err(|err| err.to_string())?;
    get_item(conn, id)
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| row.get(0))
        .optional()
        .map_err(|err| err.to_string())
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

fn ensure_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    let existing: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| row.get(0))
        .optional()
        .map_err(|err| err.to_string())?;
    if existing.as_deref().map(str::trim).is_some_and(|text| !text.is_empty()) {
        return Ok(());
    }
    set_setting(conn, key, value)
}

fn insert_project(conn: &Connection, name: &str, outcome: &str, status: &str, stamp: &str) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO projects (name, outcome, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        params![name, outcome, status, stamp],
    )
    .map_err(|err| err.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn insert_sub(
    conn: &Connection,
    project_id: i64,
    name: &str,
    criteria: &str,
    target_date: Option<&str>,
    status: &str,
    touched: &str,
    snooze: Option<&str>,
    stamp: &str,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO subprojects (project_id, name, done_criteria, target_date, status, last_touched_at, stall_snooze_until, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        params![project_id, name, criteria, target_date, status, touched, snooze, stamp],
    )
    .map_err(|err| err.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn insert_item(
    conn: &Connection,
    kind: &str,
    title: &str,
    notes: &str,
    project_id: Option<i64>,
    subproject_id: Option<i64>,
    important: Option<i64>,
    due_at: Option<&str>,
    estimate_min: Option<i64>,
    status: &str,
    repeat_days: Option<&str>,
    window_start: Option<&str>,
    window_end: Option<&str>,
    grace_min: Option<i64>,
    interrupt: i64,
    waiting_on: Option<&str>,
    follow_up_at: Option<&str>,
    started_at: Option<&str>,
    snooze_until: Option<&str>,
    completed_at: Option<&str>,
    stamp: &str,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO items (kind, title, notes, project_id, subproject_id, important, due_at, estimate_min, status,
         repeat_days, window_start, window_end, grace_min, interrupt_after_grace, waiting_on, follow_up_at,
         started_at, snooze_until, created_at, updated_at, completed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?19, ?20)",
        params![
            kind, title, notes, project_id, subproject_id, important, due_at, estimate_min, status,
            repeat_days, window_start, window_end, grace_min, interrupt, waiting_on, follow_up_at,
            started_at, snooze_until, stamp, completed_at
        ],
    )
    .map_err(|err| err.to_string())?;
    Ok(conn.last_insert_rowid())
}

pub fn seed_demo(conn: &Connection) -> Result<(), String> {
    if get_setting(conn, "demo_seeded")?.as_deref() == Some("1") {
        return Ok(());
    }
    let moment = now();
    let stamp = timeutil::iso(moment);
    let today = moment.date_naive();
    let day = timeutil::today_key(moment);
    let today_n = {
        use chrono::Datelike;
        moment.weekday().number_from_monday()
    };
    let every_day = "1,2,3,4,5,6,7";
    let not_today = (1..=7)
        .filter(|value| *value != today_n)
        .map(|value| value.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let clock = |delta: i64| -> String {
        let shifted = moment + Duration::minutes(delta);
        if shifted.date_naive() != today {
            if delta < 0 { "00:00".into() } else { "23:59".into() }
        } else {
            shifted.format("%H:%M").to_string()
        }
    };
    let later_today = {
        let candidate = moment + Duration::hours(3);
        if candidate.date_naive() == today && candidate > moment + Duration::minutes(40) {
            candidate
        } else if (moment + Duration::minutes(50)).date_naive() == today {
            moment + Duration::minutes(50)
        } else {
            moment + Duration::hours(14)
        }
    };
    let chore_due = {
        let candidate = moment + Duration::hours(2);
        if candidate.date_naive() == today { candidate } else { moment }
    };

    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    tx.execute("UPDATE projects SET status = 'paused', updated_at = ?1 WHERE status = 'active'", params![stamp])
        .map_err(|err| err.to_string())?;
    tx.execute("UPDATE subprojects SET status = 'paused', updated_at = ?1 WHERE status = 'active'", params![stamp])
        .map_err(|err| err.to_string())?;

    let delivery = insert_project(&tx, "客户交付", "这个月把合同签下来", "active", &stamp)?;
    let launch = insert_project(&tx, "产品发布", "官网和报名链路可用", "active", &stamp)?;
    let team = insert_project(&tx, "团队运转", "这周的协作不断档", "active", &stamp)?;
    let planning = insert_project(&tx, "下季度规划", "下季度只保留三条线", "upcoming", &stamp)?;
    let _campaign = insert_project(&tx, "市场活动", "展会物料先停着", "paused", &stamp)?;
    let archived = insert_project(&tx, "旧系统迁移", "去年已经切完", "archived", &stamp)?;

    let quote_target = (today + Duration::days(5)).format("%Y-%m-%d").to_string();
    let quote = insert_sub(
        &tx, delivery, "报价确认", "客户书面接受第三版报价",
        Some(&quote_target),
        "active", &timeutil::iso(moment - Duration::minutes(40)), None, &stamp,
    )?;
    let contract = insert_sub(&tx, delivery, "合同盖章", "双方都盖完章并回传扫描件", None, "active", &stamp, None, &stamp)?;
    let _old_plan = insert_sub(&tx, delivery, "旧方案", "旧报价方案归档，不再改", None, "paused", &timeutil::iso(moment - Duration::days(6)), None, &stamp)?;
    let homepage = insert_sub(&tx, launch, "官网文案", "首页能讲清产品是做什么的", None, "active", &stamp, None, &stamp)?;
    let tracking = insert_sub(&tx, launch, "埋点核对", "报名按钮的点击被记下来", None, "active", &stamp, None, &stamp)?;
    let assets = insert_sub(&tx, launch, "素材归档", "终稿都在网盘对应文件夹", None, "done", &timeutil::iso(moment - Duration::days(1)), None, &stamp)?;
    let weekly = insert_sub(
        &tx, team, "周报材料", "周五能发出这周的三件进展", None, "active",
        &timeutil::iso(moment - Duration::days(4)), None, &stamp,
    )?;
    let _scope = insert_sub(&tx, planning, "范围草案", "三条线各自写清不做什么", None, "paused", &timeutil::iso(moment - Duration::days(2)), None, &stamp)?;
    let _migration = insert_sub(&tx, archived, "数据核对", "旧库记录抽查通过", None, "archived", &timeutil::iso(moment - Duration::days(40)), None, &stamp)?;

    let quote_task = insert_item(
        &tx, "task", "改第三版报价", "智能体匹配「我现在在做什么」时，可以对上这句。客户昨晚回了修改点。",
        Some(delivery), Some(quote), Some(1), Some(&timeutil::iso(moment - Duration::hours(2))), Some(25), "doing",
        None, None, None, None, 0, None, None, Some(&timeutil::iso(moment - Duration::minutes(12))), None, None, &stamp,
    )?;
    let legal_task = insert_item(
        &tx, "task", "把修改意见回给法务", "今天要处理，但还没到最后半小时。",
        Some(delivery), Some(contract), Some(1), Some(&timeutil::iso(later_today)), Some(50), "open",
        None, None, None, None, 0, None, None, None, None, None, &stamp,
    )?;
    let copy_task = insert_item(
        &tx, "task", "写首页主标题", "没有硬截止。周回顾里应出现在「重要但没日期」。",
        Some(launch), Some(homepage), Some(1), None, Some(90), "open",
        None, None, None, None, 0, None, None, None, None, None, &stamp,
    )?;
    insert_item(
        &tx, "task", "核对报名按钮", "不重要，今天到期，只进杂事，不单独弹窗。",
        Some(launch), Some(tracking), Some(0), Some(&timeutil::iso(chore_due)), Some(15), "open",
        None, None, None, None, 0, None, None, None, None, None, &stamp,
    )?;
    insert_item(
        &tx, "task", "收集本周完成的三件事", "子任务已经四天没动，用来触发停滞提醒。",
        Some(team), Some(weekly), Some(1), Some(&timeutil::iso(moment + Duration::days(2))), Some(25), "open",
        None, None, None, None, 0, None, None, None, None, None, &stamp,
    )?;
    insert_item(
        &tx, "task", "补一页案例", "重要且快到点，但被推迟到几小时后，所以现在不弹。",
        Some(delivery), Some(quote), Some(1), Some(&timeutil::iso(moment + Duration::minutes(10))), Some(25), "open",
        None, None, None, None, 0, None, None, None, Some(&timeutil::iso(moment + Duration::hours(4))), None, &stamp,
    )?;
    insert_item(
        &tx, "task", "临时加一张海报", "已经放弃，不应出现在今天或收集箱。",
        Some(launch), Some(homepage), Some(0), None, Some(50), "dropped",
        None, None, None, None, 0, None, None, None, None, None, &stamp,
    )?;
    insert_item(
        &tx, "task", "上传终稿到网盘", "这条子任务已经做完。",
        Some(launch), Some(assets), Some(1), None, Some(15), "done",
        None, None, None, None, 0, None, None, None, None, Some(&stamp), &stamp,
    )?;
    insert_item(
        &tx, "waiting", "等客户确认报价口径", "",
        Some(delivery), Some(quote), None, None, None, "open",
        None, None, None, None, 0, Some("客户王敏"), Some(&timeutil::iso(moment - Duration::hours(2))), None, None, None, &stamp,
    )?;
    insert_item(
        &tx, "waiting", "等设计交首页视觉", "",
        Some(launch), Some(homepage), None, None, None, "open",
        None, None, None, None, 0, Some("设计组"), Some(&timeutil::iso(moment + Duration::days(1))), None, None, None, &stamp,
    )?;
    insert_item(&tx, "inbox", "客户说合同还要改一版，不知道归到哪条线", "给收集箱整理用，智能体可以建议挂到合同盖章。", None, None, None, None, None, "inbox", None, None, None, None, 0, None, None, None, None, None, &stamp)?;
    insert_item(&tx, "inbox", "下周三之前把报价发出去", "给收集箱整理用，有时间但还没变成任务。", None, None, None, None, None, "inbox", None, None, None, None, 0, None, None, None, None, None, &stamp)?;
    insert_item(&tx, "inbox", "有空问问设计稿什么时候能看", "可能是等待，也可能只是以后再说。", None, None, None, None, None, "inbox", None, None, None, None, 0, None, None, None, None, None, &stamp)?;
    insert_item(&tx, "someday", "整理去年的项目复盘模板", "以后再说，不占今天的名额。", None, None, None, None, None, "open", None, None, None, None, 0, None, None, None, None, None, &stamp)?;

    let grace_end = clock(-90);
    let grace_start = clock(-120);
    let quiet_end = clock(-180);
    let quiet_start = clock(-210);
    let later_start = clock(180);
    let later_end = clock(210);
    let soft_start = clock(-20);
    let soft_end = clock(40);
    let done_daily = insert_item(&tx, "daily", "晨间记录", "今天这条已经做完。", None, None, None, None, None, "open", Some(every_day), Some("06:30"), Some("07:00"), Some(15), 0, None, None, None, None, None, &stamp)?;
    insert_item(&tx, "daily", "过宽限后可以打断的检查", "时间窗和宽限都过了，而且允许打断不重要的事。", None, None, None, None, None, "open", Some(every_day), Some(&grace_start), Some(&grace_end), Some(20), 1, None, None, None, None, None, &stamp)?;
    insert_item(&tx, "daily", "过宽限但不打断的阅读", "过了宽限，但不要求切换正在做的重要工作。", None, None, None, None, None, "open", Some(every_day), Some(&quiet_start), Some(&quiet_end), Some(15), 0, None, None, None, None, None, &stamp)?;
    insert_item(&tx, "daily", "现在这个时间窗里的伸展", "正在时间窗内，只轻提醒。", None, None, None, None, None, "open", Some(every_day), Some(&soft_start), Some(&soft_end), Some(20), 0, None, None, None, None, None, &stamp)?;
    insert_item(&tx, "daily", "稍晚才开始的复盘", "还没到时间窗。", None, None, None, None, None, "open", Some(every_day), Some(&later_start), Some(&later_end), Some(15), 0, None, None, None, None, None, &stamp)?;
    insert_item(&tx, "daily", "不是今天的站会", "重复日不包含今天，今天的清单里不应出现。", None, None, None, None, None, "open", Some(&not_today), Some("09:00"), Some("09:20"), Some(10), 1, None, None, None, None, None, &stamp)?;
    tx.execute(
        "INSERT INTO daily_marks (item_id, day, state) VALUES (?1, ?2, 'done')",
        params![done_daily, day],
    )
    .map_err(|err| err.to_string())?;

    tx.execute("DELETE FROM today_slots WHERE day = ?1", params![day]).map_err(|err| err.to_string())?;
    for (position, item_id) in [(1, quote_task), (2, legal_task), (3, copy_task)] {
        tx.execute(
            "INSERT INTO today_slots (day, position, item_id) VALUES (?1, ?2, ?3)",
            params![day, position, item_id],
        )
        .map_err(|err| err.to_string())?;
    }

    let yesterday = timeutil::iso(moment - Duration::days(1));
    tx.execute(
        "INSERT INTO activity_logs (created_at, raw_text, matched_item_id, incoming_item_id, incoming_class, verdict, reason, accepted, snooze_min, match_source)
         VALUES (?1, ?2, ?3, ?4, 'must_now', 'switch', ?5, 0, 0, 'ai')",
        params![yesterday, "我先去回几封邮件", quote_task, quote_task, "建议切换到「改第三版报价」，你仍留在当前这件事。"],
    )
    .map_err(|err| err.to_string())?;
    tx.execute(
        "INSERT INTO activity_logs (created_at, raw_text, matched_item_id, incoming_item_id, incoming_class, verdict, reason, accepted, snooze_min, match_source)
         VALUES (?1, ?2, ?3, ?3, 'must_now', 'finish_slice', ?4, 0, 15, 'rules')",
        params![stamp, "再改十分钟就好", quote_task, "这一小段还没做完，先做完再看要不要换。"],
    )
    .map_err(|err| err.to_string())?;
    tx.execute(
        "INSERT INTO activity_logs (created_at, raw_text, matched_item_id, incoming_item_id, incoming_class, verdict, reason, accepted, snooze_min, match_source)
         VALUES (?1, ?2, ?3, ?3, 'must_now', 'continue', ?4, 1, 0, 'ai')",
        params![stamp, "我在改第三版报价", quote_task, "说的就是当前这一步，继续即可。"],
    )
    .map_err(|err| err.to_string())?;

    ensure_setting(&tx, "ai_base_url", "https://openrouter.ai/api/v1")?;
    ensure_setting(&tx, "ai_model", "openai/gpt-6-luna")?;
    tx.execute(
        "INSERT INTO settings (key, value) VALUES ('demo_seeded', '1')",
        [],
    )
    .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(())
}

pub fn load_reminder(conn: &Connection) -> Result<Option<ReminderView>, String> {
    conn.query_row(
        "SELECT class, item_id, subproject_id, title, detail, fired_at FROM reminder_state WHERE id = 1",
        [],
        |row| {
            let class_name: String = row.get(0)?;
            Ok((class_name, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
        },
    )
    .optional()
    .map_err(|err| err.to_string())?
    .map(|(class, item_id, subproject_id, title, detail, fired_at)| {
        let class = parse_class(&class).ok_or("提醒类型无法识别")?;
        Ok(ReminderView { class, title, detail, item_id, subproject_id, fired_at })
    })
    .transpose()
}

pub fn save_reminder(conn: &Connection, reminder: &ReminderView) -> Result<(), String> {
    conn.execute(
        "INSERT INTO reminder_state (id, class, item_id, subproject_id, title, detail, fired_at)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
           class = excluded.class, item_id = excluded.item_id, subproject_id = excluded.subproject_id,
           title = excluded.title, detail = excluded.detail, fired_at = excluded.fired_at",
        params![
            class_name(reminder.class), reminder.item_id, reminder.subproject_id,
            reminder.title, reminder.detail, reminder.fired_at
        ],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

pub fn clear_reminder(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM reminder_state WHERE id = 1", [])
        .map_err(|err| err.to_string())?;
    Ok(())
}

pub fn snooze_item(conn: &Connection, id: i64, minutes: i64) -> Result<(), String> {
    let until = timeutil::iso(timeutil::add_minutes(now(), minutes));
    let stamp = timeutil::now_iso();
    conn.execute(
        "UPDATE items SET snooze_until = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, until, stamp],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

pub fn snooze_subproject(conn: &Connection, id: i64, minutes: i64) -> Result<(), String> {
    let until = timeutil::iso(timeutil::add_minutes(now(), minutes));
    conn.execute(
        "UPDATE subprojects SET stall_snooze_until = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, until, timeutil::now_iso()],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

pub fn work_items(conn: &Connection) -> Result<Vec<Item>, String> {
    let sql = format!(
        "{ITEM_SELECT} WHERE i.kind IN ('task','daily','waiting') AND i.status IN ('open','doing') ORDER BY i.id DESC"
    );
    let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
    let rows = stmt.query_map([], map_item).map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())
}

pub fn lexical_match(conn: &Connection, text: &str) -> Result<Option<Item>, String> {
    let needle = normalize(text);
    if needle.chars().count() < 2 {
        return Ok(None);
    }
    let mut best: Option<(i32, Item)> = None;
    for item in work_items(conn)? {
        let title = normalize(&item.title);
        let score = if title == needle {
            100
        } else if title.contains(&needle) || needle.contains(&title) {
            80
        } else {
            let shared = title.chars().filter(|ch| needle.contains(*ch)).count();
            let need = title.chars().count().max(1);
            if shared >= 2 && shared * 2 >= need { 50 } else { 0 }
        };
        if score >= 50 && best.as_ref().map(|found| score > found.0).unwrap_or(true) {
            best = Some((score, item));
        }
    }
    Ok(best.map(|found| found.1))
}

pub fn current_work(conn: &Connection, item: &Item) -> Result<CurrentWork, String> {
    let moment = now();
    let due_at = item.due_at.as_deref().and_then(parse_stored);
    let remaining_min = match (item.estimate_min, item.started_at.as_deref().and_then(parse_stored)) {
        (Some(estimate), Some(started)) => Some((estimate - (moment - started).num_minutes()).max(0)),
        (Some(estimate), None) => Some(estimate),
        _ => None,
    };
    let day = timeutil::today_key(moment);
    let today_focus = conn
        .query_row(
            "SELECT 1 FROM today_slots WHERE day = ?1 AND item_id = ?2",
            params![day, item.id],
            |_| Ok(()),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .is_some();
    let must_now = item.kind == "task"
        && item.important == Some(true)
        && due_at.map(|due| due <= moment + Duration::minutes(30)).unwrap_or(false);
    Ok(CurrentWork {
        important: item.kind == "task" && item.important == Some(true),
        must_now,
        today_focus,
        remaining_min,
        due_at,
    })
}

pub fn rule_suggestions(conn: &Connection) -> Result<Vec<Suggested>, String> {
    let moment = now();
    let mut tasks = list_items(conn, Some("task"))?
        .into_iter()
        .filter(|item| item.important == Some(true) && matches!(item.status.as_str(), "open" | "doing"))
        .collect::<Vec<_>>();
    tasks.sort_by_key(|item| suggestion_rank(item, moment));
    tasks.truncate(3);
    Ok(tasks
        .into_iter()
        .map(|item| {
            let reason = suggestion_reason(&item, moment);
            Suggested { item, reason }
        })
        .collect())
}

pub fn apply_resolution(
    conn: &Connection,
    text: &str,
    follow: bool,
    matched_item_id: Option<i64>,
    match_source: &str,
    judgment: &Judgment,
) -> Result<(), String> {
    let Some(reminder) = load_reminder(conn)? else {
        return Err("没有进行中的提醒".into());
    };
    let switch_now = follow && judgment.verdict == Verdict::Switch;
    if switch_now {
        if let Some(item_id) = reminder.item_id {
            let item = get_item(conn, item_id)?;
            if item.kind == "task" {
                start_item(conn, item_id)?;
            } else {
                snooze_item(conn, item_id, judgment.snooze_min.max(20))?;
            }
        }
    } else if let Some(item_id) = reminder.item_id {
        let minutes = if follow { judgment.snooze_min } else { 25 };
        snooze_item(conn, item_id, minutes)?;
    }
    if reminder.class == InterruptClass::Stall {
        if let Some(sub_id) = reminder.subproject_id {
            let minutes = if follow { judgment.snooze_min } else { 180 };
            snooze_subproject(conn, sub_id, minutes)?;
        }
    }
    conn.execute(
        "INSERT INTO activity_logs (created_at, raw_text, matched_item_id, incoming_item_id, incoming_class, verdict, reason, accepted, snooze_min, match_source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            timeutil::now_iso(), text, matched_item_id, reminder.item_id, class_name(reminder.class),
            verdict_name(judgment.verdict), judgment.reason, if follow { 1 } else { 0 }, judgment.snooze_min, match_source
        ],
    )
    .map_err(|err| err.to_string())?;
    clear_reminder(conn)?;
    Ok(())
}

pub fn acknowledge_reminder(conn: &Connection) -> Result<(), String> {
    let Some(reminder) = load_reminder(conn)? else {
        return Ok(());
    };
    let minutes: i64 = match reminder.class {
        InterruptClass::MustNow => 25,
        InterruptClass::Today => 60,
        InterruptClass::DailySoft => 30,
        InterruptClass::DailyGrace | InterruptClass::DailyGraceQuiet => 45,
        InterruptClass::Stall => 12 * 60,
    };
    if let Some(item_id) = reminder.item_id {
        snooze_item(conn, item_id, minutes)?;
    }
    if reminder.class == InterruptClass::Stall {
        if let Some(sub_id) = reminder.subproject_id {
            snooze_subproject(conn, sub_id, minutes)?;
        }
    }
    conn.execute(
        "INSERT INTO activity_logs (created_at, raw_text, matched_item_id, incoming_item_id, incoming_class, verdict, reason, accepted, snooze_min, match_source)
         VALUES (?1, '知道了', NULL, ?2, ?3, 'continue', '先知道了，这次不判断要不要换。', 1, ?4, 'rules')",
        params![timeutil::now_iso(), reminder.item_id, class_name(reminder.class), minutes],
    )
    .map_err(|err| err.to_string())?;
    clear_reminder(conn)?;
    Ok(())
}

pub fn resolve_stall(conn: &Connection, action: &str) -> Result<(), String> {
    let Some(reminder) = load_reminder(conn)? else {
        return Err("没有进行中的提醒".into());
    };
    if reminder.class != InterruptClass::Stall {
        return Err("这不是一条停滞提醒".into());
    }
    let Some(sub_id) = reminder.subproject_id else {
        return Err("停滞提醒没有对应的子任务".into());
    };
    match action {
        "continue" => touch_subproject(conn, sub_id)?,
        "pause" => {
            set_subproject_status(conn, sub_id, "paused", None)?;
        }
        "archive" => {
            set_subproject_status(conn, sub_id, "archived", None)?;
        }
        _ => return Err("只能继续、暂停或归档".into()),
    }
    conn.execute(
        "UPDATE subprojects SET stall_snooze_until = NULL WHERE id = ?1",
        params![sub_id],
    )
    .map_err(|err| err.to_string())?;
    clear_reminder(conn)?;
    Ok(())
}

pub fn active_subprojects_for_scan(conn: &Connection) -> Result<Vec<(i64, String, String, Option<String>)>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, last_touched_at, stall_snooze_until FROM subprojects WHERE status = 'active' AND COALESCE(kind, 'regular') != 'periodic'")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())
}

pub fn daily_done_today(conn: &Connection, item_id: i64, day: &str) -> Result<bool, String> {
    let state: Option<String> = conn
        .query_row(
            "SELECT state FROM daily_marks WHERE item_id = ?1 AND day = ?2",
            params![item_id, day],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    Ok(state.as_deref() == Some("done"))
}

struct PreparedDraft {
    kind: String,
    title: String,
    notes: String,
    project_id: Option<i64>,
    subproject_id: Option<i64>,
    important: Option<i64>,
    due_at: Option<String>,
    estimate_min: Option<i64>,
    status: String,
    repeat_days: Option<String>,
    window_start: Option<String>,
    window_end: Option<String>,
    grace_min: Option<i64>,
    interrupt: i64,
    waiting_on: Option<String>,
    follow_up_at: Option<String>,
}

fn prepare_draft(conn: &Connection, draft: &ItemDraft, title: &str) -> Result<PreparedDraft, String> {
    let notes = draft.notes.trim().to_string();
    match draft.kind.as_str() {
        "task" => {
            let project_id = draft.project_id.ok_or("项目任务要挂在大项目上")?;
            let _ = get_project(conn, project_id)?;
            let important = draft.important.ok_or("选一下这件重不重要")?;
            let estimate = draft.estimate_min.unwrap_or(25);
            check_estimate(estimate)?;
            Ok(PreparedDraft {
                kind: "task".into(),
                title: title.into(),
                notes,
                project_id: Some(project_id),
                subproject_id: draft.subproject_id,
                important: Some(bool_int(important)),
                due_at: normalize_optional(draft.due_at.as_deref())?,
                estimate_min: Some(estimate),
                status: "open".into(),
                repeat_days: None,
                window_start: None,
                window_end: None,
                grace_min: None,
                interrupt: 0,
                waiting_on: None,
                follow_up_at: None,
            })
        }
        "daily" => {
            let days = draft.repeat_days.clone().unwrap_or_default();
            if days.trim().is_empty() {
                return Err("选重复的日子".into());
            }
            let start = draft.window_start.clone().unwrap_or_default();
            let end = draft.window_end.clone().unwrap_or_default();
            if !timeutil::valid_hhmm(&start) || !timeutil::valid_hhmm(&end) {
                return Err("时间窗要用 09:00 这种格式".into());
            }
            let grace = draft.grace_min.unwrap_or(30);
            if !(0..=240).contains(&grace) {
                return Err("宽限要在 0 到 240 分钟之间".into());
            }
            Ok(PreparedDraft {
                kind: "daily".into(),
                title: title.into(),
                notes,
                project_id: None,
                subproject_id: None,
                important: None,
                due_at: None,
                estimate_min: None,
                status: "open".into(),
                repeat_days: Some(days),
                window_start: Some(start),
                window_end: Some(end),
                grace_min: Some(grace),
                interrupt: bool_int(draft.interrupt_after_grace),
                waiting_on: None,
                follow_up_at: None,
            })
        }
        "waiting" => {
            let sub_id = draft.subproject_id.ok_or("等待要挂在子任务上")?;
            let sub = get_subproject(conn, sub_id)?;
            let waiting_on = draft.waiting_on.clone().unwrap_or_default();
            if waiting_on.trim().is_empty() {
                return Err("写一下在等什么".into());
            }
            let follow = draft.follow_up_at.clone().ok_or("写下次询问的时间")?;
            Ok(PreparedDraft {
                kind: "waiting".into(),
                title: title.into(),
                notes,
                project_id: Some(sub.project_id),
                subproject_id: Some(sub_id),
                important: None,
                due_at: None,
                estimate_min: None,
                status: "open".into(),
                repeat_days: None,
                window_start: None,
                window_end: None,
                grace_min: None,
                interrupt: 0,
                waiting_on: Some(waiting_on.trim().to_string()),
                follow_up_at: Some(timeutil::parse_user_time(&follow)?),
            })
        }
        "someday" => Ok(PreparedDraft {
            kind: "someday".into(),
            title: title.into(),
            notes,
            project_id: draft.project_id,
            subproject_id: draft.subproject_id,
            important: None,
            due_at: None,
            estimate_min: None,
            status: "open".into(),
            repeat_days: None,
            window_start: None,
            window_end: None,
            grace_min: None,
            interrupt: 0,
            waiting_on: None,
            follow_up_at: None,
        }),
        _ => Err("类型无效".into()),
    }
}

fn activate_subproject(conn: &Connection, id: i64) -> Result<(), String> {
    let status: String = conn
        .query_row("SELECT status FROM subprojects WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|_| "找不到这个子任务".to_string())?;
    if status == "active" {
        return Ok(());
    }
    if matches!(status.as_str(), "done" | "archived") {
        return Err("这个子任务已经结束".into());
    }
    conn.execute(
        "UPDATE subprojects SET status = 'active', updated_at = ?2 WHERE id = ?1",
        params![id, timeutil::now_iso()],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

fn touch_subproject(conn: &Connection, id: i64) -> Result<(), String> {
    touch_subproject_tx(conn, id, &timeutil::now_iso())
}

fn touch_subproject_tx(conn: &Connection, id: i64, stamp: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE subprojects SET last_touched_at = ?2, stall_snooze_until = NULL, updated_at = ?2 WHERE id = ?1",
        params![id, stamp],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

fn get_project(conn: &Connection, id: i64) -> Result<Project, String> {
    conn.query_row(
        "SELECT id, name, outcome, status, created_at, updated_at FROM projects WHERE id = ?1",
        params![id],
        map_project,
    )
    .map_err(|_| "找不到这个大项目".to_string())
}

fn get_subproject(conn: &Connection, id: i64) -> Result<Subproject, String> {
    conn.query_row(
        &format!("{SUB_FROM} WHERE s.id = ?1"),
        params![id],
        map_subproject,
    )
    .map_err(|_| "找不到这个子任务".to_string())
}

fn count(conn: &Connection, sql: &str) -> Result<i64, String> {
    conn.query_row(sql, [], |row| row.get(0))
        .map_err(|err| err.to_string())
}

fn map_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        outcome: row.get(2)?,
        status: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn map_subproject(row: &rusqlite::Row<'_>) -> rusqlite::Result<Subproject> {
    let important_int: Option<i64> = row.get(11)?;
    Ok(Subproject {
        id: row.get(0)?,
        project_id: row.get(1)?,
        project_name: row.get(2)?,
        name: row.get(3)?,
        done_criteria: row.get(4)?,
        target_date: row.get(5)?,
        status: row.get(6)?,
        last_touched_at: row.get(7)?,
        next_title: row.get(8)?,
        kind: row.get(9)?,
        progress: row.get(10)?,
        important: important_int.map(|value| value != 0),
        due_at: row.get(12)?,
        repeat_days: row.get(13)?,
        remind_at: row.get(14)?,
        progress_percent: row.get(15)?,
    })
}

fn map_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<Item> {
    let important_int: Option<i64> = row.get(6)?;
    let important = important_int.map(|value| value != 0);
    let kind: String = row.get(1)?;
    let due_at: Option<String> = row.get(7)?;
    let quadrant = quadrant_label(&kind, important, due_at.as_deref());
    Ok(Item {
        id: row.get(0)?,
        kind,
        title: row.get(2)?,
        notes: row.get(3)?,
        project_id: row.get(4)?,
        subproject_id: row.get(5)?,
        important,
        due_at,
        estimate_min: row.get(8)?,
        status: row.get(9)?,
        repeat_days: row.get(10)?,
        window_start: row.get(11)?,
        window_end: row.get(12)?,
        grace_min: row.get(13)?,
        interrupt_after_grace: row.get::<_, i64>(14)? != 0,
        waiting_on: row.get(15)?,
        follow_up_at: row.get(16)?,
        started_at: row.get(17)?,
        snooze_until: row.get(18)?,
        project_name: row.get(22)?,
        subproject_name: row.get(23)?,
        quadrant,
    })
}

fn quadrant_label(kind: &str, important: Option<bool>, due_at: Option<&str>) -> Option<String> {
    if kind != "task" {
        return None;
    }
    let important = important == Some(true);
    let urgent = due_at
        .and_then(parse_stored)
        .map(|due| due.date_naive() <= now().date_naive())
        .unwrap_or(false);
    Some(
        match (important, urgent) {
            (true, true) => "重要且紧急",
            (true, false) => "重要不紧急",
            (false, true) => "不重要但着急",
            (false, false) => "可以以后",
        }
        .into(),
    )
}

fn daily_state(conn: &Connection, id: i64, day: &str, item: &Item, moment: chrono::DateTime<chrono::Local>) -> Result<String, String> {
    if daily_done_today(conn, id, day)? {
        return Ok("done".into());
    }
    let Some(start) = item.window_start.as_deref().and_then(|value| timeutil::at_clock(moment.date_naive(), value)) else {
        return Ok("pending".into());
    };
    let Some(end) = item.window_end.as_deref().and_then(|value| timeutil::at_clock(moment.date_naive(), value)) else {
        return Ok("pending".into());
    };
    let grace_end = end + Duration::minutes(item.grace_min.unwrap_or(0));
    if moment < start {
        Ok("pending".into())
    } else if moment <= grace_end {
        Ok("due".into())
    } else {
        Ok("late".into())
    }
}

fn suggestion_rank(item: &Item, moment: chrono::DateTime<chrono::Local>) -> (u8, String) {
    let due = item.due_at.as_deref().and_then(parse_stored);
    let rank = match due {
        Some(due) if due <= moment + Duration::minutes(30) => 0,
        Some(due) if due.date_naive() == moment.date_naive() => 1,
        Some(due) if due <= moment + Duration::days(7) => 2,
        Some(_) => 3,
        None => 4,
    };
    (rank, item.due_at.clone().unwrap_or_default())
}

fn suggestion_reason(item: &Item, moment: chrono::DateTime<chrono::Local>) -> String {
    match item.due_at.as_deref().and_then(parse_stored) {
        Some(due) if due <= moment + Duration::minutes(30) => "已经到了截止时间".into(),
        Some(due) if due.date_naive() == moment.date_naive() => "今天到期，而且你标了重要".into(),
        Some(_) => "重要，截止在这几天里".into(),
        None => "重要，还没有硬截止".into(),
    }
}

fn check_estimate(minutes: i64) -> Result<(), String> {
    if matches!(minutes, 15 | 25 | 50 | 90) {
        Ok(())
    } else {
        Err("预估只能是 15、25、50 或 90 分钟".into())
    }
}

fn normalize_optional(value: Option<&str>) -> Result<Option<String>, String> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => Ok(Some(timeutil::parse_user_time(value)?)),
        None => Ok(None),
    }
}

fn bool_int(value: bool) -> i64 {
    if value { 1 } else { 0 }
}

fn normalize(value: &str) -> String {
    value.chars().filter(|ch| !ch.is_whitespace()).collect::<String>().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn fourth_active_project_is_allowed() {
        let conn = memory();
        for index in 0..4 {
            create_project(
                &conn,
                &NewProject {
                    name: format!("项目{index}"),
                    outcome: "结果".into(),
                    status: "active".into(),
                    pause_project_id: None,
                },
            )
            .unwrap();
        }
        let active: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects WHERE status = 'active'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(active, 4);
    }

    #[test]
    fn regular_and_periodic_subprojects() {
        let conn = memory();
        let project = create_project(
            &conn,
            &NewProject {
                name: "客户线".into(),
                outcome: "这个月交付".into(),
                status: "active".into(),
                pause_project_id: None,
            },
        )
        .unwrap();
        let sub = create_subproject(
            &conn,
            &NewSubproject {
                project_id: project.id,
                kind: "regular".into(),
                name: "报价".into(),
                important: true,
                progress: "doing".into(),
                due_at: None,
                repeat_days: None,
                remind: false,
                remind_at: None,
                progress_percent: Some(40),
            },
        )
        .unwrap();
        assert_eq!(sub.next_title.as_deref(), Some("报价"));
        assert_eq!(sub.progress, "doing");
        assert_eq!(sub.progress_percent, Some(40));
        assert_eq!(sub.kind, "regular");
        let moved = set_subproject_progress(&conn, sub.id, "doing", Some(75), Some("  改完第三版报价  ")).unwrap();
        assert_eq!(moved.progress_percent, Some(75));
        assert_eq!(moved.status, "active");
        let logs = list_work_logs(&conn, Some(project.id)).unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].body, "改完第三版报价");
        assert_eq!(logs[0].progress_percent, Some(75));
        let finished = set_subproject_progress(&conn, sub.id, "done", Some(75), None).unwrap();
        assert_eq!(finished.progress, "done");
        assert_eq!(finished.status, "done");
        assert_eq!(finished.progress_percent, None);
        let resumed = set_subproject_progress(&conn, sub.id, "doing", None, Some("   ")).unwrap();
        assert_eq!(resumed.status, "active");
        assert_eq!(resumed.progress_percent, None);
        assert_eq!(resumed.next_title.as_deref(), Some("报价"));
        assert!(set_subproject_progress(&conn, sub.id, "doing", Some(140), None).is_err());
        assert_eq!(list_work_logs(&conn, Some(project.id)).unwrap().len(), 1);
        let periodic = create_subproject(
            &conn,
            &NewSubproject {
                project_id: project.id,
                kind: "periodic".into(),
                name: "晨间记录".into(),
                important: false,
                progress: String::new(),
                due_at: None,
                repeat_days: Some("1,2,3,4,5".into()),
                remind: true,
                remind_at: Some("09:00".into()),
                progress_percent: None,
            },
        )
        .unwrap();
        assert_eq!(periodic.kind, "periodic");
        assert_eq!(periodic.repeat_days.as_deref(), Some("1,2,3,4,5"));
        assert_eq!(periodic.remind_at.as_deref(), Some("09:00"));
    }

    #[test]
    fn delete_removes_the_project_and_its_children() {
        let conn = memory();
        let project = create_project(
            &conn,
            &NewProject {
                name: "客户线".into(),
                outcome: "这个月交付".into(),
                status: "active".into(),
                pause_project_id: None,
            },
        )
        .unwrap();
        let sub = create_subproject(
            &conn,
            &NewSubproject {
                project_id: project.id,
                kind: "regular".into(),
                name: "报价".into(),
                important: true,
                progress: "doing".into(),
                due_at: None,
                repeat_days: None,
                remind: false,
                remind_at: None,
                progress_percent: None,
            },
        )
        .unwrap();
        let item_id: i64 = conn
            .query_row("SELECT id FROM items WHERE subproject_id = ?1", [sub.id], |row| row.get(0))
            .unwrap();
        conn.execute(
            "INSERT INTO today_slots (day, position, item_id) VALUES ('2026-11-01', 1, ?1)",
            [item_id],
        )
        .unwrap();
        delete_subproject(&conn, sub.id).unwrap();
        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects WHERE id = ?1", [project.id], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 1);
        assert!(delete_subproject(&conn, sub.id).unwrap_err().contains("找不到"));
        delete_project(&conn, project.id).unwrap();
        let projects: i64 = conn.query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0)).unwrap();
        let subs: i64 = conn.query_row("SELECT COUNT(*) FROM subprojects", [], |row| row.get(0)).unwrap();
        let items: i64 = conn.query_row("SELECT COUNT(*) FROM items", [], |row| row.get(0)).unwrap();
        let slots: i64 = conn.query_row("SELECT COUNT(*) FROM today_slots", [], |row| row.get(0)).unwrap();
        assert_eq!((projects, subs, items, slots), (0, 0, 0, 0));
    }

    #[test]
    fn demo_seed_is_idempotent_and_covers_the_board() {
        let conn = memory();
        seed_demo(&conn).unwrap();
        seed_demo(&conn).unwrap();
        let active_projects: i64 = conn.query_row("SELECT COUNT(*) FROM projects WHERE status = 'active'", [], |row| row.get(0)).unwrap();
        let active_subs: i64 = conn.query_row("SELECT COUNT(*) FROM subprojects WHERE status = 'active'", [], |row| row.get(0)).unwrap();
        let inbox: i64 = conn.query_row("SELECT COUNT(*) FROM items WHERE kind = 'inbox' AND status = 'inbox'", [], |row| row.get(0)).unwrap();
        let waiting: i64 = conn.query_row("SELECT COUNT(*) FROM items WHERE kind = 'waiting' AND status = 'open'", [], |row| row.get(0)).unwrap();
        let dailies: i64 = conn.query_row("SELECT COUNT(*) FROM items WHERE kind = 'daily'", [], |row| row.get(0)).unwrap();
        let slots: i64 = conn.query_row("SELECT COUNT(*) FROM today_slots", [], |row| row.get(0)).unwrap();
        let logs: i64 = conn.query_row("SELECT COUNT(*) FROM activity_logs WHERE match_source = 'ai'", [], |row| row.get(0)).unwrap();
        assert_eq!(active_projects, 3);
        assert_eq!(active_subs, 5);
        assert_eq!(inbox, 3);
        assert_eq!(waiting, 2);
        assert!(dailies >= 6);
        assert_eq!(slots, 3);
        assert_eq!(logs, 2);
        assert_eq!(get_setting(&conn, "ai_model").unwrap().as_deref(), Some("openai/gpt-6-luna"));
    }
}
