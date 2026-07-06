jest.mock('../../../../src/modules/jemaat/jemaat.repository');
jest.mock('../../../../src/modules/auditlog/auditlog.repository');

const jemaatRepository = require('../../../../src/modules/jemaat/jemaat.repository');
const { recordAuditLog } = require('../../../../src/modules/auditlog/auditlog.repository');
const {
  JemaatError,
  createJemaat,
  updateJemaat,
  deleteJemaat,
  viewSensitiveField,
  viewFullJemaat,
  stripSensitiveFields,
  buildSensitiveChangeFlags,
} = require('../../../../src/modules/jemaat/jemaat.service');

beforeEach(() => {
  jest.clearAllMocks();
  recordAuditLog.mockResolvedValue(1);
});

describe('jemaat.service — stripSensitiveFields & buildSensitiveChangeFlags (Unit Test)', () => {
  it('harus menghapus no_hp, alamat, media_sosial dan IV-nya', () => {
    const result = stripSensitiveFields({
      id: 1, nama: 'Budi',
      no_hp: 'x', no_hp_iv: 'y', alamat: 'x', alamat_iv: 'y',
      media_sosial: 'x', media_sosial_iv: 'y',
    });

    expect(result).toEqual({ id: 1, nama: 'Budi' });
  });

  it('buildSensitiveChangeFlags harus hanya menandai field yang ada di updates', () => {
    const result = buildSensitiveChangeFlags({ no_hp: '0812', nama: 'Baru' });
    expect(result).toEqual({ no_hp: 'diubah' });
  });
});

