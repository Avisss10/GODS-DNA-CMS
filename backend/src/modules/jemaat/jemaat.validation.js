const { body } = require('express-validator');

// Mencerminkan REQUIRED_FIELDS di jemaat.service (nama, tgl_lahir,
// jenis_kelamin) — hanya presence check, tidak menambah aturan baru.
// Pola pesan mengikuti 'Field wajib belum diisi: X'.

const createJemaatValidation = [
  body('nama').notEmpty().withMessage('Field wajib belum diisi: nama'),
  body('tgl_lahir').notEmpty().withMessage('Field wajib belum diisi: tgl_lahir'),
  body('jenis_kelamin').notEmpty().withMessage('Field wajib belum diisi: jenis_kelamin'),
];

// Update bersifat parsial (service tidak mewajibkan field apa pun) —
// hanya jaga agar field yang dikirim tidak berupa string kosong.
const updateJemaatValidation = [
  body('nama').optional().notEmpty().withMessage('nama tidak boleh kosong'),
];

module.exports = { createJemaatValidation, updateJemaatValidation };
