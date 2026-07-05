const { runScoringBatch } = require('./scoring.service');
const { notifyLeaders } = require('../notification/notification.stub');

/**
 * POST /api/scoring/run — jalankan scoring batch manual (LEADER only).
 * Mengembalikan ringkasan { processed, skipped } dan mengirim
 * notifikasi SCORING_SELESAI ke semua Leader aktif.
 */
async function runScoring(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const result = await runScoringBatch({ actorUserId });

    await notifyLeaders({
      jenis: 'SCORING_SELESAI',
      pesan: `Scoring manual selesai: ${result.processed} jemaat diproses, ${result.skipped} dilewati.`,
    });

    return res.status(200).json({
      message: 'Scoring selesai',
      processed: result.processed,
      skipped: result.skipped,
    });
  } catch (err) {
    console.error('Scoring controller error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

module.exports = { runScoring };
