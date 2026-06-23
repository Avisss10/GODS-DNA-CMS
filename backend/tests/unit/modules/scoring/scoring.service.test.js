jest.mock('../../../../src/modules/scoring/scoring.repository');
jest.mock('../../../../src/modules/auditlog/auditlog.repository');

const scoringRepository = require('../../../../src/modules/scoring/scoring.repository');
const { recordAuditLog } = require('../../../../src/modules/auditlog/auditlog.repository');

const {
  hitungStatusKeaktifan,
  terapkanAntiCliff,
  hitungNilaiCG,
  hitungNilaiEvent,
  hitungSkorJemaat,
  runScoringBatch,
} = require('../../../../src/modules/scoring/scoring.service');

beforeEach(() => {
  jest.clearAllMocks();
  recordAuditLog.mockResolvedValue(1);
});

// ── hitungStatusKeaktifan ─────────────────────────────────────────
describe('scoring.service — hitungStatusKeaktifan (Unit Test)', () => {
  it('skor >= 60 → AKTIF', () => {
    expect(hitungStatusKeaktifan(60)).toBe('AKTIF');
    expect(hitungStatusKeaktifan(100)).toBe('AKTIF');
  });

  it('skor 30-59 → KURANG_AKTIF', () => {
    expect(hitungStatusKeaktifan(30)).toBe('KURANG_AKTIF');
    expect(hitungStatusKeaktifan(59)).toBe('KURANG_AKTIF');
  });

  it('skor < 30 → TIDAK_AKTIF', () => {
    expect(hitungStatusKeaktifan(0)).toBe('TIDAK_AKTIF');
    expect(hitungStatusKeaktifan(29)).toBe('TIDAK_AKTIF');
  });
});

// ── terapkanAntiCliff ─────────────────────────────────────────────
describe('scoring.service — terapkanAntiCliff (Unit Test)', () => {
  it('kenaikan lebih dari 15 harus dibatasi +15', () => {
    expect(terapkanAntiCliff(50, 85)).toBe(65);
  });

  it('penurunan lebih dari 15 harus dibatasi -15', () => {
    expect(terapkanAntiCliff(50, 20)).toBe(35);
  });

  it('perubahan dalam ±15 harus tidak diubah', () => {
    expect(terapkanAntiCliff(50, 60)).toBe(60);
    expect(terapkanAntiCliff(50, 40)).toBe(40);
  });

  it('tidak ada perubahan skor = tetap sama', () => {
    expect(terapkanAntiCliff(70, 70)).toBe(70);
  });
});

// ── hitungNilaiCG ─────────────────────────────────────────────────
describe('scoring.service — hitungNilaiCG (Unit Test)', () => {
  it('hadir semua meeting → 100', () => {
    expect(hitungNilaiCG({ total_meeting: 4, total_hadir: 4 })).toBe(100);
  });

  it('hadir setengah meeting → 50', () => {
    expect(hitungNilaiCG({ total_meeting: 4, total_hadir: 2 })).toBe(50);
  });

  it('tidak ada meeting → 0', () => {
    expect(hitungNilaiCG({ total_meeting: 0, total_hadir: 0 })).toBe(0);
  });

  it('tidak pernah hadir → 0', () => {
    expect(hitungNilaiCG({ total_meeting: 4, total_hadir: 0 })).toBe(0);
  });
});

// ── hitungNilaiEvent ──────────────────────────────────────────────
describe('scoring.service — hitungNilaiEvent (Unit Test)', () => {
  it('bertugas di semua event → mendekati 100', () => {
    const assignments = [
      { event_id: 1, status: 'AKTIF', durasi_menit: null },
      { event_id: 2, status: 'AKTIF', durasi_menit: null },
    ];
    const result = hitungNilaiEvent(assignments, [], 2);
    expect(result).toBeCloseTo(100, 1);
  });

  it('tidak hadir sama sekali → 0', () => {
    expect(hitungNilaiEvent([], [], 4)).toBe(0);
  });

  it('tidak ada event referensi → 0', () => {
    expect(hitungNilaiEvent([], [], 0)).toBe(0);
  });

  it('hadir biasa (bukan bertugas) → poin lebih rendah dari bertugas', () => {
    const assignments = [{ event_id: 1, status: 'AKTIF', durasi_menit: null }];
    const attendances = [{ event_id: 2 }];
    const nilaiDenganBertugas = hitungNilaiEvent(assignments, [], 2);
    const nilaiHadirBiasa = hitungNilaiEvent([], attendances, 2);
    expect(nilaiDenganBertugas).toBeGreaterThan(nilaiHadirBiasa);
  });

  it('BERTUGAS_PARSIAL harus proporsional (60 menit dari 120 = 50% × 1.5)', () => {
    const assignments = [{ event_id: 1, status: 'BERTUGAS_PARSIAL', durasi_menit: 60 }];
    const result = hitungNilaiEvent(assignments, [], 1);
    // Poin = (60/120) × 1.5 = 0.75; maxPoin = 1.5; nilai = 0.75/1.5 × 100 = 50
    expect(result).toBeCloseTo(50, 1);
  });

  it('event_id yang sama tidak dihitung dua kali', () => {
    const assignments = [{ event_id: 1, status: 'AKTIF', durasi_menit: null }];
    const attendances = [{ event_id: 1 }]; // sama dengan assignment
    const result = hitungNilaiEvent(assignments, attendances, 1);
    expect(result).toBeCloseTo(100, 1); // tetap 1.5/1.5 × 100
  });
});

