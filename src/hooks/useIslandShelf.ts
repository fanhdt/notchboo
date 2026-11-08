import { useEffect, useState } from "react";

import { shelf, type ShelfItem } from "../lib/shelf";

/** Jumlah item teratas yang ditampilkan di island. */
const VISIBLE_ITEMS = 3;

export interface UseIslandShelf {
  /** Item teratas. `shelf_list` mengurutkan yang disematkan dulu, lalu yang terbaru. */
  items: ShelfItem[];
  total: number;
  loading: boolean;
  error: string | null;
}

/**
 * Item teratas Shelf untuk halaman island. Dimuat setiap `active` menjadi true
 * dan setiap `version` berubah (mis. setelah file dilepas ke island).
 */
export function useIslandShelf(active: boolean, version: number): UseIslandShelf {
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    setLoading(true);

    shelf
      .list({})
      .then((result) => {
        if (cancelled) return;
        setItems(result.slice(0, VISIBLE_ITEMS));
        setTotal(result.length);
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active, version]);

  return { items, total, loading, error };
}
