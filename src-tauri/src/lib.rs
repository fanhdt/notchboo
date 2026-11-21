mod activity;
mod autostart;
mod cursor_geometry;
mod island;
mod lyrics;
mod monitor;
mod notifications;
mod settings;
mod settings_commands;
mod settings_store;
mod settings_window;
mod shortcuts;

// Bagian yang memakai API sistem punya satu berkas per platform;
// bentuk publiknya sama.
#[cfg(windows)]
mod foreground;
#[cfg(target_os = "macos")]
#[path = "foreground_macos.rs"]
mod foreground;

#[cfg(windows)]
mod media;
#[cfg(target_os = "macos")]
#[path = "media_macos.rs"]
mod media;

#[cfg(windows)]
mod power;
#[cfg(target_os = "macos")]
#[path = "power_macos.rs"]
mod power;

#[cfg(target_os = "macos")]
mod mac;

mod shelf;
mod tasks;
mod tray;
mod window;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(island::IslandShared::default())
        .manage(foreground::ForegroundShared::default())
        .manage(monitor::MonitorControl::default())
        .setup(|app| {
            // Inisialisasi centralized settings.
            let settings_path = app
                .path()
                .app_config_dir()
                .map_err(std::io::Error::other)?
                .join("settings.json");

            // Periksa sebelum load_or_default membuat file baru.
            let settings_file_exists = settings_path.try_exists().map_err(std::io::Error::other)?;

            let settings_store = settings_store::SettingsStore::new(settings_path);

            let mut settings = settings_store
                .load_or_default()
                .map_err(std::io::Error::other)?;

            let migration_completed = autostart::has_settings_migration_marker(app.handle())
                .map_err(std::io::Error::other)?;

            if !migration_completed {
                let has_legacy_marker =
                    autostart::has_legacy_marker(app.handle()).map_err(std::io::Error::other)?;

                if has_legacy_marker {
                    // Instalasi lama: pertahankan preferensi autostart OS pengguna.
                    let legacy_status =
                        autostart::is_enabled(app.handle()).map_err(std::io::Error::other)?;

                    settings.general.launch_at_startup = legacy_status;

                    settings_store
                        .save(&settings)
                        .map_err(std::io::Error::other)?;
                } else {
                    // Tidak ada marker lama:
                    // gunakan preferensi centralized settings yang tersedia.
                    // Untuk instalasi baru, nilai ini berasal dari default settings.
                    let desired = settings.general.launch_at_startup;
                    let current =
                        autostart::is_enabled(app.handle()).map_err(std::io::Error::other)?;

                    if current != desired {
                        autostart::set_enabled(app.handle(), desired)
                            .map_err(std::io::Error::other)?;
                    }

                    // Jika settings sudah ada, pastikan nilainya tetap tersimpan.
                    if !settings_file_exists {
                        settings_store
                            .save(&settings)
                            .map_err(std::io::Error::other)?;
                    }
                }

                // Tandai hanya setelah proses migrasi berhasil.
                autostart::mark_settings_migrated(app.handle()).map_err(std::io::Error::other)?;
            } else {
                // Migrasi selesai: centralized settings menjadi sumber kebenaran.
                let desired = settings.general.launch_at_startup;
                let current = autostart::is_enabled(app.handle()).map_err(std::io::Error::other)?;

                if current != desired {
                    autostart::set_enabled(app.handle(), desired).map_err(std::io::Error::other)?;
                }
            }

            app.manage(settings_store);

            if let Err(error) = shortcuts::register_shortcuts(app.handle(), &settings.shortcuts) {
                eprintln!("[Shortcuts] Gagal mendaftarkan shortcut saat startup: {error}");
            }

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if let Some(main_window) = app.get_webview_window("main") {
                window::position_top_center(&main_window)?;

                #[cfg(target_os = "macos")]
                mac::float_above_menu_bar(&main_window)?;

                main_window.set_ignore_cursor_events(true)?;
                main_window.show()?;

                island::start_cursor_watcher(app.handle(), main_window);
            }

            foreground::start_foreground_watcher(app.handle());

            if let Err(error) = tray::init(app.handle()) {
                eprintln!("Gagal membuat ikon tray: {error}");
            }

            media::start_media_watcher(app.handle());
            monitor::start_monitor(app.handle());
            notifications::start_notification_watcher(app.handle());

            app.manage(shelf::init(app.handle()));
            shelf::start_maintenance(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Centralized settings

            // Centralized settings
            settings_commands::settings_load,
            settings_commands::settings_save,
            settings_commands::settings_export,
            settings_commands::settings_preview_import,
            settings_commands::settings_confirm_import,
            settings_window::settings_open_window,
            // Existing commands
            foreground::get_foreground_busy,
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
            shelf::window::shelf_open_window,
            tasks::tasks_load,
            tasks::tasks_save,
            tasks::tasks_open_window
        ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            // Hentikan seluruh worker yang memiliki mekanisme shutdown eksplisit.
            #[cfg(windows)]
            {
                foreground::stop_foreground_watcher();
                media::stop_media_watcher();
            }

            island::stop_cursor_watcher();
            shelf::stop_maintenance();
            monitor::stop_monitor(app_handle);
            notifications::stop_notification_watcher();
        }
    });
}
