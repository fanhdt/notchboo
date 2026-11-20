
use serde::{Deserialize, Serialize};
use std::fmt;

/// Versi schema konfigurasi Mochi.
/// Naikkan ketika struktur konfigurasi memerlukan migrasi.
pub const SETTINGS_VERSION: u32 = 1;

// ============================================================
// Root
// ============================================================

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub version: u32,
    pub general: GeneralSettings,
    pub appearance: AppearanceSettings,
    pub shortcuts: ShortcutSettings,
    pub privacy: PrivacySettings,
    pub features: FeatureSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            general: GeneralSettings::default(),
            appearance: AppearanceSettings::default(),
            shortcuts: ShortcutSettings::default(),
            privacy: PrivacySettings::default(),
            features: FeatureSettings::default(),
        }
    }
}

// ============================================================
// General
// ============================================================

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GeneralSettings {
    /// Jalankan Mochi ketika pengguna masuk ke sistem.
    pub launch_at_startup: bool,
    /// Mulai dalam keadaan tersembunyi.
    pub start_minimized: bool,
    /// Tetap berjalan setelah window utama ditutup.
    pub keep_running_in_background: bool,
    /// Sembunyikan ke system tray ketika window ditutup.
    pub close_to_tray: bool,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            launch_at_startup: true,
            start_minimized: false,
            keep_running_in_background: true,
            close_to_tray: true,
        }
    }
}

