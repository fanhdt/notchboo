//! Pengaturan window khusus macOS.

use objc2::msg_send;
use objc2::runtime::AnyObject;
use tauri::WebviewWindow;

/// `NSStatusWindowLevel`: di atas menu bar, jadi island bisa menutupi area notch.
const STATUS_WINDOW_LEVEL: isize = 25;

/// `canJoinAllSpaces` (1) | `stationary` (16) | `fullScreenAuxiliary` (256):
/// island ikut tampil di semua Space dan di atas aplikasi fullscreen.
const COLLECTION_BEHAVIOR: usize = 1 | (1 << 4) | (1 << 8);

/// Menaikkan window ke atas menu bar dan membuatnya tampil di semua Space. Harus dipanggil dari main thread.
pub fn float_above_menu_bar(window: &WebviewWindow) -> tauri::Result<()> {
    let ns_window = window.ns_window()?.cast::<AnyObject>();
    if ns_window.is_null() {
        return Ok(());
    }

    // SAFETY: `ns_window` adalah NSWindow milik Tauri yang masih hidup selama `window` ada, dan `setup`
    // berjalan di main thread seperti yang disyaratkan AppKit. Tipe argumen (NSInteger, NSUInteger)
    // sama dengan `isize` dan `usize` pada arsitektur 64-bit.
    unsafe {
        let _: () = msg_send![ns_window, setLevel: STATUS_WINDOW_LEVEL];
        let _: () = msg_send![ns_window, setCollectionBehavior: COLLECTION_BEHAVIOR];
    }

    Ok(())
}