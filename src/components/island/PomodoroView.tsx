import ControlButton from "./ControlButton";

export type PomodoroPhase = "focus" | "break";

export const PHASE_MS: Record<PomodoroPhase, number> = {
  focus: 25 * 60_000,
  break: 5 * 60_000,
};

const PHASE_LABEL: Record<PomodoroPhase, string> = { focus: "Fokus", break: "Istirahat" };

export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

type Props = {
  phase: PomodoroPhase;
  remainingMs: number;
  running: boolean;
  alerting: boolean;
  onToggle: () => void;
  onReset: () => void;
  onSkip: () => void;
};

export default function PomodoroView({ phase, remainingMs, running, alerting, onToggle, onReset, onSkip }: Props) {
  const percent = (1 - remainingMs / PHASE_MS[phase]) * 100;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <span className={`text-[11px] font-medium ${alerting ? "animate-pulse text-[#c8e63c]" : "text-white/60"}`}>{alerting ? `Selesai · lanjut ${PHASE_LABEL[phase].toLowerCase()}` : PHASE_LABEL[phase]}</span>

      <div className="flex items-center justify-between">
        <span className="text-[28px] font-semibold leading-none tabular-nums">{formatClock(remainingMs)}</span>

        <div className="flex items-center">
          <ControlButton label="Atur ulang" onPress={onReset}>
            <path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" />
          </ControlButton>
          <ControlButton label={running ? "Jeda" : "Mulai"} onPress={onToggle}>
            {running ? <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /> : <path d="M8 5v14l11-7z" />}
          </ControlButton>
          <ControlButton label="Lewati" onPress={onSkip}>
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </ControlButton>
        </div>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full bg-white transition-[width] duration-200 ease-linear" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
