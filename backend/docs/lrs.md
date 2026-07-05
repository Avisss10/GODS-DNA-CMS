# LRS — GODS DNA CMS

LRS (Logical Record Structure) diturunkan dari ERD (lihat `erd.md`).
Setiap tabel ditampilkan hanya dengan PK dan FK-nya — atribut non-key
tetap mengikuti definisi di ERD/BAGIAN 0 dokumen spesifikasi, namun
tidak diulang di sini agar fokus pada struktur relasi.

Catatan (migration 005): atribut non-key `jemaat.nama`, `jemaat.tgl_lahir`,
dan `jemaat.jenis_kelamin` kini bertipe TEXT berisi ciphertext AES-256-CBC,
masing-masing dengan kolom IV pendamping `nama_iv`, `tgl_lahir_iv`,
`jenis_kelamin_iv` (VARCHAR(32) NULL) — pola sama dengan `no_hp_iv`.
Lihat spesifikasi lengkap di `erd.md` dan `src/database/schema.sql`.

Notasi kardinalitas: `1 : N` dibaca "1 baris di tabel referensi
berelasi dengan N baris di tabel pemilik FK". `1 : 1` berarti relasi
satu-ke-satu (FK bersifat unique).

```mermaid
erDiagram
    USERS {
        int id PK
    }

    JEMAAT {
        int id PK
    }

    CELL_GROUP {
        int id PK
        int leader_id FK
    }

    CELL_GROUP_MEMBERS {
        int id PK
        int cg_id FK
        int jemaat_id FK
    }

    CG_MEETING {
        int id PK
        int cg_id FK
        int created_by FK
    }

    CG_MEETING_PHOTOS {
        int id PK
        int meeting_id FK
        int uploaded_by FK
    }

    CG_ABSENSI {
        int id PK
        int meeting_id FK
        int jemaat_id FK
    }

    VOLUNTEER_JENIS {
        int id PK
    }

    VOLUNTEER_MEMBERS {
        int id PK
        int jemaat_id FK
        int volunteer_type_id FK
    }

    EVENT {
        int id PK
        int created_by FK
    }

    EVENT_VOLUNTEER_NEEDS {
        int id PK
        int event_id FK
        int volunteer_type_id FK
    }

    EVENT_VOLUNTEER {
        int id PK
        int event_id FK
        int jemaat_id FK
        int jenis_id FK
        int replaced_by FK
    }

    EVENT_ATTENDANCES {
        int id PK
        int event_id FK
        int jemaat_id FK
        int voided_by FK
    }

    EVENT_KEHADIRAN {
        int id PK
        int event_id FK
    }

    AUDIT_LOGS {
        int id PK
        int user_id FK
    }

    NOTIFICATIONS {
        int id PK
        int user_id FK
    }

    USERS ||--o{ CG_MEETING : "created_by"
    USERS ||--o{ CG_MEETING_PHOTOS : "uploaded_by"
    USERS ||--o{ EVENT : "created_by"
    USERS ||--o{ EVENT_ATTENDANCES : "voided_by"
    USERS ||--o{ AUDIT_LOGS : "user_id"
    USERS ||--o{ NOTIFICATIONS : "user_id"

    JEMAAT ||--o{ CELL_GROUP : "leader_id"
    CELL_GROUP ||--o{ CELL_GROUP_MEMBERS : "cg_id"
    JEMAAT ||--o{ CELL_GROUP_MEMBERS : "jemaat_id"
    CELL_GROUP ||--o{ CG_MEETING : "cg_id"
    CG_MEETING ||--o{ CG_MEETING_PHOTOS : "meeting_id"
    CG_MEETING ||--o{ CG_ABSENSI : "meeting_id"
    JEMAAT ||--o{ CG_ABSENSI : "jemaat_id"

    VOLUNTEER_JENIS ||--o{ VOLUNTEER_MEMBERS : "volunteer_type_id"
    JEMAAT ||--o{ VOLUNTEER_MEMBERS : "jemaat_id"

    EVENT ||--o{ EVENT_VOLUNTEER_NEEDS : "event_id"
    VOLUNTEER_JENIS ||--o{ EVENT_VOLUNTEER_NEEDS : "volunteer_type_id"
    EVENT ||--o{ EVENT_VOLUNTEER : "event_id"
    JEMAAT ||--o{ EVENT_VOLUNTEER : "jemaat_id"
    VOLUNTEER_JENIS ||--o{ EVENT_VOLUNTEER : "jenis_id"
    JEMAAT ||--o{ EVENT_VOLUNTEER : "replaced_by"
    EVENT ||--o{ EVENT_ATTENDANCES : "event_id"
    JEMAAT ||--o{ EVENT_ATTENDANCES : "jemaat_id"
    EVENT ||--o| EVENT_KEHADIRAN : "event_id"
```

