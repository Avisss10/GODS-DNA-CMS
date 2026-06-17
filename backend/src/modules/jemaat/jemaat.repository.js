const { getPool } = require('../../config/database');
const { encrypt, decrypt, encryptJson, decryptJson } = require('../../utils/encryption.util');

const SENSITIVE_FIELDS = ['no_hp', 'alamat', 'media_sosial'];

/**
 * Menghitung jarak Levenshtein sederhana antara dua string,
 * dipakai untuk deteksi duplikat nama secara fuzzy (BAGIAN 2.1
 * langkah 2a) tanpa bergantung ekstensi database khusus.
 */
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

/**
 * Menentukan apakah dua nama "mirip" — threshold sederhana:
 * jarak Levenshtein <= 2 (case-insensitive), cukup untuk menangkap
 * typo umum tanpa membuat banyak false-positive.
 */
function isSimilarName(nameA, nameB) {
  const distance = levenshteinDistance(nameA.toLowerCase(), nameB.toLowerCase());
  return distance <= 2;
}

/**
 * Membuat jemaat baru. Field sensitif (no_hp, alamat, media_sosial)
 * dienkripsi sebelum INSERT (BAGIAN 2.1 langkah 3). is_new_member
 * dan new_member_until otomatis di-set (BAGIAN 2.1 langkah 4).
 *
 * @param {object} data - field plaintext jemaat
 * @returns {Promise<number>} id jemaat baru
 */
