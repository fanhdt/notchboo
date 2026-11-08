import type { MouseEvent } from "react";

import { WATER_GOAL, WATER_INTERVALS_MIN, type WaterReminder } from "../../hooks/useWaterReminder";
import { formatClock } from "./PomodoroView";

const DROP_PATH = "M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8";

function Drop({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 fill-current ${className}`} aria-hidden="true">
      <path d={DROP_PATH} />
    </svg>
  );
}

/** Klik di island biasa menutup island; tombol di halaman ini tidak boleh ikut memicunya. */
function press(action: () => void) {
  return (event: MouseEvent) => {
    event.stopPropagation();
    action();
  };
}

export default function WaterView({ water }: { water: WaterReminder }) {
  const { enabled, intervalMin, count, remainingMs, due } = water;

  if (due) {
    return (
      <div role="alert" className="flex w-full flex-col items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-sky-300">
          <Drop className="h-4 w-4" />
          Waktunya minum!
        </div>
        <span className="text-[11px] text-white/50">
          {count}/{WATER_GOAL} gelas hari ini
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={press(water.drink)} className="rounded-full bg-sky-300 px-3.5 py-1.5 text-[11px] font-semibold text-black transition-opacity hover:opacity-90 active:opacity-75">
            Sudah minum
          </button>
          <button type="button" onClick={press(water.snooze)} className="rounded-full bg-white/10 px-3.5 py-1.5 text-[11px] text-white/80 transition-colors hover:bg-white/20">
            Nanti 5 mnt
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-white/80">
          <span className="text-sky-300">
            <Drop />
          </span>
          <span className="tabular-nums">
            {count}/{WATER_GOAL} gelas
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={press(water.undo)}
            disabled={count === 0}
            title="Kurangi satu gelas"
            aria-label="Kurangi satu gelas"
            className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80 transition-colors hover:bg-white/20 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-white/10"
          >
            −
          </button>
          <button type="button" onClick={press(water.drink)} title="Catat satu gelas" aria-label="Tambah satu gelas" className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80 transition-colors hover:bg-white/20">
            +1
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Pengingat minum"
            onClick={press(() => water.setEnabled(!enabled))}
            className={`relative h-4 w-7 rounded-full transition-colors ${enabled ? "bg-sky-300" : "bg-white/20"}`}
          >
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-black transition-all ${enabled ? "left-3.5" : "left-0.5 bg-white/70"}`} />
          </button>
        </div>
      </div>

      <div className="text-center text-2xl font-semibold tabular-nums">{enabled && remainingMs !== null ? formatClock(remainingMs) : <span className="text-white/35">Mati</span>}</div>

      <div className="flex justify-center gap-1">
        {WATER_INTERVALS_MIN.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={press(() => water.setIntervalMin(minutes))}
            aria-pressed={intervalMin === minutes}
            className={`rounded-full px-2.5 py-0.5 text-[10px] transition-colors ${intervalMin === minutes ? "bg-white/20 text-white" : "text-white/45 hover:bg-white/10 hover:text-white/80"}`}
          >
            {minutes} mnt
          </button>
        ))}
      </div>
    </div>
  );
}
