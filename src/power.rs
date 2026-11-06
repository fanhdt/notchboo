use serde::Serialize;
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

/// Nilai khusus dari Windows: persentase baterai tidak diketahui.
const PERCENT_UNKNOWN: u8 = 255;
/// Bit pada `BatteryFlag`: baterai sedang diisi.
const FLAG_CHARGING: u8 = 8;
/// Bit pada `BatteryFlag`: perangkat tidak punya baterai (mis. PC desktop).
const FLAG_NO_BATTERY: u8 = 128;
/// Nilai `ACLineStatus` ketika charger terhubung.
const AC_ONLINE: u8 = 1;

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
    let mut status = SYSTEM_POWER_STATUS::default();

    // SAFETY: `status` adalah struct milik kita yang valid selama panggilan berlangsung;
    // Windows hanya menulis ke dalamnya.
    unsafe { GetSystemPowerStatus(&mut status) }.ok()?;

    if (status.BatteryFlag & FLAG_NO_BATTERY) != 0 || status.BatteryLifePercent == PERCENT_UNKNOWN {
        return None;
    }

    Some(BatteryInfo {
        percent: status.BatteryLifePercent.min(100),
        charging: (status.BatteryFlag & FLAG_CHARGING) != 0,
        on_ac: status.ACLineStatus == AC_ONLINE,
    })
}