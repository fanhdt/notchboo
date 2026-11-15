import { motion } from "motion/react";
import { useState, type MouseEvent, type ReactNode } from "react";

import { WATER_GLASS_SIZES_ML, WATER_GOALS_ML, WATER_INTERVALS_MIN, WATER_SNOOZE_MIN, type WaterReminder } from "../../hooks/useWaterReminder";
import { MochiBody, MOCHI_CREAM, type Face } from "./Mochi";

const WATER_COLOR = "#7dd3fc";
const BLUSH = "#f2a7a0";
const DONE_COLOR = "#c8e63c";

const numberFormat = new Intl.NumberFormat("id-ID");
const fmtMl = (ml: number) => numberFormat.format(Math.round(ml));
const fmtTime = (t: number) => new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
const fmtLiters = (ml: number) => `${(ml / 1000).toFixed(1).replace(".", ",")} L`;

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
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Pengingat berbunyi: selalu tampilkan layar jawab, walau pengaturan sedang terbuka.
  if (settingsOpen && !water.due) return <Settings water={water} onBack={() => setSettingsOpen(false)} />;

  return <Tracker water={water} onOpenSettings={() => setSettingsOpen(true)} />;
}

// ---------------------------------------------------------------------------
// TRACKER
// ---------------------------------------------------------------------------

function Tracker({ water, onOpenSettings }: { water: WaterReminder; onOpenSettings: () => void }) {
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
  if (!enabled) footnote = "Pengingat mati";
  else if (status === "done") footnote = "Pengingat berhenti hari ini";
  else if (nextAt === null) footnote = "Tidak ada pengingat lagi hari ini";
  else footnote = `Pengingat berikutnya ± ${fmtTime(nextAt)}`;

  return (
    <div role={due ? "alert" : undefined} className="flex h-full w-full items-center gap-3">
      <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
        <Ring percent={percent} color={color} />

        <motion.div className="absolute inset-0 m-auto h-10 w-10" animate={{ scaleY: [1, 1.06, 1], scaleX: [1, 0.98, 1] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: "50% 100%" }}>
          <MochiBody face={face} className="h-full w-full" />
        </motion.div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            {due && (
              <div className="truncate text-sm font-semibold leading-tight" style={{ color: WATER_COLOR }}>
                Waktunya minum!
              </div>
            )}
            <div className="truncate text-base font-semibold leading-tight tabular-nums">
              {fmtMl(totalMl)} <span className="text-[11px] font-medium text-white/50">/ {fmtMl(goalMl)} ml</span>
            </div>
          </div>

          {!due && (
            <button type="button" onClick={press(onOpenSettings)} aria-label="Pengaturan minum" title="Pengaturan" className="shrink-0 rounded-full p-1 text-white/45 transition-colors hover:bg-white/10 hover:text-white/80">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
              </svg>
            </button>
          )}
        </div>

        <span className="w-fit rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none" style={{ color: statusColor, backgroundColor: `${statusColor}26` }}>
          {statusText}
        </span>

        {!due && <span className="truncate text-[10px] leading-none text-white/45">{footnote}</span>}

        <div className="flex items-center gap-1">
          <button type="button" onClick={press(() => water.drink())} className="flex-1 rounded-full bg-sky-300 px-2 py-1.5 text-[11px] font-semibold leading-none text-black transition-opacity hover:opacity-90 active:opacity-75">
            +{glassMl} ml
          </button>

          {due ? (
            <button type="button" onClick={press(water.snooze)} className="shrink-0 rounded-full bg-white/10 px-2.5 py-1.5 text-[11px] leading-none text-white/80 transition-colors hover:bg-white/20">
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
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] leading-none text-white/70 transition-colors hover:bg-white/20 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-white/10"
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
        animate={{ pathLength: Math.max(percent, 1) / 100, stroke: color }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// PENGATURAN
// ---------------------------------------------------------------------------

function Settings({ water, onBack }: { water: WaterReminder; onBack: () => void }) {
  const fixed = water.mode === "fixed";

  return (
    <div className="flex h-full w-full flex-col justify-center gap-1.5 overflow-y-auto py-1">
      <div className="flex items-center justify-between">
        <button type="button" onClick={press(onBack)} className="rounded-full px-1.5 py-0.5 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white">
          ← Pengaturan
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={water.enabled}
          aria-label="Pengingat minum"
          onClick={press(() => water.setEnabled(!water.enabled))}
          className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${water.enabled ? "bg-sky-300" : "bg-white/20"}`}
        >
          <span className={`absolute top-0.5 h-3 w-3 rounded-full transition-all ${water.enabled ? "left-3.5 bg-black" : "left-0.5 bg-white/70"}`} />
        </button>
      </div>

      <Row label="Target">
        {WATER_GOALS_ML.map((ml) => (
          <Chip key={ml} active={water.baseGoalMl === ml} onClick={() => water.setGoalMl(ml)}>
            {fmtLiters(ml)}
          </Chip>
        ))}
        <Chip active={water.hot} onClick={() => water.setHot(!water.hot)} title="Hari panas atau olahraga: target hari ini +500 ml">
          Panas +500
        </Chip>
      </Row>

      <Row label="Mode">
        <Chip active={!fixed} onClick={() => water.setMode("smart")} title="Hanya mengingatkan saat tertinggal dari target">
          Cerdas
        </Chip>
        <Chip active={fixed} onClick={() => water.setMode("fixed")} title="Mengingatkan tiap beberapa menit">
          Tetap
        </Chip>
        {fixed && (
          <Chip active onClick={() => water.setIntervalMin(nextOf(WATER_INTERVALS_MIN, water.intervalMin))} title="Ketuk untuk ganti jeda">
            {water.intervalMin} mnt
          </Chip>
        )}
      </Row>

      <Row label="Jam">
        <HourStepper label="Mulai" value={water.startHour} min={0} max={20} onChange={(hour) => water.setActiveHours(hour, water.endHour)} />
        <span className="text-[10px] text-white/40">–</span>
        <HourStepper label="Selesai" value={water.endHour} min={water.startHour + 4} max={24} onChange={(hour) => water.setActiveHours(water.startHour, hour)} />
      </Row>

      <p className="text-[9px] leading-tight text-white/35">Panduan umum, bukan saran medis. Jika dokter membatasi cairanmu, matikan pengingat.</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-9 shrink-0 text-[10px] text-white/45">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={press(onClick)}
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium leading-none transition-colors ${active ? "bg-white/25 text-white" : "bg-white/10 text-white/55 hover:bg-white/20 hover:text-white/80"}`}
    >
      {children}
    </button>
  );
}

function HourStepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const buttonClass = "flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[10px] leading-none text-white/70 transition-colors hover:bg-white/20 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-white/10";

  return (
    <div className="flex items-center gap-0.5">
      <button type="button" aria-label={`${label} lebih awal`} disabled={value <= min} onClick={press(() => onChange(value - 1))} className={buttonClass}>
        ‹
      </button>
      <span className="w-5 text-center text-[11px] tabular-nums text-white/80">{String(value).padStart(2, "0")}</span>
      <button type="button" aria-label={`${label} lebih lambat`} disabled={value >= max} onClick={press(() => onChange(value + 1))} className={buttonClass}>
        ›
      </button>
    </div>
  );
}
