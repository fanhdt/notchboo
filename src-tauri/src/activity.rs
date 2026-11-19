
use serde::Serialize;

/// Nama event ke React; didengarkan oleh Mochi untuk mengikuti kursor dengan mata.
pub const CURSOR_EVENT: &str = "cursor-moved";
/// Gerakan di bawah ini (piksel fisik) dianggap diam.
const MIN_MOVE_PX: f64 = 2.0;
/// Jarak kursor dari tengah-atas window yang dianggap "paling jauh" (dx/dy = ±1).
const GAZE_RANGE_PX: f64 = 600.0;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct CursorMoved {
    pub dx: f64,
    pub dy: f64,
}

/// Mengubah gerakan kursor menjadi arah lirikan (-1..1) untuk Mochi.
///
/// Tidak punya thread sendiri: `island.rs` memanggil `update` pada putaran pemantauan kursor
/// yang sama dengan deteksi hover, sehingga posisi kursor cukup dibaca sekali per putaran.
#[derive(Default)]
pub struct GazeTracker {
    last_cursor: Option<(f64, f64)>,
    last_anchor: Option<(f64, f64)>,
}

impl GazeTracker {
    /// `cursor` dan `anchor` dalam piksel fisik layar. `anchor` adalah titik tengah-atas window.
    /// Hasilnya `Some` hanya bila kursor atau anchor bergerak cukup jauh sejak laporan terakhir.
    pub fn update(&mut self, cursor: (f64, f64), anchor: (f64, f64)) -> Option<CursorMoved> {
        let (Some(last_cursor), Some(last_anchor)) =
            (self.last_cursor, self.last_anchor)
        else {
            self.last_cursor = Some(cursor);
            self.last_anchor = Some(anchor);
            return None;
        };

        let cursor_moved = (cursor.0 - last_cursor.0).abs()
            + (cursor.1 - last_cursor.1).abs()
            >= MIN_MOVE_PX;

        let anchor_moved = (anchor.0 - last_anchor.0).abs()
            + (anchor.1 - last_anchor.1).abs()
            >= MIN_MOVE_PX;

        if !cursor_moved && !anchor_moved {
            return None;
        }

        self.last_cursor = Some(cursor);
        self.last_anchor = Some(anchor);

        Some(CursorMoved {
            dx: ((cursor.0 - anchor.0) / GAZE_RANGE_PX).clamp(-1.0, 1.0),
            dy: ((cursor.1 - anchor.1) / GAZE_RANGE_PX).clamp(-1.0, 1.0),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ANCHOR: (f64, f64) = (960.0, 0.0);

    #[test]
    fn first_reading_only_records_position() {
        let mut gaze = GazeTracker::default();
        assert_eq!(gaze.update((100.0, 100.0), ANCHOR), None);
    }

    #[test]
    fn tiny_movement_is_ignored() {
        let mut gaze = GazeTracker::default();
        gaze.update((100.0, 100.0), ANCHOR);
        // |1| + |0.9| = 1.9 < 2
        assert_eq!(gaze.update((101.0, 100.9), ANCHOR), None);
    }

    #[test]
    fn tiny_moves_do_not_accumulate_into_a_drift() {
        let mut gaze = GazeTracker::default();
        gaze.update((100.0, 100.0), ANCHOR);
        // Posisi acuan tidak bergeser saat gerakan diabaikan, jadi jarak dihitung dari titik awal.
        assert_eq!(gaze.update((101.0, 100.0), ANCHOR), None);
        assert!(gaze.update((102.0, 100.0), ANCHOR).is_some());
    }

    #[test]
    fn movement_reports_normalized_direction() {
        let mut gaze = GazeTracker::default();
        gaze.update((960.0, 0.0), ANCHOR);

        let moved = gaze
            .update((960.0 + 300.0, 150.0), ANCHOR)
            .expect("harus dilaporkan");

        assert_eq!(moved, CursorMoved { dx: 0.5, dy: 0.25 });
    }

    #[test]
    fn direction_is_clamped_to_unit_range() {
        let mut gaze = GazeTracker::default();
        gaze.update((0.0, 0.0), ANCHOR);

        let far = gaze
            .update((5000.0, 5000.0), ANCHOR)
            .expect("harus dilaporkan");
        assert_eq!(far, CursorMoved { dx: 1.0, dy: 1.0 });

        let left = gaze
            .update((-5000.0, -5000.0), ANCHOR)
            .expect("harus dilaporkan");
        assert_eq!(left, CursorMoved { dx: -1.0, dy: -1.0 });
    }

    #[test]
    fn anchor_movement_updates_direction_without_cursor_movement() {
        let mut gaze = GazeTracker::default();
        gaze.update((960.0, 300.0), ANCHOR);

        let moved = gaze
            .update((960.0, 300.0), (960.0, 150.0))
            .expect("perubahan anchor harus dilaporkan");

        assert_eq!(moved, CursorMoved { dx: 0.0, dy: 0.25 });
    }

    #[test]
    fn tiny_anchor_movement_is_ignored() {
        let mut gaze = GazeTracker::default();
        gaze.update((960.0, 300.0), ANCHOR);

        assert_eq!(
            gaze.update((960.0, 300.0), (960.0, 1.0)),
            None
        );
    }
}
