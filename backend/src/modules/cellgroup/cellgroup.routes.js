const express = require('express');
const multer = require('multer');
const controller = require('./cellgroup.controller');
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

// Bungkus upload.single agar error multer (tipe file salah, file terlalu
// besar) dibalas 400 dengan pesan jelas, bukan jatuh ke error boundary 500.
function uploadSinglePhoto(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran file terlalu besar (maksimal 10MB)'
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
router.post('/cell-groups/meetings/:meetingId/photos', authenticate, uploadSinglePhoto, controller.uploadPhoto);
router.get('/cell-groups/meetings/:meetingId/photos', authenticate, controller.listMeetingPhotos);
router.get('/cell-groups/photos/:photoId', authenticate, controller.getPhoto);
router.delete('/cell-groups/photos/:photoId', authenticate, controller.deletePhoto);
router.get('/cell-groups/meetings/:meetingId/active-members', authenticate, controller.getActiveMembersAtMeetingTime);
router.post('/cell-groups/meetings/:meetingId/absensi', authenticate, submitAbsensiValidation, handleValidationErrors, controller.submitAbsensi);

module.exports = router;