use std::{
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError, Sender},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow, WindowEvent};

use crate::activity::{CURSOR_EVENT, GazeTracker};
use crate::cursor_geometry::{Hitbox, WindowGeometry};

const PRESENCE_EVENT: &str = "cursor-presence";
const POLL_INTERVAL: Duration = Duration::from_millis(50);

/// Pengaman: geometri window dibaca ulang paling lambat setiap ini (±1 detik), seandainya ada
/// perubahan yang tidak disertai event dari sistem (mis. pergantian monitor).
const GEOMETRY_REFRESH_TICKS: u32 = 20;

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
    *shared
        .hitbox
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Hitbox { width, height };
}

struct CursorWatcher {
    stop_sender: Sender<()>,
    handle: JoinHandle<()>,
}

static CURSOR_WATCHER: OnceLock<Mutex<Option<CursorWatcher>>> = OnceLock::new();

fn watcher_slot() -> &'static Mutex<Option<CursorWatcher>> {
    CURSOR_WATCHER.get_or_init(|| Mutex::new(None))
}

/// Membaca posisi, lebar, dan skala window. Tiap pembacaan adalah satu kali tanya-jawab ke
/// main thread, jadi hanya dilakukan saat geometri mungkin berubah.
fn read_geometry(window: &WebviewWindow) -> tauri::Result<WindowGeometry> {
    let position = window.outer_position()?;
    let size = window.outer_size()?;
    let scale = window.scale_factor()?;

    Ok(WindowGeometry {
        x: position.x as f64,
        y: position.y as f64,
        width: size.width as f64,
        scale,
    })
}

/// Satu thread pemantau kursor untuk dua keperluan:
/// - hover: apakah kursor di atas pill (window click-through saat tidak), dikirim sebagai `cursor-presence`;
/// - arah pandang Mochi, dikirim sebagai `cursor-moved`.
///
/// Posisi kursor dibaca sekali per putaran (50 ms). Geometri window disimpan dan hanya dibaca ulang
/// ketika window bergerak, berubah ukuran, atau berganti skala (event window), plus pengaman berkala.
/// Kedua event hanya dikirim ke window ini, bukan ke semua window.
pub fn start_cursor_watcher(app: &AppHandle, window: WebviewWindow) {
    let mut watcher = match watcher_slot().lock() {
        Ok(watcher) => watcher,
        Err(error) => {
            eprintln!("gagal mengunci cursor watcher: {error}");
            return;
        }
    };

    if watcher.is_some() {
        return;
    }

    let app = app.clone();

    // Ditandai oleh event window, dibaca oleh thread. Awalnya true supaya geometri dibaca pertama kali.
    let geometry_dirty = Arc::new(AtomicBool::new(true));
    {
        let dirty = Arc::clone(&geometry_dirty);
        window.on_window_event(move |event| {
            if matches!(
                event,
                WindowEvent::Moved(_)
                    | WindowEvent::Resized(_)
                    | WindowEvent::ScaleFactorChanged { .. }
            ) {
                dirty.store(true, Ordering::Release);
            }
        });
    }

    let label = window.label().to_string();
    let (stop_sender, stop_receiver) = mpsc::channel();

    let handle = match thread::Builder::new()
        .name("island-cursor-watcher".into())
        .spawn(move || {
            run_cursor_watcher(app, window, label, geometry_dirty, stop_receiver);
        }) {
        Ok(handle) => handle,
        Err(error) => {
            eprintln!("gagal memulai cursor watcher: {error}");
            return;
        }
    };

    *watcher = Some(CursorWatcher {
        stop_sender,
        handle,
    });
}

/// Menghentikan cursor watcher dan menunggu worker selesai.
pub fn stop_cursor_watcher() {
    let watcher = match watcher_slot().lock() {
        Ok(mut watcher) => watcher.take(),
        Err(error) => {
            eprintln!("gagal mengunci cursor watcher saat shutdown: {error}");
            return;
        }
    };

    let Some(watcher) = watcher else {
        return;
    };

    // Membangunkan worker yang sedang menunggu interval polling.
    let _ = watcher.stop_sender.send(());

    if watcher.handle.join().is_err() {
        eprintln!("cursor watcher berhenti akibat panic");
    }
}

fn run_cursor_watcher(
    app: AppHandle,
    window: WebviewWindow,
    label: String,
    geometry_dirty: Arc<AtomicBool>,
    stop_receiver: Receiver<()>,
) {
    // Di setup, window sudah dibuat click-through, jadi mulai dari Away.
    let mut presence = Presence::Away;
    let mut gaze = GazeTracker::default();
    let mut geometry: Option<WindowGeometry> = None;
    let mut ticks_since_read: u32 = 0;

    loop {
        match stop_receiver.recv_timeout(POLL_INTERVAL) {
            Ok(()) | Err(RecvTimeoutError::Disconnected) => break,
            Err(RecvTimeoutError::Timeout) => {}
        }

        ticks_since_read += 1;

        // `swap` dilakukan sebelum membaca: event yang datang saat membaca tetap tercatat untuk putaran berikutnya.
        if geometry_dirty.swap(false, Ordering::AcqRel)
            || ticks_since_read >= GEOMETRY_REFRESH_TICKS
        {
            match read_geometry(&window) {
                Ok(read) => {
                    geometry = Some(read);
                    ticks_since_read = 0;
                }
                // Gagal membaca: pakai nilai lama dan coba lagi di putaran berikutnya.
                Err(_) => geometry_dirty.store(true, Ordering::Release),
            }
        }

        let Some(geometry) = geometry else {
            continue; // belum pernah berhasil membaca geometri
        };

        let Ok(cursor) = window.cursor_position() else {
            continue; // gagal membaca posisi kursor: coba lagi di putaran berikutnya
        };
        let cursor = (cursor.x, cursor.y);

        // Arah pandang Mochi. Gagal mengirim event bukan masalah fatal, jadi hasilnya sengaja diabaikan.
        if let Some(moved) = gaze.update(cursor, geometry.gaze_anchor()) {
            let _ = app.emit_to(&label, CURSOR_EVENT, moved);
        }

        // Salin hitbox keluar dari Mutex, lalu kunci langsung dilepas.
        let hitbox = *app
            .state::<IslandShared>()
            .hitbox
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        let next = Presence::from_cursor_over(geometry.is_over_pill(cursor, hitbox));
        if next == presence {
            continue; // tidak ada perubahan, tidak ada yang perlu dikerjakan
        }

        if window
            .set_ignore_cursor_events(next.ignores_cursor_events())
            .is_ok()
        {
            presence = next;
            let _ = app.emit_to(&label, PRESENCE_EVENT, next);
        }
    }
}
