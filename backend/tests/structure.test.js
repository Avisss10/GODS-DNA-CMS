const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const expectedDirs = [
  'src',
  'src/config',
  'src/modules',
  'src/modules/auth',
  'src/modules/jemaat',
  'src/modules/cellgroup',
  'src/modules/volunteer',
  'src/modules/event',
  'src/modules/scoring',
  'src/modules/auditlog',
  'src/modules/report',
  'src/modules/notification',
  'src/modules/health',
  'src/middlewares',
  'src/utils',
  'src/database',
  'src/database/migrations',
  'src/database/seeds',
  'tests/unit',
  'tests/integration',
  'tests/http',
];

describe('Backend Folder Structure', () => {
  expectedDirs.forEach((dir) => {
    it(`folder "${dir}" harus ada`, () => {
      const fullPath = path.join(ROOT, dir);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.statSync(fullPath).isDirectory()).toBe(true);
    });
  });

  it('src/app.js harus ada', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/app.js'))).toBe(true);
  });

  it('src/server.js harus ada', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/server.js'))).toBe(true);
  });
});