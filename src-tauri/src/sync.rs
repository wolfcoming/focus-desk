use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db;

const SERVICE: &str = "com.focusdesk.app";
const TOKEN_ACCOUNT: &str = "sync_jwt";
const DEFAULT_BASE: &str = "http://47.93.153.219:8081";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusView {
    pub base_url: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub signed_in: bool,
    pub last_sync_at: Option<String>,
    pub cursor: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResultView {
    pub pushed: usize,
    pub pulled: usize,
    pub accepted: usize,
    pub rejected: usize,
    pub server_time: String,
}

#[derive(Serialize)]
struct SyncChangeOut {
    collection: String,
    #[serde(rename = "clientId")]
    client_id: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    deleted: bool,
    payload: Value,
}

#[derive(Deserialize)]
struct AuthResponse {
    token: String,
    email: String,
    #[serde(default, rename = "displayName")]
    display_name: Option<String>,
}

#[derive(Deserialize)]
struct ProfileResponse {
    email: String,
    #[serde(default, rename = "displayName")]
    display_name: Option<String>,
}

#[derive(Deserialize)]
struct SyncPushResponse {
    results: Vec<SyncPushResult>,
    #[serde(rename = "serverTime")]
    #[allow(dead_code)]
    server_time: String,
}

#[derive(Deserialize)]
struct SyncPushResult {
    status: String,
}

#[derive(Deserialize)]
struct SyncPullResponse {
    changes: Vec<SyncChangeIn>,
    #[serde(rename = "serverTime")]
    server_time: String,
}

#[derive(Deserialize)]
struct SyncChangeIn {
    collection: String,
    #[serde(rename = "clientId")]
    client_id: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    deleted: bool,
    payload: Value,
}

pub fn status(conn: &Connection) -> Result<SyncStatusView, String> {
    Ok(SyncStatusView {
        base_url: base_url(conn)?,
        email: db::get_setting(conn, "sync_email")?,
        display_name: db::get_setting(conn, "sync_display_name")?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        signed_in: has_token()?,
        last_sync_at: db::get_setting(conn, "sync_last_at")?,
        cursor: db::get_setting(conn, "sync_cursor")?,
    })
}

pub fn base_url(conn: &Connection) -> Result<String, String> {
    Ok(db::get_setting(conn, "sync_base_url")?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_BASE.to_string())
        .trim()
        .trim_end_matches('/')
        .to_string())
}

pub fn set_base_url(conn: &Connection, value: &str) -> Result<(), String> {
    let next = if value.trim().is_empty() {
        DEFAULT_BASE
    } else {
        value.trim().trim_end_matches('/')
    };
    db::set_setting(conn, "sync_base_url", next)
}

fn has_token() -> Result<bool, String> {
    crate::secret::has(SERVICE, TOKEN_ACCOUNT)
}

fn load_token() -> Result<String, String> {
    crate::secret::get(SERVICE, TOKEN_ACCOUNT)?.ok_or_else(|| "还没有登录云端账号".into())
}

fn save_token(token: &str) -> Result<(), String> {
    crate::secret::set(SERVICE, TOKEN_ACCOUNT, token)
}

pub async fn register(
    conn_path: &std::path::Path,
    email: &str,
    password: &str,
    display_name: Option<&str>,
) -> Result<SyncStatusView, String> {
    auth_call(conn_path, "register", email, password, display_name).await
}

pub async fn login(
    conn_path: &std::path::Path,
    email: &str,
    password: &str,
) -> Result<SyncStatusView, String> {
    auth_call(conn_path, "login", email, password, None).await
}

