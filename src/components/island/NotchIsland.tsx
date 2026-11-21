import { AnimatePresence, motion } from "motion/react";
import { memo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { IslandController } from "../../hooks/useIslandController";
import { useIslandGeometry } from "../../hooks/useIslandGeometry";
import { NOTCH_GEOMETRY } from "../../lib/geometry";
import { clipboard } from "../../lib/clipboard";

import ControlButton from "./ControlButton";
import IslandPages from "./IslandPages";
import IslandShape from "./IslandShape";
import MessageNotice from "./MessageNotice";
import Mochi from "./Mochi";
import { formatClock } from "./PomodoroView";

const MemoMochi = memo(Mochi);

const ISLAND_PAGES = ["media", "system", "pomodoro", "water", "tasks", "shelf", "sound"] as const;

type IslandView = (typeof ISLAND_PAGES)[number];

const PAGE_LABELS: Record<IslandView, string> = {
  media: "Media",
  system: "Sistem",
  pomodoro: "Pomodoro",
  water: "Minum",
  tasks: "Tugas",
  shelf: "Quick Shelf",
  sound: "Suara",
};

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

function ArrowButton({ direction, disabled, onClick }: { direction: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={direction === "left" ? "Halaman sebelumnya" : "Halaman berikutnya"}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex h-5 w-5 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-default disabled:opacity-15"
    >
      <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 fill-none stroke-current ${direction === "left" ? "" : "rotate-180"}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  );
}

export default function NotchIsland({ c }: { c: IslandController }) {
  const { w, h, radius, ear, peekY } = useIslandGeometry(c, NOTCH_GEOMETRY);
  const { notice, state, view, direction, timer } = c;

  const [utilitiesOpen, setUtilitiesOpen] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const skipNextClick = useRef(false);

  const currentIndex = ISLAND_PAGES.indexOf(view);
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < ISLAND_PAGES.length - 1;

  const navigate = (offset: number) => {
    const nextIndex = currentIndex + offset;

    if (nextIndex < 0 || nextIndex >= ISLAND_PAGES.length) return;

    c.selectPage(ISLAND_PAGES[nextIndex]);
    setUtilitiesOpen(false);
  };

  const openSettings = () => {
    setUtilitiesOpen(false);

    void invoke("settings_open_window").catch((error) => {
      console.error("Gagal membuka Settings:", error);
    });
  };

  const openClipboard = () => {
    setUtilitiesOpen(false);

    void clipboard.openWindow().catch((error) => {
      console.error("Gagal membuka Clipboard Manager:", error);
    });
  };

  const handleIslandClick = () => {
    if (skipNextClick.current) {
      skipNextClick.current = false;
      return;
    }

    if (utilitiesOpen) {
      setUtilitiesOpen(false);
      return;
    }

    c.handleClick();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    if (target.closest("button, a, input, textarea, select, [data-no-swipe]")) {
      swipeStart.current = null;
      return;
    }

    swipeStart.current = {
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!swipeStart.current) return;

    const deltaX = event.clientX - swipeStart.current.x;
    const deltaY = event.clientY - swipeStart.current.y;

    swipeStart.current = null;

    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3) {
      return;
    }

    const offset = deltaX < 0 ? 1 : -1;
    const nextIndex = currentIndex + offset;

    if (nextIndex < 0 || nextIndex >= ISLAND_PAGES.length) return;

    skipNextClick.current = true;
    navigate(offset);
  };

  return (
    <main className="flex h-full w-full items-start justify-center">
      <motion.div onClick={handleIslandClick} style={{ width: w, height: h, y: peekY }} className="relative flex cursor-pointer select-none items-center justify-center text-white">
        <IslandShape width={w} height={h} radius={radius} ear={ear} />

        <div className="relative z-10 h-full w-full overflow-hidden" style={{ clipPath: "inset(0 12px 0 12px)" }}>
          {notice ? (
            <MessageNotice key={notice.key} notice={notice} />
          ) : state === "compact" ? (
            <div className="flex h-full w-full items-center justify-center gap-2">
              <MemoMochi peeking={c.peeking} />

              {timer.running && <span className="text-[11px] font-medium tabular-nums text-[#c8e63c]">{formatClock(timer.remainingMs)}</span>}
            </div>
          ) : (
            <>
              {/* PAGE NAVIGATION */}
              <div className="absolute inset-x-0 top-1 z-20 flex items-center justify-center">
                <div className="flex items-center gap-1">
                  <ArrowButton direction="left" disabled={!canGoPrevious} onClick={() => navigate(-1)} />

                  <span className="min-w-[65px] text-center text-[10px] font-medium text-white/80">{PAGE_LABELS[view]}</span>

                  <ArrowButton direction="right" disabled={!canGoNext} onClick={() => navigate(1)} />
                </div>
              </div>

              {/* PAGE INDICATOR */}
              <div className="absolute inset-x-0 top-[27px] z-20 flex justify-center gap-1">
                {ISLAND_PAGES.map((page) => (
                  <span key={page} className={`rounded-full transition-all duration-200 ${page === view ? "h-1 w-3 bg-white/85" : "h-1 w-1 bg-white/25"}`} />
                ))}
              </div>

              {/* UTILITY MENU */}
              <div className="absolute right-7 top-1 z-30" data-no-swipe onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  title="Utilitas"
                  aria-label="Buka utilitas"
                  aria-expanded={utilitiesOpen}
                  onClick={() => setUtilitiesOpen((value) => !value)}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                    <circle cx="5" cy="12" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="19" cy="12" r="1.8" />
                  </svg>
                </button>

                {utilitiesOpen && (
                  <div className="absolute right-0 top-full mt-1 w-40 overflow-hidden rounded-lg border border-white/10 bg-[#111113]/95 p-1 shadow-xl shadow-black/40 backdrop-blur-xl">
                    <button type="button" onClick={openClipboard} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-white/70 hover:bg-white/10 hover:text-white">
                      <span className="text-[10px] font-medium">Clipboard</span>
                    </button>

                    <button type="button" onClick={openSettings} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-white/70 hover:bg-white/10 hover:text-white">
                      <span className="text-[10px] font-medium">Pengaturan</span>
                    </button>
                  </div>
                )}
              </div>

              {/* LYRICS CONTROL */}
              {view === "media" && c.hasLyrics && (
                <div className="absolute bottom-2 right-8 z-20" data-no-swipe>
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

              {/* PAGE CONTENT */}
              <div
                className="relative h-full w-full touch-pan-y"
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => {
                  swipeStart.current = null;
                }}
              >
                <AnimatePresence initial={false} custom={direction} mode="wait">
                  <motion.div
                    key={view}
                    custom={direction}
                    variants={PAGE_VARIANTS}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="absolute bottom-0 left-6 right-6 top-9 flex items-center justify-center"
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
