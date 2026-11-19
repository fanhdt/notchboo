import type { Layout } from "../hooks/useIslandController";
import type { IslandView } from "../components/island/IslandNav";
import { NOTICE_SIZE } from "../components/island/messageNotice.constants";
type Size = { readonly width: number; readonly height: number };

/** Semua ukuran, bentuk, dan pegas satu gaya island (notch, pill, ...). */
export interface IslandGeometry {
  compact: Size;
  notice: Size;
  expanded: Record<Exclude<IslandView, "media">, Size> & { media: Record<Layout, Size> };
  shape: {
    compact: { readonly radius: number; readonly ear: number };
    expanded: { readonly radius: number; readonly ear: number };
  };
  spring: { type: "spring"; stiffness: number; damping: number };
  /** Pesan masuk: pegas lebih longgar supaya island "melompat" sedikit saat membesar. */
  noticeSpring: { type: "spring"; stiffness: number; damping: number };
}

/** Notch: menempel di tepi atas layar dengan telinga melengkung. */
export const NOTCH_GEOMETRY: IslandGeometry = {
  compact: { width: 150, height: 30 },
  notice: NOTICE_SIZE,
  expanded: {
    media: {
      plain: { width: 290, height: 138 },
      inline: { width: 290, height: 160 },
      side: { width: 380, height: 152 },
    },
    system: { width: 290, height: 138 },
    pomodoro: { width: 290, height: 138 },
    water: { width: 290, height: 158 },
    tasks: { width: 290, height: 176 },
    sound: { width: 290, height: 190 },
    shelf: { width: 400, height: 192 },
  },
  shape: {
    compact: { radius: 11, ear: 8 },
    expanded: { radius: 22, ear: 12 },
  },
  spring: { type: "spring", stiffness: 400, damping: 32 },
  noticeSpring: { type: "spring", stiffness: 320, damping: 17 },
};
