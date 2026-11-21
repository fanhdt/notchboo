#[cfg(windows)]
mod windows_listener {
    use std::{
        mem::zeroed,
        ptr::{null, null_mut},
        sync::mpsc,
        thread,
    };

   use tauri::{AppHandle, Emitter, Manager};

    use windows_sys::Win32::{
        Foundation::{
            CloseHandle, ERROR_CLASS_ALREADY_EXISTS, GetLastError, HWND, LPARAM, LRESULT, WPARAM,
        },
        System::{
            DataExchange::{
                AddClipboardFormatListener, CloseClipboard, GetClipboardData, OpenClipboard,
                RemoveClipboardFormatListener,
            },
            LibraryLoader::GetModuleHandleW,
            Memory::{GlobalLock, GlobalSize, GlobalUnlock},
            Ole::CF_UNICODETEXT,
            Threading::{
                GetCurrentThreadId, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
                QueryFullProcessImageNameW,
            },
        },
        UI::WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetForegroundWindow,
            GetMessageW, GetWindowThreadProcessId, MSG, PostThreadMessageW, RegisterClassW,
            TranslateMessage, WM_CLIPBOARDUPDATE, WM_QUIT, WNDCLASSW, WS_POPUP,
        },
    };

    use crate::settings_store::SettingsStore;

    use super::super::{
        model::{MAX_CLIPBOARD_TEXT_BYTES, normalize_source_app},
        state::{ClipboardState, MonitorWorker},
    };

    const CLASS_NAME: &str = "MochiClipboardListener";

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        // SAFETY: Pesan diteruskan ke prosedur default Windows.
        unsafe { DefWindowProcW(hwnd, message, wparam, lparam) }
    }

    fn wide_null(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }

    pub fn start(app: &AppHandle) -> Result<(), String> {
        let state = app.state::<ClipboardState>();

        let mut worker_slot = state
            .worker
            .lock()
            .map_err(|_| "Clipboard monitor sedang tidak tersedia.".to_string())?;

        if worker_slot.is_some() {
            return Ok(());
        }

        let app_handle = app.clone();
        let (ready_tx, ready_rx) = mpsc::channel();

        let handle = thread::Builder::new()
            .name("mochi-clipboard-listener".to_string())
            .spawn(move || {
                run_listener(app_handle, ready_tx);
            })
            .map_err(|error| format!("Gagal memulai clipboard listener: {error}"))?;

        match ready_rx.recv() {
            Ok(Ok(thread_id)) => {
                *worker_slot = Some(MonitorWorker { thread_id, handle });
                Ok(())
            }
            Ok(Err(error)) => {
                let _ = handle.join();
                Err(error)
            }
            Err(error) => {
                let _ = handle.join();
                Err(format!(
                    "Clipboard listener gagal memberikan respons: {error}"
                ))
            }
        }
    }

    pub fn stop(app: &AppHandle) {
        let state = app.state::<ClipboardState>();

        let worker = state.worker.lock().ok().and_then(|mut slot| slot.take());

        let Some(worker) = worker else {
            return;
        };

        // WM_QUIT menghentikan message loop pada thread listener.
        unsafe {
            let _ = PostThreadMessageW(worker.thread_id, WM_QUIT, 0, 0);
        }

        if worker.handle.join().is_err() {
            eprintln!("[Clipboard] Listener thread berhenti dengan panic.");
        }
    }

    fn run_listener(app: AppHandle, ready: mpsc::Sender<Result<u32, String>>) {
        let class_name = wide_null(CLASS_NAME);

        // SAFETY: Module handle dan struktur class valid selama registrasi.
        let instance = unsafe { GetModuleHandleW(null()) };

        if instance.is_null() {
            let _ = ready.send(Err(format!(
                "Gagal mengambil module handle: {}",
                std::io::Error::last_os_error()
            )));
            return;
        }

        let class = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(window_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: instance,
            hIcon: null_mut(),
            hCursor: null_mut(),
            hbrBackground: null_mut(),
            lpszMenuName: null(),
            lpszClassName: class_name.as_ptr(),
        };

        // SAFETY: Struktur class dan string hidup selama pemanggilan.
        let registered = unsafe { RegisterClassW(&class) };

        if registered == 0 {
            let error = unsafe { GetLastError() };

            if error != ERROR_CLASS_ALREADY_EXISTS {
                let _ = ready.send(Err(format!(
                    "Gagal mendaftarkan clipboard listener window: {error}"
                )));
                return;
            }
        }

        // HWND_MESSAGE membuat window tersembunyi tanpa window taskbar.
        let hwnd = unsafe {
            CreateWindowExW(
                0,
                class_name.as_ptr(),
                class_name.as_ptr(),
                WS_POPUP,
                0,
                0,
                0,
                0,
                (-3isize) as HWND,
                null_mut(),
                instance,
                null(),
            )
        };

        if hwnd.is_null() {
            let _ = ready.send(Err(format!(
                "Gagal membuat clipboard listener window: {}",
                std::io::Error::last_os_error()
            )));
            return;
        }

        if unsafe { AddClipboardFormatListener(hwnd) } == 0 {
            let error = unsafe { GetLastError() };

            unsafe {
                let _ = DestroyWindow(hwnd);
            }

            let _ = ready.send(Err(format!(
                "Gagal mendaftarkan clipboard listener: {error}"
            )));
            return;
        }

        let thread_id = unsafe { GetCurrentThreadId() };

        if ready.send(Ok(thread_id)).is_err() {
            unsafe {
                let _ = RemoveClipboardFormatListener(hwnd);
                let _ = DestroyWindow(hwnd);
            }
            return;
        }

        let mut message: MSG = unsafe { zeroed() };

        loop {
            let result = unsafe { GetMessageW(&mut message, null_mut(), 0, 0) };

            if result <= 0 {
                break;
            }

            if message.message == WM_CLIPBOARDUPDATE {
                capture_clipboard(&app, hwnd);
            }

            unsafe {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }

        unsafe {
            let _ = RemoveClipboardFormatListener(hwnd);
            let _ = DestroyWindow(hwnd);
        }
    }

    fn capture_clipboard(app: &AppHandle, hwnd: HWND) {
        let state = app.state::<ClipboardState>();

        if state.is_paused() {
            return;
        }

        let settings_store = app.state::<SettingsStore>();

        let settings = match settings_store.load_or_default() {
            Ok(settings) => settings,
            Err(error) => {
                eprintln!("[Clipboard] Tidak bisa membaca pengaturan: {error}");
                return;
            }
        };

        // Kedua izin wajib aktif. Default keduanya adalah false.
        if !settings.features.clipboard.enabled || !settings.privacy.clipboard_capture_enabled {
            return;
        }

        let source_path = foreground_process_path();
        let source_app = normalize_source_app(source_path.as_deref());

        if is_excluded(source_app.as_deref(), &settings.privacy.excluded_apps) {
            return;
        }

        let Some(content) = read_clipboard_text(hwnd) else {
            return;
        };

        if let Err(error) = state.prune_retention(settings.privacy.retention_days) {
            eprintln!("[Clipboard] Gagal membersihkan history kedaluwarsa: {error}");
        }

        match state.add(
    &content,
    source_app.as_deref(),
    settings.features.clipboard.max_items,
) {
    Ok(_) => {
        if let Err(error) = app.emit("clipboard-updated", ()) {
            eprintln!("[Clipboard] Gagal mengirim event pembaruan: {error}");
        }
    }
    Err(error) => {
        // Jangan pernah mencetak isi clipboard ke log.
        eprintln!("[Clipboard] Gagal menyimpan item: {error}");
    }
}
    }

    fn is_excluded(source_app: Option<&str>, excluded_apps: &[String]) -> bool {
        let Some(source_app) = source_app else {
            return false;
        };

        excluded_apps.iter().any(|excluded| {
            normalize_source_app(Some(excluded))
                .is_some_and(|name| name.eq_ignore_ascii_case(source_app))
        })
    }

    fn read_clipboard_text(hwnd: HWND) -> Option<String> {
        if unsafe { OpenClipboard(hwnd) } == 0 {
            return None;
        }

        let result = unsafe {
            let handle = GetClipboardData(CF_UNICODETEXT as u32);

            if handle.is_null() {
                None
            } else {
                let size = GlobalSize(handle as _);

                if size == 0 || size > MAX_CLIPBOARD_TEXT_BYTES + 2 {
                    None
                } else {
                    let pointer = GlobalLock(handle as _) as *const u16;

                    if pointer.is_null() {
                        None
                    } else {
                        let max_units = (size / 2).min(MAX_CLIPBOARD_TEXT_BYTES / 2);
                        let units = std::slice::from_raw_parts(pointer, max_units);

                        let content = units
                            .iter()
                            .position(|unit| *unit == 0)
                            .map(|end| String::from_utf16_lossy(&units[..end]));

                        let _ = GlobalUnlock(handle as _);

                        content.filter(|value| {
                            !value.trim().is_empty() && value.len() <= MAX_CLIPBOARD_TEXT_BYTES
                        })
                    }
                }
            }
        };

        unsafe {
            let _ = CloseClipboard();
        }

        result
    }

    fn foreground_process_path() -> Option<String> {
        let hwnd = unsafe { GetForegroundWindow() };

        if hwnd.is_null() {
            return None;
        }

        let mut process_id = 0u32;

        unsafe {
            GetWindowThreadProcessId(hwnd, &mut process_id);
        }

        if process_id == 0 {
            return None;
        }

        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id) };

        if process.is_null() {
            return None;
        }

        let mut buffer = vec![0u16; 32768];
        let mut length = buffer.len() as u32;

        let success =
            unsafe { QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut length) };

        unsafe {
            let _ = CloseHandle(process);
        }

        if success == 0 || length == 0 {
            return None;
        }

        buffer.truncate(length as usize);
        Some(String::from_utf16_lossy(&buffer))
    }
}

#[cfg(windows)]
pub use windows_listener::{start as start_monitor, stop as stop_monitor};

#[cfg(not(windows))]
pub fn start_monitor(_app: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
pub fn stop_monitor(_app: &tauri::AppHandle) {}
