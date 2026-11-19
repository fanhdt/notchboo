//! Perhitungan posisi kursor terhadap window island.
//!
//! Hanya aritmetika, tanpa API Tauri, supaya mudah diuji. Pembacaan posisi window dan kursor
//! dilakukan oleh `island.rs`; hasilnya dimasukkan ke sini.

/// Pill menempel di tepi atas window (tidak ada margin di sisi React).
const PILL_TOP_MARGIN: f64 = 0.0;
/// Area sentuh melebihi pill di semua sisi, dalam piksel logis (satuan CSS).
const HIT_PADDING: f64 = 10.0;

/// Ukuran pill yang sedang tampil, dalam piksel logis. Dikirim React lewat `set_island_hitbox`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Hitbox {
    pub width: f64,
    pub height: f64,
}

impl Default for Hitbox {
    fn default() -> Self {
        // Sama dengan NOTCH_GEOMETRY.compact di src/lib/geometry.ts.
        Self { width: 150.0, height: 30.0 }
    }
}

/// Posisi, lebar, dan skala window island dalam piksel fisik.
///
/// Nilainya hanya berubah saat window dipindah, diubah ukurannya, atau berganti monitor/skala,
/// jadi cukup dibaca ulang pada saat itu saja (lihat `island.rs`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WindowGeometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub scale: f64,
}

impl WindowGeometry {
    /// Titik acuan arah pandang Mochi: tengah-atas window, dalam piksel fisik layar.
    pub fn gaze_anchor(&self) -> (f64, f64) {
        (self.x + self.width / 2.0, self.y)
    }

    /// Apakah kursor (piksel fisik layar) berada di atas pill, termasuk `HIT_PADDING`.
    pub fn is_over_pill(&self, cursor: (f64, f64), hitbox: Hitbox) -> bool {
        // Posisi kursor relatif ke pojok kiri-atas window, dalam logical pixel (satuan CSS).
        let x = (cursor.0 - self.x) / self.scale;
        let y = (cursor.1 - self.y) / self.scale;
        let window_width = self.width / self.scale;

        // Pill berada di tengah-atas window.
        let left = (window_width - hitbox.width) / 2.0 - HIT_PADDING;
        let right = left + hitbox.width + HIT_PADDING * 2.0;
        let top = PILL_TOP_MARGIN - HIT_PADDING;
        let bottom = PILL_TOP_MARGIN + hitbox.height + HIT_PADDING;

        x >= left && x <= right && y >= top && y <= bottom
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Window 460 px lebar di tengah-atas layar 1920 px, skala 100%.
    fn window_100() -> WindowGeometry {
        WindowGeometry { x: 730.0, y: 0.0, width: 460.0, scale: 1.0 }
    }

    #[test]
    fn cursor_in_pill_center_is_over() {
        assert!(window_100().is_over_pill((960.0, 10.0), Hitbox::default()));
    }

    #[test]
    fn cursor_below_pill_is_away() {
        // Bawah pill = 30 + padding 10 = 40.
        assert!(window_100().is_over_pill((960.0, 40.0), Hitbox::default()));
        assert!(!window_100().is_over_pill((960.0, 41.0), Hitbox::default()));
    }

    #[test]
    fn horizontal_edges_include_padding() {
        // Di koordinat window: kiri = (460-150)/2 - 10 = 145, kanan = 145 + 150 + 20 = 315.
        let g = window_100();
        assert!(g.is_over_pill((730.0 + 145.0, 10.0), Hitbox::default()));
        assert!(!g.is_over_pill((730.0 + 144.0, 10.0), Hitbox::default()));
        assert!(g.is_over_pill((730.0 + 315.0, 10.0), Hitbox::default()));
        assert!(!g.is_over_pill((730.0 + 316.0, 10.0), Hitbox::default()));
    }

    #[test]
    fn larger_hitbox_widens_the_area() {
        let expanded = Hitbox { width: 290.0, height: 138.0 };
        let g = window_100();
        assert!(g.is_over_pill((960.0, 140.0), expanded));
        assert!(!g.is_over_pill((960.0, 140.0), Hitbox::default()));
    }

    #[test]
    fn high_dpi_uses_logical_pixels() {
        // Skala 200%: window 920 px fisik = 460 logis, di x fisik 1460. Pill logis 150 x 30.
        let g = WindowGeometry { x: 1460.0, y: 0.0, width: 920.0, scale: 2.0 };
        // Tengah window = 1460 + 460 = 1920 fisik. y 20 fisik = 10 logis: di atas pill.
        assert!(g.is_over_pill((1920.0, 20.0), Hitbox::default()));
        // y 82 fisik = 41 logis: di luar (batas bawah 40).
        assert!(!g.is_over_pill((1920.0, 82.0), Hitbox::default()));
        // Tepi kanan logis 315 -> 630 fisik dari tepi kiri window.
        assert!(g.is_over_pill((1460.0 + 630.0, 20.0), Hitbox::default()));
        assert!(!g.is_over_pill((1460.0 + 632.0, 20.0), Hitbox::default()));
    }

    #[test]
    fn window_on_a_secondary_monitor_with_negative_origin() {
        // Monitor kiri dari monitor utama: koordinat layar negatif.
        let g = WindowGeometry { x: -1190.0, y: 0.0, width: 460.0, scale: 1.0 };
        assert!(g.is_over_pill((-960.0, 10.0), Hitbox::default()));
        assert!(!g.is_over_pill((960.0, 10.0), Hitbox::default()));
    }

    #[test]
    fn gaze_anchor_is_top_center() {
        assert_eq!(window_100().gaze_anchor(), (960.0, 0.0));
    }
}