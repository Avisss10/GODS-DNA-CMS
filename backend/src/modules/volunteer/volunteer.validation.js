const { body } = require('express-validator');

// Mencerminkan validasi manual di volunteer.service & volunteer.controller.

const createVolunteerTypeValidation = [
  body('nama').notEmpty().withMessage('Nama jenis volunteer wajib diisi'),
];

// Update jenis volunteer bersifat parsial di service — jaga agar nama
// tidak dikirim sebagai string kosong bila disertakan.
const updateVolunteerTypeValidation = [
  body('nama').optional().notEmpty().withMessage('nama tidak boleh kosong'),
];

const registerVolunteerValidation = [
  body('volunteerTypeId').notEmpty().withMessage('volunteerTypeId wajib diisi'),
];

module.exports = {
  createVolunteerTypeValidation,
  updateVolunteerTypeValidation,
  registerVolunteerValidation,
};
