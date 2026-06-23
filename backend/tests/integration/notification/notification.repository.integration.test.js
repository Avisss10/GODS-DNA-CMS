require('dotenv').config();
const { getPool, closePool } = require('../../../src/config/database');
const authRepository = require('../../../src/modules/auth/auth.repository');
const notificationRepository = require('../../../src/modules/notification/notification.repository');
const { hashPassword } = require('../../../src/utils/password.util');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.AES_ENCRYPTION_KEY && !!process.env.AUDIT_HMAC_SECRET;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('notification.repository — Integration Test (TiDB nyata)', () => {
  let pool;
  let leaderId;
  let adminId;
  let notifId;

  beforeAll(async () => {
    await ensureTablesExist();
    pool = getPool();

    const hash = await hashPassword('Password123!');
    leaderId = await authRepository.createUser({
      username: `notif_repo_leader_${Date.now()}`,
      passwordHash: hash,
      peran: 'LEADER',
    });
    adminId = await authRepository.createUser({
      username: `notif_repo_admin_${Date.now()}`,
      passwordHash: hash,
      peran: 'ADMIN',
    });
  }, 30000);

  afterAll(async () => {
    await pool.query(
      'DELETE FROM notifications WHERE user_id IN (:a, :b)',
      { a: leaderId, b: adminId }
    );
    await pool.query(
      'DELETE FROM users WHERE id IN (:a, :b)',
      { a: leaderId, b: adminId }
    );
    await closePool();
  }, 30000);

  it('create harus berhasil menyimpan notifikasi ke database', async () => {
    notifId = await notificationRepository.create({
      userId: leaderId,
      jenis: 'EVENT_SELESAI',
      judul: 'Test Event Selesai',
      pesan: 'Ibadah Raya telah selesai',
    });
    expect(typeof notifId).toBe('number');
    expect(notifId).toBeGreaterThan(0);
  }, 15000);

  it('findByUser harus mengembalikan notifikasi milik user', async () => {
    const result = await notificationRepository.findByUser(leaderId);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].user_id).toBe(leaderId);
  }, 15000);

  it('findByUser dengan onlyUnread=true hanya mengembalikan yang belum dibaca', async () => {
    const result = await notificationRepository.findByUser(leaderId, { onlyUnread: true });
    result.forEach((n) => expect(Number(n.is_read)).toBe(0));
  }, 15000);

  it('markAsRead harus menandai notifikasi sebagai sudah dibaca', async () => {
    const updated = await notificationRepository.markAsRead(notifId, leaderId);
    expect(updated).toBe(true);

    const result = await notificationRepository.findByUser(leaderId);
    const notif = result.find((n) => n.id === notifId);
    expect(Number(notif.is_read)).toBe(1);
  }, 15000);

  it('countUnread harus mengembalikan jumlah yang benar', async () => {
    // Buat notif baru yang belum dibaca
    await notificationRepository.create({
      userId: leaderId,
      jenis: 'SCORING_SELESAI',
      judul: 'Scoring Selesai',
      pesan: '5 jemaat dihitung ulang',
    });

    const count = await notificationRepository.countUnread(leaderId);
    expect(count).toBeGreaterThanOrEqual(1);
  }, 15000);

  it('findAllActiveLeaders harus mengembalikan hanya user dengan peran LEADER yang aktif', async () => {
    const leaders = await notificationRepository.findAllActiveLeaders();
    expect(Array.isArray(leaders)).toBe(true);
    leaders.forEach((l) => expect(l.id).toBeDefined());
    // Pastikan adminId tidak masuk
    const ids = leaders.map((l) => l.id);
    expect(ids).not.toContain(adminId);
    // Pastikan leaderId masuk
    expect(ids).toContain(leaderId);
  }, 15000);
});