async fn auth_call(
    conn_path: &std::path::Path,
    path: &str,
    email: &str,
    password: &str,
    display_name: Option<&str>,
) -> Result<SyncStatusView, String> {
    let email = email.trim().to_lowercase();
    if email.is_empty() || password.len() < 8 {
        return Err("请填写邮箱，密码至少 8 位".into());
    }
    let display_name = display_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());
    let base = {
        let conn = db::open(conn_path)?;
        base_url(&conn)?
    };
    let url = format!("{base}/api/v1/auth/{path}");
    let body = if path == "register" {
        json!({ "email": email, "password": password, "displayName": display_name })
    } else {
        json!({ "email": email, "password": password })
    };
    let response = reqwest::Client::new()
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|err| format!("连不上同步服务：{err}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(extract_error(&body).unwrap_or_else(|| format!("登录失败（{status}）")));
    }
    let payload: AuthResponse = response.json().await.map_err(|err| err.to_string())?;
    save_token(&payload.token)?;
    let conn = db::open(conn_path)?;
    db::set_setting(&conn, "sync_email", &payload.email)?;
    let name = payload
        .display_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or(display_name.as_deref());
    match name {
        Some(value) => db::set_setting(&conn, "sync_display_name", value)?,
        None => db::set_setting(&conn, "sync_display_name", "")?,
    }
    status(&conn)
}

pub fn logout(conn: &Connection) -> Result<SyncStatusView, String> {
    save_token("")?;
    db::set_setting(conn, "sync_display_name", "")?;
    status(conn)
}

pub async fn set_display_name(conn_path: &std::path::Path, display_name: &str) -> Result<SyncStatusView, String> {
    let name = display_name.trim();
    if name.chars().count() > 80 {
        return Err("用户名最多 80 字".into());
    }
    let token = load_token()?;
    let base = {
        let conn = db::open(conn_path)?;
        db::set_setting(&conn, "sync_display_name", name)?;
        base_url(&conn)?
    };
    let url = format!("{base}/api/v1/auth/me");
    let response = reqwest::Client::new()
        .patch(url)
        .bearer_auth(&token)
        .json(&json!({ "displayName": if name.is_empty() { Value::Null } else { json!(name) } }))
        .send()
        .await
        .map_err(|err| format!("连不上同步服务：{err}"))?;
    // Local name is already saved. Cloud profile is best-effort until the
    // server exposes PATCH /api/v1/auth/me (older builds return 404/"No static resource").
    if response.status().is_success() {
        if let Ok(profile) = response.json::<ProfileResponse>().await {
            let conn = db::open(conn_path)?;
            db::set_setting(&conn, "sync_email", &profile.email)?;
            match profile.display_name.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
                Some(value) => db::set_setting(&conn, "sync_display_name", value)?,
                None => db::set_setting(&conn, "sync_display_name", "")?,
            }
            return status(&conn);
        }
    }
    let conn = db::open(conn_path)?;
    status(&conn)
}

pub async fn sync_now(conn_path: &std::path::Path) -> Result<SyncResultView, String> {
    let token = load_token()?;
    let (base, changes) = {
        let conn = db::open(conn_path)?;
        (base_url(&conn)?, collect_push_changes(&conn)?)
    };
    let pushed = changes.len();

    let client = reqwest::Client::new();
    let push_url = format!("{base}/api/v1/sync/push");
    let push_response = client
        .post(push_url)
        .bearer_auth(&token)
        .json(&json!({ "changes": changes }))
        .send()
        .await
        .map_err(|err| format!("推送失败：{err}"))?;
    if !push_response.status().is_success() {
        let status = push_response.status();
        let body = push_response.text().await.unwrap_or_default();
        return Err(extract_error(&body).unwrap_or_else(|| format!("推送失败（{status}）")));
    }
    let push_body: SyncPushResponse = push_response.json().await.map_err(|err| err.to_string())?;
    let accepted = push_body.results.iter().filter(|item| item.status == "accepted").count();
    let rejected = push_body.results.len().saturating_sub(accepted);

    // Full pull (no since): older clients stored cursors against client-side timestamps, which
    // could hide newly pushed rows from other devices. Payload apply is idempotent by client_id.
    let pull_url = format!("{base}/api/v1/sync/changes");
    let pull_response = client
        .get(pull_url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|err| format!("拉取失败：{err}"))?;
    if !pull_response.status().is_success() {
        let status = pull_response.status();
        let body = pull_response.text().await.unwrap_or_default();
        return Err(extract_error(&body).unwrap_or_else(|| format!("拉取失败（{status}）")));
    }
    let pull_body: SyncPullResponse = pull_response.json().await.map_err(|err| err.to_string())?;
    let pulled = pull_body.changes.len();
    {
        let conn = db::open(conn_path)?;
        apply_changes(&conn, &pull_body.changes)?;
        db::set_setting(&conn, "sync_cursor", &pull_body.server_time)?;
        db::set_setting(&conn, "sync_last_at", &timeutil_now())?;
    }

    Ok(SyncResultView {
        pushed,
        pulled,
        accepted,
        rejected,
        server_time: pull_body.server_time,
    })
}

