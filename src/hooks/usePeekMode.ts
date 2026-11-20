import { useSettings } from "./useSettings";
import type { PeekBehavior } from "../lib/settings";

/**
 * `whenBusy`: bersembunyi saat aplikasi lain aktif.
 * `always`: selalu bersembunyi saat island tidak dibuka.
 * `standby`: island selalu terbuka.
 */
export type PeekMode = PeekBehavior;

/**
 * Mengambil peek behavior dari centralized settings.
 * Perubahan dari tray diterima melalui SettingsProvider.
 */
export function usePeekMode(): PeekMode {
  const { settings } = useSettings();

  return settings?.appearance.island.peekBehavior ?? "whenBusy";
}
