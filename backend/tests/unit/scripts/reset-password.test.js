const { verifyRecoveryCode } = require('../../../src/scripts/reset-password');
const { generateRecoveryCode, hashRecoveryCode } = require('../../../src/scripts/generate-recovery-code');

describe('reset-password — verifyRecoveryCode (Unit Test)', () => {
  it('menolak jika RECOVERY_CODE_HASH kosong/belum diset', () => {
    const result = verifyRecoveryCode('APAPUN', undefined);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('RECOVERY_CODE_HASH');
  });

  it('menolak jika recovery code tidak diisi', () => {
    const hash = hashRecoveryCode('KODE-BENAR');
    const result = verifyRecoveryCode('', hash);

    expect(result.valid).toBe(false);
  });

  it('menolak jika hash tidak cocok', () => {
    const hash = hashRecoveryCode('KODE-BENAR');
    const result = verifyRecoveryCode('KODE-SALAH', hash);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Recovery code salah.');
  });

  it('menerima recovery code yang cocok (mekanisme hash sama dengan generate-recovery-code)', () => {
    const code = generateRecoveryCode();
    const hash = hashRecoveryCode(code);

    expect(verifyRecoveryCode(code, hash)).toEqual({ valid: true });
  });

  it('mentoleransi whitespace di sekitar input', () => {
    const code = generateRecoveryCode();
    const hash = hashRecoveryCode(code);

    expect(verifyRecoveryCode(`  ${code}  `, hash).valid).toBe(true);
  });
});
