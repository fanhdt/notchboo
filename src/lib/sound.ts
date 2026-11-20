// Suara alarm. Semua nada disintesis dengan Web Audio, jadi tidak butuh file audio.

export type AlarmKind = "pomodoro" | "water" | "task" | "message";
export type AlarmSound = "beep" | "chime" | "bell" | "digital" | "pop" | "off";

export const ALARM_KINDS: { id: AlarmKind; label: string }[] = [
  { id: "pomodoro", label: "Pomodoro" },
  { id: "water", label: "Minum" },
  { id: "task", label: "Tugas" },
  { id: "message", label: "Pesan" },
];

export const ALARM_SOUNDS: { id: AlarmSound; label: string }[] = [
  { id: "beep", label: "Bip" },
  { id: "chime", label: "Denting" },
  { id: "bell", label: "Lonceng" },
  { id: "digital", label: "Digital" },
  { id: "pop", label: "Pop" },
  { id: "off", label: "Senyap" },
];

export interface SoundSettings {
  /** 0..1 */
  volume: number;
  sounds: Record<AlarmKind, AlarmSound>;
  /** Bunyikan ulang suara alarm sampai alarm dijawab. */
  repeat: boolean;
}

/** Jeda antar pengulangan suara alarm. */
export const ALARM_REPEAT_MS = 6000;

/**
 * Membaca preferensi suara dari penyimpanan lama.
 * Mengembalikan null jika key tidak ada atau datanya rusak.
 */
export function readLegacySoundSettings(): SoundSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    return loadSoundSettings();
  } catch {
    return null;
  }
}

/**
 * Menghapus preferensi lama setelah migrasi berhasil.
 */
export function clearLegacySoundSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("[Settings] Gagal menghapus legacy sound settings:", error);
  }
}

const STORAGE_KEY = "notchboo.sound";

const DEFAULTS: SoundSettings = {
  volume: 0.7,
  sounds: { pomodoro: "beep", water: "chime", task: "bell", message: "pop" },
  repeat: true,
};

function normalizeVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULTS.volume;
  }

  return Math.min(1, Math.max(0, value));
}

function isSound(value: unknown): value is AlarmSound {
  return ALARM_SOUNDS.some((sound) => sound.id === value);
}

export function loadSoundSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;

    const parsed = JSON.parse(raw) as {
      volume?: unknown;
      sounds?: Partial<Record<AlarmKind, unknown>>;
      repeat?: unknown;
    };

    const pick = (kind: AlarmKind): AlarmSound => {
      const value = parsed.sounds?.[kind];
      return isSound(value) ? value : DEFAULTS.sounds[kind];
    };

    const repeat = typeof parsed.repeat === "boolean" ? parsed.repeat : DEFAULTS.repeat;

    return {
      volume: normalizeVolume(parsed.volume),
      sounds: {
        pomodoro: pick("pomodoro"),
        water: pick("water"),
        task: pick("task"),
        message: pick("message"),
      },
      repeat,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveSoundSettings(settings: SoundSettings) {
  try {
    const normalized: SoundSettings = {
      ...settings,
      volume: normalizeVolume(settings.volume),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Penyimpanan tidak tersedia: pengaturan hanya berlaku selama aplikasi berjalan.
  }
}

/** Memutar satu suara. `volume` 0..1. Tidak melakukan apa pun untuk "off" atau volume 0. */

/** Memutar satu suara. `volume` 0..1. Tidak melakukan apa pun untuk "off" atau volume 0. */
export function playSound(sound: AlarmSound, volume: number) {
  const normalizedVolume = normalizeVolume(volume);

  if (sound === "off" || normalizedVolume <= 0) return;

  let ctx: AudioContext | undefined;

  const play = async () => {
    try {
      ctx = new AudioContext();

      const audioContext = ctx;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      if (audioContext.state !== "running") {
        await audioContext.close();
        return;
      }

      const t0 = audioContext.currentTime;

      const master = audioContext.createGain();
      master.gain.value = normalizedVolume * 0.3;
      master.connect(audioContext.destination);

      const tone = (frequency: number, start: number, duration: number, type: OscillatorType = "sine", peak = 1) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc.type = type;
        osc.frequency.value = frequency;

        gain.gain.setValueAtTime(0.0001, t0 + start);
        gain.gain.exponentialRampToValueAtTime(peak, t0 + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + duration);

        osc.connect(gain).connect(master);
        osc.start(t0 + start);
        osc.stop(t0 + start + duration + 0.05);
      };

      let total = 0.7;

      switch (sound) {
        case "beep":
          tone(880, 0, 0.6);
          break;

        case "chime":
          tone(1047, 0, 0.7);
          tone(1319, 0.18, 0.9);
          total = 1.2;
          break;

        case "bell":
          tone(660, 0, 1.6);
          tone(1320, 0, 1.0, "sine", 0.4);
          tone(1850, 0, 0.6, "sine", 0.2);
          total = 1.7;
          break;

        case "digital":
          [0, 0.18, 0.36].forEach((start) => tone(1000, start, 0.1, "square", 0.5));
          total = 0.6;
          break;

        case "pop":
          tone(740, 0, 0.12);
          tone(988, 0.09, 0.22);
          total = 0.5;
          break;
      }

      window.setTimeout(
        () => {
          if (audioContext.state !== "closed") {
            void audioContext.close().catch(() => {});
          }
        },
        (total + 0.3) * 1000,
      );
    } catch (error) {
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => {});
      }

      console.warn("[Sound] Gagal memutar audio:", error);
    }
  };

  void play();
}
