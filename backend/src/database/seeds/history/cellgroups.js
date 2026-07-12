const sharp = require('sharp');
const { getPool } = require('../../../config/database');
const cellGroupService = require('../../../modules/cellgroup/cellgroup.service');
const {
  NOW,
  addDays,
  daysAgo,
  randomInt,
  chance,
  pickRandom,
  attendanceProbabilityFor,
  formatDateTime,
  backdate,
  withHistoricalDate,
  mapLimit,
} = require('./_helpers');

const CG_NAMES = [
  'CG Antiokhia', 'CG Efesus', 'CG Filipi', 'CG Korintus', 'CG Galatia', 'CG Roma',
  'CG Kolose', 'CG Tesalonika', 'CG Filemon', 'CG Yakobus', 'CG Petrus',
];

const MAX_MEETINGS_PER_CG = 70;
const PHOTO_CHANCE = 0.2;

function cgOpenDate(index, total) {
  // 8 CG pertama dibuka bertahap di ~5 bulan pertama (basis awal),
  // sisanya dibuka belakangan (pertumbuhan organik tahun ke-1/ke-2).
  if (index < Math.ceil(total * 0.7)) {
    return daysAgo(730 - randomInt(0, 150));
  }
  return daysAgo(randomInt(270, 450));
}

async function generatePlaceholderPhoto() {
  const palette = [
    { r: 120, g: 150, b: 200 }, { r: 200, g: 160, b: 120 }, { r: 150, g: 190, b: 140 },
  ];
  const color = pickRandom(palette);
  return sharp({ create: { width: 900, height: 600, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
}

/**
 * Buat 1 CG + leader + anggota. Mengembalikan descriptor lengkap
 * (dipakai seedMeetingsForCellGroup) berisi state member yang kita
 * kelola sendiri di memori (joinedAt/leftAt) supaya generator meeting
 * tidak perlu query ulang keanggotaan aktif per tanggal ke DB.
 */
async function createOneCellGroup({ nama, createdAt, leaderJemaat, memberJemaat, actorUserId }) {
  const { id: cgId } = await withHistoricalDate(createdAt, () =>
    cellGroupService.createCellGroup(
      { nama, deskripsi: `Cell group wilayah ${nama}`, leaderId: leaderJemaat.id },
      { actorUserId }
    )
  );

  await backdate('cell_group', cgId, createdAt, 'created_at');
  // createCellGroup juga otomatis insert leader ke cell_group_members —
  // backdate joined_at baris tsb juga.
  await backdate('cell_group_members', await findLeaderMembershipId(cgId, leaderJemaat.id), createdAt, 'joined_at');

  const members = [{ jemaatId: leaderJemaat.id, joinedAt: createdAt, leftAt: null, isLeader: true, engagementProfile: leaderJemaat.engagementProfile }];

  for (const jemaat of memberJemaat) {
    const joinedAt = addDays(createdAt, randomInt(0, 45));
    if (joinedAt > NOW) continue;

    await withHistoricalDate(joinedAt, () =>
      cellGroupService.addMemberToCg(cgId, jemaat.id, { actorUserId })
    );
    const memberRowId = await findMembershipId(cgId, jemaat.id);
    await backdate('cell_group_members', memberRowId, joinedAt, 'joined_at');

    let leftAt = null;
    // Churn kecil: sebagian anggota keluar CG di tengah jalan.
    if (chance(0.08) && joinedAt < daysAgo(90)) {
      const candidateLeft = addDays(joinedAt, randomInt(60, Math.max(61, Math.floor((NOW - joinedAt) / (24 * 60 * 60 * 1000)) - 1)));
      if (candidateLeft < NOW) {
        await withHistoricalDate(candidateLeft, () =>
          cellGroupService.removeMemberFromCg(cgId, jemaat.id, { actorUserId })
        );
        await backdate('cell_group_members', memberRowId, candidateLeft, 'left_at');
        leftAt = candidateLeft;
      }
    }

    members.push({ jemaatId: jemaat.id, joinedAt, leftAt, isLeader: false, engagementProfile: jemaat.engagementProfile });
  }

  return { id: cgId, nama, createdAt, leaderJemaatId: leaderJemaat.id, members };
}

async function findLeaderMembershipId(cgId, jemaatId) {
  return findMembershipId(cgId, jemaatId);
}

async function findMembershipId(cgId, jemaatId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id FROM cell_group_members WHERE cg_id = :cgId AND jemaat_id = :jemaatId ORDER BY id DESC LIMIT 1`,
    { cgId, jemaatId }
  );
  return rows[0].id;
}

function isActiveAt(member, date) {
  return member.joinedAt <= date && (member.leftAt === null || member.leftAt > date);
}

/**
 * Generate seluruh histori meeting + absensi + (kadang) foto untuk
 * SATU cell group, dari tanggal ia dibuka sampai sekarang. Dipanggil
 * lewat mapLimit di index.js supaya beberapa CG diproses paralel.
 */
async function seedMeetingsForCellGroup(cg, actorUserId) {
  let heldCount = 0;
  let photoCount = 0;
  let cursor = addDays(cg.createdAt, 7);

  while (cursor < NOW && heldCount < MAX_MEETINGS_PER_CG) {
    if (chance(0.12)) {
      cursor = addDays(cursor, 7);
      continue; // minggu dilewati (libur/tidak ada pertemuan)
    }

    const waktuMulai = new Date(cursor);
    waktuMulai.setHours(19, 0, 0, 0);
    const waktuSelesai = new Date(waktuMulai.getTime() + 2 * 60 * 60 * 1000);
    if (waktuSelesai >= NOW) break;

    const jenis = chance(0.8) ? 'OFFLINE' : 'ONLINE';
    const activeMembers = cg.members.filter((m) => isActiveAt(m, waktuMulai));

    if (activeMembers.length === 0) {
      cursor = addDays(cursor, 7);
      continue;
    }

    const { id: meetingId } = await withHistoricalDate(waktuMulai, () =>
      cellGroupService.createMeeting(
        {
          cgId: cg.id,
          judul: `Pertemuan Rutin ${cg.nama}`,
          jenis,
          waktuMulai: formatDateTime(waktuMulai),
          waktuSelesai: formatDateTime(waktuSelesai),
          catatan: 'Pertemuan rutin mingguan.',
        },
        { actorUserId }
      )
    );
    await backdate('cg_meeting', meetingId, waktuMulai, 'created_at');

    const absensiList = activeMembers.map((m) => ({
      jemaatId: m.jemaatId,
      hadir: chance(attendanceProbabilityFor(m.engagementProfile, waktuMulai)),
    }));

    await withHistoricalDate(waktuSelesai, () =>
      cellGroupService.submitAbsensi(meetingId, absensiList, { actorUserId, actorRole: 'LEADER' })
    );
    await getPool().query('UPDATE cg_absensi SET created_at = :d WHERE meeting_id = :m', {
      d: formatDateTime(waktuMulai),
      m: meetingId,
    });

    if (chance(PHOTO_CHANCE)) {
      const buffer = await generatePlaceholderPhoto();
      const results = await withHistoricalDate(waktuSelesai, () =>
        cellGroupService.addPhotosToMeeting(meetingId, [buffer], { actorUserId, actorRole: 'LEADER' })
      );
      for (const photo of results) {
        await backdate('cg_meeting_photos', photo.id, addDays(waktuSelesai, randomInt(0, 2)), 'uploaded_at');
      }
      photoCount += results.length;
    }

    heldCount++;
    cursor = addDays(cursor, 7);
  }

  return { cgId: cg.id, meetings: heldCount, photos: photoCount };
}

/**
 * Bagi pool jemaat ke sejumlah CG (leader + anggota), dan buat semua
 * CG secara sequential (dependensi antar-CG tidak ada, tapi urutan
 * sequential di sini lebih sederhana — volume CG jauh lebih kecil
 * daripada volume meeting, jadi tidak krusial untuk diparalel).
 *
 * @returns {{ cellGroups: Array, usedJemaatIds: Set<number> }}
 */
async function seedCellGroups(jemaatPool, leaderUserIds) {
  const shuffled = [...jemaatPool].sort(() => Math.random() - 0.5);
  const usedJemaatIds = new Set();
  const cellGroups = [];
  let cursor = 0;

  for (let i = 0; i < CG_NAMES.length; i++) {
    const sizeExcludingLeader = randomInt(9, 13);
    const slice = shuffled.slice(cursor, cursor + 1 + sizeExcludingLeader);
    cursor += 1 + sizeExcludingLeader;
    if (slice.length < 2) break;

    const [leaderJemaat, ...memberJemaat] = slice;
    const createdAt = cgOpenDate(i, CG_NAMES.length);
    const actorUserId = leaderUserIds[i % leaderUserIds.length];

    const cg = await createOneCellGroup({
      nama: CG_NAMES[i],
      createdAt,
      leaderJemaat,
      memberJemaat,
      actorUserId,
    });

    for (const m of cg.members) usedJemaatIds.add(m.jemaatId);
    cellGroups.push({ ...cg, actorUserId });

    console.log(`  [cellgroups] ${cg.nama} dibuat (${cg.members.length} anggota) — ${createdAt.toISOString().slice(0, 10)}`);
  }

  console.log('[cellgroups] Membuat histori meeting + absensi (paralel per CG)...');
  const meetingResults = await mapLimit(cellGroups, 6, (cg) => seedMeetingsForCellGroup(cg, cg.actorUserId));

  const totalMeetings = meetingResults.reduce((sum, r) => sum + r.meetings, 0);
  const totalPhotos = meetingResults.reduce((sum, r) => sum + r.photos, 0);
  console.log(`[cellgroups] Selesai: ${cellGroups.length} CG, ${totalMeetings} meeting, ${totalPhotos} foto.`);

  return { cellGroups, usedJemaatIds };
}

module.exports = { seedCellGroups, CG_NAMES };
