const { body } = require('express-validator');

// Mencerminkan validasi manual di event.service & event.controller.
// Presence-only, pesan identik agar kontrak 400 tidak berubah.

const createEventValidation = [
  body('judul').notEmpty().withMessage('Judul event wajib diisi'),
  body('jenis').notEmpty().withMessage('Jenis event wajib diisi'),
  body('waktu_mulai').notEmpty().withMessage('Waktu mulai wajib diisi'),
  body('waktu_selesai').notEmpty().withMessage('Waktu selesai wajib diisi'),
];

// Update event bersifat parsial di service — jaga agar field waktu tidak
// dikirim sebagai string kosong bila disertakan.
const updateEventValidation = [
  body('judul').optional().notEmpty().withMessage('Judul event tidak boleh kosong'),
];

// total_hadir wajib ADA (boleh 0) — gunakan exists(), bukan notEmpty(),
// agar nilai 0 tetap lolos (konsisten dengan cek `=== undefined` di controller).
const inputKehadiranValidation = [
  body('total_hadir').exists({ checkNull: true }).withMessage('total_hadir wajib diisi'),
];

const assignVolunteerValidation = [
  body('jemaat_id').notEmpty().withMessage('jemaat_id wajib diisi'),
  body('jenis_id').notEmpty().withMessage('jenis_id wajib diisi'),
];

// durasi_menit hanya wajib untuk penggantian TENGAH_EVENT — untuk
// SEBELUM_EVENT field ini diabaikan (baris lama langsung DIGANTIKAN).
const replaceVolunteerValidation = [
  body('replacement_timing')
    .notEmpty().withMessage('replacement_timing wajib diisi')
    .isIn(['SEBELUM_EVENT', 'TENGAH_EVENT']).withMessage('replacement_timing harus SEBELUM_EVENT atau TENGAH_EVENT'),
  body('replaced_by')
    .notEmpty().withMessage('replaced_by (jemaat pengganti) wajib diisi'),
  body('alasan')
    .notEmpty().withMessage('Alasan penggantian wajib diisi'),
  body('durasi_menit')
    .if(body('replacement_timing').equals('TENGAH_EVENT'))
    .notEmpty().withMessage('durasi_menit wajib diisi jika penggantian TENGAH_EVENT')
    .isInt({ min: 1 }).withMessage('durasi_menit harus angka positif'),
];

module.exports = {
  createEventValidation,
  updateEventValidation,
  inputKehadiranValidation,
  assignVolunteerValidation,
  replaceVolunteerValidation,
};
