jest.mock('../../../../src/config/database');
const { getPool } = require('../../../../src/config/database');
const repo = require('../../../../src/modules/cellgroup/cellgroup.repository');

describe('cellgroup.repository — create (Unit Test)', () => {
  it('harus INSERT cell_group lalu INSERT cell_group_members untuk leader', async () => {
    const mockPool = {
      query: jest.fn()
        .mockResolvedValueOnce([{ insertId: 5 }])
        .mockResolvedValueOnce([{ insertId: 1 }]),
    };
    getPool.mockReturnValue(mockPool);

    const cgId = await repo.create({ nama: 'CG Alpha', leaderId: 10 });

    expect(cgId).toBe(5);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/INSERT INTO cell_group/);
    expect(mockPool.query.mock.calls[1][0]).toMatch(/INSERT INTO cell_group_members/);
    expect(mockPool.query.mock.calls[1][1]).toEqual({ cgId: 5, jemaatId: 10 });
  });

  it('deskripsi harus default null jika tidak diberikan', async () => {
    const mockPool = {
      query: jest.fn()
        .mockResolvedValueOnce([{ insertId: 5 }])
        .mockResolvedValueOnce([{ insertId: 1 }]),
    };
    getPool.mockReturnValue(mockPool);

    await repo.create({ nama: 'CG Alpha', leaderId: 10 });

    const params = mockPool.query.mock.calls[0][1];
    expect(params.deskripsi).toBeNull();
  });
});

describe('cellgroup.repository — findById (Unit Test)', () => {
  it('harus mengembalikan CG jika ditemukan', async () => {
    const mockCg = { id: 1, nama: 'CG Alpha' };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockCg]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findById(1)).toEqual(mockCg);
  });

  it('harus mengembalikan null jika tidak ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findById(999)).toBeNull();
  });
});

describe('cellgroup.repository — findActiveLeader (Unit Test)', () => {
  it('harus mengembalikan data leader jika aktif', async () => {
    const mockLeader = { id: 10, nama: 'Budi', is_active: 1 };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockLeader]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findActiveLeader(1)).toEqual(mockLeader);
  });

  it('harus mengembalikan null jika leader tidak aktif/tidak ada', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findActiveLeader(1)).toBeNull();
  });
});

describe('cellgroup.repository — isJemaatActiveMember (Unit Test)', () => {
  it('harus true jika ada baris dengan left_at NULL', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[{ id: 1 }]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.isJemaatActiveMember(1, 10)).toBe(true);
  });

  it('harus false jika tidak ada baris', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.isJemaatActiveMember(1, 10)).toBe(false);
  });
});

describe('cellgroup.repository — addMember (Unit Test)', () => {
  it('harus INSERT dan mengembalikan insertId', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 7 }]) };
    getPool.mockReturnValue(mockPool);

    const id = await repo.addMember(1, 10);

    expect(id).toBe(7);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/INSERT INTO cell_group_members/);
  });
});

describe('cellgroup.repository — removeMember (Unit Test)', () => {
  it('harus UPDATE left_at, bukan DELETE', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.removeMember(1, 10);

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toMatch(/UPDATE cell_group_members SET left_at = NOW\(\)/);
    expect(sql).not.toMatch(/DELETE/i);
  });

  it('hanya boleh mengupdate baris dengan left_at IS NULL', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.removeMember(1, 10);

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toMatch(/left_at IS NULL/);
  });
});

describe('cellgroup.repository — findActiveMembers (Unit Test)', () => {
  it('harus mengembalikan daftar anggota aktif', async () => {
    const mockMembers = [{ id: 1, nama: 'Budi' }, { id: 2, nama: 'Sari' }];
    const mockPool = { query: jest.fn().mockResolvedValue([mockMembers]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findActiveMembers(1);

    expect(result).toEqual(mockMembers);
    expect(mockPool.query.mock.calls[0][0]).toMatch(/left_at IS NULL/);
  });
});