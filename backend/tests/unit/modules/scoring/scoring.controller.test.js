jest.mock('../../../../src/modules/scoring/scoring.service');
jest.mock('../../../../src/modules/notification/notification.stub');

const { runScoringBatch } = require('../../../../src/modules/scoring/scoring.service');
const { notifyLeaders } = require('../../../../src/modules/notification/notification.stub');
const { runScoring } = require('../../../../src/modules/scoring/scoring.controller');

function buildMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('scoring.controller — POST /api/scoring/run (Unit Test)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notifyLeaders.mockResolvedValue(undefined);
  });

  it('200: memanggil runScoringBatch dengan actorUserId, kirim notifikasi, kembalikan ringkasan', async () => {
    runScoringBatch.mockResolvedValue({ processed: 25, skipped: 3 });
    const res = buildMockRes();

    await runScoring({ user: { userId: 7, peran: 'LEADER' } }, res);

    expect(runScoringBatch).toHaveBeenCalledWith({ actorUserId: 7 });
    expect(notifyLeaders).toHaveBeenCalledWith(
      expect.objectContaining({ jenis: 'SCORING_SELESAI' })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Scoring selesai',
      processed: 25,
      skipped: 3,
    });
  });

  it('500: error tak terduga dibalas pesan generik', async () => {
    runScoringBatch.mockRejectedValue(new Error('DB down'));
    const res = buildMockRes();

    await runScoring({ user: { userId: 7 } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan pada server' });
  });
});
