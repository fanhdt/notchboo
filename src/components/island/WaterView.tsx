import { motion } from "motion/react";
import { type MouseEvent, type ReactNode } from "react";

import { WATER_GLASS_SIZES_ML, WATER_SNOOZE_MIN, type WaterReminder } from "../../hooks/useWaterReminder";
import BreathingMochi from "./BreathingMochi";
import { MOCHI_CREAM, type Face } from "./Mochi";

const WATER_COLOR = "#7dd3fc";
const BLUSH = "#f2a7a0";
const DONE_COLOR = "#c8e63c";

const numberFormat = new Intl.NumberFormat("id-ID");

const fmtMl = (ml: number) => numberFormat.format(Math.round(ml));

const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

/** Klik di island biasa menutup island; tombol di halaman ini tidak boleh ikut memicunya. */
function press(action: () => void) {
  return (event: MouseEvent) => {
    event.stopPropagation();
    action();
  };
}

function nextOf<T>(list: readonly T[], current: T): T {
  return list[(list.indexOf(current) + 1) % list.length];
}

export default function WaterView({ water }: { water: WaterReminder }) {
  return <Tracker water={water} />;
}

function Tracker({ water }: { water: WaterReminder }) {
  const { goalMl, totalMl, glassMl, status, behindMl, slowDown, due, enabled, nextAt, count } = water;

  const percent = goalMl > 0 ? Math.min(100, (totalMl / goalMl) * 100) : 0;

  const color = status === "done" ? DONE_COLOR : status === "behind" ? BLUSH : WATER_COLOR;

  const face: Face = due ? "curious" : slowDown ? "surprised" : status === "done" ? "excited" : status === "behind" ? "pouty" : "happy";

  const glassesBehind = Math.max(1, Math.round(behindMl / glassMl));

  let statusText: string;
  let statusColor = color;

  if (slowDown) {
    statusText = "Pelan-pelan ya";
    statusColor = WATER_COLOR;
  } else if (status === "done") {
    statusText = "Target tercapai";
  } else if (status === "behind") {
    statusText = `Tertinggal ± ${glassesBehind} gelas`;
  } else {
    statusText = "Di jalur ✓";
  }

  let footnote: string;

  if (!enabled) {
    footnote = "Pengingat mati";
  } else if (status === "done") {
    footnote = "Pengingat berhenti hari ini";
  } else if (nextAt === null) {
    footnote = "Tidak ada pengingat lagi hari ini";
  } else {
    footnote = `Pengingat berikutnya ± ${fmtTime(nextAt)}`;
  }

  return (
    <div role={due ? "alert" : undefined} className="flex h-full w-full items-center gap-3">
      <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
        <Ring percent={percent} color={color} />
        <BreathingMochi face={face} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="min-w-0">
          {due && (
            <div className="truncate text-sm font-semibold leading-tight" style={{ color: WATER_COLOR }}>
              Waktunya minum!
            </div>
          )}

          <div className="truncate text-base font-semibold leading-tight tabular-nums">
            {fmtMl(totalMl)} <span className="text-caption font-medium text-white/50">/ {fmtMl(goalMl)} ml</span>
          </div>
        </div>

        <span
          className="w-fit rounded-full px-1.5 py-0.5 text-micro font-semibold leading-none"
          style={{
            color: statusColor,
            backgroundColor: `${statusColor}26`,
          }}
        >
          {statusText}
        </span>

        {!due && <span className="truncate text-micro leading-none text-white/45">{footnote}</span>}

        <div className="flex items-center gap-1">
          <button type="button" onClick={press(() => water.drink())} className="flex-1 rounded-full bg-sky-300 px-2 py-1.5 text-caption font-semibold leading-none text-black transition-opacity hover:opacity-90 active:opacity-75">
            +{glassMl} ml
          </button>

          {due ? (
            <button type="button" onClick={press(water.snooze)} className="shrink-0 rounded-full bg-white/10 px-2.5 py-1.5 text-caption leading-none text-white/80 transition-colors hover:bg-white/20">
              Nanti {WATER_SNOOZE_MIN} mnt
            </button>
          ) : (
            <>
              <IconButton label={`Ukuran minum ${glassMl} ml. Ketuk untuk ganti`} onPress={() => water.setGlassMl(nextOf(WATER_GLASS_SIZES_ML, glassMl))}>
                ⇄
              </IconButton>

              <IconButton label="Batalkan catatan terakhir" onPress={water.undo} disabled={count === 0}>
                ↩
              </IconButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function IconButton({ label, onPress, disabled = false, children }: { label: string; onPress: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={press(onPress)}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-caption leading-none text-white/70 transition-colors hover:bg-white/20 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

const RING_SIZE = 64;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;

function Ring({ percent, color }: { percent: number; color: string }) {
  const center = RING_SIZE / 2;

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
        animate={{
          pathLength: Math.max(percent, 1) / 100,
          stroke: color,
        }}
        transition={{
          type: "spring",
          stiffness: 120,
          damping: 20,
        }}
      />
    </svg>
  );
}
