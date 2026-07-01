# GODS DNA CMS — Backend

Backend REST API untuk GODS DNA CMS (manajemen jemaat, cell group, event,
volunteer, scoring keaktifan, audit log, laporan). Node.js + Express 5,
MySQL/TiDB, Redis.

## Prasyarat

- **Node.js** 18+ (LTS disarankan).
- **Database MySQL 8 / TiDB Cloud** (kompatibel MySQL, wajib TLS untuk TiDB Cloud).
- **Redis** 6.2+ (dipakai untuk session/blacklist token, refresh token,
  rate-limit login, dan signed URL laporan — GETDEL butuh Redis ≥ 6.2).

## Setup

```bash
# 1. Install dependency
npm install

# 2. Salin template environment lalu isi nilainya
cp .env.example .env
```

Isi setiap variabel di `.env`:

| Variable | Keterangan |
| --- | --- |
| `NODE_ENV` | `development` / `production` / `test` |
| `PORT` | Port HTTP server (default 3000) |
| `ALLOWED_ORIGINS` | Daftar origin CORS dipisah koma, mis. `http://localhost:5173,https://app.example.com`. Request tanpa Origin (server-to-server) selalu diizinkan |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Koneksi database |
| `DB_POOL_SIZE` | Ukuran connection pool (default 10) |
| `DB_SSL_CA_PATH` | Path CA cert untuk TLS TiDB Cloud; kosongkan untuk MySQL lokal tanpa TLS |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secret penandatangan JWT (access 8 jam, refresh 7 hari) |
| `AES_ENCRYPTION_KEY` | Kunci AES-256 untuk field sensitif — hex string 64 karakter (32 byte) |
| `AUDIT_HMAC_SECRET` | Secret HMAC untuk integritas audit log |
| `RECOVERY_CODE_HASH` | Hash recovery code offline (lihat `src/scripts/generate-recovery-code.js`) |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_USERNAME` / `REDIS_PASSWORD` | Koneksi Redis |
| `REDIS_TLS_ENABLED` | `true` bila Redis Cloud memakai TLS |

Saat boot, `bootstrap()` memvalidasi env var wajib (`JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `AES_ENCRYPTION_KEY`, `AUDIT_HMAC_SECRET`, `DB_HOST`,
`DB_USER`, `DB_PASSWORD`, `REDIS_HOST`) lalu menguji koneksi DB & Redis —
proses berhenti dengan pesan jelas (exit code 1) jika ada yang kurang/gagal.

## Migrasi & Seed

```bash
# Jalankan schema awal (001_initial_schema.sql)
npm run migrate

# Reset (drop semua tabel) lalu migrate ulang
npm run migrate:reset

# Seed akun awal (minimal 2 Leader)
npm run seed:users
```

Migration inkremental berada di `src/database/migrations/00X_*.sql`. Migration
`004_add_jemaat_no_hp_hash.sql` menambahkan kolom `no_hp_hash` untuk pencarian
duplikat nomor HP tanpa dekripsi massal. Setelah menerapkannya pada database
yang sudah berisi data, jalankan backfill satu-kali:

```bash
node src/scripts/backfill-no-hp-hash.js
```

## Menjalankan

```bash
# Development (auto-reload via nodemon)
npm run dev

# Production
npm start
```

## Test

```bash
npm test          # seluruh suite (unit + integration + http), --runInBand
npm run test:watch
```

Test integration/HTTP otomatis di-skip jika konfigurasi DB/Redis di `.env`
tidak lengkap (`describe.skip`), sehingga unit test tetap bisa jalan tanpa
infrastruktur.

## Troubleshooting

- **Port bentrok (`EADDRINUSE`)**: ganti `PORT` di `.env`, atau hentikan proses
  yang memakai port tersebut.
- **`connect ETIMEDOUT` saat migrate/test**: cek `DB_HOST`/`DB_PORT`, dan untuk
  TiDB Cloud pastikan `DB_SSL_CA_PATH` menunjuk ke CA cert yang valid.
- **Redis gagal connect saat boot**: cek `REDIS_HOST`/`REDIS_PORT` dan
  `REDIS_TLS_ENABLED`. Server sengaja fail-fast agar tidak jalan setengah hidup.
- **Windows — `node_modules/.bin` permission / script tidak ditemukan**: jalankan
  `npm install` ulang tanpa hak admin (hindari `sudo`/Run as Administrator yang
  bisa mengubah ownership), atau panggil binari lewat `npx` (mis. `npx jest`).
```
