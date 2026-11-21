use tauri::State;

use super::{
    model::{ClipboardFilter, ClipboardItem},
    state::ClipboardState,
};

#[tauri::command(async)]
pub fn clipboard_list(
    state: State<'_, ClipboardState>,
    filter: Option<ClipboardFilter>,
) -> Result<Vec<ClipboardItem>, String> {
    state.list(&filter.unwrap_or_default())
}

#[tauri::command(async)]
pub fn clipboard_get(state: State<'_, ClipboardState>, id: i64) -> Result<ClipboardItem, String> {
    state.get(id)
}

#[tauri::command]
pub fn clipboard_set_capture_paused(
    state: State<'_, ClipboardState>,
    paused: bool,
) -> Result<bool, String> {
    state.set_paused(paused);
    Ok(state.is_paused())
}

#[tauri::command]
pub fn clipboard_get_capture_paused(state: State<'_, ClipboardState>) -> bool {
    state.is_paused()
}

#[tauri::command(async)]
pub fn clipboard_set_pinned(
    state: State<'_, ClipboardState>,
    id: i64,
    pinned: bool,
) -> Result<ClipboardItem, String> {
    state.set_pinned(id, pinned)
}

#[tauri::command(async)]
pub fn clipboard_delete(state: State<'_, ClipboardState>, id: i64) -> Result<(), String> {
    state.delete(id)
}

#[tauri::command(async)]
pub fn clipboard_clear(state: State<'_, ClipboardState>) -> Result<(), String> {
    state.clear()
}

#[tauri::command(async)]
pub fn clipboard_get_count(state: State<'_, ClipboardState>) -> Result<u64, String> {
    state.count()
}
