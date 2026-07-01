-- ============================================================
-- Migration: 004_add_jemaat_no_hp_hash
-- Deskripsi : Menambahkan kolom no_hp_hash (SHA-256 hex, 64 char)
--             beserta index pada tabel jemaat — audit item 5.
--
--             Tujuan: pencarian duplikat nomor HP tidak lagi
--             memerlukan full-scan + dekripsi AES per baris.
--             no_hp_hash diisi dari nomor HP yang sudah dinormalkan
--             (buang non-digit) dan di-hash satu arah; enkripsi AES
--             no_hp/no_hp_iv tetap dipertahankan untuk menampilkan
--             kembali nomor aslinya.
--
-- Setelah migration ini dijalankan pada database yang sudah berisi
-- data, jalankan backfill satu kali:
--   node src/scripts/backfill-no-hp-hash.js
-- ============================================================

-- Catatan: dipisah menjadi dua statement ALTER karena TiDB tidak
-- mengizinkan ADD INDEX yang mereferensikan kolom yang baru
-- ditambahkan di statement ALTER yang sama.
ALTER TABLE jemaat ADD COLUMN no_hp_hash CHAR(64) NULL AFTER no_hp_iv;
ALTER TABLE jemaat ADD INDEX idx_jemaat_no_hp_hash (no_hp_hash);
