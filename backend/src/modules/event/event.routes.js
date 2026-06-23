const express = require('express');
const router = express.Router();
const eventController = require('./event.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/role.middleware');

router.post('/events', authenticate, requireRole('ADMIN', 'LEADER'), eventController.createEvent);
router.get('/events', authenticate, eventController.listEvents);
router.get('/events/:id', authenticate, eventController.getEvent);
router.put('/events/:id', authenticate, requireRole('ADMIN', 'LEADER'), eventController.updateEvent);
router.patch('/events/:id/status', authenticate, requireRole('ADMIN', 'LEADER'), eventController.updateStatus);
router.post('/events/:id/kehadiran', authenticate, eventController.inputKehadiran);
router.get('/events/:id/volunteers', authenticate, eventController.listVolunteers);
router.post('/events/:id/volunteers', authenticate, eventController.assignVolunteer);
router.get('/events/:id/suggest-volunteers/:jenisId', authenticate, eventController.suggestVolunteers);

// Deferred dari Step 12
router.get('/volunteer-types/:id/members', authenticate, eventController.listVolunteerTypeMembers);

module.exports = router;