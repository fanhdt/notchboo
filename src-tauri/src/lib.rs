mod activity;
mod island;
mod lyrics;
mod media;
mod monitor;
mod power;
mod shelf;
mod window;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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

            // Quick Shelf: gagal membuka database tidak boleh menjatuhkan island.
            // Kegagalannya disimpan di state dan dilaporkan oleh tiap command shelf.
            app.manage(shelf::init(app.handle()));
            shelf::start_maintenance(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            island::set_island_hitbox,
            lyrics::get_lyrics,
            media::get_media_info,
            media::get_playback_info,
            media::media_control,
            media::media_seek,
            monitor::set_monitoring,
            shelf::commands::shelf_list,
            shelf::commands::shelf_get,
            shelf::commands::shelf_add_text,
            shelf::commands::shelf_update_text,
            shelf::commands::shelf_set_pinned,
            shelf::commands::shelf_set_expiry,
            shelf::commands::shelf_delete,
            shelf::commands::shelf_import_paths,
            shelf::commands::shelf_pick_and_import,
            shelf::commands::shelf_open,
            shelf::commands::shelf_reveal,
            shelf::commands::shelf_get_settings,
            shelf::commands::shelf_set_default_expiry,
            shelf::window::shelf_open_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}