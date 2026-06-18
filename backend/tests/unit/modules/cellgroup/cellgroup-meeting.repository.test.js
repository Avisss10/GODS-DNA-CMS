jest.mock('../../../../src/config/database');
const { getPool } = require('../../../../src/config/database');
const repo = require('../../../../src/modules/cellgroup/cellgroup-meeting.repository');

describe('cellgroup-meeting.repository — createMeeting (Unit Test)', () => {
  it('harus INSERT dan mengembalikan insertId', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 1 }]) };
    getPool.mockReturnValue(mockPool);

    const id = await repo.createMeeting({
      cgId: 1, judul: 'Meeting Minggu Ini', jenis: 'OFFLINE',
      waktuMulai: '2026-06-20 19:00:00', waktuSelesai: '2026-06-20 21:00:00',
      createdBy: 5,
    });

    expect(id).toBe(1);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/INSERT INTO cg_meeting/);
  });

  it('catatan harus default null jika tidak diberikan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 1 }]) };
    getPool.mockReturnValue(mockPool);

    await repo.createMeeting({
      cgId: 1, judul: 'Meeting', jenis: 'ONLINE',
      waktuMulai: '2026-06-20 19:00:00', waktuSelesai: '2026-06-20 20:00:00', createdBy: 5,
    });

    expect(mockPool.query.mock.calls[0][1].catatan).toBeNull();
  });
});

describe('cellgroup-meeting.repository — findMeetingById (Unit Test)', () => {
  it('harus mengembalikan meeting jika ditemukan', async () => {
    const mockMeeting = { id: 1, judul: 'Meeting A' };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockMeeting]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findMeetingById(1)).toEqual(mockMeeting);
  });

  it('harus mengembalikan null jika tidak ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findMeetingById(999)).toBeNull();
  });
});

describe('cellgroup-meeting.repository — addMeetingPhoto & countMeetingPhotos (Unit Test)', () => {
  it('addMeetingPhoto harus INSERT dan mengembalikan insertId', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 3 }]) };
    getPool.mockReturnValue(mockPool);

    const id = await repo.addMeetingPhoto({
      meetingId: 1, filePath: '/uploads/foto1.jpg', fileSizeKb: 480, uploadedBy: 5,
    });

    expect(id).toBe(3);
  });

  it('countMeetingPhotos harus mengembalikan jumlah sebagai number', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[{ total: 4 }]]) };
    getPool.mockReturnValue(mockPool);

    const count = await repo.countMeetingPhotos(1);

    expect(count).toBe(4);
    expect(typeof count).toBe('number');
  });
});

describe('cellgroup-meeting.repository — findActiveMembersAtMeetingTime (Unit Test)', () => {
  it('query harus menyertakan kondisi left_at IS NULL OR left_at > waktuMeeting', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    await repo.findActiveMembersAtMeetingTime(1, '2026-06-20 19:00:00');

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toMatch(/left_at IS NULL OR cgm\.left_at > :waktuMeeting/);
  });

  it('harus mengembalikan daftar anggota', async () => {
    const mockMembers = [{ id: 1, nama: 'Budi' }];
    const mockPool = { query: jest.fn().mockResolvedValue([mockMembers]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findActiveMembersAtMeetingTime(1, '2026-06-20 19:00:00')).toEqual(mockMembers);
  });
});

describe('cellgroup-meeting.repository — upsertAbsensi (Unit Test)', () => {
  it('harus menggunakan ON DUPLICATE KEY UPDATE', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.upsertAbsensi(1, 10, true);

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/);
    expect(mockPool.query.mock.calls[0][1]).toEqual({ meetingId: 1, jemaatId: 10, hadir: true });
  });
});

describe('cellgroup-meeting.repository — findAbsensiByMeeting (Unit Test)', () => {
  it('harus mengembalikan daftar absensi dengan nama jemaat', async () => {
    const mockData = [{ jemaat_id: 10, nama: 'Budi', hadir: 1 }];
    const mockPool = { query: jest.fn().mockResolvedValue([mockData]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findAbsensiByMeeting(1)).toEqual(mockData);
  });
});