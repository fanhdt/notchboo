import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { MochiBody, MOCHI_CREAM, type Face } from "./Mochi";

const BLUSH = "#f2a7a0";
const ANGER = "#ef7b6c";

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

type Level = "ok" | "warn" | "hot";

type Metric = {
  key: string;
  label: string;
  /** Label pendek untuk tombol. */
  short: string;
  value: string;
  detail: string;
  /** null = tidak punya "persen penuh" (jaringan). */
  percent: number | null;
  level: Level;
  status: string;
  face: Face;
};

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function percentOf(part: number, total: number) {
  return total > 0 ? clampPercent((part / total) * 100) : 0;
}

function gb(bytes: number) {
  const value = bytes / BYTES_PER_GB;
  return value >= 100 ? Math.round(value).toString() : value.toFixed(1);
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

function levelOf(percent: number): Level {
  if (percent >= 90) return "hot";
  if (percent >= 70) return "warn";
  return "ok";
}

function faceForLoad(percent: number): Face {
  if (percent < 40) return "happy";
  if (percent < 70) return "neutral";
  if (percent < 90) return "surprised";
  return "angry";
}

const LEVEL_COLOR: Record<Level, string> = {
  ok: MOCHI_CREAM,
  warn: BLUSH,
  hot: ANGER,
};

const LOAD_STATUS: Record<Level, string> = {
  ok: "Santai",
  warn: "Sibuk",
  hot: "Penuh!",
};

function buildMetrics(stats: SystemStats | null): Metric[] {
  const cpu = stats ? clampPercent(stats.cpuPercent) : 0;
  const ram = stats ? percentOf(stats.memoryUsedBytes, stats.memoryTotalBytes) : 0;
  const disk = stats?.disk ? percentOf(stats.disk.usedBytes, stats.disk.totalBytes) : 0;
  const battery = stats?.battery ?? null;

  const metrics: Metric[] = [
    {
      key: "cpu",
      label: "CPU",
      short: "CPU",
      value: stats ? `${Math.round(cpu)}%` : "—",
      detail: "Beban prosesor",
      percent: cpu,
      level: stats ? levelOf(cpu) : "ok",
      status: LOAD_STATUS[levelOf(cpu)],
      face: stats ? faceForLoad(cpu) : "sleepy",
    },
    {
      key: "ram",
      label: "RAM",
      short: "RAM",
      value: stats ? `${Math.round(ram)}%` : "—",
      detail: stats ? `${gb(stats.memoryUsedBytes)} / ${gb(stats.memoryTotalBytes)} GB` : "",
      percent: ram,
      level: stats ? levelOf(ram) : "ok",
      status: LOAD_STATUS[levelOf(ram)],
      face: stats ? faceForLoad(ram) : "sleepy",
    },
    {
      key: "disk",
      label: "Disk",
      short: "Disk",
      value: stats?.disk ? `${Math.round(disk)}%` : "—",
      detail: stats?.disk ? `${gb(stats.disk.usedBytes)} / ${gb(stats.disk.totalBytes)} GB` : "",
      percent: disk,
      level: stats?.disk ? levelOf(disk) : "ok",
      status: LOAD_STATUS[levelOf(disk)],
      face: stats?.disk ? faceForLoad(disk) : "sleepy",
    },
  ];

  if (battery) {
    const low = !battery.charging && battery.percent <= 20;
    const mid = !battery.charging && battery.percent <= 40;
    metrics.push({
      key: "battery",
      label: "Baterai",
      short: "Bat",
      value: `${battery.percent}%`,
      detail: battery.charging ? "Sedang mengisi" : battery.onAc ? "Terhubung ke listrik" : "Memakai baterai",
      percent: battery.percent,
      level: low ? "hot" : mid ? "warn" : "ok",
      status: battery.charging ? "Mengisi" : low ? "Tipis!" : mid ? "Menurun" : "Aman",
      face: battery.charging ? "excited" : low ? "sad" : "happy",
    });
  }

  const net = stats?.network;
  const netTotal = net ? net.downBytesPerSec + net.upBytesPerSec : 0;
  metrics.push({
    key: "network",
    label: "Jaringan",
    short: "Net",
    value: net ? `↓ ${formatRate(net.downBytesPerSec)}` : "—",
    detail: net ? `↑ ${formatRate(net.upBytesPerSec)}` : "",
    percent: null,
    level: "ok",
    status: netTotal > 50 * 1024 ? "Aktif" : "Tenang",
    face: netTotal > 5 * 1024 * 1024 ? "excited" : netTotal > 50 * 1024 ? "curious" : "neutral",
  });

  return metrics;
}

export default function SystemView({ stats }: { stats: SystemStats | null }) {
  const [activeKey, setActiveKey] = useState("cpu");

  const metrics = buildMetrics(stats);
  const foundIndex = metrics.findIndex((m) => m.key === activeKey);
  const index = foundIndex === -1 ? 0 : foundIndex;
  const metric = metrics[index];
  const color = LEVEL_COLOR[metric.level];

  // Penting: tanpa stopPropagation, klik naik ke island dan malah menutupnya.
  function select(event: React.MouseEvent, key: string) {
    event.stopPropagation();
    setActiveKey(key);
  }

  function cycle(event: React.MouseEvent) {
    event.stopPropagation();
    setActiveKey(metrics[(index + 1) % metrics.length].key);
  }

  return (
    <div className="flex h-full w-full items-center gap-2.5">
      {/* Kiri + tengah: ketuk untuk ganti ke metrik berikutnya */}
      <div onClick={cycle} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
        <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
          <Ring percent={metric.percent} color={color} />

          <motion.div className="absolute inset-0 m-auto h-10 w-10" animate={{ scaleY: [1, 1.06, 1], scaleX: [1, 0.98, 1] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: "50% 100%" }}>
            <MochiBody face={metric.face} className="h-full w-full" />
          </motion.div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={metric.key} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.14, ease: "easeOut" }} className="flex min-w-0 flex-col">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-medium text-[#f6e7cb]/70">{metric.label}</span>
              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none" style={{ color, backgroundColor: `${color}26` }}>
                {metric.status}
              </span>
            </div>

            <span className="truncate text-2xl font-semibold leading-tight tabular-nums text-[#f6e7cb]">{metric.value}</span>

            <span className="h-4 truncate text-xs leading-4 tabular-nums text-[#f6e7cb]/60">{metric.detail}</span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Kanan: tombol pemilih metrik */}
      <div role="tablist" aria-label="Pilih metrik" className="flex w-[46px] shrink-0 flex-col gap-0.5">
        {metrics.map((m) => {
          const active = m.key === metric.key;

          return (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={(event) => select(event, m.key)}
              className={`flex h-[18px] w-full cursor-pointer items-center gap-1 rounded-md px-1.5 text-[10px] font-medium leading-none transition-colors duration-150 ${
                active ? "bg-[#f6e7cb]/20 text-[#f6e7cb] ring-1 ring-[#f6e7cb]/30" : "text-[#f6e7cb]/50 hover:bg-[#f6e7cb]/10 hover:text-[#f6e7cb]/80"
              }`}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-300" style={{ backgroundColor: LEVEL_COLOR[m.level], opacity: m.level === "ok" ? 0.35 : 1 }} />
              <span className="truncate">{m.short}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const RING_SIZE = 62;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;

function Ring({ percent, color }: { percent: number | null; color: string }) {
  const center = RING_SIZE / 2;
  // Jaringan tidak punya persen: cincin penuh tapi redup.
  const progress = percent === null ? 1 : Math.max(percent, 1) / 100;

  return (
    <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="-rotate-90">
      <circle cx={center} cy={center} r={RING_RADIUS} fill="none" stroke={MOCHI_CREAM} strokeOpacity={0.15} strokeWidth={RING_STROKE} />
      <motion.circle
        cx={center}
        cy={center}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        pathLength={1}
        initial={false}
        animate={{ pathLength: progress, stroke: color, opacity: percent === null ? 0.35 : 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </svg>
  );
}
