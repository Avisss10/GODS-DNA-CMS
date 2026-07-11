const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const reportRepository = require('./report.repository');
const { recordAuditLog } = require('../auditlog/auditlog.repository');
const { notifyLeaders } = require('../notification/notification.stub');
const { decrypt, decryptJson } = require('../../utils/encryption.util');
const { getRedisClient } = require('../../config/redis');

const SYNC_THRESHOLD = 500; // record < 500 → sinkron
const PREVIEW_LIMIT = 20; // jumlah baris yang ditampilkan di tabel preview sebelum export
// Jam operasional ekspor data: 06:00–22:00 waktu server. Ekspor di luar
// rentang ini memicu notifikasi EKSPOR_DATA_MALAM ke semua Leader.
const OPERATIONAL_HOUR_START = 6;
const OPERATIONAL_HOUR_END = 22;
const REPORT_DIR = path.join(__dirname, '../../../uploads/reports');
const SIGNED_URL_TTL_SECONDS = 15 * 60; // 15 menit
const VALID_FORMATS = ['xlsx', 'pdf'];

// Logo dipakai di header PDF — disalin dari frontend/src/assets/brand
// karena pdfkit (server-side) butuh path filesystem lokal, tidak bisa
// merujuk ke folder frontend langsung.
const PDF_LOGO_PATH = path.join(__dirname, '../../assets/brand/gw-logo-indigo.png');
const PDF_LOGO_HEIGHT = 28;
const PDF_LOGO_WIDTH = 97; // rasio asli logo ~340x98
const PDF_MIN_COL_WIDTH = 45;
const PDF_ROW_PADDING = 4;
const PDF_MAX_ROW_LINES = 4; // batas wajar tinggi baris — cegah 1 sel ekstrem merusak halaman

const CONTENT_TYPE_BY_EXT = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

// Judul laporan ditampilkan di blok metadata atas tiap file — kunci
// harus persis sama dengan `jenis` yang dikirim ke finalizeReport().
const REPORT_TITLES = {
  JEMAAT: 'Laporan Data Jemaat',
  KEHADIRAN_EVENT: 'Laporan Kehadiran Event',
  KEHADIRAN_CG: 'Laporan Kehadiran Cell Group',
  VOLUNTEER: 'Laporan Volunteer',
  ANALYTICS: 'Laporan Analytics Pertumbuhan Jemaat',
};

