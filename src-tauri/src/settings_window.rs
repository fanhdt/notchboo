
use tauri::window::Color;
use tauri::{
    AppHandle, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

pub const SETTINGS_WINDOW_LABEL: &str = "settings";

const TITLE: &str = "Pengaturan Mochi";
const DEFAULT_SIZE: (f64, f64) = (780.0, 640.0);
const MIN_SIZE: (f64, f64) = (640.0, 480.0);

const BACKGROUND: Color = Color(17, 17, 19, 255);

/// Membuka Settings Window.
/// Window dibuat sekali dan digunakan kembali.
pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        return reveal(&window);
    }

    match create(app) {
        Ok(window) => reveal(&window),

        Err(error) => match app.get_webview_window(SETTINGS_WINDOW_LABEL) {
            Some(window) => reveal(&window),
            None => Err(error),
        },
    }
}

fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(
        app,
        SETTINGS_WINDOW_LABEL,
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

    // Close dan Alt+F4 hanya menyembunyikan window.
    let handle = window.clone();

    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();

            if let Err(error) = handle.hide() {
                eprintln!(
                    "[Settings] Gagal menyembunyikan window: {error}"
                );
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

/// Command untuk membuka Settings Window.
/// Window dibuat secara asynchronous agar tidak deadlock di Windows.
#[tauri::command(async)]
pub fn settings_open_window(app: AppHandle) -> Result<(), String> {
    open(&app)
        .map_err(|error| format!("Tidak bisa membuka Pengaturan: {error}"))
}
