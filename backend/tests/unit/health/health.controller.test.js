const { checkHealth } = require('../../../src/modules/health/health.controller');

describe('Health Controller - Unit Test', () => {
  it('checkHealth harus mengembalikan status 200 dan status OK', () => {
    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    checkHealth(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'OK',
        service: 'gods-dna-cms-backend',
      })
    );
  });

  it('response harus menyertakan field timestamp berformat ISO string valid', () => {
    const req = {};
    let captured;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn((body) => {
        captured = body;
        return res;
      }),
    };

    checkHealth(req, res);

    expect(typeof captured.timestamp).toBe('string');
    expect(new Date(captured.timestamp).toString()).not.toBe('Invalid Date');
  });
});