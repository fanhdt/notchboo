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

    let dir = match app.path().app_config_dir() {
        Ok(dir) => dir,
        Err(error) => {
            eprintln!("gagal mendapatkan direktori konfigurasi autostart: {error}");
            return;
        }
    };

    if let Err(error) = fs::create_dir_all(&dir) {
        eprintln!("gagal membuat direktori konfigurasi autostart: {error}");
        return;
    }

    let marker = dir.join(MARKER_FILE);

    match marker.try_exists() {
        Ok(true) => return,
        Ok(false) => {}
        Err(error) => {
            eprintln!("gagal memeriksa penanda inisialisasi autostart: {error}");
            return;
        }
    }

    if let Err(error) = app.autolaunch().enable() {
        eprintln!("gagal mengaktifkan autostart pada penggunaan pertama: {error}");
        return;
    }

    // Jika penanda gagal dibuat, autostart mungkin akan diperiksa ulang pada peluncuran berikutnya.
    if let Err(error) = fs::write(&marker, "1") {
        eprintln!("gagal menyimpan penanda inisialisasi autostart: {error}");
    }
}

/// Memeriksa status autostart dari sistem.
pub fn is_enabled(app: &AppHandle) -> bool {
    match app.autolaunch().is_enabled() {
        Ok(enabled) => enabled,
        Err(error) => {
            eprintln!("gagal memeriksa status autostart: {error}");
            false
        }
    }
}

/// Mengubah status autostart.
pub fn set_enabled(app: &AppHandle, enabled: bool) {
    let launcher = app.autolaunch();

    let result = if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    };

    if let Err(error) = result {
        eprintln!(
            "gagal {} autostart: {error}",
            if enabled {
                "mengaktifkan"
            } else {
                "menonaktifkan"
            }
        );
    }
}
