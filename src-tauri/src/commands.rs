use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
#[cfg(desktop)]
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

use crate::ai;
use crate::db::{self, Item, ItemDraft, NewProject, NewSubproject, ReminderView};
use crate::judge::{self, JudgeInput, Verdict};
use crate::schedule;
use crate::timeutil::parse_stored;

pub struct AppData {
    pub db_path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgmentView {
    pub matched_item_id: Option<i64>,
    pub matched_title: Option<String>,
    pub verdict: Verdict,
    pub reason: String,
    pub snooze_min: i64,
    pub match_source: String,
    pub thinking: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    base_url: String,
    model: String,
    has_api_key: bool,
    autostart: bool,
    supports_autostart: bool,
    auto_remind: bool,
    data_path: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsInput {
    base_url: String,
    model: String,
    api_key: Option<String>,
    clear_api_key: bool,
    autostart: bool,
    auto_remind: bool,
}

fn connection(state: &State<'_, AppData>) -> Result<rusqlite::Connection, String> {
    db::open(&state.db_path)
}

pub fn present(app: &AppHandle, reminder: &ReminderView) {
    let _ = app.emit("reminder://open", reminder);
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = app_handle.get_webview_window("reminder") {
            let _ = window.show();
            #[cfg(desktop)]
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    });
    if let Err(err) = app.notification().builder().title(&reminder.title).body(&reminder.detail).show() {
        eprintln!("notification: {err}");
    }
}

#[tauri::command]
pub fn list_projects(state: State<'_, AppData>) -> Result<Vec<db::Project>, String> {
    let conn = connection(&state)?;
    db::list_projects(&conn)
}

#[tauri::command]
pub fn create_project(state: State<'_, AppData>, input: NewProject) -> Result<db::Project, String> {
    let conn = connection(&state)?;
    db::create_project(&conn, &input)
}

#[tauri::command]
pub fn update_project(
    state: State<'_, AppData>,
    id: i64,
    name: String,
    outcome: String,
) -> Result<db::Project, String> {
    let conn = connection(&state)?;
    db::update_project(&conn, id, &name, &outcome)
}

#[tauri::command]
pub fn set_project_status(
    state: State<'_, AppData>,
    id: i64,
    status: String,
) -> Result<db::Project, String> {
    let conn = connection(&state)?;
    db::set_project_status(&conn, id, &status)
}

#[tauri::command]
pub fn list_subprojects(state: State<'_, AppData>, project_id: Option<i64>) -> Result<Vec<db::Subproject>, String> {
    let conn = connection(&state)?;
    db::list_subprojects(&conn, project_id)
}

#[tauri::command]
pub fn create_subproject(state: State<'_, AppData>, input: NewSubproject) -> Result<db::Subproject, String> {
    let conn = connection(&state)?;
    db::create_subproject(&conn, &input)
}

#[tauri::command]
pub fn set_subproject_progress(
    state: State<'_, AppData>,
    id: i64,
    progress: String,
    progress_percent: Option<i64>,
    log: Option<String>,
) -> Result<db::Subproject, String> {
    let conn = connection(&state)?;
    db::set_subproject_progress(&conn, id, &progress, progress_percent, log.as_deref())
}

#[tauri::command]
pub fn set_subproject_due(
    state: State<'_, AppData>,
    id: i64,
    due_at: Option<String>,
) -> Result<db::Subproject, String> {
    let conn = connection(&state)?;
    db::set_subproject_due(&conn, id, due_at.as_deref())
}

#[tauri::command]
pub fn set_subproject_repeat(
    state: State<'_, AppData>,
    id: i64,
    repeat_days: String,
) -> Result<db::Subproject, String> {
    let conn = connection(&state)?;
    db::set_subproject_repeat(&conn, id, &repeat_days)
}

#[tauri::command]
pub fn set_subproject_reminder(
    state: State<'_, AppData>,
    id: i64,
    remind: bool,
    remind_at: Option<String>,
) -> Result<db::Subproject, String> {
    let conn = connection(&state)?;
    db::set_subproject_reminder(&conn, id, remind, remind_at.as_deref())
}

#[tauri::command]
pub fn set_subproject_quadrant(
    state: State<'_, AppData>,
    id: i64,
    important: bool,
    urgent: bool,
) -> Result<db::Subproject, String> {
    let conn = connection(&state)?;
    db::set_subproject_quadrant(&conn, id, important, urgent)
}

#[tauri::command]
pub fn rename_subproject(
    state: State<'_, AppData>,
    id: i64,
    name: String,
) -> Result<db::Subproject, String> {
    let conn = connection(&state)?;
    db::rename_subproject(&conn, id, &name)
}

#[tauri::command]
pub fn update_subproject(
    state: State<'_, AppData>,
    id: i64,
    name: String,
    description: String,
) -> Result<db::Subproject, String> {
    let conn = connection(&state)?;
    db::update_subproject(&conn, id, &name, &description)
}

#[tauri::command]
pub fn set_subproject_modules(
    state: State<'_, AppData>,
    id: i64,
    modules: Vec<String>,
) -> Result<db::Subproject, String> {
    let conn = connection(&state)?;
    db::set_subproject_modules(&conn, id, &modules)
}

#[tauri::command]
pub fn set_subproject_notes(
    state: State<'_, AppData>,
    id: i64,
    notes: String,
) -> Result<db::Subproject, String> {
    let conn = connection(&state)?;
    db::set_subproject_notes(&conn, id, &notes)
}

#[tauri::command]
pub fn set_subproject_retrospect(
    state: State<'_, AppData>,
    id: i64,
    retrospect: String,
) -> Result<db::Subproject, String> {
    let conn = connection(&state)?;
    db::set_subproject_retrospect(&conn, id, &retrospect)
}

#[tauri::command]
pub fn list_subproject_attachments(
    state: State<'_, AppData>,
    subproject_id: i64,
) -> Result<Vec<db::SubprojectAttachment>, String> {
    let conn = connection(&state)?;
    db::list_subproject_attachments(&conn, subproject_id)
}

#[tauri::command]
pub fn add_subproject_attachment(
    state: State<'_, AppData>,
    subproject_id: i64,
    title: String,
    target: String,
) -> Result<db::SubprojectAttachment, String> {
    let conn = connection(&state)?;
    db::add_subproject_attachment(&conn, subproject_id, &title, &target)
}

#[tauri::command]
pub fn delete_subproject_attachment(state: State<'_, AppData>, id: i64) -> Result<(), String> {
    let conn = connection(&state)?;
    db::delete_subproject_attachment(&conn, id)
}

#[tauri::command]
pub fn open_subproject_attachment(state: State<'_, AppData>, id: i64) -> Result<(), String> {
    let conn = connection(&state)?;
    let attachment = db::get_subproject_attachment(&conn, id)?;
    open_external_target(&attachment.target)
}

fn open_external_target(target: &str) -> Result<(), String> {
    let target = target.trim();
    if target.is_empty() {
        return Err("附件地址为空".into());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(target)
            .spawn()
            .map_err(|err| format!("无法打开：{err}"))?;
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", target])
            .spawn()
            .map_err(|err| format!("无法打开：{err}"))?;
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|err| format!("无法打开：{err}"))?;
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = target;
        Err("当前平台暂不支持打开附件".into())
    }
}

