jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
}));

const { validationResult } = require('express-validator');
const { handleValidationErrors } = require('../../../src/middlewares/validation.middleware');

describe('validation.middleware — handleValidationErrors (Unit Test)', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('harus memanggil next() jika tidak ada error validasi', () => {
    validationResult.mockReturnValue({ isEmpty: () => true, array: () => [] });

    handleValidationErrors(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('harus mengembalikan 400 dengan { message: errors[0].msg } jika ada error (kontrak tidak berubah)', () => {
    validationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: 'Field wajib belum diisi: nama' }, { msg: 'yang lain' }],
    });

    handleValidationErrors(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Field wajib belum diisi: nama' });
    expect(next).not.toHaveBeenCalled();
  });
});