describe('jemaat.service — createJemaat (Unit Test)', () => {
  it('harus melempar JemaatError 400 jika field wajib kosong', async () => {
    await expect(createJemaat({ nama: 'Budi' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus mengembalikan requiresConfirmation jika ada duplikat nama+tgl_lahir, TIDAK memanggil create', async () => {
    jemaatRepository.findDuplicateCandidatesByNameAndBirthdate.mockResolvedValue([{ id: 5, nama: 'Budi Mirip' }]);
    jemaatRepository.findDuplicateCandidatesByPhone.mockResolvedValue([]);

    const result = await createJemaat({ nama: 'Budi', tgl_lahir: '1990-01-01', jenis_kelamin: 'L' });

    expect(result.requiresConfirmation).toBe(true);
    expect(result.duplicates.byNameAndBirthdate).toHaveLength(1);
    expect(jemaatRepository.create).not.toHaveBeenCalled();
  });

  it('harus mengembalikan requiresConfirmation jika ada duplikat no_hp', async () => {
    jemaatRepository.findDuplicateCandidatesByNameAndBirthdate.mockResolvedValue([]);
    jemaatRepository.findDuplicateCandidatesByPhone.mockResolvedValue([{ id: 6, nama: 'Pemilik HP Sama' }]);

    const result = await createJemaat({
      nama: 'Budi', tgl_lahir: '1990-01-01', jenis_kelamin: 'L', no_hp: '081234567890',
    });

    expect(result.requiresConfirmation).toBe(true);
    expect(result.duplicates.byPhone).toHaveLength(1);
  });

  it('harus langsung create jika tidak ada duplikat', async () => {
    jemaatRepository.findDuplicateCandidatesByNameAndBirthdate.mockResolvedValue([]);
    jemaatRepository.findDuplicateCandidatesByPhone.mockResolvedValue([]);
    jemaatRepository.create.mockResolvedValue(10);

    const result = await createJemaat({ nama: 'Budi', tgl_lahir: '1990-01-01', jenis_kelamin: 'L' });

    expect(result).toEqual({ id: 10 });
    expect(jemaatRepository.create).toHaveBeenCalled();
  });

  it('harus langsung create TANPA cek duplikat jika confirmed=true', async () => {
    jemaatRepository.create.mockResolvedValue(11);

    await createJemaat(
      { nama: 'Budi', tgl_lahir: '1990-01-01', jenis_kelamin: 'L' },
      { confirmed: true }
    );

    expect(jemaatRepository.findDuplicateCandidatesByNameAndBirthdate).not.toHaveBeenCalled();
    expect(jemaatRepository.create).toHaveBeenCalled();
  });

  it('audit log CREATE tidak boleh mengandung field sensitif', async () => {
    jemaatRepository.findDuplicateCandidatesByNameAndBirthdate.mockResolvedValue([]);
    jemaatRepository.findDuplicateCandidatesByPhone.mockResolvedValue([]);
    jemaatRepository.create.mockResolvedValue(20);

    await createJemaat({
      nama: 'Budi', tgl_lahir: '1990-01-01', jenis_kelamin: 'L', no_hp: '081234567890',
    }, { actorUserId: 1 });

    const auditCall = recordAuditLog.mock.calls[0][0];
    expect(auditCall.dataSesudah.no_hp).toBeUndefined();
    expect(auditCall.aksi).toBe('CREATE');
  });
});

describe('jemaat.service — updateJemaat (Unit Test)', () => {
  it('harus melempar JemaatError 404 jika jemaat tidak ditemukan', async () => {
    jemaatRepository.findById.mockResolvedValue(null);

    await expect(updateJemaat(999, { nama: 'Baru' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('audit log UPDATE harus berisi flag "diubah" untuk field sensitif, bukan plaintext', async () => {
    jemaatRepository.findById
      .mockResolvedValueOnce({ id: 1, nama: 'Lama', no_hp: 'ciphertext-lama' })
      .mockResolvedValueOnce({ id: 1, nama: 'Lama', no_hp: 'ciphertext-baru' });

    await updateJemaat(1, { no_hp: '089999999999' }, { actorUserId: 1 });

    const auditCall = recordAuditLog.mock.calls[0][0];
    expect(auditCall.dataSesudah.no_hp).toBe('diubah');
    expect(auditCall.dataSebelum.no_hp).toBe('diubah');
  });

  it('harus memanggil repository.update dengan data yang benar', async () => {
    jemaatRepository.findById.mockResolvedValue({ id: 1, nama: 'Lama' });

    await updateJemaat(1, { nama: 'Baru' });

    expect(jemaatRepository.update).toHaveBeenCalledWith(1, { nama: 'Baru' });
  });
});

describe('jemaat.service — deleteJemaat (Unit Test)', () => {
  it('harus melempar JemaatError 404 jika jemaat tidak ditemukan', async () => {
    jemaatRepository.findById.mockResolvedValue(null);

    await expect(deleteJemaat(999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus melempar JemaatError 409 jika ada dependensi (leader CG aktif)', async () => {
    jemaatRepository.findById.mockResolvedValue({ id: 1, nama: 'Budi' });
    jemaatRepository.checkDependencies.mockResolvedValue({
      isLeaderOfActiveCg: [{ id: 1, nama: 'CG A' }],
      scheduledAsVolunteer: [],
      activeMemberOfCg: [],
    });

    await expect(deleteJemaat(1)).rejects.toMatchObject({ statusCode: 409 });
    expect(jemaatRepository.softDelete).not.toHaveBeenCalled();
  });

  it('harus berhasil soft delete jika tidak ada dependensi', async () => {
    jemaatRepository.findById.mockResolvedValue({ id: 1, nama: 'Budi' });
    jemaatRepository.checkDependencies.mockResolvedValue({
      isLeaderOfActiveCg: [], scheduledAsVolunteer: [], activeMemberOfCg: [],
    });

    await deleteJemaat(1, { actorUserId: 1 });

    expect(jemaatRepository.softDelete).toHaveBeenCalledWith(1);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'DELETE', modul: 'JEMAAT' })
    );
  });
});

describe('jemaat.service — viewSensitiveField (Unit Test)', () => {
  it('harus melempar JemaatError 400 untuk field yang tidak valid', async () => {
    await expect(viewSensitiveField(1, 'nama')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus melempar JemaatError 404 jika jemaat tidak ditemukan', async () => {
    jemaatRepository.findByIdDecrypted.mockResolvedValue(null);

    await expect(viewSensitiveField(999, 'no_hp')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus mengembalikan plaintext dan mencatat audit log VIEW_SENSITIVE', async () => {
    jemaatRepository.findByIdDecrypted.mockResolvedValue({ id: 1, no_hp: '081234567890' });

    const result = await viewSensitiveField(1, 'no_hp', { actorUserId: 7 });

    expect(result).toBe('081234567890');
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'VIEW_SENSITIVE', modul: 'JEMAAT', userId: 7 })
    );
  });
});

describe('jemaat.service — viewFullJemaat (Unit Test)', () => {
  const decryptedRow = {
    id: 1,
    nama: 'Budi',
    nama_iv: 'iv-nama',
    tgl_lahir: '1990-01-01',
    tgl_lahir_iv: 'iv-tgl',
    jenis_kelamin: 'L',
    jenis_kelamin_iv: 'iv-jk',
    no_hp: '081234567890',
    no_hp_iv: 'iv-hp',
    no_hp_hash: 'hash-hp',
    alamat: 'Jl. Mawar No. 1',
    alamat_iv: 'iv-alamat',
    media_sosial: { instagram: '@budi' },
    media_sosial_iv: 'iv-medsos',
    skor_keaktifan: 75,
    status_keaktifan: 'AKTIF',
  };

  it('harus melempar JemaatError 404 jika jemaat tidak ditemukan', async () => {
    jemaatRepository.findByIdDecrypted.mockResolvedValue(null);

    await expect(viewFullJemaat(999)).rejects.toMatchObject({ statusCode: 404 });
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it('harus mengembalikan semua field sensitif dalam bentuk plaintext', async () => {
    jemaatRepository.findByIdDecrypted.mockResolvedValue({ ...decryptedRow });

    const result = await viewFullJemaat(1, { actorUserId: 7 });

    expect(result.no_hp).toBe('081234567890');
    expect(result.alamat).toBe('Jl. Mawar No. 1');
    expect(result.media_sosial).toEqual({ instagram: '@budi' });
    expect(result.nama).toBe('Budi');
    expect(result.skor_keaktifan).toBe(75);
  });

  it('tidak boleh menyertakan kolom internal ciphertext/IV di hasil', async () => {
    jemaatRepository.findByIdDecrypted.mockResolvedValue({ ...decryptedRow });

    const result = await viewFullJemaat(1, { actorUserId: 7 });

    expect(result).not.toHaveProperty('no_hp_iv');
    expect(result).not.toHaveProperty('alamat_iv');
    expect(result).not.toHaveProperty('media_sosial_iv');
    expect(result).not.toHaveProperty('nama_iv');
    expect(result).not.toHaveProperty('tgl_lahir_iv');
    expect(result).not.toHaveProperty('jenis_kelamin_iv');
    expect(result).not.toHaveProperty('no_hp_hash');
  });

  it('harus mencatat TEPAT SATU audit log VIEW_SENSITIVE dengan field ALL', async () => {
    jemaatRepository.findByIdDecrypted.mockResolvedValue({ ...decryptedRow });

    await viewFullJemaat(1, { actorUserId: 7 });

    expect(recordAuditLog).toHaveBeenCalledTimes(1);
    expect(recordAuditLog).toHaveBeenCalledWith({
      userId: 7,
      aksi: 'VIEW_SENSITIVE',
      modul: 'JEMAAT',
      objectId: 1,
      dataSebelum: null,
      dataSesudah: { field: 'ALL' },
    });
  });
});