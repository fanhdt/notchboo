import { useEffect, useRef } from "react";

import { ALARM_REPEAT_MS, type AlarmKind } from "../lib/sound";
import { useSoundSettings } from "./useSoundSettings";
import { useTasks } from "./useTasks";
import { useWaterReminder } from "./useWaterReminder";

/** Halaman island yang dibuka otomatis saat alarm berbunyi. */
export type AlarmPage = "water" | "tasks";

/** Memutar suara saat `active` menjadi true, lalu mengulanginya (jika `repeat`) sampai `active` false. */
function useRingingSound(active: boolean, kind: AlarmKind, repeat: boolean, play: (kind: AlarmKind) => void, key: string | null = null) {
  useEffect(() => {
    if (!active) return;

    play(kind);
    if (!repeat) return;

    const timer = setInterval(() => play(kind), ALARM_REPEAT_MS);
    return () => clearInterval(timer);
  }, [active, kind, repeat, play, key]);
}

/**
 * Menyatukan alarm island: pengaturan suara, pengingat minum, dan pengingat tugas.
 * Saat sebuah alarm berbunyi, hook ini memutar suaranya lalu memanggil `onAlert`
 * supaya island membuka halaman yang sesuai.
 */
export function useIslandAlarms(onAlert: (page: AlarmPage) => void, pomodoroAlerting: boolean) {
  const sound = useSoundSettings();
  const water = useWaterReminder();
  const tasks = useTasks();

  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;

  const { play } = sound;
  const { repeat } = sound.settings;
  const dueTaskId = tasks.due?.task.id ?? null;

  // Suara berbunyi selama alarmnya belum dijawab.
  useRingingSound(water.due, "water", repeat, play);
  useRingingSound(dueTaskId !== null, "task", repeat, play, dueTaskId);
  useRingingSound(pomodoroAlerting, "pomodoro", repeat, play);

  useEffect(() => {
    if (water.due) onAlertRef.current("water");
  }, [water.due]);

  useEffect(() => {
    if (dueTaskId !== null) onAlertRef.current("tasks");
  }, [dueTaskId]);

  return {
    sound,
    water,
    tasks,
    play,
    /** Ada alarm yang menunggu dijawab. Island tidak boleh menutup sendiri selama ini true. */
    anyDue: water.due || tasks.due !== null,
  };
}
