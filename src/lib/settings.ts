import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ============================================================
// Enums
// ============================================================

export type Theme = "light" | "dark" | "system";

export type IslandLayout = "inline" | "side";

export type PeekBehavior = "whenBusy" | "always" | "standby";

export type TimerMode = "pomodoro" | "flow";

export type WaterMode = "smart" | "fixed";

export type AlarmSound = "beep" | "chime" | "bell" | "digital" | "pop" | "off";

// ============================================================
// General
// ============================================================

export interface GeneralSettings {
  launchAtStartup: boolean;
  startMinimized: boolean;
  keepRunningInBackground: boolean;
  closeToTray: boolean;
}

// ============================================================
// Appearance
// ============================================================

export interface IslandAppearanceSettings {
  layout: IslandLayout;
  peekBehavior: PeekBehavior;
}

export interface AppearanceSettings {
  theme: Theme;
  island: IslandAppearanceSettings;
  animationsEnabled: boolean;
  /** Tingkat transparansi 0–100. */
  transparency: number;
}

// ============================================================
// Shortcuts
// ============================================================

export interface ShortcutSettings {
  toggleIsland: string | null;
  openLauncher: string | null;
  openClipboard: string | null;
  openNotifications: string | null;
  startFocus: string | null;
  openSettings: string | null;
}

// ============================================================
// Privacy
// ============================================================

export interface PrivacySettings {
  clipboardCaptureEnabled: boolean;
  notificationAccessEnabled: boolean;
  excludedApps: string[];
  /** null berarti tanpa batas. */
  retentionDays: number | null;
}

// ============================================================
// Feature preferences
// ============================================================

export interface PomodoroSettings {
  enabled: boolean;
  mode: TimerMode;
  /** Nilai yang didukung: 3, 4, atau 5. */
  flowRatio: number;
}

export interface WaterReminderSettings {
  enabled: boolean;
  mode: WaterMode;
  intervalMin: number;
  goalMl: number;
  glassMl: number;
  startHour: number;
  endHour: number;
}

export interface SoundSettings {
  volume: number;
  pomodoro: AlarmSound;
  water: AlarmSound;
  task: AlarmSound;
  message: AlarmSound;
  repeat: boolean;
}

export interface ClipboardSettings {
  enabled: boolean;
  maxItems: number;
}

export interface LauncherSettings {
  enabled: boolean;
  showRecentCommands: boolean;
  maxRecentCommands: number;
}

export interface NotificationSettings {
  enabled: boolean;
  doNotDisturb: boolean;
  groupByApplication: boolean;
}

export interface FocusSettings {
  enabled: boolean;
  defaultDurationMin: number;
  enableDoNotDisturb: boolean;
}

export interface FeatureSettings {
  media: boolean;
  systemMonitor: boolean;
  pomodoro: PomodoroSettings;
  waterReminder: WaterReminderSettings;
  tasks: boolean;
  quickShelf: boolean;
  sound: SoundSettings;

  // Roadmap features
  clipboard: ClipboardSettings;
  launcher: LauncherSettings;
  notifications: NotificationSettings;
  focus: FocusSettings;
}

// ============================================================
// Root
// ============================================================

export interface AppSettings {
  version: number;
  general: GeneralSettings;
  appearance: AppearanceSettings;
  shortcuts: ShortcutSettings;
  privacy: PrivacySettings;
  features: FeatureSettings;
}

// ============================================================
// IPC
// ============================================================

export const SETTINGS_CHANGED_EVENT = "settings-changed";

/**
 * Menangani error dari command Rust sebagai Error JavaScript.
 */
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (reason) {
    throw new Error(typeof reason === "string" ? reason : reason instanceof Error ? reason.message : "Terjadi kesalahan saat mengakses pengaturan.");
  }
}

/**
 * Memuat konfigurasi dari penyimpanan lokal.
 * Rust menangani default, validasi, dan pemulihan konfigurasi.
 */
export function loadSettings(): Promise<AppSettings> {
  return call<AppSettings>("settings_load");
}

/**
 * Memvalidasi dan menyimpan konfigurasi melalui Rust.
 * Mengembalikan konfigurasi yang telah disimpan.
 */
export function saveSettings(settings: AppSettings): Promise<AppSettings> {
  return call<AppSettings>("settings_save", { settings });
}

/**
 * Mendengarkan perubahan konfigurasi dari window lain.
 * Caller bertanggung jawab memanggil UnlistenFn saat cleanup.
 */
export function onSettingsChanged(handler: (settings: AppSettings) => void): Promise<UnlistenFn> {
  return listen<AppSettings>(SETTINGS_CHANGED_EVENT, (event) => handler(event.payload));
}
