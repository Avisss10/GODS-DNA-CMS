const fs = require('fs');
const path = require('path');
const cgRepository = require('./cellgroup.repository');
const meetingRepository = require('./cellgroup-meeting.repository');
const { compressToTargetSize } = require('./image-compression.util');
const { recordAuditLog } = require('../auditlog/auditlog.repository');
const { getPool } = require('../../config/database');

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

  if (cg.leader_id === jemaatId) {
    throw new CellGroupError('Leader tidak bisa dikeluarkan dari anggota, ganti leader terlebih dahulu', 409);
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
  const cg = await cgRepository.findById(data.cgId);
  if (!cg) {
    throw new CellGroupError('Cell Group tidak ditemukan', 404);
  }

  const activeLeader = await cgRepository.findActiveLeader(data.cgId);
  if (!activeLeader) {
    throw new CellGroupError('Tunjuk leader baru terlebih dahulu', 400);
  }

  if (new Date(data.waktuSelesai) <= new Date(data.waktuMulai)) {
    throw new CellGroupError('waktuSelesai harus setelah waktuMulai', 400);
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
 * Menambahkan SATU BATCH foto dokumentasi meeting sekaligus (bisa lebih
 * dari 1 file dalam satu request), dengan kompresi otomatis ke target
 * 500KB (BAGIAN 3.3) dan validasi maks MAX_PHOTOS_PER_MEETING foto.
 *
 * Aturan akses sama seperti submitAbsensi (dikonfirmasi user, foto &
 * absensi sama-sama "sekali setelah meeting selesai"): hanya bisa upload
 * setelah waktu_selesai lewat (tanpa batas atas). Batch PERTAMA (belum
 * ada foto sama sekali) boleh ADMIN maupun LEADER; begitu sudah ada foto
 * tersimpan, batch berikutnya HANYA boleh LEADER. Gate dicek SEKALI di
 * awal batch (bukan per file) — supaya upload 3 foto sekaligus tidak
 * saling memblokir gara-gara foto pertama "sudah tersimpan" di
 * pertengahan proses.
 *
 * @param {number} meetingId
 * @param {Buffer[]} fileBuffers - buffer gambar asli (sebelum kompresi), 1+ file
 * @param {object} options
 * @param {number} options.actorUserId
 * @param {string} options.actorRole - 'ADMIN' | 'LEADER'
 * @returns {Promise<Array<{ id: number, sizeKb: number }>>}
 * @throws {CellGroupError} 404 meeting tidak ada, 400 belum selesai/kuota lebih, 403 bukan Leader saat sudah ada foto
 */
async function addPhotosToMeeting(meetingId, fileBuffers, { actorUserId = null, actorRole = null } = {}) {
  const meeting = await meetingRepository.findMeetingById(meetingId);
  if (!meeting) {
    throw new CellGroupError('Meeting tidak ditemukan', 404);
  }

  if (new Date() <= new Date(meeting.waktu_selesai)) {
    throw new CellGroupError('Foto baru bisa diunggah setelah meeting selesai', 400);
  }

  const currentCount = await meetingRepository.countMeetingPhotos(meetingId);
  if (currentCount > 0 && actorRole !== 'LEADER') {
    throw new CellGroupError('Hanya Leader yang bisa menambah/mengubah foto yang sudah tersimpan', 403);
  }

  if (currentCount + fileBuffers.length > MAX_PHOTOS_PER_MEETING) {
    throw new CellGroupError(`Maksimal ${MAX_PHOTOS_PER_MEETING} foto per meeting`, 400);
  }

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  // Kompres & tulis semua file ke disk dulu SEBELUM insert DB manapun —
  // kalau salah satu gagal diproses, batch ditolak seluruhnya, tidak ada
  // foto yang "setengah tersimpan".
  const prepared = [];
  for (const fileBuffer of fileBuffers) {
    const { buffer: compressedBuffer, sizeKb } = await compressToTargetSize(fileBuffer);
    const fileName = `meeting-${meetingId}-${Date.now()}-${prepared.length}.jpg`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    fs.writeFileSync(filePath, compressedBuffer);
    prepared.push({ fileName, sizeKb });
  }

  const results = [];
  for (const { fileName, sizeKb } of prepared) {
    const id = await meetingRepository.addMeetingPhoto({
      meetingId,
      filePath: `/uploads/cg-meeting-photos/${fileName}`,
      fileSizeKb: sizeKb,
      uploadedBy: actorUserId,
    });
    results.push({ id, sizeKb });
  }

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'ADD_MEETING_PHOTO',
    modul: 'CELL_GROUP',
    objectId: meetingId,
    dataSebelum: null,
    dataSesudah: { jumlahFoto: results.length },
  });

  return results;
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
async function deletePhoto(photoId, { actorUserId = null, actorRole = null } = {}) {
  const photo = await meetingRepository.findPhotoById(photoId);
  if (!photo) {
    throw new CellGroupError('Foto tidak ditemukan', 404);
  }

  // Menghapus foto tersimpan = mengedit laporan meeting — sama seperti
  // absensi, hanya Leader yang boleh (dikonfirmasi user).
  if (actorRole !== 'LEADER') {
    throw new CellGroupError('Hanya Leader yang bisa menghapus foto yang sudah tersimpan', 403);
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
 * Aturan akses (dikonfirmasi user): absensi hanya bisa diisi setelah
 * waktu_selesai meeting lewat (tidak ada batas atas — boleh beberapa
 * hari kemudian). Submit PERTAMA (belum ada data sama sekali) boleh
 * ADMIN maupun LEADER; begitu sudah ada data tersimpan, perubahan
 * berikutnya HANYA boleh LEADER — ADMIN diblokir (403).
 *
 * @param {number} meetingId
 * @param {Array<{ jemaatId: number, hadir: boolean }>} absensiList
 * @param {object} options
 * @param {number} options.actorUserId
 * @param {string} options.actorRole - 'ADMIN' | 'LEADER'
 */
async function submitAbsensi(meetingId, absensiList, { actorUserId = null, actorRole = null } = {}) {
  const meeting = await meetingRepository.findMeetingById(meetingId);
  if (!meeting) {
    throw new CellGroupError('Meeting tidak ditemukan', 404);
  }

  if (new Date() <= new Date(meeting.waktu_selesai)) {
    throw new CellGroupError('Absensi baru bisa diisi setelah meeting selesai', 400);
  }

  const existingAbsensi = await meetingRepository.findAbsensiByMeeting(meetingId);
  if (existingAbsensi.length > 0 && actorRole !== 'LEADER') {
    throw new CellGroupError('Hanya Leader yang bisa mengubah absensi yang sudah tersimpan', 403);
  }

  const activeMembers = await meetingRepository.findActiveMembersAtMeetingTime(meeting.cg_id, meeting.waktu_mulai);
  const activeMemberIds = new Set(activeMembers.map((m) => m.id));
  const invalidEntry = absensiList.find(({ jemaatId }) => !activeMemberIds.has(jemaatId));
  if (invalidEntry) {
    throw new CellGroupError(`Jemaat ID ${invalidEntry.jemaatId} bukan anggota CG ini pada waktu meeting`, 400);
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const { jemaatId, hadir } of absensiList) {
      await meetingRepository.upsertAbsensi(meetingId, jemaatId, hadir, connection);
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
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

  // Leader baru harus otomatis jadi anggota aktif — kalau tidak, dia
  // tercatat sebagai leader di cell_group.leader_id tapi tidak pernah
  // muncul di daftar anggota/absensi (yang berbasis cell_group_members).
  // Leader lama SENGAJA tidak dihapus dari anggota — tetap jadi anggota
  // biasa, cuma label "Leader"-nya hilang karena dihitung dari leader_id.
  if (updates.leader_id !== undefined && updates.leader_id !== cg.leader_id) {
    const alreadyMember = await cgRepository.isJemaatActiveMember(cgId, updates.leader_id);
    if (!alreadyMember) {
      await cgRepository.addMember(cgId, updates.leader_id);
    }
  }

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
  addPhotosToMeeting,
  listMeetingPhotos,
  getPhotoFile,
  deletePhoto,
  submitAbsensi,
  MAX_PHOTOS_PER_MEETING,
};