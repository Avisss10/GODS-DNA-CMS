jest.mock('../../../../src/modules/event/event.repository');
jest.mock('../../../../src/modules/event/event-kehadiran.repository');
jest.mock('../../../../src/modules/event/event-volunteer.repository');
jest.mock('../../../../src/modules/event/event-attendances.repository'); 
jest.mock('../../../../src/modules/volunteer/volunteer-member.repository');
jest.mock('../../../../src/modules/auditlog/auditlog.repository');

const eventRepository = require('../../../../src/modules/event/event.repository');
const eventKehadiranRepository = require('../../../../src/modules/event/event-kehadiran.repository');
const eventVolunteerRepository = require('../../../../src/modules/event/event-volunteer.repository');
const eventAttendancesRepository = require('../../../../src/modules/event/event-attendances.repository'); 
const volunteerMemberRepository = require('../../../../src/modules/volunteer/volunteer-member.repository');
const { recordAuditLog } = require('../../../../src/modules/auditlog/auditlog.repository');

const {
  createEvent, updateEvent, transitionStatus,
  inputKehadiran, assignVolunteer, suggestVolunteers,
} = require('../../../../src/modules/event/event.service');

beforeEach(() => {
  jest.clearAllMocks();
  recordAuditLog.mockResolvedValue(1);
  // Default mock untuk attendances agar tidak undefined
  eventAttendancesRepository.insertBatch.mockResolvedValue();
  eventAttendancesRepository.insertAttendance.mockResolvedValue(1);
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

  it('harus 400 jika event masih DRAFT', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'DRAFT' });
    await expect(assignVolunteer(1, { jemaat_id: 1, jenis_id: 1 }))
      .rejects.toMatchObject({ statusCode: 400 });
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
    eventVolunteerRepository.assign.mockResolvedValue(7);
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
    eventVolunteerRepository.assign.mockResolvedValue(7);
    eventVolunteerRepository.findById.mockResolvedValue({
      id: 7, event_id: 1, jemaat_id: 2, jenis_id: 3, status: 'AKTIF',
    });

    await assignVolunteer(1, { jemaat_id: 2, jenis_id: 3 }, { actorUserId: 1 });

    expect(eventAttendancesRepository.insertAttendance).toHaveBeenCalledWith({
      event_id: 1, jemaat_id: 2,
    });
  });
});

// ── suggestVolunteers ─────────────────────────────────────────────
describe('event.service — suggestVolunteers (Unit Test)', () => {
  it('harus 404 jika event tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue(null);
    await expect(suggestVolunteers(1, 3)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus mengembalikan kandidat yang belum ditugaskan, non-new-member dulu', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    volunteerMemberRepository.findActiveByType.mockResolvedValue([
      { jemaat_id: 2, nama: 'Budi', is_new_member: false },
      { jemaat_id: 3, nama: 'Cindy', is_new_member: true },
      { jemaat_id: 4, nama: 'Doni', is_new_member: false },
    ]);
    eventVolunteerRepository.findAssignedByJenis.mockResolvedValue([{ jemaat_id: 2 }]);

    const result = await suggestVolunteers(1, 3);

    expect(result).toHaveLength(2);
    expect(result[0].jemaat_id).toBe(4);
    expect(result[1].jemaat_id).toBe(3);
  });

  it('harus mengembalikan array kosong jika semua sudah ditugaskan', async () => {
    eventRepository.findById.mockResolvedValue({ id: 1, status: 'PUBLISHED' });
    volunteerMemberRepository.findActiveByType.mockResolvedValue([{ jemaat_id: 2, is_new_member: false }]);
    eventVolunteerRepository.findAssignedByJenis.mockResolvedValue([{ jemaat_id: 2 }]);

    const result = await suggestVolunteers(1, 3);
    expect(result).toHaveLength(0);
  });
});