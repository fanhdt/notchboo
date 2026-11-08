import { animate, useMotionValue, type MotionValue } from "motion/react";
import { useEffect } from "react";

/** Bagian island yang tetap terlihat di tepi atas layar saat bersembunyi (piksel). */
export const PEEK_VISIBLE_PX = 5;

/** Seberapa jauh island turun saat mengintip (piksel). */
const PEEK_OUT_PX = 14;
/** Berapa lama island bertahan dalam posisi mengintip. */
const PEEK_HOLD_MS = 1600;
/** Jeda acak antar intipan. */
const PEEK_MIN_WAIT_MS = 7000;
const PEEK_MAX_WAIT_MS = 14000;

const SPRING = { type: "spring", stiffness: 260, damping: 24 } as const;

/**
 * Posisi vertikal island untuk mode peek.
 *
 * `peeking` true: island naik sampai hanya `PEEK_VISIBLE_PX` yang terlihat, lalu sesekali turun
 * sedikit (mengintip) dan naik lagi. `peeking` false: island kembali ke posisi normal (0).
 */
export function useIslandPeek(peeking: boolean, compactHeight: number): MotionValue<number> {
  const y = useMotionValue(0);

  useEffect(() => {
    if (!peeking) {
      animate(y, 0, SPRING);
      return;
    }

    const hiddenY = -(compactHeight - PEEK_VISIBLE_PX);
    animate(y, hiddenY, SPRING);

    const timers: ReturnType<typeof setTimeout>[] = [];

    const scheduleNextPeek = () => {
      const wait = PEEK_MIN_WAIT_MS + Math.random() * (PEEK_MAX_WAIT_MS - PEEK_MIN_WAIT_MS);

      timers.push(
        setTimeout(() => {
          animate(y, hiddenY + PEEK_OUT_PX, SPRING);

          timers.push(
            setTimeout(() => {
              animate(y, hiddenY, SPRING);
              scheduleNextPeek();
            }, PEEK_HOLD_MS),
          );
        }, wait),
      );
    };

    scheduleNextPeek();

    return () => timers.forEach(clearTimeout);
  }, [peeking, compactHeight, y]);

  return y;
}
