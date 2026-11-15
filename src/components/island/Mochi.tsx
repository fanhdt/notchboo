import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion, useSpring } from "motion/react";


/** Warna Mocchi */
export const MOCHI_CREAM = "#f6e7cb";
const BLUSH = "#f2a7a0";
const INK = "#3a2d2a";
const ANGER = "#ef7b6c";
const TEAR = "#a9d6f0";
const EYE_HIGHLIGHT = "#fff8ec";

type Mood = "awake" | "drowsy" | "asleep";

export type Face = "neutral" | "curious" | "happy" | "shy" | "blink" | "sleepy" | "asleep" | "angry" | "surprised" | "sad" | "excited" | "flustered" | "pouty" | "confused";

const DROWSY_AFTER_MS = 20_000;
const SLEEP_AFTER_MS = 35_000;

const GAZE_X = 4;
const GAZE_Y = 2;

type CursorMoved = { dx: number; dy: number };

type EyeKind = "oval" | "small" | "wide" | "huge" | "smile" | "cheer" | "closed" | "droop" | "lidded" | "narrow" | "sad";

type MarkKind = "anger" | "zz" | "exclaim" | "question";

type Expression = {
  left: EyeKind;
  right: EyeKind;
  shift?: [number, number];
  blush: number;
  mark?: MarkKind;
  tear?: boolean;
  bounce?: number;
};

const EXPRESSIONS: Record<Face, Expression> = {
  neutral: {
    left: "oval",
    right: "oval",
    blush: 0,
  },
  curious: {
    left: "wide",
    right: "wide",
    blush: 0.1,
  },
  happy: {
    left: "smile",
    right: "smile",
    blush: 0.3,
  },
  shy: {
    left: "oval",
    right: "oval",
    shift: [1, 1],
    blush: 0.75,
  },
  blink: {
    left: "closed",
    right: "closed",
    blush: 0,
  },
  sleepy: {
    left: "droop",
    right: "droop",
    blush: 0,
  },
  asleep: {
    left: "closed",
    right: "closed",
    blush: 0,
    mark: "zz",
  },
  angry: {
    left: "narrow",
    right: "narrow",
    blush: 0,
    mark: "anger",
  },
  surprised: {
    left: "huge",
    right: "huge",
    blush: 0,
    mark: "exclaim",
  },
  sad: {
    left: "sad",
    right: "sad",
    shift: [1, 1],
    blush: 0,
    tear: true,
  },
  excited: {
    left: "cheer",
    right: "cheer",
    blush: 0.4,
    bounce: 2.4,
  },
  flustered: {
    left: "cheer",
    right: "cheer",
    blush: 0.85,
    bounce: 1.2,
  },
  pouty: {
    left: "lidded",
    right: "lidded",
    blush: 0.3,
  },
  confused: {
    left: "small",
    right: "wide",
    shift: [1, -1.5],
    blush: 0,
    mark: "question",
  },
};

// ---------------------------------------------------------------------------
// EYES
// ---------------------------------------------------------------------------

type EyeProps = {
  kind: EyeKind;
  side: "left" | "right";
  color: string;
};

/**
 * Mata Mocchi.
 * Ukuran mata dibuat lebih besar, bulat, dan ekspresif.
 * Highlight putih memberikan kesan mata yang hidup.
 */
