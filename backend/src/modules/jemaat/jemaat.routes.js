const express = require('express');
const controller = require('./jemaat.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get('/jemaat', authenticate, controller.list);
router.post('/jemaat', authenticate, controller.create);
router.get('/jemaat/:id', authenticate, controller.getById);
router.get('/jemaat/:id/sensitive/:field', authenticate, controller.getSensitiveField);
router.get('/jemaat/:id/cell-groups', authenticate, controller.getCellGroups);
router.get('/jemaat/:id/events', authenticate, controller.getEventHistory);
router.put('/jemaat/:id', authenticate, controller.update);
router.delete('/jemaat/:id', authenticate, controller.remove);

module.exports = router;