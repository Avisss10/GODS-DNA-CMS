const volunteerService = require('../../../modules/volunteer/volunteer.service');
const {
  NOW,
  daysAgo,
  randomInt,
  chance,
  addDays,
  backdate,
  withHistoricalDate,
} = require('./_helpers');

const VOLUNTEER_TYPES = [
  { nama: 'Usher', deskripsi: 'Penyambutan & pengaturan jemaat saat ibadah' },
  { nama: 'Singer', deskripsi: 'Tim vokal ibadah' },
  { nama: 'Sound Engineer', deskripsi: 'Operator sound system' },
  { nama: 'Multimedia', deskripsi: 'Operator lirik & tayangan' },
  { nama: 'Doa Syafaat', deskripsi: 'Tim pendoa syafaat sebelum & saat ibadah' },
  { nama: 'Anak & Remaja', deskripsi: 'Pelayanan sekolah minggu & remaja' },
  { nama: 'Dekorasi & Perlengkapan', deskripsi: 'Persiapan tempat & perlengkapan ibadah' },
];

async function seedVolunteerTypes(actorUserId) {
  const types = [];
  for (const t of VOLUNTEER_TYPES) {
    const createdAt = daysAgo(730 - randomInt(0, 10));
    const { id } = await withHistoricalDate(createdAt, () =>
      volunteerService.createVolunteerType(t, { actorUserId })
    );
    types.push({ id, nama: t.nama });
  }
  console.log(`[volunteers] ${types.length} jenis volunteer dibuat.`);
  return types;
}

/**
 * Daftarkan ~45% jemaat ke 1 jenis volunteer (sebagian dapat 2 jenis),
 * tersebar sejak masing-masing bergabung s/d sekarang. Sebagian kecil
 * unregister di tengah jalan (churn pelayanan).
 *
 * @returns {Map<number, Array<number>>} jemaatId -> array volunteerTypeId aktif
 */
async function seedVolunteerRegistrations(jemaatPool, volunteerTypes, actorUserId) {
  const registry = new Map();
  const eligible = jemaatPool.filter((j) => j.tglBergabung < daysAgo(14));
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const targetCount = Math.round(eligible.length * 0.45);
  const chosen = shuffled.slice(0, targetCount);

  let registrations = 0;
  let unregistrations = 0;

  for (const jemaat of chosen) {
    const typeCount = chance(0.25) ? 2 : 1;
    const shuffledTypes = [...volunteerTypes].sort(() => Math.random() - 0.5);
    const activeTypeIds = [];

    for (let t = 0; t < typeCount && t < shuffledTypes.length; t++) {
      const type = shuffledTypes[t];
      const joinDate = addDays(jemaat.tglBergabung, randomInt(7, 60));
      if (joinDate > NOW) continue;

      const { id: membershipId } = await withHistoricalDate(joinDate, () =>
        volunteerService.registerVolunteer(jemaat.id, type.id, { actorUserId })
      );
      await backdate('volunteer_members', membershipId, joinDate, 'joined_at');
      registrations++;

      let stillActive = true;
      if (chance(0.1) && joinDate < daysAgo(120)) {
        const leaveDate = addDays(joinDate, randomInt(90, Math.max(91, Math.floor((NOW - joinDate) / (24 * 60 * 60 * 1000)) - 1)));
        if (leaveDate < NOW) {
          await withHistoricalDate(leaveDate, () =>
            volunteerService.unregisterVolunteer(jemaat.id, type.id, { actorUserId })
          );
          unregistrations++;
          stillActive = false;
        }
      }

      if (stillActive) activeTypeIds.push(type.id);
    }

    if (activeTypeIds.length > 0) registry.set(jemaat.id, activeTypeIds);
  }

  console.log(`[volunteers] ${registrations} pendaftaran (${unregistrations} di antaranya kemudian unregister), ${registry.size} jemaat aktif sebagai volunteer.`);
  return registry;
}

module.exports = { seedVolunteerTypes, seedVolunteerRegistrations, VOLUNTEER_TYPES };
