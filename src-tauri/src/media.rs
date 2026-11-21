use std::sync::mpsc::{self, Sender};
use std::sync::{Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use windows::Foundation::{DateTime, TimeSpan, TypedEventHandler};
use windows::Media::Control::{
    CurrentSessionChangedEventArgs, GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as SessionManager,
    GlobalSystemMediaTransportControlsSessionMediaProperties as MediaProperties,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
    MediaPropertiesChangedEventArgs, PlaybackInfoChangedEventArgs, SessionsChangedEventArgs,
    TimelinePropertiesChangedEventArgs,
};
use windows::Storage::Streams::DataReader;
use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize};

/// Event yang didengarkan React: lagu berganti (berat, membawa artwork).
const MEDIA_EVENT: &str = "media-changed";
/// Event yang didengarkan React: status putar atau posisi berubah (ringan).
const PLAYBACK_EVENT: &str = "playback-changed";
/// Batas ukuran artwork, melindungi dari alokasi memori yang tidak masuk akal.
const MAX_ARTWORK_BYTES: u64 = 5_000_000;

/// Mengelola satu worker media watcher.
struct MediaWatcherWorker {
    sender: Sender<Wake>,
    handle: JoinHandle<()>,
}

static MEDIA_WATCHER: OnceLock<Mutex<Option<MediaWatcherWorker>>> = OnceLock::new();

fn media_watcher() -> &'static Mutex<Option<MediaWatcherWorker>> {
    MEDIA_WATCHER.get_or_init(|| Mutex::new(None))
}

/// Informasi lagu yang dikirim ke React.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    title: String,
    artist: String,
    album: String,
    /// Gambar sampul sebagai data URL (`data:image/...;base64,...`), jika ada.
    artwork: Option<String>,
}

/// Status putar dan posisi, dikirim ke React.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackInfo {
    is_playing: bool,
    /// Posisi saat event ini dikirim, dalam milidetik.
    position_ms: u64,
    /// Durasi total. 0 berarti tidak diketahui (mis. siaran langsung).
    duration_ms: u64,
}

/// Perintah yang bisa dikirim React ke pemutar.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MediaAction {
    Previous,
    PlayPause,
    Next,
}

/// Alasan thread pemantau dibangunkan.
enum Wake {
    /// Sesi aktif berganti atau daftar sesi berubah: pendengar harus didaftarkan ulang.
    SessionChanged,
    /// Judul atau artis di sesi aktif berubah.
    MediaChanged,
    /// Status putar atau posisi berubah.
    PlaybackChanged,
    /// Aplikasi sedang ditutup.
    Shutdown,
}

/// Rangkuman pesan yang menumpuk sejak thread terakhir tidur.
#[derive(Default)]
struct Pending {
    session_changed: bool,
    media_changed: bool,
}

impl Pending {
    /// Mengembalikan true jika menerima sinyal shutdown.
    fn record(&mut self, wake: Wake) -> bool {
        match wake {
            Wake::SessionChanged => self.session_changed = true,
            Wake::MediaChanged => self.media_changed = true,
            // Perubahan playback selalu menghasilkan pembacaan playback.
            Wake::PlaybackChanged => {}
            Wake::Shutdown => return true,
        }

        false
    }
}

/// Tiga pendengar yang sedang terpasang di satu sesi, beserta token untuk melepasnya.
struct Subscription {
    session: Session,
    media_token: i64,
    playback_token: i64,
    timeline_token: i64,
}

impl Subscription {
    /// Melepas ketiga pendengar.
    fn unsubscribe(self) {
        let _ = self.session.RemoveMediaPropertiesChanged(self.media_token);
        let _ = self.session.RemovePlaybackInfoChanged(self.playback_token);
        let _ = self
            .session
            .RemoveTimelinePropertiesChanged(self.timeline_token);
    }
}

/// Pendengar level manager untuk pergantian sesi dan perubahan daftar sesi.
struct ManagerSubscription {
    manager: SessionManager,
    current_token: i64,
    sessions_token: i64,
}

