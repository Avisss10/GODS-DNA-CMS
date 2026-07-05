jest.mock('../../../../src/config/database');
const { getPool } = require('../../../../src/config/database');
const repo = require('../../../../src/modules/auth/auth.repository');

describe('auth.repository — findByUsername (Unit Test)', () => {
  it('harus mengembalikan user jika ditemukan', async () => {
    const mockUser = { id: 1, username: 'admin1', peran: 'ADMIN' };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockUser]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findByUsername('admin1');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE username = :username'),
      { username: 'admin1' }
    );
    expect(result).toEqual(mockUser);
  });

  it('harus mengembalikan null jika tidak ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findByUsername('tidak-ada');

    expect(result).toBeNull();
  });
});

describe('auth.repository — findById (Unit Test)', () => {
  it('harus mengembalikan user jika ditemukan', async () => {
    const mockUser = { id: 5, username: 'leader1', peran: 'LEADER' };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockUser]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findById(5);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = :id'),
      { id: 5 }
    );
    expect(result).toEqual(mockUser);
  });

  it('harus mengembalikan null jika tidak ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findById(999);

    expect(result).toBeNull();
  });
});

describe('auth.repository — createUser (Unit Test)', () => {
  it('harus melakukan INSERT dan mengembalikan insertId', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 10 }]) };
    getPool.mockReturnValue(mockPool);

    const id = await repo.createUser({
      username: 'newadmin',
      passwordHash: 'hashed-value',
      peran: 'ADMIN',
    });

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      { username: 'newadmin', passwordHash: 'hashed-value', peran: 'ADMIN' }
    );
    expect(id).toBe(10);
  });
});

describe('auth.repository — updateLastLogin (Unit Test)', () => {
  it('harus melakukan UPDATE last_login_at', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.updateLastLogin(3);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET last_login_at = NOW()'),
      { id: 3 }
    );
  });
});

describe('auth.repository — updateAktif (Unit Test)', () => {
  it('harus melakukan UPDATE kolom aktif', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.updateAktif(7, false);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET aktif = :aktif'),
      { id: 7, aktif: false }
    );
  });
});

describe('auth.repository — findAllUsers (Unit Test)', () => {
  it('harus mengembalikan semua user (LEADER + ADMIN) tanpa filter peran', async () => {
    const mockRows = [
      { id: 1, username: 'leader1', peran: 'LEADER', aktif: true, last_login_at: null },
      { id: 2, username: 'admin1', peran: 'ADMIN', aktif: true, last_login_at: null },
    ];
    const mockPool = { query: jest.fn().mockResolvedValue([mockRows]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findAllUsers();

    expect(result).toEqual(mockRows);
    expect(mockPool.query.mock.calls[0][0]).not.toMatch(/WHERE peran/);
  });
});

describe('auth.repository — countActiveLeaders (Unit Test)', () => {
  it('harus mengembalikan jumlah leader aktif sebagai number', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[{ total: 2 }]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.countActiveLeaders();

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("peran = 'LEADER' AND aktif = TRUE")
    );
    expect(result).toBe(2);
    expect(typeof result).toBe('number');
  });
});