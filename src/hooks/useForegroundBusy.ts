import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

/** True selama ada aplikasi lain yang aktif di depan (bukan desktop/taskbar dan bukan Notchboo sendiri). */
export function useForegroundBusy(): boolean {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    let eventReceived = false;
    let unlisten: (() => void) | undefined;

    const initialize = async () => {
      try {
        // Pasang listener sebelum mengambil status awal agar perubahan tidak terlewat.
        const stopListening = await listen<boolean>("foreground-busy", (event) => {
          eventReceived = true;

          if (active) {
            setBusy(event.payload);
          }
        });

        if (!active) {
          stopListening();
          return;
        }

        unlisten = stopListening;

        const initialBusy = await invoke<boolean>("get_foreground_busy");

        // Jangan menimpa status terbaru jika event sudah diterima.
        if (active && !eventReceived) {
          setBusy(initialBusy);
        }
      } catch (error) {
        if (active) {
          console.error("Gagal menginisialisasi foreground status:", error);
        }
      }
    };

    void initialize();

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return busy;
}