function Eye({ kind, side, color }: EyeProps) {
  const s = side === "left" ? -1 : 1;

  const stroke = {
    stroke: color,
    strokeWidth: 3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };

  const highlight = <circle cx={-1.6} cy={-2.2} r={1.35} fill={EYE_HIGHLIGHT} opacity={0.95} />;

  switch (kind) {
    case "oval":
      return (
        <g>
          <ellipse rx={4.8} ry={5.8} fill={color} />
          {highlight}
        </g>
      );

    case "small":
      return (
        <g>
          <ellipse rx={3.9} ry={4.4} fill={color} />
          <circle cx={-1.2} cy={-1.7} r={1} fill={EYE_HIGHLIGHT} />
        </g>
      );

    case "wide":
      return (
        <g>
          <ellipse rx={5.5} ry={6.7} fill={color} />
          <circle cx={-1.8} cy={-2.7} r={1.7} fill={EYE_HIGHLIGHT} />
        </g>
      );

    case "huge":
      return (
        <g>
          <ellipse rx={6.3} ry={7.5} fill={color} />
          <circle cx={-2} cy={-3} r={2} fill={EYE_HIGHLIGHT} />
          <circle cx={2.1} cy={2.3} r={0.9} fill={EYE_HIGHLIGHT} />
        </g>
      );

    case "smile":
      return <path d="M-5.5 1.8 Q0 -5.8 5.5 1.8" {...stroke} strokeWidth={3.2} />;

    case "cheer":
      return <path d="M-6 2.5 Q0 -7.5 6 2.5" {...stroke} strokeWidth={3.8} />;

    case "closed":
      return <path d="M-5.5 0 H5.5" {...stroke} strokeWidth={3} />;

    case "droop":
      return <path d="M-5.2 0 H5.2 A5.2 3.5 0 0 1 -5.2 0 Z" fill={color} stroke={color} strokeWidth={1.2} />;

    case "lidded":
      return <path d="M-5.2 -1 H5.2 A5.2 4.5 0 0 1 -5.2 -1 Z" fill={color} stroke={color} strokeWidth={1.2} />;

    case "narrow":
      return <ellipse rx={5.5} ry={2.8} fill={color} transform={`rotate(${-s * 20})`} />;

    case "sad":
      return (
        <g>
          <ellipse rx={4.9} ry={5.8} fill={color} transform={`rotate(${s * 17})`} />
          <circle cx={-1.5} cy={-2} r={1.3} fill={EYE_HIGHLIGHT} />
        </g>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// MARKS
// ---------------------------------------------------------------------------

function Mark({ kind, color }: { kind: MarkKind; color: string }) {
  switch (kind) {
    case "zz":
      return (
        <g transform="translate(28 -2)">
          {[0, 1.4].map((delay, index) => (
            <motion.text
              key={index}
              fontSize={index === 0 ? 7 : 5}
              fontWeight={700}
              fill={color}
              initial={{ opacity: 0, x: 0, y: 0 }}
              animate={{
                opacity: [0, 1, 0],
                x: [0, 4],
                y: [0, -8],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 2.8,
                repeat: Infinity,
                delay,
                ease: "easeOut",
              }}
            >
              z
            </motion.text>
          ))}
        </g>
      );

    case "anger":
      return (
        <g transform="translate(30 -7)">
          <motion.g
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 420,
              damping: 14,
            }}
          >
            <motion.g
              animate={{ scale: [1, 1.2, 1] }}
              transition={{
                duration: 0.9,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <path d="M-5 -2 Q-2 -2 -2 -5 M5 -2 Q2 -2 2 -5 M-5 2 Q-2 2 -2 5 M5 2 Q2 2 2 5" stroke={ANGER} strokeWidth={1.8} strokeLinecap="round" fill="none" />
            </motion.g>
          </motion.g>
        </g>
      );

    case "exclaim":
      return (
        <g transform="translate(30 -6)">
          <motion.g
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 420,
              damping: 14,
            }}
          >
            <path d="M0 -5 V1" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
            <circle cy={4.2} r={1.2} fill={color} />
          </motion.g>
        </g>
      );

    case "question":
      return (
        <g transform="translate(30 -6)">
          <motion.g
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 16,
            }}
          >
            <path d="M-2.2 -3 Q-2.2 -5.5 0 -5.5 Q2.4 -5.5 2.4 -3.2 Q2.4 -1.5 0 -0.4 V0.8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cy={4} r={1.1} fill={color} />
          </motion.g>
        </g>
      );
  }
}

// ---------------------------------------------------------------------------
// TEAR
// ---------------------------------------------------------------------------

