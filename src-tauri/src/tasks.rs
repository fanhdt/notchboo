
// src-tauri/src/tasks.rs

//! Penyimpanan tugas dan window Tugas (label `tasks`).
//!
//! Island (`main`) dan window Tugas sama-sama membaca dan menulis tugas.
//! Data disimpan sebagai JSON di folder data lokal aplikasi.
//!
//! Rust menyediakan revision control untuk mencegah stale write:
//! setiap penyimpanan harus membawa revision terakhir yang dibaca.
//! Jika revision sudah berubah, backend menolak penyimpanan dan
//! mengembalikan data terbaru kepada frontend.
//!
//! Window dibuat sekali lalu dipakai ulang.
//! Menutupnya hanya menyembunyikan window.

use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::Serialize;
use tauri::window::Color;
use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window,
    WindowEvent,
};

pub const TASKS_WINDOW_LABEL: &str = "tasks";

const DATA_FILE: &str = "tasks.json";
const CHANGED_EVENT: &str = "tasks-changed";

const TITLE: &str = "Tugas";
const DEFAULT_SIZE: (f64, f64) = (500.0, 680.0);
const MIN_SIZE: (f64, f64) = (420.0, 520.0);

/// Sama dengan latar halaman Tugas supaya tidak ada kilatan putih
/// saat window pertama muncul.
const BACKGROUND: Color = Color(17, 17, 19, 255);

/// Menyerialisasi seluruh operasi baca dan tulis tasks.json.
///
/// Penting: tasks_load juga menggunakan lock yang sama dengan tasks_save.
/// Dengan begitu, pembacaan tidak berlangsung di tengah proses penulisan.
static TASKS_WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TasksLoadResult {
    pub data: String,
    pub revision: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TasksSaveResult {
    pub saved: bool,
    pub revision: String,
    pub current_data: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Changed {
    /// Label window yang menyimpan, supaya ia sendiri bisa mengabaikan event ini.
    source: String,
    data: String,
    revision: String,
}

fn data_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("folder data tidak ditemukan: {error}"))?;

    Ok(dir.join(DATA_FILE))
}

/// Membuat token revision dari isi file.
///
/// FNV-1a digunakan sebagai fingerprint ringan untuk mendeteksi perubahan
/// konten, bukan sebagai mekanisme keamanan atau autentikasi.
fn revision_for(data: &str) -> String {
    let mut hasher = DefaultHasher::new();
    data.hash(&mut hasher);

    format!("{:016x}", hasher.finish())
}

/// Membaca isi file.
///
/// File yang belum pernah dibuat dianggap sebagai penyimpanan kosong.
fn read_tasks(path: &Path) -> Result<String, String> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(text),

        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(String::new())
        }

        Err(error) => Err(format!(
            "tidak bisa membaca {}: {error}",
            path.display()
        )),
    }
}

/// Menulis data melalui temporary file sebelum mengganti file utama.
///
/// Temporary file menggunakan lokasi yang sama dengan file tujuan agar
/// rename tetap berada pada filesystem yang sama.
fn write_tasks_atomically(path: &Path, data: &str) -> Result<(), String> {
    let temp = path.with_extension("json.tmp");

    fs::write(&temp, data)
        .map_err(|error| format!("tidak bisa menulis {}: {error}", temp.display()))?;

    if let Err(error) = fs::rename(&temp, path) {
        let _ = fs::remove_file(&temp);

        return Err(format!(
            "tidak bisa menyimpan {}: {error}",
            path.display()
        ));
    }

    Ok(())
}

/// Membaca data tugas beserta revision saat ini.
#[tauri::command(async)]
pub fn tasks_load(app: AppHandle) -> Result<TasksLoadResult, String> {
    let _guard = TASKS_WRITE_LOCK
        .lock()
        .map_err(|_| "kunci penyimpanan tugas rusak".to_string())?;

    let path = data_path(&app)?;
    let data = read_tasks(&path)?;
    let revision = revision_for(&data);

    Ok(TasksLoadResult { data, revision })
}

/// Menyimpan data tugas jika revision masih sesuai.
///
/// Jika revision berbeda, data tidak ditulis. Frontend menerima data terbaru
/// agar dapat melakukan rekonsiliasi sebelum mencoba menyimpan kembali.
#[tauri::command(async)]
pub fn tasks_save(
    app: AppHandle,
    window: Window,
    data: String,
    expected_revision: String,
) -> Result<TasksSaveResult, String> {
    let write_guard = TASKS_WRITE_LOCK
        .lock()
        .map_err(|_| "kunci penyimpanan tugas rusak".to_string())?;

    let path = data_path(&app)?;

    let current_data = read_tasks(&path)?;
    let current_revision = revision_for(&current_data);

    // Tolak snapshot yang dibuat berdasarkan data lama.
    if current_revision != expected_revision {
        return Ok(TasksSaveResult {
            saved: false,
            revision: current_revision,
            current_data: Some(current_data),
        });
    }

    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|error| {
            format!("tidak bisa membuat {}: {error}", dir.display())
        })?;
    }

    write_tasks_atomically(&path, &data)?;

    let new_revision = revision_for(&data);

    // Lock tidak perlu ditahan selama pengiriman event.
    drop(write_guard);

    if let Err(error) = app.emit(
        CHANGED_EVENT,
        Changed {
            source: window.label().to_string(),
            data,
            revision: new_revision.clone(),
        },
    ) {
        eprintln!("gagal mengirim event {CHANGED_EVENT}: {error}");
    }

    Ok(TasksSaveResult {
        saved: true,
        revision: new_revision,
        current_data: None,
    })
}

/// Membuka window Tugas: membuat jika belum ada,
/// selain itu menampilkan dan memfokuskan yang sudah ada.
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
    let window = WebviewWindowBuilder::new(
        app,
        TASKS_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
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

            if let Err(error) = handle.hide() {
                eprintln!("gagal menyembunyikan window Tasks: {error}");
            }
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

/// `async` supaya window dibuat di thread pool:
/// membuat window dari command sinkron bisa deadlock di Windows.
#[tauri::command(async)]
pub fn tasks_open_window(app: AppHandle) -> Result<(), String> {
    open(&app).map_err(|error| {
        format!("Tidak bisa membuka Tugas: {error}")
    })
}
