const express = require('express');
const multer = require('multer');
const controller = require('./cellgroup.controller');
const { MAX_PHOTOS_PER_MEETING } = require('./cellgroup.service');
const { authenticate } = require('../../middlewares/auth.middleware');
const { handleValidationErrors } = require('../../middlewares/validation.middleware');
const {
  createCellGroupValidation,
  updateCellGroupValidation,
  addMemberValidation,
  createMeetingValidation,
  updateMeetingValidation,
  submitAbsensiValidation,
} = require('./cellgroup.validation');

const router = express.Router();

// memoryStorage: file diterima sebagai Buffer (req.file.buffer),
// karena service addPhotoToMeeting mengompres di memori sebelum
// menulis hasil final ke disk. Limit 10MB adalah batas praktis
// untuk file SEBELUM dikompres (bukan disebutkan di dokumen).
const ALLOWED_PHOTO_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_PHOTO_MIMETYPES.includes(file.mimetype)) {
      return cb(null, true);
    }
    const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'photo');
    err.message = 'Tipe file tidak didukung. Hanya menerima JPEG, PNG, atau WebP';
    return cb(err);
  },
});

// Bungkus upload.array agar error multer (tipe file salah, file terlalu
// besar, file lebih dari batas) dibalas 400 dengan pesan jelas, bukan
// jatuh ke error boundary 500. Batch (bukan single) karena absensi & foto
// sama-sama "sekali setelah meeting selesai" — upload sampai
// MAX_PHOTOS_PER_MEETING foto sekaligus dianggap satu aksi (lihat
// cellgroup.service.js addPhotosToMeeting).
function uploadMeetingPhotos(req, res, next) {
  upload.array('photos', MAX_PHOTOS_PER_MEETING)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      // LIMIT_UNEXPECTED_FILE sengaja TIDAK ditimpa di sini — kode itu juga
      // dipakai fileFilter di atas untuk menolak tipe file salah, dengan
      // pesannya sendiri yang lebih spesifik (err.message).
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran file terlalu besar (maksimal 10MB per file)'
        : err.code === 'LIMIT_FILE_COUNT'
          ? `Maksimal ${MAX_PHOTOS_PER_MEETING} foto per unggahan`
          : err.message;
      return res.status(400).json({ message });
    }
    return next(err);
  });
}

router.post('/cell-groups', authenticate, createCellGroupValidation, handleValidationErrors, controller.createCellGroup);
router.get('/cell-groups', authenticate, controller.listCellGroups);
router.get('/cell-groups/:id', authenticate, controller.getCellGroupById);
router.put('/cell-groups/:id', authenticate, updateCellGroupValidation, handleValidationErrors, controller.updateCellGroup);
router.delete('/cell-groups/:id', authenticate, controller.deactivateCellGroup);
router.patch('/cell-groups/:id/activate', authenticate, controller.activateCellGroup);
router.get('/cell-groups/:id/members', authenticate, controller.getActiveMembers);
router.post('/cell-groups/:id/members', authenticate, addMemberValidation, handleValidationErrors, controller.addMember);
router.delete('/cell-groups/:id/members/:jemaatId', authenticate, controller.removeMember);
router.get('/cell-groups/:id/meetings', authenticate, controller.listMeetingsByCg);
router.post('/cell-groups/:id/meetings', authenticate, createMeetingValidation, handleValidationErrors, controller.createMeeting);
router.get('/cell-groups/meetings/:meetingId', authenticate, controller.getMeetingById);
router.put('/cell-groups/meetings/:meetingId', authenticate, updateMeetingValidation, handleValidationErrors, controller.updateMeeting);
router.post('/cell-groups/meetings/:meetingId/photos', authenticate, uploadMeetingPhotos, controller.uploadPhoto);
router.get('/cell-groups/meetings/:meetingId/photos', authenticate, controller.listMeetingPhotos);
router.get('/cell-groups/photos/:photoId', authenticate, controller.getPhoto);
router.delete('/cell-groups/photos/:photoId', authenticate, controller.deletePhoto);
router.get('/cell-groups/meetings/:meetingId/active-members', authenticate, controller.getActiveMembersAtMeetingTime);
router.get('/cell-groups/meetings/:meetingId/absensi', authenticate, controller.getAbsensi);
router.get('/cell-groups/members/:jemaatId/absensi-history', authenticate, controller.getAbsensiHistoryByJemaat);
router.post('/cell-groups/meetings/:meetingId/absensi', authenticate, submitAbsensiValidation, handleValidationErrors, controller.submitAbsensi);

module.exports = router;