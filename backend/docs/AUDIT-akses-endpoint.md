# Audit Akses Endpoint — GODS DNA CMS Backend

> Dokumen ini adalah **inventaris kebijakan akses aktual** per endpoint, dibuat dari kode di `src/modules/*/**.routes.js` (bukan asumsi). Kolom "requireRole" kosong berarti endpoint bisa diakses **semua user login (LEADER dan ADMIN)**. Tidak ada perubahan kebijakan yang dilakukan — baris yang ditandai ⚠ adalah temuan yang butuh **keputusan manusia**.

Middleware yang dipakai:

- `authenticate` — validasi access token (cookie httpOnly), cek blacklist Redis, isi `req.user = { userId, peran }`.
- `requireRole(...roles)` — 403 jika `req.user.peran` tidak termasuk daftar.
- `validation + handleValidationErrors` — express-validator (400 jika input tidak valid).
- Rate limit global: 300 req/15 menit per IP untuk semua `/api`; khusus login & refresh 20 req/15 menit (nonaktif saat test).

## 1. Health & Auth

| Method | Path | authenticate | requireRole | Catatan |
|---|---|---|---|---|
| GET | `/health` | — | — | Publik, hanya status server |
| POST | `/api/auth/login` | — | — | Publik by design; rate limit ketat + counter gagal login per-username di Redis |
| POST | `/api/auth/logout` | ✅ | — | |
| POST | `/api/auth/refresh` | — | — | Publik by design (dipakai saat access token expired); tervalidasi via refresh token cookie + Redis |
| GET | `/api/auth/me` | ✅ | — | Info sesi sendiri; aman tanpa role |
| GET | `/api/users` | ✅ | LEADER | |
| GET | `/api/users/admins` | ✅ | LEADER | |
| POST | `/api/users` | ✅ | LEADER | |
| PUT | `/api/users/:id/reset-password` | ✅ | LEADER | Service menolak target non-ADMIN |
| PATCH | `/api/users/:id/status` | ✅ | LEADER | Service menolak menonaktifkan LEADER terakhir |

## 2. Jemaat (PII — semua tanpa requireRole) ⚠

| Method | Path | authenticate | requireRole | Catatan |
|---|---|---|---|---|
| GET | `/api/jemaat` | ✅ | ⚠ tidak ada | List jemaat |
| POST | `/api/jemaat` | ✅ | ⚠ tidak ada | |
| GET | `/api/jemaat/:id` | ✅ | ⚠ tidak ada | |
| GET | `/api/jemaat/:id/sensitive/:field` | ✅ | ⚠ tidak ada | **Membuka field terenkripsi (no_hp/alamat/tgl_lahir) ke ADMIN** |
| GET | `/api/jemaat/:id/cell-groups` | ✅ | ⚠ tidak ada | |
| GET | `/api/jemaat/:id/events` | ✅ | ⚠ tidak ada | |
| PUT | `/api/jemaat/:id` | ✅ | ⚠ tidak ada | |
| DELETE | `/api/jemaat/:id` | ✅ | ⚠ tidak ada | Soft-delete jemaat bisa dilakukan ADMIN |

**Risiko:** ADMIN punya akses baca/tulis/hapus penuh atas data pribadi jemaat, termasuk dekripsi field sensitif. Jika kebijakan bisnisnya "ADMIN adalah operator data harian", ini bisa diterima — tapi akses `sensitive/:field` dan DELETE sebaiknya dipertimbangkan untuk LEADER-only atau minimal dicatat sebagai keputusan sadar. Semua akses tetap terekam di audit log.

## 3. Cell Group (semua tanpa requireRole)

