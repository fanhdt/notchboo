import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

type DiskStats = { usedBytes: number; totalBytes: number };
type NetworkStats = { downBytesPerSec: number; upBytesPerSec: number };
type BatteryStats = { percent: number; charging: boolean; onAc: boolean };

/** Sama dengan struct `SystemStats` di Rust. */
export type SystemStats = {
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  disk: DiskStats | null;
  network: NetworkStats;
  battery: BatteryStats | null;
};

/**
 * Sampel sistem dari Rust, hanya selama komponen yang memakainya terpasang.
 *
 * Listener didaftarkan sebelum monitoring dinyalakan agar sampel pertama tidak terlewat.
 * Cleanup menangani listener yang belum selesai didaftarkan dan memastikan monitoring
 * kembali mati jika proses inisialisasi selesai setelah komponen dilepas.
 *
 * `null` sampai sampel pertama tiba.
 */
export function useSystemStats(): SystemStats | null {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    const initialize = async () => {
      try {
        const stop = await listen<SystemStats>("system-stats", (event) => {
          if (!active) return;
          setStats(event.payload);
        });

        // Komponen mungkin sudah dilepas ketika listener selesai didaftarkan.
        if (!active) {
          stop();
          return;
        }

        unlisten = stop;

        // Nyalakan monitoring hanya setelah listener siap.
        await invoke("set_monitoring", { enabled: true });

        // Pastikan monitoring mati jika cleanup terjadi ketika invoke masih berjalan.
        if (!active) {
          await invoke("set_monitoring", { enabled: false });
        }
      } catch (error) {
        if (active) {
          console.error("Gagal menginisialisasi system monitoring:", error);
        }
      }
    };

    void initialize();

    return () => {
      active = false;

      unlisten?.();
      unlisten = null;

      invoke("set_monitoring", { enabled: false }).catch(console.error);
    };
  }, []);

  return stats;
}
