//! Command Tauri untuk Quick Shelf: catatan, snippet, file, pengaturan, dan daftar.
//!
//! Semua command memakai `#[tauri::command(async)]`: fungsi biasa yang dijalankan di thread pool,
//! bukan di main thread yang dipakai window dan cursor watcher island.
//! Command yang menyentuh file menerima `id` item, bukan path: lokasi file selalu dicari dari database.

use std::path::PathBuf;

use tauri::{AppHandle, Emitter, State, Window};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use super::model::{
    now_ms, Expiry, ImportOutcome, ListFilter, NewText, OpenOutcome, Settings, ShelfItem, TextUpdate,
};
use super::{ops, storage::is_risky_extension, ShelfState};

/// Dikirim ke window Shelf sebelum tiap file disalin (payload: `ImportProgress`).
const IMPORT_PROGRESS_EVENT: &str = "shelf-import-progress";
const SHELF_WINDOW_LABEL: &str = "shelf";

/// Daftar item. `body` hanya potongan awal; pakai `shelf_get` untuk isi lengkap.
#[tauri::command(async)]
pub fn shelf_list(state: State<'_, ShelfState>, filter: Option<ListFilter>) -> Result<Vec<ShelfItem>, String> {
    let filter = filter.unwrap_or_default();
    state.with_db(|db| db.list(&filter, now_ms()))
}

#[tauri::command(async)]
pub fn shelf_get(state: State<'_, ShelfState>, id: i64) -> Result<ShelfItem, String> {
    state.with_db(|db| db.get(id))
}

#[tauri::command(async)]
pub fn shelf_add_text(state: State<'_, ShelfState>, input: NewText) -> Result<ShelfItem, String> {
    state.with_db(|db| db.add_text(input.kind, &input.title, &input.body, input.language.as_deref(), now_ms()))
}

#[tauri::command(async)]
pub fn shelf_update_text(state: State<'_, ShelfState>, id: i64, input: TextUpdate) -> Result<ShelfItem, String> {
    state.with_db(|db| db.update_text(id, &input.title, &input.body, input.language.as_deref(), now_ms()))
}

#[tauri::command(async)]
pub fn shelf_set_pinned(state: State<'_, ShelfState>, id: i64, pinned: bool) -> Result<ShelfItem, String> {
    state.with_db(|db| db.set_pinned(id, pinned, now_ms()))
}

#[tauri::command(async)]
pub fn shelf_set_expiry(state: State<'_, ShelfState>, id: i64, expiry: Expiry) -> Result<ShelfItem, String> {
    state.with_db(|db| db.set_expiry(id, expiry, now_ms()))
}

/// Menghapus item. Untuk file, salinan terkelolanya ikut dihapus; file asli tidak disentuh.
#[tauri::command(async)]
pub fn shelf_delete(state: State<'_, ShelfState>, id: i64) -> Result<(), String> {
    ops::delete_item(&state, id)
}

/// Mengimpor file dari daftar path (hasil drag and drop). File yang gagal dilaporkan di `skipped`.
#[tauri::command(async)]
pub fn shelf_import_paths(app: AppHandle, state: State<'_, ShelfState>, paths: Vec<String>) -> Result<ImportOutcome, String> {
    import(&app, &state, paths.into_iter().map(PathBuf::from).collect())
}

/// Membuka dialog pemilih file bawaan Windows lalu mengimpor hasilnya. Dibatalkan = hasil kosong.
#[tauri::command(async)]
pub fn shelf_pick_and_import(app: AppHandle, window: Window, state: State<'_, ShelfState>) -> Result<ImportOutcome, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Pilih file untuk Quick Shelf")
        .set_parent(&window)
        .blocking_pick_files();

    let paths: Vec<PathBuf> = picked
        .unwrap_or_default()
        .into_iter()
        .filter_map(|file| file.into_path().ok())
        .collect();

    if paths.is_empty() {
        return Ok(ImportOutcome::default());
    }
    import(&app, &state, paths)
}

fn import(app: &AppHandle, state: &ShelfState, paths: Vec<PathBuf>) -> Result<ImportOutcome, String> {
    ops::import_paths(state, &paths, |progress| {
        let _ = app.emit_to(SHELF_WINDOW_LABEL, IMPORT_PROGRESS_EVENT, progress);
    })
}

/// Membuka file dengan aplikasi default Windows.
/// File berisiko (.exe, .bat, .ps1, .lnk, ...) tidak langsung dijalankan: hasilnya `needsConfirmation`,
/// dan React memanggil ulang dengan `allowRisky = true` setelah pengguna setuju.
#[tauri::command(async)]
pub fn shelf_open(
    app: AppHandle,
    state: State<'_, ShelfState>,
    id: i64,
    allow_risky: Option<bool>,
) -> Result<OpenOutcome, String> {
    let target = ops::file_target(&state, id)?;

    let risky = target.extension.as_deref().is_some_and(is_risky_extension);
    if risky && !allow_risky.unwrap_or(false) {
        return Ok(OpenOutcome::NeedsConfirmation);
    }

    app.opener()
        .open_path(target.path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| error.to_string())?;
    Ok(OpenOutcome::Opened)
}

/// Menampilkan file terkelola di File Explorer (dengan file terpilih).
#[tauri::command(async)]
pub fn shelf_reveal(app: AppHandle, state: State<'_, ShelfState>, id: i64) -> Result<(), String> {
    let target = ops::file_target(&state, id)?;
    app.opener().reveal_item_in_dir(&target.path).map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn shelf_get_settings(state: State<'_, ShelfState>) -> Result<Settings, String> {
    state.with_db(|db| db.settings())
}

#[tauri::command(async)]
pub fn shelf_set_default_expiry(state: State<'_, ShelfState>, expiry: Expiry) -> Result<(), String> {
    state.with_db(|db| db.set_default_expiry(expiry))
}