const { hashPhone } = require('../../../src/utils/hash.util');

describe('hash.util — hashPhone (Unit Test)', () => {
  it('harus deterministik: input sama menghasilkan hash sama', () => {
    expect(hashPhone('081234567890')).toBe(hashPhone('081234567890'));
  });

  it('harus mengembalikan SHA-256 hex sepanjang 64 karakter', () => {
    const h = hashPhone('081234567890');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('harus menormalkan variasi format ke hash yang sama (buang non-digit & spasi)', () => {
    const base = hashPhone('081234567890');
    expect(hashPhone('0812-3456-7890')).toBe(base);
    expect(hashPhone(' 0812 3456 7890 ')).toBe(base);
  });

  it('nomor berbeda harus menghasilkan hash berbeda', () => {
    expect(hashPhone('081234567890')).not.toBe(hashPhone('089999999999'));
  });
});
