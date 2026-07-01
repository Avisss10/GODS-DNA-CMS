const request = require('supertest');

describe('CORS whitelist — HTTP Test (Express app)', () => {
  const ORIGINAL = process.env.ALLOWED_ORIGINS;
  let app;

  beforeAll(() => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:5173,https://app.example.com';
    jest.resetModules();
    app = require('../../../src/app');
  });

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = ORIGINAL;
  });

  it('harus mengembalikan Access-Control-Allow-Origin untuk origin di whitelist', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('TIDAK boleh mengembalikan Access-Control-Allow-Origin untuk origin asing', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('harus tetap melayani request tanpa header Origin (server-to-server)', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
