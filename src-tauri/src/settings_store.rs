
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::settings::{AppSettings, SettingsError};

static FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Mengelola persistence konfigurasi aplikasi.
pub struct SettingsStore {
    path: PathBuf,
}

impl SettingsStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    /// Memuat konfigurasi.
    ///
    /// - File belum ada: buat konfigurasi default.
    /// - File rusak atau tidak valid: backup file lama, lalu pulihkan default.
    /// - Versi lebih baru: hentikan proses tanpa menimpa file.
    pub fn load_or_default(&self) -> Result<AppSettings, String> {
        let raw = match fs::read_to_string(&self.path) {
            Ok(raw) => raw,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let settings = AppSettings::default();
                self.save(&settings)?;
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

    /// Memvalidasi dan menyimpan konfigurasi secara atomik.
    pub fn save(&self, settings: &AppSettings) -> Result<(), String> {
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
        self.save(&settings)?;

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

            let temp_path = parent.join(format!(
                ".settings-{counter}.tmp"
            ));

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

            if let Err(error) = fs::rename(&temp_path, &self.path) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

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
}
