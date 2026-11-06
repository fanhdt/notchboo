use std::{sync::Mutex, thread, time::Duration};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

const PRESENCE_EVENT: &str = "cursor-presence";
const POLL_INTERVAL: Duration = Duration::from_millis(50);
const HIT_PADDING: f64 = 10.0;
/// Pill menempel di tepi atas window (tidak ada margin di App.tsx).
const PILL_TOP_MARGIN: f64 = 0.0;

#[derive(Clone, Copy)]
struct Hitbox {
    width: f64,
    height: f64,
}

impl Default for Hitbox {
    fn default() -> Self {
        // Sama dengan COMPACT_SIZE di App.tsx.
        Self { width: 150.0, height: 30.0 }
    }
}

#[derive(Default)]
pub struct IslandShared {
    hitbox: Mutex<Hitbox>,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Presence {
    Over,
    Away,
}

impl Presence {
    fn from_cursor_over(over: bool) -> Self {
        if over { Self::Over } else { Self::Away }
    }

    /// Saat kursor jauh dari pill, window dibuat click-through.
    fn ignores_cursor_events(self) -> bool {
        self == Self::Away
    }
}

#[tauri::command]
pub fn set_island_hitbox(shared: State<'_, IslandShared>, width: f64, height: f64) {
    *shared.hitbox.lock().expect("hitbox mutex rusak") = Hitbox { width, height };
}


/// Menjalankan thread yang terus memeriksa apakah kursor ada di atas pill.
pub fn start_cursor_watcher(app: &AppHandle, window: WebviewWindow) {
    let app = app.clone();

    thread::spawn(move || {
        // Di setup, window sudah dibuat click-through, jadi mulai dari Away.
        let mut presence = Presence::Away;

        loop {
            thread::sleep(POLL_INTERVAL);

            // Salin hitbox keluar dari Mutex, lalu kunci langsung dilepas.
            let hitbox = *app
                .state::<IslandShared>()
                .hitbox
                .lock()
                .expect("hitbox mutex rusak");

            let Ok(over_pill) = is_cursor_over_pill(&window, hitbox) else {
                continue; // gagal membaca posisi kursor: coba lagi di putaran berikutnya
            };

            let next = Presence::from_cursor_over(over_pill);
            if next == presence {
                continue; // tidak ada perubahan, tidak ada yang perlu dikerjakan
            }

            if window
                .set_ignore_cursor_events(next.ignores_cursor_events())
                .is_ok()
            {
                presence = next;
                // Gagal mengirim event bukan masalah fatal, jadi hasilnya sengaja diabaikan.
                let _ = app.emit(PRESENCE_EVENT, next);
            }
        }
    });
}

fn is_cursor_over_pill(window: &WebviewWindow, hitbox: Hitbox) -> tauri::Result<bool> {
    let cursor = window.cursor_position()?;
    let window_position = window.outer_position()?;
    let window_size = window.outer_size()?;
    let scale = window.scale_factor()?;

    // Posisi kursor relatif ke pojok kiri-atas window, dalam logical pixel (satuan CSS).
    let x = (cursor.x - window_position.x as f64) / scale;
    let y = (cursor.y - window_position.y as f64) / scale;
    let window_width = window_size.width as f64 / scale;

    // Pill berada di tengah-atas window.
    let left = (window_width - hitbox.width) / 2.0 - HIT_PADDING;
    let right = left + hitbox.width + HIT_PADDING * 2.0;
    let top = PILL_TOP_MARGIN - HIT_PADDING;
    let bottom = PILL_TOP_MARGIN + hitbox.height + HIT_PADDING;

    Ok(x >= left && x <= right && y >= top && y <= bottom)
}