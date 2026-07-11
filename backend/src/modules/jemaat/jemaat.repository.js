const { getPool } = require('../../config/database');
const { encrypt, decrypt, decryptOptional, encryptJson, decryptJson } = require('../../utils/encryption.util');
const { hashPhone } = require('../../utils/hash.util');

const SENSITIVE_FIELDS = ['no_hp', 'alamat', 'media_sosial'];
const DATE_ONLY_COLUMNS = ['tgl_lahir', 'tgl_bergabung', 'new_member_until'];

/**
 * Dua tingkat sensitivitas enkripsi pada tabel jemaat:
 *
 * 1. SENSITIVE_FIELDS (no_hp, alamat, media_sosial):
 *    ciphertext-by-default — response GET biasa mengembalikan
 *    ciphertext, plaintext hanya lewat GET /jemaat/:id/sensitive/:field
 *    (dengan audit log VIEW_SENSITIVE).
 *
 * 2. IDENTITY_FIELDS (nama, tgl_lahir, jenis_kelamin):
 *    terenkripsi at-rest di database (migration 005), tapi didekripsi
 *    OTOMATIS di setiap response GET (list maupun detail), karena
 *    dibutuhkan untuk tampilan dasar — daftar jemaat, dropdown pilih
 *    jemaat, dsb. Tidak realistis memanggil endpoint /sensitive
 *    terpisah hanya untuk menampilkan nama di setiap baris tabel.
 */
const IDENTITY_FIELDS = ['nama', 'tgl_lahir', 'jenis_kelamin'];

/**
 * Mengembalikan salinan row dengan nama/tgl_lahir/jenis_kelamin
 * dalam bentuk plaintext (didekripsi memakai kolom _iv masing-masing).
 * Baris lama yang belum di-backfill (_iv NULL) diteruskan apa adanya.
 * Kolom _iv dibiarkan ada — pemanggil memutuskan mau menyaringnya
 * atau tidak (konsisten dengan no_hp_iv yang juga ikut di SELECT *).
 */
function decryptIdentityFields(row) {
  if (!row) return row;
  const result = { ...row };
  for (const field of IDENTITY_FIELDS) {
    if (field in result) {
      result[field] = decryptOptional(result[field], row[`${field}_iv`]);
    }
  }
  return result;
}

/**
 * Mengonversi kolom bertipe DATE (yang dikembalikan mysql2 sebagai
 * Date object dalam local midnight) menjadi string YYYY-MM-DD murni
 * menggunakan komponen LOKAL (bukan toISOString/JSON serialize, yang
 * mengonversi ke UTC dan bisa menggeser tanggal mundur satu hari
 * untuk timezone positif seperti WIB/UTC+7).
 *
 * Tanpa normalisasi ini, setiap kali row dikembalikan ke caller
 * (service, controller, lalu di-serialize jadi JSON oleh Express),
 * nilai tanggal bisa bergeser — menyebabkan perbandingan tanggal
 * (misal deteksi duplikat) gagal secara halus dan sulit dilacak.
 */
function normalizeDateFields(row) {
  if (!row) return row;

  const normalized = { ...row };
  for (const column of DATE_ONLY_COLUMNS) {
    const value = normalized[column];
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      normalized[column] = `${year}-${month}-${day}`;
    }
  }
  return normalized;
}

function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = 1 + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]);
      }
    }
  }

  return matrix[a.length][b.length];
}

function isSimilarName(nameA, nameB) {
  const distance = levenshteinDistance(nameA.toLowerCase(), nameB.toLowerCase());
  return distance <= 2;
}

