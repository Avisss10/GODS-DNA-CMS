const { body } = require('express-validator');

// Mencerminkan validasi manual di cellgroup.service.createCellGroup
// (nama & leaderId wajib). Pesan identik agar kontrak tidak berubah.

const createCellGroupValidation = [
  body('nama').notEmpty().withMessage('Nama dan leader wajib diisi'),
  body('leaderId').notEmpty().withMessage('Nama dan leader wajib diisi'),
];

// Update CG bersifat parsial di service ('Tidak ada field yang diupdate'
// ditangani service). Jaga agar nama tidak dikirim sebagai string kosong.
const updateCellGroupValidation = [
  body('nama').optional().notEmpty().withMessage('nama tidak boleh kosong'),
];

module.exports = { createCellGroupValidation, updateCellGroupValidation };
