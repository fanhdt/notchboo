import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { clearLegacySoundSettings, readLegacySoundSettings } from "../lib/sound";
import { clearLegacyTimerSettings, readLegacyTimerSettings } from "../lib/legacyTimerSettings";
import { readLegacyWaterSettings } from "../lib/legacyWaterSettings";
import { loadSettings, onSettingsChanged, saveSettings, type AppSettings } from "../lib/settings";
import { SettingsContext, type SettingsContextValue } from "../hooks/useSettings";

interface SettingsProviderProps {
  children: ReactNode;
}

function getErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }

  return typeof reason === "string" ? reason : "Gagal menyimpan pengaturan.";
}

function isDefaultSoundSettings(sound: AppSettings["features"]["sound"]): boolean {
  return sound.volume === 0.7 && sound.pomodoro === "beep" && sound.water === "chime" && sound.task === "bell" && sound.message === "pop" && sound.repeat === true;
}

function isDefaultPomodoroSettings(pomodoro: AppSettings["features"]["pomodoro"]): boolean {
  return pomodoro.mode === "pomodoro" && pomodoro.flowRatio === 5;
}

function isDefaultWaterSettings(water: AppSettings["features"]["waterReminder"]): boolean {
  return water.enabled === true && water.mode === "smart" && water.intervalMin === 60 && water.goalMl === 2000 && water.glassMl === 250 && water.startHour === 8 && water.endHour === 21;
}

