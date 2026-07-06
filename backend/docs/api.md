# Dokumentasi API — GODS DNA CMS Backend

Semua endpoint (kecuali yang ditandai publik) memerlukan autentikasi via cookie httpOnly `access_token` yang diterbitkan `POST /api/auth/login`. Peran: `LEADER`, `ADMIN`. Kolom **Role** = peran yang lolos middleware; "Semua" berarti semua user login (tidak ada `requireRole`). Error dikembalikan sebagai `{ "message": "..." }` (Bahasa Indonesia).

Rate limit: 300 req/15 menit per IP untuk semua `/api`; khusus `POST /api/auth/login` dan `POST /api/auth/refresh` 20 req/15 menit.

## Health

| Method | Path | Role | Keterangan |
|---|---|---|---|
| GET | `/health` | Publik | Cek server hidup |

Respons: `{ "status": "ok" }`

## Auth & User Management

### POST `/api/auth/login` (publik)
Body: `{ "username": string, "password": string }`
- 200: `{ "peran": "LEADER"|"ADMIN", "nama": string }` + set cookie `access_token` (8 jam) & `refresh_token` (7 hari), httpOnly + sameSite strict + secure (production).
- 401 kredensial salah · 403 akun nonaktif · 429 akun dikunci (3x gagal / 15 menit).
- Login dari IP baru memicu notifikasi `LOGIN_IP_BARU` ke Leader.

### POST `/api/auth/logout` (semua)
- 200: `{ "message": "Logout berhasil" }`, token di-blacklist, cookie dihapus.

### POST `/api/auth/refresh` (publik, butuh cookie `refresh_token`)
- 200: `{ "message": "Access token diperbarui" }` + cookie `access_token` baru.
- 401 refresh token tidak ada/tidak valid/kedaluwarsa.

### GET `/api/auth/me` (semua)
- 200: `{ "userId": number, "peran": string, "nama": string }` (data segar dari DB).
- 401 jika user tidak ditemukan atau nonaktif.

### User management (LEADER only)

| Method | Path | Body/Query | Respons singkat |
|---|---|---|---|
| GET | `/api/users` | — | `[{ id, username, peran, aktif, last_login_at }]` |
| GET | `/api/users/admins` | — | `[{ id, username, aktif, last_login_at }]` (ADMIN saja) |
| POST | `/api/users` | `{ username, password, peran }` | 201 `{ id, username, peran }` · 409 username terdaftar |
| PUT | `/api/users/:id/reset-password` | `{ newPassword }` (min 8) | 200 · 403 target bukan ADMIN · 404 |
| PATCH | `/api/users/:id/status` | `{ aktif: boolean }` | 200 · 400 jika menonaktifkan LEADER aktif terakhir |

## Jemaat (semua role)

| Method | Path | Body/Query | Respons singkat |
|---|---|---|---|
| GET | `/api/jemaat` | `?search&limit&offset` | `[{ id, nama, ... }]` (field sensitif tidak disertakan) |
| POST | `/api/jemaat` | `{ nama, tgl_lahir, jenis_kelamin, tgl_bergabung, no_hp?, alamat?, confirmed? }` | 201 · 409 + `duplicates` jika ada kandidat duplikat (kirim `confirmed: true` untuk lanjut) |
| GET | `/api/jemaat/:id` | — | Detail jemaat · 404 |
| GET | `/api/jemaat/:id/full` | — | Detail lengkap dengan `no_hp`, `alamat`, `media_sosial` terdekripsi, tanpa kolom internal ciphertext/IV (tercatat 1 audit log VIEW_SENSITIVE field `ALL`) · 404 |
| GET | `/api/jemaat/:id/sensitive/:field` | field: `no_hp`/`alamat`/dll | `{ field, value }` terdekripsi (tercatat di audit log) |
| GET | `/api/jemaat/:id/cell-groups` | — | Riwayat CG jemaat |
| GET | `/api/jemaat/:id/events` | — | Riwayat event jemaat |
| PUT | `/api/jemaat/:id` | field parsial | 200 jemaat terbaru · 404 |
| DELETE | `/api/jemaat/:id` | — | 200 (soft-delete) · 404 |

## Cell Group (semua role)

