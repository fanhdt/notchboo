
//! Mendeteksi apakah ada aplikasi lain yang sedang aktif di depan.
//!
//! React memakainya untuk mode peek: saat aplikasi lain aktif, island bersembunyi ke atas
//! supaya tidak menghalangi, lalu muncul lagi ketika kursor mendekat.

use std::{
    sync::{
        Mutex, OnceLock,
        mpsc::{self, Sender, RecvTimeoutError},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use tauri::{AppHandle, Emitter, Manager, State};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetForegroundWindow, GetWindowThreadProcessId,
};

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
    busy: std::sync::atomic::AtomicBool,
}

#[tauri::command]
pub fn get_foreground_busy(shared: State<'_, ForegroundShared>) -> bool {
    shared
        .busy
        .load(std::sync::atomic::Ordering::Relaxed)
}

struct ForegroundWatcher {
    stop_sender: Sender<()>,
    handle: JoinHandle<()>,
}

static FOREGROUND_WATCHER: OnceLock<Mutex<Option<ForegroundWatcher>>> = OnceLock::new();

fn watcher_slot() -> &'static Mutex<Option<ForegroundWatcher>> {
    FOREGROUND_WATCHER.get_or_init(|| Mutex::new(None))
}

/// Memulai watcher foreground. Pemanggilan berulang tidak membuat worker tambahan.
pub fn start_foreground_watcher(app: &AppHandle) {
    let mut watcher = match watcher_slot().lock() {
        Ok(watcher) => watcher,
        Err(error) => {
            eprintln!("gagal mengunci foreground watcher: {error}");
            return;
        }
    };

    if watcher.is_some() {
        return;
    }

    let app = app.clone();
    let (stop_sender, stop_receiver) = mpsc::channel();

    let handle = match thread::Builder::new()
        .name("foreground-watcher".into())
        .spawn(move || {
            loop {
                match stop_receiver.recv_timeout(POLL_INTERVAL) {
                    Ok(()) | Err(RecvTimeoutError::Disconnected) => break,
                    Err(RecvTimeoutError::Timeout) => {}
                }

                let busy = is_other_app_active();
                let shared = app.state::<ForegroundShared>();

                if shared
                    .busy
                    .swap(busy, std::sync::atomic::Ordering::Relaxed)
                    != busy
                {
                    // Gagal mengirim event bukan masalah fatal; status terbaru tetap tersimpan.
                    let _ = app.emit(BUSY_EVENT, busy);
                }
            }
        })
    {
        Ok(handle) => handle,
        Err(error) => {
            eprintln!("gagal memulai foreground watcher: {error}");
            return;
        }
    };

    *watcher = Some(ForegroundWatcher {
        stop_sender,
        handle,
    });
}

/// Menghentikan watcher foreground dan menunggu worker selesai.
pub fn stop_foreground_watcher() {
    let watcher = match watcher_slot().lock() {
        Ok(mut watcher) => watcher.take(),
        Err(error) => {
            eprintln!("gagal mengunci foreground watcher saat shutdown: {error}");
            return;
        }
    };

    let Some(watcher) = watcher else {
        return;
    };

    // Mengirim sinyal agar recv_timeout segera terbangun.
    let _ = watcher.stop_sender.send(());

    if watcher.handle.join().is_err() {
        eprintln!("foreground watcher berhenti akibat panic");
    }
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