async function migrateLegacySettings(initial: AppSettings): Promise<AppSettings> {
  const legacySound = readLegacySoundSettings();
  const legacyTimer = readLegacyTimerSettings();
  const legacyWater = readLegacyWaterSettings();

  const hasLegacySound = legacySound !== null;
  const hasLegacyTimer = legacyTimer.mode !== null || legacyTimer.flowRatio !== null;

  if (!hasLegacySound && !hasLegacyTimer && !legacyWater) {
    return initial;
  }

  const soundNeedsMigration = hasLegacySound && isDefaultSoundSettings(initial.features.sound);

  const timerNeedsMigration = hasLegacyTimer && isDefaultPomodoroSettings(initial.features.pomodoro);

  const waterNeedsMigration = legacyWater !== null && isDefaultWaterSettings(initial.features.waterReminder);

  const next: AppSettings = {
    ...initial,
    features: {
      ...initial.features,
      sound:
        soundNeedsMigration && legacySound
          ? {
              volume: legacySound.volume,
              pomodoro: legacySound.sounds.pomodoro,
              water: legacySound.sounds.water,
              task: legacySound.sounds.task,
              message: legacySound.sounds.message,
              repeat: legacySound.repeat,
            }
          : initial.features.sound,
      pomodoro: timerNeedsMigration
        ? {
            ...initial.features.pomodoro,
            ...(legacyTimer.mode !== null ? { mode: legacyTimer.mode } : {}),
            ...(legacyTimer.flowRatio !== null ? { flowRatio: legacyTimer.flowRatio } : {}),
          }
        : initial.features.pomodoro,
      waterReminder:
        waterNeedsMigration && legacyWater
          ? {
              ...initial.features.waterReminder,
              ...legacyWater,
            }
          : initial.features.waterReminder,
    },
  };

  const hasChanges = soundNeedsMigration || timerNeedsMigration || waterNeedsMigration;

  // Simpan seluruh perubahan migrasi dalam satu operasi.
  // Jika gagal, fungsi akan throw dan legacy tidak dibersihkan.
  const saved = hasChanges ? await saveSettings(next) : initial;

  // Pusat sudah valid dan menjadi sumber kebenaran.
  // Bersihkan setiap kategori secara independen.
  if (hasLegacySound) {
    clearLegacySoundSettings();
  }

  if (hasLegacyTimer) {
    clearLegacyTimerSettings();
  }

  // Jangan hapus notchboo.water karena masih menyimpan riwayat minum.
  return saved;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = useRef<AppSettings | null>(null);
  const lastSaved = useRef<AppSettings | null>(null);
  const loadedRef = useRef(false);

  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingWrites = useRef(0);
  const pendingRemote = useRef<AppSettings | null>(null);

  const apply = useCallback((next: AppSettings) => {
    latest.current = next;
    setSettings(next);
  }, []);

  const persist = useCallback(
    (snapshot: AppSettings) => {
      pendingWrites.current += 1;
      setSaving(true);
      setError(null);

      saveQueue.current = saveQueue.current
        .catch(() => {
          // Kegagalan sebelumnya tidak menghentikan antrean.
        })
        .then(async () => {
          try {
            const saved = await saveSettings(snapshot);

            // Selalu perbarui snapshot terakhir yang berhasil disimpan.
            lastSaved.current = saved;

            if (latest.current && JSON.stringify(latest.current) === JSON.stringify(snapshot)) {
              apply(saved);
            }
          } catch (reason) {
            setError(getErrorMessage(reason));

            console.error("[Settings] Failed to save settings:", reason);

            // Rollback hanya jika tidak ada perubahan lebih baru.
            if (latest.current && JSON.stringify(latest.current) === JSON.stringify(snapshot) && lastSaved.current) {
              apply(lastSaved.current);
            }
          } finally {
            pendingWrites.current = Math.max(0, pendingWrites.current - 1);

            if (pendingWrites.current === 0) {
              setSaving(false);

              const remote = pendingRemote.current;
              pendingRemote.current = null;

              if (remote) {
                lastSaved.current = remote;
                apply(remote);
              }
            }
          }
        });
    },
    [apply],
  );

  const updateSettings = useCallback(
    (updater: (current: AppSettings) => AppSettings) => {
      const current = latest.current;

      if (!current) {
        console.warn("[Settings] Update ignored because settings are not loaded.");
        return;
      }

      const next = updater(current);

      apply(next);
      persist(next);
    },
    [apply, persist],
  );

  const replaceSettings = useCallback(
    (next: AppSettings) => {
      if (!latest.current) {
        return;
      }

      apply(next);
      persist(next);
    },
    [apply, persist],
  );

  const reloadSettings = useCallback(async () => {
    try {
      const result = await loadSettings();

      if (pendingWrites.current > 0) {
        pendingRemote.current = result;
        return;
      }

      lastSaved.current = result;
      apply(result);
      setError(null);
    } catch (reason) {
      setError(getErrorMessage(reason));

      console.error("[Settings] Failed to reload settings:", reason);
    }
  }, [apply]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    async function initialize() {
      // Daftarkan listener sebelum initial load.
      try {
        unlisten = await onSettingsChanged((remote) => {
          if (!active) {
            return;
          }
          if (!loadedRef.current || pendingWrites.current > 0) {
            pendingRemote.current = remote;
            return;
          }

          lastSaved.current = remote;
          apply(remote);
        });
      } catch (reason) {
        console.error("[Settings] Failed to register event listener:", reason);
      }

      if (!active) {
        unlisten?.();
        return;
      }

      try {
        const initial = await loadSettings();

        if (!active) {
          return;
        }

        let resolved = initial;
        let migrationFailed = false;

        try {
          resolved = await migrateLegacySettings(initial);
        } catch (reason) {
          migrationFailed = true;

          console.error("[Settings] Legacy settings migration failed:", reason);
        }

        if (!active) {
          return;
        }

        const remote = pendingRemote.current;
        pendingRemote.current = null;
        const initialSettings = remote ?? resolved;

        lastSaved.current = initialSettings;
        apply(initialSettings);

        loadedRef.current = true;
        setLoaded(true);

        if (migrationFailed) {
          setError("Migrasi pengaturan lama gagal. Data lama tetap dipertahankan.");
        } else {
          setError(null);
        }
      } catch (reason) {
        if (active) {
          setError(getErrorMessage(reason));

          console.error("[Settings] Failed to initialize settings:", reason);
        }
      }
    }

    void initialize();

    return () => {
      active = false;
      unlisten?.();
    };
  }, [apply]);

  const value: SettingsContextValue = {
    settings,
    loaded,
    saving,
    error,
    updateSettings,
    replaceSettings,
    reloadSettings,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