fn timeutil_now() -> String {
    crate::timeutil::now_iso()
}

fn extract_error(body: &str) -> Option<String> {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| value.get("error")?.as_str().map(str::to_string))
}

fn collect_push_changes(conn: &Connection) -> Result<Vec<SyncChangeOut>, String> {
    let mut out = Vec::new();

    let mut projects = conn
        .prepare("SELECT id, name, outcome, status, created_at, updated_at FROM projects")
        .map_err(|err| err.to_string())?;
    let project_rows = projects
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|err| err.to_string())?;
    for row in project_rows {
        let (id, name, outcome, status, created_at, updated_at) = row.map_err(|err| err.to_string())?;
        let client_id = db::sync_client_id(conn, "projects", id)?;
        out.push(SyncChangeOut {
            collection: "projects".into(),
            client_id,
            updated_at: updated_at.clone(),
            deleted: false,
            payload: json!({
                "name": name,
                "outcome": outcome,
                "status": status,
                "createdAt": created_at,
                "updatedAt": updated_at,
            }),
        });
    }

    let mut subs = conn
        .prepare(
            "SELECT id, project_id, name, description, status, kind, progress, progress_percent,
                    sort_order, last_touched_at, created_at, updated_at, target_date
             FROM subprojects",
        )
        .map_err(|err| err.to_string())?;
    let sub_rows = subs
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, Option<i64>>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, Option<String>>(12)?,
            ))
        })
        .map_err(|err| err.to_string())?;
    for row in sub_rows {
        let (
            id,
            project_id,
            name,
            description,
            status,
            kind,
            progress,
            progress_percent,
            sort_order,
            last_touched_at,
            created_at,
            updated_at,
            target_date,
        ) = row.map_err(|err| err.to_string())?;
        let client_id = db::sync_client_id(conn, "subprojects", id)?;
        let project_client_id = db::sync_client_id(conn, "projects", project_id)?;
        out.push(SyncChangeOut {
            collection: "subprojects".into(),
            client_id,
            updated_at: updated_at.clone(),
            deleted: false,
            payload: json!({
                "projectClientId": project_client_id,
                "name": name,
                "description": description,
                "status": status,
                "kind": kind,
                "progress": progress,
                "progressPercent": progress_percent,
                "sortOrder": sort_order,
                "lastTouchedAt": last_touched_at,
                "createdAt": created_at,
                "updatedAt": updated_at,
                "targetDate": target_date,
            }),
        });
    }

    let mut items = conn
        .prepare(
            "SELECT id, kind, title, notes, project_id, subproject_id, important, urgent, due_at,
                    status, repeat_days, waiting_on, follow_up_at, created_at, updated_at
             FROM items",
        )
        .map_err(|err| err.to_string())?;
    let item_rows = items
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<i64>>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, Option<i64>>(6)?,
                row.get::<_, Option<i64>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, Option<String>>(10)?,
                row.get::<_, Option<String>>(11)?,
                row.get::<_, Option<String>>(12)?,
                row.get::<_, String>(13)?,
                row.get::<_, String>(14)?,
            ))
        })
        .map_err(|err| err.to_string())?;
    for row in item_rows {
        let (
            id,
            kind,
            title,
            notes,
            project_id,
            subproject_id,
            important,
            urgent,
            due_at,
            status,
            repeat_days,
            waiting_on,
            follow_up_at,
            created_at,
            updated_at,
        ) = row.map_err(|err| err.to_string())?;
        let client_id = db::sync_client_id(conn, "items", id)?;
        let project_client_id = match project_id {
            Some(pid) => Some(db::sync_client_id(conn, "projects", pid)?),
            None => None,
        };
        let subproject_client_id = match subproject_id {
            Some(sid) => Some(db::sync_client_id(conn, "subprojects", sid)?),
            None => None,
        };
        out.push(SyncChangeOut {
            collection: "items".into(),
            client_id,
            updated_at: updated_at.clone(),
            deleted: false,
            payload: json!({
                "kind": kind,
                "title": title,
                "notes": notes,
                "projectClientId": project_client_id,
                "subprojectClientId": subproject_client_id,
                "important": important.unwrap_or(0) != 0,
                "urgent": urgent.unwrap_or(0) != 0,
                "dueAt": due_at,
                "status": status,
                "repeatDays": repeat_days,
                "waitingOn": waiting_on,
                "followUpAt": follow_up_at,
                "createdAt": created_at,
                "updatedAt": updated_at,
            }),
        });
    }

    let mut logs = conn
        .prepare(
            "SELECT id, subproject_id, body, progress, progress_percent, kind, created_at FROM work_logs",
        )
        .map_err(|err| err.to_string())?;
    let log_rows = logs
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<i64>>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|err| err.to_string())?;
    for row in log_rows {
        let (id, subproject_id, body, progress, progress_percent, kind, created_at) =
            row.map_err(|err| err.to_string())?;
        let client_id = db::sync_client_id(conn, "work_logs", id)?;
        let subproject_client_id = db::sync_client_id(conn, "subprojects", subproject_id)?;
        out.push(SyncChangeOut {
            collection: "work_logs".into(),
            client_id,
            updated_at: created_at.clone(),
            deleted: false,
            payload: json!({
                "subprojectClientId": subproject_client_id,
                "body": body,
                "progress": progress,
                "progressPercent": progress_percent,
                "kind": kind,
                "createdAt": created_at,
            }),
        });
    }

    let mut ideas = conn
        .prepare(
            "SELECT id, subproject_id, body, color, sort_order, pos_x, pos_y, z_index, created_at FROM idea_tags",
        )
        .map_err(|err| err.to_string())?;
    let idea_rows = ideas
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, f64>(5)?,
                row.get::<_, f64>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, String>(8)?,
            ))
        })
        .map_err(|err| err.to_string())?;
    for row in idea_rows {
        let (id, subproject_id, body, color, sort_order, pos_x, pos_y, z_index, created_at) =
            row.map_err(|err| err.to_string())?;
        let client_id = db::sync_client_id(conn, "idea_tags", id)?;
        let subproject_client_id = db::sync_client_id(conn, "subprojects", subproject_id)?;
        out.push(SyncChangeOut {
            collection: "idea_tags".into(),
            client_id,
            updated_at: created_at.clone(),
            deleted: false,
            payload: json!({
                "subprojectClientId": subproject_client_id,
                "body": body,
                "color": color,
                "sortOrder": sort_order,
                "posX": pos_x,
                "posY": pos_y,
                "zIndex": z_index,
                "createdAt": created_at,
            }),
        });
    }

    Ok(out)
}

