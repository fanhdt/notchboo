//! Operasi yang menggabungkan database dan file di disk: impor, hapus, bersih-bersih.
//! Tidak bergantung pada Tauri; event dan dialog ditangani oleh `commands`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use super::db::NewFile;
use super::model::*;
use super::state::ShelfState;

/// Ringkasan pembersihan item kedaluwarsa.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct PurgeReport {
    pub purged: usize,
    /// Gagal dihapus (mis. file sedang dipakai aplikasi lain); dicoba lagi pada putaran berikutnya.
    pub failed: usize,
}

/// Ringkasan sapuan konsistensi.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct SweepReport {
    pub rows_removed: usize,
    pub dirs_removed: usize,
}

/// File terkelola yang siap dibuka atau ditampilkan.
#[derive(Debug)]
pub struct FileTarget {
    pub path: PathBuf,
    pub extension: Option<String>,
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string())
}

/// Mengimpor file satu per satu. Satu file gagal tidak menghentikan yang lain.
///
/// Penyalinan (lambat) dilakukan tanpa mengunci database; database hanya dikunci sebentar
/// untuk membuat baris dan memindahkan file ke lokasi akhirnya.
pub fn import_paths(
    state: &ShelfState,
    paths: &[PathBuf],
    mut on_progress: impl FnMut(&ImportProgress),
) -> Result<ImportOutcome, String> {
    let storage = state.storage()?;
    let mut outcome = ImportOutcome::default();

    for (index, path) in paths.iter().enumerate() {
        on_progress(&ImportProgress { index: index + 1, count: paths.len(), file_name: display_name(path) });

        let staged = match storage.stage(path) {
            Ok(staged) => staged,
            Err(error) => {
                outcome.skipped.push(SkippedFile { path: path.display().to_string(), reason: error.to_string() });
                continue;
            }
        };

        let source = path.to_string_lossy();
        let result = state.with_db_storage(|db, storage| {
            let file = NewFile {
                title: &staged.original_name,
                file_name: &staged.stored_name,
                source_path: Some(&source),
                extension: staged.extension.as_deref(),
                size_bytes: staged.size_bytes as i64,
            };
            db.insert_file(&file, now_ms(), |id| storage.commit(&staged, id))
        });

        match result {
            Ok(item) => outcome.imported.push(item),
            Err(reason) => {
                storage.discard(&staged);
                outcome.skipped.push(SkippedFile { path: path.display().to_string(), reason });
            }
        }
    }

    Ok(outcome)
}

/// Menghapus item. Untuk file, folder terkelolanya dihapus lebih dulu; bila gagal
/// (mis. file sedang terbuka di aplikasi lain) baris dipertahankan agar bisa dicoba lagi.
/// File asli di lokasi sumber tidak pernah disentuh.
pub fn delete_item(state: &ShelfState, id: i64) -> Result<(), String> {
    state.with_db_storage(|db, storage| {
        if let Some(rel) = db.stored_path(id)? {
            // Path yang bentuknya tidak valid tidak boleh dipakai untuk menghapus apa pun di disk.
            if storage.resolve(&rel).is_some() {
                storage.remove_item(&rel).map_err(|error| {
                    ShelfError::Storage(format!(
                        "Tidak bisa menghapus file (mungkin sedang dipakai aplikasi lain): {error}"
                    ))
                })?;
            }
        }
        db.delete(id)
    })
}

/// Menghapus item kedaluwarsa yang tidak di-pin. Seluruhnya berjalan dalam satu kunci database,
/// jadi item tidak bisa di-pin di tengah proses.
pub fn purge_expired(state: &ShelfState, now: i64) -> Result<PurgeReport, String> {
    state.with_db_storage(|db, storage| {
        let mut report = PurgeReport::default();

        for (id, rel) in db.expired(now)? {
            let files_gone = match rel.as_deref() {
                Some(rel) if storage.resolve(rel).is_some() => storage.remove_item(rel).is_ok(),
                _ => true,
            };

            if files_gone && db.delete(id).is_ok() {
                report.purged += 1;
            } else {
                report.failed += 1;
            }
        }
        Ok(report)
    })
}

