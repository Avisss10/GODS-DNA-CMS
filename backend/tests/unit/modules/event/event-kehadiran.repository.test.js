jest.mock('../../../../src/config/database');
const { getPool } = require('../../../../src/config/database');
const repo = require('../../../../src/modules/event/event-kehadiran.repository');

describe('event-kehadiran.repository — upsert (Unit Test)', () => {
  it('harus INSERT ON DUPLICATE KEY UPDATE', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 3, affectedRows: 1 }]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.upsert({ event_id: 1, total_hadir: 100, jemaat_baru: 5 });

    expect(mockPool.query.mock.calls[0][0]).toMatch(/INSERT INTO event_kehadiran/);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/ON DUPLICATE KEY UPDATE/);
    expect(result).toBe(3);
  });

  it('jemaat_baru harus default 0', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 1, affectedRows: 1 }]) };
    getPool.mockReturnValue(mockPool);

    await repo.upsert({ event_id: 1, total_hadir: 50 });

    expect(mockPool.query.mock.calls[0][1].jemaat_baru).toBe(0);
  });
});

describe('event-kehadiran.repository — findByEventId (Unit Test)', () => {
  it('harus mengembalikan data kehadiran jika ditemukan', async () => {
    const mockData = { id: 1, event_id: 1, total_hadir: 100, jemaat_baru: 5 };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockData]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findByEventId(1)).toEqual(mockData);
  });

  it('harus mengembalikan null jika tidak ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findByEventId(999)).toBeNull();
  });
});