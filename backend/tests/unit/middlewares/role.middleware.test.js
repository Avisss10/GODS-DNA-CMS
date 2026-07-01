const { requireRole } = require('../../../src/middlewares/role.middleware');

describe('role.middleware — requireRole (Unit Test, single source of truth)', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('harus 403 jika req.user belum di-attach (tidak ada peran)', () => {
    const middleware = requireRole('LEADER');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('harus 403 jika peran user tidak termasuk allowedRoles', () => {
    req.user = { userId: 1, peran: 'ADMIN' };
    const middleware = requireRole('LEADER');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('harus panggil next() jika peran user termasuk allowedRoles', () => {
    req.user = { userId: 1, peran: 'LEADER' };
    const middleware = requireRole('LEADER', 'ADMIN');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('harus jatuh ke fallback req.user.role jika peran tidak ada (peran ?? role)', () => {
    req.user = { userId: 1, role: 'LEADER' };
    const middleware = requireRole('LEADER');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
