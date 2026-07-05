jest.mock('../../../../src/modules/event/event.repository');
jest.mock('../../../../src/modules/event/event-kehadiran.repository');

const eventRepository = require('../../../../src/modules/event/event.repository');
const eventKehadiranRepository = require('../../../../src/modules/event/event-kehadiran.repository');
const { getKehadiran } = require('../../../../src/modules/event/event.controller');

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
