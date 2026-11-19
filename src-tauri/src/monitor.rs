
use std::fmt::Display;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Condvar, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::Serialize;
use sysinfo::{Disks, Networks, System};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::power::{self, BatteryInfo};

const STATS_EVENT: &str = "system-stats";
const SAMPLE_INTERVAL: Duration = Duration::from_millis(1000);
const DISK_REFRESH_EVERY_TICKS: u32 = 10;

/// Saklar monitoring dan lifecycle worker.
#[derive(Default)]
pub struct MonitorControl {
    enabled: Mutex<bool>,
    wake: Condvar,
    stop_requested: AtomicBool,
    worker: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemStats {
    cpu_percent: f32,
    memory_used_bytes: u64,
    memory_total_bytes: u64,
    disk: Option<DiskStats>,
    network: NetworkStats,
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

/// React memanggil ini untuk menyalakan atau mematikan monitoring.
#[tauri::command]
pub fn set_monitoring(control: State<'_, MonitorControl>, enabled: bool) {
    if control.stop_requested.load(Ordering::Acquire) {
        return;
    }

    if cfg!(debug_assertions) {
        eprintln!("monitoring: {}", if enabled { "aktif" } else { "mati" });
    }

    *control
        .enabled
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = enabled;

    control.wake.notify_all();
}

/// Menjalankan thread monitor. Dipanggil sekali dari setup.
pub fn start_monitor(app: &AppHandle) {
    let control = app.state::<MonitorControl>();

    let mut worker = control
        .worker
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);

    if worker.is_some() {
        return;
    }

    control.stop_requested.store(false, Ordering::Release);

    let app = app.clone();

    match thread::Builder::new()
        .name("notchboo-system-monitor".into())
        .spawn(move || {
            let control = app.state::<MonitorControl>();

            let (Some(mut system), Some(mut disks), Some(mut networks)) = (
                report_failure(System::new(), "System"),
                report_failure(Disks::new_with_refreshed_list(), "Disks"),
                report_failure(Networks::new_with_refreshed_list(), "Networks"),
            ) else {
                return;
            };

            loop {
                if !wait_until_enabled(&control) {
                    break;
                }

                // Sampel pembuka untuk mengatur ulang titik acuan CPU dan jaringan.
                system.refresh_cpu_usage();
                disks.refresh(true);
                networks.refresh(true);

                let mut last_sample = Instant::now();
                let mut disk_stats = read_system_disk(&disks);
                let mut ticks: u32 = 0;

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

                    let _ = app.emit(STATS_EVENT, stats);
                }

                if control.stop_requested.load(Ordering::Acquire) {
                    break;
                }
            }
        })
    {
        Ok(handle) => *worker = Some(handle),
        Err(error) => eprintln!("gagal membuat worker monitor: {error}"),
    }
}

/// Meminta worker berhenti dan menunggu sampai thread selesai.
pub fn stop_monitor(app: &AppHandle) {
    let control = app.state::<MonitorControl>();

    control.stop_requested.store(true, Ordering::Release);

    *control
        .enabled
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = false;

    // Bangunkan worker yang sedang menunggu monitoring aktif atau interval sampel.
    control.wake.notify_all();

    // Lepaskan mutex sebelum join agar tidak menghambat worker.
    let worker = control
        .worker
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .take();

    if let Some(worker) = worker {
        if worker.join().is_err() {
            eprintln!("worker monitor berhenti karena panic");
        }
    }
}

fn report_failure<T, E: Display>(result: Result<T, E>, what: &str) -> Option<T> {
    match result {
        Ok(value) => Some(value),
        Err(error) => {
            eprintln!("monitor tidak bisa memuat {what}: {error}");
            None
        }
    }
}

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

fn read_network_rates(networks: &Networks, elapsed_secs: f64) -> NetworkStats {
    let mut received: u64 = 0;
    let mut transmitted: u64 = 0;

    for (name, data) in networks {
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

/// Menunggu sampai monitoring aktif atau shutdown diminta.
fn wait_until_enabled(control: &MonitorControl) -> bool {
    let guard = control
        .enabled
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);

    let guard = control
        .wake
        .wait_while(guard, |enabled| {
            !*enabled && !control.stop_requested.load(Ordering::Acquire)
        })
        .unwrap_or_else(std::sync::PoisonError::into_inner);

    *guard && !control.stop_requested.load(Ordering::Acquire)
}

/// Tidur selama satu interval, tetapi dapat dibangunkan saat monitoring dimatikan
/// atau shutdown diminta.
fn sleep_while_enabled(control: &MonitorControl) -> bool {
    let guard = control
        .enabled
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);

    let (guard, _) = control
        .wake
        .wait_timeout_while(guard, SAMPLE_INTERVAL, |enabled| {
            *enabled && !control.stop_requested.load(Ordering::Acquire)
        })
        .unwrap_or_else(std::sync::PoisonError::into_inner);

    *guard && !control.stop_requested.load(Ordering::Acquire)
}