#[tauri::command]
pub fn reorder_subprojects(
    state: State<'_, AppData>,
    project_id: i64,
    ordered_ids: Vec<i64>,
) -> Result<(), String> {
    let conn = connection(&state)?;
    db::reorder_subprojects(&conn, project_id, &ordered_ids)
}

#[tauri::command]
pub fn list_work_logs(state: State<'_, AppData>, project_id: Option<i64>) -> Result<Vec<db::WorkLog>, String> {
    let conn = connection(&state)?;
    db::list_work_logs(&conn, project_id)
}

#[tauri::command]
pub fn add_work_log(
    state: State<'_, AppData>,
    subproject_id: i64,
    body: String,
) -> Result<db::WorkLog, String> {
    let conn = connection(&state)?;
    db::add_work_log(&conn, subproject_id, &body)
}

#[tauri::command]
pub fn update_work_log(
    state: State<'_, AppData>,
    id: i64,
    body: String,
) -> Result<db::WorkLog, String> {
    let conn = connection(&state)?;
    db::update_work_log(&conn, id, &body)
}

#[tauri::command]
pub fn delete_work_log(state: State<'_, AppData>, id: i64) -> Result<(), String> {
    let conn = connection(&state)?;
    db::delete_work_log(&conn, id)
}

#[tauri::command]
pub fn list_idea_tags(state: State<'_, AppData>, subproject_id: i64) -> Result<Vec<db::IdeaTag>, String> {
    let conn = connection(&state)?;
    db::list_idea_tags(&conn, subproject_id)
}

