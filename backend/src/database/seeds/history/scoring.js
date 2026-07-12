const scoringService = require('../../../modules/scoring/scoring.service');
const { getPool } = require('../../../config/database');

const CONVERGENCE_ITERATIONS = 8; // anti-cliff ±15/run; 8x cukup untuk 0 -> ~100

/**
 * scoring.service.hitungSkorJemaat SELALU memakai window "3 bulan
 * terakhir dari NOW() real" (bukan parameter tanggal) dan menerapkan
 * anti-cliff (±15 poin/run) terhadap skor_keaktifan SEBELUMNYA. Karena
 * seluruh jemaat mulai dari skor 0, satu kali run tidak cukup untuk
 * mencapai nilai riil berdasarkan histori yang sudah di-seed — jadi
 * kita jalankan batch ini berulang sampai konvergen.
 */
async function runConvergingScoringBatch() {
  let last = null;
  for (let i = 0; i < CONVERGENCE_ITERATIONS; i++) {
    last = await scoringService.runScoringBatch({ actorUserId: null });
    console.log(`  [scoring] iterasi ${i + 1}/${CONVERGENCE_ITERATIONS}: ${last.processed} diproses, ${last.skipped} dilewati.`);
  }
  return last;
}

async function printStatusDistribution() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT status_keaktifan, COUNT(*) AS jumlah FROM jemaat WHERE deleted_at IS NULL GROUP BY status_keaktifan`
  );
  console.log('[scoring] Distribusi status_keaktifan:', rows.map((r) => `${r.status_keaktifan}=${r.jumlah}`).join(', '));
  return rows;
}

module.exports = { runConvergingScoringBatch, printStatusDistribution };
