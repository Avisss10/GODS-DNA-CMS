jest.mock('../../../../src/modules/volunteer/volunteer-jenis.repository');
jest.mock('../../../../src/modules/volunteer/volunteer-member.repository');
jest.mock('../../../../src/modules/jemaat/jemaat.repository');
jest.mock('../../../../src/modules/auditlog/auditlog.repository');

const volunteerJenisRepository = require('../../../../src/modules/volunteer/volunteer-jenis.repository');
const volunteerMemberRepository = require('../../../../src/modules/volunteer/volunteer-member.repository');
const jemaatRepository = require('../../../../src/modules/jemaat/jemaat.repository');
const { recordAuditLog } = require('../../../../src/modules/auditlog/auditlog.repository');
const {
  VolunteerError,
  createVolunteerType,
  updateVolunteerType,
  deactivateVolunteerType,
  activateVolunteerType,
  registerVolunteer,
  unregisterVolunteer,
} = require('../../../../src/modules/volunteer/volunteer.service');

beforeEach(() => {
  jest.clearAllMocks();
  recordAuditLog.mockResolvedValue(1);
});

describe('volunteer.service — createVolunteerType (Unit Test)', () => {
  it('harus 400 jika nama kosong', async () => {
    await expect(createVolunteerType({})).rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 409 jika nama sudah ada', async () => {
    volunteerJenisRepository.findByNama.mockResolvedValue({ id: 1, nama: 'Multimedia' });

    await expect(createVolunteerType({ nama: 'Multimedia' })).rejects.toMatchObject({ statusCode: 409 });
    expect(volunteerJenisRepository.create).not.toHaveBeenCalled();
  });

  it('harus berhasil membuat dan mencatat audit log CREATE/VOLUNTEER', async () => {
    volunteerJenisRepository.findByNama.mockResolvedValue(null);
    volunteerJenisRepository.create.mockResolvedValue(5);

    const result = await createVolunteerType({ nama: 'Usher' }, { actorUserId: 9 });

    expect(result).toEqual({ id: 5 });
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'CREATE', modul: 'VOLUNTEER' })
    );
  });
});

describe('volunteer.service — updateVolunteerType (Unit Test)', () => {
  it('harus 404 jika tidak ditemukan', async () => {
    volunteerJenisRepository.findById.mockResolvedValue(null);

    await expect(updateVolunteerType(1, { nama: 'Baru' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus berhasil update dan mencatat audit log UPDATE/VOLUNTEER', async () => {
    volunteerJenisRepository.findById
      .mockResolvedValueOnce({ id: 1, nama: 'Lama', deskripsi: null })
      .mockResolvedValueOnce({ id: 1, nama: 'Baru', deskripsi: null });

    const result = await updateVolunteerType(1, { nama: 'Baru' }, { actorUserId: 9 });

    expect(result.nama).toBe('Baru');
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'UPDATE', modul: 'VOLUNTEER' })
    );
  });
});

describe('volunteer.service — deactivateVolunteerType (Unit Test)', () => {
  it('harus 404 jika tidak ditemukan', async () => {
    volunteerJenisRepository.findById.mockResolvedValue(null);

    await expect(deactivateVolunteerType(1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus berhasil menonaktifkan dan mencatat audit log DELETE/VOLUNTEER', async () => {
    volunteerJenisRepository.findById.mockResolvedValue({ id: 1, nama: 'Usher', is_active: 1 });

    await deactivateVolunteerType(1, { actorUserId: 9 });

    expect(volunteerJenisRepository.setActive).toHaveBeenCalledWith(1, false);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'DELETE', modul: 'VOLUNTEER' })
    );
  });
});

