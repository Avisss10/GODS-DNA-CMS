jest.mock('../../../src/modules/scoring/scoring.service');
jest.mock('../../../src/modules/notification/notification.stub');

const { runScoringBatch } = require('../../../src/modules/scoring/scoring.service');
const { notifyLeaders } = require('../../../src/modules/notification/notification.stub');
const {
  msUntilNextRun,
  runScheduledScoring,
  startScoringCron,
  stopScoringCron,
} = require('../../../src/scripts/scoring-cron');

describe('scoring-cron — scheduler internal scoring malam (Unit Test)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runScoringBatch.mockResolvedValue({ processed: 10, skipped: 2 });
    notifyLeaders.mockResolvedValue(undefined);
  });

  afterEach(() => {
    stopScoringCron();
  });

  describe('msUntilNextRun', () => {
    it('sebelum jam 02:00 → jadwal ke 02:00 hari yang sama', () => {
      const now = new Date('2026-07-05T01:00:00');
      expect(msUntilNextRun(now)).toBe(60 * 60 * 1000); // 1 jam
    });

    it('setelah jam 02:00 → jadwal ke 02:00 besok', () => {
      const now = new Date('2026-07-05T03:00:00');
      expect(msUntilNextRun(now)).toBe(23 * 60 * 60 * 1000); // 23 jam
    });

    it('tepat 02:00 → jadwal ke 02:00 besok (bukan 0)', () => {
      const now = new Date('2026-07-05T02:00:00');
      expect(msUntilNextRun(now)).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('runScheduledScoring', () => {
    it('menjalankan runScoringBatch dan mengirim notifikasi SCORING_SELESAI', async () => {
      const result = await runScheduledScoring();

      expect(runScoringBatch).toHaveBeenCalledWith({ actorUserId: null });
      expect(notifyLeaders).toHaveBeenCalledWith(
        expect.objectContaining({ jenis: 'SCORING_SELESAI' })
      );
      expect(result).toEqual({ processed: 10, skipped: 2 });
    });

    it('guard anti dobel-jalan: siklus kedua dilewati selama run pertama belum selesai', async () => {
      let resolveFirst;
      runScoringBatch.mockImplementationOnce(
        () => new Promise((resolve) => { resolveFirst = resolve; })
      );

      const first = runScheduledScoring();
      const second = await runScheduledScoring();

      expect(second).toBeNull();
      expect(runScoringBatch).toHaveBeenCalledTimes(1);

      resolveFirst({ processed: 1, skipped: 0 });
      await expect(first).resolves.toEqual({ processed: 1, skipped: 0 });
    });

    it('tidak melempar error jika scoring gagal (return null, guard dilepas)', async () => {
      runScoringBatch.mockRejectedValueOnce(new Error('DB down'));

      await expect(runScheduledScoring()).resolves.toBeNull();

      // Guard harus sudah dilepas: run berikutnya jalan normal
      const retry = await runScheduledScoring();
      expect(retry).toEqual({ processed: 10, skipped: 2 });
    });
  });

  describe('startScoringCron', () => {
    it('idempotent: dipanggil dua kali tidak membuat timer ganda', () => {
      jest.useFakeTimers();
      const spy = jest.spyOn(global, 'setTimeout');

      startScoringCron();
      const callsAfterFirst = spy.mock.calls.length;
      startScoringCron();

      expect(spy.mock.calls.length).toBe(callsAfterFirst);

      stopScoringCron();
      spy.mockRestore();
      jest.useRealTimers();
    });
  });
});
