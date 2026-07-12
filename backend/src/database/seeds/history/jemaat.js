const jemaatService = require('../../../modules/jemaat/jemaat.service');
const { getPool } = require('../../../config/database');
const {
  NOW,
  daysAgo,
  randomInt,
  pick,
  chance,
  assignEngagementProfile,
  formatDateOnly,
  backdate,
  withHistoricalDate,
} = require('./_helpers');

const MALE_FIRST_NAMES = [
  'Budi', 'Andi', 'Dedi', 'Agus', 'Rudi', 'Hendra', 'Yusuf', 'Bambang', 'Joko', 'Wahyu',
  'Fajar', 'Rizky', 'Dimas', 'Eko', 'Arif', 'Anton', 'Hadi', 'Iwan', 'Bayu', 'Gunawan',
  'Tono', 'Slamet', 'Yanto', 'Reza', 'Adi', 'Bobby', 'Chandra', 'Doni', 'Erwin', 'Firman',
];
const FEMALE_FIRST_NAMES = [
  'Siti', 'Dewi', 'Rina', 'Sri', 'Ani', 'Yuni', 'Fitri', 'Wati', 'Lina', 'Maya',
  'Ratna', 'Indah', 'Putri', 'Wulan', 'Tuti', 'Vina', 'Sari', 'Nita', 'Diah', 'Yulia',
  'Melati', 'Novi', 'Rosa', 'Sinta', 'Tania', 'Umi', 'Vera', 'Winda', 'Yanti', 'Zahra',
];
const LAST_NAMES = [
  'Santoso', 'Wijaya', 'Kusuma', 'Setiawan', 'Pratama', 'Saputra', 'Halim', 'Wibowo',
  'Susanto', 'Hartono', 'Gunawan', 'Sitorus', 'Simanjuntak', 'Tampubolon', 'Manurung',
  'Pardede', 'Sihombing', 'Napitupulu', 'Purnomo', 'Nugroho', 'Wijoyo', 'Salim',
  'Tarigan', 'Sinaga', 'Panjaitan', 'Situmorang', 'Lumbantoruan', 'Marpaung',
];
const STREETS = [
  'Jl. Grand Wisata Boulevard', 'Jl. Kalimas Raya', 'Jl. Persada Regency',
  'Jl. Mawar Cluster', 'Jl. Anggrek Residence', 'Jl. Kertajaya', 'Jl. Legenda Wisata',
  'Jl. Ubud Village', 'Jl. Bali Village', 'Jl. Bandung Village', 'Jl. Pahlawan Raya',
  'Jl. Diponegoro', 'Jl. Sudirman Regency', 'Jl. Merdeka Cluster',
];

/**
 * Sebaran tanggal bergabung 150 jemaat selama 2 tahun terakhir:
 * lebih padat di tahun pertama (basis jemaat lama), trickle jemaat
 * baru terus-menerus di tahun kedua, dan segelintir jemaat benar-benar
 * baru (<30 hari) supaya tetap ada yang is_new_member=TRUE/BELUM_CUKUP_DATA.
 */
function pickJoinDaysAgo() {
  const r = Math.random();
  if (r < 0.05) return randomInt(0, 29); // baru bergabung
  if (r < 0.70) return randomInt(400, 729); // basis lama, tahun pertama
  return randomInt(30, 399); // pertumbuhan tahun kedua
}

