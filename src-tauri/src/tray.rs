
//! Ikon Mochi di system tray.
//!
//! Menu tray menyediakan kontrol Peek Behavior, autostart, notifikasi uji,
//! dan keluar. Preferensi Peek Behavior disimpan melalui centralized SettingsStore.

use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};

use serde::Serialize;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Wry,
};

use crate::{
    settings::{AppSettings, PeekBehavior},
    settings_commands::SETTINGS_CHANGED_EVENT,
    settings_store::SettingsStore,
};

/// Event kompatibilitas untuk frontend yang belum dimigrasikan.
const MODE_EVENT: &str = "peek-mode-changed";
const LEGACY_SETTINGS_FILE: &str = "peek-mode.txt";

const ID_WHEN_BUSY: &str = "peek_when_busy";
const ID_ALWAYS: &str = "peek_always";
const ID_STANDBY: &str = "standby";
const ID_AUTOSTART: &str = "autostart";
const ID_TEST_NOTICE: &str = "test_notice";
const ID_QUIT: &str = "quit";

/// Perilaku Island: kapan bersembunyi ke atas atau tetap terbuka.
#[derive(Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PeekMode {
    /// Bersembunyi saat aplikasi lain aktif.
    #[default]
    WhenBusy,
    /// Selalu bersembunyi saat Island tidak dibuka.
    Always,
    /// Island selalu terbuka.
    Standby,
}

impl PeekMode {
    fn from_setting(value: &str) -> Option<Self> {
        match value.trim() {
            "whenBusy" => Some(Self::WhenBusy),
            "always" => Some(Self::Always),
            "standby" => Some(Self::Standby),
            _ => None,
        }
    }

    fn from_behavior(value: PeekBehavior) -> Self {
        match value {
            PeekBehavior::WhenBusy => Self::WhenBusy,
            PeekBehavior::Always => Self::Always,
            PeekBehavior::Standby => Self::Standby,
        }
    }

    fn into_behavior(self) -> PeekBehavior {
        match self {
            Self::WhenBusy => PeekBehavior::WhenBusy,
            Self::Always => PeekBehavior::Always,
            Self::Standby => PeekBehavior::Standby,
        }
    }
}

#[derive(Default)]
pub struct PeekState {
    mode: Mutex<PeekMode>,
}

fn lock_mode(state: &PeekState) -> MutexGuard<'_, PeekMode> {
    state
        .mode
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Mode saat ini, untuk kompatibilitas frontend lama.
#[tauri::command]
pub fn get_peek_mode(state: tauri::State<'_, PeekState>) -> PeekMode {
    *lock_mode(&state)
}

fn legacy_settings_path(app: &AppHandle) -> Option<PathBuf> {
    match app.path().app_config_dir() {
        Ok(dir) => Some(dir.join(LEGACY_SETTINGS_FILE)),
        Err(error) => {
            eprintln!("[Settings] Gagal mendapatkan folder konfigurasi: {error}");
            None
        }
    }
}

