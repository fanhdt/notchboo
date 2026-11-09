import type { MouseEvent } from "react";

import type { SoundSettingsApi } from "../../hooks/useSoundSettings";
import { ALARM_KINDS, ALARM_SOUNDS } from "../../lib/sound";

const PLAY_PATH = "M8 5v14l11-7z";

function press(action: () => void) {
  return (event: MouseEvent) => {
    event.stopPropagation();
    action();
  };
}

/** Pengaturan suara alarm: satu suara per jenis alarm dan satu volume. */
export default function SoundView({ sound }: { sound: SoundSettingsApi }) {
  const { settings } = sound;

  function cycle(kind: (typeof ALARM_KINDS)[number]["id"]) {
    const current = ALARM_SOUNDS.findIndex((option) => option.id === settings.sounds[kind]);
    const next = ALARM_SOUNDS[(current + 1) % ALARM_SOUNDS.length];
    sound.setSound(kind, next.id);
  }

  return (
    <div className="flex w-full flex-col gap-1.5 py-1" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/80">Suara alarm</span>
        <button
          type="button"
          role="switch"
          aria-checked={settings.repeat}
          onClick={press(() => sound.setRepeat(!settings.repeat))}
          title="Bunyikan ulang sampai alarm dijawab"
          className="flex items-center gap-1.5 text-[10px] text-white/60 transition-colors hover:text-white"
        >
          Ulangi
          <span className={`flex h-3.5 w-6 items-center rounded-full p-0.5 transition-colors ${settings.repeat ? "bg-[#c8e63c]" : "bg-white/20"}`}>
            <span className={`h-2.5 w-2.5 rounded-full bg-black transition-transform ${settings.repeat ? "translate-x-2.5" : "translate-x-0 bg-white/80"}`} />
          </span>
        </button>
      </div>

      {ALARM_KINDS.map((kind) => {
        const label = ALARM_SOUNDS.find((option) => option.id === settings.sounds[kind.id])?.label ?? "";

        return (
          <div key={kind.id} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-white/65">{kind.label}</span>

            <button type="button" onClick={press(() => cycle(kind.id))} title="Klik untuk mengganti suara" className="h-6 min-w-0 flex-1 rounded-md bg-white/10 px-2 text-left text-xs text-white transition-colors hover:bg-white/20">
              {label}
            </button>

            <button
              type="button"
              onClick={press(() => sound.play(kind.id))}
              aria-label={`Putar suara ${kind.label}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden="true">
                <path d={PLAY_PATH} />
              </svg>
            </button>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-xs text-white/65">Volume</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(settings.volume * 100)}
          onChange={(event) => sound.setVolume(Number(event.target.value) / 100)}
          onPointerUp={() => sound.play("pomodoro")}
          aria-label="Volume alarm"
          className="h-1 min-w-0 flex-1 accent-[#c8e63c]"
        />
        <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-white/50">{Math.round(settings.volume * 100)}%</span>
      </div>
    </div>
  );
}