| Method | Path | authenticate | requireRole | Catatan |
|---|---|---|---|---|
| POST | `/api/cell-groups` | ✅ | tidak ada | |
| GET | `/api/cell-groups` | ✅ | tidak ada | |
| GET | `/api/cell-groups/:id` | ✅ | tidak ada | |
| PUT | `/api/cell-groups/:id` | ✅ | tidak ada | |
| DELETE | `/api/cell-groups/:id` | ✅ | ⚠ tidak ada | Nonaktifkan CG oleh ADMIN |
| PATCH | `/api/cell-groups/:id/activate` | ✅ | ⚠ tidak ada | Reaktivasi CG oleh ADMIN |
| GET | `/api/cell-groups/:id/members` | ✅ | tidak ada | |
| POST | `/api/cell-groups/:id/members` | ✅ | tidak ada | |
| DELETE | `/api/cell-groups/:id/members/:jemaatId` | ✅ | tidak ada | |
| GET | `/api/cell-groups/:id/meetings` | ✅ | tidak ada | |
| POST | `/api/cell-groups/:id/meetings` | ✅ | tidak ada | |
| GET | `/api/cell-groups/meetings/:meetingId` | ✅ | tidak ada | |
| PUT | `/api/cell-groups/meetings/:meetingId` | ✅ | tidak ada | |
| POST | `/api/cell-groups/meetings/:meetingId/photos` | ✅ | tidak ada | Multer: hanya JPEG/PNG/WebP, maks 10MB |
| GET | `/api/cell-groups/meetings/:meetingId/photos` | ✅ | tidak ada | |
| GET | `/api/cell-groups/photos/:photoId` | ✅ | tidak ada | Stream file; anti path-traversal di service |
| DELETE | `/api/cell-groups/photos/:photoId` | ✅ | ⚠ tidak ada | Hapus foto (record + file) oleh ADMIN |
| GET | `/api/cell-groups/meetings/:meetingId/active-members` | ✅ | tidak ada | |
| POST | `/api/cell-groups/meetings/:meetingId/absensi` | ✅ | tidak ada | |

**Risiko:** operasi destruktif (nonaktif CG, hapus foto) terbuka untuk ADMIN. Konsisten dengan pola "ADMIN = operator harian", tapi patut diputuskan eksplisit.

## 4. Volunteer

| Method | Path | authenticate | requireRole | Catatan |
|---|---|---|---|---|
| POST | `/api/volunteer-types` | ✅ | ADMIN, LEADER | Redundan (hanya 2 peran itu yang ada) tapi eksplisit |
| GET | `/api/volunteer-types` | ✅ | tidak ada | |
| PUT | `/api/volunteer-types/:id` | ✅ | ADMIN, LEADER | |
| DELETE | `/api/volunteer-types/:id` | ✅ | ADMIN, LEADER | |
| PATCH | `/api/volunteer-types/:id/activate` | ✅ | ADMIN, LEADER | Reaktivasi jenis nonaktif; konsisten dengan DELETE-nya |
| GET | `/api/jemaat/:jemaatId/volunteer` | ✅ | tidak ada | |
| POST | `/api/jemaat/:jemaatId/volunteer` | ✅ | tidak ada | |
| DELETE | `/api/jemaat/:jemaatId/volunteer/:volunteerTypeId` | ✅ | tidak ada | |
| GET | `/api/volunteer-types/:id/members` | ✅ | tidak ada | Di event.routes.js |

## 5. Event

