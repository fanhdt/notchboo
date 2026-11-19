import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

export interface MessageNotice {
  /** Naik tiap pesan baru, supaya animasi dimulai ulang meski isinya sama. */
  key: number;
  app: string;
  sender: string;
  body: string;
}

type Payload = Omit<MessageNotice, "key">;

/** Berapa lama pesan ditampilkan sebelum island kembali seperti semula. */
export const NOTICE_DURATION_MS = 6500;

/** Pesan masuk dari Rust (event `message-notification`). Pesan baru menggantikan yang sedang tampil. */
export function useMessageNotice() {
  const [notice, setNotice] = useState<MessageNotice | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    const initialize = async () => {
      try {
        const stopListening = await listen<Payload>("message-notification", (event) => {
          if (!active) return;

          counter.current += 1;
          setNotice({ ...event.payload, key: counter.current });
        });

        if (!active) {
          stopListening();
          return;
        }

        unlisten = stopListening;
      } catch (error) {
        if (active) {
          console.error("Gagal memasang listener notifikasi:", error);
        }
      }
    };

    void initialize();

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (notice === null) return;

    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const dismiss = useCallback(() => setNotice(null), []);

  return { notice, dismiss };
}
