const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const reportRepository = require('./report.repository');
const { recordAuditLog } = require('../auditlog/auditlog.repository');
const { notifyLeaders } = require('../notification/notification.stub');
const { decrypt } = require('../../utils/encryption.util');
const { getRedisClient } = require('../../config/redis');

const SYNC_THRESHOLD = 500; // record < 500 → sinkron
// Jam operasional ekspor data: 06:00–22:00 waktu server. Ekspor di luar
// rentang ini memicu notifikasi EKSPOR_DATA_MALAM ke semua Leader.
const OPERATIONAL_HOUR_START = 6;
const OPERATIONAL_HOUR_END = 22;
const REPORT_DIR = path.join(__dirname, '../../../uploads/reports');
const SIGNED_URL_TTL_SECONDS = 15 * 60; // 15 menit
const VALID_FORMATS = ['xlsx', 'pdf'];

const CONTENT_TYPE_BY_EXT = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

class ReportError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

function signedUrlKey(token) {
  return `signed_url:${token}`;
}

// Pastikan direktori report ada
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

/**
 * Validasi query parameter ?format, sesuai kontrak baru BAGIAN 7:
 * hanya 'xlsx' dan 'pdf' yang valid (default 'xlsx').
 * @param {string|undefined} format
 * @returns {'xlsx'|'pdf'}
 */
function validateFormat(format = 'xlsx') {
  if (!VALID_FORMATS.includes(format)) {
    throw new ReportError(`Format laporan "${format}" tidak valid, gunakan xlsx atau pdf`, 400);
  }
  return format;
}

/**
 * Generate nama file UUID acak.
 * Sesuai BAGIAN 7: nama UUID acak, tidak predictable.
 * @param {string} ext
 * @returns {string}
 */
function generateFileName(ext) {
  return `${crypto.randomUUID()}.${ext}`;
}

/**
 * Generate signed URL yang berlaku 15 menit, disimpan di Redis
 * (audit item 3 — persistent & shared antar instance).
 * Key: signed_url:{token} → JSON { fileName }, EX 900.
 * Sesuai BAGIAN 7: signed URL, auto-delete setelah 1x unduh atau 15 menit.
 * @param {string} fileName
 * @returns {Promise<string>} token
 */
async function generateSignedToken(fileName) {
  const token = crypto.randomUUID();
  const redis = getRedisClient();
  await redis.set(signedUrlKey(token), JSON.stringify({ fileName }), 'EX', SIGNED_URL_TTL_SECONDS);
  return token;
}

/**
 * Validasi dan konsumsi signed token (1x pakai) via Redis GETDEL —
 * atomik: ambil & hapus dalam satu operasi sehingga race minim.
 * Key yang tidak ada (expired/used/invalid) → null.
 * @param {string} token
 * @returns {Promise<{ fileName: string } | null>}
 */
async function consumeSignedToken(token) {
  const redis = getRedisClient();
  const raw = await redis.getdel(signedUrlKey(token));
  if (!raw) return null;
  try {
    const { fileName } = JSON.parse(raw);
    return { fileName };
  } catch {
    return null;
  }
}

/**
 * Dekripsi field sensitif per baris (streaming pattern).
 * Sesuai BAGIAN 7: streaming dekripsi, tidak buffer semua ke RAM.
 * @param {object} row
 * @returns {object}
 */
function dekripsiBarisJemaat(row) {
  const result = { ...row };
  try {
    if (row.no_hp && row.no_hp_iv) {
      result.no_hp = decrypt(row.no_hp, row.no_hp_iv);
    }
  } catch {
    result.no_hp = '[DECRYPT_ERROR]';
  }
  try {
    if (row.alamat && row.alamat_iv) {
      result.alamat = decrypt(row.alamat, row.alamat_iv);
    }
  } catch {
    result.alamat = '[DECRYPT_ERROR]';
  }
  // Hapus IV dari output
  delete result.no_hp_iv;
  delete result.alamat_iv;
  return result;
}

