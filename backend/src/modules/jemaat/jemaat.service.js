const jemaatRepository = require('./jemaat.repository');
const { recordAuditLog } = require('../auditlog/auditlog.repository');

class JemaatError extends Error {
  constructor(message, statusCode, payload = null) {
    super(message);
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

const REQUIRED_FIELDS = ['nama', 'tgl_lahir', 'jenis_kelamin'];

function validateRequiredFields(data) {
  const missing = REQUIRED_FIELDS.filter((field) => !data[field]);
  if (missing.length > 0) {
    throw new JemaatError(
      `Field wajib belum diisi: ${missing.join(', ')}`,
      400
    );
  }
}

/**
 * Menghapus field sensitif dan IV-nya dari sebuah object, untuk
 * dipakai sebagai data_sesudah/data_sebelum di audit_log
 * (BAGIAN 2.1 langkah 6, BAGIAN 2.3 langkah 5).
 */
function stripSensitiveFields(data) {
  const { no_hp, no_hp_iv, alamat, alamat_iv, media_sosial, media_sosial_iv, ...rest } = data;
  return rest;
}

/**
 * Membuat object flag "diubah" untuk field sensitif yang ada di
 * `updates`, dipakai sebagai pengganti nilai plaintext di audit_log
 * (BAGIAN 2.3: "hanya flag 'diubah'").
 */
function buildSensitiveChangeFlags(updates) {
  const flags = {};
  if (updates.no_hp !== undefined) flags.no_hp = 'diubah';
  if (updates.alamat !== undefined) flags.alamat = 'diubah';
  if (updates.media_sosial !== undefined) flags.media_sosial = 'diubah';
  return flags;
}

/**
 * Membuat jemaat baru (BAGIAN 2.1).
 *
 * @param {object} data - field plaintext jemaat
 * @param {object} options
 * @param {boolean} options.confirmed - true jika admin sudah memilih
 *   "Lanjut" meski ada warning duplikat sebelumnya
 * @param {number} options.actorUserId - user yang melakukan aksi (untuk audit log)
 * @returns {Promise<{ requiresConfirmation: true, duplicates: object } | { id: number }>}
 */
async function createJemaat(data, { confirmed = false, actorUserId = null } = {}) {
  validateRequiredFields(data);

  if (!confirmed) {
    const duplicatesByNameAndBirthdate = await jemaatRepository.findDuplicateCandidatesByNameAndBirthdate(
      data.nama,
      data.tgl_lahir
    );

    const duplicatesByPhone = data.no_hp
      ? await jemaatRepository.findDuplicateCandidatesByPhone(data.no_hp)
      : [];

    if (duplicatesByNameAndBirthdate.length > 0 || duplicatesByPhone.length > 0) {
      return {
        requiresConfirmation: true,
        duplicates: {
          byNameAndBirthdate: duplicatesByNameAndBirthdate,
          byPhone: duplicatesByPhone,
        },
      };
    }
  }

  const id = await jemaatRepository.create(data);

  // BAGIAN 2.1 langkah 6: audit log tanpa field sensitif
  await recordAuditLog({
    userId: actorUserId,
    aksi: 'CREATE',
    modul: 'JEMAAT',
    objectId: id,
    dataSebelum: null,
    dataSesudah: stripSensitiveFields({ ...data, id }),
  });

  return { id };
}

/**
 * Memperbarui data jemaat (BAGIAN 2.3).
 *
 * @param {number} id
 * @param {object} updates
 * @param {object} options
 * @param {number} options.actorUserId
 */
async function updateJemaat(id, updates, { actorUserId = null } = {}) {
  const existing = await jemaatRepository.findById(id);
  if (!existing) {
    throw new JemaatError('Jemaat tidak ditemukan', 404);
  }

  await jemaatRepository.update(id, updates);

  // BAGIAN 2.3 langkah 5: data_sebelum/data_sesudah tanpa plaintext sensitif
  const dataSebelum = {
    ...stripSensitiveFields(existing),
    ...buildSensitiveChangeFlags(updates),
  };
  const dataSesudah = {
    ...stripSensitiveFields(updates),
    ...buildSensitiveChangeFlags(updates),
  };

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'UPDATE',
    modul: 'JEMAAT',
    objectId: id,
    dataSebelum,
    dataSesudah,
  });

  return jemaatRepository.findById(id);
}

/**
 * Menghapus (soft delete) jemaat, dengan cek dependensi terlebih
 * dahulu (BAGIAN 2.4).
 *
 * @param {number} id
 * @param {object} options
 * @param {number} options.actorUserId
 * @throws {JemaatError} statusCode 409 jika ada dependensi aktif
 */
async function deleteJemaat(id, { actorUserId = null } = {}) {
  const existing = await jemaatRepository.findById(id);
  if (!existing) {
    throw new JemaatError('Jemaat tidak ditemukan', 404);
  }

  const dependencies = await jemaatRepository.checkDependencies(id);
  const hasDependencies =
    dependencies.isLeaderOfActiveCg.length > 0 ||
    dependencies.scheduledAsVolunteer.length > 0 ||
    dependencies.activeMemberOfCg.length > 0;

  if (hasDependencies) {
    throw new JemaatError(
      'Jemaat masih memiliki dependensi aktif, selesaikan dahulu sebelum menghapus',
      409,
      dependencies
    );
  }

  await jemaatRepository.softDelete(id);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'DELETE',
    modul: 'JEMAAT',
    objectId: id,
    dataSebelum: stripSensitiveFields(existing),
    dataSesudah: null,
  });
}

/**
 * Mengambil satu field sensitif dalam bentuk plaintext, dengan
 * audit log VIEW_SENSITIVE wajib tercatat (BAGIAN 2.5).
 *
 * @param {number} id
 * @param {'no_hp'|'alamat'|'media_sosial'} field
 * @param {object} options
 * @param {number} options.actorUserId
 * @returns {Promise<string|object|null>}
 */
async function viewSensitiveField(id, field, { actorUserId = null } = {}) {
  const allowedFields = ['no_hp', 'alamat', 'media_sosial'];
  if (!allowedFields.includes(field)) {
    throw new JemaatError(`Field "${field}" bukan field sensitif yang valid`, 400);
  }

  const decrypted = await jemaatRepository.findByIdDecrypted(id);
  if (!decrypted) {
    throw new JemaatError('Jemaat tidak ditemukan', 404);
  }

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'VIEW_SENSITIVE',
    modul: 'JEMAAT',
    objectId: id,
    dataSebelum: null,
    dataSesudah: { field },
  });

  return decrypted[field];
}

module.exports = {
  JemaatError,
  createJemaat,
  updateJemaat,
  deleteJemaat,
  viewSensitiveField,
  stripSensitiveFields,
  buildSensitiveChangeFlags,
};