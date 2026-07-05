const fs = require('fs');
const path = require('path');
const cgRepository = require('./cellgroup.repository');
const meetingRepository = require('./cellgroup-meeting.repository');
const { compressToTargetSize } = require('./image-compression.util');
const { recordAuditLog } = require('../auditlog/auditlog.repository');

const MAX_PHOTOS_PER_MEETING = 5; // BAGIAN 3.3 — diturunkan dari 10 ke 5
const UPLOADS_ROOT = path.resolve(__dirname, '../../../uploads');
const UPLOAD_DIR = path.join(UPLOADS_ROOT, 'cg-meeting-photos');

class CellGroupError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Membuat CG baru (BAGIAN 3.1).
 *
 * @param {{ nama: string, deskripsi?: string, leaderId: number }} data
 * @param {object} options
 * @param {number} options.actorUserId
 * @returns {Promise<{ id: number }>}
 */
async function createCellGroup(data, { actorUserId = null } = {}) {
  if (!data.nama || !data.leaderId) {
    throw new CellGroupError('Nama dan leader wajib diisi', 400);
  }

  const id = await cgRepository.create(data);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'CREATE_CG',
    modul: 'CELL_GROUP',
    objectId: id,
    dataSebelum: null,
    dataSesudah: { nama: data.nama, leaderId: data.leaderId },
  });

  return { id };
}

/**
 * Menambah anggota ke CG (BAGIAN 3.2 TAMBAH).
 *
 * @param {number} cgId
 * @param {number} jemaatId
 * @param {object} options
 * @throws {CellGroupError} 409 jika sudah jadi anggota aktif
 */
async function addMemberToCg(cgId, jemaatId, { actorUserId = null } = {}) {
  const cg = await cgRepository.findById(cgId);
  if (!cg) {
    throw new CellGroupError('Cell Group tidak ditemukan', 404);
  }

  const alreadyMember = await cgRepository.isJemaatActiveMember(cgId, jemaatId);
  if (alreadyMember) {
    throw new CellGroupError('Jemaat sudah menjadi anggota aktif CG ini', 409);
  }

  await cgRepository.addMember(cgId, jemaatId);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'ADD_MEMBER_CG',
    modul: 'CELL_GROUP',
    objectId: cgId,
    dataSebelum: null,
    dataSesudah: { jemaatId },
  });
}

/**
 * Mengeluarkan anggota dari CG (BAGIAN 3.2 HAPUS).
 *
 * @param {number} cgId
 * @param {number} jemaatId
 * @param {object} options
 */
async function removeMemberFromCg(cgId, jemaatId, { actorUserId = null } = {}) {
  const cg = await cgRepository.findById(cgId);
  if (!cg) {
    throw new CellGroupError('Cell Group tidak ditemukan', 404);
  }

  await cgRepository.removeMember(cgId, jemaatId);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'REMOVE_MEMBER_CG',
    modul: 'CELL_GROUP',
    objectId: cgId,
    dataSebelum: { jemaatId },
    dataSesudah: null,
  });
}

/**
 * Membuat meeting baru untuk sebuah CG (BAGIAN 3.3), dengan
 * precondition CG harus punya leader aktif.
 *
 * @param {object} data - { cgId, judul, jenis, waktuMulai, waktuSelesai, catatan }
 * @param {object} options
 * @param {number} options.actorUserId
 * @returns {Promise<{ id: number }>}
 * @throws {CellGroupError} 400 jika CG tidak punya leader aktif
 */
async function createMeeting(data, { actorUserId = null } = {}) {
  const activeLeader = await cgRepository.findActiveLeader(data.cgId);
  if (!activeLeader) {
    throw new CellGroupError('Tunjuk leader baru terlebih dahulu', 400);
  }

  const id = await meetingRepository.createMeeting({ ...data, createdBy: actorUserId });

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'CREATE_MEETING',
    modul: 'CELL_GROUP',
    objectId: id,
    dataSebelum: null,
    dataSesudah: { cgId: data.cgId, judul: data.judul },
  });

  return { id };
}

/**
 * Menambahkan foto dokumentasi meeting, dengan kompresi otomatis
 * ke target 500KB (BAGIAN 3.3) dan validasi maks 10 foto.
 *
 * @param {number} meetingId
 * @param {Buffer} fileBuffer - buffer gambar asli (sebelum kompresi)
 * @param {object} options
 * @param {number} options.actorUserId
 * @returns {Promise<{ id: number, sizeKb: number }>}
 * @throws {CellGroupError} 404 jika meeting tidak ada, 400 jika sudah 10 foto
 */