async function create(data) {
  const pool = getPool();

  // Field identitas dienkripsi dengan IV baru per field (pola sama
  // seperti no_hp/alamat/media_sosial) — lihat IDENTITY_FIELDS di atas.
  const namaEnc = encrypt(String(data.nama));
  const tglLahirEnc = encrypt(String(data.tgl_lahir));
  const jenisKelaminEnc = encrypt(String(data.jenis_kelamin));

  const noHpEnc = data.no_hp ? encrypt(data.no_hp) : null;
  const alamatEnc = data.alamat ? encrypt(data.alamat) : null;
  const mediaSosialEnc = data.media_sosial ? encryptJson(data.media_sosial) : null;

  const tglBergabung = new Date(data.tgl_bergabung);
  const newMemberUntil = new Date(tglBergabung);
  newMemberUntil.setDate(newMemberUntil.getDate() + 30);

  const [result] = await pool.query(
    `INSERT INTO jemaat (
      nama, nama_iv, tgl_lahir, tgl_lahir_iv, jenis_kelamin, jenis_kelamin_iv,
      no_hp, no_hp_iv, no_hp_hash, alamat, alamat_iv, media_sosial, media_sosial_iv,
      tgl_bergabung, is_active, is_new_member, new_member_until,
      is_non_cg, skor_keaktifan, status_keaktifan
    ) VALUES (
      :nama, :namaIv, :tglLahir, :tglLahirIv, :jenisKelamin, :jenisKelaminIv,
      :noHp, :noHpIv, :noHpHash, :alamat, :alamatIv, :mediaSosial, :mediaSosialIv,
      :tglBergabung, TRUE, TRUE, :newMemberUntil,
      TRUE, 0, 'BELUM_CUKUP_DATA'
    )`,
    {
      nama: namaEnc.ciphertext,
      namaIv: namaEnc.iv,
      tglLahir: tglLahirEnc.ciphertext,
      tglLahirIv: tglLahirEnc.iv,
      jenisKelamin: jenisKelaminEnc.ciphertext,
      jenisKelaminIv: jenisKelaminEnc.iv,
      noHp: noHpEnc ? noHpEnc.ciphertext : null,
      noHpIv: noHpEnc ? noHpEnc.iv : null,
      noHpHash: data.no_hp ? hashPhone(data.no_hp) : null,
      alamat: alamatEnc ? alamatEnc.ciphertext : null,
      alamatIv: alamatEnc ? alamatEnc.iv : null,
      mediaSosial: mediaSosialEnc ? mediaSosialEnc.ciphertext : null,
      mediaSosialIv: mediaSosialEnc ? mediaSosialEnc.iv : null,
      tglBergabung: data.tgl_bergabung,
      newMemberUntil: newMemberUntil.toISOString().slice(0, 10),
    }
  );

  return result.insertId;
}

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM jemaat WHERE id = :id AND deleted_at IS NULL LIMIT 1',
    { id }
  );
  if (!rows[0]) return null;

  // Field identitas (nama, tgl_lahir, jenis_kelamin) didekripsi otomatis
  // sebelum dikembalikan — transparan bagi konsumen API. no_hp/alamat/
  // media_sosial TETAP ciphertext di sini (ciphertext-by-default).
  return normalizeDateFields(decryptIdentityFields(rows[0]));
}

async function findByIdDecrypted(id) {
  const row = await findById(id);
  if (!row) return null;

  return {
    ...row,
    no_hp: row.no_hp && row.no_hp_iv ? decrypt(row.no_hp, row.no_hp_iv) : null,
    alamat: row.alamat && row.alamat_iv ? decrypt(row.alamat, row.alamat_iv) : null,
    media_sosial:
      row.media_sosial && row.media_sosial_iv
        ? decryptJson(row.media_sosial, row.media_sosial_iv)
        : null,
  };
}

async function update(id, updates) {
  const pool = getPool();
  const setClauses = [];
  const params = { id };

  const fieldColumnMap = {
    tgl_bergabung: 'tgl_bergabung',
    is_active: 'is_active',
  };

  for (const [field, column] of Object.entries(fieldColumnMap)) {
    if (updates[field] !== undefined) {
      setClauses.push(`${column} = :${field}`);
      params[field] = updates[field];
    }
  }

  // Field identitas: enkripsi dengan IV baru per operasi write,
  // pola sama seperti no_hp/alamat/media_sosial di bawah.
  const identityParamMap = {
    nama: ['nama', 'namaIv'],
    tgl_lahir: ['tglLahir', 'tglLahirIv'],
    jenis_kelamin: ['jenisKelamin', 'jenisKelaminIv'],
  };

  for (const [field, [valueParam, ivParam]] of Object.entries(identityParamMap)) {
    if (updates[field] !== undefined) {
      const enc = encrypt(String(updates[field]));
      setClauses.push(`${field} = :${valueParam}`, `${field}_iv = :${ivParam}`);
      params[valueParam] = enc.ciphertext;
      params[ivParam] = enc.iv;
    }
  }

  if (updates.no_hp !== undefined) {
    const enc = updates.no_hp ? encrypt(updates.no_hp) : null;
    setClauses.push('no_hp = :noHp', 'no_hp_iv = :noHpIv', 'no_hp_hash = :noHpHash');
    params.noHp = enc ? enc.ciphertext : null;
    params.noHpIv = enc ? enc.iv : null;
    params.noHpHash = updates.no_hp ? hashPhone(updates.no_hp) : null;
  }

  if (updates.alamat !== undefined) {
    const enc = updates.alamat ? encrypt(updates.alamat) : null;
    setClauses.push('alamat = :alamat', 'alamat_iv = :alamatIv');
    params.alamat = enc ? enc.ciphertext : null;
    params.alamatIv = enc ? enc.iv : null;
  }

  if (updates.media_sosial !== undefined) {
    const enc = updates.media_sosial ? encryptJson(updates.media_sosial) : null;
    setClauses.push('media_sosial = :mediaSosial', 'media_sosial_iv = :mediaSosialIv');
    params.mediaSosial = enc ? enc.ciphertext : null;
    params.mediaSosialIv = enc ? enc.iv : null;
  }

  if (setClauses.length === 0) {
    return;
  }

  await pool.query(
    `UPDATE jemaat SET ${setClauses.join(', ')} WHERE id = :id`,
    params
  );
}

