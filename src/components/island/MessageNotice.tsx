import { motion } from "motion/react";

import { NOTICE_DURATION_MS, type MessageNotice as Notice } from "../../hooks/useMessageNotice";

import { MOCHI_CREAM, MochiBody } from "./Mochi";

const SOURCES: Record<string, { label: string; color: string }> = {
  whatsapp: { label: "WhatsApp", color: "#25d366" },
  instagram: { label: "Instagram", color: "#e1306c" },
};

const FALLBACK_SOURCE = {
  label: "Pesan",
  color: "#c8e63c",
};

const SPARKLE_COUNT = 6;
const SPARKLE_RADIUS = 34;

const SPARKLE_PATH = "M0 -5 C0.6 -1.6 1.6 -0.6 5 0 C1.6 0.6 0.6 1.6 0 5 C-0.6 1.6 -1.6 0.6 -5 0 C-1.6 -0.6 -0.6 -1.6 0 -5Z";

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
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 -ml-1.5 -mt-1.5 h-3 w-3"
            initial={{
              x: 0,
              y: 0,
              scale: 0,
              opacity: 0,
              rotate: 0,
            }}
            animate={{
              x: Math.cos(angle) * SPARKLE_RADIUS,
              y: Math.sin(angle) * SPARKLE_RADIUS,
              scale: [0, 1.2, 0],
              opacity: [0, 1, 0],
              rotate: 90,
            }}
            transition={{
              duration: 0.8,
              delay: 0.1 + index * 0.045,
              ease: "easeOut",
            }}
          >
            <path d={SPARKLE_PATH} fill={index % 2 === 0 ? MOCHI_CREAM : "#ffffff"} />
          </motion.svg>
        );
      })}
    </>
  );
}

/**
 * Message Notice
 * Mochi melompat dan bergoyang kegirangan ketika pesan masuk.
 */
export default function MessageNotice({ notice }: { notice: Notice }) {
  const source = SOURCES[notice.app] ?? FALLBACK_SOURCE;

  return (
    <div className="relative flex h-full w-full items-center gap-3.5 overflow-hidden px-5 py-2">
      {/* MOCHI CHARACTER */}
      <div className="relative flex h-[100px] w-[100px] shrink-0 items-center justify-center">
        {/* Soft glow */}
        <motion.div
          className="absolute inset-1 rounded-full bg-[#f6e7cb]/10 blur-2xl"
          initial={{
            opacity: 0,
            scale: 0.5,
          }}
          animate={{
            opacity: [0, 0.8, 0.4],
            scale: [0.5, 1.3, 1],
          }}
          transition={{
            duration: 0.9,
            ease: "easeOut",
          }}
        />

        {/* Sparkles */}
        <Sparkles />

        {/* Happy bouncing Mochi */}
        <motion.div
          className="relative z-10 h-[94px] w-[94px]"
          style={{
            transformOrigin: "50% 90%",
          }}
          initial={{
            scale: 0.5,
            rotate: 0,
            y: 12,
          }}
          animate={{
            y: [12, -17, 0, -10, 0, -5, 0, -2, 0],
            rotate: [0, -13, 11, -9, 7, -5, 3, -2, 0],
            scaleX: [1.06, 1.4, 1.175, 1.35, 1.2, 1.3, 1.25],
            scaleY: [1.06, 1.025, 1.4, 1.125, 1.35, 1.2, 1.25],
          }}
          transition={{
            y: {
              duration: 1.15,
              times: [0, 0.13, 0.25, 0.38, 0.5, 0.63, 0.76, 0.88, 1],
              ease: "easeOut",
            },
            rotate: {
              duration: 1.15,
              ease: "easeInOut",
            },
            scaleX: {
              duration: 1.15,
              ease: "easeInOut",
            },
            scaleY: {
              duration: 1.15,
              ease: "easeInOut",
            },
          }}
        >
          <MochiBody happy className="h-full w-full overflow-visible drop-shadow-[0_4px_8px_rgba(0,0,0,0.25)]" />
        </motion.div>
      </div>

      {/* MESSAGE CONTENT */}
      <motion.div
        className="flex min-w-0 flex-1 flex-col justify-center gap-1"
        style={{
          transformOrigin: "left center",
        }}
        initial={{
          opacity: 0,
          x: -14,
          scale: 0.94,
        }}
        animate={{
          opacity: 1,
          x: 0,
          scale: 1,
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 22,
          delay: 0.25,
        }}
      >
        {/* Application source */}
        <div className="flex min-w-0 items-center gap-1.5">
          <motion.span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: source.color,
            }}
            initial={{
              scale: 0,
            }}
            animate={{
              scale: [0, 1.3, 1],
            }}
            transition={{
              delay: 0.35,
              duration: 0.35,
            }}
          />

          <span
            className="truncate text-[10px] font-bold uppercase tracking-[0.13em]"
            style={{
              color: source.color,
            }}
          >
            {source.label}
          </span>

          <span className="text-[10px] text-white/30">•</span>

          <span className="text-[10px] font-medium text-white/35">New message</span>
        </div>

        {/* Sender */}
        <span className="truncate text-[13px] font-bold leading-tight tracking-wide text-white">{notice.sender}</span>

        {/* Message body */}
        <span className="line-clamp-2 break-words text-[11px] leading-[1.45] text-white/65">{notice.body}</span>
      </motion.div>

      {/* PROGRESS BAR */}
      <motion.div
        className="absolute bottom-0 left-5 right-5 h-[2px] overflow-hidden rounded-full bg-white/[0.08]"
        initial={{
          opacity: 0,
        }}
        animate={{
          opacity: 1,
        }}
        transition={{
          delay: 0.3,
          duration: 0.2,
        }}
      >
        <motion.div
          className="h-full origin-left rounded-full"
          style={{
            backgroundColor: source.color,
            boxShadow: `0 0 8px ${source.color}55`,
          }}
          initial={{
            scaleX: 1,
          }}
          animate={{
            scaleX: 0,
          }}
          transition={{
            duration: NOTICE_DURATION_MS / 1000,
            ease: "linear",
            delay: 0.3,
          }}
        />
      </motion.div>
    </div>
  );
}
