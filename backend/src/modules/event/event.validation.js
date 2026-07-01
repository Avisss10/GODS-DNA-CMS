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

module.exports = {
  createEventValidation,
  updateEventValidation,
  inputKehadiranValidation,
  assignVolunteerValidation,
};
