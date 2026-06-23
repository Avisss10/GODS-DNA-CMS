# ERD — GODS DNA CMS

Diagram ini merepresentasikan 16 tabel utama sesuai BAGIAN 0 dokumen
spesifikasi (ALUR SISTEM LENGKAP — GODS DNA CMS).

Tipe data pada diagram ini bersifat konseptual (int, varchar, text, date,
datetime, boolean, json, enum). Tipe data SQL final (panjang VARCHAR,
INT vs BIGINT, dsb) ditentukan di Step 6 — Database Schema.

```mermaid
erDiagram
    USERS {
        int id PK
        varchar username
        varchar password_hash
        enum peran
        boolean aktif
        datetime created_at
        datetime last_login_at
    }

    JEMAAT {
        int id PK
        varchar nama
        date tgl_lahir
        enum jenis_kelamin
        varchar no_hp
        varchar no_hp_iv
        varchar alamat
        varchar alamat_iv
        json media_sosial
        varchar media_sosial_iv
        date tgl_bergabung
        boolean is_active
        boolean is_new_member
        date new_member_until
        boolean is_non_cg
        int skor_keaktifan
        enum status_keaktifan
        datetime created_at
        datetime updated_at
        datetime deleted_at
    }

    CELL_GROUP {
        int id PK
        varchar nama
        text deskripsi
        int leader_id FK
        boolean is_active
        datetime created_at
        datetime deleted_at
    }

    CELL_GROUP_MEMBERS {
        int id PK
        int cg_id FK
        int jemaat_id FK
        datetime joined_at
        datetime left_at
    }

    CG_MEETING {
        int id PK
        int cg_id FK
        varchar judul
        enum jenis
        datetime waktu_mulai
        datetime waktu_selesai
        text catatan
        int created_by FK
        datetime created_at
    }

    CG_MEETING_PHOTOS {
        int id PK
        int meeting_id FK
        varchar file_path
        int file_size_kb
        datetime uploaded_at
        int uploaded_by FK
    }

    CG_ABSENSI {
        int id PK
        int meeting_id FK
        int jemaat_id FK
        boolean hadir
        datetime created_at
    }

    VOLUNTEER_JENIS {
        int id PK
        varchar nama
        text deskripsi
        boolean is_active
    }

    VOLUNTEER_MEMBERS {
        int id PK
        int jemaat_id FK
        int volunteer_type_id FK
        datetime joined_at
        boolean is_active
    }

    EVENT {
        int id PK
        varchar judul
        varchar jenis
        datetime waktu_mulai
        datetime waktu_selesai
        text deskripsi
        enum status
        enum absensi_status
        int created_by FK
        datetime created_at
        datetime updated_at
    }

    EVENT_VOLUNTEER_NEEDS {
        int id PK
        int event_id FK
        int volunteer_type_id FK
        int kuota
    }

    EVENT_VOLUNTEER {
        int id PK
        int event_id FK
        int jemaat_id FK
        int jenis_id FK
        enum status
        enum replacement_timing
        int replaced_by FK
        text alasan
        int durasi_menit
        datetime created_at
    }

    EVENT_ATTENDANCES {
        int id PK
        int event_id FK
        int jemaat_id FK
        boolean is_voided
        text void_reason
        int voided_by FK
        datetime voided_at
        datetime created_at
    }

    EVENT_KEHADIRAN {
        int id PK
        int event_id FK
        int total_hadir
        int jemaat_baru
        datetime created_at
    }

    AUDIT_LOGS {
        int id PK
        int user_id FK
        varchar aksi
        varchar modul
        int object_id
        json data_sebelum
        json data_sesudah
        varchar hmac_signature
        datetime created_at
    }

    NOTIFICATIONS {
        int id PK
        int user_id FK
        varchar jenis
        varchar judul
        text pesan
        boolean is_read
        datetime created_at
    }

    %% Relasi USERS
    USERS ||--o{ CG_MEETING : "membuat (created_by)"
    USERS ||--o{ CG_MEETING_PHOTOS : "mengunggah (uploaded_by)"
    USERS ||--o{ EVENT : "membuat (created_by)"
    USERS ||--o{ EVENT_ATTENDANCES : "void (voided_by)"
    USERS ||--o{ AUDIT_LOGS : "melakukan aksi (user_id)"
    USERS ||--o{ NOTIFICATIONS : "menerima (user_id)"

    %% Relasi JEMAAT - CELL GROUP
    JEMAAT ||--o{ CELL_GROUP : "memimpin (leader_id)"
    CELL_GROUP ||--o{ CELL_GROUP_MEMBERS : "memiliki anggota"
    JEMAAT ||--o{ CELL_GROUP_MEMBERS : "menjadi anggota CG"
    CELL_GROUP ||--o{ CG_MEETING : "mengadakan"
    CG_MEETING ||--o{ CG_MEETING_PHOTOS : "memiliki dokumentasi"
    CG_MEETING ||--o{ CG_ABSENSI : "memiliki absensi"
    JEMAAT ||--o{ CG_ABSENSI : "hadir pada meeting"

    %% Relasi VOLUNTEER
    VOLUNTEER_JENIS ||--o{ VOLUNTEER_MEMBERS : "memiliki anggota terdaftar"
    JEMAAT ||--o{ VOLUNTEER_MEMBERS : "terdaftar sebagai"

    %% Relasi EVENT
    EVENT ||--o{ EVENT_VOLUNTEER_NEEDS : "membutuhkan jenis volunteer"
    VOLUNTEER_JENIS ||--o{ EVENT_VOLUNTEER_NEEDS : "dibutuhkan untuk event"
    EVENT ||--o{ EVENT_VOLUNTEER : "memiliki assignment"
    JEMAAT ||--o{ EVENT_VOLUNTEER : "ditugaskan sebagai volunteer"
    VOLUNTEER_JENIS ||--o{ EVENT_VOLUNTEER : "jenis tugas"
    JEMAAT ||--o{ EVENT_VOLUNTEER : "menggantikan (replaced_by)"
    EVENT ||--o{ EVENT_ATTENDANCES : "mencatat volunteer bertugas"
    JEMAAT ||--o{ EVENT_ATTENDANCES : "tercatat bertugas"
    EVENT ||--o| EVENT_KEHADIRAN : "memiliki rekap kehadiran agregat"
```

