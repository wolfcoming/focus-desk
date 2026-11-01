mod ai;
mod commands;
mod db;
mod judge;
mod schedule;
mod timeutil;

use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use crate::commands::{present, AppData};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
            let db_path = dir.join("focus-desk.sqlite");
            let conn = db::open(&db_path)?;
            if db::get_setting(&conn, "bootstrapped")?.is_none() {
                let _ = app.autolaunch().enable();
                db::set_setting(&conn, "bootstrapped", "1")?;
            }
            db::seed_demo(&conn)?;
            drop(conn);

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

            let close_db = db_path.clone();
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

            let show = MenuItem::with_id(app, "show", "打开 Focus Desk", true, None::<&str>)?;
            let check = MenuItem::with_id(app, "check", "立即检查提醒", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &check, &quit])?;
            let icon = app.default_window_icon().cloned().ok_or("缺少应用图标")?;
            let tray_db = db_path.clone();
            TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("Focus Desk")
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

            app.manage(AppData { db_path: db_path.clone() });

            if let Ok(Some(reminder)) = schedule::pending(&db_path) {
                present(app.handle(), &reminder);
            }

            let scheduler_app = app.handle().clone();
            let scheduler_db = db_path;
            std::thread::spawn(move || loop {
                match schedule::scan(&scheduler_db) {
                    Ok(Some(reminder)) => present(&scheduler_app, &reminder),
                    Ok(None) => {}
                    Err(err) => eprintln!("reminder: {err}"),
                }
                std::thread::sleep(Duration::from_secs(20));
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::create_project,
            commands::set_project_status,
            commands::list_subprojects,
            commands::create_subproject,
            commands::set_subproject_progress,
            commands::list_work_logs,
            commands::set_subproject_status,
            commands::delete_project,
            commands::delete_subproject,
            commands::capture,
            commands::save_item,
            commands::list_items,
            commands::complete_item,
            commands::drop_item,
            commands::start_item,
            commands::set_today,
            commands::today_board,
            commands::weekly_packet,
            commands::limits,
            commands::bump_follow_up,
            commands::get_settings,
            commands::save_settings,
            commands::active_reminder,
            commands::preview_judgment,
            commands::resolve_reminder,
            commands::acknowledge_reminder,
            commands::resolve_stall,
            commands::check_reminders,
            commands::ai_clarify,
            commands::ai_morning,
            commands::ai_weekly
        ])
        .run(tauri::generate_context!())
        .expect("error while running Focus Desk");
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
