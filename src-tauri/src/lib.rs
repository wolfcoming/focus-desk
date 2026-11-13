mod ai;
mod commands;
mod db;
mod judge;
mod schedule;
mod secret;
mod sync;
mod timeutil;

use std::time::Duration;

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
#[cfg(desktop)]
use tauri::Emitter;
use tauri::Manager;

#[cfg(desktop)]
use tauri_plugin_autostart::MacosLauncher;

use crate::commands::{present, AppData};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None));
    #[cfg(not(desktop))]
    let builder = tauri::Builder::default().plugin(tauri_plugin_notification::init());
    builder
        .setup(|app| {
            let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
            std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
            secret::init(&dir.join("secrets"));
            let db_path = dir.join("focus-desk.sqlite");
            let conn = db::open(&db_path)?;
            if db::get_setting(&conn, "bootstrapped")?.is_none() {
                db::set_setting(&conn, "bootstrapped", "1")?;
            }
            drop(conn);

            #[cfg(desktop)]
            setup_desktop(app, &db_path)?;

            app.manage(AppData { db_path: db_path.clone() });

            if let Ok(conn) = db::open(&db_path) {
                if db::auto_remind_enabled(&conn).unwrap_or(true) {
                    if let Ok(Some(reminder)) = schedule::pending(&db_path) {
                        present(app.handle(), &reminder);
                    }
                }
            }

            let scheduler_app = app.handle().clone();
            let scheduler_db = db_path;
            std::thread::spawn(move || loop {
                let enabled = db::open(&scheduler_db)
                    .ok()
                    .and_then(|conn| db::auto_remind_enabled(&conn).ok())
                    .unwrap_or(true);
                if enabled {
                    match schedule::scan(&scheduler_db) {
                        Ok(Some(reminder)) => present(&scheduler_app, &reminder),
                        Ok(None) => {}
                        Err(err) => eprintln!("reminder: {err}"),
                    }
                }
                std::thread::sleep(Duration::from_secs(20));
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::create_project,
            commands::update_project,
            commands::set_project_status,
            commands::list_subprojects,
            commands::create_subproject,
            commands::set_subproject_progress,
            commands::set_subproject_due,
            commands::set_subproject_repeat,
            commands::set_subproject_reminder,
            commands::set_subproject_quadrant,
            commands::rename_subproject,
            commands::update_subproject,
            commands::set_subproject_modules,
            commands::set_subproject_notes,
            commands::set_subproject_retrospect,
            commands::list_subproject_attachments,
            commands::add_subproject_attachment,
            commands::delete_subproject_attachment,
            commands::open_subproject_attachment,
            commands::reorder_subprojects,
            commands::list_work_logs,
            commands::add_work_log,
            commands::update_work_log,
            commands::delete_work_log,
            commands::list_idea_tags,
            commands::add_idea_tag,
            commands::update_idea_tag,
            commands::move_idea_tag,
            commands::delete_idea_tag,
            commands::set_subproject_status,
            commands::delete_project,
            commands::delete_subproject,
            commands::capture,
            commands::capture_inbox,
            commands::save_item,
            commands::list_items,
            commands::complete_item,
            commands::set_todo_done,
            commands::drop_item,
            commands::start_item,
            commands::set_today,
            commands::today_board,
            commands::bump_follow_up,
            commands::get_settings,
            commands::save_settings,
            commands::active_reminder,
            commands::preview_judgment,
            commands::resolve_reminder,
            commands::acknowledge_reminder,
            commands::open_reminder_detail,
            commands::postpone_reminder_due,
            commands::resolve_stall,
            commands::check_reminders,
            commands::test_ai_connection,
            commands::ai_clarify,
            commands::ai_morning,
            commands::ai_follow_up_lines,
            commands::load_demo,
            commands::get_sync_status,
            commands::set_sync_base_url,
            commands::sync_register,
            commands::sync_login,
            commands::sync_logout,
            commands::sync_set_display_name,
            commands::sync_now
        ])
        .run(tauri::generate_context!())
        .expect("error while running Little Fun");
}

#[cfg(desktop)]
fn setup_desktop(app: &tauri::App, db_path: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
    let reminder = WebviewWindowBuilder::new(
        app,
        "reminder",
        WebviewUrl::App("index.html?view=reminder".into()),
    )
    .title("该处理一件事")
    .inner_size(440.0, 620.0)
    .min_inner_size(380.0, 520.0)
    .resizable(false)
    .always_on_top(true)
    .visible(false)
    .center()
    .background_color(tauri::window::Color(239, 232, 220, 255))
    .build()?;

    let close_db = db_path.to_path_buf();
    let close_app = app.handle().clone();
    reminder.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Ok(conn) = db::open(&close_db) {
                let _ = db::acknowledge_reminder(&conn);
            }
            if let Some(window) = close_app.get_webview_window("reminder") {
                let _ = window.hide();
            }
            let _ = close_app.emit("desk://changed", ());
        }
    });

    if let Some(main_window) = app.get_webview_window("main") {
        let main_guard = main_window.clone();
        main_window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = main_guard.hide();
            }
        });
    }

    let show = MenuItem::with_id(app, "show", "打开 Little Fun", true, None::<&str>)?;
    let check = MenuItem::with_id(app, "check", "立即检查提醒", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &check, &quit])?;
    let icon = app.default_window_icon().cloned().ok_or("缺少应用图标")?;
    let tray_db = db_path.to_path_buf();
    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("Little Fun")
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            "check" => {
                if let Ok(Some(reminder)) = schedule::scan(&tray_db) {
                    present(app, &reminder);
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg(desktop)]
fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