impl ManagerSubscription {
    fn subscribe(manager: &SessionManager, sender: &Sender<Wake>) -> windows::core::Result<Self> {
        let tx = sender.clone();
        let on_current_changed =
            TypedEventHandler::<SessionManager, CurrentSessionChangedEventArgs>::new(
                move |_, _| {
                    let _ = tx.send(Wake::SessionChanged);
                    Ok(())
                },
            );

        let current_token = manager.CurrentSessionChanged(&on_current_changed)?;

        let tx = sender.clone();
        let on_sessions_changed =
            TypedEventHandler::<SessionManager, SessionsChangedEventArgs>::new(move |_, _| {
                let _ = tx.send(Wake::SessionChanged);
                Ok(())
            });

        let sessions_token = match manager.SessionsChanged(&on_sessions_changed) {
            Ok(token) => token,
            Err(error) => {
                let _ = manager.RemoveCurrentSessionChanged(current_token);
                return Err(error);
            }
        };

        Ok(Self {
            manager: manager.clone(),
            current_token,
            sessions_token,
        })
    }

    fn unsubscribe(self) {
        let _ = self.manager.RemoveCurrentSessionChanged(self.current_token);
        let _ = self.manager.RemoveSessionsChanged(self.sessions_token);
    }
}

// ---------- Command yang dipanggil React ----------

/// Info lagu saat ini, untuk mengisi tampilan awal.
#[tauri::command]
pub async fn get_media_info() -> Result<Option<MediaInfo>, String> {
    run_blocking(read_media_info).await
}

/// Status putar saat ini, untuk mengisi tampilan awal.
#[tauri::command]
pub async fn get_playback_info() -> Result<Option<PlaybackInfo>, String> {
    run_blocking(read_playback_info).await
}

/// Mengirim perintah (previous / play-pause / next) ke pemutar aktif.
/// Mengembalikan `true` jika pemutar menerimanya.
#[tauri::command]
pub async fn media_control(action: MediaAction) -> Result<bool, String> {
    run_blocking(move || send_action(action)).await
}

/// Menjalankan pekerjaan yang memblokir (menunggu API Windows) di thread khusus,
/// supaya tidak menahan thread runtime async maupun main thread.
async fn run_blocking<T, F>(work: F) -> Result<T, String>
where
    F: FnOnce() -> windows::core::Result<T> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

// ---------- Akses ke Windows ----------

/// Perkenalkan thread yang sedang berjalan ke WinRT. Jika sudah terinisialisasi, hasilnya diabaikan.
fn init_winrt() {
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
}

fn current_manager() -> windows::core::Result<SessionManager> {
    init_winrt();
    SessionManager::RequestAsync()?.join()
}

fn read_media_info() -> windows::core::Result<Option<MediaInfo>> {
    read_media_info_from(&current_manager()?)
}

fn read_playback_info() -> windows::core::Result<Option<PlaybackInfo>> {
    read_playback_from(&current_manager()?)
}

fn send_action(action: MediaAction) -> windows::core::Result<bool> {
    let manager = current_manager()?;
    let session = manager.GetCurrentSession()?;

    let operation = match action {
        MediaAction::Previous => session.TrySkipPreviousAsync()?,
        MediaAction::PlayPause => session.TryTogglePlayPauseAsync()?,
        MediaAction::Next => session.TrySkipNextAsync()?,
    };

    operation.join()
}

fn seek_to(position_ms: u64) -> windows::core::Result<bool> {
    let manager = current_manager()?;
    let session = manager.GetCurrentSession()?;

    // Posisi di Windows dihitung dari StartTime, satuan 100 nanodetik.
    let start_ms = timespan_ms(session.GetTimelineProperties()?.StartTime()?);
    let ticks = ((start_ms + position_ms) * 10_000) as i64;

    session.TryChangePlaybackPositionAsync(ticks)?.join()
}

fn read_media_info_from(manager: &SessionManager) -> windows::core::Result<Option<MediaInfo>> {
    // Tidak ada sesi aktif (tidak ada pemutar yang sedang berjalan): bukan error.
    let Ok(session) = manager.GetCurrentSession() else {
        return Ok(None);
    };

    let properties = session.TryGetMediaPropertiesAsync()?.join()?;

    Ok(Some(MediaInfo {
        title: properties.Title()?.to_string(),
        artist: properties.Artist()?.to_string(),
        album: properties.AlbumTitle()?.to_string(),
        artwork: read_artwork(&properties),
    }))
}