#[tauri::command]
pub fn add_idea_tag(
    state: State<'_, AppData>,
    subproject_id: i64,
    body: String,
    color: String,
    pos_x: f64,
    pos_y: f64,
) -> Result<db::IdeaTag, String> {
    let conn = connection(&state)?;
    db::add_idea_tag(&conn, subproject_id, &body, &color, pos_x, pos_y)
}

#[tauri::command]
pub fn update_idea_tag(
    state: State<'_, AppData>,
    id: i64,
    body: String,
    color: String,
) -> Result<db::IdeaTag, String> {
    let conn = connection(&state)?;
    db::update_idea_tag(&conn, id, &body, &color)
}

#[tauri::command]
pub fn move_idea_tag(
    state: State<'_, AppData>,
    id: i64,
    pos_x: f64,
    pos_y: f64,
) -> Result<db::IdeaTag, String> {
    let conn = connection(&state)?;
    db::move_idea_tag(&conn, id, pos_x, pos_y)
}

#[tauri::command]
pub fn delete_idea_tag(state: State<'_, AppData>, id: i64) -> Result<(), String> {
    let conn = connection(&state)?;
    db::delete_idea_tag(&conn, id)
}

#[tauri::command]
pub fn set_subproject_status(
    state: State<'_, AppData>,
    id: i64,
    status: String,
    pause_subproject_id: Option<i64>,
) -> Result<db::Subproject, String> {
    let conn = connection(&state)?;
    db::set_subproject_status(&conn, id, &status, pause_subproject_id)
}

#[tauri::command]
pub fn delete_project(state: State<'_, AppData>, id: i64) -> Result<(), String> {
    let conn = connection(&state)?;
    db::delete_project(&conn, id)
}

#[tauri::command]
pub fn delete_subproject(state: State<'_, AppData>, id: i64) -> Result<(), String> {
    let conn = connection(&state)?;
    db::delete_subproject(&conn, id)
}

#[tauri::command]
pub fn capture(state: State<'_, AppData>, title: String) -> Result<Item, String> {
    let conn = connection(&state)?;
    db::capture(&conn, &title)
}

#[tauri::command]
pub fn capture_inbox(state: State<'_, AppData>, title: String) -> Result<Item, String> {
    let conn = connection(&state)?;
    db::capture_inbox(&conn, &title)
}

#[tauri::command]
pub fn save_item(state: State<'_, AppData>, draft: ItemDraft) -> Result<Item, String> {
    let conn = connection(&state)?;
    db::save_item(&conn, &draft)
}

#[tauri::command]
pub fn set_todo_done(state: State<'_, AppData>, id: i64, done: bool) -> Result<Item, String> {
    let conn = connection(&state)?;
    db::set_todo_done(&conn, id, done)
}

#[tauri::command]
pub fn list_items(state: State<'_, AppData>, kind: Option<String>) -> Result<Vec<Item>, String> {
    let conn = connection(&state)?;
    db::list_items(&conn, kind.as_deref())
}

#[tauri::command]
pub fn complete_item(state: State<'_, AppData>, id: i64) -> Result<Item, String> {
    let conn = connection(&state)?;
    db::complete_task(&conn, id)
}

#[tauri::command]
pub fn drop_item(state: State<'_, AppData>, id: i64) -> Result<(), String> {
    let conn = connection(&state)?;
    db::drop_item(&conn, id)
}

#[tauri::command]
pub fn start_item(state: State<'_, AppData>, id: i64) -> Result<Item, String> {
    let conn = connection(&state)?;
    db::start_item(&conn, id)
}

#[tauri::command]
pub fn set_today(state: State<'_, AppData>, ids: Vec<i64>) -> Result<(), String> {
    let conn = connection(&state)?;
    db::set_today(&conn, &ids)
}

#[tauri::command]
pub fn today_board(state: State<'_, AppData>) -> Result<db::TodayBoard, String> {
    let conn = connection(&state)?;
    db::today_board(&conn)
}

#[tauri::command]
pub fn bump_follow_up(state: State<'_, AppData>, id: i64, days: i64) -> Result<Item, String> {
    let conn = connection(&state)?;
    db::bump_follow_up(&conn, id, days)
}

