require('dotenv').config();

const authRepository = require('../../modules/auth/auth.repository');
const { hashPassword } = require('../../utils/password.util');
const jemaatService = require('../../modules/jemaat/jemaat.service');
const cellGroupService = require('../../modules/cellgroup/cellgroup.service');
const volunteerService = require('../../modules/volunteer/volunteer.service');
const eventService = require('../../modules/event/event.service');
const { closePool } = require('../../config/database');

/**
 * Seed data pengembangan/testing (BUKAN production): 10 user (5 LEADER +
 * 5 ADMIN), ~40 jemaat, 6 cell group + meeting, 5 jenis volunteer +
 * pendaftaran, dan beberapa event. Dipakai lewat app service layer
 * (bukan INSERT mentah) supaya enkripsi field sensitif, hashing
 * password, dan audit log tetap konsisten dengan alur aplikasi asli.
 *
 * Aman dijalankan berkali-kali TANPA duplikasi tak sengaja: berhenti
 * di awal kalau tabel `users` sudah tidak kosong (kecuali FORCE=1).
 *
 * Jalankan: node src/database/seeds/seed-dev-data.js
 */

const SHARED_PASSWORD = 'Password123!';

const MALE_FIRST_NAMES = [
  'Budi', 'Andi', 'Dedi', 'Agus', 'Rudi', 'Hendra', 'Yusuf', 'Bambang', 'Joko', 'Wahyu',
  'Fajar', 'Rizky', 'Dimas', 'Eko', 'Arif', 'Anton', 'Hadi', 'Iwan', 'Bayu', 'Gunawan',
];
const FEMALE_FIRST_NAMES = [
  'Siti', 'Dewi', 'Rina', 'Sri', 'Ani', 'Yuni', 'Fitri', 'Wati', 'Lina', 'Maya',
  'Ratna', 'Indah', 'Putri', 'Wulan', 'Tuti', 'Vina', 'Sari', 'Nita', 'Diah', 'Yulia',
];
const LAST_NAMES = [
  'Santoso', 'Wijaya', 'Kusuma', 'Setiawan', 'Pratama', 'Saputra', 'Halim', 'Wibowo',
  'Susanto', 'Hartono', 'Gunawan', 'Sitorus', 'Simanjuntak', 'Tampubolon', 'Manurung',
  'Pardede', 'Sihombing', 'Napitupulu', 'Purnomo', 'Nugroho',
];
const STREETS = [
  'Jl. Grand Wisata Boulevard', 'Jl. Kalimas Raya', 'Jl. Persada Regency',
  'Jl. Mawar Cluster', 'Jl. Anggrek Residence', 'Jl. Kertajaya', 'Jl. Legenda Wisata',
  'Jl. Ubud Village', 'Jl. Bali Village', 'Jl. Bandung Village',
];
const CG_NAMES = [
  'CG Antiokhia', 'CG Efesus', 'CG Filipi', 'CG Korintus', 'CG Galatia', 'CG Roma',
];
const VOLUNTEER_TYPES = [
  { nama: 'Usher', deskripsi: 'Penyambutan & pengaturan jemaat saat ibadah' },
  { nama: 'Singer', deskripsi: 'Tim vokal ibadah' },
  { nama: 'Sound Engineer', deskripsi: 'Operator sound system' },
  { nama: 'Multimedia', deskripsi: 'Operator lirik & tayangan' },
  { nama: 'Doa Syafaat', deskripsi: 'Tim pendoa syafaat sebelum & saat ibadah' },
];
const EVENTS = [
  { judul: 'Ibadah Minggu Raya', jenis: 'IBADAH' },
  { judul: 'Doa Puasa Awal Tahun', jenis: 'DOA' },
  { judul: 'Pelatihan Cell Group Leader', jenis: 'PELATIHAN' },
  { judul: 'Ibadah Natal', jenis: 'IBADAH' },
  { judul: 'Retreat Remaja', jenis: 'RETREAT' },
  { judul: 'Baptisan Air', jenis: 'IBADAH' },
];

