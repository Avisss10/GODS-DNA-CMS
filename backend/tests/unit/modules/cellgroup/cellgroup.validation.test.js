const { validationResult } = require('express-validator');
const {
  addMemberValidation,
  createMeetingValidation,
  updateMeetingValidation,
  submitAbsensiValidation,
} = require('../../../../src/modules/cellgroup/cellgroup.validation');

/**
 * Jalankan kumpulan rule express-validator terhadap body tiruan dan
 * kembalikan array pesan error (kosong = lolos validasi).
 */
async function runValidation(rules, body) {
  const req = { body, params: {}, query: {}, cookies: {}, headers: {} };
  await Promise.all(rules.map((rule) => rule.run(req)));
  return validationResult(req).array().map((e) => e.msg);
}

describe('cellgroup.validation — addMemberValidation (Unit Test)', () => {
  it('lolos untuk jemaatId integer positif', async () => {
    expect(await runValidation(addMemberValidation, { jemaatId: 5 })).toHaveLength(0);
  });

  it.each([
    [{}, 'tanpa jemaatId'],
    [{ jemaatId: 'abc' }, 'bukan angka'],
    [{ jemaatId: 0 }, 'nol'],
    [{ jemaatId: -3 }, 'negatif'],
    [{ jemaatId: 1.5 }, 'pecahan'],
  ])('gagal untuk %j (%s)', async (body) => {
    const errors = await runValidation(addMemberValidation, body);
    expect(errors).toContain('jemaatId wajib berupa integer positif');
  });
});

describe('cellgroup.validation — createMeetingValidation (Unit Test)', () => {
  const validBody = {
    judul: 'Meeting A',
    jenis: 'OFFLINE',
    waktuMulai: '2026-06-20 19:00:00',
    waktuSelesai: '2026-06-20 21:00:00',
  };

  it('lolos untuk body lengkap dan valid', async () => {
    expect(await runValidation(createMeetingValidation, validBody)).toHaveLength(0);
  });

  it('lolos dengan catatan opsional', async () => {
    expect(await runValidation(createMeetingValidation, { ...validBody, catatan: 'ok' })).toHaveLength(0);
  });

  it('gagal jika judul kosong', async () => {
    const errors = await runValidation(createMeetingValidation, { ...validBody, judul: '' });
    expect(errors).toContain('judul wajib diisi');
  });

  it('gagal jika jenis di luar ONLINE/OFFLINE', async () => {
    const errors = await runValidation(createMeetingValidation, { ...validBody, jenis: 'HYBRID' });
    expect(errors).toContain('jenis harus ONLINE atau OFFLINE');
  });

  it('gagal jika waktuMulai tidak dikirim', async () => {
    const { waktuMulai, ...body } = validBody;
    const errors = await runValidation(createMeetingValidation, body);
    expect(errors).toContain('waktuMulai wajib diisi');
  });

  it('gagal jika waktuSelesai bukan tanggal valid', async () => {
    const errors = await runValidation(createMeetingValidation, { ...validBody, waktuSelesai: 'bukan-tanggal' });
    expect(errors).toContain('waktuSelesai harus tanggal/waktu yang valid');
  });
});

describe('cellgroup.validation — updateMeetingValidation (Unit Test)', () => {
  it('lolos untuk update parsial yang valid (snake_case)', async () => {
    expect(await runValidation(updateMeetingValidation, { judul: 'Baru' })).toHaveLength(0);
    expect(await runValidation(updateMeetingValidation, { waktu_mulai: '2026-06-21 19:00:00' })).toHaveLength(0);
  });

  it('lolos untuk body kosong (minimal 1 field ditangani service, bukan validator)', async () => {
    expect(await runValidation(updateMeetingValidation, {})).toHaveLength(0);
  });

  it('gagal jika waktu_mulai bukan tanggal valid', async () => {
    const errors = await runValidation(updateMeetingValidation, { waktu_mulai: 'kapan-kapan' });
    expect(errors).toContain('waktu_mulai harus tanggal/waktu yang valid');
  });

  it('gagal jika jenis di luar enum', async () => {
    const errors = await runValidation(updateMeetingValidation, { jenis: 'CAMPUR' });
    expect(errors).toContain('jenis harus ONLINE atau OFFLINE');
  });
});

describe('cellgroup.validation — submitAbsensiValidation (Unit Test)', () => {
  it('lolos untuk array absensi valid', async () => {
    const errors = await runValidation(submitAbsensiValidation, {
      absensi: [{ jemaatId: 1, hadir: true }, { jemaatId: 2, hadir: false }],
    });
    expect(errors).toHaveLength(0);
  });

  it('gagal jika absensi tidak dikirim / bukan array / kosong', async () => {
    for (const body of [{}, { absensi: 'x' }, { absensi: [] }]) {
      const errors = await runValidation(submitAbsensiValidation, body);
      expect(errors).toContain('absensi wajib berupa array minimal 1 entri');
    }
  });

  it('gagal jika ada entri tanpa jemaatId integer', async () => {
    const errors = await runValidation(submitAbsensiValidation, {
      absensi: [{ jemaatId: 'abc', hadir: true }],
    });
    expect(errors).toContain('jemaatId tiap entri absensi wajib integer positif');
  });

  it('gagal jika status hadir bukan boolean', async () => {
    const errors = await runValidation(submitAbsensiValidation, {
      absensi: [{ jemaatId: 1, hadir: 'ya' }],
    });
    expect(errors).toContain('hadir tiap entri absensi wajib boolean');
  });
});
