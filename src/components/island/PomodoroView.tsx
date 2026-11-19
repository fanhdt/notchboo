import type { MouseEvent } from "react";

import { FLOW_RATIOS, LONG_SESSION_MS, breakMsFor, type FlowRatio, type TimerMode } from "../../hooks/useFlowmodoro";
import ControlButton from "./ControlButton";

export type PomodoroPhase = "focus" | "break";

export const PHASE_MS: Record<PomodoroPhase, number> = {
  focus: 25 * 60_000,
  break: 5 * 60_000,
};

const PHASE_LABEL: Record<PomodoroPhase, string> = { focus: "Fokus", break: "Istirahat" };

const MODES: TimerMode[] = ["pomodoro", "flow"];
const MODE_LABEL: Record<TimerMode, string> = { pomodoro: "Pomodoro", flow: "Flow" };

const SOFT_WARNING = "#f2a7a0";

export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function minutes(ms: number) {
  return Math.max(1, Math.round(ms / 60_000));
}

type Props = {
  mode: TimerMode;
  /** true saat timer berjalan: mode tidak bisa diganti. */
  modeLocked: boolean;
  phase: PomodoroPhase;
  /** Pomodoro dan istirahat Flow: sisa waktu. Fokus Flow: waktu yang sudah berjalan. */
  remainingMs: number;
  running: boolean;
  alerting: boolean;
  flowRatio: FlowRatio;
  drink?: { glassMl: number; onDrink: () => void };
  breakTotalMs: number;
  onModeChange: (mode: TimerMode) => void;
  onRatioChange: (ratio: FlowRatio) => void;
  onToggle: () => void;
  onReset: () => void;
  onSkip: () => void;
};

export default function PomodoroView({ mode, modeLocked, phase, remainingMs, running, drink, alerting, flowRatio, breakTotalMs, onModeChange, onRatioChange, onToggle, onReset, onSkip }: Props) {
  const flow = mode === "flow";
  const flowFocus = flow && phase === "focus";
  const longSession = flowFocus && remainingMs >= LONG_SESSION_MS;

  const total = flow ? breakTotalMs : PHASE_MS[phase];
  const percent = total > 0 ? Math.min(100, Math.max(0, (1 - remainingMs / total) * 100)) : 0;

  let status: string;
  if (alerting) status = flow ? "Istirahat selesai" : `Selesai · lanjut ${PHASE_LABEL[phase].toLowerCase()}`;
  else if (longSession) status = "Sesi panjang · rehat?";
  else status = PHASE_LABEL[phase];

  const hint = remainingMs < 1000 ? "Tekan ✓ saat fokus pecah" : `Istirahat nanti ≈ ${minutes(breakMsFor(remainingMs, flowRatio))} mnt`;

  const skipLabel = flowFocus ? "Selesai fokus, mulai istirahat" : flow ? "Lewati istirahat" : "Lewati";

  return (
    <div className="flex w-full flex-col gap-1.5">
      {/* Baris 1: pilih mode + status */}
      <div className="flex items-center justify-between gap-2">
        <ModeSwitch mode={mode} locked={modeLocked} onChange={onModeChange} />

        <span className={`min-w-0 truncate text-micro font-medium ${alerting ? "motion-safe:animate-pulse text-accent" : longSession ? "" : "text-white/60"}`} style={longSession && !alerting ? { color: SOFT_WARNING } : undefined}>
          {status}
        </span>
      </div>

      {/* Baris 2: jam + kontrol */}
      <div className="flex items-center justify-between">
        <span className={`${remainingMs >= 3_600_000 ? "text-2xl" : "text-[28px]"} font-semibold leading-none tabular-nums`} style={longSession ? { color: SOFT_WARNING } : undefined}>
          {formatClock(remainingMs)}
        </span>

        <div className="flex items-center">
          <ControlButton label="Atur ulang" onPress={onReset}>
            <path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" />
          </ControlButton>
          <ControlButton label={running ? "Jeda" : "Mulai"} onPress={onToggle}>
            {running ? <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /> : <path d="M8 5v14l11-7z" />}
          </ControlButton>
          <ControlButton label={skipLabel} onPress={onSkip}>
            {flowFocus ? <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /> : <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />}
          </ControlButton>
        </div>
      </div>

      {/* Baris 3: bar progres, atau petunjuk + rasio untuk fokus Flow */}
      <div className="flex h-4 items-center gap-2">
        {flowFocus ? (
          <div className="flex w-full items-center justify-between gap-2">
            <span className="min-w-0 truncate text-micro text-white/50">{hint}</span>
            <RatioChip ratio={flowRatio} onChange={onRatioChange} />
          </div>
        ) : (
          <>
            <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white transition-[width] duration-200 ease-linear" style={{ width: `${percent}%` }} />
            </div>

            {flow && phase === "break" && drink && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  drink?.onDrink();
                }}
                className="shrink-0 cursor-pointer rounded-full bg-sky-300/90 px-2 py-0.5 text-micro font-semibold leading-none text-black transition-opacity hover:opacity-90"
              >
                Minum +{drink?.glassMl} ml
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ModeSwitch({ mode, locked, onChange }: { mode: TimerMode; locked: boolean; onChange: (mode: TimerMode) => void }) {
  return (
    <div role="tablist" aria-label="Mode timer" className={`flex shrink-0 rounded-full bg-white/10 p-0.5 transition-opacity ${locked ? "opacity-50" : ""}`}>
      {MODES.map((m) => {
        const active = m === mode;

        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={locked}
            title={locked ? "Jeda timer dulu untuk ganti mode" : undefined}
            onClick={(event) => {
              // Tanpa ini, klik naik ke island dan menutupnya.
              event.stopPropagation();
              if (!locked) onChange(m);
            }}
            className={`rounded-full px-2 py-0.5 text-micro font-medium leading-none transition-colors ${active ? "bg-white/25 text-white" : "text-white/55"} ${locked ? "cursor-not-allowed" : "cursor-pointer hover:text-white"}`}
          >
            {MODE_LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}

function RatioChip({ ratio, onChange }: { ratio: FlowRatio; onChange: (ratio: FlowRatio) => void }) {
  function cycle(event: MouseEvent) {
    event.stopPropagation();
    onChange(FLOW_RATIOS[(FLOW_RATIOS.indexOf(ratio) + 1) % FLOW_RATIOS.length]);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Rasio istirahat 1/${ratio}. Ketuk untuk ganti`}
      className="shrink-0 cursor-pointer rounded-full bg-white/10 px-2 py-0.5 text-micro font-medium leading-none text-white/80 transition-colors hover:bg-white/20"
    >
      Rasio 1/{ratio}
    </button>
  );
}
