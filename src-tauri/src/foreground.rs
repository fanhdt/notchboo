//! Mendeteksi apakah ada aplikasi lain yang sedang aktif di depan.
//!
//! React memakainya untuk mode peek: saat aplikasi lain aktif, island bersembunyi ke atas
//! supaya tidak menghalangi, lalu muncul lagi ketika kursor mendekat.

use std::sync::atomic::{AtomicBool, Ordering};
use std::{thread, time::Duration};

use tauri::{AppHandle, Emitter, Manager, State};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowThreadProcessId};

/// Dikirim ke React hanya saat statusnya berubah (payload: `bool`, true = ada aplikasi lain aktif).
const BUSY_EVENT: &str = "foreground-busy";
const POLL_INTERVAL: Duration = Duration::from_millis(300);

/// Window milik shell Windows (desktop, taskbar, menu Start, pencarian). Aktifnya window ini
/// bukan "membuka aplikasi lain", jadi island tidak perlu bersembunyi.
const SHELL_CLASSES: &[&str] = &[
    "Progman",
    "WorkerW",
    "Shell_TrayWnd",
    "Shell_SecondaryTrayWnd",
    "NotifyIconOverflowWindow",
    "TopLevelWindowForOverflowXamlIsland",
    "XamlExplorerHostIslandWindow",
    "Windows.UI.Core.CoreWindow",
];

#[derive(Default)]
pub struct ForegroundShared {
    busy: AtomicBool,
}

/// Status awal untuk React, karena event hanya dikirim saat berubah.
#[tauri::command]
pub fn get_foreground_busy(shared: State<'_, ForegroundShared>) -> bool {
    shared.busy.load(Ordering::Relaxed)
}

pub fn start_foreground_watcher(app: &AppHandle) {
    let app = app.clone();

    thread::spawn(move || loop {
        thread::sleep(POLL_INTERVAL);

        let busy = is_other_app_active();
        let shared = app.state::<ForegroundShared>();

        if shared.busy.swap(busy, Ordering::Relaxed) != busy {
            // Gagal mengirim event bukan masalah fatal; status terbaru tetap tersimpan.
            let _ = app.emit(BUSY_EVENT, busy);
        }
    });
}

fn is_other_app_active() -> bool {
    // SAFETY: semua panggilan Win32 di bawah hanya membaca informasi window. `hwnd` boleh null
    // (tidak ada window aktif) dan itu sudah ditangani.
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return false;
        }

        let mut process_id = 0u32;
        GetWindowThreadProcessId(hwnd, &mut process_id);
        // Window milik Notchboo sendiri (island, Quick Shelf, dialog pilih file) bukan aplikasi lain.
        if process_id == std::process::id() {
            return false;
        }

        let mut buffer = [0u16; 256];
        let length = GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
        if length <= 0 {
            return false;
        }

        let class = String::from_utf16_lossy(&buffer[..length as usize]);
        !SHELL_CLASSES.contains(&class.as_str())
    }
}