async function addPhotoToMeeting(meetingId, fileBuffer, { actorUserId = null } = {}) {
  const meeting = await meetingRepository.findMeetingById(meetingId);
  if (!meeting) {
    throw new CellGroupError('Meeting tidak ditemukan', 404);
  }

  const currentCount = await meetingRepository.countMeetingPhotos(meetingId);
  if (currentCount >= MAX_PHOTOS_PER_MEETING) {
    throw new CellGroupError(`Maksimal ${MAX_PHOTOS_PER_MEETING} foto per meeting`, 400);
  }

  const { buffer: compressedBuffer, sizeKb } = await compressToTargetSize(fileBuffer);

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  const fileName = `meeting-${meetingId}-${Date.now()}.jpg`;
  const filePath = path.join(UPLOAD_DIR, fileName);
  fs.writeFileSync(filePath, compressedBuffer);

  const id = await meetingRepository.addMeetingPhoto({
    meetingId,
    filePath: `/uploads/cg-meeting-photos/${fileName}`,
    fileSizeKb: sizeKb,
    uploadedBy: actorUserId,
  });

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'ADD_MEETING_PHOTO',
    modul: 'CELL_GROUP',
    objectId: meetingId,
    dataSebelum: null,
    dataSesudah: { sizeKb },
  });

  return { id, sizeKb };
}

/**
 * Resolve file_path dari DB (contoh: "/uploads/cg-meeting-photos/x.jpg")
 * menjadi path absolut di disk, dengan pengecekan anti path-traversal:
 * hasil resolve WAJIB berada di dalam folder uploads. Jika tidak
 * (misal record dimanipulasi menjadi "../../.env"), dilempar 400.
 *
 * @param {string} filePathFromDb
 * @returns {string} path absolut yang sudah tervalidasi
 * @throws {CellGroupError} 400 jika path keluar dari folder uploads
 */
function resolvePhotoPath(filePathFromDb) {
  const relative = String(filePathFromDb || '').replace(/^[/\\]+/, '');
  const absolute = path.resolve(path.join(__dirname, '../../../'), relative);

  if (!absolute.startsWith(UPLOADS_ROOT + path.sep)) {
    throw new CellGroupError('Path file foto tidak valid', 400);
  }
  return absolute;
}

/**
 * Daftar foto sebuah meeting (id, file_size_kb, uploaded_by, created_at).
 *
 * @param {number} meetingId
 * @returns {Promise<Array<object>>}
 * @throws {CellGroupError} 404 jika meeting tidak ditemukan
 */
async function listMeetingPhotos(meetingId) {
  const meeting = await meetingRepository.findMeetingById(meetingId);
  if (!meeting) {
    throw new CellGroupError('Meeting tidak ditemukan', 404);
  }
  return meetingRepository.findPhotosByMeetingId(meetingId);
}

/**
 * Ambil path absolut file foto untuk di-stream oleh controller.
 *
 * @param {number} photoId
 * @returns {Promise<{ absolutePath: string, contentType: string }>}
 * @throws {CellGroupError} 404 jika record/file tidak ada, 400 jika path tidak valid
 */
async function getPhotoFile(photoId) {
  const photo = await meetingRepository.findPhotoById(photoId);
  if (!photo) {
    throw new CellGroupError('Foto tidak ditemukan', 404);
  }

  const absolutePath = resolvePhotoPath(photo.file_path);
  if (!fs.existsSync(absolutePath)) {
    throw new CellGroupError('File foto tidak ditemukan di server', 404);
  }

  const contentTypeByExt = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  const contentType = contentTypeByExt[path.extname(absolutePath).toLowerCase()] || 'application/octet-stream';

  return { absolutePath, contentType };
}

/**
 * Hapus foto meeting: record DB + file di disk, catat audit log.
 * File yang sudah hilang dari disk tidak menggagalkan penghapusan record.
 *
 * @param {number} photoId
 * @param {object} options
 * @param {number} options.actorUserId
 * @throws {CellGroupError} 404 jika record tidak ada
 */
async function deletePhoto(photoId, { actorUserId = null } = {}) {
  const photo = await meetingRepository.findPhotoById(photoId);
  if (!photo) {
    throw new CellGroupError('Foto tidak ditemukan', 404);
  }

  const absolutePath = resolvePhotoPath(photo.file_path);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }

  await meetingRepository.deleteMeetingPhoto(photoId);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'DELETE_MEETING_PHOTO',
    modul: 'CELL_GROUP',
    objectId: photo.meeting_id,
    dataSebelum: { photoId, filePath: photo.file_path, fileSizeKb: photo.file_size_kb },
    dataSesudah: null,
  });
}

/**
 * Menyimpan absensi untuk seluruh anggota yang hadir di sebuah
 * meeting sekaligus (BAGIAN 3.4 langkah 2-3).
 *
 * @param {number} meetingId
 * @param {Array<{ jemaatId: number, hadir: boolean }>} absensiList
 * @param {object} options
 * @param {number} options.actorUserId
 */
async function submitAbsensi(meetingId, absensiList, { actorUserId = null } = {}) {
  const meeting = await meetingRepository.findMeetingById(meetingId);
  if (!meeting) {
    throw new CellGroupError('Meeting tidak ditemukan', 404);
  }

  for (const { jemaatId, hadir } of absensiList) {
    await meetingRepository.upsertAbsensi(meetingId, jemaatId, hadir);
  }

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'INPUT_ABSENSI_CG',
    modul: 'CELL_GROUP',
    objectId: meetingId,
    dataSebelum: null,
    dataSesudah: { jumlahAbsensi: absensiList.length },
  });
}

