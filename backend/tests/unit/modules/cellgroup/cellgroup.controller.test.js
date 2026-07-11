jest.mock('../../../../src/modules/scoring/scoring.service');
jest.mock('../../../../src/modules/cellgroup/cellgroup.service', () => {
  const actual = jest.requireActual('../../../../src/modules/cellgroup/cellgroup.service');
  return {
    ...actual,
    submitAbsensi: jest.fn(),
  };
});

const cgService = require('../../../../src/modules/cellgroup/cellgroup.service');
const scoringService = require('../../../../src/modules/scoring/scoring.service');
const { submitAbsensi } = require('../../../../src/modules/cellgroup/cellgroup.controller');
const { CellGroupError } = jest.requireActual('../../../../src/modules/cellgroup/cellgroup.service');

function buildMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('cellgroup.controller — submitAbsensi + trigger skor real-time (Unit Test)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('200: menyimpan absensi lalu memicu triggerSkorUpdate untuk SETIAP jemaat yang diabsen', async () => {
    cgService.submitAbsensi.mockResolvedValue();
    const absensi = [
      { jemaatId: 1, hadir: true },
      { jemaatId: 2, hadir: false },
    ];
    const res = buildMockRes();

    await submitAbsensi(
      { params: { meetingId: '9' }, body: { absensi }, user: { userId: 7, peran: 'LEADER' } },
      res
    );

    expect(cgService.submitAbsensi).toHaveBeenCalledWith(9, absensi, { actorUserId: 7, actorRole: 'LEADER' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(scoringService.triggerSkorUpdate).toHaveBeenCalledWith([1, 2], { actorUserId: 7 });

    // Trigger harus dipanggil SETELAH respons dikirim
    const jsonOrder = res.json.mock.invocationCallOrder[0];
    const triggerOrder = scoringService.triggerSkorUpdate.mock.invocationCallOrder[0];
    expect(triggerOrder).toBeGreaterThan(jsonOrder);
  });

  it('404: tidak memicu skor jika meeting tidak ditemukan', async () => {
    cgService.submitAbsensi.mockRejectedValue(new CellGroupError('Meeting tidak ditemukan', 404));
    const res = buildMockRes();

    await submitAbsensi(
      { params: { meetingId: '999' }, body: { absensi: [{ jemaatId: 1, hadir: true }] }, user: { userId: 7 } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(scoringService.triggerSkorUpdate).not.toHaveBeenCalled();
  });
});