fn read_playback_from(manager: &SessionManager) -> windows::core::Result<Option<PlaybackInfo>> {
    let Ok(session) = manager.GetCurrentSession() else {
        return Ok(None);
    };

    let status = session.GetPlaybackInfo()?.PlaybackStatus()?;
    let is_playing = status == PlaybackStatus::Playing;

    let timeline = session.GetTimelineProperties()?;
    let start_ms = timespan_ms(timeline.StartTime()?);
    let end_ms = timespan_ms(timeline.EndTime()?);
    let duration_ms = end_ms.saturating_sub(start_ms);
    let mut position_ms = timespan_ms(timeline.Position()?).saturating_sub(start_ms);

    if is_playing {
        // Windows melaporkan posisi "pada saat LastUpdatedTime". Majukan sebesar
        // waktu yang sudah berlalu sejak itu.
        let updated_at = datetime_unix_ms(timeline.LastUpdatedTime()?);
        if updated_at > 0 {
            position_ms += (now_unix_ms() - updated_at).max(0) as u64;
        }
    }

    if duration_ms > 0 {
        position_ms = position_ms.min(duration_ms);
    }

    Ok(Some(PlaybackInfo {
        is_playing,
        position_ms,
        duration_ms,
    }))
}

/// Windows menyimpan durasi dalam satuan 100 nanodetik.
fn timespan_ms(span: TimeSpan) -> u64 {
    (span.Duration.max(0) / 10_000) as u64
}

/// Windows menghitung waktu sejak 1 Januari 1601 (satuan 100 nanodetik); kita butuh sejak 1970.
fn datetime_unix_ms(time: DateTime) -> i64 {
    (time.UniversalTime - 116_444_736_000_000_000) / 10_000
}

fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

/// Membaca thumbnail lagu dan mengubahnya menjadi data URL.
/// Gagal membaca gambar bukan masalah: kembalikan `None`, dan lagunya tetap tampil.
fn read_artwork(properties: &MediaProperties) -> Option<String> {
    let stream = properties
        .Thumbnail()
        .ok()?
        .OpenReadAsync()
        .ok()?
        .join()
        .ok()?;

    let size = stream.Size().ok()?;
    if size == 0 || size > MAX_ARTWORK_BYTES {
        return None;
    }

    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.LoadAsync(size as u32).ok()?.join().ok()?;

    let mut bytes = vec![0u8; size as usize];
    reader.ReadBytes(&mut bytes).ok()?;

    let mime = guess_image_mime(&bytes);
    Some(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)))
}

/// Menebak jenis gambar dari beberapa byte pertamanya ("magic bytes").
fn guess_image_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else {
        // JPEG (diawali 0xFF 0xD8) adalah kasus terbanyak, jadi jadi pilihan bawaan.
        "image/jpeg"
    }
}

// ---------- Pemantau perubahan ----------

/// Menjalankan thread yang memantau perubahan media. Dipanggil sekali dari `setup`.
pub fn start_media_watcher(app: &AppHandle) {
    let mut worker = media_watcher()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    // Jangan membuat worker kedua jika watcher sudah pernah dimulai.
    if worker.is_some() {
        return;
    }

    let app = app.clone();
    let (sender, receiver) = mpsc::channel::<Wake>();
    let worker_sender = sender.clone();

    let handle = match thread::Builder::new()
        .name("media-watcher".into())
        .spawn(move || {
            if let Err(error) = run_media_watcher(&app, receiver, &worker_sender) {
                eprintln!("media watcher berhenti: {error}");
            }
        }) {
        Ok(handle) => handle,
        Err(error) => {
            eprintln!("gagal menjalankan media watcher: {error}");
            return;
        }
    };

    *worker = Some(MediaWatcherWorker { sender, handle });
}

/// Menghentikan worker media watcher dan menunggu thread selesai.
pub fn stop_media_watcher() {
    let worker = media_watcher()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .take();

    if let Some(worker) = worker {
        // Mengirim shutdown membangunkan receiver.recv().
        let _ = worker.sender.send(Wake::Shutdown);

        if worker.handle.join().is_err() {
            eprintln!("media watcher berhenti dengan panic");
        }
    }
}

