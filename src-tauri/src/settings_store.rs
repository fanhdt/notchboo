use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        Mutex, MutexGuard,
        atomic::{AtomicU64, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

use crate::settings::{AppSettings, SettingsError};

static FILE_COUNTER: AtomicU64 = AtomicU64::new(0);
static SETTINGS_LOCK: Mutex<()> = Mutex::new(());

/// Mengelola persistence konfigurasi aplikasi.
pub struct SettingsStore {
    path: PathBuf,
}

impl SettingsStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    fn lock() -> MutexGuard<'static, ()> {
        SETTINGS_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Memuat konfigurasi dengan operasi yang terserialisasi.
    pub fn load_or_default(&self) -> Result<AppSettings, String> {
        let _guard = Self::lock();
        self.load_or_default_unlocked()
    }

    fn load_or_default_unlocked(&self) -> Result<AppSettings, String> {
        let raw = match fs::read_to_string(&self.path) {
            Ok(raw) => raw,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let settings = AppSettings::default();
                self.save_unlocked(&settings)?;
                return Ok(settings);
            }
            Err(error) => {
                return Err(format!(
                    "Tidak bisa membaca konfigurasi {}: {error}",
                    self.path.display()
                ));
            }
        };

        let settings = match serde_json::from_str::<AppSettings>(&raw) {
            Ok(settings) => settings,
            Err(error) => {
                return self.recover_corrupt_file(format!(
                    "Format JSON tidak valid: {error}"
                ));
            }
        };

        match settings.validate() {
            Ok(()) => Ok(settings),
            Err(SettingsError::UnsupportedVersion(version)) => Err(format!(
                "Versi konfigurasi {version} lebih baru daripada versi aplikasi. \
                 File tidak diubah agar konfigurasi tidak hilang."
            )),
            Err(error) => self.recover_corrupt_file(error.to_string()),
        }
    }

    /// Memvalidasi dan menyimpan konfigurasi dengan operasi terserialisasi.
    pub fn save(&self, settings: &AppSettings) -> Result<(), String> {
        let _guard = Self::lock();
        self.save_unlocked(settings)
    }

        /// Mengekspor konfigurasi aktif ke file JSON tujuan.
    pub fn export_to(&self, destination: impl AsRef<Path>) -> Result<(), String> {
        let _guard = Self::lock();

        let settings = self.load_or_default_unlocked()?;

        let serialized = serde_json::to_vec_pretty(&settings)
            .map_err(|error| format!("Tidak bisa membuat JSON konfigurasi: {error}"))?;

        write_atomically_to(destination.as_ref(), &serialized)
    }

    /// Membaca dan memvalidasi file konfigurasi eksternal tanpa mengubah
    /// konfigurasi aktif.
    pub fn read_import_file(
        path: impl AsRef<Path>,
    ) -> Result<AppSettings, String> {
        let path = path.as_ref();

        let raw = fs::read_to_string(path).map_err(|error| {
            format!(
                "Tidak bisa membaca file konfigurasi {}: {error}",
                path.display()
            )
        })?;

        let settings = serde_json::from_str::<AppSettings>(&raw)
            .map_err(|error| format!("Format JSON konfigurasi tidak valid: {error}"))?;

        settings
            .validate()
            .map_err(|error| format!("Konfigurasi import tidak valid: {error}"))?;

        Ok(settings)
    }

    /// Membuat salinan konfigurasi aktif sebelum proses import atau restore.
    /// File konfigurasi asli tetap dipertahankan.
    pub fn backup_current(&self) -> Result<PathBuf, String> {
        let _guard = Self::lock();

        // Pastikan konfigurasi aktif tersedia dan valid.
        self.load_or_default_unlocked()?;

        let parent = self.path.parent().ok_or_else(|| {
            "Folder konfigurasi tidak ditemukan".to_string()
        })?;

        let stem = self
            .path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("settings");

        let extension = self
            .path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("json");

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        for _ in 0..100 {
            let counter = FILE_COUNTER.fetch_add(1, Ordering::Relaxed);

            let backup = parent.join(format!(
                "{stem}.backup-{timestamp}-{counter}.{extension}"
            ));

            match fs::copy(&self.path, &backup) {
                Ok(_) => return Ok(backup),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    continue;
                }
                Err(error) => {
                    return Err(format!(
                        "Tidak bisa membuat backup konfigurasi {}: {error}",
                        self.path.display()
                    ));
                }
            }
        }

        Err("Tidak bisa membuat nama backup konfigurasi yang unik".to_string())
    }

    fn save_unlocked(&self, settings: &AppSettings) -> Result<(), String> {
        settings
            .validate()
            .map_err(|error| format!("Konfigurasi tidak valid: {error}"))?;

        let parent = self.path.parent().ok_or_else(|| {
            "Lokasi folder konfigurasi tidak valid".to_string()
        })?;

        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Tidak bisa membuat folder konfigurasi {}: {error}",
                parent.display()
            )
        })?;

        let serialized = serde_json::to_vec_pretty(settings)
            .map_err(|error| format!("Tidak bisa membuat JSON konfigurasi: {error}"))?;

        self.write_atomically(&serialized)
    }

    fn recover_corrupt_file(&self, reason: String) -> Result<AppSettings, String> {
        let backup = self.backup_corrupt_file()?;

        eprintln!(
            "[Settings] Konfigurasi tidak valid ({reason}). \
             File lama diamankan di {}",
            backup.display()
        );

        let settings = AppSettings::default();
        self.save_unlocked(&settings)?;

        Ok(settings)
    }

    /// Memindahkan file rusak ke nama backup unik tanpa menimpa backup lama.
    fn backup_corrupt_file(&self) -> Result<PathBuf, String> {
        let parent = self.path.parent().ok_or_else(|| {
            "Folder konfigurasi tidak ditemukan".to_string()
        })?;

        let stem = self
            .path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("settings");

        let extension = self
            .path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("json");

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        for _ in 0..100 {
            let counter = FILE_COUNTER.fetch_add(1, Ordering::Relaxed);

            let backup = parent.join(format!(
                "{stem}.corrupt-{timestamp}-{counter}.{extension}"
            ));

            match fs::rename(&self.path, &backup) {
                Ok(()) => return Ok(backup),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    continue;
                }
                Err(error) => {
                    return Err(format!(
                        "Tidak bisa mengamankan konfigurasi rusak {}: {error}",
                        self.path.display()
                    ));
                }
            }
        }

        Err("Tidak bisa membuat nama backup konfigurasi yang unik".to_string())
    }

    /// Menulis temporary file di folder yang sama, lalu mengganti file utama.
    fn write_atomically(&self, contents: &[u8]) -> Result<(), String> {
        let parent = self.path.parent().ok_or_else(|| {
            "Folder konfigurasi tidak ditemukan".to_string()
        })?;

        for _ in 0..100 {
            let counter = FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
            let temp_path = parent.join(format!(".settings-{counter}.tmp"));

            let mut file = match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp_path)
            {
                Ok(file) => file,
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    continue;
                }
                Err(error) => {
                    return Err(format!(
                        "Tidak bisa membuat temporary file konfigurasi: {error}"
                    ));
                }
            };

            let write_result = file
                .write_all(contents)
                .and_then(|()| file.sync_all());

            if let Err(error) = write_result {
                let _ = fs::remove_file(&temp_path);
                return Err(format!(
                    "Tidak bisa menulis temporary file konfigurasi: {error}"
                ));
            }

            drop(file);

            if let Err(error) = replace_file(&temp_path, &self.path) {
                let _ = fs::remove_file(&temp_path);
                return Err(format!(
                    "Tidak bisa mengganti file konfigurasi {}: {error}",
                    self.path.display()
                ));
            }

            return Ok(());
        }

        Err("Tidak bisa membuat temporary file konfigurasi yang unik".to_string())
    }
}