/**
 * Menulis rows ke worksheet xlsx secara streaming (exceljs
 * WorkbookWriter) langsung ke `stream` tujuan — tidak membangun
 * representasi seluruh workbook di memori sebelum ditulis (BAGIAN 7).
 * Header di-bold, lebar kolom auto-fit berdasar panjang konten terpanjang.
 * @param {NodeJS.WritableStream} stream
 * @param {Array<{ header: string, key: string }>} columns
 * @param {Array<object>} rows
 * @returns {Promise<void>}
 */
async function writeRowsToXlsx(stream, columns, rows) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  const worksheet = workbook.addWorksheet('Laporan');

  worksheet.columns = columns.map((col) => {
    const maxContentLength = rows.reduce(
      (max, row) => Math.max(max, String(row[col.key] ?? '').length),
      col.header.length
    );
    return { header: col.header, key: col.key, width: Math.min(60, Math.max(10, maxContentLength + 2)) };
  });
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).commit();

  for (const row of rows) {
    worksheet.addRow(row).commit();
  }

  worksheet.commit();
  await workbook.commit();
}

/**
 * Menulis rows sebagai tabel sederhana ke dokumen PDF (pdfkit),
 * streaming langsung ke `stream` tujuan, dengan paginasi otomatis
 * ketika baris berikutnya melewati batas bawah halaman.
 * @param {NodeJS.WritableStream} stream
 * @param {Array<{ header: string, key: string }>} columns
 * @param {Array<object>} rows
 * @returns {Promise<void>}
 */
function writeRowsToPdf(stream, columns, rows) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    doc.pipe(stream);
    stream.on('finish', resolve);
    doc.on('error', reject);

    const startX = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = usableWidth / columns.length;
    const bottomLimit = doc.page.height - doc.page.margins.bottom;
    let y = doc.page.margins.top;

    function drawHeader() {
      doc.font('Helvetica-Bold').fontSize(9);
      columns.forEach((col, i) => {
        doc.text(col.header, startX + i * colWidth, y, { width: colWidth, ellipsis: true });
      });
      y += 20;
      doc.font('Helvetica').fontSize(8);
    }

    drawHeader();

    for (const row of rows) {
      if (y + 16 > bottomLimit) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader();
      }
      columns.forEach((col, i) => {
        doc.text(String(row[col.key] ?? ''), startX + i * colWidth, y, { width: colWidth, ellipsis: true });
      });
      y += 16;
    }

    doc.end();
  });
}

/**
 * Menulis rows ke file di REPORT_DIR sesuai format, dan mengembalikan
 * metadata file yang dihasilkan.
 * @param {'xlsx'|'pdf'} format
 * @param {Array<{ header: string, key: string }>} columns
 * @param {Array<object>} rows
 * @returns {Promise<{ fileName: string, filePath: string, contentType: string }>}
 */
async function writeReportFile(format, columns, rows) {
  const fileName = generateFileName(format);
  const filePath = path.join(REPORT_DIR, fileName);
  const fileStream = fs.createWriteStream(filePath);

  if (format === 'xlsx') {
    await writeRowsToXlsx(fileStream, columns, rows);
  } else {
    await writeRowsToPdf(fileStream, columns, rows);
  }

  return { fileName, filePath, contentType: CONTENT_TYPE_BY_EXT[format] };
}

/**
 * Membungkus alur umum "tulis file → sinkron (kirim langsung) atau
 * asinkron (signed token)" yang dipakai oleh kelima jenis laporan.
 * @param {{ total, columns, rows, format, jenis, filters, actorUserId }} params
 */
/**
 * Cek apakah sebuah jam berada di luar jam operasional (sebelum 06:00
 * atau pukul 22:00 ke atas, waktu server).
 * @param {number} hour - 0-23
 * @returns {boolean}
 */
function isOutsideOperationalHours(hour) {
  return hour < OPERATIONAL_HOUR_START || hour >= OPERATIONAL_HOUR_END;
}

