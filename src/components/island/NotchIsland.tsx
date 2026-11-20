import { AnimatePresence, motion } from "motion/react";
import { memo } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { IslandController } from "../../hooks/useIslandController";
import { useIslandGeometry } from "../../hooks/useIslandGeometry";
import { NOTCH_GEOMETRY } from "../../lib/geometry";

import ControlButton from "./ControlButton";
import IslandNav from "./IslandNav";
import IslandPages from "./IslandPages";
import IslandShape from "./IslandShape";
import MessageNotice from "./MessageNotice";
import Mochi from "./Mochi";
import { formatClock } from "./PomodoroView";

// Mochi hanya bergantung pada `peeking`. Tanpa memo, ia ikut dirender ulang setiap island
// dirender (mis. tiap detik saat timer berjalan) padahal tampilannya tidak berubah.
const MemoMochi = memo(Mochi);

// Animasi geser antar halaman.
const PAGE_VARIANTS = {
  enter: (direction: number) => ({
    x: direction * 36,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction * -36,
    opacity: 0,
  }),
};

/** Dynamic Island yang menempel di tepi atas layar. */
export default function NotchIsland({ c }: { c: IslandController }) {
  const { w, h, radius, ear, peekY } = useIslandGeometry(c, NOTCH_GEOMETRY);

  const { notice, state, view, direction, timer } = c;

  const openSettings = () => {
    invoke("settings_open_window").catch((error) => {
      console.error("Gagal membuka Settings:", error);
    });
  };

  return (
    <main className="flex h-full w-full items-start justify-center">
      <motion.div
        onClick={c.handleClick}
        style={{
          width: w,
          height: h,
          y: peekY,
        }}
        className="relative flex cursor-pointer select-none items-center justify-center text-white"
      >
        {/* ISLAND BACKGROUND */}
        <IslandShape width={w} height={h} radius={radius} ear={ear} />

        {/* CONTENT */}
        <div
          className="relative z-10 h-full w-full overflow-hidden"
          style={{
            clipPath: "inset(0 12px 0 12px)",
          }}
        >
          {/* MESSAGE NOTICE */}
          {notice ? (
            <MessageNotice key={notice.key} notice={notice} />
          ) : state === "compact" ? (
            /* COMPACT MODE */
            <div className="flex h-full w-full items-center justify-center gap-2">
              <MemoMochi peeking={c.peeking} />

              {timer.running && <span className="text-[11px] font-medium tabular-nums text-[#c8e63c]">{formatClock(timer.remainingMs)}</span>}
            </div>
          ) : (
            /* EXPANDED MODE */
            <>
              {/* TOP NAVIGATION */}
              <div className="absolute inset-x-0 top-1.5 z-20 flex items-center justify-center">
                <IslandNav current={view} onSelect={c.selectPage} onSettings={openSettings} />
              </div>

              {/* LYRICS MODE BUTTON */}
              {view === "media" && c.hasLyrics && (
                <div className="absolute bottom-2 right-8 z-20">
                  {c.lyricMode === "side" ? (
                    <ControlButton label="Lirik di atas kontrol" onPress={() => c.setLyricMode("inline")}>
                      <path d="M4 4h16v2H4zm3 4h10v2H7zm-3 6h16v6H4z" />
                    </ControlButton>
                  ) : (
                    <ControlButton label="Lirik di samping" onPress={() => c.setLyricMode("side")}>
                      <path d="M3 4h8v16H3zm10 2h8v2h-8zm0 4h8v2h-8zm0 4h8v2h-8z" />
                    </ControlButton>
                  )}
                </div>
              )}

              {/* PAGE TRANSITION */}
              <div className="relative h-full w-full">
                <AnimatePresence initial={false} custom={direction} mode="wait">
                  <motion.div
                    key={view}
                    custom={direction}
                    variants={PAGE_VARIANTS}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                      duration: 0.18,
                      ease: "easeOut",
                    }}
                    className="absolute bottom-0 left-6 right-6 top-8 flex items-center justify-center"
                  >
                    <IslandPages c={c} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </main>
  );
}
