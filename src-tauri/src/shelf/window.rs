//! Window Quick Shelf (label `shelf`): dibuat sekali, lalu dipakai ulang.
//!
//! Menutup window hanya menyembunyikannya. Window tetap hidup sehingga membukanya lagi cepat,
//! tidak pernah ada dua window Shelf, dan event impor (`emit_to("shelf", ...)`) selalu punya tujuan.
//! Tidak ada koneksi database atau folder baru di sini: semua command memakai `ShelfState` yang sama
//! dengan window `main`.

use tauri::window::Color;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

pub const SHELF_WINDOW_LABEL: &str = "shelf";

const TITLE: &str = "Quick Shelf";
const DEFAULT_SIZE: (f64, f64) = (480.0, 640.0);
const MIN_SIZE: (f64, f64) = (400.0, 480.0);
/// Sama dengan latar halaman Shelf supaya tidak ada kilatan putih saat window pertama muncul.
const BACKGROUND: Color = Color(17, 17, 19, 255);

/// Membuka window Shelf: membuat jika belum ada, selain itu menampilkan dan memfokuskan yang sudah ada.
pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SHELF_WINDOW_LABEL) {
        return reveal(&window);
    }

    match create(app) {
        Ok(window) => reveal(&window),
        Err(error) => {
            // Dua pemanggilan hampir bersamaan: yang kedua kalah balapan membuat window.
            // Pakai window yang sudah dibuat pemenangnya.
            match app.get_webview_window(SHELF_WINDOW_LABEL) {
                Some(window) => reveal(&window),
                None => Err(error),
            }
        }
    }
}

fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, SHELF_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
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

/// Dipanggil dari island (window `main`) maupun dari Shelf sendiri.
/// `async` supaya window dibuat di thread pool: membuat window dari command sinkron bisa deadlock di Windows.
#[tauri::command(async)]
pub fn shelf_open_window(app: AppHandle) -> Result<(), String> {
    open(&app).map_err(|error| format!("Tidak bisa membuka Quick Shelf: {error}"))
}