// ============================================================
// Appearance
// ============================================================

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    System,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IslandLayout {
    #[default]
    Inline,
    Side,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PeekBehavior {
    #[default]
    WhenBusy,
    Always,
    Standby,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppearanceSettings {
    pub theme: Theme,
    pub island: IslandAppearanceSettings,
    pub animations_enabled: bool,
    /// Tingkat transparansi dalam rentang 0–100.
    pub transparency: u8,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            island: IslandAppearanceSettings::default(),
            animations_enabled: true,
            transparency: 100,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct IslandAppearanceSettings {
    pub layout: IslandLayout,
    pub peek_behavior: PeekBehavior,
}

impl Default for IslandAppearanceSettings {
    fn default() -> Self {
        Self {
            layout: IslandLayout::Inline,
            peek_behavior: PeekBehavior::WhenBusy,
        }
    }
}

// ============================================================
// Shortcuts
// ============================================================

/// Shortcut bersifat opsional sampai fitur shortcut diregistrasikan.
/// Format string akan divalidasi oleh shortcut manager.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ShortcutSettings {
    pub toggle_island: Option<String>,
    pub open_launcher: Option<String>,
    pub open_clipboard: Option<String>,
    pub open_notifications: Option<String>,
    pub start_focus: Option<String>,
    pub open_settings: Option<String>,
}

// ============================================================
// Privacy
// ============================================================

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PrivacySettings {
    /// Clipboard capture harus opt-in.
    pub clipboard_capture_enabled: bool,
    /// Akses ke sumber notifikasi harus opt-in.
    pub notification_access_enabled: bool,
    /// Nama aplikasi yang dikecualikan dari pengumpulan data.
    pub excluded_apps: Vec<String>,
    /// Masa penyimpanan data dalam hari. None berarti tanpa batas.
    pub retention_days: Option<u16>,
}

impl Default for PrivacySettings {
    fn default() -> Self {
        Self {
            clipboard_capture_enabled: false,
            notification_access_enabled: false,
            excluded_apps: Vec::new(),
            retention_days: Some(30),
        }
    }
}

// ============================================================
// Feature management
// ============================================================

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FeatureSettings {
    // Fitur yang sudah tersedia.
    pub media: bool,
    pub system_monitor: bool,
    pub pomodoro: PomodoroSettings,
    pub water_reminder: WaterReminderSettings,
    pub tasks: bool,
    pub quick_shelf: bool,
    pub sound: SoundSettings,

    // Fitur roadmap.
    pub clipboard: ClipboardSettings,
    pub launcher: LauncherSettings,
    pub notifications: NotificationSettings,
    pub focus: FocusSettings,
}

impl Default for FeatureSettings {
    fn default() -> Self {
        Self {
            media: true,
            system_monitor: true,
            pomodoro: PomodoroSettings::default(),
            water_reminder: WaterReminderSettings::default(),
            tasks: true,
            quick_shelf: true,
            sound: SoundSettings::default(),
            clipboard: ClipboardSettings::default(),
            launcher: LauncherSettings::default(),
            notifications: NotificationSettings::default(),
            focus: FocusSettings::default(),
        }
    }
}

// ============================================================
// Existing feature preferences
// ============================================================

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimerMode {
    #[default]
    Pomodoro,
    Flow,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PomodoroSettings {
    pub enabled: bool,
    pub mode: TimerMode,
    /// Rasio waktu fokus terhadap waktu istirahat.
    /// Nilai yang didukung: 3, 4, atau 5.
    pub flow_ratio: u8,
}

impl Default for PomodoroSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            mode: TimerMode::Pomodoro,
            flow_ratio: 5,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WaterMode {
    #[default]
    Smart,
    Fixed,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WaterReminderSettings {
    pub enabled: bool,
    pub mode: WaterMode,
    pub interval_min: u16,
    pub goal_ml: u16,
    pub glass_ml: u16,
    pub start_hour: u8,
    pub end_hour: u8,
}

impl Default for WaterReminderSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            mode: WaterMode::Smart,
            interval_min: 60,
            goal_ml: 2000,
            glass_ml: 250,
            start_hour: 8,
            end_hour: 21,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AlarmSound {
    Beep,
    Chime,
    Bell,
    Digital,
    Pop,
    Off,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SoundSettings {
    /// Volume dalam rentang 0.0–1.0.
    pub volume: f32,
    pub pomodoro: AlarmSound,
    pub water: AlarmSound,
    pub task: AlarmSound,
    pub message: AlarmSound,
    pub repeat: bool,
}

impl Default for SoundSettings {
    fn default() -> Self {
        Self {
            volume: 0.7,
            pomodoro: AlarmSound::Beep,
            water: AlarmSound::Chime,
            task: AlarmSound::Bell,
            message: AlarmSound::Pop,
            repeat: true,
        }
    }
}

// ============================================================
// Roadmap feature preferences
// ============================================================

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ClipboardSettings {
    pub enabled: bool,
    pub max_items: u16,
}

impl Default for ClipboardSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            max_items: 100,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LauncherSettings {
    pub enabled: bool,
    pub show_recent_commands: bool,
    pub max_recent_commands: u16,
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            show_recent_commands: true,
            max_recent_commands: 10,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationSettings {
    pub enabled: bool,
    pub do_not_disturb: bool,
    pub group_by_application: bool,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            do_not_disturb: false,
            group_by_application: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FocusSettings {
    pub enabled: bool,
    pub default_duration_min: u16,
    pub enable_do_not_disturb: bool,
}

impl Default for FocusSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            default_duration_min: 25,
            enable_do_not_disturb: false,
        }
    }
}

// ============================================================
// Validation
// ============================================================

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SettingsError {
    UnsupportedVersion(u32),
    InvalidValue(&'static str),
}

impl fmt::Display for SettingsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedVersion(version) => {
                write!(f, "Versi konfigurasi tidak didukung: {version}")
            }
            Self::InvalidValue(field) => {
                write!(f, "Nilai konfigurasi tidak valid: {field}")
            }
        }
    }
}

impl std::error::Error for SettingsError {}

impl AppSettings {
    /// Memastikan konfigurasi memenuhi batas nilai yang didukung.
    pub fn validate(&self) -> Result<(), SettingsError> {
        if self.version != SETTINGS_VERSION {
            return Err(SettingsError::UnsupportedVersion(self.version));
        }

        if self.appearance.transparency > 100 {
            return Err(SettingsError::InvalidValue("appearance.transparency"));
        }

        if !self.features.sound.volume.is_finite()
            || !(0.0..=1.0).contains(&self.features.sound.volume)
        {
            return Err(SettingsError::InvalidValue("features.sound.volume"));
        }

        if !matches!(self.features.pomodoro.flow_ratio, 3 | 4 | 5) {
            return Err(SettingsError::InvalidValue(
                "features.pomodoro.flowRatio",
            ));
        }

        let water = &self.features.water_reminder;

        if water.interval_min == 0 {
            return Err(SettingsError::InvalidValue(
                "features.waterReminder.intervalMin",
            ));
        }

        if !(1000..=4000).contains(&water.goal_ml) {
            return Err(SettingsError::InvalidValue(
                "features.waterReminder.goalMl",
            ));
        }

        if !(50..=1000).contains(&water.glass_ml) {
            return Err(SettingsError::InvalidValue(
                "features.waterReminder.glassMl",
            ));
        }

        if water.start_hour > 20
            || water.end_hour > 24
            || water.end_hour < water.start_hour + 4
        {
            return Err(SettingsError::InvalidValue(
                "features.waterReminder.activeHours",
            ));
        }

        if let Some(days) = self.privacy.retention_days {
            if days == 0 {
                return Err(SettingsError::InvalidValue(
                    "privacy.retentionDays",
                ));
            }
        }

        if self.features.clipboard.max_items == 0 {
            return Err(SettingsError::InvalidValue(
                "features.clipboard.maxItems",
            ));
        }

        if self.features.focus.default_duration_min == 0 {
            return Err(SettingsError::InvalidValue(
                "features.focus.defaultDurationMin",
            ));
        }

        Ok(())
    }
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_are_valid() {
        let settings = AppSettings::default();

        assert_eq!(settings.version, SETTINGS_VERSION);
        assert!(settings.validate().is_ok());
    }

    #[test]
    fn defaults_preserve_existing_feature_behavior() {
        let settings = AppSettings::default();

        assert!(settings.general.launch_at_startup);
        assert!(settings.general.keep_running_in_background);

        assert!(settings.features.media);
        assert!(settings.features.system_monitor);
        assert!(settings.features.pomodoro.enabled);
        assert!(settings.features.water_reminder.enabled);
        assert!(settings.features.tasks);
        assert!(settings.features.quick_shelf);

        assert_eq!(settings.features.sound.volume, 0.7);
        assert_eq!(settings.features.sound.pomodoro, AlarmSound::Beep);
        assert_eq!(settings.features.sound.water, AlarmSound::Chime);
        assert_eq!(settings.features.sound.task, AlarmSound::Bell);
        assert_eq!(settings.features.sound.message, AlarmSound::Pop);
    }

    #[test]
    fn roadmap_features_are_disabled_by_default() {
        let settings = AppSettings::default();

        assert!(!settings.privacy.clipboard_capture_enabled);
        assert!(!settings.privacy.notification_access_enabled);
        assert!(!settings.features.clipboard.enabled);
        assert!(!settings.features.launcher.enabled);
        assert!(!settings.features.notifications.enabled);
        assert!(!settings.features.focus.enabled);
    }

    #[test]
    fn serializes_using_camel_case_fields() {
        let value = serde_json::to_value(AppSettings::default()).unwrap();

        assert_eq!(value["version"], SETTINGS_VERSION);
        assert!(value["waterReminder"].is_null());
        assert_eq!(value["features"]["waterReminder"]["goalMl"], 2000);
        assert_eq!(value["general"]["launchAtStartup"], true);
        assert_eq!(value["appearance"]["theme"], "system");
    }

    #[test]
    fn deserializes_partial_configuration_using_defaults() {
        let settings: AppSettings = serde_json::from_str(
            r#"{
                "general": {
                    "launchAtStartup": false
                },
                "appearance": {
                    "theme": "dark"
                }
            }"#,
        )
        .unwrap();

        assert!(!settings.general.launch_at_startup);
        assert!(settings.general.keep_running_in_background);
        assert_eq!(settings.appearance.theme, Theme::Dark);
        assert_eq!(settings.features.sound.volume, 0.7);
        assert!(settings.validate().is_ok());
    }

    #[test]
    fn rejects_unsupported_schema_version() {
        let mut settings = AppSettings::default();
        settings.version = SETTINGS_VERSION + 1;

        assert_eq!(
            settings.validate(),
            Err(SettingsError::UnsupportedVersion(
                SETTINGS_VERSION + 1
            ))
        );
    }

    #[test]
    fn rejects_invalid_sound_volume() {
        let mut settings = AppSettings::default();
        settings.features.sound.volume = 1.5;

        assert_eq!(
            settings.validate(),
            Err(SettingsError::InvalidValue("features.sound.volume"))
        );
    }

    #[test]
    fn rejects_invalid_flow_ratio() {
        let mut settings = AppSettings::default();
        settings.features.pomodoro.flow_ratio = 2;

        assert_eq!(
            settings.validate(),
            Err(SettingsError::InvalidValue(
                "features.pomodoro.flowRatio"
            ))
        );
    }

    #[test]
    fn rejects_invalid_water_active_hours() {
        let mut settings = AppSettings::default();
        settings.features.water_reminder.start_hour = 10;
        settings.features.water_reminder.end_hour = 12;

        assert_eq!(
            settings.validate(),
            Err(SettingsError::InvalidValue(
                "features.waterReminder.activeHours"
            ))
        );
    }

    #[test]
    fn rejects_invalid_retention_period() {
        let mut settings = AppSettings::default();
        settings.privacy.retention_days = Some(0);

        assert_eq!(
            settings.validate(),
            Err(SettingsError::InvalidValue(
                "privacy.retentionDays"
            ))
        );
    }

    #[test]
    fn roundtrip_preserves_settings() {
        let original = AppSettings::default();
        let json = serde_json::to_string(&original).unwrap();
        let restored: AppSettings = serde_json::from_str(&json).unwrap();

        assert_eq!(original, restored);
        assert!(restored.validate().is_ok());
    }
}
