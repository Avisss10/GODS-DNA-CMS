jest.mock('../../../../src/modules/event/event.repository');
jest.mock('../../../../src/modules/event/event-kehadiran.repository');
jest.mock('../../../../src/modules/event/event-volunteer.repository');
jest.mock('../../../../src/modules/event/event-volunteer-needs.repository');
jest.mock('../../../../src/modules/event/event-attendances.repository');
jest.mock('../../../../src/modules/volunteer/volunteer-member.repository');
jest.mock('../../../../src/modules/volunteer/volunteer-jenis.repository');
jest.mock('../../../../src/modules/auditlog/auditlog.repository');
jest.mock('../../../../src/config/database');

const eventRepository = require('../../../../src/modules/event/event.repository');
const eventKehadiranRepository = require('../../../../src/modules/event/event-kehadiran.repository');
const eventVolunteerRepository = require('../../../../src/modules/event/event-volunteer.repository');
const eventVolunteerNeedsRepository = require('../../../../src/modules/event/event-volunteer-needs.repository');
const eventAttendancesRepository = require('../../../../src/modules/event/event-attendances.repository');
const volunteerMemberRepository = require('../../../../src/modules/volunteer/volunteer-member.repository');
const volunteerJenisRepository = require('../../../../src/modules/volunteer/volunteer-jenis.repository');
const { recordAuditLog } = require('../../../../src/modules/auditlog/auditlog.repository');
const { getPool } = require('../../../../src/config/database');

const {
  createEvent, updateEvent, transitionStatus,
  inputKehadiran, assignVolunteer, replaceVolunteer,
  cancelVolunteerAssignment, suggestVolunteers,
  getVolunteerNeeds, updateVolunteerNeeds,
  hitungSFrekuensi, hitungSAktif, hitungCompositeScore,
  MAX_TUGAS_REFERENSI,
} = require('../../../../src/modules/event/event.service');

let mockConnection;

