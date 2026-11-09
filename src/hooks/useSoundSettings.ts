import { useCallback, useRef, useState } from "react";

import { loadSoundSettings, playSound, saveSoundSettings, type AlarmKind, type AlarmSound, type SoundSettings } from "../lib/sound";

export interface SoundSettingsApi {
  settings: SoundSettings;
  setVolume: (volume: number) => void;
  setRepeat: (repeat: boolean) => void;
  /** Mengganti suara satu jenis alarm dan langsung memutarnya sebagai contoh. */
  setSound: (kind: AlarmKind, sound: AlarmSound) => void;
  /** Memutar suara jenis alarm tersebut dengan pengaturan saat ini. */
  play: (kind: AlarmKind) => void;
}

export function useSoundSettings(): SoundSettingsApi {
  const [settings, setSettings] = useState<SoundSettings>(loadSoundSettings);

  // Ref menjaga `play` selalu memakai pengaturan terbaru tanpa berubah identitas.
  const latest = useRef(settings);
  latest.current = settings;

  const commit = useCallback((next: SoundSettings) => {
    latest.current = next;
    setSettings(next);
    saveSoundSettings(next);
  }, []);

  const setVolume = useCallback((volume: number) => commit({ ...latest.current, volume: Math.min(1, Math.max(0, volume)) }), [commit]);

  const setRepeat = useCallback((repeat: boolean) => commit({ ...latest.current, repeat }), [commit]);

  const setSound = useCallback(
    (kind: AlarmKind, sound: AlarmSound) => {
      const next = { ...latest.current, sounds: { ...latest.current.sounds, [kind]: sound } };
      commit(next);
      playSound(sound, next.volume);
    },
    [commit],
  );

  const play = useCallback((kind: AlarmKind) => {
    const current = latest.current;
    playSound(current.sounds[kind], current.volume);
  }, []);

  return { settings, setVolume, setRepeat, setSound, play };
}
