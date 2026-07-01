const express = require('express');
const router = express.Router();
const eventController = require('./event.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/role.middleware');
const { handleValidationErrors } = require('../../middlewares/validation.middleware');
const {
  createEventValidation,
  updateEventValidation,
  inputKehadiranValidation,
  assignVolunteerValidation,
} = require('./event.validation');

router.post('/events', authenticate, requireRole('ADMIN', 'LEADER'), createEventValidation, handleValidationErrors, eventController.createEvent);
router.get('/events', authenticate, eventController.listEvents);
router.get('/events/:id', authenticate, eventController.getEvent);
router.put('/events/:id', authenticate, requireRole('ADMIN', 'LEADER'), updateEventValidation, handleValidationErrors, eventController.updateEvent);
router.patch('/events/:id/status', authenticate, requireRole('ADMIN', 'LEADER'), eventController.updateStatus);
router.post('/events/:id/kehadiran', authenticate, inputKehadiranValidation, handleValidationErrors, eventController.inputKehadiran);
router.get('/events/:id/volunteers', authenticate, eventController.listVolunteers);
router.post('/events/:id/volunteers', authenticate, assignVolunteerValidation, handleValidationErrors, eventController.assignVolunteer);
router.get('/events/:id/suggest-volunteers/:jenisId', authenticate, eventController.suggestVolunteers);

// Deferred dari Step 12
router.get('/volunteer-types/:id/members', authenticate, eventController.listVolunteerTypeMembers);

module.exports = router;