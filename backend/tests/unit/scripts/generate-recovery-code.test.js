const {
  generateRecoveryCode,
  hashRecoveryCode,
} = require('../../../src/scripts/generate-recovery-code');

describe('generate-recovery-code — generateRecoveryCode (Unit Test)', () => {
  it('harus menghasilkan kode dengan format XXXX-XXXX-XXXX-XXXX', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('tidak boleh mengandung karakter ambigu (0, O, 1, I)', () => {
    const code = generateRecoveryCode();
    expect(code).not.toMatch(/[01OI]/);
  });

  it('harus menghasilkan kode berbeda setiap dipanggil (acak)', () => {
    const codeA = generateRecoveryCode();
    const codeB = generateRecoveryCode();
    expect(codeA).not.toBe(codeB);
  });
});

describe('generate-recovery-code — hashRecoveryCode (Unit Test)', () => {
  it('harus menghasilkan hash SHA-256 dalam format hex 64 karakter', () => {
    const hash = hashRecoveryCode('TEST-CODE-1234-ABCD');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('harus menghasilkan hash yang sama untuk input yang sama (deterministik)', () => {
    const hashA = hashRecoveryCode('SAME-CODE-0000-WXYZ');
    const hashB = hashRecoveryCode('SAME-CODE-0000-WXYZ');
    expect(hashA).toBe(hashB);
  });

  it('harus menghasilkan hash berbeda untuk input berbeda', () => {
    const hashA = hashRecoveryCode('CODE-AAAA-1111-BBBB');
    const hashB = hashRecoveryCode('CODE-CCCC-2222-DDDD');
    expect(hashA).not.toBe(hashB);
  });
});