-- ============================================================
-- Migration: 005_encrypt_jemaat_identity
-- Deskripsi : Memperluas cakupan enkripsi AES-256-CBC ke kolom
--             identitas jemaat: nama, tgl_lahir, jenis_kelamin.
--
--             1. nama          : VARCHAR(100) -> TEXT (ciphertext hex
--                                lebih panjang dari nama asli)
--             2. tgl_lahir     : DATE -> TEXT (hasil enkripsi berupa
--                                string hex, bukan tanggal native SQL)
--             3. jenis_kelamin : ENUM('L','P') -> TEXT
--             4. Tambah kolom IV per field: nama_iv, tgl_lahir_iv,
--                jenis_kelamin_iv VARCHAR(32) NULL — pola sama persis
--                dengan no_hp_iv.
--
-- Catatan tipe kolom:
--   - Index idx_jemaat_nama_tgl_lahir (nama, tgl_lahir) HARUS dihapus:
--     kolom TEXT tidak bisa di-index tanpa prefix length, dan index
--     tersebut tidak lagi berguna karena nilai kolom kini ciphertext
--     acak (pencarian & deteksi duplikat pindah ke level aplikasi).
--   - tgl_lahir dan jenis_kelamin dikonversi via kolom sementara
--     (_txt) + copy + drop + rename, karena TiDB tidak mendukung
--     MODIFY COLUMN langsung dari ENUM (dan DATE pada sebagian versi)
--     ke TEXT. Nilai lama dipertahankan sebagai plaintext string
--     ('YYYY-MM-DD' / 'L'/'P') sampai backfill dijalankan.
--
-- Setelah migration ini dijalankan pada database yang sudah berisi
-- data, jalankan backfill terenkripsi satu kali (idempotent — hanya
-- memproses baris yang kolom _iv-nya masih NULL, aman diulang tanpa
-- dobel-enkripsi):
--   node src/scripts/backfill-encrypt-jemaat-identity.js
-- ============================================================

-- 0. Hapus index komposit yang bergantung pada nama (VARCHAR) dan
--    tgl_lahir (DATE) — tidak kompatibel dengan TEXT dan tidak lagi
--    relevan untuk ciphertext.
ALTER TABLE jemaat DROP INDEX idx_jemaat_nama_tgl_lahir;

-- 1. nama: VARCHAR(100) -> TEXT (lossless, MODIFY langsung didukung)
ALTER TABLE jemaat MODIFY COLUMN nama TEXT NOT NULL;

-- 2. tgl_lahir: DATE -> TEXT via kolom sementara.
--    DATE_FORMAT menjamin format 'YYYY-MM-DD' yang konsisten untuk
--    dibaca backfill (bukan format cast default yang bisa berbeda).
ALTER TABLE jemaat ADD COLUMN tgl_lahir_txt TEXT NULL AFTER tgl_lahir;
UPDATE jemaat SET tgl_lahir_txt = DATE_FORMAT(tgl_lahir, '%Y-%m-%d');
ALTER TABLE jemaat DROP COLUMN tgl_lahir;
ALTER TABLE jemaat CHANGE COLUMN tgl_lahir_txt tgl_lahir TEXT NOT NULL;

-- 3. jenis_kelamin: ENUM('L','P') -> TEXT via kolom sementara.
ALTER TABLE jemaat ADD COLUMN jenis_kelamin_txt TEXT NULL AFTER jenis_kelamin;
UPDATE jemaat SET jenis_kelamin_txt = jenis_kelamin;
ALTER TABLE jemaat DROP COLUMN jenis_kelamin;
ALTER TABLE jemaat CHANGE COLUMN jenis_kelamin_txt jenis_kelamin TEXT NOT NULL;

-- 4. Kolom IV per field (pola sama persis dengan no_hp_iv):
ALTER TABLE jemaat ADD COLUMN nama_iv VARCHAR(32) NULL AFTER nama;
ALTER TABLE jemaat ADD COLUMN tgl_lahir_iv VARCHAR(32) NULL AFTER tgl_lahir;
ALTER TABLE jemaat ADD COLUMN jenis_kelamin_iv VARCHAR(32) NULL AFTER jenis_kelamin;
