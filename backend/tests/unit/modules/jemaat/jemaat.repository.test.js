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
  it('harus mengenkripsi nama, tgl_lahir, jenis_kelamin sebelum INSERT, masing-masing dengan IV sendiri', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{ insertId: 1 }]) };
    getPool.mockReturnValue(mockPool);

    await repo.create({
      nama: 'Budi Santoso',
      tgl_lahir: '1990-01-01',
      jenis_kelamin: 'L',
      tgl_bergabung: '2026-06-01',
    });

    const sql = mockPool.query.mock.calls[0][0];
    const params = mockPool.query.mock.calls[0][1];

    expect(sql).toMatch(/nama_iv/);
    expect(sql).toMatch(/tgl_lahir_iv/);
    expect(sql).toMatch(/jenis_kelamin_iv/);

    // Nilai tersimpan harus ciphertext, bukan plaintext
    expect(params.nama).not.toBe('Budi Santoso');
    expect(params.tglLahir).not.toBe('1990-01-01');
    expect(params.jenisKelamin).not.toBe('L');

    // Masing-masing field punya IV sendiri (16 byte = 32 hex char)
    expect(params.namaIv).toHaveLength(32);
    expect(params.tglLahirIv).toHaveLength(32);
    expect(params.jenisKelaminIv).toHaveLength(32);
    expect(params.namaIv).not.toBe(params.tglLahirIv);
    expect(params.namaIv).not.toBe(params.jenisKelaminIv);
    expect(params.tglLahirIv).not.toBe(params.jenisKelaminIv);

    // Ciphertext harus bisa didekripsi balik ke nilai asli
    const { decrypt } = require('../../../../src/utils/encryption.util');
    expect(decrypt(params.nama, params.namaIv)).toBe('Budi Santoso');
    expect(decrypt(params.tglLahir, params.tglLahirIv)).toBe('1990-01-01');
    expect(decrypt(params.jenisKelamin, params.jenisKelaminIv)).toBe('L');
  });

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
  it('harus mengembalikan no_hp mentah TANPA dekripsi (ciphertext-by-default)', async () => {
    const mockRow = { id: 1, nama: 'Budi', no_hp: 'ciphertext-abc', no_hp_iv: 'iv-abc' };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockRow]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findById(1);

    expect(result.no_hp).toBe('ciphertext-abc'); // TIDAK didekripsi
  });

  it('harus mendekripsi nama, tgl_lahir, jenis_kelamin secara otomatis, TAPI no_hp/alamat/media_sosial tetap ciphertext', async () => {
    const { encrypt } = require('../../../../src/utils/encryption.util');
    const namaEnc = encrypt('Budi Asli');
    const tglLahirEnc = encrypt('1990-01-01');
    const jenisKelaminEnc = encrypt('L');

    const mockRow = {
      id: 1,
      nama: namaEnc.ciphertext, nama_iv: namaEnc.iv,
      tgl_lahir: tglLahirEnc.ciphertext, tgl_lahir_iv: tglLahirEnc.iv,
      jenis_kelamin: jenisKelaminEnc.ciphertext, jenis_kelamin_iv: jenisKelaminEnc.iv,
      no_hp: 'ciphertext-nohp', no_hp_iv: 'iv-nohp',
      alamat: 'ciphertext-alamat', alamat_iv: 'iv-alamat',
      media_sosial: 'ciphertext-medsos', media_sosial_iv: 'iv-medsos',
    };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockRow]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findById(1);

    // Field identitas otomatis plaintext (dibutuhkan tampilan dasar)
    expect(result.nama).toBe('Budi Asli');
    expect(result.tgl_lahir).toBe('1990-01-01');
    expect(result.jenis_kelamin).toBe('L');

    // Field on-demand TETAP ciphertext di response biasa
    expect(result.no_hp).toBe('ciphertext-nohp');
    expect(result.alamat).toBe('ciphertext-alamat');
    expect(result.media_sosial).toBe('ciphertext-medsos');
  });

  it('harus meneruskan nilai apa adanya untuk baris lama yang belum di-backfill (nama_iv NULL)', async () => {
    const mockRow = {
      id: 1, nama: 'Budi Legacy', nama_iv: null,
      tgl_lahir: '1990-01-01', tgl_lahir_iv: null,
      jenis_kelamin: 'L', jenis_kelamin_iv: null,
    };
    const mockPool = { query: jest.fn().mockResolvedValue([[mockRow]]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findById(1);

    expect(result.nama).toBe('Budi Legacy');
    expect(result.tgl_lahir).toBe('1990-01-01');
    expect(result.jenis_kelamin).toBe('L');
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

describe('jemaat.repository — findAll (Unit Test)', () => {
  const { encrypt } = require('../../../../src/utils/encryption.util');

  function buildEncryptedRow(id, nama, tglLahir, jenisKelamin) {
    const namaEnc = encrypt(nama);
    const tglEnc = encrypt(tglLahir);
    const jkEnc = encrypt(jenisKelamin);
    return {
      id,
      nama: namaEnc.ciphertext, nama_iv: namaEnc.iv,
      tgl_lahir: tglEnc.ciphertext, tgl_lahir_iv: tglEnc.iv,
      jenis_kelamin: jkEnc.ciphertext, jenis_kelamin_iv: jkEnc.iv,
      tgl_bergabung: '2026-01-01', is_active: 1, is_new_member: 0,
      skor_keaktifan: 50, status_keaktifan: 'AKTIF', created_at: '2026-01-01',
    };
  }

  it('harus mendekripsi nama, tgl_lahir, jenis_kelamin di setiap baris list', async () => {
    const rows = [
      buildEncryptedRow(1, 'Budi Santoso', '1990-01-01', 'L'),
      buildEncryptedRow(2, 'Sari Dewi', '1992-05-20', 'P'),
    ];
    const mockPool = { query: jest.fn().mockResolvedValue([rows]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findAll();

    expect(result).toHaveLength(2);
    const budi = result.find((r) => r.id === 1);
    const sari = result.find((r) => r.id === 2);
    expect(budi.nama).toBe('Budi Santoso');
    expect(budi.tgl_lahir).toBe('1990-01-01');
    expect(budi.jenis_kelamin).toBe('L');
    expect(sari.nama).toBe('Sari Dewi');
    expect(sari.jenis_kelamin).toBe('P');
  });

  it('search harus menemukan substring case-insensitive meski ciphertext tiap baris berbeda (IV acak)', async () => {
    // Dua baris dengan nama mengandung "budi" — karena IV acak per baris,
    // ciphertext-nya pasti berbeda; pencocokan harus terjadi SETELAH dekripsi.
    const rows = [
      buildEncryptedRow(1, 'Budi Santoso', '1990-01-01', 'L'),
      buildEncryptedRow(2, 'BUDIMAN Perkasa', '1985-03-03', 'L'),
      buildEncryptedRow(3, 'Sari Dewi', '1992-05-20', 'P'),
    ];
    expect(rows[0].nama).not.toBe(rows[1].nama); // ciphertext berbeda antar baris
    const mockPool = { query: jest.fn().mockResolvedValue([rows]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findAll({ search: 'budi' });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it('query SQL tidak boleh lagi memakai LIKE pada kolom nama (nama = ciphertext)', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    await repo.findAll({ search: 'budi' });

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).not.toMatch(/nama LIKE/i);
  });

  it('pagination harus diterapkan SETELAH filtering di level aplikasi', async () => {
    const rows = [
      buildEncryptedRow(1, 'Andi Cocok', '1990-01-01', 'L'),
      buildEncryptedRow(2, 'Beni Tidak', '1990-01-01', 'L'),
      buildEncryptedRow(3, 'Citra Cocok', '1990-01-01', 'P'),
      buildEncryptedRow(4, 'Dodi Cocok', '1990-01-01', 'L'),
    ];
    const mockPool = { query: jest.fn().mockResolvedValue([rows]) };
    getPool.mockReturnValue(mockPool);

    // 3 baris cocok "cocok"; limit 2 offset 1 → 2 hasil (bukan potongan SQL mentah)
    const result = await repo.findAll({ search: 'cocok', limit: 2, offset: 1 });

    expect(result).toHaveLength(2);
    result.forEach((r) => expect(r.nama.toLowerCase()).toContain('cocok'));
  });

  it('tidak boleh membocorkan kolom _iv identitas di hasil list', async () => {
    const rows = [buildEncryptedRow(1, 'Budi', '1990-01-01', 'L')];
    const mockPool = { query: jest.fn().mockResolvedValue([rows]) };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findAll();

    expect(result[0].nama_iv).toBeUndefined();
    expect(result[0].tgl_lahir_iv).toBeUndefined();
    expect(result[0].jenis_kelamin_iv).toBeUndefined();
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

  it('harus mengenkripsi nama dengan IV baru saat diupdate (pola sama seperti no_hp)', async () => {
    const { decrypt } = require('../../../../src/utils/encryption.util');
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.update(1, { nama: 'Nama Baru' });

    const sql = mockPool.query.mock.calls[0][0];
    const params = mockPool.query.mock.calls[0][1];
    expect(sql).toMatch(/nama = :nama/);
    expect(sql).toMatch(/nama_iv = :namaIv/);
    expect(params.nama).not.toBe('Nama Baru'); // ciphertext
    expect(params.namaIv).toHaveLength(32);
    expect(decrypt(params.nama, params.namaIv)).toBe('Nama Baru');
  });

  it('harus mengenkripsi tgl_lahir dan jenis_kelamin dengan IV masing-masing saat diupdate', async () => {
    const { decrypt } = require('../../../../src/utils/encryption.util');
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.update(1, { tgl_lahir: '1991-02-02', jenis_kelamin: 'P' });

    const params = mockPool.query.mock.calls[0][1];
    expect(params.tglLahirIv).toHaveLength(32);
    expect(params.jenisKelaminIv).toHaveLength(32);
    expect(params.tglLahirIv).not.toBe(params.jenisKelaminIv);
    expect(decrypt(params.tglLahir, params.tglLahirIv)).toBe('1991-02-02');
    expect(decrypt(params.jenisKelamin, params.jenisKelaminIv)).toBe('P');
  });

  it('dua kali update nama yang sama harus menghasilkan IV berbeda (IV acak per operasi write)', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.update(1, { nama: 'Nama Sama' });
    await repo.update(1, { nama: 'Nama Sama' });

    const iv1 = mockPool.query.mock.calls[0][1].namaIv;
    const iv2 = mockPool.query.mock.calls[1][1].namaIv;
    expect(iv1).not.toBe(iv2);
  });

  it('harus update field non-sensitif tanpa enkripsi', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([{}]) };
    getPool.mockReturnValue(mockPool);

    await repo.update(1, { tgl_bergabung: '2026-02-02' });

    const sql = mockPool.query.mock.calls[0][0];
    const params = mockPool.query.mock.calls[0][1];
    expect(sql).toMatch(/tgl_bergabung = :tgl_bergabung/);
    expect(params.tgl_bergabung).toBe('2026-02-02');
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
  const { encrypt } = require('../../../../src/utils/encryption.util');

  function buildIdentityRow(id, nama, tglLahir) {
    const namaEnc = encrypt(nama);
    const tglEnc = encrypt(tglLahir);
    return {
      id,
      nama: namaEnc.ciphertext, nama_iv: namaEnc.iv,
      tgl_lahir: tglEnc.ciphertext, tgl_lahir_iv: tglEnc.iv,
    };
  }

  it('harus mendeteksi nama mirip (typo kecil) + tgl_lahir sama SETELAH dekripsi', async () => {
    // Data tersimpan sebagai ciphertext — perbandingan Levenshtein hanya
    // valid setelah dekripsi di memori (bukan query SQL langsung).
    const mockPool = {
      query: jest.fn().mockResolvedValue([[
        buildIdentityRow(1, 'Ayatulloh', '1990-01-01'),   // mirip + tgl sama → match
        buildIdentityRow(2, 'Joko Widodo', '1990-01-01'), // tgl sama tapi nama jauh
        buildIdentityRow(3, 'Ayatullah', '1991-12-31'),   // nama sama tapi tgl beda
      ]]),
    };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findDuplicateCandidatesByNameAndBirthdate('Ayatullah', '1990-01-01');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].nama).toBe('Ayatulloh'); // plaintext hasil dekripsi
  });

  it('query SQL tidak boleh lagi memfilter tgl_lahir di WHERE (kolom sudah ciphertext)', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    await repo.findDuplicateCandidatesByNameAndBirthdate('Budi', '1990-01-01');

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).not.toMatch(/tgl_lahir\s*=\s*:/);
    expect(sql).toMatch(/deleted_at IS NULL/);
  });

  it('harus tetap cocok untuk baris lama yang belum di-backfill (plaintext, _iv NULL)', async () => {
    const mockPool = {
      query: jest.fn().mockResolvedValue([[
        { id: 7, nama: 'Ayatulloh', nama_iv: null, tgl_lahir: '1990-01-01', tgl_lahir_iv: null },
      ]]),
    };
    getPool.mockReturnValue(mockPool);

    const result = await repo.findDuplicateCandidatesByNameAndBirthdate('Ayatullah', '1990-01-01');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(7);
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