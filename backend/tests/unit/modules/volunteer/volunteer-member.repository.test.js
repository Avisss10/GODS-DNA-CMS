jest.mock('../../../../src/config/database');
const { getPool } = require('../../../../src/config/database');
const repo = require('../../../../src/modules/volunteer/volunteer-member.repository');

describe('volunteer-member.repository — register (Unit Test)', () => {
  it('harus INSERT dan mengembalikan insertId', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 5 }]) };
    getPool.mockReturnValue(mockPool);

    const id = await repo.register(10, 1);

    expect(id).toBe(5);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/INSERT INTO volunteer_members/);
    expect(mockPool.query.mock.calls[0][1]).toEqual({ jemaatId: 10, volunteerTypeId: 1 });
  });
});

describe('volunteer-member.repository — findByJemaatAndType (Unit Test)', () => {
  it('harus mengembalikan data jika sudah pernah terdaftar', async () => {
    const mockRow = { id: 1, jemaat_id: 10, volunteer_type_id: 1, is_active: 1 };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockRow]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findByJemaatAndType(10, 1)).toEqual(mockRow);
  });

  it('harus mengembalikan null jika belum pernah terdaftar', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findByJemaatAndType(10, 1)).toBeNull();
  });
});

describe('volunteer-member.repository — deactivate (Unit Test)', () => {
  it('harus UPDATE is_active=FALSE, bukan DELETE', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.deactivate(10, 1);

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toMatch(/UPDATE volunteer_members SET is_active = FALSE/);
    expect(sql).not.toMatch(/DELETE/i);
  });
});

describe('volunteer-member.repository — findActiveByJemaat (Unit Test)', () => {
  it('harus mengembalikan daftar jenis volunteer aktif milik jemaat', async () => {
    const mockData = [{ volunteer_type_id: 1, nama: 'Multimedia' }, { volunteer_type_id: 2, nama: 'Usher' }];
    const mockPool = { query: jest.fn().mockResolvedValue([mockData]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findActiveByJemaat(10);

    expect(result).toHaveLength(2);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/is_active = TRUE/);
  });
});

describe('volunteer-member.repository — findActiveByType (Unit Test)', () => {
  it('harus mengembalikan daftar jemaat aktif untuk jenis volunteer tertentu', async () => {
    const mockData = [{ jemaat_id: 10, nama: 'Budi', is_new_member: 0 }];
    const mockPool = { query: jest.fn().mockResolvedValue([mockData]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findActiveByType(1);

    expect(result).toEqual(mockData);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/deleted_at IS NULL/);
  });
});