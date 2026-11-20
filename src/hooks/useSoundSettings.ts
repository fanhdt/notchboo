import { useCallback } from "react";

import { useSettings } from "./useSettings";
import { playSound, type AlarmKind, type AlarmSound } from "../lib/sound";

export interface SoundSettingsApi {
  settings: {
    volume: number;
    sounds: Record<AlarmKind, AlarmSound>;
    repeat: boolean;
  };
  setVolume: (volume: number) => void;
  setRepeat: (repeat: boolean) => void;
  setSound: (kind: AlarmKind, sound: AlarmSound) => void;
  play: (kind: AlarmKind) => void;
}

export function useSoundSettings(): SoundSettingsApi {
  const { settings: appSettings, updateSettings, loaded } = useSettings();

  const soundSettings = appSettings?.features.sound;

  const settings = {
    volume: soundSettings?.volume ?? 0.7,
    sounds: {
      pomodoro: soundSettings?.pomodoro ?? "beep",
      water: soundSettings?.water ?? "chime",
      task: soundSettings?.task ?? "bell",
      message: soundSettings?.message ?? "pop",
    },
    repeat: soundSettings?.repeat ?? true,
  };

  const setVolume = useCallback(
    (volume: number) => {
      if (!loaded) return;

      const normalized = Math.min(1, Math.max(0, volume));

      updateSettings((current) => ({
        ...current,
        features: {
          ...current.features,
          sound: {
            ...current.features.sound,
            volume: normalized,
          },
        },
      }));
    },
    [loaded, updateSettings],
  );

  const setRepeat = useCallback(
    (repeat: boolean) => {
      if (!loaded) return;

      updateSettings((current) => ({
        ...current,
        features: {
          ...current.features,
          sound: {
            ...current.features.sound,
            repeat,
          },
        },
      }));
    },
    [loaded, updateSettings],
  );

  const setSound = useCallback(
    (kind: AlarmKind, sound: AlarmSound) => {
      if (!loaded) return;

      updateSettings((current) => ({
        ...current,
        features: {
          ...current.features,
          sound: {
            ...current.features.sound,
            [kind]: sound,
          },
        },
      }));
    },
    [loaded, updateSettings],
  );

  const play = useCallback(
    (kind: AlarmKind) => {
      playSound(settings.sounds[kind], settings.volume);
    },
    [settings.sounds, settings.volume],
  );

  return {
    settings,
    setVolume,
    setRepeat,
    setSound,
    play,
  };
}
