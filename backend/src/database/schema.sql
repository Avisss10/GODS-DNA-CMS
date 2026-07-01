-- ============================================================
-- GODS DNA CMS — Database Schema (DDL)
-- Target   : TiDB (MySQL-compatible syntax)
-- Charset  : utf8mb4
-- Sumber   : ERD (docs/erd.md) & LRS (docs/lrs.md)
-- ============================================================

-- ------------------------------------------------------------
-- 1. users
-- ------------------------------------------------------------
CREATE TABLE users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    peran           ENUM('LEADER','ADMIN') NOT NULL,
    aktif           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at   TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 2. jemaat
-- ------------------------------------------------------------
CREATE TABLE jemaat (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nama                VARCHAR(100) NOT NULL,
    tgl_lahir           DATE NOT NULL,
    jenis_kelamin       ENUM('L','P') NOT NULL,
    no_hp               TEXT NULL,
    no_hp_iv            VARCHAR(32) NULL,
    no_hp_hash          CHAR(64) NULL,
    alamat              TEXT NULL,
    alamat_iv           VARCHAR(32) NULL,
    media_sosial        TEXT NULL,
    media_sosial_iv     VARCHAR(32) NULL,
    tgl_bergabung       DATE NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_new_member       BOOLEAN NOT NULL DEFAULT TRUE,
    new_member_until    DATE NULL,
    is_non_cg           BOOLEAN NOT NULL DEFAULT TRUE,
    skor_keaktifan      TINYINT UNSIGNED NOT NULL DEFAULT 0,
    status_keaktifan    ENUM('AKTIF','KURANG_AKTIF','TIDAK_AKTIF','BELUM_CUKUP_DATA')
                        NOT NULL DEFAULT 'BELUM_CUKUP_DATA',
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMP NULL,

    INDEX idx_jemaat_nama_tgl_lahir (nama, tgl_lahir),
    INDEX idx_jemaat_is_active (is_active),
    INDEX idx_jemaat_status_keaktifan (status_keaktifan),
    INDEX idx_jemaat_no_hp_hash (no_hp_hash),

    CONSTRAINT chk_skor_keaktifan CHECK (skor_keaktifan BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 3. cell_group
-- ------------------------------------------------------------
CREATE TABLE cell_group (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nama        VARCHAR(100) NOT NULL,
    deskripsi   TEXT NULL,
    leader_id   INT UNSIGNED NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at  TIMESTAMP NULL,

    CONSTRAINT fk_cell_group_leader
        FOREIGN KEY (leader_id) REFERENCES jemaat(id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_cell_group_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 4. cell_group_members
-- ------------------------------------------------------------
CREATE TABLE cell_group_members (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cg_id       INT UNSIGNED NOT NULL,
    jemaat_id   INT UNSIGNED NOT NULL,
    joined_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at     TIMESTAMP NULL,

    CONSTRAINT fk_cgm_cell_group
        FOREIGN KEY (cg_id) REFERENCES cell_group(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_cgm_jemaat
        FOREIGN KEY (jemaat_id) REFERENCES jemaat(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_cgm_cg_jemaat (cg_id, jemaat_id),
    INDEX idx_cgm_jemaat_left_at (jemaat_id, left_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 5. cg_meeting
-- ------------------------------------------------------------
CREATE TABLE cg_meeting (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cg_id           INT UNSIGNED NOT NULL,
    judul           VARCHAR(150) NOT NULL,
    jenis           ENUM('ONLINE','OFFLINE') NOT NULL,
    waktu_mulai     DATETIME NOT NULL,
    waktu_selesai   DATETIME NOT NULL,
    catatan         TEXT NULL,
    created_by      INT UNSIGNED NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_cg_meeting_cell_group
        FOREIGN KEY (cg_id) REFERENCES cell_group(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_cg_meeting_created_by
        FOREIGN KEY (created_by) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_cg_meeting_cg_id (cg_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 6. cg_meeting_photos
-- ------------------------------------------------------------
CREATE TABLE cg_meeting_photos (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    meeting_id      INT UNSIGNED NOT NULL,
    file_path       VARCHAR(255) NOT NULL,
    file_size_kb    INT UNSIGNED NOT NULL,
    uploaded_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_by     INT UNSIGNED NOT NULL,

    CONSTRAINT fk_cgmp_meeting
        FOREIGN KEY (meeting_id) REFERENCES cg_meeting(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_cgmp_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_cgmp_meeting_id (meeting_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 7. cg_absensi
-- ------------------------------------------------------------
CREATE TABLE cg_absensi (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    meeting_id  INT UNSIGNED NOT NULL,
    jemaat_id   INT UNSIGNED NOT NULL,
    hadir       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_cg_absensi_meeting
        FOREIGN KEY (meeting_id) REFERENCES cg_meeting(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_cg_absensi_jemaat
        FOREIGN KEY (jemaat_id) REFERENCES jemaat(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    UNIQUE KEY uq_cg_absensi_meeting_jemaat (meeting_id, jemaat_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 8. volunteer_jenis
-- ------------------------------------------------------------
CREATE TABLE volunteer_jenis (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nama        VARCHAR(100) NOT NULL UNIQUE,
    deskripsi   TEXT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 9. volunteer_members
-- ------------------------------------------------------------
CREATE TABLE volunteer_members (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    jemaat_id           INT UNSIGNED NOT NULL,
    volunteer_type_id   INT UNSIGNED NOT NULL,
    joined_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_vm_jemaat
        FOREIGN KEY (jemaat_id) REFERENCES jemaat(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_vm_volunteer_jenis
        FOREIGN KEY (volunteer_type_id) REFERENCES volunteer_jenis(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    UNIQUE KEY uq_vm_jemaat_volunteer_type (jemaat_id, volunteer_type_id),
    INDEX idx_vm_jemaat_id (jemaat_id),
    INDEX idx_vm_volunteer_type_id (volunteer_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 10. event
-- ------------------------------------------------------------
CREATE TABLE event (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    judul           VARCHAR(150) NOT NULL,
    jenis           VARCHAR(50) NOT NULL,
    waktu_mulai     DATETIME NOT NULL,
    waktu_selesai   DATETIME NOT NULL,
    deskripsi       TEXT NULL,
    status          ENUM('DRAFT','PUBLISHED','AKTIF','SELESAI','DIARSIPKAN')
                    NOT NULL DEFAULT 'DRAFT',
    absensi_status  ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'CLOSED',
    created_by      INT UNSIGNED NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_event_created_by
        FOREIGN KEY (created_by) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT chk_event_waktu CHECK (waktu_selesai > waktu_mulai),

    INDEX idx_event_status (status),
    INDEX idx_event_waktu_mulai (waktu_mulai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 11. event_volunteer_needs
-- ------------------------------------------------------------
CREATE TABLE event_volunteer_needs (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id            INT UNSIGNED NOT NULL,
    volunteer_type_id   INT UNSIGNED NOT NULL,
    kuota               INT UNSIGNED NOT NULL,

    CONSTRAINT fk_evn_event
        FOREIGN KEY (event_id) REFERENCES event(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_evn_volunteer_jenis
        FOREIGN KEY (volunteer_type_id) REFERENCES volunteer_jenis(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    UNIQUE KEY uq_evn_event_jenis (event_id, volunteer_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 12. event_volunteer
-- ------------------------------------------------------------
CREATE TABLE event_volunteer (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id            INT UNSIGNED NOT NULL,
    jemaat_id           INT UNSIGNED NOT NULL,
    jenis_id            INT UNSIGNED NOT NULL,
    status              ENUM('AKTIF','DIGANTIKAN','BERTUGAS_PARSIAL') NOT NULL DEFAULT 'AKTIF',
    replacement_timing  ENUM('SEBELUM_EVENT','TENGAH_EVENT') NULL,
    replaced_by         INT UNSIGNED NULL,
    alasan              TEXT NULL,
    durasi_menit        INT UNSIGNED NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ev_event
        FOREIGN KEY (event_id) REFERENCES event(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ev_jemaat
        FOREIGN KEY (jemaat_id) REFERENCES jemaat(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ev_volunteer_jenis
        FOREIGN KEY (jenis_id) REFERENCES volunteer_jenis(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ev_replaced_by
        FOREIGN KEY (replaced_by) REFERENCES jemaat(id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_ev_event_jenis_status (event_id, jenis_id, status),
    INDEX idx_ev_jemaat_id (jemaat_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 13. event_attendances
-- ------------------------------------------------------------
CREATE TABLE event_attendances (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id    INT UNSIGNED NOT NULL,
    jemaat_id   INT UNSIGNED NOT NULL,
    is_voided   BOOLEAN NOT NULL DEFAULT FALSE,
    void_reason TEXT NULL,
    voided_by   INT UNSIGNED NULL,
    voided_at   TIMESTAMP NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ea_event
        FOREIGN KEY (event_id) REFERENCES event(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ea_jemaat
        FOREIGN KEY (jemaat_id) REFERENCES jemaat(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ea_voided_by
        FOREIGN KEY (voided_by) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_ea_event_id (event_id),
    INDEX idx_ea_jemaat_id (jemaat_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 14. event_kehadiran
-- ------------------------------------------------------------
CREATE TABLE event_kehadiran (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id    INT UNSIGNED NOT NULL UNIQUE,
    total_hadir INT UNSIGNED NOT NULL,
    jemaat_baru INT UNSIGNED NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ek_event
        FOREIGN KEY (event_id) REFERENCES event(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT chk_ek_jemaat_baru CHECK (jemaat_baru <= total_hadir)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 15. audit_logs
-- ------------------------------------------------------------
CREATE TABLE audit_logs (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NULL,
    aksi            VARCHAR(50) NOT NULL,
    modul           VARCHAR(50) NOT NULL,
    object_id       INT UNSIGNED NULL,
    data_sebelum    JSON NULL,
    data_sesudah    JSON NULL,
    hmac_signature  VARCHAR(64) NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_audit_user_id (user_id),
    INDEX idx_audit_modul (modul),
    INDEX idx_audit_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 16. notifications
-- ------------------------------------------------------------
CREATE TABLE notifications (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    jenis       VARCHAR(100) NOT NULL,
    judul       VARCHAR(255) NOT NULL,
    pesan       TEXT NOT NULL,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notif_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_notif_user_read (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- CATATAN: Privilege REVOKE untuk audit_logs append-only
-- (BAGIAN 8.3) memerlukan user DB dengan privilege GRANT,
-- berbeda konteks dari DDL CREATE TABLE di atas.
-- Akan diimplementasikan di Step 7 - Migration sebagai
-- script provisioning terpisah.
--
-- REVOKE UPDATE, DELETE ON gods_dna_cms.audit_logs FROM 'app_user'@'%';
-- ============================================================