import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

/**
 * `whenBusy`: bersembunyi saat aplikasi lain aktif.
 * `always`: selalu bersembunyi saat island tidak dibuka.
 * `standby`: island selalu terbuka.
 */
export type PeekMode = "whenBusy" | "always" | "standby";

/** Mode peek yang dipilih lewat menu ikon tray. */
export function usePeekMode(): PeekMode {
  const [mode, setMode] = useState<PeekMode>("whenBusy");

  useEffect(() => {
    let active = true;
    let eventReceived = false;
    let unlisten: (() => void) | undefined;

    const initialize = async () => {
      try {
        // Pasang listener sebelum mengambil nilai awal agar perubahan tidak terlewat.
        const stopListening = await listen<PeekMode>("peek-mode-changed", (event) => {
          eventReceived = true;

          if (active) {
            setMode(event.payload);
          }
        });

        if (!active) {
          stopListening();
          return;
        }

        unlisten = stopListening;

        const initialMode = await invoke<PeekMode>("get_peek_mode");

        // Jangan menimpa mode terbaru jika event sudah diterima.
        if (active && !eventReceived) {
          setMode(initialMode);
        }
      } catch (error) {
        if (active) {
          console.error("Gagal menginisialisasi peek mode:", error);
        }
      }
    };

    void initialize();

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return mode;
}
