use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::settings::ShortcutSettings;

/// Memvalidasi dan mengubah seluruh registrasi shortcut.
/// Jika registrasi baru gagal, konfigurasi sebelumnya dipulihkan.
pub fn replace_shortcuts(
    app: &AppHandle,
    previous: &ShortcutSettings,
    next: &ShortcutSettings,
) -> Result<(), String> {
    // Parse dan validasi semua kombinasi sebelum mengubah registrasi.
    let previous_shortcuts = parse_shortcuts(previous)?;
    let next_shortcuts = parse_shortcuts(next)?;

    let manager = app.global_shortcut();

    manager
        .unregister_all()
        .map_err(|error| format!("Gagal menghapus shortcut lama: {error}"))?;

    if let Err(error) = register_parsed(app, &next_shortcuts) {
        let rollback_cleanup = manager.unregister_all();

        if let Err(cleanup_error) = rollback_cleanup {
            return Err(format!(
                "Registrasi shortcut baru gagal: {error}. \
                 Pembersihan registrasi parsial juga gagal: {cleanup_error}"
            ));
        }

        if let Err(rollback_error) = register_parsed(app, &previous_shortcuts) {
            return Err(format!(
                "Registrasi shortcut baru gagal: {error}. \
                 Pemulihan shortcut sebelumnya juga gagal: {rollback_error}"
            ));
        }

        return Err(format!(
            "Shortcut baru tidak dapat didaftarkan: {error}. \
             Shortcut sebelumnya berhasil dipulihkan."
        ));
    }

    Ok(())
}

/// Registrasi awal ketika aplikasi mulai berjalan.
pub fn register_shortcuts(app: &AppHandle, settings: &ShortcutSettings) -> Result<(), String> {
    replace_shortcuts(app, &ShortcutSettings::default(), settings)
}

/// Mengubah konfigurasi menjadi daftar shortcut yang sudah divalidasi.
fn parse_shortcuts(settings: &ShortcutSettings) -> Result<Vec<(&'static str, Shortcut)>, String> {
    let entries = [
        ("toggleIsland", settings.toggle_island.as_deref()),
        ("openLauncher", settings.open_launcher.as_deref()),
        ("openClipboard", settings.open_clipboard.as_deref()),
        ("openNotifications", settings.open_notifications.as_deref()),
        ("startFocus", settings.start_focus.as_deref()),
        ("openSettings", settings.open_settings.as_deref()),
    ];

    let mut parsed = Vec::new();

    for (action, accelerator) in entries {
        let Some(accelerator) = accelerator else {
            continue;
        };

        let shortcut: Shortcut = accelerator
            .parse()
            .map_err(|error| format!("Shortcut {action} tidak valid ({accelerator}): {error}"))?;

        if parsed
            .iter()
            .any(|(_, existing): &(&'static str, Shortcut)| *existing == shortcut)
        {
            return Err(format!(
                "Shortcut {accelerator} digunakan lebih dari satu aksi."
            ));
        }

        parsed.push((action, shortcut));
    }

    Ok(parsed)
}

/// Mendaftarkan shortcut yang sudah lolos validasi.
fn register_parsed(app: &AppHandle, shortcuts: &[(&'static str, Shortcut)]) -> Result<(), String> {
    let manager = app.global_shortcut();

    for (action, shortcut) in shortcuts.iter().copied() {
        manager
            .on_shortcut(shortcut, move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    handle_shortcut_action(app, action);
                }
            })
            .map_err(|error| format!("Gagal mendaftarkan shortcut {action}: {error}"))?;
    }

    Ok(())
}

/// Menangani aksi dari shortcut yang ditekan.
fn handle_shortcut_action(app: &AppHandle, action: &str) {
    match action {
        "toggleIsland" => {
            if let Some(window) = app.get_webview_window("main")
                && let Ok(visible) = window.is_visible()
            {
                if visible {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                }
            }
        }
        "openSettings" => {
            if let Err(error) = crate::settings_window::open(app) {
                eprintln!("[Shortcuts] Gagal membuka Settings: {error}");
            }
        }
        _ => {
            // Aksi lainnya akan dihubungkan ketika fitur terkait siap.
        }
    }
}