fn write_atomically_to(
    destination: &Path,
    contents: &[u8],
) -> Result<(), String> {
    let parent = destination.parent().ok_or_else(|| {
        "Lokasi folder tujuan tidak valid".to_string()
    })?;

    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Tidak bisa membuat folder tujuan {}: {error}",
            parent.display()
        )
    })?;

    for _ in 0..100 {
        let counter = FILE_COUNTER.fetch_add(1, Ordering::Relaxed);

        let temp_path = parent.join(format!(".settings-export-{counter}.tmp"));

        let mut file = match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                continue;
            }
            Err(error) => {
                return Err(format!(
                    "Tidak bisa membuat temporary file export: {error}"
                ));
            }
        };

        let write_result = file
            .write_all(contents)
            .and_then(|()| file.sync_all());

        if let Err(error) = write_result {
            let _ = fs::remove_file(&temp_path);

            return Err(format!(
                "Tidak bisa menulis file export: {error}"
            ));
        }

        drop(file);

        if let Err(error) = replace_file(&temp_path, destination) {
            let _ = fs::remove_file(&temp_path);

            return Err(format!(
                "Tidak bisa menyimpan file export {}: {error}",
                destination.display()
            ));
        }

        return Ok(());
    }

    Err("Tidak bisa membuat temporary file export yang unik".to_string())
}

