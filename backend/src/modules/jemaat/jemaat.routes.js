const express = require('express');
const controller = require('./jemaat.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { handleValidationErrors } = require('../../middlewares/validation.middleware');
const { createJemaatValidation, updateJemaatValidation } = require('./jemaat.validation');

const router = express.Router();

router.get('/jemaat', authenticate, controller.list);
router.post('/jemaat', authenticate, createJemaatValidation, handleValidationErrors, controller.create);
router.get('/jemaat/:id', authenticate, controller.getById);
router.get('/jemaat/:id/full', authenticate, controller.getFull);
router.get('/jemaat/:id/sensitive/:field', authenticate, controller.getSensitiveField);
router.get('/jemaat/:id/cell-groups', authenticate, controller.getCellGroups);
router.get('/jemaat/:id/events', authenticate, controller.getEventHistory);
router.get('/jemaat/:id/volunteer-assignments', authenticate, controller.getVolunteerAssignments);
router.put('/jemaat/:id', authenticate, updateJemaatValidation, handleValidationErrors, controller.update);
router.delete('/jemaat/:id', authenticate, controller.remove);

module.exports = router;