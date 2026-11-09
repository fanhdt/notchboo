import { motion } from "motion/react";

import { NOTICE_DURATION_MS, type MessageNotice as Notice } from "../../hooks/useMessageNotice";

/** Ukuran island saat menampilkan pesan. */
export const NOTICE_SIZE = { width: 340, height: 104 } as const;

const EYE_COLOR = "#c8e63c";

/** Nama dan warna label tiap aplikasi sumber pesan. */
const SOURCES: Record<string, { label: string; color: string }> = {
  whatsapp: { label: "WhatsApp", color: "#25d366" },
  instagram: { label: "Instagram", color: "#e1306c" },
};
const FALLBACK_SOURCE = { label: "Pesan", color: "#c8e63c" };

const SPARKLE_COUNT = 6;
const SPARKLE_RADIUS = 30;
// Bintang empat sudut.
const SPARKLE_PATH = "M0 -5 C0.6 -1.6 1.6 -0.6 5 0 C1.6 0.6 0.6 1.6 0 5 C-0.6 1.6 -1.6 0.6 -5 0 C-1.6 -0.6 -0.6 -1.6 0 -5Z";

const POP = { type: "spring", stiffness: 380, damping: 14 } as const;

/** Mata senang (^ ^): Bangboo sedang memamerkan sesuatu. */
function HappyEyes() {
  const common = { stroke: EYE_COLOR, strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

  return (
    <svg viewBox="0 0 100 40" aria-hidden="true" className="h-6 w-auto overflow-visible">
      <path d="M18 24 Q30 8 42 24" {...common} />
      <path d="M58 24 Q70 8 82 24" {...common} />
    </svg>
  );
}

/** Ledakan bintang kecil saat Bangboo muncul. */
function Sparkles() {
  return (
    <>
      {Array.from({ length: SPARKLE_COUNT }, (_, index) => {
        const angle = (index / SPARKLE_COUNT) * Math.PI * 2 - Math.PI / 2;

        return (
          <motion.svg
            key={index}
            viewBox="-6 -6 12 12"
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 h-3 w-3"
            initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
            animate={{ x: Math.cos(angle) * SPARKLE_RADIUS, y: Math.sin(angle) * SPARKLE_RADIUS, scale: [0, 1.2, 0], opacity: [1, 1, 0], rotate: 90 }}
            transition={{ duration: 0.75, delay: 0.12 + index * 0.03, ease: "easeOut" }}
          >
            <path d={SPARKLE_PATH} fill={index % 2 === 0 ? EYE_COLOR : "#ffffff"} />
          </motion.svg>
        );
      })}
    </>
  );
}

/**
 * Pesan masuk: Bangboo melompat keluar dengan mata senang dan bintang-bintang kecil,
 * lalu "menunjukkan" pesannya kepada pemilik, seperti saat Bangboo memamerkan buff.
 * Di-key per pesan oleh pemanggil, jadi tiap pesan baru memulai animasi dari awal.
 */
export default function MessageNotice({ notice }: { notice: Notice }) {
  const source = SOURCES[notice.app] ?? FALLBACK_SOURCE;

  return (
    <div className="relative flex h-full w-full items-center gap-3 px-6 pb-3 pt-3">
      {/* Bangboo */}
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
        <Sparkles />

        <motion.div
          className="flex h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-white/8"
          initial={{ scale: 0, rotate: -24, y: 14 }}
          animate={{ scale: 1, rotate: 0, y: [14, -10, 0, -5, 0] }}
          transition={{ scale: POP, rotate: POP, y: { duration: 0.9, times: [0, 0.35, 0.6, 0.8, 1], ease: "easeOut" } }}
        >
          <motion.div animate={{ scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 0.18, delay: 1.6, times: [0, 0.4, 0.7, 1] }}>
            <HappyEyes />
          </motion.div>
        </motion.div>
      </div>

      {/* Pesan, keluar dari sisi Bangboo */}
      <motion.div
        className="flex min-w-0 flex-1 flex-col gap-0.5"
        style={{ transformOrigin: "left center" }}
        initial={{ opacity: 0, x: -18, scaleX: 0.7 }}
        animate={{ opacity: 1, x: 0, scaleX: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.28 }}
      >
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: source.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: source.color }} />
          {source.label}
        </span>
        <span className="truncate text-sm font-semibold text-white">{notice.sender}</span>
        <span className="line-clamp-2 wrap-break-word text-xs leading-snug text-white/70">{notice.body}</span>
      </motion.div>

      {/* Sisa waktu tampil */}
      <motion.div className="absolute bottom-1.5 left-6 right-6 h-0.5 origin-left rounded-full bg-white/20" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: NOTICE_DURATION_MS / 1000, ease: "linear" }} />
    </div>
  );
}