async function seedJemaat(actorUserId, count) {
  const records = [];

  for (let i = 0; i < count; i++) {
    const isMale = i % 2 === 0;
    const first = isMale ? pick(MALE_FIRST_NAMES, Math.floor(i / 2)) : pick(FEMALE_FIRST_NAMES, Math.floor(i / 2));
    const last = pick(LAST_NAMES, i + 5);
    const nama = `${first} ${last}`;

    const joinDaysAgo = pickJoinDaysAgo();
    const tglBergabung = daysAgo(joinDaysAgo);
    const tglLahir = daysAgo(randomInt(365 * 17, 365 * 68)); // usia ~17-68 tahun

    const data = {
      nama,
      tgl_lahir: formatDateOnly(tglLahir),
      jenis_kelamin: isMale ? 'L' : 'P',
      tgl_bergabung: formatDateOnly(tglBergabung),
      no_hp: `08${randomInt(1000000000, 1999999999)}`,
      alamat: `${pick(STREETS, i)} No. ${randomInt(1, 99)}, Bekasi`,
      media_sosial: chance(0.6) ? { instagram: `@${first.toLowerCase()}${last.toLowerCase()}${randomInt(1, 99)}` } : {},
    };

    const { id } = await withHistoricalDate(tglBergabung, () =>
      jemaatService.createJemaat(data, { confirmed: true, actorUserId })
    );

    await backdate('jemaat', id, tglBergabung, 'created_at');
    await backdate('jemaat', id, tglBergabung, 'updated_at');

    records.push({
      id,
      nama,
      jenisKelamin: data.jenis_kelamin,
      tglBergabung,
      engagementProfile: assignEngagementProfile(),
    });

    if ((i + 1) % 25 === 0) {
      console.log(`  [jemaat] ${i + 1}/${count} dibuat...`);
    }
  }

  console.log(`[jemaat] Selesai: ${records.length} jemaat dibuat.`);
  return records;
}

/**
 * Perbaikan yang sengaja dilakukan DI SINI (bukan lewat service/API):
 * tidak ada satupun job/cron di backend yang benar-benar men-flip
 * is_new_member ke FALSE setelah grace period (new_member_until)
 * lewat — gap yang sudah ada di aplikasi. Tanpa patch ini, scoring
 * batch akan skip hampir semua jemaat "lama" karena masih dianggap
 * is_new_member=TRUE selamanya.
 */
async function fixNewMemberFlags() {
  const pool = getPool();
  const [result] = await pool.query(
    `UPDATE jemaat
     SET is_new_member = FALSE
     WHERE is_new_member = TRUE AND new_member_until < :now`,
    { now: NOW }
  );
  console.log(`[jemaat] is_new_member diperbaiki untuk ${result.affectedRows} jemaat (grace period sudah lewat).`);
}

/**
 * Soft-delete sebagian kecil jemaat (churn keluar dari jemaat, bukan
 * cuma keluar CG) di titik waktu acak setelah mereka bergabung — hanya
 * untuk jemaat yang TIDAK dipakai sebagai leader/anggota CG/volunteer
 * (dijamin oleh caller lewat availableIds) supaya deleteJemaat's
 * dependency check pasti lolos.
 */
async function applyChurn(records, availableIds, actorUserId, targetFraction = 0.06) {
  const eligible = records.filter(
    (r) => availableIds.has(r.id) && r.tglBergabung < daysAgo(60)
  );
  const targetCount = Math.round(records.length * targetFraction);
  const toDelete = eligible.sort(() => Math.random() - 0.5).slice(0, targetCount);

  let deleted = 0;
  for (const r of toDelete) {
    const minDaysAfterJoin = 60;
    const maxAgoMs = NOW.getTime() - r.tglBergabung.getTime() - minDaysAfterJoin * 24 * 60 * 60 * 1000;
    if (maxAgoMs <= 0) continue;
    const deleteAt = new Date(r.tglBergabung.getTime() + minDaysAfterJoin * 24 * 60 * 60 * 1000 + Math.random() * maxAgoMs);

    try {
      await withHistoricalDate(deleteAt, () => jemaatService.deleteJemaat(r.id, { actorUserId }));
      await backdate('jemaat', r.id, deleteAt, 'deleted_at');
      await backdate('jemaat', r.id, deleteAt, 'updated_at');
      deleted++;
    } catch (err) {
      console.warn(`  [jemaat] Gagal churn jemaat id=${r.id}: ${err.message}`);
    }
  }

  console.log(`[jemaat] Churn selesai: ${deleted} jemaat di-soft-delete.`);
}

module.exports = { seedJemaat, fixNewMemberFlags, applyChurn };
