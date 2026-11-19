/**
 * Penjadwalan tick timer yang selaras dengan batas detik.
 *
 * Tampilan timer berresolusi detik (`formatClock` membulatkan sisa waktu ke atas), jadi state hanya
 * perlu berubah sekali per detik. Fungsi di sini menghitung berapa lama lagi tampilan akan berganti,
 * lalu pemanggil menjadwalkan satu `setTimeout` ke titik itu. Waktunya selalu dihitung ulang dari
 * `Date.now()`, jadi tidak ada drift walau timeout terlambat (mis. setelah sleep atau throttling).
 */

/** Selisih kecil supaya timeout jatuh sesaat SETELAH batas detik, bukan tepat di atasnya. */
const BOUNDARY_MARGIN_MS = 1;

/**
 * Hitung mundur: ms sampai `ceil(leftMs / 1000)` berganti.
 * Dipakai untuk Pomodoro dan istirahat Flow (keduanya ditampilkan dengan `formatClock`).
 */
export function msUntilCountdownChange(leftMs: number): number {
  const rest = Math.max(0, leftMs) % 1000;
  return (rest === 0 ? 1000 : rest) + BOUNDARY_MARGIN_MS;
}

/** Hitung naik: ms sampai `floor(elapsedMs / 1000)` berganti. Dipakai untuk fokus Flow. */
export function msUntilCountUpChange(elapsedMs: number): number {
  const rest = Math.max(0, elapsedMs) % 1000;
  return 1000 - rest + BOUNDARY_MARGIN_MS;
}