function Tear() {
  return (
    <motion.path
      d="M0 0 C1.8 2.6 2.2 4 0 5 C-2.2 4 -1.8 2.6 0 0 Z"
      transform="translate(18 3)"
      fill={TEAR}
      initial={{ opacity: 0 }}
      animate={{
        opacity: [0, 0.9, 0],
        y: [0, 4],
      }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 2.2,
        repeat: Infinity,
        ease: "easeIn",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// MOCHI FACE
// ---------------------------------------------------------------------------

export function MochiFace({ face, color, marks = false }: { face: Face; color: string; marks?: boolean }) {
  const spec = EXPRESSIONS[face];
  const [leftShift, rightShift] = spec.shift ?? [0, 0];
  const fade = face === "blink" ? 0.03 : 0.14;

  return (
    <g>
      <motion.g
        animate={{
          y: spec.bounce ? [0, -spec.bounce, 0] : 0,
        }}
        transition={
          spec.bounce
            ? {
                duration: 0.55,
                repeat: Infinity,
                ease: "easeInOut",
              }
            : { duration: 0.2 }
        }
      >
        {/* Blush */}
        <motion.ellipse cx={-23} cy={5} rx={5.5} ry={3.2} fill={BLUSH} initial={false} animate={{ opacity: spec.blush }} transition={{ duration: 0.35 }} />

        <motion.ellipse cx={23} cy={5} rx={5.5} ry={3.2} fill={BLUSH} initial={false} animate={{ opacity: spec.blush }} transition={{ duration: 0.35 }} />

        {/* Eyes */}
        <motion.g
          key={face}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: fade,
            ease: "easeOut",
          }}
          style={{ transformOrigin: "0px 0px" }}
        >
          <g transform={`translate(-14 ${-2 + leftShift})`}>
            <Eye kind={spec.left} side="left" color={color} />
          </g>

          <g transform={`translate(14 ${-2 + rightShift})`}>
            <Eye kind={spec.right} side="right" color={color} />
          </g>
        </motion.g>

        <AnimatePresence>{spec.tear && <Tear key="tear" />}</AnimatePresence>
      </motion.g>

      <AnimatePresence mode="wait">{marks && spec.mark && <Mark key={spec.mark} kind={spec.mark} color={color} />}</AnimatePresence>
    </g>
  );
}

// ---------------------------------------------------------------------------
// MOCHI BODY
// ---------------------------------------------------------------------------

export function MochiBody({ happy = false, face, className }: { happy?: boolean; face?: Face; className?: string }) {
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true" className={className}>
      <ellipse cx={28} cy={51} rx={19} ry={3} fill="#000" opacity={0.25} />

      <path d="M28 8 C42 8 52 18 52 32 C52 44 42 50 28 50 C14 50 4 44 4 32 C4 18 14 8 28 8 Z" fill={MOCHI_CREAM} />

      <ellipse cx={19} cy={18} rx={6} ry={3} fill="#fff" opacity={0.5} transform="rotate(-25 19 18)" />

      <g transform="translate(28 31) scale(0.85)">
        <MochiFace face={face ?? (happy ? "happy" : "neutral")} color={INK} />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// IDLE BEHAVIOR
// ---------------------------------------------------------------------------

type IdleBehavior = {
  face: Face;
  weight: number;
  hold: [number, number];
};

const IDLE_BEHAVIORS: IdleBehavior[] = [
  { face: "blink", weight: 60, hold: [130, 170] },
  { face: "curious", weight: 14, hold: [1600, 2200] },
  { face: "happy", weight: 14, hold: [1700, 2400] },
  { face: "shy", weight: 12, hold: [2000, 2800] },
  { face: "excited", weight: 5, hold: [1600, 2200] },
  { face: "angry", weight: 3, hold: [1500, 2000] },
];

const IDLE_TOTAL_WEIGHT = IDLE_BEHAVIORS.reduce((sum, behavior) => sum + behavior.weight, 0);

function pickBehavior(): IdleBehavior {
  let roll = Math.random() * IDLE_TOTAL_WEIGHT;

  for (const behavior of IDLE_BEHAVIORS) {
    roll -= behavior.weight;

    if (roll < 0) return behavior;
  }

  return IDLE_BEHAVIORS[0];
}

const between = (min: number, max: number) => min + Math.random() * (max - min);

type MochiProps = {
  peeking?: boolean;
};

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

export default function Mochi({ peeking = false }: MochiProps) {
  const [mood, setMood] = useState<Mood>("awake");
  const [idleFace, setIdleFace] = useState<Face>("neutral");
  const [drowsyOpen, setDrowsyOpen] = useState(false);

  const lastActivity = useRef(Date.now());

  const gazeX = useSpring(0, {
    stiffness: 180,
    damping: 18,
  });

  const gazeY = useSpring(0, {
    stiffness: 180,
    damping: 18,
  });

  // Cursor tracking
  useEffect(() => {
    const unlisten = listen<CursorMoved>("cursor-moved", ({ payload }) => {
      lastActivity.current = Date.now();

      setMood("awake");

      gazeX.set(payload.dx * GAZE_X);
      gazeY.set(payload.dy * GAZE_Y);
    });

    return () => {
      unlisten.then((stop) => stop());
    };
  }, [gazeX, gazeY]);

  // Idle detection
  useEffect(() => {
    const id = setInterval(() => {
      const idle = Date.now() - lastActivity.current;

      if (idle >= SLEEP_AFTER_MS) {
        setMood("asleep");
      } else if (idle >= DROWSY_AFTER_MS) {
        setMood("drowsy");
      }
    }, 1000);

    return () => clearInterval(id);
  }, []);

  // Reset gaze when sleeping
  useEffect(() => {
    if (mood !== "awake") {
      gazeX.set(0);
      gazeY.set(0);
    }
  }, [mood, gazeX, gazeY]);

  // Random expressions
  // Random expressions — hanya aktif saat tidak peek
  useEffect(() => {
    if (mood !== "awake" || peeking) {
      setIdleFace("neutral");
      return;
    }

    let timer = 0;

    const after = (ms: number, fn: () => void) => {
      timer = window.setTimeout(fn, ms);
    };

    const next = () =>
      after(between(2200, 5000), () => {
        const behavior = pickBehavior();

        setIdleFace(behavior.face);

        after(between(...behavior.hold), () => {
          setIdleFace("neutral");
          next();
        });
      });

    setIdleFace("neutral");
    next();

    return () => {
      window.clearTimeout(timer);
      setIdleFace("neutral");
    };
  }, [mood, peeking]);

  // Drowsy animation
  useEffect(() => {
    if (mood !== "drowsy") return;

    let timer = 0;

    setDrowsyOpen(false);

    const droop = () =>
      (timer = window.setTimeout(
        () => {
          setDrowsyOpen(true);

          timer = window.setTimeout(() => {
            setDrowsyOpen(false);
            droop();
          }, 700);
        },
        between(2400, 4200),
      ));

    droop();

    return () => {
      window.clearTimeout(timer);
      setDrowsyOpen(false);
    };
  }, [mood]);

  const face: Face = peeking ? "neutral" : mood === "asleep" ? "asleep" : mood === "drowsy" ? (drowsyOpen ? "neutral" : "sleepy") : idleFace;

  const asleep = mood === "asleep";

  return (
    <motion.svg
      viewBox="0 0 100 30"
      role="img"
      aria-label="Mocchi"
      className={`h-7 w-auto overflow-visible transition-transform duration-300 ${peeking ? "translate-y-1" : ""}`}
      style={{
        transformOrigin: "50% 100%",
      }}
      animate={
        peeking
          ? {
              scaleY: 1,
              scaleX: 1,
            }
          : {
              scaleY: [1, asleep ? 1.09 : 1.05, 1],
              scaleX: [1, asleep ? 0.97 : 0.985, 1],
            }
      }
      transition={
        peeking
          ? { duration: 0 }
          : {
              duration: asleep ? 3.4 : 3,
              repeat: Infinity,
              ease: "easeInOut",
            }
      }
    >
      <motion.g
        style={{
          x: gazeX,
          y: gazeY,
        }}
      >
        <g transform="translate(50 14)">
          <MochiFace face={face} color={MOCHI_CREAM} marks={!peeking} />
        </g>
      </motion.g>
    </motion.svg>
  );
}