/// Mengganti file tujuan secara atomik sesuai platform.
#[cfg(windows)]
fn replace_file(source: &std::path::Path, destination: &std::path::Path) -> std::io::Result<()> {
    use std::{os::windows::ffi::OsStrExt, ptr};

    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();

    // SAFETY: Kedua path merupakan UTF-16 null-terminated dan hidup selama pemanggilan.
    let result = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };

    if result == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        let _ = ptr::null::<u16>();
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(source: &std::path::Path, destination: &std::path::Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, thread};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let counter = FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "mochi-settings-test-{}-{counter}",
                std::process::id()
            ));

            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn settings_path(&self) -> PathBuf {
            self.0.join("settings.json")
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn missing_file_creates_default_settings() {
        let dir = TestDirectory::new();
        let store = SettingsStore::new(dir.settings_path());

        let settings = store.load_or_default().unwrap();

        assert_eq!(settings, AppSettings::default());
        assert!(dir.settings_path().exists());
    }

    #[test]
    fn saved_settings_survive_reloading() {
        let dir = TestDirectory::new();
        let store = SettingsStore::new(dir.settings_path());

        let mut settings = AppSettings::default();
        settings.appearance.animations_enabled = false;
        settings.features.sound.volume = 0.4;

        store.save(&settings).unwrap();

        let loaded = store.load_or_default().unwrap();
        assert_eq!(loaded, settings);
    }

    #[test]
    fn existing_file_can_be_atomically_replaced() {
        let dir = TestDirectory::new();
        let path = dir.settings_path();
        let store = SettingsStore::new(&path);

        let first = AppSettings::default();
        store.save(&first).unwrap();

        let mut second = first.clone();
        second.appearance.animations_enabled = false;

        store.save(&second).unwrap();

        assert_eq!(store.load_or_default().unwrap(), second);
    }

    #[test]
    fn corrupt_json_is_backed_up_and_recovered() {
        let dir = TestDirectory::new();
        let path = dir.settings_path();

        fs::write(&path, "{invalid json").unwrap();

        let store = SettingsStore::new(&path);
        let settings = store.load_or_default().unwrap();

        assert_eq!(settings, AppSettings::default());
        assert!(path.exists());

        let backups: Vec<_> = fs::read_dir(&dir.0)
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("settings.corrupt-"))
            })
            .collect();

        assert_eq!(backups.len(), 1);
        assert_eq!(
            fs::read_to_string(&backups[0]).unwrap(),
            "{invalid json"
        );
    }

    #[test]
    fn invalid_settings_are_backed_up_and_recovered() {
        let dir = TestDirectory::new();
        let path = dir.settings_path();

        let invalid = r#"{
            "version": 1,
            "appearance": { "transparency": 150 }
        }"#;

        fs::write(&path, invalid).unwrap();

        let store = SettingsStore::new(&path);
        let settings = store.load_or_default().unwrap();

        assert_eq!(settings, AppSettings::default());
    }

    #[test]
    fn unsupported_future_version_is_not_overwritten() {
        let dir = TestDirectory::new();
        let path = dir.settings_path();

        let future = r#"{"version": 999}"#;
        fs::write(&path, future).unwrap();

        let store = SettingsStore::new(&path);

        assert!(store.load_or_default().is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), future);
    }

    #[test]
    fn invalid_settings_cannot_be_saved() {
        let dir = TestDirectory::new();
        let path = dir.settings_path();
        let store = SettingsStore::new(&path);

        let mut settings = AppSettings::default();
        settings.features.sound.volume = 2.0;

        assert!(store.save(&settings).is_err());
        assert!(!path.exists());
    }

    #[test]
    fn concurrent_saves_do_not_corrupt_the_file() {
        let dir = TestDirectory::new();
        let path = dir.settings_path();

        let workers: Vec<_> = (0..8)
            .map(|index| {
                let path = path.clone();

                thread::spawn(move || {
                    let store = SettingsStore::new(path);
                    let mut settings = AppSettings::default();
                    settings.features.sound.volume = index as f32 / 10.0;
                    store.save(&settings).unwrap();
                })
            })
            .collect();

        for worker in workers {
            worker.join().unwrap();
        }

        let store = SettingsStore::new(&path);
        let loaded = store.load_or_default().unwrap();

        assert!(loaded.features.sound.volume.is_finite());
        assert!((0.0..=0.7).contains(&loaded.features.sound.volume));
    }
}
