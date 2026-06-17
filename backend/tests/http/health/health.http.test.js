const request = require('supertest');
const { startServer } = require('../../../src/server');

describe('Health Endpoint - REST HTTP Test (server aktif)', () => {
  let server;

  beforeAll((done) => {
    server = startServer(0); // port 0 = pilih port bebas otomatis
    server.on('listening', done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('GET /health melalui server aktif harus mengembalikan 200', async () => {
    const res = await request(server).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});