beforeEach(() => {
  jest.clearAllMocks();
  recordAuditLog.mockResolvedValue(1);
  // Default mock untuk attendances agar tidak undefined
  eventAttendancesRepository.insertBatch.mockResolvedValue();
  eventAttendancesRepository.insertAttendance.mockResolvedValue(1);
  // Default: belum ada attendance → guard duplikat mengizinkan insert
  eventAttendancesRepository.findByEventAndJemaat.mockResolvedValue(null);

  // Default mock transaksi (dipakai assignVolunteer untuk pessimistic lock kuota)
  mockConnection = {
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
  const mockPool = { getConnection: jest.fn().mockResolvedValue(mockConnection) };
  getPool.mockReturnValue(mockPool);
  eventVolunteerNeedsRepository.findByEventAndJenisForUpdate.mockResolvedValue(null); // default: tanpa kuota didefinisikan
  eventVolunteerNeedsRepository.findByEventId.mockResolvedValue([]);
  eventVolunteerNeedsRepository.findByEventIdForUpdate.mockResolvedValue([]);
  eventVolunteerNeedsRepository.upsertWithConnection.mockResolvedValue();
  eventVolunteerNeedsRepository.deleteByEventAndJenisWithConnection.mockResolvedValue();
  eventVolunteerRepository.assignWithConnection.mockResolvedValue(7);
  eventVolunteerRepository.countActiveByEventAndJenis.mockResolvedValue(0);
  eventVolunteerRepository.countTugas30HariBatch.mockResolvedValue({});
  eventVolunteerRepository.findConflictingJemaatIds.mockResolvedValue([]);
  // Default: jenis volunteer ditemukan & aktif — supaya test assignVolunteer
  // yang tidak spesifik menguji status jenis tetap lolos ke pengecekan
  // berikutnya (membership/kuota/dst), bukan keblok di awal.
  volunteerJenisRepository.findById.mockResolvedValue({ id: 3, is_active: true });
});

// ── createEvent ───────────────────────────────────────────────────
describe('event.service — createEvent (Unit Test)', () => {
  it('harus 400 jika judul kosong', async () => {
    await expect(createEvent({ jenis: 'IBADAH', waktu_mulai: '2026-06-01 09:00', waktu_selesai: '2026-06-01 11:00' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika jenis kosong', async () => {
    await expect(createEvent({ judul: 'Ibadah', waktu_mulai: '2026-06-01 09:00', waktu_selesai: '2026-06-01 11:00' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika waktu_selesai sebelum waktu_mulai', async () => {
    await expect(createEvent({
      judul: 'Ibadah', jenis: 'IBADAH',
      waktu_mulai: '2026-06-01 11:00', waktu_selesai: '2026-06-01 09:00',
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus berhasil membuat event dan mencatat audit log CREATE/EVENT', async () => {
    eventRepository.create.mockResolvedValue(10);
    eventRepository.findById.mockResolvedValue({ id: 10, judul: 'Ibadah Raya', status: 'DRAFT' });

    const result = await createEvent({
      judul: 'Ibadah Raya', jenis: 'IBADAH',
      waktu_mulai: '2026-06-01 09:00', waktu_selesai: '2026-06-01 11:00',
    }, { actorUserId: 1 });

    expect(result.id).toBe(10);
    expect(result.status).toBe('DRAFT');
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'CREATE', modul: 'EVENT' })
    );
  });
});

// ── updateEvent ───────────────────────────────────────────────────
describe('event.service — updateEvent (Unit Test)', () => {
  it('harus 404 jika event tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue(null);
    await expect(updateEvent(1, { judul: 'Baru' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 400 jika event berstatus AKTIF', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'AKTIF' });
    await expect(updateEvent(1, { judul: 'Baru' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika update waktu membuat selesai <= mulai', async () => {
    eventRepository.findById.mockResolvedValue({
      id: 1, status: 'DRAFT',
      waktu_mulai: '2026-06-01 09:00', waktu_selesai: '2026-06-01 11:00',
    });
    await expect(updateEvent(1, { waktu_selesai: '2026-06-01 08:00' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus berhasil update event DRAFT dan mencatat audit log UPDATE/EVENT', async () => {
    const mockEvent = { id: 1, judul: 'Lama', jenis: 'IBADAH', status: 'DRAFT' };
    eventRepository.findById
      .mockResolvedValueOnce(mockEvent)
      .mockResolvedValueOnce({ ...mockEvent, judul: 'Baru' });

    const result = await updateEvent(1, { judul: 'Baru' }, { actorUserId: 1 });

    expect(result.judul).toBe('Baru');
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'UPDATE', modul: 'EVENT' })
    );
  });
});

// ── transitionStatus ──────────────────────────────────────────────
describe('event.service — transitionStatus (Unit Test)', () => {
  it('harus 404 jika event tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue(null);
    await expect(transitionStatus(1, 'PUBLISHED')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 400 untuk transisi tidak valid (DRAFT → AKTIF)', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'DRAFT' });
    await expect(transitionStatus(1, 'AKTIF')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('DRAFT → PUBLISHED berhasil dan mencatat audit log UPDATE_STATUS/EVENT', async () => {
    eventRepository.findById
      .mockResolvedValueOnce({ id: 1, status: 'DRAFT' })
      .mockResolvedValueOnce({ id: 1, status: 'PUBLISHED' });

    const result = await transitionStatus(1, 'PUBLISHED', { actorUserId: 1 });

    expect(result.status).toBe('PUBLISHED');
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'UPDATE_STATUS', modul: 'EVENT' })
    );
  });

  it('PUBLISHED → AKTIF harus set absensi_status OPEN dan auto-insert attendances', async () => {
    eventRepository.findById
      .mockResolvedValueOnce({ id: 1, status: 'PUBLISHED' })
      .mockResolvedValueOnce({ id: 1, status: 'AKTIF', absensi_status: 'OPEN' });
    // ← WAJIB mock findActiveByEvent agar tidak undefined
    eventVolunteerRepository.findActiveByEvent.mockResolvedValue([
      { jemaat_id: 2 }, { jemaat_id: 3 },
    ]);

    const result = await transitionStatus(1, 'AKTIF', { actorUserId: 1 });

    expect(eventRepository.update).toHaveBeenCalledWith(1,
      expect.objectContaining({ status: 'AKTIF', absensi_status: 'OPEN' })
    );
    expect(eventAttendancesRepository.insertBatch).toHaveBeenCalledWith(1, [2, 3]);
    expect(result.absensi_status).toBe('OPEN');
  });

  it('AKTIF → SELESAI harus set absensi_status CLOSED', async () => {
    eventRepository.findById
      .mockResolvedValueOnce({ id: 1, status: 'AKTIF' })
      .mockResolvedValueOnce({ id: 1, status: 'SELESAI', absensi_status: 'CLOSED' });

    await transitionStatus(1, 'SELESAI', { actorUserId: 1 });

    expect(eventRepository.update).toHaveBeenCalledWith(1,
      expect.objectContaining({ status: 'SELESAI', absensi_status: 'CLOSED' })
    );
  });

  it('PUBLISHED → AKTIF tanpa volunteer tidak memanggil insertBatch', async () => {
    eventRepository.findById
      .mockResolvedValueOnce({ id: 1, status: 'PUBLISHED' })
      .mockResolvedValueOnce({ id: 1, status: 'AKTIF', absensi_status: 'OPEN' });
    eventVolunteerRepository.findActiveByEvent.mockResolvedValue([]); // kosong

    await transitionStatus(1, 'AKTIF', { actorUserId: 1 });

    expect(eventAttendancesRepository.insertBatch).not.toHaveBeenCalled();
  });
});

// ── inputKehadiran ────────────────────────────────────────────────
describe('event.service — inputKehadiran (Unit Test)', () => {
  it('harus 404 jika event tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue(null);
    await expect(inputKehadiran(1, { total_hadir: 100 })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 400 jika event masih DRAFT', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'DRAFT' });
    await expect(inputKehadiran(1, { total_hadir: 100 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika total_hadir negatif', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'AKTIF' });
    await expect(inputKehadiran(1, { total_hadir: -1 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika jemaat_baru melebihi total_hadir', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'AKTIF' });
    await expect(inputKehadiran(1, { total_hadir: 50, jemaat_baru: 60 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus berhasil upsert dan mencatat audit log CREATE/EVENT_KEHADIRAN (baru)', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'AKTIF' });
    eventKehadiranRepository.findByEventId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 1, event_id: 1, total_hadir: 100, jemaat_baru: 5 });
    eventKehadiranRepository.upsert.mockResolvedValue(1);

    const result = await inputKehadiran(1, { total_hadir: 100, jemaat_baru: 5 }, { actorUserId: 1 });

    expect(result.total_hadir).toBe(100);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'CREATE', modul: 'EVENT_KEHADIRAN' })
    );
  });

  it('harus mencatat audit log UPDATE/EVENT_KEHADIRAN jika sudah ada', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'AKTIF' });
    eventKehadiranRepository.findByEventId
      .mockResolvedValueOnce({ id: 1, event_id: 1, total_hadir: 80, jemaat_baru: 2 })
      .mockResolvedValueOnce({ id: 1, event_id: 1, total_hadir: 100, jemaat_baru: 5 });
    eventKehadiranRepository.upsert.mockResolvedValue(1);

    await inputKehadiran(1, { total_hadir: 100, jemaat_baru: 5 }, { actorUserId: 1 });

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'UPDATE', modul: 'EVENT_KEHADIRAN' })
    );
  });
});

// ── assignVolunteer ───────────────────────────────────────────────
describe('event.service — assignVolunteer (Unit Test)', () => {
  it('harus 404 jika event tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue(null);
    await expect(assignVolunteer(1, { jemaat_id: 1, jenis_id: 1 }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 400 jika event sudah SELESAI', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'SELESAI' });
    await expect(assignVolunteer(1, { jemaat_id: 1, jenis_id: 1 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus berhasil menugaskan saat event masih DRAFT (persiapan awal)', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'DRAFT' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerRepository.findById.mockResolvedValue({
      id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF',
    });

    const result = await assignVolunteer(1, { jemaat_id: 2, jenis_id: 3 }, { actorUserId: 1 });

    expect(result.id).toBe(7);
    // DRAFT belum AKTIF — tidak boleh insert attendance
    expect(eventAttendancesRepository.insertAttendance).not.toHaveBeenCalled();
  });

  it('harus 400 jika jenis volunteer tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    volunteerJenisRepository.findById.mockResolvedValue(null);
    await expect(assignVolunteer(1, { jemaat_id: 2, jenis_id: 999 }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(volunteerMemberRepository.findByJemaatAndType).not.toHaveBeenCalled();
  });

  it('harus 400 jika jenis volunteer sudah dinonaktifkan', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    volunteerJenisRepository.findById.mockResolvedValue({ id: 3, is_active: false });
    await expect(assignVolunteer(1, { jemaat_id: 2, jenis_id: 3 }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(volunteerMemberRepository.findByJemaatAndType).not.toHaveBeenCalled();
  });

  it('harus 400 jika jemaat tidak terdaftar sebagai volunteer jenis tersebut', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue(null);
    await expect(assignVolunteer(1, { jemaat_id: 2, jenis_id: 3 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika membership volunteer tidak aktif', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: false });
    await expect(assignVolunteer(1, { jemaat_id: 2, jenis_id: 3 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus berhasil menugaskan dan mencatat audit log ASSIGN_VOLUNTEER/EVENT', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerRepository.findById.mockResolvedValue({
      id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF',
    });

    const result = await assignVolunteer(1, { jemaat_id: 2, jenis_id: 3 }, { actorUserId: 1 });

    expect(result.id).toBe(7);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'ASSIGN_VOLUNTEER', modul: 'EVENT' })
    );
  });

  it('assign saat event AKTIF harus juga insert event_attendances', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'AKTIF' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerRepository.findById.mockResolvedValue({
      id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF',
    });

    await assignVolunteer(1, { jemaat_id: 2, jenis_id: 3 }, { actorUserId: 1 });

    expect(eventAttendancesRepository.insertAttendance).toHaveBeenCalledWith({
      event_id: 1, jemaat_id: 2,
    });
  });

  it('assign saat event AKTIF TIDAK insert attendance lagi jika jemaat sudah punya record (guard duplikat)', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'AKTIF' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerRepository.findById.mockResolvedValue({
      id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF',
    });
    eventAttendancesRepository.findByEventAndJemaat.mockResolvedValueOnce({
      id: 99, event_id: 1, jemaat_id: 2,
    });

    await assignVolunteer(1, { jemaat_id: 2, jenis_id: 3 }, { actorUserId: 1 });

    expect(eventAttendancesRepository.findByEventAndJemaat).toHaveBeenCalledWith(1, 2);
    expect(eventAttendancesRepository.insertAttendance).not.toHaveBeenCalled();
  });

  it('harus menugaskan di dalam transaksi: begin → assign → commit → release', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerRepository.findById.mockResolvedValue({ id: 7, status: 'AKTIF' });

    await assignVolunteer(1, { jemaat_id: 2, jenis_id: 3 }, { actorUserId: 1 });

    expect(mockConnection.beginTransaction).toHaveBeenCalled();
    expect(eventVolunteerNeedsRepository.findByEventAndJenisForUpdate).toHaveBeenCalledWith(mockConnection, 1, 3);
    expect(eventVolunteerRepository.assignWithConnection).toHaveBeenCalledWith(
      mockConnection, { event_id: 1, jemaat_id: 2, jenis_id: 3 }
    );
    expect(mockConnection.commit).toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalled();
  });

  it('harus 409 dan rollback jika kuota event_volunteer_needs sudah penuh', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerNeedsRepository.findByEventAndJenisForUpdate.mockResolvedValue({ id: 1, kuota: 2 });
    eventVolunteerRepository.countActiveByEventAndJenis.mockResolvedValue(2);

    await expect(assignVolunteer(1, { jemaat_id: 2, jenis_id: 3 }, { actorUserId: 1 }))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalled();
    expect(eventVolunteerRepository.assignWithConnection).not.toHaveBeenCalled();
  });

  it('harus tetap berhasil jika kuota masih tersisa', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerNeedsRepository.findByEventAndJenisForUpdate.mockResolvedValue({ id: 1, kuota: 2 });
    eventVolunteerRepository.countActiveByEventAndJenis.mockResolvedValue(1);
    eventVolunteerRepository.findById.mockResolvedValue({ id: 7, status: 'AKTIF' });

    const result = await assignVolunteer(1, { jemaat_id: 2, jenis_id: 3 }, { actorUserId: 1 });

    expect(result.id).toBe(7);
    expect(mockConnection.commit).toHaveBeenCalled();
  });

  it('tidak boleh mengecek kuota jika event_volunteer_needs tidak didefinisikan (unlimited)', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerNeedsRepository.findByEventAndJenisForUpdate.mockResolvedValue(null);
    eventVolunteerRepository.findById.mockResolvedValue({ id: 7, status: 'AKTIF' });

    await assignVolunteer(1, { jemaat_id: 2, jenis_id: 3 }, { actorUserId: 1 });

    expect(eventVolunteerRepository.countActiveByEventAndJenis).not.toHaveBeenCalled();
  });
});

// ── replaceVolunteer ──────────────────────────────────────────────
describe('event.service — replaceVolunteer (Unit Test)', () => {
  const dataSebelumEvent = { replacement_timing: 'SEBELUM_EVENT', replaced_by: 4, alasan: 'Sakit' };
  const dataTengahEvent = { replacement_timing: 'TENGAH_EVENT', replaced_by: 4, alasan: 'Pulang mendadak', durasi_menit: 45 };

  function mockPenugasanAktif() {
    eventVolunteerRepository.findById.mockResolvedValue({
      id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF',
    });
  }

  it('harus 404 jika event tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue(null);
    await expect(replaceVolunteer(1, 7, dataSebelumEvent))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 400 jika event sudah SELESAI', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'SELESAI' });
    await expect(replaceVolunteer(1, 7, dataSebelumEvent))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika event sudah DIARSIPKAN', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'DIARSIPKAN' });
    await expect(replaceVolunteer(1, 7, dataSebelumEvent))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 404 jika penugasan tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    eventVolunteerRepository.findById.mockResolvedValue(null);
    await expect(replaceVolunteer(1, 7, dataSebelumEvent))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 404 jika penugasan milik event lain', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    eventVolunteerRepository.findById.mockResolvedValue({
      id: 7, event_id: 99, jemaat_id: 2, jenis_id: 3, status: 'AKTIF',
    });
    await expect(replaceVolunteer(1, 7, dataSebelumEvent))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 400 jika status penugasan bukan AKTIF (mencegah replace ganda)', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    eventVolunteerRepository.findById.mockResolvedValue({
      id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'DIGANTIKAN',
    });
    await expect(replaceVolunteer(1, 7, dataSebelumEvent))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika jemaat pengganti tidak terdaftar sebagai volunteer jenis tersebut', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    mockPenugasanAktif();
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue(null);
    await expect(replaceVolunteer(1, 7, dataSebelumEvent))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika membership jemaat pengganti tidak aktif', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    mockPenugasanAktif();
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: false });
    await expect(replaceVolunteer(1, 7, dataSebelumEvent))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 409 jika jemaat pengganti sudah punya penugasan AKTIF di event+jenis yang sama', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    mockPenugasanAktif();
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerRepository.findAssignedByJenis.mockResolvedValue([{ jemaat_id: 4 }]);
    await expect(replaceVolunteer(1, 7, dataSebelumEvent))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('SEBELUM_EVENT: baris lama jadi DIGANTIKAN, baris baru dibuat dalam transaksi, audit tercatat', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    eventVolunteerRepository.findById
      .mockResolvedValueOnce({ id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF' })
      .mockResolvedValueOnce({ id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'DIGANTIKAN', replaced_by: 4 })
      .mockResolvedValueOnce({ id: 8, event_id: 1, jemaat_id: 4, jenis_id: 3, status: 'AKTIF' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerRepository.findAssignedByJenis.mockResolvedValue([{ jemaat_id: 2 }]);
    eventVolunteerRepository.assignWithConnection.mockResolvedValue(8);

    const result = await replaceVolunteer(1, 7, dataSebelumEvent, { actorUserId: 1 });

    expect(mockConnection.beginTransaction).toHaveBeenCalled();
    expect(eventVolunteerRepository.updateStatusWithConnection).toHaveBeenCalledWith(
      mockConnection, 7,
      expect.objectContaining({ status: 'DIGANTIKAN', replaced_by: 4, alasan: 'Sakit', replacement_timing: 'SEBELUM_EVENT' })
    );
    expect(eventVolunteerRepository.assignWithConnection).toHaveBeenCalledWith(
      mockConnection, { event_id: 1, jemaat_id: 4, jenis_id: 3 }
    );
    expect(mockConnection.commit).toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalled();
    expect(result.penugasan_lama.status).toBe('DIGANTIKAN');
    expect(result.penugasan_baru.status).toBe('AKTIF');
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'REPLACE_VOLUNTEER', modul: 'EVENT', objectId: 7 })
    );
    // Event belum AKTIF — tidak boleh insert attendance
    expect(eventAttendancesRepository.insertAttendance).not.toHaveBeenCalled();
  });

  it('TENGAH_EVENT: baris lama jadi BERTUGAS_PARSIAL dengan durasi_menit', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'AKTIF' });
    eventVolunteerRepository.findById
      .mockResolvedValueOnce({ id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF' })
      .mockResolvedValueOnce({ id: 7, status: 'BERTUGAS_PARSIAL', durasi_menit: 45 })
      .mockResolvedValueOnce({ id: 8, status: 'AKTIF' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerRepository.findAssignedByJenis.mockResolvedValue([]);
    eventVolunteerRepository.assignWithConnection.mockResolvedValue(8);

    const result = await replaceVolunteer(1, 7, dataTengahEvent, { actorUserId: 1 });

    expect(eventVolunteerRepository.updateStatusWithConnection).toHaveBeenCalledWith(
      mockConnection, 7,
      expect.objectContaining({ status: 'BERTUGAS_PARSIAL', durasi_menit: 45 })
    );
    expect(result.penugasan_lama.status).toBe('BERTUGAS_PARSIAL');
  });

  it('event AKTIF: pengganti langsung tercatat di event_attendances', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'AKTIF' });
    eventVolunteerRepository.findById
      .mockResolvedValueOnce({ id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF' })
      .mockResolvedValueOnce({ id: 7, status: 'BERTUGAS_PARSIAL' })
      .mockResolvedValueOnce({ id: 8, status: 'AKTIF' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerRepository.findAssignedByJenis.mockResolvedValue([]);
    eventVolunteerRepository.assignWithConnection.mockResolvedValue(8);

    await replaceVolunteer(1, 7, dataTengahEvent, { actorUserId: 1 });

    expect(eventAttendancesRepository.insertAttendance).toHaveBeenCalledWith({
      event_id: 1, jemaat_id: 4,
    });
  });

  it('event AKTIF: pengganti yang sudah punya attendance TIDAK dicatat dua kali (guard duplikat)', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'AKTIF' });
    eventVolunteerRepository.findById
      .mockResolvedValueOnce({ id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF' })
      .mockResolvedValueOnce({ id: 7, status: 'BERTUGAS_PARSIAL' })
      .mockResolvedValueOnce({ id: 8, status: 'AKTIF' });
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerRepository.findAssignedByJenis.mockResolvedValue([]);
    eventVolunteerRepository.assignWithConnection.mockResolvedValue(8);
    eventAttendancesRepository.findByEventAndJemaat.mockResolvedValueOnce({
      id: 99, event_id: 1, jemaat_id: 4,
    });

    await replaceVolunteer(1, 7, dataTengahEvent, { actorUserId: 1 });

    expect(eventAttendancesRepository.findByEventAndJemaat).toHaveBeenCalledWith(1, 4);
    expect(eventAttendancesRepository.insertAttendance).not.toHaveBeenCalled();
  });

  it('harus rollback dan release jika insert baris pengganti gagal', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    mockPenugasanAktif();
    volunteerMemberRepository.findByJemaatAndType.mockResolvedValue({ id: 5, is_active: true });
    eventVolunteerRepository.findAssignedByJenis.mockResolvedValue([]);
    eventVolunteerRepository.assignWithConnection.mockRejectedValue(new Error('DB error'));

    await expect(replaceVolunteer(1, 7, dataSebelumEvent, { actorUserId: 1 })).rejects.toThrow('DB error');

    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalled();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });
});

// ── cancelVolunteerAssignment ─────────────────────────────────────
describe('event.service — cancelVolunteerAssignment (Unit Test)', () => {
  it('harus 404 jika event tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue(null);
    await expect(cancelVolunteerAssignment(1, 7)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 404 jika penugasan tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    eventVolunteerRepository.findById.mockResolvedValue(null);
    await expect(cancelVolunteerAssignment(1, 7)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 404 jika penugasan milik event lain', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    eventVolunteerRepository.findById.mockResolvedValue({
      id: 7, event_id: 99, jemaat_id: 2, jenis_id: 3, status: 'AKTIF',
    });
    await expect(cancelVolunteerAssignment(1, 7)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 400 jika status penugasan bukan AKTIF', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    eventVolunteerRepository.findById.mockResolvedValue({
      id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'DIBATALKAN',
    });
    await expect(cancelVolunteerAssignment(1, 7)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika event sudah SELESAI', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'SELESAI' });
    eventVolunteerRepository.findById.mockResolvedValue({
      id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF',
    });
    await expect(cancelVolunteerAssignment(1, 7)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika event sudah DIARSIPKAN', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'DIARSIPKAN' });
    eventVolunteerRepository.findById.mockResolvedValue({
      id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF',
    });
    await expect(cancelVolunteerAssignment(1, 7)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus set status DIBATALKAN, mencatat audit log, dan mengembalikan baris terupdate', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    eventVolunteerRepository.findById
      .mockResolvedValueOnce({ id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF' })
      .mockResolvedValueOnce({ id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'DIBATALKAN' });

    const result = await cancelVolunteerAssignment(1, 7, { actorUserId: 1 });

    expect(eventVolunteerRepository.updateStatus).toHaveBeenCalledWith(7, { status: 'DIBATALKAN' });
    expect(result.status).toBe('DIBATALKAN');
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        aksi: 'CANCEL_VOLUNTEER_ASSIGNMENT',
        modul: 'EVENT',
        objectId: 7,
        dataSebelum: { status: 'AKTIF' },
        dataSesudah: { status: 'DIBATALKAN' },
      })
    );
  });

  it('pembatalan saat event AKTIF tidak boleh menyentuh event_attendances (histori dipertahankan)', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'AKTIF' });
    eventVolunteerRepository.findById
      .mockResolvedValueOnce({ id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF' })
      .mockResolvedValueOnce({ id: 7, status: 'DIBATALKAN' });

    await cancelVolunteerAssignment(1, 7, { actorUserId: 1 });

    expect(eventAttendancesRepository.insertAttendance).not.toHaveBeenCalled();
    expect(eventAttendancesRepository.insertBatch).not.toHaveBeenCalled();
  });
});

// ── suggestVolunteers ─────────────────────────────────────────────
describe('event.service — hitungSFrekuensi (Unit Test)', () => {
  it('harus 1 saat jumlah tugas 30 hari = 0', () => {
    expect(hitungSFrekuensi(0)).toBe(1);
  });

  it('harus dihitung sesuai formula 1 - (tugas/MAX_TUGAS_REFERENSI)', () => {
    expect(hitungSFrekuensi(4)).toBeCloseTo(1 - 4 / MAX_TUGAS_REFERENSI, 5);
  });

  it('harus diklem ke 0 jika jumlah tugas melebihi MAX_TUGAS_REFERENSI', () => {
    expect(hitungSFrekuensi(MAX_TUGAS_REFERENSI + 10)).toBe(0);
  });

  it('tidak boleh negatif', () => {
    expect(hitungSFrekuensi(999)).toBeGreaterThanOrEqual(0);
  });
});

describe('event.service — hitungSAktif (Unit Test)', () => {
  it('harus skor_keaktifan / 100', () => {
    expect(hitungSAktif(80)).toBeCloseTo(0.8, 5);
  });

  it('harus 0 jika skor_keaktifan NULL (BELUM_CUKUP_DATA)', () => {
    expect(hitungSAktif(null)).toBe(0);
  });

  it('harus 0 jika skor_keaktifan undefined', () => {
    expect(hitungSAktif(undefined)).toBe(0);
  });
});

describe('event.service — hitungCompositeScore (Unit Test)', () => {
  it('harus menggabungkan bobot 0.40/0.30/0.30 dengan benar', () => {
    const cs = hitungCompositeScore({ sFrek: 1, sAktif: 0.8, sSesuai: 1 });
    // CS = (1 * 0.40) + (0.8 * 0.30) + (1 * 0.30) = 0.4 + 0.24 + 0.3 = 0.94
    expect(cs).toBeCloseTo(0.94, 5);
  });

  it('harus 0 jika ketiga komponen 0', () => {
    expect(hitungCompositeScore({ sFrek: 0, sAktif: 0, sSesuai: 0 })).toBe(0);
  });
});

describe('event.service — suggestVolunteers (Unit Test)', () => {
  it('harus 404 jika event tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue(null);
    await expect(suggestVolunteers(1, 3)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus mengembalikan array kosong jika semua sudah ditugaskan', async () => {
    eventRepository.findById.mockResolvedValue({
      id: 1, status: 'PUBLISHED', waktu_mulai: '2026-06-01 09:00:00', waktu_selesai: '2026-06-01 11:00:00',
    });
    volunteerMemberRepository.findActiveByType.mockResolvedValue([{ jemaat_id: 2, is_new_member: false }]);
    eventVolunteerRepository.findAssignedByJenis.mockResolvedValue([{ jemaat_id: 2 }]);

    const result = await suggestVolunteers(1, 3);
    expect(result).toHaveLength(0);
  });

  it('harus mengecualikan jemaat dengan is_new_member = true', async () => {
    eventRepository.findById.mockResolvedValue({
      id: 1, status: 'PUBLISHED', waktu_mulai: '2026-06-01 09:00:00', waktu_selesai: '2026-06-01 11:00:00',
    });
    volunteerMemberRepository.findActiveByType.mockResolvedValue([
      { jemaat_id: 2, nama: 'Budi', is_new_member: false, skor_keaktifan: 50 },
      { jemaat_id: 3, nama: 'Cindy', is_new_member: true, skor_keaktifan: 90 },
    ]);
    eventVolunteerRepository.findAssignedByJenis.mockResolvedValue([]);

    const result = await suggestVolunteers(1, 3);

    expect(result.map((r) => r.jemaat_id)).toEqual([2]);
  });

  it('harus mengecualikan volunteer dengan konflik jadwal (penugasan AKTIF di event lain yang overlap)', async () => {
    eventRepository.findById.mockResolvedValue({
      id: 1, status: 'PUBLISHED', waktu_mulai: '2026-06-01 09:00:00', waktu_selesai: '2026-06-01 11:00:00',
    });
    volunteerMemberRepository.findActiveByType.mockResolvedValue([
      { jemaat_id: 2, nama: 'Budi', is_new_member: false, skor_keaktifan: 50 },
      { jemaat_id: 3, nama: 'Doni', is_new_member: false, skor_keaktifan: 60 },
    ]);
    eventVolunteerRepository.findAssignedByJenis.mockResolvedValue([]);
    eventVolunteerRepository.findConflictingJemaatIds.mockResolvedValue([3]);

    const result = await suggestVolunteers(1, 3);

    expect(result.map((r) => r.jemaat_id)).toEqual([2]);
    expect(eventVolunteerRepository.findConflictingJemaatIds).toHaveBeenCalledWith({
      waktuMulai: '2026-06-01 09:00:00', waktuSelesai: '2026-06-01 11:00:00', excludeEventId: 1,
    });
  });

  it('harus mengurutkan kandidat descending berdasarkan composite score', async () => {
    eventRepository.findById.mockResolvedValue({
      id: 1, status: 'PUBLISHED', waktu_mulai: '2026-06-01 09:00:00', waktu_selesai: '2026-06-01 11:00:00',
    });
    volunteerMemberRepository.findActiveByType.mockResolvedValue([
      { jemaat_id: 2, nama: 'Budi', is_new_member: false, skor_keaktifan: 20 },  // skor rendah
      { jemaat_id: 3, nama: 'Cindy', is_new_member: false, skor_keaktifan: 100 }, // skor tinggi
      { jemaat_id: 4, nama: 'Doni', is_new_member: false, skor_keaktifan: 60 },   // skor tengah
    ]);
    eventVolunteerRepository.findAssignedByJenis.mockResolvedValue([]);
    // Semua jumlah tugas 30 hari = 0 → S_frek sama untuk semua (default mock {})

    const result = await suggestVolunteers(1, 3);

    expect(result.map((r) => r.jemaat_id)).toEqual([3, 4, 2]);
    expect(result[0].composite_score).toBeGreaterThan(result[1].composite_score);
    expect(result[1].composite_score).toBeGreaterThan(result[2].composite_score);
  });

  it('CS harus sesuai perhitungan manual untuk kandidat konkret', async () => {
    eventRepository.findById.mockResolvedValue({
      id: 1, status: 'PUBLISHED', waktu_mulai: '2026-06-01 09:00:00', waktu_selesai: '2026-06-01 11:00:00',
    });
    volunteerMemberRepository.findActiveByType.mockResolvedValue([
      { jemaat_id: 2, nama: 'Budi', is_new_member: false, skor_keaktifan: 80 },
    ]);
    eventVolunteerRepository.findAssignedByJenis.mockResolvedValue([]);
    eventVolunteerRepository.countTugas30HariBatch.mockResolvedValue({ 2: 4 });

    const result = await suggestVolunteers(1, 3);

    // S_frek = 1 - 4/8 = 0.5, S_aktif = 80/100 = 0.8, S_sesuai = 1.0 (terdaftar)
    // CS = 0.5*0.40 + 0.8*0.30 + 1.0*0.30 = 0.20 + 0.24 + 0.30 = 0.74
    expect(result[0].composite_score).toBeCloseTo(0.74, 5);
  });
});
// ── getVolunteerNeeds ─────────────────────────────────────────────
describe('event.service — getVolunteerNeeds (Unit Test)', () => {
  it('harus 404 jika event tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue(null);

    await expect(getVolunteerNeeds(999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus mengembalikan daftar kebutuhan dari repository (array kosong jika belum ada)', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'DRAFT' });
    const daftar = [
      { id: 10, volunteer_type_id: 3, nama_jenis: 'Usher', kuota: 2, jumlah_terisi: 1 },
    ];
    eventVolunteerNeedsRepository.findByEventId.mockResolvedValue(daftar);

    const result = await getVolunteerNeeds(1);

    expect(result).toEqual(daftar);
    expect(eventVolunteerNeedsRepository.findByEventId).toHaveBeenCalledWith(1);
  });
});

// ── updateVolunteerNeeds ──────────────────────────────────────────
describe('event.service — updateVolunteerNeeds (Unit Test)', () => {
  function mockJenisAktif() {
    volunteerJenisRepository.findById.mockImplementation((id) =>
      Promise.resolve({ id, nama: `Jenis ${id}`, is_active: 1 })
    );
  }

  it('harus 404 jika event tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue(null);

    await expect(updateVolunteerNeeds(999, [])).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 409 jika status event di luar DRAFT/PUBLISHED/AKTIF', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'SELESAI' });

    await expect(updateVolunteerNeeds(1, [{ jenis_id: 3, kuota: 2 }]))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('harus 400 jika needs bukan array', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'DRAFT' });

    await expect(updateVolunteerNeeds(1, undefined)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika kuota bukan integer >= 1', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'DRAFT' });

    await expect(updateVolunteerNeeds(1, [{ jenis_id: 3, kuota: 0 }]))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(updateVolunteerNeeds(1, [{ jenis_id: 3, kuota: 1.5 }]))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika jenis_id duplikat di body', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'DRAFT' });

    await expect(updateVolunteerNeeds(1, [{ jenis_id: 3, kuota: 2 }, { jenis_id: 3, kuota: 5 }]))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('harus 400 jika jenis volunteer tidak ditemukan atau nonaktif', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'DRAFT' });
    volunteerJenisRepository.findById.mockResolvedValue({ id: 3, nama: 'Usher', is_active: 0 });

    await expect(updateVolunteerNeeds(1, [{ jenis_id: 3, kuota: 2 }]))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
  });

  it('harus 409 dan rollback jika kuota baru lebih kecil dari jumlah penugasan aktif', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'AKTIF' });
    mockJenisAktif();
    eventVolunteerRepository.countActiveByEventAndJenis.mockResolvedValue(3);

    await expect(updateVolunteerNeeds(1, [{ jenis_id: 3, kuota: 2 }]))
      .rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('Jenis 3'),
      });

    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(eventVolunteerNeedsRepository.upsertWithConnection).not.toHaveBeenCalled();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it('sukses: lock baris, upsert per jenis, commit, audit UPDATE_VOLUNTEER_NEEDS dengan dataSebelum/dataSesudah', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    mockJenisAktif();
    eventVolunteerRepository.countActiveByEventAndJenis.mockResolvedValue(1);
    eventVolunteerNeedsRepository.findByEventIdForUpdate.mockResolvedValue([
      { id: 10, event_id: 1, volunteer_type_id: 3, kuota: 1 },
    ]);
    const daftarBaru = [
      { id: 10, volunteer_type_id: 3, nama_jenis: 'Jenis 3', kuota: 4, jumlah_terisi: 1 },
    ];
    eventVolunteerNeedsRepository.findByEventId.mockResolvedValue(daftarBaru);

    const result = await updateVolunteerNeeds(1, [{ jenis_id: 3, kuota: 4 }], { actorUserId: 9 });

    expect(eventVolunteerNeedsRepository.findByEventIdForUpdate).toHaveBeenCalledWith(mockConnection, 1);
    expect(eventVolunteerNeedsRepository.upsertWithConnection).toHaveBeenCalledWith(
      mockConnection, { eventId: 1, jenisId: 3, kuota: 4 }
    );
    expect(mockConnection.commit).toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalled();
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 9,
        aksi: 'UPDATE_VOLUNTEER_NEEDS',
        modul: 'EVENT',
        objectId: 1,
        dataSebelum: [{ jenis_id: 3, kuota: 1 }],
        dataSesudah: [{ jenis_id: 3, kuota: 4 }],
      })
    );
    expect(result).toEqual(daftarBaru);
  });

  it('jenis yang hilang dari body dihapus barisnya jika tidak ada penugasan aktif', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'DRAFT' });
    mockJenisAktif();
    eventVolunteerRepository.countActiveByEventAndJenis.mockResolvedValue(0);
    eventVolunteerNeedsRepository.findByEventIdForUpdate.mockResolvedValue([
      { id: 10, event_id: 1, volunteer_type_id: 3, kuota: 2 },
      { id: 11, event_id: 1, volunteer_type_id: 4, kuota: 1 },
    ]);

    await updateVolunteerNeeds(1, [{ jenis_id: 3, kuota: 2 }], { actorUserId: 9 });

    expect(eventVolunteerNeedsRepository.deleteByEventAndJenisWithConnection)
      .toHaveBeenCalledWith(mockConnection, 1, 4);
    expect(mockConnection.commit).toHaveBeenCalled();
  });

  it('harus 409 dan rollback jika baris yang mau dihapus masih punya penugasan aktif', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'AKTIF' });
    mockJenisAktif();
    // jenis 3 (di body): 1 aktif, kuota 2 → OK; jenis 4 (dihapus): 2 aktif → tolak
    eventVolunteerRepository.countActiveByEventAndJenis.mockImplementation(
      (conn, eventId, jenisId) => Promise.resolve(jenisId === 4 ? 2 : 1)
    );
    eventVolunteerNeedsRepository.findByEventIdForUpdate.mockResolvedValue([
      { id: 10, event_id: 1, volunteer_type_id: 3, kuota: 2 },
      { id: 11, event_id: 1, volunteer_type_id: 4, kuota: 3 },
    ]);

    await expect(updateVolunteerNeeds(1, [{ jenis_id: 3, kuota: 2 }]))
      .rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('penugasan aktif'),
      });

    expect(eventVolunteerNeedsRepository.deleteByEventAndJenisWithConnection).not.toHaveBeenCalled();
    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });
});
