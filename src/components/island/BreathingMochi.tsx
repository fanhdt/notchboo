import { motion, useReducedMotion } from "motion/react";

import { MochiBody, type Face } from "./Mochi";

export default function BreathingMochi({ face }: { face: Face }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="absolute inset-0 m-auto h-10 w-10"
      animate={reduceMotion ? undefined : { scaleY: [1, 1.06, 1], scaleX: [1, 0.98, 1] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      style={{ transformOrigin: "50% 100%" }}
    >
      <MochiBody face={face} className="h-full w-full" />
    </motion.div>
  );
}
