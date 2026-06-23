-- Migration 003: Tambah tabel notifications untuk notifikasi in-app ke Leader
-- Sesuai BAGIAN 10 dokumen GODS DNA CMS

CREATE TABLE IF NOT EXISTS notifications (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT NOT NULL,              -- Leader yang menerima notifikasi
  jenis         VARCHAR(100) NOT NULL,        -- Tipe notifikasi (LOGIN_GAGAL_BERULANG, dll)
  judul         VARCHAR(255) NOT NULL,
  pesan         TEXT NOT NULL,
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, is_read);