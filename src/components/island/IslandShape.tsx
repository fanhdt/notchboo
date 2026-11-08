import { motion, useTransform, type MotionValue } from "motion/react";

type IslandShapeProps = {
  width: MotionValue<number>;
  height: MotionValue<number>;
  radius: MotionValue<number>;
  ear: MotionValue<number>;
};

export default function IslandShape({ width, height, radius, ear }: IslandShapeProps) {
  // Bentuk diperpanjang ke atas melewati tepi window supaya tidak ada celah akibat pembulatan piksel.
  const OVERSCAN = 4;

  const d = useTransform([width, height, radius, ear], ([w, h, rad, earValue]: number[]) => {
    const e = Math.min(earValue, h / 2, w / 4);
    const r = Math.max(0, Math.min(rad, h - e, (w - e * 2) / 2));

    return `
    M 0 ${-OVERSCAN}
    H ${w}
    V 0
    A ${e} ${e} 0 0 0 ${w - e} ${e}
    V ${h - r}
    A ${r} ${r} 0 0 1 ${w - e - r} ${h}
    H ${e + r}
    A ${r} ${r} 0 0 1 ${e} ${h - r}
    V ${e}
    A ${e} ${e} 0 0 0 0 0
    Z
  `;
  });

  return (
    <motion.svg className="pointer-events-none absolute left-0 top-0 overflow-visible" style={{ width, height }} aria-hidden="true">
      <motion.path d={d} fill="black" shapeRendering="geometricPrecision" />
    </motion.svg>
  );
}