async function softDelete(id) {
  const pool = getPool();
  await pool.query(
    'UPDATE jemaat SET deleted_at = NOW(), is_active = FALSE WHERE id = :id',
    { id }
  );
}

async function findDuplicateCandidatesByNameAndBirthdate(nama, tglLahir) {
  const pool = getPool();

  // Redesain pasca-enkripsi identitas (migration 005): nama dan
  // tgl_lahir tersimpan sebagai ciphertext dengan IV acak per baris,
  // sehingga WHERE tgl_lahir = ... dan perbandingan nama via SQL tidak
  // mungkin lagi. Sebagai gantinya: ambil seluruh jemaat yang belum
  // soft-delete, dekripsi nama+tgl_lahir per baris di memori, lalu
  // jalankan levenshteinDistance/isSimilarName pada hasil dekripsi —
  // logika kemiripan nama itu sendiri tidak berubah, hanya sumber
  // datanya. Trade-off: full-scan + dekripsi per baris lebih lambat
  // untuk jumlah jemaat sangat besar (ribuan+) dibanding query
  // ber-index, tapi diperlukan demi enkripsi at-rest.
  // (findDuplicateCandidatesByPhone tidak terpengaruh — tetap memakai
  // no_hp_hash ber-index.)
  const [rows] = await pool.query(
    `SELECT id, nama, nama_iv, tgl_lahir, tgl_lahir_iv
     FROM jemaat WHERE deleted_at IS NULL`
  );

  const targetTglLahir = String(tglLahir);

  return rows
    .map((row) => normalizeDateFields(decryptIdentityFields(row)))
    .filter(
      (row) =>
        String(row.tgl_lahir) === targetTglLahir && isSimilarName(row.nama, nama)
    )
    .map((row) => ({ id: row.id, nama: row.nama }));
}

async function findDuplicateCandidatesByPhone(noHpPlaintext) {
  const pool = getPool();
  // Audit item 5: pencarian via kolom ber-index no_hp_hash, bukan
  // full-scan + dekripsi massal. Hash dihitung dengan normalisasi yang
  // sama seperti saat create/update sehingga pencocokan konsisten.
  const [rows] = await pool.query(
    `SELECT id, nama FROM jemaat
     WHERE no_hp_hash = :hash AND deleted_at IS NULL`,
    { hash: hashPhone(noHpPlaintext) }
  );

  return rows;
}

async function checkDependencies(jemaatId) {
  const pool = getPool();

  const [leaderRows] = await pool.query(
    `SELECT id, nama FROM cell_group WHERE leader_id = :jemaatId AND is_active = TRUE AND deleted_at IS NULL`,
    { jemaatId }
  );

  const [volunteerRows] = await pool.query(
    `SELECT ev.id, e.judul, e.waktu_mulai
     FROM event_volunteer ev
     JOIN event e ON ev.event_id = e.id
     WHERE ev.jemaat_id = :jemaatId
       AND ev.status = 'AKTIF'
       AND e.waktu_mulai > NOW()
       AND e.status IN ('DRAFT', 'PUBLISHED', 'AKTIF')`,
    { jemaatId }
  );

  const [memberRows] = await pool.query(
    `SELECT cgm.id, cg.nama
     FROM cell_group_members cgm
     JOIN cell_group cg ON cgm.cg_id = cg.id
     WHERE cgm.jemaat_id = :jemaatId AND cgm.left_at IS NULL AND cg.deleted_at IS NULL`,
    { jemaatId }
  );

  return {
    isLeaderOfActiveCg: leaderRows,
    scheduledAsVolunteer: volunteerRows,
    activeMemberOfCg: memberRows,
  };
}

