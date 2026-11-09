//! Penyimpanan tugas dan window Tugas (label `tasks`).
//!
//! Island (`main`) dan window Tugas sama-sama membaca dan menulis tugas. Datanya satu berkas JSON
//! di folder data lokal aplikasi. Rust hanya menyimpan teksnya apa adanya; seluruh logika (tanggal,
//! pengulangan, pengingat) ada di React. Setelah menulis, Rust mengabari window lain lewat event
//! `tasks-changed` supaya keduanya selalu sama.
//!
//! Window dibuat sekali lalu dipakai ulang, sama seperti window Shelf: menutupnya hanya menyembunyikan.

use std::{fs, path::PathBuf};

use serde::Serialize;
use tauri::window::Color;
use tauri::{AppHandle, Emitter, Manager, Window, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

pub const TASKS_WINDOW_LABEL: &str = "tasks";

const DATA_FILE: &str = "tasks.json";
const CHANGED_EVENT: &str = "tasks-changed";

const TITLE: &str = "Tugas";
const DEFAULT_SIZE: (f64, f64) = (500.0, 680.0);
const MIN_SIZE: (f64, f64) = (420.0, 520.0);
/// Sama dengan latar halaman Tugas supaya tidak ada kilatan putih saat window pertama muncul.
const BACKGROUND: Color = Color(17, 17, 19, 255);

#[derive(Clone, Serialize)]
struct Changed {
    /// Label window yang menyimpan, supaya ia sendiri bisa mengabaikan event ini.
    source: String,
    data: String,
}

fn data_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("folder data tidak ditemukan: {error}"))?;
    Ok(dir.join(DATA_FILE))
}

/// Isi berkas tugas, atau string kosong jika belum pernah disimpan.
#[tauri::command(async)]
pub fn tasks_load(app: AppHandle) -> Result<String, String> {
    let path = data_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(format!("tidak bisa membaca {}: {error}", path.display())),
    }
}

/// Menyimpan seluruh data tugas (JSON) dan mengabari window lain.
#[tauri::command(async)]
pub fn tasks_save(app: AppHandle, window: Window, data: String) -> Result<(), String> {
    let path = data_path(&app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|error| format!("tidak bisa membuat {}: {error}", dir.display()))?;
    }

    // Tulis ke berkas sementara lalu ganti, supaya data lama tidak rusak kalau proses terputus di tengah.
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, &data).map_err(|error| format!("tidak bisa menulis {}: {error}", temp.display()))?;
    fs::rename(&temp, &path).map_err(|error| format!("tidak bisa menyimpan {}: {error}", path.display()))?;

    // Gagal mengabari bukan masalah fatal: window lain akan membaca ulang saat dibuka.
    let _ = app.emit(
        CHANGED_EVENT,
        Changed {
            source: window.label().to_string(),
            data,
        },
    );
    Ok(())
}

/// Membuka window Tugas: membuat jika belum ada, selain itu menampilkan dan memfokuskan yang sudah ada.
pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(TASKS_WINDOW_LABEL) {
        return reveal(&window);
    }

    match create(app) {
        Ok(window) => reveal(&window),
        Err(error) => match app.get_webview_window(TASKS_WINDOW_LABEL) {
            Some(window) => reveal(&window),
            None => Err(error),
        },
    }
}

fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, TASKS_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
        .title(TITLE)
        .inner_size(DEFAULT_SIZE.0, DEFAULT_SIZE.1)
        .min_inner_size(MIN_SIZE.0, MIN_SIZE.1)
        .center()
        .decorations(false)
        .resizable(true)
        .background_color(BACKGROUND)
        .visible(false)
        .build()?;

    // Tombol close (dan Alt+F4) hanya menyembunyikan window.
    let handle = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = handle.hide();
        }
    });

    Ok(window)
}

fn reveal(window: &WebviewWindow) -> tauri::Result<()> {
    if window.is_minimized()? {
        window.unminimize()?;
    }
    window.show()?;
    window.set_focus()
}

/// `async` supaya window dibuat di thread pool: membuat window dari command sinkron bisa deadlock di Windows.
#[tauri::command(async)]
pub fn tasks_open_window(app: AppHandle) -> Result<(), String> {
    open(&app).map_err(|error| format!("Tidak bisa membuka Tugas: {error}"))
}