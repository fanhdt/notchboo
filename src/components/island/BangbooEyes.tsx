import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion, useSpring } from "motion/react";

type Mood = "awake" | "drowsy" | "asleep";
type Face = "open" | "blink" | "squint" | "wink" | "sleep";

const EYE_COLOR = "#c8e63c";

// Diam tanpa gerakan mouse selama ini -> ngantuk, lalu tidur.
const DROWSY_AFTER_MS = 20_000;
const SLEEP_AFTER_MS = 35_000;

// Seberapa jauh bola mata boleh melirik (satuan viewBox SVG).
const GAZE_X = 5;
const GAZE_Y = 2.5;

type CursorMoved = { dx: number; dy: number };

function Eye({ face, side }: { face: Face; side: "left" | "right" }) {
  const common = { stroke: EYE_COLOR, strokeWidth: 2.8, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

  switch (face) {
    case "open":
      return <circle r={6} {...common} />;
    case "squint": // setengah lingkaran bawah, seperti mata menyipit
      return <path d="M-6 -1 A6 6 0 0 0 6 -1" {...common} />;
    case "wink":
      return side === "left" ? <circle r={6} {...common} /> : <path d="M5 -5 L-5 0 L5 5" {...common} />;
    case "blink":
    case "sleep":
      return <path d="M-6 0 H6" {...common} />;
  }
}

export default function BangbooEyes() {
  const [mood, setMood] = useState<Mood>("awake");
  const [idleFace, setIdleFace] = useState<Face>("open");
  const [droopClosed, setDroopClosed] = useState(false);

  const lastActivity = useRef(Date.now());

  const gazeX = useSpring(0, { stiffness: 180, damping: 18 });
  const gazeY = useSpring(0, { stiffness: 180, damping: 18 });

  // 1. Gerakan mouse dari Rust: bangunkan dan arahkan lirikan.
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

  // 2. Cek tiap detik: sudah berapa lama tidak ada gerakan?
  useEffect(() => {
    const id = setInterval(() => {
      const idle = Date.now() - lastActivity.current;

      if (idle >= SLEEP_AFTER_MS) setMood("asleep");
      else if (idle >= DROWSY_AFTER_MS) setMood("drowsy");
    }, 1000);

    return () => clearInterval(id);
  }, []);

  // 3. Saat tidak awake, mata kembali menghadap depan.
  useEffect(() => {
    if (mood !== "awake") {
      gazeX.set(0);
      gazeY.set(0);
    }
  }, [mood, gazeX, gazeY]);

  // 4. Idle saat awake: kedip, sesekali wink atau menyipit.
  useEffect(() => {
    if (mood !== "awake") return;

    setIdleFace("open");
    const timers: number[] = [];
    const after = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };

    const next = () =>
      after(2200 + Math.random() * 3200, () => {
        const r = Math.random();

        if (r < 0.12) {
          setIdleFace("wink");
          after(1100, () => {
            setIdleFace("open");
            next();
          });
        } else if (r < 0.25) {
          setIdleFace("squint");
          after(1400, () => {
            setIdleFace("open");
            next();
          });
        } else {
          setIdleFace("blink");
          after(140, () => {
            setIdleFace("open");
            next();
          });
        }
      });

    next();
    return () => timers.forEach(clearTimeout);
  }, [mood]);

  // 5. Ngantuk: mata naik-turun pelan antara menyipit dan terpejam.
  useEffect(() => {
    if (mood !== "drowsy") return;

    const id = setInterval(() => setDroopClosed((v) => !v), 1200);
    return () => clearInterval(id);
  }, [mood]);

  const face: Face = mood === "asleep" ? "sleep" : mood === "drowsy" ? (droopClosed ? "sleep" : "squint") : idleFace;

  return (
    <svg viewBox="0 0 100 30" role="img" aria-label="Bangboo" className="h-5 w-auto overflow-visible">
      {/* Napas pelan saat tidur */}
      <motion.g animate={mood === "asleep" ? { y: [0, 1.2, 0] } : { y: 0 }} transition={mood === "asleep" ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}>
        {/* Lirikan mengikuti kursor */}
        <motion.g style={{ x: gazeX, y: gazeY }}>
          <g transform="translate(30 15)">
            <Eye face={face} side="left" />
          </g>
          <g transform="translate(70 15)">
            <Eye face={face} side="right" />
          </g>
        </motion.g>
      </motion.g>

      {/* zZ saat tidur */}
      <AnimatePresence>
        {mood === "asleep" &&
          [0, 1.4].map((delay, i) => (
            <motion.text
              key={i}
              x={88}
              y={8}
              fontSize={i === 0 ? 7 : 5}
              fontWeight={700}
              fill={EYE_COLOR}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0], y: [0, -8], x: [0, 4] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.8, repeat: Infinity, delay, ease: "easeOut" }}
            >
              z
            </motion.text>
          ))}
      </AnimatePresence>
    </svg>
  );
}
