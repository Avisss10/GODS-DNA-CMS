# Item 9 — Konsistensi Penamaan Boolean (`aktif` vs `is_active`) — PLAN ONLY

> Status: **belum dieksekusi**. Didokumentasikan untuk keputusan terpisah,
> sesuai keputusan sesi audit. Tidak ada perubahan kode/schema yang diambil
> untuk item ini.

## Temuan

Penamaan kolom boolean "aktif/tidak" tidak konsisten antar tabel:

| Tabel | Kolom | Konvensi |
| --- | --- | --- |
| `users` | `aktif` | tanpa prefix |
| `jemaat` | `is_active` | prefix `is_` |
| `cell_group` | `is_active` | prefix `is_` |
| `volunteer_jenis` | `is_active` | prefix `is_` |
| `volunteer_members` | `is_active` | prefix `is_` |

## Opsi & Trade-off

### Opsi A — Standarkan ke `is_active` (rename `users.aktif` → `is_active`)
- **Dampak:** hanya 1 tabel yang berubah.
- **Risiko:** `users.aktif` dipakai luas di modul auth (login check `!user.aktif`,
  `findAllAdmins`, `countActiveLeaders`, `updateAktif`, refresh-token check yang
  baru ditambah di item 4), **termasuk kode uncommitted WIP fitur admin
  management** yang sedang dikerjakan. Tinggi kemungkinan konflik dengan WIP.

### Opsi B — Standarkan ke `aktif` (rename `is_active` → `aktif` di 4 tabel)
- **Dampak:** 4 tabel berubah; lebih banyak repository/query terdampak (modul
  jemaat besar, scoring bergantung pada `is_active`, cellgroup, volunteer).
- **Risiko:** permukaan perubahan jauh lebih luas; regression test penuh di
  banyak modul.

## Kebutuhan Bersama (kedua opsi)
1. Migration `ALTER TABLE ... RENAME COLUMN`.
2. Update semua query SQL terkait.
3. Update semua reference di service/controller/test.
4. Regression test penuh di modul terdampak.

## Rekomendasi
Lakukan di **sesi terpisah setelah perubahan WIP admin-management di-commit**,
untuk menghindari konflik. Bila dipaksa memilih sekarang, **Opsi A** paling
kecil permukaannya (1 tabel) tetapi harus dikoordinasikan dengan WIP yang
sedang menyentuh `users.aktif`.