const JENIS_KELAMIN_LABELS = { L: 'Laki-laki', P: 'Perempuan' };
const STATUS_KEAKTIFAN_LABELS = {
  AKTIF: 'Aktif',
  KURANG_AKTIF: 'Kurang Aktif',
  TIDAK_AKTIF: 'Tidak Aktif',
  BELUM_CUKUP_DATA: 'Belum Cukup Data',
};
const VOLUNTEER_STATUS_LABELS = {
  AKTIF: 'Aktif',
  DIGANTIKAN: 'Digantikan',
  BERTUGAS_PARSIAL: 'Bertugas Parsial',
  DIBATALKAN: 'Dibatalkan',
};
const CG_JENIS_LABELS = { ONLINE: 'Online', OFFLINE: 'Offline' };
const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** Format tanggal saja, mis. "9 Juli 2026". Menerima Date atau string. */
function formatTanggalID(value) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Format tanggal + jam, mis. "9 Juli 2026, 19:00". */
function formatTanggalWaktuID(value) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const tanggal = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const jam = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${tanggal}, ${jam}`;
}

function formatYaTidak(value) {
  return value ? 'Ya' : 'Tidak';
}

/** "YYYY-MM" -> "Januari 2026". */
function formatPeriodeID(periode) {
  if (!periode) return '-';
  const [tahun, bulan] = String(periode).split('-');
  const label = BULAN_ID[Number(bulan) - 1];
  return label ? `${label} ${tahun}` : periode;
}

/**
 * media_sosial di export HANYA Instagram (satu-satunya field media
 * sosial yang didukung sistem) — key lain (mis. sisa data lama sebelum
 * form disederhanakan) sengaja diabaikan, bukan cuma disembunyikan di UI.
 */
function formatMediaSosialForExport(raw) {
  if (!raw) return '-';
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return obj?.instagram ? `Instagram: ${obj.instagram}` : '-';
  } catch {
    return '-';
  }
}

function formatJemaatRowForExport(row) {
  return {
    ...row,
    jenis_kelamin: JENIS_KELAMIN_LABELS[row.jenis_kelamin] || row.jenis_kelamin,
    is_active: formatYaTidak(row.is_active),
    is_new_member: formatYaTidak(row.is_new_member),
    status_keaktifan: STATUS_KEAKTIFAN_LABELS[row.status_keaktifan] || row.status_keaktifan,
    tgl_lahir: formatTanggalID(row.tgl_lahir),
    tgl_bergabung: formatTanggalID(row.tgl_bergabung),
    media_sosial: formatMediaSosialForExport(row.media_sosial),
  };
}

function formatEventRowForExport(row) {
  return {
    ...row,
    waktu_mulai: formatTanggalWaktuID(row.waktu_mulai),
    waktu_selesai: formatTanggalWaktuID(row.waktu_selesai),
  };
}

function formatCgRowForExport(row) {
  return {
    ...row,
    jenis: CG_JENIS_LABELS[row.jenis] || row.jenis,
    waktu_mulai: formatTanggalWaktuID(row.waktu_mulai),
    hadir: formatYaTidak(row.hadir),
  };
}

function formatVolunteerRowForExport(row) {
  return {
    ...row,
    waktu_mulai: formatTanggalWaktuID(row.waktu_mulai),
    created_at: formatTanggalWaktuID(row.created_at),
    status: VOLUNTEER_STATUS_LABELS[row.status] || row.status,
    durasi_menit: row.durasi_menit != null ? `${row.durasi_menit} menit` : '-',
  };
}

function formatAnalyticsRowForExport(row) {
  return { ...row, periode: formatPeriodeID(row.periode) };
}

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
  try {
    if (row.media_sosial && row.media_sosial_iv) {
      // decryptJson mengembalikan object — di-stringify agar bisa
      // ditulis sebagai satu sel teks di xlsx/pdf.
      result.media_sosial = JSON.stringify(decryptJson(row.media_sosial, row.media_sosial_iv));
    }
  } catch {
    result.media_sosial = '[DECRYPT_ERROR]';
  }
  // Hapus IV dari output
  delete result.no_hp_iv;
  delete result.alamat_iv;
  delete result.media_sosial_iv;
  return result;
}

/**
 * Menulis rows ke worksheet xlsx secara streaming (exceljs
 * WorkbookWriter) langsung ke `stream` tujuan — tidak membangun
 * representasi seluruh workbook di memori sebelum ditulis (BAGIAN 7).
 * Header di-bold+border+fill, lebar kolom auto-fit. Kalau `meta.title`
 * diisi, ditulis blok judul + baris metadata (tanggal, cakupan, filter
 * aktif) sebelum header tabel — dilewati sama sekali kalau meta kosong
 * (dipakai langsung tanpa meta di beberapa unit test).
 * @param {NodeJS.WritableStream} stream
 * @param {Array<{ header: string, key: string }>} columns
 * @param {Array<object>} rows
 * @param {{ title?: string, subtitleLines?: string[] }} [meta]
 * @returns {Promise<void>}
 */
async function writeRowsToXlsx(stream, columns, rows, meta = {}) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  const worksheet = workbook.addWorksheet('Laporan');

  // `header` sengaja TIDAK dipakai di sini (beda dari sebelumnya) — kalau
  // dipakai, ExcelJS otomatis mengklaim baris 1 untuk header, sehingga
  // tidak ada ruang untuk blok judul di atasnya. Header ditulis manual
  // di bawah, di baris manapun setelah blok judul selesai.
  worksheet.columns = columns.map((col) => {
    const maxContentLength = rows.reduce(
      (max, row) => Math.max(max, String(row[col.key] ?? '').length),
      col.header.length
    );
    return { key: col.key, width: Math.min(60, Math.max(10, maxContentLength + 2)) };
  });

  const subtitleLines = meta.subtitleLines || [];
  if (meta.title) {
    const titleRow = worksheet.addRow([meta.title]);
    titleRow.getCell(1).font = { bold: true, size: 14 };
    titleRow.commit();
  }
  for (const line of subtitleLines) {
    const row = worksheet.addRow([line]);
    row.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
    row.commit();
  }
  if (meta.title || subtitleLines.length > 0) {
    worksheet.addRow([]).commit();
  }

  const thinBorder = { style: 'thin', color: { argb: 'FFD9D9D9' } };
  const cellBorder = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

  const headerRow = worksheet.addRow(columns.map((col) => col.header));
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.border = cellBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });
  headerRow.commit();

  for (const row of rows) {
    const dataRow = worksheet.addRow(row);
    dataRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = cellBorder;
    });
    dataRow.commit();
  }

  worksheet.commit();
  await workbook.commit();
}

/**
 * Hitung lebar tiap kolom berdasarkan `widthWeight` (default 1) —
 * proporsional terhadap bobot, dengan floor minimum PDF_MIN_COL_WIDTH.
 * Kalau total lebar setelah floor melebihi usableWidth (kasus banyak
 * kolom sempit), semua kolom diskalakan turun proporsional supaya tetap
 * pas — jarang terjadi kecuali jumlah kolom sangat banyak.
 * @param {Array<{ widthWeight?: number }>} columns
 * @param {number} usableWidth
 * @returns {number[]}
 */
function computeColumnWidths(columns, usableWidth) {
  const weights = columns.map((col) => col.widthWeight || 1);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const rawWidths = weights.map((w) => (usableWidth * w) / totalWeight);

  // Kolom yang di bawah floor dipatok persis ke PDF_MIN_COL_WIDTH; sisa
  // lebar didistribusikan ulang proporsional HANYA ke kolom yang masih
  // di atas floor. Ini beda dari sekadar menskalakan semua kolom turun
  // secara seragam — skala seragam akan ikut menyusutkan kolom yang
  // sudah dipatok ke floor, sehingga floor-nya jadi tidak berarti lagi.
  const isFloored = rawWidths.map((w) => w < PDF_MIN_COL_WIDTH);
  const flooredTotal = rawWidths.reduce((sum, w, i) => sum + (isFloored[i] ? PDF_MIN_COL_WIDTH : 0), 0);
  const flexibleWeightTotal = weights.reduce((sum, w, i) => sum + (isFloored[i] ? 0 : w), 0);

  if (flexibleWeightTotal <= 0) {
    // Semua kolom kena floor (usableWidth terlalu kecil untuk jumlah
    // kolom) — tidak ada dasar bobot yang valid, bagi rata saja.
    return columns.map(() => usableWidth / columns.length);
  }

  const remaining = usableWidth - flooredTotal;
  return rawWidths.map((w, i) => (isFloored[i] ? PDF_MIN_COL_WIDTH : (remaining * weights[i]) / flexibleWeightTotal));
}

/**
 * Ukur tinggi baris yang dibutuhkan supaya SEMUA teks di baris itu
 * (termasuk yang wrap ke beberapa baris) muat tanpa terpotong dan tanpa
 * menimpa baris berikutnya — akar masalah PDF versi lama (tinggi baris
 * tetap 16pt padahal teks panjang wrap ke 2-4 baris). Diclamp ke
 * PDF_MAX_ROW_LINES baris supaya satu sel ekstrem tidak merusak halaman.
 * @param {import('pdfkit')} doc
 * @param {Array<object>} columns
 * @param {number[]} colWidths
 * @param {(col: object, index: number) => string} getText
 * @param {{ font: string, fontSize: number }} fontConfig
 * @returns {number}
 */
function measureRowHeight(doc, columns, colWidths, getText, { font, fontSize }) {
  doc.font(font).fontSize(fontSize);
  let maxTextHeight = 0;
  columns.forEach((col, i) => {
    const text = getText(col, i);
    const height = doc.heightOfString(text, { width: colWidths[i] - PDF_ROW_PADDING * 2 });
    if (height > maxTextHeight) maxTextHeight = height;
  });
  const lineHeight = doc.currentLineHeight();
  const maxAllowed = lineHeight * PDF_MAX_ROW_LINES;
  return Math.min(Math.max(maxTextHeight, lineHeight), maxAllowed) + PDF_ROW_PADDING * 2;
}

/**
 * Menulis rows sebagai tabel ke dokumen PDF (pdfkit), streaming langsung
 * ke `stream` tujuan, dengan paginasi otomatis ketika baris berikutnya
 * melewati batas bawah halaman. Lebar kolom proporsional terhadap
 * `widthWeight` masing-masing (bukan dibagi rata), dan tinggi tiap baris
 * diukur dari teks terpanjang di baris itu (bukan tetap 16pt) — supaya
 * teks panjang (alamat, media sosial) wrap rapi tanpa menimpa baris lain.
 * Kalau `meta.title` diisi, blok logo + judul + metadata (tanggal,
 * cakupan, filter aktif) digambar sebelum tabel (hanya di halaman
 * pertama — halaman lanjutan cukup ulang header kolom).
 * @param {NodeJS.WritableStream} stream
 * @param {Array<{ header: string, key: string, widthWeight?: number }>} columns
 * @param {Array<object>} rows
 * @param {{ title?: string, subtitleLines?: string[] }} [meta]
 * @returns {Promise<void>}
 */
function writeRowsToPdf(stream, columns, rows, meta = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    doc.pipe(stream);
    stream.on('finish', resolve);
    doc.on('error', reject);

    const startX = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidths = computeColumnWidths(columns, usableWidth);
    const bottomLimit = doc.page.height - doc.page.margins.bottom;
    let y = doc.page.margins.top;

    const hasLogo = fs.existsSync(PDF_LOGO_PATH);
    if (hasLogo) {
      try {
        doc.image(PDF_LOGO_PATH, startX, y, { height: PDF_LOGO_HEIGHT });
      } catch {
        // Logo gagal dibaca/di-decode — jangan gagalkan seluruh generate
        // laporan, lanjut tanpa logo.
      }
    }
    const textStartX = hasLogo ? startX + PDF_LOGO_WIDTH + 12 : startX;
    const textWidth = usableWidth - (hasLogo ? PDF_LOGO_WIDTH + 12 : 0);

    const subtitleLines = meta.subtitleLines || [];
    if (meta.title) {
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#0F172A').text(meta.title, textStartX, y, { width: textWidth });
      y += 20;
    }
    if (subtitleLines.length > 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#64748B');
      for (const line of subtitleLines) {
        doc.text(line, textStartX, y, { width: textWidth });
        y += 13;
      }
    }
    doc.fillColor('#000000');
    if (hasLogo) {
      y = Math.max(y, doc.page.margins.top + PDF_LOGO_HEIGHT);
    }
    if (meta.title || subtitleLines.length > 0) {
      y += 10;
      doc.moveTo(startX, y).lineTo(startX + usableWidth, y).strokeColor('#CBD5E1').lineWidth(1).stroke();
      y += 10;
    }

    function drawHeaderRow() {
      const rowHeight = measureRowHeight(doc, columns, colWidths, (col) => col.header, { font: 'Helvetica-Bold', fontSize: 9 });
      doc.rect(startX, y, usableWidth, rowHeight).fill('#F1F5F9');
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9);
      let x = startX;
      columns.forEach((col, i) => {
        doc.text(col.header, x + PDF_ROW_PADDING, y + PDF_ROW_PADDING / 2, {
          width: colWidths[i] - PDF_ROW_PADDING * 2,
          height: rowHeight - PDF_ROW_PADDING,
        });
        x += colWidths[i];
      });
      y += rowHeight;
      doc.moveTo(startX, y).lineTo(startX + usableWidth, y).strokeColor('#CBD5E1').lineWidth(1).stroke();
      doc.fillColor('#000000');
    }

    drawHeaderRow();

    rows.forEach((row, rowIndex) => {
      const getText = (col) => String(row[col.key] ?? '');
      const rowHeight = measureRowHeight(doc, columns, colWidths, getText, { font: 'Helvetica', fontSize: 8 });

      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeaderRow();
      }

      if (rowIndex % 2 === 1) {
        doc.rect(startX, y, usableWidth, rowHeight).fill('#F8FAFC');
      }
      doc.fillColor('#1E293B').font('Helvetica').fontSize(8);
      let x = startX;
      columns.forEach((col, i) => {
        doc.text(getText(col), x + PDF_ROW_PADDING, y + PDF_ROW_PADDING / 2, {
          width: colWidths[i] - PDF_ROW_PADDING * 2,
          height: rowHeight - PDF_ROW_PADDING,
        });
        x += colWidths[i];
      });
      y += rowHeight;
      doc.moveTo(startX, y).lineTo(startX + usableWidth, y).strokeColor('#E2E8F0').lineWidth(0.5).stroke();
    });

    doc.end();
  });
}

/**
 * Menulis rows ke file di REPORT_DIR sesuai format, dan mengembalikan
 * metadata file yang dihasilkan.
 * @param {'xlsx'|'pdf'} format
 * @param {Array<{ header: string, key: string }>} columns
 * @param {Array<object>} rows
 * @param {{ title?: string, subtitleLines?: string[] }} [meta]
 * @returns {Promise<{ fileName: string, filePath: string, contentType: string }>}
 */
async function writeReportFile(format, columns, rows, meta) {
  const fileName = generateFileName(format);
  const filePath = path.join(REPORT_DIR, fileName);
  const fileStream = fs.createWriteStream(filePath);

  if (format === 'xlsx') {
    await writeRowsToXlsx(fileStream, columns, rows, meta);
  } else {
    await writeRowsToPdf(fileStream, columns, rows, meta);
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

async function finalizeReport({ total, columns, rows, format, jenis, filters, actorUserId, scopeDescription, filterDescription }) {
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

  const meta = {
    title: REPORT_TITLES[jenis] || 'Laporan',
    subtitleLines: [
      `Dibuat pada: ${formatTanggalWaktuID(now)}`,
      `Cakupan: ${scopeDescription || `${total} data`}`,
      ...(filterDescription ? [`Filter aktif: ${filterDescription}`] : []),
    ],
  };

  const file = await writeReportFile(format, columns, rows, meta);

  if (total >= SYNC_THRESHOLD) {
    const token = await generateSignedToken(file.fileName);
    return { async: true, token, message: 'Laporan sedang diproses, gunakan token untuk mengunduh' };
  }

  return { async: false, ...file };
}

const JEMAAT_COLUMNS = [
  { header: 'ID', key: 'id', widthWeight: 0.5 },
  { header: 'Nama', key: 'nama', widthWeight: 1.5 },
  { header: 'Tanggal Lahir', key: 'tgl_lahir', widthWeight: 1 },
  { header: 'Jenis Kelamin', key: 'jenis_kelamin', widthWeight: 0.8 },
  { header: 'Tanggal Bergabung', key: 'tgl_bergabung', widthWeight: 1 },
  { header: 'Aktif', key: 'is_active', widthWeight: 0.5 },
  { header: 'Jemaat Baru', key: 'is_new_member', widthWeight: 0.6 },
  { header: 'Skor Keaktifan', key: 'skor_keaktifan', widthWeight: 0.8 },
  { header: 'Status Keaktifan', key: 'status_keaktifan', widthWeight: 1 },
  { header: 'No HP', key: 'no_hp', widthWeight: 1 },
  { header: 'Alamat', key: 'alamat', widthWeight: 2.2 },
  { header: 'Media Sosial', key: 'media_sosial', widthWeight: 1.5 },
];

// Kolom tambahan untuk mode 'detail' — sama dengan info yang tampil di
// JemaatDetailPage (Cell Group & Volunteer), digabung 1 sel per jemaat.
const JEMAAT_DETAIL_EXTRA_COLUMNS = [
  { header: 'Cell Group', key: 'cell_group', widthWeight: 1.5 },
  { header: 'Volunteer', key: 'volunteer', widthWeight: 1.5 },
];

const VALID_JEMAAT_MODES = ['ringkas', 'detail'];

/**
 * Validasi ?mode: 'ringkas' (default, field jemaat saja) atau 'detail'
 * (tambah kolom Cell Group & Volunteer).
 * @param {string|undefined} mode
 * @returns {'ringkas'|'detail'}
 */
function validateMode(mode = 'ringkas') {
  if (!VALID_JEMAAT_MODES.includes(mode)) {
    throw new ReportError(`Mode laporan jemaat "${mode}" tidak valid, gunakan ringkas atau detail`, 400);
  }
  return mode;
}

/**
 * Validasi ?ids (daftar ID jemaat terpilih untuk export). Undefined
 * berarti "semua jemaat" (perilaku lama, tidak berubah).
 * @param {number[]|undefined} ids
 * @returns {number[]|undefined}
 */
function validateIds(ids) {
  if (ids === undefined) return undefined;
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id < 1)) {
    throw new ReportError('Parameter ids tidak valid — pilih minimal 1 jemaat', 400);
  }
  return ids;
}

/**
 * Generate laporan data jemaat. Tanpa `ids` → semua jemaat aktif
 * (perilaku lama). Dengan `ids` → hanya jemaat terpilih (dari checkbox
 * di JemaatListPage atau tombol export di JemaatDetailPage).
 * `mode` 'ringkas' (default) hanya field jemaat; 'detail' menambah
 * kolom Cell Group & Volunteer. no_hp/alamat/media_sosial selalu
 * didekripsi. Jika record < 500: sinkron, file langsung dikirim.
 * Jika record >= 500: async (simulasi queue), return token file.
 *
 * @param {{ format?: 'xlsx'|'pdf', ids?: number[], mode?: 'ringkas'|'detail', filterDescription?: string }} options
 * @param {{ actorUserId: number }} auth
 */
async function generateJemaatReport({ format, ids, mode, filterDescription } = {}, { actorUserId = null } = {}) {
  const validFormat = validateFormat(format);
  const validMode = validateMode(mode);
  const validIds = validateIds(ids);

  const total = await reportRepository.countJemaat({ ids: validIds });
  const rawRows = await reportRepository.getJemaatReport({ limit: total, ids: validIds });

  let rows = rawRows.map(dekripsiBarisJemaat);
  let columns = JEMAAT_COLUMNS;

  if (validMode === 'detail') {
    const jemaatIds = rows.map((r) => r.id);
    const [cgSummary, volunteerSummary] = await Promise.all([
      reportRepository.getJemaatCgSummary(jemaatIds),
      reportRepository.getJemaatVolunteerSummary(jemaatIds),
    ]);
    rows = rows.map((r) => ({
      ...r,
      cell_group: cgSummary[r.id] || '-',
      volunteer: volunteerSummary[r.id] || '-',
    }));
    columns = [...JEMAAT_COLUMNS, ...JEMAAT_DETAIL_EXTRA_COLUMNS];
  }

  rows = rows.map(formatJemaatRowForExport);

  return finalizeReport({
    total, columns, rows, format: validFormat,
    jenis: 'JEMAAT', filters: { ids: validIds, mode: validMode }, actorUserId,
    scopeDescription: validIds ? `${validIds.length} jemaat terpilih` : `Semua jemaat aktif (${total})`,
    filterDescription,
  });
}

/**
 * Preview laporan data jemaat — data & kolom identik dengan
 * generateJemaatReport (termasuk dekripsi & mode ringkas/detail),
 * tapi hanya PREVIEW_LIMIT baris pertama dan TIDAK memicu efek samping
 * export (tidak ada audit log EXPORT, tidak ada notifikasi
 * EKSPOR_DATA_MALAM, tidak ada file ditulis ke disk) — dipakai user
 * untuk meninjau data sebelum benar-benar klik Export.
 *
 * @param {{ ids?: number[], mode?: 'ringkas'|'detail' }} options
 * @returns {Promise<{ columns: Array, rows: Array, total: number }>}
 */
async function previewJemaatReport({ ids, mode } = {}) {
  const validMode = validateMode(mode);
  const validIds = validateIds(ids);

  const total = await reportRepository.countJemaat({ ids: validIds });
  const rawRows = await reportRepository.getJemaatReport({ limit: PREVIEW_LIMIT, ids: validIds });

  let rows = rawRows.map(dekripsiBarisJemaat);
  let columns = JEMAAT_COLUMNS;

  if (validMode === 'detail') {
    const jemaatIds = rows.map((r) => r.id);
    const [cgSummary, volunteerSummary] = await Promise.all([
      reportRepository.getJemaatCgSummary(jemaatIds),
      reportRepository.getJemaatVolunteerSummary(jemaatIds),
    ]);
    rows = rows.map((r) => ({
      ...r,
      cell_group: cgSummary[r.id] || '-',
      volunteer: volunteerSummary[r.id] || '-',
    }));
    columns = [...JEMAAT_COLUMNS, ...JEMAAT_DETAIL_EXTRA_COLUMNS];
  }

  rows = rows.map(formatJemaatRowForExport);

  return { columns, rows, total };
}

const EVENT_COLUMNS = [
  { header: 'ID Event', key: 'event_id', widthWeight: 0.5 },
  { header: 'Judul', key: 'judul', widthWeight: 1.8 },
  { header: 'Jenis', key: 'jenis', widthWeight: 0.8 },
  { header: 'Waktu Mulai', key: 'waktu_mulai', widthWeight: 1.2 },
  { header: 'Waktu Selesai', key: 'waktu_selesai', widthWeight: 1.2 },
  { header: 'Total Hadir', key: 'total_hadir', widthWeight: 0.8 },
  { header: 'Jemaat Baru', key: 'jemaat_baru', widthWeight: 0.8 },
  { header: 'Total Volunteer', key: 'total_volunteer', widthWeight: 0.9 },
];

/**
 * Generate laporan kehadiran event.
 * @param {{ eventId?, startDate?, endDate?, format?: 'xlsx'|'pdf', filterDescription?: string }} filters
 * @param {{ actorUserId: number }} auth
 */
async function generateEventReport({ format, filterDescription, ...filters } = {}, { actorUserId = null } = {}) {
  const validFormat = validateFormat(format);
  const rawRows = await reportRepository.getEventKehadiranReport(filters);
  const rows = rawRows.map(formatEventRowForExport);

  return finalizeReport({
    total: rows.length, columns: EVENT_COLUMNS, rows, format: validFormat,
    jenis: 'KEHADIRAN_EVENT', filters, actorUserId, filterDescription,
  });
}

/**
 * Preview laporan kehadiran event — query & filter SAMA PERSIS dengan
 * generateEventReport (limit default repository, bukan file), hanya
 * PREVIEW_LIMIT baris pertama yang dikembalikan ke frontend; `total`
 * tetap mencerminkan seluruh baris yang match filter (sama dengan yang
 * akan diexport) supaya user tahu "20 dari X". Tidak ada efek samping
 * export (audit log/notifikasi/file).
 * @param {{ eventId?, startDate?, endDate? }} filters
 * @returns {Promise<{ columns: Array, rows: Array, total: number }>}
 */
async function previewEventReport(filters = {}) {
  const rawRows = await reportRepository.getEventKehadiranReport(filters);
  const rows = rawRows.map(formatEventRowForExport);
  return { columns: EVENT_COLUMNS, rows: rows.slice(0, PREVIEW_LIMIT), total: rows.length };
}

const CG_COLUMNS = [
  { header: 'Nama CG', key: 'nama_cg', widthWeight: 1.3 },
  { header: 'Judul Meeting', key: 'judul', widthWeight: 1.5 },
  { header: 'Jenis', key: 'jenis', widthWeight: 0.7 },
  { header: 'Waktu Mulai', key: 'waktu_mulai', widthWeight: 1.2 },
  { header: 'Nama Jemaat', key: 'nama_jemaat', widthWeight: 1.3 },
  { header: 'Hadir', key: 'hadir', widthWeight: 0.6 },
];

/**
 * Generate laporan kehadiran CG.
 * @param {{ cgId?, jemaatId?, startDate?, endDate?, format?: 'xlsx'|'pdf', filterDescription?: string }} filters
 * @param {{ actorUserId: number }} auth
 */
async function generateCGReport({ format, filterDescription, ...filters } = {}, { actorUserId = null } = {}) {
  const validFormat = validateFormat(format);
  const rawRows = await reportRepository.getCGKehadiranReport(filters);
  const rows = rawRows.map(formatCgRowForExport);

  return finalizeReport({
    total: rows.length, columns: CG_COLUMNS, rows, format: validFormat,
    jenis: 'KEHADIRAN_CG', filters, actorUserId, filterDescription,
  });
}

/**
 * Preview laporan kehadiran CG — lihat catatan previewEventReport,
 * pola yang sama.
 * @param {{ cgId?, jemaatId?, startDate?, endDate? }} filters
 * @returns {Promise<{ columns: Array, rows: Array, total: number }>}
 */
async function previewCGReport(filters = {}) {
  const rawRows = await reportRepository.getCGKehadiranReport(filters);
  const rows = rawRows.map(formatCgRowForExport);
  return { columns: CG_COLUMNS, rows: rows.slice(0, PREVIEW_LIMIT), total: rows.length };
}

const VOLUNTEER_COLUMNS = [
  { header: 'Nama Jemaat', key: 'nama_jemaat', widthWeight: 1.3 },
  { header: 'Nama Event', key: 'nama_event', widthWeight: 1.5 },
  { header: 'Waktu Mulai', key: 'waktu_mulai', widthWeight: 1.2 },
  { header: 'Jenis Volunteer', key: 'jenis_volunteer', widthWeight: 1.1 },
  { header: 'Status', key: 'status', widthWeight: 0.9 },
  { header: 'Durasi (menit)', key: 'durasi_menit', widthWeight: 0.9 },
  { header: 'Dibuat Pada', key: 'created_at', widthWeight: 1.2 },
];

/**
 * Generate laporan volunteer.
 * @param {{ jemaatId?, eventId?, startDate?, endDate?, format?: 'xlsx'|'pdf', filterDescription?: string }} filters
 * @param {{ actorUserId: number }} auth
 */
async function generateVolunteerReport({ format, filterDescription, ...filters } = {}, { actorUserId = null } = {}) {
  const validFormat = validateFormat(format);
  const rawRows = await reportRepository.getVolunteerReport(filters);
  const rows = rawRows.map(formatVolunteerRowForExport);

  return finalizeReport({
    total: rows.length, columns: VOLUNTEER_COLUMNS, rows, format: validFormat,
    jenis: 'VOLUNTEER', filters, actorUserId, filterDescription,
  });
}

/**
 * Preview laporan volunteer — lihat catatan previewEventReport, pola
 * yang sama.
 * @param {{ jemaatId?, eventId?, startDate?, endDate? }} filters
 * @returns {Promise<{ columns: Array, rows: Array, total: number }>}
 */
async function previewVolunteerReport(filters = {}) {
  const rawRows = await reportRepository.getVolunteerReport(filters);
  const rows = rawRows.map(formatVolunteerRowForExport);
  return { columns: VOLUNTEER_COLUMNS, rows: rows.slice(0, PREVIEW_LIMIT), total: rows.length };
}

const ANALYTICS_COLUMNS = [
  { header: 'Periode', key: 'periode' },
  { header: 'Jemaat Baru', key: 'jemaat_baru' },
  { header: 'Masih Aktif', key: 'masih_aktif' },
];

/**
 * Generate laporan analytics (tren pertumbuhan).
 * @param {{ bulan?: number, format?: 'xlsx'|'pdf', filterDescription?: string }} options
 * @param {{ actorUserId: number }} auth
 */
async function generateAnalyticsReport({ bulan = 12, format, filterDescription } = {}, { actorUserId = null } = {}) {
  const validFormat = validateFormat(format);
  const rawRows = await reportRepository.getAnalyticsReport({ bulan });
  const rows = rawRows.map(formatAnalyticsRowForExport);

  return finalizeReport({
    total: rows.length, columns: ANALYTICS_COLUMNS, rows, format: validFormat,
    jenis: 'ANALYTICS', filters: { bulan }, actorUserId, filterDescription,
  });
}

/**
 * Preview laporan analytics — lihat catatan previewEventReport, pola
 * yang sama (data analytics per-bulan biasanya sudah di bawah
 * PREVIEW_LIMIT baris, tapi tetap dislice untuk konsistensi kontrak).
 * @param {{ bulan?: number }} options
 * @returns {Promise<{ columns: Array, rows: Array, total: number }>}
 */
async function previewAnalyticsReport({ bulan = 12 } = {}) {
  const rawRows = await reportRepository.getAnalyticsReport({ bulan });
  const rows = rawRows.map(formatAnalyticsRowForExport);
  return { columns: ANALYTICS_COLUMNS, rows: rows.slice(0, PREVIEW_LIMIT), total: rows.length };
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
  computeColumnWidths,
  measureRowHeight,
  generateJemaatReport,
  generateEventReport,
  generateCGReport,
  generateVolunteerReport,
  generateAnalyticsReport,
  previewJemaatReport,
  previewEventReport,
  previewCGReport,
  previewVolunteerReport,
  previewAnalyticsReport,
  downloadReport,
  generateSignedToken,
  consumeSignedToken,
  isOutsideOperationalHours,
  dekripsiBarisJemaat,
  writeRowsToXlsx,
  writeRowsToPdf,
};
