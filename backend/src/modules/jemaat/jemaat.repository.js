const { getPool } = require('../../config/database');
const { encrypt, decrypt, encryptJson, decryptJson } = require('../../utils/encryption.util');

const SENSITIVE_FIELDS = ['no_hp', 'alamat', 'media_sosial'];
const DATE_ONLY_COLUMNS = ['tgl_lahir', 'tgl_bergabung', 'new_member_until'];

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

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM jemaat WHERE id = :id AND deleted_at IS NULL LIMIT 1',
    { id }
  );
  return normalizeDateFields(rows[0]) || null;
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

async function softDelete(id) {
  const pool = getPool();
  await pool.query(
    'UPDATE jemaat SET deleted_at = NOW(), is_active = FALSE WHERE id = :id',
    { id }
  );
}

async function findDuplicateCandidatesByNameAndBirthdate(nama, tglLahir) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, nama FROM jemaat WHERE tgl_lahir = :tglLahir AND deleted_at IS NULL`,
    { tglLahir }
  );

  return rows.filter((row) => isSimilarName(row.nama, nama));
}

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
      // Skip baris yang gagal didekripsi (data korup/IV tidak cocok)
    }
  }

  return matches;
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
  normalizeDateFields,
};