const express = require('express');
const router = express.Router();
const volunteerController = require('./volunteer.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/role.middleware');
const { handleValidationErrors } = require('../../middlewares/validation.middleware');
const {
  createVolunteerTypeValidation,
  updateVolunteerTypeValidation,
  registerVolunteerValidation,
} = require('./volunteer.validation');

// ── Volunteer Types (master data) ─────────────────────────────────
router.post(
  '/volunteer-types',
  authenticate,
  requireRole('ADMIN', 'LEADER'),
  createVolunteerTypeValidation,
  handleValidationErrors,
  volunteerController.createVolunteerType
);

router.get(
  '/volunteer-types', 
  authenticate, 
  volunteerController.listVolunteerTypes
);

router.put(
  '/volunteer-types/:id',
  authenticate,
  requireRole('ADMIN', 'LEADER'),
  updateVolunteerTypeValidation,
  handleValidationErrors,
  volunteerController.updateVolunteerType
);

router.delete(
  '/volunteer-types/:id',
  authenticate,
  requireRole('ADMIN', 'LEADER'),
  volunteerController.deleteVolunteerType
);

// ── Jemaat ↔ Volunteer (registrasi) ──────────────────────────────
router.get(
  '/jemaat/:jemaatId/volunteer',
  authenticate,
  volunteerController.listVolunteerByJemaat
);

router.post(
  '/jemaat/:jemaatId/volunteer',
  authenticate,
  registerVolunteerValidation,
  handleValidationErrors,
  volunteerController.registerVolunteer
);

router.delete(
  '/jemaat/:jemaatId/volunteer/:volunteerTypeId',
  authenticate,
  volunteerController.unregisterVolunteer
);

module.exports = router;