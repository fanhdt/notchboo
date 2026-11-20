import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { clearLegacySoundSettings, readLegacySoundSettings } from "../lib/sound";
import { clearLegacyTimerSettings, readLegacyTimerSettings } from "../lib/legacyTimerSettings";
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
  return pomodoro.mode === "pomodoro" && pomodoro.flowRatio === 4;
}

async function migrateLegacySettings(initial: AppSettings): Promise<AppSettings> {
  const legacySound = readLegacySoundSettings();
  const legacyTimer = readLegacyTimerSettings();

  const hasLegacySound = legacySound !== null;
  const hasLegacyTimer = legacyTimer.mode !== null || legacyTimer.flowRatio !== null;

  if (!hasLegacySound && !hasLegacyTimer) {
    return initial;
  }

  let migrated = false;

  const next: AppSettings = {
    ...initial,
    features: {
      ...initial.features,
      sound: initial.features.sound,
      pomodoro: initial.features.pomodoro,
    },
  };

  // Migrasikan suara hanya jika konfigurasi pusat masih default.
  if (legacySound && isDefaultSoundSettings(initial.features.sound)) {
    next.features.sound = {
      volume: legacySound.volume,
      pomodoro: legacySound.sounds.pomodoro,
      water: legacySound.sounds.water,
      task: legacySound.sounds.task,
      message: legacySound.sounds.message,
      repeat: legacySound.repeat,
    };

    migrated = true;
  }

  // Migrasikan timer hanya jika konfigurasi pusat masih default.
  if (hasLegacyTimer && isDefaultPomodoroSettings(initial.features.pomodoro)) {
    next.features.pomodoro = {
      ...initial.features.pomodoro,
      ...(legacyTimer.mode !== null ? { mode: legacyTimer.mode } : {}),
      ...(legacyTimer.flowRatio !== null ? { flowRatio: legacyTimer.flowRatio } : {}),
    };

    migrated = true;
  }

  if (migrated) {
    // Simpan seluruh hasil migrasi dalam satu operasi.
    const saved = await saveSettings(next);

    // Hapus data lama hanya setelah penyimpanan berhasil.
    if (hasLegacySound) {
      clearLegacySoundSettings();
    }

    if (hasLegacyTimer) {
      clearLegacyTimerSettings();
    }

    return saved;
  }

  // Konfigurasi pusat sudah memiliki prioritas.
  // Data lama boleh dibersihkan karena tidak digunakan.
  if (hasLegacySound) {
    clearLegacySoundSettings();
  }

  if (hasLegacyTimer) {
    clearLegacyTimerSettings();
  }

  return initial;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = useRef<AppSettings | null>(null);
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

            if (latest.current && JSON.stringify(latest.current) === JSON.stringify(snapshot)) {
              apply(saved);
            }
          } catch (reason) {
            setError(getErrorMessage(reason));

            console.error("[Settings] Failed to save settings:", reason);
          } finally {
            pendingWrites.current = Math.max(0, pendingWrites.current - 1);

            if (pendingWrites.current === 0) {
              setSaving(false);

              const remote = pendingRemote.current;
              pendingRemote.current = null;

              if (remote) {
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

        apply(remote ?? resolved);
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