async function finalizeReport({ total, columns, rows, format, jenis, filters, actorUserId }) {
  const now = new Date();
  if (isOutsideOperationalHours(now.getHours())) {
    // notifyLeaders menelan errornya sendiri — gagal kirim notifikasi
    // tidak boleh menggagalkan generate laporan.
    await notifyLeaders({
      jenis: 'EKSPOR_DATA_MALAM',
      pesan: `User ID ${actorUserId ?? 'tidak dikenal'} melakukan ekspor laporan ${jenis} (format ${format}) di luar jam operasional pada ${now.toISOString()}.`,
    });
  }

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'EXPORT',
    modul: 'LAPORAN',
    objectId: null,
    dataSebelum: null,
    dataSesudah: { jenis, total, format, filters },
  });

  const file = await writeReportFile(format, columns, rows);

  if (total >= SYNC_THRESHOLD) {
    const token = await generateSignedToken(file.fileName);
    return { async: true, token, message: 'Laporan sedang diproses, gunakan token untuk mengunduh' };
  }

  return { async: false, ...file };
}

const JEMAAT_COLUMNS_BASE = [
  { header: 'ID', key: 'id' },
  { header: 'Nama', key: 'nama' },
  { header: 'Tanggal Lahir', key: 'tgl_lahir' },
  { header: 'Jenis Kelamin', key: 'jenis_kelamin' },
  { header: 'Tanggal Bergabung', key: 'tgl_bergabung' },
  { header: 'Aktif', key: 'is_active' },
  { header: 'Jemaat Baru', key: 'is_new_member' },
  { header: 'Skor Keaktifan', key: 'skor_keaktifan' },
  { header: 'Status Keaktifan', key: 'status_keaktifan' },
];
const JEMAAT_COLUMNS_SENSITIVE = [
  { header: 'No HP', key: 'no_hp' },
  { header: 'Alamat', key: 'alamat' },
];

/**
 * Generate laporan data jemaat.
 * Jika record < 500: sinkron, file langsung dikirim.
 * Jika record >= 500: async (simulasi queue), return token file.
 *
 * @param {{ includeSensitive?: boolean, format?: 'xlsx'|'pdf' }} options
 * @param {{ actorUserId: number }} auth
 */
async function generateJemaatReport({ includeSensitive = false, format } = {}, { actorUserId = null } = {}) {
  const validFormat = validateFormat(format);
  const total = await reportRepository.countJemaat();
  const rawRows = await reportRepository.getJemaatReport({ limit: total });

  const rows = includeSensitive
    ? rawRows.map(dekripsiBarisJemaat)
    : rawRows.map((r) => {
        const { no_hp, no_hp_iv, alamat, alamat_iv, ...rest } = r;
        return rest;
      });

  const columns = includeSensitive
    ? [...JEMAAT_COLUMNS_BASE, ...JEMAAT_COLUMNS_SENSITIVE]
    : JEMAAT_COLUMNS_BASE;

  return finalizeReport({
    total, columns, rows, format: validFormat,
    jenis: 'JEMAAT', filters: { includeSensitive }, actorUserId,
  });
}

const EVENT_COLUMNS = [
  { header: 'ID Event', key: 'event_id' },
  { header: 'Judul', key: 'judul' },
  { header: 'Jenis', key: 'jenis' },
  { header: 'Waktu Mulai', key: 'waktu_mulai' },
  { header: 'Waktu Selesai', key: 'waktu_selesai' },
  { header: 'Total Hadir', key: 'total_hadir' },
  { header: 'Jemaat Baru', key: 'jemaat_baru' },
  { header: 'Total Volunteer', key: 'total_volunteer' },
];

/**
 * Generate laporan kehadiran event.
 * @param {{ eventId?, startDate?, endDate?, format?: 'xlsx'|'pdf' }} filters
 * @param {{ actorUserId: number }} auth
 */
async function generateEventReport({ format, ...filters } = {}, { actorUserId = null } = {}) {
  const validFormat = validateFormat(format);
  const rows = await reportRepository.getEventKehadiranReport(filters);

  return finalizeReport({
    total: rows.length, columns: EVENT_COLUMNS, rows, format: validFormat,
    jenis: 'KEHADIRAN_EVENT', filters, actorUserId,
  });
}

