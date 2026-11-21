
use tauri::window::Color;
use tauri::{
    AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

use crate::settings_store::SettingsStore;

pub const LAUNCHER_WINDOW_LABEL: &str = "launcher";

const TITLE: &str = "Mochi Launcher";
const DEFAULT_SIZE: (f64, f64) = (680.0, 440.0);
const BACKGROUND: Color = Color(17, 17, 19, 255);

/// Membuka Launcher jika fiturnya sudah diaktifkan.
pub fn open(app: &AppHandle) -> Result<(), String> {
    let settings = app
        .state::<SettingsStore>()
        .load_or_default()?;

    if !settings.features.launcher.enabled {
        return Err("Quick Launcher sedang dinonaktifkan.".to_string());
    }

    if let Some(window) = app.get_webview_window(LAUNCHER_WINDOW_LABEL) {
        return reveal(&window);
    }

    match create(app) {
        Ok(window) => reveal(&window),
        Err(error) => match app.get_webview_window(LAUNCHER_WINDOW_LABEL) {
            Some(window) => reveal(&window),
            None => Err(error),
        },
    }
}

fn create(app: &AppHandle) -> Result<WebviewWindow, String> {
    let window = WebviewWindowBuilder::new(
        app,
        LAUNCHER_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title(TITLE)
    .inner_size(DEFAULT_SIZE.0, DEFAULT_SIZE.1)
    .center()
    .decorations(false)
    .resizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .background_color(BACKGROUND)
    .visible(false)
    .build()
    .map_err(|error| format!("Gagal membuat Launcher: {error}"))?;

    let handle = window.clone();

    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();

            if let Err(error) = handle.hide() {
                eprintln!("[Launcher] Gagal menyembunyikan window: {error}");
            }
        }
    });

    Ok(window)
}

fn reveal(window: &WebviewWindow) -> Result<(), String> {
    if window
        .is_minimized()
        .map_err(|error| error.to_string())?
    {
        window
            .unminimize()
            .map_err(|error| error.to_string())?;
    }

    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn launcher_open_window(app: AppHandle) -> Result<(), String> {
    open(&app)
}
