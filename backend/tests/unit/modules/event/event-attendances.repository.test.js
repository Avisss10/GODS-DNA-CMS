jest.mock('../../../../src/config/database');
const { getPool } = require('../../../../src/config/database');
const repo = require('../../../../src/modules/event/event-attendances.repository');

describe('event-attendances.repository — insertAttendance (Unit Test)', () => {
  it('harus INSERT satu baris dan mengembalikan insertId', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 3 }]) };
    getPool.mockReturnValue(mockPool);

    const id = await repo.insertAttendance({ event_id: 1, jemaat_id: 2 });

    expect(id).toBe(3);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/INSERT INTO event_attendances/);
  });
});

describe('event-attendances.repository — insertBatch (Unit Test)', () => {
  it('harus INSERT batch dan skip jika array kosong', async () => {
    const mockPool = { query: jest.fn() };
    getPool.mockReturnValue(mockPool);

    await repo.insertBatch(1, []);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('harus INSERT batch untuk semua jemaatId', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ affectedRows: 2 }]) };
    getPool.mockReturnValue(mockPool);

    await repo.insertBatch(1, [2, 3]);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/INSERT INTO event_attendances/);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/\(1, 2/);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/\(1, 3/);
  });
});

describe('event-attendances.repository — findByEventAndJemaat (Unit Test)', () => {
  it('harus mengembalikan null jika tidak ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findByEventAndJemaat(1, 2)).toBeNull();
  });
});