// ── hitungSkorJemaat ──────────────────────────────────────────────
describe('scoring.service — hitungSkorJemaat (Unit Test)', () => {
  it('jemaat ber-CG: formula CG 60% + Event 40%', async () => {
    scoringRepository.isActiveCGMember.mockResolvedValue(true);
    scoringRepository.getRecentEvents.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    scoringRepository.getVolunteerAssignments.mockResolvedValue([]);
    scoringRepository.getEventAttendances.mockResolvedValue([]);
    scoringRepository.getCGAttendanceSummary.mockResolvedValue({
      total_meeting: 4, total_hadir: 4,
    });

    const { skorBaru } = await hitungSkorJemaat(1, { skor_keaktifan: 0, is_non_cg: false });

    // NilaiCG = 100, NilaiEvent = 0 → skor = 100×0.6 + 0×0.4 = 60
    // Anti-cliff: naik dari 0, max +15 → skorBaru = 15
    expect(skorBaru).toBe(15);
  });

  it('jemaat non-CG: formula Event 100%', async () => {
    scoringRepository.isActiveCGMember.mockResolvedValue(false);
    scoringRepository.getRecentEvents.mockResolvedValue([{ id: 1 }]);
    scoringRepository.getVolunteerAssignments.mockResolvedValue([
      { event_id: 1, status: 'AKTIF', durasi_menit: null },
    ]);
    scoringRepository.getEventAttendances.mockResolvedValue([]);

    const { skorBaru, isNonCg } = await hitungSkorJemaat(1, { skor_keaktifan: 0, is_non_cg: true });

    expect(isNonCg).toBe(true);
    // NilaiEvent = 100 → skor = 100 → anti-cliff dari 0 = +15
    expect(skorBaru).toBe(15);
  });

  it('anti-cliff diterapkan dengan benar saat skor sudah tinggi', async () => {
    scoringRepository.isActiveCGMember.mockResolvedValue(false);
    scoringRepository.getRecentEvents.mockResolvedValue([]);
    scoringRepository.getVolunteerAssignments.mockResolvedValue([]);
    scoringRepository.getEventAttendances.mockResolvedValue([]);

    // Skor lama 80, skor mentah baru = 0, anti-cliff → max turun -15 = 65
    const { skorBaru } = await hitungSkorJemaat(1, { skor_keaktifan: 80, is_non_cg: true });
    expect(skorBaru).toBe(65);
  });
});

// ── runScoringBatch ───────────────────────────────────────────────
describe('scoring.service — runScoringBatch (Unit Test)', () => {
  it('harus memproses semua jemaat yang memenuhi syarat', async () => {
    scoringRepository.getJemaatForScoring.mockResolvedValue([
      { id: 1, skor_keaktifan: 50, status_keaktifan: 'AKTIF', is_non_cg: false },
      { id: 2, skor_keaktifan: 30, status_keaktifan: 'KURANG_AKTIF', is_non_cg: true },
    ]);
    scoringRepository.isActiveCGMember.mockResolvedValue(false);
    scoringRepository.getRecentEvents.mockResolvedValue([]);
    scoringRepository.getVolunteerAssignments.mockResolvedValue([]);
    scoringRepository.getEventAttendances.mockResolvedValue([]);
    scoringRepository.updateSkor.mockResolvedValue();

    const result = await runScoringBatch({ actorUserId: null });

    expect(result.processed).toBe(2);
    expect(result.skipped).toBe(0);
    expect(scoringRepository.updateSkor).toHaveBeenCalledTimes(2);
    expect(recordAuditLog).toHaveBeenCalledTimes(2);
  });

  it('harus menghitung skipped jika ada error pada satu jemaat', async () => {
    scoringRepository.getJemaatForScoring.mockResolvedValue([
      { id: 1, skor_keaktifan: 50, status_keaktifan: 'AKTIF', is_non_cg: false },
    ]);
    scoringRepository.isActiveCGMember.mockRejectedValue(new Error('DB error'));

    const result = await runScoringBatch();

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('harus return { processed: 0, skipped: 0 } jika tidak ada jemaat', async () => {
    scoringRepository.getJemaatForScoring.mockResolvedValue([]);

    const result = await runScoringBatch();
    expect(result).toEqual({ processed: 0, skipped: 0 });
  });
});