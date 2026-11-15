import { invoke } from "@tauri-apps/api/core";
import { animate, useMotionValue } from "motion/react";
import { useEffect } from "react";

import type { IslandGeometry } from "../lib/geometry";
import type { IslandController } from "./useIslandController";
import { PEEK_VISIBLE_PX, useIslandPeek } from "./useIslandPeek";

/**
 * Ukuran dan bentuk island yang beranimasi, sesuai gaya (`geometry`) yang dipilih.
 * Juga memberi tahu Rust seberapa besar area yang bereaksi terhadap kursor.
 */
export function useIslandGeometry(controller: IslandController, geometry: IslandGeometry) {
  const { state, view, layout, noticeOn, peeking } = controller;

  const target = noticeOn ? geometry.notice : state === "compact" ? geometry.compact : view === "media" ? geometry.expanded.media[layout] : geometry.expanded[view];
  const targetW = target.width;
  const targetH = target.height;

  // Saat bersembunyi, area yang bereaksi terhadap kursor hanya sisa tipis di tepi atas layar.
  const hitboxH = peeking ? PEEK_VISIBLE_PX : targetH;

  const w = useMotionValue<number>(geometry.compact.width);
  const h = useMotionValue<number>(geometry.compact.height);
  const radius = useMotionValue<number>(geometry.shape.compact.radius);
  const ear = useMotionValue<number>(geometry.shape.compact.ear);
  const peekY = useIslandPeek(peeking, geometry.compact.height);

  // Sinkronisasi ukuran hitbox dengan Rust.
  useEffect(() => {
    invoke("set_island_hitbox", { width: targetW, height: hitboxH }).catch(console.error);
  }, [targetW, hitboxH]);

  // Animasi ukuran dan bentuk.
  useEffect(() => {
    const shape = geometry.shape[noticeOn ? "expanded" : state];
    const spring = noticeOn ? geometry.noticeSpring : geometry.spring;
    const controls = [animate(w, targetW, spring), animate(h, targetH, spring), animate(radius, shape.radius, spring), animate(ear, shape.ear, spring)];
    return () => controls.forEach((control) => control.stop());
  }, [geometry, state, noticeOn, targetW, targetH, w, h, radius, ear]);

  return { w, h, radius, ear, peekY };
}
