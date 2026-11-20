import { invoke } from "@tauri-apps/api/core";
import { animate, useMotionValue } from "motion/react";
import { useEffect, useRef } from "react";

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

  // Identitas transisi untuk mencegah IPC lama menimpa hitbox terbaru.
  const transitionId = useRef(0);

  useEffect(() => {
    const id = ++transitionId.current;

    const currentW = w.get();
    const currentH = h.get();

    const transitionHitbox = {
      width: Math.max(currentW, targetW),
      height: peeking ? PEEK_VISIBLE_PX : Math.max(currentH, targetH),
    };

    const shape = geometry.shape[noticeOn ? "expanded" : state];
    const spring = noticeOn ? geometry.noticeSpring : geometry.spring;

    let cancelled = false;

    // Mulai animasi visual langsung tanpa menunggu IPC.
    const controls = [animate(w, targetW, spring), animate(h, targetH, spring), animate(radius, shape.radius, spring), animate(ear, shape.ear, spring)];

    // Perbarui hitbox secara paralel dengan animasi visual.
    const updateHitbox = async () => {
      try {
        await invoke("set_island_hitbox", transitionHitbox);
      } catch (error) {
        console.error("Gagal memperbarui hitbox transisi:", error);
      }

      if (cancelled || transitionId.current !== id) return;

      await Promise.all(controls.map((control) => control.finished));

      if (cancelled || transitionId.current !== id) return;

      try {
        await invoke("set_island_hitbox", {
          width: targetW,
          height: hitboxH,
        });
      } catch (error) {
        console.error("Gagal memperbarui hitbox akhir:", error);
      }
    };

    void updateHitbox();

    return () => {
      cancelled = true;
      controls.forEach((control) => control.stop());
    };
  }, [geometry, state, noticeOn, peeking, targetW, targetH, hitboxH, w, h, radius, ear]);

  return { w, h, radius, ear, peekY };
}
