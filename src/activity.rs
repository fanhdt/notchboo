use std::{thread, time::Duration};

use serde::Serialize;
use tauri::{AppHandle, Emitter, WebviewWindow};

const CURSOR_EVENT: &str = "cursor-moved";
const POLL_INTERVAL: Duration = Duration::from_millis(50);
/// Gerakan di bawah ini (piksel fisik) dianggap diam.
const MIN_MOVE_PX: f64 = 2.0;
/// Jarak kursor dari tengah-atas window yang dianggap "paling jauh" (dx/dy = ±1).
const GAZE_RANGE_PX: f64 = 600.0;

#[derive(Clone, Serialize)]
struct CursorMoved {
    dx: f64,
    dy: f64,
}

/// Memantau gerakan kursor dan mengirim arah lirikan (-1..1) ke React.
pub fn start_activity_watcher(app: &AppHandle, window: WebviewWindow) {
    let app = app.clone();

    thread::spawn(move || {
        let mut last: Option<(f64, f64)> = None;

        loop {
            thread::sleep(POLL_INTERVAL);

            let Ok(cursor) = window.cursor_position() else {
                continue;
            };

            let Some((last_x, last_y)) = last else {
                last = Some((cursor.x, cursor.y));
                continue;
            };

            if (cursor.x - last_x).abs() + (cursor.y - last_y).abs() < MIN_MOVE_PX {
                continue;
            }
            last = Some((cursor.x, cursor.y));

            let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else {
                continue;
            };

            let center_x = position.x as f64 + size.width as f64 / 2.0;
            let center_y = position.y as f64;

            let dx = ((cursor.x - center_x) / GAZE_RANGE_PX).clamp(-1.0, 1.0);
            let dy = ((cursor.y - center_y) / GAZE_RANGE_PX).clamp(-1.0, 1.0);

            let _ = app.emit(CURSOR_EVENT, CursorMoved { dx, dy });
        }
    });
}