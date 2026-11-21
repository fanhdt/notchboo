use crate::{autostart, settings::AppSettings, settings_store::SettingsStore, shortcuts};

use std::sync::{Mutex, MutexGuard};

static SETTINGS_TRANSACTION_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn lock_settings_transaction() -> MutexGuard<'static, ()> {
    SETTINGS_TRANSACTION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

pub const SETTINGS_CHANGED_EVENT: &str = "settings-changed";

/// Memuat konfigurasi terbaru dari penyimpanan lokal.
#[tauri::command]
pub fn settings_load(store: State<'_, SettingsStore>) -> Result<AppSettings, String> {
    store.load_or_default()
}

/// Menyimpan konfigurasi beserta sinkronisasi shortcut dan autostart.
#[tauri::command]
pub fn settings_save(
    app: AppHandle,
    store: State<'_, SettingsStore>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let _transaction = lock_settings_transaction();

    let previous = store.load_or_default()?;

    apply_settings(&app, &store, &previous, &settings)?;

    emit_settings_changed(&app, &settings);

    Ok(settings)
}

/// Mengekspor konfigurasi aktif ke file JSON.
#[tauri::command]
pub fn settings_export(store: State<'_, SettingsStore>, file_path: String) -> Result<(), String> {
    store.export_to(PathBuf::from(file_path))
}

/// Membaca dan memvalidasi file konfigurasi untuk preview.
#[tauri::command]
pub fn settings_preview_import(file_path: String) -> Result<AppSettings, String> {
    SettingsStore::read_import_file(PathBuf::from(file_path))
}

/// Mengonfirmasi import konfigurasi.
#[tauri::command]
pub fn settings_confirm_import(
    app: AppHandle,
    store: State<'_, SettingsStore>,
    file_path: String,
) -> Result<AppSettings, String> {
    let imported = SettingsStore::read_import_file(PathBuf::from(file_path))?;

    let _transaction = lock_settings_transaction();

    let previous = store.load_or_default()?;
    let backup_path = store.backup_current()?;

    if let Err(error) = apply_settings(&app, &store, &previous, &imported) {
        return Err(format!(
            "{error}. Backup konfigurasi tersedia di: {}",
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

/// Satu jalur penerapan konfigurasi untuk Settings dan system tray.
/// Jika penyimpanan gagal, perubahan sistem dikembalikan.
pub(crate) fn apply_settings(
    app: &AppHandle,
    store: &SettingsStore,
    previous: &AppSettings,
    next: &AppSettings,
) -> Result<(), String> {
    next.validate()
        .map_err(|error| format!("Konfigurasi tidak valid: {error}"))?;

    let previous_autostart = autostart::is_enabled(app)?;
    let next_autostart = next.general.launch_at_startup;

    let shortcuts_changed = previous.shortcuts != next.shortcuts;
    let autostart_changed = previous_autostart != next_autostart;

    if shortcuts_changed {
        shortcuts::replace_shortcuts(app, &previous.shortcuts, &next.shortcuts)?;
    }

    if autostart_changed && let Err(error) = autostart::set_enabled(app, next_autostart) {
        if shortcuts_changed
            && let Err(rollback_error) =
                shortcuts::replace_shortcuts(app, &next.shortcuts, &previous.shortcuts)
        {
            return Err(format!(
                "{error}. Gagal memulihkan shortcut sebelumnya: {rollback_error}"
            ));
        }

        return Err(error);
    }

    if let Err(error) = store.save(next) {
        let mut rollback_errors = Vec::new();

        if autostart_changed
            && let Err(rollback_error) = autostart::set_enabled(app, previous_autostart)
        {
            rollback_errors.push(format!("autostart: {rollback_error}"));
        }

        if shortcuts_changed
            && let Err(rollback_error) =
                shortcuts::replace_shortcuts(app, &next.shortcuts, &previous.shortcuts)
        {
            rollback_errors.push(format!("shortcut: {rollback_error}"));
        }

        if !rollback_errors.is_empty() {
            return Err(format!(
                "Gagal menyimpan konfigurasi: {error}. Gagal memulihkan {}",
                rollback_errors.join("; ")
            ));
        }

        return Err(error);
    }

    Ok(())
}

/// Mengirim event perubahan konfigurasi ke frontend.
fn emit_settings_changed(app: &AppHandle, settings: &AppSettings) {
    if let Err(error) = app.emit(SETTINGS_CHANGED_EVENT, settings.clone()) {
        eprintln!("[Settings] Gagal mengirim event perubahan: {error}");
    }
}
