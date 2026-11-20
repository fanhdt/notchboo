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

/** Preview suara alarm dengan layout compact. */
export default function SoundView({ sound }: { sound: SoundSettingsApi }) {
  const { settings } = sound;

  return (
    <div className="flex w-full flex-col gap-1 py-0.5" onClick={(event) => event.stopPropagation()}>
      {ALARM_KINDS.map((kind) => {
        const label = ALARM_SOUNDS.find((option) => option.id === settings.sounds[kind.id])?.label ?? "Default";

        return (
          <div key={kind.id} className="flex h-6 min-w-0 items-center gap-2">
            <span className="w-16 shrink-0 truncate text-xs font-medium text-white/65">{kind.label}</span>

            <span className="min-w-0 flex-1 truncate text-xs text-white/45">{label}</span>

            <button
              type="button"
              onClick={press(() => sound.play(kind.id))}
              aria-label={`Preview suara ${kind.label}`}
              title={`Putar ${kind.label}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/75 transition-colors hover:bg-white/20 active:bg-white/30"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden="true">
                <path d={PLAY_PATH} />
              </svg>
            </button>
          </div>
        );
      })}

      <p className="mt-0.5 text-[9px] leading-tight text-white/35">Pengaturan suara tersedia di Settings.</p>
    </div>
  );
}