describe('volunteer.service — registerVolunteer (Unit Test)', () => {
  it('harus 404 jika jemaat tidak ditemukan', async () => {
    jemaatRepository.findById.mockResolvedValue(null);

    await expect(registerVolunteer(1, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 400 jika jemaat tidak aktif', async () => {
    jemaatRepository.findById.mockResolvedValue({ id: 1, is_active: false });

    await expect(registerVolunteer(1, 1)).rejects.toMatchObject({ statusCode: 400 });
    expect(volunteerMemberRepository.register).not.toHaveBeenCalled();
  });

  it('harus 404 jika jenis volunteer tidak ditemukan', async () => {
    jemaatRepository.findById.mockResolvedValue({ id: 1, is_active: true });
    volunteerJenisRepository.findById.mockResolvedValue(null);

    await expect(registerVolunteer(1, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 409 jika sudah pernah terdaftar', async () => {
    jemaatRepository.findById.mockResolvedValue({ id: 1, is_active: true });
    volunteerJenisRepository.findById.mockResolvedValue({ id: 1, nama: 'Usher' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 99 });

    await expect(registerVolunteer(1, 1)).rejects.toMatchObject({ statusCode: 409 });
    expect(volunteerMemberRepository.register).not.toHaveBeenCalled();
  });

  it('jemaat baru (is_new_member=true) tetap boleh didaftarkan', async () => {
    jemaatRepository.findById.mockResolvedValue({ id: 1, is_active: true, is_new_member: true });
    volunteerJenisRepository.findById.mockResolvedValue({ id: 1, nama: 'Usher' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue(null);
    volunteerMemberRepository.register.mockResolvedValue(7);

    const result = await registerVolunteer(1, 1, { actorUserId: 9 });

    expect(result).toEqual({ id: 7 });
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'REGISTER_VOLUNTEER', modul: 'VOLUNTEER' })
    );
  });
});

describe('volunteer.service — unregisterVolunteer (Unit Test)', () => {
  it('harus 404 jika pendaftaran tidak ditemukan', async () => {
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue(null);

    await expect(unregisterVolunteer(1, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus berhasil menonaktifkan dan mencatat audit log UNREGISTER_VOLUNTEER', async () => {
    // Tambah is_active: true agar lolos validasi baru
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });

    await unregisterVolunteer(1, 1, { actorUserId: 9 });

    expect(volunteerMemberRepository.deactivate).toHaveBeenCalledWith(1, 1);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'UNREGISTER_VOLUNTEER', modul: 'VOLUNTEER' })
    );
  });
});

// ── listVolunteerByJemaat ─────────────────────────────────────────
const { listVolunteerByJemaat } = require('../../../../src/modules/volunteer/volunteer.service');

describe('volunteer.service — listVolunteerByJemaat (Unit Test)', () => {
  it('harus 404 jika jemaat tidak ditemukan (atau soft-deleted)', async () => {
    jemaatRepository.findById.mockResolvedValue(null);

    await expect(listVolunteerByJemaat(1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus mengembalikan array jenis volunteer aktif milik jemaat', async () => {
    jemaatRepository.findById.mockResolvedValue({ id: 1, nama: 'Budi', is_active: true });
    volunteerMemberRepository.findActiveByJemaat.mockResolvedValue([
      { id: 10, volunteer_type_id: 3, nama: 'Usher', joined_at: '2024-01-01' },
    ]);

    const result = await listVolunteerByJemaat(1);

    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty('volunteer_type_id', 3);
    expect(volunteerMemberRepository.findActiveByJemaat).toHaveBeenCalledWith(1);
  });
});
describe('volunteer.service — activateVolunteerType (Unit Test)', () => {
  it('harus 404 jika tidak ditemukan', async () => {
    volunteerJenisRepository.findById.mockResolvedValue(null);

    await expect(activateVolunteerType(999)).rejects.toMatchObject({ statusCode: 404 });
    expect(volunteerJenisRepository.setActive).not.toHaveBeenCalled();
  });

  it('harus 409 jika sudah aktif', async () => {
    volunteerJenisRepository.findById.mockResolvedValue({ id: 1, nama: 'Usher', is_active: 1 });

    await expect(activateVolunteerType(1)).rejects.toMatchObject({ statusCode: 409 });
    expect(volunteerJenisRepository.setActive).not.toHaveBeenCalled();
  });

  it('harus berhasil reaktivasi dan mencatat audit log ACTIVATE/VOLUNTEER', async () => {
    volunteerJenisRepository.findById.mockResolvedValue({ id: 1, nama: 'Usher', is_active: 0 });

    await activateVolunteerType(1, { actorUserId: 9 });

    expect(volunteerJenisRepository.setActive).toHaveBeenCalledWith(1, true);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 9,
        aksi: 'ACTIVATE',
        modul: 'VOLUNTEER',
        objectId: 1,
        dataSebelum: { nama: 'Usher', is_active: 0 },
        dataSesudah: { is_active: true },
      })
    );
  });
});