#[tauri::command]
pub fn get_settings(app: AppHandle, state: State<'_, AppData>) -> Result<SettingsView, String> {
    let conn = connection(&state)?;
    Ok(SettingsView {
        base_url: ai::stored_base_url(&conn)?,
        model: ai::stored_model(&conn)?,
        has_api_key: ai::has_api_key()?,
        autostart: autostart_enabled(&app),
        supports_autostart: cfg!(desktop),
        auto_remind: db::auto_remind_enabled(&conn)?,
        data_path: state.db_path.display().to_string(),
    })
}

fn autostart_enabled(app: &AppHandle) -> bool {
    #[cfg(desktop)]
    {
        return app.autolaunch().is_enabled().unwrap_or(false);
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        false
    }
}

fn apply_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if enabled {
            app.autolaunch().enable().map_err(|err| err.to_string())
        } else {
            app.autolaunch().disable().map_err(|err| err.to_string())
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, enabled);
        Ok(())
    }
}

#[tauri::command]
pub fn save_settings(app: AppHandle, state: State<'_, AppData>, input: SettingsInput) -> Result<SettingsView, String> {
    let conn = connection(&state)?;
    let base_url = if input.base_url.trim().is_empty() {
        "https://api.openai.com/v1".to_string()
    } else {
        input.base_url.trim().trim_end_matches('/').to_string()
    };
    let model = if input.model.trim().is_empty() {
        "gpt-4o-mini".to_string()
    } else {
        input.model.trim().to_string()
    };
    db::set_setting(&conn, "ai_base_url", &base_url)?;
    db::set_setting(&conn, "ai_model", &model)?;
    if input.clear_api_key {
        ai::set_api_key("")?;
    } else if let Some(key) = input.api_key {
        if !key.trim().is_empty() {
            ai::set_api_key(&key)?;
        }
    }
    apply_autostart(&app, input.autostart)?;
    db::set_setting(&conn, "auto_remind", if input.auto_remind { "1" } else { "0" })?;
    get_settings(app, state)
}

#[tauri::command]
pub fn active_reminder(state: State<'_, AppData>) -> Result<Option<ReminderView>, String> {
    let conn = connection(&state)?;
    db::load_reminder(&conn)
}

#[tauri::command]
pub async fn preview_judgment(state: State<'_, AppData>, text: String) -> Result<JudgmentView, String> {
    let (view, _) = judge_reminder(&state, &text).await?;
    Ok(view)
}

