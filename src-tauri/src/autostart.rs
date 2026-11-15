//! Menjalankan Notchboo otomatis saat pengguna masuk ke Windows (atau macOS).
//!
//! Pertama kali aplikasi dijalankan setelah dipasang, mulai-otomatis dinyalakan. Pengguna bisa
//! mematikannya kapan saja lewat menu tray ("Jalankan saat sistem menyala"); pilihan itu dihormati
//! dan tidak dinyalakan lagi, karena penanda "sudah pernah diatur" disimpan di folder konfigurasi.

use std::fs;

use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

const MARKER_FILE: &str = "autostart-initialized";

/// Menyalakan mulai-otomatis satu kali, saat pertama kali aplikasi berjalan.
pub fn enable_on_first_run(app: &AppHandle) {
    // Saat pengembangan (`tauri dev`), yang akan terdaftar adalah berkas debug sementara. Jangan.
    if cfg!(debug_assertions) {
        return;
    }

    let Ok(dir) = app.path().app_config_dir() else {
        return;
    };
    let marker = dir.join(MARKER_FILE);
    if marker.exists() {
        return;
    }

    if app.autolaunch().enable().is_ok() {
        // Gagal menulis penanda bukan masalah fatal: paling buruk, dinyalakan lagi di peluncuran berikutnya.
        let _ = fs::create_dir_all(&dir);
        let _ = fs::write(marker, "1");
    }
}

pub fn is_enabled(app: &AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

pub fn set_enabled(app: &AppHandle, enabled: bool) {
    let launcher = app.autolaunch();
    // Gagal mengubah (mis. registry dikunci kebijakan) tidak boleh menjatuhkan aplikasi.
    let _ = if enabled { launcher.enable() } else { launcher.disable() };
}