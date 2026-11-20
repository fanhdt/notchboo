
use crate::{
    settings::AppSettings,
    settings_store::SettingsStore,
};
use tauri::{AppHandle, Emitter, State};
use crate::shortcuts;

pub const SETTINGS_CHANGED_EVENT: &str = "settings-changed";

/// Memuat konfigurasi terbaru dari penyimpanan lokal.
#[tauri::command]
pub fn settings_load(
    store: State<'_, SettingsStore>,
) -> Result<AppSettings, String> {
    store.load_or_default()
}

/// Memvalidasi dan menyimpan konfigurasi.
///
/// Event hanya dikirim setelah penyimpanan berhasil. Kegagalan mengirim
/// event tidak membatalkan penyimpanan yang sudah berhasil dilakukan.
#[tauri::command]
pub fn settings_save(
    app: AppHandle,
    store: State<'_, SettingsStore>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    // Ambil konfigurasi sebelumnya untuk kebutuhan rollback.
    let previous = store.load_or_default()?;

    // Terapkan shortcut baru terlebih dahulu.
    shortcuts::replace_shortcuts(
        &app,
        &previous.shortcuts,
        &settings.shortcuts,
    )?;

    // Simpan konfigurasi. Jika gagal, pulihkan shortcut sebelumnya.
    if let Err(error) = store.save(&settings) {
        if let Err(rollback_error) = shortcuts::replace_shortcuts(
            &app,
            &settings.shortcuts,
            &previous.shortcuts,
        ) {
            return Err(format!(
                "Gagal menyimpan konfigurasi: {error}. \
                 Gagal memulihkan shortcut sebelumnya: {rollback_error}"
            ));
        }

        return Err(error);
    }

    // Beri tahu frontend bahwa konfigurasi telah berubah.
    if let Err(error) = app.emit(SETTINGS_CHANGED_EVENT, settings.clone()) {
        eprintln!("[Settings] Gagal mengirim event perubahan: {error}");
    }

    Ok(settings)
}
