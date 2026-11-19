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

  // Sinkronisasi hitbox dan animasi ukuran/bentuk.
  useEffect(() => {
    let cancelled = false;
    let stopAnimations: (() => void) | undefined;

    const currentW = w.get();
    const currentH = h.get();

    // Selama transisi, gunakan area yang mencakup ukuran saat ini dan ukuran tujuan.
    // Saat peek aktif, tinggi hitbox tetap dibatasi ke bagian yang terlihat.
    const transitionHitbox = {
      width: Math.max(currentW, targetW),
      height: peeking ? PEEK_VISIBLE_PX : Math.max(currentH, targetH),
    };

    const shape = geometry.shape[noticeOn ? "expanded" : state];
    const spring = noticeOn ? geometry.noticeSpring : geometry.spring;

    const startAnimation = async () => {
      // Pastikan hitbox transisi sudah diterapkan sebelum animasi dimulai.
      try {
        await invoke("set_island_hitbox", transitionHitbox);
      } catch (error) {
        console.error("Gagal memperbarui hitbox transisi:", error);
      }

      if (cancelled) return;

      const controls = [animate(w, targetW, spring), animate(h, targetH, spring), animate(radius, shape.radius, spring), animate(ear, shape.ear, spring)];

      stopAnimations = () => controls.forEach((control) => control.stop());

      await Promise.all(controls.map((control) => control.finished));

      if (cancelled) return;

      // Setelah animasi selesai, rapatkan hitbox ke ukuran akhirnya.
      invoke("set_island_hitbox", {
        width: targetW,
        height: hitboxH,
      }).catch((error) => {
        console.error("Gagal memperbarui hitbox akhir:", error);
      });
    };

    void startAnimation();

    return () => {
      cancelled = true;
      stopAnimations?.();
    };
  }, [geometry, state, noticeOn, peeking, targetW, targetH, hitboxH, w, h, radius, ear]);

  return { w, h, radius, ear, peekY };
}
