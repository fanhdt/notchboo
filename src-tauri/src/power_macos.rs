//! Versi macOS dari `power.rs`: status baterai dari `pmset -g batt`.
//!
//! Contoh keluarannya:
//! ```text
//! Now drawing from 'Battery Power'
//!  -InternalBattery-0 (id=1234567)	85%; discharging; 4:12 remaining present: true
//! ```

use std::process::Command;

use serde::Serialize;

/// Status baterai yang dikirim ke React.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryInfo {
    percent: u8,
    charging: bool,
    on_ac: bool,
}

/// Membaca status baterai. `None` berarti tidak ada baterai (atau statusnya tidak bisa dibaca).
pub fn read_battery() -> Option<BatteryInfo> {
    let output = Command::new("pmset").args(["-g", "batt"]).output().ok()?;
    if !output.status.success() {
        return None;
    }

    parse(&String::from_utf8_lossy(&output.stdout))
}

fn parse(text: &str) -> Option<BatteryInfo> {
    // Mac tanpa baterai (mis. Mac mini) tidak punya baris `InternalBattery`.
    let line = text.lines().find(|line| line.contains("InternalBattery"))?;

    let percent_at = line.find('%')?;
    // Angka tepat sebelum tanda "%".
    let before = &line[..percent_at];
    let start = before.rfind(|c: char| !c.is_ascii_digit()).map_or(0, |index| index + 1);
    let percent = before[start..].parse::<u32>().ok()?.min(100) as u8;

    let lower = line.to_lowercase();
    // "discharging" dan "not charging" memuat kata "charging", jadi harus dikecualikan.
    let charging = lower.contains("charging") && !lower.contains("discharging") && !lower.contains("not charging");

    Some(BatteryInfo {
        percent,
        charging,
        on_ac: text.contains("AC Power"),
    })
}