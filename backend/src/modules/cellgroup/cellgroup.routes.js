const express = require('express');
const multer = require('multer');
const controller = require('./cellgroup.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

// memoryStorage: file diterima sebagai Buffer (req.file.buffer),
// karena service addPhotoToMeeting mengompres di memori sebelum
// menulis hasil final ke disk. Limit 10MB adalah batas praktis
// untuk file SEBELUM dikompres (bukan disebutkan di dokumen).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/cell-groups', authenticate, controller.createCellGroup);
router.get('/cell-groups/:id', authenticate, controller.getCellGroupById);
router.get('/cell-groups/:id/members', authenticate, controller.getActiveMembers);
router.post('/cell-groups/:id/members', authenticate, controller.addMember);
router.delete('/cell-groups/:id/members/:jemaatId', authenticate, controller.removeMember);
router.post('/cell-groups/:id/meetings', authenticate, controller.createMeeting);
router.get('/cell-groups/meetings/:meetingId', authenticate, controller.getMeetingById);
router.post('/cell-groups/meetings/:meetingId/photos', authenticate, upload.single('photo'), controller.uploadPhoto);
router.get('/cell-groups/meetings/:meetingId/active-members', authenticate, controller.getActiveMembersAtMeetingTime);
router.post('/cell-groups/meetings/:meetingId/absensi', authenticate, controller.submitAbsensi);

module.exports = router;