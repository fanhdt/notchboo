import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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

        const remote = pendingRemote.current;
        pendingRemote.current = null;

        apply(remote ?? initial);
        loadedRef.current = true;
        setLoaded(true);
        setError(null);
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