/// Menyelaraskan database dan disk: baris file yang filenya hilang dihapus, dan folder
/// yang tidak punya baris (serta sisa impor yang terputus) dibersihkan.
/// Dijalankan sekali saat aplikasi mulai.
pub fn sweep_orphans(state: &ShelfState) -> Result<SweepReport, String> {
    let stale_before = state.started_at_ms();

    state.with_db_storage(|db, storage| {
        let mut report = SweepReport::default();
        let mut known: HashSet<i64> = HashSet::new();

        for (id, rel) in db.file_rows()? {
            let present = rel
                .as_deref()
                .and_then(|rel| storage.resolve(rel))
                .is_some_and(|path| path.is_file());

            if present {
                known.insert(id);
            } else if db.delete(id).is_ok() {
                report.rows_removed += 1;
            }
        }

        report.dirs_removed = storage.sweep(&known, stale_before);
        Ok(report)
    })
}

/// Mencari file terkelola milik `id` untuk dibuka atau ditampilkan di File Explorer.
/// Path selalu berasal dari database dan divalidasi, tidak pernah dari React.
pub fn file_target(state: &ShelfState, id: i64) -> Result<FileTarget, String> {
    state.with_db_storage(|db, storage| {
        let item = db.get(id)?;
        if item.kind != ItemKind::File {
            return Err(ShelfError::Invalid("Hanya item file yang bisa dibuka.".into()));
        }

        let rel = db.stored_path(id)?.ok_or(ShelfError::NotFound)?;
        let path = storage
            .resolve(&rel)
            .ok_or_else(|| ShelfError::Storage("Lokasi file tidak valid.".into()))?;

        if !path.is_file() {
            return Err(ShelfError::Storage(
                "File tidak ditemukan di penyimpanan. Mungkin sudah dihapus dari luar aplikasi.".into(),
            ));
        }
        Ok(FileTarget { path, extension: item.extension })
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::shelf::db::Db;
    use crate::shelf::storage::Storage;
    use crate::shelf::testutil::{write_file, TempDir};

    const DAY: i64 = 86_400_000;

    fn state_with(tmp: &TempDir, storage: impl FnOnce(Storage) -> Storage) -> ShelfState {
        let storage = storage(Storage::new(tmp.path().join("shelf")));
        storage.prepare().unwrap();
        ShelfState::new(Db::open_in_memory().unwrap(), storage)
    }

    fn state(tmp: &TempDir) -> ShelfState {
        state_with(tmp, |s| s)
    }

    fn import(state: &ShelfState, paths: &[PathBuf]) -> ImportOutcome {
        import_paths(state, paths, |_| {}).unwrap()
    }

    fn stored_file(state: &ShelfState, id: i64) -> PathBuf {
        state.with_db_storage(|db, storage| Ok(storage.resolve(&db.stored_path(id)?.unwrap()).unwrap())).unwrap()
    }

    #[test]
    fn import_copies_file_and_leaves_original_untouched() {
        let tmp = TempDir::new("import");
        let source = write_file(&tmp.path().join("sumber"), "laporan.txt", b"halo");
        let state = state(&tmp);

        let outcome = import(&state, &[source.clone()]);
        assert!(outcome.skipped.is_empty());
        let item = &outcome.imported[0];

        assert_eq!(item.kind, ItemKind::File);
        assert_eq!((item.title.as_str(), item.file_name.as_deref()), ("laporan.txt", Some("laporan.txt")));
        assert_eq!((item.extension.as_deref(), item.size_bytes), (Some("txt"), Some(4)));
        assert_eq!(item.source_path.as_deref(), Some(source.to_string_lossy().as_ref()));
        assert!(item.expires_at.is_some());

        let stored = stored_file(&state, item.id);
        assert_eq!(fs::read(&stored).unwrap(), b"halo");
        assert_ne!(stored, source);
        assert_eq!(fs::read(&source).unwrap(), b"halo"); // asli utuh
    }

    #[test]
    fn same_name_from_different_folders_does_not_collide() {
        let tmp = TempDir::new("dup");
        let a = write_file(&tmp.path().join("a"), "x.txt", b"satu");
        let b = write_file(&tmp.path().join("b"), "x.txt", b"dua");
        let state = state(&tmp);

        let outcome = import(&state, &[a, b]);
        assert_eq!(outcome.imported.len(), 2);
        let (p1, p2) = (stored_file(&state, outcome.imported[0].id), stored_file(&state, outcome.imported[1].id));
        assert_ne!(p1, p2);
        assert_eq!((fs::read(p1).unwrap(), fs::read(p2).unwrap()), (b"satu".to_vec(), b"dua".to_vec()));
    }

    #[test]
    fn long_name_is_truncated_but_title_keeps_original() {
        let tmp = TempDir::new("long-name");
        let original = format!("{}.txt", "a".repeat(110)); // sah di Windows, tapi melebihi batas nama tersimpan
        let source = write_file(tmp.path(), &original, b"x");
        let state = state(&tmp);

        let item = import(&state, &[source]).imported.remove(0);
        assert_eq!(item.title, original);
        let stored_name = item.file_name.as_deref().unwrap();
        assert_eq!(stored_name.chars().count(), 100);
        assert!(stored_name.ends_with(".txt"));
        assert!(stored_file(&state, item.id).is_file());
    }

    // Windows menolak nama berkarakter ini, jadi file seperti itu hanya bisa ada di sistem lain.
    // Pembersihan karakternya sendiri diuji di `storage::tests::file_names_are_sanitized`.
    #[cfg(unix)]
    #[test]
    fn unsafe_characters_are_sanitized_but_title_keeps_original() {
        let tmp = TempDir::new("name");
        let source = write_file(tmp.path(), "a:b?.txt", b"x");
        let state = state(&tmp);

        let item = import(&state, &[source]).imported.remove(0);
        assert_eq!(item.title, "a:b?.txt");
        assert_eq!(item.file_name.as_deref(), Some("a_b_.txt"));
        assert!(stored_file(&state, item.id).is_file());
    }

    #[test]
    fn failures_are_skipped_with_reason_and_the_rest_still_import() {
        let tmp = TempDir::new("skip");
        let ok = write_file(tmp.path(), "ok.txt", b"1");
        let big = write_file(tmp.path(), "besar.bin", b"12345");
        let state = state_with(&tmp, |s| s.with_max_file_bytes(3));

        let paths = [tmp.path().to_path_buf(), tmp.path().join("hilang.txt"), big, ok];
        let outcome = import(&state, &paths);

        assert_eq!(outcome.imported.len(), 1);
        assert_eq!(outcome.imported[0].title, "ok.txt");
        let reasons: Vec<&str> = outcome.skipped.iter().map(|s| s.reason.as_str()).collect();
        assert_eq!(reasons.len(), 3);
        assert!(reasons[0].contains("Folder"));
        assert!(reasons[1].contains("tidak ditemukan"));
        assert!(reasons[2].contains("melebihi batas"));

        // Tidak ada sisa folder sementara.
        let leftovers = fs::read_dir(tmp.path().join("shelf").join("files")).unwrap().count();
        assert_eq!(leftovers, 1);
    }

    #[test]
    fn progress_is_reported_per_file_starting_at_one() {
        let tmp = TempDir::new("progress");
        let a = write_file(tmp.path(), "a.txt", b"1");
        let b = write_file(tmp.path(), "b.txt", b"2");
        let state = state(&tmp);

        let mut seen = Vec::new();
        import_paths(&state, &[a, b], |p| seen.push((p.index, p.count, p.file_name.clone()))).unwrap();
        assert_eq!(seen, [(1, 2, "a.txt".to_string()), (2, 2, "b.txt".to_string())]);
    }

    #[test]
    fn delete_removes_managed_folder_and_row_but_not_original() {
        let tmp = TempDir::new("delete");
        let source = write_file(tmp.path(), "x.txt", b"isi");
        let state = state(&tmp);
        let id = import(&state, &[source.clone()]).imported[0].id;
        let stored = stored_file(&state, id);

        delete_item(&state, id).unwrap();

        assert!(!stored.exists() && !stored.parent().unwrap().exists());
        assert!(source.exists()); // asli aman
        assert!(state.with_db(|db| db.get(id)).is_err());
        assert!(delete_item(&state, id).is_err()); // sudah tidak ada
    }

    #[test]
    fn deleting_note_does_not_touch_disk() {
        let tmp = TempDir::new("delete-note");
        let state = state(&tmp);
        let id = state
            .with_db(|db| db.add_text(ItemKind::Note, "a", "b", None, now_ms()))
            .unwrap()
            .id;
        delete_item(&state, id).unwrap();
    }

    #[test]
    fn deleting_with_corrupt_stored_path_removes_nothing_on_disk() {
        let tmp = TempDir::new("corrupt");
        let victim = write_file(tmp.path(), "milik-pengguna/penting.txt", b"jangan hapus");
        let state = state(&tmp);

        // Baris yang path-nya diarahkan keluar dari penyimpanan.
        let id = state
            .with_db(|db| {
                let file = NewFile { title: "x", file_name: "x", source_path: None, extension: None, size_bytes: 1 };
                Ok(db.insert_file(&file, now_ms(), |_| Ok("../../milik-pengguna/penting.txt".to_string()))?.id)
            })
            .unwrap();

        delete_item(&state, id).unwrap();
        assert!(victim.exists());
    }

    #[test]
    fn purge_removes_expired_and_keeps_pinned() {
        let tmp = TempDir::new("purge");
        let a = write_file(tmp.path(), "a.txt", b"1");
        let b = write_file(tmp.path(), "b.txt", b"2");
        let state = state(&tmp);

        let items = import(&state, &[a, b]).imported;
        let (old_id, pinned_id) = (items[0].id, items[1].id);
        state.with_db(|db| db.set_pinned(pinned_id, true, now_ms())).unwrap();
        let (old_file, pinned_file) = (stored_file(&state, old_id), stored_file(&state, pinned_id));

        assert_eq!(purge_expired(&state, now_ms()).unwrap(), PurgeReport::default()); // belum waktunya

        let report = purge_expired(&state, now_ms() + 8 * DAY).unwrap();
        assert_eq!(report, PurgeReport { purged: 1, failed: 0 });
        assert!(!old_file.exists());
        assert!(pinned_file.exists());
        assert!(state.with_db(|db| db.get(old_id)).is_err());
        assert!(state.with_db(|db| db.get(pinned_id)).is_ok());
    }

    #[test]
    fn sweep_removes_rows_without_files_and_folders_without_rows() {
        let tmp = TempDir::new("sweep-ops");
        let source = write_file(tmp.path(), "baik.txt", b"1");
        let state = state(&tmp);
        let good_id = import(&state, &[source]).imported[0].id;

        // Baris yang filenya tidak ada.
        let ghost_id = state
            .with_db(|db| {
                let file = NewFile { title: "hantu", file_name: "hantu.txt", source_path: None, extension: None, size_bytes: 1 };
                Ok(db.insert_file(&file, now_ms(), |id| Ok(format!("files/{id}/hantu.txt")))?.id)
            })
            .unwrap();

        // Folder tanpa baris dan sisa impor lama.
        let files = tmp.path().join("shelf").join("files");
        fs::create_dir_all(files.join("9999")).unwrap();
        fs::create_dir_all(files.join(".incoming-1-0")).unwrap();

        let report = sweep_orphans(&state).unwrap();
        assert_eq!(report, SweepReport { rows_removed: 1, dirs_removed: 2 });
        assert!(state.with_db(|db| db.get(ghost_id)).is_err());
        assert!(state.with_db(|db| db.get(good_id)).is_ok());
        assert!(stored_file(&state, good_id).is_file());
        assert!(!files.join("9999").exists() && !files.join(".incoming-1-0").exists());
    }

    #[test]
    fn file_target_validates_kind_and_existence() {
        let tmp = TempDir::new("target");
        let source = write_file(tmp.path(), "x.EXE", b"MZ");
        let state = state(&tmp);

        let id = import(&state, &[source]).imported[0].id;
        let target = file_target(&state, id).unwrap();
        assert!(target.path.is_file());
        assert_eq!(target.extension.as_deref(), Some("exe")); // huruf kecil, siap dicek daftar berisiko

        let note = state.with_db(|db| db.add_text(ItemKind::Note, "n", "x", None, now_ms())).unwrap();
        assert!(file_target(&state, note.id).is_err());

        fs::remove_file(&target.path).unwrap(); // dihapus dari luar aplikasi
        assert!(file_target(&state, id).unwrap_err().contains("tidak ditemukan"));
    }

    #[test]
    fn unavailable_state_reports_instead_of_panicking() {
        let state = ShelfState::unavailable("disk rusak".into());
        assert!(state.with_db(|db| db.settings()).unwrap_err().contains("disk rusak"));
        assert!(import_paths(&state, &[], |_| {}).is_err());
        assert!(delete_item(&state, 1).is_err());
    }
}