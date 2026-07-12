const eventService = require('../../../modules/event/event.service');
const {
  NOW,
  daysAgo,
  addDays,
  randomInt,
  chance,
  pickRandom,
  formatDateTime,
  attendanceProbabilityFor,
  backdate,
  withHistoricalDate,
  mapLimit,
} = require('./_helpers');

const CORE_ROLE_NAMES = ['Usher', 'Singer', 'Sound Engineer', 'Multimedia'];

function nextSunday(fromDate) {
  const d = new Date(fromDate);
  const day = d.getDay(); // 0 = Minggu
  const diff = (7 - day) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function buildSundayDates() {
  const dates = [];
  let cursor = nextSunday(daysAgo(729));
  while (cursor < NOW) {
    dates.push(new Date(cursor));
    cursor = addDays(cursor, 7);
  }
  return dates;
}

/**
 * Event khusus di titik-titik waktu tetap relatif ke START_DATE (bukan
 * tanggal kalender asli) — cukup untuk kesan "acara tahunan berkala"
 * tanpa perlu presisi liturgis.
 */
function buildSpecialEvents() {
  const offsets = [
    { daysAgoFromNow: 710, judul: 'Doa Puasa Awal Tahun', jenis: 'DOA' },
    { daysAgoFromNow: 655, judul: 'Baptisan Air', jenis: 'IBADAH' },
    { daysAgoFromNow: 600, judul: 'Retreat Remaja', jenis: 'RETREAT' },
    { daysAgoFromNow: 470, judul: 'Ibadah Paskah', jenis: 'IBADAH' },
    { daysAgoFromNow: 400, judul: 'Pelatihan Cell Group Leader', jenis: 'PELATIHAN' },
    { daysAgoFromNow: 345, judul: 'Ibadah Natal', jenis: 'IBADAH' },
    { daysAgoFromNow: 280, judul: 'Doa Puasa Awal Tahun', jenis: 'DOA' },
    { daysAgoFromNow: 230, judul: 'Baptisan Air', jenis: 'IBADAH' },
    { daysAgoFromNow: 150, judul: 'Retreat Keluarga', jenis: 'RETREAT' },
    { daysAgoFromNow: 105, judul: 'Ibadah Paskah', jenis: 'IBADAH' },
    { daysAgoFromNow: 60, judul: 'Pelatihan Cell Group Leader', jenis: 'PELATIHAN' },
    { daysAgoFromNow: 20, judul: 'Ibadah Natal', jenis: 'IBADAH' },
  ].filter((o) => o.daysAgoFromNow > 0);

  return offsets.map((o) => {
    const waktuMulai = daysAgo(o.daysAgoFromNow);
    waktuMulai.setHours(18, 0, 0, 0);
    const waktuSelesai = new Date(waktuMulai.getTime() + 3 * 60 * 60 * 1000);
    return { judul: o.judul, jenis: o.jenis, waktuMulai, waktuSelesai };
  });
}

function buildTypeToCandidates(jemaatPool, registry) {
  const byId = new Map(jemaatPool.map((j) => [j.id, j]));
  const map = new Map();
  for (const [jemaatId, typeIds] of registry.entries()) {
    const jemaat = byId.get(jemaatId);
    if (!jemaat) continue;
    for (const typeId of typeIds) {
      if (!map.has(typeId)) map.set(typeId, []);
      map.get(typeId).push({ jemaatId, engagementProfile: jemaat.engagementProfile });
    }
  }
  return map;
}

function weightedPick(candidates) {
  const weight = { tinggi: 3, sedang: 2, rendah: 1 };
  const pool = [];
  for (const c of candidates) {
    const w = weight[c.engagementProfile] || 1;
    for (let i = 0; i < w; i++) pool.push(c);
  }
  return pool.length ? pickRandom(pool) : null;
}

/**
 * Proses satu event end-to-end: create -> kebutuhan volunteer ->
 * assign -> publish -> aktif -> (kadang replace/cancel) -> selesai ->
 * kehadiran -> (kadang) diarsipkan. Semua tanggal historis (kecuali
 * 1-2 event mendatang yang sengaja dibiarkan DRAFT/PUBLISHED).
 */
async function seedOneEvent({ judul, jenis, waktuMulai, waktuSelesai, actorUserId, typeToCandidates, volunteerTypesByName }) {
  const isFuture = waktuMulai > NOW;
  const createdAt = isFuture ? NOW : addDays(waktuMulai, -randomInt(3, 10));

  const { id: eventId } = await withHistoricalDate(createdAt, () =>
    eventService.createEvent(
      {
        judul,
        jenis,
        waktu_mulai: formatDateTime(waktuMulai),
        waktu_selesai: formatDateTime(waktuSelesai),
        deskripsi: `${judul} — histori sistem`,
      },
      { actorUserId }
    )
  );
  await backdate('event', eventId, createdAt, 'created_at');

  // Kebutuhan + penugasan volunteer untuk peran inti (selagi DRAFT).
  const roleNames = CORE_ROLE_NAMES.filter((n) => volunteerTypesByName.has(n));
  const needs = roleNames
    .map((n) => ({ jenisId: volunteerTypesByName.get(n), kuota: randomInt(1, 3) }))
    .filter((n) => n.jenisId);

  if (needs.length > 0) {
    await withHistoricalDate(waktuMulai, () =>
      eventService.updateVolunteerNeeds(
        eventId,
        needs.map((n) => ({ jenis_id: n.jenisId, kuota: n.kuota })),
        { actorUserId }
      )
    );
  }

  const assignedJemaatIds = new Set();
  const assignments = []; // { volunteerId, jemaatId, jenisId }
  for (const need of needs) {
    const candidates = (typeToCandidates.get(need.jenisId) || []).filter((c) => !assignedJemaatIds.has(c.jemaatId));
    for (let i = 0; i < need.kuota && candidates.length > 0; i++) {
      const picked = weightedPick(candidates);
      if (!picked) break;
      candidates.splice(candidates.indexOf(picked), 1);
      assignedJemaatIds.add(picked.jemaatId);

      try {
        const assignment = await withHistoricalDate(waktuMulai, () =>
          eventService.assignVolunteer(eventId, { jemaat_id: picked.jemaatId, jenis_id: need.jenisId }, { actorUserId })
        );
        assignments.push({ volunteerId: assignment.id, jemaatId: picked.jemaatId, jenisId: need.jenisId });
      } catch (err) {
        // Kuota/duplikasi race — lewati kandidat ini, tidak fatal untuk seeding.
      }
    }
  }

  if (isFuture) {
    // Event masa depan: publish saja, biarkan DRAFT/PUBLISHED (kesan "sedang direncanakan").
    const willPublish = chance(0.6);
    if (willPublish) {
      await withHistoricalDate(NOW, () => eventService.transitionStatus(eventId, 'PUBLISHED', { actorUserId }));
    }
    return { eventId, status: willPublish ? 'PUBLISHED' : 'DRAFT', kehadiran: null };
  }

  await withHistoricalDate(addDays(waktuMulai, -2), () => eventService.transitionStatus(eventId, 'PUBLISHED', { actorUserId }));
  await withHistoricalDate(waktuMulai, () => eventService.transitionStatus(eventId, 'AKTIF', { actorUserId }));

  // Variasi histori: replace/cancel sebagian kecil penugasan selagi AKTIF.
  if (assignments.length > 0 && chance(0.1)) {
    const target = pickRandom(assignments);
    const replacementCandidates = (typeToCandidates.get(target.jenisId) || []).filter(
      (c) => !assignedJemaatIds.has(c.jemaatId)
    );
    const replacement = weightedPick(replacementCandidates);
    if (replacement) {
      try {
        const isTengah = chance(0.5);
        await withHistoricalDate(waktuMulai, () =>
          eventService.replaceVolunteer(
            eventId,
            target.volunteerId,
            {
              replacement_timing: isTengah ? 'TENGAH_EVENT' : 'SEBELUM_EVENT',
              replaced_by: replacement.jemaatId,
              alasan: 'Berhalangan hadir',
              durasi_menit: isTengah ? randomInt(30, 90) : undefined,
            },
            { actorUserId }
          )
        );
        assignedJemaatIds.add(replacement.jemaatId);
      } catch (err) {
        // abaikan, tidak kritis untuk data historis
      }
    }
  } else if (assignments.length > 0 && chance(0.05)) {
    const target = pickRandom(assignments);
    try {
      await withHistoricalDate(waktuMulai, () => eventService.cancelVolunteerAssignment(eventId, target.volunteerId, { actorUserId }));
    } catch (err) {
      // abaikan
    }
  }

  await withHistoricalDate(waktuSelesai, () => eventService.transitionStatus(eventId, 'SELESAI', { actorUserId }));

  const baseHadir = jenis === 'IBADAH' ? randomInt(90, 220) : randomInt(40, 120);
  const totalHadir = baseHadir + (chance(0.3) ? randomInt(10, 60) : 0); // event spesial kadang lebih ramai
  const jemaatBaru = chance(0.4) ? randomInt(0, 5) : 0;

  await withHistoricalDate(waktuSelesai, () =>
    eventService.inputKehadiran(eventId, { total_hadir: totalHadir, jemaat_baru: jemaatBaru }, { actorUserId })
  );

  // Arsipkan event yang sudah cukup lama selesai (>60 hari) — event
  // yang baru saja selesai dibiarkan SELESAI (belum diarsipkan).
  let finalStatus = 'SELESAI';
  if (addDays(waktuSelesai, 60) < NOW) {
    const archiveDate = addDays(waktuSelesai, randomInt(30, 60));
    await withHistoricalDate(archiveDate, () => eventService.transitionStatus(eventId, 'DIARSIPKAN', { actorUserId }));
    finalStatus = 'DIARSIPKAN';
  }

  return { eventId, status: finalStatus, kehadiran: totalHadir };
}

async function seedEvents(jemaatPool, registry, volunteerTypes, userIds) {
  const volunteerTypesByName = new Map(volunteerTypes.map((t) => [t.nama, t.id]));
  const typeToCandidates = buildTypeToCandidates(jemaatPool, registry);

  const sundayDates = buildSundayDates();
  const specialEvents = buildSpecialEvents();

  // 1-2 ibadah Minggu mendatang untuk kesan sistem "sedang berjalan".
  const futureSundays = [addDays(nextSunday(NOW), 7), addDays(nextSunday(NOW), 14)];

  const jobs = [
    ...sundayDates.map((d) => {
      const waktuMulai = new Date(d);
      waktuMulai.setHours(9, 0, 0, 0);
      const waktuSelesai = new Date(waktuMulai.getTime() + 2 * 60 * 60 * 1000);
      return { judul: 'Ibadah Minggu Raya', jenis: 'IBADAH', waktuMulai, waktuSelesai };
    }),
    ...specialEvents,
    ...futureSundays.map((d) => {
      const waktuMulai = new Date(d);
      waktuMulai.setHours(9, 0, 0, 0);
      const waktuSelesai = new Date(waktuMulai.getTime() + 2 * 60 * 60 * 1000);
      return { judul: 'Ibadah Minggu Raya', jenis: 'IBADAH', waktuMulai, waktuSelesai };
    }),
  ];

  let processed = 0;
  const results = await mapLimit(jobs, 6, async (job) => {
    const actorUserId = userIds[randomInt(0, userIds.length - 1)];
    const result = await seedOneEvent({ ...job, actorUserId, typeToCandidates, volunteerTypesByName });
    processed++;
    if (processed % 20 === 0) console.log(`  [events] ${processed}/${jobs.length} event diproses...`);
    return result;
  });

  console.log(`[events] Selesai: ${results.length} event dibuat (${sundayDates.length} ibadah mingguan + ${specialEvents.length} event khusus + ${futureSundays.length} mendatang).`);
  return results;
}

module.exports = { seedEvents };
