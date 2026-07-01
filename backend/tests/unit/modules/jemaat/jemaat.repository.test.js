const crypto = require('crypto');

beforeAll(() => {
  process.env.AES_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
});

jest.mock('../../../../src/config/database');
const { getPool } = require('../../../../src/config/database');
const repo = require('../../../../src/modules/jemaat/jemaat.repository');

describe('jemaat.repository — levenshteinDistance & isSimilarName (Unit Test)', () => {
  it('jarak antara dua string identik harus 0', () => {
    expect(repo.levenshteinDistance('budi', 'budi')).toBe(0);
  });

  it('jarak harus menghitung jumlah edit minimal', () => {
    expect(repo.levenshteinDistance('budi', 'budy')).toBe(1);
    expect(repo.levenshteinDistance('budi', 'budiman')).toBe(3);
  });

  it('isSimilarName harus true untuk typo kecil (jarak <= 2)', () => {
    expect(repo.isSimilarName('Ayatulloh', 'Ayatullah')).toBe(true);
  });

  it('isSimilarName harus false untuk nama yang jauh berbeda', () => {
    expect(repo.isSimilarName('Budi Santoso', 'Joko Widodo')).toBe(false);
  });

  it('isSimilarName harus case-insensitive', () => {
    expect(repo.isSimilarName('BUDI', 'budi')).toBe(true);
  });
});

describe('jemaat.repository — create (Unit Test)', () => {
  it('harus mengenkripsi no_hp, alamat, media_sosial sebelum INSERT', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 1 }]) };
    getPool.mockReturnValue(mockPool);

    await repo.create({
      nama: 'Budi',
      tgl_lahir: '1990-01-01',
      jenis_kelamin: 'L',
      no_hp: '081234567890',
      alamat: 'Jl. Test No. 1',
      media_sosial: { instagram: '@budi' },
      tgl_bergabung: '2026-06-01',
    });

    const params = mockPool.query.mock.calls[0][1];
    expect(params.noHp).not.toBe('081234567890'); // sudah ciphertext
    expect(params.noHpIv).toHaveLength(32);
    expect(params.alamat).not.toBe('Jl. Test No. 1');
    expect(params.mediaSosial).toBeDefined();
  });

  it('harus menyimpan no_hp_hash (SHA-256 hex) saat no_hp diberikan', async () => {
    const { hashPhone } = require('../../../../src/utils/hash.util');
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 1 }]) };
    getPool.mockReturnValue(mockPool);

    await repo.create({
      nama: 'Budi', tgl_lahir: '1990-01-01', jenis_kelamin: 'L',
      no_hp: '081234567890', tgl_bergabung: '2026-06-01',
    });

    const params = mockPool.query.mock.calls[0][1];
    expect(params.noHpHash).toBe(hashPhone('081234567890'));
  });

  it('harus menghitung new_member_until = tgl_bergabung + 30 hari', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 1 }]) };
    getPool.mockReturnValue(mockPool);

    await repo.create({
      nama: 'Budi',
      tgl_lahir: '1990-01-01',
      jenis_kelamin: 'L',
      tgl_bergabung: '2026-01-01',
    });

    const params = mockPool.query.mock.calls[0][1];
    expect(params.newMemberUntil).toBe('2026-01-31');
  });

  it('harus mengembalikan insertId', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 42 }]) };
    getPool.mockReturnValue(mockPool);

    const id = await repo.create({
      nama: 'Budi', tgl_lahir: '1990-01-01', jenis_kelamin: 'L', tgl_bergabung: '2026-01-01',
    });

    expect(id).toBe(42);
  });

  it('harus mengisi null untuk field sensitif yang tidak diberikan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 1 }]) };
    getPool.mockReturnValue(mockPool);

    await repo.create({
      nama: 'Budi', tgl_lahir: '1990-01-01', jenis_kelamin: 'L', tgl_bergabung: '2026-01-01',
    });

    const params = mockPool.query.mock.calls[0][1];
    expect(params.noHp).toBeNull();
    expect(params.alamat).toBeNull();
    expect(params.mediaSosial).toBeNull();
  });
});

describe('jemaat.repository — findById (Unit Test)', () => {
  it('harus mengembalikan data mentah TANPA dekripsi', async () => {
    const mockRow = { id: 1, nama: 'Budi', no_hp: 'ciphertext-abc', no_hp_iv: 'iv-abc' };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockRow]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findById(1);

    expect(result.no_hp).toBe('ciphertext-abc'); // TIDAK didekripsi
  });

  it('harus mengembalikan null jika tidak ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findById(999)).toBeNull();
  });

  it('query harus menyertakan filter deleted_at IS NULL', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    await repo.findById(1);

    expect(mockPool.query.mock.calls[0][0]).toMatch(/deleted_at IS NULL/);
  });
});

