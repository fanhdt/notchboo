// Ikon Mochi di system tray.
//
// Menu tray menyediakan kontrol Peek Behavior, autostart, notifikasi uji,
// dan keluar. Semua preferensi disimpan melalui centralized SettingsStore.

use std::fs;
use std::path::PathBuf;

use tauri::{
    AppHandle, Emitter, Manager, Wry,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};

use crate::{
    autostart,
    settings::{AppSettings, PeekBehavior},
    settings_commands::{self, SETTINGS_CHANGED_EVENT},
    settings_store::SettingsStore,
};

const LEGACY_SETTINGS_FILE: &str = "peek-mode.txt";

const ID_WHEN_BUSY: &str = "peek_when_busy";
const ID_ALWAYS: &str = "peek_always";
const ID_STANDBY: &str = "standby";
const ID_AUTOSTART: &str = "autostart";
const ID_TEST_NOTICE: &str = "test_notice";
const ID_QUIT: &str = "quit";

#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub enum PeekMode {
    #[default]
    WhenBusy,
    Always,
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

    let current_mode = PeekMode::from_behavior(settings.appearance.island.peek_behavior);

    let Some(legacy_path) = legacy_settings_path(app) else {
        return current_mode;
    };

    match fs::read_to_string(&legacy_path) {
        Ok(value) if current_mode == PeekMode::WhenBusy => {
            if let Some(legacy_mode) = PeekMode::from_setting(&value) {
                settings.appearance.island.peek_behavior = legacy_mode.into_behavior();

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
                        eprintln!("[Settings] Gagal memigrasikan Peek Behavior lama: {error}");
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
            if let Err(error) = fs::remove_file(&legacy_path) {
                eprintln!("[Settings] Gagal menghapus file Peek Behavior lama: {error}");
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            eprintln!("[Settings] Gagal membaca file Peek Behavior lama: {error}");
        }
    }

    current_mode
}

/// Menyimpan Peek Behavior sebelum memperbarui menu tray.
fn apply_mode(app: &AppHandle, mode: PeekMode, checks: &[(PeekMode, CheckMenuItem<Wry>)]) {
    let _transaction = settings_commands::lock_settings_transaction();

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

    for (item_mode, item) in checks {
        let _ = item.set_checked(*item_mode == mode);
    }

    if let Err(error) = app.emit(SETTINGS_CHANGED_EVENT, settings) {
        eprintln!("[Settings] Gagal mengirim event settings: {error}");
    }
}

/// Mengubah autostart melalui centralized settings.
fn apply_autostart(app: &AppHandle, enabled: bool, check: &CheckMenuItem<Wry>) {
    let _transaction = settings_commands::lock_settings_transaction();

    let store = app.state::<SettingsStore>();

    let previous = match store.load_or_default() {
        Ok(settings) => settings,
        Err(error) => {
            eprintln!("[Settings] Gagal memuat konfigurasi: {error}");
            return;
        }
    };

    let mut next = previous.clone();
    next.general.launch_at_startup = enabled;

    if let Err(error) = settings_commands::apply_settings(app, &store, &previous, &next) {
        eprintln!("[Autostart] Gagal menerapkan pengaturan: {error}");

        let actual = autostart::is_enabled(app).unwrap_or(previous.general.launch_at_startup);

        let _ = check.set_checked(actual);
        return;
    }

    let _ = check.set_checked(enabled);

    if let Err(error) = app.emit(SETTINGS_CHANGED_EVENT, next) {
        eprintln!("[Settings] Gagal mengirim event settings: {error}");
    }
}

/// Membuat ikon tray dan memuat mode tersimpan.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let mode = load_mode(app);

    let settings = app
        .state::<SettingsStore>()
        .load_or_default()
        .map_err(std::io::Error::other)?;

    let make = |id: &str, label: &str, item_mode: PeekMode| {
        CheckMenuItem::with_id(app, id, label, true, mode == item_mode, None::<&str>)
    };

    let when_busy = make(
        ID_WHEN_BUSY,
        "Peek saat aplikasi lain aktif",
        PeekMode::WhenBusy,
    )?;

    let always = make(ID_ALWAYS, "Peek terus-menerus", PeekMode::Always)?;
    let standby = make(ID_STANDBY, "Standby (selalu terbuka)", PeekMode::Standby)?;

    let autostart_item = CheckMenuItem::with_id(
        app,
        ID_AUTOSTART,
        "Jalankan saat sistem menyala",
        true,
        settings.general.launch_at_startup,
        None::<&str>,
    )?;

    let test_notice = MenuItem::with_id(
        app,
        ID_TEST_NOTICE,
        "Uji notifikasi pesan",
        true,
        None::<&str>,
    )?;

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
            let current = match app.state::<SettingsStore>().load_or_default() {
                Ok(settings) => settings.general.launch_at_startup,
                Err(error) => {
                    eprintln!("[Settings] Gagal memuat konfigurasi autostart: {error}");
                    return;
                }
            };

            apply_autostart(app, !current, &autostart_check);
        }
        ID_TEST_NOTICE => crate::notifications::emit_sample(app),
        ID_QUIT => app.exit(0),
        _ => {}
    })
    .build(app)?;

    Ok(())
}