| Method | Path | Body/Query | Respons singkat |
|---|---|---|---|
| POST | `/api/cell-groups` | `{ nama, leaderId, deskripsi? }` | 201 `{ id }` · 400 |
| GET | `/api/cell-groups` | `?limit&offset` | `[{ id, nama, deskripsi, nama_leader, jumlah_anggota, ... }]` |
| GET | `/api/cell-groups/:id` | — | Detail CG · 404 |
| PUT | `/api/cell-groups/:id` | `{ nama?, deskripsi?, leader_id? }` | 200 · 400 tanpa field · 404 |
| DELETE | `/api/cell-groups/:id` | — | 200 (nonaktif) · 409 masih ada anggota aktif |
| PATCH | `/api/cell-groups/:id/activate` | — | 200 (reaktivasi) · 404 tidak ada · 409 sudah aktif |
| GET | `/api/cell-groups/:id/members` | — | `[{ id, nama, joined_at }]` |
| POST | `/api/cell-groups/:id/members` | `{ jemaatId }` | 201 · 409 sudah anggota aktif |
| DELETE | `/api/cell-groups/:id/members/:jemaatId` | — | 200 (set left_at) |
| GET | `/api/cell-groups/:id/meetings` | `?limit&offset` | `[{ id, judul, jenis, waktu_mulai, jumlah_foto, ... }]` |
| POST | `/api/cell-groups/:id/meetings` | `{ judul, jenis: ONLINE\|OFFLINE, waktuMulai, waktuSelesai, catatan? }` | 201 `{ id }` · 400 CG tanpa leader aktif |
| GET | `/api/cell-groups/meetings/:meetingId` | — | Detail meeting · 404 |
| PUT | `/api/cell-groups/meetings/:meetingId` | `{ judul?, jenis?, waktu_mulai?, waktu_selesai?, catatan? }` | 200 · 400 waktu tidak valid |
| POST | `/api/cell-groups/meetings/:meetingId/photos` | multipart `photo` (JPEG/PNG/WebP, ≤10MB) | 201 `{ id, sizeKb }` (dikompres ≤500KB) · 400 tipe/ukuran salah atau sudah 5 foto |
| GET | `/api/cell-groups/meetings/:meetingId/photos` | — | `[{ id, file_size_kb, uploaded_by, created_at }]` |
| GET | `/api/cell-groups/photos/:photoId` | — | Stream file gambar (Content-Type image/*) · 404 |
| DELETE | `/api/cell-groups/photos/:photoId` | — | 200 (hapus record + file) · 404 |
| GET | `/api/cell-groups/meetings/:meetingId/active-members` | — | Anggota aktif saat meeting berlangsung |
| POST | `/api/cell-groups/meetings/:meetingId/absensi` | `{ absensi: [{ jemaatId, hadir: boolean }] }` | 200 (upsert per jemaat) |

## Volunteer

| Method | Path | Role | Body | Respons singkat |
|---|---|---|---|---|
| POST | `/api/volunteer-types` | ADMIN, LEADER | `{ nama, deskripsi? }` | 201 |
| GET | `/api/volunteer-types` | Semua | — | List SEMUA jenis volunteer (aktif & nonaktif, kolom `is_active` pembeda) |
| PUT | `/api/volunteer-types/:id` | ADMIN, LEADER | `{ nama?, deskripsi? }` | 200 |
| DELETE | `/api/volunteer-types/:id` | ADMIN, LEADER | — | 200 (nonaktif) |
| PATCH | `/api/volunteer-types/:id/activate` | ADMIN, LEADER | — | 200 (reaktivasi) · 404 tidak ada · 409 sudah aktif |
| GET | `/api/volunteer-types/:id/members` | Semua | — | Anggota aktif jenis tersebut |
| GET | `/api/jemaat/:jemaatId/volunteer` | Semua | — | Registrasi volunteer jemaat |
| POST | `/api/jemaat/:jemaatId/volunteer` | Semua | `{ volunteerTypeId }` | 201 |
| DELETE | `/api/jemaat/:jemaatId/volunteer/:volunteerTypeId` | Semua | — | 200 |

## Event

| Method | Path | Role | Body/Query | Respons singkat |
|---|---|---|---|---|
| POST | `/api/events` | ADMIN, LEADER | `{ judul, jenis, waktu_mulai, waktu_selesai, deskripsi? }` | 201 (status awal DRAFT) |
| GET | `/api/events` | Semua | `?status` | List event |
| GET | `/api/events/:id` | Semua | — | Detail event · 404 |
| PUT | `/api/events/:id` | ADMIN, LEADER | field parsial | 200 |
| PATCH | `/api/events/:id/status` | ADMIN, LEADER | `{ status }` (DRAFT→PUBLISHED→AKTIF→SELESAI→DIARSIPKAN) | 200 · 400 transisi tidak valid |
| POST | `/api/events/:id/kehadiran` | Semua | `{ total_hadir, jemaat_baru? }` | 200 (upsert rekap) |
| GET | `/api/events/:id/kehadiran` | Semua | — | `{ event_id, total_hadir, jemaat_baru, ... }` · 404 belum diinput |
| GET | `/api/events/:id/volunteers` | Semua | — | Penugasan volunteer aktif |
| POST | `/api/events/:id/volunteers` | Semua | `{ jemaat_id, jenis_id }` | 201 · 409 kuota penuh |
| PATCH | `/api/events/:id/volunteers/:volunteerId/replace` | Semua | `{ replacement_timing: SEBELUM_EVENT\|TENGAH_EVENT, replaced_by, alasan, durasi_menit? }` | 200 · 400/404/409 |
| DELETE | `/api/events/:id/volunteers/:volunteerId` | Semua | — | 200 (batalkan penugasan) |
| GET | `/api/events/:id/volunteer-needs` | Semua | — | `[{ id, volunteer_type_id, nama_jenis, kuota, jumlah_terisi }]` (kosong jika belum diset) · 404 event |
| PUT | `/api/events/:id/volunteer-needs` | ADMIN, LEADER | `{ needs: [{ jenis_id, kuota ≥ 1 }] }` | Upsert penuh kuota per jenis; jenis yang tidak dikirim dihapus (tanpa batas kuota lagi) · 400 jenis nonaktif/kuota tidak valid · 409 status event final, kuota < penugasan aktif, atau hapus baris yang masih terisi |
| GET | `/api/events/:id/suggest-volunteers/:jenisId` | Semua | — | Saran volunteer |

## Audit Log (LEADER only)

| Method | Path | Query | Respons singkat |
|---|---|---|---|
| GET | `/api/audit-logs` | `?modul&aksi&userId&objectId&startDate&endDate&limit&offset` | `[{ ..., hmac_valid, hmac_status }]` — baris rusak memicu notifikasi `AUDIT_TAMPERED` |
| GET | `/api/audit-logs/:id` | — | Satu baris + status HMAC · 404 |

## Notifikasi (LEADER only)

| Method | Path | Respons singkat |
|---|---|---|
| GET | `/api/notifications` | List notifikasi |
| GET | `/api/notifications/unread-count` | `{ count }` |
| PATCH | `/api/notifications/read-all` | 200 |
| PATCH | `/api/notifications/:id/read` | 200 |

## Laporan (semua role)

Format: `?format=xlsx|pdf` (default `xlsx`). Jika jumlah record < 500, file langsung dikirim (attachment). Jika ≥ 500, respons `{ "async": true, "token": "<uuid>" }` — unduh via endpoint download dalam 15 menit (token 1x pakai). Ekspor di luar jam 06:00–22:00 memicu notifikasi `EKSPOR_DATA_MALAM`. File sisa dibersihkan otomatis oleh job tiap 1 jam (file berumur > 30 menit).

| Method | Path | Query | Keterangan |
|---|---|---|---|
| GET | `/api/reports/jemaat` | `?format` | Selalu menyertakan semua field, dengan `no_hp`, `alamat` & `media_sosial` terdekripsi |
| GET | `/api/reports/event` | `?eventId&startDate&endDate&format` | Rekap kehadiran event |
| GET | `/api/reports/cg` | `?cgId&jemaatId&startDate&endDate&format` | Kehadiran CG |
| GET | `/api/reports/volunteer` | `?jemaatId&eventId&startDate&endDate&format` | Riwayat volunteer |
| GET | `/api/reports/analytics` | `?bulan=12&format` | Tren pertumbuhan |
| GET | `/api/reports/download/:token` | — | Publik (signed token); 404 token tidak valid/terpakai/kedaluwarsa |

## Scoring (LEADER only)

| Method | Path | Respons singkat |
|---|---|---|
| POST | `/api/scoring/run` | 200 `{ message, processed, skipped }` — juga berjalan otomatis tiap 02:00 waktu server |
