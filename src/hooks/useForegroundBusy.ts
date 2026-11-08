import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

/** True selama ada aplikasi lain yang aktif di depan (bukan desktop/taskbar dan bukan Notchboo sendiri). */
export function useForegroundBusy(): boolean {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    invoke<boolean>("get_foreground_busy")
      .then((value) => {
        if (active) setBusy(value);
      })
      .catch(console.error);

    const unlisten = listen<boolean>("foreground-busy", (event) => setBusy(event.payload));

    return () => {
      active = false;
      unlisten.then((stop) => stop());
    };
  }, []);

  return busy;
}