| Method | Path | authenticate | requireRole | Catatan |
|---|---|---|---|---|
| POST | `/api/events` | ✅ | ADMIN, LEADER | |
| GET | `/api/events` | ✅ | tidak ada | |
| GET | `/api/events/:id` | ✅ | tidak ada | |
| GET | `/api/events/:id/kehadiran` | ✅ | tidak ada | Baca rekap kehadiran |
| PUT | `/api/events/:id` | ✅ | ADMIN, LEADER | |
| PATCH | `/api/events/:id/status` | ✅ | ADMIN, LEADER | |
| POST | `/api/events/:id/kehadiran` | ✅ | ⚠ tidak ada | Input kehadiran tanpa role — inkonsisten dengan create/update event yang pakai requireRole |
| GET | `/api/events/:id/volunteers` | ✅ | tidak ada | |
| POST | `/api/events/:id/volunteers` | ✅ | ⚠ tidak ada | Assign volunteer tanpa role |
| PATCH | `/api/events/:id/volunteers/:volunteerId/replace` | ✅ | ⚠ tidak ada | |
| DELETE | `/api/events/:id/volunteers/:volunteerId` | ✅ | ⚠ tidak ada | |
| GET | `/api/events/:id/volunteer-needs` | ✅ | tidak ada | Baca kuota + jumlah terisi per jenis |
| PUT | `/api/events/:id/volunteer-needs` | ✅ | ADMIN, LEADER | Upsert penuh kuota; transaksi + audit UPDATE_VOLUNTEER_NEEDS |
| GET | `/api/events/:id/suggest-volunteers/:jenisId` | ✅ | tidak ada | |

**Risiko:** karena `requireRole('ADMIN','LEADER')` mencakup semua peran yang ada, dampak praktisnya nol saat ini — tapi inkonsistensinya membingungkan dan akan jadi lubang jika suatu saat ada peran ketiga.

## 6. Audit Log & Notifikasi (LEADER only — sudah benar)

| Method | Path | authenticate | requireRole |
|---|---|---|---|
| GET | `/api/audit-logs` | ✅ | LEADER |
| GET | `/api/audit-logs/:id` | ✅ | LEADER |
| GET | `/api/notifications` | ✅ | LEADER |
| GET | `/api/notifications/unread-count` | ✅ | LEADER |
| PATCH | `/api/notifications/read-all` | ✅ | LEADER |
| PATCH | `/api/notifications/:id/read` | ✅ | LEADER |

## 7. Report (ekspor data — semua tanpa requireRole) ⚠

| Method | Path | authenticate | requireRole | Catatan |
|---|---|---|---|---|
| GET | `/api/reports/jemaat` | ✅ | ⚠ tidak ada | **`?sensitive=true` mengekspor no_hp & alamat terdekripsi — bisa dilakukan ADMIN** |
| GET | `/api/reports/event` | ✅ | ⚠ tidak ada | |
| GET | `/api/reports/cg` | ✅ | ⚠ tidak ada | |
| GET | `/api/reports/volunteer` | ✅ | ⚠ tidak ada | |
| GET | `/api/reports/analytics` | ✅ | ⚠ tidak ada | |
| GET | `/api/reports/download/:token` | — | — | Tanpa auth by design: signed token 1x pakai, TTL 15 menit di Redis |

**Risiko tertinggi di dokumen ini:** `GET /api/reports/jemaat?sensitive=true` memungkinkan ADMIN mengekspor **seluruh PII jemaat (no HP + alamat) sekaligus** ke file. Mitigasi yang sudah ada: audit log `EXPORT` + notifikasi `EKSPOR_DATA_MALAM` di luar jam 06:00–22:00. Rekomendasi untuk diputuskan: batasi `sensitive=true` ke LEADER, atau tambahkan approval/notifikasi real-time untuk setiap ekspor sensitif.

## 8. Scoring

| Method | Path | authenticate | requireRole |
|---|---|---|---|
| POST | `/api/scoring/run` | ✅ | LEADER |

## Ringkasan untuk diputuskan manusia

1. **Ekspor PII oleh ADMIN** (`/api/reports/jemaat?sensitive=true`) — kandidat terkuat untuk LEADER-only.
2. **Akses field sensitif per-jemaat oleh ADMIN** (`/api/jemaat/:id/sensitive/:field`) — putuskan: fitur operasional ADMIN atau LEADER-only.
3. **DELETE jemaat / nonaktif CG / hapus foto oleh ADMIN** — operasi destruktif (soft-delete) tanpa role.
4. **Inkonsistensi modul event** — sebagian endpoint tulis pakai `requireRole('ADMIN','LEADER')`, sebagian tidak; samakan salah satu arah.
