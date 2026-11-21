use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

const LEGACY_MARKER_FILE: &str = "autostart-initialized";
const SETTINGS_MIGRATION_MARKER_FILE: &str = "autostart-settings-migrated";

fn marker_path(app: &AppHandle, filename: &str) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Gagal mendapatkan direktori konfigurasi: {error}"))?;

    Ok(config_dir.join(filename))
}

/// Memeriksa apakah instalasi pernah menggunakan mekanisme autostart lama.
pub fn has_legacy_marker(app: &AppHandle) -> Result<bool, String> {
    let path = marker_path(app, LEGACY_MARKER_FILE)?;

    path.try_exists()
        .map_err(|error| format!("Gagal memeriksa marker autostart lama: {error}"))
}

/// Memeriksa apakah migrasi ke centralized settings sudah dilakukan.
pub fn has_settings_migration_marker(app: &AppHandle) -> Result<bool, String> {
    let path = marker_path(app, SETTINGS_MIGRATION_MARKER_FILE)?;

    path.try_exists()
        .map_err(|error| format!("Gagal memeriksa marker migrasi autostart: {error}"))
}

/// Menandai bahwa migrasi autostart ke centralized settings berhasil.
pub fn mark_settings_migrated(app: &AppHandle) -> Result<(), String> {
    let path = marker_path(app, SETTINGS_MIGRATION_MARKER_FILE)?;

    let parent = path
        .parent()
        .ok_or_else(|| "Direktori marker autostart tidak valid".to_string())?;

    fs::create_dir_all(parent)
        .map_err(|error| format!("Gagal membuat direktori konfigurasi: {error}"))?;

    fs::write(path, "1")
        .map_err(|error| format!("Gagal menyimpan marker migrasi autostart: {error}"))
}

/// Membaca status autostart dari sistem operasi.
pub fn is_enabled(app: &AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| format!("Gagal memeriksa status autostart: {error}"))
}

/// Mengubah status autostart pada sistem operasi.
pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let launcher = app.autolaunch();

    let result = if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    };

    result.map_err(|error| {
        format!(
            "Gagal {} autostart: {error}",
            if enabled {
                "mengaktifkan"
            } else {
                "menonaktifkan"
            }
        )
    })
}
