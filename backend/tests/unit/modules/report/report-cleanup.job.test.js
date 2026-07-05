jest.mock('fs');

const fs = require('fs');
const {
  cleanupExpiredReportFiles,
  startReportCleanupJob,
  stopReportCleanupJob,
  MAX_FILE_AGE_MS,
  CLEANUP_INTERVAL_MS,
} = require('../../../../src/modules/report/report-cleanup.job');

describe('report-cleanup.job — hapus file laporan kedaluwarsa (Unit Test)', () => {
  const NOW = new Date('2026-07-05T12:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    stopReportCleanupJob();
  });

  function mockFile(ageMs) {
    return { isFile: () => true, mtimeMs: NOW.getTime() - ageMs };
  }

  it('menghapus file berumur > 30 menit, membiarkan yang lebih muda', () => {
    fs.readdirSync.mockReturnValue(['tua.xlsx', 'muda.pdf']);
    fs.statSync.mockImplementation((p) =>
      p.includes('tua') ? mockFile(45 * 60 * 1000) : mockFile(10 * 60 * 1000)
    );

    const deleted = cleanupExpiredReportFiles(NOW);

    expect(deleted).toBe(1);
    expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('tua.xlsx'));
  });

  it('melewati .gitkeep dan direktori', () => {
    fs.readdirSync.mockReturnValue(['.gitkeep', 'sub-dir']);
    fs.statSync.mockReturnValue({ isFile: () => false, mtimeMs: 0 });

    const deleted = cleanupExpiredReportFiles(NOW);

    expect(deleted).toBe(0);
    expect(fs.unlinkSync).not.toHaveBeenCalled();
    // .gitkeep tidak boleh sampai di-stat
    expect(fs.statSync).toHaveBeenCalledTimes(1);
  });

  it('return 0 jika folder reports belum ada', () => {
    fs.existsSync.mockReturnValue(false);

    expect(cleanupExpiredReportFiles(NOW)).toBe(0);
    expect(fs.readdirSync).not.toHaveBeenCalled();
  });

  it('error stat/unlink satu file tidak menggagalkan siklus (file lain tetap dihapus)', () => {
    fs.readdirSync.mockReturnValue(['rusak.xlsx', 'tua.pdf']);
    fs.statSync.mockImplementation((p) => {
      if (p.includes('rusak')) throw new Error('EPERM');
      return mockFile(MAX_FILE_AGE_MS + 1000);
    });

    const deleted = cleanupExpiredReportFiles(NOW);

    expect(deleted).toBe(1);
  });

  it('startReportCleanupJob memasang interval 1 jam dan idempotent', () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(global, 'setInterval');

    startReportCleanupJob();
    startReportCleanupJob();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.any(Function), CLEANUP_INTERVAL_MS);

    stopReportCleanupJob();
    spy.mockRestore();
    jest.useRealTimers();
  });
});
