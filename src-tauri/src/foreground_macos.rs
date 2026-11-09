//! Versi macOS dari `foreground.rs`: mendeteksi apakah ada aplikasi lain yang sedang aktif di depan.
//!
//! Bentuk publiknya sama dengan versi Windows (`ForegroundShared`, `get_foreground_busy`,
//! `start_foreground_watcher`), jadi `lib.rs` dan React tidak perlu tahu platformnya.

use std::ffi::CStr;
use std::os::raw::c_char;
use std::sync::atomic::{AtomicBool, Ordering};
use std::{thread, time::Duration};

use objc2::msg_send;
use objc2::rc::autoreleasepool;
use objc2::runtime::{AnyClass, AnyObject};
use tauri::{AppHandle, Emitter, Manager, State};

/// Dikirim ke React hanya saat statusnya berubah (payload: `bool`, true = ada aplikasi lain aktif).
const BUSY_EVENT: &str = "foreground-busy";
const POLL_INTERVAL: Duration = Duration::from_millis(300);

/// Aplikasi sistem yang aktifnya bukan berarti "membuka aplikasi lain" (desktop, Dock, Spotlight, dan sejenisnya).
const SYSTEM_BUNDLES: &[&str] = &[
    "com.apple.finder",
    "com.apple.dock",
    "com.apple.systemuiserver",
    "com.apple.controlcenter",
    "com.apple.notificationcenterui",
    "com.apple.loginwindow",
    "com.apple.Spotlight",
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
    // Objek yang dikembalikan Cocoa bersifat autorelease; thread ini tidak punya run loop,
    // jadi kolam autorelease dibuat sendiri supaya tidak ada kebocoran memori.
    autoreleasepool(|_| {
        // SAFETY: hanya membaca `NSWorkspace.frontmostApplication`. Setiap pointer dicek null
        // sebelum dipakai, dan string yang dibaca tidak keluar dari kolam autorelease ini.
        unsafe {
            let Some(class) = AnyClass::get(c"NSWorkspace") else {
                return false;
            };

            let workspace: *mut AnyObject = msg_send![class, sharedWorkspace];
            if workspace.is_null() {
                return false;
            }

            let app: *mut AnyObject = msg_send![workspace, frontmostApplication];
            if app.is_null() {
                return false;
            }

            // Aplikasi kita sendiri (island, window Shelf, window Tugas) bukan "aplikasi lain".
            let pid: i32 = msg_send![app, processIdentifier];
            if pid as u32 == std::process::id() {
                return false;
            }

            let bundle: *mut AnyObject = msg_send![app, bundleIdentifier];
            if bundle.is_null() {
                return true;
            }

            let text: *const c_char = msg_send![bundle, UTF8String];
            if text.is_null() {
                return true;
            }

            let id = CStr::from_ptr(text).to_string_lossy();
            !SYSTEM_BUNDLES.contains(&id.as_ref())
        }
    })
}