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

// Validator datetime: menerima format yang selama ini dipakai klien
// ('YYYY-MM-DD HH:mm:ss' maupun ISO) — cukup pastikan bisa di-parse Date.
const isDateTime = (value) => !Number.isNaN(new Date(value).getTime());

const addMemberValidation = [
  body('jemaatId').isInt({ min: 1 }).withMessage('jemaatId wajib berupa integer positif'),
];

// Field sesuai skema cg_meeting: judul (VARCHAR wajib), jenis
// (ENUM ONLINE/OFFLINE), waktu_mulai & waktu_selesai (DATETIME wajib),
// catatan (TEXT opsional). Create memakai camelCase (kontrak lama).
const createMeetingValidation = [
  body('judul').notEmpty().withMessage('judul wajib diisi'),
  body('jenis').isIn(['ONLINE', 'OFFLINE']).withMessage('jenis harus ONLINE atau OFFLINE'),
  body('waktuMulai')
    .notEmpty().withMessage('waktuMulai wajib diisi')
    .custom(isDateTime).withMessage('waktuMulai harus tanggal/waktu yang valid'),
  body('waktuSelesai')
    .notEmpty().withMessage('waktuSelesai wajib diisi')
    .custom(isDateTime).withMessage('waktuSelesai harus tanggal/waktu yang valid'),
  body('catatan').optional({ nullable: true }).isString().withMessage('catatan harus berupa teks'),
];

// Update meeting bersifat parsial (snake_case, kontrak lama) — field
// yang dikirim harus valid; kewajiban minimal 1 field tetap di service.
const updateMeetingValidation = [
  body('judul').optional().notEmpty().withMessage('judul tidak boleh kosong'),
  body('jenis').optional().isIn(['ONLINE', 'OFFLINE']).withMessage('jenis harus ONLINE atau OFFLINE'),
  body('waktu_mulai').optional()
    .custom(isDateTime).withMessage('waktu_mulai harus tanggal/waktu yang valid'),
  body('waktu_selesai').optional()
    .custom(isDateTime).withMessage('waktu_selesai harus tanggal/waktu yang valid'),
  body('catatan').optional({ nullable: true }).isString().withMessage('catatan harus berupa teks'),
];

const submitAbsensiValidation = [
  body('absensi').isArray({ min: 1 }).withMessage('absensi wajib berupa array minimal 1 entri'),
  body('absensi.*.jemaatId').isInt({ min: 1 }).withMessage('jemaatId tiap entri absensi wajib integer positif'),
  body('absensi.*.hadir').isBoolean().withMessage('hadir tiap entri absensi wajib boolean'),
];

module.exports = {
  createCellGroupValidation,
  updateCellGroupValidation,
  addMemberValidation,
  createMeetingValidation,
  updateMeetingValidation,
  submitAbsensiValidation,
};