async function create(data) {
  const pool = getPool();

  const noHpEnc = data.no_hp ? encrypt(data.no_hp) : null;
  const alamatEnc = data.alamat ? encrypt(data.alamat) : null;
  const mediaSosialEnc = data.media_sosial ? encryptJson(data.media_sosial) : null;

  const tglBergabung = new Date(data.tgl_bergabung);
  const newMemberUntil = new Date(tglBergabung);
  newMemberUntil.setDate(newMemberUntil.getDate() + 30);

  const [result] = await pool.query(
    `INSERT INTO jemaat (
      nama, tgl_lahir, jenis_kelamin,
      no_hp, no_hp_iv, alamat, alamat_iv, media_sosial, media_sosial_iv,
      tgl_bergabung, is_active, is_new_member, new_member_until,
      is_non_cg, skor_keaktifan, status_keaktifan
    ) VALUES (
      :nama, :tglLahir, :jenisKelamin,
      :noHp, :noHpIv, :alamat, :alamatIv, :mediaSosial, :mediaSosialIv,
      :tglBergabung, TRUE, TRUE, :newMemberUntil,
      TRUE, 0, 'BELUM_CUKUP_DATA'
    )`,
    {
      nama: data.nama,
      tglLahir: data.tgl_lahir,
      jenisKelamin: data.jenis_kelamin,
      noHp: noHpEnc ? noHpEnc.ciphertext : null,
      noHpIv: noHpEnc ? noHpEnc.iv : null,
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

/**
 * Mencari jemaat by id. Mengembalikan data MENTAH (ciphertext + IV
 * untuk field sensitif, tidak didekripsi) — sesuai BAGIAN 2.5:
 * default tampil ●●●●●●, dekripsi hanya on-demand via
 * findByIdDecrypted().
 *
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM jemaat WHERE id = :id AND deleted_at IS NULL LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

/**
 * Sama seperti findById, tapi field sensitif didekripsi menjadi
 * plaintext. Dipakai khusus saat user klik "Tampilkan" (BAGIAN 2.5)
 * — pemanggilan fungsi ini SEHARUSNYA selalu diiringi audit_log
 * aksi=VIEW_SENSITIVE oleh service layer (BAGIAN 2.5), bukan oleh
 * repository ini.
 *
 * @param {number} id
 * @returns {Promise<object|null>}
 */
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

/**
 * Memperbarui data jemaat. Jika field sensitif diubah (ada di
 * `updates`), generate IV baru dan enkripsi ulang (BAGIAN 2.3:
 * "IV baru setiap kali field sensitif diedit").
 *
 * @param {number} id
 * @param {object} updates - field yang ingin diubah (plaintext untuk field sensitif)
 */
async function update(id, updates) {
  const pool = getPool();
  const setClauses = [];
  const params = { id };

  const fieldColumnMap = {
    nama: 'nama',
    tgl_lahir: 'tgl_lahir',
    jenis_kelamin: 'jenis_kelamin',
    tgl_bergabung: 'tgl_bergabung',
    is_active: 'is_active',
  };

  for (const [field, column] of Object.entries(fieldColumnMap)) {
    if (updates[field] !== undefined) {
      setClauses.push(`${column} = :${field}`);
      params[field] = updates[field];
    }
  }

  if (updates.no_hp !== undefined) {
    const enc = updates.no_hp ? encrypt(updates.no_hp) : null;
    setClauses.push('no_hp = :noHp', 'no_hp_iv = :noHpIv');
    params.noHp = enc ? enc.ciphertext : null;
    params.noHpIv = enc ? enc.iv : null;
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

/**
 * Soft delete jemaat (BAGIAN 2.4 langkah 4): set deleted_at = NOW(),
 * is_active = false. Pengecekan dependensi (langkah 1-2) dilakukan
 * TERPISAH oleh checkDependencies() — dipanggil service layer
 * SEBELUM memanggil fungsi ini.
 *
 * @param {number} id
 */
async function softDelete(id) {
  const pool = getPool();
  await pool.query(
    'UPDATE jemaat SET deleted_at = NOW(), is_active = FALSE WHERE id = :id',
    { id }
  );
}

/**
 * Mencari kandidat duplikat berdasarkan nama+tgl_lahir mirip
 * (BAGIAN 2.1 langkah 2a). Strategi: filter exact tgl_lahir dulu
 * (mengurangi kandidat signifikan), lalu fuzzy match nama di
 * application layer.
 *
 * @param {string} nama
 * @param {string} tglLahir format YYYY-MM-DD
 * @returns {Promise<Array<{id: number, nama: string}>>}
 */
async function findDuplicateCandidatesByNameAndBirthdate(nama, tglLahir) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, nama FROM jemaat WHERE tgl_lahir = :tglLahir AND deleted_at IS NULL`,
    { tglLahir }
  );

  return rows.filter((row) => isSimilarName(row.nama, nama));
}

/**
 * Mencari kandidat duplikat berdasarkan no_hp yang sama (BAGIAN 2.1
 * langkah 2b). Karena no_hp dienkripsi dengan IV acak per baris,
 * ciphertext tidak bisa di-WHERE langsung — harus dekripsi SEMUA
 * baris dengan no_hp terisi, lalu bandingkan plaintext.
 *
 * Catatan performa: untuk skala 1 gereja (ratusan-ribuan jemaat),
 * ini cukup efisien. Jika skala jauh lebih besar di masa depan,
 * pendekatan lain (misal HMAC deterministik tambahan untuk index)
 * bisa dipertimbangkan — di luar scope dokumen saat ini.
 *
 * @param {string} noHpPlaintext
 * @returns {Promise<Array<{id: number, nama: string}>>}
 */
async function findDuplicateCandidatesByPhone(noHpPlaintext) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, nama, no_hp, no_hp_iv FROM jemaat
     WHERE no_hp IS NOT NULL AND no_hp_iv IS NOT NULL AND deleted_at IS NULL`
  );

  const matches = [];
  for (const row of rows) {
    try {
      const decrypted = decrypt(row.no_hp, row.no_hp_iv);
      if (decrypted === noHpPlaintext) {
        matches.push({ id: row.id, nama: row.nama });
      }
    } catch (err) {
      // Skip baris yang gagal didekripsi (data korup/IV tidak cocok) —
      // tidak menggagalkan keseluruhan pengecekan duplikat.
    }
  }

  return matches;
}

/**
 * Mengecek dependensi aktif sebelum soft delete (BAGIAN 2.4):
 * a. leader CG aktif
 * b. terjadwal volunteer di event mendatang
 * c. masih anggota CG aktif
 *
 * @param {number} jemaatId
 * @returns {Promise<{ isLeaderOfActiveCg: Array, scheduledAsVolunteer: Array, activeMemberOfCg: Array }>}
 */
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

module.exports = {
  create,
  findById,
  findByIdDecrypted,
  update,
  softDelete,
  findDuplicateCandidatesByNameAndBirthdate,
  findDuplicateCandidatesByPhone,
  checkDependencies,
  isSimilarName,
  levenshteinDistance,
};