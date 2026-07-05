-- ============================================================
-- Migration: 006_add_dibatalkan_status_event_volunteer
-- Deskripsi : Menambahkan nilai 'DIBATALKAN' pada enum status
--             event_volunteer, untuk fitur pembatalan penugasan
--             volunteer (soft-cancel via DELETE
--             /events/:id/volunteers/:volunteerId).
--
--             Konsisten dengan pola soft-delete modul lain
--             (jemaat, cell group, volunteer type): baris penugasan
--             tidak dihapus, hanya status yang diubah — listing
--             volunteer aktif (WHERE status = 'AKTIF') otomatis
--             tidak menampilkannya lagi.
-- ============================================================

ALTER TABLE event_volunteer
  MODIFY COLUMN status ENUM('AKTIF','DIGANTIKAN','BERTUGAS_PARSIAL','DIBATALKAN')
  NOT NULL DEFAULT 'AKTIF';
