jest.mock('../../src/app', () => ({ listen: jest.fn() }));
jest.mock('../../src/config/database', () => ({
  testConnection: jest.fn().mockResolvedValue(true),
  closePool: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/config/redis', () => ({
  testRedisConnection: jest.fn().mockResolvedValue(true),
  closeRedis: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/config/validate-env', () => ({ validateEnv: jest.fn() }));
jest.mock('../../src/scripts/scoring-cron', () => ({
  startScoringCron: jest.fn(),
  stopScoringCron: jest.fn(),
}));
jest.mock('../../src/modules/report/report-cleanup.job', () => ({
  startReportCleanupJob: jest.fn(),
  stopReportCleanupJob: jest.fn(),
}));

const app = require('../../src/app');
const { stopScoringCron } = require('../../src/scripts/scoring-cron');
const { stopReportCleanupJob } = require('../../src/modules/report/report-cleanup.job');
const { closePool } = require('../../src/config/database');
const { closeRedis } = require('../../src/config/redis');
const { bootstrap } = require('../../src/server');

describe('server.js — graceful shutdown dengan timeout paksa 10 detik (Unit Test)', () => {
  let exitSpy;
  let fakeServer;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    fakeServer = { close: jest.fn() };
    app.listen.mockReturnValue(fakeServer);
  });

  afterEach(() => {
    // Bersihkan handler SIGINT/SIGTERM yang didaftarkan bootstrap agar
    // tidak menumpuk antar test.
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    exitSpy.mockRestore();
    jest.useRealTimers();
  });

  async function triggerShutdown() {
    await bootstrap();
    process.emit('SIGTERM');
    // Beri kesempatan handler async berjalan sampai titik server.close
    await Promise.resolve();
  }

  it('shutdown normal: server.close selesai → tutup pool & redis → exit(0)', async () => {
    fakeServer.close.mockImplementation((cb) => cb());

    await triggerShutdown();
    // flush microtask closePool/closeRedis
    await Promise.resolve();
    await Promise.resolve();

    expect(stopScoringCron).toHaveBeenCalled();
    expect(stopReportCleanupJob).toHaveBeenCalled();
    expect(closePool).toHaveBeenCalled();
    expect(closeRedis).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('shutdown menggantung: server.close tidak pernah selesai → exit(1) setelah 10 detik', async () => {
    fakeServer.close.mockImplementation(() => {}); // callback tidak pernah dipanggil

    await triggerShutdown();

    expect(exitSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(10_000);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('sebelum 10 detik belum ada exit paksa', async () => {
    fakeServer.close.mockImplementation(() => {});

    await triggerShutdown();
    jest.advanceTimersByTime(9_999);

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