/// Membaca centralized settings dan memigrasikan file lama jika diperlukan.
fn load_mode(app: &AppHandle) -> PeekMode {
    let store = app.state::<SettingsStore>();

    let mut settings = match store.load_or_default() {
        Ok(settings) => settings,
        Err(error) => {
            eprintln!("[Settings] Gagal memuat Peek Behavior: {error}");
            return PeekMode::default();
        }
    };

    let current_mode =
        PeekMode::from_behavior(settings.appearance.island.peek_behavior);

    let Some(legacy_path) = legacy_settings_path(app) else {
        return current_mode;
    };

    match fs::read_to_string(&legacy_path) {
        Ok(value) if current_mode == PeekMode::WhenBusy => {
            if let Some(legacy_mode) = PeekMode::from_setting(&value) {
                settings.appearance.island.peek_behavior =
                    legacy_mode.into_behavior();

                match store.save(&settings) {
                    Ok(()) => {
                        if let Err(error) = fs::remove_file(&legacy_path) {
                            eprintln!(
                                "[Settings] Gagal menghapus file Peek Behavior lama: {error}"
                            );
                        }

                        return legacy_mode;
                    }
                    Err(error) => {
                        eprintln!(
                            "[Settings] Gagal memigrasikan Peek Behavior lama: {error}"
                        );
                    }
                }
            } else {
                eprintln!(
                    "[Settings] Isi file Peek Behavior lama tidak valid. \
                     File dipertahankan untuk pemeriksaan."
                );
            }
        }
        Ok(_) => {
            // Centralized settings sudah memiliki nilai sendiri dan menjadi sumber utama.
            if let Err(error) = fs::remove_file(&legacy_path) {
                eprintln!(
                    "[Settings] Gagal menghapus file Peek Behavior lama: {error}"
                );
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            eprintln!(
                "[Settings] Gagal membaca file Peek Behavior lama: {error}"
            );
        }
    }

    current_mode
}

/// Menyimpan perubahan ke centralized settings sebelum menerapkan mode runtime.
fn apply_mode(
    app: &AppHandle,
    mode: PeekMode,
    checks: &[(PeekMode, CheckMenuItem<Wry>)],
) {
    let store = app.state::<SettingsStore>();

    let mut settings: AppSettings = match store.load_or_default() {
        Ok(settings) => settings,
        Err(error) => {
            eprintln!("[Settings] Gagal memuat konfigurasi: {error}");
            return;
        }
    };

    settings.appearance.island.peek_behavior = mode.into_behavior();

    if let Err(error) = store.save(&settings) {
        eprintln!("[Settings] Gagal menyimpan Peek Behavior: {error}");
        return;
    }

    *lock_mode(&app.state::<PeekState>()) = mode;

    // Item centang disetel ulang secara eksplisit.
    for (item_mode, item) in checks {
        let _ = item.set_checked(*item_mode == mode);
    }

    // Sinkronisasi seluruh SettingsProvider.
    if let Err(error) = app.emit(SETTINGS_CHANGED_EVENT, settings) {
        eprintln!("[Settings] Gagal mengirim event settings: {error}");
    }

    // Dipertahankan sementara untuk frontend yang belum dimigrasikan.
    if let Err(error) = app.emit(MODE_EVENT, mode) {
        eprintln!("[Settings] Gagal mengirim event Peek Behavior: {error}");
    }
}

/// Membuat ikon tray dan memuat mode tersimpan.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let mode = load_mode(app);
    *lock_mode(&app.state::<PeekState>()) = mode;

    let make = |id: &str, label: &str, item_mode: PeekMode| {
        CheckMenuItem::with_id(
            app,
            id,
            label,
            true,
            mode == item_mode,
            None::<&str>,
        )
    };

    let when_busy = make(
        ID_WHEN_BUSY,
        "Peek saat aplikasi lain aktif",
        PeekMode::WhenBusy,
    )?;

    let always = make(
        ID_ALWAYS,
        "Peek terus-menerus",
        PeekMode::Always,
    )?;

    let standby = make(
        ID_STANDBY,
        "Standby (selalu terbuka)",
        PeekMode::Standby,
    )?;

    let autostart_item = CheckMenuItem::with_id(
        app,
        ID_AUTOSTART,
        "Jalankan saat sistem menyala",
        true,
        crate::autostart::is_enabled(app),
        None::<&str>,
    )?;

    let test_notice =
        MenuItem::with_id(app, ID_TEST_NOTICE, "Uji notifikasi pesan", true, None::<&str>)?;

    let quit = MenuItem::with_id(app, ID_QUIT, "Keluar", true, None::<&str>)?;

    let separator = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &when_busy,
            &always,
            &standby,
            &separator,
            &autostart_item,
            &test_notice,
            &quit,
        ],
    )?;

    let checks = vec![
        (PeekMode::WhenBusy, when_busy.clone()),
        (PeekMode::Always, always.clone()),
        (PeekMode::Standby, standby.clone()),
    ];

    let autostart_check = autostart_item.clone();

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Mochi")
        .menu(&menu);

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.on_menu_event(move |app, event| match event.id().as_ref() {
        ID_WHEN_BUSY => apply_mode(app, PeekMode::WhenBusy, &checks),
        ID_ALWAYS => apply_mode(app, PeekMode::Always, &checks),
        ID_STANDBY => apply_mode(app, PeekMode::Standby, &checks),
        ID_AUTOSTART => {
            crate::autostart::set_enabled(
                app,
                !crate::autostart::is_enabled(app),
            );

            let _ = autostart_check.set_checked(
                crate::autostart::is_enabled(app),
            );
        }
        ID_TEST_NOTICE => crate::notifications::emit_sample(app),
        ID_QUIT => app.exit(0),
        _ => {}
    })
    .build(app)?;

    Ok(())
}
