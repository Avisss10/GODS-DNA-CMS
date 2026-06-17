const request = require('supertest');
const app = require('../../../src/app');

describe('Health Endpoint - Integration Test (Express app)', () => {
  it('GET /health harus mengembalikan 200 dan status OK', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body.service).toBe('gods-dna-cms-backend');
  });

  it('GET /health harus mengembalikan content-type application/json', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['content-type']).toMatch(/json/);
  });
});