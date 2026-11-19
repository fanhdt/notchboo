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
 * Memasang hook ini menyalakan monitoring di Rust, melepasnya mematikan lagi. Karena state-nya
 * lokal, sampel yang datang tiap detik hanya me-render komponen pemakainya, bukan seluruh island.
 * `null` sampai sampel pertama tiba.
 */
export function useSystemStats(): SystemStats | null {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    const unlisten = listen<SystemStats>("system-stats", (event) => setStats(event.payload));
    invoke("set_monitoring", { enabled: true }).catch(console.error);

    return () => {
      unlisten.then((stop) => stop());
      invoke("set_monitoring", { enabled: false }).catch(console.error);
    };
  }, []);

  return stats;
}
