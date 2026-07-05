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

describe('event-volunteer.repository — assignWithConnection (Unit Test)', () => {
  it('harus INSERT memakai connection yang diberikan, bukan pool', async () => {
    const mockConnection = { query: jest.fn().mockResolvedValue([{ insertId: 9 }]) };

    const id = await repo.assignWithConnection(mockConnection, { event_id: 1, jemaat_id: 2, jenis_id: 3 });

    expect(id).toBe(9);
    expect(mockConnection.query.mock.calls[0][0]).toMatch(/INSERT INTO event_volunteer/);
  });
});

describe('event-volunteer.repository — countActiveByEventAndJenis (Unit Test)', () => {
  it('harus menghitung jumlah penugasan AKTIF memakai executor yang diberikan', async () => {
    const mockExecutor = { query: jest.fn().mockResolvedValue([[{ total: 3 }]]) };

    const total = await repo.countActiveByEventAndJenis(mockExecutor, 1, 3);

    expect(total).toBe(3);
    expect(mockExecutor.query.mock.calls[0][0]).toMatch(/status = 'AKTIF'/);
  });

  it('harus memakai FOR UPDATE agar membaca data ter-commit terbaru di dalam transaksi', async () => {
    const mockExecutor = { query: jest.fn().mockResolvedValue([[{ total: 0 }]]) };

    await repo.countActiveByEventAndJenis(mockExecutor, 1, 3);

    expect(mockExecutor.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
  });
});

describe('event-volunteer.repository — countTugas30HariBatch (Unit Test)', () => {
  it('harus mengembalikan peta jemaat_id → jumlah tugas 30 hari terakhir', async () => {
    const mockRows = [{ jemaat_id: 2, total: 5 }, { jemaat_id: 4, total: 1 }];
    const mockPool = { query: jest.fn().mockResolvedValue([mockRows]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.countTugas30HariBatch([2, 4]);

    expect(result).toEqual({ 2: 5, 4: 1 });
    expect(mockPool.query.mock.calls[0][0]).toMatch(/INTERVAL 30 DAY/);
  });

  it('harus mengembalikan object kosong tanpa query jika jemaatIds kosong', async () => {
    const mockPool = { query: jest.fn() };
    getPool.mockReturnValue(mockPool);

    const result = await repo.countTugas30HariBatch([]);

    expect(result).toEqual({});
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});

describe('event-volunteer.repository — findConflictingJemaatIds (Unit Test)', () => {
  it('harus mengembalikan jemaat_id dengan penugasan AKTIF yang waktunya overlap', async () => {
    const mockRows = [{ jemaat_id: 5 }, { jemaat_id: 6 }];
    const mockPool = { query: jest.fn().mockResolvedValue([mockRows]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findConflictingJemaatIds({
      waktuMulai: '2026-06-01 09:00:00', waktuSelesai: '2026-06-01 11:00:00', excludeEventId: 1,
    });

    expect(result).toEqual([5, 6]);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/status = 'AKTIF'/);
  });
});