## Daftar 16 Tabel Utama

| No | Tabel | Deskripsi Singkat |
|----|-------|-------------------|
| 1 | `users` | Akun login ADMIN/LEADER |
| 2 | `jemaat` | Data jemaat, termasuk field terenkripsi & skor keaktifan |
| 3 | `cell_group` | Master data Cell Group (CG) |
| 4 | `cell_group_members` | Relasi many-to-many jemaat ↔ CG |
| 5 | `cg_meeting` | Catatan meeting per CG |
| 6 | `cg_meeting_photos` | Foto dokumentasi meeting (maks 10, dikompres) |
| 7 | `cg_absensi` | Absensi per jemaat per meeting CG |
| 8 | `volunteer_jenis` | Master jenis volunteer (Multimedia, Usher, dll) |
| 9 | `volunteer_members` | Pendaftaran jemaat ke jenis volunteer |
| 10 | `event` | Data event + siklus status (DRAFT→...→DIARSIPKAN) |
| 11 | `event_volunteer_needs` | Kebutuhan jumlah volunteer per jenis per event |
| 12 | `event_volunteer` | Assignment volunteer ke event (termasuk penggantian) |
| 13 | `event_attendances` | Catatan volunteer yang bertugas di event |
| 14 | `event_kehadiran` | Rekap agregat kehadiran event (total_hadir, jemaat_baru) |
| 15 | `audit_logs` | Log audit append-only dengan HMAC |
| 16 | `notifications` | Notifikasi in-app untuk LEADER (LOGIN_GAGAL_BERULANG, dll) |

## Catatan Penamaan

- Seluruh nama tabel di atas diambil **persis** dari BAGIAN 0 dokumen
  (entitas #1–#15), termasuk konsistensi singular/plural per tabel
  (`cell_group`, `cg_meeting` = singular; `cell_group_members`,
  `event_volunteer_needs`, `audit_logs` = plural — sesuai apa adanya
  di dokumen).
- Relasi `EVENT ||--o| EVENT_KEHADIRAN` digambar sebagai 1-ke-(0..1)
  karena BAGIAN 5.8 menyatakan proses INSERT/UPDATE bersifat
  **UPSERT berdasarkan event_id** → maksimal satu baris per event.
- `EVENT_VOLUNTEER.replaced_by` direlasikan ke `JEMAAT` (bukan ke
  `EVENT_VOLUNTEER` lain), karena BAGIAN 5.6 menulis
  `replaced_by=new_jemaat_id`.