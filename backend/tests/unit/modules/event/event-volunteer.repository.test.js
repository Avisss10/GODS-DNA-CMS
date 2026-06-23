jest.mock('../../../../src/config/database');
const { getPool } = require('../../../../src/config/database');
const repo = require('../../../../src/modules/event/event-volunteer.repository');

describe('event-volunteer.repository — assign (Unit Test)', () => {
  it('harus INSERT dan mengembalikan insertId', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 7 }]) };
    getPool.mockReturnValue(mockPool);

    const id = await repo.assign({ event_id: 1, jemaat_id: 2, jenis_id: 3 });

    expect(id).toBe(7);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/INSERT INTO event_volunteer/);
  });
});

describe('event-volunteer.repository — findActiveByEvent (Unit Test)', () => {
  it('harus mengembalikan daftar volunteer aktif', async () => {
    const mockRows = [
      { id: 1, jemaat_id: 2, nama_jemaat: 'Budi', jenis_id: 3, nama_jenis: 'Usher', status: 'AKTIF' },
    ];
    const mockPool = { query: jest.fn().mockResolvedValue([mockRows]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findActiveByEvent(1);
    expect(result).toEqual(mockRows);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/status = 'AKTIF'/);
  });
});

describe('event-volunteer.repository — findById (Unit Test)', () => {
  it('harus mengembalikan data jika ditemukan', async () => {
    const mockRow = { id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF' };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockRow]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findById(7)).toEqual(mockRow);
  });

  it('harus mengembalikan null jika tidak ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findById(999)).toBeNull();
  });
});

describe('event-volunteer.repository — updateStatus (Unit Test)', () => {
  it('harus UPDATE status dan field terkait', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    getPool.mockReturnValue(mockPool);

    await repo.updateStatus(1, { status: 'DIGANTIKAN', replacement_timing: 'SEBELUM_EVENT' });

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toMatch(/UPDATE event_volunteer/);
    expect(sql).toMatch(/status = :status/);
  });

  it('tidak boleh query jika tidak ada field yang diupdate', async () => {
    const mockPool = { query: jest.fn() };
    getPool.mockReturnValue(mockPool);

    await repo.updateStatus(1, {});
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});

describe('event-volunteer.repository — findAssignedByJenis (Unit Test)', () => {
  it('harus mengembalikan jemaat_id yang sudah ditugaskan', async () => {
    const mockRows = [{ jemaat_id: 2 }, { jemaat_id: 4 }];
    const mockPool = { query: jest.fn().mockResolvedValue([mockRows]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findAssignedByJenis(1, 3);
    expect(result).toEqual(mockRows);
  });
});