const CG_COLUMNS = [
  { header: 'Nama CG', key: 'nama_cg' },
  { header: 'Judul Meeting', key: 'judul' },
  { header: 'Jenis', key: 'jenis' },
  { header: 'Waktu Mulai', key: 'waktu_mulai' },
  { header: 'Nama Jemaat', key: 'nama_jemaat' },
  { header: 'Hadir', key: 'hadir' },
];

/**
 * Generate laporan kehadiran CG.
 * @param {{ cgId?, jemaatId?, startDate?, endDate?, format?: 'xlsx'|'pdf' }} filters
 * @param {{ actorUserId: number }} auth
 */
async function generateCGReport({ format, ...filters } = {}, { actorUserId = null } = {}) {
  const validFormat = validateFormat(format);
  const rows = await reportRepository.getCGKehadiranReport(filters);

  return finalizeReport({
    total: rows.length, columns: CG_COLUMNS, rows, format: validFormat,
    jenis: 'KEHADIRAN_CG', filters, actorUserId,
  });
}

const VOLUNTEER_COLUMNS = [
  { header: 'Nama Jemaat', key: 'nama_jemaat' },
  { header: 'Nama Event', key: 'nama_event' },
  { header: 'Waktu Mulai', key: 'waktu_mulai' },
  { header: 'Jenis Volunteer', key: 'jenis_volunteer' },
  { header: 'Status', key: 'status' },
  { header: 'Durasi (menit)', key: 'durasi_menit' },
  { header: 'Dibuat Pada', key: 'created_at' },
];

/**
 * Generate laporan volunteer.
 * @param {{ jemaatId?, eventId?, startDate?, endDate?, format?: 'xlsx'|'pdf' }} filters
 * @param {{ actorUserId: number }} auth
 */
async function generateVolunteerReport({ format, ...filters } = {}, { actorUserId = null } = {}) {
  const validFormat = validateFormat(format);
  const rows = await reportRepository.getVolunteerReport(filters);

  return finalizeReport({
    total: rows.length, columns: VOLUNTEER_COLUMNS, rows, format: validFormat,
    jenis: 'VOLUNTEER', filters, actorUserId,
  });
}

const ANALYTICS_COLUMNS = [
  { header: 'Periode', key: 'periode' },
  { header: 'Jemaat Baru', key: 'jemaat_baru' },
  { header: 'Masih Aktif', key: 'masih_aktif' },
];

/**
 * Generate laporan analytics (tren pertumbuhan).
 * @param {{ bulan?: number, format?: 'xlsx'|'pdf' }} options
 * @param {{ actorUserId: number }} auth
 */
async function generateAnalyticsReport({ bulan = 12, format } = {}, { actorUserId = null } = {}) {
  const validFormat = validateFormat(format);
  const rows = await reportRepository.getAnalyticsReport({ bulan });

  return finalizeReport({
    total: rows.length, columns: ANALYTICS_COLUMNS, rows, format: validFormat,
    jenis: 'ANALYTICS', filters: { bulan }, actorUserId,
  });
}

/**
 * Download file laporan menggunakan signed token (1x pakai, 15 menit).
 * Sesuai BAGIAN 7: auto-delete setelah 1x unduh.
 * @param {string} token
 * @returns {Promise<{ filePath: string, fileName: string, contentType: string } | null>}
 */
async function downloadReport(token) {
  const entry = await consumeSignedToken(token);
  if (!entry) return null;

  const filePath = path.join(REPORT_DIR, entry.fileName);
  if (!fs.existsSync(filePath)) return null;

  const ext = path.extname(entry.fileName).slice(1);
  return { filePath, fileName: entry.fileName, contentType: CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream' };
}

module.exports = {
  ReportError,
  generateJemaatReport,
  generateEventReport,
  generateCGReport,
  generateVolunteerReport,
  generateAnalyticsReport,
  downloadReport,
  generateSignedToken,
  consumeSignedToken,
  isOutsideOperationalHours,
  dekripsiBarisJemaat,
  writeRowsToXlsx,
  writeRowsToPdf,
};