async function findAll({ search, limit = 50, offset = 0 } = {}) {
  const pool = getPool();

  // Redesain pasca-enkripsi identitas (migration 005): kolom nama
  // berisi ciphertext dengan IV acak per baris, jadi `nama LIKE ...`,
  // `ORDER BY nama`, dan LIMIT/OFFSET di level SQL tidak valid lagi.
  // Alurnya sekarang:
  //   1. Ambil seluruh jemaat aktif dari DB (tanpa LIMIT SQL).
  //   2. Dekripsi nama/tgl_lahir/jenis_kelamin tiap baris.
  //   3. Filter search (substring case-insensitive) SETELAH dekripsi.
  //   4. Sort nama di level aplikasi.
  //   5. Pagination SETELAH filtering (slice di aplikasi).
  // Trade-off: pendekatan ini bisa lebih lambat untuk jumlah jemaat
  // yang sangat besar (ribuan+) dibanding LIKE + LIMIT native SQL,
  // tapi diperlukan karena nama tidak lagi tersimpan sebagai plaintext
  // yang bisa di-query langsung.
  // TODO: jika volume jemaat tumbuh besar, pertimbangkan kolom hash
  // pencarian (mis. nama_search_hash berisi HMAC dari nama lowercase,
  // atau n-gram/token hash untuk substring match) yang di-index —
  // sehingga filter bisa kembali dilakukan di SQL tanpa membuka
  // plaintext, dan dekripsi cukup untuk halaman yang diminta saja.
  const [rows] = await pool.query(
    `SELECT id, nama, nama_iv, tgl_lahir, tgl_lahir_iv,
            jenis_kelamin, jenis_kelamin_iv, tgl_bergabung,
            is_active, is_new_member, skor_keaktifan, status_keaktifan,
            created_at
     FROM jemaat
     WHERE is_active = TRUE AND deleted_at IS NULL`
  );

  let decrypted = rows.map((row) => {
    const { nama_iv, tgl_lahir_iv, jenis_kelamin_iv, ...rest } = decryptIdentityFields(row);
    return normalizeDateFields(rest);
  });

  if (search) {
    const needle = String(search).toLowerCase();
    decrypted = decrypted.filter(
      (row) => typeof row.nama === 'string' && row.nama.toLowerCase().includes(needle)
    );
  }

  decrypted.sort((a, b) => String(a.nama).localeCompare(String(b.nama)));

  const start = Number(offset) || 0;
  const size = Number(limit) || 50;
  return decrypted.slice(start, start + size);
}

/**
 * Mengambil daftar CG yang saat ini diikuti oleh seorang jemaat (left_at IS NULL).
 *
 * @param {number} jemaatId
 * @returns {Promise<Array<object>>}
 */
async function findCgsByJemaatId(jemaatId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT cg.id, cg.nama, cg.deskripsi, cg.is_active, cgm.joined_at
     FROM cell_group_members cgm
     JOIN cell_group cg ON cgm.cg_id = cg.id
     WHERE cgm.jemaat_id = :jemaatId AND cgm.left_at IS NULL AND cg.deleted_at IS NULL
     ORDER BY cgm.joined_at ASC`,
    { jemaatId }
  );
  return rows;
}

/**
 * Mengambil riwayat event yang dihadiri oleh seorang jemaat,
 * bersumber dari event_attendances (termasuk auto-insert dari volunteer).
 * Record yang di-void tidak ditampilkan.
 *
 * @param {number} jemaatId
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<Array<object>>}
 */
async function findEventsByJemaatId(jemaatId, { limit = 20, offset = 0 } = {}) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT e.id, e.judul, e.jenis, e.waktu_mulai, e.waktu_selesai, e.status,
            ea.created_at AS hadir_at
     FROM event_attendances ea
     JOIN event e ON ea.event_id = e.id
     WHERE ea.jemaat_id = :jemaatId AND ea.is_voided = FALSE
     ORDER BY e.waktu_mulai DESC
     LIMIT :limit OFFSET :offset`,
    { jemaatId, limit: Number(limit), offset: Number(offset) }
  );
  return rows;
}

/**
 * Cell Group aktif yang dipimpin jemaat ini (leader_id = jemaatId).
 * Query sama persis dengan bagian isLeaderOfActiveCg di
 * checkDependencies() — dipakai di sini sebagai info profil biasa
 * (bukan cuma reaktif saat cek dependensi hapus).
 * @param {number} jemaatId
 * @returns {Promise<Array<{id: number, nama: string}>>}
 */
async function findLedCellGroups(jemaatId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, nama FROM cell_group WHERE leader_id = :jemaatId AND is_active = TRUE AND deleted_at IS NULL`,
    { jemaatId }
  );
  return rows;
}

module.exports = {
  create,
  findById,
  findAll,
  findByIdDecrypted,
  update,
  softDelete,
  findDuplicateCandidatesByNameAndBirthdate,
  findDuplicateCandidatesByPhone,
  checkDependencies,
  findCgsByJemaatId,
  findEventsByJemaatId,
  findLedCellGroups,
  isSimilarName,
  levenshteinDistance,
  normalizeDateFields,
};