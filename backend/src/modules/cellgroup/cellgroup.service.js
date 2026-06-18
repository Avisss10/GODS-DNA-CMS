const fs = require('fs');
const path = require('path');
const cgRepository = require('./cellgroup.repository');
const meetingRepository = require('./cellgroup-meeting.repository');
const { compressToTargetSize } = require('./image-compression.util');
const { recordAuditLog } = require('../auditlog/auditlog.repository');

const MAX_PHOTOS_PER_MEETING = 10; // BAGIAN 3.3
const UPLOAD_DIR = path.join(__dirname, '../../../uploads/cg-meeting-photos');

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

module.exports = {
  CellGroupError,
  createCellGroup,
  addMemberToCg,
  removeMemberFromCg,
  createMeeting,
  addPhotoToMeeting,
  submitAbsensi,
  MAX_PHOTOS_PER_MEETING,
};