fn collection_rank(collection: &str) -> u8 {
    match collection {
        "projects" => 0,
        "subprojects" => 1,
        "items" => 2,
        "work_logs" | "idea_tags" => 3,
        _ => 9,
    }
}

enum ApplyOutcome {
    Applied,
    Deferred,
}

fn apply_changes(conn: &Connection, changes: &[SyncChangeIn]) -> Result<(), String> {
    let mut pending: Vec<&SyncChangeIn> = changes.iter().collect();
    pending.sort_by_key(|change| collection_rank(&change.collection));
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    // Parents may land after children when ordered only by updated_at; retry deferred rows.
    for _ in 0..6 {
        if pending.is_empty() {
            break;
        }
        let batch = std::mem::take(&mut pending);
        let before = batch.len();
        for change in batch {
            let outcome = match change.collection.as_str() {
                "projects" => {
                    apply_project(&tx, change)?;
                    ApplyOutcome::Applied
                }
                "subprojects" => apply_subproject(&tx, change)?,
                "items" => apply_item(&tx, change)?,
                "work_logs" => apply_work_log(&tx, change)?,
                "idea_tags" => apply_idea_tag(&tx, change)?,
                _ => ApplyOutcome::Applied,
            };
            if matches!(outcome, ApplyOutcome::Deferred) {
                pending.push(change);
            }
        }
        if pending.is_empty() || pending.len() == before {
            break;
        }
        pending.sort_by_key(|change| collection_rank(&change.collection));
    }
    tx.commit().map_err(|err| err.to_string())?;
    Ok(())
}

