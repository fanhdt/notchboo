use std::fmt::Display;
use std::sync::{Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use sysinfo::{Disks, Networks, System};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::power::{self, BatteryInfo};

/// Nama event yang didengarkan React.
const STATS_EVENT: &str = "system-stats";
/// Jarak antar sampel. Lebih rapat dari ini tidak terbaca mata dan hanya menambah biaya.
const SAMPLE_INTERVAL: Duration = Duration::from_millis(1000);
/// Disk berubah sangat lambat, jadi hanya diperbarui tiap sekian sampel.
const DISK_REFRESH_EVERY_TICKS: u32 = 10;

/// Satu sampel kondisi sistem yang dikirim ke React.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemStats {
    cpu_percent: f32,
    memory_used_bytes: u64,
    memory_total_bytes: u64,
    /// Pemakaian drive sistem (biasanya C:). `None` jika tidak ditemukan.
    disk: Option<DiskStats>,
    network: NetworkStats,
    /// `None` jika perangkat tidak punya baterai (mis. PC desktop).
    battery: Option<BatteryInfo>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiskStats {
    used_bytes: u64,
    total_bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkStats {
    down_bytes_per_sec: f64,
    up_bytes_per_sec: f64,
}

/// Saklar monitoring, dibagi antara command (React) dan thread monitor.
#[derive(Default)]
pub struct MonitorControl {
    enabled: Mutex<bool>,
    wake: Condvar,
}

/// React memanggil ini untuk menyalakan atau mematikan monitoring.
#[tauri::command]
pub fn set_monitoring(control: State<'_, MonitorControl>, enabled: bool) {
    if cfg!(debug_assertions) {
        eprintln!("monitoring: {}", if enabled { "aktif" } else { "mati" });
    }

    *control.enabled.lock().expect("monitor mutex rusak") = enabled;
    control.wake.notify_all();
}

/// Menjalankan thread monitor. Dipanggil sekali dari `setup`.
pub fn start_monitor(app: &AppHandle) {
    let app = app.clone();

    thread::spawn(move || {
        let control = app.state::<MonitorControl>();

        // Di sysinfo 0.40, membuat ketiganya bisa gagal, jadi hasilnya `Result`.
        let (Some(mut system), Some(mut disks), Some(mut networks)) = (
            report_failure(System::new(), "System"),
            report_failure(Disks::new_with_refreshed_list(), "Disks"),
            report_failure(Networks::new_with_refreshed_list(), "Networks"),
        ) else {
            return;
        };

        loop {
            // Tidur total sampai monitoring dinyalakan. Tidak ada pekerjaan selama menunggu.
            wait_until_enabled(&control);

            // Sampel pembuka: hanya untuk mengatur ulang titik acuan penghitungan
            // (CPU dan jaringan sama-sama dihitung dari selisih sejak refresh terakhir).
            system.refresh_cpu_usage();
            disks.refresh(true);
            networks.refresh(true);

            let mut last_sample = Instant::now();
            let mut disk_stats = read_system_disk(&disks);
            let mut ticks: u32 = 0;

            // Ambil sampel tiap interval, sampai monitoring dimatikan.
            while sleep_while_enabled(&control) {
                ticks += 1;

        
                let elapsed_secs = last_sample.elapsed().as_secs_f64().max(0.001);
                last_sample = Instant::now();

                system.refresh_cpu_usage();
                system.refresh_memory();
                networks.refresh(true);

                if ticks % DISK_REFRESH_EVERY_TICKS == 0 {
                    disks.refresh(true);
                    disk_stats = read_system_disk(&disks);
                }

                let stats = SystemStats {
                    cpu_percent: system.global_cpu_usage(),
                    memory_used_bytes: system.used_memory(),
                    memory_total_bytes: system.total_memory(),
                    disk: disk_stats.clone(),
                    network: read_network_rates(&networks, elapsed_secs),
                    battery: power::read_battery(),
                };
                // Gagal mengirim satu event bukan masalah fatal.
                let _ = app.emit(STATS_EVENT, stats);
            }
        }
    });
}

/// Mengubah `Result` menjadi `Option`, sambil mencetak alasannya kalau gagal.
fn report_failure<T, E: Display>(result: Result<T, E>, what: &str) -> Option<T> {
    match result {
        Ok(value) => Some(value),
        Err(error) => {
            eprintln!("monitor tidak bisa memuat {what}: {error}");
            None
        }
    }
}

/// Pemakaian drive sistem. Drive dicari lewat variabel lingkungan `SystemDrive` (biasanya "C:").
fn read_system_disk(disks: &Disks) -> Option<DiskStats> {
    let system_drive = std::env::var("SystemDrive")
        .unwrap_or_else(|_| "C:".to_string())
        .to_ascii_uppercase();

    for disk in disks {
        let mount_point = disk.mount_point().to_string_lossy().to_ascii_uppercase();
        if mount_point.starts_with(&system_drive) {
            let total = disk.total_space();
            return Some(DiskStats {
                used_bytes: total.saturating_sub(disk.available_space()),
                total_bytes: total,
            });
        }
    }
    None
}

/// Kecepatan jaringan = byte sejak refresh terakhir dibagi waktu yang berlalu.
fn read_network_rates(networks: &Networks, elapsed_secs: f64) -> NetworkStats {
    let mut received: u64 = 0;
    let mut transmitted: u64 = 0;

    for (name, data) in networks {
        // Loopback hanya lalu lintas internal (mis. server dev di localhost), bukan internet.
        if name
            .to_string_lossy()
            .to_ascii_lowercase()
            .contains("loopback")
            {
                continue;
            }
        received = received.saturating_add(data.received());
        transmitted = transmitted.saturating_add(data.transmitted());
    }

    NetworkStats {
        down_bytes_per_sec: received as f64 / elapsed_secs,
        up_bytes_per_sec: transmitted as f64 / elapsed_secs,
    }
}

/// Memblokir sampai saklar menyala.
fn wait_until_enabled(control: &MonitorControl) {
    let guard = control.enabled.lock().expect("monitor mutex rusak");
    let _guard = control
        .wake
        .wait_while(guard, |enabled| !*enabled)
        .expect("monitor mutex rusak");
}

/// Tidur selama satu interval, tapi bangun lebih awal kalau saklar dimatikan.
/// Mengembalikan `true` jika monitoring masih menyala setelahnya.
fn sleep_while_enabled(control: &MonitorControl) -> bool {
    let guard = control.enabled.lock().expect("monitor mutex rusak");
    let (guard, _timed_out) = control
        .wake
        .wait_timeout_while(guard, SAMPLE_INTERVAL, |enabled| *enabled)
        .expect("monitor mutex rusak");
    *guard
}