jest.mock('../../../../src/modules/cellgroup/cellgroup.repository');
jest.mock('../../../../src/modules/cellgroup/cellgroup-meeting.repository');
jest.mock('../../../../src/modules/cellgroup/image-compression.util');
jest.mock('../../../../src/modules/auditlog/auditlog.repository');
jest.mock('../../../../src/config/database');
jest.mock('fs');

const cgRepository = require('../../../../src/modules/cellgroup/cellgroup.repository');
const meetingRepository = require('../../../../src/modules/cellgroup/cellgroup-meeting.repository');
const { compressToTargetSize } = require('../../../../src/modules/cellgroup/image-compression.util');
const { recordAuditLog } = require('../../../../src/modules/auditlog/auditlog.repository');
const { getPool } = require('../../../../src/config/database');
const fs = require('fs');
const {
  CellGroupError,
  createCellGroup,
  addMemberToCg,
  removeMemberFromCg,
  createMeeting,
  addPhotosToMeeting,
  listMeetingPhotos,
  getPhotoFile,
  deletePhoto,
  submitAbsensi,
} = require('../../../../src/modules/cellgroup/cellgroup.service');

const PAST_DATETIME = '2020-01-01 10:00:00';

let mockConnection;
beforeEach(() => {
  jest.clearAllMocks();
  recordAuditLog.mockResolvedValue(1);
  mockConnection = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
  };
  getPool.mockReturnValue({ getConnection: jest.fn().mockResolvedValue(mockConnection) });
});

describe('cellgroup.service — createCellGroup (Unit Test)', () => {
  it('harus 400 jika nama atau leaderId kosong', async () => {
    await expect(createCellGroup({ nama: 'CG A' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus berhasil membuat CG dan mencatat audit log CREATE_CG', async () => {
    cgRepository.create.mockResolvedValue(5);

    const result = await createCellGroup({ nama: 'CG A', leaderId: 1 }, { actorUserId: 9 });

    expect(result).toEqual({ id: 5 });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ aksi: 'CREATE_CG' }));
  });
});

describe('cellgroup.service — addMemberToCg (Unit Test)', () => {
  it('harus 404 jika CG tidak ditemukan', async () => {
    cgRepository.findById.mockResolvedValue(null);

    await expect(addMemberToCg(1, 10)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 409 jika jemaat sudah anggota aktif', async () => {
    cgRepository.findById.mockResolvedValue({ id: 1 });
    cgRepository.isJemaatActiveMember.mockResolvedValue(true);

    await expect(addMemberToCg(1, 10)).rejects.toMatchObject({ statusCode: 409 });
    expect(cgRepository.addMember).not.toHaveBeenCalled();
  });

  it('harus berhasil menambah anggota jika belum jadi anggota', async () => {
    cgRepository.findById.mockResolvedValue({ id: 1 });
    cgRepository.isJemaatActiveMember.mockResolvedValue(false);

    await addMemberToCg(1, 10, { actorUserId: 9 });

    expect(cgRepository.addMember).toHaveBeenCalledWith(1, 10);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ aksi: 'ADD_MEMBER_CG' }));
  });
});

describe('cellgroup.service — removeMemberFromCg (Unit Test)', () => {
  it('harus 404 jika CG tidak ditemukan', async () => {
    cgRepository.findById.mockResolvedValue(null);

    await expect(removeMemberFromCg(1, 10)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus berhasil dan mencatat audit log REMOVE_MEMBER_CG', async () => {
    cgRepository.findById.mockResolvedValue({ id: 1 });

    await removeMemberFromCg(1, 10, { actorUserId: 9 });

    expect(cgRepository.removeMember).toHaveBeenCalledWith(1, 10);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ aksi: 'REMOVE_MEMBER_CG' }));
  });
});