fn run_media_watcher(
    app: &AppHandle,
    receiver: mpsc::Receiver<Wake>,
    sender: &Sender<Wake>,
) -> windows::core::Result<()> {
    let manager = current_manager()?;

    // Simpan token manager agar listener dapat dilepas saat worker selesai.
    let manager_subscription = ManagerSubscription::subscribe(&manager, sender)?;

    let mut subscription = subscribe_to_current_session(&manager, sender);
    emit_media(app, read_media_info_from(&manager));
    emit_playback(app, read_playback_from(&manager));

    // Tidur sampai ada pesan atau sinyal shutdown.
    while let Ok(first) = receiver.recv() {
        let mut pending = Pending::default();
        let mut shutdown = pending.record(first);

        // Gabungkan pesan yang menumpuk, supaya satu rentetan event menghasilkan satu pembacaan.
        while !shutdown {
            match receiver.try_recv() {
                Ok(wake) => shutdown = pending.record(wake),
                Err(mpsc::TryRecvError::Empty) => break,
                Err(mpsc::TryRecvError::Disconnected) => {
                    shutdown = true;
                }
            }
        }

        if shutdown {
            break;
        }

        if pending.session_changed {
            if let Some(old) = subscription.take() {
                old.unsubscribe();
            }

            subscription = subscribe_to_current_session(&manager, sender);
        }

        // Artwork hanya dibaca ulang jika lagunya memang berganti.
        if pending.session_changed || pending.media_changed {
            emit_media(app, read_media_info_from(&manager));
        }

        emit_playback(app, read_playback_from(&manager));
    }

    // Lepaskan listener sebelum keluar dari worker.
    if let Some(active) = subscription.take() {
        active.unsubscribe();
    }

    manager_subscription.unsubscribe();

    Ok(())
}

/// Memasang tiga pendengar di sesi yang sedang aktif.
///
/// Jika pemasangan listener berikutnya gagal, listener yang sudah terpasang
/// sebelumnya langsung dilepas agar tidak tertinggal.
fn subscribe_to_current_session(
    manager: &SessionManager,
    sender: &Sender<Wake>,
) -> Option<Subscription> {
    let session = manager.GetCurrentSession().ok()?;

    let tx = sender.clone();
    let on_media =
        TypedEventHandler::<Session, MediaPropertiesChangedEventArgs>::new(move |_, _| {
            let _ = tx.send(Wake::MediaChanged);
            Ok(())
        });

    let media_token = session.MediaPropertiesChanged(&on_media).ok()?;

    let tx = sender.clone();
    let on_playback =
        TypedEventHandler::<Session, PlaybackInfoChangedEventArgs>::new(move |_, _| {
            let _ = tx.send(Wake::PlaybackChanged);
            Ok(())
        });

    let playback_token = match session.PlaybackInfoChanged(&on_playback) {
        Ok(token) => token,
        Err(error) => {
            let _ = session.RemoveMediaPropertiesChanged(media_token);
            eprintln!("gagal memasang playback listener: {error}");
            return None;
        }
    };

    let tx = sender.clone();
    let on_timeline =
        TypedEventHandler::<Session, TimelinePropertiesChangedEventArgs>::new(move |_, _| {
            let _ = tx.send(Wake::PlaybackChanged);
            Ok(())
        });

    let timeline_token = match session.TimelinePropertiesChanged(&on_timeline) {
        Ok(token) => token,
        Err(error) => {
            let _ = session.RemoveMediaPropertiesChanged(media_token);
            let _ = session.RemovePlaybackInfoChanged(playback_token);
            eprintln!("gagal memasang timeline listener: {error}");
            return None;
        }
    };

    Some(Subscription {
        session,
        media_token,
        playback_token,
        timeline_token,
    })
}

fn emit_media(app: &AppHandle, info: windows::core::Result<Option<MediaInfo>>) {
    let payload = info.unwrap_or_else(|error| {
        eprintln!("gagal membaca media: {error}");
        None
    });

    // Gagal mengirim satu event bukan masalah fatal.
    let _ = app.emit(MEDIA_EVENT, payload);
}

fn emit_playback(app: &AppHandle, info: windows::core::Result<Option<PlaybackInfo>>) {
    let payload = info.unwrap_or_else(|error| {
        eprintln!("gagal membaca playback: {error}");
        None
    });

    let _ = app.emit(PLAYBACK_EVENT, payload);
}

#[tauri::command]
pub async fn media_seek(position_ms: u64) -> Result<bool, String> {
    run_blocking(move || seek_to(position_ms)).await
}