#[tauri::command]
pub async fn resolve_reminder(app: AppHandle, state: State<'_, AppData>, text: String, follow: bool) -> Result<JudgmentView, String> {
    let (view, judgment) = judge_reminder(&state, &text).await?;
    let conn = connection(&state)?;
    db::apply_resolution(&conn, &text, follow, view.matched_item_id, &view.match_source, &judgment)?;
    let _ = app.emit("desk://changed", ());
    Ok(view)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderTargetView {
    page: String,
    project_id: Option<i64>,
    subproject_id: Option<i64>,
}

#[tauri::command]
pub fn open_reminder_detail(app: AppHandle, state: State<'_, AppData>) -> Result<ReminderTargetView, String> {
    let conn = connection(&state)?;
    let target = db::reminder_target(&conn)?;
    drop(conn);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        #[cfg(desktop)]
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    let view = ReminderTargetView {
        page: target.page.clone(),
        project_id: target.project_id,
        subproject_id: target.subproject_id,
    };
    let _ = app.emit("desk://open", &view);
    Ok(view)
}

#[tauri::command]
pub fn postpone_reminder_due(
    app: AppHandle,
    state: State<'_, AppData>,
    minutes: Option<i64>,
    at: Option<String>,
) -> Result<(), String> {
    let conn = connection(&state)?;
    db::postpone_reminder_due(&conn, minutes, at.as_deref())?;
    let _ = app.emit("desk://changed", ());
    Ok(())
}

#[tauri::command]
pub fn acknowledge_reminder(app: AppHandle, state: State<'_, AppData>) -> Result<(), String> {
    let conn = connection(&state)?;
    db::acknowledge_reminder(&conn)?;
    let _ = app.emit("desk://changed", ());
    Ok(())
}

#[tauri::command]
pub fn resolve_stall(app: AppHandle, state: State<'_, AppData>, action: String) -> Result<(), String> {
    let conn = connection(&state)?;
    db::resolve_stall(&conn, &action)?;
    let _ = app.emit("desk://changed", ());
    Ok(())
}

#[tauri::command]
pub fn check_reminders(app: AppHandle, state: State<'_, AppData>) -> Result<Option<ReminderView>, String> {
    let reminder = schedule::scan(&state.db_path)?;
    if let Some(reminder) = &reminder {
        present(&app, reminder);
    }
    Ok(reminder)
}

#[tauri::command]
pub async fn test_ai_connection(
    state: State<'_, AppData>,
    base_url: Option<String>,
    model: Option<String>,
    api_key: Option<String>,
) -> Result<String, String> {
    let config = {
        let conn = connection(&state)?;
        ai::resolve_probe_config(
            &conn,
            base_url.as_deref(),
            model.as_deref(),
            api_key.as_deref(),
        )?
    };
    ai::probe(config).await
}

#[tauri::command]
pub async fn ai_clarify(state: State<'_, AppData>, id: i64) -> Result<ai::ClarifyResult, String> {
    let conn = connection(&state)?;
    let item = db::get_item(&conn, id)?;
    let projects = db::list_projects(&conn)?;
    let subs = db::list_subprojects(&conn, None)?;
    let config = ai::load_config(&conn)?;
    drop(conn);
    Ok(ai::clarify(config, &item, &projects, &subs).await)
}

#[tauri::command]
pub async fn ai_morning(state: State<'_, AppData>) -> Result<ai::MorningResult, String> {
    let conn = connection(&state)?;
    let suggestions = db::rule_suggestions(&conn)?;
    let config = ai::load_config(&conn)?;
    drop(conn);
    Ok(ai::morning(config, &suggestions).await)
}

#[tauri::command]
pub async fn ai_follow_up_lines(
    state: State<'_, AppData>,
    id: i64,
    extra: Option<String>,
) -> Result<ai::FollowUpLines, String> {
    let (item, config) = {
        let conn = connection(&state)?;
        let item = db::get_item(&conn, id)?;
        if item.kind != "waiting" {
            return Err("只有等待可以生成问询话术".into());
        }
        let config = ai::load_config(&conn)?;
        (item, config)
    };
    ai::follow_up_lines(config, &item, extra.as_deref().unwrap_or("")).await
}

#[tauri::command]
pub fn load_demo(app: AppHandle, state: State<'_, AppData>) -> Result<(), String> {
    let conn = connection(&state)?;
    db::load_demo(&conn)?;
    let _ = app.emit("desk://changed", ());
    Ok(())
}

async fn judge_reminder(state: &State<'_, AppData>, text: &str) -> Result<(JudgmentView, judge::Judgment), String> {
    let (items, config) = {
        let conn = connection(state)?;
        if db::load_reminder(&conn)?.is_none() {
            return Err("没有进行中的提醒".into());
        }
        (db::work_items(&conn)?, ai::load_config(&conn)?)
    };
    let (ai_id, attempted, thinking) = match config.as_ref() {
        Some(config) => match ai::match_id(config, text, &items).await {
            Ok((id, thinking)) => (id, true, thinking),
            Err(err) => {
                eprintln!("ai match: {err}");
                (None, false, None)
            }
        },
        None => (None, false, None),
    };
    let conn = connection(state)?;
    let reminder = db::load_reminder(&conn)?.ok_or("没有进行中的提醒")?;
    let matched = if let Some(id) = ai_id {
        db::get_item(&conn, id).ok()
    } else {
        db::lexical_match(&conn, text)?
    };
    let current = match &matched {
        Some(item) => Some(db::current_work(&conn, item)?),
        None => None,
    };
    let already_on_it = matched
        .as_ref()
        .and_then(|item| reminder.item_id.map(|id| item.id == id))
        .unwrap_or(false);
    let incoming_due = reminder.item_id.and_then(|id| {
        db::get_item(&conn, id).ok().and_then(|item| {
            item.due_at
                .as_deref()
                .and_then(parse_stored)
                .or_else(|| item.follow_up_at.as_deref().and_then(parse_stored))
        })
    });
    let judgment = judge::judge(JudgeInput {
        class: reminder.class,
        incoming_due,
        current,
        already_on_it,
    });
    let view = JudgmentView {
        matched_item_id: matched.as_ref().map(|item| item.id),
        matched_title: matched.as_ref().map(|item| item.title.clone()),
        verdict: judgment.verdict,
        reason: judgment.reason.clone(),
        snooze_min: judgment.snooze_min,
        match_source: if attempted { "ai".into() } else { "rules".into() },
        thinking,
    };
    Ok((view, judgment))
}

#[tauri::command]
pub fn get_sync_status(state: State<'_, AppData>) -> Result<crate::sync::SyncStatusView, String> {
    let conn = connection(&state)?;
    crate::sync::status(&conn)
}

#[tauri::command]
pub fn set_sync_base_url(state: State<'_, AppData>, base_url: String) -> Result<crate::sync::SyncStatusView, String> {
    let conn = connection(&state)?;
    crate::sync::set_base_url(&conn, &base_url)?;
    crate::sync::status(&conn)
}

#[tauri::command]
pub async fn sync_register(
    state: State<'_, AppData>,
    email: String,
    password: String,
    display_name: Option<String>,
    base_url: Option<String>,
) -> Result<crate::sync::SyncStatusView, String> {
    let path = state.db_path.clone();
    if let Some(url) = base_url {
        let conn = db::open(&path)?;
        crate::sync::set_base_url(&conn, &url)?;
    }
    crate::sync::register(&path, &email, &password, display_name.as_deref()).await
}

#[tauri::command]
pub async fn sync_login(
    state: State<'_, AppData>,
    email: String,
    password: String,
    base_url: Option<String>,
) -> Result<crate::sync::SyncStatusView, String> {
    let path = state.db_path.clone();
    if let Some(url) = base_url {
        let conn = db::open(&path)?;
        crate::sync::set_base_url(&conn, &url)?;
    }
    crate::sync::login(&path, &email, &password).await
}

#[tauri::command]
pub fn sync_logout(state: State<'_, AppData>) -> Result<crate::sync::SyncStatusView, String> {
    let conn = connection(&state)?;
    crate::sync::logout(&conn)
}

#[tauri::command]
pub async fn sync_set_display_name(
    state: State<'_, AppData>,
    display_name: String,
) -> Result<crate::sync::SyncStatusView, String> {
    let path = state.db_path.clone();
    crate::sync::set_display_name(&path, &display_name).await
}

#[tauri::command]
pub async fn sync_now(app: AppHandle, state: State<'_, AppData>) -> Result<crate::sync::SyncResultView, String> {
    let path = state.db_path.clone();
    let result = crate::sync::sync_now(&path).await?;
    let _ = app.emit("desk://changed", ());
    Ok(result)
}

#[tauri::command]
pub fn list_note_nodes(state: State<'_, AppData>) -> Result<Vec<crate::notes::NoteNode>, String> {
    let conn = connection(&state)?;
    crate::notes::list_notes(&conn)
}

#[tauri::command]
pub fn create_note_node(
    state: State<'_, AppData>,
    kind: String,
    parent_id: Option<i64>,
    title: String,
) -> Result<crate::notes::NoteNode, String> {
    let conn = connection(&state)?;
    crate::notes::create_note_node(&conn, &kind, parent_id, &title)
}

#[tauri::command]
pub fn save_note_node(
    state: State<'_, AppData>,
    id: i64,
    title: String,
    body: String,
) -> Result<crate::notes::NoteNode, String> {
    let conn = connection(&state)?;
    crate::notes::save_note(&conn, id, &title, &body)
}

#[tauri::command]
pub fn rename_note_node(
    state: State<'_, AppData>,
    id: i64,
    title: String,
) -> Result<crate::notes::NoteNode, String> {
    let conn = connection(&state)?;
    crate::notes::rename_note(&conn, id, &title)
}

#[tauri::command]
pub fn set_note_starred(
    state: State<'_, AppData>,
    id: i64,
    starred: bool,
) -> Result<crate::notes::NoteNode, String> {
    let conn = connection(&state)?;
    crate::notes::set_starred(&conn, id, starred)
}

#[tauri::command]
pub fn set_note_pinned(
    state: State<'_, AppData>,
    id: i64,
    pinned: bool,
) -> Result<crate::notes::NoteNode, String> {
    let conn = connection(&state)?;
    crate::notes::set_pinned(&conn, id, pinned)
}

#[tauri::command]
pub fn move_note_node(
    state: State<'_, AppData>,
    id: i64,
    parent_id: Option<i64>,
) -> Result<crate::notes::NoteNode, String> {
    let conn = connection(&state)?;
    crate::notes::move_note(&conn, id, parent_id)
}

#[tauri::command]
pub fn delete_note_node(state: State<'_, AppData>, id: i64) -> Result<(), String> {
    let conn = connection(&state)?;
    crate::notes::delete_note(&conn, id)
}

