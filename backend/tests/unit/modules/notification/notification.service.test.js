jest.mock('../../../../src/modules/notification/notification.repository');
const notificationRepository = require('../../../../src/modules/notification/notification.repository');

const {
  notifyLeaders,
  notifyUser,
  listNotifications,
  markAsRead,
  markAllAsRead,
  countUnread,
} = require('../../../../src/modules/notification/notification.service');

beforeEach(() => jest.clearAllMocks());

// ── notifyLeaders ─────────────────────────────────────────────────
describe('notification.service — notifyLeaders (Unit Test)', () => {
  it('harus kirim notifikasi ke semua leader aktif', async () => {
    notificationRepository.findAllActiveLeaders.mockResolvedValue([
      { id: 1, username: 'leader1' },
      { id: 2, username: 'leader2' },
    ]);
    notificationRepository.create.mockResolvedValue(10);

    const result = await notifyLeaders({
      jenis: 'EVENT_SELESAI',
      judul: 'Event Selesai',
      pesan: 'Ibadah Raya telah selesai',
    });

    expect(notificationRepository.create).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });

  it('harus return array kosong jika tidak ada leader aktif', async () => {
    notificationRepository.findAllActiveLeaders.mockResolvedValue([]);

    const result = await notifyLeaders({
      jenis: 'SCORING_SELESAI',
      judul: 'Scoring Selesai',
      pesan: '10 jemaat dihitung ulang',
    });

    expect(result).toHaveLength(0);
    expect(notificationRepository.create).not.toHaveBeenCalled();
  });
});

// ── notifyUser ────────────────────────────────────────────────────
describe('notification.service — notifyUser (Unit Test)', () => {
  it('harus membuat notifikasi untuk user tertentu', async () => {
    notificationRepository.create.mockResolvedValue(5);

    const id = await notifyUser({
      userId: 3,
      jenis: 'LEADER_TINGGAL_SATU',
      judul: 'Peringatan',
      pesan: 'Jumlah Leader tinggal 1',
    });

    expect(id).toBe(5);
    expect(notificationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 3, jenis: 'LEADER_TINGGAL_SATU' })
    );
  });
});

// ── listNotifications ─────────────────────────────────────────────
describe('notification.service — listNotifications (Unit Test)', () => {
  it('harus mengembalikan semua notifikasi user', async () => {
    notificationRepository.findByUser.mockResolvedValue([
      { id: 1, jenis: 'EVENT_SELESAI', is_read: false },
      { id: 2, jenis: 'SCORING_SELESAI', is_read: true },
    ]);

    const result = await listNotifications(1);

    expect(result).toHaveLength(2);
    expect(notificationRepository.findByUser).toHaveBeenCalledWith(1, { onlyUnread: false });
  });

  it('harus filter hanya yang belum dibaca jika onlyUnread=true', async () => {
    notificationRepository.findByUser.mockResolvedValue([
      { id: 1, jenis: 'EVENT_SELESAI', is_read: false },
    ]);

    await listNotifications(1, { onlyUnread: true });

    expect(notificationRepository.findByUser).toHaveBeenCalledWith(1, { onlyUnread: true });
  });
});

// ── markAsRead ────────────────────────────────────────────────────
describe('notification.service — markAsRead (Unit Test)', () => {
  it('harus return true jika notifikasi berhasil ditandai', async () => {
    notificationRepository.markAsRead.mockResolvedValue(true);

    const result = await markAsRead(1, 3);
    expect(result).toBe(true);
  });

  it('harus return false jika notifikasi tidak ditemukan', async () => {
    notificationRepository.markAsRead.mockResolvedValue(false);

    const result = await markAsRead(999, 3);
    expect(result).toBe(false);
  });
});

// ── markAllAsRead ─────────────────────────────────────────────────
describe('notification.service — markAllAsRead (Unit Test)', () => {
  it('harus return jumlah notifikasi yang diupdate', async () => {
    notificationRepository.markAllAsRead.mockResolvedValue(5);

    const count = await markAllAsRead(3);
    expect(count).toBe(5);
  });
});

// ── countUnread ───────────────────────────────────────────────────
describe('notification.service — countUnread (Unit Test)', () => {
  it('harus return jumlah notifikasi yang belum dibaca', async () => {
    notificationRepository.countUnread.mockResolvedValue(3);

    const count = await countUnread(1);
    expect(count).toBe(3);
  });
});