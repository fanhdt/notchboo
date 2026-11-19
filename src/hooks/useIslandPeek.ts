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
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const animations: Array<{ stop: () => void }> = [];

    const startAnimation = (target: number) => {
      if (cancelled) return;
      animations.push(animate(y, target, SPRING));
    };

    if (!peeking) {
      startAnimation(0);
    } else {
      const hiddenY = -(compactHeight - PEEK_VISIBLE_PX);

      startAnimation(hiddenY);

      const scheduleNextPeek = () => {
        if (cancelled) return;

        const wait = PEEK_MIN_WAIT_MS + Math.random() * (PEEK_MAX_WAIT_MS - PEEK_MIN_WAIT_MS);

        timers.push(
          setTimeout(() => {
            if (cancelled) return;

            startAnimation(hiddenY + PEEK_OUT_PX);

            timers.push(
              setTimeout(() => {
                if (cancelled) return;

                startAnimation(hiddenY);
                scheduleNextPeek();
              }, PEEK_HOLD_MS),
            );
          }, wait),
        );
      };

      scheduleNextPeek();
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      animations.forEach((animation) => animation.stop());
    };
  }, [peeking, compactHeight, y]);

  return y;
}
