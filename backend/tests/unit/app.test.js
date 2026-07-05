const request = require('supertest');

describe('app.js — trust proxy & rate limiting (Unit Test)', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.resetModules();
  });

  // Timeout longgar: setelah jest.resetModules(), require('src/app')
  // memuat ulang seluruh module graph (sharp/exceljs/pdfkit berat)
  // dan bisa melewati default 5 detik saat mesin sibuk.
  it('harus menyetel trust proxy = 1 agar req.ip dan secure cookie benar di belakang reverse proxy', () => {
    const app = require('../../src/app');
    expect(app.get('trust proxy')).toBe(1);
  }, 15000);

  it('tidak memasang rate limiter saat NODE_ENV=test (header RateLimit tidak ada)', async () => {
    const app = require('../../src/app');
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.headers['ratelimit-limit']).toBeUndefined();
  }, 15000);

  it('memasang rate limiter di luar test: /api/auth/login dibatasi 20 request / 15 menit', async () => {
    process.env.NODE_ENV = 'development';
    jest.resetModules();
    const app = require('../../src/app');

    let lastRes;
    // 20 request pertama lolos limiter (ditolak validasi body → 400),
    // request ke-21 harus 429 dari limiter ketat.
    for (let i = 0; i < 21; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      lastRes = await request(app).post('/api/auth/login').send({});
    }

    expect(lastRes.status).toBe(429);
    expect(lastRes.body.message).toBe('Terlalu banyak percobaan, coba lagi nanti');
  }, 30000);

  it('memasang limiter umum /api dengan batas 300 (header standardHeaders terlihat)', async () => {
    process.env.NODE_ENV = 'development';
    jest.resetModules();
    const app = require('../../src/app');

    const res = await request(app).get('/api/tidak-ada');
    expect(res.headers['ratelimit-limit']).toBeDefined();
  }, 15000);

  function hasMorganLayer(app) {
    // Middleware morgan bernama "logger" di router stack Express
    const stack = (app.router && app.router.stack) || app._router.stack;
    return stack.some((layer) => layer.name === 'logger');
  }

  it('memasang morgan di luar test (middleware "logger" ada di stack)', () => {
    process.env.NODE_ENV = 'development';
    jest.resetModules();
    const app = require('../../src/app');

    expect(hasMorganLayer(app)).toBe(true);
  }, 15000);

  it('tidak memasang morgan saat NODE_ENV=test (output jest bersih)', () => {
    const app = require('../../src/app');

    expect(hasMorganLayer(app)).toBe(false);
  }, 15000);
});
