mod activity;
mod island;
mod lyrics;
mod media;
mod monitor;
mod power;
mod window;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(island::IslandShared::default())
        .manage(monitor::MonitorControl::default())
        .setup(|app| {
            if let Some(main_window) = app.get_webview_window("main") {
                window::position_top_center(&main_window)?;
                main_window.set_ignore_cursor_events(true)?;
                main_window.show()?;

                activity::start_activity_watcher(app.handle(), main_window.clone());
                island::start_cursor_watcher(app.handle(), main_window);
            }
            media::start_media_watcher(app.handle());
            monitor::start_monitor(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            island::set_island_hitbox,
            lyrics::get_lyrics,
            media::get_media_info,
            media::get_playback_info,
            media::media_control,
            media::media_seek,
            monitor::set_monitoring
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}