/**
 * Update data CG (nama, deskripsi, leader_id).
 *
 * @param {number} cgId
 * @param {object} data
 * @param {object} options
 */
async function updateCellGroup(cgId, data, { actorUserId = null } = {}) {
  const cg = await cgRepository.findById(cgId);
  if (!cg) {
    throw new CellGroupError('Cell Group tidak ditemukan', 404);
  }

  const allowedFields = ['nama', 'deskripsi', 'leader_id'];
  const updates = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) updates[field] = data[field];
  }

  if (Object.keys(updates).length === 0) {
    throw new CellGroupError('Tidak ada field yang diupdate', 400);
  }

  const before = { nama: cg.nama, deskripsi: cg.deskripsi, leader_id: cg.leader_id };
  await cgRepository.update(cgId, updates);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'UPDATE_CG',
    modul: 'CELL_GROUP',
    objectId: cgId,
    dataSebelum: before,
    dataSesudah: updates,
  });
}

/**
 * Nonaktifkan (soft-delete) CG. Ditolak jika masih ada anggota aktif.
 *
 * @param {number} cgId
 * @param {object} options
 * @throws {CellGroupError} 409 jika masih ada anggota aktif
 */
async function deactivateCellGroup(cgId, { actorUserId = null } = {}) {
  const cg = await cgRepository.findById(cgId);
  if (!cg) {
    throw new CellGroupError('Cell Group tidak ditemukan', 404);
  }

  const activeMemberCount = await cgRepository.countActiveMembers(cgId);
  if (activeMemberCount > 0) {
    throw new CellGroupError(
      `Cell Group masih memiliki ${activeMemberCount} anggota aktif. Keluarkan semua anggota terlebih dahulu`,
      409
    );
  }

  await cgRepository.deactivate(cgId);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'DEACTIVATE_CG',
    modul: 'CELL_GROUP',
    objectId: cgId,
    dataSebelum: { nama: cg.nama, is_active: cg.is_active },
    dataSesudah: { is_active: false },
  });
}

/**
 * Reaktivasi CG yang sudah dinonaktifkan (kebalikan deactivateCellGroup).
 *
 * @param {number} cgId
 * @param {object} options
 * @throws {CellGroupError} 404 jika CG tidak pernah ada, 409 jika sudah aktif
 */
async function activateCellGroup(cgId, { actorUserId = null } = {}) {
  const cg = await cgRepository.findByIdIncludingDeleted(cgId);
  if (!cg) {
    throw new CellGroupError('Cell Group tidak ditemukan', 404);
  }

  if (cg.is_active) {
    throw new CellGroupError('Cell Group sudah aktif', 409);
  }

  await cgRepository.activate(cgId);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'ACTIVATE_CG',
    modul: 'CELL_GROUP',
    objectId: cgId,
    dataSebelum: { nama: cg.nama, is_active: cg.is_active },
    dataSesudah: { is_active: true },
  });
}

/**
 * Update data meeting (judul, jenis, waktu_mulai, waktu_selesai, catatan).
 * Validasi bahwa waktu_selesai tetap setelah waktu_mulai setelah update.
 *
 * @param {number} meetingId
 * @param {object} data
 * @param {object} options
 */
async function updateMeeting(meetingId, data, { actorUserId = null } = {}) {
  const meeting = await meetingRepository.findMeetingById(meetingId);
  if (!meeting) {
    throw new CellGroupError('Meeting tidak ditemukan', 404);
  }

  const allowedFields = ['judul', 'jenis', 'waktu_mulai', 'waktu_selesai', 'catatan'];
  const updates = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) updates[field] = data[field];
  }

  if (Object.keys(updates).length === 0) {
    throw new CellGroupError('Tidak ada field yang diupdate', 400);
  }

  const waktuMulai = updates.waktu_mulai || meeting.waktu_mulai;
  const waktuSelesai = updates.waktu_selesai || meeting.waktu_selesai;
  if (new Date(waktuSelesai) <= new Date(waktuMulai)) {
    throw new CellGroupError('waktu_selesai harus setelah waktu_mulai', 400);
  }

  const before = {
    judul: meeting.judul,
    jenis: meeting.jenis,
    waktu_mulai: meeting.waktu_mulai,
    waktu_selesai: meeting.waktu_selesai,
    catatan: meeting.catatan,
  };

  await meetingRepository.updateMeeting(meetingId, updates);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'UPDATE_MEETING',
    modul: 'CELL_GROUP',
    objectId: meetingId,
    dataSebelum: before,
    dataSesudah: updates,
  });
}

module.exports = {
  CellGroupError,
  createCellGroup,
  updateCellGroup,
  deactivateCellGroup,
  activateCellGroup,
  addMemberToCg,
  removeMemberFromCg,
  createMeeting,
  updateMeeting,
  addPhotoToMeeting,
  listMeetingPhotos,
  getPhotoFile,
  deletePhoto,
  submitAbsensi,
  MAX_PHOTOS_PER_MEETING,
};