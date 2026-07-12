require('dotenv').config();

const { closePool, getPool } = require('../../../config/database');
const { seedUsers } = require('./users');
const { seedJemaat, fixNewMemberFlags, applyChurn } = require('./jemaat');
const { seedCellGroups } = require('./cellgroups');
const { seedVolunteerTypes, seedVolunteerRegistrations } = require('./volunteers');
const { seedEvents } = require('./events');
const { seedNotifications, seedExportAuditLogs } = require('./notifications');
const { runConvergingScoringBatch, printStatusDistribution } = require('./scoring');

const JEMAAT_COUNT = 150;

const TABLES = [
  'users', 'jemaat', 'cell_group', 'cell_group_members', 'cg_meeting', 'cg_meeting_photos',
  'cg_absensi', 'volunteer_jenis', 'volunteer_members', 'event', 'event_volunteer_needs',
  'event_volunteer', 'event_attendances', 'event_kehadiran', 'audit_logs', 'notifications',
];

async function printRowCounts() {
  const pool = getPool();
  console.log('\n=== Jumlah baris per tabel ===');
  for (const table of TABLES) {
    const [[row]] = await pool.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
    console.log(`  ${table.padEnd(24)} ${row.total}`);
  }
}

async function main() {
  const startedAt = Date.now();
  console.log('=== Seed histori 2 tahun — GODS DNA CMS ===\n');

  console.log('--- 1/8 Users ---');
  const users = await seedUsers();
  const leaderUserIds = users.leaders.map((u) => u.id);
  const allUserIds = [...users.leaders, ...users.admins].map((u) => u.id);
  const primaryActor = leaderUserIds[0];

  console.log('\n--- 2/8 Jemaat ---');
  const jemaatPool = await seedJemaat(primaryActor, JEMAAT_COUNT);
  await fixNewMemberFlags();

  console.log('\n--- 3/8 Cell Groups + Meetings + Absensi ---');
  const { cellGroups, usedJemaatIds } = await seedCellGroups(jemaatPool, leaderUserIds);

  console.log('\n--- 4/8 Volunteer ---');
  const volunteerTypes = await seedVolunteerTypes(primaryActor);
  const registry = await seedVolunteerRegistrations(jemaatPool, volunteerTypes, primaryActor);

  console.log('\n--- 5/8 Churn jemaat (soft-delete) ---');
  const availableForChurn = new Set(
    jemaatPool.map((j) => j.id).filter((id) => !usedJemaatIds.has(id) && !registry.has(id))
  );
  await applyChurn(jemaatPool, availableForChurn, primaryActor);

  console.log('\n--- 6/8 Events ---');
  await seedEvents(jemaatPool, registry, volunteerTypes, allUserIds);

  console.log('\n--- 7/8 Notifications + Export audit logs ---');
  await seedNotifications(users);
  await seedExportAuditLogs(users);

  console.log('\n--- 8/8 Scoring (konvergensi anti-cliff) ---');
  await runConvergingScoringBatch();
  await printStatusDistribution();

  await printRowCounts();

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n=== Selesai dalam ${elapsedSec} detik ===`);
  console.log(`Cell group dibuat: ${cellGroups.length}`);
  console.log(`Password semua akun: ${users.sharedPassword}`);
}

main()
  .then(async () => {
    await closePool();
  })
  .catch(async (err) => {
    console.error('\n[FATAL] Seed histori gagal:', err);
    await closePool();
    process.exitCode = 1;
  });
