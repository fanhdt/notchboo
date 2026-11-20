
use crate::{
    settings::AppSettings,
    settings_store::SettingsStore,
};
use tauri::{AppHandle, Emitter, State};

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
    store.save(&settings)?;

    if let Err(error) = app.emit(SETTINGS_CHANGED_EVENT, settings.clone()) {
        eprintln!(
            "[Settings] Gagal mengirim event {SETTINGS_CHANGED_EVENT}: {error}"
        );
    }

    Ok(settings)
}
