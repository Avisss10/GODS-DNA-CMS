jest.mock('../../../../src/modules/event/event.repository');
jest.mock('../../../../src/modules/event/event-kehadiran.repository');
jest.mock('../../../../src/modules/scoring/scoring.service');
jest.mock('../../../../src/modules/event/event.service', () => {
  const actual = jest.requireActual('../../../../src/modules/event/event.service');
  return {
    ...actual,
    assignVolunteer: jest.fn(),
    replaceVolunteer: jest.fn(),
    cancelVolunteerAssignment: jest.fn(),
  };
});

const eventRepository = require('../../../../src/modules/event/event.repository');
const eventKehadiranRepository = require('../../../../src/modules/event/event-kehadiran.repository');
const eventService = require('../../../../src/modules/event/event.service');
const scoringService = require('../../../../src/modules/scoring/scoring.service');
const {
  getKehadiran,
  assignVolunteer,
  replaceVolunteer,
  cancelVolunteer,
} = require('../../../../src/modules/event/event.controller');

function buildMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('event.controller — GET /api/events/:id/kehadiran (Unit Test)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('200: mengembalikan data event_kehadiran', async () => {
    eventRepository.findById.mockResolvedValue({ id: 5, judul: 'Ibadah Raya' });
    const kehadiran = { id: 1, event_id: 5, total_hadir: 200, jemaat_baru: 15 };
    eventKehadiranRepository.findByEventId.mockResolvedValue(kehadiran);
    const res = buildMockRes();

    await getKehadiran({ params: { id: '5' } }, res);

    expect(eventKehadiranRepository.findByEventId).toHaveBeenCalledWith(5);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(kehadiran);
  });

  it('404 jika event tidak ditemukan', async () => {
    eventRepository.findById.mockResolvedValue(null);
    const res = buildMockRes();

    await getKehadiran({ params: { id: '999' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(eventKehadiranRepository.findByEventId).not.toHaveBeenCalled();
  });

  it('404 jika kehadiran belum diinput', async () => {
    eventRepository.findById.mockResolvedValue({ id: 5 });
    eventKehadiranRepository.findByEventId.mockResolvedValue(null);
    const res = buildMockRes();

    await getKehadiran({ params: { id: '5' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Data kehadiran event belum diinput' });
  });

  it('500 untuk error tak terduga', async () => {
    eventRepository.findById.mockRejectedValue(new Error('DB down'));
    const res = buildMockRes();

    await getKehadiran({ params: { id: '5' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('event.controller — trigger skor real-time volunteer (Unit Test)', () => {
  const { EventError } = jest.requireActual('../../../../src/modules/event/event.service');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('assignVolunteer: setelah respons 201 terkirim, triggerSkorUpdate dipanggil untuk jemaat yang ditugaskan', async () => {
    const assignment = { id: 10, event_id: 5, jemaat_id: 3, jenis_id: 2, status: 'AKTIF' };
    eventService.assignVolunteer.mockResolvedValue(assignment);
    const res = buildMockRes();

    await assignVolunteer(
      { params: { id: '5' }, body: { jemaat_id: 3, jenis_id: 2 }, user: { userId: 7 } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(assignment);
    expect(scoringService.triggerSkorUpdate).toHaveBeenCalledWith([3], { actorUserId: 7 });

    // Trigger harus dipanggil SETELAH respons dikirim
    const jsonOrder = res.json.mock.invocationCallOrder[0];
    const triggerOrder = scoringService.triggerSkorUpdate.mock.invocationCallOrder[0];
    expect(triggerOrder).toBeGreaterThan(jsonOrder);
  });

  it('assignVolunteer: tidak memicu skor jika service melempar error', async () => {
    eventService.assignVolunteer.mockRejectedValue(new EventError('Kuota volunteer untuk jenis ini pada event tersebut sudah penuh', 409));
    const res = buildMockRes();

    await assignVolunteer(
      { params: { id: '5' }, body: { jemaat_id: 3, jenis_id: 2 }, user: { userId: 7 } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(scoringService.triggerSkorUpdate).not.toHaveBeenCalled();
  });

  it('replaceVolunteer: memicu skor untuk jemaat yang digantikan DAN penggantinya setelah respons', async () => {
    eventService.replaceVolunteer.mockResolvedValue({
      penugasan_lama: { id: 10, jemaat_id: 3, status: 'DIGANTIKAN' },
      penugasan_baru: { id: 11, jemaat_id: 8, status: 'AKTIF' },
    });
    const res = buildMockRes();

    await replaceVolunteer(
      {
        params: { id: '5', volunteerId: '10' },
        body: { replacement_timing: 'SEBELUM_EVENT', replaced_by: 8, alasan: 'Sakit' },
        user: { userId: 7 },
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(scoringService.triggerSkorUpdate).toHaveBeenCalledWith([3, 8], { actorUserId: 7 });

    const jsonOrder = res.json.mock.invocationCallOrder[0];
    const triggerOrder = scoringService.triggerSkorUpdate.mock.invocationCallOrder[0];
    expect(triggerOrder).toBeGreaterThan(jsonOrder);
  });

  it('cancelVolunteer: memicu skor untuk jemaat yang penugasannya dibatalkan setelah respons', async () => {
    eventService.cancelVolunteerAssignment.mockResolvedValue({
      id: 10, event_id: 5, jemaat_id: 3, status: 'DIBATALKAN',
    });
    const res = buildMockRes();

    await cancelVolunteer(
      { params: { id: '5', volunteerId: '10' }, user: { userId: 7 } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(scoringService.triggerSkorUpdate).toHaveBeenCalledWith([3], { actorUserId: 7 });

    const jsonOrder = res.json.mock.invocationCallOrder[0];
    const triggerOrder = scoringService.triggerSkorUpdate.mock.invocationCallOrder[0];
    expect(triggerOrder).toBeGreaterThan(jsonOrder);
  });

  it('cancelVolunteer: tidak memicu skor jika penugasan tidak ditemukan (404)', async () => {
    eventService.cancelVolunteerAssignment.mockRejectedValue(
      new EventError('Penugasan volunteer tidak ditemukan', 404)
    );
    const res = buildMockRes();

    await cancelVolunteer(
      { params: { id: '5', volunteerId: '999' }, user: { userId: 7 } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(scoringService.triggerSkorUpdate).not.toHaveBeenCalled();
  });
});