## Daftar Relasi Foreign Key (24 relasi)

| No | Kolom FK | Referensi | Kardinalitas | Nullable | Keterangan |
|----|----------|-----------|--------------|----------|------------|
| 1 | `cell_group.leader_id` | `jemaat.id` | 1 : N | Ya | Satu jemaat bisa jadi leader CG; NULL jika CG belum punya leader (ON DELETE SET NULL) |
| 2 | `cell_group_members.cg_id` | `cell_group.id` | 1 : N | Tidak | Satu CG punya banyak anggota |
| 3 | `cell_group_members.jemaat_id` | `jemaat.id` | 1 : N | Tidak | Satu jemaat bisa anggota banyak CG (multi-CG, BAGIAN 3.2) |
| 4 | `cg_meeting.cg_id` | `cell_group.id` | 1 : N | Tidak | Satu CG punya banyak meeting |
| 5 | `cg_meeting.created_by` | `users.id` | 1 : N | Tidak | Satu user membuat banyak meeting |
| 6 | `cg_meeting_photos.meeting_id` | `cg_meeting.id` | 1 : N | Tidak | Satu meeting punya maks 10 foto (BAGIAN 3.3) |
| 7 | `cg_meeting_photos.uploaded_by` | `users.id` | 1 : N | Tidak | Satu user upload banyak foto |
| 8 | `cg_absensi.meeting_id` | `cg_meeting.id` | 1 : N | Tidak | Satu meeting punya banyak baris absensi |
| 9 | `cg_absensi.jemaat_id` | `jemaat.id` | 1 : N | Tidak | Satu jemaat punya banyak riwayat absensi |
| 10 | `volunteer_members.jemaat_id` | `jemaat.id` | 1 : N | Tidak | Satu jemaat daftar ke banyak jenis volunteer |
| 11 | `volunteer_members.volunteer_type_id` | `volunteer_jenis.id` | 1 : N | Tidak | Satu jenis volunteer punya banyak anggota |
| 12 | `event.created_by` | `users.id` | 1 : N | Tidak | Satu user membuat banyak event |
| 13 | `event_volunteer_needs.event_id` | `event.id` | 1 : N | Tidak | Satu event punya banyak baris kebutuhan volunteer |
| 14 | `event_volunteer_needs.volunteer_type_id` | `volunteer_jenis.id` | 1 : N | Tidak | Satu jenis volunteer dibutuhkan di banyak event |
| 15 | `event_volunteer.event_id` | `event.id` | 1 : N | Tidak | Satu event punya banyak assignment |
| 16 | `event_volunteer.jemaat_id` | `jemaat.id` | 1 : N | Tidak | Satu jemaat punya banyak assignment (lintas event) |
| 17 | `event_volunteer.jenis_id` | `volunteer_jenis.id` | 1 : N | Tidak | Satu jenis volunteer dipakai di banyak assignment |
| 18 | `event_volunteer.replaced_by` | `jemaat.id` | 1 : N | Ya | Jemaat pengganti (BAGIAN 5.6 CASE A/B); NULL jika belum ada penggantian |
| 19 | `event_attendances.event_id` | `event.id` | 1 : N | Tidak | Satu event punya banyak baris kehadiran volunteer |
| 20 | `event_attendances.jemaat_id` | `jemaat.id` | 1 : N | Tidak | Satu jemaat punya banyak riwayat bertugas |
| 21 | `event_attendances.voided_by` | `users.id` | 1 : N | Ya | NULL jika belum di-void (rule #11, BAGIAN 12) |
| 22 | `event_kehadiran.event_id` | `event.id` | 1 : 1 | Tidak | UPSERT per event_id (BAGIAN 5.8) → unique constraint |
| 23 | `audit_logs.user_id` | `users.id` | 1 : N | Ya | NULL jika user sudah dihapus (ON DELETE SET NULL) |
| 24 | `notifications.user_id` | `users.id` | 1 : N | Tidak | Notifikasi dikirim ke user LEADER tertentu |

## Tabel Tanpa FK

- `users`
- `jemaat`
- `volunteer_jenis`