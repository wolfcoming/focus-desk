use chrono::Duration;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::judge::{
    class_name, parse_class, verdict_name, CurrentWork, InterruptClass, Judgment, Verdict,
};
use crate::timeutil::{self, now, parse_stored};

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
    pub description: String,
    pub target_date: Option<String>,
    pub status: String,
    pub last_touched_at: String,
    pub next_title: Option<String>,
    pub kind: String,
    pub progress: String,
    pub important: Option<bool>,
    pub urgent: Option<bool>,
    pub due_at: Option<String>,
    pub repeat_days: Option<String>,
    pub remind_at: Option<String>,
    pub progress_percent: Option<i64>,
    pub quadrant: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkLog {
    pub id: i64,
    pub subproject_id: i64,
    pub body: String,
    pub progress: String,
    pub progress_percent: Option<i64>,
    pub kind: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeaTag {
    pub id: i64,
    pub subproject_id: i64,
    pub body: String,
    pub color: String,
    pub sort_order: i64,
    pub pos_x: f64,
    pub pos_y: f64,
    pub z_index: i64,
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
    pub urgent: Option<bool>,
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
    pub completed_count: i64,
    pub todos: Vec<Item>,
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
    pub urgent: Option<bool>,
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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSubproject {
    pub project_id: i64,
    pub kind: String,
    pub name: String,
    pub description: String,
    pub important: bool,
    pub urgent: bool,
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
  description TEXT NOT NULL DEFAULT '',
  target_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','paused','done','archived')),
  last_touched_at TEXT NOT NULL,
  stall_snooze_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('inbox','task','daily','waiting','someday','todo')),
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
CREATE TABLE IF NOT EXISTS today_completions (
  day TEXT NOT NULL,
  item_id INTEGER NOT NULL REFERENCES items(id),
  completed_at TEXT NOT NULL,
  PRIMARY KEY (day, item_id)
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
  kind TEXT NOT NULL DEFAULT 'key',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idea_tags (
  id INTEGER PRIMARY KEY,
  subproject_id INTEGER NOT NULL REFERENCES subprojects(id),
  body TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'soft',
  sort_order INTEGER NOT NULL DEFAULT 0,
  pos_x REAL NOT NULL DEFAULT 20,
  pos_y REAL NOT NULL DEFAULT 20,
  z_index INTEGER NOT NULL DEFAULT 0,
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
       i.important, i.urgent, i.due_at, i.estimate_min, i.status,
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
    ensure_column(conn, "subprojects", "description", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(conn, "items", "urgent", "INTEGER NOT NULL DEFAULT 0")?;
    if ensure_column(conn, "subprojects", "sort_order", "INTEGER NOT NULL DEFAULT 0")? {
        backfill_subproject_sort_orders(conn)?;
    }
    ensure_items_allow_todo(conn)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS today_completions (
           day TEXT NOT NULL,
           item_id INTEGER NOT NULL REFERENCES items(id),
           completed_at TEXT NOT NULL,
           PRIMARY KEY (day, item_id)
         );",
    )
    .map_err(|err| err.to_string())?;
    // key=关键进展流；work=调整进度时的工作日志
    ensure_column(conn, "work_logs", "kind", "TEXT NOT NULL DEFAULT 'key'")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS idea_tags (
           id INTEGER PRIMARY KEY,
           subproject_id INTEGER NOT NULL REFERENCES subprojects(id),
           body TEXT NOT NULL,
           color TEXT NOT NULL DEFAULT 'soft',
           sort_order INTEGER NOT NULL DEFAULT 0,
           pos_x REAL NOT NULL DEFAULT 20,
           pos_y REAL NOT NULL DEFAULT 20,
           z_index INTEGER NOT NULL DEFAULT 0,
           created_at TEXT NOT NULL
         );",
    )
    .map_err(|err| err.to_string())?;
    ensure_column(conn, "idea_tags", "pos_x", "REAL NOT NULL DEFAULT 20")?;
    ensure_column(conn, "idea_tags", "pos_y", "REAL NOT NULL DEFAULT 20")?;
    ensure_column(conn, "idea_tags", "z_index", "INTEGER NOT NULL DEFAULT 0")?;
    Ok(())
}

fn note_today_focus_completion(conn: &Connection, id: i64, stamp: &str) -> Result<(), String> {
    let day = timeutil::today_key(now());
    let in_today = conn
        .query_row(
            "SELECT 1 FROM today_slots WHERE day = ?1 AND item_id = ?2",
            params![day, id],
            |_| Ok(1i64),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .is_some();
    if !in_today {
        return Ok(());
    }
    // 完成后仍留在槽位上展示，仅记入今日完成数
    conn.execute(
        "INSERT INTO today_completions (day, item_id, completed_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(day, item_id) DO UPDATE SET completed_at = excluded.completed_at",
        params![day, id, stamp],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

fn ensure_items_allow_todo(conn: &Connection) -> Result<(), String> {
    let sql: Option<String> = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    let Some(sql) = sql else {
        return Ok(());
    };
    if sql.contains("'todo'") {
        return Ok(());
    }
    conn.execute_batch(
        r#"
PRAGMA foreign_keys = OFF;
CREATE TABLE items__todo_mig (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('inbox','task','daily','waiting','someday','todo')),
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  project_id INTEGER REFERENCES projects(id),
  subproject_id INTEGER REFERENCES subprojects(id),
  important INTEGER,
  urgent INTEGER NOT NULL DEFAULT 0,
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
INSERT INTO items__todo_mig (
  id, kind, title, notes, project_id, subproject_id, important, urgent, due_at, estimate_min, status,
  repeat_days, window_start, window_end, grace_min, interrupt_after_grace, waiting_on, follow_up_at,
  started_at, snooze_until, created_at, updated_at, completed_at
)
SELECT
  id, kind, title, notes, project_id, subproject_id, important, COALESCE(urgent, 0), due_at, estimate_min, status,
  repeat_days, window_start, window_end, grace_min, interrupt_after_grace, waiting_on, follow_up_at,
  started_at, snooze_until, created_at, updated_at, completed_at
FROM items;
DROP TABLE items;
ALTER TABLE items__todo_mig RENAME TO items;
PRAGMA foreign_keys = ON;
"#,
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<bool, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|err| err.to_string())?;
    let names = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    if names.iter().any(|name| name == column) {
        return Ok(false);
    }
    conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"), [])
        .map_err(|err| err.to_string())?;
    Ok(true)
}

fn backfill_subproject_sort_orders(conn: &Connection) -> Result<(), String> {
    let project_ids: Vec<i64> = {
        let mut stmt = conn
            .prepare("SELECT DISTINCT project_id FROM subprojects")
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get(0))
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())?
    };
    for project_id in project_ids {
        let ids: Vec<i64> = {
            let mut stmt = conn
                .prepare(
                    "SELECT id FROM subprojects WHERE project_id = ?1
                     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, id DESC",
                )
                .map_err(|err| err.to_string())?;
            let rows = stmt
                .query_map(params![project_id], |row| row.get(0))
                .map_err(|err| err.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())?
        };
        for (index, id) in ids.into_iter().enumerate() {
            conn.execute(
                "UPDATE subprojects SET sort_order = ?2 WHERE id = ?1",
                params![id, index as i64],
            )
            .map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

fn next_sub_sort_order(conn: &Connection, project_id: i64) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM subprojects WHERE project_id = ?1",
        params![project_id],
        |row| row.get(0),
    )
    .map_err(|err| err.to_string())
}

const SUB_FROM: &str = "
SELECT s.id, s.project_id, p.name, s.name, COALESCE(s.description, ''), s.target_date, s.status, s.last_touched_at,
       (SELECT i.title FROM items i WHERE i.subproject_id = s.id AND i.kind = 'task' AND i.status IN ('open','doing') ORDER BY CASE i.status WHEN 'doing' THEN 0 ELSE 1 END, i.id LIMIT 1),
       COALESCE(s.kind, 'regular'),
       COALESCE(s.progress, ''),
       (SELECT i.important FROM items i WHERE i.subproject_id = s.id AND i.kind = 'task' ORDER BY i.id LIMIT 1),
       (SELECT i.urgent FROM items i WHERE i.subproject_id = s.id AND i.kind = 'task' ORDER BY i.id LIMIT 1),
       COALESCE(
         (SELECT i.due_at FROM items i WHERE i.subproject_id = s.id AND i.kind = 'task' ORDER BY i.id LIMIT 1),
         s.target_date
       ),
       (SELECT i.repeat_days FROM items i WHERE i.subproject_id = s.id AND i.kind = 'daily' ORDER BY i.id LIMIT 1),
       (SELECT i.window_start FROM items i WHERE i.subproject_id = s.id AND i.kind = 'daily' ORDER BY i.id LIMIT 1),
       s.progress_percent,
       COALESCE(s.sort_order, 0)
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
) -> Result<Project, String> {
    if !matches!(status, "upcoming" | "active" | "paused" | "archived") {
        return Err("状态无效".into());
    }
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
         ORDER BY COALESCE(s.sort_order, 0), s.id"
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
    let due = if kind == "regular" {
        normalize_optional(input.due_at.as_deref())?
    } else {
        None
    };
    let description = input.description.trim().to_string();
    let sort_order = next_sub_sort_order(&tx, input.project_id)?;
    tx.execute(
        "INSERT INTO subprojects (project_id, name, description, target_date, status, last_touched_at, created_at, updated_at, kind, progress, progress_percent, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?6, ?7, ?8, ?9, ?10)",
        params![input.project_id, name, description, due, status, stamp, kind, progress, progress_percent, sort_order],
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
             VALUES ('daily', ?1, ?2, ?3, ?4, 'open', ?5, ?6, ?7, ?8, 0, ?9, ?9)",
            params![name, description, input.project_id, sub_id, repeat, window_start, window_end, grace, stamp],
        )
        .map_err(|err| err.to_string())?;
    } else {
        let item_status = if progress == "done" { "done" } else { "open" };
        let completed = if progress == "done" { Some(stamp.as_str()) } else { None };
        tx.execute(
            "INSERT INTO items (kind, title, notes, project_id, subproject_id, important, urgent, due_at, status, interrupt_after_grace, created_at, updated_at, completed_at)
             VALUES ('task', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?9, ?10)",
            params![
                name,
                description,
                input.project_id,
                sub_id,
                bool_int(input.important),
                bool_int(input.urgent),
                due,
                item_status,
                stamp,
                completed
            ],
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
    let stamp = timeutil::now_iso();
    if status == "active" {
        let kind: String = tx
            .query_row(
                "SELECT COALESCE(kind, 'regular') FROM subprojects WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|_| "找不到这个子任务".to_string())?;
        if kind != "periodic" {
            ensure_open_task_tx(&tx, id, &stamp)?;
        }
        let changed = tx
            .execute(
                "UPDATE subprojects SET status = 'active', progress = CASE WHEN progress = '' OR progress = 'not_started' THEN 'doing' ELSE progress END, updated_at = ?2, last_touched_at = ?2 WHERE id = ?1",
                params![id, stamp],
            )
            .map_err(|err| err.to_string())?;
        if changed != 1 {
            return Err("找不到这个子任务".into());
        }
    } else {
        let changed = tx
            .execute(
                "UPDATE subprojects SET status = ?2, updated_at = ?3, last_touched_at = ?3 WHERE id = ?1",
                params![id, status, stamp],
            )
            .map_err(|err| err.to_string())?;
        if changed != 1 {
            return Err("找不到这个子任务".into());
        }
    }
    tx.commit().map_err(|err| err.to_string())?;
    get_subproject(conn, id)
}

pub fn rename_subproject(conn: &Connection, id: i64, name: &str) -> Result<Subproject, String> {
    let current = get_subproject(conn, id)?;
    update_subproject(conn, id, name, &current.description)
}

pub fn update_subproject(conn: &Connection, id: i64, name: &str, description: &str) -> Result<Subproject, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("子任务需要一个名称".into());
    }
    let description = description.trim().to_string();
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    let (old_name, kind): (String, String) = tx
        .query_row(
            "SELECT name, COALESCE(kind, 'regular') FROM subprojects WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "找不到这个子任务".to_string())?;
    let stamp = timeutil::now_iso();
    let changed = tx
        .execute(
            "UPDATE subprojects SET name = ?2, description = ?3, updated_at = ?4 WHERE id = ?1",
            params![id, name, description, stamp],
        )
        .map_err(|err| err.to_string())?;
    if changed != 1 {
        return Err("找不到这个子任务".into());
    }
    let item_kind = if kind == "periodic" { "daily" } else { "task" };
    let renamed = tx
        .execute(
            "UPDATE items SET title = ?3, notes = ?4, updated_at = ?5
             WHERE subproject_id = ?1 AND kind = ?2 AND title = ?6",
            params![id, item_kind, name, description, stamp, old_name],
        )
        .map_err(|err| err.to_string())?;
    if renamed == 0 {
        tx.execute(
            "UPDATE items SET title = ?3, notes = ?4, updated_at = ?5
             WHERE id = (
               SELECT id FROM items
               WHERE subproject_id = ?1 AND kind = ?2 AND status IN ('open','doing')
               ORDER BY CASE status WHEN 'doing' THEN 0 ELSE 1 END, id
               LIMIT 1
             )",
            params![id, item_kind, name, description, stamp],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())?;
    get_subproject(conn, id)
}

pub fn add_work_log(conn: &Connection, subproject_id: i64, body: &str) -> Result<WorkLog, String> {
    insert_work_log(conn, subproject_id, body, "key")
}

fn insert_work_log(conn: &Connection, subproject_id: i64, body: &str, kind: &str) -> Result<WorkLog, String> {
    let body = body.trim();
    if body.is_empty() {
        return Err(if kind == "work" {
            "写一下工作日志".into()
        } else {
            "写一下关键进展".into()
        });
    }
    let (progress, percent): (String, Option<i64>) = conn
        .query_row(
            "SELECT COALESCE(progress, ''), progress_percent FROM subprojects WHERE id = ?1",
            params![subproject_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "找不到这个子任务".to_string())?;
    let stamp = timeutil::now_iso();
    conn.execute(
        "INSERT INTO work_logs (subproject_id, body, progress, progress_percent, kind, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![subproject_id, body, progress, percent, kind, stamp],
    )
    .map_err(|err| err.to_string())?;
    let id = conn.last_insert_rowid();
    touch_subproject(conn, subproject_id)?;
    get_work_log(conn, id)
}

pub fn update_work_log(conn: &Connection, id: i64, body: &str) -> Result<WorkLog, String> {
    let body = body.trim();
    if body.is_empty() {
        return Err("写一下内容".into());
    }
    let changed = conn
        .execute("UPDATE work_logs SET body = ?2 WHERE id = ?1", params![id, body])
        .map_err(|err| err.to_string())?;
    if changed != 1 {
        return Err("找不到这条记录".into());
    }
    get_work_log(conn, id)
}

pub fn delete_work_log(conn: &Connection, id: i64) -> Result<(), String> {
    let changed = conn
        .execute("DELETE FROM work_logs WHERE id = ?1", params![id])
        .map_err(|err| err.to_string())?;
    if changed != 1 {
        return Err("找不到这条记录".into());
    }
    Ok(())
}

fn normalize_idea_color(color: &str) -> String {
    match color.trim() {
        "amber" | "mint" | "rose" | "soft" => color.trim().into(),
        _ => "soft".into(),
    }
}

fn clamp_idea_pos(value: f64) -> f64 {
    if value.is_nan() {
        return 20.0;
    }
    value.clamp(2.0, 98.0)
}

fn map_idea_tag(row: &rusqlite::Row<'_>) -> rusqlite::Result<IdeaTag> {
    Ok(IdeaTag {
        id: row.get(0)?,
        subproject_id: row.get(1)?,
        body: row.get(2)?,
        color: row.get(3)?,
        sort_order: row.get(4)?,
        pos_x: row.get(5)?,
        pos_y: row.get(6)?,
        z_index: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn get_idea_tag(conn: &Connection, id: i64) -> Result<IdeaTag, String> {
    conn.query_row(
        "SELECT id, subproject_id, body, color, sort_order,
                COALESCE(pos_x, 20), COALESCE(pos_y, 20), COALESCE(z_index, 0), created_at
         FROM idea_tags WHERE id = ?1",
        params![id],
        map_idea_tag,
    )
    .map_err(|_| "找不到这张灵感标签".into())
}

fn next_idea_z(conn: &Connection, subproject_id: i64) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(MAX(z_index), 0) + 1 FROM idea_tags WHERE subproject_id = ?1",
        params![subproject_id],
        |row| row.get(0),
    )
    .map_err(|err| err.to_string())
}

pub fn list_idea_tags(conn: &Connection, subproject_id: i64) -> Result<Vec<IdeaTag>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, subproject_id, body, color, sort_order,
                    COALESCE(pos_x, 20), COALESCE(pos_y, 20), COALESCE(z_index, 0), created_at
             FROM idea_tags WHERE subproject_id = ?1
             ORDER BY z_index ASC, id ASC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![subproject_id], map_idea_tag)
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())
}

pub fn add_idea_tag(
    conn: &Connection,
    subproject_id: i64,
    body: &str,
    color: &str,
    pos_x: f64,
    pos_y: f64,
) -> Result<IdeaTag, String> {
    let body = body.trim();
    if body.is_empty() {
        return Err("写一下灵感内容".into());
    }
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM subprojects WHERE id = ?1",
            params![subproject_id],
            |row| row.get(0),
        )
        .map_err(|err| err.to_string())?;
    if exists != 1 {
        return Err("找不到这个子任务".into());
    }
    let color = normalize_idea_color(color);
    let sort_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM idea_tags WHERE subproject_id = ?1",
            params![subproject_id],
            |row| row.get(0),
        )
        .map_err(|err| err.to_string())?;
    let z_index = next_idea_z(conn, subproject_id)?;
    let stamp = timeutil::now_iso();
    conn.execute(
        "INSERT INTO idea_tags (subproject_id, body, color, sort_order, pos_x, pos_y, z_index, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            subproject_id,
            body,
            color,
            sort_order,
            clamp_idea_pos(pos_x),
            clamp_idea_pos(pos_y),
            z_index,
            stamp
        ],
    )
    .map_err(|err| err.to_string())?;
    get_idea_tag(conn, conn.last_insert_rowid())
}

pub fn update_idea_tag(conn: &Connection, id: i64, body: &str, color: &str) -> Result<IdeaTag, String> {
    let body = body.trim();
    if body.is_empty() {
        return Err("写一下灵感内容".into());
    }
    let color = normalize_idea_color(color);
    let changed = conn
        .execute(
            "UPDATE idea_tags SET body = ?2, color = ?3 WHERE id = ?1",
            params![id, body, color],
        )
        .map_err(|err| err.to_string())?;
    if changed != 1 {
        return Err("找不到这张灵感标签".into());
    }
    get_idea_tag(conn, id)
}

pub fn move_idea_tag(conn: &Connection, id: i64, pos_x: f64, pos_y: f64) -> Result<IdeaTag, String> {
    let subproject_id: i64 = conn
        .query_row(
            "SELECT subproject_id FROM idea_tags WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|_| "找不到这张灵感标签".to_string())?;
    let z_index = next_idea_z(conn, subproject_id)?;
    let changed = conn
        .execute(
            "UPDATE idea_tags SET pos_x = ?2, pos_y = ?3, z_index = ?4 WHERE id = ?1",
            params![id, clamp_idea_pos(pos_x), clamp_idea_pos(pos_y), z_index],
        )
        .map_err(|err| err.to_string())?;
    if changed != 1 {
        return Err("找不到这张灵感标签".into());
    }
    get_idea_tag(conn, id)
}

pub fn delete_idea_tag(conn: &Connection, id: i64) -> Result<(), String> {
    let changed = conn
        .execute("DELETE FROM idea_tags WHERE id = ?1", params![id])
        .map_err(|err| err.to_string())?;
    if changed != 1 {
        return Err("找不到这张灵感标签".into());
    }
    Ok(())
}

fn get_work_log(conn: &Connection, id: i64) -> Result<WorkLog, String> {
    conn.query_row(
        "SELECT id, subproject_id, body, progress, progress_percent, COALESCE(kind, 'key'), created_at
         FROM work_logs WHERE id = ?1",
        params![id],
        |row| {
            Ok(WorkLog {
                id: row.get(0)?,
                subproject_id: row.get(1)?,
                body: row.get(2)?,
                progress: row.get(3)?,
                progress_percent: row.get(4)?,
                kind: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    )
    .map_err(|_| "找不到这条记录".to_string())
}

pub fn set_subproject_due(conn: &Connection, id: i64, due_at: Option<&str>) -> Result<Subproject, String> {
    let due = normalize_optional(due_at)?;
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    let kind: String = tx
        .query_row(
            "SELECT COALESCE(kind, 'regular') FROM subprojects WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|_| "找不到这个子任务".to_string())?;
    if kind == "periodic" {
        return Err("周期性任务没有截止时间".into());
    }
    let stamp = timeutil::now_iso();
    let changed = tx
        .execute(
            "UPDATE subprojects SET target_date = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, due, stamp],
        )
        .map_err(|err| err.to_string())?;
    if changed != 1 {
        return Err("找不到这个子任务".into());
    }
    tx.execute(
        "UPDATE items SET due_at = ?2, updated_at = ?3
         WHERE subproject_id = ?1 AND kind = 'task'",
        params![id, due, stamp],
    )
    .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    get_subproject(conn, id)
}

pub fn set_subproject_repeat(conn: &Connection, id: i64, repeat_days: &str) -> Result<Subproject, String> {
    let repeat = normalize_repeat(Some(repeat_days))?;
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    let kind: String = tx
        .query_row(
            "SELECT COALESCE(kind, 'regular') FROM subprojects WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|_| "找不到这个子任务".to_string())?;
    if kind != "periodic" {
        return Err("只有周期性任务才能改重复日期".into());
    }
    let stamp = timeutil::now_iso();
    tx.execute(
        "UPDATE subprojects SET updated_at = ?2 WHERE id = ?1",
        params![id, stamp],
    )
    .map_err(|err| err.to_string())?;
    let changed = tx
        .execute(
            "UPDATE items SET repeat_days = ?2, updated_at = ?3
             WHERE subproject_id = ?1 AND kind = 'daily'",
            params![id, repeat, stamp],
        )
        .map_err(|err| err.to_string())?;
    if changed == 0 {
        return Err("找不到这条周期性任务".into());
    }
    tx.commit().map_err(|err| err.to_string())?;
    get_subproject(conn, id)
}

pub fn set_subproject_reminder(
    conn: &Connection,
    id: i64,
    remind: bool,
    remind_at: Option<&str>,
) -> Result<Subproject, String> {
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    let kind: String = tx
        .query_row(
            "SELECT COALESCE(kind, 'regular') FROM subprojects WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|_| "找不到这个子任务".to_string())?;
    if kind != "periodic" {
        return Err("只有周期性任务才有提醒设置".into());
    }
    let (start, end, grace) = if remind {
        let start = remind_at.unwrap_or("").trim();
        if !timeutil::valid_hhmm(start) {
            return Err("打开定时提醒后，要选一个时间".into());
        }
        let end = remind_window_end(start);
        (Some(start.to_string()), Some(end), Some(12 * 60))
    } else {
        (None, None, None)
    };
    let stamp = timeutil::now_iso();
    tx.execute(
        "UPDATE subprojects SET updated_at = ?2 WHERE id = ?1",
        params![id, stamp],
    )
    .map_err(|err| err.to_string())?;
    let changed = tx
        .execute(
            "UPDATE items SET window_start = ?2, window_end = ?3, grace_min = ?4, updated_at = ?5
             WHERE subproject_id = ?1 AND kind = 'daily'",
            params![id, start, end, grace, stamp],
        )
        .map_err(|err| err.to_string())?;
    if changed == 0 {
        return Err("找不到这条周期性任务的提醒".into());
    }
    tx.commit().map_err(|err| err.to_string())?;
    get_subproject(conn, id)
}

pub fn set_subproject_quadrant(
    conn: &Connection,
    id: i64,
    important: bool,
    urgent: bool,
) -> Result<Subproject, String> {
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    let kind: String = tx
        .query_row(
            "SELECT COALESCE(kind, 'regular') FROM subprojects WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|_| "找不到这个子任务".to_string())?;
    if kind == "periodic" {
        return Err("周期性任务没有四象限".into());
    }
    let stamp = timeutil::now_iso();
    let changed = tx
        .execute(
            "UPDATE items SET important = ?2, urgent = ?3, updated_at = ?4
             WHERE subproject_id = ?1 AND kind = 'task'",
            params![id, bool_int(important), bool_int(urgent), stamp],
        )
        .map_err(|err| err.to_string())?;
    if changed == 0 {
        return Err("这个子任务还没有可改的任务项".into());
    }
    tx.execute(
        "UPDATE subprojects SET updated_at = ?2 WHERE id = ?1",
        params![id, stamp],
    )
    .map_err(|err| err.to_string())?;
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
        ensure_open_task_tx(&tx, id, &stamp)?;
    }
    let body = log.unwrap_or("").trim();
    if !body.is_empty() {
        tx.execute(
            "INSERT INTO work_logs (subproject_id, body, progress, progress_percent, kind, created_at)
             VALUES (?1, ?2, ?3, ?4, 'work', ?5)",
            params![id, body, progress, progress_percent, stamp],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())?;
    get_subproject(conn, id)
}

fn ensure_open_task_tx(tx: &Connection, sub_id: i64, stamp: &str) -> Result<(), String> {
    let open: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM items WHERE subproject_id = ?1 AND kind = 'task' AND status IN ('open','doing')",
            params![sub_id],
            |row| row.get(0),
        )
        .map_err(|err| err.to_string())?;
    if open > 0 {
        return Ok(());
    }
    let reopened = tx
        .execute(
            "UPDATE items SET status = 'open', completed_at = NULL, updated_at = ?2, snooze_until = NULL
             WHERE id = (
               SELECT id FROM items WHERE subproject_id = ?1 AND kind = 'task' AND status = 'done'
               ORDER BY id LIMIT 1
             )",
            params![sub_id, stamp],
        )
        .map_err(|err| err.to_string())?;
    if reopened > 0 {
        return Ok(());
    }
    let (name, description, project_id): (String, String, i64) = tx
        .query_row(
            "SELECT name, COALESCE(description, ''), project_id FROM subprojects WHERE id = ?1",
            params![sub_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "找不到这个子任务".to_string())?;
    tx.execute(
        "INSERT INTO items (kind, title, notes, project_id, subproject_id, important, urgent, due_at, status, interrupt_after_grace, created_at, updated_at)
         VALUES ('task', ?1, ?2, ?3, ?4, 0, 0, NULL, 'open', 0, ?5, ?5)",
        params![name, description, project_id, sub_id, stamp],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

pub fn list_work_logs(conn: &Connection, project_id: Option<i64>) -> Result<Vec<WorkLog>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT w.id, w.subproject_id, w.body, w.progress, w.progress_percent,
                    COALESCE(w.kind, 'key'), w.created_at
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
                kind: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())
}

fn purge_items(conn: &Connection, id_query: &str, id: i64) -> Result<(), String> {
    let run = |sql: String| conn.execute(&sql, params![id]).map(|_| ()).map_err(|err| err.to_string());
    run(format!("DELETE FROM today_slots WHERE item_id IN ({id_query})"))?;
    run(format!("DELETE FROM today_completions WHERE item_id IN ({id_query})"))?;
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
    tx.execute("DELETE FROM idea_tags WHERE subproject_id = ?1", params![id])
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
    tx.execute(
        "DELETE FROM idea_tags WHERE subproject_id IN (SELECT id FROM subprojects WHERE project_id = ?1)",
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
         VALUES ('todo', ?1, '', 'open', 0, ?2, ?2)",
        params![title, stamp],
    )
    .map_err(|err| err.to_string())?;
    get_item(conn, conn.last_insert_rowid())
}

pub fn capture_inbox(conn: &Connection, title: &str) -> Result<Item, String> {
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
            if existing.status == "done" && prepared.kind == "todo" && existing.kind == "todo" {
                prepared.status = "done".into();
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
        let sort_order = next_sub_sort_order(&tx, project_id)?;
        tx.execute(
            "INSERT INTO subprojects (project_id, name, description, target_date, status, last_touched_at, created_at, updated_at, kind, progress, progress_percent, sort_order)
             VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5, ?5, 'regular', 'doing', NULL, ?6)",
            params![project_id, prepared.title, prepared.notes, prepared.due_at, stamp, sort_order],
        )
        .map_err(|err| err.to_string())?;
        prepared.subproject_id = Some(tx.last_insert_rowid());
    }
    if prepared.kind == "task" {
        if let Some(sub_id) = prepared.subproject_id {
            activate_subproject(&tx, sub_id)?;
            tx.execute(
                "UPDATE subprojects SET target_date = ?2, updated_at = ?3 WHERE id = ?1",
                params![sub_id, prepared.due_at, stamp],
            )
            .map_err(|err| err.to_string())?;
        }
    }
    let id = if let Some(id) = draft.id {
        let changed = tx
            .execute(
                "UPDATE items SET kind=?2, title=?3, notes=?4, project_id=?5, subproject_id=?6, important=?7, urgent=?8,
                 due_at=?9, estimate_min=?10, status=?11, repeat_days=?12, window_start=?13, window_end=?14,
                 grace_min=?15, interrupt_after_grace=?16, waiting_on=?17, follow_up_at=?18, updated_at=?19, snooze_until=NULL
                 WHERE id=?1",
                params![
                    id, prepared.kind, prepared.title, prepared.notes, prepared.project_id, prepared.subproject_id,
                    prepared.important, prepared.urgent.unwrap_or(0), prepared.due_at, prepared.estimate_min, prepared.status, prepared.repeat_days,
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
            "INSERT INTO items (kind, title, notes, project_id, subproject_id, important, urgent, due_at, estimate_min, status,
             repeat_days, window_start, window_end, grace_min, interrupt_after_grace, waiting_on, follow_up_at, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?18)",
            params![
                prepared.kind, prepared.title, prepared.notes, prepared.project_id, prepared.subproject_id,
                prepared.important, prepared.urgent.unwrap_or(0), prepared.due_at, prepared.estimate_min, prepared.status, prepared.repeat_days,
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
    note_today_focus_completion(conn, id, &stamp)?;
    if item.kind == "todo" {
        return get_item(conn, id);
    }
    if let Some(sub_id) = item.subproject_id {
        let kind: String = conn
            .query_row(
                "SELECT COALESCE(kind, 'regular') FROM subprojects WHERE id = ?1",
                params![sub_id],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "regular".into());
        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM items WHERE subproject_id = ?1 AND kind = 'task' AND status IN ('open','doing')",
                params![sub_id],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())?;
        if kind == "regular" && remaining == 0 {
            let _ = set_subproject_progress(conn, sub_id, "done", Some(100), None);
        } else {
            touch_subproject(conn, sub_id)?;
        }
    }
    get_item(conn, id)
}

pub fn set_todo_done(conn: &Connection, id: i64, done: bool) -> Result<Item, String> {
    let item = get_item(conn, id)?;
    if item.kind != "todo" {
        return Err("只有待办可以用勾选完成".into());
    }
    if done {
        return complete_task(conn, id);
    }
    let stamp = timeutil::now_iso();
    let changed = conn
        .execute(
            "UPDATE items SET status = 'open', completed_at = NULL, updated_at = ?2, snooze_until = NULL WHERE id = ?1",
            params![id, stamp],
        )
        .map_err(|err| err.to_string())?;
    if changed != 1 {
        return Err("找不到这条待办".into());
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
    let current: std::collections::HashSet<i64> = {
        let mut stmt = conn
            .prepare("SELECT item_id FROM today_slots WHERE day = ?1")
            .map_err(|err| err.to_string())?;
        stmt.query_map(params![day], |row| row.get(0))
            .map_err(|err| err.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())?
            .into_iter()
            .collect()
    };
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    tx.execute("DELETE FROM today_slots WHERE day = ?1", params![day])
        .map_err(|err| err.to_string())?;
    for (index, id) in ids.iter().enumerate() {
        let item = get_item(&tx, *id)?;
        if !matches!(item.kind.as_str(), "task" | "todo") {
            return Err("今日三件只能是任务或待办".into());
        }
        let keep_done = item.status == "done" && current.contains(id);
        let fresh_open = matches!(item.status.as_str(), "open" | "doing");
        if !keep_done && !fresh_open {
            return Err("今日三件只能放入未完成的任务或待办".into());
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
             WHERE t.day = ?1 AND i.status != 'dropped'
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
                && item.subproject_id.is_some()
                && timeutil::runs_on(item.repeat_days.as_deref().unwrap_or(""), moment)
        })
        .map(|item| {
            let state = daily_state(conn, item.id, &day, &item, moment)?;
            Ok(DailyView { item, state })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let mut todo_stmt = conn
        .prepare(&format!(
            "{ITEM_SELECT}
             WHERE i.kind = 'todo'
               AND i.status != 'dropped'
               AND (
                 i.status = 'open'
                 OR (i.status = 'done' AND i.completed_at IS NOT NULL AND substr(i.completed_at, 1, 10) = ?1)
               )
             ORDER BY CASE i.status WHEN 'open' THEN 0 ELSE 1 END, i.id DESC"
        ))
        .map_err(|err| err.to_string())?;
    let todos = todo_stmt
        .query_map(params![day], map_item)
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    let chores = list_items(conn, Some("task"))?
        .into_iter()
        .filter(|item| {
            item.important == Some(false)
                && item.urgent == Some(true)
                && matches!(item.status.as_str(), "open" | "doing")
        })
        .collect();

    let completed_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM today_completions WHERE day = ?1",
            params![day],
            |row| row.get(0),
        )
        .map_err(|err| err.to_string())?;

    Ok(TodayBoard {
        day,
        slots,
        completed_count,
        todos,
        dailies,
        chores,
        suggestions: rule_suggestions(conn)?,
    })
}

pub fn weekly_packet(conn: &Connection) -> Result<WeeklyPacket, String> {
    let moment = now();
    let inbox = list_items(conn, Some("todo"))?
        .into_iter()
        .filter(|item| item.status == "open" && item.project_id.is_none() && item.subproject_id.is_none())
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderTarget {
    pub page: String,
    pub project_id: Option<i64>,
    pub subproject_id: Option<i64>,
}

pub fn reminder_target(conn: &Connection) -> Result<ReminderTarget, String> {
    let reminder = load_reminder(conn)?.ok_or("没有进行中的提醒")?;
    if let Some(item_id) = reminder.item_id {
        let item = get_item(conn, item_id)?;
        if item.kind == "waiting" {
            return Ok(ReminderTarget {
                page: "projects".into(),
                project_id: item.project_id,
                subproject_id: None,
            });
        }
        if item.kind == "todo" {
            return Ok(ReminderTarget {
                page: "todos".into(),
                project_id: item.project_id,
                subproject_id: item.subproject_id,
            });
        }
        let project_id = item.project_id.or_else(|| {
            item.subproject_id
                .and_then(|sub_id| get_subproject(conn, sub_id).ok().map(|sub| sub.project_id))
        });
        return Ok(ReminderTarget {
            page: "projects".into(),
            project_id,
            subproject_id: item.subproject_id,
        });
    }
    if let Some(sub_id) = reminder.subproject_id {
        let sub = get_subproject(conn, sub_id)?;
        return Ok(ReminderTarget {
            page: "projects".into(),
            project_id: Some(sub.project_id),
            subproject_id: Some(sub.id),
        });
    }
    Err("这条提醒没有可打开的详情".into())
}

fn resolve_postpone_time(
    minutes: Option<i64>,
    at: Option<&str>,
    current: Option<chrono::DateTime<chrono::Local>>,
) -> Result<String, String> {
    let moment = now();
    match (minutes, at.map(str::trim).filter(|value| !value.is_empty())) {
        (Some(delta), None) if delta > 0 => {
            let base = current.filter(|due| *due > moment).unwrap_or(moment);
            Ok(timeutil::iso(base + Duration::minutes(delta)))
        }
        (None, Some(value)) => {
            let stamp = timeutil::parse_user_time(value)?;
            let due = parse_stored(&stamp).ok_or("自定义时间无效")?;
            if due <= moment {
                return Err("自定义时间要晚于现在".into());
            }
            Ok(stamp)
        }
        _ => Err("选一个推迟时长，或填自定义时间".into()),
    }
}

pub fn postpone_reminder_due(
    conn: &Connection,
    minutes: Option<i64>,
    at: Option<&str>,
) -> Result<(), String> {
    let reminder = load_reminder(conn)?.ok_or("没有进行中的提醒")?;
    let moment = now();
    if let Some(item_id) = reminder.item_id {
        let item = get_item(conn, item_id)?;
        match item.kind.as_str() {
            "task" => {
                let current = item.due_at.as_deref().and_then(parse_stored);
                let next = resolve_postpone_time(minutes, at, current)?;
                if let Some(sub_id) = item.subproject_id {
                    set_subproject_due(conn, sub_id, Some(&next))?;
                } else {
                    let stamp = timeutil::now_iso();
                    conn.execute(
                        "UPDATE items SET due_at = ?2, updated_at = ?3 WHERE id = ?1",
                        params![item_id, next, stamp],
                    )
                    .map_err(|err| err.to_string())?;
                }
                let until = parse_stored(&next).unwrap_or(moment);
                snooze_item(conn, item_id, ((until - moment).num_minutes()).max(1))?;
            }
            "waiting" | "todo" => {
                let current = item.follow_up_at.as_deref().and_then(parse_stored);
                let next = resolve_postpone_time(minutes, at, current)?;
                let stamp = timeutil::now_iso();
                conn.execute(
                    "UPDATE items SET follow_up_at = ?2, snooze_until = ?2, updated_at = ?3 WHERE id = ?1 AND kind IN ('waiting','todo')",
                    params![item_id, next, stamp],
                )
                .map_err(|err| err.to_string())?;
            }
            "daily" => {
                let next = resolve_postpone_time(minutes, at, None)?;
                let until = parse_stored(&next).ok_or("自定义时间无效")?;
                let minutes_until = (until - moment).num_minutes().max(1);
                snooze_item(conn, item_id, minutes_until)?;
            }
            _ => return Err("这类条目不能推迟截止时间".into()),
        }
    } else if let Some(sub_id) = reminder.subproject_id {
        let sub = get_subproject(conn, sub_id)?;
        let current = sub.due_at.as_deref().and_then(parse_stored);
        let next = resolve_postpone_time(minutes, at, current)?;
        set_subproject_due(conn, sub_id, Some(&next))?;
        let until = parse_stored(&next).unwrap_or(moment);
        snooze_subproject(conn, sub_id, ((until - moment).num_minutes()).max(1))?;
    } else {
        return Err("这条提醒没有可推迟的截止时间".into());
    }
    conn.execute(
        "INSERT INTO activity_logs (created_at, raw_text, matched_item_id, incoming_item_id, incoming_class, verdict, reason, accepted, snooze_min, match_source)
         VALUES (?1, '推迟截止时间', NULL, ?2, ?3, 'continue', '把截止或跟进时间往后挪了。', 1, 0, 'rules')",
        params![timeutil::now_iso(), reminder.item_id, class_name(reminder.class)],
    )
    .map_err(|err| err.to_string())?;
    clear_reminder(conn)?;
    Ok(())
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
    description: &str,
    target_date: Option<&str>,
    status: &str,
    touched: &str,
    snooze: Option<&str>,
    stamp: &str,
) -> Result<i64, String> {
    let sort_order = next_sub_sort_order(conn, project_id)?;
    conn.execute(
        "INSERT INTO subprojects (project_id, name, description, target_date, status, last_touched_at, stall_snooze_until, created_at, updated_at, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9)",
        params![project_id, name, description, target_date, status, touched, snooze, stamp, sort_order],
    )
    .map_err(|err| err.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn insert_periodic(
    conn: &Connection,
    project_id: i64,
    name: &str,
    repeat_days: &str,
    window_start: Option<&str>,
    window_end: Option<&str>,
    grace_min: Option<i64>,
    interrupt: i64,
    stamp: &str,
) -> Result<i64, String> {
    let sort_order = next_sub_sort_order(conn, project_id)?;
    conn.execute(
        "INSERT INTO subprojects (project_id, name, description, target_date, status, last_touched_at, created_at, updated_at, kind, progress, progress_percent, sort_order)
         VALUES (?1, ?2, '', NULL, 'active', ?3, ?3, ?3, 'periodic', '', NULL, ?4)",
        params![project_id, name, stamp, sort_order],
    )
    .map_err(|err| err.to_string())?;
    let sub_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO items (kind, title, notes, project_id, subproject_id, status, repeat_days, window_start, window_end, grace_min, interrupt_after_grace, created_at, updated_at)
         VALUES ('daily', ?1, '', ?2, ?3, 'open', ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![name, project_id, sub_id, repeat_days, window_start, window_end, grace_min, interrupt, stamp],
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
    let chore_id = insert_item(
        &tx, "task", "核对报名按钮", "不重要，今天到期，只进杂事，不单独弹窗。",
        Some(launch), Some(tracking), Some(0), Some(&timeutil::iso(chore_due)), None, "open",
        None, None, None, None, 0, None, None, None, None, None, &stamp,
    )?;
    tx.execute("UPDATE items SET urgent = 1 WHERE id = ?1", params![chore_id])
        .map_err(|err| err.to_string())?;
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
        Some(delivery), None, None, None, None, "open",
        None, None, None, None, 0, Some("客户王敏"), Some(&timeutil::iso(moment - Duration::hours(2))), None, None, None, &stamp,
    )?;
    insert_item(
        &tx, "waiting", "等设计交首页视觉", "",
        Some(launch), None, None, None, None, "open",
        None, None, None, None, 0, Some("设计组"), Some(&timeutil::iso(moment + Duration::days(1))), None, None, None, &stamp,
    )?;
    insert_item(&tx, "todo", "客户说合同还要改一版，不知道归到哪条线", "未挂靠待办，可关联到合同盖章。", None, None, None, None, None, "open", None, None, None, None, 0, None, None, None, None, None, &stamp)?;
    insert_item(&tx, "todo", "下周三之前把报价发出去", "未挂靠待办，有时间但还没变成任务。", None, None, None, None, None, "open", None, None, None, None, 0, None, None, None, None, None, &stamp)?;
    insert_item(&tx, "todo", "有空问问设计稿什么时候能看", "可能整理成阻塞项。", None, None, None, None, None, "open", None, None, None, None, 0, None, None, None, None, None, &stamp)?;

    let grace_end = clock(-90);
    let grace_start = clock(-120);
    let quiet_end = clock(-180);
    let quiet_start = clock(-210);
    let later_start = clock(180);
    let later_end = clock(210);
    let soft_start = clock(-20);
    let soft_end = clock(40);
    let habits = insert_project(&tx, "日常习惯", "按时间窗出现的周期性义务", "active", &stamp)?;
    let done_daily = insert_periodic(
        &tx, habits, "晨间记录", every_day, Some("06:30"), Some("07:00"), Some(15), 0, &stamp,
    )?;
    insert_periodic(
        &tx, habits, "过宽限后可以打断的检查", every_day, Some(&grace_start), Some(&grace_end), Some(20), 1, &stamp,
    )?;
    insert_periodic(
        &tx, habits, "过宽限但不打断的阅读", every_day, Some(&quiet_start), Some(&quiet_end), Some(15), 0, &stamp,
    )?;
    insert_periodic(
        &tx, habits, "现在这个时间窗里的伸展", every_day, Some(&soft_start), Some(&soft_end), Some(20), 0, &stamp,
    )?;
    insert_periodic(
        &tx, habits, "稍晚才开始的复盘", every_day, Some(&later_start), Some(&later_end), Some(15), 0, &stamp,
    )?;
    insert_periodic(
        &tx, habits, "不是今天的站会", &not_today, Some("09:00"), Some("09:20"), Some(10), 1, &stamp,
    )?;
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
    ensure_setting(&tx, "ai_model", "openai/gpt-4o-mini")?;
    tx.execute(
        "INSERT INTO settings (key, value) VALUES ('demo_seeded', '1')
         ON CONFLICT(key) DO UPDATE SET value = '1'",
        [],
    )
    .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(())
}

pub fn load_demo(conn: &Connection) -> Result<(), String> {
    if get_setting(conn, "demo_seeded")?.as_deref() == Some("1") {
        return Err("已经加载过示例数据".into());
    }
    seed_demo(conn)
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
        && (item.urgent == Some(true)
            || due_at.map(|due| due <= moment + Duration::minutes(30)).unwrap_or(false));
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
    urgent: Option<i64>,
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
            let important = draft.important.ok_or("选一下四象限")?;
            let urgent = draft.urgent.ok_or("选一下四象限")?;
            Ok(PreparedDraft {
                kind: "task".into(),
                title: title.into(),
                notes,
                project_id: Some(project_id),
                subproject_id: draft.subproject_id,
                important: Some(bool_int(important)),
                urgent: Some(bool_int(urgent)),
                due_at: normalize_optional(draft.due_at.as_deref())?,
                estimate_min: None,
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
        "todo" => {
            let (project_id, subproject_id) = match (draft.project_id, draft.subproject_id) {
                (None, None) => (None, None),
                (Some(project_id), None) => {
                    let _ = get_project(conn, project_id)?;
                    (Some(project_id), None)
                }
                (project_id, Some(sub_id)) => {
                    let sub = get_subproject(conn, sub_id)?;
                    let project_id = project_id.unwrap_or(sub.project_id);
                    if project_id != sub.project_id {
                        return Err("子任务不属于所选项目".into());
                    }
                    let _ = get_project(conn, project_id)?;
                    (Some(project_id), Some(sub_id))
                }
            };
            let due_at = normalize_optional(draft.due_at.as_deref())?;
            let follow_up_at = match draft.follow_up_at.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
                Some(value) => Some(timeutil::parse_user_time(value)?),
                None => None,
            };
            Ok(PreparedDraft {
                kind: "todo".into(),
                title: title.into(),
                notes,
                project_id,
                subproject_id,
                important: None,
                urgent: None,
                due_at,
                estimate_min: None,
                status: "open".into(),
                repeat_days: None,
                window_start: None,
                window_end: None,
                grace_min: None,
                interrupt: 0,
                waiting_on: None,
                follow_up_at,
            })
        }
        "daily" => Err("日常只能通过项目里的周期性子任务创建".into()),
        "waiting" => {
            let project_id = draft.project_id.ok_or("等待要挂在大项目上")?;
            let _ = get_project(conn, project_id)?;
            let waiting_on = draft.waiting_on.clone().unwrap_or_default();
            if waiting_on.trim().is_empty() {
                return Err("写一下在等什么".into());
            }
            let follow = draft.follow_up_at.clone().ok_or("写下次询问的时间")?;
            Ok(PreparedDraft {
                kind: "waiting".into(),
                title: title.into(),
                notes,
                project_id: Some(project_id),
                subproject_id: None,
                important: None,
                urgent: None,
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
        "someday" => Err("以后再说暂未开放".into()),
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
    let urgent_int: Option<i64> = row.get(12)?;
    let important = important_int.map(|value| value != 0);
    let urgent = urgent_int.map(|value| value != 0);
    let kind: String = row.get(9)?;
    let quadrant = if kind == "regular" {
        quadrant_label(important, urgent)
    } else {
        None
    };
    Ok(Subproject {
        id: row.get(0)?,
        project_id: row.get(1)?,
        project_name: row.get(2)?,
        name: row.get(3)?,
        description: row.get(4)?,
        target_date: row.get(5)?,
        status: row.get(6)?,
        last_touched_at: row.get(7)?,
        next_title: row.get(8)?,
        kind,
        progress: row.get(10)?,
        important,
        urgent,
        due_at: row.get(13)?,
        repeat_days: row.get(14)?,
        remind_at: row.get(15)?,
        progress_percent: row.get(16)?,
        quadrant,
        sort_order: row.get(17)?,
    })
}

pub fn reorder_subprojects(conn: &Connection, project_id: i64, ordered_ids: &[i64]) -> Result<(), String> {
    if ordered_ids.is_empty() {
        return Ok(());
    }
    let _ = get_project(conn, project_id)?;
    let existing: Vec<i64> = {
        let mut stmt = conn
            .prepare("SELECT id FROM subprojects WHERE project_id = ?1 ORDER BY COALESCE(sort_order, 0), id")
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![project_id], |row| row.get(0))
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())?
    };
    if existing.len() != ordered_ids.len() {
        return Err("子任务列表已变化，请刷新后再排".into());
    }
    let mut seen = existing.clone();
    seen.sort_unstable();
    let mut incoming = ordered_ids.to_vec();
    incoming.sort_unstable();
    if seen != incoming {
        return Err("只能调整当前大项目下的子任务顺序".into());
    }
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    let stamp = timeutil::now_iso();
    for (index, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE subprojects SET sort_order = ?2, updated_at = ?3 WHERE id = ?1 AND project_id = ?4",
            params![id, index as i64, stamp, project_id],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())?;
    Ok(())
}

fn map_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<Item> {
    let important_int: Option<i64> = row.get(6)?;
    let urgent_int: Option<i64> = row.get(7)?;
    let important = important_int.map(|value| value != 0);
    let urgent = urgent_int.map(|value| value != 0);
    let kind: String = row.get(1)?;
    let due_at: Option<String> = row.get(8)?;
    let quadrant = if kind == "task" {
        quadrant_label(important, urgent)
    } else {
        None
    };
    Ok(Item {
        id: row.get(0)?,
        kind,
        title: row.get(2)?,
        notes: row.get(3)?,
        project_id: row.get(4)?,
        subproject_id: row.get(5)?,
        important,
        urgent,
        due_at,
        estimate_min: row.get(9)?,
        status: row.get(10)?,
        repeat_days: row.get(11)?,
        window_start: row.get(12)?,
        window_end: row.get(13)?,
        grace_min: row.get(14)?,
        interrupt_after_grace: row.get::<_, i64>(15)? != 0,
        waiting_on: row.get(16)?,
        follow_up_at: row.get(17)?,
        started_at: row.get(18)?,
        snooze_until: row.get(19)?,
        project_name: row.get(23)?,
        subproject_name: row.get(24)?,
        quadrant,
    })
}

fn quadrant_label(important: Option<bool>, urgent: Option<bool>) -> Option<String> {
    let Some(important) = important else {
        return None;
    };
    let Some(urgent) = urgent else {
        return None;
    };
    Some(
        match (important, urgent) {
            (true, true) => "重要且紧急",
            (true, false) => "重要不紧急",
            (false, true) => "不重要但紧急",
            (false, false) => "不重要不紧急",
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
            },
        )
        .unwrap();
        let sub = create_subproject(
            &conn,
            &NewSubproject {
                project_id: project.id,
                kind: "regular".into(),
                name: "报价".into(),
                description: "把第三版报价改完".into(),
                important: true,
                urgent: true,
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
        assert_eq!(sub.description, "把第三版报价改完");
        assert_eq!(sub.progress, "doing");
        assert_eq!(sub.progress_percent, Some(40));
        assert_eq!(sub.kind, "regular");
        assert_eq!(sub.quadrant.as_deref(), Some("重要且紧急"));
        let described = update_subproject(&conn, sub.id, "报价", "客户书面确认后发出").unwrap();
        assert_eq!(described.description, "客户书面确认后发出");
        let dated = set_subproject_due(&conn, sub.id, Some("2099-12-31T18:00")).unwrap();
        assert!(dated.due_at.as_deref().unwrap_or("").starts_with("2099-12-31T18:00"));
        let cleared = set_subproject_due(&conn, sub.id, None).unwrap();
        assert!(cleared.due_at.is_none());
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
                description: String::new(),
                important: false,
                urgent: false,
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
            },
        )
        .unwrap();
        let sub = create_subproject(
            &conn,
            &NewSubproject {
                project_id: project.id,
                kind: "regular".into(),
                name: "报价".into(),
                description: String::new(),
                important: true,
                urgent: false,
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
        let loose_todos: i64 = conn.query_row(
            "SELECT COUNT(*) FROM items WHERE kind = 'todo' AND status = 'open' AND project_id IS NULL AND subproject_id IS NULL",
            [],
            |row| row.get(0),
        ).unwrap();
        let waiting: i64 = conn.query_row("SELECT COUNT(*) FROM items WHERE kind = 'waiting' AND status = 'open'", [], |row| row.get(0)).unwrap();
        let dailies: i64 = conn.query_row("SELECT COUNT(*) FROM items WHERE kind = 'daily'", [], |row| row.get(0)).unwrap();
        let slots: i64 = conn.query_row("SELECT COUNT(*) FROM today_slots", [], |row| row.get(0)).unwrap();
        let logs: i64 = conn.query_row("SELECT COUNT(*) FROM activity_logs WHERE match_source = 'ai'", [], |row| row.get(0)).unwrap();
        assert_eq!(active_projects, 4);
        assert_eq!(active_subs, 11);
        assert_eq!(loose_todos, 3);
        assert_eq!(waiting, 2);
        assert!(dailies >= 6);
        let orphan_dailies: i64 = conn
            .query_row("SELECT COUNT(*) FROM items WHERE kind = 'daily' AND subproject_id IS NULL", [], |row| row.get(0))
            .unwrap();
        assert_eq!(orphan_dailies, 0);
        assert_eq!(slots, 3);
        assert_eq!(logs, 2);
        assert_eq!(get_setting(&conn, "ai_model").unwrap().as_deref(), Some("openai/gpt-4o-mini"));
    }

    #[test]
    fn todos_capture_attach_and_toggle_without_progress() {
        let conn = memory();
        let loose = capture(&conn, "买电池").unwrap();
        assert_eq!(loose.kind, "todo");
        assert_eq!(loose.status, "open");
        assert!(loose.project_id.is_none());

        let project = create_project(
            &conn,
            &NewProject {
                name: "家务".into(),
                outcome: "屋子好用".into(),
                status: "active".into(),
            },
        )
        .unwrap();
        let sub = create_subproject(
            &conn,
            &NewSubproject {
                project_id: project.id,
                kind: "regular".into(),
                name: "厨房".into(),
                description: "整理台面".into(),
                important: false,
                urgent: false,
                progress: "doing".into(),
                due_at: None,
                repeat_days: None,
                remind: false,
                remind_at: None,
                progress_percent: None,
            },
        )
        .unwrap();
        let attached = save_item(
            &conn,
            &ItemDraft {
                id: None,
                kind: "todo".into(),
                title: "擦灶台".into(),
                notes: "".into(),
                project_id: Some(project.id),
                subproject_id: Some(sub.id),
                important: None,
                urgent: None,
                due_at: None,
                estimate_min: None,
                repeat_days: None,
                window_start: None,
                window_end: None,
                grace_min: None,
                interrupt_after_grace: false,
                waiting_on: None,
                follow_up_at: None,
            },
        )
        .unwrap();
        assert_eq!(attached.kind, "todo");
        assert_eq!(attached.project_id, Some(project.id));
        assert_eq!(attached.subproject_id, Some(sub.id));

        let done = set_todo_done(&conn, attached.id, true).unwrap();
        assert_eq!(done.status, "done");
        let board = today_board(&conn).unwrap();
        assert!(board.todos.iter().any(|item| item.id == attached.id && item.status == "done"));
        assert!(board.todos.iter().any(|item| item.id == loose.id && item.status == "open"));
        assert!(set_today(&conn, &[attached.id]).unwrap_err().contains("今日三件"));

        let reopened = set_todo_done(&conn, attached.id, false).unwrap();
        assert_eq!(reopened.status, "open");
        set_today(&conn, &[reopened.id]).unwrap();
        let focus = today_board(&conn).unwrap();
        assert!(focus.slots.iter().any(|item| item.id == reopened.id && item.kind == "todo"));
        let scheduled = save_item(
            &conn,
            &ItemDraft {
                id: None,
                kind: "todo".into(),
                title: "带提醒的待办".into(),
                notes: "".into(),
                project_id: None,
                subproject_id: None,
                important: None,
                urgent: None,
                due_at: Some("2099-12-31T18:00".into()),
                estimate_min: None,
                repeat_days: None,
                window_start: None,
                window_end: None,
                grace_min: None,
                interrupt_after_grace: false,
                waiting_on: None,
                follow_up_at: Some("2099-12-30T09:00".into()),
            },
        )
        .unwrap();
        assert!(scheduled.due_at.as_deref().unwrap_or("").starts_with("2099-12-31T18:00"));
        assert!(scheduled.follow_up_at.as_deref().unwrap_or("").starts_with("2099-12-30T09:00"));
        let inbox = capture_inbox(&conn, "还要想清楚").unwrap();
        assert_eq!(inbox.kind, "inbox");
        assert_eq!(inbox.status, "inbox");
    }
}
