use crate::{settings::AppSettings, settings_store::SettingsStore, shortcuts};

use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

pub const SETTINGS_CHANGED_EVENT: &str = "settings-changed";

/// Memuat konfigurasi terbaru dari penyimpanan lokal.
#[tauri::command]
pub fn settings_load(store: State<'_, SettingsStore>) -> Result<AppSettings, String> {
    store.load_or_default()
}

/// Memvalidasi dan menyimpan konfigurasi.
///
/// Event hanya dikirim setelah penyimpanan berhasil dilakukan.
#[tauri::command]
pub fn settings_save(
    app: AppHandle,
    store: State<'_, SettingsStore>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let previous = store.load_or_default()?;

    shortcuts::replace_shortcuts(&app, &previous.shortcuts, &settings.shortcuts)?;

    if let Err(error) = store.save(&settings) {
        if let Err(rollback_error) =
            shortcuts::replace_shortcuts(&app, &settings.shortcuts, &previous.shortcuts)
        {
            return Err(format!(
                "Gagal menyimpan konfigurasi: {error}. \
                 Gagal memulihkan shortcut sebelumnya: {rollback_error}"
            ));
        }

        return Err(error);
    }

    emit_settings_changed(&app, &settings);

    Ok(settings)
}

/// Mengekspor konfigurasi aktif ke file JSON.
#[tauri::command]
pub fn settings_export(store: State<'_, SettingsStore>, file_path: String) -> Result<(), String> {
    let path = PathBuf::from(file_path);

    store.export_to(path)
}

/// Membaca dan memvalidasi file konfigurasi untuk preview.
/// Tidak mengubah konfigurasi aktif.
#[tauri::command]
pub fn settings_preview_import(file_path: String) -> Result<AppSettings, String> {
    SettingsStore::read_import_file(PathBuf::from(file_path))
}

/// Mengonfirmasi import konfigurasi.
///
/// File divalidasi ulang, konfigurasi aktif di-backup,
/// lalu shortcut dan penyimpanan diperbarui.
#[tauri::command]
pub fn settings_confirm_import(
    app: AppHandle,
    store: State<'_, SettingsStore>,
    file_path: String,
) -> Result<AppSettings, String> {
    let imported = SettingsStore::read_import_file(PathBuf::from(file_path))?;

    let previous = store.load_or_default()?;

    // Backup konfigurasi aktif sebelum melakukan perubahan.
    let backup_path = store.backup_current()?;

    // Terapkan shortcut baru terlebih dahulu.
    shortcuts::replace_shortcuts(&app, &previous.shortcuts, &imported.shortcuts)?;

    // Simpan konfigurasi hasil import.
    if let Err(error) = store.save(&imported) {
        if let Err(rollback_error) =
            shortcuts::replace_shortcuts(&app, &imported.shortcuts, &previous.shortcuts)
        {
            return Err(format!(
                "Gagal menyimpan konfigurasi import: {error}. \
                 Gagal memulihkan shortcut: {rollback_error}. \
                 Backup tersedia di: {}",
                backup_path.display()
            ));
        }

        return Err(format!(
            "Gagal menyimpan konfigurasi import: {error}. \
             Backup tersedia di: {}",
            backup_path.display()
        ));
    }

    eprintln!(
        "[Settings] Import berhasil. Backup: {}",
        backup_path.display()
    );

    emit_settings_changed(&app, &imported);

    Ok(imported)
}

/// Mengirim event perubahan konfigurasi ke frontend.
fn emit_settings_changed(app: &AppHandle, settings: &AppSettings) {
    if let Err(error) = app.emit(SETTINGS_CHANGED_EVENT, settings.clone()) {
        eprintln!("[Settings] Gagal mengirim event perubahan: {error}");
    }
}
