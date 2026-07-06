const volunteerJenisRepository = require('./volunteer-jenis.repository');
const volunteerMemberRepository = require('./volunteer-member.repository');
const jemaatRepository = require('../jemaat/jemaat.repository');
const { recordAuditLog } = require('../auditlog/auditlog.repository');

class VolunteerError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Membuat jenis volunteer baru (master data pelayanan gereja).
 * Authorization (ADMIN+LEADER) ditegakkan di layer routing
 * (requireRole), bukan di sini.
 *
 * @param {{ nama: string, deskripsi?: string }} data
 * @param {object} options
 * @param {number} options.actorUserId
 * @returns {Promise<{ id: number }>}
 */
async function createVolunteerType(data, { actorUserId = null } = {}) {
  if (!data.nama) {
    throw new VolunteerError('Nama jenis volunteer wajib diisi', 400);
  }

  const existing = await volunteerJenisRepository.findByNama(data.nama);
  if (existing) {
    throw new VolunteerError('Jenis volunteer dengan nama tersebut sudah ada', 409);
  }

  const id = await volunteerJenisRepository.create(data);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'CREATE',
    modul: 'VOLUNTEER',
    objectId: id,
    dataSebelum: null,
    dataSesudah: { nama: data.nama, deskripsi: data.deskripsi ?? null },
  });

  return { id };
}

/**
 * Memperbarui jenis volunteer.
 *
 * @param {number} id
 * @param {{ nama?: string, deskripsi?: string }} updates
 * @param {object} options
 * @param {number} options.actorUserId
 */
async function updateVolunteerType(id, updates, { actorUserId = null } = {}) {
  const existing = await volunteerJenisRepository.findById(id);
  if (!existing) {
    throw new VolunteerError('Jenis volunteer tidak ditemukan', 404);
  }

  await volunteerJenisRepository.update(id, updates);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'UPDATE',
    modul: 'VOLUNTEER',
    objectId: id,
    dataSebelum: { nama: existing.nama, deskripsi: existing.deskripsi },
    dataSesudah: updates,
  });

  return volunteerJenisRepository.findById(id);
}

/**
 * Menonaktifkan jenis volunteer (soft deactivate, BAGIAN keputusan
 * #4 — tidak ada hard delete di seluruh sistem).
 *
 * @param {number} id
 * @param {object} options
 * @param {number} options.actorUserId
 */
async function deactivateVolunteerType(id, { actorUserId = null } = {}) {
  const existing = await volunteerJenisRepository.findById(id);
  if (!existing) {
    throw new VolunteerError('Jenis volunteer tidak ditemukan', 404);
  }

  await volunteerJenisRepository.setActive(id, false);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'DELETE',
    modul: 'VOLUNTEER',
    objectId: id,
    dataSebelum: { nama: existing.nama, is_active: existing.is_active },
    dataSesudah: null,
  });
}

/**
 * Reaktivasi jenis volunteer yang sudah dinonaktifkan (kebalikan
 * deactivateVolunteerType, pola sama seperti activateCellGroup).
 *
 * @param {number} id
 * @param {object} options
 * @param {number} options.actorUserId
 * @throws {VolunteerError} 404 jika tidak pernah ada, 409 jika sudah aktif
 */
async function activateVolunteerType(id, { actorUserId = null } = {}) {
  const existing = await volunteerJenisRepository.findById(id);
  if (!existing) {
    throw new VolunteerError('Jenis volunteer tidak ditemukan', 404);
  }

  if (existing.is_active) {
    throw new VolunteerError('Jenis volunteer sudah aktif', 409);
  }

  await volunteerJenisRepository.setActive(id, true);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'ACTIVATE',
    modul: 'VOLUNTEER',
    objectId: id,
    dataSebelum: { nama: existing.nama, is_active: existing.is_active },
    dataSesudah: { is_active: true },
  });
}

/**
 * Mendaftarkan jemaat ke sebuah jenis volunteer (BAGIAN keputusan
 * #3): jemaat harus is_active=true dan deleted_at IS NULL. Jemaat
 * baru (is_new_member=true) TETAP boleh didaftarkan di sini —
 * pengecualian Auto-Suggest (BAGIAN 5.4) ditangani modul Event,
 * bukan di titik registrasi ini.
 *
 * @param {number} jemaatId
 * @param {number} volunteerTypeId
 * @param {object} options
 * @param {number} options.actorUserId
 * @returns {Promise<{ id: number }>}
 */
async function registerVolunteer(jemaatId, volunteerTypeId, { actorUserId = null } = {}) {
  const jemaat = await jemaatRepository.findById(jemaatId);
  if (!jemaat) {
    throw new VolunteerError('Jemaat tidak ditemukan', 404);
  }
  if (!jemaat.is_active) {
    throw new VolunteerError('Jemaat tidak aktif, tidak dapat didaftarkan sebagai volunteer', 400);
  }

  const volunteerType = await volunteerJenisRepository.findById(volunteerTypeId);
  if (!volunteerType) {
    throw new VolunteerError('Jenis volunteer tidak ditemukan', 404);
  }

  const existingRegistration = await volunteerMemberRepository.findByJemaatAndType(jemaatId, volunteerTypeId);
  if (existingRegistration) {
    throw new VolunteerError('Jemaat sudah pernah terdaftar untuk jenis volunteer ini', 409);
  }

  const id = await volunteerMemberRepository.register(jemaatId, volunteerTypeId);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'REGISTER_VOLUNTEER',
    modul: 'VOLUNTEER',
    objectId: id,
    dataSebelum: null,
    dataSesudah: { jemaatId, volunteerTypeId },
  });

  return { id };
}

/**
 * Menonaktifkan pendaftaran volunteer seorang jemaat (BAGIAN
 * keputusan #4: soft deactivate, histori tetap ada).
 *
 * @param {number} jemaatId
 * @param {number} volunteerTypeId
 * @param {object} options
 * @param {number} options.actorUserId
 */
async function unregisterVolunteer(jemaatId, volunteerTypeId, { actorUserId = null } = {}) {
  const existingRegistration = await volunteerMemberRepository.findByJemaatAndType(
    jemaatId,
    volunteerTypeId
  );

  // Tidak ditemukan ATAU sudah dinonaktifkan → 404
  if (!existingRegistration || !existingRegistration.is_active) {
    throw new VolunteerError('Pendaftaran volunteer tidak ditemukan', 404);
  }

  await volunteerMemberRepository.deactivate(jemaatId, volunteerTypeId);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'UNREGISTER_VOLUNTEER',
    modul: 'VOLUNTEER',
    objectId: existingRegistration.id,
    dataSebelum: { jemaatId, volunteerTypeId },
    dataSesudah: null,
  });
}

/**
 * Mengambil daftar jenis volunteer aktif milik seorang jemaat.
 * Jemaat soft-deleted → findById return null → throw 404.
 *
 * @param {number} jemaatId
 * @returns {Promise<Array<object>>}
 */
async function listVolunteerByJemaat(jemaatId) {
  const jemaat = await jemaatRepository.findById(jemaatId);
  if (!jemaat) {
    throw new VolunteerError('Jemaat tidak ditemukan', 404);
  }
  return volunteerMemberRepository.findActiveByJemaat(jemaatId);
}

module.exports = {
  VolunteerError,
  createVolunteerType,
  updateVolunteerType,
  deactivateVolunteerType,
  activateVolunteerType,
  listVolunteerByJemaat,
  registerVolunteer,
  unregisterVolunteer,
};