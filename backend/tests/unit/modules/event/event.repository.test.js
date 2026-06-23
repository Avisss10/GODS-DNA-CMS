jest.mock('../../../../src/config/database');
const { getPool } = require('../../../../src/config/database');
const repo = require('../../../../src/modules/event/event.repository');

describe('event.repository — create (Unit Test)', () => {
  it('harus INSERT dan mengembalikan insertId', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 5 }]) };
    getPool.mockReturnValue(mockPool);

    const id = await repo.create({
      judul: 'Ibadah Raya', jenis: 'IBADAH',
      waktu_mulai: '2026-06-01 09:00:00', waktu_selesai: '2026-06-01 11:00:00',
      created_by: 1,
    });

    expect(id).toBe(5);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/INSERT INTO event/);
  });

  it('deskripsi harus default null jika tidak diberikan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 1 }]) };
    getPool.mockReturnValue(mockPool);

    await repo.create({
      judul: 'Test', jenis: 'KTB',
      waktu_mulai: '2026-01-01 09:00', waktu_selesai: '2026-01-01 10:00',
      created_by: 1,
    });

    expect(mockPool.query.mock.calls[0][1].deskripsi).toBeNull();
  });
});

describe('event.repository — findById (Unit Test)', () => {
  it('harus mengembalikan event jika ditemukan', async () => {
    const mockEvent = { id: 1, judul: 'Ibadah Raya', status: 'DRAFT' };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockEvent]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findById(1)).toEqual(mockEvent);
  });

  it('harus mengembalikan null jika tidak ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findById(999)).toBeNull();
  });
});

describe('event.repository — findAll (Unit Test)', () => {
  it('harus mengembalikan semua event tanpa filter', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[{ id: 1 }, { id: 2 }]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findAll();
    expect(result).toHaveLength(2);
  });

  it('harus filter by status jika diberikan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[{ id: 1, status: 'AKTIF' }]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findAll({ status: 'AKTIF' });
    expect(mockPool.query.mock.calls[0][0]).toMatch(/status = :status/);
    expect(result[0].status).toBe('AKTIF');
  });
});

describe('event.repository — update (Unit Test)', () => {
  it('harus UPDATE field yang diberikan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    getPool.mockReturnValue(mockPool);

    await repo.update(1, { judul: 'Ibadah Baru', status: 'PUBLISHED' });

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toMatch(/UPDATE event/);
    expect(sql).toMatch(/judul = :judul/);
    expect(sql).toMatch(/status = :status/);
  });

  it('tidak boleh query jika tidak ada field yang diupdate', async () => {
    const mockPool = { query: jest.fn() };
    getPool.mockReturnValue(mockPool);

    await repo.update(1, {});
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});