fn text<'a>(payload: &'a Value, key: &str) -> &'a str {
    payload.get(key).and_then(|value| value.as_str()).unwrap_or("")
}

fn opt_text(payload: &Value, key: &str) -> Option<String> {
    payload
        .get(key)
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn bool_num(payload: &Value, key: &str) -> i64 {
    match payload.get(key) {
        Some(Value::Bool(true)) => 1,
        Some(Value::Number(n)) if n.as_i64().unwrap_or(0) != 0 => 1,
        _ => 0,
    }
}

fn apply_project(conn: &Connection, change: &SyncChangeIn) -> Result<(), String> {
    if change.deleted {
        if let Some(local_id) = db::sync_live_local_id(conn, "projects", &change.client_id)? {
            db::delete_project_rows(conn, local_id)?;
        } else {
            db::sync_unbind_client(conn, "projects", &change.client_id)?;
        }
        return Ok(());
    }
    let name = text(&change.payload, "name");
    let outcome = text(&change.payload, "outcome");
    let status = text(&change.payload, "status");
    let created_at = opt_text(&change.payload, "createdAt").unwrap_or_else(|| change.updated_at.clone());
    let updated_at = opt_text(&change.payload, "updatedAt").unwrap_or_else(|| change.updated_at.clone());
    if let Some(local_id) = db::sync_live_local_id(conn, "projects", &change.client_id)? {
        conn.execute(
            "UPDATE projects SET name = ?2, outcome = ?3, status = ?4, updated_at = ?5 WHERE id = ?1",
            params![local_id, name, outcome, status, updated_at],
        )
        .map_err(|err| err.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO projects (name, outcome, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![name, outcome, status, created_at, updated_at],
        )
        .map_err(|err| err.to_string())?;
        db::sync_bind(conn, "projects", conn.last_insert_rowid(), &change.client_id)?;
    }
    Ok(())
}

fn apply_subproject(conn: &Connection, change: &SyncChangeIn) -> Result<ApplyOutcome, String> {
    if change.deleted {
        if let Some(local_id) = db::sync_live_local_id(conn, "subprojects", &change.client_id)? {
            db::delete_subproject_rows(conn, local_id)?;
        } else {
            db::sync_unbind_client(conn, "subprojects", &change.client_id)?;
        }
        return Ok(ApplyOutcome::Applied);
    }
    let project_client_id = text(&change.payload, "projectClientId");
    let Some(project_id) = db::sync_live_local_id(conn, "projects", project_client_id)? else {
        return Ok(ApplyOutcome::Deferred);
    };
    let name = text(&change.payload, "name");
    let description = text(&change.payload, "description");
    let status = text(&change.payload, "status");
    let kind = text(&change.payload, "kind");
    let progress = text(&change.payload, "progress");
    let progress_percent = change.payload.get("progressPercent").and_then(|value| value.as_i64());
    let sort_order = change.payload.get("sortOrder").and_then(|value| value.as_i64()).unwrap_or(0);
    let last_touched_at = opt_text(&change.payload, "lastTouchedAt").unwrap_or_else(|| change.updated_at.clone());
    let created_at = opt_text(&change.payload, "createdAt").unwrap_or_else(|| change.updated_at.clone());
    let updated_at = opt_text(&change.payload, "updatedAt").unwrap_or_else(|| change.updated_at.clone());
    let target_date = opt_text(&change.payload, "targetDate");
    if let Some(local_id) = db::sync_live_local_id(conn, "subprojects", &change.client_id)? {
        conn.execute(
            "UPDATE subprojects SET project_id = ?2, name = ?3, description = ?4, status = ?5, kind = ?6,
             progress = ?7, progress_percent = ?8, sort_order = ?9, last_touched_at = ?10, updated_at = ?11, target_date = ?12
             WHERE id = ?1",
            params![
                local_id,
                project_id,
                name,
                description,
                status,
                kind,
                progress,
                progress_percent,
                sort_order,
                last_touched_at,
                updated_at,
                target_date
            ],
        )
        .map_err(|err| err.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO subprojects (project_id, name, description, status, kind, progress, progress_percent,
             sort_order, last_touched_at, created_at, updated_at, target_date, done_criteria)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, '')",
            params![
                project_id,
                name,
                description,
                status,
                kind,
                progress,
                progress_percent,
                sort_order,
                last_touched_at,
                created_at,
                updated_at,
                target_date
            ],
        )
        .map_err(|err| err.to_string())?;
        db::sync_bind(conn, "subprojects", conn.last_insert_rowid(), &change.client_id)?;
    }
    Ok(ApplyOutcome::Applied)
}

fn apply_item(conn: &Connection, change: &SyncChangeIn) -> Result<ApplyOutcome, String> {
    if change.deleted {
        if let Some(local_id) = db::sync_live_local_id(conn, "items", &change.client_id)? {
            db::delete_item_rows(conn, local_id)?;
        } else {
            db::sync_unbind_client(conn, "items", &change.client_id)?;
        }
        return Ok(ApplyOutcome::Applied);
    }
    let project_id = match change.payload.get("projectClientId").and_then(|value| value.as_str()) {
        Some(id) if !id.is_empty() => match db::sync_live_local_id(conn, "projects", id)? {
            Some(local) => Some(local),
            None => return Ok(ApplyOutcome::Deferred),
        },
        _ => None,
    };
    let subproject_id = match change.payload.get("subprojectClientId").and_then(|value| value.as_str()) {
        Some(id) if !id.is_empty() => match db::sync_live_local_id(conn, "subprojects", id)? {
            Some(local) => Some(local),
            None => return Ok(ApplyOutcome::Deferred),
        },
        _ => None,
    };
    let kind = text(&change.payload, "kind");
    let title = text(&change.payload, "title");
    let notes = text(&change.payload, "notes");
    let status = text(&change.payload, "status");
    let important = bool_num(&change.payload, "important");
    let urgent = bool_num(&change.payload, "urgent");
    let due_at = opt_text(&change.payload, "dueAt");
    let repeat_days = opt_text(&change.payload, "repeatDays");
    let waiting_on = opt_text(&change.payload, "waitingOn");
    let follow_up_at = opt_text(&change.payload, "followUpAt");
    let created_at = opt_text(&change.payload, "createdAt").unwrap_or_else(|| change.updated_at.clone());
    let updated_at = opt_text(&change.payload, "updatedAt").unwrap_or_else(|| change.updated_at.clone());
    if let Some(local_id) = db::sync_live_local_id(conn, "items", &change.client_id)? {
        conn.execute(
            "UPDATE items SET kind = ?2, title = ?3, notes = ?4, project_id = ?5, subproject_id = ?6,
             important = ?7, urgent = ?8, due_at = ?9, status = ?10, repeat_days = ?11, waiting_on = ?12,
             follow_up_at = ?13, updated_at = ?14 WHERE id = ?1",
            params![
                local_id,
                kind,
                title,
                notes,
                project_id,
                subproject_id,
                important,
                urgent,
                due_at,
                status,
                repeat_days,
                waiting_on,
                follow_up_at,
                updated_at
            ],
        )
        .map_err(|err| err.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO items (kind, title, notes, project_id, subproject_id, important, urgent, due_at, status,
             repeat_days, waiting_on, follow_up_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                kind,
                title,
                notes,
                project_id,
                subproject_id,
                important,
                urgent,
                due_at,
                status,
                repeat_days,
                waiting_on,
                follow_up_at,
                created_at,
                updated_at
            ],
        )
        .map_err(|err| err.to_string())?;
        db::sync_bind(conn, "items", conn.last_insert_rowid(), &change.client_id)?;
    }
    Ok(ApplyOutcome::Applied)
}

fn apply_work_log(conn: &Connection, change: &SyncChangeIn) -> Result<ApplyOutcome, String> {
    if change.deleted {
        if let Some(local_id) = db::sync_live_local_id(conn, "work_logs", &change.client_id)? {
            conn.execute("DELETE FROM work_logs WHERE id = ?1", params![local_id])
                .map_err(|err| err.to_string())?;
            db::sync_unbind_local(conn, "work_logs", local_id)?;
        } else {
            db::sync_unbind_client(conn, "work_logs", &change.client_id)?;
        }
        return Ok(ApplyOutcome::Applied);
    }
    let sub_client = text(&change.payload, "subprojectClientId");
    let Some(subproject_id) = db::sync_live_local_id(conn, "subprojects", sub_client)? else {
        return Ok(ApplyOutcome::Deferred);
    };
    let body = text(&change.payload, "body");
    let progress = text(&change.payload, "progress");
    let progress_percent = change.payload.get("progressPercent").and_then(|value| value.as_i64());
    let kind = text(&change.payload, "kind");
    let created_at = opt_text(&change.payload, "createdAt").unwrap_or_else(|| change.updated_at.clone());
    if let Some(local_id) = db::sync_live_local_id(conn, "work_logs", &change.client_id)? {
        conn.execute(
            "UPDATE work_logs SET subproject_id = ?2, body = ?3, progress = ?4, progress_percent = ?5, kind = ?6, created_at = ?7 WHERE id = ?1",
            params![local_id, subproject_id, body, progress, progress_percent, kind, created_at],
        )
        .map_err(|err| err.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO work_logs (subproject_id, body, progress, progress_percent, kind, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![subproject_id, body, progress, progress_percent, kind, created_at],
        )
        .map_err(|err| err.to_string())?;
        db::sync_bind(conn, "work_logs", conn.last_insert_rowid(), &change.client_id)?;
    }
    Ok(ApplyOutcome::Applied)
}

fn apply_idea_tag(conn: &Connection, change: &SyncChangeIn) -> Result<ApplyOutcome, String> {
    if change.deleted {
        if let Some(local_id) = db::sync_live_local_id(conn, "idea_tags", &change.client_id)? {
            conn.execute("DELETE FROM idea_tags WHERE id = ?1", params![local_id])
                .map_err(|err| err.to_string())?;
            db::sync_unbind_local(conn, "idea_tags", local_id)?;
        } else {
            db::sync_unbind_client(conn, "idea_tags", &change.client_id)?;
        }
        return Ok(ApplyOutcome::Applied);
    }
    let sub_client = text(&change.payload, "subprojectClientId");
    let Some(subproject_id) = db::sync_live_local_id(conn, "subprojects", sub_client)? else {
        return Ok(ApplyOutcome::Deferred);
    };
    let body = text(&change.payload, "body");
    let color = text(&change.payload, "color");
    let sort_order = change.payload.get("sortOrder").and_then(|value| value.as_i64()).unwrap_or(0);
    let pos_x = change.payload.get("posX").and_then(|value| value.as_f64()).unwrap_or(20.0);
    let pos_y = change.payload.get("posY").and_then(|value| value.as_f64()).unwrap_or(20.0);
    let z_index = change.payload.get("zIndex").and_then(|value| value.as_i64()).unwrap_or(0);
    let created_at = opt_text(&change.payload, "createdAt").unwrap_or_else(|| change.updated_at.clone());
    if let Some(local_id) = db::sync_live_local_id(conn, "idea_tags", &change.client_id)? {
        conn.execute(
            "UPDATE idea_tags SET subproject_id = ?2, body = ?3, color = ?4, sort_order = ?5, pos_x = ?6, pos_y = ?7, z_index = ?8, created_at = ?9 WHERE id = ?1",
            params![local_id, subproject_id, body, color, sort_order, pos_x, pos_y, z_index, created_at],
        )
        .map_err(|err| err.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO idea_tags (subproject_id, body, color, sort_order, pos_x, pos_y, z_index, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![subproject_id, body, color, sort_order, pos_x, pos_y, z_index, created_at],
        )
        .map_err(|err| err.to_string())?;
        db::sync_bind(conn, "idea_tags", conn.last_insert_rowid(), &change.client_id)?;
    }
    Ok(ApplyOutcome::Applied)
}
