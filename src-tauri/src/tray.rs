
//! Ikon Notchboo di system tray (area panah ke atas di kanan bawah Windows).
//!
//! Menunya memilih mode tampilan island dan menyediakan tombol keluar. Pilihan disimpan di folder
//! konfigurasi aplikasi supaya bertahan setelah aplikasi dibuka ulang.

use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};

use serde::Serialize;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, Wry,
};

/// Dikirim ke React setiap pilihan mode berubah (payload: `PeekMode`).
const MODE_EVENT: &str = "peek-mode-changed";
const SETTINGS_FILE: &str = "peek-mode.txt";

const ID_WHEN_BUSY: &str = "peek_when_busy";
const ID_ALWAYS: &str = "peek_always";
const ID_STANDBY: &str = "standby";
const ID_AUTOSTART: &str = "autostart";
const ID_TEST_NOTICE: &str = "test_notice";
const ID_QUIT: &str = "quit";

/// Perilaku island: kapan bersembunyi ke atas (peek) atau tetap terbuka (standby).
#[derive(Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PeekMode {
    /// Bersembunyi hanya saat ada aplikasi lain yang aktif di depan.
    #[default]
    WhenBusy,
    /// Selalu bersembunyi, selama island tidak sedang dibuka.
    Always,
    /// Island selalu terbuka (expand) dan tidak menutup sendiri.
    Standby,
}

impl PeekMode {
    fn as_setting(self) -> &'static str {
        match self {
            Self::WhenBusy => "whenBusy",
            Self::Always => "always",
            Self::Standby => "standby",
        }
    }

    fn from_setting(text: &str) -> Option<Self> {
        match text.trim() {
            "whenBusy" => Some(Self::WhenBusy),
            "always" => Some(Self::Always),
            "standby" => Some(Self::Standby),
            _ => None,
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

/// Mode saat ini, untuk React saat pertama kali dimuat.
#[tauri::command]
pub fn get_peek_mode(state: State<'_, PeekState>) -> PeekMode {
    *lock_mode(&state)
}

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    match app.path().app_config_dir() {
        Ok(dir) => Some(dir.join(SETTINGS_FILE)),
        Err(error) => {
            eprintln!("gagal mendapatkan direktori konfigurasi peek mode: {error}");
            None
        }
    }
}

fn load_mode(app: &AppHandle) -> PeekMode {
    let Some(path) = settings_path(app) else {
        return PeekMode::default();
    };

    match fs::read_to_string(&path) {
        Ok(text) => match PeekMode::from_setting(&text) {
            Some(mode) => mode,
            None => {
                eprintln!(
                    "konfigurasi peek mode tidak valid di {}. Menggunakan mode default.",
                    path.display()
                );
                PeekMode::default()
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => PeekMode::default(),
        Err(error) => {
            eprintln!("gagal membaca konfigurasi peek mode: {error}");
            PeekMode::default()
        }
    }
}

fn save_mode(app: &AppHandle, mode: PeekMode) {
    let Some(path) = settings_path(app) else {
        return;
    };

    if let Some(dir) = path.parent() {
        if let Err(error) = fs::create_dir_all(dir) {
            eprintln!("gagal membuat direktori konfigurasi peek mode: {error}");
            return;
        }
    }

    // Gagal menyimpan bukan masalah fatal: pilihan tetap berlaku sampai aplikasi ditutup.
    if let Err(error) = fs::write(&path, mode.as_setting()) {
        eprintln!("gagal menyimpan konfigurasi peek mode: {error}");
    }
}

fn apply_mode(app: &AppHandle, mode: PeekMode, checks: &[(PeekMode, CheckMenuItem<Wry>)]) {
    *lock_mode(&app.state::<PeekState>()) = mode;
    save_mode(app, mode);

    // Item centang bisa berubah sendiri saat diklik, jadi semua item disetel ulang secara eksplisit.
    for (item_mode, item) in checks {
        let _ = item.set_checked(*item_mode == mode);
    }

    let _ = app.emit(MODE_EVENT, mode);
}

/// Membuat ikon tray dan memuat mode yang tersimpan. Dipanggil dari `setup`.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let mode = load_mode(app);
    *lock_mode(&app.state::<PeekState>()) = mode;

    let make = |id: &str, label: &str, item_mode: PeekMode| {
        CheckMenuItem::with_id(app, id, label, true, mode == item_mode, None::<&str>)
    };

    let when_busy = make(ID_WHEN_BUSY, "Peek saat aplikasi lain aktif", PeekMode::WhenBusy)?;
    let always = make(ID_ALWAYS, "Peek terus-menerus", PeekMode::Always)?;
    let standby = make(ID_STANDBY, "Standby (selalu terbuka)", PeekMode::Standby)?;

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
        .tooltip("Notchboo")
        .menu(&menu);

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.on_menu_event(move |app, event| match event.id().as_ref() {
        ID_WHEN_BUSY => apply_mode(app, PeekMode::WhenBusy, &checks),
        ID_ALWAYS => apply_mode(app, PeekMode::Always, &checks),
        ID_STANDBY => apply_mode(app, PeekMode::Standby, &checks),
        ID_AUTOSTART => {
            // Item centang bisa berubah sendiri saat diklik; keadaan sebenarnya dibaca ulang dari sistem.
            crate::autostart::set_enabled(app, !crate::autostart::is_enabled(app));
            let _ = autostart_check.set_checked(crate::autostart::is_enabled(app));
        }
        ID_TEST_NOTICE => crate::notifications::emit_sample(app),
        ID_QUIT => app.exit(0),
        _ => {}
    })
    .build(app)?;

    Ok(())
}
