import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

/**
 * `whenBusy`: bersembunyi saat aplikasi lain aktif. `always`: selalu bersembunyi saat island tidak dibuka.
 * `standby`: island selalu terbuka.
 */
export type PeekMode = "whenBusy" | "always" | "standby";

/** Mode peek yang dipilih lewat menu ikon tray. Berubah langsung saat menu diklik. */
export function usePeekMode(): PeekMode {
  const [mode, setMode] = useState<PeekMode>("whenBusy");

  useEffect(() => {
    let active = true;

    invoke<PeekMode>("get_peek_mode")
      .then((value) => {
        if (active) setMode(value);
      })
      .catch(console.error);

    const unlisten = listen<PeekMode>("peek-mode-changed", (event) => setMode(event.payload));

    return () => {
      active = false;
      unlisten.then((stop) => stop());
    };
  }, []);

  return mode;
}
