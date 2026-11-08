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

const BYTES_PER_GB = 1024 ** 3;

function formatGb(bytes: number) {
  return (bytes / BYTES_PER_GB).toFixed(1);
}

function formatRate(bytesPerSec: number) {
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = bytesPerSec;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const text = unit === 0 || value >= 100 ? Math.round(value).toString() : value.toFixed(1);
  return `${text} ${units[unit]}`;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function percentOf(part: number, total: number) {
  return total > 0 ? clampPercent((part / total) * 100) : 0;
}

export default function SystemView({ stats }: { stats: SystemStats | null }) {
  const battery = stats?.battery ?? null;

  return (
    // pr-10: ruang untuk tombol pengalih tab di pojok kanan atas.
    <div className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5">
      <StatRow label="CPU" value={stats ? `${Math.round(clampPercent(stats.cpuPercent))}%` : "—"} percent={stats ? clampPercent(stats.cpuPercent) : 0} />

      <StatRow label="RAM" value={stats ? `${formatGb(stats.memoryUsedBytes)} / ${formatGb(stats.memoryTotalBytes)} GB` : "—"} percent={stats ? percentOf(stats.memoryUsedBytes, stats.memoryTotalBytes) : 0} />

      <StatRow label="Disk" value={stats?.disk ? `${formatGb(stats.disk.usedBytes)} / ${formatGb(stats.disk.totalBytes)} GB` : "—"} percent={stats?.disk ? percentOf(stats.disk.usedBytes, stats.disk.totalBytes) : 0} />

      {battery && <StatRow label={battery.charging ? "Baterai · mengisi" : battery.onAc ? "Baterai · terhubung" : "Baterai"} value={`${battery.percent}%`} percent={battery.percent} />}

      {/* Jaringan tidak punya "persen penuh", jadi tanpa bar dan memanjang dua kolom. */}
      <div className="col-span-2 flex items-baseline justify-between">
        <span className="text-xs font-medium text-white/60">Jaringan</span>
        <span className="text-sm font-semibold tabular-nums">{stats ? `↓ ${formatRate(stats.network.downBytesPerSec)}   ↑ ${formatRate(stats.network.upBytesPerSec)}` : "—"}</span>
      </div>
    </div>
  );
}

function StatRow({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-white/60">{label}</span>
        <span className="truncate text-sm font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full bg-white transition-[width] duration-700 ease-out" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
