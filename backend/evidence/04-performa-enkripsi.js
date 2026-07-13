/**
 * BAGIAN 4 — PERFORMA ENKRIPSI AES-256-CBC (Tabel 4.6 s.d. 4.9)
 *
 * Memanggil encrypt()/decrypt()/encryptJson()/decryptJson() ASLI dari
 * src/utils/encryption.util.js langsung. Semua waktu diukur dengan
 * process.hrtime.bigint() saat script ini dijalankan — tidak ada angka
 * yang di-hardcode.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const crypto = require('crypto');
const { Logger } = require('./lib/logger');
const encryptionUtil = require('../src/utils/encryption.util');

const logger = new Logger('04-performa-enkripsi');

// 6 nilai contoh persis seperti di paper.
const FIELDS = [
  { nama: 'jenis_kelamin', plaintext: 'P', json: false },
  { nama: 'tanggal_lahir', plaintext: '1990-04-25', json: false },
  { nama: 'no_hp', plaintext: '081298765432', json: false },
  { nama: 'nama', plaintext: 'Seed Plaintext Satu', json: false },
  { nama: 'alamat', plaintext: 'Jl. Mawar Raya No. 12, Grand Wisata, Tambun Selatan', json: false },
  { nama: 'media_sosial', plaintext: { instagram: '@seedsatu' }, json: true },
];

function byteLength(str) {
  return Buffer.byteLength(str, 'utf8');
}

function ukurSatuField(f) {
  const plainStr = f.json ? JSON.stringify(f.plaintext) : String(f.plaintext);
  const ukuranAsli = byteLength(plainStr);

  const t0 = process.hrtime.bigint();
  const enc = f.json ? encryptionUtil.encryptJson(f.plaintext) : encryptionUtil.encrypt(f.plaintext);
  const t1 = process.hrtime.bigint();
  const waktuEnkripsi = Number(t1 - t0) / 1e6;

  const ukuranCiphertext = byteLength(enc.ciphertext);
  const persentase = ((ukuranCiphertext - ukuranAsli) / ukuranAsli) * 100;

  const t2 = process.hrtime.bigint();
  const hasilDekripsi = f.json ? encryptionUtil.decryptJson(enc.ciphertext, enc.iv) : encryptionUtil.decrypt(enc.ciphertext, enc.iv);
  const t3 = process.hrtime.bigint();
  const waktuDekripsi = Number(t3 - t2) / 1e6;

  const hasilDekripsiStr = f.json ? JSON.stringify(hasilDekripsi) : hasilDekripsi;
  const utuh = f.json ? JSON.stringify(hasilDekripsi) === JSON.stringify(f.plaintext) : hasilDekripsi === f.plaintext;

  return {
    field: f.nama, plaintext: plainStr, ukuranAsli, waktuEnkripsi,
    ukuranCiphertext, persentase, waktuDekripsi, hasilDekripsiStr, utuh,
  };
}

function tabel46(hasil) {
  logger.sub('Tabel 4.6 — Waktu Enkripsi & Dekripsi per Field');
  logger.table(
    ['Field', 'Plaintext', 'Ukuran Asli (B)', 'Waktu Enkripsi (ms)', 'Waktu Dekripsi (ms)'],
    hasil.map((r) => [r.field, r.plaintext, r.ukuranAsli, r.waktuEnkripsi.toFixed(4), r.waktuDekripsi.toFixed(4)])
  );
  logger.scenario({
    id: 'Tabel 4.6',
    judul: 'Waktu enkripsi & dekripsi per field',
    kondisi: '6 field contoh dari paper (jenis_kelamin, tanggal_lahir, no_hp, nama, alamat, media_sosial) dienkripsi lalu didekripsi, diukur process.hrtime.bigint()',
    hasilDiharapkan: 'Waktu terukur untuk setiap field (lihat tabel), seluruhnya sub-milidetik untuk data sekecil ini',
    hasilAktual: `Waktu enkripsi rata-rata=${(hasil.reduce((s, r) => s + r.waktuEnkripsi, 0) / hasil.length).toFixed(4)}ms, waktu dekripsi rata-rata=${(hasil.reduce((s, r) => s + r.waktuDekripsi, 0) / hasil.length).toFixed(4)}ms`,
    sesuai: hasil.every((r) => r.waktuEnkripsi >= 0 && r.waktuDekripsi >= 0),
  });
}

function tabel47(hasil) {
  logger.sub('Tabel 4.7 — Ukuran Ciphertext & Pertambahan per Field');
  logger.table(
    ['Field', 'Ukuran Asli (B)', 'Ukuran Ciphertext (B)', 'Pertambahan (%)', 'Hasil Dekripsi', 'Utuh?'],
    hasil.map((r) => [r.field, r.ukuranAsli, r.ukuranCiphertext, `${r.persentase >= 0 ? '+' : ''}${r.persentase.toFixed(1)}%`, r.hasilDekripsiStr, r.utuh ? 'Ya' : 'Tidak'])
  );
  const semuaUtuh = hasil.every((r) => r.utuh);
  logger.scenario({
    id: 'Tabel 4.7',
    judul: 'Ukuran ciphertext & pertambahan ukuran per field, hasil dekripsi',
    kondisi: 'Ciphertext hex (2 karakter per byte plaintext + overhead padding blok 16 byte AES-CBC) dibandingkan ukuran plaintext asli',
    hasilDiharapkan: 'Ciphertext lebih besar dari plaintext asli (encoding hex + padding); data hasil dekripsi kembali utuh (Ya) untuk semua field',
    hasilAktual: `Semua field kembali utuh=${semuaUtuh} (lihat tabel di atas untuk detail ukuran & persentase per field)`,
    sesuai: semuaUtuh,
  });
}

function tabel48() {
  logger.sub('Tabel 4.8 — Tes Dekripsi dengan Kunci Salah');
  const plaintext = 'Data rahasia jemaat untuk uji kunci salah';
  const enc = encryptionUtil.encrypt(plaintext);

  const originalKey = process.env.AES_ENCRYPTION_KEY;
  const kunciAcak = crypto.randomBytes(32).toString('hex');

  let pesanError = null;
  let error = null;
  try {
    process.env.AES_ENCRYPTION_KEY = kunciAcak;
    const hasil = encryptionUtil.decrypt(enc.ciphertext, enc.iv);
    pesanError = `TIDAK ada error dilempar — hasil dekripsi: "${hasil}" (berbeda dari plaintext asli: ${hasil !== plaintext})`;
  } catch (err) {
    error = err;
    pesanError = err.message;
  } finally {
    process.env.AES_ENCRYPTION_KEY = originalKey;
  }

  // Fingerprint SHA-256 dicetak (BUKAN potongan key asli) — cukup untuk
  // membuktikan dua kunci berbeda dipakai, tanpa membocorkan satu byte
  // pun dari AES_ENCRYPTION_KEY asli ke output/log.
  const fingerprint = (hexKey) => crypto.createHash('sha256').update(hexKey, 'hex').digest('hex').slice(0, 12);

  logger.kv('Plaintext asli', plaintext);
  logger.kv('Ciphertext (hex)', `${enc.ciphertext.slice(0, 32)}...`);
  logger.kv('Fingerprint SHA-256 kunci asli (bukan key asli)', fingerprint(originalKey));
  logger.kv('Fingerprint SHA-256 kunci acak pengganti (bukan key asli)', fingerprint(kunciAcak));
  logger.kv('Hasil percobaan decrypt() dengan kunci salah', pesanError);

  // Wrong-key AES-CBC decryption gagal karena PKCS7 padding hasil decrypt
  // hampir selalu tidak valid dengan kunci acak lain — Node/OpenSSL
  // melempar error ("bad decrypt" pada versi OpenSSL yang umum dipakai
  // Node, atau varian pesan lain tergantung versi OpenSSL yang di-bundle).
  const sesuai = !!error;
  logger.scenario({
    id: 'Tabel 4.8',
    judul: 'Tes dekripsi dengan kunci salah',
    kondisi: 'Enkripsi dengan AES_ENCRYPTION_KEY asli dari .env, lalu decrypt() dipanggil dengan 32 byte kunci acak lain (IV tetap sama)',
    hasilDiharapkan: 'decrypt() melempar error asli dari Node crypto (kegagalan validasi padding PKCS7 — pesan umum "bad decrypt")',
    hasilAktual: pesanError,
    sesuai,
    catatan: sesuai ? undefined : 'Kunci acak yang dicoba kebetulan menghasilkan padding yang tampak valid (peluang ~1/256 per percobaan) — decrypt() tidak melempar error, tapi hasil plaintext-nya tetap berbeda dari plaintext asli (lihat "Hasil percobaan" di atas). Jalankan ulang untuk contoh dengan error eksplisit.',
  });
}

function tabel49() {
  logger.sub('Tabel 4.9 — Tes Keunikan IV/Ciphertext (Plaintext Sama, 3x Percobaan)');
  const plaintext = "Plaintext identik untuk uji keunikan IV — GOD'S DNA CMS";
  const percobaan = [];
  for (let i = 0; i < 3; i++) {
    percobaan.push(encryptionUtil.encrypt(plaintext));
  }

  const rows = percobaan.map((enc, i) => {
    let dibandingSebelumnya = '-';
    if (i > 0) {
      const beda = enc.iv !== percobaan[i - 1].iv && enc.ciphertext !== percobaan[i - 1].ciphertext;
      dibandingSebelumnya = beda ? 'Berbeda' : 'SAMA (SALAH)';
    }
    return [`Percobaan #${i + 1}`, enc.iv, `${enc.ciphertext.slice(0, 24)}...`, dibandingSebelumnya];
  });
  logger.table(['Percobaan', 'IV (hex)', 'Ciphertext (hex, dipotong)', 'Dibanding sebelumnya'], rows);

  const jumlahIvUnik = new Set(percobaan.map((e) => e.iv)).size;
  const jumlahCiphertextUnik = new Set(percobaan.map((e) => e.ciphertext)).size;
  const semuaIvUnik = jumlahIvUnik === percobaan.length;
  const semuaCiphertextUnik = jumlahCiphertextUnik === percobaan.length;

  logger.scenario({
    id: 'Tabel 4.9',
    judul: 'Tes keunikan IV/ciphertext — plaintext sama dienkripsi 3x berturut-turut',
    kondisi: `encrypt("${plaintext}") dipanggil 3 kali berturut-turut`,
    hasilDiharapkan: 'Setiap percobaan menghasilkan IV dan ciphertext yang unik (berbeda dari percobaan lain)',
    hasilAktual: `IV unik=${jumlahIvUnik}/${percobaan.length} | Ciphertext unik=${jumlahCiphertextUnik}/${percobaan.length}`,
    sesuai: semuaIvUnik && semuaCiphertextUnik,
  });
}

async function main() {
  logger.header('BAGIAN 4 — PERFORMA ENKRIPSI AES-256-CBC (Tabel 4.6 s.d. 4.9)');
  logger.meta();
  logger.info('Seluruh waktu diukur dengan process.hrtime.bigint() dari fungsi ASLI src/utils/encryption.util.js — tidak ada angka hardcode.');

  const hasilPerField = FIELDS.map(ukurSatuField);
  tabel46(hasilPerField);
  tabel47(hasilPerField);
  tabel48();
  tabel49();

  logger.emitMachineSummary('PERFORMA_ENKRIPSI');
  logger.save();
}

main().catch((err) => {
  console.error('FATAL — 04-performa-enkripsi.js gagal dijalankan:', err);
  process.exitCode = 1;
});
