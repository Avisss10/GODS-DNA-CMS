jest.mock('../../../../src/config/database');
const { getPool } = require('../../../../src/config/database');
const repo = require('../../../../src/modules/volunteer/volunteer-jenis.repository');

describe('volunteer-jenis.repository — create (Unit Test)', () => {
  it('harus INSERT dan mengembalikan insertId', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 1 }]) };
    getPool.mockReturnValue(mockPool);

    const id = await repo.create({ nama: 'Multimedia' });

    expect(id).toBe(1);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/INSERT INTO volunteer_jenis/);
  });

  it('deskripsi harus default null jika tidak diberikan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 1 }]) };
    getPool.mockReturnValue(mockPool);

    await repo.create({ nama: 'Usher' });

    expect(mockPool.query.mock.calls[0][1].deskripsi).toBeNull();
  });
});

describe('volunteer-jenis.repository — findById & findByNama (Unit Test)', () => {
  it('findById harus mengembalikan data jika ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[{ id: 1, nama: 'Multimedia' }]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findById(1)).toEqual({ id: 1, nama: 'Multimedia' });
  });

  it('findById harus mengembalikan null jika tidak ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findById(999)).toBeNull();
  });

  it('findByNama harus mengembalikan data jika ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[{ id: 1, nama: 'Usher' }]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findByNama('Usher')).toEqual({ id: 1, nama: 'Usher' });
  });
});

describe('volunteer-jenis.repository — update (Unit Test)', () => {
  it('harus update field yang diberikan saja', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.update(1, { nama: 'Multimedia Baru' });

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toMatch(/nama = :nama/);
    expect(sql).not.toMatch(/deskripsi/);
  });

  it('tidak boleh query jika tidak ada field yang diupdate', async () => {
    const mockPool = { query: jest.fn() };
    getPool.mockReturnValue(mockPool);

    await repo.update(1, {});

    expect(mockPool.query).not.toHaveBeenCalled();
  });
});

describe('volunteer-jenis.repository — setActive (Unit Test)', () => {
  it('harus UPDATE is_active', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.setActive(1, false);

    expect(mockPool.query.mock.calls[0][0]).toMatch(/UPDATE volunteer_jenis SET is_active/);
    expect(mockPool.query.mock.calls[0][1]).toEqual({ id: 1, isActive: false });
  });
});

describe('volunteer-jenis.repository — findAllActive (Unit Test)', () => {
  it('harus mengembalikan daftar jenis volunteer aktif', async () => {
    const mockData = [{ id: 1, nama: 'Multimedia' }, { id: 2, nama: 'Usher' }];
    const mockPool = { query: jest.fn().mockResolvedValue([mockData]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findAllActive();

    expect(result).toEqual(mockData);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/is_active = TRUE/);
  });
});
describe('volunteer-jenis.repository — findAll (Unit Test)', () => {
  it('harus mengembalikan SEMUA jenis (tanpa filter is_active) beserta jumlah_anggota', async () => {
    const mockData = [
      { id: 1, nama: 'Multimedia', is_active: 1, jumlah_anggota: 3 },
      { id: 2, nama: 'Usher', is_active: 0, jumlah_anggota: 0 },
    ];
    const mockPool = { query: jest.fn().mockResolvedValue([mockData]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findAll();

    expect(result).toEqual(mockData);
    const sql = mockPool.query.mock.calls[0][0];
    // Jenis nonaktif juga harus ikut — tidak boleh ada filter WHERE is_active
    expect(sql).not.toMatch(/WHERE\s+vj\.is_active/i);
    // Join anggota tetap hanya menghitung member aktif
    expect(sql).toMatch(/vm\.is_active = TRUE/);
  });
});