describe('cellgroup.service — createMeeting (Unit Test)', () => {
  it('harus 404 jika Cell Group tidak ditemukan', async () => {
    cgRepository.findById.mockResolvedValue(null);

    await expect(createMeeting({ cgId: 1 })).rejects.toMatchObject({ statusCode: 404 });
    expect(cgRepository.findActiveLeader).not.toHaveBeenCalled();
  });

  it('harus 400 dengan pesan "Tunjuk leader baru terlebih dahulu" jika tidak ada leader aktif', async () => {
    cgRepository.findById.mockResolvedValue({ id: 1 });
    cgRepository.findActiveLeader.mockResolvedValue(null);

    await expect(createMeeting({ cgId: 1 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Tunjuk leader baru terlebih dahulu',
    });
    expect(meetingRepository.createMeeting).not.toHaveBeenCalled();
  });

  it('harus 400 jika waktuSelesai tidak setelah waktuMulai', async () => {
    cgRepository.findById.mockResolvedValue({ id: 1 });
    cgRepository.findActiveLeader.mockResolvedValue({ id: 10, nama: 'Leader Aktif' });

    await expect(
      createMeeting({
        cgId: 1, judul: 'Meeting A', jenis: 'OFFLINE',
        waktuMulai: '2026-06-20 21:00:00', waktuSelesai: '2026-06-20 19:00:00',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(meetingRepository.createMeeting).not.toHaveBeenCalled();
  });

  it('harus berhasil membuat meeting jika ada leader aktif', async () => {
    cgRepository.findById.mockResolvedValue({ id: 1 });
    cgRepository.findActiveLeader.mockResolvedValue({ id: 10, nama: 'Leader Aktif' });
    meetingRepository.createMeeting.mockResolvedValue(7);

    const result = await createMeeting(
      { cgId: 1, judul: 'Meeting A', jenis: 'OFFLINE', waktuMulai: '2026-06-20 19:00:00', waktuSelesai: '2026-06-20 21:00:00' },
      { actorUserId: 9 }
    );

    expect(result).toEqual({ id: 7 });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ aksi: 'CREATE_MEETING' }));
  });
});

describe('cellgroup.service — addPhotosToMeeting (Unit Test)', () => {
  beforeEach(() => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFileSync.mockReturnValue(undefined);
    fs.mkdirSync.mockReturnValue(undefined);
  });

  it('harus 404 jika meeting tidak ditemukan', async () => {
    meetingRepository.findMeetingById.mockResolvedValue(null);

    await expect(addPhotosToMeeting(1, [Buffer.from('fake')])).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 400 jika meeting belum selesai', async () => {
    meetingRepository.findMeetingById.mockResolvedValue({ id: 1, waktu_selesai: '2099-01-01 10:00:00' });

    await expect(
      addPhotosToMeeting(1, [Buffer.from('fake')], { actorRole: 'LEADER' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(compressToTargetSize).not.toHaveBeenCalled();
  });

  it('harus 403 jika sudah ada foto tersimpan dan bukan LEADER', async () => {
    meetingRepository.findMeetingById.mockResolvedValue({ id: 1, waktu_selesai: PAST_DATETIME });
    meetingRepository.countMeetingPhotos.mockResolvedValue(1);

    await expect(
      addPhotosToMeeting(1, [Buffer.from('fake')], { actorRole: 'ADMIN' })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(compressToTargetSize).not.toHaveBeenCalled();
  });

  it('harus 400 jika total foto (lama + baru) melebihi kuota', async () => {
    meetingRepository.findMeetingById.mockResolvedValue({ id: 1, waktu_selesai: PAST_DATETIME });
    meetingRepository.countMeetingPhotos.mockResolvedValue(3);

    // actorRole: LEADER supaya lolos gate 403 dan benar-benar menguji gate kuota.
    await expect(
      addPhotosToMeeting(1, [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')], { actorRole: 'LEADER' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(compressToTargetSize).not.toHaveBeenCalled();
  });

  it('harus mengompres & menyimpan semua foto dalam batch jika belum ada foto (submit pertama boleh ADMIN)', async () => {
    meetingRepository.findMeetingById.mockResolvedValue({ id: 1, waktu_selesai: PAST_DATETIME });
    meetingRepository.countMeetingPhotos.mockResolvedValue(0);
    compressToTargetSize.mockResolvedValue({ buffer: Buffer.from('compressed'), sizeKb: 480, quality: 60 });
    meetingRepository.addMeetingPhoto.mockResolvedValueOnce(99).mockResolvedValueOnce(100);

    const result = await addPhotosToMeeting(
      1, [Buffer.from('original1'), Buffer.from('original2')], { actorUserId: 9, actorRole: 'ADMIN' }
    );

    expect(result).toEqual([{ id: 99, sizeKb: 480 }, { id: 100, sizeKb: 480 }]);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    expect(meetingRepository.addMeetingPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId: 1, fileSizeKb: 480 })
    );
  });

  it('harus tetap berhasil untuk LEADER walau sudah ada foto tersimpan', async () => {
    meetingRepository.findMeetingById.mockResolvedValue({ id: 1, waktu_selesai: PAST_DATETIME });
    meetingRepository.countMeetingPhotos.mockResolvedValue(2);
    compressToTargetSize.mockResolvedValue({ buffer: Buffer.from('compressed'), sizeKb: 300, quality: 60 });
    meetingRepository.addMeetingPhoto.mockResolvedValue(101);

    const result = await addPhotosToMeeting(1, [Buffer.from('x')], { actorUserId: 9, actorRole: 'LEADER' });

    expect(result).toEqual([{ id: 101, sizeKb: 300 }]);
  });
});

describe('cellgroup.service — submitAbsensi (Unit Test)', () => {
  const activeMembers = [{ id: 10, nama: 'Budi' }, { id: 11, nama: 'Sari' }];

  it('harus 404 jika meeting tidak ditemukan', async () => {
    meetingRepository.findMeetingById.mockResolvedValue(null);

    await expect(submitAbsensi(1, [{ jemaatId: 10, hadir: true }])).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 400 jika meeting belum selesai', async () => {
    meetingRepository.findMeetingById.mockResolvedValue({ id: 1, waktu_selesai: '2099-01-01 10:00:00' });

    await expect(
      submitAbsensi(1, [{ jemaatId: 10, hadir: true }], { actorRole: 'LEADER' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(meetingRepository.upsertAbsensi).not.toHaveBeenCalled();
  });

  it('harus 403 jika sudah ada absensi tersimpan dan bukan LEADER', async () => {
    meetingRepository.findMeetingById.mockResolvedValue({ id: 1, waktu_selesai: PAST_DATETIME, waktu_mulai: PAST_DATETIME });
    meetingRepository.findAbsensiByMeeting.mockResolvedValue([{ jemaat_id: 10, nama: 'Budi', hadir: true }]);

    await expect(
      submitAbsensi(1, [{ jemaatId: 10, hadir: true }], { actorRole: 'ADMIN' })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(meetingRepository.upsertAbsensi).not.toHaveBeenCalled();
  });

  it('harus 400 jika ada jemaatId yang bukan anggota CG pada waktu meeting', async () => {
    meetingRepository.findMeetingById.mockResolvedValue({ id: 1, waktu_selesai: PAST_DATETIME, waktu_mulai: PAST_DATETIME, cg_id: 1 });
    meetingRepository.findAbsensiByMeeting.mockResolvedValue([]);
    meetingRepository.findActiveMembersAtMeetingTime.mockResolvedValue(activeMembers);

    await expect(
      submitAbsensi(1, [{ jemaatId: 999, hadir: true }], { actorRole: 'ADMIN' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(meetingRepository.upsertAbsensi).not.toHaveBeenCalled();
  });

  it('submit pertama (belum ada data) boleh ADMIN — memanggil upsertAbsensi untuk setiap entri dalam transaction', async () => {
    meetingRepository.findMeetingById.mockResolvedValue({ id: 1, waktu_selesai: PAST_DATETIME, waktu_mulai: PAST_DATETIME, cg_id: 1 });
    meetingRepository.findAbsensiByMeeting.mockResolvedValue([]);
    meetingRepository.findActiveMembersAtMeetingTime.mockResolvedValue(activeMembers);

    await submitAbsensi(1, [
      { jemaatId: 10, hadir: true },
      { jemaatId: 11, hadir: false },
    ], { actorUserId: 9, actorRole: 'ADMIN' });

    expect(meetingRepository.upsertAbsensi).toHaveBeenCalledTimes(2);
    expect(meetingRepository.upsertAbsensi).toHaveBeenCalledWith(1, 10, true, mockConnection);
    expect(meetingRepository.upsertAbsensi).toHaveBeenCalledWith(1, 11, false, mockConnection);
    expect(mockConnection.commit).toHaveBeenCalled();
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ aksi: 'INPUT_ABSENSI_CG' }));
  });

  it('edit data tersimpan boleh LEADER', async () => {
    meetingRepository.findMeetingById.mockResolvedValue({ id: 1, waktu_selesai: PAST_DATETIME, waktu_mulai: PAST_DATETIME, cg_id: 1 });
    meetingRepository.findAbsensiByMeeting.mockResolvedValue([{ jemaat_id: 10, nama: 'Budi', hadir: false }]);
    meetingRepository.findActiveMembersAtMeetingTime.mockResolvedValue(activeMembers);

    await submitAbsensi(1, [{ jemaatId: 10, hadir: true }], { actorUserId: 9, actorRole: 'LEADER' });

    expect(meetingRepository.upsertAbsensi).toHaveBeenCalledWith(1, 10, true, mockConnection);
  });
});
describe('cellgroup.service — listMeetingPhotos (Unit Test)', () => {
  it('harus 404 jika meeting tidak ditemukan', async () => {
    meetingRepository.findMeetingById.mockResolvedValue(null);

    await expect(listMeetingPhotos(1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus mengembalikan daftar foto dari repository', async () => {
    meetingRepository.findMeetingById.mockResolvedValue({ id: 1 });
    const photos = [{ id: 3, file_size_kb: 480, uploaded_by: 9, created_at: '2026-07-01' }];
    meetingRepository.findPhotosByMeetingId.mockResolvedValue(photos);

    await expect(listMeetingPhotos(1)).resolves.toEqual(photos);
    expect(meetingRepository.findPhotosByMeetingId).toHaveBeenCalledWith(1);
  });
});

describe('cellgroup.service — getPhotoFile (Unit Test)', () => {
  it('harus 404 jika record foto tidak ditemukan', async () => {
    meetingRepository.findPhotoById.mockResolvedValue(null);

    await expect(getPhotoFile(99)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 400 jika file_path keluar dari folder uploads (path traversal)', async () => {
    meetingRepository.findPhotoById.mockResolvedValue({
      id: 3, file_path: '/uploads/../.env',
    });

    await expect(getPhotoFile(3)).rejects.toMatchObject({
      statusCode: 400, message: 'Path file foto tidak valid',
    });
    expect(fs.existsSync).not.toHaveBeenCalled();
  });

  it('harus 404 jika file sudah tidak ada di disk', async () => {
    meetingRepository.findPhotoById.mockResolvedValue({
      id: 3, file_path: '/uploads/cg-meeting-photos/meeting-1-123.jpg',
    });
    fs.existsSync.mockReturnValue(false);

    await expect(getPhotoFile(3)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus mengembalikan path absolut di dalam uploads + content type yang benar', async () => {
    meetingRepository.findPhotoById.mockResolvedValue({
      id: 3, file_path: '/uploads/cg-meeting-photos/meeting-1-123.jpg',
    });
    fs.existsSync.mockReturnValue(true);

    const result = await getPhotoFile(3);

    expect(result.contentType).toBe('image/jpeg');
    expect(result.absolutePath).toContain('cg-meeting-photos');
    expect(result.absolutePath).toContain('meeting-1-123.jpg');
  });
});

describe('cellgroup.service — deletePhoto (Unit Test)', () => {
  it('harus 404 jika record foto tidak ditemukan', async () => {
    meetingRepository.findPhotoById.mockResolvedValue(null);

    await expect(deletePhoto(99, { actorRole: 'LEADER' })).rejects.toMatchObject({ statusCode: 404 });
    expect(meetingRepository.deleteMeetingPhoto).not.toHaveBeenCalled();
  });

  it('harus 403 jika bukan LEADER', async () => {
    meetingRepository.findPhotoById.mockResolvedValue({
      id: 3, meeting_id: 1, file_path: '/uploads/cg-meeting-photos/meeting-1-123.jpg', file_size_kb: 480,
    });

    await expect(deletePhoto(3, { actorRole: 'ADMIN' })).rejects.toMatchObject({ statusCode: 403 });
    expect(meetingRepository.deleteMeetingPhoto).not.toHaveBeenCalled();
  });

  it('harus menghapus file di disk, record DB, dan mencatat audit log untuk LEADER', async () => {
    meetingRepository.findPhotoById.mockResolvedValue({
      id: 3, meeting_id: 1, file_path: '/uploads/cg-meeting-photos/meeting-1-123.jpg', file_size_kb: 480,
    });
    fs.existsSync.mockReturnValue(true);

    await deletePhoto(3, { actorUserId: 9, actorRole: 'LEADER' });

    expect(fs.unlinkSync).toHaveBeenCalled();
    expect(meetingRepository.deleteMeetingPhoto).toHaveBeenCalledWith(3);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'DELETE_MEETING_PHOTO', modul: 'CELL_GROUP', objectId: 1 })
    );
  });

  it('file yang sudah hilang dari disk tidak menggagalkan penghapusan record', async () => {
    meetingRepository.findPhotoById.mockResolvedValue({
      id: 3, meeting_id: 1, file_path: '/uploads/cg-meeting-photos/meeting-1-123.jpg', file_size_kb: 480,
    });
    fs.existsSync.mockReturnValue(false);

    await deletePhoto(3, { actorUserId: 9, actorRole: 'LEADER' });

    expect(fs.unlinkSync).not.toHaveBeenCalled();
    expect(meetingRepository.deleteMeetingPhoto).toHaveBeenCalledWith(3);
  });
});

describe('cellgroup.service — activateCellGroup (Unit Test)', () => {
  it('harus 404 jika CG tidak pernah ada', async () => {
    cgRepository.findByIdIncludingDeleted.mockResolvedValue(null);

    await expect(
      require('../../../../src/modules/cellgroup/cellgroup.service').activateCellGroup(1)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(cgRepository.activate).not.toHaveBeenCalled();
  });

  it('harus 409 jika CG sudah aktif', async () => {
    cgRepository.findByIdIncludingDeleted.mockResolvedValue({ id: 1, nama: 'CG A', is_active: 1 });

    await expect(
      require('../../../../src/modules/cellgroup/cellgroup.service').activateCellGroup(1)
    ).rejects.toMatchObject({ statusCode: 409, message: 'Cell Group sudah aktif' });
    expect(cgRepository.activate).not.toHaveBeenCalled();
  });

  it('harus reaktivasi CG nonaktif dan mencatat audit log ACTIVATE_CG', async () => {
    cgRepository.findByIdIncludingDeleted.mockResolvedValue({ id: 1, nama: 'CG A', is_active: 0 });

    await require('../../../../src/modules/cellgroup/cellgroup.service')
      .activateCellGroup(1, { actorUserId: 9 });

    expect(cgRepository.activate).toHaveBeenCalledWith(1);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'ACTIVATE_CG', modul: 'CELL_GROUP', objectId: 1 })
    );
  });
});