describe('jemaat.repository — findByIdDecrypted (Unit Test)', () => {
  it('harus mendekripsi no_hp, alamat, media_sosial', async () => {
    const { encrypt, encryptJson } = require('../../../../src/utils/encryption.util');
    const noHpEnc = encrypt('081234567890');
    const alamatEnc = encrypt('Jl. Asli No. 1');
    const mediaEnc = encryptJson({ instagram: '@asli' });

    const mockRow = {
      id: 1, nama: 'Budi',
      no_hp: noHpEnc.ciphertext, no_hp_iv: noHpEnc.iv,
      alamat: alamatEnc.ciphertext, alamat_iv: alamatEnc.iv,
      media_sosial: mediaEnc.ciphertext, media_sosial_iv: mediaEnc.iv,
    };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockRow]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findByIdDecrypted(1);

    expect(result.no_hp).toBe('081234567890');
    expect(result.alamat).toBe('Jl. Asli No. 1');
    expect(result.media_sosial).toEqual({ instagram: '@asli' });
  });

  it('harus mengembalikan null untuk field sensitif yang null di database', async () => {
    const mockRow = { id: 1, nama: 'Budi', no_hp: null, no_hp_iv: null, alamat: null, alamat_iv: null, media_sosial: null, media_sosial_iv: null };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockRow]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findByIdDecrypted(1);

    expect(result.no_hp).toBeNull();
    expect(result.alamat).toBeNull();
    expect(result.media_sosial).toBeNull();
  });

  it('harus mengembalikan null jika jemaat tidak ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    expect(await repo.findByIdDecrypted(999)).toBeNull();
  });
});

describe('jemaat.repository — update (Unit Test)', () => {
  it('harus generate IV baru saat field sensitif diupdate', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.update(1, { no_hp: '089999999999' });

    const params = mockPool.query.mock.calls[0][1];
    expect(params.noHpIv).toBeDefined();
    expect(params.noHp).not.toBe('089999999999');
  });

  it('harus update field non-sensitif tanpa enkripsi', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.update(1, { nama: 'Nama Baru' });

    const sql = mockPool.query.mock.calls[0][0];
    const params = mockPool.query.mock.calls[0][1];
    expect(sql).toMatch(/nama = :nama/);
    expect(params.nama).toBe('Nama Baru');
  });

  it('tidak boleh menjalankan query jika tidak ada field yang diupdate', async () => {
    const mockPool = { query: jest.fn() };
    getPool.mockReturnValue(mockPool);

    await repo.update(1, {});

    expect(mockPool.query).not.toHaveBeenCalled();
  });
});

describe('jemaat.repository — softDelete (Unit Test)', () => {
  it('harus set deleted_at dan is_active=false', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.softDelete(1);

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toMatch(/deleted_at = NOW\(\)/);
    expect(sql).toMatch(/is_active = FALSE/);
  });
});

describe('jemaat.repository — findDuplicateCandidatesByNameAndBirthdate (Unit Test)', () => {
  it('harus filter hasil query berdasarkan kemiripan nama', async () => {
    const mockPool = {
      query: jest.fn().mockResolvedValue([[
        { id: 1, nama: 'Ayatulloh' },
        { id: 2, nama: 'Joko Widodo' },
      ]]),
    };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findDuplicateCandidatesByNameAndBirthdate('Ayatullah', '1990-01-01');

    expect(result).toHaveLength(1);
    expect(result[0].nama).toBe('Ayatulloh');
  });
});

describe('jemaat.repository — findDuplicateCandidatesByPhone (Unit Test, hash-based)', () => {
  it('harus query memakai no_hp_hash (bukan dekripsi massal)', async () => {
    const { hashPhone } = require('../../../../src/utils/hash.util');
    const mockPool = {
      query: jest.fn().mockResolvedValue([[{ id: 1, nama: 'Budi' }]]),
    };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findDuplicateCandidatesByPhone('081234567890');

    const sql = mockPool.query.mock.calls[0][0];
    const params = mockPool.query.mock.calls[0][1];
    expect(sql).toMatch(/no_hp_hash\s*=\s*:hash/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(sql).not.toMatch(/no_hp_iv/); // tidak lagi mengambil/ dekripsi IV
    expect(params.hash).toBe(hashPhone('081234567890'));
    expect(result).toEqual([{ id: 1, nama: 'Budi' }]);
  });

  it('harus mengembalikan array kosong jika tidak ada baris dengan hash sama', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findDuplicateCandidatesByPhone('081234567890');

    expect(result).toEqual([]);
  });
});

describe('jemaat.repository — checkDependencies (Unit Test)', () => {
  it('harus mengembalikan ketiga kategori dependensi', async () => {
    const mockPool = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ id: 1, nama: 'CG A' }]])
        .mockResolvedValueOnce([[{ id: 2, judul: 'Event A', waktu_mulai: '2026-07-01' }]])
        .mockResolvedValueOnce([[{ id: 3, nama: 'CG B' }]]),
    };
    getPool.mockReturnValue(mockPool);

    const result = await repo.checkDependencies(1);

    expect(result.isLeaderOfActiveCg).toHaveLength(1);
    expect(result.scheduledAsVolunteer).toHaveLength(1);
    expect(result.activeMemberOfCg).toHaveLength(1);
  });
});