function pick(arr, i) {
  return arr[i % arr.length];
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function randomDateStr(startYear, endYear) {
  const year = randomInt(startYear, endYear);
  const month = randomInt(1, 12);
  const day = randomInt(1, 28);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function daysAgoStr(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function futureDateTimeStr(daysFromNow, hour) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function seedUsers() {
  const users = { leaders: [], admins: [] };
  const passwordHash = await hashPassword(SHARED_PASSWORD);

  for (let i = 1; i <= 5; i++) {
    const username = `leader${i}`;
    const id = await authRepository.createUser({ username, passwordHash, peran: 'LEADER' });
    users.leaders.push({ id, username });
  }
  for (let i = 1; i <= 5; i++) {
    const username = `admin${i}`;
    const id = await authRepository.createUser({ username, passwordHash, peran: 'ADMIN' });
    users.admins.push({ id, username });
  }
  return users;
}

async function seedJemaat(actorUserId, count) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const isMale = i % 2 === 0;
    const first = isMale ? pick(MALE_FIRST_NAMES, i) : pick(FEMALE_FIRST_NAMES, i);
    const last = pick(LAST_NAMES, i + 3);
    const nama = `${first} ${last}`;
    const joinDaysAgo = i < 3 ? randomInt(1, 20) : randomInt(21, 900); // beberapa "jemaat baru"

    const { id } = await jemaatService.createJemaat(
      {
        nama,
        tgl_lahir: randomDateStr(1955, 2012),
        jenis_kelamin: isMale ? 'L' : 'P',
        tgl_bergabung: daysAgoStr(joinDaysAgo),
        no_hp: `08${randomInt(1000000000, 1999999999)}`,
        alamat: `${pick(STREETS, i)} No. ${randomInt(1, 99)}, Grand Wisata, Bekasi`,
        media_sosial: i % 3 !== 0 ? { instagram: `@${first.toLowerCase()}${last.toLowerCase()}` } : {},
      },
      { confirmed: true, actorUserId },
    );
    ids.push(id);
  }
  return ids;
}

async function seedCellGroups(actorUserId, jemaatIds) {
  const cgIds = [];
  const membersPerCg = 6; // 1 leader + 5 anggota
  let cursor = 0;

  for (let i = 0; i < CG_NAMES.length; i++) {
    const slice = jemaatIds.slice(cursor, cursor + membersPerCg);
    cursor += membersPerCg;
    if (slice.length === 0) break;

    const leaderId = slice[0];
    const { id: cgId } = await cellGroupService.createCellGroup(
      { nama: pick(CG_NAMES, i), deskripsi: `Cell group wilayah ${pick(CG_NAMES, i)}`, leaderId },
      { actorUserId },
    );

    for (const memberId of slice.slice(1)) {
      await cellGroupService.addMemberToCg(cgId, memberId, { actorUserId });
    }

    // 2 pertemuan per CG, dijadwalkan di masa depan
    for (let m = 0; m < 2; m++) {
      await cellGroupService.createMeeting(
        {
          cgId,
          judul: `Pertemuan ${pick(CG_NAMES, i)} #${m + 1}`,
          jenis: m % 2 === 0 ? 'OFFLINE' : 'ONLINE',
          waktuMulai: futureDateTimeStr(7 * (m + 1), 19),
          waktuSelesai: futureDateTimeStr(7 * (m + 1), 21),
          catatan: 'Pertemuan rutin mingguan',
        },
        { actorUserId },
      );
    }

    cgIds.push(cgId);
  }
  return cgIds;
}

async function seedVolunteers(actorUserId, jemaatIds) {
  const typeIds = [];
  for (const t of VOLUNTEER_TYPES) {
    const { id } = await volunteerService.createVolunteerType(t, { actorUserId });
    typeIds.push(id);
  }

  // ~20 pendaftaran, sebagian jemaat dapat >1 peran
  let regCount = 0;
  for (let i = 0; i < jemaatIds.length && regCount < 20; i++) {
    if (i % 2 === 0) {
      const typeId = pick(typeIds, i);
      await volunteerService.registerVolunteer(jemaatIds[i], typeId, { actorUserId });
      regCount++;
      if (i % 6 === 0) {
        const secondType = pick(typeIds, i + 2);
        await volunteerService.registerVolunteer(jemaatIds[i], secondType, { actorUserId });
        regCount++;
      }
    }
  }
  return typeIds;
}

async function seedEvents(actorUserId) {
  const ids = [];
  for (let i = 0; i < EVENTS.length; i++) {
    const ev = await eventService.createEvent(
      {
        judul: EVENTS[i].judul,
        jenis: EVENTS[i].jenis,
        waktu_mulai: futureDateTimeStr(3 * (i + 1), 9),
        waktu_selesai: futureDateTimeStr(3 * (i + 1), 12),
        deskripsi: `${EVENTS[i].judul} — jadwal seed data testing`,
      },
      { actorUserId },
    );
    ids.push(ev.id);
  }
  return ids;
}

async function main() {
  const existing = await authRepository.findAllUsers();
  if (existing.length > 0 && process.env.FORCE !== '1') {
    console.log(`Tabel users sudah berisi ${existing.length} akun — batal seed (set FORCE=1 untuk memaksa tetap jalan).`);
    await closePool();
    return;
  }

  console.log('Seeding users...');
  const users = await seedUsers();
  const actorUserId = users.leaders[0].id;

  console.log('Seeding jemaat...');
  const jemaatIds = await seedJemaat(actorUserId, 40);

  console.log('Seeding cell groups + meetings...');
  await seedCellGroups(actorUserId, jemaatIds);

  console.log('Seeding volunteer types + registrations...');
  await seedVolunteers(actorUserId, jemaatIds);

  console.log('Seeding events...');
  await seedEvents(actorUserId);

  console.log('\n=== Selesai ===');
  console.log(`User dibuat: ${users.leaders.length} LEADER, ${users.admins.length} ADMIN`);
  console.log(`Password semua akun: ${SHARED_PASSWORD}`);
  console.log('Username LEADER:', users.leaders.map((u) => u.username).join(', '));
  console.log('Username ADMIN:', users.admins.map((u) => u.username).join(', '));
  console.log(`Jemaat dibuat: ${jemaatIds.length}`);

  await closePool();
}

main().catch(async (err) => {
  console.error('Seed gagal:', err);
  await closePool();
  process.exitCode = 1;
});
