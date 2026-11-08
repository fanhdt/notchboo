//! Ikon Notchboo di system tray (area panah ke atas di kanan bawah Windows).
//!
//! Menunya memilih mode peek dan menyediakan tombol keluar. Pilihan disimpan di folder konfigurasi
//! aplikasi supaya bertahan setelah aplikasi dibuka ulang.

use std::{fs, path::PathBuf, sync::Mutex};

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
const ID_QUIT: &str = "quit";

/// Kapan island bersembunyi ke atas (peek).
#[derive(Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PeekMode {
    /// Hanya saat ada aplikasi lain yang aktif di depan.
    #[default]
    WhenBusy,
    /// Selalu, selama island tidak sedang dibuka.
    Always,
}

#[derive(Default)]
pub struct PeekState {
    mode: Mutex<PeekMode>,
}

/// Mode saat ini, untuk React saat pertama kali dimuat.
#[tauri::command]
pub fn get_peek_mode(state: State<'_, PeekState>) -> PeekMode {
    *state.mode.lock().expect("peek mutex rusak")
}

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(SETTINGS_FILE))
}

fn load_mode(app: &AppHandle) -> PeekMode {
    settings_path(app)
        .and_then(|path| fs::read_to_string(path).ok())
        .map(|text| if text.trim() == "always" { PeekMode::Always } else { PeekMode::WhenBusy })
        .unwrap_or_default()
}

fn save_mode(app: &AppHandle, mode: PeekMode) {
    let Some(path) = settings_path(app) else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    // Gagal menyimpan bukan masalah fatal: pilihan tetap berlaku sampai aplikasi ditutup.
    let _ = fs::write(path, if mode == PeekMode::Always { "always" } else { "whenBusy" });
}

fn apply_mode(app: &AppHandle, mode: PeekMode, when_busy: &CheckMenuItem<Wry>, always: &CheckMenuItem<Wry>) {
    *app.state::<PeekState>().mode.lock().expect("peek mutex rusak") = mode;
    save_mode(app, mode);

    // Item centang bisa berubah sendiri saat diklik, jadi kedua item disetel ulang secara eksplisit.
    let _ = when_busy.set_checked(mode == PeekMode::WhenBusy);
    let _ = always.set_checked(mode == PeekMode::Always);

    let _ = app.emit(MODE_EVENT, mode);
}

/// Membuat ikon tray dan memuat mode yang tersimpan. Dipanggil dari `setup`.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let mode = load_mode(app);
    *app.state::<PeekState>().mode.lock().expect("peek mutex rusak") = mode;

    let when_busy = CheckMenuItem::with_id(app, ID_WHEN_BUSY, "Peek saat aplikasi lain aktif", true, mode == PeekMode::WhenBusy, None::<&str>)?;
    let always = CheckMenuItem::with_id(app, ID_ALWAYS, "Peek terus-menerus", true, mode == PeekMode::Always, None::<&str>)?;
    let quit = MenuItem::with_id(app, ID_QUIT, "Keluar", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&when_busy, &always, &PredefinedMenuItem::separator(app)?, &quit])?;

    let (menu_when_busy, menu_always) = (when_busy.clone(), always.clone());

    let mut tray = TrayIconBuilder::with_id("main").tooltip("Notchboo").menu(&menu);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.on_menu_event(move |app, event| match event.id().as_ref() {
        ID_WHEN_BUSY => apply_mode(app, PeekMode::WhenBusy, &menu_when_busy, &menu_always),
        ID_ALWAYS => apply_mode(app, PeekMode::Always, &menu_when_busy, &menu_always),
        ID_QUIT => app.exit(0),
        _ => {}
    })
    .build(app)?;

    Ok(())
}